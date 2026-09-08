# Skill: HTML5 / CSS3 / JS (Canvas + WebGL)

Based on 2026 web game guides (Canvas vs WebGL vs WebGPU, Phaser/Three.js).

## Stack Choice
- `Canvas 2D` for simple 2D (puzzle/card). `WebGL` (Three.js) for 3D/complex 2D with GPU. `WebGPU` next (Chrome/Firefox 2026) for AAA.
- Phaser for 2D platformer (Arcade/Matter, input, audio). Three.js/Pixi/Babylon/PlayCanvas for 3D/browser.

## HTML5 Game Loop
- Clear → update → draw each frame via `requestAnimationFrame`. Use `performance.now()` delta, clamp to 0.05.
- Input: `keydown/keyup` + `mousemove` + `PointerLock` + `touch` + `gamepad`. Prevent default for `Space` etc when locked.
- Store `State` in `LocalStorage` + `SaveGame()` debounced 1.2s, `beforeunload`/`visibilitychange`.

## CSS
- Use `CSS variables --accent/--accent2`, `backdrop-filter: blur`, `mix-blend-mode: screen` for neon bloom.
- `canvas#scene { filter: brightness(1.07) contrast(1.06) }` for cheap bloom.
- Avoid layout thrash: `transform` + `opacity` only for animations, `will-change`.

## JS 2026
- ES6 modules or sequential loader for `file://` (avoid parallel `file://` ERR_FAILED).
- `Web Audio API` procedural (no assets), `WebGL` + `PointerLock` + `LocalStorage` feature detection, fallback to Canvas2D if no WebGL.
- Test on Safari quirks: audio needs user gesture, `IndexedDB` limits, `ServiceWorker` limited.

## Neon Palace specifics
- Loader `vendor/three.min.js` UMD for offline, sequential `js/*.js` with 5 retries.
- HUD via `flex` + `grid`, `panel` with `backdrop-filter`, `bloom` div `screen` blend.
