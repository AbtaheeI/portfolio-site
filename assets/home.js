// Homepage behaviour: topic cards and the "Ask me anything" box.
// Topic answers are plain HTML already on the page. Free-text questions go to /api/chat
// when it's switched on; otherwise they're matched to the closest topic.
(function () {
  var body = document.body, root = document.documentElement;
  var thread = document.getElementById('thread');
  var form = document.getElementById('ask');
  var input = document.getElementById('q');
  var TITLES = { me: 'About me', projects: 'Projects', skills: 'Skills', experience: 'Experience', contact: 'Contact', site: 'How this site is run' };

  // ---------- status dot on the "A" ----------
  fetch('https://raw.githubusercontent.com/AbtaheeI/portfolio-site/status-data/uptime.json', { cache: 'no-store' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (u) {
      if (!u || !u.checks || !u.checks.length) return;
      var last = u.checks[u.checks.length - 1], dot = document.getElementById('status-dot');
      dot.dataset.state = last.ok ? 'ok' : 'bad';
      dot.title = last.ok ? 'Site is up. Last checked ' + new Date(last.t).toLocaleString('en-AU') : 'Last uptime check failed';
    }).catch(function () {});

  // ---------- matching a question to a topic ----------
  var RULES = [
    ['site', /\b(this site|website|status|uptime|lighthouse|how is (this|the site))\b/i],
    ['contact', /\b(contact|email|e-mail|reach|hire|phone|call|linkedin|resume|cv)\b/i],
    ['experience', /\b(experience|job|jobs|intern|internship|nutanix|bcsda|amazon|worked|work history|role|career)\b/i],
    ['projects', /\b(project|projects|built|build|building|github|code|liveability|groupsync|traceroute|aircraft|nyc|housing|made)\b/i],
    ['skills', /\b(skill|skills|stack|language|languages|tech|tools|python|java|sql|react|node|postgres|know)\b/i],
    ['me', /\b(about|who|yourself|study|studying|uni|university|degree|graduat|background|where are you)\b/i]
  ];
  function match(q) { for (var i = 0; i < RULES.length; i++) if (RULES[i][1].test(q)) return RULES[i][0]; return null; }

  // ---------- rendering ----------
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function scrollDown() { requestAnimationFrame(function () { window.scrollTo({ top: document.body.scrollHeight, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); }); }
  function topicNode(topic) {
    var src = document.querySelector('.answers [data-topic="' + topic + '"]');
    var wrap = el('div', 'answer');
    wrap.appendChild(el('h2', 'topic-title', TITLES[topic]));
    if (src) Array.prototype.forEach.call(src.childNodes, function (n) { wrap.appendChild(n.cloneNode(true)); });
    return wrap;
  }
  function startChat() {
    if (!body.classList.contains('chat')) { body.classList.add('chat'); window.scrollTo(0, 0); }
  }
  function addUser(q) { var m = el('div', 'msg user'); m.appendChild(el('span', null, q)); thread.appendChild(m); }
  function addBot() { var m = el('div', 'msg bot'); m.appendChild(el('p', 'wait', 'Looking that up')); thread.appendChild(m); scrollDown(); return m; }

  function paragraphs(text) {
    var f = document.createDocumentFragment();
    String(text).split(/\n{2,}/).forEach(function (p) { if (p.trim()) f.appendChild(el('p', null, p.trim())); });
    return f;
  }

  function askAI(q) {
    var ctrl = new AbortController();
    var t = setTimeout(function () { ctrl.abort(); }, 15000);
    return fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ q: q }), signal: ctrl.signal })
      .then(function (r) { clearTimeout(t); if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (j) { if (!j || !j.answer) throw new Error('empty'); return j.answer; });
  }

  function ask(q, topic) {
    q = (q || '').trim();
    if (!q) return;
    startChat();
    addUser(q);
    var bot = addBot();

    if (topic) { bot.replaceChildren(topicNode(topic)); scrollDown(); return; }

    var guess = match(q);
    askAI(q).then(function (answer) {
      bot.replaceChildren(paragraphs(answer));
      if (guess && guess !== 'site') { bot.appendChild(topicNode(guess)); }
      scrollDown();
    }).catch(function () {
      if (guess) {
        bot.replaceChildren(el('p', null, "Here's what I have on that."), topicNode(guess));
      } else {
        bot.replaceChildren(
          el('p', null, "I don't have an answer for that one yet. Try a topic below, or email me and I'll get back to you."),
          (function () { var p = el('p', 'note'); var a = el('a', 'link', 'abtaheeislam@gmail.com'); a.href = 'mailto:abtaheeislam@gmail.com'; p.appendChild(a); return p; })()
        );
      }
      scrollDown();
    });
  }

  form.addEventListener('submit', function (e) { e.preventDefault(); var q = input.value; input.value = ''; ask(q); });
  document.querySelectorAll('[data-topic][data-q]').forEach(function (b) {
    b.addEventListener('click', function () { ask(b.dataset.q, b.dataset.topic); });
  });
  document.getElementById('home-btn').addEventListener('click', function () {
    body.classList.remove('chat'); thread.replaceChildren(); history.replaceState(null, '', location.pathname); window.scrollTo(0, 0);
  });

  // Deep links, for example abtaheeislam.com/#projects from a resume
  var h = location.hash.slice(1);
  if (TITLES[h]) { var b = document.querySelector('[data-topic="' + h + '"][data-q]'); if (b) ask(b.dataset.q, h); }

  // ---------- 3D graph, desktop only ----------
  var stage = document.getElementById('graph'), toggle = document.getElementById('plain-toggle'), handle = null;
  function canRun3D() {
    if (root.classList.contains('plain') || body.classList.contains('chat')) return false;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
    if (navigator.connection && navigator.connection.saveData) return false;
    if (innerWidth < 640) return false;
    try { var c = document.createElement('canvas'); if (!(c.getContext('webgl2') || c.getContext('webgl'))) return false; } catch (_) { return false; }
    return true;
  }
  function start() {
    if (handle || !canRun3D()) return;
    Promise.all([import('./graph3d.js'), fetch('data/graph.json').then(function (r) { return r.json(); })])
      .then(function (res) { if (!handle && canRun3D()) handle = res[0].mount(stage, res[1], { compact: true }); })
      .catch(function () {});
  }
  function setPlain(on) {
    root.classList.toggle('plain', on);
    toggle.setAttribute('aria-pressed', String(on));
    toggle.textContent = on ? 'Turn on 3D' : 'Turn off 3D';
    try { localStorage.setItem('plain', on ? '1' : '0'); } catch (_) {}
    if (on && handle) { handle.dispose(); handle = null; }
    if (!on) start();
  }
  setPlain(root.classList.contains('plain'));
  toggle.addEventListener('click', function () { setPlain(!root.classList.contains('plain')); });
  function idle(fn) { (window.requestIdleCallback || function (f) { setTimeout(f, 200); })(fn, { timeout: 2500 }); }
  if (document.readyState === 'complete') idle(start); else addEventListener('load', function () { idle(start); });
})();
