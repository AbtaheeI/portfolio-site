(function () {
  var el = document.getElementById('map'), tip = document.getElementById('map-tip'), data = null;
  try { if (localStorage.getItem('plain') === '1') return; } catch (_) {}
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || innerWidth < 640 || (navigator.connection && navigator.connection.saveData)) return;
  try { var c = document.createElement('canvas'); if (!(c.getContext('webgl2') || c.getContext('webgl'))) return; } catch (_) { return; }
  function fmt(n) { return n.toLocaleString('en-AU'); }
  function row(k, v) {
    var d = document.createElement('div'); d.className = 'row';
    var a = document.createElement('span'); a.textContent = k;
    var b = document.createElement('span'); b.textContent = v;
    d.appendChild(a); d.appendChild(b); return d;
  }
  function show(i) {
    if (i < 0 || !data) return;
    var r = data[i];
    var name = document.createElement('b'); name.textContent = r.n;
    var area = document.createElement('div'); area.className = 'muted'; area.style.marginBottom = '6px'; area.textContent = r.a;
    tip.replaceChildren(name, area,
      row('score', r.s.toFixed(3)), row('rank', (i + 1) + ' of ' + data.length),
      row('transport stops', fmt(r.st)), row('points of interest', fmt(r.poi)), row('residents', fmt(r.pop)));
  }
  var io = new IntersectionObserver(function (es) {
    if (!es[0].isIntersecting) return;
    io.disconnect();
    Promise.all([import('./map3d.js'), fetch('../data/sa2.json').then(function (r) { return r.json(); })])
      .then(function (res) { data = res[1]; res[0].mount(el, data, { tooltip: tip, onHover: show }); })
      .catch(function () {});
  });
  addEventListener('load', function () { io.observe(el); });
})();
