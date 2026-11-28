/* ============================================================================
   PERGAMINHO: a folha onde os capítulos são lidos
   ============================================================================
   O papel 3D que sai da carta pousa aqui e vira uma folha DOM (receberPapel).
   Um rolo de papel desce e desenrola o capítulo (desenrolar); o texto rola
   (Lenis com mouse, rolagem nativa no toque); a costura da margem direita é o
   fio de progresso, com a agulha marcando onde ela está; ao fechar, o rolo
   sobe e enrola (enrolar), e a folha se levanta e voa, devolvendo o mundo
   (soltar).

   Estados (perg.estado): oculto → folha (receberPapel) → aberto (desenrolar)
   → folha (enrolar) → oculto (soltar). Em data-estado também existem
   abrindo, fechando e saindo (o mini da música e os testes leem).

   O desenrolar não usa clip-path: a camada do capítulo e o miolo dela andam
   por translate3d em sentidos opostos (soma zero) dentro de overflow: hidden,
   então o capítulo fica parado na tela e só a borda de baixo anda.
   `geracao` é o controle de concorrência: depois de cada await, quem ficou
   para trás não mexe mais no DOM, e um capítulo atrasado não fecha o seguinte.

   O capítulo recebe api = { conteudo, amb, som, rolagem, fundo, gsap,
   recursos, fechar(), aberto } (aberto: Promise<boolean>, true quando a folha
   acabou de desenrolar, false se foi interrompida).
   ========================================================================== */

import { clamp, debounce, el, espera, quadro, semente, svg } from './nucleo/util.js';
import { curvas, comoPromise } from './nucleo/movimento.js';

const LADRILHO = 256; // = --perg-ladrilho no CSS
const AFINA = 0.3; // o rolo afina 30% enquanto desenrola

const DURACAO_ABRIR = 1.6;
const DURACAO_FECHAR = 1.35;
const DURACAO_SOLTAR = 1.7;
// Só o bastante para as pétalas que passavam na frente se desfazerem; mais que
// isso vira um cruzamento de dois papéis.
const DURACAO_POUSO = 0.12;

const ESPERA_DICA = 3000; // sem rolar, a aba de dica aparece
const DICA_VISIVEL = 7200; // três pulsos da seta (2,4 s cada)
const DICA_PAUSA = 9000; // recolhida, antes de tentar de novo

// O rolo sai de cena aos 90% da curva: deixa a folha ainda andando, em vez de
// rastejar até a borda.
const CORTE = 0.9;
const INCLINA = 0.75; // graus
const FAIXA_CURVA = 46; // = altura de .perg-rolo-curva
const FAIXA_SOMBRA = 42; // = altura de .perg-rolo-sombra

// A costura: os furos já estão lá; os pontos vão sendo dados conforme ela lê.
const PASSO = 13;
const PONTO = 8;
const COSTURA_TOPO = 14;
const AGULHA = 26;

// Girar o aparelho ou a barra do Safari muda a altura do texto: o trecho que
// estava a 35% da folha volta ao mesmo lugar (o Safari não tem overflow-anchor).
const PONTO_LEITURA = 0.35;
const SEGURAR_MS = 1200;

const SETA = '<svg class="ui-icone" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 5.5v12.5M6.8 12.8 12 18l5.2-5.2"/></svg>';

// A agulha (10 × 30): o olho em cima, onde está o ponto atual; a ponta para baixo.
const DESENHO_AGULHA = `<svg viewBox="0 0 10 30" width="10" height="30" aria-hidden="true" focusable="false">
  <path class="perg-agulha-corpo" d="M5 .7c1.2 0 1.9.9 1.9 2.4v4.6L5.5 29.3h-1L3.1 7.7V3.1C3.1 1.6 3.8.7 5 .7z"/>
  <ellipse class="perg-agulha-olho" cx="5" cy="3.6" rx=".55" ry="1.6"/>
  <path class="perg-agulha-brilho" d="M4.3 8.5v13"/>
  <path class="perg-agulha-laco" d="M3.2-3.5C2.6-1 3.6 1.8 5 3.6c1.3 1.7 2.4 3.6 1.6 5.6"/>
</svg>`;

const f1 = (v) => Math.round(v * 100) / 100;

/**
 * A fibra do papel: 2400 pintas e 230 fibras curvas num ladrilho de 256 px
 * (512 em tela densa), com semente fixa. Cada traço é repetido nos ladrilhos
 * vizinhos para a emenda não aparecer; as cópias fora do quadrado são puladas.
 */
function desenharFibra() {
  const escala = (window.devicePixelRatio || 1) > 1.25 ? 2 : 1;
  const T = LADRILHO * escala;
  const tela = document.createElement('canvas');
  tela.width = T;
  tela.height = T;
  const g = tela.getContext('2d');
  if (!g) return null;
  const r = semente(23122026);
  const emTodos = (x, y, alcance, desenhar) => {
    for (const dx of [-T, 0, T]) {
      for (const dy of [-T, 0, T]) {
        const cx = x + dx;
        const cy = y + dy;
        if (cx + alcance < 0 || cx - alcance > T || cy + alcance < 0 || cy - alcance > T) continue;
        desenhar(cx, cy);
      }
    }
  };

  for (let i = 0; i < 2400; i++) {
    const x = r() * T;
    const y = r() * T;
    const raio = (0.25 + r() * 0.75) * escala;
    const claro = r() < 0.22;
    g.fillStyle = claro ? `rgba(255, 246, 222, ${f1(0.25 + r() * 0.35)})` : `rgba(132, 100, 72, ${f1(0.03 + r() * 0.08)})`;
    emTodos(x, y, raio, (cx, cy) => {
      g.beginPath();
      g.arc(cx, cy, raio, 0, Math.PI * 2);
      g.fill();
    });
  }

  g.lineCap = 'round';
  for (let i = 0; i < 230; i++) {
    const x = r() * T;
    const y = r() * T;
    const comprimento = (6 + r() * 22) * escala;
    const angulo = r() * Math.PI;
    const barriga = (r() * 2 - 1) * comprimento * 0.35;
    const claro = r() < 0.3;
    g.strokeStyle = claro ? `rgba(255, 240, 204, ${f1(0.3 + r() * 0.3)})` : `rgba(169, 124, 53, ${f1(0.06 + r() * 0.1)})`;
    g.lineWidth = (0.35 + r() * 0.6) * escala;
    const dx = (Math.cos(angulo) * comprimento) / 2;
    const dy = (Math.sin(angulo) * comprimento) / 2;
    const mx = -Math.sin(angulo) * barriga;
    const my = Math.cos(angulo) * barriga;
    emTodos(x, y, comprimento / 2 + Math.abs(barriga), (cx, cy) => {
      g.beginPath();
      g.moveTo(cx - dx, cy - dy);
      g.quadraticCurveTo(cx + mx, cy + my, cx + dx, cy + dy);
      g.stroke();
    });
  }
  return tela;
}

export function criarPergaminho({ raiz, mundo, amb, som, conteudo, recursos }) {
  const gsap = window.gsap;
  const calmo = () => !!amb?.reduzido;
  const baixo = () => amb?.nivel === 'baixo';
  const palco = () => document.getElementById('palco');

  /* ---- a árvore ------------------------------------------------------------ */

  const sombra = el('div', { class: 'perg-sombra', 'aria-hidden': 'true' });
  const sombraAlta = el('div', { class: 'perg-sombra perg-sombra-alta', 'aria-hidden': 'true' });
  const fibraFolha = el('div', { class: 'perg-fibra', 'aria-hidden': 'true' });
  const folha = el('div', 'perg-folha');

  let fundoEl = el('div', 'perg-fundo');
  let conteudoEl = el('div', 'perg-conteudo');
  const rolagemEl = el('div', { class: 'perg-rolagem', tabindex: '0' }, conteudoEl);
  const vista = el('div', 'perg-vista', [fundoEl, rolagemEl, el('div', { class: 'perg-corte', 'aria-hidden': 'true' })]);
  const costura = el('div', { class: 'perg-costura', 'aria-hidden': 'true' });
  const dica = el('div', { class: 'perg-dica', 'aria-hidden': 'true' }, svg(SETA));
  const janela = el('div', 'perg-janela', [vista, costura, dica]);
  const miolo = el('div', 'perg-camada-miolo', [el('div', { class: 'perg-fibra', 'aria-hidden': 'true' }), janela]);
  const camada = el('div', { class: 'perg-camada', hidden: true }, miolo);

  const curva = el('div', 'perg-rolo-curva');
  const sombraRolo = el('div', 'perg-rolo-sombra');
  const fibraRolo = el('div', 'perg-rolo-fibra');
  const corpo = el('div', 'perg-rolo-corpo', [fibraRolo, el('div', 'perg-rolo-luz')]);
  const rolo = el('div', { class: 'perg-rolo', 'aria-hidden': 'true', hidden: true }, [curva, sombraRolo, corpo]);

  const papel = el('div', 'perg-papel', [fibraFolha, folha, camada, rolo]);
  const moldura = el('div', 'perg-moldura', [sombra, sombraAlta, papel]);
  raiz.append(moldura);

  /* ---- estado -------------------------------------------------------------- */

  let estado = 'oculto';
  let geracao = 0;
  let saindo = false;
  let papelACaminho = false;
  let instancia = null;
  let promessaFechar = null;
  let avisarAberto = null;
  let promessaEnrolar = null;
  let promessaSoltar = null;
  let rolou = false;
  let lenis = null;
  let tique = null;
  let tweenRolo = null;
  let fimRolo = null;
  let infoCostura = null;
  let dicaVisivel = false;
  let marco = null;
  let timerMarco = 0;
  let segurando = false;
  let timerLeitura = 0;
  let pedidoRolagem = 0;
  let alturaVista = 0;
  let alturaConteudo = 0;
  let dpr = 1;
  const medida = { altura: 0, largura: 0, rolo: 64 };
  const ouvintes = new Set();
  const curvasDoRolo = new Map();

  const publicar = (nome) => { raiz.dataset.estado = nome; };
  const naGrade = (v) => Math.round(v * dpr) / dpr;
  const cobreTela = () => moldura.getBoundingClientRect().width >= window.innerWidth - 1;

  function medir() {
    medida.altura = papel.clientHeight || window.innerHeight;
    medida.largura = moldura.clientWidth || window.innerWidth;
    dpr = clamp(window.devicePixelRatio || 1, 1, 3);
  }

  /* ---- a fibra (uma vez, num momento ocioso) -------------------------------- */

  // Decodificada antes de aparecer: assim não engasga o primeiro desenrolar.
  function garantirFibra() {
    let tela = null;
    try {
      tela = desenharFibra();
    } catch (erro) {
      console.error('[carta] fibra do papel', erro);
    }
    if (!tela) return; // sem canvas, a folha fica lisa
    const aplicar = (url) => {
      const img = new Image();
      img.src = url;
      const pronto = () => raiz.style.setProperty('--perg-fibra', `url("${url}")`);
      if (typeof img.decode === 'function') img.decode().then(pronto, () => {});
      else img.onload = pronto;
    };
    if (typeof tela.toBlob === 'function') {
      tela.toBlob((blob) => aplicar(blob ? URL.createObjectURL(blob) : tela.toDataURL('image/png')), 'image/png');
    } else {
      aplicar(tela.toDataURL('image/png'));
    }
  }
  if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(garantirFibra, { timeout: 2500 });
  else quadro().then(quadro).then(garantirFibra);

  /* ---- a rolagem ----------------------------------------------------------- */

  const rolagem = {
    el: rolagemEl,
    get y() {
      return rolagemEl.scrollTop;
    },
    get progresso() {
      const max = rolagemEl.scrollHeight - rolagemEl.clientHeight;
      return max > 0 ? clamp(rolagemEl.scrollTop / max) : 0;
    },
    aoRolar(fn) {
      ouvintes.add(fn);
      return () => ouvintes.delete(fn);
    },
    irPara(y, { imediato = false } = {}) {
      const max = Math.max(0, rolagemEl.scrollHeight - rolagemEl.clientHeight);
      const alvo = clamp(Number(y) || 0, 0, max);
      if (lenis) {
        lenis.scrollTo(alvo, { immediate: imediato, force: true });
      } else if (imediato || calmo()) {
        rolagemEl.scrollTop = alvo;
      } else {
        rolagemEl.scrollTo({ top: alvo, behavior: 'smooth' });
      }
    },
  };

  function topoNoConteudo(alvo) {
    return alvo.getBoundingClientRect().top - conteudoEl.getBoundingClientRect().top;
  }

  // O trecho que está a 35% da altura da folha, e onde ele está em relação ao topo.
  function guardarMarco() {
    const r = rolagemEl.getBoundingClientRect();
    if (!r.height) return;
    const max = rolagemEl.scrollHeight - rolagemEl.clientHeight;
    const fracao = max > 0 ? rolagemEl.scrollTop / max : 0;
    const alvo = document.elementFromPoint(r.left + r.width / 2, r.top + r.height * PONTO_LEITURA);
    marco = alvo && alvo !== conteudoEl && conteudoEl.contains(alvo)
      ? { el: alvo, desvio: topoNoConteudo(alvo) - rolagemEl.scrollTop, fracao }
      : { el: null, desvio: 0, fracao };
  }

  function reancorar() {
    if (!marco) return;
    const max = Math.max(0, rolagemEl.scrollHeight - rolagemEl.clientHeight);
    const y = marco.el?.isConnected && conteudoEl.contains(marco.el)
      ? topoNoConteudo(marco.el) - marco.desvio
      : marco.fracao * max;
    const alvo = clamp(y, 0, max);
    if (Math.abs(alvo - rolagemEl.scrollTop) < 1) return;
    if (lenis) lenis.scrollTo(alvo, { immediate: true, force: true });
    else rolagemEl.scrollTop = alvo;
  }

  // Durante 1,2 s depois de mudar de tamanho, o marco fica parado e cada nova
  // medida do conteúdo recoloca a leitura.
  function segurarLeitura() {
    segurando = true;
    clearTimeout(timerLeitura);
    timerLeitura = setTimeout(soltarLeitura, SEGURAR_MS);
  }

  function soltarLeitura() {
    segurando = false;
    clearTimeout(timerLeitura);
  }

  function avisarRolagem() {
    pedidoRolagem = 0;
    // O marco da leitura mede a tela (elementFromPoint): só quando a rolagem assenta.
    clearTimeout(timerMarco);
    timerMarco = setTimeout(() => { if (estado === 'aberto' && !segurando) guardarMarco(); }, 140);
    const p = rolagem.progresso;
    const y = rolagemEl.scrollTop;
    costurar(p);
    for (const fn of [...ouvintes]) {
      try {
        fn(p, y);
      } catch (erro) {
        console.error('[carta] ouvinte da rolagem', erro);
      }
    }
  }

  rolagemEl.addEventListener('scroll', () => {
    if (!rolou && rolagemEl.scrollTop > 2) {
      rolou = true;
      esconderDica();
    }
    // um aviso por quadro
    if (!pedidoRolagem) pedidoRolagem = requestAnimationFrame(avisarRolagem);
  }, { passive: true });

  // Lenis só com mouse: no toque a rolagem nativa é melhor (e é a do iPhone).
  function ligarRolagemSuave() {
    if (lenis || amb?.toque || calmo() || typeof window.Lenis !== 'function') return;
    try {
      lenis = new window.Lenis({ wrapper: rolagemEl, content: conteudoEl, eventsTarget: camada, autoRaf: false, lerp: 0.11 });
      tique = (t) => lenis?.raf(t * 1000);
      gsap.ticker.add(tique);
    } catch (erro) {
      console.error('[carta] rolagem suave', erro);
      lenis = null;
    }
  }

  function desligarRolagemSuave() {
    if (tique) gsap.ticker.remove(tique);
    tique = null;
    try {
      lenis?.destroy();
    } catch {
      /* já foi */
    }
    lenis = null;
  }

  // Fora do estado aberto o toque não rola: nada anda antes da hora.
  function travarRolagem(sim) {
    rolagemEl.style.overflowY = sim ? 'hidden' : '';
    if (sim) lenis?.stop();
    else lenis?.start();
  }

  /* ---- a costura (o fio de progresso) --------------------------------------- */

  // O disco da música pousa na quina do papel no celular: a costura começa abaixo dele.
  function topoDaCostura() {
    const r = document.querySelector('#mini:not([hidden]) [data-acao="mini"]')?.getBoundingClientRect();
    if (!r || !r.width) return COSTURA_TOPO;
    const c = costura.getBoundingClientRect();
    if (r.left > c.right || r.right < c.left || r.bottom <= c.top + COSTURA_TOPO) return COSTURA_TOPO;
    return Math.round(r.bottom + 12 - c.top);
  }

  function montarCostura() {
    costura.textContent = '';
    infoCostura = null;
    const altura = vista.clientHeight;
    if (!altura) return;
    const topo = topoDaCostura();
    const n = Math.max(3, Math.floor((altura - topo - AGULHA - PONTO - 8) / PASSO) + 1);
    const r = semente(2312);
    const tremor = (a) => (r() * 2 - 1) * a;
    let d = '';
    let furos = '';
    for (let i = 0; i < n; i++) {
      const y1 = topo + i * PASSO;
      const x1 = 8 + tremor(0.6);
      const x2 = 8 + tremor(0.6);
      const y2 = y1 + PONTO + tremor(0.65);
      d += `M${f1(x1)} ${f1(y1)}L${f1(x2)} ${f1(y2)}`;
      furos += `<circle cx="${f1(x1)}" cy="${f1(y1)}" r="0.8"/><circle cx="${f1(x2)}" cy="${f1(y2)}" r="0.8"/>`;
    }
    const caixa = `width="16" height="${altura}" viewBox="0 0 16 ${altura}" aria-hidden="true" focusable="false"`;
    const no = f1(topo - 1.6);
    // O nó no começo e a pontinha do fio que sobra dele.
    // A janela (.perg-pontos) e o desenho dentro dela andam em sentidos opostos:
    // o fio aparece sem repintar o halo (drop-shadow) a cada quadro de rolagem.
    const dentro = el('div', 'perg-pontos-dentro', svg(`<svg ${caixa}>
      <path class="perg-ponto-sombra" d="${d}" transform="translate(0.5 0.9)"/>
      <path class="perg-ponto-fio perg-laco" d="M8 ${no}c-2.8-1.2-5.2-3.9-3.9-6.3 1.3-2.2 4.6-1.2 4.2 1.4"/>
      <circle class="perg-no" cx="8" cy="${no}" r="1.9"/>
      <path class="perg-ponto-fio" d="${d}"/>
    </svg>`));
    const pontos = el('div', 'perg-pontos', dentro);
    const agulha = el('div', 'perg-agulha', svg(DESENHO_AGULHA));
    costura.append(svg(`<svg ${caixa}><g class="perg-furos">${furos}</g></svg>`), pontos, agulha);
    infoCostura = { topo, altura, comprimento: (n - 1) * PASSO + PONTO, pontos, dentro, agulha };
  }

  function costurar(p) {
    if (!infoCostura) return;
    const { topo, altura, comprimento, pontos, dentro, agulha } = infoCostura;
    const y = topo + clamp(p) * comprimento;
    const falta = f1(Math.max(0, altura - y));
    pontos.style.transform = `translate3d(0, -${falta}px, 0)`;
    dentro.style.transform = `translate3d(0, ${falta}px, 0)`;
    const fase = ((y - topo) % PASSO) / PASSO;
    const giro = calmo() ? 7 : 7 + Math.sin(fase * Math.PI * 2) * 4.5;
    agulha.style.transform = `translate3d(0, ${f1(y)}px, 0) rotate(${f1(giro)}deg)`;
  }

  /* ---- a aba de dica (role para baixo) -------------------------------------- */

  function mostrarDica() {
    if (dicaVisivel) return;
    dicaVisivel = true;
    dica.classList.add('ativa');
    gsap.killTweensOf(dica);
    gsap.fromTo(dica,
      { autoAlpha: 0, yPercent: calmo() ? 0 : 100 },
      { autoAlpha: 1, yPercent: 0, duration: 1.1, ease: curvas.branco.entrar });
  }

  function esconderDica(imediato = false) {
    if (!dicaVisivel && !imediato) return;
    dicaVisivel = false;
    gsap.killTweensOf(dica);
    const fim = { autoAlpha: 0, yPercent: calmo() ? 0 : 100 };
    if (imediato) {
      gsap.set(dica, fim);
      dica.classList.remove('ativa');
      return;
    }
    gsap.to(dica, { ...fim, duration: 0.3, ease: curvas.ui.resposta, onComplete: () => dica.classList.remove('ativa') });
  }

  // Três segundos sem rolar: a aba sobe e a seta pulsa por 7,2 s; recolhe por
  // 9 s; repete enquanto ela não rolou e ainda há o que rolar.
  async function agendarDica(g) {
    const vale = () => g === geracao && estado === 'aberto' && !rolou
      && rolagemEl.scrollHeight - rolagemEl.clientHeight > 24;
    await espera(ESPERA_DICA);
    while (vale()) {
      mostrarDica();
      await espera(DICA_VISIVEL);
      if (g !== geracao) return;
      esconderDica();
      await espera(DICA_PAUSA);
    }
  }

  /* ---- o rolo ---------------------------------------------------------------- */

  // A camada sobe de −H até 0 enquanto o miolo desce de H até 0: o capítulo fica
  // parado na tela e só a borda de baixo (no eixo do rolo) anda.
  function revelar(y) {
    if (y === null) {
      camada.style.transform = '';
      miolo.style.transform = '';
      return;
    }
    const H = medida.altura;
    const v = naGrade(clamp(y, 0, H));
    camada.style.transform = `translate3d(0, ${v - H}px, 0)`;
    miolo.style.transform = `translate3d(0, ${H - v}px, 0)`;
  }

  // A curva do rolo cortada aos 90% (busca binária de 22 passos) e esticada de
  // volta a 0..1: o rolo sai da folha ainda com velocidade.
  function curvaDoRolo(nome) {
    if (curvasDoRolo.has(nome)) return curvasDoRolo.get(nome);
    const f = gsap.parseEase(nome) || ((t) => t);
    let a = 0;
    let b = 1;
    for (let i = 0; i < 22; i++) {
      const m = (a + b) / 2;
      if (f(m) < CORTE) a = m;
      else b = m;
    }
    const t = (a + b) / 2;
    const cortada = (u) => f(u * t) / CORTE;
    curvasDoRolo.set(nome, cortada);
    return cortada;
  }

  // sentido +1 desenrola (desce e afina); −1 enrola (sobe e engorda).
  function posicionarRolo(sentido, p) {
    const R = medida.rolo;
    const H = medida.altura;
    const nivelBaixo = baixo();
    const afina = nivelBaixo ? 0 : AFINA;
    const folga = nivelBaixo ? 2 : 8;
    const fino = R * (1 - afina) / 2;
    let s;
    let de;
    let ate;
    if (sentido > 0) {
      s = 1 - afina * p;
      de = -R / 2 - 2;
      ate = H + fino + FAIXA_CURVA + folga;
    } else {
      s = 1 - afina * (1 - p);
      de = H + fino + 2;
      ate = -R / 2 - FAIXA_SOMBRA - folga;
    }
    const eixo = de + (ate - de) * p;
    const inclina = nivelBaixo ? 0 : sentido * INCLINA * Math.sin(p * 5.2 - 0.9) * (1 - 0.5 * p);
    const meio = (R * s) / 2;
    rolo.style.opacity = String(f1(clamp(p / 0.035)));
    rolo.style.transform = `translate3d(0, ${naGrade(eixo)}px, 0) rotate(${inclina.toFixed(3)}deg)`;
    corpo.style.transform = `scaleY(${s.toFixed(4)})`;
    curva.style.transform = `translate3d(0, ${f1(-meio)}px, 0)`;
    sombraRolo.style.transform = `translate3d(0, ${f1(meio)}px, 0)`;
    // A superfície da frente de um rolo que rola anda o dobro do eixo.
    if (!nivelBaixo) fibraRolo.style.transform = `translate3d(0, ${f1(((eixo % LADRILHO) + LADRILHO) % LADRILHO)}px, 0)`;
    revelar(eixo);
  }

  function rolar(sentido, duracao) {
    guardarRolo();
    rolo.hidden = false;
    medida.rolo = corpo.offsetHeight || medida.rolo; // = --perg-rolo
    posicionarRolo(sentido, 0);
    const prog = { p: 0 };
    return new Promise((resolve) => {
      fimRolo = resolve;
      tweenRolo = gsap.to(prog, {
        p: 1,
        duration: duracao,
        ease: curvaDoRolo(sentido > 0 ? curvas.branco.camera : 'power1.inOut'),
        onUpdate: () => posicionarRolo(sentido, prog.p),
        onComplete: resolve,
      });
    });
  }

  // Para o rolo onde estiver e o esconde. Quem esperava o rolar segue.
  function guardarRolo() {
    tweenRolo?.kill();
    tweenRolo = null;
    const fim = fimRolo;
    fimRolo = null;
    fim?.();
    rolo.hidden = true;
    for (const no of [rolo, corpo, curva, sombraRolo, fibraRolo]) {
      no.style.transform = '';
      no.style.opacity = '';
    }
  }

  /* ---- montar e desmontar um capítulo ---------------------------------------- */

  function destruirInstancia() {
    const i = instancia;
    instancia = null;
    try {
      i?.destruir?.();
    } catch (erro) {
      console.error('[carta] destruir o capítulo', erro);
    }
  }

  // Fundo e conteúdo novos a cada capítulo: um capítulo atrasado mexe só no que
  // é dele. A rolagem e a camada são as mesmas a vida inteira.
  function renovarCapitulo() {
    const novoFundo = el('div', 'perg-fundo');
    fundoEl.replaceWith(novoFundo);
    fundoEl = novoFundo;
    const novoConteudo = el('div', 'perg-conteudo');
    conteudoEl.replaceWith(novoConteudo);
    conteudoEl = novoConteudo;
  }

  function desmontar() {
    esconderDica(true);
    destruirInstancia();
    observador?.disconnect();
    refazerGatilhos.cancelar();
    marco = null;
    soltarLeitura();
    desligarRolagemSuave();
    guardarRolo();
    gsap.killTweensOf(camada);
    renovarCapitulo();
    costura.textContent = '';
    infoCostura = null;
    camada.hidden = true;
    gsap.set(camada, { clearProps: 'transform,opacity,visibility' });
    revelar(null);
    rolagemEl.scrollTop = 0;
    rolagemEl.removeAttribute('role');
    rolagemEl.removeAttribute('aria-labelledby');
    travarRolagem(false);
    delete raiz.dataset.capitulo;
    delete raiz.dataset.releitura;
    palco()?.removeAttribute('aria-hidden');
    avisarAberto?.(false); // sem efeito se já abriu
    avisarAberto = null;
  }

  const tituloDoCapitulo = () => conteudoEl.querySelector('h1, h2, h3, [role="heading"]');

  // A região rolável leva o nome do capítulo (o primeiro título dele).
  function nomearRegiao() {
    const titulo = tituloDoCapitulo();
    if (!titulo) return;
    if (!titulo.id) titulo.id = `perg-titulo-${geracao}`;
    rolagemEl.setAttribute('role', 'region');
    rolagemEl.setAttribute('aria-labelledby', titulo.id);
  }

  // O foco vai ao título; se ele ainda não pode receber foco (entrando), o
  // rolador segura e tenta de novo a cada 100 ms, até 40 vezes, enquanto o foco
  // continuar no rolador e ela não tiver rolado.
  function focarTitulo(g) {
    const titulo = tituloDoCapitulo();
    let tentativas = 0;
    const tentar = () => {
      if (g !== geracao || estado !== 'aberto') return;
      if (titulo) {
        titulo.setAttribute('tabindex', '-1');
        titulo.setAttribute('data-perg-foco', '');
        titulo.focus({ preventScroll: true });
        if (document.activeElement === titulo) return;
      }
      if (tentativas === 0) rolagemEl.focus({ preventScroll: true });
      else if (document.activeElement !== rolagemEl) return;
      tentativas += 1;
      if (!titulo || rolou || tentativas > 40) return;
      setTimeout(tentar, 100);
    };
    tentar();
  }

  /* ---- tamanho e mundo ------------------------------------------------------- */

  // Com a folha cobrindo a tela, o mundo para (senão ficaria congelado nos lados
  // no computador, ou gastando bateria por baixo no celular).
  const conferirMundo = debounce(() => {
    if (raiz.hidden || saindo || estado === 'oculto') return;
    if (cobreTela()) mundo?.desligar?.();
    else mundo?.ligar?.();
  }, 180);

  const refazerGatilhos = debounce(() => {
    lenis?.resize();
    if (estado === 'aberto') avisarRolagem();
  }, 140);

  function aoMudarTamanho() {
    medir();
    if (estado === 'aberto') {
      if (marco) {
        segurarLeitura();
        reancorar();
      }
      const h = vista.clientHeight;
      if (h !== alturaVista) {
        alturaVista = h;
        montarCostura();
        costurar(rolagem.progresso);
      }
      lenis?.resize();
    }
    conferirMundo();
  }

  const observador = typeof ResizeObserver === 'function'
    ? new ResizeObserver(() => {
      if (estado !== 'aberto') return;
      if (segurando) reancorar();
      const h = rolagemEl.scrollHeight;
      if (h !== alturaConteudo) {
        alturaConteudo = h;
        refazerGatilhos();
      }
    })
    : null;
  if (typeof ResizeObserver === 'function') new ResizeObserver(aoMudarTamanho).observe(moldura);
  window.addEventListener('resize', aoMudarTamanho);

  /* ---- os quatro movimentos -------------------------------------------------- */

  /** Mede a moldura; se ela está oculta, mede por um instante sem aparecer e avisa que o papel vem pousar. */
  function retanguloAlvo() {
    if (!raiz.hidden) return moldura.getBoundingClientRect();
    raiz.style.visibility = 'hidden';
    raiz.hidden = false;
    const r = moldura.getBoundingClientRect();
    raiz.hidden = true;
    raiz.style.visibility = '';
    papelACaminho = true;
    return r;
  }

  // oculto → folha. Com o papel 3D pousando, a folha surge com a cor do papel e
  // só depois ganham fibra e sombra; a promessa resolve um quadro depois de a
  // folha cobrir o papel, que então pode sumir. Sem papel vindo, a folha sobe.
  async function receberPapel() {
    if (promessaSoltar) await promessaSoltar;
    if (estado !== 'oculto') return;
    estado = 'folha';
    const pousando = papelACaminho;
    papelACaminho = false;
    gsap.killTweensOf([moldura, sombra, sombraAlta, fibraFolha, folha]);
    gsap.set(moldura, { clearProps: 'transform' });
    gsap.set(moldura, { autoAlpha: 0 });
    gsap.set([sombra, sombraAlta, fibraFolha], { opacity: 0 });
    gsap.set(folha, { autoAlpha: 1 });
    raiz.hidden = false;
    publicar('folha');
    medir();
    const atraso = pousando ? DURACAO_POUSO : 0;
    gsap.to(fibraFolha, { opacity: 1, duration: 1.2, delay: atraso, ease: curvas.branco.entrar });
    gsap.to(sombra, { opacity: 1, duration: 1.6, delay: atraso, ease: curvas.branco.entrar });
    if (pousando) {
      await comoPromise(gsap.to(moldura, { autoAlpha: 1, duration: DURACAO_POUSO, ease: 'none' }));
      await quadro();
    } else {
      await comoPromise(gsap.fromTo(moldura,
        { autoAlpha: 0, y: calmo() ? 0 : 14 },
        { autoAlpha: 1, y: 0, duration: 0.7, ease: curvas.branco.entrar }));
    }
    if (estado !== 'oculto' && !saindo && cobreTela()) mundo?.desligar?.();
  }

  /** folha → aberto. Resolve quando o capítulo acabou de desenrolar (ou foi interrompido). */
  async function desenrolar(capitulo, { releitura = false } = {}) {
    if (promessaSoltar) await promessaSoltar;
    if (estado === 'aberto') await enrolar();
    if (estado === 'oculto') await receberPapel();
    if (instancia || !camada.hidden) desmontar();

    const g = ++geracao;
    let fecharEsta;
    promessaFechar = new Promise((resolve) => { fecharEsta = resolve; });
    let avisar;
    const aberto = new Promise((resolve) => { avisar = resolve; });
    avisarAberto = avisar;
    const api = {
      conteudo, amb, som, rolagem, gsap, recursos, aberto,
      fundo: fundoEl,
      // Ligado à promessa desta abertura: um capítulo atrasado não fecha o seguinte.
      fechar: () => fecharEsta(),
    };

    travarRolagem(true);
    rolagemEl.scrollTop = 0;
    rolou = false;
    camada.hidden = false;
    medir();
    revelar(0);
    raiz.dataset.capitulo = String(capitulo?.id || '');
    if (releitura) raiz.dataset.releitura = '';
    publicar('abrindo');

    let montado = null;
    try {
      montado = await capitulo.montar(conteudoEl, api);
    } catch (erro) {
      console.error('[carta] o capítulo não montou', erro);
      api.fechar();
    }
    if (g !== geracao) {
      try {
        montado?.destruir?.();
      } catch (erro) {
        console.error('[carta] destruir o capítulo', erro);
      }
      avisar(false);
      return;
    }
    instancia = montado;

    ligarRolagemSuave();
    travarRolagem(true);
    nomearRegiao();
    montarCostura();
    avisarRolagem();
    som?.efeito?.('desenrolar');

    if (!calmo()) {
      // A primeira rasterização (fontes, imagens, camadas) não cai no meio do
      // movimento: dois quadros com tudo quase transparente no lugar.
      camada.style.opacity = '0.002';
      revelar(null);
      rolo.hidden = false;
      rolo.style.opacity = '0.002';
      rolo.style.transform = `translate3d(0, ${naGrade(medida.altura / 2)}px, 0)`;
      await quadro();
      await quadro();
      if (g !== geracao) {
        avisar(false);
        return;
      }
      camada.style.opacity = '';
      revelar(0);
      rolo.style.opacity = '0';
    }

    gsap.to(folha, { autoAlpha: 0, duration: 0.3, ease: 'none' });
    if (calmo()) {
      revelar(null);
      await comoPromise(gsap.fromTo(camada,
        { autoAlpha: 0, y: 10 },
        { autoAlpha: 1, y: 0, duration: 0.8, ease: curvas.branco.entrar }));
    } else {
      await rolar(1, DURACAO_ABRIR);
    }
    if (g !== geracao) {
      avisar(false);
      return;
    }

    guardarRolo();
    revelar(null);
    estado = 'aberto';
    publicar('aberto');
    travarRolagem(false);
    medir();
    alturaVista = vista.clientHeight;
    alturaConteudo = rolagemEl.scrollHeight;
    lenis?.resize();
    observador?.observe(conteudoEl);
    palco()?.setAttribute('aria-hidden', 'true');
    focarTitulo(g);
    agendarDica(g);
    if (cobreTela()) mundo?.desligar?.();
    avisar(true);
  }

  /** aberto → folha. Idempotente. */
  function enrolar() {
    if (promessaEnrolar) return promessaEnrolar;
    if (estado !== 'aberto') return Promise.resolve();
    const g = geracao;
    promessaEnrolar = (async () => {
      esconderDica();
      travarRolagem(true);
      publicar('fechando');
      som?.efeito?.('desenrolar');
      // Por baixo do rolo que sobe fica só o papel em branco.
      folha.textContent = '';
      gsap.killTweensOf(folha);
      gsap.set(folha, { autoAlpha: 1 });
      medir();
      if (calmo()) {
        await comoPromise(gsap.to(camada, { autoAlpha: 0, y: -10, duration: 0.7, ease: curvas.branco.sair }));
      } else {
        await rolar(-1, DURACAO_FECHAR);
      }
      if (g !== geracao) return;
      guardarRolo();
      desmontar();
      estado = 'folha';
      publicar('folha');
    })().finally(() => {
      promessaEnrolar = null;
    });
    return promessaEnrolar;
  }

  /** folha → oculto: a folha se levanta e voa para cima, e o mundo volta. Idempotente. */
  function soltar() {
    if (promessaSoltar) return promessaSoltar;
    promessaSoltar = (async () => {
      if (estado === 'aberto') await enrolar();
      if (estado === 'oculto') return;
      geracao += 1;
      if (instancia || !camada.hidden) desmontar();
      saindo = true;
      publicar('saindo');
      conferirMundo.cancelar();
      mundo?.ligar?.();
      gsap.killTweensOf([moldura, sombra, sombraAlta, fibraFolha]);
      gsap.set([sombra, fibraFolha], { opacity: 1 });
      gsap.set(sombraAlta, { opacity: 0 });
      if (calmo()) {
        await comoPromise(gsap.to(moldura, { autoAlpha: 0, duration: 0.7, ease: 'none' }));
      } else {
        await quadro();
        await quadro();
        som?.efeito?.('papel');
        moldura.style.willChange = 'transform';
        medir();
        // Cobrindo a tela (celular), a folha se afasta; no computador, ela se
        // levanta na direção dela. A sombra "no ar" troca de lugar com a pousada
        // por opacidade, nunca animando box-shadow.
        const linha = gsap.timeline({ defaults: { ease: 'power2.out' } });
        linha
          .to(moldura, { yPercent: -1.4, scale: cobreTela() ? 0.955 : 1.022, transformOrigin: '50% 40%', duration: 0.6 }, 0)
          .to(sombra, { opacity: 0, duration: 0.5 }, 0)
          .to(sombraAlta, { opacity: 1, duration: 0.7 }, 0)
          .to(moldura, {
            y: -(medida.altura * 1.12 + 120),
            x: medida.largura * 0.035,
            rotation: -4.5,
            duration: DURACAO_SOLTAR,
            ease: curvas.branco.sair,
          }, 0.22);
        await comoPromise(linha);
      }
      raiz.hidden = true;
      estado = 'oculto';
      delete raiz.dataset.estado;
      saindo = false;
      gsap.set([moldura, sombra, sombraAlta, fibraFolha, folha], { clearProps: 'all' });
    })().finally(() => {
      promessaSoltar = null;
    });
    return promessaSoltar;
  }

  return {
    el: raiz,
    folha,
    rolagem,
    get estado() {
      return estado;
    },
    retanguloAlvo,
    receberPapel,
    desenrolar,
    esperarFechar() {
      return promessaFechar || Promise.resolve();
    },
    enrolar,
    soltar,
  };
}
