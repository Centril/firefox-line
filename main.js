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
const { ID }					= require( 'ids' );
const { setupSearchButton }		= require( 'search-engine' );
const {	sdks, nullOrUndefined, noop, watchWindows, change, on, once, onMulti,
		px, boundingWidth, boundingWidthPx, setWidth, realWidth,
		insertAfter, byId, moveWidget, exec,
		attrs, appendChild }	= require('utils');
const [ self, sp, {Style}, {modelFor}, {when: unloader},
		{partial}, {remove}, {isNull, isUndefined}, {setTimeout}, {attachTo, detachFrom}] = sdks(
	  ['self', 'simple-prefs', 'stylesheet/style', 'model/core', 'system/unload',
	   'lang/functional', 'util/array', 'lang/type', 'timers', 'content/mod' ] );

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
	const label = byId( window, "identity-icon-labels" );
	const labelWidth = setWidth( label );
	let oldWidth;
	let resizeOff = noop, updateOff = [];

	const reset = partial( labelWidth, 'auto' );
	unloader( reset );

	const resize = () => {
		reset();
		oldWidth = getComputedStyle( label ).width;
		labelWidth( boundingWidthPx( label ) );
		label.offsetWidth; // Force repaint
		labelWidth( oldWidth );
	};

	const update = () => {
		if ( gURLBar.focused ) {
			oldWidth = boundingWidthPx( label );
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
	const onResize = () => {
		//urlContainer.style.maxWidth = boundingWidthPx( navBarTarget );
	};

	setTimeout( onResize, 100 );
	on( window, 'resize', onResize );
};

const makeLine = window => {
	const {document, gBrowser, gURLBar, CustomizableUI: CUI} = window,
		  id = byId( window );

	// Apply browser.css:
	const style = new Style( { uri: './browser.css' } );
	attachTo( style, window );

	// Handle the user preferences tabMinWidth & tabMaxWidth:s.
	tabWidthHandler( window );

	// Get aliases to various elements:
	const [ navBar, navBarTarget, tabs, tabsBar, urlContainer,
			overflow, backCmd, forwardCmd, backForward] =
		  [ ID.navBar, ID.navBarTarget, ID.tabs, ID.tabsBar, ID.urlbar,
		  	ID.overflow, ID.back, ID.forward, ID.backForward].map( id );

	imposeMaxWidth( window, {navBarTarget, urlContainer} );

	// Remove search bar from navBar:
	CUI.removeWidgetFromArea( ID.search );

	// Make tabsBar the nextSibling of navBar, not the reverse which is the case now:
	insertAfter( tabsBar, navBar );

	// Move tabsBar controls to navBar:
	const tabWidgets = CUI.getWidgetsInArea( CUI.AREA_TABSTRIP );
	const moveTabControls = exec( area => {
		const start = area === CUI.AREA_NAVBAR ? 0 : CUI.getPlacementOfWidget( ID.urlbar ).position;
		tabWidgets.forEach( (w, i) => {
			// Make removable, move, restore removable:
			const node = w.forWindow( window ).node;
			const removable = node.getAttribute( 'removable' );
			node.setAttribute( 'removable', 'true' );
			CUI.addWidgetToArea( w.id, area, i + start + 1 );
			node.setAttribute( 'removable', removable );
		} );
	}, CUI.AREA_NAVBAR );
	unloader( () => moveTabControls( CUI.AREA_TABSTRIP ) );

	// Move to right/left when asked to:
	sp.on( 'urlbarRight', () => {
		const ids = [ID.urlbar, ID.newSearch.button],
				p = ids.map( id => CUI.getPlacementOfWidget( id ) ),
				d = p[0].position - p[1].position,
				r = sp.prefs.urlbarRight;
		moveWidget( CUI, ids[0], tabWidgets[r ? tabWidgets.length - 1 : 0].id, r ? 1 : -1 );
		if ( p[0].area === p[1].area && Math.abs( d ) === 1 )
			moveWidget( CUI, ids[1], ids[0], d < 1 ? 1 : 0 );
	} );

	// Save order of elements in tabsBar to restore later:
	const origTabs = Array.slice( tabsBar.childNodes );
	origTabs.reverse().forEach( appendChild( navBar ) );

	// Handle Identity Label:
	identityLabelRetracter( window );

	// Functions for handling layout modes:
	const modeNonFlexible = focusedPref => {
		// We're not flexible:
		if ( urlContainer.hasAttribute( 'flex') )
			urlContainer.removeAttribute( 'flex' );

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
				let width = realWidth( navBarTarget ) + realWidth( overflow );
				const reduce = arr => arr.reduce( (a, n) => a + realWidth( n ), 0 );
				const isTabs = e => e.id === tabs.id;

				// Treat tabs as "non-flex":
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
					width -= isTabs( n ) ? reduce( tabsC() ) : realWidth( n );
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

	const flex = urlContainer.getAttribute( "flex" );
	const modeFlexible = () => {
		urlContainer.setAttribute( "flex", flex );
		urlContainer.style.position = "";
		urlContainer.style.width = "";
		urlContainer.style.maxWidth = "";
	};

	// Make a switch of all the modes and pick the current one:
	let layoutUpdater;
	const layoutSwitcher = () => {
		layoutUpdater = {
			'fixed':	() => partial( modeNonFlexible, 'urlbarBlur' ),
			'sliding':	() => partial( modeNonFlexible, 'urlbarFocused' ),
			'flexible':	() => modeFlexible
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
	change( window, "UpdateBackForwardCommands", orig => function( webnav ) {
		orig.call( this, webnav );
		updateLayout();
	} );

	// Make sure we set the right size of the urlbar on blur or focus:
	onMulti( gURLBar, ['blur', 'focus'], updateLayout );

	// Setup Search Button:
	setupSearchButton( window );

	// Clean up various changes when the add-on unloads:
	unloader( () => {
		// Remove our style:
		detachFrom( style, window );

		// Restore search-bar if user hasn't manually moved it:
		if ( CUI.getPlacementOfWidget( ID.search ) === null ) {
			const ubp = CUI.getPlacementOfWidget( ID.urlbar );
			CUI.addWidgetToArea( ID.search, ubp.area, ubp.position + 1 );
		}

		// Reverse: tabsBar the nextSibling of navBar:
		insertAfter( navBar, tabsBar );

		// Move stuff back to tabsBar:
		origTabs.forEach( appendChild( tabsBar ) );

		if ( backForward ) backForward.style.marginRight = "";
		modeFlexible();
	} );

	// Detect escaping from the location bar when nothing changes:
	on( gURLBar, "keydown", event => {
		if ( event.keyCode === event.DOM_VK_ESCAPE ) {
			let {popupOpen, value} = gURLBar;
			setTimeout( () => {
				// Only return focus to the page if nothing changed since escaping
				if  ( gURLBar.popupOpen === popupOpen && gURLBar.value === value )
					gBrowser.selectedBrowser.focus();
			} );
		}
	} );
};

// Plugin entry point:
watchWindows( window => setTimeout( partial( makeLine, window ) ) );