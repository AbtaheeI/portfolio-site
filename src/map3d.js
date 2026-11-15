// 3D liveability map for the hero.
// Built with esbuild into assets/map3d.js (three.js is tree-shaken into the same file).
// One merged geometry, one draw call. Renders on demand: nothing runs when nothing moves.

import {
  WebGLRenderer, Scene, PerspectiveCamera, HemisphereLight, DirectionalLight,
  Shape, Path, ExtrudeGeometry, BufferGeometry, BufferAttribute, Mesh,
  MeshLambertMaterial, Group, Raycaster, Vector2, Color, SRGBColorSpace
} from 'three';

const RAMP = [new Color('#dde3ea'), new Color('#8fb3e6'), new Color('#3d7bf5')];
const HOVER = new Color('#0f1115');

function rampColor(t, out) {
  t = Math.min(1, Math.max(0, t));
  if (t < 0.5) return out.copy(RAMP[0]).lerp(RAMP[1], t / 0.5);
  return out.copy(RAMP[1]).lerp(RAMP[2], (t - 0.5) / 0.5);
}

function ringToPoints(flat) {
  const pts = [];
  for (let i = 0; i < flat.length; i += 2) pts.push(flat[i], flat[i + 1]);
  return pts;
}

function buildGeometry(regions) {
  const positions = [], normals = [], colors = [], ids = [];
  const ranges = [];
  const c = new Color();

  regions.forEach((r, idx) => {
    const depth = 0.5 + r.s * 6;
    const start = positions.length / 3;
    rampColor(r.s, c);

    r.g.forEach(poly => {
      const outer = ringToPoints(poly[0]);
      const shape = new Shape();
      shape.moveTo(outer[0], outer[1]);
      for (let i = 2; i < outer.length; i += 2) shape.lineTo(outer[i], outer[i + 1]);
      for (let h = 1; h < poly.length; h++) {
        const hp = ringToPoints(poly[h]);
        const path = new Path();
        path.moveTo(hp[0], hp[1]);
        for (let i = 2; i < hp.length; i += 2) path.lineTo(hp[i], hp[i + 1]);
        shape.holes.push(path);
      }
      const geo = new ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 1 });
      geo.rotateX(-Math.PI / 2);
      const p = geo.attributes.position.array;
      const n = geo.attributes.normal.array;
      for (let i = 0; i < p.length; i += 3) {
        positions.push(p[i], p[i + 1], p[i + 2]);
        normals.push(n[i], n[i + 1], n[i + 2]);
        colors.push(c.r, c.g, c.b);
        ids.push(idx);
      }
      geo.dispose();
    });

    ranges.push([start, positions.length / 3]);
  });

  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(normals), 3));
  g.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3));
  g.setAttribute('rid', new BufferAttribute(new Float32Array(ids), 1));
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return { geometry: g, ranges };
}

export function mount(container, regions, opts = {}) {
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  container.appendChild(canvas);

  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));

  const scene = new Scene();
  const camera = new PerspectiveCamera(30, 1, 1, 2000);

  scene.add(new HemisphereLight(0xffffff, 0x8a93a6, 1.25));
  const sun = new DirectionalLight(0xffffff, 1.6);
  sun.position.set(-40, 90, 50);
  scene.add(sun);

  const { geometry, ranges } = buildGeometry(regions);
  const material = new MeshLambertMaterial({ vertexColors: true });
  const mesh = new Mesh(geometry, material);
  const group = new Group();
  group.add(mesh);
  group.rotation.y = -0.18;
  scene.add(group);

  // centre the map on the origin so rotation pivots around its middle
  const bb = geometry.boundingBox;
  const cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2;
  geometry.translate(-cx, 0, -cz);
  geometry.computeBoundingSphere();
  const radius = geometry.boundingSphere.radius;

  const baseColors = geometry.attributes.color.array.slice();
  const colorAttr = geometry.attributes.color;
  const ridAttr = geometry.attributes.rid;

  // ---------- render on demand ----------
  let needsRender = true, raf = 0, visible = true, disposed = false;
  function request() { needsRender = true; if (!raf && visible && !disposed) raf = requestAnimationFrame(frame); }
  function frame(t) {
    raf = 0;
    if (entrance(t)) request();
    if (needsRender) { renderer.render(scene, camera); needsRender = false; }
  }

  // one entrance: regions rise from flat, then the scene goes still
  const t0 = performance.now();
  const DUR = opts.instant ? 0 : 1400;
  group.scale.y = DUR ? 0.02 : 1;
  function entrance(t) {
    if (!DUR || group.scale.y === 1) return false;
    const k = Math.min(1, (t - t0) / DUR);
    const e = 1 - Math.pow(1 - k, 4);
    group.scale.y = k === 1 ? 1 : 0.02 + 0.98 * e;
    needsRender = true;
    return k < 1;
  }

  // ---------- sizing ----------
  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // fit the bounding sphere in whichever axis is tighter
    camera.fov = 30;
    const vfov = camera.fov * Math.PI / 180;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
    const dist = (radius * 0.88) / Math.sin(Math.min(vfov, hfov) / 2);
    const dir = { x: 0, y: 0.82, z: 0.57 };
    camera.position.set(dir.x * dist, dir.y * dist, dir.z * dist);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    request();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  // ---------- pause when off-screen or tab hidden ----------
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) request(); });
  io.observe(container);
  const onVis = () => { visible = !document.hidden; if (visible) request(); };
  document.addEventListener('visibilitychange', onVis);

  // ---------- hover + drag ----------
  const tip = opts.tooltip;
  const ray = new Raycaster();
  const ptr = new Vector2();
  let hovered = -1, dragging = false, lastX = 0, moved = 0, pending = null;

  function setHover(idx) {
    if (idx === hovered) return;
    const arr = colorAttr.array;
    if (hovered >= 0) {
      const [a, b] = ranges[hovered];
      arr.set(baseColors.subarray(a * 3, b * 3), a * 3);
    }
    hovered = idx;
    if (idx >= 0) {
      const [a, b] = ranges[idx];
      const c = new Color();
      for (let i = a; i < b; i++) {
        c.setRGB(baseColors[i * 3], baseColors[i * 3 + 1], baseColors[i * 3 + 2]).lerp(HOVER, 0.35);
        arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b;
      }
    }
    colorAttr.needsUpdate = true;
    request();
    if (opts.onHover) opts.onHover(idx);
  }

  function pick(x, y) {
    const r = canvas.getBoundingClientRect();
    ptr.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ptr, camera);
    const hit = ray.intersectObject(mesh, false)[0];
    return hit ? ridAttr.array[hit.face.a] : -1;
  }

  function placeTip(x, y) {
    if (!tip) return;
    const r = container.getBoundingClientRect();
    let left = x - r.left + 16, top = y - r.top + 16;
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    if (left + tw > r.width) left = x - r.left - tw - 16;
    if (top + th > r.height) top = y - r.top - th - 16;
    tip.style.left = Math.max(0, left) + 'px';
    tip.style.top = Math.max(0, top) + 'px';
  }

  function onMove(e) {
    if (dragging) {
      const dx = e.clientX - lastX;
      lastX = e.clientX;
      moved += Math.abs(dx);
      group.rotation.y += dx * 0.006;
      request();
      return;
    }
    pending = e;
    if (!onMove.q) {
      onMove.q = requestAnimationFrame(() => {
        onMove.q = 0;
        const ev = pending;
        const idx = pick(ev.clientX, ev.clientY);
        setHover(idx);
        if (tip) { tip.classList.toggle('on', idx >= 0); placeTip(ev.clientX, ev.clientY); }
      });
    }
  }
  function onDown(e) { if (e.pointerType === 'mouse' && e.button !== 0) return; dragging = true; moved = 0; lastX = e.clientX; canvas.setPointerCapture(e.pointerId); }
  function onUp(e) {
    dragging = false;
    try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
    if (moved < 4) {
      const idx = pick(e.clientX, e.clientY);
      setHover(idx);
      if (tip) { tip.classList.toggle('on', idx >= 0); placeTip(e.clientX, e.clientY); }
    }
  }
  function onLeave() { if (!dragging) { setHover(-1); if (tip) tip.classList.remove('on'); } }

  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointerleave', onLeave);

  request();
  requestAnimationFrame(() => container.classList.add('live'));

  return {
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect(); io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      geometry.dispose(); material.dispose(); renderer.dispose();
      canvas.remove();
      container.classList.remove('live');
    }
  };
}
