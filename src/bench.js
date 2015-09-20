"use strict";

const end = (window, id, start) => {
	const end = window.performance.now();
	console.log( "benchmark#" + id + " " + (end - start) + 'ms' );
}

const bench = ( window, id = '' ) => {
	const start = window.performance.now();
	return () => end( window, id, start );
};
exports.bench = bench;

const benchf = ( window, f, id = '' ) => {
	return () => {
		const start = window.performance.now();
		const r = f( ...arguments );
		end( window, id, start );
	}
};
exports.benchf = benchf;