"use strict";

const abc = () => {

};

self.port.on( 'firefox-line-autodetect-received', message => {

	self.port.emit( 'firefox-line-autodetect-response', {

	} );
} );