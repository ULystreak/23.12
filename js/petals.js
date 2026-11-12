/* Pétalas de rosa caindo num espaço com profundidade.
   Cada pétala tem x, y e z. Quanto maior o z, mais longe (menor e mais clara).
   Petals.advance(dz) aproxima todas elas: é o que dá a sensação de andar para frente. */

window.Petals = (() => {
  const canvas = document.getElementById("petals");
  const ctx = canvas.getContext("2d");

  const COLORS = ["#b3123a", "#c4224b", "#d94a6c", "#e9829b", "#f4b6c4"];
  const Z_NEAR = 0.45;
  const Z_FAR = 4.2;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  let W = 0, H = 0;
  let petals = [];
  let running = false;
  let last = 0;
  let rush = 0; // quanto se andou no último quadro: estica as pétalas na direção do movimento

  const rand = (a, b) => a + Math.random() * (b - a);

  /* a maioria fica a meia distância; poucas bem perto, poucas bem longe */
  const depth = () => Z_NEAR + 0.25 + (Z_FAR - Z_NEAR - 0.25) * Math.pow(Math.random(), 1.15);

  function place(p, z, atTop) {
    p.z = z;
    p.x = rand(-0.6, 0.6) * W * z;
    p.y = atTop ? (-H / 2 - 40) * z : rand(-0.55, 0.55) * H * z;
    p.vx = 0;
    p.vy = 0;
    p.age = 0;
    return p;
  }

  function create() {
    const p = {
      size: rand(17, 34),
      color: COLORS[(Math.random() * COLORS.length) | 0],
      fall: rand(60, 130),
      sway: rand(18, 54),
      swayRate: rand(0.5, 1.4),
      phase: rand(0, Math.PI * 2),
      rot: rand(0, Math.PI * 2),
      spin: rand(-1.1, 1.1),
      flip: rand(0, Math.PI * 2),
      flipRate: rand(0.8, 2.6),
    };
    return place(p, depth(), false);
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    let target = Math.round(Math.min(130, Math.max(44, (W * H) / 8500)));
    if (reduce) target = Math.round(target / 2);
    while (petals.length < target) petals.push(create());
    petals.length = target;
  }

  function step(dt, elapsed) {
    const speed = reduce ? 0.5 : 1;
    const drag = Math.exp(-2.4 * dt); // os empurrões (salto, vento) vão perdendo força
    for (const p of petals) {
      p.age += elapsed;
      p.phase += p.swayRate * dt;
      p.y += (p.fall * speed + p.vy) * dt;
      p.x += (Math.sin(p.phase) * p.sway + p.vx) * dt;
      p.vx *= drag;
      p.vy *= drag;
      p.rot += p.spin * dt;
      p.flip += p.flipRate * dt;

      const sy = p.y / p.z;
      const sx = p.x / p.z;
      const r = p.size / p.z;
      if (sy > H / 2 + r + 20 || Math.abs(sx) > W / 2 + r + 60) place(p, depth(), true);
    }
    rush *= 0.88;
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    const cx = W / 2;
    const cy = H / 2;

    for (const p of petals) {
      const s = p.size / p.z;
      const fog = Math.min(1, (Z_FAR - p.z) / 1.2);
      const near = Math.min(1, (p.z - Z_NEAR) / 0.25);
      const born = Math.min(1, p.age / 0.9);
      const alpha = Math.max(0, fog * near) * born * (p.z < 1 ? 0.78 : 0.92);
      if (alpha <= 0.01) continue;

      const px = p.x / p.z;
      const py = p.y / p.z;

      ctx.save();
      ctx.translate(cx + px, cy + py);
      if (rush > 0.004) {
        // andando: a pétala estica para fora do centro, como um rastro de velocidade
        const angle = Math.atan2(py, px);
        ctx.rotate(angle);
        ctx.scale(1 + Math.min(2.6, (rush * 20) / p.z), 1);
        ctx.rotate(-angle);
      }
      ctx.rotate(p.rot);
      ctx.scale(1, Math.max(0.14, Math.abs(Math.cos(p.flip))));
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.moveTo(0, -s);
      ctx.bezierCurveTo(s * 1.05, -s * 0.75, s * 0.85, s * 0.7, 0, s);
      ctx.bezierCurveTo(-s * 0.85, s * 0.7, -s * 1.05, -s * 0.75, 0, -s);
      ctx.fill();
      // um reflexo claro, para a pétala não ficar chapada
      ctx.globalAlpha = alpha * 0.28;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.ellipse(-s * 0.22, -s * 0.2, s * 0.26, s * 0.5, 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function frame(now) {
    if (!running) return;
    const elapsed = (now - last) / 1000;
    last = now;
    step(Math.min(0.05, elapsed), elapsed);
    draw();
    requestAnimationFrame(frame);
  }

  function start() {
    if (running) return;
    running = true;
    last = performance.now();
    requestAnimationFrame(frame);
  }

  function pause() { running = false; }

  /* Anda para frente: traz todas as pétalas para mais perto. */
  function advance(dz) {
    rush = Math.max(rush, dz);
    for (const p of petals) {
      p.z -= dz;
      const sx = p.x / p.z;
      const sy = p.y / p.z;
      if (p.z <= Z_NEAR) {
        place(p, rand(Z_FAR * 0.55, Z_FAR), false);
      } else if (Math.abs(sx) > W / 2 + 80 || Math.abs(sy) > H / 2 + 80) {
        // saiu de vista pelos lados: volta lá no fundo
        place(p, rand(Z_FAR * 0.45, Z_FAR), false);
      }
    }
  }

  /* Um punhado de pétalas salta de um ponto da tela (quando uma carta se abre). */
  function burst(sx, sy, count = 28) {
    if (reduce) return;
    for (let i = 0; i < count; i++) {
      const p = petals[(Math.random() * petals.length) | 0];
      const z = rand(0.8, 1.9);
      const angle = rand(0, Math.PI * 2);
      const force = rand(160, 460);
      p.z = z;
      p.x = (sx - W / 2) * z;
      p.y = (sy - H / 2) * z;
      p.vx = Math.cos(angle) * force * z;
      p.vy = (Math.sin(angle) * force - 150) * z;
      p.age = 1;
    }
  }

  /* Uma rajada de vento empurra todas para um lado (quando o pergaminho se fecha). */
  function gust(direction = 1) {
    if (reduce) return;
    for (const p of petals) p.vx += direction * rand(140, 380) * p.z;
  }

  window.addEventListener("resize", resize);
  resize();

  return { start, pause, advance, burst, gust };
})();
