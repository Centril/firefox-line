'use strict';

// Load SDK:
const self						= require('sdk/self'),
	  ui						= require('sdk/ui'),
	  prefs						= require('sdk/preferences/service'),
	  {Style}					= require("sdk/stylesheet/style"),
	  {modelFor}				= require('sdk/model/core'),
	  {partial}					= require('sdk/lang/functional'),
	  {remove: arrayRemove}		= require('sdk/util/array'),
	  {isNull, isUndefined}		= require('sdk/lang/type'),
	  {setTimeout: async}		= require('sdk/timers'),
	  {attachTo, detachFrom}	= require('sdk/content/mod');

const {	nullOrUndefined,
		unload, unloader, unloaderBind,
		getAllWindows, watchWindows,
		change, on, once,
		px, boundingWidth, boundingWidthPx, setWidth
	  } = require('utils');

// Define how wide the urlbar should be
const URLBAR_WIDTH = 400;

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

const makeLine = window => {
	const saved = {},
		windowModel = modelFor( window ),
		{document, gBrowser, gURLBar} = window,
		unloader = unloaderBind( window );

	// Apply browser.css:
	saved.style = new Style( { uri: './browser.css' } );
	attachTo( saved.style, window );

	// create Search Button:
	const searchButton = ui.ActionButton( {
		id:		'searchbutton',
		label:	'Search',
		icon:	{
			'16':	'./search16.png'
		},
		onClick: partial( searchClick, window )
	} );

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

	const identityLabelUpdate = (() => {
		const label = document.getElementById( "identity-icon-labels" )
		const labelWidth = setWidth( label );
		let oldWidth;

		const update = () => {
			if ( gURLBar.focused ) {
				oldWidth = boundingWidthPx( label );
				labelWidth( px( '0' ) );
			} else {
				labelWidth( oldWidth );
			}
		};

		const resize = () => {
			labelWidth( 'auto' );
			oldWidth = window.getComputedStyle( label ).width;
			labelWidth( boundingWidthPx( label ) );
			label.offsetWidth; // Force repaint
			labelWidth( oldWidth );
		};

		windowModel.tabs.on( 'activate', resize );
		async( () => on( window, 'resize', resize ), 100 );

		return update;
	})();

	const updateLayoutNonFlexible = focusedFactor => {
		identityLabelUpdate();

		const buttonWidth = backForward.boxObject.width / 2;
		let buttons = 0;
		if ( !forwardCmd.hasAttribute( "disabled" ) )
			buttons = 2;
		else if ( !backCmd.hasAttribute( "disabled" ) )
			buttons = 1;
		const offset = -buttonWidth * (2 - buttons);

		// Cover up some buttons by shifting the urlbar left:
		let baseWidth = (gURLBar.focused ? focusedFactor : 1) * URLBAR_WIDTH;
		let width = baseWidth - buttonWidth * buttons;
		backForward.style.marginRight = px( offset );
		urlContainer.style.width = px( width );
	}

	// Impose a max-width constraint so we don't overflow!
	const imposeMaxWidth = () => {
		const onResize = () => {
			const tb = document.getElementById('tabbrowser-tabs');
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

	const modeNonFlexible = focusedFactor => {
		urlContainer.removeAttribute( "flex" );
		imposeMaxWidth();
		return partial( updateLayoutNonFlexible, focusedFactor );
	}

	let mode = 'flexible';

	let updateLayout = {
		'fixed':	() => modeNonFlexible( 1 ),
		'slide':	() => modeNonFlexible( 2 ),
		'flexible':	() => identityLabelUpdate
	}[mode]();

	// Clean up various changes when the add-on unloads:
	unloader( () => {
		detachFrom( saved.style, window );
		searchButton.destroy();
		saved.origNav.forEach( node => navBar.appendChild( node ) );
		backForward.style.marginRight = "";
		navBar.hidden = false;
		navBar.appendChild( customize );
		urlContainer.setAttribute( "flex", saved.flex );
		urlContainer.style.position = "";
		urlContainer.style.width = "";
		urlContainer.style.maxWidth = "";
	} );

	// Update the look immediately when activating:
	updateLayout();

	// Detect when the back/forward buttons change state to update UI:
	change( window, "UpdateBackForwardCommands", orig => function( webnav ) {
		orig.call( this, webnav );
		updateLayout();
	} );

	// Make sure we set the right size of the urlbar on blur or focus:
	['blur', 'focus'].forEach( state => on( gURLBar, state, () => updateLayout() ) );

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
	prefs.set( AUTOHIDE_PREF, true );
	unloader( () => prefs.reset( AUTOHIDE_PREF ) );
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