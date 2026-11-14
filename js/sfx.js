/* Sons discretos, feitos na hora com Web Audio (nenhum arquivo): o lacre que estala,
   o papel que desliza, o fio que corre, a caneta. Sempre abaixo da música.
   O navegador só libera som depois de um toque: SFX.unlock() roda no primeiro. */

window.SFX = (() => {
  let ctx = null;
  let master = null;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
    } catch (err) {
      return null;
    }
    master = ctx.createGain();
    master.gain.value = 0.2;
    master.connect(ctx.destination);
    return ctx;
  }

  function unlock() {
    const c = ensure();
    if (c && c.state === "suspended") c.resume().catch(() => {});
  }

  /* um pedaço de ruído branco */
  function noise(seconds) {
    const c = ensure();
    const buffer = c.createBuffer(1, Math.ceil(c.sampleRate * seconds), c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buffer;
    return src;
  }

  function ready() {
    const c = ensure();
    return c && c.state === "running" ? c : null;
  }

  /* O lacre: um estalo seco e curto, com um toque grave de cera. */
  function crack() {
    const c = ready();
    if (!c) return;
    const t = c.currentTime;
    const src = noise(0.14);
    const bp = c.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1900;
    bp.Q.value = 0.9;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.9, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    src.connect(bp).connect(g).connect(master);
    src.start(t);

    const o = c.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(170, t);
    o.frequency.exponentialRampToValueAtTime(55, t + 0.13);
    const g2 = c.createGain();
    g2.gain.setValueAtTime(0.0001, t);
    g2.gain.exponentialRampToValueAtTime(0.45, t + 0.005);
    g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(g2).connect(master);
    o.start(t);
    o.stop(t + 0.18);
  }

  /* Papel deslizando: um sopro de ruído que abre e fecha. */
  function paper(seconds = 0.8) {
    const c = ready();
    if (!c) return;
    const t = c.currentTime;
    const src = noise(seconds);
    const lp = c.createBiquadFilter();
    lp.type = "bandpass";
    lp.Q.value = 0.6;
    lp.frequency.setValueAtTime(900, t);
    lp.frequency.linearRampToValueAtTime(3600, t + seconds * 0.6);
    lp.frequency.linearRampToValueAtTime(1500, t + seconds);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.32, t + seconds * 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
    src.connect(lp).connect(g).connect(master);
    src.start(t);
  }

  /* O fio correndo pela tela: um assobio baixo e macio. */
  function whoosh(seconds = 1.6) {
    const c = ready();
    if (!c) return;
    const t = c.currentTime;
    const src = noise(seconds);
    const bp = c.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(260, t);
    bp.frequency.exponentialRampToValueAtTime(1400, t + seconds * 0.7);
    bp.frequency.exponentialRampToValueAtTime(500, t + seconds);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.26, t + seconds * 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
    src.connect(bp).connect(g).connect(master);
    src.start(t);
  }

  /* A caneta no papel: um risco minúsculo por letra. */
  function pen() {
    const c = ready();
    if (!c || reduce) return;
    const t = c.currentTime;
    const src = noise(0.045);
    const hp = c.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 2600 + Math.random() * 1500;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.07 + Math.random() * 0.04, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    src.connect(hp).connect(g).connect(master);
    src.start(t);
  }

  return { unlock, crack, paper, whoosh, pen };
})();
