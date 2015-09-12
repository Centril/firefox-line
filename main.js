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

// Import SDK:
const self						= require('sdk/self'),
//	  ui						= require('sdk/ui'),
	  globalPrefs				= require('sdk/preferences/service'),
	  sp						= require("sdk/simple-prefs"),
	  {Style}					= require("sdk/stylesheet/style"),
	  {modelFor}				= require('sdk/model/core'),
	  {partial}					= require('sdk/lang/functional'),
	  {remove: arrayRemove}		= require('sdk/util/array'),
	  {isNull, isUndefined}		= require('sdk/lang/type'),
	  {setTimeout: async}		= require('sdk/timers'),
	  {attachTo, detachFrom}	= require('sdk/content/mod');

// Import utils:
const {	nullOrUndefined, noop,
		unload, unloader, unloaderBind,
		getAllWindows, watchWindows,
		change, on, once, onMulti,
		px, boundingWidth, boundingWidthPx, setWidth,
		insertAfter, byId,
		attrs, removeChildren
	  } = require('utils');

// Define all IDs used in addon:
const ID = {
	search:			'search-container',
	urlbar:			'urlbar-container',
	urlbarTB:		'urlbar',
	navBar:			'nav-bar',
	navBarTarget: 	'nav-bar-customization-target',
	tabsBar:		'TabsToolbar',
	tabs:			'tabbrowser-tabs',
	titlebarPlaceholder: 'titlebar-placeholder-on-TabsToolbar-for-captions-buttons',
	commands:		'mainCommandSet',
	back: 			'Browser:Back',
	forward:		'Browser:Forward',
	backForward:	'unified-back-forward-button',

	stringBundles:	'stringbundleset',
	searchProviders: {
		button:		'firefox-line-search-button',
		view:		'firefox-line-search-view',
		strings:	'firefox-line-search-strings'
	}
}

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

const {enginesManager} = require( './search-engine.js' );
const makeSearchButton = window => {
	const	CUI = window.CustomizableUI,
			ids = ID.searchProviders,
			manager = enginesManager( window ),
			nsXUL = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul",
			xul = elem => window.document.createElementNS( nsXUL, elem );

	const pu = window.Components.utils.import( 'resource://gre/modules/PlacesUtils.jsm', {} ).PlacesUtils;

 	// Create stringbundle to use later:
 	const sb = attrs( xul( 'stringbundle' ), {
 		src: 'chrome://browser/locale/search.properties',
 		id: ids.strings,
 	} );
 	byId( window, ID.stringBundles ).appendChild( sb );

	const pv = (() => {
		// Construct our panelview:
		const panel = attrs( xul( 'panelview' ), { id: ids.view } ),
			engines = attrs( xul( 'description' ), { class: 'search-panel-one-offs' } ),
				add = xul( 'hbox' );

		[engines, add].forEach( elem => panel.appendChild( elem ) );
	 	byId( window, 'tab-view-deck' ).appendChild( panel );

		return {panel, engines, add};
	})();

	const updater = () => {
		// Update!
		console.log( 'update! ' + ids.view );

		removeChildren( pv.engines );
		removeChildren( pv.add );

		// Get our engines, separate current and the rest, place them out:
		const curr = manager.currentEngine;
		const engines = [for (e of manager.engines) if ( e.identifier !== curr.identifier ) e];
		engines.unshift( curr );

		const maxCol = engines.length % 3 === 0 ? 3 : engines.length >= 16 ? 4 : 2;
		const makeEngineButton = (engine, i, all) => {
			const s = [i === 0, (i + 1) % maxCol === 0,
				Math.ceil( (i + 1) / maxCol ) === Math.ceil( all.length / maxCol )];
			const b = attrs( xul( 'button' ), {
				id: 'searchpanel-engine-one-off-item-' + engine.name,
				class: ['searchbar-engine-one-off-item']
					.concat( ['current', 'last-of-row', 'last-row'].filter( (c, i) => s[i] ) )
					.join( ' ' ),
				flex: '1',
				tooltiptext: sb.getFormattedString( 'searchtip', [engine.name] ),
				label: engine.name,
				image: pu.getImageURLForResolution( window, engine.iconURI.spec ),
				width: "59",
				"data-engine": engine.name
			} );
			on( b, 'command', event => {
				// Handle clicks on an engine, get engine first:
				const name = event.target.getAttribute( 'data-engine' );
				const engine = manager.byName( name );

				// Get urlbar value:
				const val = byId( window, ID.urlbarTB ).value;

				// Finally, make our search in the given tab.
				// @TODO

				console.log( "searching for: " + val );
				console.log( engine );
			}, true );
			pv.engines.appendChild( b );
		};
		engines.forEach( makeEngineButton );

		// Place out "add":
		const addEngineButton = engine => {
			const b = attrs( xul( 'button' ), {
				id: 'searchbar-add-engine-' + engine.name,
				class: 'addengine-item',
				uri: engine.uri,
				tooltiptext: engine.uri,
				label: sb.getFormattedString( "cmd_addFoundEngine", [engine.title] ),
				title: engine.title,
				image: pu.getImageURLForResolution( window, engine.icon ),
				pack: "start",
				crop: "end"
			} );
			pv.add.appendChild( b );
		};

		const addEngines = window.gBrowser.selectedBrowser.engines;
		if ( addEngines && addEngines.length > 0 )
			addEngines.forEach( addEngineButton );

/*
      // Clear any addengine menuitems, including addengine-item entries and
      // the addengine-separator.  Work backward to avoid invalidating the
      // indexes as items are removed.
      var items = popup.childNodes;
      for (var i = items.length - 1; i >= 0; i--) {
        if (items[i].classList.contains("addengine-item") ||
            items[i].classList.contains("addengine-separator"))
          popup.removeChild(items[i]);
      }

      var addengines = gBrowser.selectedBrowser.engines;
      if (addengines && addengines.length > 0) {
        const kXULNS = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";

        // Find the (first) separator in the remaining menu, or the first item
        // if no separators are present.
        var insertLocation = popup.firstChild;
        while (insertLocation.nextSibling &&
               insertLocation.localName != "menuseparator") {
          insertLocation = insertLocation.nextSibling;
        }
        if (insertLocation.localName != "menuseparator")
          insertLocation = popup.firstChild;

        var separator = document.createElementNS(kXULNS, "menuseparator");
        separator.setAttribute("class", "addengine-separator");
        popup.insertBefore(separator, insertLocation);

        // Insert the "add this engine" items.
        for (var i = 0; i < addengines.length; i++) {
          var menuitem = document.createElement("menuitem");
          var engineInfo = addengines[i];
          var labelStr =
              this._stringBundle.getFormattedString("cmd_addFoundEngine",
                                                    [engineInfo.title]);
          menuitem = document.createElementNS(kXULNS, "menuitem");
          menuitem.setAttribute("class", "menuitem-iconic addengine-item");
          menuitem.setAttribute("label", labelStr);
          menuitem.setAttribute("tooltiptext", engineInfo.uri);
          menuitem.setAttribute("uri", engineInfo.uri);
          if (engineInfo.icon)
            this.setIcon(menuitem, engineInfo.icon);
          menuitem.setAttribute("title", engineInfo.title);
          popup.insertBefore(menuitem, insertLocation);
        }
*/

		// Adjust width & height:
		attrs( pv.engines, {
			height: px( 33 * Math.ceil( engines.length / maxCol ) ),
			width: px( 61 * maxCol )
		} );
	};

 	// Create the widget:
	CUI.createWidget( {
		id: ids.button,
		type: 'view',
		viewId: ids.view,
		defaultArea: CUI.AREA_NAVBAR,
		label: 'Search',
		tooltiptext: 'Search with providers.',
		onBeforeCreate: document => manager.register( updater ), // Register our manager.
		onViewShowing: event => {
			console.log( event );
			updater();
		},
		onViewHiding: event => {
			console.log( event );
		}
	} );
/*
	return;

	// Check if we already have the button, if so, skip:
	if ( byId( window, ID.searchButton ) ) return;

	// Figure out if theme is light or not:
	const titlebar = byId( window, 'titlebar' );
	const bg = window.getComputedStyle( titlebar ).getPropertyValue( '--chrome-background-color' );
	const light = getContrastYIQ( bg.substr( 1 ) ) ? '' : '_white';

	// Make button:
	return ui.ActionButton( {
		id:		'searchbutton',
		label:	'Search',
		icon:	['16', '32', '64'].reduce( (l, s) => { l[s] = `./search${light}${s}.png`; return l; }, {} ),
		onClick: partial( searchClick, window )
	} )
*/
};

// Handle the user preferences tabMinWidth & tabMaxWidth:s.
const tabWidthHandler = (saved, window) => {
	[['min', 'tabMinWidth'], ['max', 'tabMaxWidth']].forEach( e => {
		// Deatch current attached style modification if any.
		const detach = () => {
			if ( !nullOrUndefined( saved[e[1]] ) ) {
				detachFrom( saved[e[1]], window );
				saved[e[1]] = null;
			}
		};

		// Detach on unload.
		unloader( detach, window );

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
}

// Identity Label Handler:
const identityLabelRetracter = window => {
	// Get some resources:
	const windowModel = modelFor( window );
	const label = byId( window, "identity-icon-labels" );
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
const imposeMaxWidth = (window, navBar, urlContainer) => {
	const onResize = () => {
		const tb = byId( window, ID.tabs );
		const tbWidth = boundingWidth( tb );
		const tbReduce = tbWidth < 100 ? tbWidth : 100;

		let children = Array.from( navBar.childNodes );
		arrayRemove( children, urlContainer );
		arrayRemove( children, tb );

		let width = children.reduce( (a, v) => a - boundingWidth( v ), boundingWidth( navBar ) );
		urlContainer.style.maxWidth = px( width - tbReduce );
	};

	async( onResize, 100 );
	on( window, 'resize', onResize );
}

const makeLine = window => {
	const saved = {},
		{document, gBrowser, gURLBar} = window,
		unloader = unloaderBind( window ),
		CUI = window.CustomizableUI,
		id = byId( window );

	// Apply browser.css:
	saved.style = new Style( { uri: './browser.css' } );
	attachTo( saved.style, window );

	// Handle the user preferences tabMinWidth & tabMaxWidth:s.
	tabWidthHandler( saved, window );

	// create Search Button:
	const searchButton = makeSearchButton( window );

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
	backForward = backForward || {
		boxObject: {
			width: 0,
		},
		style: {},
	};

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
	onMulti( window.gURLBar, ['blur', 'focus'], updateLayout );

	// Clean up various changes when the add-on unloads:
	unloader( () => {
		// Remove our style:
		detachFrom( saved.style, window );

		// Destroy search button added:
		searchButton.destroy();

		// Restore search-bar if user hasn't manually moved it:
		if ( CUI.getPlacementOfWidget( ID.search ) === null ) {
			const urlbarPlacement = CUI.getPlacementOfWidget( ID.urlbar );
			CUI.addWidgetToArea( ID.search, urlbarPlacement.area, urlbarPlacement.position + 1 );
		}

		// Reverse: tabsBar the nextSibling of navBar:
		insertAfter( navBar, tabsBar );

		// Move stuff back to tabsBar:
		saved.origTabs.forEach( node => tabsBar.appendChild( node ) );

		backForward.style.marginRight = "";
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

// Plugin entry point:
const main = () => watchWindows( window => async( partial( makeLine, window ) ) );

main();

// Clean up with unloaders when we're deactivating:
require("sdk/system/unload").when( reason => unload() );