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
"use strict";

/*
 * Heavily refactored from: chrome://browser/content/search/search.xml
 * XBL is extremely unreadable, verbose, so we're not using it.
 */

// Import SDK:
const {partial} = require( 'sdk/lang/functional' );

const enginesManager = (window) => {
	// The services we are using: (nsIObserverService, nsIBrowserSearchService)
	const	{ Services: { obs, search }, Components: { utils: {reportError}, isSuccessCode} } = window;

	let _engines, observer, registered = false;

	/*
	 * There are two seaprate lists of search engines, whose uses intersect
	 * in this file. The search service (nsIBrowserSearchService and
	 * nsSearchService.js) maintains a list of Engine objects which is used to
	 * populate the list of available engines and to perform queries.
	 * That list is accessed here via getEngines(), and it's that sort of
	 * Engine that is passed to the observer as aEngine.
	 *
	 * In addition, browser.js fills two lists of autodetected search engines
	 * (browser.engines and browser.hiddenEngines) as properties of
	 * mCurrentBrowser.  Those lists contain unnamed JS objects of the form
	 * { uri:, title:, icon: }, and that's what we use to determine
	 * whether to show any "Add <EngineName>" menu items in the drop-down.
	 *
	 * The two types of engines are currently related by their identifying
	 * titles (the Engine object's 'name'), although that may change; see bug
	 * 335102.
	 */
	const moveEngine = (push, splice, engine) => window.gBrowser.browsers.forEach( browser => {
		let bsplice = browser[splice], bpush = browser[push];
		if ( bsplice ) {
			// XXX This will need to be changed when engines are identified by
			// URL rather than title; see bug 335102.
			const removeTitle = engine.wrappedJSObject.name;
			for ( let i = 0; i < bsplice.length; i++ ) {
				const eng = bsplice[i];
				if ( eng.title === removeTitle ) {
					if ( !bpush )
						bpush = browser[push] = [];

					bpush.push( eng );
					bsplice.splice( i, 1 );
					break;
				}
			}
		}
	} );

	// Setup our observer:
	const noop = () => {};
	const OBSERVE_TOPIC =  'browser-search-engine-modified';
	const observeVerbs = {
	    /*
		 * If the engine that was just removed from the searchbox list was
		 * autodetected on this page, move it to each browser's active list so it
		 * will be offered to be added again.
	     */
		'engine-removed':	partial( moveEngine, 'hiddenEngines', 'push' ),	// offerNewEngine
		/*
		 * If the engine that was just added to the searchbox list was
		 * autodetected on this page, move it to each browser's hidden list so it is
		 * no longer offered to be added.
		 */
		'engine-added':		partial( moveEngine, 'push', 'hiddenEngines' ),	// hideNewEngine
		/*
		 * The current engine was changed.  Rebuilding the menu appears to
		 * confuse its idea of whether it should be open when it's just
		 * been clicked, so we force it to close now.
		 */
		'engine-current':	noop,
		/*
		 * An engine was removed (or hidden) or added, or an icon was changed.  Do nothing special.
		 */
		'engine-changed':	noop,
	};
	const observe = (updater, engine, topic, verb) => {
		if ( topic === OBSERVE_TOPIC ) {
			// Handle verb:
			observeVerbs[verb]( engine );

            // Invalidate engine list:
            _engines = null;

            // Emit event to update:
            updater( verb );
		}
	};

	return {
		register: updater => {
			if ( registered ) return;

			// Register our observer.
			obs.addObserver( observer = { observe: partial( observe, updater ) }, OBSERVE_TOPIC, false );

			// Make sure nsIBrowserSearchService is initialized:
			search.init( status => {
				if ( !(status & 0x80000000 === 0) ) updater( 'init') // isSuccessCode doesn't seem to work.
				else reportError( 'Cannot initialize search service, bailing out: ' + status );
			} );
		},
		unregister: () => {
			// Stop observing.
			if ( registered ) obs.removeObserver( observer, OBSERVE_TOPIC );
		},
		byName: name => search.getEngineByName( name ),
		get engines () { return _engines || (_engines = search.getVisibleEngines()) },
		get currentEngine() { return search.currentEngine || { name: "", uri: null } },
		set currentEngine( engine ) { return (search.defaultEngine = search.currentEngine = engine) }
	};
};
exports.enginesManager = enginesManager;