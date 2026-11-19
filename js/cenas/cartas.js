// As cartas do chão: ela parou a alguns passos dele e, entre os dois, há cartas
// caídas no chão. São os vídeos dos amigos e, por último, a Surpresinha (uma
// galeria de fotos e vídeos). No chão ficam SEM nome; o nome só é escrito à mão
// na carta depois que ela abre, e a carta vai para a bolsa.
//
//   cenaCartas(ctx, { frio }) → Promise   resolve quando ela toca em seguir em frente
//
// Etapas: pousando → escolhendo ⇄ assistindo → seguindo   (contrato: _dev/ROTEIRO2.md)
// Chega com o que a mão deixou (estado.fio, estado.ele, estado.envelope escondido,
// estado.seguidorFio, o entardecer aceso) e NÃO mexe em nada disso: o encontro
// continua dali. Só o olhar muda: ela olha para o chão enquanto escolhe, e volta
// a olhar para a frente ao seguir.
//
// As cartas são DOM, deitadas no chão pela MESMA conta da câmera do mundo: cada
// desenho recebe a matriz de perspectiva do ponto do chão onde está. O botão de
// verdade é uma caixa plana e invisível por cima do desenho (como o alvo-carta):
// é nele que o toque, o foco e os testes acertam. Com ou sem WebGL a cena é a mesma.
//
// Ganchos para os testes (não mudar):
//   [data-acao="carta-chao"]   cada carta; data-id, data-estado="fechada|aberta|falhou"
//   [data-acao="fechar-carta"] fecha o vídeo / o cartão / a galeria
//   [data-acao="seguir-cartas"] o botão de seguir; aparece depois da primeira carta
//                              aberta e ganha data-destaque quando todas foram abertas
//   .carta-chao-visor          a moldura aberta (data-tipo="video|galeria|vazio")

import { el, espera, svg, clamp, lerp, semente } from '../nucleo/util.js';
import { curvas, revelarPalavras, ocultarPalavras } from '../nucleo/movimento.js';
import { cartasDoChao, temEncontro } from '../nucleo/diretor.js';
import { criarEle } from '../mundo/ele.js';
import { entardecer } from './mao.js';

const GRAU = Math.PI / 180;
const ALTURA_OLHOS = 1.5;            // = mundo.js
const DIST_ELE = 5.25;               // a que distância ele está quando ela para (= mao.js: RESTO fica em 0, PARADA + ELE_ATRAS)
const LARGURA = 0.44;                // a carta, em metros
const PROPORCAO = 110 / 160;         // altura/largura do envelope (= viewBox)
const ABAFAR = 0.04;                 // a música durante um vídeo (fração do volume)

const REPOUSO = { alt: 0, giro: 0, vira: 0, op: 1 };   // a carta pousada

/** FOV vertical da câmera do mundo (= mundo.js). */
const fovPara = (aspecto) => lerp(58, 42, clamp((aspecto - 0.8) / (1.35 - 0.8)));

// Onde cada carta cai. t: 0 = a mais perto dela, 1 = a mais perto dele; x em
// metros para o lado. A última da lista (a Surpresinha) usa sempre o último lugar.
// O fio corre pelo chão um pouco à direita do eixo: as cartas deixam o caminho dele livre.
const LUGARES_EM_PE = [
  { t: 0.03, x: -0.31 }, { t: 0.1, x: 0.19 },
  { t: 0.4, x: -0.5 }, { t: 0.47, x: 0.04 },
  { t: 0.7, x: -0.74 }, { t: 0.76, x: -0.2 },
  { t: 1.0, x: 0.36 },
];
const LUGARES_DEITADO = [
  { t: 0.5, x: -1.5 }, { t: 0.04, x: -0.98 }, { t: 0.66, x: -0.5 },
  { t: 0.1, x: -0.04 }, { t: 0.55, x: 1.02 }, { t: 0.12, x: 1.5 },
  { t: 1.0, x: 0.22 },
];

// ============================================================================
// Desenhos (SVG à mão, no espaço do envelope: 160 × 110)
// ============================================================================

const ENVELOPE = `
  <svg class="carta-chao-papel" viewBox="0 0 160 110" aria-hidden="true" focusable="false">
    <rect x="1" y="1" width="158" height="108" rx="2.2" class="cc-folha"/>
    <path d="M2 108 L64 55 M158 108 L96 55" class="cc-dobra"/>
    <path d="M2 2.5 L74 60 Q80 64.5 86 60 L158 2.5" class="cc-aba"/>
  </svg>`;

// O fio que amarra: duas voltas em cruz e um laço, no canto de cima.
const AMARRA = `
  <svg class="carta-chao-fio" viewBox="0 0 160 110" aria-hidden="true" focusable="false">
    <g class="cc-fio-sombra" transform="translate(0.5 1.3)">
      <path d="M0 38 L160 38 M40 0 L40 110"/>
    </g>
    <path class="cc-fio" d="M0 38 L160 38 M40 0 L40 110"/>
    <path class="cc-fio" d="M40 38 C30 25 14 24 15 33 C16 41 31 41 40 38 M40 38 C50 25 68 23 67 33 C66 42 50 41 40 38"/>
    <path class="cc-fio" d="M40 38 C37 47 33 56 26 64 M40 38 C44 49 51 57 60 62"/>
    <circle class="cc-no" cx="40" cy="38" r="3"/>
  </svg>`;

// A Surpresinha: sem cruz; um coração de lacre na ponta da aba e o fio em laço.
const LACRE = `
  <svg class="carta-chao-fio" viewBox="0 0 160 110" aria-hidden="true" focusable="false">
    <path class="cc-fio" d="M0 61 C30 59 52 63 80 61 S132 59 160 61"/>
    <path class="cc-fio" d="M80 62 C66 44 46 46 49 58 C51 67 68 66 80 62 M80 62 C94 44 114 46 111 58 C109 67 92 66 80 62"/>
    <path class="cc-fio" d="M80 62 C76 74 70 82 62 90 M80 62 C85 75 92 82 101 87"/>
    <path class="cc-lacre" d="M80 71 C72 64 67.5 60 67.5 55.5 C67.5 51.6 70.6 49 74 49 C76.6 49 78.8 50.4 80 52.6 C81.2 50.4 83.4 49 86 49 C89.4 49 92.5 51.6 92.5 55.5 C92.5 60 88 64 80 71 Z"/>
  </svg>`;

// Ícones da papelaria (_dev/UI.md): grade 24, traço 1.75, pontas redondas.
const X_FECHAR = `
  <svg class="ui-icone" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M7 7.4 C10 10.2 13.6 13.8 17 16.8 M16.8 7.2 C13.8 10.4 10.4 13.6 7.2 17"/>
  </svg>`;

const TOCAR = `
  <svg class="ui-icone" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path class="cheio-tinta" d="M9.4 6.3 L18.4 11.2 Q19.6 12 18.4 12.8 L9.4 17.7 Q8 18.4 8 16.9 V7.1 Q8 5.6 9.4 6.3 Z"/>
  </svg>`;

const SETA = `
  <svg class="ui-icone" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M14.6 5.6 C12 8 9.8 9.9 7.6 12 C9.8 14.1 12 16 14.6 18.4"/>
  </svg>`;

const SEGUIR = `
  <svg class="ui-icone" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M5 12.2 C9.4 11.8 14 12.2 18.6 12 M13.6 6.8 C15.4 8.6 17 10.2 18.8 12 C17 13.8 15.4 15.4 13.6 17.2"/>
  </svg>`;

// O desenho do cartão de exemplo: um quadro de filme (amigos) ou um coração (Surpresinha).
const GLIFO_VIDEO = `
  <svg class="cartao-glifo" viewBox="0 0 64 48" aria-hidden="true" focusable="false">
    <path d="M6 7 C22 5.6 42 6.4 58 7 C59 18 58.6 30 58 41 C40 42.2 22 41.6 6 41 C5.2 30 5.4 18 6 7 Z"/>
    <path d="M27 17.6 L39 24 L27 30.6 Z"/>
  </svg>`;
const GLIFO_CORACAO = `
  <svg class="cartao-glifo" viewBox="0 0 64 48" aria-hidden="true" focusable="false">
    <path d="M32 41 C19 31 12 24.6 12 17 C12 10.8 16.8 7 22 7 C26.2 7 30 9.4 32 13 C34 9.4 37.8 7 42 7 C47.2 7 52 10.8 52 17 C52 24.6 45 31 32 41 Z"/>
  </svg>`;

// ============================================================================
// Escrita à mão: cada letra é descoberta da esquerda para a direita, como a
// ponta da caneta passando (veio dos bilhetes antigos).
// ============================================================================

function montarLetras(caixa, texto) {
  caixa.textContent = '';
  const linha = el('span', 'cc-linha');
  caixa.append(linha);
  const letras = [];
  for (const pedaco of String(texto || '').split(/(\s+)/)) {
    if (!pedaco) continue;
    if (/^\s+$/.test(pedaco)) { linha.append(document.createTextNode(' ')); continue; }
    const palavra = el('span', 'cc-palavra');
    for (const ch of Array.from(pedaco)) {
      const letra = el('span', { class: 'cc-letra', texto: ch });
      palavra.append(letra);
      letras.push(letra);
    }
    linha.append(palavra);
  }
  return letras;
}

function escrever(gsap, alvo, texto, { calmo, som, intensidade = 0.6 } = {}) {
  const letras = montarLetras(alvo, texto);
  if (!letras.length) return Promise.resolve();
  const passo = clamp(1.5 / letras.length, 0.05, 0.11);
  if (som) som.efeito('caneta', { duracao: Math.min(2.4, letras.length * passo + 0.2), intensidade });
  return new Promise((ok) => {
    if (calmo) {
      gsap.fromTo(letras, { opacity: 0 }, { opacity: 1, duration: 0.35, stagger: passo * 0.5, ease: 'none', onComplete: ok });
      return;
    }
    gsap.fromTo(letras,
      { clipPath: 'inset(-10% 100% -10% 0%)', webkitClipPath: 'inset(-10% 100% -10% 0%)', opacity: 0.4 },
      {
        clipPath: 'inset(-10% 0% -10% 0%)', webkitClipPath: 'inset(-10% 0% -10% 0%)', opacity: 1,
        duration: passo * 1.9, stagger: passo, ease: 'power1.inOut',
        onComplete: () => { gsap.set(letras, { clearProps: 'clipPath,webkitClipPath' }); ok(); },
      });
  });
}

// ============================================================================
// A cena
// ============================================================================

export async function cenaCartas(ctx, { frio } = {}) {
  const { conteudo, diretor, mundo, musica, inventario, som, amb, estado } = ctx;
  const gsap = window.gsap;
  const dados = conteudo.cartasChao || {};
  const rotulos = dados.rotulos || {};
  const calmo = amb.reduzido;
  const palco = document.getElementById('palco');
  const acoes = document.getElementById('acoes');

  const sorte = semente(31);
  const itens = cartasDoChao(conteudo).map((carta, i, lista) => ({
    carta, i,
    ultima: i === lista.length - 1 && carta.tipo === 'galeria',
    estado: 'fechada',
    escrito: false,
    guinada: (sorte() - 0.5) * 30,           // cada carta caiu virada de um jeito
    tombo: 17 + sorte() * 8,                 // e não ficou toda deitada: a borda de lá levanta um pouco
    fase: sorte() * 6.28,
    anim: { alt: 0, giro: 0, vira: 0, op: 0 },
    X: 0, d: 2, larg: LARGURA,
    botao: null, desenho: null, nome: null,
  }));

  const cancelamentos = [];
  const ouvir = (alvo, evento, fn, opcoes) => {
    alvo.addEventListener(evento, fn, opcoes);
    cancelamentos.push(() => alvo.removeEventListener(evento, fn, opcoes));
  };

  // ---- o que fica em cena ---------------------------------------------------
  const raiz = el('div', 'cartas-chao');
  const campo = el('div', 'cartas-chao-campo');
  const vivo = el('p', { class: 'so-leitor', 'aria-live': 'polite' });
  raiz.append(campo, vivo);
  palco.append(raiz);

  // ---- a câmera: ela olha para o chão ----------------------------------------
  // geo: a lente do mundo neste tamanho de tela e o quanto o olhar desce.
  const geo = { L: 1, A: 1, f: 800, S: 260, teta: 0.3, dPerto: 2, dLonge: 4 };
  const olhar = { k: 0 };              // 0 olhando para a frente, 1 olhando para as cartas
  function medir() {
    geo.L = mundo.tamanho.largura || palco.clientWidth || innerWidth;
    geo.A = mundo.tamanho.altura || palco.clientHeight || innerHeight;
    const aspecto = geo.L / geo.A;
    const tanM = Math.tan(fovPara(aspecto) * GRAU / 2);
    geo.f = geo.A / (2 * tanM);
    // Desce o olhar até onde a cabeça dele ainda cabe no alto da tela.
    const cabeca = Math.atan((1.78 - ALTURA_OLHOS) / DIST_ELE);
    geo.teta = clamp(Math.atan(0.84 * tanM) - cabeca, 8 * GRAU, 20 * GRAU);
    // A carta mais próxima fica a ~3/4 da altura da tela (o botão de seguir vem abaixo).
    geo.dPerto = clamp(ALTURA_OLHOS / Math.tan(geo.teta + Math.atan(0.58 * tanM)), 1.7, 3.1);
    geo.dLonge = clamp(Math.max(geo.dPerto + 1.25, 3.95), geo.dPerto + 1.1, DIST_ELE - 1.0);
    geo.S = geo.f / 3.1;               // px por metro no desenho (perto do tamanho real na tela)
    const emPe = aspecto < 0.9;
    const lugares = emPe ? LUGARES_EM_PE : LUGARES_DEITADO;
    // metade da largura do chão à vista na carta mais próxima
    const meia = (geo.dPerto * Math.cos(geo.teta) + ALTURA_OLHOS * Math.sin(geo.teta)) * tanM * aspecto;
    const abre = emPe ? clamp((meia - 0.27) / 0.37, 0.6, 1.25) : clamp((meia - 0.3) / 1.9, 0.45, 1);
    itens.forEach((item, i) => {
      // com menos de 7 cartas, espalha pelos lugares; a Surpresinha fica sempre no último
      // a Surpresinha fica sempre no último lugar (o mais perto dele)
      const lugar = lugares[item.ultima ? lugares.length - 1 : i % (lugares.length - 1)];
      const volta = item.ultima ? 0 : Math.floor(i / (lugares.length - 1));   // mais de 6 amigos: outra fileira, mais ao lado
      item.d = lerp(geo.dPerto, geo.dLonge, lugar.t);
      item.X = lugar.x * abre + volta * 0.2;
      item.larg = LARGURA * (item.ultima ? 1.32 : 1);
      const w = item.larg * geo.S;
      const h = w * PROPORCAO;
      const b = item.desenho;
      if (!b) return;
      b.style.width = `${w.toFixed(1)}px`;
      b.style.height = `${h.toFixed(1)}px`;
      b.style.marginLeft = `${(-w / 2).toFixed(1)}px`;
      b.style.marginTop = `${(-h / 2).toFixed(1)}px`;
      b.style.setProperty('--b', `${w.toFixed(1)}px`);
      b.style.zIndex = String(100 - Math.round(item.d * 10));   // a de perto por cima
      item.botao.style.zIndex = b.style.zIndex;
      // o botão: a caixa da carta já pousada, com o olhar no chão (com folga para o dedo)
      const m = matrizDe(item, REPOUSO, 1);
      let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
      for (const [cx, cy] of [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]]) {
        const zc = m[2] * cx + m[6] * cy + m[14];
        const k = geo.f / Math.max(1, geo.f - zc);
        const sx = geo.L / 2 + (m[0] * cx + m[4] * cy + m[12]) * k;
        const sy = geo.A / 2 + (m[1] * cx + m[5] * cy + m[13]) * k;
        x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
      }
      const folgaY = Math.max(0, (46 - (y1 - y0)) / 2);
      Object.assign(item.botao.style, {
        left: `${x0.toFixed(1)}px`, top: `${(y0 - folgaY).toFixed(1)}px`,
        width: `${(x1 - x0).toFixed(1)}px`, height: `${(y1 - y0 + folgaY * 2).toFixed(1)}px`,
      });
    });
    campo.style.perspective = `${geo.f.toFixed(1)}px`;
  }

  /** A matriz que deita a carta no chão, vista pela câmera do mundo (a = a pose; k = quanto o olhar desceu). */
  function matrizDe(item, a, k) {
    const teta = geo.teta * k;
    const st = Math.sin(teta); const ct = Math.cos(teta);
    const psi = (item.guinada + a.giro) * GRAU;
    const fi = (item.tombo + a.vira) * GRAU;
    const cp = Math.cos(psi); const sp = Math.sin(psi);
    const cf = Math.cos(fi); const sf = Math.sin(fi);
    // eixos da carta no mundo: u para a direita dela, v da borda de lá para a de cá
    const ux = cp; const uy = 0; const uz = sp;
    const vx = -sp * cf; const vy = -sf; const vz = cp * cf;
    const nx = uy * vz - uz * vy; const ny = uz * vx - ux * vz; const nz = ux * vy - uy * vx;
    const meiaProf = item.larg * PROPORCAO / 2;
    const px = item.X + Math.sin(a.alt * 3.1 + item.fase) * 0.16 * Math.min(1, a.alt);
    const py = 0.012 + meiaProf * Math.abs(sf) + a.alt - ALTURA_OLHOS;
    const pz = -item.d;
    // câmera: direita (1,0,0), cima (0,ct,−st), frente (0,−st,−ct)
    const cima = (x, y, z) => y * ct - z * st;
    const frente = (x, y, z) => -y * st - z * ct;
    const S = geo.S;
    return [
      ux, -cima(ux, uy, uz), -frente(ux, uy, uz), 0,
      vx, -cima(vx, vy, vz), -frente(vx, vy, vz), 0,
      nx, -cima(nx, ny, nz), -frente(nx, ny, nz), 0,
      px * S, -cima(px, py, pz) * S, geo.f - frente(px, py, pz) * S, 1,
    ];
  }
  function posar(item) {
    const a = item.anim;
    // (parada, a carta não é reescrita: o vento que mexe nela é do CSS, por dentro do desenho)
    const texto = `matrix3d(${matrizDe(item, a, olhar.k).map((v) => v.toFixed(5)).join(',')})`;
    if (texto !== item.matriz) { item.matriz = texto; item.desenho.style.transform = texto; }
    if (a.op !== item.opaca) { item.opaca = a.op; item.desenho.style.opacity = a.op.toFixed(3); }
  }

  cancelamentos.push(mundo.aoQuadro(() => {
    if (mundo.ok && olhar.k > 0.0005) mundo.camera.rotation.x -= geo.teta * olhar.k;
    for (const item of itens) posar(item);
  }));

  // ---- as cartas --------------------------------------------------------------
  for (const item of itens) {
    const nome = el('span', { class: 'carta-chao-nome', 'aria-hidden': 'true' });
    const face = el('span', 'carta-chao-face', [svg(ENVELOPE), svg(item.ultima ? LACRE : AMARRA), nome]);
    const vento = el('span', { class: 'carta-chao-vento', style: { animationDelay: `${(-item.fase).toFixed(2)}s` } }, face);
    const desenho = el('span', { class: 'carta-chao-desenho', 'aria-hidden': 'true', dataset: { estado: 'fechada' } },
      [el('span', 'carta-chao-sombra'), vento]);
    const botao = el('button', {
      class: 'carta-chao', type: 'button',
      'aria-label': String(rotulos.carta || 'Carta {n}').replace('{n}', String(item.i + 1)),
      dataset: { acao: 'carta-chao', id: item.carta.id, estado: 'fechada', tipo: item.carta.tipo },
    });
    if (item.ultima) {
      desenho.classList.add('carta-chao-surpresinha');
      // A Surpresinha é a última: fica trancada até as outras terem sido abertas.
      if (itens.length > 1) { desenho.dataset.trancada = '1'; botao.setAttribute('aria-disabled', 'true'); }
    }
    item.botao = botao;
    item.desenho = desenho;
    item.nome = nome;
    botao.addEventListener('click', () => abrirCarta(item));
    campo.append(botao, desenho);              // o desenho logo depois do botão (o CSS usa botão + desenho)
  }
  medir();
  const aoGirar = () => medir();
  cancelamentos.push(mundo.aoRedimensionar(aoGirar));
  ouvir(window, 'resize', aoGirar, { passive: true });

  // ---- música ---------------------------------------------------------------
  let abafada = false;
  let pausaMusica = false;             // sem Web Audio: a música pausa de verdade e volta depois
  function abaixarMusica() {
    if (abafada) return;
    abafada = true;
    let diag = null;
    try { diag = som.diagnostico ? som.diagnostico() : null; } catch { diag = null; }
    if (diag && !diag.mudo && !diag.webAudio && som.estado.tocando) { pausaMusica = true; som.pausar(); }
    else som.abafar(ABAFAR, 30 * 60 * 1000);
  }
  function voltarMusica() {
    if (!abafada) return;
    abafada = false;
    if (pausaMusica) { pausaMusica = false; som.retomar(); return; }
    som.abafar(1, 0);
    // O iPhone pode ter parado a música enquanto o vídeo tocava: ela volta sozinha.
    try {
      const diag = som.diagnostico ? som.diagnostico() : null;
      if (diag && diag.pausado && som.estado.tocando && !diag.mudo && diag.fonte) { som.pausar(); som.retomar(); }
    } catch { /* segue */ }
  }

  // ---- o visor: o vídeo, a galeria ou o cartão de exemplo -------------------
  const falhas = new Set();            // cartas cujo vídeo não carregou
  let visorAberto = null;

  /**
   * Mostra o conteúdo de uma carta. Resolve com { falhou } quando ela fecha.
   * Tem de ser chamada dentro do toque (o vídeo pede para tocar aqui mesmo).
   */
  function mostrar(carta, { de = null } = {}) {
    return new Promise((resolver) => {
      const semConteudo = carta.tipo === 'galeria' ? !carta.midias.length : !carta.video;
      let tipo = semConteudo || falhas.has(carta.id) ? 'vazio' : carta.tipo;
      let falhou = falhas.has(carta.id);
      const visor = el('div', {
        class: 'carta-chao-visor', role: 'dialog', 'aria-modal': 'true', 'aria-label': carta.nome,
        dataset: { tipo },
      });
      const veu = el('div', { class: 'visor-veu', 'aria-hidden': 'true' });
      const quadro = el('div', 'visor-quadro');
      // A folha de papel: o laço do fio no alto, o conteúdo no miolo e, no rodapé,
      // o nome de quem mandou (como numa polaroide).
      const papel = el('div', 'visor-papel ui-folha');
      const miolo = el('div', 'visor-miolo');
      const legenda = el('p', { class: 'visor-nome ui-titulo', 'aria-hidden': 'true' });
      const rodape = el('div', 'visor-rodape', [
        legenda,
        carta.tipo === 'galeria' ? el('span', { class: 'ui-coracao', 'aria-hidden': 'true' }) : null,
      ]);
      papel.append(el('span', { class: 'ui-laco', 'aria-hidden': 'true', dataset: { onde: 'topo' } }), miolo, rodape);
      const fechar = el('button', {
        class: 'carta-chao-fechar ui-redondo', type: 'button', 'aria-label': rotulos.fechar || 'Fechar',
        dataset: { acao: 'fechar-carta', tom: 'noite' },
      });
      fechar.append(svg(X_FECHAR));
      quadro.append(papel);
      visor.append(veu, quadro, fechar);
      const limpezas = [];
      let fechado = false;

      /** O cartão de papel: o exemplo entre colchetes, ou só o nome (vídeo que não carregou). */
      const cartao = (texto, glifo) => {
        const c = el('div', 'visor-cartao');
        if (glifo) c.append(svg(glifo));
        c.append(el('p', { class: 'carta-chao-vazio', texto }));
        return c;
      };

      let video = null;
      let laco = 0;
      if (tipo === 'vazio') {
        if (semConteudo) {
          const molde = carta.tipo === 'galeria' ? dados.vazioSurpresinha : dados.vazio;
          miolo.append(cartao(String(molde || '').replace('{nome}', carta.nome), carta.tipo === 'galeria' ? GLIFO_CORACAO : GLIFO_VIDEO));
        } else miolo.append(cartao(carta.nome, null));
      } else if (tipo === 'video') {
        // ---- vídeo: sem os controles do navegador; tocar na imagem pausa ----
        const tela = el('div', 'visor-tela');
        video = document.createElement('video');
        video.className = 'visor-video';
        video.playsInline = true;
        video.setAttribute('playsinline', '');
        video.setAttribute('webkit-playsinline', '');
        video.setAttribute('disablepictureinpicture', '');
        video.setAttribute('disableremoteplayback', '');
        video.controls = false;
        video.preload = 'auto';
        if (carta.capa) video.poster = carta.capa;
        const tocar = el('button', { class: 'visor-tocar ui-redondo', type: 'button', hidden: true, 'aria-label': carta.nome });
        tocar.append(svg(TOCAR));
        // o andamento: o fio vermelho que cresce, com uma conta na ponta
        const linha = el('span', 'visor-progresso-fio');
        const conta = el('span', 'visor-progresso-conta');
        tela.append(video, el('span', { class: 'visor-pausa', 'aria-hidden': 'true' }, svg(TOCAR)), tocar);
        miolo.append(tela, el('span', { class: 'visor-progresso', 'aria-hidden': 'true' }, [linha, conta]));
        papel.classList.add('visor-carregando');

        const tocarVideo = () => {
          tocar.hidden = true;
          let pr;
          try { pr = video.play(); } catch (erro) { pr = Promise.reject(erro); }
          if (pr && pr.catch) pr.catch((erro) => {
            // O navegador quer outro toque: um botão de tocar no meio do vídeo.
            if (!fechado && erro && erro.name === 'NotAllowedError') tocar.hidden = false;
          });
        };
        const falhar = () => {
          // O vídeo não carregou: no lugar dele fica o cartão só com o nome. Nada trava.
          if (falhou || fechado) return;
          falhou = true;
          falhas.add(carta.id);
          cancelAnimationFrame(laco);
          voltarMusica();
          tela.remove();
          papel.querySelector('.visor-progresso')?.remove();
          papel.classList.remove('visor-carregando', 'visor-pausado');
          miolo.append(cartao(carta.nome, null));
          visor.dataset.tipo = 'vazio';
        };
        video.addEventListener('loadedmetadata', () => {
          if (video.videoWidth && video.videoHeight) papel.style.setProperty('--aspecto', (video.videoWidth / video.videoHeight).toFixed(4));
        });
        video.addEventListener('playing', () => papel.classList.remove('visor-pausado', 'visor-carregando'));
        video.addEventListener('waiting', () => papel.classList.add('visor-carregando'));
        video.addEventListener('pause', () => { if (!video.ended && !fechado) papel.classList.add('visor-pausado'); });
        video.addEventListener('ended', () => fecharVisor());
        video.addEventListener('error', falhar);
        tela.addEventListener('click', (ev) => {
          if (ev.target.closest('.visor-tocar')) return;
          if (video.paused) tocarVideo(); else video.pause();
        });
        tocar.addEventListener('click', tocarVideo);
        const passo = () => {
          if (fechado) return;
          const p = Number.isFinite(video.duration) && video.duration > 0 ? clamp(video.currentTime / video.duration) : 0;
          linha.style.transform = `scaleX(${p.toFixed(4)})`;
          conta.style.transform = `translateX(${(p * 100).toFixed(2)}%)`;
          laco = requestAnimationFrame(passo);
        };
        laco = requestAnimationFrame(passo);
        const aoEsconder = () => {
          if (document.hidden) { if (!video.paused) { video.dataset.aba = '1'; video.pause(); } }
          else if (video.dataset.aba) { delete video.dataset.aba; tocarVideo(); }
        };
        document.addEventListener('visibilitychange', aoEsconder);
        limpezas.push(() => document.removeEventListener('visibilitychange', aoEsconder));
        abaixarMusica();
        video.src = carta.video;
        tocarVideo();                    // dentro do toque: é o gesto que o Safari exige
      } else {
        // ---- galeria: fotos e vídeos que ela passa para o lado ---------------
        const trilho = el('div', { class: 'carta-chao-galeria', tabindex: '0' });
        const pontos = el('div', { class: 'galeria-pontos', 'aria-hidden': 'true' });
        const slides = [];
        const sumiu = (figura) => {
          const k = slides.findIndex((s) => s.figura === figura);
          if (k < 0) return;
          slides[k].ponto.remove();
          slides.splice(k, 1);
          figura.remove();
          if (!slides.length) {            // nada carregou: fica o cartão só com o nome
            falhou = true;
            falhas.add(carta.id);
            miolo.textContent = '';
            papel.classList.remove('visor-galeria');
            miolo.append(cartao(carta.nome, null));
            visor.dataset.tipo = 'vazio';
          } else atualizar();
        };
        for (const m of carta.midias) {
          let midia;
          if (m.video) {
            midia = el('video', { src: m.video, playsinline: '', 'webkit-playsinline': '', controls: '', preload: 'metadata' });
            midia.addEventListener('play', abaixarMusica);
            midia.addEventListener('pause', voltarMusica);
            midia.addEventListener('ended', voltarMusica);
          } else {
            midia = el('img', { src: m.foto, alt: m.legenda || '', draggable: 'false', decoding: 'async' });
          }
          // cada momento é uma polaroide, com a legenda escrita à mão embaixo
          const figura = el('div', 'galeria-item', el('figure', 'galeria-polaroide', [
            el('div', 'galeria-midia', midia),
            m.legenda ? el('figcaption', { texto: m.legenda }) : null,
          ]));
          midia.addEventListener('error', () => sumiu(figura));
          const ponto = el('span', 'galeria-ponto');
          pontos.append(ponto);
          slides.push({ figura, ponto, midia });
          trilho.append(figura);
        }
        const anterior = el('button', { class: 'galeria-seta ui-redondo', type: 'button', 'aria-label': rotulos.anterior || 'Anterior', dataset: { lado: 'anterior' } });
        const proxima = el('button', { class: 'galeria-seta ui-redondo', type: 'button', 'aria-label': rotulos.proxima || 'Próxima', dataset: { lado: 'proxima' } });
        anterior.append(svg(SETA));
        proxima.append(svg(SETA));
        let atual = -1;
        const indice = () => clamp(Math.round(trilho.scrollLeft / Math.max(1, trilho.clientWidth)), 0, slides.length - 1);
        function atualizar() {
          const i = indice();
          anterior.disabled = i <= 0;
          proxima.disabled = i >= slides.length - 1;
          pontos.hidden = slides.length < 2;
          if (i === atual) return;
          atual = i;
          slides.forEach((s, k) => {
            s.ponto.toggleAttribute('data-atual', k === i);
            if (k !== i && s.midia.tagName === 'VIDEO') { try { s.midia.pause(); } catch { /* segue */ } }
          });
        }
        const ir = (i) => trilho.scrollTo({ left: clamp(i, 0, slides.length - 1) * trilho.clientWidth, behavior: calmo ? 'auto' : 'smooth' });
        let pedido = 0;
        trilho.addEventListener('scroll', () => { cancelAnimationFrame(pedido); pedido = requestAnimationFrame(atualizar); }, { passive: true });
        anterior.addEventListener('click', () => ir(indice() - 1));
        proxima.addEventListener('click', () => ir(indice() + 1));
        trilho.addEventListener('keydown', (ev) => {
          if (ev.key === 'ArrowRight') { ev.preventDefault(); ir(indice() + 1); }
          else if (ev.key === 'ArrowLeft') { ev.preventDefault(); ir(indice() - 1); }
        });
        papel.classList.add('visor-galeria');
        miolo.append(trilho, anterior, proxima, pontos);
        requestAnimationFrame(atualizar);
      }

      function fecharVisor() {
        if (fechado) return;
        fechado = true;
        cancelAnimationFrame(laco);
        for (const v of visor.querySelectorAll('video')) { try { v.pause(); } catch { /* segue */ } }
        for (const fn of limpezas) fn();
        document.removeEventListener('keydown', aoTeclar, true);
        voltarMusica();
        musica.mostrarMini();
        mundo.petalas.definirDensidade(1);
        fechar.disabled = true;
        gsap.killTweensOf([quadro, veu, fechar]);
        const fim = () => {
          for (const v of visor.querySelectorAll('video')) { try { v.removeAttribute('src'); v.load(); } catch { /* segue */ } }
          visor.remove();
          if (visorAberto === visor) visorAberto = null;
          if (inventario.itens.length) inventario.mostrarBotao();
          resolver({ falhou });
        };
        // Sair é mais rápido que entrar e sem mola: a folha volta para a carta no chão.
        gsap.to(fechar, { autoAlpha: 0, duration: 0.14, ease: 'none' });
        gsap.to(veu, { autoAlpha: 0, duration: 0.32, ease: 'none' });
        const alvo = de && de.isConnected ? saidaPara(de) : null;
        if (calmo || !alvo) gsap.to(quadro, { autoAlpha: 0, scale: calmo ? 1 : 0.97, duration: calmo ? 0.3 : 0.2, ease: 'power2.out', onComplete: fim });
        else {
          gsap.to(quadro, { x: alvo.x, y: alvo.y, scale: alvo.escala, rotation: alvo.giro, duration: 0.36, ease: 'power2.inOut' });
          gsap.to(quadro, { autoAlpha: 0, duration: 0.16, delay: 0.2, ease: 'none', onComplete: fim });
        }
      }
      /** De onde a moldura sai e para onde volta: a carta no chão. */
      function saidaPara(no) {
        const r = no.getBoundingClientRect();
        const q = papel.getBoundingClientRect();
        if (!q.width || !r.width) return null;
        return {
          x: r.left + r.width / 2 - (q.left + q.width / 2),
          y: r.top + r.height / 2 - (q.top + q.height / 2),
          escala: clamp(r.width / q.width, 0.16, 0.8),
          giro: -5,
        };
      }
      function aoTeclar(ev) {
        if (fechado) return;
        if (ev.key === 'Escape') { ev.preventDefault(); fecharVisor(); }
        else if (video && !falhou && (ev.key === ' ' || ev.key === 'k') && document.activeElement !== fechar) {
          ev.preventDefault();
          if (video.paused) video.play().catch(() => {}); else video.pause();
        } else if (ev.key === 'Tab') {
          // o foco fica dentro do que está aberto
          const focaveis = [...visor.querySelectorAll('button:not([hidden]):not([disabled]), [tabindex="0"], video[controls]')];
          if (!focaveis.length) return;
          const i = focaveis.indexOf(document.activeElement);
          ev.preventDefault();
          focaveis[(i + (ev.shiftKey ? -1 : 1) + focaveis.length) % focaveis.length].focus({ preventScroll: true });
        }
      }
      fechar.addEventListener('click', fecharVisor);
      veu.addEventListener('click', () => { if (tipo !== 'video' || falhou) fecharVisor(); });
      document.addEventListener('keydown', aoTeclar, true);

      // ---- entra: a carta sobe do chão e se abre -----------------------------
      visorAberto = visor;
      palco.append(visor);
      inventario.esconderBotao();
      musica.esconderMini();
      mundo.petalas.definirDensidade(0.4);
      vivo.textContent = carta.nome;
      gsap.fromTo(veu, { autoAlpha: 0 }, { autoAlpha: 1, duration: calmo ? 0.4 : 0.5, ease: 'none' });
      gsap.fromTo(fechar, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3, delay: calmo ? 0 : 0.3, ease: 'none' });
      const origem = de && !calmo ? saidaPara(de) : null;
      if (origem) {
        // sobe da carta no chão: o caminho desacelera, o tamanho assenta com um nada de mola
        gsap.fromTo(quadro,
          { x: origem.x, y: origem.y, rotation: origem.giro, autoAlpha: 0 },
          { x: 0, y: 0, rotation: 0, autoAlpha: 1, duration: 0.6, ease: curvas.branco.entrar });
        gsap.fromTo(quadro, { scale: origem.escala }, { scale: 1, duration: 0.62, ease: 'back.out(1.25)' });
      } else if (calmo) gsap.fromTo(quadro, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.45, ease: 'none' });
      else {
        // aberta pela bolsa: do meio, um pouco menor
        gsap.fromTo(quadro, { autoAlpha: 0, scale: 0.94 }, { autoAlpha: 1, scale: 1, duration: 0.42, ease: 'back.out(1.25)' });
      }
      // o nome de quem mandou, escrito à mão no rodapé da folha
      gsap.delayedCall(calmo ? 0.3 : 0.55, () => { if (!fechado) escrever(gsap, legenda, carta.nome, { calmo, som, intensidade: 0.4 }); });
      try { fechar.focus({ preventScroll: true }); } catch { /* sem foco programático */ }
    });
  }

  // ---- o nome, escrito na carta depois de aberta -----------------------------
  function escreverNome(item) {
    if (item.escrito) return;
    item.escrito = true;
    const alvo = item.nome;
    // primeiro mede com o texto inteiro (a letra diminui até caber), depois escreve
    alvo.textContent = item.carta.nome;
    let tamanho = 0.19;
    alvo.style.fontSize = `calc(var(--b) * ${tamanho})`;
    for (let i = 0; i < 8 && alvo.scrollWidth > alvo.clientWidth + 1; i++) {
      tamanho *= 0.9;
      alvo.style.fontSize = `calc(var(--b) * ${tamanho.toFixed(4)})`;
    }
    escrever(gsap, alvo, item.carta.nome, { calmo, som });
  }

  // ---- o botão de seguir em frente -------------------------------------------
  const abertas = new Set();
  let seguir = null;
  let resolverFim;
  const fim = new Promise((ok) => { resolverFim = ok; });
  function atualizarSeguir() {
    if (!abertas.size) return;
    if (!seguir) {
      seguir = el('button', { class: 'ui-pilula cartas-chao-seguir cartas-chao-seguir-visivel ui-entra', type: 'button', dataset: { acao: 'seguir-cartas' } },
        [el('span', { class: 'cartas-chao-seguir-texto', texto: dados.seguir || '' }), svg(SEGUIR)]);
      // (a animação de entrada sai depois de tocar: senão ela seguraria o afundar do toque)
      seguir.addEventListener('animationend', (ev) => { if (ev.target === seguir) seguir.classList.remove('ui-entra'); });
      if (!dados.seguir) seguir.setAttribute('aria-label', 'Seguir em frente');
      seguir.addEventListener('click', () => {
        if (diretor.etapa() !== 'escolhendo' || inventario.aberto || visorAberto) return;
        seguir.disabled = true;
        resolverFim();
      });
      acoes.append(seguir);
    }
    // todas abertas: o botão vira a ação principal (o vermelho do fio) e chama o toque
    const todas = abertas.size >= itens.length;
    seguir.toggleAttribute('data-destaque', todas);
    if (todas) seguir.dataset.tom = 'fio'; else delete seguir.dataset.tom;
  }

  // ---- abrir uma carta ----------------------------------------------------------
  let ocupado = false;
  async function abrirCarta(item) {
    if (ocupado || visorAberto || inventario.aberto || diretor.etapa() !== 'escolhendo') return;
    if (item.ultima && itens.some((o) => o !== item && !abertas.has(o.carta.id))) {
      // Ainda não: a carta só balança, sem abrir.
      item.desenho.removeAttribute('data-negou');
      void item.desenho.offsetWidth;
      item.desenho.dataset.negou = '1';
      return;
    }
    ocupado = true;
    diretor.etapa('assistindo');
    som.destravar?.();
    som.efeito('papel');
    const carta = item.carta;
    let resultado = { falhou: false };
    // A Surpresinha guarda os áudios com a voz dele (js/voz.js): se houver fotos e vídeos,
    // eles vêm antes; depois (ou só) a fita com os áudios. A fita fica na bolsa.
    const comVoz = item.ultima && ctx.voz && (conteudo.voz?.itens || []).length > 0;
    try {
      if (!comVoz || carta.midias.length) resultado = await mostrar(carta, { de: item.desenho });
      if (comVoz) await ctx.voz.abrir();
    } catch (erro) { console.error('[carta] carta do chão', erro); }
    // Só agora ela sabe de quem é: o estado muda, a carta vai para a bolsa e o nome é escrito.
    item.estado = resultado.falhou ? 'falhou' : 'aberta';
    item.botao.dataset.estado = item.estado;
    item.desenho.dataset.estado = item.estado;
    item.botao.setAttribute('aria-label', carta.nome);
    abertas.add(carta.id);
    if (comVoz) ctx.voz.liberar();     // a fita com os áudios é o que vai para a bolsa
    if (!comVoz || carta.midias.length) inventario.guardar({ id: carta.id, tipo: carta.tipo, titulo: carta.nome, abrir: () => mostrar(carta) });
    inventario.mostrarBotao();
    atualizarSeguir();
    const ult = itens.find((o) => o.ultima);
    if (ult && itens.every((o) => o === ult || abertas.has(o.carta.id))) {
      delete ult.desenho.dataset.trancada;
      ult.botao.removeAttribute('aria-disabled');
    }
    ocupado = false;
    diretor.etapa('escolhendo');
    escreverNome(item);
    if (!amb.toque) { try { item.botao.focus({ preventScroll: true }); } catch { /* sem foco */ } }
  }

  // ==========================================================================
  // O roteiro
  // ==========================================================================
  let eleFrio = null;
  let frase = null;
  try {
    if (frio) {
      // Entrada por atalho: o mundo aberto e, se der, ele lá adiante e o fim de tarde.
      musica.mostrarMini();
      mundo.petalas.definirDensidade(1);
      if (mundo.ok && temEncontro(conteudo) && !estado.ele) {
        try {
          eleFrio = criarEle(mundo);
          eleFrio.grupo.position.set(mundo.rig.position.x + 0.1, 0, mundo.rig.position.z - DIST_ELE);
          mundo.cena.add(eleFrio.grupo);
          eleFrio.mostrar(calmo ? 0.6 : 1.4);
        } catch (erro) { console.error(erro); eleFrio = null; }
      }
      if (temEncontro(conteudo)) entardecer(ctx, 0.93, 1.2);
    }

    diretor.etapa('pousando');
    // Ela olha para o chão; as cartas caem uma a uma, como folhas, entre os dois.
    gsap.to(olhar, { k: 1, duration: calmo ? 1.0 : 2.2, ease: calmo ? 'none' : 'sine.inOut' });
    if (dados.frase) {
      // (embaixo, no chão vazio antes das cartas: no alto ela cairia em cima dele)
      frase = el('p', 'frase cartas-chao-frase');
      raiz.append(frase);
      revelarPalavras(frase, dados.frase, { intervalo: 0.2, duracao: 1.5 });
    }
    await espera(calmo ? 300 : 700);
    const quedas = itens.map((item, k) => new Promise((ok) => {
      const a = item.anim;
      if (calmo) {
        gsap.to(a, { op: 1, duration: 0.7, delay: k * 0.1, ease: 'none', onComplete: ok });
        return;
      }
      a.alt = 1.25 + (k % 3) * 0.14;
      a.giro = (k % 2 ? 1 : -1) * (50 + k * 9);
      a.vira = 34;
      const atraso = k * 0.2;
      gsap.to(a, { op: 1, duration: 0.3, delay: atraso, ease: 'none' });
      gsap.to(a, { giro: 0, vira: 0, duration: 1.5, delay: atraso, ease: 'power2.out' });
      gsap.to(a, {
        alt: 0, duration: 1.35, delay: atraso, ease: 'sine.in',
        onComplete: () => {
          som.efeito('papel', { intensidade: 0.25 });
          // pousou: um pequeno assento, a borda de lá ainda balança
          gsap.fromTo(a, { vira: -7 }, { vira: 0, duration: 0.9, ease: 'elastic.out(1, 0.45)', overwrite: 'auto' });
          ok();
        },
      });
    }));
    await Promise.all(quedas);
    if (frase) {
      const f = frase;
      frase = null;
      gsap.delayedCall(calmo ? 1.6 : 2.4, () => ocultarPalavras(f).then(() => f.remove()));
    }
    if (!amb.toque && (!document.activeElement || document.activeElement === document.body)) {
      try { itens[0].botao.focus({ preventScroll: true }); } catch { /* sem foco */ }
    }
    diretor.etapa('escolhendo');

    await fim;

    // Seguir em frente: as cartas ficam para trás e ela volta a olhar para ele.
    diretor.etapa('seguindo');
    som.efeito('toque');
    gsap.to(seguir, { autoAlpha: 0, duration: 0.5, ease: 'none' });
    itens.forEach((item, k) => {
      gsap.to(item.anim, { op: 0, duration: 0.6, delay: k * 0.05, ease: 'none' });
      if (!calmo) gsap.to(item.anim, { alt: 0.1, vira: 10, duration: 0.9, delay: k * 0.05, ease: 'power1.in' });
    });
    await new Promise((ok) => gsap.to(olhar, { k: 0, duration: calmo ? 0.8 : 1.6, ease: calmo ? 'none' : 'sine.inOut', onComplete: ok }));
  } finally {
    for (const fn of cancelamentos) { try { fn(); } catch { /* nada */ } }
    if (frase) frase.remove();
    if (eleFrio) {
      try { eleFrio.sair(0.6); } catch { /* nada */ }
      if (!temEncontro(conteudo)) entardecer(ctx, false, 1.2);
    }
    voltarMusica();
    raiz.remove();
    if (seguir) seguir.remove();
  }
}
