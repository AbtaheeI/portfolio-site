(function () {
  // Status data lives on a separate branch so the checks never trigger a deploy or clutter main.
  var DATA = 'https://raw.githubusercontent.com/AbtaheeI/portfolio-site/status-data/';
  var TARGET = 0.995;

  function get(name) {
    return fetch(DATA + name, { cache: 'no-store' }).then(function (r) { if (!r.ok) throw 0; return r.json(); });
  }
  function pct(x) { return (x * 100).toFixed(x === 1 ? 0 : 2) + '%'; }
  function $(id) { return document.getElementById(id); }

  get('uptime.json').then(function (u) {
    var all = (u && u.checks) || [];
    if (!all.length) throw 0;
    var cutoff = Date.now() - 30 * 864e5;
    var month = all.filter(function (c) { return Date.parse(c.t) >= cutoff; });
    var ok = month.filter(function (c) { return c.ok; }).length;
    var avail = month.length ? ok / month.length : 1;
    var allowed = month.length * (1 - TARGET);
    var failed = month.length - ok;
    var left = allowed > 0 ? Math.max(0, 1 - failed / allowed) : (failed ? 0 : 1);
    var lats = month.filter(function (c) { return c.ok && c.ms; }).map(function (c) { return c.ms; }).sort(function (a, b) { return a - b; });
    var med = lats.length ? lats[Math.floor(lats.length / 2)] : null;
    var last = all[all.length - 1];

    $('t-avail').textContent = pct(avail);
    $('t-budget').textContent = pct(left);
    $('t-lat').textContent = med ? med + ' ms' : '·';
    $('t-count').textContent = month.length.toLocaleString('en-AU');
    $('headline').textContent = (last.ok ? 'Yes. ' : 'Not right now. ') + 'Last checked ' + new Date(last.t).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' }) + '.';

    var bars = $('bars');
    all.slice(-96).forEach(function (c) {
      var i = document.createElement('i');
      i.dataset.s = c.ok ? 'ok' : 'bad';
      i.title = c.t + (c.ok ? ' · ' + c.ms + ' ms' : ' · failed (' + (c.code || 'no response') + ')');
      bars.appendChild(i);
    });
  }).catch(function () {
    $('headline').textContent = 'No uptime data yet. The page itself loaded, so it is up for you.';
    $('bars').hidden = true;
    $('checks-empty').hidden = false;
  });

  get('builds.json').then(function (b) {
    var rows = ((b && b.builds) || []).slice(-15).reverse();
    if (!rows.length) throw 0;
    var tb = document.querySelector('#builds tbody');
    rows.forEach(function (r) {
      var tr = document.createElement('tr');
      [r.t.replace('T', ' ').slice(0, 16), r.sha.slice(0, 7), r.perf, r.a11y, r.bp, r.seo, (r.lcp / 1000).toFixed(2) + ' s', Math.round(r.bytes / 1024) + ' KB']
        .forEach(function (v) { var td = document.createElement('td'); td.textContent = v; tr.appendChild(td); });
      tb.appendChild(tr);
    });
    $('builds').hidden = false;
    $('builds-empty').hidden = true;
  }).catch(function () { $('builds-empty').textContent = 'No builds recorded yet. The next push to main will add one.'; });
})();
