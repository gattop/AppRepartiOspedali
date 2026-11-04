// Runs before the page paints: applies the theme chosen in the app, so there's no flash.
// Light is the default whatever the device setting; the switch itself is in app.js.
(function () {
  var root = document.documentElement;
  var t = 'light';
  try { if (localStorage.getItem('theme') === 'dark') t = 'dark'; } catch (e) { /* storage blocked */ }
  root.dataset.theme = t;
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = t === 'dark' ? '#121316' : '#f2f1ee';
})();
