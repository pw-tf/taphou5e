/* Ember theme switch — sets data-theme on <html> and remembers the choice.
   Touches only its own localStorage key. */
(function () {
  var KEY = 'taphou5e-theme';
  var saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) {}
  if (saved === 'dark' || saved === 'light') {
    document.documentElement.setAttribute('data-theme', saved);
  } else {
    document.documentElement.removeAttribute('data-theme'); /* follow system */
  }
  window.setTheme = function (mode) {
    try {
      if (mode === 'system') { localStorage.removeItem(KEY); document.documentElement.removeAttribute('data-theme'); }
      else { localStorage.setItem(KEY, mode); document.documentElement.setAttribute('data-theme', mode); }
    } catch (e) {}
    mark(mode);
  };
  function mark(mode) {
    var nodes = document.querySelectorAll('[data-theme-option]');
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].classList.toggle('is-active', nodes[i].getAttribute('data-theme-option') === mode);
    }
  }
  // v2 rebuilds document.body after this file runs, which drops the marking
  // done on DOMContentLoaded. Expose it so the shell can re-run it.
  window.markThemeButtons = function () {
    var current = null;
    try { current = localStorage.getItem(KEY); } catch (e) {}
    mark(current === 'dark' || current === 'light' ? current : 'system');
  };
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
