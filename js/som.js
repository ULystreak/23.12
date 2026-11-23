/* ============================================================================
   SOM: o motor de áudio da carta (Web Audio)
   ============================================================================
   Toca a música de fundo, uma faixa por vez, por um <audio> ligado a uma
   cadeia de ganhos (volume da música → abafar → saída), sintetiza os nove
   efeitos curtos sem arquivo nenhum (lacre, papel, desenrolar, toque, caneta,
   fita, mola, brilho, caixinha), toca a fala curta da abertura (falar) e
   abaixa a música para outros sons (abafar).

   iPhone: nada de AudioContext nem <audio> antes do primeiro gesto dela
   (destravar); o play() sai na pilha do gesto, sem await antes; audio.volume
   não tem efeito, por isso a música passa pelo Web Audio; audioSession
   'playback' vence a chave de silencioso. Sem Web Audio, a música toca direto
   pelo <audio> e só os efeitos somem. Com ?mudo=1, ou se o áudio falhar, tudo
   vira silêncio sem erro, mas `estado` continua mudando: a interface se
   comporta igual.
   ========================================================================== */

import { clamp, semente, espera } from './nucleo/util.js';

const ENTRADA = 1.8; // s: a música chega devagar
const SAIDA = 0.45; // s: no pausar, o volume desce e o <audio> pausa 40 ms depois
const TENTATIVAS = 3; // a primeira e mais duas, com 1,5 s entre elas, com o disco girando
const VOLUME_PADRAO = 0.3;
// Rolar a folha com o dedo não termina em pointerup: por isso quatro gestos.
const GESTOS = ['pointerup', 'touchend', 'click', 'keydown'];

const ruidos = new WeakMap();

/** Ruído branco de 2 s, um por contexto, sempre a mesma sequência (semente 2312). */
function bufferDeRuido(c) {
  let b = ruidos.get(c);
  if (!b) {
    b = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const dados = b.getChannelData(0);
    const acaso = semente(2312);
    for (let i = 0; i < dados.length; i++) dados[i] = acaso() * 2 - 1;
    ruidos.set(c, b);
  }
  return b;
}

/** Agenda pontos [t, valor, 'exp'?] num AudioParam, com t em segundos a partir de t0. */
function curva(param, t0, pontos) {
  pontos.forEach(([t, v, modo], i) => {
    if (i === 0) param.setValueAtTime(v, t0 + t);
    else if (modo === 'exp') param.exponentialRampToValueAtTime(Math.max(v, 0.0001), t0 + t);
    else param.linearRampToValueAtTime(v, t0 + t);
  });
}

/** As peças das receitas, todas presas ao mesmo t0 e à mesma saída. */
function caixa(c, saida, t0) {
  const ganho = (x) => {
    const g = c.createGain();
    if (Array.isArray(x)) curva(g.gain, t0, x);
    else g.gain.value = x;
    return g;
  };
  const filtro = (tipo, f, q = 0.7) => {
    const b = c.createBiquadFilter();
    b.type = tipo;
    b.frequency.value = f;
    b.Q.value = q;
    return b;
  };
  const osc = (tipo, f, a, b) => {
    const o = c.createOscillator();
    o.type = tipo;
    o.frequency.value = f;
    o.start(t0 + a);
    o.stop(t0 + b);
    return o;
  };
  const ruido = (a, b, desloc = 0) => {
    const s = c.createBufferSource();
    s.buffer = bufferDeRuido(c);
    s.loop = true;
    s.start(t0 + a, desloc % 2);
    s.stop(t0 + b);
    return s;
  };
  // Ruído lido devagar: o valor muda `hz` vezes por segundo (um "acaso" para modular).
  const acaso = (hz, a, b, desloc = 0) => {
    const s = ruido(a, b, desloc);
    s.playbackRate.value = hz / c.sampleRate;
    return s;
  };
  const em = (param, pontos) => curva(param, t0, pontos);
  const liga = (...nos) => {
    for (let i = 0; i < nos.length - 1; i++) nos[i].connect(nos[i + 1]);
    nos[nos.length - 1].connect(saida);
  };
  const modula = (fonte, param, quanto) => {
    const g = ganho(quanto);
    fonte.connect(g);
    g.connect(param);
  };
  return { ganho, filtro, osc, ruido, acaso, em, liga, modula };
}

/* ---- receitas --------------------------------------------------------------
   nivel = pico na saída com o volume inicial (~18 dB abaixo da música);
   bruto = pico cru da receita. O ganho de saída é nivel / bruto. Cada tocar()
   devolve a duração em segundos. Os nomes são chamados por string nas cenas. */

function pulso() {
  const pontos = [[0, 0.0001]];
  for (let t = 0.02, p = 0.17; t < 1.01; t += p, p *= 0.9) {
    pontos.push([t + 0.035, 1], [t + 0.82 * p, 0.32, 'exp']);
  }
  pontos.push([1.15, 0.0001, 'exp']);
  return pontos;
}

const RECEITAS = {
  // O lacre que se parte: três grãos secos e um corpo grave que afunda.
  lacre: {
    nivel: 0.04,
    bruto: 1,
    tocar({ ganho, filtro, osc, ruido, em, liga }) {
      for (const [t, a] of [[0, 1], [0.013, 0.5], [0.034, 0.28]]) {
        liga(
          ruido(t, t + 0.03, 0.2 + 9 * t),
          filtro('bandpass', 3300 - 18000 * t, 1.3),
          filtro('highpass', 1700),
          ganho([[t, 0], [t + 0.0015, 1.1 * a], [t + 0.022, 0.0001, 'exp']]),
        );
      }
      const corpo = osc('sine', 190, 0, 0.26);
      em(corpo.frequency, [[0, 190], [0.17, 74, 'exp']]);
      liga(corpo, ganho([[0, 0], [0.005, 0.85], [0.22, 0.0001, 'exp']]));
      const harmonico = osc('triangle', 380, 0, 0.15);
      em(harmonico.frequency, [[0, 380], [0.11, 150, 'exp']]);
      liga(harmonico, ganho([[0, 0], [0.004, 0.3], [0.12, 0.0001, 'exp']]));
      return 0.26;
    },
  },

  // Uma folha que se mexe. Não lê opções.
  papel: {
    nivel: 0.042,
    bruto: 0.78,
    tocar({ ganho, filtro, ruido, acaso, em, liga, modula }) {
      const banda = filtro('bandpass', 1300, 0.8);
      em(banda.frequency, [[0, 1300], [0.09, 4200, 'exp'], [0.22, 2300, 'exp']]);
      const amasso = ganho(1);
      modula(acaso(90, 0, 0.24, 0.31), amasso.gain, 0.55);
      liga(ruido(0, 0.24, 0.5), filtro('highpass', 900), banda, amasso,
        ganho([[0, 0], [0.03, 1], [0.1, 0.5], [0.22, 0.0001, 'exp']]));
      return 0.24;
    },
  },

  // O pergaminho que desenrola: papel que varre e um rolo de madeira, em batidas que apressam.
  desenrolar: {
    nivel: 0.045,
    bruto: 0.81,
    tocar({ ganho, filtro, ruido, acaso, em, liga, modula }) {
      const batidas = ganho(pulso());
      const banda = filtro('bandpass', 620, 0.7);
      em(banda.frequency, [[0, 620], [0.805, 1900, 'exp'], [1.15, 1300, 'exp']]);
      const amasso = ganho(1);
      modula(acaso(70, 0, 1.17, 0.77), amasso.gain, 0.45);
      liga(ruido(0, 1.17, 1.1), filtro('highpass', 380), banda, amasso, batidas);
      liga(ruido(0, 1.17, 0.05), filtro('lowpass', 240, 0.8), ganho(0.5), batidas);
      return 1.17;
    },
  },

  // O toque da interface: uma gota curta com um clique.
  toque: {
    nivel: 0.04,
    bruto: 1.06,
    tocar({ ganho, filtro, osc, ruido, em, liga }) {
      const gota = osc('sine', 660, 0, 0.1);
      em(gota.frequency, [[0, 660], [0.06, 520, 'exp']]);
      liga(gota, ganho([[0, 0], [0.004, 1], [0.08, 0.0001, 'exp']]));
      liga(osc('sine', 1320, 0, 0.06), ganho([[0, 0], [0.003, 0.22], [0.045, 0.0001, 'exp']]));
      liga(ruido(0, 0.02, 0.9), filtro('bandpass', 2300, 3), ganho([[0, 0], [0.001, 0.3], [0.012, 0.0001, 'exp']]));
      return 0.1;
    },
  },

  // A caneta no papel. Opções: duracao (0,08 a 20 s; 0,9) e intensidade (0 a 1,5; 1).
  caneta: {
    nivel: 0.032,
    bruto: 1.3,
    tocar({ ganho, filtro, ruido, acaso, liga, modula }, opcoes) {
      const d = Number(opcoes?.duracao);
      const k = Number(opcoes?.intensidade);
      const duracao = clamp(Number.isFinite(d) && d > 0 ? d : 0.9, 0.08, 20);
      const intensidade = clamp(Number.isFinite(k) ? k : 1, 0, 1.5);
      const fim = duracao + 0.14;
      const ponta = filtro('bandpass', 3200, 0.9);
      const mao = acaso(11, 0, fim, 1.3);
      modula(mao, ponta.frequency, 850);
      const traco = ganho(1);
      modula(mao, traco.gain, 0.5);
      modula(acaso(140, 0, fim, 0.6), traco.gain, 0.22); // o grão do papel
      liga(ruido(0, fim, 1.7), filtro('highpass', 1700), ponta, traco,
        ganho([[0, 0], [0.035, intensidade], [duracao, intensidade * 0.85], [fim, 0.0001, 'exp']]));
      return fim;
    },
  },

  // A fita que entra no videocassete: duas batidas, o motor e o chiado.
  fita: {
    nivel: 0.038,
    bruto: 0.75,
    tocar({ ganho, filtro, osc, ruido, em, liga, modula }) {
      for (const [t, a] of [[0, 1], [0.075, 0.6]]) {
        liga(ruido(t, t + 0.06, 0.2 + t), filtro('lowpass', 520, 0.9),
          ganho([[t, 0], [t + 0.003, a], [t + 0.05, 0.0001, 'exp']]));
        const baque = osc('triangle', 160, t, t + 0.09);
        em(baque.frequency, [[t, 160], [t + 0.07, 86, 'exp']]);
        liga(baque, ganho([[t, 0], [t + 0.004, 0.7 * a], [t + 0.08, 0.0001, 'exp']]));
      }
      const treme = ganho(1);
      modula(osc('sine', 9, 0.09, 0.54), treme.gain, 0.25);
      liga(osc('sawtooth', 120, 0.09, 0.54), filtro('lowpass', 700, 0.6), treme,
        ganho([[0.09, 0], [0.16, 0.24], [0.36, 0.17], [0.52, 0.0001, 'exp']]));
      liga(ruido(0.09, 0.52, 1.5), filtro('highpass', 4200),
        ganho([[0.09, 0], [0.15, 0.06], [0.5, 0.0001, 'exp']]));
      return 0.54;
    },
  },

  // A mola de brinquedo: dois tons que balançam e assentam.
  mola: {
    nivel: 0.045,
    bruto: 1.11,
    tocar({ ganho, osc, em, liga, modula }) {
      const balanco = osc('sine', 27, 0, 0.46);
      const tom = osc('sine', 250, 0, 0.46);
      em(tom.frequency, [[0, 250], [0.03, 420], [0.42, 232, 'exp']]);
      modula(balanco, tom.frequency, [[0, 70], [0.4, 2, 'exp']]);
      liga(tom, ganho([[0, 0], [0.006, 1], [0.12, 0.5], [0.44, 0.0001, 'exp']]));
      const cima = osc('sine', 840, 0, 0.2);
      modula(balanco, cima.frequency, [[0, 180], [0.18, 4, 'exp']]);
      liga(cima, ganho([[0, 0], [0.004, 0.2], [0.17, 0.0001, 'exp']]));
      return 0.46;
    },
  },

  // Brilho: dó, mi, sol e si da oitava alta, cada nota em duas senoides que batem (cintila).
  brilho: {
    nivel: 0.04,
    bruto: 1.15,
    tocar({ ganho, osc, liga }) {
      const notas = [[2093, 0, 1], [2637, 0.07, 0.8], [3136, 0.15, 0.62], [3951, 0.24, 0.36]];
      for (const [f, t, a] of notas) {
        const g = ganho([[t, 0], [t + 0.17, 0.5 * a], [t + 1, 0.0001, 'exp']]);
        for (const desvio of [-2.2, 2.6]) liga(osc('sine', f + desvio, t, t + 1.02), g);
      }
      return 1.26;
    },
  },

  // A caixinha de música da senha (toca sozinha, no silêncio). Opção: nota (200 a 3000 Hz; 784).
  caixinha: {
    nivel: 0.03,
    bruto: 1.38,
    tocar({ ganho, filtro, osc, ruido, liga }, opcoes) {
      const n = Number(opcoes?.nota);
      const nota = clamp(Number.isFinite(n) && n > 0 ? n : 784, 200, 3000);
      for (const [vezes, a, queda] of [[1, 1, 1.4], [2.76, 0.28, 0.45], [5.4, 0.1, 0.18]]) {
        liga(osc('sine', nota * vezes, 0, queda + 0.02), ganho([[0, 0], [0.002, a], [queda, 0.0001, 'exp']]));
      }
      liga(ruido(0, 0.008, 0.37), filtro('bandpass', 4200, 1.2),
        ganho([[0, 0], [0.0005, 0.22], [0.006, 0.0001, 'exp']]));
      return 1.42;
    },
  },
};

/** Toca a receita `nome` em `destino`. Devolve a duração (0 se o nome não existe). */
function sintetizar(contexto, destino, nome, opcoes, quando) {
  const receita = RECEITAS[nome];
  if (!receita) return 0;
  const t0 = quando ?? contexto.currentTime + 0.005;
  const saida = contexto.createGain();
  saida.gain.value = receita.nivel / receita.bruto;
  saida.connect(destino);
  const duracao = receita.tocar(caixa(contexto, saida, t0), opcoes || {});
  // Solta a saída quando o som acaba: uma visita toca centenas de efeitos.
  setTimeout(() => saida.disconnect(), (t0 - contexto.currentTime + duracao) * 1000 + 250);
  return duracao;
}

/** volumeInicial do content.js. Decisão da v2: 0 é mudo de verdade (a v1 trocava 0 por 0,3). */
function volumeDoConteudo(v) {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? clamp(n, 0, 1) : VOLUME_PADRAO;
}

/* ---- o motor ---------------------------------------------------------------- */

export function criarSom(conteudo, amb) {
  const mudo = !!amb?.mudo;
  // A identidade de uma faixa é a posição no array original, mesmo as sem arquivo
  // (musica.js, estado.indice e ?musica=N contam assim).
  const faixas = Array.isArray(conteudo?.musica?.faixas) ? conteudo.musica.faixas : [];
  const volumeInicial = volumeDoConteudo(conteudo?.musica?.volumeInicial);
  // Os efeitos acompanham o volume dela: no volume inicial, ganho 1. Com volume
  // inicial 0, a régua é o padrão, e os efeitos também começam mudos.
  const regua = volumeInicial > 0 ? volumeInicial : VOLUME_PADRAO;

  const estado = { destravado: false, tocando: false, indice: -1, volume: volumeInicial, falhou: false };
  const ouvintes = new Set();
  const ouvintesTempo = new Set();
  const falas = new Map(); // arquivo → AudioBuffer (null enquanto chega)
  const quebradas = new Set(); // faixas que falharam: a troca automática pula

  let audio = null;
  let ctx = null;
  let ganhoMusica = null;
  let ganhoAbafar = null;
  let ganhoEfeitos = null;
  let pedidos = 0;
  let pedindoPlay = false;
  let recusar = null;
  let pausaPendente = 0;
  let voltaAbafo = 0;
  let rampaQuadro = 0;
  let pausadoPelaAba = false;
  let faladas = 0;

  const arquivoDe = (i) => {
    const a = faixas[i]?.arquivo;
    return typeof a === 'string' ? a.trim() : '';
  };
  const tocaveis = () => faixas.map((_, i) => i).filter((i) => arquivoDe(i) && !quebradas.has(i));
  const nivelEfeitos = () => clamp(estado.volume / regua, 0, 2);

  function emitir() {
    for (const fn of ouvintes) {
      try {
        fn(estado);
      } catch (erro) {
        console.error('[carta] ouvinte do som', erro);
      }
    }
  }

  function progresso() {
    const d = audio?.duration;
    return d && Number.isFinite(d) ? clamp(audio.currentTime / d) : 0;
  }

  function segundos() {
    return audio?.currentTime || 0;
  }

  function emitirTempo() {
    const p = progresso();
    const s = segundos();
    const d = audio?.duration;
    for (const fn of ouvintesTempo) {
      try {
        fn(p, s, d);
      } catch (erro) {
        console.error('[carta] ouvinte do tempo', erro);
      }
    }
  }

  /* ---- ganhos ---- */

  function deslizar(param, valor, s) {
    const agora = ctx.currentTime;
    param.cancelScheduledValues(agora);
    param.setValueAtTime(param.value, agora);
    param.linearRampToValueAtTime(valor, agora + Math.max(0.01, s));
  }

  // O volume da música em `s` segundos. Sem Web Audio, audio.volume quadro a quadro.
  function rampa(valor, s) {
    if (ganhoMusica) {
      deslizar(ganhoMusica.gain, valor, s);
      return;
    }
    if (!audio) return;
    cancelAnimationFrame(rampaQuadro);
    const de = audio.volume;
    const inicio = performance.now();
    const ms = Math.max(10, s * 1000);
    const passo = (agora) => {
      const k = clamp((agora - inicio) / ms);
      audio.volume = de + (valor - de) * k;
      if (k < 1) rampaQuadro = requestAnimationFrame(passo);
    };
    rampaQuadro = requestAnimationFrame(passo);
  }

  // Corte seco: a faixa anterior some na hora.
  function zerar() {
    if (ganhoMusica) {
      const g = ganhoMusica.gain;
      g.cancelScheduledValues(ctx.currentTime);
      g.setValueAtTime(0, ctx.currentTime);
    } else if (audio) {
      cancelAnimationFrame(rampaQuadro);
      audio.volume = 0;
    }
  }

  // O iOS devolve o contexto suspenso (ou 'interrupted') ao voltar de outro app.
  function acordar() {
    if (ctx && ctx.state !== 'running') ctx.resume?.()?.catch?.(() => {});
  }

  /* ---- montagem (no primeiro gesto) ---- */

  function montar() {
    if (mudo || audio) return;
    audio = new Audio();
    audio.preload = 'auto';
    audio.playsInline = true;
    audio.setAttribute('playsinline', '');
    audio.loop = tocaveis().length < 2;
    audio.addEventListener('error', aoErro);
    audio.addEventListener('ended', aoAcabar);
    audio.addEventListener('timeupdate', emitirTempo);
    audio.addEventListener('durationchange', emitirTempo);
    // A primeira faixa já começa a chegar: numa rede de celular, o som só vinha
    // 2 a 3 s depois do toque no disco, e o silêncio parecia falha.
    const primeira = tocaveis()[0];
    if (primeira !== undefined) audio.src = arquivoDe(primeira);

    // Safari 16.4+: sem isso, a chave de silencioso do iPhone emudece a carta.
    try {
      if (navigator.audioSession) navigator.audioSession.type = 'playback';
    } catch {
      /* sem sessão de áudio */
    }

    const Contexto = window.AudioContext || window.webkitAudioContext;
    if (Contexto) {
      try {
        ctx = new Contexto({ latencyHint: 'interactive' });
        ganhoMusica = ctx.createGain();
        ganhoMusica.gain.value = 0;
        ganhoAbafar = ctx.createGain();
        ganhoAbafar.gain.value = 1;
        ganhoEfeitos = ctx.createGain();
        ganhoEfeitos.gain.value = nivelEfeitos();
        // Por último: createMediaElementSource prende o <audio> a este contexto para sempre.
        ctx.createMediaElementSource(audio).connect(ganhoMusica);
        ganhoMusica.connect(ganhoAbafar);
        ganhoAbafar.connect(ctx.destination);
        ganhoEfeitos.connect(ctx.destination);
      } catch (erro) {
        console.warn('[carta] sem Web Audio: a música segue pelo <audio>, sem efeitos', erro);
        try {
          ctx?.close?.()?.catch?.(() => {});
        } catch {
          /* já fechado */
        }
        ctx = ganhoMusica = ganhoAbafar = ganhoEfeitos = null;
      }
    }

    adiantarFala(conteudo?.abertura?.vozArquivo);
    for (const g of GESTOS) window.addEventListener(g, reanimar, { capture: true, passive: true });
  }

  // O iPhone só deixa um <audio> começar dentro de um toque: a fala da abertura
  // vem decodificada para o Web Audio, pronta antes da primeira frase.
  function adiantarFala(arquivo) {
    const a = typeof arquivo === 'string' ? arquivo.trim() : '';
    if (mudo || !ctx || !a || falas.has(a)) return;
    falas.set(a, null);
    fetch(a)
      .then((r) => (r.ok ? r.arrayBuffer() : null))
      .then((dados) => {
        if (!dados) return;
        const guardar = (buffer) => {
          if (buffer) falas.set(a, buffer);
        };
        ctx.decodeAudioData(dados, guardar, () => {})?.catch?.(() => {});
      })
      .catch(() => {
        /* sem a fala: a frase aparece em silêncio */
      });
  }

  /* ---- eventos do <audio>, da aba e dos gestos ---- */

  // O iOS pode recusar o play() sem gesto: o próximo toque, em qualquer lugar, retoma.
  // A rampa é agendada já (no relógio do contexto), não no then do play(): um
  // play() que nunca responde não pode deixar a música presa no ganho 0.
  function reanimar() {
    acordar();
    if (estado.tocando && audio?.paused && !pedindoPlay && !document.hidden) {
      zerar();
      audio.play().catch(() => {});
      rampa(estado.volume, 0.6);
    }
  }

  function falhar(indice) {
    quebradas.add(indice);
    estado.tocando = false;
    estado.falhou = true;
    emitir();
  }

  function aoErro() {
    if (!audio.getAttribute('src') || estado.indice < 0 || !estado.tocando) return;
    // Com um play() em curso, quem decide é a tentativa (um play() sem resposta não prende a música).
    if (pedindoPlay) {
      recusar?.(audio.error);
      return;
    }
    // Rede (MediaError 2): tenta de novo, com load(). Só os outros erros (4, 404) descartam a faixa.
    if (audio.error?.code === 2) {
      tocar(estado.indice);
      return;
    }
    falhar(estado.indice);
  }

  function aoAcabar() {
    if (!estado.tocando) return;
    const lista = tocaveis();
    if (lista.length < 2) {
      audio.currentTime = 0;
      audio.play().catch(() => {});
      return;
    }
    // A próxima; a última volta à primeira.
    tocar(lista[(lista.indexOf(estado.indice) + 1) % lista.length]);
  }

  document.addEventListener('visibilitychange', () => {
    if (mudo || !audio) return;
    if (document.hidden) {
      if (estado.tocando && !audio.paused) {
        pausadoPelaAba = true;
        audio.pause();
      }
      return;
    }
    if (!pausadoPelaAba) return;
    pausadoPelaAba = false;
    acordar();
    if (estado.tocando) audio.play().catch(() => {});
  });

  /* ---- API ---- */

  // Se vier sem gesto (a cena da música chama também), o contexto nasce
  // suspenso e o primeiro gesto dela o acorda (acordar, aqui e em reanimar).
  function destravar() {
    if (!estado.destravado) {
      estado.destravado = true;
      montar();
      emitir();
    }
    acordar();
    return Promise.resolve();
  }

  async function tocar(indice) {
    const arquivo = arquivoDe(indice);
    if (!arquivo) return false;
    destravar();
    clearTimeout(pausaPendente);
    const trocou = estado.indice !== indice;
    estado.indice = indice;
    estado.tocando = true;
    estado.falhou = false;
    emitir();
    if (mudo || !audio) return true;

    const vez = ++pedidos;
    if (trocou) zerar();
    audio.loop = tocaveis().length < 2;
    pedindoPlay = true;
    try {
      for (let tentativa = 0; ; tentativa++) {
        if (audio.getAttribute('src') !== arquivo) {
          audio.src = arquivo;
        } else if (audio.error || audio.networkState === HTMLMediaElement.NETWORK_NO_SOURCE) {
          // O <audio> não recarrega sozinho com o mesmo src: é preciso load().
          zerar();
          audio.load();
        }
        try {
          // Nenhum await antes deste play(): no iPhone ele precisa sair na pilha do gesto.
          await new Promise((resolve, rejeitar) => {
            recusar = rejeitar;
            audio.play().then(resolve, rejeitar);
          });
          if (vez !== pedidos || !estado.tocando || estado.indice !== indice) return false;
          quebradas.delete(indice); // voltou a tocar: entra de novo na troca automática
          rampa(estado.volume, ENTRADA);
          return true;
        } catch (erro) {
          if (vez !== pedidos || !estado.tocando || erro?.name === 'AbortError') return false;
          if (erro?.name === 'NotAllowedError') {
            // Fica mudo até o próximo toque dela.
            estado.tocando = false;
            emitir();
            return false;
          }
          if (tentativa >= TENTATIVAS - 1) {
            falhar(indice);
            return false;
          }
          await espera(1500);
          if (vez !== pedidos || !estado.tocando) return false;
        }
      }
    } finally {
      if (vez === pedidos) {
        pedindoPlay = false;
        recusar = null;
      }
    }
  }

  function pausar() {
    if (!estado.tocando) return;
    estado.tocando = false;
    emitir();
    if (!audio) return;
    rampa(0, SAIDA);
    clearTimeout(pausaPendente);
    // Um tocar() antes disto cancela a pausa; senão a música pararia sozinha.
    pausaPendente = setTimeout(() => {
      if (!estado.tocando) audio.pause();
    }, SAIDA * 1000 + 40);
  }

  // Mesma faixa: não zera nem recarrega; volta na rampa de entrada.
  function retomar() {
    if (estado.tocando || estado.indice < 0) return Promise.resolve(false);
    return tocar(estado.indice);
  }

  function volume(v) {
    if (v === undefined) return estado.volume;
    estado.volume = clamp(Number(v) || 0, 0, 1);
    if (estado.tocando) rampa(estado.volume, 0.12);
    if (ganhoEfeitos) ganhoEfeitos.gain.setTargetAtTime(nivelEfeitos(), ctx.currentTime, 0.05);
    emitir();
    return estado.volume;
  }

  // Ganho próprio, separado do volume: os dois se multiplicam. Uma nova chamada cancela a volta pendente.
  function abafar(fator = 0.4, ms = 600) {
    if (mudo || !ganhoAbafar) return;
    clearTimeout(voltaAbafo);
    deslizar(ganhoAbafar.gain, clamp(Number(fator) || 0, 0, 1), 0.15);
    voltaAbafo = setTimeout(() => deslizar(ganhoAbafar.gain, 1, 0.5), Math.max(0, Number(ms) || 0));
  }

  // A fala não espera: se o buffer ou o contexto não estão prontos, ela se perde.
  function falar(arquivo) {
    if (mudo || !ctx || ctx.state !== 'running') return false;
    const buffer = falas.get(typeof arquivo === 'string' ? arquivo.trim() : '');
    if (!buffer) return false;
    try {
      const fonte = ctx.createBufferSource();
      fonte.buffer = buffer;
      const ganho = ctx.createGain();
      ganho.gain.value = clamp(estado.volume * 2.6, 0, 1);
      fonte.connect(ganho);
      ganho.connect(ctx.destination);
      fonte.start();
      abafar(0.45, buffer.duration * 1000);
      faladas += 1;
      return true;
    } catch {
      return false;
    }
  }

  function efeito(nome, opcoes) {
    if (mudo || !ctx || !ganhoEfeitos || ctx.state !== 'running') return;
    try {
      sintetizar(ctx, ganhoEfeitos, nome, opcoes);
    } catch {
      /* um efeito que falha fica em silêncio */
    }
  }

  function aoMudar(fn) {
    ouvintes.add(fn);
    return () => ouvintes.delete(fn);
  }

  function aoTempo(fn) {
    ouvintesTempo.add(fn);
    return () => ouvintesTempo.delete(fn);
  }

  function diagnostico() {
    const d = audio?.duration;
    return {
      mudo,
      webAudio: !!ctx,
      contexto: ctx?.state ?? null,
      ganho: ganhoMusica?.gain.value ?? null,
      ganhoEfeitos: ganhoEfeitos?.gain.value ?? null,
      abafo: ganhoAbafar?.gain.value ?? null,
      tempo: audio?.currentTime ?? 0,
      duracao: Number.isFinite(d) ? d : 0,
      pausado: audio ? audio.paused : null,
      fonte: audio?.getAttribute('src') || '',
      falas: [...falas.values()].filter(Boolean).length,
      faladas,
    };
  }

  return {
    estado,
    get faixas() { return faixas; },
    destravar,
    tocar,
    pausar,
    retomar,
    volume,
    abafar,
    falar,
    efeito,
    aoMudar,
    aoTempo,
    progresso,
    segundos,
    diagnostico,
  };
}
