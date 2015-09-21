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
const {	sdks, nullOrUndefined, noop, watchWindows, change, on, once, onMulti,
		px, boundingWidth, boundingWidthPx, setWidth, realWidth,
		insertAfter, byId, moveWidget, exec, setAttr,
		attrs, appendChildren }	= require('./utils');
const [ self, sp, {Style}, {modelFor}, {when: unloader},
		{partial}, {remove}, {isNull, isUndefined}, {setTimeout}, {attachTo, detachFrom}] = sdks(
	  ['self', 'simple-prefs', 'stylesheet/style', 'model/core', 'system/unload',
	   'lang/functional', 'util/array', 'lang/type', 'timers', 'content/mod' ] );

require( 'chrome' ).Cu.import( 'resource://gre/modules/WindowDraggingUtils.jsm' );
/**
 * Ensures navBar is draggable, behaving like tabsBar:
 * Doesn't work in Private Windows otherwise...
 * Keep this in memory so it doesn't get flagged for GC.
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

// Identity Label Handler:
const identityLabelRetracter = window => {
	// Get some resources:
	const {getComputedStyle, gURLBar} = window;
	const windowModel = modelFor( window );
	const label = byId( window, ID.idLabel );
	const labelWidth = setWidth( label );
	let oldWidth;
	let resizeOff = noop, updateOff = [];

	const reset = partial( labelWidth, 'auto' );
	unloader( reset );

	const resize = () => {
		if ( gURLBar.focused ) return;
		reset();
		oldWidth = getComputedStyle( label ).width;
		labelWidth( px( realWidth( window, label ) ) );
		label.offsetWidth; // Force repaint
		labelWidth( oldWidth );
	};

	const update = () => {
		if ( gURLBar.focused ) {
			oldWidth = px( realWidth( window, label ) );
			labelWidth( px( '0' ) );
		} else labelWidth( oldWidth );
	};

	const bind = () => {
		updateOff = onMulti( gURLBar, ['blur', 'focus'], update );
		windowModel.tabs.on( 'activate', resize );
		setTimeout( () => resizeOff = on( window, 'resize', resize ), 100 );
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
	setTimeout( onResize, 100 );
	on( window, 'resize', onResize );
};

let tabWidgets;

// Move tabsBar controls to navBar or the reverse:
const moveTabControls = CUI => {
	if ( !tabWidgets ) tabWidgets = CUI.getWidgetsInArea( CUI.AREA_TABSTRIP );
	return exec( area => {
		try {
			CUI.beginBatchUpdate();
			const start = area === CUI.AREA_NAVBAR ? 0 : CUI.getPlacementOfWidget( ID.urlContainer ).position;
			tabWidgets.forEach( (w, i) => {
				// If not already in area: Make removable, move, restore removable:
				const nodes = CUI.getWidget( tabWidgets[i].id ).instances.map( i => i.node );
				const r = nodes.map( partial( setAttr, 'removable', true ) );
				CUI.addWidgetToArea( w.id, area, i + 0 + 1 );
				nodes.forEach( (n, i) => n.setAttribute( 'removable', r[i] ) );
			} );
		} finally {
			CUI.endBatchUpdate();
		}
	}, CUI.AREA_NAVBAR );
};

/**
 * Handles urlbar to the left or right mode.
 *
 * @param  {CustomizableUI}  CUI  The CustomizableUI.
 */
const urlbarRLHandler = CUI => sp.on( 'urlbarRight', () => {
	const ids = [ID.urlContainer, ID.newSearch.button],
			p = ids.map( id => CUI.getPlacementOfWidget( id ) ),
			d = p[0].position - (p[1] ? p[1].position : 0),
			r = sp.prefs.urlbarRight;
	moveWidget( CUI, ids[0], tabWidgets[r ? tabWidgets.length - 1 : 0].id, r ? 1 : -1 );
	if ( Math.abs( d ) === 1 && p[0].area === p[1].area )
		moveWidget( CUI, ids[1], ids[0], d < 1 ? 1 : 0 );
} );

const modeFlexible = (urlContainer, oldFlex) => {
	urlContainer.setAttribute( 'flex', oldFlex );
	urlContainer.style.position = '';
	urlContainer.style.width = '';
	urlContainer.style.maxWidth = '';
};

const modeNonFlexible = (window, elements, focusedPref) => {
	const {document, gURLBar, CustomizableUI: CUI} = window;
	const rw = partial( realWidth, window );

	// Get aliases to various elements:
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

	// If overflowing: Move overflowed items out of overflow area:
	if ( !f && navBar.hasAttribute( 'overflowing' ) ) {
		const widgets = [for (w of CUI.getWidgetsInArea( CUI.AREA_NAVBAR )) w.forWindow( window )];
		const nodes	  = [for (w of widgets) if ( w.overflowed ) w.node];
		const parent  = nodes[0].parentElement;

		setTimeout( () => {
			// Compute space & how many buttons we can move outa overflow:
			let width = rw( navBarTarget ) + rw( overflow );
			const reduce = arr => arr.reduce( (a, n) => a + rw( n ), 0 );
			const isTabs = e => e.id === tabs.id;

			// Treat tabs as 'non-flex':
			const tabsC = () => {
				const scrollbox = document.getAnonymousElementByAttribute( tabs, 'anonid', 'arrowscrollbox' );
				return scrollbox ? Array.from( document.getAnonymousNodes( scrollbox ) )
					.filter( n => !n.classList.contains( 'arrowscrollbox-scrollbox' ) ) : [];
			};

			// Reduce all widths that are non-overflowed:
			width -= reduce( tabsC().concat( Array.from( document.querySelectorAll( '.tabbrowser-tab' ) ) )
				.concat( Array.from( navBarTarget.childNodes ).filter( n => !isTabs( n ) ) ) );

			// Reduce as many overflowed as possible:
			let added = 0;
			for ( let n of nodes ) {
				navBarTarget.appendChild( n )
				width -= isTabs( n ) ? reduce( tabsC() ) : rw( n );
				if ( width < 0 ) { parent.insertBefore( n, parent.firstChild ); break; }
				if ( isTabs ) n.removeAttribute( 'overflow' );
				added++;
			 	n.removeAttribute( 'overflowedItem' );
			}

			if ( added === nodes.length )
				navBar.removeAttribute( 'overflowing' );
		}, 100 );
	}
};

const updateBackForward = updateLayout => change( 'UpdateBackForwardCommands',
	orig => function( webnav ) { orig.call( this, webnav ); updateLayout(); }
);

const urlbarEscapeHandler = ({gURLBar, gBrowser}) => on( gURLBar, 'keydown', event => {
	if ( event.keyCode === event.DOM_VK_ESCAPE ) {
		let {popupOpen, value} = gURLBar;
		setTimeout( () => {
			// Only return focus to the page if nothing changed since escaping
			if  ( gURLBar.popupOpen === popupOpen && gURLBar.value === value )
				gBrowser.selectedBrowser.focus();
		} );
	}
} );

const makeLine = window => {
	const {gURLBar, CustomizableUI: CUI} = window;

	// Apply browser.css:
	const style = new Style( { uri: './browser.css' } );
	attachTo( style, window );

	// Handle the user preferences tabMinWidth & tabMaxWidth:s.
	tabWidthHandler( window );

	// Get aliases to various elements:
	const elements = [ID.tabs, ID.tabsBar, ID.navBar, ID.navBarTarget, ID.urlContainer,
		ID.overflow, ID.backForward, ID.backCmd, ID.forwardCmd].map( byId( window ) );
	const [, tabsBar, navBar, navBarTarget, urlContainer,, backForward] = elements;

	fixNavBarDrag( window, navBar );

	imposeMaxWidth( window, {navBarTarget, urlContainer} );

	// Remove search bar from navBar:
	CUI.removeWidgetFromArea( ID.search );

	// Make tabsBar the nextSibling of navBar, not the reverse which is the case now:
	insertAfter( tabsBar, navBar );

	// Move tabsBar controls to navBar:
	const moveTabCtrls = moveTabControls( CUI );

	// Save order of elements in tabsBar to restore later:
	const origTabs = appendChildren( navBar, Array.from( tabsBar.childNodes ) );

	// Move to right/left when asked to:
	urlbarRLHandler( CUI );

	const flex = urlContainer.getAttribute( 'flex' );

	// Make a switch of all the modes and pick the current one:
	let layoutUpdater;
	const layoutSwitcher = () => {
		layoutUpdater = {
			'fixed':	() => partial( modeNonFlexible, window, elements, 'urlbarBlur' ),
			'sliding':	() => partial( modeNonFlexible, window, elements, 'urlbarFocused' ),
			'flexible':	() => partial( modeFlexible, urlContainer, flex )
		}[sp.prefs.urlbarMode]();
	};
	layoutSwitcher();

	// Update the look immediately when activating:
	const updateLayout = () => layoutUpdater();
	updateLayout();

	['urlbarBlur', 'urlbarMode'].forEach( e => sp.on( e, () => {
		layoutSwitcher();
		updateLayout();
	} ) );

	// Detect when the back/forward buttons change state to update UI:
	updateBackForward();

	// Make sure we set the right size of the urlbar on blur or focus:
	onMulti( gURLBar, ['blur', 'focus'], updateLayout );

	// Handle Identity Label:
	identityLabelRetracter( window );

	// Setup Search Button:
	setupSearchButton( window );

	// Detect escaping from the location bar when nothing changes:
	urlbarEscapeHandler( window );

	// Clean up various changes when the add-on unloads:
	unloader( () => {
		// Remove our style:
		detachFrom( style, window );

		// Restore search-bar if user hasn't manually moved it:
		if ( CUI.getPlacementOfWidget( ID.search ) === null ) {
			const ubp = CUI.getPlacementOfWidget( ID.urlContainer );
			CUI.addWidgetToArea( ID.search, ubp.area, ubp.position + 1 );
		}

		// Reverse: tabsBar the nextSibling of navBar:
		insertAfter( navBar, tabsBar );

		// Move stuff back to tabsBar:
		appendChildren( tabsBar, origTabs );

		// Return tab controls:
		moveTabCtrls( CUI.AREA_TABSTRIP );

		if ( backForward ) backForward.style.marginRight = '';
		modeFlexible( urlContainer, flex );
	} );
};

// Plugin entry point:
watchWindows( window => setTimeout( window => makeLine( window ) ) );