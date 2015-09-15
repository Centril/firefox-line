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
	  globalPrefs				= require('sdk/preferences/service'),
	  sp						= require("sdk/simple-prefs"),
	  {Style}					= require("sdk/stylesheet/style"),
	  {modelFor}				= require('sdk/model/core'),
	  {partial}					= require('sdk/lang/functional'),
	  {remove: arrayRemove}		= require('sdk/util/array'),
	  {isNull, isUndefined}		= require('sdk/lang/type'),
	  {setTimeout: async}		= require('sdk/timers'),
	  {attachTo, detachFrom}	= require('sdk/content/mod');

const nsXUL = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";

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
	searchProviders: {
		button:		'firefox-line-search-button',
		view:		'firefox-line-search-view',
		attachTo:	'PanelUI-multiView'
	}
};



const currOpenSearch = '';
const tabs = require( 'sdk/tabs' );
tabs.on( 'activate', tab => {
	const worker = tab.attach( { contentScriptFile: self.data.url( 'autodetect.js' ) } );
	worker.port.emit( 'firefox-line-autodetect-received' );
	worker.port.on( 'firefox-line-autodetect-response', () => {
	} );
} );



const clip = require( 'sdk/clipboard' );
const tabs = require( 'sdk/tabs' );
const {enginesManager} = require( './search-engine.js' );
const setupSearchButton = window => {
	const {CustomizableUI: CUI, Components: { utils: cu }, Services: { strings }, document, whereToOpenLink, openUILinkIn} = window,
		  ids = ID.searchProviders,
		  manager = enginesManager( window ),
		  xul = elem => document.createElementNS( nsXUL, elem ),
		  trimIf = val => (val || "").trim(),
		  pu = cu.import( 'resource://gre/modules/PlacesUtils.jsm', {} ).PlacesUtils,
		  sb = strings.createBundle( 'chrome://browser/locale/search.properties' ),
		  ub = byId( window, ID.urlbarTB );

	// Construct our panelview:
	const pv = {
		panel:	attrs( xul( 'panelview' ), { id: ids.view, flex: '1' } ),
		body:	attrs( xul( 'vbox' ), { class: 'panel-subview-body' } ),
		label:	attrs( xul( 'label' ), { class: 'panel-subview-header', value: 'Search with providers' } ),
		engines: attrs( xul( 'description' ), { class: 'search-panel-one-offs' } ),
		add: xul( 'hbox' )
	};
	[pv.label, pv.body].forEach( elem => pv.panel.appendChild( elem ) );
	[pv.engines, pv.add].forEach( elem => pv.body.appendChild( elem ) );
	byId( window, ids.attachTo ).appendChild( pv.panel );

	const engineCommand = event => {
		// Handle clicks on an engine, get engine first:
		const engine = manager.byName( event.target.getAttribute( 'data-engine' ) );

		const computeWhere = () => {
			// Where should we open link?
			const newTabPref = globalPrefs.get( 'browser.search.openintab', true );
			if ( ( (event instanceof window.KeyboardEvent) && event.altKey) ^ newTabPref )
				return "tab";
			else if ( (event instanceof window.MouseEvent) && (event.button === 1 || event.ctrlKey) )
				return "tab-background";
			else
				return whereToOpenLink( event, false, true );
		};

		const open = (data) => {
			// Finally, make our search in the given tab.
			const submission = engine.getSubmission( data, null, "searchbar" );
			const where = computeWhere();
			openUILinkIn( submission.uri.spec, where === "tab-background" ? "tab" : where, {
				postData: submission.postData,
				inBackground: where === "tab-background"
			} );
		};

		// Get urlbar value if any:
		let val = trimIf( ub.value );
		if ( val.length === 0 ) {
			// Get selected text if any:
			const worker = tabs.activeTab.attach( { contentScriptFile: self.data.url( 'selection.js' ) } );
			worker.port.on( 'firefox-line-selection-received', response => {
				worker.destroy();

				let val = trimIf( response );

				// Get clipboard text if any:
				if ( val.length === 0 ) val = trimIf( clip.get( 'text' ) );

				open( val );
			} );
			worker.port.emit( 'firefox-line-selection-wanted', true );
		} else open( val );
	};

	const updater = () => {
		removeChildren( pv.engines );
		removeChildren( pv.add );

		// Get our engines, separate current and the rest:
		const curr = manager.currentEngine;
		const engines = [for (e of manager.engines) if ( e.identifier !== curr.identifier ) e];
		engines.unshift( curr );

		// Place out engines:
		const maxCol = engines.length % 3 === 0 ? 3 : engines.length >= 16 ? 4 : 2;
		engines.forEach( (engine, i, all) => {
			const s = [i === 0, (i + 1) % maxCol === 0,
				Math.ceil( (i + 1) / maxCol ) === Math.ceil( all.length / maxCol )];
			const b = attrs( xul( 'button' ), {
				id: 'searchpanel-engine-one-off-item-' + engine.name,
				class: ['searchbar-engine-one-off-item']
					.concat( ['current', 'last-of-row', 'last-row'].filter( (c, i) => s[i] ) )
					.join( ' ' ),
				flex: '1',
				tooltiptext: sb.formatStringFromName( 'searchtip', [engine.name], 1 ),
				label: engine.name,
				image: pu.getImageURLForResolution( window, engine.iconURI.spec ),
				width: "59",
				"data-engine": engine.name
			} );
			on( b, 'command', engineCommand, true );
			pv.engines.appendChild( b );
		} );

		// Place out "add":
		/*
		const addEngineButton = engine => {
			const b = attrs( xul( 'button' ), {
				id: 'searchbar-add-engine-' + engine.name,
				class: 'addengine-item',
				uri: engine.uri,
				tooltiptext: engine.uri,
				label: sb.formatStringFromName( "cmd_addFoundEngine", [engine.title], 1 ),
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
		*/

		// Adjust width & height:
		const width = px( 61 * maxCol );
		const height = 33 * Math.ceil( engines.length / maxCol );
		attrs( pv.engines, {
			height: px( height ),
			width: width
		} );
		pv.engines.style.maxWidth = width;

		// fix this for CUI PanelUI:
		//pv.panel.style.height = px( height * 2 );
	};

 	// Create the widget:
	CUI.createWidget( {
		id: ids.button,
		type: 'view',
		viewId: ids.view,
		defaultArea: CUI.AREA_NAVBAR,
		label: 'Search',
		tooltiptext: 'Search with providers.',
		onViewShowing: event => {
			if ( manager.isRegistered ) updater();
			else manager.register( updater )
		}
	} );

	// Make urlbar removable and move button to after urlbar:
	const e = [ids.button, ID.urlbar].map( i => attrs( byId( window, i ), { removable: 'true' } ) );
	insertAfter( e[0], e[1] );

	// Unloader: reverse removable, destroy the widget and the panel:
	unloader( () => {
		attrs( e[1], { removable: 'false' } );
		CUI.destroyWidget( ids.button );
		pv.panel.remove();
	} );
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