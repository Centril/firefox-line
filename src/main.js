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
const [ sp, {Style}, {modelFor}, {when: unloader}, {partial, delay},
		{remove}, {isNull, isUndefined}, {attachTo, detachFrom}] = sdks(
	  [	'simple-prefs', 'stylesheet/style', 'model/core', 'system/unload',
		'lang/functional', 'util/array', 'lang/type', 'content/mod' ] );

const { WindowDraggingElement } = requireJSM( 'gre/modules/WindowDraggingUtils' );

/**
 * Ensures navBar is draggable, behaving like tabsBar:
 * Doesn't work in Private Windows otherwise...
 * Keep this in memory so it doesn't get flagged for GC.
 *
 * Please note that this is a Bug Firefox that we're fixing,
 * otherwise this could be removed!
 *
 * @param  {Window}   window  DOM Window.
 * @param  {Element}  navBar  #nav-bar Element.
 */
const fixNavBarDrag = (window, navBar) =>
	window.windowDraggingElement = new WindowDraggingElement( navBar );

// Handle the user preferences tabMinWidth & tabMaxWidth:s.
const tabWidthHandler = window => [['min', 'tabMinWidth'], ['max', 'tabMaxWidth']].forEach( e => {
	const saved = {};
	// Deatch current attached style modification if any.
	const detach = () => {
		if ( !nullOrUndefined( saved[e[1]] ) ) {
			detachFrom( saved[e[1]], window );
			saved[e[1]] = null;
		}
	};

	// Detach on unload.
	unloader( detach );

	// Make, apply and add listener:
	sp.on( e[1], exec( () => {
		detach();
		const pref = sp.prefs[e[1]];
		if ( pref !== 0 )
			attachTo( saved[e[1]] = new Style( { source: `.tabbrowser-tab:not([pinned]) {
				${e[0]}-width:${pref}px !important;
			}` } ), window );
	} ) );
} );

const resizer = (window, fn) => on( window, 'resize', fn );

// Identity Label Handler:
const identityLabelRetracter = window => {
	// Get some resources:
	const {getComputedStyle, gURLBar} = window,
		  windowModel = modelFor( window ),
		  [label, labelLabel] = [ID.idLabel, ID.idLabelLabel].map( byId( window ) ),
		  noCrop = () => labelLabel.setAttribute( 'crop', 'none' ),
		  getLWidth = () => px( realWidth( window, label ) ),
		  setLWidth = setWidth( label ),
		  reset = partial( setLWidth, 'auto' );

	let oldWidth, resizeOff = noop, updateOff = [];
	
	unloader( reset );

	const resize = () => {
		if ( gURLBar.focused ) return;
		noCrop();
		reset();
		oldWidth = getComputedStyle( label ).width;
		setLWidth( getLWidth() ); 	
		setLWidth( oldWidth );
	};

	const update = () => {
		if ( gURLBar.focused ) {
			noCrop();
			oldWidth = getLWidth();
			setLWidth( px( '0' ) );
		} else setLWidth( oldWidth );
	};

	const bind = () => {
		updateOff = onMulti( gURLBar, ['blur', 'focus'], update );
		windowModel.tabs.on( 'activate', resize );
		delay( () => resizeOff = resizer( window, resize ), 100 );
	};

	const unbind = () => {
		reset();
		windowModel.tabs.off( 'activate', resize );
		resizeOff();
		updateOff.forEach( v => v() );
		resizeOff = noop;
		updateOff = [];
	};

	sp.on( 'retractIdentityLabel', exec( () => sp.prefs.retractIdentityLabel ? bind() : unbind() ) );
};

// Impose a max-width constraint so we don't overflow!
const imposeMaxWidth = (window, {urlContainer, navBarTarget}) => {
	const onResize = () => urlContainer.style.maxWidth = px( realWidth( window, navBarTarget ) );
	delay( onResize, 100 );
	resizer( window, onResize );
};

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

// Move tabsBar controls to navBar or the reverse:
const moveTabControls = (tabWidgets, area) => cuiDo( () => {
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
	tabWidgets.forEach( (w, i) => widgetMovable( tabWidgets[i].id,
		() => CUI.addWidgetToArea( w.id, area, start + i ) ) );

	// Ensure order of [ID.tabs, ID.newTabs, ID.allTabs] is exactly that:
	[ID.newTabs, ID.allTabs].forEach( (id, i) => widgetMove( id, ID.tabs, i + 1 ) );
} );

/**
 * Handles urlbar to the left or right mode.
 */
const urlbarRLHandler = tabWidgets => sp.on( 'urlbarRight', exec( () => {
	const ids = [ID.urlContainer, ID.newSearch.button],
			p = ids.map( id => CUI.getPlacementOfWidget( id ) ),
			d = p[0].position - (p[1] ? p[1].position : 0),
			r = sp.prefs.urlbarRight;

	widgetMove( ids[0], tabWidgets[r ? tabWidgets.length - 1 : 0].id, r ? 1 : -1 );
	if ( Math.abs( d ) === 1 && p[0].area === p[1].area )
		widgetMove( ids[1], ids[0], d < 1 ? 1 : 0 );
} ) );

const modeFlexible = (urlContainer, oldFlex) => {
	urlContainer.setAttribute( 'flex', oldFlex );
	urlContainer.style.position = '';
	urlContainer.style.width = '';
	urlContainer.style.maxWidth = '';
};

const fixOverflowFlag = (window, navBar) =>
	delay( () => navBar.overflowable._moveItemsBackToTheirOrigin( true ), 300 );

const fixPositionPinnedTabs = tabs => {
	const old = tabs._positionPinnedTabs;
	tabs._positionPinnedTabs = function() {
		const numPinned = this.tabbrowser._numPinnedTabs;
		const doPosition = this.getAttribute( 'overflow' ) === "true" && numPinned > 0;
		const widthOf = elem => elem.getBoundingClientRect().width;

		if ( doPosition ) {
			this.setAttribute( 'positionpinnedtabs', 'true');

			const target = this.parentElement;
			let targetRemains = widthOf( target );

			const targetSibling = target.nextSibling;
			if (targetSibling && targetSibling.classList.contains( 'overflow-button' ) )
				targetRemains -= 34;

			for( let i = 0; i < target.childNodes.length; i++ ) {
				const sibling = target.childNodes[i];
				if ( sibling === this ) break;
				targetRemains -= widthOf( sibling );
			}

			const scrollButtonWidthUp = widthOf( this.mTabstrip._scrollButtonUp );
			const scrollButtonWidthDown = widthOf( this.mTabstrip._scrollButtonDown );
			const paddingStart = this.mTabstrip.scrollboxPaddingStart;

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
				this.style.minWidth = widthExLeftOf + 'px';
				delay( () => this.style.minWidth = 'inherit', 100 );
			} else {
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
	};
	unloader( () => tabs._positionPinnedTabs = old );
}

const modeNonFlexible = (window, elements, focusedPref) => {
	// Get aliases to various elements:
	const {gURLBar} = window;
	const [ tabs,, navBar, navBarTarget, urlContainer,
			overflow, backForward, backCmd, forwardCmd ] = elements;

	// We're not flexible:
	if ( urlContainer.hasAttribute( 'flex') ) urlContainer.removeAttribute( 'flex' );

	// Fix backForward:
	let offsetWidth = 0;
	if ( backForward ) {
		const buttonWidth = backForward.boxObject.width / 2,
			  hasNot = elem => elem.hasAttribute( 'disabled' ),
			  buttons = hasNot( forwardCmd ) ? 2 : (hasNot( backCmd ) ? 1 : 0);
		backForward.style.marginRight = px( -buttonWidth * (2 - buttons) );
		offsetWidth = -buttonWidth * buttons;
	}

	// Adjust width:
	const f = gURLBar.focused;
	setWidth( urlContainer, px( sp.prefs[f ? focusedPref : 'urlbarBlur'] - offsetWidth ) );

	// Handle overflow:
	if ( !f ) delay( () => navBar.overflowable._moveItemsBackToTheirOrigin( true ), 110 );
};

const updateBackForward = updateLayout => change( 'UpdateBackForwardCommands',
	orig => function( webnav ) { orig.call( this, webnav ); updateLayout(); }
);

const urlbarEscapeHandler = ({gURLBar, gBrowser}) => on( gURLBar, 'keydown', event => {
	if ( event.keyCode !== event.DOM_VK_ESCAPE ) return;
	const {popupOpen, value} = gURLBar;
	delay( () => {
		// Only return focus to the page if nothing changed since escaping
		if  ( gURLBar.popupOpen === popupOpen && gURLBar.value === value )
			gBrowser.selectedBrowser.focus();
	} );
} );

const layoutManager = (window, elements, urlContainer, flex) => {
	// Make a switch of all the modes and pick the current one:
	let layoutUpdater;
	const layouts = {
		fixed:		partial( modeNonFlexible, window, elements, 'urlbarBlur' ),
		sliding:	partial( modeNonFlexible, window, elements, 'urlbarFocused' ),
		flexible:	partial( modeFlexible, urlContainer, flex )
	};
	return {change: exec( layoutUpdater = exec( layouts[sp.prefs.urlbarMode] ) ),
			update: () => layoutUpdater()};
}

const makeLine = window => {
	const {gURLBar} = window;

	// Apply line.css:
	const style = new Style( { uri: './line.css' } );
	attachTo( style, window );

	// Get aliases to various elements:
	const elements = [ID.tabs, ID.tabsBar, ID.navBar, ID.navBarTarget, ID.urlContainer,
		ID.overflow, ID.backForward, ID.backCmd, ID.forwardCmd].map( byId( window ) );
	const [tabs, tabsBar, navBar, navBarTarget, urlContainer,, backForward] = elements;

	// Remove search bar from navBar:
	CUI.removeWidgetFromArea( ID.search );

	// Move tabsBar controls to navBar:
	const tabWidgets = CUI.getWidgetsInArea( CUI.AREA_TABSTRIP );
	moveTabControls( tabWidgets, CUI.AREA_NAVBAR );

	// Make tabsBar the nextSibling of navBar, not the reverse which is the case now:
	insertAfter( tabsBar, navBar );

	// Save order of elements in tabsBar to restore later:
	const origTabs = appendChildren( navBar, Array.from( tabsBar.childNodes ) );

	// Handle the user preferences tabMinWidth & tabMaxWidth:s.
	tabWidthHandler( window );

	// Fix draggability of nav-bar:
	fixNavBarDrag( window, navBar );

	// Impose a max width on urlContainer:
	imposeMaxWidth( window, {navBarTarget, urlContainer} );

	// Move to right/left when asked to:
	urlbarRLHandler( tabWidgets );

	fixPositionPinnedTabs( tabs );

	// Get our layout manager:
	const flex = urlContainer.getAttribute( 'flex' );
	const layout = layoutManager( window, elements, urlContainer, flex );

	// Update the look immediately when activating:
	['urlbarBlur', 'urlbarMode'].forEach( e => sp.on( e, layout.change ) );

	// Fix overflow whenever we resize:
	resizer( window, partial( fixOverflowFlag, window, navBar ) );

	// Detect when the back/forward buttons change state to update UI:
	updateBackForward( layout.update );

	// Make sure we set the right size of the urlbar on blur or focus:
	onMulti( gURLBar, ['blur', 'focus'], layout.update );

	// Handle Identity Label:
	identityLabelRetracter( window );

	// Detect escaping from the location bar when nothing changes:
	urlbarEscapeHandler( window );

	// Clean up various changes when the add-on unloads:
	unloader( () => {
		// Remove our style:
		detachFrom( style, window );

		// Restore search-bar if user hasn't manually moved it:
		if ( CUI.getPlacementOfWidget( ID.search ) === null ) {
			const {area, position} = CUI.getPlacementOfWidget( ID.urlContainer );
			CUI.addWidgetToArea( ID.search, area, position + 1 );
		}

		// Reverse: tabsBar the nextSibling of navBar:
		insertAfter( navBar, tabsBar );

		// Move stuff back to tabsBar:
		appendChildren( tabsBar, origTabs );

		// Return tab controls:
		moveTabControls( tabWidgets, CUI.AREA_TABSTRIP );

		if ( backForward ) backForward.style.marginRight = '';
		modeFlexible( urlContainer, flex );
	} );
};

// Save position of ID.tabs on change:
tabsStartListener();

// Line:ify each window as they come:
watchWindows( partial( delay, makeLine, 0 ) );

// Setup Search Button:
delay( setupSearchButton );