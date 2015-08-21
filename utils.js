'use strict';

const events		= require('sdk/dom/events'),
	  window_utils	= require('sdk/window/utils'),
	  windows		= require('sdk/windows').browserWindows,
	  {viewFor}		= require("sdk/view/core"),
	  {partial, curry, compose} = require('sdk/lang/functional'),
	  {isNull, isUndefined, isFunction}	= require('sdk/lang/type');

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

const on = (element, type, listener, capture = false) => {
	events.on( element, type, listener, capture );
	const undoListen = () => events.removeListener( element, type, listener, capture );
	const undoUnload = partial( unloader.register, undoListen, domWindow( element ) );
	return () => {
		undoListen();
		undoUnload();
	}
}
exports.on = on;

const once = (element, type, listener, capture = false) => {
	events.once( element, type, listener, capture );
	const undoListen = () => events.removeListener( element, type, listener, capture );
	const undoUnload = partial( unloader.register, undoListen, domWindow( element ) );
	return () => {
		undoListen();
		undoUnload();
	}
}
exports.once = once;

/**
 * Apply a callback to each open and new browser windows.
 *
 * @usage watchWindows(callback): Apply a callback to each browser window.
 * @param [function] callback: 1-parameter function that gets a browser window.
 */
const watchWindows = callback => {
	// Wait for the window to finish loading before running the callback
	const runOnLoad = window => once( window, 'load', () => callback( window ) );

	// Add functionality to existing windows
	getAllWindows().forEach( window => (window.document.readyState === "complete" ? callback : runOnLoad)( window ) );

	// Watch for new browser windows opening then wait for it to load
	windows.on( 'open', window => runOnLoad( viewFor( window ) ) );
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