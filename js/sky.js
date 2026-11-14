/* O céu do capítulo do filme, desenhado num shader (WebGL 2).

   Conforme ela rola, o céu vai do dia ao crepúsculo e à noite estrelada; o sol desce,
   as nuvens ganham cor e somem, as estrelas nascem, um cometa cruza a tela e se divide
   em dois, e tudo isso se reflete num lago, onde as luzes de uma cidadezinha acendem.
   Sky.create(container) devolve { setProgress, start, destroy } ou null (sem WebGL:
   o css/yourname.css desenha um céu em camadas no lugar). */

window.Sky = (() => {
  const reduce = window.GL.reduce;
  const tier = window.GL.tier;

  const VERT = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

  const FRAG = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform float uP;      // 0 = dia, .5 = crepúsculo, 1 = noite
uniform float uDetail; // 1 = nuvens completas; 0 = mais leve
out vec4 outColor;

const float HORIZON = 0.30;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = p * 2.03 + vec2(17.0, 9.0);
    a *= 0.5;
  }
  return v;
}

/* o brilho de um cometa: a cabeça e a cauda que fica para trás */
float comet(vec2 d, vec2 dir, float len, float width) {
  vec2 perp = vec2(-dir.y, dir.x);
  float along = dot(d, -dir);
  float across = dot(d, perp);
  float w = max(1100.0, width - along * 15000.0); // a cauda é fina na cabeça e alarga um pouco atrás
  float fade = 1.0 - smoothstep(0.0, len, along);
  float tail = exp(-across * across * w) * fade * fade * smoothstep(-0.02, 0.0, along);
  float dd = dot(d, d);
  float head = exp(-dd * 7000.0) * 1.2 + exp(-dd * 900.0) * 0.3;
  return tail * 0.5 + head;
}

vec3 skyAt(vec2 uv, float asp, float a, float b, float dusk, vec2 sun) {
  float sy = clamp((uv.y - HORIZON) / (1.0 - HORIZON), 0.0, 1.0);

  vec3 top = mix(mix(vec3(0.33, 0.60, 0.90), vec3(0.17, 0.12, 0.42), a), vec3(0.02, 0.025, 0.12), b);
  vec3 mid = mix(mix(vec3(0.62, 0.79, 0.95), vec3(0.58, 0.30, 0.56), a), vec3(0.06, 0.07, 0.25), b);
  vec3 hor = mix(mix(vec3(0.91, 0.95, 0.98), vec3(1.00, 0.80, 0.58), a), vec3(0.17, 0.14, 0.40), b);

  vec3 sky = mix(hor, mid, smoothstep(0.0, 0.42, sy));
  sky = mix(sky, top, smoothstep(0.30, 1.0, sy));

  // o sol: baixo no horizonte, laranja no crepúsculo, some na noite
  vec2 sd = (uv - sun) * vec2(asp, 1.0);
  float sdd = dot(sd, sd);
  sky += vec3(1.0, 0.74, 0.46) * exp(-sdd * 7.0) * (0.55 * dusk + 0.28 * (1.0 - a)) * (1.0 - b);
  sky += vec3(1.0, 0.92, 0.80) * exp(-sdd * 90.0) * 0.9 * (1.0 - b);

  // nuvens: finas, esticadas, correndo devagar
  if (uDetail > 0.5) {
    vec2 cp = vec2(uv.x * asp * 1.6 + uTime * 0.010, uv.y * 4.2 + 2.0);
    float c = fbm(cp);
    float band = smoothstep(HORIZON + 0.02, HORIZON + 0.22, uv.y) * (1.0 - smoothstep(0.80, 1.0, uv.y));
    c = smoothstep(0.50, 0.80, c) * band;
    vec3 lit = mix(vec3(1.0), vec3(1.0, 0.82, 0.70), a);
    vec3 shade = mix(vec3(0.72, 0.80, 0.92), vec3(0.60, 0.36, 0.56), a);
    float light = smoothstep(0.3, 0.9, fbm(cp * 1.7 + 3.0));
    vec3 cloud = mix(shade, lit, light);
    cloud = mix(cloud, vec3(0.24, 0.24, 0.40), b);
    sky = mix(sky, cloud, c * (1.0 - 0.8 * b) * 0.9);
  }

  // estrelas: uma grade, com poucas células acesas, piscando devagar
  vec2 g = uv * vec2(asp, 1.0) * 70.0;
  vec2 id = floor(g);
  vec2 f = fract(g) - 0.5;
  float h = hash(id);
  float starVis = smoothstep(0.40, 0.78, b) * smoothstep(HORIZON + 0.01, HORIZON + 0.22, uv.y);
  if (h > 0.86 && starVis > 0.001) {
    vec2 off = (vec2(hash(id + 1.3), hash(id + 2.7)) - 0.5) * 0.6;
    float d = length(f - off);
    float tw = 0.65 + 0.35 * sin(uTime * (1.2 + h * 2.5) + h * 40.0);
    float size = 0.05 + 0.07 * smoothstep(0.86, 1.0, h);
    float star = (1.0 - smoothstep(0.0, size, d)) * tw;
    sky += vec3(0.92, 0.96, 1.0) * star * starVis * (0.6 + 0.4 * smoothstep(0.9, 1.0, h));
  }

  // o cometa: entra no fim do dia, cruza no crepúsculo e se parte em dois na noite
  float c0 = smoothstep(0.16, 0.94, uP);
  float vis = smoothstep(0.0, 0.06, c0) * (1.0 - smoothstep(0.93, 1.0, c0));
  if (vis > 0.001) {
    vec2 dir = normalize(vec2(-1.0, -0.36));
    vec2 head = vec2(1.10, 0.94) + dir * 1.42 * c0;
    vec2 d = (uv - head) * vec2(asp, 1.0);
    float split = smoothstep(0.48, 0.74, c0);
    vec2 perp = vec2(-dir.y, dir.x);
    vec2 d2 = d - (perp * 0.075 - dir * 0.03) * split;
    float k1 = comet(d, dir, 0.40, 7000.0);
    float k2 = comet(d2, dir, 0.32, 9000.0) * split;
    sky += vec3(0.80, 0.91, 1.0) * k1 * vis;
    sky += vec3(1.0, 0.80, 0.88) * k2 * vis * 0.9;
    sky += vec3(0.55, 0.65, 1.0) * exp(-dot(d, d) * 90.0) * 0.08 * vis; // um halo discreto
  }
  return sky;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  float asp = uRes.x / uRes.y;
  float a = smoothstep(0.0, 0.5, uP);
  float b = smoothstep(0.5, 1.0, uP);
  float dusk = 1.0 - abs(uP - 0.5) * 2.0;
  vec2 sun = vec2(0.5, HORIZON + 0.11 - 0.14 * uP);

  // as serras: duas linhas de morros, da cor do céu daquele momento, só mais escuras
  float r1 = HORIZON + 0.030 + 0.055 * fbm(vec2(uv.x * asp * 2.2 + 4.0, 1.0));
  float r2 = HORIZON + 0.010 + 0.032 * fbm(vec2(uv.x * asp * 3.6 + 9.0, 3.0));
  vec3 hill1 = mix(mix(vec3(0.24, 0.36, 0.58), vec3(0.20, 0.14, 0.40), a), vec3(0.04, 0.04, 0.14), b);
  vec3 hill2 = mix(mix(vec3(0.14, 0.24, 0.44), vec3(0.10, 0.07, 0.26), a), vec3(0.02, 0.02, 0.09), b);

  vec3 col;
  if (uv.y >= HORIZON) {
    col = skyAt(uv, asp, a, b, dusk, sun);
    float e1 = 1.0 - smoothstep(r1 - 0.004, r1 + 0.004, uv.y);
    float e2 = 1.0 - smoothstep(r2 - 0.003, r2 + 0.003, uv.y);
    col = mix(col, hill1, e1);
    col = mix(col, hill2, e2);
  } else {
    // o lago: o céu de cabeça para baixo, ondulando, escurecendo para perto
    float depth = (HORIZON - uv.y) / HORIZON;
    float ripple = sin(uv.y * 240.0 + uTime * 1.4 + uv.x * 18.0) * 0.004 * (0.3 + depth)
                 + noise(vec2(uv.x * 40.0, uv.y * 120.0 - uTime * 0.6)) * 0.006;
    vec2 m = vec2(uv.x + ripple * 0.6, HORIZON + (HORIZON - uv.y) * 1.05 + ripple);
    col = skyAt(m, asp, a, b, dusk, sun);
    float e1 = 1.0 - smoothstep(r1 - 0.004, r1 + 0.004, m.y);
    float e2 = 1.0 - smoothstep(r2 - 0.003, r2 + 0.003, m.y);
    col = mix(col, hill1, e1);
    col = mix(col, hill2, e2);
    col *= mix(0.78, 0.42, depth);
    col = mix(col, mix(vec3(0.06, 0.10, 0.18), vec3(0.01, 0.01, 0.05), b), depth * 0.45);
    // o rastro do sol na água
    float streak = exp(-pow((uv.x - sun.x) * asp * 9.0, 2.0)) * exp(-depth * 3.0) * (0.35 * dusk + 0.12 * (1.0 - a)) * (1.0 - b);
    col += vec3(1.0, 0.72, 0.45) * streak;
    // as luzes da cidadezinha na outra margem, acendendo com a noite, tremendo na água
    float town = 0.0;
    for (int i = 0; i < 9; i++) {
      float fi = float(i);
      float lx = 0.52 + fi * 0.047 + hash(vec2(fi, 3.0)) * 0.02;
      float ly = HORIZON - 0.006 - hash(vec2(fi, 7.0)) * 0.012;
      vec2 ld = (uv - vec2(lx, ly)) * vec2(asp, 1.0);
      float fl = 0.75 + 0.25 * sin(uTime * (2.0 + fi * 0.7) + fi);
      town += exp(-dot(ld * vec2(1.0, 0.35), ld * vec2(1.0, 0.35)) * 26000.0) * fl;
      town += exp(-dot(ld * vec2(3.0, 0.25), ld * vec2(3.0, 0.25)) * 1400.0) * 0.12 * fl; // o reflexo esticado
    }
    col += vec3(1.0, 0.78, 0.45) * town * smoothstep(0.55, 0.95, uP);
  }

  // um leve escurecimento nos cantos, para o texto no meio respirar
  vec2 q = uv - 0.5;
  col *= 1.0 - dot(q, q) * 0.35;
  outColor = vec4(col, 1.0);
}`;

  function create(container) {
    if (reduce) return null;
    const canvas = document.createElement("canvas");
    canvas.className = "yn-sky";
    const gl = window.GL.context(canvas);
    if (!gl) return null;
    const prog = window.GL.program(gl, VERT, FRAG);
    if (!prog) return null;

    const buf = window.GL.fullscreen(gl);
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    const loc = gl.getAttribLocation(prog.handle, "aPos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    container.append(canvas);

    const scale = Math.min(window.devicePixelRatio || 1, 2) * (tier === "high" ? 0.6 : 0.42);
    let W = 0, H = 0;
    let target = 0, shown = 0;
    let running = false;
    let raf = 0;
    let lastDraw = 0;
    const t0 = performance.now();

    function resize() {
      const r = container.getBoundingClientRect();
      W = Math.max(2, Math.round(r.width * scale));
      H = Math.max(2, Math.round(r.height * scale));
      if (canvas.width !== W || canvas.height !== H) {
        canvas.width = W;
        canvas.height = H;
        gl.viewport(0, 0, W, H);
      }
    }

    function draw(now) {
      gl.useProgram(prog.handle);
      gl.uniform2f(prog.uniform("uRes"), W, H);
      gl.uniform1f(prog.uniform("uTime"), (now - t0) / 1000);
      gl.uniform1f(prog.uniform("uP"), shown);
      gl.uniform1f(prog.uniform("uDetail"), tier === "high" ? 1 : 0);
      gl.bindVertexArray(vao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindVertexArray(null);
    }

    function loop(now) {
      if (!running) return;
      raf = requestAnimationFrame(loop);
      const moving = Math.abs(target - shown) > 0.0005;
      if (moving) shown += (target - shown) * 0.09;
      else shown = target;
      // parado, 30 quadros por segundo bastam para as estrelas piscarem
      if (!moving && now - lastDraw < 31) return;
      lastDraw = now;
      draw(now);
    }

    function start() {
      if (running) return;
      running = true;
      resize();
      window.addEventListener("resize", resize);
      raf = requestAnimationFrame(loop);
    }

    function destroy() {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      const ext = gl.getExtension("WEBGL_lose_context");
      if (ext) ext.loseContext();
      canvas.remove();
    }

    return {
      canvas,
      setProgress(p) { target = Math.max(0, Math.min(1, p)); },
      start,
      destroy,
    };
  }

  return { create };
})();
