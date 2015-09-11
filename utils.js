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

/**
 * If v is function, call it with rest of parameters,
 * otherwise: use v.
 *
 * @param  {*|function}  v     A value, or a function.
 * @param  {...*}        args  Any other arguments.
 * @return {*}           v or v(...args).
 */
const voc = (v, ...args) => isFunction( v ) ? v( v, ...args ) : v;
exports.voc = voc;

/**
 * A function that takes nothing and does nothing.
 */
const noop = () => {};
exports.noop = noop;

/**
 * Returns true if the given object is a Window.
 *
 * @param  {*}    window  The object to test.
 * @return {bool}         True if the given object is a window.
 */
const isWindow = window => !isUndefined( window.window ) && !isUndefined( window.window.window );
exports.isWindow = isWindow;

/**
 * Returns the window object from a given Element belonging to that window.
 * It returns itself if the object passed was a Window.
 *
 * @param  {Element|Window}  element  The element to get window of, or a window.
 * @return {Window}                   The window of the element or itself if a window was passed.
 */
const domWindow = element => isWindow( element ) ? element : element.ownerDocument.defaultView;
exports.domWindow = domWindow;

/**
 * Returns all the open normal (navigator:browser) windows (chrome mode).
 *
 * @return {Window[]}  Array of all open windows.
 */
const getAllWindows = () => window_utils.windows( 'navigator:browser', {includePrivate: true} );
exports.getAllWindows = getAllWindows;

/**
 * Returns true if the value v is either null or undefined.
 *
 * @param  {*}  v     The value.
 * @return {bool}     True if either null or undefined.
 */
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

/**
 * Calls all unloaders and removes them after.
 */
exports.unload = unloader.runAll;

/**
 * Registers an unloader running callback and optionally a container that when unloaded will unregister the unloader.
 *
 * @param {function}        callback     The callback to run on unload.
 * @param {Element|Window}  [container]  An optional container which when unloader will deregister the unloader.
 */
exports.unloader = unloader.register;

/**
 * Returns an unloader function where the second argument (component) is bound.
 * In other words, partial application from the right in functional terms of the function unloader.
 *
 * @param  {component}  component  The component to partially apply from the right.
 * @return {function}              The partially applied unloader function.
 */
exports.unloaderBind = component => callback => unloader.register( callback, component );

/**
 * Replace a value of a property with another value or a function of the original value.
 * On unload, the change is reversed.
 *
 * @param  {Window} window A DOM Window.
 * @param  {Object} obj    The object to change property on.
 * @param  {string} prop   The property to change value of.
 * @param  {*}      val    The value to set.
 */
const change = (window, obj, prop, val) => {
	let orig = obj[prop];
	obj[prop] = voc( val, orig );
	unloader.register( () => obj[prop] = orig, window );
}
exports.change = change;

const undoListener = (element, type, listener, capture) => {
	const undoListen = () => events.removeListener( element, type, listener, capture );
	const undoUnload = partial( unloader.register, undoListen, domWindow( element ) );
	return () => {
		undoListen();
		undoUnload();
	}
}

/**
 * Registers listener on element on type events.
 * Automatically removed on unload.
 *
 * @param  {Element}  element  The DOM Element to listen for events on.
 * @param  {string}   type     The type of event to listen on.
 * @param  {function} listener The listener (callback) to register.
 * @param  {Boolean}  capture  Bubbling related, see addEventListener. Default value: false.
 * @return {function}          A function that undoes the registration.
 */
const on = (element, type, listener, capture = false) => {
	events.on( element, type, listener, capture );
	return undoListener( element, type, listener, capture );
}
exports.on = on;

/**
 * Registers listener on element on type events.
 * This listener is only called once.
 * Automatically removed on unload.
 *
 * @param  {Element}  element  The DOM Element to listen for events on.
 * @param  {string}   type     The type of event to listen on.
 * @param  {function} listener The listener (callback) to register.
 * @param  {Boolean}  capture  Bubbling related, see addEventListener. Default value: false.
 * @return {function}          A function that undoes the registration.
 */
const once = (element, type, listener, capture = false) => {
	events.once( element, type, listener, capture );
	return undoListener( element, type, listener, capture );
}
exports.once = once;

/**
 * Registers listener on element on type events.
 * This registers the listener on multiple event types.
 * Automatically removed on unload.
 *
 * @param  {Element}  element  The DOM Element to listen for events on.
 * @param  {string[]} type     The type of events to listen on.
 * @param  {function} listener The listener (callback) to register.
 * @param  {Boolean}  capture  Bubbling related, see addEventListener. Default value: false.
 * @return {function}          A function that undoes the registration.
 */
const onMulti = (element, types, listener, capture = false) => {
	return types.map( type => on( element, type, listener ) );
}
exports.onMulti = onMulti;

/**
 * Apply a callback to each open and new browser windows.
 *
 * @usage watchWindows( callback ): Apply a callback to each browser window.
 * @param {function} callback: 1-parameter function that gets a browser window.
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

/**
 * Computes the bounding width of an element.
 *
 * @param {Element} element The element.
 * @return {string} The bounding width.
 */
const boundingWidth = element => element.getBoundingClientRect().width;
exports.boundingWidth = boundingWidth;

/**
 * Adds px unit to a value.
 *
 * @param  {string} v The value.
 * @return {string} The value with px added to it.
 */
const px = v => v + 'px';
exports.px = px;

/**
 * Computes the bounding width of an element and adds px unit to it.
 *
 * @param {Element}   element  The element.
 * @return {string}            The bounding width + px unit.
 */
const boundingWidthPx = compose( px, boundingWidth );
exports.boundingWidthPx = boundingWidthPx;

/**
 * Sets the width of an element.
 * The function is curried by default.
 *
 * @param  {Element}   element  The element to set width of.
 * @param  {string}    width    The width to set on element.
 */
const setWidth = curry( (element, width) => element.style.width = width );
exports.setWidth = setWidth;

/**
 * Inserts a DOM Element after the given reference Element, or at the end if reference Element is null.
 *
 * @param  {ELement}       element    The element to insert.
 * @param  {Element|null}  ref        The reference to insert element after.
 */
const insertAfter = (element, ref) => ref.parentNode.insertBefore( element, ref.nextSibling );
exports.insertAfter = insertAfter;

/**
 * Curried shortcut for getElementById.
 *
 * @param  {Window}	 window   The Window DOM object.
 * @param  {string}  id       The unique ID of the DOM Element.
 * @return 					  The DOM element that has the unique ID.
 */
const byId = curry( (window, id) => window.document.getElementById( id ) );
exports.byId = byId;

/**
 * For each of object {K, V} obj.method( K, V ).
 * If V is a function, it will be replaced with call:
 * V( k, obj ).
 *
 * @param  {string} method     Name of a function that exists on obj.
 * @param  {Object} obj        An object to call method on.
 * @param  {Object} props      An object to map each K, V pair, and do... see above.
 */
const methodKV = curry( (method, obj, props) => {
	Object.keys( props ).forEach( k => obj[method]( k, voc( props[k], k, obj ) ) );
	return obj;
} );
exports.methodKV = methodKV;

exports.attrs = methodKV( 'setAttribute' );

/**
 * Removes all the children of elem.
 *
 * @param  {Element}  elem  The node to remove children of.
 */
const removeChildren = elem => { while ( elem.firstChild ) elem.firstChild.remove() };
exports.removeChildren = removeChildren;