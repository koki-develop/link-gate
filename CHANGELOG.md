# Changelog

## [0.1.2](https://github.com/koki-develop/link-gate/compare/v0.1.1...v0.1.2) (2026-02-20)


### Bug Fixes

* remove overly broad host permissions from manifest ([97089c8](https://github.com/koki-develop/link-gate/commit/97089c8d5c9a6c9a5ea8434f6946be288ca0e352))

## [0.1.1](https://github.com/koki-develop/link-gate/compare/v0.1.0...v0.1.1) (2026-02-20)


### Bug Fixes

* Replace DOM tracking attribute with WeakSet to avoid SPA reload issues ([32aa2bc](https://github.com/koki-develop/link-gate/commit/32aa2bc068ca656f2af0979a4ec6218f38300beb))

## 0.1.0 (2026-02-19)


### Features

* Add per-domain allow list to bypass link preview dialog ([79b3514](https://github.com/koki-develop/link-gate/commit/79b3514726b919350a03520d835cc06d0f1e9536))
* Add popup page for managing allowed domains ([aeaf52a](https://github.com/koki-develop/link-gate/commit/aeaf52a276dc62e6eb25db42669913a8039ddf73))
* Implement link interception and preview confirmation ([652ea21](https://github.com/koki-develop/link-gate/commit/652ea21a328479d6d47e454d80b0ae7fbd8c054a))
* Release v0.1.0 ([1198e55](https://github.com/koki-develop/link-gate/commit/1198e552933ac4a6d5de0522e0fae6108fff4be2))
* Replace tab-based preview with in-page CSUI dialog ([44d3687](https://github.com/koki-develop/link-gate/commit/44d368745215a2e58cd521ec3f6f208624fc48f8))


### Bug Fixes

* Account for &lt;base&gt; element in external link detection ([3b211bc](https://github.com/koki-develop/link-gate/commit/3b211bc048c67d5cde5d65467e5771de84f5cce9))
* Add error handling for storage load failures in popup operations ([ad610ad](https://github.com/koki-develop/link-gate/commit/ad610add24ca4f68687425b8fe7bbd4d43229247))
* add noopener,noreferrer to fallback window.open for tabnapping prevention ([5ea2be2](https://github.com/koki-develop/link-gate/commit/5ea2be2cefd45a896fd726ae8e50b7c1f37a73cb))
* Allow dialog to scroll on small viewports ([af516fa](https://github.com/koki-develop/link-gate/commit/af516fa22ca0235a93b858146a776458382c41ab))
* Fall back to direct navigation when background relay fails ([5fa50a6](https://github.com/koki-develop/link-gate/commit/5fa50a6d9922edbfbc1ad82829931346b0ed8769))
* Preserve anchor target attribute for correct iframe navigation ([70c6803](https://github.com/koki-develop/link-gate/commit/70c6803fdfd9e47789523a6e36c4236afb5e4490))
* Preserve original body overflow style on dialog close ([4e826e8](https://github.com/koki-develop/link-gate/commit/4e826e8d8624b261deed5c79bed4f2e3e197028b))
* prevent event listener accumulation on href changes ([ba29503](https://github.com/koki-develop/link-gate/commit/ba295030f965d320862fc9db6e34f8ce58cf4e8a))
* resolve TypeScript type errors in background and preview ([ca720df](https://github.com/koki-develop/link-gate/commit/ca720df573fff99c3a41e2cdb632e439561b3121))
* Unify hostname normalization across all components ([47c35c0](https://github.com/koki-develop/link-gate/commit/47c35c063246730f8c7e463b998450910a053090))
