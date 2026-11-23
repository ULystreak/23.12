/* ============================================================================
   MOVIMENTO: as curvas de cada mundo e o texto que entra em pedaços
   ============================================================================
   Cada mundo tem a sua física:
     Mundo branco: lento, leve, nada quica.
     Poppy: molas, quiques e cortes de vídeo. Nada desliza suave.
     Your Name: luz e tempo.
     Interface: resposta rápida, nunca ease-in.
   As curvas são registradas no GSAP por nome; nas cenas, use
   `ease: curvas.<grupo>.<nome>`. Cinco delas também existem como --curva-* em
   css/base.css.
   ========================================================================== */

const gsap = window.gsap;

let amb = { reduzido: false, nivel: 'alto', rapido: 1 };
let iniciado = false;

export const curvas = {
  branco: { entrar: 'brancoEntrar', sair: 'brancoSair', camera: 'brancoCamera', deriva: 'brancoDeriva' },
  poppy: { mola: 'poppyMola', quique: 'poppyQuique', pulo: 'poppyPulo', cair: 'poppyCair', corte: 'poppyCorte' },
  yourname: { tempo: 'ynTempo', florescer: 'ynFlorescer', sumir: 'ynSumir' },
  ui: { resposta: 'uiResposta' },
};

const usaDesfoque = () => !amb.reduzido && amb.nivel !== 'baixo';

/** Registra as curvas no GSAP (uma vez) e aplica ?rapido ao relógio global. */
export function iniciarMovimento(ambiente) {
  amb = ambiente || amb;
  if (iniciado || !gsap) return;
  iniciado = true;

  const plugins = [window.CustomEase, window.DrawSVGPlugin].filter(Boolean);
  if (plugins.length) gsap.registerPlugin(...plugins);

  const curva = (nome, bezier, reserva) => {
    if (window.CustomEase) window.CustomEase.create(nome, bezier);
    else gsap.registerEase(nome, gsap.parseEase(reserva));
  };
  const apelido = (nome, original) => gsap.registerEase(nome, gsap.parseEase(original));

  // Mundo branco
  curva('brancoEntrar', '0.16, 1, 0.3, 1', 'expo.out'); // chegada longa que pousa
  curva('brancoSair', '0.5, 0, 0.75, 0.4', 'power2.in'); // saída que acelera de leve
  curva('brancoCamera', '0.6, 0, 0.2, 1', 'power3.inOut'); // câmera com inércia
  curva('brancoDeriva', '0.37, 0, 0.63, 1', 'sine.inOut'); // vai e vem de flutuar
  // Poppy
  apelido('poppyMola', 'elastic.out(1, 0.45)'); // passa do ponto e volta
  apelido('poppyQuique', 'bounce.out'); // bate e quica
  apelido('poppyPulo', 'back.out(2.2)'); // passa um pouco e assenta
  curva('poppyCair', '0.6, 0, 0.9, 0.5', 'power2.in'); // queda com peso
  apelido('poppyCorte', 'steps(5)'); // cortes em degraus
  // Your Name
  curva('ynTempo', '0.37, 0, 0.63, 1', 'sine.inOut');
  curva('ynFlorescer', '0.16, 1, 0.3, 1', 'expo.out'); // brilho que abre e assenta
  curva('ynSumir', '0.4, 0, 0.6, 1', 'sine.inOut'); // apaga devagar
  // Interface
  curva('uiResposta', '0.2, 0.8, 0.2, 1', 'power2.out'); // resposta rápida, sem ease-in

  gsap.config({ nullTargetWarn: false });
  if (amb.rapido !== 1) gsap.globalTimeline.timeScale(amb.rapido);
}

/** Transforma uma animação do GSAP numa Promise sem perder os callbacks que ela já tinha. */
export function comoPromise(animacao) {
  return new Promise((resolve) => {
    if (!animacao || typeof animacao.eventCallback !== 'function') {
      resolve();
      return;
    }
    for (const evento of ['onComplete', 'onInterrupt']) {
      const anterior = animacao.eventCallback(evento);
      animacao.eventCallback(evento, function (...args) {
        try {
          anterior?.apply(this, args);
        } catch (erro) {
          console.error(erro);
        }
        resolve();
      });
    }
  });
}

function montarPedacos(elemento, texto) {
  elemento.textContent = '';
  const inteiro = String(texto ?? '').replace(/\s+/g, ' ').trim();
  elemento.setAttribute('aria-label', inteiro);
  // No Safari/VoiceOver, role="text" faz o rótulo ser lido como texto corrido.
  if (!elemento.getAttribute('role') && !/^H[1-6]$/.test(elemento.tagName)) elemento.setAttribute('role', 'text');

  const pedacos = document.createElement('span');
  pedacos.className = 'pedacos';
  pedacos.setAttribute('aria-hidden', 'true');
  const palavras = [];
  const linhas = String(texto ?? '').split('\n');
  linhas.forEach((linha, li) => {
    const termos = linha.split(/\s+/).filter(Boolean);
    termos.forEach((termo, ti) => {
      if (ti > 0) pedacos.append(document.createTextNode(' '));
      const span = document.createElement('span');
      span.className = 'palavra';
      span.textContent = termo;
      pedacos.append(span);
      palavras.push(span);
    });
    if (li < linhas.length - 1) pedacos.append(document.createElement('br'));
  });
  elemento.append(pedacos);
  elemento._pedacos = { palavras };
  return elemento._pedacos;
}

function animarEntrada(elemento, pedacos, { duracao, intervalo, atraso, subida, curva }) {
  const alvos = pedacos?.palavras || [];
  if (!gsap || !alvos.length) return Promise.resolve();
  gsap.set(elemento, { autoAlpha: 1 });
  if (amb.reduzido) {
    return comoPromise(
      gsap.fromTo(alvos, { autoAlpha: 0 }, { autoAlpha: 1, duration: Math.min(duracao, 0.8), stagger: intervalo * 0.6, delay: atraso, ease: 'none' }),
    );
  }
  const de = { autoAlpha: 0, y: subida };
  const para = { autoAlpha: 1, y: 0, duration: duracao, stagger: intervalo, delay: atraso, ease: curva || curvas.branco.entrar };
  if (usaDesfoque()) {
    de.filter = 'blur(10px)';
    para.filter = 'blur(0px)';
    // Texto parado com filter custa composição à toa.
    para.onComplete = () => gsap.set(alvos, { clearProps: 'filter' });
  }
  return comoPromise(gsap.fromTo(alvos, de, para));
}

/** Cada palavra sobe (0,4em) e perde o desfoque, uma depois da outra. */
export function revelarPalavras(elemento, texto, opcoes = {}) {
  if (!elemento) return Promise.resolve();
  const pedacos = montarPedacos(elemento, texto ?? elemento.textContent);
  return animarEntrada(elemento, pedacos, {
    duracao: 1.4, intervalo: 0.14, atraso: 0, subida: '0.4em', curva: curvas.branco.entrar, ...opcoes,
  });
}

/** Cada palavra sobe um pouco e some. Só esvazia o elemento se ele foi montado por revelarPalavras. */
export function ocultarPalavras(elemento, opcoes = {}) {
  if (!elemento) return Promise.resolve();
  const { duracao = 0.9, intervalo = 0.06, atraso = 0, subida = '-0.35em', curva = curvas.branco.sair } = opcoes;
  const montado = !!elemento._pedacos;
  const pedacos = montado ? elemento._pedacos.palavras : [elemento];
  const limpar = () => {
    if (!montado) return;
    elemento.textContent = '';
    elemento.removeAttribute('aria-label');
    elemento._pedacos = null;
  };
  if (!gsap || !pedacos.length) {
    limpar();
    return Promise.resolve();
  }
  const para = amb.reduzido
    ? { autoAlpha: 0, duration: Math.min(duracao, 0.6), stagger: 0, delay: atraso, ease: 'none' }
    : { autoAlpha: 0, y: subida, duration: duracao, stagger: intervalo, delay: atraso, ease: curva || curvas.branco.sair };
  if (!amb.reduzido && usaDesfoque()) para.filter = 'blur(8px)';
  return comoPromise(gsap.to(pedacos, para)).then(limpar);
}
