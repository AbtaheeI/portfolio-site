// Hero graph: me in the middle, the things I've built and done around me,
// and the tools each one used on the outside. Real data, nothing decorative.
// Renders on demand. One entrance, then still until you drag or hover.

import {
  WebGLRenderer, Scene, PerspectiveCamera, Group, Mesh, SphereGeometry,
  MeshBasicMaterial, BufferGeometry, BufferAttribute, LineSegments,
  LineBasicMaterial, Vector3, Color, SRGBColorSpace
} from 'three';

const C = {
  me: new Color('#0071e3'),
  work: new Color('#0f1115'),
  tool: new Color('#a3a8b5'),
  edge: new Color('#d9dce2'),
  edgeHot: new Color('#0071e3'),
  dim: new Color('#eef0f3')
};

function circMean(angles) {
  let x = 0, y = 0;
  angles.forEach(a => { x += Math.cos(a); y += Math.sin(a); });
  return Math.atan2(y, x);
}

// Radial layout facing the camera, with depth so dragging gives real parallax:
// me in the centre, work on an inner ring, tools on an outer ring next to the work that used them.
function layout(data) {
  const pos = {}, ang = {};
  pos[data.me.id] = new Vector3(0, 0, 0);
  const n = data.work.length;
  data.work.forEach((w, i) => {
    const a = Math.PI / 2 - (i / n) * Math.PI * 2;
    ang[w.id] = a;
    pos[w.id] = new Vector3(Math.cos(a) * 17, Math.sin(a) * 15, i % 2 ? 5 : -5);
  });
  const tools = data.tools.map(t => {
    const parents = data.work.filter(w => (w.uses || []).includes(t.id)).map(w => ang[w.id]);
    return { t, a: parents.length ? circMean(parents) : Math.PI / 2 };
  }).sort((p, q) => p.a - q.a);
  // spread tools so labels don't collide
  const gap = (Math.PI * 2) / (tools.length * 1.25);
  for (let pass = 0; pass < 60; pass++) {
    for (let i = 0; i < tools.length; i++) {
      const cur = tools[i], nxt = tools[(i + 1) % tools.length];
      let d = nxt.a - cur.a; if (i === tools.length - 1) d += Math.PI * 2;
      if (d < gap) { const push = (gap - d) / 2; cur.a -= push; nxt.a += push; }
    }
  }
  tools.forEach(({ t, a }, i) => {
    const r = i % 2 ? 31 : 35;
    pos[t.id] = new Vector3(Math.cos(a) * r, Math.sin(a) * r * 0.82, i % 2 ? -8 : 8);
  });
  return pos;
}

export function mount(container, data, opts = {}) {
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  container.appendChild(canvas);
  const labelLayer = document.createElement('div');
  labelLayer.className = 'g-labels';
  labelLayer.setAttribute('aria-hidden', 'true');
  container.appendChild(labelLayer);

  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));

  const scene = new Scene();
  const camera = new PerspectiveCamera(34, 1, 1, 1000);
  const group = new Group();
  group.rotation.y = -0.15;
  group.rotation.x = 0.12;
  scene.add(group);

  const pos = layout(data);
  const nodes = [
    { ...data.me, type: 'me' },
    ...data.work.map(w => ({ ...w, type: 'work' })),
    ...data.tools.map(t => ({ ...t, type: 'tool' }))
  ];
  const index = Object.fromEntries(nodes.map((n, i) => [n.id, i]));
  const edges = [];
  data.work.forEach(w => {
    edges.push([data.me.id, w.id]);
    (w.uses || []).forEach(u => edges.push([w.id, u]));
  });
  const neighbours = nodes.map(() => new Set());
  edges.forEach(([a, b]) => { neighbours[index[a]].add(index[b]); neighbours[index[b]].add(index[a]); });

  // ---------- spheres ----------
  const geoms = { me: new SphereGeometry(1.9, 24, 16), work: new SphereGeometry(1.15, 20, 12), tool: new SphereGeometry(0.62, 14, 10) };
  const meshes = nodes.map(n => {
    const m = new Mesh(geoms[n.type], new MeshBasicMaterial({ color: C[n.type].clone() }));
    m.position.copy(pos[n.id]);
    group.add(m);
    return m;
  });

  // ---------- edges ----------
  const ep = new Float32Array(edges.length * 6), ec = new Float32Array(edges.length * 6);
  edges.forEach(([a, b], i) => {
    const pa = pos[a], pb = pos[b];
    ep.set([pa.x, pa.y, pa.z, pb.x, pb.y, pb.z], i * 6);
  });
  const eg = new BufferGeometry();
  eg.setAttribute('position', new BufferAttribute(ep, 3));
  eg.setAttribute('color', new BufferAttribute(ec, 3));
  const lines = new LineSegments(eg, new LineBasicMaterial({ vertexColors: true, transparent: true }));
  group.add(lines);

  // ---------- labels ----------
  const labels = nodes.map(n => {
    const el = document.createElement(n.href ? 'a' : 'span');
    el.className = 'g-label g-' + n.type;
    el.textContent = n.label;
    if (n.href) { el.href = n.href; el.tabIndex = -1; }
    labelLayer.appendChild(el);
    return el;
  });

  let hot = -1;
  function paint() {
    nodes.forEach((n, i) => {
      const on = hot < 0 || i === hot || neighbours[hot].has(i);
      meshes[i].material.color.copy(on ? C[n.type] : C.dim);
      labels[i].classList.toggle('dim', !on);
      labels[i].classList.toggle('hot', i === hot);
    });
    edges.forEach(([a, b], i) => {
      const ia = index[a], ib = index[b];
      const isHot = hot >= 0 && (ia === hot || ib === hot);
      const c = hot < 0 ? C.edge : (isHot ? C.edgeHot : C.dim);
      ec.set([c.r, c.g, c.b, c.r, c.g, c.b], i * 6);
    });
    eg.attributes.color.needsUpdate = true;
  }
  paint();

  // ---------- render on demand ----------
  const v = new Vector3();
  const screen = nodes.map(() => ({ x: 0, y: 0, z: 0 }));
  let needs = true, raf = 0, visible = true, disposed = false;
  function request() { needs = true; if (!raf && visible && !disposed) raf = requestAnimationFrame(frame); }
  function frame(t) {
    raf = 0;
    if (entrance(t)) request();
    if (!needs) return;
    renderer.render(scene, camera);
    const w = container.clientWidth, h = container.clientHeight;
    group.updateMatrixWorld();
    meshes.forEach((m, i) => {
      v.setFromMatrixPosition(m.matrixWorld).project(camera);
      const s = screen[i];
      s.x = (v.x * 0.5 + 0.5) * w; s.y = (-v.y * 0.5 + 0.5) * h; s.z = v.z;
      const el = labels[i];
      const left = nodes[i].type !== 'me' && s.x < w / 2;
      el.classList.toggle('left', left);
      el.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px)` + (left ? ' translateX(-100%)' : '');
      // fade labels on the far side so the front reads clearly
      const depth = m.getWorldPosition(new Vector3()).z;
      el.style.opacity = nodes[i].type === 'me' ? 1 : (depth < -14 ? 0.45 : 1) * entryK;
    });
    needs = false;
  }

  // one entrance: the graph grows out from the centre
  const t0 = performance.now(), DUR = opts.instant ? 0 : 1300;
  let entryK = DUR ? 0 : 1;
  function entrance(t) {
    if (!DUR || entryK === 1) return false;
    const k = Math.min(1, (t - t0) / DUR), e = 1 - Math.pow(1 - k, 4);
    entryK = k;
    meshes.forEach((m, i) => m.position.copy(pos[nodes[i].id]).multiplyScalar(e));
    edges.forEach(([a, b], i) => {
      const pa = pos[a], pb = pos[b];
      ep.set([pa.x * e, pa.y * e, pa.z * e, pb.x * e, pb.y * e, pb.z * e], i * 6);
    });
    eg.attributes.position.needsUpdate = true;
    lines.material.opacity = e;
    needs = true;
    return k < 1;
  }

  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const vfov = camera.fov * Math.PI / 180;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
    const dist = 38 / Math.sin(Math.min(vfov, hfov) / 2);
    camera.position.set(0, 0, dist);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    request();
  }
  const ro = new ResizeObserver(resize); ro.observe(container); resize();
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) request(); }); io.observe(container);
  const onVis = () => { visible = !document.hidden; if (visible) request(); };
  document.addEventListener('visibilitychange', onVis);

  // ---------- interaction ----------
  let dragging = false, lx = 0, ly = 0, moved = 0;
  function nearest(x, y) {
    const r = container.getBoundingClientRect();
    const px = x - r.left, py = y - r.top;
    let best = -1, bd = 22 * 22;
    screen.forEach((s, i) => {
      const d = (s.x - px) ** 2 + (s.y - py) ** 2;
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  }
  function setHot(i) { if (i === hot) return; hot = i; paint(); request(); container.style.cursor = i >= 0 && nodes[i].href ? 'pointer' : ''; }
  function onMove(e) {
    if (dragging) {
      const dx = e.clientX - lx, dy = e.clientY - ly;
      lx = e.clientX; ly = e.clientY; moved += Math.abs(dx) + Math.abs(dy);
      group.rotation.y += dx * 0.006;
      group.rotation.x = Math.max(-0.6, Math.min(0.6, group.rotation.x + dy * 0.004));
      request();
      return;
    }
    setHot(nearest(e.clientX, e.clientY));
  }
  function onDown(e) { if (e.pointerType === 'mouse' && e.button !== 0) return; dragging = true; moved = 0; lx = e.clientX; ly = e.clientY; canvas.setPointerCapture(e.pointerId); }
  function onUp(e) {
    dragging = false;
    try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
    if (moved < 4) {
      const i = nearest(e.clientX, e.clientY);
      if (i >= 0 && nodes[i].href && hot === i) { location.href = nodes[i].href; return; }
      setHot(i);
    }
  }
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointerleave', () => { if (!dragging) setHot(-1); });

  request();
  requestAnimationFrame(() => container.classList.add('live'));

  return {
    dispose() {
      disposed = true; cancelAnimationFrame(raf);
      ro.disconnect(); io.disconnect(); document.removeEventListener('visibilitychange', onVis);
      Object.values(geoms).forEach(g => g.dispose());
      meshes.forEach(m => m.material.dispose());
      eg.dispose(); lines.material.dispose(); renderer.dispose();
      canvas.remove(); labelLayer.remove();
      container.classList.remove('live');
    }
  };
}
