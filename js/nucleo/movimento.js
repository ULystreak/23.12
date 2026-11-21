// Movimento: as curvas nomeadas dos três mundos e os textos que entram em pedaços.
//
// Use sempre os nomes de `curvas` no lugar de curvas soltas:
//   gsap.to(alvo, { y: 0, duration: 1.6, ease: curvas.branco.entrar })
//
// As mesmas curvas existem em CSS como variáveis (css/base.css, --curva-*).

const gsap = window.gsap;

/** Nomes das curvas, registradas na GSAP por iniciarMovimento(). */
export const curvas = {
  // Mundo branco: lento, leve, nada quica.
  branco: {
    entrar: 'brancoEntrar',     // chegada longa que pousa (tipo expo.out)
    sair: 'brancoSair',         // saída que acelera de leve e some
    camera: 'brancoCamera',     // câmera com inércia: demora a sair e desliza até parar
    deriva: 'brancoDeriva',     // vai e vem de flutuar (tipo sine.inOut)
  },
  // Poppy: molas, quiques e cortes de vídeo. Nada desliza suave.
  poppy: {
    mola: 'poppyMola',          // elástico que passa do ponto e volta
    quique: 'poppyQuique',      // bate no chão e quica
    pulo: 'poppyPulo',          // passa um pouco e assenta
    cair: 'poppyCair',          // queda com peso (acelera)
    corte: 'poppyCorte',        // em degraus, como vídeo engasgando
  },
  // Your Name: luz e tempo.
  yourname: {
    tempo: 'ynTempo',           // sine.inOut longo
    florescer: 'ynFlorescer',   // brilho que abre rápido e assenta
    sumir: 'ynSumir',           // apaga devagar
  },
  // Interface: resposta rápida, nunca ease-in.
  ui: {
    resposta: 'uiResposta',
  },
};

let amb = { reduzido: false, nivel: 'alto', rapido: 1 };
let iniciado = false;

/** Registra plugins e curvas e aplica ?rapido=N. Chamado uma vez pelo main.js. */
export function iniciarMovimento(ambiente) {
  amb = ambiente || amb;
  if (iniciado || !gsap) return;
  iniciado = true;

  const { CustomEase, DrawSVGPlugin } = window;
  gsap.registerPlugin(...[CustomEase, DrawSVGPlugin].filter(Boolean));

  const curva = (nome, bezier, reserva) => {
    if (CustomEase) CustomEase.create(nome, bezier);
    else gsap.registerEase(nome, gsap.parseEase(reserva));
  };
  const apelido = (nome, original) => gsap.registerEase(nome, gsap.parseEase(original));

  curva(curvas.branco.entrar, '0.16, 1, 0.3, 1', 'expo.out');
  curva(curvas.branco.sair, '0.5, 0, 0.75, 0.4', 'power2.in');
  curva(curvas.branco.camera, '0.6, 0, 0.2, 1', 'power3.inOut');
  curva(curvas.branco.deriva, '0.37, 0, 0.63, 1', 'sine.inOut');

  apelido(curvas.poppy.mola, 'elastic.out(1, 0.45)');
  apelido(curvas.poppy.quique, 'bounce.out');
  apelido(curvas.poppy.pulo, 'back.out(2.2)');
  curva(curvas.poppy.cair, '0.6, 0, 0.9, 0.5', 'power2.in');
  apelido(curvas.poppy.corte, 'steps(5)');

  curva(curvas.yourname.tempo, '0.37, 0, 0.63, 1', 'sine.inOut');
  curva(curvas.yourname.florescer, '0.16, 1, 0.3, 1', 'expo.out');
  curva(curvas.yourname.sumir, '0.4, 0, 0.6, 1', 'sine.inOut');

  curva(curvas.ui.resposta, '0.2, 0.8, 0.2, 1', 'power2.out');

  // Os padrões da GSAP (0,5 s, power1.out) ficam como são: cada mundo escolhe a sua curva.
  gsap.config({ nullTargetWarn: false });

  // ?rapido=N acelera tudo o que passa pela linha do tempo global da GSAP.
  if (amb.rapido !== 1) gsap.globalTimeline.timeScale(amb.rapido);
}

// ---------------------------------------------------------------------------
// Texto em pedaços
// ---------------------------------------------------------------------------

/**
 * Monta o texto dentro do elemento, quebrado em palavras.
 * Acessibilidade: o texto inteiro vai no aria-label do elemento; os pedaços
 * ficam dentro de um invólucro aria-hidden, para o leitor de tela ler a frase
 * de uma vez e não palavra por palavra.
 */
function montarPedacos(elemento, texto) {
  const inteiro = String(texto ?? '');
  elemento.textContent = '';
  elemento.setAttribute('aria-label', inteiro.replace(/\s+/g, ' ').trim());
  // No Safari/VoiceOver, role="text" faz o rótulo ser lido como texto corrido.
  if (!elemento.hasAttribute('role') && !/^H[1-6]$/.test(elemento.tagName)) {
    elemento.setAttribute('role', 'text');
  }

  const involucro = document.createElement('span');
  involucro.className = 'pedacos';
  involucro.setAttribute('aria-hidden', 'true');

  const palavras = [];
  const linhas = inteiro.split('\n');

  linhas.forEach((linha, i) => {
    if (i > 0) involucro.append(document.createElement('br'));
    const partes = linha.split(/(\s+)/);
    for (const parte of partes) {
      if (!parte) continue;
      if (/^\s+$/.test(parte)) {
        involucro.append(document.createTextNode(' '));
        continue;
      }
      const palavra = document.createElement('span');
      palavra.className = 'palavra';
      palavra.textContent = parte;
      involucro.append(palavra);
      palavras.push(palavra);
    }
  });

  elemento.append(involucro);
  elemento._pedacos = { palavras };
  return elemento._pedacos;
}

/** Promise que resolve quando a animação termina (ou é morta), sem perder o onComplete/onInterrupt que ela já tinha. */
export function comoPromise(animacao) {
  return new Promise((resolver) => {
    // eventCallback substitui o que já estava em vars: guarda e chama o anterior.
    for (const evento of ['onComplete', 'onInterrupt']) {
      const anterior = animacao.eventCallback(evento);
      animacao.eventCallback(evento, () => {
        if (typeof anterior === 'function') {
          try { anterior(); } catch (erro) { console.error(erro); }
        }
        resolver();
      });
    }
  });
}

const usaDesfoque = () => !amb.reduzido && amb.nivel !== 'baixo';

/**
 * Revela um texto palavra por palavra: cada palavra sobe ~0,4em com um desfoque
 * que some. Com movimento reduzido, entra só com opacidade.
 *
 * revelarPalavras(elemento, 'Feliz aniversário.', { intervalo: 0.16 }) → Promise
 *   texto      se omitido, usa o texto que já está no elemento
 *   opcoes     { duracao = 1.4, intervalo = 0.14, atraso = 0, subida = '0.4em', curva }
 */
export function revelarPalavras(elemento, texto, opcoes = {}) {
  if (!elemento) return Promise.resolve();
  const { palavras } = montarPedacos(elemento, texto ?? elemento.textContent);
  return animarEntrada(elemento, palavras, { duracao: 1.4, intervalo: 0.14, ...opcoes });
}

function animarEntrada(elemento, pedacos, { duracao, intervalo, atraso = 0, subida = '0.4em', curva }) {
  if (!gsap || !pedacos.length) return Promise.resolve();
  gsap.set(elemento, { autoAlpha: 1 });

  if (amb.reduzido) {
    return comoPromise(gsap.fromTo(pedacos,
      { autoAlpha: 0 },
      { autoAlpha: 1, duration: Math.min(duracao, 0.8), stagger: intervalo * 0.6, delay: atraso, ease: 'none' }));
  }

  const de = { autoAlpha: 0, y: subida };
  const para = {
    autoAlpha: 1, y: 0,
    duration: duracao, stagger: intervalo, delay: atraso,
    ease: curva || curvas.branco.entrar,
  };
  if (usaDesfoque()) {
    de.filter = 'blur(10px)';
    para.filter = 'blur(0px)';
    // Limpa o filtro no fim: texto parado com filter custa composição à toa.
    para.onComplete = () => gsap.set(pedacos, { clearProps: 'filter' });
  }
  return comoPromise(gsap.fromTo(pedacos, de, para));
}

/**
 * Faz sumir um texto que foi revelado em pedaços: cada pedaço sobe e se desfaz.
 * No fim o elemento fica vazio.
 *
 * ocultarPalavras(elemento, { duracao = 0.9, intervalo = 0.06, subida = '-0.35em' }) → Promise
 */
export function ocultarPalavras(elemento, opcoes = {}) {
  if (!elemento) return Promise.resolve();
  const { duracao = 0.9, intervalo = 0.06, atraso = 0, subida = '-0.35em', curva } = opcoes;
  const guardado = elemento._pedacos;
  const pedacos = guardado ? guardado.palavras : [elemento];

  const limpar = () => {
    if (!guardado) return;
    elemento.textContent = '';
    elemento.removeAttribute('aria-label');
    elemento._pedacos = null;
  };
  if (!gsap || !pedacos.length) { limpar(); return Promise.resolve(); }

  const para = amb.reduzido
    ? { autoAlpha: 0, duration: Math.min(duracao, 0.6), stagger: 0, delay: atraso, ease: 'none' }
    : {
      autoAlpha: 0, y: subida,
      duration: duracao, stagger: intervalo, delay: atraso,
      ease: curva || curvas.branco.sair,
    };
  if (!amb.reduzido && usaDesfoque()) para.filter = 'blur(8px)';

  return comoPromise(gsap.to(pedacos, para)).then(limpar);
}
