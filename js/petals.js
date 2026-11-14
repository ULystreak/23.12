/* Pétalas de rosa caindo num espaço com profundidade.

   Cada pétala tem x, y e z. Quanto maior o z, mais longe: menor, mais clara e mais nítida.
   As mais próximas ficam grandes e fora de foco, como numa foto com pouca profundidade de campo.
   A física roda aqui, em JavaScript; o desenho é feito em WebGL (um shader desfoca cada pétala
   conforme a distância) ou, sem WebGL, num canvas 2D mais simples.

   Petals.advance(dz) aproxima todas elas: é o que dá a sensação de andar para frente.
   Petals.setCamera(x, y) é o balanço do passo. Petals.burst(x, y) é o lacre estourando. */

window.Petals = (() => {
  let canvas = document.getElementById("petals");
  const reduce = window.GL.reduce;
  const tier = window.GL.tier;

  const COLORS = ["#b3123a", "#c4224b", "#d94a6c", "#e9829b", "#f4b6c4"];
  const RGB = COLORS.map((hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255));
  const Z_NEAR = 0.42;
  const Z_FAR = 4.4;
  const Z_FOCUS = 1.55; // a distância em foco: antes dela tudo desfoca rápido

  let W = 0, H = 0, dpr = 1;
  let petals = [];
  let running = false;
  let last = 0;
  let rush = 0;         // quanto se andou no último quadro: estica as pétalas na direção do movimento
  let camX = 0, camY = 0; // o balanço do passo
  let calm = 1;          // 1 = normal; menor = mais devagar (a última página)

  const rand = (a, b) => a + Math.random() * (b - a);

  /* a maioria fica a meia distância; poucas bem perto, poucas bem longe */
  const depth = () => Z_NEAR + 0.22 + (Z_FAR - Z_NEAR - 0.22) * Math.pow(Math.random(), 1.2);

  function place(p, z, atTop) {
    p.z = z;
    p.x = rand(-0.62, 0.62) * W * z;
    p.y = atTop ? (-H / 2 - 50) * z : rand(-0.55, 0.55) * H * z;
    p.vx = 0;
    p.vy = 0;
    p.age = 0;
    return p;
  }

  function create() {
    const p = {
      size: rand(15, 30),
      ci: (Math.random() * COLORS.length) | 0,
      fall: rand(52, 118),
      sway: rand(16, 50),
      swayRate: rand(0.45, 1.3),
      phase: rand(0, Math.PI * 2),
      rot: rand(0, Math.PI * 2),
      spin: rand(-1, 1),
      flip: rand(0, Math.PI * 2),
      flipRate: rand(0.7, 2.3),
    };
    return place(p, depth(), false);
  }

  /* ---------- a física ---------- */

  function step(dt, elapsed) {
    const speed = (reduce ? 0.5 : 1) * calm;
    const drag = Math.exp(-2.4 * dt);
    for (const p of petals) {
      p.age += elapsed;
      p.phase += p.swayRate * dt * calm;
      p.y += (p.fall * speed + p.vy) * dt;
      p.x += (Math.sin(p.phase) * p.sway * calm + p.vx) * dt;
      p.vx *= drag;
      p.vy *= drag;
      p.rot += p.spin * dt * calm;
      p.flip += p.flipRate * dt * calm;

      const sy = p.y / p.z;
      const sx = p.x / p.z;
      const r = p.size / p.z;
      if (sy > H / 2 + r + 30 || Math.abs(sx) > W / 2 + r + 80) place(p, depth(), true);
    }
    rush *= 0.88;
  }

  /* Anda para frente: traz todas as pétalas para mais perto. */
  function advance(dz) {
    rush = Math.max(rush, dz);
    for (const p of petals) {
      p.z -= dz;
      const sx = p.x / p.z;
      const sy = p.y / p.z;
      if (p.z <= Z_NEAR) {
        place(p, rand(Z_FAR * 0.55, Z_FAR), false);
      } else if (Math.abs(sx) > W / 2 + 90 || Math.abs(sy) > H / 2 + 90) {
        place(p, rand(Z_FAR * 0.45, Z_FAR), false);
      }
    }
  }

  /* Um punhado de pétalas salta de um ponto da tela (quando um lacre se rompe). */
  function burst(sx, sy, count = 30) {
    if (reduce) return;
    for (let i = 0; i < count; i++) {
      const p = petals[(Math.random() * petals.length) | 0];
      const z = rand(0.75, 1.9);
      const angle = rand(0, Math.PI * 2);
      const force = rand(150, 440);
      p.z = z;
      p.x = (sx - W / 2) * z;
      p.y = (sy - H / 2) * z;
      p.vx = Math.cos(angle) * force * z;
      p.vy = (Math.sin(angle) * force - 160) * z;
      p.age = 1;
    }
  }

  /* Uma rajada de vento empurra todas para um lado (quando o pergaminho se fecha). */
  function gust(direction = 1) {
    if (reduce) return;
    for (const p of petals) p.vx += direction * rand(120, 360) * p.z;
  }

  /* ---------- o que cada pétala tem na tela ---------- */

  function look(p) {
    const s = p.size / p.z;
    const fog = Math.min(1, (Z_FAR - p.z) / 1.3);          // as de longe somem no branco
    const near = Math.min(1, (p.z - Z_NEAR) / 0.22);        // as que encostam na câmera desaparecem
    const born = Math.min(1, p.age / 0.9);
    // círculo de confusão: quanto mais longe do ponto de foco, mais desfocada
    const def = 1 / p.z - 1 / Z_FOCUS;
    const blur = def > 0 ? Math.min(42, def * 30) : Math.min(7, -def * 9);
    const alpha = Math.max(0, fog * near) * born * (p.z < 1 ? 0.7 : 0.92) / (1 + blur * 0.035);
    return { s, fog, blur, alpha, px: p.x / p.z + camX, py: p.y / p.z + camY };
  }

  /* ---------- desenho em WebGL ---------- */

  const VERT = `#version 300 es
precision highp float;
layout(location=0) in vec2 aCorner;
layout(location=1) in vec4 aPos;   // x, y (px, origem no centro), tamanho (px), rotação
layout(location=2) in vec4 aLook;  // achatamento (giro de perfil), estique, ângulo do estique, alpha
layout(location=3) in vec4 aTint;  // r, g, b, desfoque (px)
uniform vec2 uRes;
out vec2 vUv;
out vec4 vTint;
out float vAlpha;
out float vBlur;
void main() {
  float size = aPos.z;
  float blur = aTint.w;
  float ext = size + blur * 1.6;
  vUv = aCorner * (ext / size);
  vBlur = blur / size;
  vTint = aTint;
  vAlpha = aLook.w;

  vec2 p = aCorner * ext;
  p.y *= aLook.x;
  float c = cos(aPos.w), s = sin(aPos.w);
  p = vec2(p.x * c - p.y * s, p.x * s + p.y * c);
  // andando: estica para fora do centro, como um rastro de velocidade
  float ca = cos(aLook.z), sa = sin(aLook.z);
  vec2 q = vec2(p.x * ca + p.y * sa, -p.x * sa + p.y * ca);
  q.x *= aLook.y;
  p = vec2(q.x * ca - q.y * sa, q.x * sa + q.y * ca);

  vec2 pos = aPos.xy + p;
  gl_Position = vec4(pos.x / uRes.x * 2.0, -pos.y / uRes.y * 2.0, 0.0, 1.0);
}`;

  const FRAG = `#version 300 es
precision mediump float;
in vec2 vUv;
in vec4 vTint;
in float vAlpha;
in float vBlur;
out vec4 outColor;
void main() {
  // a forma: uma elipse mais larga em cima, com um pequeno recorte no topo, como uma pétala de rosa
  float w = 0.78 + 0.16 * vUv.y;
  vec2 q = vec2(vUv.x / w, vUv.y);
  float d = length(q) - 1.0;
  d += 0.11 * exp(-vUv.x * vUv.x * 16.0) * smoothstep(0.2, 1.0, vUv.y);
  float b = max(vBlur, 0.035);
  float a = 1.0 - smoothstep(-b, b, d);

  // sombra na borda e um reflexo claro: a pétala tem volume
  float rim = smoothstep(-0.45, 0.05, d);
  vec3 col = mix(vTint.rgb, vTint.rgb * 0.84, rim * 0.55);
  float hi = smoothstep(1.05, 0.0, length(vUv - vec2(-0.32, 0.18)));
  col = mix(col, vec3(1.0), hi * 0.3);

  a *= vAlpha;
  outColor = vec4(col * a, a);
}`;

  function makeGL() {
    const gl = window.GL.context(canvas);
    if (!gl) return null;
    const prog = window.GL.program(gl, VERT, FRAG);
    if (!prog) return null;

    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    const inst = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, inst);
    const STRIDE = 12 * 4;
    [[1, 0], [2, 16], [3, 32]].forEach(([loc, offset]) => {
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, STRIDE, offset);
      gl.vertexAttribDivisor(loc, 1);
    });
    gl.bindVertexArray(null);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);

    let data = new Float32Array(0);
    let order = [];

    function resize() {
      gl.viewport(0, 0, canvas.width, canvas.height);
    }

    function draw() {
      const n = petals.length;
      if (data.length < n * 12) data = new Float32Array(n * 12);
      if (order.length !== n) order = petals.map((_, i) => i);
      // de trás para frente, para as próximas ficarem por cima
      order.sort((a, b) => petals[b].z - petals[a].z);

      const stretch = rush > 0.004;
      let k = 0;
      for (const i of order) {
        const p = petals[i];
        const l = look(p);
        if (l.alpha <= 0.01) continue;
        const rgb = RGB[p.ci];
        const angle = stretch ? Math.atan2(l.py - camY, l.px - camX) : 0;
        data[k++] = l.px; data[k++] = l.py; data[k++] = l.s; data[k++] = p.rot;
        data[k++] = Math.max(0.14, Math.abs(Math.cos(p.flip)));
        data[k++] = stretch ? 1 + Math.min(2.6, (rush * 20) / p.z) : 1;
        data[k++] = angle;
        data[k++] = l.alpha;
        data[k++] = rgb[0] + (1 - rgb[0]) * (1 - l.fog);
        data[k++] = rgb[1] + (1 - rgb[1]) * (1 - l.fog);
        data[k++] = rgb[2] + (1 - rgb[2]) * (1 - l.fog);
        data[k++] = l.blur;
      }
      const count = k / 12;

      gl.clear(gl.COLOR_BUFFER_BIT);
      if (!count) return;
      gl.useProgram(prog.handle);
      gl.uniform2f(prog.uniform("uRes"), W, H);
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, inst);
      gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, k), gl.DYNAMIC_DRAW);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, count);
      gl.bindVertexArray(null);
    }

    return { draw, resize, kind: "webgl" };
  }

  /* ---------- desenho em canvas 2D (a reserva) ---------- */

  function make2D() {
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    function resize() {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);
      const cx = W / 2;
      const cy = H / 2;
      for (const p of petals) {
        const l = look(p);
        if (l.alpha <= 0.01) continue;
        const s = l.s;
        ctx.save();
        ctx.translate(cx + l.px, cy + l.py);
        if (rush > 0.004) {
          const angle = Math.atan2(l.py, l.px);
          ctx.rotate(angle);
          ctx.scale(1 + Math.min(2.6, (rush * 20) / p.z), 1);
          ctx.rotate(-angle);
        }
        ctx.rotate(p.rot);
        ctx.scale(1, Math.max(0.14, Math.abs(Math.cos(p.flip))));
        ctx.globalAlpha = l.alpha;
        const rgb = RGB[p.ci];
        const f = 1 - l.fog;
        ctx.fillStyle = `rgb(${((rgb[0] + (1 - rgb[0]) * f) * 255) | 0},${((rgb[1] + (1 - rgb[1]) * f) * 255) | 0},${((rgb[2] + (1 - rgb[2]) * f) * 255) | 0})`;
        ctx.beginPath();
        ctx.moveTo(0, -s);
        ctx.bezierCurveTo(s * 1.05, -s * 0.75, s * 0.85, s * 0.7, 0, s);
        ctx.bezierCurveTo(-s * 0.85, s * 0.7, -s * 1.05, -s * 0.75, 0, -s);
        ctx.fill();
        ctx.globalAlpha = l.alpha * 0.28;
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.ellipse(-s * 0.22, -s * 0.2, s * 0.26, s * 0.5, 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    return { draw, resize, kind: "canvas" };
  }

  let renderer = null;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, renderer && renderer.kind === "webgl" ? 2 : 1.5);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    renderer.resize();

    const per = renderer.kind === "webgl" ? (tier === "high" ? 5200 : 8200) : 10500;
    let target = Math.round(Math.min(renderer.kind === "webgl" ? 190 : 90, Math.max(40, (W * H) / per)));
    if (reduce) target = Math.round(target / 2);
    while (petals.length < target) petals.push(create());
    petals.length = target;
  }

  /* Só um laço de desenho por vez: pausar e voltar não pode deixar dois rodando. */
  let loop = 0;

  function start() {
    if (running) return;
    running = true;
    last = performance.now();
    const id = ++loop;
    const frame = (now) => {
      if (!running || id !== loop) return;
      const elapsed = (now - last) / 1000;
      last = now;
      step(Math.min(0.05, elapsed), elapsed);
      renderer.draw();
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  function pause() { running = false; }

  function setCamera(x, y) { camX = x; camY = y; }

  /* Acalma a queda (a última página) ou devolve o ritmo normal. */
  function setCalm(value) { calm = value; }

  /* Um canvas que já tentou WebGL não aceita mais o 2D: troca por um novo. */
  function freshCanvas() {
    const next = canvas.cloneNode(false);
    canvas.replaceWith(next);
    canvas = next;
  }

  /* Reserva: se o WebGL falhar no meio do caminho, troca para o canvas 2D. */
  function fallback() {
    freshCanvas();
    renderer = make2D();
    document.documentElement.dataset.petals = renderer.kind;
    resize();
  }

  renderer = !reduce ? makeGL() : null;
  if (!renderer) {
    if (!reduce) freshCanvas();
    renderer = make2D();
  } else {
    canvas.addEventListener("webglcontextlost", (event) => { event.preventDefault(); fallback(); });
  }
  document.documentElement.dataset.petals = renderer.kind;
  window.addEventListener("resize", resize);
  resize();

  return { start, pause, advance, burst, gust, setCamera, setCalm, kind: () => renderer.kind };
})();
