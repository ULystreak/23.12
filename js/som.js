// Som: o motor de áudio da carta (Web Audio). Música em repetição + efeitos discretos.
//
//   som.destravar()        chamar dentro de um toque/clique (o navegador só libera áudio assim)
//   som.tocar(indice)      toca a faixa `indice` de conteudo.musica.faixas, em loop, com entrada suave
//   som.pausar() / som.retomar()
//   som.volume(v)          0..1; sem argumento devolve o volume atual
//   som.estado             { destravado, tocando, indice, volume, falhou }
//   som.aoMudar(fn)        fn(estado) a cada mudança; devolve a função que cancela
//   som.efeito(nome)       'lacre' | 'papel' | 'desenrolar' | 'toque' | 'caneta' | 'fita' | 'mola' | 'brilho'
//   som.abafar(fator, ms)  abaixa a música para `fator` (0..1) por `ms` milissegundos e volta
//   som.diagnostico()      (só para testes) estado interno: contexto, ganho, tempo da faixa
//
// A música passa por <audio> → MediaElementSource → GainNode, porque no iPhone
// `audio.volume` não tem efeito. Se o Web Audio faltar, cai para `audio.volume`.
// Com ?mudo=1 (ou se qualquer coisa do áudio falhar) tudo vira silêncio sem erro:
// o estado continua mudando, para a interface se comportar igual.

import { clamp } from './nucleo/util.js';

const ENTRADA = 1.8;   // s: a música chega devagar
const SAIDA = 0.45;    // s
const TETO_EFEITO = 0.5; // os efeitos ficam sempre abaixo da música

export function criarSom(conteudo, amb) {
  const faixas = Array.isArray(conteudo?.musica?.faixas) ? conteudo.musica.faixas : [];
  const volumeInicial = clamp(Number(conteudo?.musica?.volumeInicial ?? 0.3) || 0.3, 0, 1);
  const mudo = !!amb?.mudo;

  const estado = { destravado: false, tocando: false, indice: -1, volume: volumeInicial, falhou: false };
  const ouvintes = new Set();

  let ctx = null;            // AudioContext
  let audio = null;          // <audio> da música
  let ganhoMusica = null;    // volume + entradas e saídas
  let ganhoAbafar = null;    // abafar()
  let ganhoEfeitos = null;
  let ruido = null;          // buffer de ruído branco para os efeitos
  let pausaPendente = 0;
  let voltaAbafar = 0;
  let pausadoPelaAba = false;
  let rampaReserva = 0;

  function emitir() {
    for (const fn of ouvintes) {
      try { fn(estado); } catch (erro) { console.error(erro); }
    }
  }

  // ---- montagem (só dentro de um gesto) -----------------------------------

  function montar() {
    if (mudo || audio) return;
    try {
      audio = new Audio();
      audio.loop = true;
      audio.preload = 'auto';
      audio.playsInline = true;
      audio.setAttribute('playsinline', '');
      audio.addEventListener('error', () => {
        if (!audio.getAttribute('src')) return;
        estado.tocando = false;
        estado.falhou = true;
        emitir();
      });
    } catch {
      audio = null;
      return;
    }

    try {
      const Contexto = window.AudioContext || window.webkitAudioContext;
      if (!Contexto) return;
      ctx = new Contexto({ latencyHint: 'interactive' });
      ganhoMusica = ctx.createGain();
      ganhoAbafar = ctx.createGain();
      ganhoEfeitos = ctx.createGain();
      ganhoMusica.gain.value = 0;
      ganhoEfeitos.gain.value = TETO_EFEITO;
      ctx.createMediaElementSource(audio).connect(ganhoMusica);
      ganhoMusica.connect(ganhoAbafar).connect(ctx.destination);
      ganhoEfeitos.connect(ctx.destination);
    } catch {
      // Sem Web Audio: a música ainda toca pelo <audio>, só sem efeitos.
      ctx = null;
      ganhoMusica = ganhoAbafar = ganhoEfeitos = null;
    }
  }

  function acordar() {
    if (ctx && ctx.state !== 'running') ctx.resume().catch(() => {});
  }

  /** Leva o volume da música até `valor` em `segundos`. */
  function rampa(valor, segundos) {
    if (!audio) return;
    if (ctx && ganhoMusica) {
      const agora = ctx.currentTime;
      const g = ganhoMusica.gain;
      g.cancelScheduledValues(agora);
      g.setValueAtTime(g.value, agora);
      g.linearRampToValueAtTime(valor, agora + Math.max(0.01, segundos));
      return;
    }
    // Reserva sem Web Audio (não funciona no iPhone, mas lá o Web Audio existe).
    cancelAnimationFrame(rampaReserva);
    const inicio = performance.now();
    const de = audio.volume;
    const passo = (t) => {
      const k = clamp((t - inicio) / (segundos * 1000));
      audio.volume = clamp(de + (valor - de) * k);
      if (k < 1) rampaReserva = requestAnimationFrame(passo);
    };
    rampaReserva = requestAnimationFrame(passo);
  }

  function zerar() {
    if (ctx && ganhoMusica) {
      const agora = ctx.currentTime;
      ganhoMusica.gain.cancelScheduledValues(agora);
      ganhoMusica.gain.setValueAtTime(0, agora);
    } else if (audio) {
      cancelAnimationFrame(rampaReserva);
      audio.volume = 0;
    }
  }

  // ---- API ------------------------------------------------------------------

  const som = {
    estado,

    /** Faixas válidas (com arquivo). O seletor usa isto para saber se há o que mostrar. */
    get faixas() { return faixas; },

    destravar() {
      if (!estado.destravado) {
        estado.destravado = true;
        montar();
        emitir();
      }
      acordar();
      return Promise.resolve();
    },

    async tocar(indice) {
      const faixa = faixas[indice];
      if (!faixa || typeof faixa.arquivo !== 'string' || !faixa.arquivo.trim()) return false;

      som.destravar();
      clearTimeout(pausaPendente);
      const trocou = estado.indice !== indice;
      estado.indice = indice;
      estado.tocando = true;
      estado.falhou = false;
      emitir();
      if (mudo || !audio) return true;

      try {
        if (trocou || !audio.getAttribute('src')) {
          zerar();
          audio.src = faixa.arquivo;
        }
        // play() precisa sair ainda dentro do gesto: nada de await antes daqui.
        await audio.play();
        rampa(estado.volume, ENTRADA);
        return true;
      } catch {
        // Arquivo que falta ou navegador que recusou: segue em silêncio.
        if (estado.indice === indice) {
          estado.tocando = false;
          estado.falhou = true;
          emitir();
        }
        return false;
      }
    },

    pausar() {
      if (!estado.tocando) return;
      estado.tocando = false;
      emitir();
      if (mudo || !audio) return;
      rampa(0, SAIDA);
      clearTimeout(pausaPendente);
      pausaPendente = setTimeout(() => { try { audio.pause(); } catch { /* nada */ } }, SAIDA * 1000 + 40);
    },

    retomar() {
      if (estado.tocando || estado.indice < 0) return;
      return som.tocar(estado.indice);
    },

    volume(v) {
      if (v === undefined) return estado.volume;
      estado.volume = clamp(Number(v) || 0, 0, 1);
      if (estado.tocando) rampa(estado.volume, 0.12);
      emitir();
      return estado.volume;
    },

    aoMudar(fn) {
      ouvintes.add(fn);
      return () => ouvintes.delete(fn);
    },

    abafar(fator = 0.4, ms = 600) {
      if (mudo || !ctx || !ganhoAbafar) return;
      const agora = ctx.currentTime;
      const g = ganhoAbafar.gain;
      g.cancelScheduledValues(agora);
      g.setValueAtTime(g.value, agora);
      g.linearRampToValueAtTime(clamp(fator, 0, 1), agora + 0.15);
      clearTimeout(voltaAbafar);
      voltaAbafar = setTimeout(() => {
        if (!ctx) return;
        const t = ctx.currentTime;
        g.cancelScheduledValues(t);
        g.setValueAtTime(g.value, t);
        g.linearRampToValueAtTime(1, t + 0.5);
      }, Math.max(0, ms));
    },

    /** Só para testes e depuração: o que o motor está fazendo agora. */
    diagnostico() {
      return {
        mudo,
        webAudio: !!ctx,
        contexto: ctx ? ctx.state : null,
        ganho: ganhoMusica ? ganhoMusica.gain.value : (audio ? audio.volume : 0),
        tempo: audio ? audio.currentTime : 0,
        pausado: audio ? audio.paused : true,
        fonte: audio ? audio.getAttribute("src") || "" : "",
      };
    },

    efeito(nome) {
      if (mudo || !ctx || !ganhoEfeitos || ctx.state !== 'running') return;
      try {
        const receita = EFEITOS[nome];
        if (receita) receita(ferramentas());
      } catch { /* efeito nunca derruba a cena */ }
    },
  };

  // ---- efeitos sintetizados (provisórios: bips bem discretos) ----------------

  function ferramentas() {
    const agora = ctx.currentTime;
    return {
      /** Um tom curto: { tipo, de, para, dur, ganho, atraso } */
      tom({ tipo = 'sine', de = 440, para = de, dur = 0.12, ganho = 0.08, atraso = 0 }) {
        const t = agora + atraso;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = tipo;
        osc.frequency.setValueAtTime(de, t);
        if (para !== de) osc.frequency.exponentialRampToValueAtTime(Math.max(20, para), t + dur);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(ganho, t + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        osc.connect(g).connect(ganhoEfeitos);
        osc.start(t);
        osc.stop(t + dur + 0.02);
      },
      /** Um sopro de ruído filtrado: { filtro, de, para, dur, ganho, atraso } */
      sopro({ filtro = 'bandpass', de = 2000, para = de, dur = 0.2, ganho = 0.05, atraso = 0 }) {
        if (!ruido) {
          ruido = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
          const dados = ruido.getChannelData(0);
          for (let i = 0; i < dados.length; i++) dados[i] = Math.random() * 2 - 1;
        }
        const t = agora + atraso;
        const fonte = ctx.createBufferSource();
        const f = ctx.createBiquadFilter();
        const g = ctx.createGain();
        fonte.buffer = ruido;
        f.type = filtro;
        f.frequency.setValueAtTime(de, t);
        if (para !== de) f.frequency.exponentialRampToValueAtTime(Math.max(40, para), t + dur);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(ganho, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        fonte.connect(f).connect(g).connect(ganhoEfeitos);
        fonte.start(t);
        fonte.stop(t + dur + 0.02);
      },
    };
  }

  const EFEITOS = {
    lacre: ({ tom, sopro }) => { tom({ tipo: 'triangle', de: 190, para: 80, dur: 0.14, ganho: 0.1 }); sopro({ de: 3200, dur: 0.06, ganho: 0.04 }); },
    papel: ({ sopro }) => sopro({ filtro: 'highpass', de: 1800, para: 4200, dur: 0.22, ganho: 0.04 }),
    desenrolar: ({ sopro }) => sopro({ filtro: 'lowpass', de: 500, para: 2600, dur: 0.6, ganho: 0.045 }),
    toque: ({ tom }) => tom({ de: 620, para: 760, dur: 0.09, ganho: 0.05 }),
    caneta: ({ sopro }) => sopro({ de: 5200, dur: 0.045, ganho: 0.02 }),
    fita: ({ tom, sopro }) => { tom({ tipo: 'square', de: 110, dur: 0.08, ganho: 0.03 }); sopro({ de: 900, dur: 0.12, ganho: 0.03 }); },
    mola: ({ tom }) => tom({ tipo: 'triangle', de: 220, para: 520, dur: 0.22, ganho: 0.06 }),
    brilho: ({ tom }) => { tom({ de: 1320, dur: 0.5, ganho: 0.03 }); tom({ de: 1980, dur: 0.6, ganho: 0.02, atraso: 0.05 }); },
  };

  // ---- aba escondida: a música espera -----------------------------------------

  document.addEventListener('visibilitychange', () => {
    if (mudo || !audio) return;
    if (document.hidden) {
      if (estado.tocando && !audio.paused) {
        pausadoPelaAba = true;
        try { audio.pause(); } catch { /* nada */ }
      }
    } else if (pausadoPelaAba) {
      pausadoPelaAba = false;
      acordar();
      if (estado.tocando) audio.play().catch(() => {});
    }
  });

  return som;
}
