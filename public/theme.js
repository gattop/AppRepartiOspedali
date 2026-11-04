// Runs before the page paints: applies the theme saved by the toggle (else the system one),
// so there's no light/dark flash. The toggle itself is in app.js.
(function () {
  var root = document.documentElement;
  try { var t = localStorage.getItem('theme'); if (t === 'light' || t === 'dark') root.dataset.theme = t; } catch (e) { /* storage blocked */ }
  var dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = dark ? '#121316' : '#f2f1ee';
})();
