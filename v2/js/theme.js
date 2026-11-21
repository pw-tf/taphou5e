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
    fillSettings();
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

  // The same two drawings every v2 icon carries (core.js icon()): a line one
  // for Ember (.ico-g), an 8x8 one the Pixel and EGA themes swap in (.ico-px).
  // An animated 8x8 drawing is a strip of frames 10 cells apart behind an 8x8
  // window, slid by v2.css on hover (see core.js PIXEL_FRAMES).
  function pxStrip(rest, more, n, ms) {
    return '<svg class="ico-px" viewBox="0 0 8 8" width="24" height="24" fill="currentColor" stroke="none" fill-rule="evenodd">'
      + '<g class="px-run" style="--n:' + n + ';--d:' + (n * ms) + 'ms"><path d="' + rest + more + '"/></g></svg>';
  }
  var LINE_OPEN = ' width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"'
    + ' stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><g class="ico-g">';
  // Palette: Ember rocks it from its base; Pixel and EGA blink its three dabs in turn.
  var PALETTE = '<svg class="ico ico-palette"' + LINE_OPEN
    + '<path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.93 0 1.65-.75 1.65-1.69 0-.44-.18-.84-.44-1.13-.29-.29-.44-.65-.44-1.13'
    + 'a1.64 1.64 0 0 1 1.67-1.67h2c3.05 0 5.55-2.5 5.55-5.55C21.97 6.01 17.46 2 12 2z"/>'
    + '<circle cx="13.5" cy="6.5" r="1"/><circle cx="17.5" cy="10.5" r="1"/><circle cx="8.5" cy="7.5" r="1"/><circle cx="6.5" cy="12.5" r="1"/></g>'
    + pxStrip('M2 0h4v1H2zM1 1h1v1H1zM6 1h1v1H6zM0 2h1v1H0zM2 2h1v1H2zM5 2h1v1H5zM7 2h1v1H7zM0 3h1v1H0zM7 3h1v1H7zM0 4h1v1H0zM2 4h1v1H2zM5 4h2v1H5zM0 5h1v1H0zM5 5h1v1H5zM1 6h1v1H1zM4 6h1v1H4zM2 7h2v1H2z',
      'M12 0h4v1H12zM11 1h1v1H11zM16 1h1v1H16zM10 2h1v1H10zM15 2h1v1H15zM17 2h1v1H17zM10 3h1v1H10zM17 3h1v1H17zM10 4h1v1H10zM12 4h1v1H12zM15 4h2v1H15zM10 5h1v1H10zM15 5h1v1H15zM11 6h1v1H11zM14 6h1v1H14zM12 7h2v1H12zM22 0h4v1H22zM21 1h1v1H21zM26 1h1v1H26zM20 2h1v1H20zM22 2h1v1H22zM27 2h1v1H27zM20 3h1v1H20zM27 3h1v1H27zM20 4h1v1H20zM22 4h1v1H22zM25 4h2v1H25zM20 5h1v1H20zM25 5h1v1H25zM21 6h1v1H21zM24 6h1v1H24zM22 7h2v1H22zM32 0h4v1H32zM31 1h1v1H31zM36 1h1v1H36zM30 2h1v1H30zM32 2h1v1H32zM35 2h1v1H35zM37 2h1v1H37zM30 3h1v1H30zM37 3h1v1H37zM30 4h1v1H30zM35 4h2v1H35zM30 5h1v1H30zM35 5h1v1H35zM31 6h1v1H31zM34 6h1v1H34zM32 7h2v1H32z', 4, 120) + '</svg>';
  // Settings cog: Ember turns it one lobe (60deg); Pixel and EGA step its teeth round.
  var COG = '<svg class="ico ico-settings"' + LINE_OPEN
    + '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>'
    + '<circle cx="12" cy="12" r="3"/></g>'
    + pxStrip('M3 0h2v1H3zM1 1h1v1H1zM3 1h2v1H3zM6 1h1v1H6zM2 2h4v1H2zM0 3h3v1H0zM5 3h3v1H5zM0 4h3v1H0zM5 4h3v1H5zM2 5h4v1H2zM1 6h1v1H1zM3 6h2v1H3zM6 6h1v1H6zM3 7h2v1H3z',
      'M12 0h1v1H12zM15 0h1v1H15zM13 1h2v1H13zM10 2h1v1H10zM12 2h4v1H12zM17 2h1v1H17zM11 3h2v1H11zM15 3h2v1H15zM11 4h2v1H11zM15 4h2v1H15zM10 5h1v1H10zM12 5h4v1H12zM17 5h1v1H17zM13 6h2v1H13zM12 7h1v1H12zM15 7h1v1H15zM23 0h2v1H23zM21 1h1v1H21zM23 1h2v1H23zM26 1h1v1H26zM22 2h4v1H22zM20 3h3v1H20zM25 3h3v1H25zM20 4h3v1H20zM25 4h3v1H25zM22 5h4v1H22zM21 6h1v1H21zM23 6h2v1H23zM26 6h1v1H26zM23 7h2v1H23zM32 0h1v1H32zM35 0h1v1H35zM33 1h2v1H33zM30 2h1v1H30zM32 2h4v1H32zM37 2h1v1H37zM31 3h2v1H31zM35 3h2v1H35zM31 4h2v1H31zM35 4h2v1H35zM30 5h1v1H30zM32 5h4v1H32zM37 5h1v1H37zM33 6h2v1H33zM32 7h1v1H32zM35 7h1v1H35zM43 0h2v1H43zM41 1h1v1H41zM43 1h2v1H43zM46 1h1v1H46zM42 2h4v1H42zM40 3h3v1H40zM45 3h3v1H45zM40 4h3v1H40zM45 4h3v1H45zM42 5h4v1H42zM41 6h1v1H41zM43 6h2v1H43zM46 6h1v1H46zM43 7h2v1H43zM52 0h1v1H52zM55 0h1v1H55zM53 1h2v1H53zM50 2h1v1H50zM52 2h4v1H52zM57 2h1v1H57zM51 3h2v1H51zM55 3h2v1H55zM51 4h2v1H51zM55 4h2v1H55zM50 5h1v1H50zM52 5h4v1H52zM57 5h1v1H57zM53 6h2v1H53zM52 7h1v1H52zM55 7h1v1H55z', 6, 80) + '</svg>';

  /* ----- Settings fold-out ------------------------------------------------
     <button data-settings-toggle aria-controls="<id>"> opens and shuts the
     element it controls in place (Theme, Support, Switch to classic). Filled
     and wired here because login and analytics have no shell of their own.
     Open or shut, it stays that way across pages for the tab. */
  var FOLD_KEY = 'taphou5e-settings';
  function foldOpen() { try { return sessionStorage.getItem(FOLD_KEY) === 'open'; } catch (e) { return false; } }
  function setFold(btn, open) {
    var menu = document.getElementById(btn.getAttribute('aria-controls'));
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (menu) menu.hidden = !open;
  }
  function fillSettings() {
    var nodes = document.querySelectorAll('[data-settings-toggle]');
    for (var i = 0; i < nodes.length; i++) {
      var b = nodes[i];
      if (!b.querySelector('.ico-settings')) {
        b.innerHTML = COG + '<span class="nav-label">Settings</span><span class="fold-caret" aria-hidden="true"></span>';
        b.setAttribute('data-label', 'Settings');
      }
      setFold(b, foldOpen());
    }
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-settings-toggle]');
    if (!b) return;
    var open = b.getAttribute('aria-expanded') !== 'true';
    try { sessionStorage.setItem(FOLD_KEY, open ? 'open' : 'shut'); } catch (err) {}
    setFold(b, open);
  });

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

  /* ----- the same ground, alive (optional) --------------------------------
     Clouds that form and dissolve where they are. Nothing slides and nothing
     repeats: the field is three layers of value noise on a lattice laid over
     the window (big slow shapes, then finer, quicker detail), and every
     lattice point wanders between random values on its own clock. The field
     is re-quantised through the same Bayer matrix every frame. It is a
     canvas -- low-res (one canvas pixel is three CSS px, more on very wide
     screens), fixed behind the page, hung on <html> because v2 rebuilds
     <body>. Time is the wall clock, so the sky carries on from page to page.
     While it runs, <html data-dither-live> hides the still tile.
     Off unless someone turns it on in the Theme popup; never runs for a
     device that asks for reduced motion, or inside an embedded sheet. */
  var MOTION_KEY = 'taphou5e-dither-motion';
  // 30 a second: every second frame of a 60Hz screen, so frames land evenly.
  var FPS = 30;
  // cell: lattice spacing in canvas px; period: seconds, on average, for a
  // point to move from one random value to the next.
  var OCTAVES = [{ cell: 64, amp: 1, period: 9 }, { cell: 32, amp: 0.5, period: 6 }, { cell: 16, amp: 0.25, period: 4 }];
  var AMP_TOTAL = 1.75, EPOCH = 1794700000;
  var STILL = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  var anim = null;

  // integer hash of four numbers, 0..1
  function hash4(a, b, c, d) {
    var n = (Math.imul(a, 374761393) + Math.imul(b, 668265263) + Math.imul(c, 362437) + Math.imul(d, 1274126177)) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    n = Math.imul(n ^ (n >>> 15), 2246822519);
    n ^= n >>> 16;
    return (n >>> 0) / 4294967296;
  }

  function motionWanted() {
    try { return localStorage.getItem(MOTION_KEY) === '1'; } catch (e) { return false; }
  }

  function stopMotion() {
    if (!anim) return;
    cancelAnimationFrame(anim.raf);
    window.removeEventListener('resize', anim.size);
    anim.cv.remove();
    root.removeAttribute('data-dither-live');
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
    var tones = spec.tones, levels = tones.length - 1, ink = [];
    for (var k = 0; k < tones.length; k++) ink.push((255 << 24) | (tones[k][2] << 16) | (tones[k][1] << 8) | tones[k][0]);
    var a = { mode: mode, cv: cv, raf: 0, last: 0, w: 0, h: 0, img: null, px: null, field: null, oct: [] };

    a.size = function () {
      var scale = Math.max(3, Math.ceil(window.innerWidth / 640));
      var w = Math.ceil(window.innerWidth / scale), h = Math.ceil(window.innerHeight / scale);
      if (w === a.w && h === a.h) return;
      a.w = cv.width = w; a.h = cv.height = h;
      cv.style.width = w * scale + 'px'; cv.style.height = h * scale + 'px';
      a.img = ctx.createImageData(w, h);
      a.px = new Uint32Array(a.img.data.buffer);
      a.field = new Float32Array(w * h);
      // Per layer: the lattice, each point's own rate and offset, and for
      // every column the lattice index and eased weight (the same each frame).
      a.oct = [];
      for (var o = 0; o < OCTAVES.length; o++) {
        var cell = OCTAVES[o].cell, gw = Math.ceil(w / cell) + 2, gh = Math.ceil(h / cell) + 2;
        var L = { cell: cell, amp: OCTAVES[o].amp, gw: gw, gh: gh, grid: new Float32Array(gw * gh),
          rate: new Float32Array(gw * gh), off: new Float32Array(gw * gh), ix: new Uint16Array(w), fx: new Float32Array(w) };
        for (var iy = 0, g = 0; iy < gh; iy++) for (var ix = 0; ix < gw; ix++, g++) {
          L.rate[g] = (0.6 + 0.8 * hash4(ix, iy, o, -1)) / OCTAVES[o].period;
          L.off[g] = hash4(ix, iy, o, -2) * 16;
        }
        for (var x = 0; x < w; x++) {
          var gx = x / cell, f = gx - Math.floor(gx);
          L.ix[x] = Math.floor(gx); L.fx[x] = f * f * (3 - 2 * f);
        }
        a.oct.push(L);
      }
      draw();
    };

    function draw() {
      var w = a.w, h = a.h, px = a.px, field = a.field, bias = spec.bias, cap = spec.cap, gain = spec.gain / AMP_TOTAL;
      var t = Date.now() / 1000 - EPOCH, x, y, i;
      field.fill(0);
      for (var o = 0; o < a.oct.length; o++) {
        var L = a.oct[o], grid = L.grid, gw = L.gw, amp = L.amp, lx = L.ix, lf = L.fx;
        // each point eases from its last random value to its next one
        for (var iy = 0, g = 0; iy < L.gh; iy++) for (var ix = 0; ix < gw; ix++, g++) {
          var tt = t * L.rate[g] + L.off[g], kk = Math.floor(tt), f = tt - kk;
          var e = f * f * f * (f * (f * 6 - 15) + 10);
          var v0 = hash4(ix, iy, o, kk), v1 = hash4(ix, iy, o, kk + 1);
          grid[g] = v0 + (v1 - v0) * e;
        }
        for (y = 0, i = 0; y < h; y++) {
          var gy = y / L.cell, y0 = Math.floor(gy), fy = gy - y0;
          fy = fy * fy * (3 - 2 * fy);
          var r0 = y0 * gw, r1 = r0 + gw;
          for (x = 0; x < w; x++, i++) {
            var c = lx[x], fx = lf[x];
            var top = grid[r0 + c] + (grid[r0 + c + 1] - grid[r0 + c]) * fx;
            var bot = grid[r1 + c] + (grid[r1 + c + 1] - grid[r1 + c]) * fx;
            field[i] += amp * (top + (bot - top) * fy);
          }
        }
      }
      for (y = 0, i = 0; y < h; y++) {
        var row = (y & 7) << 3;
        for (x = 0; x < w; x++, i++) {
          var v = bias + gain * field[i];
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
      a.last = now;
      draw();
    }

    anim = a;
    // theme.js runs in <head>, so on a page load the canvas lands BEFORE
    // <body> and the still tile (body::before, same z-index) would paint over
    // it -- the animation ran but could not be seen. data-dither-live tells
    // pixel.css / ega.css to drop the still tile while the canvas is up.
    root.appendChild(cv);
    root.setAttribute('data-dither-live', '');
    a.size();
    window.addEventListener('resize', a.size);
    a.raf = requestAnimationFrame(frame);
  }

  window.setDitherMotion = function (on) {
    try { if (on) localStorage.setItem(MOTION_KEY, '1'); else localStorage.removeItem(MOTION_KEY); } catch (e) {}
    syncMotion(current());
    mark(current());
  };
  // The theme or the switch changed in another tab: follow it here.
  window.addEventListener('storage', function (e) {
    if (e.key === KEY || e.key === MOTION_KEY || e.key === null) { apply(current()); mark(current()); }
  });
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
      : 'Clouds in the background slowly form and fade.';
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
