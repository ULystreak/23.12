/* A escolha da música e o mini seletor que fica no canto. */

window.Music = (() => {
  const C = window.CONTEUDO.musica;
  const songs = C.lista || [];
  const $ = (id) => document.getElementById(id);

  const picker = $("picker");
  const go = $("picker-go");
  const player = $("player");
  const muteBtn = $("player-mute");
  const songBtn = $("player-song");
  const menu = $("player-menu");
  const vol = $("player-vol");

  const audio = new Audio();
  audio.loop = true;
  audio.preload = "none";

  let level = Math.min(1, Math.max(0, C.volume ?? 0.3));
  let current = -1;
  let playing = false;
  const failed = new Set();

  /* No iPhone o site não consegue mudar o volume do som: a música toca no
     volume do aparelho. Nos outros, ela entra aos poucos e fica baixinha. */
  audio.volume = 0.5;
  const canSetVolume = audio.volume === 0.5;
  let fading = 0;

  function setLevel(value, seconds) {
    clearInterval(fading);
    if (!canSetVolume) return;
    if (!seconds) {
      audio.volume = value;
      return;
    }
    const from = audio.volume;
    const t0 = performance.now();
    fading = setInterval(() => {
      const t = Math.min(1, (performance.now() - t0) / (seconds * 1000));
      audio.volume = from + (value - from) * t;
      if (t === 1) clearInterval(fading);
    }, 40);
  }

  async function play(i) {
    if (i !== current) {
      current = i;
      audio.src = songs[i].arquivo;
    }
    try {
      setLevel(0, 0);
      await audio.play();
      setLevel(level, 1.2);
      playing = true;
      failed.delete(i);
    } catch (err) {
      playing = false;
      failed.add(i);
      console.warn(`Não encontrei a música "${songs[i].arquivo}". Confira o nome do arquivo em js/content.js.`);
    }
    go.disabled = false;
    paint();
  }

  function toggleMute() {
    if (current < 0) return;
    if (playing) {
      audio.pause();
      playing = false;
      paint();
    } else {
      play(current);
    }
  }

  /* Desenha as duas listas (a grande e a do canto) no estado atual. */
  function paint() {
    for (const list of [$("picker-list"), $("player-list")]) {
      list.replaceChildren();
      songs.forEach((song, i) => {
        const li = document.createElement("li");
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "song";
        btn.setAttribute("aria-pressed", String(i === current));
        if (i === current && playing) btn.classList.add("is-playing");

        const disc = document.createElement("span");
        disc.className = "disc";
        const text = document.createElement("span");
        text.className = "song__text";
        const title = document.createElement("span");
        title.className = "song__title";
        title.textContent = song.titulo;
        const by = document.createElement("span");
        by.className = "song__by";
        by.textContent = failed.has(i)
          ? `Arquivo não encontrado: ${song.arquivo}`
          : song.artista || "";
        if (failed.has(i)) by.classList.add("is-error");

        text.append(title, by);
        btn.append(disc, text);
        btn.addEventListener("click", () => play(i));
        li.append(btn);
        list.append(li);
      });
    }

    const song = songs[current];
    songBtn.textContent = song ? song.titulo : "";
    muteBtn.classList.toggle("is-playing", playing);
    muteBtn.setAttribute("aria-pressed", String(!playing));
    muteBtn.setAttribute("aria-label", playing ? "Pausar a música" : "Tocar a música");
  }

  function closeMenu() {
    menu.hidden = true;
    songBtn.setAttribute("aria-expanded", "false");
  }

  muteBtn.addEventListener("click", toggleMute);

  songBtn.addEventListener("click", () => {
    menu.hidden = !menu.hidden;
    songBtn.setAttribute("aria-expanded", String(!menu.hidden));
  });

  document.addEventListener("click", (event) => {
    if (!menu.hidden && !player.contains(event.target)) closeMenu();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMenu();
  });

  vol.closest(".player__vol").hidden = !canSetVolume;
  vol.value = Math.round(level * 100);
  vol.addEventListener("input", () => {
    level = vol.value / 100;
    if (playing) setLevel(level, 0.1);
  });

  /* Mostra a escolha e espera ela tocar em "Abrir a carta". */
  function pick() {
    if (!songs.length) return Promise.resolve();

    $("picker-title").textContent = C.titulo;
    $("picker-lead").textContent = C.texto;
    paint();
    picker.hidden = false;
    requestAnimationFrame(() => requestAnimationFrame(() => picker.classList.add("is-visible")));

    return new Promise((resolve) => {
      go.addEventListener("click", () => {
        picker.classList.remove("is-visible");
        setTimeout(() => {
          picker.hidden = true;
          player.hidden = false;
          resolve();
        }, 650);
      }, { once: true });
    });
  }

  return { pick };
})();
