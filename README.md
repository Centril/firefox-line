# [![Line, Firefox Addon/Extension][Logo]][Line, Firefox Addon/Extension]

[![License]][url: License] [![Semver]][url: Semver] [![Gittip]][url: Gittip] [![Download]][url: Download]

> Line is a rewrite of the **[Mozilla Labs: Prospector - oneLiner][oneLiner]** addon using the latest API.

## Screenshots

Here are some screenshots from the addon:

### Basic functionality

![Basic functionality](https://cdn.pbrd.co/images/ObnbwG4.png)

### Urlbar is focused, it has grown

![Urlbar is focused, it has grown](https://cdn.pbrd.co/images/ObfNuse.png)

### Using the search button and autodetecting a search engine

![Using the search button and autodetecting a search engine](https://cdn.pbrd.co/images/Obc2H3r.png)

### Options and urlbar to the right

![Options and urlbar to the right](https://cdn.pbrd.co/images/OaZ4BGf.png)

# Features

+ **Different modes** of how the `url-bar` behaves when you `focus` it or not:
	- **Fixed:** the `url-bar's` width does not change.
	- **Sliding:** the `url-bar's` width behaves as in the original **[oneLiner]**, growing when focused.
	- **Flexible:** the `url-bar's` width takes as much space as possible, when tabs are added the `url-bar's` available space reduces.
+ **Search button:** Replicates the search button behavior of the `search-bar` including search engines properly unlike **[oneLiner]**.
+ **Customizable width** of url-bar for when focused and when not focused.
+ **Customizable min/max-width** of tabs.
+ **Customizable: Identity label can retract/slide-back** when `url-bar` is `focused` and then return to normal when it is not. This provides more space to write the URL. An icon is still left so that you can see if it is a secure connection or not. You can disable this feature if you like.

## Fixes

Compared to **[oneLiner]** it fixes a few things:

+ _Titlebar buttons do not overflow anymore._
+ _The search button can be moved or removed._

## Installation & Building

### Requirements

+ `Firefox 38+`

### [From AMO (Mozilla Addons)](https://addons.mozilla.org/en-US/firefox/addon/line-1/)

Note: Not yet signed, pre-release!

### From Github [![Download]][url: Download]

### Manually, from repository

First clone the repository to your local machine:

```shell
git clone https://github.com/Centril/firefox-line && cd firefox-line
```

Since this is written with the **[Addon SDK]**, you will need to use **[`jpm`]**.

If you haven't installed it before, simply do (you might need to run this with `sudo`):

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

## Copyright & License

Licensed under the **[GPL 2 License]**.
Copyright 2015 Mazdak Farrokhzad for the modified parts.
Copyright Mozilla foundation for the original addon.

**Note:** The project is **NOT** licensed under `MPL 1.1` or `MPL 2`, only `GPL 2+`.

## Bugs | Issues | Feature requests | Contribution

Want to contribute? Great stuff! Please use the issue system that github provides to report bugs/issues or request an enhancement. Pull requests are also more than welcome.

## Author

**Mazdak Farrokhzad / Centril [&lt;twingoow@gmail.com&gt;]**

[![twitter][twitter_image]][twitter] [![github][github_image]][github] [![facebook][facebook_image]][facebook]

## Acknowledgements

This addon was based on **[oneLiner]** by **[Mozilla Labs]**
but by now it is rewritten from scratch.

Many thanks to **[@Noidart]** and **[@freaktechnik]** for help with the APIs
and advice on addon development.

<!-- references -->

[Gittip]: http://img.shields.io/gittip/Centril.svg?style=flat
[url: Gittip]: https://www.gittip.com/Centril/
[License]: http://img.shields.io/badge/license-GPL_2+-blue.svg?style=flat
[url: License]: LICENSE.md
[Semver]: http://img.shields.io/badge/semver-2.0.0-blue.svg?style=flat
[url: Semver]: http://semver.org/spec/v2.0.0.html
[Download]: https://img.shields.io/badge/Download_XPI-1.0.0--pre-ff69b4.svg?style=flat
[url: Download]: https://github.com/Centril/firefox-line/releases/tag/1.0.0-pre

[Logo]: https://raw.githubusercontent.com/Centril/firefox-line/master/art/logo.png
[Line, Firefox Addon/Extension]: https://github.com/Centril/firefox-line

[oneLiner]: https://github.com/mozilla/prospector/tree/master/oneLiner
[Addon SDK]: https://developer.mozilla.org/en-US/Add-ons/SDK
[`jpm`]: https://developer.mozilla.org/en-US/Add-ons/SDK/Tools/jpm#Installation

[twitter]: http://twitter.com/CenoRIX
[twitter_image]: http://cdn.flaticon.com/png/128/8800.png
[github]: https://github.com/centril
[github_image]: http://cdn.flaticon.com/png/128/25231.png
[facebook]: https://www.facebook.com/Centril
[facebook_image]: http://cdn.flaticon.com/png/128/33702.png
[&lt;twingoow@gmail.com&gt;]: mailto:twingoow@gmail.com

[CHANGES.md]: CHANGES.md
[GPL 2 License]: LICENSE.md

[Mozilla Labs]: https://mozillalabs.com/en-US/
[@Noidart]: https://github.com/Noitidart
[@freaktechnik]: https://github.com/freaktechnik

<!-- references -->