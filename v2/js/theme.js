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
