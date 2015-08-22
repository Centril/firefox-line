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

// Load SDK:
const self						= require('sdk/self'),
	  ui						= require('sdk/ui'),
	  globalPrefs				= require('sdk/preferences/service'),
	  sp						= require("sdk/simple-prefs"),
	  {Style}					= require("sdk/stylesheet/style"),
	  {modelFor}				= require('sdk/model/core'),
	  {partial}					= require('sdk/lang/functional'),
	  {remove: arrayRemove}		= require('sdk/util/array'),
	  {isNull, isUndefined}		= require('sdk/lang/type'),
	  {setTimeout: async}		= require('sdk/timers'),
	  {attachTo, detachFrom}	= require('sdk/content/mod');

const {	nullOrUndefined, noop,
		unload, unloader, unloaderBind,
		getAllWindows, watchWindows,
		change, on, once, onMulti,
		px, boundingWidth, boundingWidthPx, setWidth
	  } = require('utils');

const searchClick = (window, state) => {
	const {document, gBrowser, gURLBar} = window;
	// @TODO error here!
	let browser = gBrowser.selectedBrowser;

	// See if we should copy over the value in the input when searching
	let prefill = gURLBar.value.trim();
	if ( prefill.search( /[:\/\.]/ ) !== -1 )
		prefill = "";

	// Check for a focused plain textbox
	const {focusedElement} = document.commandDispatcher;
	const {nodeName, type, value} = focusedElement || {};
	if ( prefill === "" &&
		 focusedElement !== gURLBar.inputField &&
		 !nullOrUndefined( nodeName ) &&
		 nodeName.search( /^(html:)?input$/i ) === 0 &&
		 type.search( /^text$/i ) === 0 ) {
		prefill = value.trim();
	}

	// Check the page for selected text
	if ( prefill === "" )
		prefill = browser.contentWindow.getSelection().toString().trim();

	// Check the clipboard for text
	if ( prefill === "")
		prefill = (window.readFromClipboard() || "").trim();

	// Make sure to not replace pinned tabs
	if ( gBrowser.selectedTab.pinned ) {
		const tab = gBrowser.addTab( "about:home" );
		gBrowser.selectedTab = tab;
		browser = tab.linkedBrowser;
	}
	// Replace the tab with search
	else
		browser.loadURI("about:home");

	// Prepare about:home with a prefilled search once
	browser.focus();
	once( browser, "DOMContentLoaded", () => {
		// Prefill then select it for easy typing over
		const input = browser.contentDocument.getElementById( "searchText" );
		input.value = prefill;
		input.setSelectionRange( 0, prefill.length );
		// Clear out the location bar so it shows the placeholder text
		gURLBar.value = "";
	} );
}

const getContrastYIQ = hc => {
	const [r, g, b] = [0, 2, 4].map( p => parseInt( hc.substr( p, 2 ), 16 ) );
	return ((r * 299) + (g * 587) + (b * 114)) / 1000 >= 128;
}

const makeSearchButton = window => {
	const titlebar = window.document.getElementById( 'titlebar' );
	const bg = window.getComputedStyle( titlebar ).getPropertyValue( '--chrome-background-color' );
	const light = getContrastYIQ( bg.substr( 1 ) ) ? '' : '_white';

	return ui.ActionButton( {
		id:		'searchbutton',
		label:	'Search',
		icon:	['16', '32', '64'].reduce( (l, s) => { l[s] = `./search${light}${s}.png`; return l; }, {} ),
		onClick: partial( searchClick, window )
	} )
};

// Identity Label Handler:
const identityLabelRetracter = window => {
	// Get some resources:
	const windowModel = modelFor( window )
	const label = window.document.getElementById( "identity-icon-labels" )
	const labelWidth = setWidth( label );
	let oldWidth;
	let resizeOff = noop, updateOff = [];

	const reset = partial( labelWidth, 'auto' );
	unloader( reset, window );

	const resize = () => {
		reset();
		oldWidth = window.getComputedStyle( label ).width;
		labelWidth( boundingWidthPx( label ) );
		label.offsetWidth; // Force repaint
		labelWidth( oldWidth );
	};

	const update = () => {
		if ( window.gURLBar.focused ) {
			oldWidth = boundingWidthPx( label );
			labelWidth( px( '0' ) );
		} else {
			labelWidth( oldWidth );
		}
	};

	const bind = () => {
		updateOff = onMulti( window.gURLBar, ['blur', 'focus'], update );
		windowModel.tabs.on( 'activate', resize );
		async( () => resizeOff = on( window, 'resize', resize ), 100 );
	}

	const unbind = () => {
		reset();
		windowModel.tabs.off( 'activate', resize );
		resizeOff();
		updateOff.forEach( v => v() );
		resizeOff = noop;
		updateOff = [];
	}

	const prefHandler = () => sp.prefs.retractIdentityLabel ? bind() : unbind();
	prefHandler();
	sp.on( 'retractIdentityLabel', prefHandler );
}

// Impose a max-width constraint so we don't overflow!
const imposeMaxWidth = (window, tabsBar, urlContainer) => {
	const onResize = () => {
		const tb = window.document.getElementById('tabbrowser-tabs');
		const tbWidth = boundingWidth( tb );
		const tbReduce = tbWidth < 100 ? tbWidth : 100;

		let children = Array.from( tabsBar.childNodes );
		arrayRemove( children, urlContainer );
		arrayRemove( children, tb );

		let width = children.reduce( (a, v) => a - boundingWidth( v ), boundingWidth( tabsBar ) );
		urlContainer.style.maxWidth = px( width - tbReduce );
	};

	async( onResize, 100 );
	on( window, 'resize', onResize );
}

const makeLine = window => {
	const saved = {},
		{document, gBrowser, gURLBar} = window,
		unloader = unloaderBind( window );

	// Apply browser.css:
	saved.style = new Style( { uri: './browser.css' } );
	attachTo( saved.style, window );

	// create Search Button:
	const searchButton = makeSearchButton( window );

	// Get aliases to various elements:
	let [commands,
		navBar, tabsBar,
		backForward, urlContainer, reload, stop, customize, searchButtonChrome,
		backCmd, forwardCmd,
		titlebarPlaceholder] =
		["mainCommandSet",
		 "nav-bar", "TabsToolbar",
		 "unified-back-forward-button", "urlbar-container", "reload-button", "stop-button",
		 'PanelUI-menu-button', 'action-button--firefox-line-searchbutton',
		 "Browser:Back", "Browser:Forward",
		 "titlebar-placeholder-on-TabsToolbar-for-captions-buttons"
		].map( id => document.getElementById( id ) );

	// Save the order of elements in the navigation bar to restore later:
	saved.origNav = Array.slice( navBar.childNodes );

	// Move the navigation controls to the tabs bar:
	const navOrder = [backForward, urlContainer, reload, stop, searchButtonChrome];
	navOrder.reverse().forEach( node => {
		if ( !isNull( node ) )
			tabsBar.insertBefore( node, tabsBar.firstChild );
	} );

	tabsBar.insertBefore( customize, titlebarPlaceholder );

	// Create a dummy backForward object if we don't have the node:
	backForward = backForward || {
		boxObject: {
			width: 0,
		},
		style: {},
	};

	// Make navigation bar hidden:
	navBar.hidden = true;
	saved.flex = urlContainer.getAttribute( "flex" );

	// Handle Identity Label:
	identityLabelRetracter( window );

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
		imposeMaxWidth( window, tabsBar, urlContainer );
		return partial( updateLayoutNonFlexible, focusedPref );
	}

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
	onMulti( window.gURLBar, ['blur', 'focus'], updateLayout );

	// Clean up various changes when the add-on unloads:
	unloader( () => {
		detachFrom( saved.style, window );
		searchButton.destroy();
		saved.origNav.forEach( node => navBar.appendChild( node ) );
		backForward.style.marginRight = "";
		navBar.hidden = false;
		navBar.appendChild( customize );
		modeFlexible();
	} );

	// Do the custom search button command instead of the original:
	on( commands, "command", event => {
		if ( event.target.id === "Tools:Search" ) {
			event.stopPropagation();
			searchButton.click();
		}
	} );

	// Detect escaping from the location bar when nothing changes:
	on( gURLBar, "keydown", event => {
		if ( event.keyCode === event.DOM_VK_ESCAPE ) {
			let {popupOpen, value} = gURLBar;
			async( () => {
				// Only return focus to the page if nothing changed since escaping
				if  ( gURLBar.popupOpen === popupOpen && gURLBar.value === value )
					gBrowser.selectedBrowser.focus();
			} );
		}
	} );
}

// Make sure fullscreen always shows the toolbar without animation:
const fullscreenWithoutAnimation = () => {
	const AUTOHIDE_PREF = "browser.fullscreen.autohide";
	globalPrefs.set( AUTOHIDE_PREF, true );
	unloader( () => globalPrefs.reset( AUTOHIDE_PREF ) );
}

// Plugin entry point:
const main = () => {
	watchWindows( window => async( partial( makeLine, window ) ) );

	// Make sure fullscreen always shows the toolbar without animation:
	fullscreenWithoutAnimation();
}

main();

// Clean up with unloaders when we're deactivating:
require("sdk/system/unload").when( reason => unload() );