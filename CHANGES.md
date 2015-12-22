# CHANELOG

## 1.0.0

+ Converted & rewritten from scratch to Addon SDK code.
+ **Feature:** **Customizable: Identity label can retract/slide-back** when `url-bar` is `focused` and then return to normal when it is not. This provides more space to write the URL. An icon is still left so that you can see if it is a secure connection or not. You can disable this feature if you like.
+ **Feature:** **Customizable width** of url-bar for when focused and when not focused.
+ **Feature:** **Customizable min/max-width** of tabs.
+ **Feature:** **Search button:** Replicates the search button behavior of the `search-bar` including search engines properly unlike **[oneLiner]**.
+ **Feature:** **Different modes** of how the `url-bar` behaves when you `focus` it or not:
	- **Fixed:** the `url-bar's` width does not change.
	- **Sliding:** the `url-bar's` width behaves as in the original **[oneLiner]**, growing when focused.
	- **Flexible:** the `url-bar's` width takes as much space as possible, when tabs are added the `url-bar's` available space reduces.
+ **Fixed:** graphical titlebar buttons overflow bugs.
+ **Fixed:** addon handles overflow correctly.
+ **Fixed:** inability to remove/move the added search button.

## 2.0.1

+ **Feature:** Opt-in **Drag button** for users that find it difficult to drag the window due to
the small spaces that are left, when many tabs are open, for dragging the window.
+ **Fixed:** Tab controls ordering & remembering start of tab controls, require('chrome') removed, search-engine.js doesn't depend on windows.
+ **Fixed:** #1, When visiting a site which provides an OpenSearch engine with a long title/name, it has graphical bugs as described in issue title.
+ **Fixed:**  Adding engines - now uses correct engine. 
+ **Fixed:** #2, Sometimes a the overflow button is left in AREA_NAVBAR even tho there is no overflow and the associated panel shows up empty.
+ **Fixed:** #3, Sometimes security/Identity label is retracted even tho it isn't supposed to be when urlbar doesn't have focus.
+ **Fixed:** #4, Security/Identity label is cropped when unretracted, i.e: when urlbar doesn't have focus (is blurred).
+ **Fixed:** #5, Pinned tabs, when many, causes whole tabs widget to go overflow when not fullscreen.
+ **Fixed:** Titlebar buttons have proper padding now.
+ **Fixed:** #6, FF45, png images replaced with svg.
+ **Fixed:** #7, FF45, sliding mode doesn't work due to #urlbar.focused.