/*
 * Line, a Firefox Addon/Extension, fork of Mozilla Labs Oneliner 2.
 *
 * Copyright (C) 2015 Mazdak Farrokhzad <twingoow@gmail.com>, Mozilla Labs
 * This program is free software; you can redistribute it and/or
 * modify it under the terms of the GNU General Public License
 * as published by the Free Software Foundation; either version 2
 * of the License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program; if not, write to the Free Software
 * Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.
 */
'use strict';

// Import utils, search-engine, ids, SDK:
const { ID }					= require( './ids' );
const { setupSearchButton }		= require( './search-engine' );
const {	sdks, requireJSM, CUI,
		nullOrUndefined, noop, watchWindows, change, on, once, onMulti,
		px, boundingWidth, boundingWidthPx, setWidth, realWidth,
		insertAfter, byId, cuiDo, widgetMove, widgetMovable, exec, setAttr,
		attrs, appendChildren }	= require('./utils');
const [ {Class: _class}, sp, {Style}, {modelFor}, {when: unloader}, {partial, delay},
		{remove}, {isNull, isUndefined}, {attachTo, detachFrom}] = sdks(
	  [	'core/heritage', 'simple-prefs', 'stylesheet/style', 'model/core',
	  	'system/unload', 'lang/functional', 'util/array', 'lang/type', 'content/mod' ] );

const { WindowDraggingElement } = requireJSM( 'gre/modules/WindowDraggingUtils' );

const tabsStartListener = () => {
	const listener = (what, area) => {
		if ( area !== CUI.AREA_NAVBAR ) return;
		const p = CUI.getPlacementOfWidget( ID.tabs );
		if ( p === null || p.area !== CUI.AREA_NAVBAR ) return;
		sp.prefs.tabsStartPos = p.position;
	};

	const li = {
		onWidgetAdded: listener,
		onWidgetRemoved: listener,
		onWidgetMoved: listener
	};

	CUI.addListener( li );
	unloader( () => CUI.removeListener( li ) );
};

const line = _class( {
	/**
	 * Constructor:
	 *
	 * @param  {ChromeWindow} window The Window.
	 */
	initialize( window ) {
		this.window = window;
		this.windowModel = modelFor( this.window );

		this.id = byId( this.window );

		this.tabWidgets = CUI.getWidgetsInArea( CUI.AREA_TABSTRIP );

		this.urlbar = window.gURLBar;
		this.browser = window.gBrowser;

		// Get aliases to various elements:
		Object.keys( ID ).filter( k => typeof ID[k] === 'string' )
						 .forEach( k => this[k] = this.id( ID[k] ) );

		// Rememeber flex value of urlContainer:
		this.oldFlex = this.urlContainer.getAttribute( 'flex' );
	},

	make() {
		// Apply line.css:
		const style = this.attach( new Style( { uri: './line.css' } ) );

		// Remove search bar from navBar:
		CUI.removeWidgetFromArea( ID.search );

		// Move tabsBar controls to navBar:
		this.moveTabControls( CUI.AREA_NAVBAR );

		// Make tabsBar the nextSibling of navBar, not the reverse which is the case now:
		insertAfter( this.tabsBar, this.navBar );

		// Save order of elements in tabsBar to restore later:
		const origTabs = appendChildren( this.navBar, Array.from( this.tabsBar.childNodes ) );

		// Handle the user preferences tabMinWidth & tabMaxWidth:s.
		this.tabWidthHandler();

		// Fix draggability of nav-bar:
		this.fixNavBarDrag();

		// Impose a max width on urlContainer:
		this.imposeMaxWidth();

		// Move to right/left when asked to:
		this.urlbarRLHandler();

		this.fixPositionPinnedTabs();

		// Get our layout manager:
		const layout = this.layoutManager();

		// Update the look immediately when activating:
		['urlbarBlur', 'urlbarMode'].forEach( e => sp.on( e, layout.change ) );

		// Fix overflow whenever we resize:
		this.resizer( this.fixOverflowFlag.bind( this ) );

		// Detect when the back/forward buttons change state to update UI:
		this.updateBackForward( layout.update );

		// Make sure we set the right size of the urlbar on blur or focus:
		onMulti( this.urlbar, ['blur', 'focus'], layout.update );

		// Handle Identity Label:
		this.identityLabelRetracter();

		// Detect escaping from the location bar when nothing changes:
		this.urlbarEscapeHandler();

		// Clean up various changes when the add-on unloads:
		unloader( () => {
			// Remove our style:
			this.detach( style );

			// Restore search-bar if user hasn't manually moved it:
			if ( CUI.getPlacementOfWidget( ID.search ) === null ) {
				const {area, position} = CUI.getPlacementOfWidget( ID.urlContainer );
				CUI.addWidgetToArea( ID.search, area, position + 1 );
			}

			// Reverse: tabsBar the nextSibling of navBar:
			insertAfter( this.navBar, this.tabsBar );

			// Move stuff back to tabsBar:
			appendChildren( this.tabsBar, origTabs );

			// Return tab controls:
			this.moveTabControls( CUI.AREA_TABSTRIP );

			if ( this.backForward ) this.backForward.style.marginRight = '';

			this.modeFlexible();
		} );
	},

	// Attaches/Detaches an object to our window:
	attach( obj ) { attachTo( obj, this.window ); return obj; },
	detach( obj ) { detachFrom( obj, this.window ); return null; },

	// Events:
	on( event, fn ) { return on( this.window, event, fn ); },

	// Resize handler:
	resizer( fn ) { return this.on( 'resize', fn ); },

	// Helper: Moves back CUI widgets to target:
	moveBackWidgets() {
		this.navBar.overflowable._moveItemsBackToTheirOrigin( true );
	},

	/**
	 * Ensures navBar is draggable, behaving like tabsBar:
	 * Doesn't work in Private Windows otherwise...
	 * Keep this in memory so it doesn't get flagged for GC.
	 *
	 * Please note that this is a Bug Firefox that we're fixing,
	 * otherwise this could be removed!
	 */
	fixNavBarDrag() {
		this.window.windowDraggingElement = new WindowDraggingElement( this.navBar );
	},

	// Handle the user preferences tabMinWidth & tabMaxWidth:s:
	tabWidthHandler() {
		[['min', 'tabMinWidth'], ['max', 'tabMaxWidth']].forEach( e => {
			const saved = {};
			// Deatch current attached style modification if any.
			const detach = () => {
				if ( !nullOrUndefined( saved[e[1]] ) )
					saved[e[1]] = this.detach( saved[e[1]] );
			};

			// Detach on unload.
			unloader( detach );

			// Make, apply and add listener:
			sp.on( e[1], exec( () => {
				detach();
				const pref = sp.prefs[e[1]];
				if ( pref !== 0 )
					saved[e[1]] = this.attach( new Style( { source:
					`.tabbrowser-tab:not([pinned]) {
						${e[0]}-width:${pref}px !important;
					}` } ) );
			} ) );
		} );
	},

	// Identity Label Handler:
	identityLabelRetracter() {
		// Get some resources:
		const {getComputedStyle} = this.window,
			  noCrop = () => this.idLabelLabel.setAttribute( 'crop', 'none' ),
			  getLWidth = () => px( realWidth( this.window, this.idLabel ) ),
			  setLWidth = setWidth( this.idLabel ),
			  reset = partial( setLWidth, 'auto' );

		let oldWidth, resizeOff = noop, updateOff = [];
		
		unloader( reset );

		const resize = () => {
			if ( this.urlbar.focused ) return;
			noCrop();
			reset();
			oldWidth = getComputedStyle( this.idLabel ).width;
			setLWidth( getLWidth() ); 	
			setLWidth( oldWidth );
		};

		const update = () => {
			if ( this.urlbar.focused ) {
				noCrop();
				oldWidth = getLWidth();
				setLWidth( px( '0' ) );
			} else setLWidth( oldWidth );
		};

		const bind = () => {
			updateOff = onMulti( this.urlbar, ['blur', 'focus'], update );
			this.windowModel.tabs.on( 'activate', resize );
			delay( () => resizeOff = this.resizer( resize ), 100 );
		};

		const unbind = () => {
			reset();
			this.windowModel.tabs.off( 'activate', resize );
			resizeOff();
			updateOff.forEach( v => v() );
			resizeOff = noop;
			updateOff = [];
		};

		sp.on( 'retractIdentityLabel', exec( () =>
			sp.prefs.retractIdentityLabel ? bind() : unbind() ) );
	},

	// Impose a max-width constraint so we don't overflow:
	imposeMaxWidth() {
		const s = this.urlContainer.style
		const onResize = () => s.maxWidth = px( realWidth( this.window, this.navBarTarget ) );
		delay( onResize, 100 );
		this.resizer( onResize );
	},

	// Move tabsBar controls to navBar or the reverse:
	moveTabControls( area ) {
		cuiDo( () => {
			// Figure out start position:
			let start = 0;
			if ( area !== CUI.AREA_TABSTRIP ) {
				if ( !('tabsStartPos' in sp.prefs) ) {
					const search = CUI.getPlacementOfWidget( ID.newSearch.button );
					sp.prefs.tabsStartPos = 1 + (search !== null ? search :
						CUI.getPlacementOfWidget( ID.urlContainer )).position;
				}

				start = sp.prefs.tabsStartPos;
			}

			// Move all controls to navBar:
			// If not already in area: Make removable, move, restore removable:
			this.tabWidgets.forEach( (w, i) => widgetMovable( this.tabWidgets[i].id,
				() => CUI.addWidgetToArea( w.id, area, start + i ) ) );

			// Ensure order of [ID.tabs, ID.newTabs, ID.allTabs] is exactly that:
			[ID.newTabs, ID.allTabs].forEach( (id, i) => widgetMove( id, ID.tabs, i + 1 ) );
		} );
	},

	// Handles urlbar to the left or right mode:
	urlbarRLHandler() {
		sp.on( 'urlbarRight', exec( () => {
			const ids = [ID.urlContainer, ID.newSearch.button],
					p = ids.map( id => CUI.getPlacementOfWidget( id ) ),
					d = p[0].position - (p[1] ? p[1].position : 0),
					r = sp.prefs.urlbarRight;

			const anchor = r ? ID.allTabs : ID.tabs;
			widgetMove( ids[0], anchor, r ? 1 : -1 );
			if ( Math.abs( d ) === 1 && p[0].area === p[1].area )
				widgetMove( ids[1], ids[0], d < 1 ? 1 : 0 );
		} ) );
	},

	layoutManager() {
		// Make a switch of all the modes and pick the current one:
		let layoutUpdater;
		const layouts = {
			fixed:		this.modeFixed.bind( this ),
			sliding:	this.modeSliding.bind( this ),
			flexible:	this.modeFlexible.bind( this )
		};
		return {change: exec( layoutUpdater = exec( layouts[sp.prefs.urlbarMode] ) ),
				update: () => layoutUpdater()};
	},

	// Handles flexible mode layout:
	modeFlexible() {
		this.urlContainer.setAttribute( 'flex', this.oldFlex );
		const s = this.urlContainer.style;
		s.position = '';
		s.width = '';
		s.maxWidth = '';
	},

	modeFixed() { this.modeNonFlexible( 'urlbarBlur' ); },

	modeSliding() { this.modeNonFlexible( 'urlbarFocused' ); },

	// Handles non-flexible mode layout:
	modeNonFlexible( focusedPref ) {
		// We're not flexible:
		if ( this.urlContainer.hasAttribute( 'flex') ) this.urlContainer.removeAttribute( 'flex' );

		// Fix backForward:
		let offsetWidth = 0;
		if ( this.backForward ) {
			const buttonWidth = this.backForward.boxObject.width / 2,
				  hasNot = elem => elem.hasAttribute( 'disabled' ),
				  buttons = hasNot( this.forwardCmd ) ? 2 : (hasNot( this.backCmd ) ? 1 : 0);
			this.backForward.style.marginRight = px( -buttonWidth * (2 - buttons) );
			offsetWidth = -buttonWidth * buttons;
		}

		// Adjust width:
		const f = this.urlbar.focused;
		setWidth( this.urlContainer, px( sp.prefs[f ? focusedPref : 'urlbarBlur'] - offsetWidth ) );

		// Handle overflow:
		if ( !f ) delay( this.moveBackWidgets.bind( this ), 110 );
	},

	fixOverflowFlag() { delay( () => this.moveBackWidgets.bind( this ), 300 ) },

	fixPositionPinnedTabs() {
		const widthOf = elem => elem.getBoundingClientRect().width;
		const {mTabstrip: tabstrip, tabbrowser} = this.tabs;
		const {_scrollButtonUp, _scrollButtonDown} = tabstrip;
		const targetChildren = this.navBarTarget.childNodes;

		const old = this.tabs._positionPinnedTabs;
		this.tabs._positionPinnedTabs = function() {
			const numPinned = tabbrowser._numPinnedTabs;
			const doPosition = this.getAttribute( 'overflow' ) === "true" && numPinned > 0;

			if ( doPosition ) {
				this.setAttribute( 'positionpinnedtabs', 'true' );

				const target = this.parentElement;
				let targetRemains = widthOf( target );

				// For overflow:
				targetRemains -= 34;

				for( let i = 0; i < targetChildren.length; i++ ) {
					const sibling = targetChildren[i];
					if ( sibling === this ) break;
					targetRemains -= widthOf( sibling );
				}

				const scrollButtonWidthUp = widthOf( _scrollButtonUp );
				const scrollButtonWidthDown = widthOf( _scrollButtonDown );
				const paddingStart = tabstrip.scrollboxPaddingStart;

				targetRemains -= paddingStart + scrollButtonWidthDown + scrollButtonWidthUp;
				const widthExLeftOf = targetRemains;

				let fail = false;
				for ( let i = 0; i < numPinned; i++ ) {
					if ( (targetRemains -= widthOf( this.childNodes[i] )) < 0 ) {
						fail = true;
						break;
					}
				}

				if ( fail ) {
					this.removeAttribute( 'positionpinnedtabs' );
					this.style.minWidth = px( widthExLeftOf );
					delay( () => this.style.minWidth = 'inherit', 100 );
				} else {
					let width = 0;
					for ( let j = numPinned - 1; j >= 0; j-- ) {
						const tab = this.childNodes[j];
						width += widthOf( tab );
						tab.style.MozMarginStart = px( -(width + scrollButtonWidthDown + paddingStart) );
					}
					this.style.MozPaddingStart = px( width + paddingStart );
				}
			} else {
				this.removeAttribute( 'positionpinnedtabs' );
				for ( let i = 0; i < numPinned; i++ ) this.childNodes[i].style.MozMarginStart = "";
				this.style.MozPaddingStart = "";
			}

			if ( this._lastNumPinned !== numPinned ) {
				this._lastNumPinned = numPinned;
				this._handleTabSelect( false );
			}
		};
		unloader( () => this.tabs._positionPinnedTabs = old );
	},

	updateBackForward( updateLayout ) {
		change( this.window, 'UpdateBackForwardCommands', orig =>
			function( webnav ) { orig.call( this, webnav ); updateLayout(); } );
	},

	urlbarEscapeHandler() {
		on( this.urlbar, 'keydown', event => {
			if ( event.keyCode !== event.DOM_VK_ESCAPE ) return;
			const {popupOpen, value} = this.urlbar;
			delay( () => {
				// Only return focus to the page if nothing changed since escaping
				if ( this.urlbar.popupOpen === popupOpen && this.urlbar.value === value )
					this.browser.selectedBrowser.focus();
			} );
		} );
	},
} );

// Save position of ID.tabs on change:
tabsStartListener();

// Line:ify each window as they come:
watchWindows( window => delay( () => line( window ).make(), 0 ) );

// Setup Search Button:
delay( setupSearchButton );