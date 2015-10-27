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

// Define all IDs used in addon:
exports.ID = {
	urlContainer:	'urlbar-container',
	navBar:			'nav-bar',
	navBarTarget: 	'nav-bar-customization-target',
	overflow:		'nav-bar-overflow-button',
	tabsBar:		'TabsToolbar',
	tabs:			'tabbrowser-tabs',
	newTabs:		'new-tab-button',
	allTabs:		'alltabs-button',
	backCmd: 		'Browser:Back',
	forwardCmd:		'Browser:Forward',
	backForward:	'unified-back-forward-button',
	idLabel:		'identity-icon-labels',
	search:			'search-container',
	newSearch: {
		button:		'firefox-line-search-button',
		view:		'firefox-line-search-view',
		attachTo:	'PanelUI-multiView'
	}
};