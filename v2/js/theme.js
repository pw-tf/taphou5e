/* Theme switch — sets data-theme on <html> and remembers the choice.
   Touches only its own localStorage keys.

   Modes: 'dark' | 'light' | 'system' | 'pixel' | 'pixel-dark' | 'ega'.
   Dark is what a device gets until someone picks otherwise. 'system' is
   stored as a choice of its own (it used to be "no key"), and works by
   REMOVING the attribute so tokens.css follows prefers-color-scheme. */
(function () {
  var KEY = 'taphou5e-theme';
  var DEFAULT = 'dark';
  var MODES = { pixel: 1, 'pixel-dark': 1, ega: 1, dark: 1, light: 1, system: 1 };
  // Browser chrome colour (<meta name="theme-color">) per theme.
  var CHROME = { pixel: '#dfe2d0', 'pixel-dark': '#1c1e19', ega: '#0c0c22', dark: '#15110e', light: '#f5efe3' };
  var root = document.documentElement;

  function current() {
    var saved = null;
    try { saved = localStorage.getItem(KEY); } catch (e) {}
    return MODES[saved] ? saved : DEFAULT;
  }

  function apply(mode) {
    if (mode === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', mode);
    dither(mode);
    syncMotion(mode);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      var shown = mode !== 'system' ? mode
        : (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
      meta.setAttribute('content', CHROME[shown]);
    }
  }

  function mark(mode) {
    var nodes = document.querySelectorAll('[data-theme-option]');
    for (var i = 0; i < nodes.length; i++) {
      var on = nodes[i].getAttribute('data-theme-option') === mode;
      nodes[i].classList.toggle('is-active', on);
      nodes[i].setAttribute('aria-checked', on ? 'true' : 'false');
    }
    fillButtons(mode);
    markMotion(mode);
  }

  /* ----- the Theme button and its popup -----------------------------------
     One button wherever the theme can be changed -- the sidebar foot, the
     phone drawer, the login page, analytics -- written as
     <button data-theme-button>. It is filled in here (a palette icon and
     "Theme: <current>") so every page draws it the same, and opens a popup
     of tiles, each with a small swatch of that theme's ground, panel and
     accent. Picking a tile applies it at once and leaves the popup open, so
     themes can be compared; Escape, the close button or the backdrop shut
     it. Lives here, not in core.js, because login and analytics have no
     core.js of their own. */
  var THEMES = [
    { mode: 'pixel',      name: 'Pixel',      sw: ['#dfe2d0', '#dfe2d0', '#1c1e19', '#1c1e19'] },
    { mode: 'pixel-dark', name: 'Pixel dark', sw: ['#1c1e19', '#1c1e19', '#dfe2d0', '#dfe2d0'] },
    { mode: 'ega',        name: 'EGA',        sw: ['#07070f', '#10102c', '#ffe14d', '#aaaaaa'] },
    { mode: 'dark',       name: 'Dark',       sw: ['#15110e', '#1a1512', '#e2703a', '#342b23'] },
    { mode: 'light',      name: 'Light',      sw: ['#f5efe3', '#fffaf1', '#c85a27', '#e0d4c0'] },
    { mode: 'system',     name: 'System',     sw: null }        // half Dark, half Light
  ];
  var NAMES = {};
  for (var t = 0; t < THEMES.length; t++) NAMES[THEMES[t].mode] = THEMES[t].name;

  // The same two drawings every v2 icon carries (core.js icon()): a line
  // palette for Ember, an 8x8 one the Pixel and EGA themes swap in.
  var PALETTE = '<svg class="ico ico-palette" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"'
    + ' stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><g class="ico-g">'
    + '<path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.93 0 1.65-.75 1.65-1.69 0-.44-.18-.84-.44-1.13-.29-.29-.44-.65-.44-1.13'
    + 'a1.64 1.64 0 0 1 1.67-1.67h2c3.05 0 5.55-2.5 5.55-5.55C21.97 6.01 17.46 2 12 2z"/>'
    + '<circle cx="13.5" cy="6.5" r="1"/><circle cx="17.5" cy="10.5" r="1"/><circle cx="8.5" cy="7.5" r="1"/><circle cx="6.5" cy="12.5" r="1"/></g>'
    + '<g class="ico-px" transform="scale(3)" fill="currentColor" stroke="none" fill-rule="evenodd">'
    + '<path d="M2 0h4v1h1v1h1v3H6v1H5v2H2V7H1V6H0V2h1V1h1zM2 2h1v1H2zM5 2h1v1H5zM2 4h1v1H2z"/></g></svg>';

  function fillButtons(mode) {
    var label = 'Theme: ' + (NAMES[mode] || NAMES[DEFAULT]);
    var nodes = document.querySelectorAll('[data-theme-button]');
    for (var i = 0; i < nodes.length; i++) {
      var b = nodes[i];
      if (!b.querySelector('[data-theme-name]')) {
        b.innerHTML = PALETTE + '<span class="nav-label">Theme: <span data-theme-name></span></span>';
        b.setAttribute('aria-haspopup', 'dialog');
      }
      b.querySelector('[data-theme-name]').textContent = NAMES[mode] || NAMES[DEFAULT];
      b.setAttribute('data-label', label);
      if (b.hasAttribute('title')) b.title = label;   // the collapsed sidebar names rows by title
    }
  }

  function swatch(theme) {
    if (!theme.sw) return '<span class="theme-swatch is-split" aria-hidden="true">'
      + swatch(THEMES[3]).replace('class="theme-swatch"', 'class="theme-swatch half"')
      + swatch(THEMES[4]).replace('class="theme-swatch"', 'class="theme-swatch half"') + '</span>';
    var c = theme.sw;
    return '<span class="theme-swatch" aria-hidden="true" style="--sw-ground:' + c[0] + ';--sw-panel:' + c[1]
      + ';--sw-accent:' + c[2] + ';--sw-line:' + c[3] + '"><i class="sw-panel"><i class="sw-bar"></i><i class="sw-line"></i></i></span>';
  }

  var lastTrigger = null;

  function closePicker() {
    var host = document.querySelector('[data-theme-picker]');
    if (!host) return;
    host.remove();
    document.removeEventListener('keydown', onKey, true);
    if (lastTrigger && document.contains(lastTrigger)) lastTrigger.focus();
  }

  function onKey(e) {
    if (e.key === 'Escape') { e.stopPropagation(); closePicker(); }
  }

  window.openThemePicker = function (trigger) {
    closePicker();
    lastTrigger = trigger || document.activeElement;
    // From the phone drawer, which closes behind the popup: hand focus back
    // to the menu button, not to a row that is now off-screen.
    if (lastTrigger && lastTrigger.closest && lastTrigger.closest('.side-menu-overlay')) {
      lastTrigger = document.getElementById('menu-btn') || lastTrigger;
    }
    var tiles = '';
    for (var i = 0; i < THEMES.length; i++) {
      tiles += '<button type="button" class="theme-tile" role="radio" data-theme-option="' + THEMES[i].mode + '">'
        + swatch(THEMES[i]) + '<span class="theme-tile-name">' + THEMES[i].name + '</span></button>';
    }
    var host = document.createElement('div');
    host.className = 'modal-host theme-picker-host';
    host.setAttribute('data-theme-picker', '');
    host.innerHTML = '<div class="modal theme-picker" role="dialog" aria-modal="true" aria-labelledby="theme-picker-title">'
      + '<div class="modal-head"><h2 id="theme-picker-title">Theme</h2>'
      + '<button type="button" class="pane-close" aria-label="Close">\u00d7</button></div>'
      + '<div class="modal-body"><div class="theme-grid" role="radiogroup" aria-labelledby="theme-picker-title">'
      + tiles + '</div>'
      + '<div class="theme-motion" data-theme-motion hidden><div class="theme-motion-text">'
      + '<div class="theme-motion-name" id="theme-motion-name">Animate background</div>'
      + '<div class="theme-motion-hint" data-motion-hint></div></div>'
      + '<button type="button" class="theme-motion-switch" role="switch" aria-checked="false" data-motion-toggle'
      + ' aria-labelledby="theme-motion-name"><i></i></button></div>'
      + '</div></div>';
    host.addEventListener('click', function (e) {
      var sw = e.target.closest('[data-motion-toggle]');
      if (sw) { window.setDitherMotion(sw.getAttribute('aria-checked') !== 'true'); return; }
      var tile = e.target.closest('[data-theme-option]');
      if (tile) { window.setTheme(tile.getAttribute('data-theme-option')); return; }
      if (e.target === host || e.target.closest('.pane-close')) closePicker();
    });
    document.body.appendChild(host);
    document.addEventListener('keydown', onKey, true);
    mark(current());
    var on = host.querySelector('.theme-tile.is-active') || host.querySelector('.theme-tile');
    if (on) on.focus();
  };

  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-theme-button]');
    if (b) window.openThemePicker(b);
  });

  /* ----- dither ground (pixel and EGA themes) ---------------------------
     A still frame of the homeapp background: two layers of tileable value
     noise, summed and quantised through an 8x8 Bayer matrix -- to one bit for
     the Pixel themes, to four blue levels for EGA. It is drawn once as a
     256px tile, kept as a PNG data URL, and handed to pixel.css / ega.css as
     --px-dither, which shows each tile pixel 3x3. Seeded, so the ground is
     the same on every page and every load. */
  var TILE = 256;
  var DITHER_KEY = 'taphou5e-dither-1-';
  // tones: ground first, then each dither level (pixel.css --pa / --pz; for
  // EGA the ground stepped a tenth at a time toward EGA blue #5555ff).
  // The field is bias + gain/2 * (n1 + n2), clamped to 0..cap.
  var DITHERS = {
    pixel: { tones: [[223, 226, 208], [192, 197, 176]], bias: -0.5, gain: 1.25, cap: 0.5 },
    'pixel-dark': { tones: [[28, 30, 25], [46, 49, 41]], bias: -0.5, gain: 1.25, cap: 0.5 },
    ega: { tones: [[7, 7, 15], [15, 15, 39], [23, 23, 63], [31, 31, 87]], bias: -0.3, gain: 1.3, cap: 0.8 }
  };
  var BAYER = [0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22,
    3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21];

  // The two noise layers, made once per page and only when something draws.
  var layers = null;
  function noiseLayers() {
    if (layers) return layers;
    var seed = 20261114;
    function rnd() {
      seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    function smooth(f) { return f * f * (3 - 2 * f); }
    // tileable fractal value noise, 0–1
    function noise(cells) {
      var out = new Float32Array(TILE * TILE), amp = 1, oct, i, x, y;
      for (oct = 0; oct < 4; oct++, cells *= 2, amp *= 0.5) {
        var grid = new Float32Array(cells * cells);
        for (i = 0; i < grid.length; i++) grid[i] = rnd();
        for (y = 0, i = 0; y < TILE; y++) {
          var fy = (y * cells) / TILE, y0 = fy | 0, y1 = (y0 + 1) % cells, ty = smooth(fy - y0);
          for (x = 0; x < TILE; x++, i++) {
            var fx = (x * cells) / TILE, x0 = fx | 0, x1 = (x0 + 1) % cells, tx = smooth(fx - x0);
            var top = grid[y0 * cells + x0] + (grid[y0 * cells + x1] - grid[y0 * cells + x0]) * tx;
            var bot = grid[y1 * cells + x0] + (grid[y1 * cells + x1] - grid[y1 * cells + x0]) * tx;
            out[i] += amp * (top + (bot - top) * ty);
          }
        }
      }
      var lo = Infinity, hi = -Infinity;
      for (i = 0; i < out.length; i++) { if (out[i] < lo) lo = out[i]; if (out[i] > hi) hi = out[i]; }
      for (i = 0; i < out.length; i++) out[i] = (out[i] - lo) / (hi - lo);
      return out;
    }
    var n1 = noise(3);
    layers = [n1, noise(5)];
    return layers;
  }

  function drawTile(spec) {
    var tones = spec.tones, levels = tones.length - 1;
    var cv = document.createElement('canvas');
    cv.width = cv.height = TILE;
    var ctx = cv.getContext('2d'), img = ctx.createImageData(TILE, TILE), d = img.data;
    var n = noiseLayers(), n1 = n[0], n2 = n[1], M = TILE - 1;
    for (var y = 0, i = 0, p = 0; y < TILE; y++) {
      var r2 = ((y + 97) & M) * TILE, row = (y & 7) << 3;
      for (var x = 0; x < TILE; x++, i++, p += 4) {
        // a cloud field: mostly clear ground, capped so it never fills in
        var v = spec.bias + spec.gain / 2 * (n1[i] + n2[r2 + ((x + 41) & M)]);
        v = v < 0 ? 0 : v > spec.cap ? spec.cap : v;
        var s = v * levels, l = s | 0;
        var c = tones[s - l > (BAYER[row | (x & 7)] + 0.5) / 64 ? l + 1 : l];
        d[p] = c[0]; d[p + 1] = c[1]; d[p + 2] = c[2]; d[p + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return cv.toDataURL('image/png');
  }

  function dither(mode) {
    var spec = DITHERS[mode];
    if (!spec) { root.style.removeProperty('--px-dither'); return; }
    var url = null;
    try { url = localStorage.getItem(DITHER_KEY + mode); } catch (e) {}
    if (!url || url.indexOf('data:image/png') !== 0) {
      try { url = drawTile(spec); } catch (e) { url = null; }   // no canvas: plain ground
      if (url) { try { localStorage.setItem(DITHER_KEY + mode, url); } catch (e) {} }
    }
    if (url) root.style.setProperty('--px-dither', 'url("' + url + '")');
    else root.style.removeProperty('--px-dither');
  }

  /* ----- the same ground, moving (optional) -------------------------------
     What the homeapp background does: the two noise layers slide at
     different speeds, so the cloud shapes drift and slowly change, and the
     field is re-quantised every frame. That cannot be done with the still
     tile, so it is a canvas -- low-res (one canvas pixel is three CSS px,
     more on very wide screens), fixed behind the page, hung on <html>
     because v2 rebuilds <body>. At rest it draws exactly the still tile, so
     switching it on does not jump. Off unless someone turns it on in the
     Theme popup; never runs for a device that asks for reduced motion, or
     inside an embedded sheet. */
  var MOTION_KEY = 'taphou5e-dither-motion';
  // 30 a second: every second frame of a 60Hz screen, so frames land evenly
  // (24 does not divide 60 and alternated short and long frames).
  var FPS = 30, SPEED_X = 1.2, SPEED_Y = 0.36;      // canvas px a second
  var STILL = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  var anim = null;

  function motionWanted() {
    try { return localStorage.getItem(MOTION_KEY) === '1'; } catch (e) { return false; }
  }

  function stopMotion() {
    if (!anim) return;
    cancelAnimationFrame(anim.raf);
    window.removeEventListener('resize', anim.size);
    anim.cv.remove();
    anim = null;
  }

  function syncMotion(mode) {
    var spec = DITHERS[mode];
    if (!spec || !motionWanted() || STILL.matches || window.self !== window.top) { stopMotion(); return; }
    if (anim && anim.mode === mode) return;
    stopMotion();
    var cv = document.createElement('canvas');
    cv.setAttribute('data-dither', '');
    cv.setAttribute('aria-hidden', 'true');
    cv.style.cssText = 'position:fixed;left:0;top:0;z-index:-1;pointer-events:none;image-rendering:pixelated';
    var ctx = cv.getContext('2d');
    if (!ctx) return;
    var n = noiseLayers(), n1 = n[0], n2 = n[1], M = TILE - 1;
    var tones = spec.tones, levels = tones.length - 1, ink = [];
    for (var k = 0; k < tones.length; k++) ink.push((255 << 24) | (tones[k][2] << 16) | (tones[k][1] << 8) | tones[k][0]);
    var a = { mode: mode, cv: cv, raf: 0, last: 0, o1x: 0, o1y: 0, o2x: 41, o2y: 97, w: 0, h: 0, img: null, px: null };

    a.size = function () {
      var scale = Math.max(3, Math.ceil(window.innerWidth / 640));
      var w = Math.ceil(window.innerWidth / scale), h = Math.ceil(window.innerHeight / scale);
      if (w === a.w && h === a.h) return;
      a.w = cv.width = w; a.h = cv.height = h;
      cv.style.width = w * scale + 'px'; cv.style.height = h * scale + 'px';
      a.img = ctx.createImageData(w, h);
      a.px = new Uint32Array(a.img.data.buffer);
      draw();
    };

    function draw() {
      var w = a.w, h = a.h, px = a.px, gain = spec.gain / 2, bias = spec.bias, cap = spec.cap;
      // Each layer is read at its exact, fractional position (bilinear), not
      // the nearest whole pixel. Stepping a whole pixel at a time moved the
      // entire field in 3px jumps a couple of times a second; this way the
      // field changes a little every frame and the edges creep.
      var f1x = Math.floor(a.o1x), f1y = Math.floor(a.o1y), f2x = Math.floor(a.o2x), f2y = Math.floor(a.o2y);
      var t1x = a.o1x - f1x, t1y = a.o1y - f1y, t2x = a.o2x - f2x, t2y = a.o2y - f2y;
      var ax = f1x & M, ay = f1y & M, bx = f2x & M, by = f2y & M;
      var p00 = (1 - t1x) * (1 - t1y), p10 = t1x * (1 - t1y), p01 = (1 - t1x) * t1y, p11 = t1x * t1y;
      var q00 = (1 - t2x) * (1 - t2y), q10 = t2x * (1 - t2y), q01 = (1 - t2x) * t2y, q11 = t2x * t2y;
      for (var y = 0, i = 0; y < h; y++) {
        var r1 = ((y + ay) & M) * TILE, r1b = ((y + ay + 1) & M) * TILE;
        var r2 = ((y + by) & M) * TILE, r2b = ((y + by + 1) & M) * TILE, row = (y & 7) << 3;
        for (var x = 0; x < w; x++, i++) {
          var c1 = (x + ax) & M, c1b = (c1 + 1) & M, c2 = (x + bx) & M, c2b = (c2 + 1) & M;
          var v = bias + gain * (
            n1[r1 + c1] * p00 + n1[r1 + c1b] * p10 + n1[r1b + c1] * p01 + n1[r1b + c1b] * p11 +
            n2[r2 + c2] * q00 + n2[r2 + c2b] * q10 + n2[r2b + c2] * q01 + n2[r2b + c2b] * q11);
          v = v < 0 ? 0 : v > cap ? cap : v;
          var s = v * levels, l = s | 0;
          px[i] = ink[s - l > (BAYER[row | (x & 7)] + 0.5) / 64 ? l + 1 : l];
        }
      }
      ctx.putImageData(a.img, 0, 0);
    }

    function frame(now) {
      a.raf = requestAnimationFrame(frame);
      if (now - a.last < 1000 / FPS - 2) return;
      var dt = a.last ? Math.min((now - a.last) / 1000, 0.1) : 0;
      a.last = now;
      a.o1x -= SPEED_X * dt; a.o1y -= SPEED_Y * dt;                   // the two layers slide
      a.o2x -= SPEED_X * 0.55 * dt; a.o2y += SPEED_Y * 1.7 * dt;      // apart, so shapes evolve
      draw();
    }

    anim = a;
    document.documentElement.appendChild(cv);
    a.size();
    window.addEventListener('resize', a.size);
    a.raf = requestAnimationFrame(frame);
  }

  window.setDitherMotion = function (on) {
    try { if (on) localStorage.setItem(MOTION_KEY, '1'); else localStorage.removeItem(MOTION_KEY); } catch (e) {}
    syncMotion(current());
    mark(current());
  };
  if (STILL.addEventListener) STILL.addEventListener('change', function () { syncMotion(current()); mark(current()); });

  // The popup's "Animate background" row: there only for the themes that
  // have a dither ground, and switched off (with the reason) for a device
  // that asks for reduced motion.
  function markMotion(mode) {
    var row = document.querySelector('[data-theme-motion]');
    if (!row) return;
    row.hidden = !DITHERS[mode];
    var sw = row.querySelector('[data-motion-toggle]'), on = motionWanted() && !STILL.matches;
    sw.setAttribute('aria-checked', on ? 'true' : 'false');
    sw.disabled = STILL.matches;
    row.querySelector('[data-motion-hint]').textContent = STILL.matches
      ? 'Off: this device asks for reduced motion.'
      : 'The dithered background drifts slowly.';
  }

  apply(current());

  window.setTheme = function (mode) {
    if (!MODES[mode]) mode = DEFAULT;
    try { localStorage.setItem(KEY, mode); } catch (e) {}
    apply(mode);
    mark(mode);
  };
  // v2 rebuilds document.body after this file runs, which drops the marking
  // done on DOMContentLoaded. Expose it so the shell can re-run it.
  window.markThemeButtons = function () { mark(current()); };
  document.addEventListener('DOMContentLoaded', function () { window.markThemeButtons(); });
})();

// --device-line: the CSS length nearest 1px that is a whole number of device
// pixels. At a fractional pixel ratio (2.625 on many Android phones, 1.25 and
// 1.5 under Windows scaling) a 1px hairline is 2.6 or 1.5 device pixels, so a
// row of them renders some thick and some thin. The HP bar notches use this
// instead (ember.css). CSS cannot read the ratio itself; without this script
// the notches fall back to 1px.
(function () {
  function set() {
    var dpr = window.devicePixelRatio || 1;
    document.documentElement.style.setProperty('--device-line', (Math.max(1, Math.round(dpr)) / dpr) + 'px');
    // The ratio changes with browser zoom or a move to another screen.
    try {
      window.matchMedia('(resolution: ' + dpr + 'dppx)').addEventListener('change', set, { once: true });
    } catch (e) { /* old engine: keeps the value from load */ }
  }
  set();
})();
