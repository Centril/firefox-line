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

const MAX_ADD_ENGINES = 5;

// Import utils, ids, SDK:
const { sdks, requireJSM, CUI, widgetMove, isNone,
		byId, removeChildren, attrs, appendChildren, on, px, } = require('./utils');
const { ID } = require( './ids' );
const [ {data}, {get: _}, prefs, tabs, clip, {when: unloader}, {isUndefined} ] = sdks(
	['self', 'l10n', 'preferences/service', 'tabs', 'clipboard', 'system/unload', 'lang/type'] );

// Get strings, search, mm:
const { Services: { strings, search, mm } } = requireJSM( 'gre/modules/Services' );

const docFrom = event => event.target.ownerDocument;

const enginesManager = () => {
	// The services we are using: (nsIObserverService, nsIBrowserSearchService)
	return {
		init( cb ) { search.init( status => {
			// Make sure nsIBrowserSearchService is initialized:
			if ( !(status & 0x80000000 === 0) ) cb( this );
			else console.error( 'Cannot initialize search service, bailing out: ' + status );
		} ) },
		byName: name => search.getEngineByName( name ),
		add: (uri, cb = null) => search.addEngine( uri, 1, '', false, cb ),
		remove: e => search.removeEngine( e ),
		get engines() { return search.getVisibleEngines() },
		get currentEngine() { return search.currentEngine || { name: '', uri: null } },
	};
};

// Holds panelview items for all windows.
let pv = {};

const _setupSearchButton = manager => {
	const ids = ID.newSearch,
		  trimIf = val => (val || '').trim(),
		  sb = strings.createBundle( 'chrome://browser/locale/search.properties' ),
		  // This used to be used in function make(), but AMO validator complained, so we oblige:
		  nsXUL = 'http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul';

	let addEngineStack = [];
	const addListener = msg => manager.add( msg.data.engine.href, { onSuccess( e ) {
		// When engines are defined on tab, temporarily add, remove and push to limited stack:
		manager.remove( e );
		if ( addEngineStack.some( ({uri, engine}) => e.name === engine.name ) ) return;
		addEngineStack.push( { uri: msg.data.engine.href, engine: e } );
		if ( addEngineStack.length > MAX_ADD_ENGINES ) addEngineStack.shift();
	} } );
	mm.addMessageListener( 'Link:AddSearch', addListener );

	const hidePanel = () => CUI.hidePanelForNode( pv.body );

	const engineCommand = event => {
		const { gURLBar: ub, whereToOpenLink, openUILinkIn,
				KeyboardEvent, MouseEvent} = docFrom( event ).defaultView;

		// Handle clicks on an engine, get engine first:
		const engine = manager.byName( event.target.getAttribute( 'engine' ) );

		const computeWhere = () => {
			// Where should we open link?
			const newTabPref = prefs.get( 'browser.search.openintab', true );
			if ( ( (event instanceof KeyboardEvent) && event.altKey) ^ newTabPref )
				return 'tab';
			else if ( (event instanceof MouseEvent) && (event.button === 1 || event.ctrlKey) )
				return 'tab-background';
			else
				return whereToOpenLink( event, false, true );
		};

		const open = (data) => {
			// Finally, make our search in the given tab.
			const submission = engine.getSubmission( data, null, 'searchbar' );
			const where = computeWhere();
			openUILinkIn( submission.uri.spec, where === 'tab-background' ? 'tab' : where, {
				postData: submission.postData,
				inBackground: where === 'tab-background'
			} );
			hidePanel();
		};

		// Get urlbar value if any:
		let val = trimIf( ub.value );
		if ( val.length === 0 ) {
			// Get selected text if any:
			const worker = tabs.activeTab.attach( { contentScriptFile: data.url( 'selection.js' ) } );
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

	const addCommand = ({target}) => {
		manager.add( addEngineStack.splice( parseInt( target.getAttribute( 'engine' ) ), 1 )[0].uri );
		hidePanel();
	}

	const updater = event => {
		const doc = docFrom( event );

		removeChildren( pv.engines );
		removeChildren( pv.add );

		// Get our engines, separate current and the rest:
		const curr = manager.currentEngine;
		const engines = [for (e of manager.engines) if ( e.identifier !== curr.identifier ) e];
		engines.unshift( curr );

		const image = engine => engine.iconURI.spec;
		const label = (engine, format) => sb.formatStringFromName( format, [engine.name], 1 );
		const slugRegxp = / /g;
		const slug = engine => engine.name.replace( slugRegxp, '-' );
		const button = (cmd, props) => {
			const b = attrs( doc.createElementNS( nsXUL, 'button' ), props );
			on( b, 'command', cmd, true );
			return b;
		};

		const inPanel = CUI.getPlacementOfWidget( ids.button ).area === CUI.AREA_PANEL;

		// Place out engines:
		const maxCol = inPanel ? 4 : engines.length % 3 === 0 ? 3 : engines.length >= 16 ? 4 : 2;
		appendChildren( pv.engines, engines.map( (engine, i, all) => {
			const s = [i === 0, (i + 1) % maxCol === 0,
				Math.ceil( (i + 1) / maxCol ) === Math.ceil( all.length / maxCol )];
			return button( engineCommand, {
				id: 'searchpanel-engine-one-off-item-' + slug( engine ),
				class: ['searchbar-engine-one-off-item']
					.concat( ['current', 'last-of-row', 'last-row'].filter( (c, i) => s[i] ) )
					.join( ' ' ),
				flex: '1',
				tooltiptext: label( engine, 'searchtip' ),
				label: engine.name,
				image: image( engine ),
				width: '59',
				engine: engine.name
			} );
		} ) );

		// Place out 'add-engines':
		appendChildren( pv.add, addEngineStack.slice().reverse().map( ({uri, engine}, i) => {
			const l = label( engine, 'cmd_addFoundEngine' );
			return button( addCommand, {
				id: 'searchbar-add-engine-' + slug( engine ),
				class: 'addengine-item',
				label: l,
				pack: 'start',
				crop: 'end',
				tooltiptext: l,
				title: engine.name,
				uri: uri,
				image: image( engine ),
				engine: addEngineStack.length - 1 - i
			} );
		} ) );

		// Adjust width & height:
		if ( inPanel ) {
			[pv.body, pv.engines, pv.add].forEach( v => {
				v.removeAttribute( 'width' );
				v.removeAttribute( 'style' );
			} );
			return;	
		}
		const width = px( 62 * maxCol );
		const height = 33 * Math.ceil( engines.length / maxCol );
		attrs( pv.engines, { height: px( height ) } );
		[pv.body, pv.engines, pv.add].forEach( v => {
			attrs( v, { width: width } );
			v.style.maxWidth = width;
		} );
	};

	const attach = doc => byId( isUndefined( doc.target ) ? doc : doc.target.ownerDocument,
		ids.attachTo ).appendChild( pv.panel );

	const create = doc => {
		pv = {
			panel:	attrs( doc.createElementNS( nsXUL, 'panelview' ), { 'id': ids.view, 'flex': '1' } ),
			body:	attrs( doc.createElementNS( nsXUL, 'vbox' ), { class: 'panel-subview-body' } ),
			label:	attrs( doc.createElementNS( nsXUL, 'label' ),
						{ class: 'panel-subview-header', value: 'Search with providers'} ),
			add:	attrs( doc.createElementNS( nsXUL, 'vbox' ), { class: 'search-add-engines' } ),
			engines: attrs( doc.createElementNS( nsXUL, 'description' ), { class: 'search-panel-one-offs'} ),
		};
		appendChildren( pv.panel, [pv.label, pv.body] );
		appendChildren( pv.body, [pv.engines, pv.add] );
		attach( doc );
	};

 	// Create the widget:
	const tryW = CUI.getWidget( ids.button );
	if (!(tryW && tryW.areaType)) {
		const widget = CUI.createWidget( {
			id: ids.button,
			type: 'view',
			viewId: ids.view,
			defaultArea: CUI.AREA_NAVBAR,
			label: _( 'search_button_label' ),
			tooltiptext: _( 'search_button_tooltiptext' ),
			onBeforeCreated: create,
			onViewShowing: updater,
			onClick: attach
		} );

		// Move button to after urlbar:
		widgetMove( widget.id, ID.urlContainer );
	}

	// Unloader: destroy widget & panel, remove addEngine listener:
	unloader( () => {
		CUI.destroyWidget( ids.button );
		if ( !isNone( pv.panel ) )	pv.panel.remove();
		mm.removeMessageListener( 'Link:AddSearch', addListener );
	} );
};

const setupSearchButton = () => enginesManager().init( _setupSearchButton );
exports.setupSearchButton = setupSearchButton;