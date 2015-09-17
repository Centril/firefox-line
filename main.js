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
		px, boundingWidth, boundingWidthPx, setWidth, insertAfter, byId,
		attrs, appendChild }	= require('utils');
const [ self, sp, {Style}, {modelFor}, {when: unloader},
		{partial}, {remove}, {isNull, isUndefined}, {setTimeout}, {attachTo, detachFrom}] = sdks(
	  ['self', 'simple-prefs', 'stylesheet/style', 'model/core', 'system/unload',
	   'lang/functional', 'util/array', 'lang/type', 'timers', 'content/mod' ] );

// Handle the user preferences tabMinWidth & tabMaxWidth:s.
const tabWidthHandler = (saved, window) => [['min', 'tabMinWidth'], ['max', 'tabMaxWidth']].forEach( e => {
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
		const handleWidth = () => {
			detach();

			const pref = sp.prefs[e[1]];
			if ( pref !== 0 ) {
				saved[e[1]] = new Style( { source: `.tabbrowser-tab:not([pinned]) {
					${e[0]}-width:${pref}px !important;
				}` } );

				attachTo( saved[e[1]], window );
			}
		}
		handleWidth();
		sp.on( e[1], handleWidth );
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

	const prefHandler = () => sp.prefs.retractIdentityLabel ? bind() : unbind();
	prefHandler();
	sp.on( 'retractIdentityLabel', prefHandler );
}

// Impose a max-width constraint so we don't overflow!
const imposeMaxWidth = (window, navBar, urlContainer) => {
	const onResize = () => {
		const tb = byId( window, ID.tabs );
		const tbWidth = boundingWidth( tb );
		const tbReduce = tbWidth < 100 ? tbWidth : 100;

		let children = Array.from( navBar.childNodes );
		remove( children, urlContainer );
		remove( children, tb );

		let width = children.reduce( (a, v) => a - boundingWidth( v ), boundingWidth( navBar ) );
		urlContainer.style.maxWidth = px( width - tbReduce );
	};

	setTimeout( onResize, 100 );
	on( window, 'resize', onResize );
}

const makeLine = window => {
	const saved = {},
		{document, gBrowser, gURLBar, CustomizableUI: CUI} = window,
		id = byId( window );

	// Apply browser.css:
	saved.style = new Style( { uri: './browser.css' } );
	attachTo( saved.style, window );

	// Handle the user preferences tabMinWidth & tabMaxWidth:s.
	tabWidthHandler( saved, window );

	// Get aliases to various elements:
	const [ navBar, navBarTarget, tabsBar, urlContainer, titlebarPlaceholder,
			searchButtonChrome, commands, backCmd, forwardCmd] =
		  [ ID.navBar, ID.navBarTarget, ID.tabsBar, ID.urlbar, ID.titlebarPlaceholder,
			ID.searchButton, ID.commands, ID.back, ID.forward].map( id );

	let backForward = id( ID.backForward );

	// Remove search bar from navBar:
	CUI.removeWidgetFromArea( ID.search );

	// Save order of elements in tabsBar to restore later:
	saved.origTabs = Array.slice( tabsBar.childNodes );
	const addOrder = saved.origTabs.slice( 0 );
	const reverseAdd = addOrder.reverse();

	// Move titlebar placeholder to navBar:
	if ( !isNull( titlebarPlaceholder ) ) {
		navBar.appendChild( titlebarPlaceholder );
		addOrder.splice( addOrder.indexOf( titlebarPlaceholder ), 1 );
	}

	// Make tabsBar the nextSibling of navBar, not the reverse which is the case now:
	insertAfter( tabsBar, navBar );

	// Move tabsBar controls to navBar:
	const placeTabControls = () => {
		const notNullDo = (callback, node) => { if ( !isNull( node ) ) callback( node ) };
		const stateF = [node => insertAfter( node, urlContainer ), node => navBarTarget.insertBefore( node, navBarTarget.firstChild )]
			.map( f => partial( notNullDo, f ) );
		reverseAdd.forEach( stateF[sp.prefs.urlbarRight ? 1 : 0] );
	};
	placeTabControls();
	sp.on( 'urlbarRight', placeTabControls );

	// Create a dummy backForward object if we don't have the node:
	backForward = backForward || { boxObject: { width: 0 }, style: {} };

	// Handle Identity Label:
	identityLabelRetracter( window );

	// Functions for handling layout modes:
	const updateLayoutNonFlexible = focusedPref => {
		const buttonWidth = backForward.boxObject.width / 2;
		let buttons = 0;
		if ( !forwardCmd.hasAttribute( "disabled" ) )
			buttons = 2;
		else if ( !backCmd.hasAttribute( "disabled" ) )
			buttons = 1;
		const offset = -buttonWidth * (2 - buttons);

		// Cover up some buttons by shifting the urlbar left:
		let baseWidth = sp.prefs[gURLBar.focused ? focusedPref : 'urlbarBlur'];
		let width = baseWidth - buttonWidth * buttons;
		backForward.style.marginRight = px( offset );
		urlContainer.style.width = px( width );
	}

	const modeNonFlexible = focusedPref => {
		urlContainer.removeAttribute( "flex" );
		imposeMaxWidth( window, navBar, urlContainer );
		return partial( updateLayoutNonFlexible, focusedPref );
	}

	saved.flex = urlContainer.getAttribute( "flex" );
	const modeFlexible = () => {
		urlContainer.setAttribute( "flex", saved.flex );
		urlContainer.style.position = "";
		urlContainer.style.width = "";
		urlContainer.style.maxWidth = "";
	};

	// Make a switch of all the modes and pick the current one:
	let layoutUpdater;
	const layoutSwitcher = () => {
		layoutUpdater = {
			'fixed':	() => modeNonFlexible( 'urlbarBlur' ),
			'sliding':	() => modeNonFlexible( 'urlbarFocused' ),
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
		detachFrom( saved.style, window );

		// Restore search-bar if user hasn't manually moved it:
		if ( CUI.getPlacementOfWidget( ID.search ) === null ) {
			const urlbarPlacement = CUI.getPlacementOfWidget( ID.urlbar );
			CUI.addWidgetToArea( ID.search, urlbarPlacement.area, urlbarPlacement.position + 1 );
		}

		// Reverse: tabsBar the nextSibling of navBar:
		insertAfter( navBar, tabsBar );

		// Move stuff back to tabsBar:
		saved.origTabs.forEach( appendChild( tabsBar ) );

		backForward.style.marginRight = "";
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