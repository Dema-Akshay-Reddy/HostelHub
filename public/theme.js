/* ==========================================================================
   HostelHub — Instant Theme Loader (Zero FOUC)
   Loaded synchronously in <head> before stylesheets.
   ========================================================================== */
(function() {
  function getStoredTheme() {
    try {
      return localStorage.getItem('hh_theme') || 'system';
    } catch (e) {
      return 'system';
    }
  }

  function applyTheme(theme) {
    if (theme === 'light' || theme === 'dark') {
      document.documentElement.dataset.theme = theme;
    } else {
      document.documentElement.removeAttribute('data-theme');
    }

    var isDark = theme === 'dark' || (theme !== 'light' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute('content', isDark ? '#0b1620' : '#1f6feb');
    }
  }

  // Global theme controller for HostelHub
  window.__hh_theme = {
    get: getStoredTheme,
    set: function(theme) {
      try {
        localStorage.setItem('hh_theme', theme);
      } catch (e) {}
      applyTheme(theme);
    },
    cycle: function() {
      var current = getStoredTheme();
      var next = current === 'light' ? 'dark' : (current === 'dark' ? 'system' : 'light');
      window.__hh_theme.set(next);
      return next;
    }
  };

  // Run immediately before stylesheet paints
  applyTheme(getStoredTheme());

  // Listen for OS system theme changes when in 'system' mode
  if (window.matchMedia) {
    try {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function() {
        if (getStoredTheme() === 'system') {
          applyTheme('system');
        }
      });
    } catch (e) {}
  }
})();
