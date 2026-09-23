// Sets the theme before first paint so pages never flash the wrong colors.
// Mirrors resolveTheme() in src/lib/theme.ts.
(function () {
  var pref = 'light';
  try {
    var saved = JSON.parse(localStorage.getItem('safescreen.v2') || '{}');
    if (saved.settings && saved.settings.appearance) pref = saved.settings.appearance;
  } catch (e) {}
  var dark = pref === 'dark' || (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
})();
