// Cursor ink: a small real-time fluid simulation drawn behind the page.
// Moving the pointer pushes soft colour through a velocity field (stable fluids:
// advect, add curl, solve pressure, subtract gradient). WebGL2 only. Desktop pointers only.
// The loop stops a few seconds after the pointer stops, so an idle page costs nothing.
(function () {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  if (navigator.connection && navigator.connection.saveData) return;

  var canvas = document.createElement('canvas');
  canvas.className = 'ink';
  canvas.setAttribute('aria-hidden', 'true');
  var gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: 'low-power' });
  if (!gl || !gl.getExtension('EXT_color_buffer_float')) return;
  document.body.prepend(canvas);

  var SIM = 128, DYE = 720, PRESSURE_ITERS = 14, CURL = 26, SPLAT_R = 0.0022, FORCE = 3600;
  var VEL_FADE = 0.985, DYE_FADE = 0.972, IDLE_MS = 6000;

  // ---------- shaders ----------
  var VERT = '#version 300 es\nin vec2 p;out vec2 uv;out vec2 l;out vec2 r;out vec2 t;out vec2 b;uniform vec2 texel;' +
    'void main(){uv=p*.5+.5;l=uv-vec2(texel.x,0.);r=uv+vec2(texel.x,0.);t=uv+vec2(0.,texel.y);b=uv-vec2(0.,texel.y);gl_Position=vec4(p,0.,1.);}';
  var H = '#version 300 es\nprecision highp float;precision highp sampler2D;in vec2 uv;in vec2 l;in vec2 r;in vec2 t;in vec2 b;out vec4 o;';
  var FRAG = {
    splat: H + 'uniform sampler2D tex;uniform float aspect;uniform vec3 color;uniform vec2 point;uniform float radius;' +
      'void main(){vec2 d=uv-point;d.x*=aspect;o=vec4(texture(tex,uv).xyz+exp(-dot(d,d)/radius)*color,1.);}',
    advect: H + 'uniform sampler2D vel;uniform sampler2D src;uniform vec2 texel;uniform float dt;uniform float fade;' +
      'void main(){vec2 c=uv-dt*texture(vel,uv).xy*texel;o=vec4(fade*texture(src,c).xyz,1.);}',
    curl: H + 'uniform sampler2D vel;void main(){float L=texture(vel,l).y,R=texture(vel,r).y,T=texture(vel,t).x,B=texture(vel,b).x;o=vec4(.5*(R-L-T+B),0.,0.,1.);}',
    vort: H + 'uniform sampler2D vel;uniform sampler2D curl;uniform float k;uniform float dt;' +
      'void main(){float L=texture(curl,l).x,R=texture(curl,r).x,T=texture(curl,t).x,B=texture(curl,b).x,C=texture(curl,uv).x;' +
      'vec2 f=.5*vec2(abs(T)-abs(B),abs(R)-abs(L));f/=length(f)+.0001;f*=k*C;f.y*=-1.;o=vec4(clamp(texture(vel,uv).xy+f*dt,-1000.,1000.),0.,1.);}',
    div: H + 'uniform sampler2D vel;void main(){float L=texture(vel,l).x,R=texture(vel,r).x,T=texture(vel,t).y,B=texture(vel,b).y;vec2 C=texture(vel,uv).xy;' +
      'if(l.x<0.)L=-C.x;if(r.x>1.)R=-C.x;if(t.y>1.)T=-C.y;if(b.y<0.)B=-C.y;o=vec4(.5*(R-L+T-B),0.,0.,1.);}',
    pres: H + 'uniform sampler2D pres;uniform sampler2D div;void main(){o=vec4((texture(pres,l).x+texture(pres,r).x+texture(pres,t).x+texture(pres,b).x-texture(div,uv).x)*.25,0.,0.,1.);}',
    grad: H + 'uniform sampler2D pres;uniform sampler2D vel;void main(){o=vec4(texture(vel,uv).xy-vec2(texture(pres,r).x-texture(pres,l).x,texture(pres,t).x-texture(pres,b).x),0.,1.);}',
    // Soft pastel on a white page: alpha follows the ink density, colour is premultiplied.
    show: H + 'uniform sampler2D tex;void main(){vec3 c=texture(tex,uv).rgb;float m=max(c.r,max(c.g,c.b));if(m>1.)c/=m;float a=clamp(m,0.,1.);o=vec4(c,a);}'
  };

  function compile(type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; }
  var vs = compile(gl.VERTEX_SHADER, VERT);
  function program(frag) {
    var p = gl.createProgram();
    gl.attachShader(p, vs); gl.attachShader(p, compile(gl.FRAGMENT_SHADER, frag));
    gl.bindAttribLocation(p, 0, 'p'); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) return null;
    var u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (var i = 0; i < n; i++) { var name = gl.getActiveUniform(p, i).name; u[name] = gl.getUniformLocation(p, name); }
    return { p: p, u: u };
  }
  var P = {};
  for (var k in FRAG) { P[k] = program(FRAG[k]); if (!P[k]) { canvas.remove(); return; } }

  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  // ---------- render targets ----------
  function target(w, h) {
    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    var fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.viewport(0, 0, w, h); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    var t = { tex: tex, fbo: fbo, w: w, h: h }; made.push(t); return t;
  }
  function pair(w, h) { var a = target(w, h), b = target(w, h); return { get read() { return a; }, get write() { return b; }, swap: function () { var t = a; a = b; b = t; }, w: w, h: h }; }

  var vel, dye, divT, curlT, pres, aspect = 1, made = [];
  function sizes() {
    made.forEach(function (t) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fbo); }); made = [];
    aspect = innerWidth / innerHeight;
    var sw = Math.round(SIM * Math.max(1, aspect)), sh = Math.round(SIM * Math.max(1, 1 / aspect));
    var dw = Math.round(DYE * Math.max(1, aspect)), dh = Math.round(DYE * Math.max(1, 1 / aspect));
    canvas.width = Math.round(innerWidth * Math.min(devicePixelRatio || 1, 1.5));
    canvas.height = Math.round(innerHeight * Math.min(devicePixelRatio || 1, 1.5));
    vel = pair(sw, sh); dye = pair(dw, dh); pres = pair(sw, sh); divT = target(sw, sh); curlT = target(sw, sh);
  }
  if (gl.checkFramebufferStatus) { sizes(); if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) { canvas.remove(); return; } }

  function use(prog, texels) { gl.useProgram(prog.p); if (prog.u.texel) gl.uniform2f(prog.u.texel, 1 / texels.w, 1 / texels.h); return prog.u; }
  function bind(unit, t, loc) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t.tex); gl.uniform1i(loc, unit); }
  function draw(dst) {
    if (dst) { gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo); gl.viewport(0, 0, dst.w, dst.h); }
    else { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, canvas.width, canvas.height); }
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  // Apple-ish palette: pink, purple, blue, teal, green, orange. Cycles as you move.
  var PALETTE = [[1, .1, .35], [.75, .15, 1], [.2, .15, 1], [0, .55, 1], [.1, .9, .45], [1, .6, 0]];
  var hue = Math.random() * PALETTE.length;
  function colour() {
    hue = (hue + 0.03) % PALETTE.length;
    var i = Math.floor(hue), f = hue - i, a = PALETTE[i], b = PALETTE[(i + 1) % PALETTE.length];
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
  }

  function splat(x, y, dx, dy, c) {
    var u = use(P.splat, vel);
    bind(0, vel.read, u.tex); gl.uniform1f(u.aspect, aspect); gl.uniform2f(u.point, x, y);
    gl.uniform3f(u.color, dx, dy, 0); gl.uniform1f(u.radius, SPLAT_R * (c[3] > 1 ? 2.2 : 1) * (aspect > 1 ? aspect : 1));
    draw(vel.write); vel.swap();
    bind(0, dye.read, u.tex); gl.uniform3f(u.color, c[0] * (c[3] || .32), c[1] * (c[3] || .32), c[2] * (c[3] || .32));
    draw(dye.write); dye.swap();
  }

  function step(dt) {
    var u;
    u = use(P.curl, vel); bind(0, vel.read, u.vel); draw(curlT);
    u = use(P.vort, vel); bind(0, vel.read, u.vel); bind(1, curlT, u.curl); gl.uniform1f(u.k, CURL); gl.uniform1f(u.dt, dt); draw(vel.write); vel.swap();
    u = use(P.div, vel); bind(0, vel.read, u.vel); draw(divT);
    u = use(P.pres, vel); bind(1, divT, u.div);
    for (var i = 0; i < PRESSURE_ITERS; i++) { bind(0, pres.read, u.pres); draw(pres.write); pres.swap(); }
    u = use(P.grad, vel); bind(0, pres.read, u.pres); bind(1, vel.read, u.vel); draw(vel.write); vel.swap();
    u = use(P.advect, vel); bind(0, vel.read, u.vel); bind(1, vel.read, u.src); gl.uniform1f(u.dt, dt); gl.uniform1f(u.fade, VEL_FADE); draw(vel.write); vel.swap();
    u = use(P.advect, vel); bind(0, vel.read, u.vel); bind(1, dye.read, u.src); gl.uniform1f(u.dt, dt); gl.uniform1f(u.fade, DYE_FADE); draw(dye.write); dye.swap();
  }

  function show() {
    gl.disable(gl.BLEND);
    var u = use(P.show, dye); bind(0, dye.read, u.tex);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  // ---------- loop: runs only while there is something to see ----------
  var raf = 0, last = 0, lastMove = 0, queue = [], px = -1, py = -1;
  function frame(now) {
    raf = 0;
    var dt = Math.min((now - last) / 1000, 1 / 30) || 1 / 60; last = now;
    for (var i = 0; i < queue.length; i++) { var s = queue[i]; splat(s[0], s[1], s[2], s[3], s[4]); }
    queue.length = 0;
    step(dt); show();
    if (now - lastMove < IDLE_MS && !document.hidden) raf = requestAnimationFrame(frame);
    else { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); }
  }
  function wake() { lastMove = performance.now(); if (!raf) { last = lastMove; raf = requestAnimationFrame(frame); } }

  addEventListener('pointermove', function (e) {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    var x = e.clientX / innerWidth, y = 1 - e.clientY / innerHeight;
    if (px >= 0) {
      var dx = (x - px) * (aspect > 1 ? aspect : 1), dy = (y - py) / (aspect < 1 ? aspect : 1);
      if (Math.abs(dx) + Math.abs(dy) > 0.0004 && queue.length < 8) queue.push([x, y, dx * FORCE, dy * FORCE, colour()]);
    }
    px = x; py = y; wake();
  }, { passive: true });
  document.addEventListener('pointerleave', function () { px = -1; });
  // A click drops a bigger burst of ink
  addEventListener('pointerdown', function (e) {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    var c = colour(); c[3] = 7;
    var a = Math.random() * 6.283, f = FORCE * 0.02;
    queue.push([e.clientX / innerWidth, 1 - e.clientY / innerHeight, Math.cos(a) * f, Math.sin(a) * f, c]);
    wake();
  }, { passive: true });

  var rt = 0;
  addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(sizes, 200); });
  canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); cancelAnimationFrame(raf); canvas.remove(); });
})();
