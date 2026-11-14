/* Theme switch — sets data-theme on <html> and remembers the choice.
   Touches only its own localStorage keys.

   Modes: 'pixel' | 'pixel-dark' | 'dark' | 'light' | 'system'.
   Pixel is what a device gets until someone picks otherwise. 'system' is now
   stored as a choice of its own (it used to be "no key"), and still works by
   REMOVING the attribute so tokens.css follows prefers-color-scheme. */
(function () {
  var KEY = 'taphou5e-theme';
  var DEFAULT = 'pixel';
  var MODES = { pixel: 1, 'pixel-dark': 1, dark: 1, light: 1, system: 1 };
  // Browser chrome colour (<meta name="theme-color">) per theme.
  var CHROME = { pixel: '#dfe2d0', 'pixel-dark': '#1c1e19', dark: '#15110e', light: '#f5efe3' };
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
      nodes[i].classList.toggle('is-active', nodes[i].getAttribute('data-theme-option') === mode);
    }
  }

  /* ----- dither ground (pixel themes) -----------------------------------
     A still frame of the homeapp background: two layers of tileable value
     noise, summed and quantised to one bit through an 8x8 Bayer matrix. It
     is drawn once as a 256px tile, kept as a PNG data URL, and handed to
     pixel.css as --px-dither, which shows each tile pixel 3x3. Seeded, so
     the ground is the same on every page and every load. */
  var TILE = 256;
  var DITHER_KEY = 'taphou5e-dither-1-';
  var TONES = {            // [ground, dither tone] — pixel.css --pa / --pz
    pixel: [[223, 226, 208], [192, 197, 176]],
    'pixel-dark': [[28, 30, 25], [46, 49, 41]]
  };
  var BAYER = [0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22,
    3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21];

  function drawTile(tones) {
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
    var cv = document.createElement('canvas');
    cv.width = cv.height = TILE;
    var ctx = cv.getContext('2d'), img = ctx.createImageData(TILE, TILE), d = img.data;
    var n1 = noise(3), n2 = noise(5), M = TILE - 1;
    for (var y = 0, i = 0, p = 0; y < TILE; y++) {
      var r2 = ((y + 97) & M) * TILE, row = (y & 7) << 3;
      for (var x = 0; x < TILE; x++, i++, p += 4) {
        // a cloud field: mostly clear ground, never more than half covered
        var v = -0.5 + 0.625 * (n1[i] + n2[r2 + ((x + 41) & M)]);
        v = v < 0 ? 0 : v > 0.5 ? 0.5 : v;
        var c = tones[v > (BAYER[row | (x & 7)] + 0.5) / 64 ? 1 : 0];
        d[p] = c[0]; d[p + 1] = c[1]; d[p + 2] = c[2]; d[p + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return cv.toDataURL('image/png');
  }

  function dither(mode) {
    var tones = TONES[mode];
    if (!tones) { root.style.removeProperty('--px-dither'); return; }
    var url = null;
    try { url = localStorage.getItem(DITHER_KEY + mode); } catch (e) {}
    if (!url || url.indexOf('data:image/png') !== 0) {
      try { url = drawTile(tones); } catch (e) { url = null; }   // no canvas: plain ground
      if (url) { try { localStorage.setItem(DITHER_KEY + mode, url); } catch (e) {} }
    }
    if (url) root.style.setProperty('--px-dither', 'url("' + url + '")');
    else root.style.removeProperty('--px-dither');
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
