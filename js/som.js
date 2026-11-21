// Som: o motor de áudio da carta (Web Audio). Música em repetição + efeitos discretos.
//
//   som.destravar()        chamar dentro de um toque/clique (o navegador só libera áudio assim)
//   som.tocar(indice)      toca a faixa `indice` de conteudo.musica.faixas, com entrada suave;
//                          ao acabar, passa sozinha para a próxima (e da última volta à primeira;
//                          com uma faixa só, ela se repete). Se o arquivo não chega (soluço de
//                          rede), tenta mais duas vezes, a cada 1,5 s; só então estado.falhou
//   som.pausar() / som.retomar()
//   som.volume(v)          0..1; sem argumento devolve o volume atual
//   som.estado             { destravado, tocando, indice, volume, falhou }
//   som.aoMudar(fn)        fn(estado) a cada mudança; devolve a função que cancela
//   som.efeito(nome, opcoes)
//                          'lacre' | 'papel' | 'desenrolar' | 'toque' | 'caneta' | 'fita' | 'mola' | 'brilho' | 'caixinha'
//                          opções: a caneta usa { duracao (s), intensidade (0..1,5) }; a caixinha, { nota (Hz) }
//   som.abafar(fator, ms)  abaixa a música para `fator` (0..1) por `ms` milissegundos e volta
//   som.falar(arquivo)     uma fala curta por cima da música (a voz dele na primeira frase da
//                          abertura): a música abaixa enquanto ela dura e volta. Só toca se o
//                          arquivo já chegou e o som está liberado; devolve true se tocou
//   som.progresso()        0..1: em que ponto da faixa a música está
//   som.segundos()         o segundo da faixa agora, lido na hora
//   som.aoTempo(fn)        fn(progresso, segundos, duracao) enquanto a faixa anda; devolve quem cancela
//   som.diagnostico()      (só para testes) estado interno: contexto, ganho, tempo da faixa
//
// A música passa por <audio> → MediaElementSource → GainNode, porque no iPhone
// `audio.volume` não tem efeito. Se o Web Audio faltar, cai para `audio.volume`.
// Com ?mudo=1 (ou se qualquer coisa do áudio falhar) tudo vira silêncio sem erro:
// o estado continua mudando, para a interface se comportar igual.
//
// Os efeitos são sintetizados (nenhum arquivo). As receitas ficam em RECEITAS e
// também podem ser tocadas num OfflineAudioContext com sintetizar(), para medir
// pico e duração sem ouvir.

import { clamp, semente, espera } from './nucleo/util.js';

const ENTRADA = 1.8;   // s: a música chega devagar
const SAIDA = 0.45;    // s

export function criarSom(conteudo, amb) {
  const faixas = Array.isArray(conteudo?.musica?.faixas) ? conteudo.musica.faixas : [];
  const volumeInicial = clamp(Number(conteudo?.musica?.volumeInicial ?? 0.3) || 0.3, 0, 1);
  const mudo = !!amb?.mudo;

  const estado = { destravado: false, tocando: false, indice: -1, volume: volumeInicial, falhou: false };
  const ouvintes = new Set();
  const ouvintesTempo = new Set();

  let ctx = null;            // AudioContext
  let audio = null;          // <audio> da música
  let ganhoMusica = null;    // volume + entradas e saídas
  let ganhoAbafar = null;    // abafar()
  let ganhoEfeitos = null;
  let pausaPendente = 0;
  let voltaAbafar = 0;
  let pausadoPelaAba = false;
  let rampaReserva = 0;
  let pedindoPlay = false;   // um tocar() trabalhando: o play() sem resposta ou entre tentativas
  let pedidos = 0;           // conta os tocar(): só o último continua tentando
  let recusar = () => {};    // recusa o play() sem resposta (ver o ouvinte de 'error')
  const falas = new Map();   // arquivo → AudioBuffer pronto para falar() (null enquanto chega ou se falhou)
  let faladas = 0;

  // Índices das faixas que têm arquivo (as que dá para tocar), na ordem do content.js.
  function tocaveis() {
    return faixas.map((f, i) => (typeof f?.arquivo === 'string' && f.arquivo.trim() ? i : -1)).filter((i) => i >= 0);
  }

  function emitir() {
    for (const fn of ouvintes) {
      try { fn(estado); } catch (erro) { console.error(erro); }
    }
  }

  /** Em que segundo da faixa a música está, lido na hora (para a letra seguir palavra por palavra). */
  function segundos() { return audio ? audio.currentTime || 0 : 0; }

  function progresso() {
    if (!audio) return 0;
    const total = audio.duration;
    return Number.isFinite(total) && total > 0 ? clamp(audio.currentTime / total) : 0;
  }

  function emitirTempo() {
    if (!ouvintesTempo.size || !audio) return;
    const p = progresso();
    const total = Number.isFinite(audio.duration) ? audio.duration : 0;
    for (const fn of ouvintesTempo) {
      try { fn(p, audio.currentTime, total); } catch (erro) { console.error(erro); }
    }
  }

  /**
   * Os efeitos acompanham o volume que ela escolheu para a música: se ela abaixa
   * a música, eles abaixam junto; no mudo, somem. Assim ficam sempre abaixo dela.
   */
  function nivelEfeitos() {
    return volumeInicial > 0 ? clamp(estado.volume / volumeInicial, 0, 2) : 1;
  }

  /**
   * Adianta uma fala: baixa e decodifica o arquivo, para falar() tocar na hora certa, sem
   * esperar. Passa pelo Web Audio (e não por outro <audio>) porque o iPhone só deixa um
   * <audio> começar dentro de um toque. Arquivo que falta ou não abre: fica sem a fala.
   */
  function adiantarFala(arquivo) {
    if (mudo || !ctx || typeof arquivo !== 'string' || !arquivo.trim() || falas.has(arquivo)) return;
    falas.set(arquivo, null);
    fetch(arquivo)
      .then((resposta) => (resposta.ok ? resposta.arrayBuffer() : null))
      .then((bytes) => bytes && new Promise((ok) => {
        // (com as duas funções: o Safari antigo não devolve promessa aqui)
        const p = ctx.decodeAudioData(bytes, ok, () => ok(null));
        if (p && p.catch) p.catch(() => ok(null));
      }))
      .then((buffer) => { if (buffer) falas.set(arquivo, buffer); })
      .catch(() => { /* sem rede, formato que o aparelho não lê: segue em silêncio */ });
  }

  // ---- montagem (só dentro de um gesto) -----------------------------------

  function montar() {
    if (mudo || audio) return;
    try {
      audio = new Audio();
      // Com uma faixa só ela se repete; com mais, ao acabar entra a próxima.
      audio.loop = tocaveis().length < 2;
      audio.preload = 'auto';
      audio.playsInline = true;
      audio.setAttribute('playsinline', '');
      audio.addEventListener('error', () => {
        // Antes da escolha (arquivo só adiantado) não há o que avisar: o seletor confere sozinho.
        if (!audio.getAttribute('src') || estado.indice < 0 || !estado.tocando) return;
        // Durante um tocar() quem decide é ele, que tenta de novo antes de desistir. O erro que
        // chega com o arquivo já começado não recusa o play() (ele ficaria sem resposta para
        // sempre, com o disco girando mudo): a recusa vem daqui.
        if (pedindoPlay) { recusar(audio.error); return; }
        // A rede caiu no meio da faixa: recarrega e tenta de novo. Outro erro: segue sem ela.
        if (audio.error && audio.error.code === MediaError.MEDIA_ERR_NETWORK) { som.tocar(estado.indice); return; }
        estado.tocando = false;
        estado.falhou = true;
        emitir();
      });
      audio.addEventListener('ended', () => {
        if (!estado.tocando) return;
        const lista = tocaveis();
        if (lista.length < 2) { audio.currentTime = 0; audio.play().catch(() => {}); return; }
        const i = lista.indexOf(estado.indice);
        som.tocar(lista[(i + 1) % lista.length]);
      });
      audio.addEventListener('timeupdate', emitirTempo);
      audio.addEventListener('durationchange', emitirTempo);
    } catch {
      audio = null;
      return;
    }

    // O primeiro toque dela é na carta, segundos antes da folha das músicas: a primeira
    // faixa já começa a chegar daqui. Numa rede de celular, o toque no disco tocava
    // só 2–3 s depois (o tempo de baixar o começo do arquivo) e o silêncio parecia falha.
    const primeira = faixas.find((f) => typeof f?.arquivo === 'string' && f.arquivo.trim());
    if (primeira) {
      try { audio.src = primeira.arquivo; } catch { /* chega no toque do disco */ }
    }

    // No iPhone, o Web Audio segue a categoria "ambient" e obedece à chave de
    // silencioso: com ela ligada, a carta ficaria muda. "playback" toca como um
    // vídeo (Safari 16.4+); nos outros navegadores a propriedade não existe.
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* segue */ }

    try {
      const Contexto = window.AudioContext || window.webkitAudioContext;
      if (!Contexto) return;
      ctx = new Contexto({ latencyHint: 'interactive' });
      ganhoMusica = ctx.createGain();
      ganhoAbafar = ctx.createGain();
      ganhoEfeitos = ctx.createGain();
      ganhoMusica.gain.value = 0;
      ganhoEfeitos.gain.value = nivelEfeitos();
      ctx.createMediaElementSource(audio).connect(ganhoMusica);
      ganhoMusica.connect(ganhoAbafar).connect(ctx.destination);
      ganhoEfeitos.connect(ctx.destination);
    } catch {
      // Sem Web Audio: a música ainda toca pelo <audio>, só sem efeitos.
      ctx = null;
      ganhoMusica = ganhoAbafar = ganhoEfeitos = null;
    }

    // A voz dele na primeira frase (abertura.vozArquivo) começa a chegar já: quando ela
    // sai da tela da música, o arquivo está pronto.
    adiantarFala(conteudo?.abertura?.vozArquivo);

    // Ao voltar de outro aplicativo o iPhone pode deixar o contexto suspenso e
    // recusar o play() sem gesto: o próximo toque dela, onde for, devolve o som.
    // (touchend e click também: rolar a folha com o dedo não termina em pointerup.)
    const reanimar = () => {
      acordar();
      if (estado.tocando && audio && audio.paused && !pedindoPlay && !document.hidden) {
        audio.play().then(() => rampa(estado.volume, 0.6)).catch(() => {});
      }
    };
    for (const tipo of ['pointerup', 'touchend', 'click', 'keydown']) {
      window.addEventListener(tipo, reanimar, { capture: true, passive: true });
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

      const vez = ++pedidos;
      if (trocou) zerar();
      pedindoPlay = true;
      try {
        for (let tentativa = 0; ; tentativa++) {
          try {
            // A mesma faixa que já vinha chegando (ver montar) não recomeça o download. Mas
            // um elemento que falhou (a pré-carga num soluço de rede, ou a tentativa
            // anterior) não tenta de novo sozinho com o mesmo endereço: load() o acorda.
            if (audio.getAttribute('src') !== faixa.arquivo) audio.src = faixa.arquivo;
            else if (audio.error || audio.networkState === audio.NETWORK_NO_SOURCE) { zerar(); audio.load(); }
            // play() precisa sair ainda dentro do gesto: nada de await antes daqui.
            await new Promise((ok, falha) => { recusar = falha; Promise.resolve(audio.play()).then(ok, falha); });
            // Ela pode ter pausado ou trocado de faixa enquanto o arquivo carregava.
            if (estado.indice === indice && estado.tocando) rampa(estado.volume, ENTRADA);
            return true;
          } catch (erro) {
            // Interrompido por uma pausa ou por outra faixa: não é falha do arquivo.
            if (vez !== pedidos || !estado.tocando || (erro && erro.name === 'AbortError')) return false;
            // Navegador que recusou o som: fica em silêncio até o próximo toque.
            if (erro && erro.name === 'NotAllowedError') {
              estado.tocando = false;
              emitir();
              return false;
            }
            // Soluço de rede: mais duas tentativas, com o disco girando como quem carrega.
            if (tentativa < 2) {
              await espera(1500);
              if (vez === pedidos && estado.tocando) continue;
              return false;
            }
            // Arquivo que falta, ou rede que não voltou: a carta segue sem música.
            estado.tocando = false;
            estado.falhou = true;
            emitir();
            return false;
          }
        }
      } finally {
        if (vez === pedidos) pedindoPlay = false;
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
      if (ctx && ganhoEfeitos) ganhoEfeitos.gain.setTargetAtTime(nivelEfeitos(), ctx.currentTime, 0.05);
      emitir();
      return estado.volume;
    },

    aoMudar(fn) {
      ouvintes.add(fn);
      return () => ouvintes.delete(fn);
    },

    /** 0..1: em que ponto da faixa a música está (0 enquanto a duração não é conhecida). */
    progresso,
    segundos,

    /** fn(progresso, segundos, duracao) algumas vezes por segundo enquanto a faixa anda. */
    aoTempo(fn) {
      ouvintesTempo.add(fn);
      return () => ouvintesTempo.delete(fn);
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

    falar(arquivo, { fundo = 0.45 } = {}) {
      const buffer = falas.get(arquivo);
      if (mudo || !buffer || !ctx || ctx.state !== 'running') return false;
      try {
        const fonte = ctx.createBufferSource();
        const ganho = ctx.createGain();
        // Acompanha o volume que ela escolheu, como os efeitos: clara por cima da música
        // (que abaixa para `fundo`), sem passar do pico do arquivo.
        ganho.gain.value = clamp(estado.volume * 2.6, 0, 1);
        fonte.buffer = buffer;
        fonte.connect(ganho).connect(ctx.destination);
        fonte.start();
        som.abafar(fundo, buffer.duration * 1000);
        faladas++;
        return true;
      } catch {
        return false;      // a fala nunca derruba a cena
      }
    },

    /** Só para testes e depuração: o que o motor está fazendo agora. */
    diagnostico() {
      return {
        mudo,
        webAudio: !!ctx,
        contexto: ctx ? ctx.state : null,
        ganho: ganhoMusica ? ganhoMusica.gain.value : (audio ? audio.volume : 0),
        ganhoEfeitos: ganhoEfeitos ? ganhoEfeitos.gain.value : 0,
        abafo: ganhoAbafar ? ganhoAbafar.gain.value : 1,      // 1 = música inteira; menor durante um vídeo (abafar)
        tempo: audio ? audio.currentTime : 0,
        duracao: audio && Number.isFinite(audio.duration) ? audio.duration : 0,
        pausado: audio ? audio.paused : true,
        fonte: audio ? audio.getAttribute('src') || '' : '',
        falas: [...falas.values()].filter(Boolean).length,     // falas prontas para falar()
        faladas,                                               // quantas vezes falar() tocou
      };
    },

    efeito(nome, opcoes) {
      if (mudo || !ctx || !ganhoEfeitos || ctx.state !== 'running') return;
      try {
        sintetizar(ctx, ganhoEfeitos, nome, opcoes);
      } catch { /* efeito nunca derruba a cena */ }
    },
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

// ============================================================================
// EFEITOS SINTETIZADOS
// Cada receita desenha o som com osciladores e ruído filtrado, a partir do
// instante `k.t0`, e devolve quanto dura (em segundos). O número `nivel` é o
// pico que o efeito alcança com a música no volume inicial: fica perto de
// 18 dB abaixo do pico dela (0,3 → ~0,04), um pouco mais nos estalos curtos.
// ============================================================================

const ruidos = new WeakMap();   // contexto → buffer de ruído branco (2 s, sempre o mesmo)

function bufferDeRuido(c) {
  let buffer = ruidos.get(c);
  if (!buffer) {
    buffer = c.createBuffer(1, Math.round(c.sampleRate * 2), c.sampleRate);
    const dados = buffer.getChannelData(0);
    const sorte = semente(2312);
    for (let i = 0; i < dados.length; i++) dados[i] = sorte() * 2 - 1;
    ruidos.set(c, buffer);
  }
  return buffer;
}

/** Agenda uma curva num AudioParam: pontos = [[t, valor, 'exp'?], ...] com t em segundos a partir de t0. */
function curva(param, t0, pontos) {
  pontos.forEach(([t, valor, modo], i) => {
    const quando = t0 + t;
    if (i === 0) param.setValueAtTime(valor, quando);
    else if (modo === 'exp') param.exponentialRampToValueAtTime(Math.max(valor, 0.0001), quando);
    else param.linearRampToValueAtTime(valor, quando);
  });
}

/** As peças com que as receitas trabalham, presas a um contexto, uma saída e um instante. */
function caixa(c, saida, t0) {
  const k = {
    c, t0,
    ganho(pontos) {
      const g = c.createGain();
      if (typeof pontos === 'number') g.gain.value = pontos;
      else curva(g.gain, t0, pontos);
      return g;
    },
    filtro(tipo, freq, q = 0.7) {
      const f = c.createBiquadFilter();
      f.type = tipo;
      f.frequency.value = freq;
      f.Q.value = q;
      return f;
    },
    osc(tipo, freq, inicio, fim) {
      const o = c.createOscillator();
      o.type = tipo;
      o.frequency.value = freq;
      o.start(t0 + inicio);
      o.stop(t0 + fim);
      return o;
    },
    /** Ruído branco entre `inicio` e `fim`; `desloc` escolhe o trecho do buffer. */
    ruido(inicio, fim, desloc = 0) {
      const fonte = c.createBufferSource();
      fonte.buffer = bufferDeRuido(c);
      fonte.loop = true;
      fonte.start(t0 + inicio, desloc % 2);
      fonte.stop(t0 + fim);
      return fonte;
    },
    /** Um valor que passeia ao acaso entre −1 e 1, mudando `hz` vezes por segundo (ruído tocado bem devagar). */
    acaso(hz, inicio, fim, desloc = 0) {
      const fonte = k.ruido(inicio, fim, desloc);
      fonte.playbackRate.value = hz / c.sampleRate;
      return fonte;
    },
    em(param, pontos) { curva(param, t0, pontos); },
    /** Liga os nós em fila e o último na saída. */
    liga(...nos) {
      for (let i = 0; i < nos.length - 1; i++) nos[i].connect(nos[i + 1]);
      nos[nos.length - 1].connect(saida);
    },
    /** Faz `fonte` mexer num parâmetro, com profundidade `quanto`. */
    modula(fonte, param, quanto) {
      const g = c.createGain();
      if (typeof quanto === 'number') g.gain.value = quanto;
      else curva(g.gain, t0, quanto);
      fonte.connect(g);
      g.connect(param);
    },
  };
  return k;
}

export const RECEITAS = {
  // O lacre de cera: um estalo seco em três grãos e a cera cedendo (batida grave).
  lacre: {
    nivel: 0.04,      // os estalos medem mais alto que o RMS: este fica a ~−17,5 dB do pico da música
    bruto: 1.0,
    fazer(k) {
      for (const [t, a] of [[0, 1], [0.013, 0.5], [0.034, 0.28]]) {
        k.liga(
          k.ruido(t, t + 0.03, 0.2 + t * 9),
          k.filtro('bandpass', 3300 - t * 18000, 1.3),
          k.filtro('highpass', 1700),
          k.ganho([[t, 0], [t + 0.0015, 1.1 * a], [t + 0.022, 0.0001, 'exp']]),
        );
      }
      const corpo = k.osc('sine', 190, 0, 0.26);
      k.em(corpo.frequency, [[0, 190], [0.17, 74, 'exp']]);
      k.liga(corpo, k.ganho([[0, 0], [0.005, 0.85], [0.22, 0.0001, 'exp']]));
      // Um harmônico acima: é o que o alto-falante do celular consegue mostrar da batida.
      const cima = k.osc('triangle', 380, 0, 0.15);
      k.em(cima.frequency, [[0, 380], [0.11, 150, 'exp']]);
      k.liga(cima, k.ganho([[0, 0], [0.004, 0.3], [0.12, 0.0001, 'exp']]));
      return 0.26;
    },
  },

  // Papel: ruído filtrado que varre para o agudo e volta, amassando de leve (~220 ms).
  papel: {
    nivel: 0.042,
    bruto: 0.78,
    fazer(k) {
      const dur = 0.22;
      const varre = k.filtro('bandpass', 1300, 0.8);
      k.em(varre.frequency, [[0, 1300], [0.09, 4200, 'exp'], [dur, 2300, 'exp']]);
      const amasso = k.ganho(1);
      k.modula(k.acaso(90, 0, dur + 0.02, 0.31), amasso.gain, 0.55);
      k.liga(
        k.ruido(0, dur + 0.02, 0.5),
        k.filtro('highpass', 900),
        varre,
        amasso,
        k.ganho([[0, 0], [0.03, 1], [0.1, 0.5], [dur, 0.0001, 'exp']]),
      );
      return dur + 0.02;
    },
  },

  // Desenrolar: papel mais longo, com o ritmo do rolo girando cada vez mais solto.
  desenrolar: {
    nivel: 0.045,
    bruto: 0.81,
    fazer(k) {
      const dur = 1.15;
      const ritmo = [[0, 0.0001]];
      let t = 0.02;
      let passo = 0.17;
      while (t < dur - 0.14) {
        ritmo.push([t + 0.035, 1], [t + passo * 0.82, 0.32]);
        t += passo;
        passo *= 0.9;
      }
      ritmo.push([dur, 0.0001, 'exp']);

      const varre = k.filtro('bandpass', 620, 0.7);
      k.em(varre.frequency, [[0, 620], [dur * 0.7, 1900, 'exp'], [dur, 1300, 'exp']]);
      const amasso = k.ganho(1);
      k.modula(k.acaso(70, 0, dur + 0.02, 0.77), amasso.gain, 0.45);
      const pulso = k.ganho(ritmo);
      k.liga(k.ruido(0, dur + 0.02, 1.1), k.filtro('highpass', 380), varre, amasso, pulso);
      // O rolo de madeira embaixo do papel.
      k.liga(k.ruido(0, dur + 0.02, 0.05), k.filtro('lowpass', 240, 0.8), k.ganho(0.5), k.ganho(ritmo));
      return dur + 0.02;
    },
  },

  // Toque: um tique macio, de madeira, não um bipe.
  toque: {
    nivel: 0.04,
    bruto: 1.06,
    fazer(k) {
      const tom = k.osc('sine', 660, 0, 0.1);
      k.em(tom.frequency, [[0, 660], [0.06, 520, 'exp']]);
      k.liga(tom, k.ganho([[0, 0], [0.004, 1], [0.08, 0.0001, 'exp']]));
      const cima = k.osc('sine', 1320, 0, 0.06);
      k.liga(cima, k.ganho([[0, 0], [0.003, 0.22], [0.045, 0.0001, 'exp']]));
      k.liga(k.ruido(0, 0.02, 0.9), k.filtro('bandpass', 2300, 3), k.ganho([[0, 0], [0.001, 0.3], [0.012, 0.0001, 'exp']]));
      return 0.1;
    },
  },

  // Caneta: o risco contínuo da ponta no papel. A mão anda mais rápido e mais devagar,
  // então o chiado respira. opcoes: { duracao (s), intensidade (0..1,5) }.
  caneta: {
    nivel: 0.032,
    bruto: 1.3,
    fazer(k, opcoes = {}) {
      const dur = clamp(Number(opcoes.duracao) || 0.9, 0.08, 20);
      const forca = clamp(opcoes.intensidade === undefined ? 1 : Number(opcoes.intensidade) || 0, 0, 1.5);
      const fim = dur + 0.14;
      const ponta = k.filtro('bandpass', 3200, 0.9);
      const mao = k.acaso(11, 0, fim, 1.3);           // a velocidade da mão
      k.modula(mao, ponta.frequency, 850);
      const traco = k.ganho(1);
      k.modula(mao, traco.gain, 0.5);
      k.modula(k.acaso(140, 0, fim, 0.6), traco.gain, 0.22);   // o grão do papel
      k.liga(
        k.ruido(0, fim, 1.7),
        k.filtro('highpass', 1700),
        ponta,
        traco,
        k.ganho([[0, 0], [0.035, forca], [dur, forca * 0.85], [fim, 0.0001, 'exp']]),
      );
      return fim;
    },
  },

  // Fita: a fita de vídeo entrando (duas batidas surdas) e o cabeçote começando a girar.
  fita: {
    nivel: 0.038,     // ~−18 dB do pico da música
    bruto: 0.75,
    fazer(k) {
      for (const [t, a] of [[0, 1], [0.075, 0.6]]) {
        k.liga(k.ruido(t, t + 0.06, 0.2 + t), k.filtro('lowpass', 520, 0.9), k.ganho([[t, 0], [t + 0.003, a], [t + 0.05, 0.0001, 'exp']]));
        const batida = k.osc('triangle', 160, t, t + 0.09);
        k.em(batida.frequency, [[t, 160], [t + 0.07, 86, 'exp']]);
        k.liga(batida, k.ganho([[t, 0], [t + 0.004, 0.7 * a], [t + 0.08, 0.0001, 'exp']]));
      }
      const zumbido = k.osc('sawtooth', 120, 0.09, 0.54);
      const treme = k.ganho(1);
      k.modula(k.osc('sine', 9, 0.09, 0.54), treme.gain, 0.25);
      k.liga(zumbido, k.filtro('lowpass', 700, 0.6), treme, k.ganho([[0.09, 0], [0.16, 0.24], [0.36, 0.17], [0.52, 0.0001, 'exp']]));
      k.liga(k.ruido(0.09, 0.52, 1.5), k.filtro('highpass', 4200), k.ganho([[0.09, 0], [0.15, 0.06], [0.5, 0.0001, 'exp']]));
      return 0.54;
    },
  },

  // Mola: o boing de um brinquedo, com o balanço morrendo.
  mola: {
    nivel: 0.045,
    bruto: 1.11,
    fazer(k) {
      const balanco = k.osc('sine', 27, 0, 0.46);
      const tom = k.osc('sine', 250, 0, 0.46);
      k.em(tom.frequency, [[0, 250], [0.03, 420], [0.42, 232, 'exp']]);
      k.modula(balanco, tom.frequency, [[0, 70], [0.4, 2, 'exp']]);
      k.liga(tom, k.ganho([[0, 0], [0.006, 1], [0.12, 0.5], [0.44, 0.0001, 'exp']]));
      const cima = k.osc('sine', 840, 0, 0.2);
      k.modula(balanco, cima.frequency, [[0, 180], [0.18, 4, 'exp']]);
      k.liga(cima, k.ganho([[0, 0], [0.004, 0.2], [0.17, 0.0001, 'exp']]));
      return 0.46;
    },
  },

  // Brilho: quatro notas agudas que acendem devagar, uma depois da outra, e somem.
  brilho: {
    nivel: 0.04,
    bruto: 1.15,
    fazer(k) {
      for (const [freq, t, a] of [[2093, 0, 1], [2637, 0.07, 0.8], [3136, 0.15, 0.62], [3951, 0.24, 0.36]]) {
        for (const desvio of [-2.2, 2.6]) {     // duas vozes quase iguais: é o que faz cintilar
          k.liga(k.osc('sine', freq + desvio, t, t + 1.02), k.ganho([[t, 0], [t + 0.17, 0.5 * a], [t + 1, 0.0001, 'exp']]));
        }
      }
      return 1.26;
    },
  },

  // Caixinha de música: a lâmina do pente tocada pelo pino. A nota pura, dois parciais de
  // lâmina (×2,76 e ×5,4) que somem antes dela e o clique do mecanismo. opcoes: { nota (Hz) }.
  // Fica abaixo do brilho: na senha ela toca sozinha, no silêncio.
  caixinha: {
    nivel: 0.03,      // ~−30 dB de pico, 2,5 dB abaixo do brilho
    bruto: 1.38,
    fazer(k, opcoes = {}) {
      const nota = clamp(Number(opcoes.nota) || 784, 200, 3000);
      for (const [vezes, a, queda] of [[1, 1, 1.4], [2.76, 0.28, 0.45], [5.4, 0.1, 0.18]]) {
        k.liga(k.osc('sine', nota * vezes, 0, queda + 0.02), k.ganho([[0, 0], [0.002, a], [queda, 0.0001, 'exp']]));
      }
      k.liga(k.ruido(0, 0.008, 0.37), k.filtro('bandpass', 4200, 1.2), k.ganho([[0, 0], [0.0005, 0.22], [0.006, 0.0001, 'exp']]));
      return 1.42;
    },
  },
};

/**
 * Toca uma receita num contexto qualquer (o da página ou um OfflineAudioContext).
 * Devolve a duração em segundos, ou 0 se o efeito não existe.
 */
export function sintetizar(contexto, destino, nome, opcoes, quando) {
  const receita = RECEITAS[nome];
  if (!receita) return 0;
  const saida = contexto.createGain();
  saida.gain.value = receita.nivel / receita.bruto;
  saida.connect(destino);
  const t0 = quando === undefined ? contexto.currentTime + 0.005 : quando;
  return receita.fazer(caixa(contexto, saida, t0), opcoes);
}
