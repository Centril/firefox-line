[![License]][url: License] [![Semver]][url: Semver] [![Gittip]][url: Gittip]

# [Line, Firefox Addon/Extension]

> Line is a rewrite of **[Mozilla Labs: Prospector - Oneliner]** addon/extension.

**It solves a few graphical bugs such as:**
+ _Titlebar buttons overflow._
+ _Inability to remove/move the added search button._

**It also adds these features:**
+ The different modes of how the url-bar behaves when you focus/not it... 
	- **Fixed: the url-bar's width does not change.**
	- **Sliding: the url-bar's width behaves as in the original Oneliner.**
	- **Flexible: the url-bar's width takes as much space as possible, when tabs are added the url-bar's available space reduces.**
+ Fully customizable widths for when focused/not.
+ The identity label can retract/slide-back when url-bar is focused and then return to normal when it is not. This provides more space to write for the URL you're about to write. An icon is still left so that you can see if it is a secure connection or not. You can disable this feature if you like.

## Requirements

+ `Firefox 38+`

## Installation & Building

First clone the repository to your local machine:

```shell
git clone https://github.com/Centril/firefox-line && cd firefox-line
```

Since this is written with the **[Addon SDK]**, you will need to use **[`jpm`]**.

If you haven't installed it before, simply do (you might need to run this with sudo):

```shell
npm install jpm -g
```

To test out the addon, try:

```shell
jpm run
```

If you want to package it as an `.xpi`, do:

```shell
jpm xpi
```

## Changelog

See **[CHANGES.md]**.

## Bugs / Issues / Feature requests / Contribution

Want to contribute? Great stuff! Please use the issue system that github provides to report bugs/issues or request an enhancement. Pull requests are also more than welcome.

## Author

**Mazdak Farrokhzad / Centril [&lt;twingoow@gmail.com&gt;]**

+ [twitter]
+ [github]

## Copyright & License

Licensed under the **[GPL 2 License]**.
Copyright 2015 Mazdak Farrokhzad for the modified parts.
Copyright Mozilla foundation for the original addon.

**Note:** The project is **NOT** licensed under MPL 1.1 or MPL 2, only GPL 2.

## Acknowledgements

This addon was based on **[Mozilla Labs: Prospector - Oneliner]** by [Mozilla Labs].

<!-- references -->

[Gittip]: http://img.shields.io/gittip/Centril.svg?style=flat
[url: Gittip]: https://www.gittip.com/Centril/
[License]: http://img.shields.io/badge/license-GPL_2-blue.svg?style=flat
[url: License]: LICENSE.md
[Semver]: http://img.shields.io/badge/semver-2.0.0-blue.svg?style=flat
[url: Semver]: http://semver.org/spec/v2.0.0.html

[Line, Firefox Addon/Extension]: https://github.com/Centril/firefox-line
[Mozilla Labs: Prospector - Oneliner]: https://github.com/mozilla/prospector/tree/master/oneLiner
[Addon SDK]: https://developer.mozilla.org/en-US/Add-ons/SDK
[`jpm`]: https://developer.mozilla.org/en-US/Add-ons/SDK/Tools/jpm#Installation

[twitter]: http://twitter.com/CenoRIX
[github]: http://github.com/centril
[&lt;twingoow@gmail.com&gt;]: mailto:twingoow@gmail.com

[CHANGES.md]: CHANGES.md
[GPL 2 License]: LICENSE.md

[Mozilla Labs]: https://mozillalabs.com/en-US/

<!-- references -->