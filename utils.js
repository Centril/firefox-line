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

const events		= require('sdk/dom/events'),
	  window_utils	= require('sdk/window/utils'),
	  windows		= require('sdk/windows').browserWindows,
	  {viewFor}		= require("sdk/view/core"),
	  {partial, curry, compose} = require('sdk/lang/functional'),
	  {isNull, isUndefined, isFunction}	= require('sdk/lang/type');

const noop = () => {};
exports.noop = noop;

const isWindow = window => !isUndefined( window.window ) && !isUndefined( window.window.window );

const domWindow = element => isWindow( element ) ? element : element.ownerDocument.defaultView;
exports.domWindow = domWindow;

/**
 * Returns all the open normal (navigator:browser) windows (chrome mode).
 *
 * @return Array Array of all open windows.
 */
const getAllWindows = () => window_utils.windows( 'navigator:browser', {includePrivate: true} );
exports.getAllWindows = getAllWindows;

const nullOrUndefined = v => isNull( v ) || isUndefined( v );
exports.nullOrUndefined = nullOrUndefined;

const unloader = (() => {
	let unloaders = [];

	return {
		register: ( callback, container ) => {
			// Wrap the callback in a function that ignores failures
			const cb = () => {
				try {
					callback();
				}
				catch( ex ) {}
			}

			// Provide a way to remove the unloader
			const removeUnloader = () => {
				const index = unloaders.indexOf( cb );
				if ( index !== -1 )
					unloaders.splice( index, 1 );
			}

			if ( !nullOrUndefined( container ) ) {
				// Remove the unloader when the container unloads
				events.on( container, 'unload', removeUnloader );

				// Wrap the callback to additionally remove the unload listener
				let origCallback = callback;
				callback = () => {
					events.removeListener( container, "unload", removeUnloader );
					origCallback();
				}
			}

			unloaders.push( cb );
			return removeUnloader;
		},
		runAll: () => {
			unloaders.forEach( cb => cb() );
			unloaders = [];
		},
	}
})();
exports.unload = unloader.runAll;
exports.unloader = unloader.register;
exports.unloaderBind = component => callback => unloader.register( callback, component );

// Replace a value with another value or a function of the original value
const change = (window, obj, prop, val) => {
	let orig = obj[prop];
	obj[prop] = isFunction( val ) ? val( orig ) : val;
	unloader.register( () => obj[prop] = orig, window );
}
exports.change = change;

const undoListener = (element, type, listener, capture ) => {
	const undoListen = () => events.removeListener( element, type, listener, capture );
	const undoUnload = partial( unloader.register, undoListen, domWindow( element ) );
	return () => {
		undoListen();
		undoUnload();
	}
}

const on = (element, type, listener, capture = false) => {
	events.on( element, type, listener, capture );
	return undoListener( element, type, listener, capture );
}
exports.on = on;

const once = (element, type, listener, capture = false) => {
	events.once( element, type, listener, capture );
	return undoListener( element, type, listener, capture );
}
exports.once = once;

const onMulti = (element, types, listener, capture = false) => {
	return types.map( type => on( element, type, listener ) );
}
exports.onMulti = onMulti;

/**
 * Apply a callback to each open and new browser windows.
 *
 * @usage watchWindows(callback): Apply a callback to each browser window.
 * @param [function] callback: 1-parameter function that gets a browser window.
 */
const watchWindows = callback => {
	// Change: Not running on load, no need.
	// Add functionality to existing windows
	getAllWindows().forEach( callback );

	// Watch for new browser windows opening then wait for it to load:
	const listener = window => callback( viewFor( window ) );
	windows.on( 'open', listener );
	unloader.register( () => windows.off( 'open', listener ) );
}
exports.watchWindows = watchWindows;

const boundingWidth = element => element.getBoundingClientRect().width;
exports.boundingWidth = boundingWidth;

const px = element => element + 'px';
exports.px = px;

const boundingWidthPx = compose( px, boundingWidth );
exports.boundingWidthPx = boundingWidthPx;

const setWidth = curry( (element, width) => element.style.width = width );
exports.setWidth = setWidth;