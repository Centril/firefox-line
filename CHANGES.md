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