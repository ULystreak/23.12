// Pergaminho: a folha DOM (contrato 4.5).
//
// No celular cobre a tela; no computador é uma coluna central (até ~720 px) com
// o mundo branco e as pétalas visíveis dos lados.
//
//   perg.retanguloAlvo() → DOMRect      onde o papel 3D deve pousar
//   perg.receberPapel() → Promise       a folha aparece exatamente ali (troca invisível)
//   perg.folha                          elemento em branco (o seletor de música é montado aqui)
//   perg.desenrolar(capitulo) → Promise desenrola de cima para baixo e libera a rolagem
//   perg.enrolar() → Promise            enrola de volta até virar a folha em branco
//   perg.soltar() → Promise             a folha vai embora e o mundo volta
//   perg.rolagem → { el, progresso, y, aoRolar(fn(progresso, y)), irPara(y, { imediato }) }
//
// Além do contrato:
//   perg.esperarFechar() → Promise      resolve quando o capítulo chama api.fechar()
//   perg.estado                         'oculto' | 'folha' | 'aberto'
//
// Capítulo: { id, montar(raiz, api) → { destruir() } }, com
//   api = { conteudo, amb, som, rolagem, fundo, gsap, ScrollTrigger, fechar(), recursos }
// O fio de progresso (a costura na margem direita) é do pergaminho, não do capítulo.
//
// Para quem escreve um capítulo:
// - O rolador é `api.rolagem.el` (já é o padrão de ScrollTrigger.defaults). No toque a
//   rolagem é a nativa; com mouse, Lenis.
// - O capítulo mora numa janela recortada no papel. `api.fundo` fica parado atrás do
//   conteúdo, dentro da janela. Um `position: fixed` dentro do capítulo fica preso à
//   janela (não à tela) e é recortado por ela.
// - `api.rolagem.el` carrega `--perg-altura` e `--perg-largura` (px da janela), para
//   seções de uma tela: `height: var(--perg-altura)`. `position: sticky` funciona.
// - Quando a altura do conteúdo muda (imagem ou fonte que chega depois), o pergaminho
//   chama `ScrollTrigger.refresh(true)` sozinho.
//
// Como o desenrolar é feito: o capítulo é montado inteiro atrás de um recorte
// (clip-path) que acompanha o eixo de um rolo de papel. Só transform, clip-path e
// opacity mudam durante a animação.

import { clamp, debounce, el, espera, quadro, semente, svg } from './nucleo/util.js';
import { curvas } from './nucleo/movimento.js';

const LADRILHO = 256;        // lado do ladrilho de fibra em px de CSS (igual a --perg-ladrilho)
const AFINA = 0.3;           // quanto o rolo afina até acabar de desenrolar
const DURACAO_ABRIR = 1.6;   // s, do rolo nascer em cima até sumir embaixo
const DURACAO_FECHAR = 1.35; // s
const DURACAO_SOLTAR = 1.7;  // s
// s, a folha DOM tomando o lugar do papel 3D: poucos quadros, só para as pétalas que
// passavam na frente se desfazerem. Mais que isso vira um cruzamento de dois papéis.
const DURACAO_POUSO = 0.12;
const ESPERA_DICA = 3000;    // ms sem rolar até a dica aparecer
const DICA_VISIVEL = 7200;   // ms: três pulsos da seta (a animação dura 2,4 s)
const DICA_PAUSA = 9000;     // ms recolhida antes de voltar
const CORTE = 0.9;           // o rolo some da folha em 90% da curva: sai ainda andando
const INCLINA = 0.75;        // graus: o rolo nunca desce perfeitamente reto
const FAIXA_CURVA = 46;      // px, igual à altura de .perg-rolo-curva
const FAIXA_SOMBRA = 42;     // px, igual à altura de .perg-rolo-sombra

// Costura (px): um ponto à vista, um trecho por baixo do papel, e assim por diante.
const PASSO = 13;
const PONTO = 8;
const COSTURA_TOPO = 14;     // onde a costura começa (desce se o mini seletor estiver por cima)
const AGULHA = 26;           // do olho até a ponta

const SETA = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12.1 4.4c.3 4.5.2 8.9-.1 13.4M6.5 12.6c2 1.7 3.8 3.6 5.4 5.8 1.5-2.2 3.4-4.2 5.6-5.9"
      fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;

const DESENHO_AGULHA = `
  <svg viewBox="0 0 10 30" width="10" height="30" aria-hidden="true">
    <path class="perg-agulha-laco" d="M5 5.2C2.9 4 2.8 1.6 4.6.4"/>
    <path class="perg-agulha-corpo" d="M5 1c1.3 0 1.65 1.9 1.5 4.1L5.55 27.8 5 29.6l-.55-1.8L3.5 5.1C3.35 2.9 3.7 1 5 1z"/>
    <path class="perg-agulha-brilho" d="M4.4 7.2 4.8 26"/>
    <ellipse class="perg-agulha-olho" cx="5" cy="4" rx=".62" ry="1.75"/>
  </svg>`;

/**
 * Desenha o ladrilho de fibra do papel: grão fino e fibras curtas e longas, claras
 * e escuras, sobre fundo transparente (a cor do papel vem do CSS). As fibras que
 * cruzam a borda são repetidas do outro lado, para o ladrilho emendar sem costura.
 */
function desenharFibra() {
  const escala = 2;
  const tela = document.createElement('canvas');
  tela.width = LADRILHO * escala;
  tela.height = LADRILHO * escala;
  const c = tela.getContext('2d');
  if (!c) return null;
  c.scale(escala, escala);
  const r = semente(23122026);
  const T = LADRILHO;

  for (let i = 0; i < 2400; i++) {
    const claro = r() < 0.5;
    c.fillStyle = claro
      ? `rgba(255,255,255,${(0.3 + r() * 0.45).toFixed(3)})`
      : `rgba(126,98,66,${(0.04 + r() * 0.06).toFixed(3)})`;
    const lado = 0.5 + r() * 0.7;
    c.fillRect(r() * T, r() * T, lado, lado);
  }

  c.lineCap = 'round';
  for (let i = 0; i < 230; i++) {
    const x = r() * T;
    const y = r() * T;
    const longa = r() < 0.24;
    const comprimento = longa ? 24 + r() * 44 : 4 + r() * 15;
    const angulo = r() * Math.PI;
    const dx = Math.cos(angulo) * comprimento;
    const dy = Math.sin(angulo) * comprimento;
    const barriga = (r() - 0.5) * comprimento * 0.55;
    const cx = x + dx / 2 - Math.sin(angulo) * barriga;
    const cy = y + dy / 2 + Math.cos(angulo) * barriga;
    const clara = r() < 0.4;
    c.strokeStyle = clara
      ? `rgba(255,255,255,${(0.5 + r() * 0.4).toFixed(3)})`
      : `rgba(132,104,70,${(0.055 + r() * 0.085).toFixed(3)})`;
    c.lineWidth = longa ? 0.5 + r() * 0.35 : 0.45 + r() * 0.6;
    for (const ox of [-T, 0, T]) {
      for (const oy of [-T, 0, T]) {
        c.beginPath();
        c.moveTo(x + ox, y + oy);
        c.quadraticCurveTo(cx + ox, cy + oy, x + dx + ox, y + dy + oy);
        c.stroke();
      }
    }
  }
  return tela;
}

export function criarPergaminho({ raiz, mundo, amb, som, conteudo, recursos }) {
  const gsap = window.gsap;
  const ScrollTrigger = window.ScrollTrigger || null;
  const palco = document.getElementById('palco');

  // ---- estrutura ------------------------------------------------------------------
  const oculto = { 'aria-hidden': 'true' };
  const sombra = el('div', { class: 'perg-sombra', ...oculto });
  // A sombra da folha já descolada: larga e macia, sem aresta. Só aparece no soltar.
  const sombraAlta = el('div', { class: 'perg-sombra perg-sombra-alta', ...oculto });
  const fibraFolha = el('div', { class: 'perg-fibra', ...oculto });
  const folha = el('div', 'perg-folha');

  // O fundo e a raiz do capítulo são trocados por elementos novos a cada capítulo:
  // um capítulo que termina de montar (ou de se destruir) atrasado mexe só no que é dele.
  let fundo = el('div', { class: 'perg-fundo', ...oculto });
  let conteudoEl = el('div', 'perg-conteudo');
  const rolagemEl = el('div', { class: 'perg-rolagem', tabindex: '0' }, conteudoEl);
  const corte = el('div', { class: 'perg-corte', ...oculto });
  const vista = el('div', 'perg-vista', [fundo, rolagemEl, corte]);
  const costura = el('div', { class: 'perg-costura', ...oculto });
  const dica = el('div', { class: 'perg-dica', ...oculto }, svg(SETA));
  const janela = el('div', 'perg-janela', [vista, costura, dica]);
  const camada = el('div', { class: 'perg-camada', hidden: true }, [el('div', { class: 'perg-fibra', ...oculto }), janela]);

  const fibraRolo = el('div', 'perg-rolo-fibra');
  const corpoRolo = el('div', 'perg-rolo-corpo', [fibraRolo, el('div', 'perg-rolo-luz')]);
  const curvaRolo = el('div', 'perg-rolo-curva');
  const sombraRolo = el('div', 'perg-rolo-sombra');
  const rolo = el('div', { class: 'perg-rolo', hidden: true, ...oculto }, [curvaRolo, sombraRolo, corpoRolo]);

  const papel = el('div', 'perg-papel', [fibraFolha, folha, camada, rolo]);
  const moldura = el('div', 'perg-moldura', [sombra, sombraAlta, papel]);
  raiz.append(moldura);

  if (ScrollTrigger) ScrollTrigger.defaults({ scroller: rolagemEl });

  let estado = 'oculto';
  let geracao = 0;               // muda a cada abrir/soltar: o que ficou esperando percebe que perdeu a vez
  let instancia = null;          // o que capitulo.montar devolveu
  let lenis = null;
  let tiqueLenis = null;
  let promessaFechar = Promise.resolve();
  let promessaEnrolar = null;
  let promessaSoltar = null;
  let animRolo = null;
  let papelACaminho = false;     // retanguloAlvo() foi pedido: um papel 3D vem pousar aqui
  let saindo = false;

  // Para o CSS de quem precisar: #pergaminho[data-estado="folha|abrindo|aberto|fechando|saindo"].
  const publicar = (nome) => { raiz.dataset.estado = nome; };

  const comoPromise = (criar) => new Promise((resolver) => { criar({ onComplete: resolver, onInterrupt: resolver }); });
  const tween = (alvo, vars) => comoPromise((fim) => gsap.to(alvo, { ...vars, ...fim }));
  const cobreTela = () => moldura.getBoundingClientRect().width >= innerWidth - 1;
  const recortar = (no, valor) => {
    no.style.webkitClipPath = valor;
    no.style.clipPath = valor;
  };

  // ---- a fibra do papel -----------------------------------------------------------
  // Gerada uma vez, num canvas pequeno, e usada como fundo ladrilhado (folha, margens
  // do capítulo, rolo e aba da dica). Sem ela o papel fica liso: nada quebra.
  let fibraPedida = false;
  function garantirFibra() {
    if (fibraPedida) return;
    fibraPedida = true;
    try {
      const tela = desenharFibra();
      if (!tela) return;
      const aplicar = (endereco) => raiz.style.setProperty('--perg-fibra', `url("${endereco}")`);
      if (tela.toBlob && window.URL && URL.createObjectURL) {
        tela.toBlob((blob) => { if (blob) aplicar(URL.createObjectURL(blob)); }, 'image/png');
      } else {
        aplicar(tela.toDataURL('image/png'));
      }
    } catch { /* papel liso */ }
  }
  (window.requestIdleCallback || ((fn) => requestAnimationFrame(() => requestAnimationFrame(fn))))(garantirFibra);

  // ---- medidas --------------------------------------------------------------------
  const medida = { largura: 0, altura: 0, rolo: 64, dpr: 1 };
  const naGrade = (v) => Math.round(v * medida.dpr) / medida.dpr;      // cai em pixel inteiro do aparelho

  function medir() {
    if (raiz.hidden) return;
    medida.largura = moldura.clientWidth;
    medida.altura = moldura.clientHeight;
    medida.dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 3));
    if (!rolo.hidden) medida.rolo = corpoRolo.offsetHeight || medida.rolo;
    if (!camada.hidden) {
      rolagemEl.style.setProperty('--perg-altura', `${vista.clientHeight}px`);
      rolagemEl.style.setProperty('--perg-largura', `${vista.clientWidth}px`);
    }
  }

  // ---- rolagem ----------------------------------------------------------------------
  const ouvintesRolagem = new Set();
  let avisoPendente = false;
  let rolou = false;

  const rolagem = {
    el: rolagemEl,
    get y() { return rolagemEl.scrollTop; },
    get progresso() {
      const max = rolagemEl.scrollHeight - rolagemEl.clientHeight;
      return max > 0 ? clamp(rolagemEl.scrollTop / max) : 0;
    },
    aoRolar(fn) {
      ouvintesRolagem.add(fn);
      return () => ouvintesRolagem.delete(fn);
    },
    irPara(y, { imediato = false } = {}) {
      if (lenis) lenis.scrollTo(y, { immediate: imediato || amb.reduzido });
      else rolagemEl.scrollTo({ top: y, behavior: imediato || amb.reduzido ? 'auto' : 'smooth' });
    },
  };

  function avisarRolagem() {
    avisoPendente = false;
    const p = rolagem.progresso;
    costurar(p);
    for (const fn of ouvintesRolagem) {
      try { fn(p, rolagemEl.scrollTop); } catch (erro) { console.error(erro); }
    }
  }
  rolagemEl.addEventListener('scroll', () => {
    if (!rolou && rolagemEl.scrollTop > 2) {
      rolou = true;
      esconderDica();
    }
    if (avisoPendente) return;
    avisoPendente = true;
    requestAnimationFrame(avisarRolagem);
  }, { passive: true });

  function ligarRolagemSuave() {
    // Lenis só com mouse; no toque a rolagem nativa é melhor (e é a do iPhone).
    if (amb.toque || amb.reduzido || !window.Lenis || lenis) return;
    try {
      lenis = new window.Lenis({ wrapper: rolagemEl, content: conteudoEl, eventsTarget: camada, autoRaf: false, lerp: 0.11 });
      tiqueLenis = (t) => lenis.raf(t * 1000);
      gsap.ticker.add(tiqueLenis);
      if (ScrollTrigger) lenis.on('scroll', ScrollTrigger.update);
    } catch {
      lenis = null;
    }
  }
  function desligarRolagemSuave() {
    if (!lenis) return;
    gsap.ticker.remove(tiqueLenis);
    lenis.destroy();
    lenis = null;
  }
  function travarRolagem(travar) {
    rolagemEl.style.overflowY = travar ? 'hidden' : '';
    if (lenis) travar ? lenis.stop() : lenis.start();
  }

  // Imagem ou fonte que chega depois muda a altura do capítulo: os gatilhos de
  // rolagem precisam ser refeitos. `refresh(true)` espera a rolagem parar.
  let alturaConferida = -1;
  const refazerGatilhos = debounce(() => {
    if (estado !== 'aberto') return;
    alturaConferida = conteudoEl.offsetHeight;
    if (lenis) lenis.resize();
    if (ScrollTrigger) ScrollTrigger.refresh(true);
    avisarRolagem();
  }, 140);
  const observadorConteudo = window.ResizeObserver
    ? new ResizeObserver(() => {
      if (estado !== 'aberto' || conteudoEl.offsetHeight === alturaConferida) return;
      refazerGatilhos();
    })
    : null;

  // ---- a costura (o fio de progresso) -------------------------------------------------
  // Na margem direita do papel: os furos já estão lá; os pontos vermelhos vão sendo
  // dados de cima para baixo conforme ela lê, com a agulha marcando onde está.
  const fio = { pontos: null, agulha: null, altura: 0, comprimento: 0, topo: COSTURA_TOPO };

  /** A costura começa abaixo do mini seletor de música quando ele fica por cima da margem. */
  function topoDaCostura() {
    const botao = document.querySelector('#mini:not([hidden]) [data-acao="mini"]');
    if (!botao) return COSTURA_TOPO;
    const b = botao.getBoundingClientRect();
    const c = costura.getBoundingClientRect();
    const porCima = b.width > 0 && b.right > c.left - 4 && b.left < c.right + 4 && b.bottom > c.top;
    return porCima ? Math.max(COSTURA_TOPO, Math.round(b.bottom - c.top) + 12) : COSTURA_TOPO;
  }

  function montarCostura() {
    const altura = vista.clientHeight;
    costura.textContent = '';
    fio.pontos = null;
    fio.agulha = null;
    fio.altura = altura;
    const topo = topoDaCostura();
    const n = Math.floor((altura - topo - AGULHA - 8 - PONTO) / PASSO) + 1;
    if (n < 3) return;

    const r = semente(2312);
    let traco = '';
    let furos = '';
    for (let i = 0; i < n; i++) {
      const y = topo + i * PASSO;
      const x1 = 8 + (r() - 0.5) * 1.2;
      const x2 = 8 + (r() - 0.5) * 1.2;
      const fim = y + PONTO + (r() - 0.5) * 1.3;
      traco += `M${x1.toFixed(2)} ${y}L${x2.toFixed(2)} ${fim.toFixed(2)}`;
      furos += `<circle cx="${x1.toFixed(2)}" cy="${y}" r=".8"/><circle cx="${x2.toFixed(2)}" cy="${fim.toFixed(2)}" r=".8"/>`;
    }
    const cabeca = `width="16" height="${altura}" viewBox="0 0 16 ${altura}" aria-hidden="true"`;
    const pontos = el('div', 'perg-pontos', svg(`
      <svg ${cabeca}>
        <path class="perg-ponto-sombra" d="${traco}" transform="translate(.8 1)"/>
        <path class="perg-ponto-fio" d="${traco}"/>
        <circle class="perg-no" cx="8" cy="${topo - 1.6}" r="1.9"/>
        <path class="perg-ponto-fio" d="M8 ${topo - 2}c-2.4-1.6-3-3.8-1.6-6"/>
      </svg>`));
    const agulha = el('div', 'perg-agulha', svg(DESENHO_AGULHA));
    costura.append(svg(`<svg class="perg-furos" ${cabeca}>${furos}</svg>`), pontos, agulha);

    fio.pontos = pontos;
    fio.agulha = agulha;
    fio.topo = topo;
    fio.comprimento = (n - 1) * PASSO + PONTO;
  }

  function costurar(p) {
    if (!fio.pontos) return;
    const y = fio.topo + clamp(p) * fio.comprimento;
    recortar(fio.pontos, `inset(0px 0px ${Math.max(0, fio.altura - y).toFixed(1)}px 0px)`);
    // A agulha balança de leve a cada ponto, como mão que costura.
    const fase = ((y - fio.topo) % PASSO) / PASSO;
    const giro = amb.reduzido ? 7 : 7 + Math.sin(fase * Math.PI * 2) * 4.5;
    fio.agulha.style.transform = `translate3d(0,${y.toFixed(1)}px,0) rotate(${giro.toFixed(2)}deg)`;
  }

  // ---- a dica de rolagem ---------------------------------------------------------------
  let dicaVisivel = false;
  function mostrarDica() {
    if (dicaVisivel) return;
    dicaVisivel = true;
    dica.classList.add('ativa');
    gsap.fromTo(dica,
      { autoAlpha: 0, yPercent: amb.reduzido ? 0 : 100 },
      { autoAlpha: 1, yPercent: 0, duration: 1.1, ease: curvas.branco.entrar, overwrite: true });
  }
  function esconderDica(jaJa = false) {
    if (!dicaVisivel && !jaJa) return;
    dicaVisivel = false;
    const fim = () => {
      dica.classList.remove('ativa');
      gsap.set(dica, { clearProps: 'transform,opacity,visibility' });
    };
    if (jaJa) {
      gsap.killTweensOf(dica);
      fim();
    } else {
      gsap.to(dica, { autoAlpha: 0, yPercent: amb.reduzido ? 0 : 100, duration: 0.3, ease: curvas.ui.resposta, overwrite: true, onComplete: fim });
    }
  }
  // A aba fica por cima do pé da janela: depois de três pulsos ela se recolhe (para
  // não cobrir o capítulo enquanto ela lê parada) e volta se ela continuar sem rolar.
  async function agendarDica(g) {
    const vale = () => g === geracao && estado === 'aberto' && !rolou
      && rolagemEl.scrollHeight - rolagemEl.clientHeight > 24;
    await espera(ESPERA_DICA);
    while (vale()) {
      mostrarDica();
      await espera(DICA_VISIVEL);
      if (!vale()) return;
      esconderDica();
      await espera(DICA_PAUSA);
    }
  }

  // ---- o rolo ---------------------------------------------------------------------------
  /**
   * Põe o rolo onde ele está na fração `p` (0..1) do percurso.
   * sentido +1: desenrola, de cima para baixo, afinando. −1: enrola, de baixo para cima,
   * engordando. O capítulo aparece do eixo do rolo para cima; do eixo para baixo, a folha.
   */
  function posicionarRolo(sentido, p) {
    const H = medida.altura;
    const R = medida.rolo;
    const leve = amb.nivel === 'baixo';
    const afina = leve ? 0 : AFINA;
    const folga = leve ? 2 : 8;                  // o rolo inclinado ocupa uns pixels a mais
    let de;
    let ate;
    let s;
    if (sentido > 0) {
      s = 1 - afina * p;
      de = -R / 2 - 2;                                         // encostado por fora na borda de cima
      ate = H + (R * (1 - afina)) / 2 + FAIXA_CURVA + folga;   // saiu por baixo, com a faixa de curvatura
    } else {
      s = 1 - afina * (1 - p);
      de = H + (R * (1 - afina)) / 2 + 2;                      // encostado por fora na borda de baixo
      ate = -R / 2 - FAIXA_SOMBRA - folga;                     // saiu por cima, com a sombra
    }
    const eixo = naGrade(de + (ate - de) * p);
    const raio = (R * s) / 2;
    // Mão nenhuma desenrola perfeitamente reto: um lado se adianta, o outro alcança.
    const inclina = leve ? 0 : sentido * INCLINA * Math.sin(p * 5.2 - 0.9) * (1 - 0.5 * p);

    rolo.style.transform = `translate3d(0,${eixo}px,0) rotate(${inclina.toFixed(3)}deg)`;
    rolo.style.opacity = clamp(p / 0.035).toFixed(3);          // as sombras chegam, não aparecem de estalo
    corpoRolo.style.transform = `scaleY(${s.toFixed(4)})`;
    curvaRolo.style.transform = `translate3d(0,${(-raio).toFixed(2)}px,0)`;
    sombraRolo.style.transform = `translate3d(0,${raio.toFixed(2)}px,0)`;
    if (!leve) {
      // O rolo gira sem escorregar: a fibra da face de cá anda o mesmo tanto que o eixo.
      const giro = ((eixo % LADRILHO) + LADRILHO) % LADRILHO;
      fibraRolo.style.transform = `translate3d(0,${giro.toFixed(2)}px,0)`;
    }
    recortar(camada, `inset(0px 0px ${Math.max(0, H - eixo).toFixed(2)}px 0px)`);
  }

  // A curva é a da câmera do mundo branco (demora a sair, desliza até parar), cortada
  // em 90% do caminho: o rolo deixa a folha ainda andando, em vez de rastejar até a
  // borda, e nada fica esperando por um resto de movimento que ninguém vê.
  // Desenrolar: power3.inOut (o rolo pesa no começo). Enrolar: power1.inOut, que sai
  // mais cedo, porque é resposta ao toque dela no botão de fechar.
  const curvasCortadas = {};
  function curvaDoRolo(nome) {
    if (curvasCortadas[nome]) return curvasCortadas[nome];
    const base = gsap.parseEase(nome);
    let a = 0;
    let b = 1;
    for (let i = 0; i < 22; i++) {
      const meio = (a + b) / 2;
      if (base(meio) < CORTE) a = meio; else b = meio;
    }
    const chegada = base(b) || 1;
    curvasCortadas[nome] = (t) => base(t * b) / chegada;
    return curvasCortadas[nome];
  }

  function rolar(sentido, duracao) {
    rolo.hidden = false;
    medir();
    const andamento = { p: 0 };
    const aplicar = () => posicionarRolo(sentido, andamento.p);
    aplicar();
    const curva = curvaDoRolo(sentido > 0 ? curvas.branco.camera : 'power1.inOut');
    return comoPromise((fim) => {
      animRolo = gsap.to(andamento, { p: 1, duration: duracao, ease: curva, onUpdate: aplicar, ...fim });
    });
  }

  function guardarRolo() {
    if (animRolo) animRolo.kill();
    animRolo = null;
    rolo.hidden = true;
    rolo.style.opacity = '';
  }

  // ---- montar e desmontar o capítulo -----------------------------------------------------
  function destruirInstancia(alvo) {
    try { if (alvo && alvo.destruir) alvo.destruir(); } catch (erro) { console.error(erro); }
  }

  /** Fundo e raiz novos em folha: o que o capítulo anterior deixou (ou ainda vai mexer) fica para trás. */
  function renovarCapitulo() {
    const novoFundo = el('div', { class: 'perg-fundo', ...oculto });
    const novoConteudo = el('div', 'perg-conteudo');
    fundo.replaceWith(novoFundo);
    conteudoEl.replaceWith(novoConteudo);
    fundo = novoFundo;
    conteudoEl = novoConteudo;
  }

  /** Tira o capítulo e deixa a camada pronta para o próximo. A folha em branco fica por baixo. */
  function desmontar() {
    esconderDica(true);
    destruirInstancia(instancia);
    instancia = null;
    if (ScrollTrigger) {
      for (const st of ScrollTrigger.getAll()) if (st.scroller === rolagemEl) st.kill();
    }
    if (observadorConteudo) observadorConteudo.disconnect();
    refazerGatilhos.cancelar();
    desligarRolagemSuave();
    renovarCapitulo();
    costura.textContent = '';
    fio.pontos = null;
    fio.agulha = null;
    gsap.killTweensOf(camada);
    camada.hidden = true;
    gsap.set(camada, { clearProps: 'transform,opacity,visibility' });
    recortar(camada, '');
    rolagemEl.scrollTop = 0;
    rolagemEl.removeAttribute('role');
    rolagemEl.removeAttribute('aria-labelledby');
    travarRolagem(false);
    delete raiz.dataset.capitulo;
    if (palco) palco.removeAttribute('aria-hidden');
  }

  /** O título do capítulo dá nome à região de leitura e recebe o foco quando ela abre. */
  function tituloDoCapitulo() {
    return conteudoEl.querySelector('h1, h2, h3, [role="heading"]');
  }
  function nomearRegiao() {
    const titulo = tituloDoCapitulo();
    if (!titulo) return;
    if (!titulo.id) titulo.id = 'perg-titulo';
    rolagemEl.setAttribute('role', 'region');
    rolagemEl.setAttribute('aria-labelledby', titulo.id);
  }
  function focarTitulo() {
    const titulo = tituloDoCapitulo();
    if (titulo && !titulo.hasAttribute('tabindex')) {
      titulo.setAttribute('tabindex', '-1');
      titulo.dataset.pergFoco = '';
    }
    const focar = (no) => {
      try { no.focus({ preventScroll: true }); } catch { /* sem foco, segue */ }
      return document.activeElement === no;
    };
    // Um título que ainda não pode receber foco (os blocos do Poppy só caem depois)
    // não deixa o foco solto no body: o rolador fica com ele, e as teclas já rolam.
    if (titulo && focar(titulo)) return;
    focar(rolagemEl);
    if (!titulo) return;
    // Quando o título ficar focável, ele assume (só se o foco ainda estiver no rolador).
    const g = geracao;
    (async () => {
      for (let i = 0; i < 40; i++) {
        await espera(100);
        if (g !== geracao || estado !== 'aberto' || document.activeElement !== rolagemEl || rolagemEl.scrollTop > 2) return;
        if (focar(titulo)) return;
        focar(rolagemEl);
      }
    })();
  }

  // ---- tamanho da tela -------------------------------------------------------------------
  // Girar o aparelho ou mudar o tamanho da janela muda se a folha cobre a tela
  // inteira: o mundo atrás dela liga ou desliga junto (senão ficaria congelado nos lados).
  const conferirMundo = debounce(() => {
    if (estado === 'oculto' || saindo) return;
    if (cobreTela()) mundo.desligar();
    else mundo.ligar();
    if (lenis) lenis.resize();
  }, 180);
  window.addEventListener('resize', conferirMundo, { passive: true });

  // As medidas que o rolo e a costura usam acompanham a folha na hora (sem atraso):
  // uma animação em curso continua certa no tamanho novo.
  const aoMudarTamanho = () => {
    if (raiz.hidden) return;
    medir();
    if (!camada.hidden && vista.clientHeight !== fio.altura) {
      montarCostura();
      costurar(rolagem.progresso);
    }
  };
  if (window.ResizeObserver) new ResizeObserver(aoMudarTamanho).observe(moldura);
  else window.addEventListener('resize', aoMudarTamanho, { passive: true });

  // ---- API ----------------------------------------------------------------------------
  const perg = {
    el: raiz,
    folha,
    rolagem,
    get estado() { return estado; },

    retanguloAlvo() {
      garantirFibra();
      // Mede a moldura mesmo com o pergaminho escondido.
      const estavaOculto = raiz.hidden;
      if (estavaOculto) {
        raiz.style.visibility = 'hidden';
        raiz.hidden = false;
        gsap.set(moldura, { clearProps: 'transform' });
      }
      const rect = moldura.getBoundingClientRect();
      if (estavaOculto) {
        raiz.hidden = true;
        raiz.style.visibility = '';
        papelACaminho = true;          // quem pede o retângulo vai pousar um papel aqui
      }
      return rect;
    },

    async receberPapel() {
      if (estado !== 'oculto') return;
      const pousando = papelACaminho;
      papelACaminho = false;
      garantirFibra();

      folha.textContent = '';
      gsap.killTweensOf([moldura, sombra, fibraFolha, folha]);
      gsap.set([moldura, folha], { clearProps: 'transform,opacity,visibility' });
      // No quadro em que aparece, a folha é só a cor do papel, igual ao papel 3D que
      // acabou de pousar. A fibra e a sombra chegam depois, devagar.
      gsap.set([fibraFolha, sombra], { opacity: 0 });
      if (pousando) gsap.set(moldura, { opacity: 0 });
      raiz.hidden = false;
      estado = 'folha';
      publicar('folha');
      medir();

      gsap.to(fibraFolha, { opacity: 1, duration: 1.2, ease: 'none', delay: pousando ? DURACAO_POUSO : 0 });
      gsap.to(sombra, { opacity: 1, duration: 1.6, ease: curvas.branco.entrar, delay: pousando ? DURACAO_POUSO : 0 });
      if (pousando) {
        // O papel 3D continua atrás, da mesma cor: a folha toma o lugar dele em poucos
        // quadros. O papel não muda; o que passava na frente dele (as pétalas) se
        // desfaz em vez de sumir de estalo.
        await tween(moldura, { opacity: 1, duration: DURACAO_POUSO, ease: 'none' });
        gsap.set(moldura, { clearProps: 'opacity' });
        await quadro();              // a folha já está pintada quando o papel 3D for escondido
      } else {
        // Sem carta nenhuma (entrada direta numa cena): a folha surge sozinha.
        await comoPromise((fim) => gsap.fromTo(moldura,
          { autoAlpha: 0, y: amb.reduzido ? 0 : 14 },
          { autoAlpha: 1, y: 0, duration: 0.7, ease: curvas.branco.entrar, ...fim }));
        gsap.set(moldura, { clearProps: 'transform,opacity,visibility' });
      }
      if (estado === 'folha' && !saindo && cobreTela()) mundo.desligar();
    },

    async desenrolar(capitulo) {
      if (estado === 'aberto') await perg.enrolar();
      if (estado === 'oculto') await perg.receberPapel();
      if (!camada.hidden) {            // sobra de uma abertura que quebrou no meio
        guardarRolo();
        desmontar();
      }
      const g = ++geracao;

      // Cada abertura tem a sua promessa: um capítulo antigo que chame fechar() atrasado
      // não fecha o capítulo seguinte.
      let liberar = null;
      promessaFechar = new Promise((resolver) => { liberar = resolver; });
      let avisarAberto = null;
      const api = {
        conteudo, amb, som, rolagem, fundo, gsap, ScrollTrigger, recursos,
        fechar() { liberar(); },
        // Resolve com true quando o capítulo acabou de desenrolar e a rolagem está livre
        // (false se a abertura foi interrompida): para o que só deve começar à vista dela.
        aberto: new Promise((resolver) => { avisarAberto = resolver; }),
      };

      // Monta o capítulo inteiro, escondido atrás do recorte.
      const raizCapitulo = conteudoEl;
      rolagemEl.scrollTop = 0;
      rolou = false;
      camada.hidden = false;
      recortar(camada, 'inset(0px 0px 100% 0px)');
      raiz.dataset.capitulo = capitulo.id || '';
      publicar('abrindo');
      medir();
      let montado = null;
      try {
        montado = (await capitulo.montar(raizCapitulo, api)) || null;
      } catch (erro) {
        // Capítulo que quebra não prende ninguém: fica vazio e já pode ser fechado.
        console.error(`[carta] o capítulo "${capitulo.id}" falhou ao montar`, erro);
        api.fechar();
      }
      if (g !== geracao) {             // a folha foi solta enquanto o capítulo montava
        destruirInstancia(montado);
        avisarAberto(false);
        return;
      }
      instancia = montado;

      ligarRolagemSuave();
      travarRolagem(true);
      nomearRegiao();
      montarCostura();
      avisarRolagem();

      som.efeito('desenrolar');
      // Pinta o capítulo uma vez, quase transparente, antes de o rolo sair: a primeira
      // rasterização (fontes, imagens, camadas do capítulo) não cai no meio do movimento.
      if (!amb.reduzido) {
        camada.style.opacity = '0.002';
        recortar(camada, '');
        await quadro();
        await quadro();
        recortar(camada, 'inset(0px 0px 100% 0px)');
        camada.style.opacity = '';
        if (g !== geracao) { avisarAberto(false); return; }
      }

      if (folha.firstChild) gsap.to(folha, { autoAlpha: 0, duration: 0.3, ease: 'none' });
      if (amb.reduzido) {
        // Sem rolo viajando: o capítulo assenta com uma dissolvência curta.
        recortar(camada, '');
        await comoPromise((fim) => gsap.fromTo(camada,
          { autoAlpha: 0, y: 10 },
          { autoAlpha: 1, y: 0, duration: 0.8, ease: curvas.branco.entrar, ...fim }));
      } else {
        await rolar(1, DURACAO_ABRIR);
      }
      if (g !== geracao) { avisarAberto(false); return; }

      guardarRolo();
      recortar(camada, '');
      gsap.set(camada, { clearProps: 'transform,opacity,visibility' });
      folha.textContent = '';
      gsap.set(folha, { clearProps: 'opacity,visibility' });

      estado = 'aberto';
      publicar('aberto');
      travarRolagem(false);
      medir();
      alturaConferida = conteudoEl.offsetHeight;
      if (lenis) lenis.resize();
      if (ScrollTrigger) ScrollTrigger.refresh();
      if (observadorConteudo) observadorConteudo.observe(conteudoEl);
      if (palco) palco.setAttribute('aria-hidden', 'true');
      focarTitulo();
      agendarDica(g);
      if (cobreTela()) mundo.desligar();
      avisarAberto(true);
    },

    esperarFechar() {
      return promessaFechar;
    },

    enrolar() {
      if (estado !== 'aberto') return Promise.resolve();
      if (promessaEnrolar) return promessaEnrolar;
      const g = ++geracao;
      promessaEnrolar = (async () => {
        // Enrola sobre o que estiver à vista: ela está no fim do capítulo e fica lá.
        esconderDica();
        travarRolagem(true);
        publicar('fechando');
        som.efeito('desenrolar');
        folha.textContent = '';
        gsap.set(folha, { clearProps: 'opacity,visibility' });

        if (amb.reduzido) {
          await tween(camada, { autoAlpha: 0, y: -10, duration: 0.7, ease: curvas.branco.sair });
        } else {
          await rolar(-1, DURACAO_FECHAR);
        }
        if (g !== geracao) return;

        guardarRolo();
        desmontar();
        estado = 'folha';
        publicar('folha');
      })().finally(() => { promessaEnrolar = null; });
      return promessaEnrolar;
    },

    soltar() {
      if (promessaSoltar) return promessaSoltar;
      promessaSoltar = (async () => {
        if (estado === 'aberto') await perg.enrolar();
        if (estado === 'oculto') return;
        geracao++;
        if (!camada.hidden) {          // um capítulo ficou montado (abertura interrompida): sai agora
          guardarRolo();
          desmontar();
        }
        saindo = true;
        publicar('saindo');
        conferirMundo.cancelar();
        mundo.ligar();
        gsap.killTweensOf([moldura, sombra, sombraAlta]);
        gsap.set(sombra, { opacity: 1 });
        gsap.set(sombraAlta, { opacity: 0 });

        if (amb.reduzido) {
          await tween(moldura, { autoAlpha: 0, duration: 0.7, ease: 'none' });
        } else {
          // Dois quadros para o mundo voltar a desenhar atrás da folha antes de ela sair.
          await quadro();
          await quadro();
          som.efeito('papel');
          // A folha se desprende: primeiro descola do lugar (cresce um nada, vindo
          // na direção dela, e a sombra se abre embaixo), depois sobe girando de leve
          // até sair por cima. O descolar começa no mesmo quadro: nada fica parado.
          // A sombra não se desloca como uma caixa (a aresta dela apareceria como um
          // segundo papel embaixo): a curta e nítida se desfaz enquanto a larga e
          // macia, de quem já está no ar, aparece.
          // No celular a folha cobre a tela: crescer não se veria. Lá ela se afasta
          // (encolhe um pouco) e o mundo branco aparece em volta logo no começo.
          const sobe = medida.altura * 1.12 + 120;
          const descola = cobreTela() ? 0.955 : 1.022;
          moldura.style.willChange = 'transform';
          await comoPromise((fim) => {
            const tl = gsap.timeline({ ...fim });
            tl.to(moldura, { yPercent: -1.4, scale: descola, transformOrigin: '50% 40%', duration: 0.6, ease: 'power2.out' }, 0)
              .to(sombra, { opacity: 0, duration: 0.5, ease: 'power2.out' }, 0)
              .to(sombraAlta, { opacity: 1, duration: 0.7, ease: 'power2.out' }, 0)
              .to(moldura, {
                y: -sobe,
                x: medida.largura * 0.035,
                rotation: -4.5,
                duration: DURACAO_SOLTAR,
                ease: curvas.branco.sair,
              }, 0.22);
          });
          moldura.style.willChange = '';
        }

        raiz.hidden = true;
        folha.textContent = '';
        gsap.set([moldura, folha, sombra, sombraAlta], { clearProps: 'transform,transformOrigin,opacity,visibility' });
        estado = 'oculto';
        delete raiz.dataset.estado;
        papelACaminho = false;
        saindo = false;
      })().finally(() => { promessaSoltar = null; });
      return promessaSoltar;
    },
  };

  return perg;
}
