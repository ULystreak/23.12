/* Monta um capítulo dentro do pergaminho, abre, e espera ela fechar. */

window.Chapters = (() => {
  const $ = (id) => document.getElementById(id);
  const scroll = $("scroll");
  const sheet = $("sheet");
  const bg = $("chapter-bg");
  const view = $("chapter");
  const osd = $("chapter-osd");
  const thread = $("scroll-thread");
  const themeColor = document.querySelector('meta[name="theme-color"]');
  const THEME = { poppy: "#0b1f2b", yourname: "#090e33" };
  // No seu computador, imagem faltando vira um aviso. No site publicado, o espaço simplesmente some.
  const authoring = ["localhost", "127.0.0.1", ""].includes(location.hostname);
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  /* Quebra um texto em palavras, para elas entrarem uma a uma (a cascata fica no CSS). */
  function words(node, text) {
    node.replaceChildren();
    String(text).split(" ").forEach((word, i) => {
      const span = el("span", "word", word);
      span.style.setProperty("--i", i);
      node.append(span, " ");
    });
  }

  /* ---------- fundo de cada tema ---------- */

  /* O grão da fita: um ruído pequeno, repetido e deslocado a cada passo. */
  let grainUrl = null;
  function grain() {
    if (grainUrl) return grainUrl;
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const ctx = c.getContext("2d");
    const img = ctx.createImageData(128, 128);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() < 0.5 ? 255 : 0; // pontos claros e escuros, quase todos transparentes
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = Math.random() * 110;
    }
    ctx.putImageData(img, 0, 0);
    grainUrl = `url(${c.toDataURL()})`;
    return grainUrl;
  }

  const BACKDROPS = {
    poppy: ["pp-light", "pp-blob pp-blob--r", "pp-blob pp-blob--b", "pp-blob pp-blob--y", "pp-blob pp-blob--g", "pp-floor", "pp-dust"],
    yourname: ["yn-day", "yn-night", "yn-stars", "yn-stars yn-stars--far", "yn-comet"],
  };

  let sky = null;   // o céu em WebGL do capítulo do filme, quando dá
  let photo = null; // a imagem de fundo opcional

  function backdrop(config) {
    bg.replaceChildren();
    bg.className = `scroll__bg bg--${config.tema}`;
    sky = null;
    photo = null;

    if (config.tema === "yourname") {
      sky = window.Sky.create(bg);
      if (sky) bg.classList.add("has-sky");
    }
    for (const name of BACKDROPS[config.tema] || []) bg.append(el("div", name));
    if (config.tema === "poppy") {
      bg.insertBefore(window.Scenes.build("fabrica"), bg.querySelector(".pp-floor"));
      bg.insertBefore(window.Scenes.build("lampada"), bg.querySelector(".pp-floor"));
    }
    if (config.tema === "yourname" && !sky) bg.append(window.Scenes.build("serra"));
    if (config.tema === "poppy" && !reduce) {
      const g = el("div", "pp-grain");
      g.style.backgroundImage = grain();
      bg.append(g);
    }
    const veil = el("div", "bg-veil");
    bg.append(veil);

    if (config.fundo) {
      // a foto só entra se o arquivo existir; sem ela fica o fundo desenhado
      const probe = new Image();
      probe.onload = () => {
        if (!veil.isConnected) return;
        photo = el("div", "bg-photo");
        photo.style.backgroundImage = `url("${encodeURI(config.fundo)}")`;
        bg.insertBefore(photo, bg.querySelector(".pp-grain") || veil);
      };
      probe.src = config.fundo;
    }
  }

  /* ---------- os avisos da fita (tema do jogo) ---------- */

  function osdPoppy(config) {
    osd.replaceChildren();
    osd.className = "scroll__osd osd--poppy";
    const play = el("span", "osd__play", "PLAY");
    const tag = el("span", "osd__tag", config.etiqueta || "");
    const counter = el("span", "osd__counter", "SP 0:00:00");
    osd.append(play, tag, counter);
    const t0 = Date.now();
    const pad = (n) => String(n).padStart(2, "0");
    const timer = setInterval(() => {
      const s = Math.floor((Date.now() - t0) / 1000);
      counter.textContent = `SP ${Math.floor(s / 3600)}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
    }, 1000);
    return () => { clearInterval(timer); osd.replaceChildren(); osd.className = "scroll__osd"; };
  }

  /* De vez em quando a fita perde o tracking por um instante. */
  function glitches() {
    if (reduce) return () => {};
    let timer = 0;
    const hit = () => {
      sheet.classList.add("is-glitch");
      setTimeout(() => sheet.classList.remove("is-glitch"), 280);
      timer = setTimeout(hit, 5500 + Math.random() * 5500);
    };
    timer = setTimeout(hit, 2800);
    return () => clearTimeout(timer);
  }

  /* ---------- blocos ---------- */

  function title(config) {
    const h = el("h1", "ch__title");
    if (config.tema !== "poppy") {
      words(h, config.titulo);
      return h;
    }
    // no tema do jogo, cada letra ganha uma cor de brinquedo
    h.setAttribute("aria-label", config.titulo);
    let i = 0;
    for (const word of config.titulo.split(" ")) {
      const span = el("span", "ch__word");
      span.setAttribute("aria-hidden", "true");
      for (const letter of word) {
        const block = el("span", "ch__letter", letter);
        block.style.setProperty("--i", i++); // ordem em que as letras caem
        span.append(block);
      }
      h.append(span, " ");
    }
    return h;
  }

  /* A capa do capítulo: uma imagem de ponta a ponta. Some se o arquivo faltar. */
  function cover(config) {
    const fig = el("figure", "cover reveal");
    const img = el("img");
    img.alt = "";
    img.onerror = () => fig.remove();
    img.src = config.capa;
    fig.append(img);
    return fig;
  }

  /* Duas imagens que se completam, ligadas pelo fio vermelho. */
  function pair(b) {
    const wrap = el("div", "pair reveal");
    const frames = el("div", "pair__frames");
    const captions = el("div", "pair__captions");
    [[b.esquerda, b.legendaEsquerda, "a"], [b.direita, b.legendaDireita, "b"]].forEach(([arquivo, legenda, side]) => {
      const img = el("img", `pair__img pair__img--${side}`);
      img.alt = legenda || "";
      img.onerror = () => {
        if (!authoring) {
          wrap.hidden = true;
          return;
        }
        wrap.className = "shot shot--empty reveal is-in";
        wrap.replaceChildren(el("div", "shot__frame", `Falta a imagem ${arquivo}. Salve um arquivo com esse nome, ou apague este bloco em js/content.js.`));
      };
      img.src = arquivo;
      frames.append(img);
      captions.append(el("span", "", legenda || ""));
    });
    frames.append(window.Scenes.build("fio"));
    wrap.append(frames, captions);
    return wrap;
  }

  /* Uma cena desenhada. O cordão pode vir de uma imagem (arquivo), com o SVG de reserva. */
  function scene(b) {
    const wrap = el("div", `stage stage--${b.cena} reveal`);
    const draw = () => {
      const art = window.Scenes.build(b.cena);
      if (!art) return false;
      const label = art.querySelector("[data-label]");
      if (label) label.textContent = b.rotulo || "";
      wrap.replaceChildren(art);
      return true;
    };
    if (b.arquivo) {
      const img = el("img", "stage__img");
      img.alt = "";
      img.onerror = () => { if (!draw()) wrap.remove(); };
      img.src = b.arquivo;
      wrap.append(img);
      return wrap;
    }
    if (!draw()) {
      console.warn(`Cena desconhecida em js/content.js: "${b.cena}"`);
      return null;
    }
    return wrap;
  }

  function block(b) {
    if (b.tipo === "par") return pair(b);
    if (b.tipo === "cena") return scene(b);

    if (b.tipo === "texto") {
      const card = el("div", "glass reveal");
      for (const para of String(b.texto || "").split(/\n\s*\n/)) {
        if (para.trim()) card.append(el("p", "", para.trim()));
      }
      return card;
    }

    if (b.tipo === "imagem") {
      const fig = el("figure", "shot reveal");
      const box = el("div", "shot__frame");
      const missing = (message) => {
        if (!authoring) {
          fig.hidden = true;
          return;
        }
        fig.classList.add("shot--empty");
        box.textContent = message;
      };
      if (b.arquivo) {
        const img = el("img");
        img.alt = b.legenda || "";
        img.onerror = () => missing(`Falta a imagem ${b.arquivo}. Salve um arquivo com esse nome, ou apague este bloco em js/content.js.`);
        img.src = b.arquivo;
        box.append(img);
      } else {
        missing('Preencha "arquivo" neste bloco em js/content.js, ou apague o bloco.');
      }
      if (b.largura === "cheia") fig.classList.add("shot--wide");
      fig.append(box);
      if (b.legenda) fig.append(el("figcaption", "", b.legenda));
      return fig;
    }

    console.warn(`Tipo de bloco desconhecido em js/content.js: "${b.tipo}"`);
    return null;
  }

  function render(config) {
    backdrop(config);
    scroll.dataset.tema = config.tema;

    const ch = el("article", `ch ch--${config.tema}`);
    // com capa, a imagem abre o capítulo; sem capa, a etiqueta fica solta no canto
    // (no tema do jogo a etiqueta vai para os avisos da fita)
    if (config.capa) ch.append(cover(config));
    else if (config.etiqueta && config.tema !== "poppy") ch.append(el("p", "ch__tag", config.etiqueta));
    const head = el("header", "ch__head reveal");
    head.append(title(config));
    ch.append(head);

    for (const b of config.blocos || []) {
      const node = block(b);
      if (node) ch.append(node);
    }

    const end = el("div", "ch__end reveal");
    const close = el("button", "ch__close", config.fechar || "Fechar este capítulo");
    close.type = "button";
    end.append(close);
    ch.append(end);

    view.replaceChildren(ch);
    view.scrollTop = 0;
    return close;
  }

  /* Rótulos compridos demais são apertados para caber na fita. */
  function fitLabels() {
    for (const label of view.querySelectorAll("[data-label]")) {
      if (label.getComputedTextLength() > 256) {
        label.setAttribute("textLength", "256");
        label.setAttribute("lengthAdjust", "spacingAndGlyphs");
      }
    }
  }

  function watch() {
    const seen = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-in");
        seen.unobserve(entry.target);
      }
    }, { root: view, rootMargin: "0px 0px -10% 0px", threshold: 0.15 });
    view.querySelectorAll(".reveal").forEach((node) => seen.observe(node));
    return seen;
  }

  /* O que acompanha a rolagem: o fio na borda, o céu que anoitece, o piso que anda,
     a capa que fica para trás. Cada camada recebe o valor direto, sem variável herdada. */
  function follow(config) {
    const layers = reduce ? [] : [
      [bg.querySelector(".yn-day"), (n, p) => { n.style.opacity = Math.max(0, 1 - p * 2.2).toFixed(3); }],
      [bg.querySelector(".yn-night"), (n, p) => { n.style.opacity = Math.max(0, (p - 0.45) / 0.55 * 0.94).toFixed(3); }],
      [bg.querySelector(".yn-hills"), (n, p) => { n.style.translate = `0 ${(p * 16).toFixed(1)}px`; }],
      [bg.querySelector(".yn-stars:not(.yn-stars--far)"), (n, p) => { n.style.translate = `0 ${(p * -36).toFixed(1)}px`; n.style.opacity = Math.min(1, p * 1.6).toFixed(3); }],
      [bg.querySelector(".yn-stars--far"), (n, p) => { n.style.translate = `0 ${(p * -16).toFixed(1)}px`; n.style.opacity = Math.min(0.55, p).toFixed(3); }],
      [bg.querySelector(".pp-floor"), (n, p, y) => { n.style.backgroundPositionY = `${(y * 0.45).toFixed(0)}px`; }],
      [view.querySelector(".cover img"), (n, p, y) => { n.style.translate = `0 ${(y * 0.32).toFixed(1)}px`; }],
    ].filter(([node]) => node);

    const update = () => {
      const max = view.scrollHeight - view.clientHeight;
      const y = view.scrollTop;
      const p = max > 0 ? Math.min(1, y / max) : 0;
      thread.style.scale = `1 ${p.toFixed(4)}`;
      for (const [node, apply] of layers) apply(node, p, y);
      if (sky) sky.setProgress(p);
      // no filme, a foto do lago aparece no auge do crepúsculo e some de novo com a noite
      if (photo && config.tema === "yourname") photo.style.opacity = Math.max(0, 1 - Math.abs(p - 0.5) * 2.4).toFixed(3);
    };
    view.addEventListener("scroll", update, { passive: true });
    update();
    return () => view.removeEventListener("scroll", update);
  }

  /* O papel da carta voa até o alto da tela e vira o rolo fechado do pergaminho. */
  async function fly(from) {
    const ghost = $("ghost");
    const rod = scroll.querySelector(".scroll__rod");
    scroll.hidden = false; // ainda invisível: só para medir onde o rolo fica
    await frame();
    const to = rod.getBoundingClientRect();
    ghost.hidden = false;
    ghost.style.width = `${from.width}px`;
    ghost.style.height = `${from.height}px`;
    const sx = to.width / from.width;
    const sy = Math.max(0.04, (to.height * 0.9) / from.height);
    const anim = ghost.animate([
      { transform: `translate(${from.left}px, ${from.top}px) scale(1, 1)`, filter: "blur(0px)", opacity: 1 },
      { filter: "blur(2px)", opacity: 1, offset: .5 },
      { transform: `translate(${to.left}px, ${to.top + to.height * 0.05}px) scale(${sx}, ${sy})`, filter: "blur(0px)", opacity: 1 },
    ], { duration: 1050, easing: "cubic-bezier(.77, 0, .175, 1)", fill: "forwards" });
    await anim.finished.catch(() => {});
    scroll.classList.add("is-visible");
    await sleep(260);
    ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 250, fill: "forwards" });
    await sleep(250);
    ghost.hidden = true;
    anim.cancel();
  }

  async function play(config, from) {
    const close = render(config);

    if (from && !reduce) {
      await fly(from);
    } else {
      scroll.hidden = false;
      await frame();
      scroll.classList.add("is-visible");
      await sleep(reduce ? 100 : 550);
    }
    view.scrollTop = 0;
    fitLabels();
    if (sky) sky.start();
    scroll.classList.add("is-open");
    themeColor.content = THEME[config.tema] || "#ffffff"; // a barra do navegador acompanha a cena
    window.SFX.paper(1.4);
    const seen = watch();
    const unfollow = follow(config);
    const stopOsd = config.tema === "poppy" ? osdPoppy(config) : () => {};
    const stopGlitch = config.tema === "poppy" ? glitches() : () => {};
    await sleep(reduce ? 400 : 1900);

    const covered = window.innerWidth < 820;
    if (covered) window.Petals.pause();
    view.focus({ preventScroll: true });

    await new Promise((r) => close.addEventListener("click", r, { once: true }));
    close.disabled = true;

    seen.disconnect();
    unfollow();
    stopGlitch();
    themeColor.content = "#ffffff";
    window.Petals.start();
    window.Petals.gust(Math.random() < 0.5 ? -1 : 1); // o pergaminho fecha e levanta um vento
    window.SFX.paper(1.1);
    scroll.classList.remove("is-open");
    await sleep(reduce ? 400 : 1300);
    stopOsd();
    scroll.classList.add("is-leaving"); // o rolo fechado sobe e some
    await sleep(520);
    scroll.classList.remove("is-visible", "is-leaving");
    await sleep(120);
    scroll.hidden = true;
    thread.style.scale = "";
    if (sky) sky.destroy();
    sky = null;
    view.replaceChildren();
    bg.replaceChildren();
  }

  return { play, words };
})();
