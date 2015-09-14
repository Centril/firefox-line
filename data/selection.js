"use strict";

const __safeGetRange = (selection, rangeNumber) => {
	try {
		let { rangeCount } = selection,
			range = null;
		rangeCount = rangeNumber + 1;

		for ( ; rangeNumber < rangeCount; rangeNumber++ ) {
			range = selection.getRangeAt( rangeNumber );
			if ( range && range.toString() ) break;
			range = null;
		}

		return range;
	} catch ( e ) {
		return null;
	}
};

const __getElementWithSelection = () => {
	try {
		const element = document.activeElement;
		const { value, selectionStart: ss, selectionEnd: se } = element;
		const hasSelection = typeof value === "string" && !isNaN( ss ) && !isNaN( se ) && ss !== se;
		return hasSelection ? element : null;
	} catch ( err ) {
		return null;
	}
};

const __getSelection = () => {
	try {
		const selection = window.getSelection();

	    const range = __safeGetRange( selection, 0 );
	    if ( range ) return range.toString();

	    const node = __getElementWithSelection();
	    if ( !node ) return null;

		return node.value.substring( node.selectionStart, node.selectionEnd );
	} catch ( e ) {
		return null;
	}
};

self.port.on( 'firefox-line-selection-wanted', message => 
	self.port.emit( 'firefox-line-selection-received', __getSelection() ) );