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
const {	sdks, requireJSM, unloadable,
		noop, isNone, exec, each,
		CUI, cuiDo, widgetMove, widgetMovable,
		watchWindows, change, on, once, onMulti,
		px, boundingWidth, boundingWidthPx, setWidth, realWidth,
		nsXUL, insertAfter, byId, setAttr,
		attrs, appendChildren }	= require('./utils');
const [ {Class: _class}, sp, {Style}, {modelFor}, {when: unloader}, {partial, delay},
		{remove}, {isNull, isUndefined, isString}, {attachTo, detachFrom}] = sdks(
	  [	'core/heritage', 'simple-prefs', 'stylesheet/style', 'model/core',
	  	'system/unload', 'lang/functional', 'util/array', 'lang/type', 'content/mod' ] );

const { WindowDraggingElement } = requireJSM( 'gre/modules/WindowDraggingUtils' );

/**
 * Binds listeners to CUI, listening for changes in the
 * placement of #tabbrowser-tabs and stores it's new position.
 */
const tabsStartListener = () => {
	const listener = (what, area) => {
		if ( area !== CUI.AREA_NAVBAR ) return;
		const p = CUI.getPlacementOfWidget( ID.tabs );
		if ( p === null || p.area !== CUI.AREA_NAVBAR ) return;
		sp.prefs.tabsStartPos = p.position;
	};

	unloadable( l => CUI.addListener( l ), l => CUI.removeListener( l ), {
		onWidgetAdded: listener,
		onWidgetRemoved: listener,
		onWidgetMoved: listener
	} );
};

const spOn = (k, fn) => sp.on( k, exec( () => fn( sp.prefs[k] ) ) );

const isFocus = evt => evt.type === 'focus';

/**
 * Creates a line instance for a window,
 * it has one public method: .make().
 *
 * @param  {ChromeWindow}   window   The window to make line for.
 * @return {line}                    Our line object.
 */
const line = _class( {
	// -------------------------------------------------------------------------
	// Public API:
	// -------------------------------------------------------------------------

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
		this.doc = window.document;

		// Get aliases to various elements:
		each( ID, (k, v) => isString( v ) && (this[k] = this.id( v )) );

		// Rememeber flex value of urlContainer:
		this.oldFlex = this.urlContainer.getAttribute( 'flex' );
	},

	/**
	 * Applies line modifications for window.
	 */
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

		// Improves #tabbrowser-tabs method _positionPinnedTabs:
		this.fixPositionPinnedTabs();

		// Get our layout manager:
		const layout = this.layoutManager();

		// Update the look immediately when activating:
		['urlbarBlur', 'urlbarMode'].forEach( e => sp.on( e, layout.change ) );

		// Fix overflow whenever we resize:
		this.resizer( partial( delay, this.moveBackWidgets.bind( this ), 300 ) );

		// Detect when the back/forward buttons change state to update UI:
		this.updateBackForward( layout.update );

		// Make sure we set the right size of the urlbar on blur or focus:
		onMulti( this.urlbar, ['blur', 'focus'], layout.update );

		// Handle Identity Label:
		this.identityLabelRetracter();

		// Detect escaping from the location bar when nothing changes:
		this.urlbarEscapeHandler();

		// Extra drag button:
		this.extraDragButton();

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

			this.modeFlexible();
		} );
	},

	// -------------------------------------------------------------------------
	// (Private) Modifications helpers:
	// -------------------------------------------------------------------------

	/**
	 * Attaches a modification to our window.
	 *
	 * @param  {*} mod  The modification to attach.
	 * @return {*}      The argument mod.
	 */
	attach( mod ) { attachTo( mod, this.window ); return mod; },

	/**
	 * Detaches a modification from our window.
	 *
	 * @param  {*} mod  The modification to detach.
	 * @return {null}   Null.
	 */
	detach( mod ) { detachFrom( mod, this.window ); return null; },

	// -------------------------------------------------------------------------
	// (Private) Listener helpers:
	// -------------------------------------------------------------------------

	/**
	 * Registers listener on our window for type events.
	 * Automatically removed on unload.
	 *
	 * @param  {string}   type     The type of event to listen on.
	 * @param  {function} listener The listener (callback) to register.
	 * @return {function}          A function that undoes the registration.
	 */
	on( event, listener ) { return on( this.window, event, listener ); },

	/**
	 * Registers an event of type resize to our window.
	 *
	 * @param  {function} listener The listener (callback) to register.
	 * @return {function}          A function that undoes the registration.
	 */
	resizer( listener ) { return this.on( 'resize', listener ); },

	// -------------------------------------------------------------------------
	// (Private) Extra drag button for users that want it, disabled by default:
	// -------------------------------------------------------------------------

	/**
	 * Extra drag button...
	 */
	extraDragButton() {
		let elem;
		let canUnload = false;
		let unload = () => {
			if ( canUnload && elem ) elem.remove();
			canUnload = false;
		};

		spOn( 'extraDragButton', use => {
			if ( use ) {
				insertAfter( elem = attrs(
					this.doc.createElementNS( nsXUL, 'toolbarbutton' ), {
					id: ID.drag.button,
					class: 'toolbarbutton-1'
				} ), this.panelUI );
				new WindowDraggingElement( elem );
				canUnload = true;
				unloader( unload );
			} else unload();
		} );
	},
 
	// -------------------------------------------------------------------------
	// (Private) Various fixes that Firefox doesn't have:
	// -------------------------------------------------------------------------

	/**
	 * (Helper) Moves back CUI widgets to target.
	 */
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
		const set = elem => this.window.windowDraggingElement = elem;
		unloader( set, elem => set( null ), new WindowDraggingElement( this.navBar ) );
	},

	/**
	 * Improves #tabbrowser-tabs method _positionPinnedTabs.
	 */
	fixPositionPinnedTabs() {
		const set = x => this.tabs._positionPinnedTabs = x;
		unloadable( old => set( function() {
			const widthOf = elem => elem.getBoundingClientRect().width;
			const numPinned = this.tabbrowser._numPinnedTabs;
			const doPosition = this.getAttribute( 'overflow' ) === "true" && numPinned > 0;

			if ( doPosition ) {
				/*
				 * Our improvements are here:
				 * Compute the width of CUI.AREA_NAVBARs target.
				 * 1) Reduce by width of overflow button.
				 * 2) Reduce by width of preceding siblings of tabs.
				 * 3) Reduce by width of non-tab elements of tabs.
				 * 4) Try to fit all pinned tabs in the remaining space, and:
				 * 4.1) Success: Do the normal stuff.
				 * 4.2) Failure: Don't use positionpinnedtabs.
				 */
				this.setAttribute( 'positionpinnedtabs', 'true' );

				const target = this.parentElement;
				let targetRemains = widthOf( target );

				// Reduce by width of overflow button.
				targetRemains -= 34;

				// Reduce by width of preceding siblings of tabs.
				for( let i = 0; i < target.childNodes.length; i++ ) {
					const sibling = target.childNodes[i];
					if ( sibling === this ) break;
					targetRemains -= widthOf( sibling );
				}

				const scrollButtonWidthUp = widthOf( this.mTabstrip._scrollButtonUp );
				const scrollButtonWidthDown = widthOf( this.mTabstrip._scrollButtonDown );
				const paddingStart = this.mTabstrip.scrollboxPaddingStart;

				// Reduce by width of non-tab elements of tabs.
				targetRemains -= paddingStart + scrollButtonWidthDown + scrollButtonWidthUp;
				const widthExLeftOf = targetRemains;

				// Try to fit all pinned tabs in the remaining space.
				let fail = false;
				for ( let i = 0; i < numPinned; i++ ) {
					if ( (targetRemains -= widthOf( this.childNodes[i] )) < 0 ) {
						fail = true;
						break;
					}
				}

				if ( fail ) {
					// Failure: Don't use positionpinnedtabs.
					this.removeAttribute( 'positionpinnedtabs' );
					this.style.minWidth = widthExLeftOf + 'px';
					delay( () => this.style.minWidth = 'inherit', 100 );
				} else {
					// Success: Do the normal stuff.
					let width = 0;
					for ( let j = numPinned - 1; j >= 0; j-- ) {
						const tab = this.childNodes[j];
						width += widthOf( tab );
						tab.style.MozMarginStart = - (width + scrollButtonWidthDown + paddingStart) + "px";
					}
					this.style.MozPaddingStart = width + paddingStart + "px";
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
		} ), set, this.tabs._positionPinnedTabs );
	},

	// -------------------------------------------------------------------------
	// (Private) User prefs handlers & their logic:
	// -------------------------------------------------------------------------

	/**
	 * Registers handlers for the user preferences tabMinWidth & tabMaxWidth:s.
	 */
	tabWidthHandler() {
		each( {min: 'tabMinWidth', max: 'tabMaxWidth'}, (k, v) => {
			// Deatch current attached style modification if any.
			const detach = saved => {
				if ( !isNone( saved[v] ) )
					saved[v] = this.detach( saved[v] );
			};
			unloadable( saved => spOn( v, pref => {
				detach( saved );
				if ( pref !== 0 )
					saved[v] = this.attach( new Style( { source:
					`.tabbrowser-tab:not([pinned]) {
						${k}-width:${pref}px !important;
					}` } ) );
			} ), detach, {} );
		} );
	},

	/**
	 * Registers handlers for the Identity Label that retracts on urlbar focus/blur.
	 */
	identityLabelRetracter() {
		// Get some resources:
		const {getComputedStyle} = this.window,
			  noCrop = () => this.idLabelLabel.setAttribute( 'crop', 'none' ),
			  getLWidth = () => px( realWidth( this.window, this.idLabel ) ),
			  setLWidth = setWidth( this.idLabel ),
			  reset = partial( setLWidth, 'auto' );

		let oldWidth, resizeOff = noop, updateOff = [];
		let lastFocusState = false;

		unloader( reset );

		const resize = () => {
			if ( lastFocusState ) return;
			noCrop();
			reset();
			oldWidth = getComputedStyle( this.idLabel ).width;
			setLWidth( getLWidth() ); 	
			setLWidth( oldWidth );
		};

		const update = evt => {
			let lastFocusState = isFocus( evt );

			if ( lastFocusState ) {
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

		spOn( 'retractIdentityLabel', pref => pref ? bind() : unbind() );
	},

	/**
	 * Registers handlers for sp.prefs.urlbarRight and executes immediately:
	 * Changes urlbar to the right of tabs or left depending on sp.prefs.urlbarRight.
	 */
	urlbarRLHandler() {
		spOn( 'urlbarRight', r => {
			const ids = [ID.urlContainer, ID.newSearch.button],
					p = ids.map( id => CUI.getPlacementOfWidget( id ) ),
					d = p[0].position - (p[1] ? p[1].position : 0);

			const anchor = r ? ID.allTabs : ID.tabs;
			widgetMove( ids[0], anchor, r ? 1 : -1 );
			if ( Math.abs( d ) === 1 && p[0].area === p[1].area )
				widgetMove( ids[1], ids[0], d < 1 ? 1 : 0 );
		} );
	},

	// -------------------------------------------------------------------------
	// (Private) Layout management:
	// -------------------------------------------------------------------------

	/**
	 * Returns an object with two methods {change, update} that:
	 * { change: the current behavior of update() depending on sp.prefs.urlbarMode,
	 * 			 and also executes update() immediately.
	 *   update: executes the layout mode depending on what change() set. }
	 *
	 * @return {object}  The object specified above.
	 */
	layoutManager() {
		// Make a switch of all the modes:
		const layouts = {
			fixed:		this.modeFixed.bind( this ),
			sliding:	this.modeSliding.bind( this ),
			flexible:	this.modeFlexible.bind( this )
		};

		let layoutUpdater;
		let lastFocusState = false;

		const manager = {
			change() {
				layoutUpdater = layouts[sp.prefs.urlbarMode];
				this.update();
			},
			update( evt ) {
				if ( evt ) lastFocusState = isFocus( evt );
				layoutUpdater( lastFocusState );
			}
		};

		manager.change();
		return manager;
	},

	/**
	 * Moves CUI.AREA_TABSTRIP controls to CUI.AREA_NAVBAR or the inverse.
	 *
	 * @param  {string}  area  The CUI area id, e.g: CUI.AREA_NAVBAR.
	 */
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

	/**
	 * Registers handlers that impose a max-width constraint immediately,
	 * and on resize so we don't overflow CUI.AREA_NAVBAR.
	 */
	imposeMaxWidth() {
		const s = this.urlContainer.style;
		const onResize = () => s.maxWidth = px( realWidth( this.window, this.navBarTarget ) );
		delay( onResize, 100 );
		this.resizer( onResize );
	},

	/**
	 * The layout mode for sp.prefs.urlbarMode === 'flexible'.
	 * Makes the urlbar flex, and resets all position, width & max-width styles.
	 *
	 * @param  {boolean} focused      If urlbar is focused or not - ignored.
	 */
	modeFlexible( focused ) {
		this.urlContainer.setAttribute( 'flex', this.oldFlex );
		const s = this.urlContainer.style;
		s.position = '';
		s.width = '';
		s.maxWidth = '';
	},

	/**
	 * The layout mode for sp.prefs.urlbarMode === 'fixed'.
	 * Makes the urlbar a fixed width,
	 * specified by preference: sp.prefs.urlbarBlur.
	 *
	 * @param  {boolean} focused      If urlbar is focused or not.
	 */
	modeFixed( focused ) { this.modeNonFlexible( focused, 'urlbarBlur' ); },

	/**
	 * The layout mode for sp.prefs.urlbarMode === 'sliding'.
	 * Makes the urlbars width depend on if the urlbar is focused or not,
	 * specified by preferences: sp.prefs.urlbarFocused and sp.prefs.urlbarBlur.
	 *
	 * @param  {boolean} focused      If urlbar is focused or not.
	 */
	modeSliding( focused ) { this.modeNonFlexible( focused, 'urlbarFocused' ); },

	/**
	 * (Helper) Handles mode layout for other modes than modeFlexible.
	 *
	 * @param  {boolean} focused      If urlbar is focused or not.
	 * @param  {string}  focusedPref  Name of the preference to use when urlbar is focused for width.
	 */
	modeNonFlexible( focused, focusedPref ) {
		// We're not flexible:
		this.urlContainer.removeAttribute( 'flex' );

		// Adjust width:
		setWidth( this.urlContainer, px( sp.prefs[focused ? focusedPref : 'urlbarBlur'] ) );

		// Handle overflow:
		if ( !focused ) delay( this.moveBackWidgets.bind( this ), 110 );
	},

	// -------------------------------------------------------------------------
	// (Private) urlbar interaction handlers:
	// -------------------------------------------------------------------------

	/**
	 * Honestly, I haven't a clue why this is used... it was used in oneliner 2.
	 *
	 * @param  {Function} updateLayout The update function for the layout.
	 */
	updateBackForward( updateLayout ) {
		change( this.window, 'UpdateBackForwardCommands', orig =>
			function( webnav ) { orig.call( this, webnav ); updateLayout(); } );
	},

	/**
	 * Registers a handler for ESC(APE) keydown that blurs the urlbar.
	 */
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