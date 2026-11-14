/* O roteiro da página: em que ordem as coisas acontecem. */

(() => {
  const C = window.CONTEUDO;
  const $ = (id) => document.getElementById(id);
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const words = window.Chapters.words;

  const world = $("world");
  const approach = $("approach");
  const envelope = $("envelope");
  const hint = $("hint");
  const whisper = $("whisper");
  const trail = $("trail");
  const trailPath = $("trail-path");
  const petals = $("petals");
  const body = envelope.querySelector(".envelope__body"); // o corpo 3D da carta

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const click = (el) => new Promise((r) => el.addEventListener("click", r, { once: true }));

  /* Frases que aparecem palavra por palavra e somem no fundo branco. */
  async function say(lines) {
    for (const text of lines) {
      const line = document.createElement("span");
      words(line, text);
      whisper.replaceChildren(line);
      await frame();
      whisper.classList.add("is-visible");
      await sleep(reduce ? 2200 : 2300 + text.split(" ").length * 110);
      whisper.classList.remove("is-visible");
      await sleep(1100);
    }
    whisper.replaceChildren();
  }

  /* Anda para frente até a próxima carta chegar. */
  function walk(seal) {
    envelope.dataset.seal = seal;
    envelope.classList.remove("is-open");
    body.style.rotate = "";
    body.style.translate = "";
    envelope.disabled = true;
    approach.classList.remove("is-arrived");
    approach.style.setProperty("--s", 0);
    approach.style.setProperty("--o", 0);
    world.classList.remove("is-away");
    world.inert = false;
    hint.classList.remove("is-visible");
    document.body.classList.add("is-walking");

    const FAR = 26;
    const duration = reduce ? 900 : 5800;

    return new Promise((resolve) => {
      const t0 = performance.now();
      let prevZ = FAR;

      const tick = (now) => {
        const t = Math.min(1, (now - t0) / duration);
        const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        const z = FAR + (1 - FAR) * e;

        approach.style.setProperty("--s", (1 / z).toFixed(4));
        approach.style.setProperty("--o", Math.min(1, t * 4).toFixed(3));
        if (!reduce) {
          // de longe ela vem girando no ar; chega de frente
          body.style.setProperty("--ry", `${((1 - e) * 64).toFixed(2)}deg`);
          body.style.setProperty("--rx", `${((1 - e) * -18).toFixed(2)}deg`);
        }
        window.Petals.advance((prevZ - z) * 0.3);
        prevZ = z;

        if (t < 1) return requestAnimationFrame(tick);

        body.style.removeProperty("--ry");
        body.style.removeProperty("--rx");
        document.body.classList.remove("is-walking");
        approach.classList.add("is-arrived");
        envelope.disabled = false;
        hint.classList.add("is-visible");
        resolve();
      };
      requestAnimationFrame(tick);
    });
  }

  async function openEnvelope() {
    await click(envelope);
    envelope.disabled = true;
    hint.classList.remove("is-visible");

    // congela o balanço onde ele está, e deixa a carta endireitar com suavidade ao abrir
    const pose = getComputedStyle(body);
    body.style.rotate = pose.rotate;
    body.style.translate = pose.translate;
    envelope.classList.add("is-open");
    void body.offsetWidth;
    body.style.rotate = "";
    body.style.translate = "";

    // o lacre estoura e solta um punhado de pétalas
    const box = envelope.getBoundingClientRect();
    setTimeout(() => window.Petals.burst(box.left + box.width / 2, box.top + box.height * 0.57), 180);

    await sleep(reduce ? 600 : 2200);
  }

  async function leaveWorld() {
    if (world.classList.contains("is-away")) return;
    world.classList.add("is-away");
    world.inert = true; // a carta escondida não recebe foco nem leitor de tela
    await sleep(700);
    approach.classList.remove("is-arrived");
  }

  /* ---------- a mão e o fio ---------- */

  function sizeTrail() {
    trail.setAttribute("viewBox", `0 0 ${window.innerWidth} ${window.innerHeight}`);
  }

  async function handScene() {
    const hand = $("hand");
    const follow = $("follow");

    words($("hand-text"), C.mao.texto);
    follow.textContent = C.mao.botao;

    // o nome do fio: "akai ito", em japonês e em português
    const note = $("hand-note");
    note.hidden = !C.mao.kanji && !C.mao.legenda;
    words(note, C.mao.legenda || "");
    if (C.mao.kanji) {
      const kanji = document.createElement("span");
      kanji.className = "word";
      kanji.lang = "ja";
      kanji.textContent = C.mao.kanji;
      kanji.style.setProperty("--i", 0);
      note.prepend(kanji);
    }
    hand.hidden = false;
    await frame();
    document.body.classList.add("is-looking"); // o olhar desce: as pétalas sobem na tela
    hand.classList.add("is-visible");
    await sleep(reduce ? 300 : 1700);
    hand.classList.add("is-tied");
    await sleep(reduce ? 300 : 2900);
    hand.classList.add("is-ready");

    await click(follow);
    follow.disabled = true;

    // o fio sai do laço no pulso e vai até onde a carta vai aparecer
    sizeTrail();
    const knot = hand.querySelector(".hand__knot").getBoundingClientRect();
    const x0 = knot.left + knot.width * 0.2;
    const y0 = knot.top + knot.height * 0.5;
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    const below = window.innerHeight + 60;
    trailPath.setAttribute(
      "d",
      `M ${x0 + 30} ${below} C ${x0 + 26} ${y0 + 170}, ${x0 - 12} ${y0 + 60}, ${x0} ${y0} ` +
      `S ${cx - 110} ${cy + 120}, ${cx} ${cy}`
    );
    const length = trailPath.getTotalLength();
    trailPath.style.strokeDasharray = length;
    trailPath.style.strokeDashoffset = length;
    trail.classList.add("is-visible");
    await frame();
    trailPath.style.transition = `stroke-dashoffset ${reduce ? 0.3 : 2.2}s cubic-bezier(.77, 0, .175, 1)`;
    trailPath.style.strokeDashoffset = 0;
    await sleep(reduce ? 400 : 2300);

    document.body.classList.remove("is-looking");
    hand.classList.remove("is-visible", "is-ready");
    await sleep(reduce ? 300 : 1100);
    hand.hidden = true;
  }

  /* ---------- a última carta ---------- */

  async function type(el, text) {
    el.setAttribute("aria-label", text);
    for (const ch of text) {
      el.textContent += ch;
      await sleep(reduce ? 0 : /[,.!?]/.test(ch) ? 480 : 55 + Math.random() * 70);
    }
  }

  async function finale() {
    const final = $("final");
    await leaveWorld();
    final.hidden = false;
    await frame();
    final.classList.add("is-visible");
    await sleep(reduce ? 300 : 2000);
    await type($("final-text"), C.final.frase);
    if (C.final.assinatura) {
      const sign = $("final-sign");
      sign.textContent = C.final.assinatura;
      await sleep(900);
      sign.classList.add("is-visible");
    }
  }

  /* ---------- preparação ---------- */

  /* Espera as letras carregarem, para o texto não trocar de fonte no meio da entrada. */
  const fontsReady = () => Promise.race([document.fonts ? document.fonts.ready : null, sleep(2500)]);

  /* Baixa as imagens dos capítulos durante a abertura, para aparecerem na hora. */
  function preloadImages() {
    const files = new Set();
    for (const song of (C.musica && C.musica.lista) || []) files.add(song.capa);
    for (const chapter of [C.capitulo1, C.capitulo2]) {
      files.add(chapter.capa);
      for (const b of chapter.blocos || []) [b.arquivo, b.esquerda, b.direita].forEach((f) => files.add(f));
    }
    for (const file of files) if (file) new Image().src = file;
  }

  /* No computador, o mundo acompanha de leve o ponteiro: a carta inclina e as pétalas vão para o outro lado. */
  function followPointer() {
    if (reduce || !matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    window.addEventListener("pointermove", (event) => {
      const px = (event.clientX / window.innerWidth - 0.5).toFixed(3);
      const py = (event.clientY / window.innerHeight - 0.5).toFixed(3);
      for (const node of [petals, approach]) {
        node.style.setProperty("--px", px);
        node.style.setProperty("--py", py);
      }
    }, { passive: true });
  }

  /* ---------- o roteiro ---------- */

  async function chapter(config) {
    await leaveWorld();
    await window.Chapters.play(config);
  }

  const steps = [
    ["inicio", async () => {
      await sleep(700);
      await say(C.abertura || []);
      await walk("heart");
      await openEnvelope();
      await leaveWorld();
      await window.Music.pick();
    }],
    ["poppy", () => chapter(C.capitulo1)],
    ["carta2", async () => { await walk("star"); await openEnvelope(); }],
    ["yourname", () => chapter(C.capitulo2)],
    ["mao", handScene],
    ["final", async () => { await walk("none"); await openEnvelope(); await finale(); }],
  ];

  async function main() {
    window.Petals.start();
    sizeTrail();
    window.addEventListener("resize", sizeTrail);
    followPointer();
    preloadImages();

    // Para testar uma parte sem passar por tudo: index.html?cena=poppy
    // (inicio, poppy, carta2, yourname, mao, final)
    const wanted = new URLSearchParams(location.search).get("cena");
    const from = Math.max(0, steps.findIndex(([name]) => name === wanted));
    if (from > 0) {
      world.classList.add("is-away");
      world.inert = true;
    }

    await fontsReady();
    for (const [, run] of steps.slice(from)) await run();
  }

  main();
})();
