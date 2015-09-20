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

/**
 * Returns a list of SDKs.
 *
 * @param  {String[]}  list  A string list of sdks without "sdk/" path prefix.
 * @return {Object[]}        The SDKs.
 */
const sdks = list => list.map( v => require( 'sdk/' + v ) );
exports.sdks = sdks;

const [	events, window_utils, {browserWindows: windows}, {viewFor}, {when: unloader},
		{partial, curry, compose}, {isNull, isUndefined, isFunction}] = sdks( [
		'dom/events', 'window/utils', 'windows', 'view/core',
		'system/unload', 'lang/functional', 'lang/type'] );

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
 * Returns true if the value v is either null or undefined.
 *
 * @param  {*}  v     The value.
 * @return {bool}     True if either null or undefined.
 */
const nullOrUndefined = v => isNull( v ) || isUndefined( v );
exports.nullOrUndefined = nullOrUndefined;

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
	unloader( () => obj[prop] = orig );
}
exports.change = change;

const undoListener = (element, type, listener, capture) => {
	let use = false;
	const undo		= () => events.removeListener( element, type, listener, capture );
	const unload	= () => { if ( use ) undo(); use = false; };
	unloader( unload );
	return () => { undo(); unload(); };
};

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
const onMulti = (element, types, listener, capture = false) =>
	types.map( type => on( element, type, listener ) );
exports.onMulti = onMulti;

/**
 * Apply a callback to each open and new browser windows.
 *
 * @usage watchWindows( callback ): Apply a callback to each browser window.
 * @param {function} callback: 1-parameter function that gets a browser window.
 */
const watchWindows = callback => {
	// Add functionality to existing windows
	window_utils.windows( 'navigator:browser', {includePrivate: true} ).forEach( callback );

	// Watch for new browser windows opening:
	const listener = window => callback( viewFor( window ) );
	windows.on( 'open', listener );
	unloader( () => windows.off( 'open', listener ) );
}
exports.watchWindows = watchWindows;

/**
 * Adds px unit to a value.
 *
 * @param  {string} v The value.
 * @return {string} The value with px added to it.
 */
const px = v => v + 'px';
exports.px = px;

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
 * @param  {Window|Document}  window  The Window or Document object.
 * @param  {string}           id      The unique ID of the DOM Element.
 * @return 					          The DOM element that has the unique ID.
 */
const byId = curry( (window, id) => (isWindow( window ) ? window.document : window)
	.getElementById( id ) );
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
 * Sets the value of an attribute and returns the old value.
 *
 * @param  {string}   attr  The attribute name.
 * @param  {*}        val   The new attribute value.
 * @param  {Element}  elem  The element to set attribute on.
 * @return {*}              The old attribute value.
 */
const setAttr = (attr, val, elem) => {
	const old = elem.getAttribute( 'removable' );
	elem.setAttribute( 'removable', val );
	return old;
};
exports.setAttr = setAttr;

/**
 * Removes all the children of elem.
 *
 * @param  {Element}  elem  The node to remove children of.
 */
const removeChildren = elem => { while ( elem.firstChild ) elem.firstChild.remove() };
exports.removeChildren = removeChildren;

/**
 * Returns a function that does appendChild to parent.
 *
 * @param  {Element}  parent  The parent element.
 * @return {function}         The function.
 */
const appendChild = parent => parent.appendChild.bind( parent );
exports.appendChild = appendChild;

/**
 * Moves CustomizableUI widget with id,
 * relMove positions next to widget with relId.
 *
 * @param  {CustomizableUI}  CUI      The CustomizableUI.
 * @param  {string}          id       The id of the widget to move.
 * @param  {string}          relId    The id of the widget to move relative to.
 * @param  {Number}          relMove  The number of steps to move, default: 0.
 */
const moveWidget = (CUI, id, relId, relMove = 1 ) => 
	CUI.moveWidgetWithinArea( id, Math.max( 0, CUI.getPlacementOfWidget( relId ).position + relMove ) );
exports.moveWidget = moveWidget;

/**
 * Executes fn with args and then returns fn.
 *
 * @param  {Function}  fn    The function to execute & return.
 * @param  {...*}      args  The arguments to execute fn with.
 * @return {Function}        The function fn.
 */
const exec = (fn, ...args) => { fn( ...args ); return fn; };
exports.exec = exec;

/**
 * Computes the real width of an element including margins.
 *
 * @param  {Element}  e  The element to get width of.
 * @return {Number}      The computed width.
 */
const realWidth = e => {
	const style = e.currentStyle || domWindow( e ).getComputedStyle( e );
	return e.boxObject.width + parseFloat( style.marginLeft ) + parseFloat( style.marginRight );
}
exports.realWidth = realWidth;

/**
 * Appends array of DOM elements in arr to parent.
 * Returns the passed array.
 *
 * @param  {Element}    parent The element to append children to.
 * @param  {Element[]}  arr    The elements to append.
 * @return {Element[]}         The elements to append.
 */
const appendChildren = (parent, arr) => {
	const doc = parent.ownerDocument;
	const frag = doc.createDocumentFragment();
	arr.forEach( e => frag.appendChild( e ) );
	parent.appendChild( frag );
	return arr;
};
exports.appendChildren = appendChildren;

const nsXUL = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";
/**
 * Creates a xul namespaced element.
 *
 * @param  {Document}  document The document.
 * @param  {string}    elem     The string tag.
 * @return {Element}            The created element.
 */
const xul = (document, elem) => document.createElementNS( nsXUL, elem );
exports.xul = xul;

/**
 * Returns a generator expression for an object returning [K, V] for each iteration.
 *
 * @param  {Object}     obj  The object to iterate.
 * @return {Generator}       The expression.
 */
const entries = obj => (for (key of Object.keys( obj )) [key, obj[key]]);
exports.entries = entries;