/* ============================================================================
   A MÃO: o fio no pulso e a corrida
   ============================================================================
   Etapas: olha → mao-espera → correndo. Depois da frase (conteudo.mao.frase),
   a mão esquerda dela aparece por cima do mundo, em primeira pessoa, desenhada
   a nanquim pelo próprio site (ou a imagem de conteudo.mao.imagem), com o
   akai ito dando uma volta no pulso e deixando uma ponta solta. A palma recebe
   conteudo.mao.escrito, à caneta, letra por letra, e o botão "Seguir o fio"
   ([data-acao="seguir-fio"]) aparece com o sublinhado que se costura sozinho.
   No toque, o fio sai do pulso (com WebGL e sem movimento reduzido, num
   mergulho com a estrela que desenha o caminho) e ela corre seguindo o fio
   (conteudo.corrida.segundos, de 5 a 10) até parar 1,25 m antes da última
   carta. Ficam vivos para as cenas seguintes: o fio (estado.fio e
   estado.seguidorFio), a carta (estado.envelope) e, havendo encontro, ele no
   fim do fio (estado.ele). A Promise resolve depois da chegada.
   ========================================================================== */

import { el, espera, quadro, svg, clamp, lerp, amortecer, semente, suave, vibrar, compilarComPrazo } from '../nucleo/util.js';
import { curvas, comoPromise, revelarPalavras, ocultarPalavras } from '../nucleo/movimento.js';
import { voltarAoMundo, temEncontro } from '../nucleo/diretor.js';
import { criarFio } from '../mundo/fio.js';
import { criarEnvelope } from '../mundo/envelope.js';
import { criarEle } from '../mundo/ele.js';

/* ---- o caminho -------------------------------------------------------------- */

// Medidas encadeadas: ela anda CAMINHADA + RESTO (a cena final não anda mais) e
// a carta fica PARADA à frente de onde ela para. Mudar uma desloca as outras.
const CAMINHADA = 26;
const RESTO = 4;
const PARADA = 1.25;
const S_CARTA = CAMINHADA + RESTO + PARADA; // 31,25 m da partida
const ALTURA_CARTA = 1.46; // a mesma da carta.js: os olhos menos 4 cm
const ALTURA_OLHOS = 1.5;
const PROF_PULSO = 0.9; // a que distância da lente o fio sai do pulso
// A ponta solta encosta no chão 1,4 m à frente: o encontro com o chão fica
// abaixo da borda da tela, e o fio cai do nó para fora do quadro e volta pelo
// chão, sem o "V" seco que o ponto de toque desenharia.
const TOQUE = 1.4;
const ANTECIPA = 1.5; // a câmera olha esta distância adiante na curva
// O fio chega à carta pelo lado direito: a subida cai em diagonal e não corta
// a dica no meio da tela.
const LADO = 0.56;
// Ela para a ~5,2 m dele: ele com pouco mais de um quarto da altura da tela,
// ainda envolto na névoa.
const ELE_ATRAS = 4;
const ELE_X = 0.1;
// O nanquim não aguenta crescer muito (o traço engrossa e a mão enche a tela):
// o resto do "chegar perto" é da câmera, e a mão se dissolve enquanto cresce.
const ZOOM_MERGULHO = 1.7;

// O seguidor: a tabela do chão anda de 5 em 5 cm; a polilinha tem no máximo
// 128 pontos, 10 deles na queda do pulso ao chão.
const PASSO_G = 0.05;
const MAX_PONTOS = 128;
const QUEDA = 10;
const FIM_CHAO = S_CARTA - 0.95; // 30,3 m: daqui o fio sobe até a âncora
const LARGURAS = { inicio: 0.0048, chao: 0.013, fim: 0.0065 }; // m

// Cores do desenho (tinta, fio e o manuscrito na palma).
const TINTA = '#2a1b22';
const TINTA_ESCRITO = '#2b1e2c';
const FIO = '#e3283c';
const FIO_ESCURO = '#a80f22';
const FIO_CLARO = '#ffa59c';
const FONTE_ESCRITO = '"Klee One", "Shippori Mincho", Georgia, serif';

// Onde a escrita mora na palma (unidades do desenho). `alto` estica as letras
// no sentido dos dedos, contra o escorço da palma deitada.
const PALMA = { u: 13, v: 43, largura: 82, altura: 58, inclinacao: -13, alto: 1.28 };
const ENTRELINHA = 1;
const ESCALA_NO = 1.32;
// Igual ao transform-origin de .mao-corpo em css/mao.css (só a foto usa).
const ORIGEM_IMAGEM = { x: 0.69, y: 0.69 };
const INTERVALO_PULSO = 1000; // ms entre duas batidas do pulso

const GRAU = Math.PI / 180;
const NS = 'http://www.w3.org/2000/svg';
const nada = () => {};

// O sublinhado de "Seguir o fio": um fio costurado (pathLength 1: o CSS o
// desenha com stroke-dashoffset, sem vector-effect, que no Chromium mede em px).
const SUBLINHADO = `<svg class="botao-fio-linha" viewBox="0 0 120 10" preserveAspectRatio="none"
  aria-hidden="true" focusable="false"><path pathLength="1" d="M2 6.2C14 3.4 26 7.9 40 5.6S66 2.5 80 5.1s28 2.7 38-.5"/></svg>`;

/** A corrida arranca depressa (ela viu o fio e foi), segura o passo e desacelera no último terço. */
const curvaDaCorrida = (() => {
  const N = 96;
  const ENTRADA = 0.2;
  const CHEGADA = 0.4;
  const tabela = new Float64Array(N + 1);
  let soma = 0;
  for (let i = 1; i <= N; i++) {
    const t = (i - 0.5) / N;
    soma += suave(t / ENTRADA) * suave((1 - t) / CHEGADA);
    tabela[i] = soma;
  }
  for (let i = 1; i <= N; i++) tabela[i] /= soma;
  return (p) => {
    const x = clamp(p) * N;
    const i = Math.min(N - 1, Math.floor(x));
    return lerp(tabela[i], tabela[i + 1], x - i);
  };
})();

/**
 * Deslocamento lateral do caminho a `s` metros da partida. Abre para a direita
 * nos primeiros metros (fora da silhueta da mão, onde ela vê o fio correr), faz
 * um S largo e se fecha para o lado da carta entre 26,5 e 30 m. É o mesmo no
 * chão, na câmera, nas pétalas e no fio leve.
 */
function desvio(s) {
  const onda = 0.72 * Math.sin(0.3 * s + 0.05)
    + 0.2 * Math.sin(0.71 * s + 1.9) * suave((s - 5) / 5)
    + 0.07 * Math.sin(1.3 * s + 0.4);
  return lerp(onda, LADO, suave((s - 26.5) / 3.5));
}

// No mergulho o fio voa: alto perto dela, de lado nos primeiros metros.
const alturaAr = (s) => (0.98 + 0.4 * Math.sin(0.9 * (s - 1.2))) * (1 - suave((s - 6.5) / 4.5));
const ladoAr = (s) => 0.26 * Math.sin(0.62 * (s - 1.2) + 0.2) * (1 - suave((s - 7) / 4));

/** Campo de visão vertical (graus): 58 em pé, 42 deitado, como o do mundo. */
function fovPara(aspecto) {
  return lerp(58, 42, clamp((aspecto - 0.8) / 0.55));
}

/* ---- a mão: um modelo em 3D projetado ---------------------------------------------
   O escorço da palma, os dedos que encurtam e o antebraço que alarga saem da
   projeção, não de ajuste à mão. Espaço da mão: u para o lado do mínimo, v para
   os dedos, w para fora da palma; o pulso é a origem. A palma deita para trás
   e ela a vê de cima, em primeira pessoa. Unidades do viewBox 400 × 500.
   ------------------------------------------------------------------------------ */

const VISTA = {
  inclinacao: 45, // a palma deita para trás
  guinada: -7,
  rolo: 12, // no plano da tela, os dedos pendem para a direita
  dobra: 7, // o pulso dobra um pouco para trás
  desvio: 10, // o antebraço vem do lado do polegar
  distancia: 980, // ~35 cm, na unidade do desenho
  escala: 1.1,
  cx: 212, // onde cai o pulso
  cy: 250,
};
const VB_L = 400;
const VB_A = 500;
const BRACO_FIM = 372; // até onde o antebraço é desenhado (sai pela borda de baixo)

/** [u, v, w] → [x, y, fator] no viewBox, com perspectiva. */
const projetar = (() => {
  const i = -VISTA.inclinacao * GRAU;
  const g = VISTA.guinada * GRAU;
  const r = VISTA.rolo * GRAU;
  const ci = Math.cos(i), si = Math.sin(i);
  const cg = Math.cos(g), sg = Math.sin(g);
  const cr = Math.cos(r), sr = Math.sin(r);
  return ([u, v, w = 0]) => {
    let x = u;
    let y = v * ci - w * si;
    let z = v * si + w * ci;
    const xg = x * cg + z * sg;
    z = -x * sg + z * cg;
    x = xg;
    const xr = x * cr + y * sr;
    y = -x * sr + y * cr;
    x = xr;
    const f = VISTA.distancia / (VISTA.distancia - z);
    return [VISTA.cx + x * f * VISTA.escala, VISTA.cy - y * f * VISTA.escala, f];
  };
})();

/** Ponto do antebraço: L ao longo do braço (a partir do pulso), e de lado (+ = mínimo), h para fora da pele. */
const braco = (() => {
  const d = VISTA.dobra * GRAU;
  const s = VISTA.desvio * GRAU;
  const A = [-Math.sin(s) * Math.cos(d), -Math.cos(s) * Math.cos(d), Math.sin(d)];
  const E = [Math.cos(s), -Math.sin(s), 0];
  const H = [A[1] * E[2] - A[2] * E[1], A[2] * E[0] - A[0] * E[2], A[0] * E[1] - A[1] * E[0]];
  return (L, e, h = 0) => [
    A[0] * L + E[0] * e + H[0] * h,
    A[1] * L + E[1] * e + H[1] * h,
    A[2] * L + E[2] * e + H[2] * h,
  ];
})();

/** Meia largura do antebraço a L do pulso. */
function meioBraco(L) {
  return 44.5 + 14 * suave(L / 250) + 3 * Math.sin(Math.PI * clamp(L / 380));
}

/** p + a·k (+ b·kb), com w ausente valendo 0. */
function mais(p, a, k, b, kb = 0) {
  return [
    p[0] + a[0] * k + (b ? b[0] * kb : 0),
    p[1] + a[1] * k + (b ? b[1] * kb : 0),
    (p[2] || 0) + (a[2] || 0) * k + (b ? (b[2] || 0) * kb : 0),
  ];
}

/** Catmull-Rom uniforme pelos pontos (2D ou 3D); devolve a polilinha densa. */
function catmull(pts, passos = 7) {
  const n = pts.length;
  if (n < 2) return pts.map((p) => p.slice());
  const dim = pts[0].length;
  const P = (i) => {
    if (i < 0) return pts[0].map((v, k) => 2 * v - pts[1][k]);
    if (i >= n) return pts[n - 1].map((v, k) => 2 * v - pts[n - 2][k]);
    return pts[i];
  };
  const saida = [];
  for (let i = 0; i < n - 1; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    for (let j = 0; j < passos; j++) {
      const t = j / passos, t2 = t * t, t3 = t2 * t;
      const q = new Array(dim);
      for (let k = 0; k < dim; k++) {
        q[k] = 0.5 * (2 * p1[k] + (p2[k] - p0[k]) * t
          + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2
          + (3 * p1[k] - p0[k] - 3 * p2[k] + p3[k]) * t3);
      }
      saida.push(q);
    }
  }
  saida.push(pts[n - 1].slice());
  return saida;
}

/** Curvatura da palma (eixo w): o meio afunda, as bordas sobem. */
function conchaPalma(u, v) {
  return 0.0026 * (u - 4) ** 2 + 0.0009 * (v - 60) ** 2;
}
const naPalma = (u, v) => [u, v, conchaPalma(u, v)];

/**
 * Um dedo em 3D: eixo que se curva de lado (`curva`, rad no comprimento todo) e
 * se dobra para a palma na base e em cada junta (`flexao`, graus). Devolve as
 * bordas, a ponta (semicírculo), o eixo e a meia largura.
 */
function dedo({ base, angulo, comprimento, largBase, largPonta, curva, polpa, juntas, flexao }) {
  const SEG = 28;
  const PASSOS = SEG * 2;
  const limites = [0, ...juntas, 1];
  const rumo = (t) => angulo * GRAU + curva * t;
  const flexaoEm = (t) => flexao.reduce((soma, f, i) => soma + f * GRAU * (i ? suave((t - juntas[i - 1]) / 0.06 + 0.5) : 1), 0);
  const direcao = (t) => {
    const h = rumo(t), f = flexaoEm(t);
    return [Math.sin(h) * Math.cos(f), Math.cos(h) * Math.cos(f), Math.sin(f)];
  };
  const lado = (t) => [Math.cos(rumo(t)), -Math.sin(rumo(t)), 0];
  // o eixo, integrado em passos curtos (ponto médio)
  const eixo = [base.length > 2 ? base.slice() : [base[0], base[1], 0]];
  for (let i = 0; i < PASSOS; i++) eixo.push(mais(eixo[i], direcao((i + 0.5) / PASSOS), comprimento / PASSOS));
  const pontoEm = (t) => {
    const x = clamp(t) * PASSOS;
    const i = Math.min(PASSOS - 1, Math.floor(x));
    const k = x - i;
    return [0, 1, 2].map((j) => lerp(eixo[i][j], eixo[i + 1][j], k));
  };
  const meia = (t) => {
    let j = 0;
    while (j < limites.length - 2 && t > limites[j + 1]) j++;
    const u = clamp((t - limites[j]) / (limites[j + 1] - limites[j]));
    const bojo = Math.sin(Math.PI * u) ** 0.8 * polpa * (j === 0 ? 0.6 : 1);
    const ombro = 1 - 0.16 * suave((t - 0.8) / 0.2);
    return (lerp(largBase, largPonta, clamp(t) ** 1.15) / 2) * (1 + bojo) * ombro;
  };
  const tc = 1 - (1.12 * meia(0.92)) / comprimento;
  const em = (s, t) => mais(pontoEm(t), lado(t), s * meia(t));
  const borda = (s, t0, t1, n = SEG) => {
    const pts = [];
    for (let i = 0; i <= n; i++) pts.push(em(s, lerp(t0, t1, i / n)));
    return pts;
  };
  const ponta = [];
  const c = pontoEm(tc), m = meia(tc), d = direcao(tc), l = lado(tc);
  for (let k = 1; k < 7; k++) {
    const a = Math.PI * (1 - k / 7);
    ponta.push(mais(c, l, m * Math.cos(a), d, m * 1.22 * Math.sin(a)));
  }
  return {
    tc, pontoEm, meia, direcao, lado, em, borda, ponta,
    esquerda: borda(-1, 0, tc),
    direita: borda(1, 0, tc),
  };
}

/** Monta a mão inteira e devolve tudo já projetado no viewBox (pontos [x, y]). */
function geometriaMao() {
  const P = (pts) => pts.map((p) => {
    const q = projetar(p);
    return [q[0], q[1]];
  });
  const polegar = dedo({ base: [-63, 64, 15], angulo: -51, comprimento: 79, largBase: 41, largPonta: 24.5, curva: 0.34, polpa: 0.09, juntas: [0.52], flexao: [15, 20] });
  const indicador = dedo({ base: [-29, 130, 0], angulo: -8.5, comprimento: 106, largBase: 30.5, largPonta: 19.5, curva: 0.12, polpa: 0.075, juntas: [0.42, 0.75], flexao: [12, 25, 16] });
  const medio = dedo({ base: [1.5, 136.5, 0], angulo: -1.5, comprimento: 117, largBase: 31, largPonta: 20.5, curva: 0.04, polpa: 0.075, juntas: [0.42, 0.75], flexao: [15, 29, 18] });
  const anelar = dedo({ base: [31, 131.5, 0], angulo: 6, comprimento: 108, largBase: 29.5, largPonta: 19.5, curva: -0.07, polpa: 0.075, juntas: [0.42, 0.75], flexao: [18, 33, 20] });
  const minimo = dedo({ base: [58, 115, 0], angulo: 16, comprimento: 81, largBase: 25, largPonta: 16.5, curva: -0.16, polpa: 0.08, juntas: [0.42, 0.75], flexao: [22, 37, 22] });
  const dedos = [indicador, medio, anelar, minimo];

  // antebraço: 22 pontos por borda, mais densos perto do pulso
  const ulna = (L) => 3.4 * Math.exp(-(((L - 12) / 8.5) ** 2));
  const alturaDoBraco = (i) => BRACO_FIM * (1 - i / 22) ** 1.25;
  const bordaPolegar = [];
  const bordaMinimo = [];
  for (let i = 0; i < 22; i++) {
    const L = alturaDoBraco(i);
    bordaPolegar.push(braco(L, -meioBraco(L) - 4.5 * Math.sin(Math.PI * clamp((L - 30) / 300))));
    bordaMinimo.push(braco(L, meioBraco(L) + ulna(L)));
  }
  // tenar (a base do polegar) e hipotenar (a borda do mínimo)
  const tenar = [naPalma(-47, 8), naPalma(-52.5, 20), naPalma(-60.5, 32), naPalma(-69, 42)];
  const hipotenar = [naPalma(47, -5), naPalma(50, 10), naPalma(55, 32), naPalma(60.5, 56), naPalma(65.5, 80), naPalma(68.5, 99)];
  // teia entre o polegar e o indicador; vales entre os dedos
  const teia = [naPalma(-60, 101), naPalma(-50.5, 113)];
  const vale = (a, b) => {
    const p = a.em(1, 0), q = b.em(-1, 0);
    return naPalma((p[0] + q[0]) / 2, Math.min(p[1], q[1]) - 4);
  };
  const vales = [vale(indicador, medio), vale(medio, anelar), vale(anelar, minimo)];

  const subida = (dd, antes) => [...(antes ? [antes] : []), ...dd.esquerda, ...dd.ponta];
  const descida = (dd, depois) => [...dd.direita.slice().reverse(), ...(depois ? [depois] : [])];
  const dentroPolegar = polegar.borda(1, polegar.tc, 0.32, 20);

  // O contorno, na ordem em que a pena passa: os dois lados do antebraço, o
  // polegar em dois traços e cada dedo subindo e descendo (12 traços).
  const tracos = [
    { pontos: P([...bordaPolegar, ...tenar, polegar.em(-1, 0)]), opcoes: { peso: 2.5, entrada: 2, saida: 16, minimo: 0.5, afinar: 0.62, passos: 3 } },
    { pontos: P([...bordaMinimo, ...hipotenar, minimo.em(1, 0)]), opcoes: { peso: 3.1, entrada: 2, saida: 12, minimo: 0.5, afinar: 0.66, passos: 3 } },
    { pontos: P([...polegar.esquerda, ...polegar.ponta]), opcoes: { peso: 1.9, entrada: 14, saida: 9, minimo: 0.18, passos: 2 } },
    { pontos: P([...dentroPolegar, ...teia, indicador.em(-1, 0)]), opcoes: { peso: 2.35, entrada: 8, saida: 12, minimo: 0.18, passos: 2 } },
  ];
  dedos.forEach((dd, i) => {
    tracos.push({ pontos: P(subida(dd, i ? vales[i - 1] : null)), opcoes: { peso: 1.7, entrada: 10, saida: 9, minimo: 0.16, passos: 2 } });
    tracos.push({ pontos: P(descida(dd, vales[i] || null)), opcoes: { peso: 2.25, entrada: 7, saida: 12, minimo: 0.16, passos: 2 } });
  });

  // a silhueta fechada (o papel branco e o recorte da aguada)
  const silhueta = P([
    ...bordaPolegar, ...tenar,
    ...polegar.esquerda, ...polegar.ponta, ...dentroPolegar, ...teia,
    ...indicador.esquerda, ...indicador.ponta, ...indicador.direita.slice().reverse(), vales[0],
    ...medio.esquerda, ...medio.ponta, ...medio.direita.slice().reverse(), vales[1],
    ...anelar.esquerda, ...anelar.ponta, ...anelar.direita.slice().reverse(), vales[2],
    ...minimo.esquerda, ...minimo.ponta, ...minimo.direita.slice().reverse(),
    ...hipotenar.slice().reverse(), ...bordaMinimo.slice().reverse(),
  ]);

  // linhas da palma e do pulso (no pulso, sobre a pele que sobe para o meio do antebraço)
  const pele = (e, L) => braco(L, e, 25 * Math.sqrt(Math.max(0, 1 - (e / meioBraco(L)) ** 2)) * suave(L / 24));
  const PULSO = { peso: 1.2, entrada: 14, saida: 18, minimo: 0.1, opacidade: 0.8 };
  const PALMA_LINHA = { peso: 1.45, entrada: 16, saida: 26, minimo: 0.08, opacidade: 0.86 };
  const LEVE = { peso: 1.05, entrada: 6, saida: 10, minimo: 0.1, opacidade: 0.62 };
  const TENDAO = { peso: 1.15, entrada: 22, saida: 40, minimo: 0.06, opacidade: 0.5 };
  const linhas = [
    { pontos: P([pele(-37, 4), pele(-13, 2.5), pele(12, 3), pele(37, 5)]), opcoes: PULSO }, // pulso 1
    { pontos: P([pele(-33, 11), pele(-9, 9.5), pele(15, 10), pele(35, 12)]), opcoes: PULSO }, // pulso 2
    { pontos: P([naPalma(-40, 99), naPalma(-29, 86), naPalma(-21.5, 66), naPalma(-19.5, 44), naPalma(-23, 24), naPalma(-28.5, 11)]), opcoes: PALMA_LINHA }, // vida
    { pontos: P([naPalma(-40, 98), naPalma(-23, 92), naPalma(0, 86), naPalma(21, 79), naPalma(33, 71)]), opcoes: PALMA_LINHA }, // cabeça
    { pontos: P([naPalma(45, 103), naPalma(30, 108), naPalma(12, 113), naPalma(-5, 117.5), naPalma(-15, 123.5)]), opcoes: PALMA_LINHA }, // coração
    { pontos: P([naPalma(39, 72), naPalma(36.5, 52), naPalma(36.5, 31), naPalma(39.5, 14)]), opcoes: LEVE }, // hipotenar
    { pontos: P([pele(-7, 6), pele(-8, 32), pele(-9.5, 62), pele(-11, 96)]), opcoes: TENDAO }, // tendão 1
    { pontos: P([pele(7, 8), pele(8, 30), pele(9, 54), pele(10, 82)]), opcoes: TENDAO }, // tendão 2
    { pontos: P([pele(39, 6), pele(42, 12), pele(43.5, 19)]), opcoes: LEVE }, // ulna
  ];

  // vincos: quatro por dedo e dois no polegar (t, abertura, curvatura)
  const VINCO = { peso: 1.05, entrada: 3, saida: 4, minimo: 0.15, opacidade: 0.78, passos: 6 };
  const vinco = (dd, t, abertura, curvatura) => {
    const c = dd.pontoEm(t), m = dd.meia(t) * abertura, l = dd.lado(t), d = dd.direcao(t);
    return { pontos: P([mais(c, l, -m), mais(c, d, curvatura), mais(c, l, m)]), opcoes: VINCO };
  };
  const vincos = [];
  for (const dd of dedos) {
    vincos.push(vinco(dd, 0.035, 0.6, 2.2), vinco(dd, 0.42, 0.55, 1.6), vinco(dd, 0.447, 0.4, 1.4), vinco(dd, 0.75, 0.48, 1.2));
  }
  vincos.push(vinco(polegar, 0.52, 0.5, 2), vinco(polegar, 0.548, 0.34, 1.6));
  // hachuras curtas na borda do mínimo (a sombra do lado de fora)
  const HACHURA = { peso: 0.85, entrada: 2, saida: 2.5, minimo: 0.2, opacidade: 0.42, passos: 3 };
  const bordaEm = (v) => {
    for (let i = 0; i < hipotenar.length - 1; i++) {
      const a = hipotenar[i], b = hipotenar[i + 1];
      if (v <= b[1]) return lerp(a[0], b[0], clamp((v - a[1]) / (b[1] - a[1])));
    }
    return hipotenar[hipotenar.length - 1][0];
  };
  for (let j = 0; j < 5; j++) {
    const v = 30 + j * 13;
    const u = bordaEm(v);
    vincos.push({ pontos: P([naPalma(u - 3, v + 3), naPalma(u - 7.5, v - 1.5), naPalma(u - 10, v - 5.5)]), opcoes: HACHURA });
  }

  // sombra própria: uma faixa do lado do mínimo, do braço até a palma
  const faixaFora = [...bordaMinimo, ...hipotenar.slice(0, 5)];
  const faixaDentro = [
    ...bordaMinimo.map((_, i) => {
      const L = alturaDoBraco(i);
      return braco(L, meioBraco(L) * 0.58);
    }),
    ...hipotenar.slice(0, 5).map(([u, v]) => naPalma(u - 19, v)),
  ];
  const sombra = {
    pontos: P([...faixaFora, ...faixaDentro.reverse()]),
    de: P([braco(110, meioBraco(110) * 0.58)])[0],
    para: P([braco(110, meioBraco(110))])[0],
  };

  // O akai ito: uma volta sobre o pulso (de um lado do braço ao outro), o nó
  // em cima pesando para o lado do mínimo e as duas pontas caindo pela
  // gravidade: a curta deita sobre o pulso; a longa pende fora do braço, de
  // onde o fio do caminho continua.
  const L_FIO = 21;
  const ALTO = 25; // quanto o pulso salta do plano
  const A_NO = 68 * GRAU;
  const anel = (a) => {
    const L = L_FIO + 3.5 * Math.cos(a);
    return braco(L, (meioBraco(L) + 1.2) * Math.cos(a), ALTO * Math.sin(a));
  };
  const volta = [];
  for (let i = 0; i < 27; i++) volta.push(anel(Math.PI * (1 - i / 26)));
  const no = P([anel(A_NO)])[0];
  const CURTA = [[0, 2], [3.5, 10], [8.5, 19.5], [12, 30], [12.5, 40]];
  const LONGA = [[1.5, 0.5], [11, 4.5], [21.5, 12.5], [29, 23.5], [32.5, 36], [33.5, 47], [33, 56]];
  const cordao = {
    volta: P(volta),
    no,
    curta: CURTA.map(([x, y]) => [no[0] + x, no[1] + y]),
    longa: LONGA.map(([x, y]) => [no[0] + x, no[1] + y]),
  };

  return { tracos, silhueta, linhas, vincos, sombra, cordao };
}

/* ---- o desenho em SVG: pena, cordão, nó ------------------------------------------- */

function noSvg(tag, attrs, pai) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v !== null && v !== undefined) e.setAttribute(k, String(v));
  }
  if (pai) pai.append(e);
  return e;
}

const num = (v) => v.toFixed(1);

/** Path SVG fechado pelos pontos (Catmull-Rom). */
function caminhoFechado(pontos, passos = 4) {
  return `M${catmull(pontos, passos).map((p) => `${num(p[0])} ${num(p[1])}`).join('L')}Z`;
}

/**
 * Um traço de pena: contorno fechado de largura variável. A pressão oscila em
 * três senos (fase sorteada por traço), a entrada e a saída afinam e `afinar`
 * estreita o fim. desenhar(p) revela de 0 a 1 pelo comprimento.
 */
function criarTraco(pontos, opcoes, pai, numero) {
  const { peso = 2.2, entrada = 10, saida = 14, minimo = 0.22, opacidade = 0.94, passos = 7, afinar = 1 } = opcoes || {};
  const linha = catmull(pontos, passos);
  const n = linha.length;
  const acum = new Float64Array(n);
  for (let i = 1; i < n; i++) acum[i] = acum[i - 1] + Math.hypot(linha[i][0] - linha[i - 1][0], linha[i][1] - linha[i - 1][1]);
  const total = acum[n - 1] || 1;
  const sorte = semente(numero);
  const f0 = sorte() * Math.PI * 2;
  const f1 = sorte() * Math.PI * 2;
  const f2 = sorte() * Math.PI * 2;
  const esq = new Float64Array(n * 2);
  const dir = new Float64Array(n * 2);
  for (let i = 0; i < n; i++) {
    const s = acum[i];
    const pressao = 0.8 + 0.16 * Math.sin(0.045 * s + f0) + 0.08 * Math.sin(0.13 * s + f1) + 0.05 * Math.sin(0.31 * s + f2);
    const ent = minimo + (1 - minimo) * suave(s / entrada);
    const sai = minimo * 0.5 + (1 - minimo * 0.5) * suave((total - s) / saida);
    const meia = (peso / 2) * pressao * ent * sai * lerp(1, afinar, s / total);
    const a = linha[Math.max(0, i - 1)];
    const b = linha[Math.min(n - 1, i + 1)];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nx = (-(b[1] - a[1]) / l) * meia;
    const ny = ((b[0] - a[0]) / l) * meia;
    esq[i * 2] = linha[i][0] + nx;
    esq[i * 2 + 1] = linha[i][1] + ny;
    dir[i * 2] = linha[i][0] - nx;
    dir[i * 2 + 1] = linha[i][1] - ny;
  }
  const caminho = noSvg('path', { fill: TINTA, 'fill-opacity': opacidade }, pai);
  let atual = -1;

  function desenhar(p) {
    const q = clamp(Number(p) || 0);
    if (q === atual) return;
    atual = q;
    if (q <= 0 || n < 2) {
      caminho.setAttribute('d', '');
      return;
    }
    const corte = q * total;
    let k = 1;
    while (k < n - 1 && acum[k] < corte) k++;
    const t = clamp((corte - acum[k - 1]) / ((acum[k] - acum[k - 1]) || 1));
    const ida = [];
    const volta = [];
    for (let i = 0; i < k; i++) {
      ida.push(`${num(esq[i * 2])} ${num(esq[i * 2 + 1])}`);
      volta.push(`${num(dir[i * 2])} ${num(dir[i * 2 + 1])}`);
    }
    const ponta = (lado) => `${num(lerp(lado[(k - 1) * 2], lado[k * 2], t))} ${num(lerp(lado[(k - 1) * 2 + 1], lado[k * 2 + 1], t))}`;
    ida.push(ponta(esq));
    volta.push(ponta(dir));
    caminho.setAttribute('d', `M${ida.join('L')}L${volta.reverse().join('L')}Z`);
  }

  desenhar(0);
  return { caminho, desenhar, comprimento: total };
}

/**
 * O cordão vermelho trançado: sombra, corpo, a trama em espinha, um brilho e
 * três luzes que correm por ele (correrLuz). desenhar(p) o revela de 0 a 1.
 */
function criarCordao(pontos, { peso = 4.6, passos = 6 } = {}, pai) {
  const linha = catmull(pontos, passos);
  const n = linha.length;
  const acum = new Float64Array(n);
  for (let i = 1; i < n; i++) acum[i] = acum[i - 1] + Math.hypot(linha[i][0] - linha[i - 1][0], linha[i][1] - linha[i - 1][1]);
  const total = acum[n - 1] || 1;
  const d = `M${linha.map((p) => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join('L')}`;

  const grupo = noSvg('g', { class: 'mao-fio' }, pai);
  const tracado = { d, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', pathLength: 1 };
  const sombra = noSvg('path', { ...tracado, stroke: TINTA, 'stroke-opacity': 0.16, 'stroke-width': peso + 1.6, transform: 'translate(0.8 1.6)' }, grupo);
  const corpo = noSvg('path', { ...tracado, stroke: FIO, 'stroke-width': peso }, grupo);
  const trama = noSvg('path', { fill: 'none', stroke: FIO_ESCURO, 'stroke-opacity': 0.85, 'stroke-width': 0.2 * peso, 'stroke-linecap': 'round' }, grupo);
  const brilho = noSvg('path', { ...tracado, stroke: FIO_CLARO, 'stroke-opacity': 0.75, 'stroke-width': 0.22 * peso, transform: 'translate(-0.5 -0.9)' }, grupo);
  const luzes = [['#ffc77a', 2.1, 0.4], ['#ffe3b0', 1.1, 0.7], ['#fffaf0', 0.4, 1]]
    .map(([cor, k, opacidade]) => noSvg('path', { ...tracado, stroke: cor, 'stroke-opacity': opacidade, 'stroke-width': k * peso, display: 'none' }, grupo));

  const pontoEm = (s) => {
    let i = 1;
    while (i < n - 1 && acum[i] < s) i++;
    const a = linha[i - 1];
    const b = linha[i];
    const t = clamp((s - acum[i - 1]) / ((acum[i] - acum[i - 1]) || 1));
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return { x: lerp(a[0], b[0], t), y: lerp(a[1], b[1], t), nx: -(b[1] - a[1]) / l, ny: (b[0] - a[0]) / l };
  };
  // A trama: risquinhos em diagonal, de um lado ao outro, como fio torcido.
  const passo = 0.55 * peso;
  const meia = 0.46 * peso;
  const recuo = 0.42 * peso;
  const marcas = [];
  for (let s = passo; s < total - passo * 0.5; s += passo) {
    const a = pontoEm(s);
    const b = pontoEm(Math.max(0, s - recuo));
    marcas.push({ u: s / total, d: `M${(a.x + a.nx * meia).toFixed(2)} ${(a.y + a.ny * meia).toFixed(2)}L${(b.x - b.nx * meia).toFixed(2)} ${(b.y - b.ny * meia).toFixed(2)}` });
  }

  let atual = -1;
  let mostradas = -1;
  function desenhar(p) {
    const q = clamp(Number(p) || 0);
    if (q === atual) return;
    atual = q;
    for (const e of [sombra, corpo, brilho]) {
      if (q <= 0.001) {
        e.setAttribute('display', 'none');
        continue;
      }
      e.removeAttribute('display');
      // Inteiro, sem tracejado: o arredondamento do pathLength não deixa fresta.
      e.setAttribute('stroke-dasharray', q >= 1 ? 'none' : '1 1');
      e.setAttribute('stroke-dashoffset', (1 - q).toFixed(4));
    }
    let k = 0;
    while (k < marcas.length && marcas[k].u <= q) k++;
    if (k !== mostradas) {
      mostradas = k;
      trama.setAttribute('d', marcas.slice(0, k).map((m) => m.d).join(''));
    }
  }

  /** Uma luz curta corre pelo cordão: p de 0 a 1; fora disso, apagada. */
  function correrLuz(p = 0, tamanho = 0.32) {
    const ativa = p > 0 && p < 1;
    luzes.forEach((e, i) => {
      if (!ativa) {
        e.setAttribute('display', 'none');
        return;
      }
      const L = tamanho * (1 - 0.3 * i);
      e.removeAttribute('display');
      e.setAttribute('stroke-dasharray', `${L.toFixed(4)} 2`);
      e.setAttribute('stroke-dashoffset', (L - p * (1 + tamanho)).toFixed(4));
    });
  }

  desenhar(0);
  return { grupo, desenhar, correrLuz, ponta: linha[n - 1], linha, acum, total };
}

/**
 * O <svg> da mão inteira. Camadas, de baixo para cima: a aguada (papel branco,
 * tinta de pele recortada pela silhueta e a sombra do braço), o manuscrito, a
 * tinta (contorno, linhas e vincos), a luz do nó, o cordão com o nó e as brasas.
 */
function montarDesenho(amb) {
  const geo = geometriaMao();
  const raiz = noSvg('svg', { class: 'mao-desenho', viewBox: `0 0 ${VB_L} ${VB_A}`, 'aria-hidden': 'true', focusable: 'false' });
  const defs = noSvg('defs', null, raiz);
  const gradiente = (tipo, id, paradas, attrs) => {
    const g = noSvg(tipo, { id, ...attrs }, defs);
    for (const [offset, cor, opacidade] of paradas) noSvg('stop', { offset, 'stop-color': cor, 'stop-opacity': opacidade }, g);
  };
  gradiente('radialGradient', 'mao-brilho', [[0, '#fff6dc', 0.95], [0.28, '#ffb45e', 0.6], [0.62, '#ff404e', 0.2], [1, '#ff404e', 0]]);
  gradiente('radialGradient', 'mao-brasa', [[0, '#fffaf0', 1], [0.22, '#f6dca6', 1], [0.5, '#ffb45e', 0.78], [0.74, '#e3283c', 0.32], [1, FIO, 0]]);
  const silhueta = caminhoFechado(geo.silhueta);
  const recorte = noSvg('clipPath', { id: 'mao-recorte' }, defs);
  noSvg('path', { class: 'mao-recorte-forma', d: silhueta }, recorte);
  const { de, para } = geo.sombra;
  gradiente('linearGradient', 'mao-sombra', [[0, '#d49f8d', 0], [0.55, '#d49f8d', 0.1], [1, '#cf9684', 0.34]], {
    gradientUnits: 'userSpaceOnUse', x1: num(de[0]), y1: num(de[1]), x2: num(para[0]), y2: num(para[1]),
  });

  // A aguada entra depois do contorno (o CSS não conhece este grupo: o JS anima).
  const fundo = noSvg('g', { class: 'mao-fundo' }, raiz);
  fundo.style.opacity = '0';
  noSvg('path', { class: 'mao-silhueta', d: silhueta, fill: '#f7ecd6' }, fundo);
  const dentro = noSvg('g', { 'clip-path': 'url(#mao-recorte)' }, fundo);
  noSvg('path', { class: 'mao-aguada', d: silhueta, fill: '#f3d3c8', 'fill-opacity': 0.36, transform: 'translate(2.6 3.4)' }, dentro);
  noSvg('path', { class: 'mao-sombra-braco', d: caminhoFechado(geo.sombra.pontos), fill: 'url(#mao-sombra)' }, dentro);
  noSvg('path', { class: 'mao-aguada-borda', d: silhueta, fill: 'none', stroke: '#dcaa9b', 'stroke-opacity': 0.42, 'stroke-width': 1, transform: 'translate(2.6 3.4)' }, fundo);

  const escrito = noSvg('g', { class: 'mao-escrito' }, raiz);

  // Cada traço tem a sua semente (11, 12, 13...): a pressão nunca repete.
  const tinta = noSvg('g', { class: 'mao-tinta' }, raiz);
  let numero = 11;
  const tracar = (lista) => lista.map(({ pontos, opcoes }) => criarTraco(pontos, opcoes, tinta, numero++));
  const contorno = tracar(geo.tracos);
  const detalhes = tracar(geo.linhas);
  const vincos = tracar(geo.vincos);

  // A luz do nó: uma faixa morna sobre a volta e um disco no nó (só opacidade).
  const [nx, ny] = geo.cordao.no;
  const v = geo.cordao.volta;
  const a = v[0];
  const b = v[v.length - 1];
  const topo = v[Math.floor(v.length / 2)];
  const cx = ((a[0] + b[0]) / 2 + topo[0]) / 2;
  const cy = ((a[1] + b[1]) / 2 + topo[1]) / 2;
  const luz = noSvg('g', { class: 'mao-luz', opacity: 0 }, raiz);
  noSvg('ellipse', {
    class: 'mao-luz-faixa', cx: num(cx), cy: num(cy), rx: num(Math.hypot(b[0] - a[0], b[1] - a[1]) / 2 + 8), ry: 19,
    fill: 'url(#mao-brilho)', transform: `rotate(${num(Math.atan2(b[1] - a[1], b[0] - a[0]) / GRAU)} ${num(cx)} ${num(cy)})`,
  }, luz);
  noSvg('circle', { class: 'mao-luz-no', cx: num(nx), cy: num(ny), r: 48, fill: 'url(#mao-brilho)' }, luz);

  const cordaoG = noSvg('g', { class: 'mao-cordao' }, raiz);
  const volta = criarCordao(geo.cordao.volta, { peso: 5.6, passos: 3 }, cordaoG);
  const caudaG = noSvg('g', { class: 'mao-cauda' }, cordaoG);
  const curta = criarCordao(geo.cordao.curta, { peso: 4.6, passos: 6 }, caudaG);
  const longa = criarCordao(geo.cordao.longa, { peso: 4.9, passos: 6 }, caudaG);

  // O nó: duas alcinhas de cordão e o miolo apertado (nasce em escala 0).
  const noG = noSvg('g', { class: 'mao-no' }, cordaoG);
  const alcas = 'M0 0C-3-5-10-5.2-9.6-1-9.2 2.6-3.6 2.6 0 0M0 0C3.6-4.2 10.2-3.6 9.9.4 9.6 3.8 3.6 3.2 0 0';
  noSvg('path', { d: alcas, fill: 'none', stroke: FIO_ESCURO, 'stroke-opacity': 0.45, 'stroke-width': 3.6, 'stroke-linecap': 'round', transform: 'translate(0.4 0.8)' }, noG);
  noSvg('path', { d: alcas, fill: 'none', stroke: FIO, 'stroke-width': 2.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, noG);
  noSvg('circle', { r: 2.6, fill: FIO, stroke: FIO_ESCURO, 'stroke-width': 0.8 }, noG);
  noSvg('path', { d: 'M-1.3-1a1.7 1.7 0 0 1 2.1 0', fill: 'none', stroke: FIO_CLARO, 'stroke-width': 0.7, 'stroke-linecap': 'round' }, noG);
  const escalaNo = (s) => noG.setAttribute('transform', `translate(${num(nx)} ${num(ny)}) scale(${Math.max(0, s).toFixed(3)})`);
  escalaNo(0);

  const brasasG = noSvg('g', { class: 'mao-brasas' }, raiz);
  const desenho = {
    raiz, fundo, contorno, detalhes, vincos,
    cordao: { volta, curta, longa, caudaG, no: noG },
    no: geo.cordao.no,
    escalaNo,
    pontaSolta: longa.ponta,
    reduzido: !!amb?.reduzido,
    luz,
    escrito,
    brasas: null,
    angulo: 0, // o balanço das pontas em volta do nó (graus), escrito a cada quadro
  };
  desenho.brasas = criarBrasas(brasasG, { laco: volta, cauda: [curta, longa], no: geo.cordao.no, angulo: () => desenho.angulo }, amb);
  return desenho;
}

/* ---- a escrita na palma ------------------------------------------------------------ */

let medidor = null;
/** Largura de um texto, em em, na fonte manuscrita (peso 600). */
function medirEm(texto) {
  medidor ||= document.createElement('canvas').getContext('2d');
  if (!medidor) return String(texto).length * 0.55;
  medidor.font = `600 100px ${FONTE_ESCRITO}`;
  return medidor.measureText(String(texto)).width / 100;
}

const alturaEm = (linhas) => (linhas - 1) * ENTRELINHA + 0.92;

/**
 * Quebra o texto em 1 a 3 linhas. Em cada número de linhas, o corte que deixa
 * a linha mais larga menor; entre eles, o que dá a letra maior na palma.
 */
function linhasDoEscrito(texto, medir) {
  const palavras = String(texto).split(/\s+/).filter(Boolean);
  let melhor = null;
  for (let n = 1; n <= Math.min(3, palavras.length); n++) {
    let doN = null;
    const cortar = (inicio, resta, linhas) => {
      if (resta === 1) {
        const todas = [...linhas, palavras.slice(inicio).join(' ')];
        const maior = Math.max(0.01, ...todas.map(medir));
        if (!doN || maior < doN.maior) doN = { linhas: todas, maior };
        return;
      }
      for (let fim = inicio + 1; fim <= palavras.length - resta + 1; fim++) {
        cortar(fim, resta - 1, [...linhas, palavras.slice(inicio, fim).join(' ')]);
      }
    };
    cortar(0, n, []);
    const corpo = Math.min(PALMA.largura / doN.maior, PALMA.altura / (alturaEm(n) * PALMA.alto), 40);
    if (!melhor || corpo > melhor.corpo + 1e-6) melhor = { linhas: doN.linhas, corpo };
  }
  return melhor || { linhas: [], corpo: 0 };
}

/** Espera a fonte manuscrita, no máximo 1,5 s (o Safari pode demorar a responder). */
function fonteDoEscrito(texto) {
  if (!texto || typeof document.fonts?.load !== 'function') return Promise.resolve();
  return Promise.race([
    document.fonts.load(`600 40px ${FONTE_ESCRITO}`, texto).catch(() => {}),
    espera(1500),
  ]);
}

/**
 * As letras na palma. Cada uma é um <g> com a matriz da projeção naquele ponto
 * (a letra deita e encurta com a palma), um jitter de semente 41 e uma janela
 * de recorte que cresce da esquerda para a direita, como a ponta da caneta.
 */
function criarEscrito(camada, texto) {
  const { linhas, corpo } = linhasDoEscrito(texto, medirEm);
  if (!linhas.length || !(corpo > 0)) return [];
  const sorte = semente(41);
  const altoBloco = alturaEm(linhas.length) * corpo;
  const folga = 0.14 * corpo;
  const fonte = { 'font-family': FONTE_ESCRITO, 'font-weight': 600, 'font-size': corpo.toFixed(2) };
  const letras = [];
  let n = 0;
  linhas.forEach((linha, li) => {
    const largura = medirEm(linha) * corpo;
    const baseY = -altoBloco / 2 + (0.78 + li * ENTRELINHA) * corpo;
    const caracteres = [...linha];
    let antes = '';
    caracteres.forEach((ch, i) => {
      const x = -largura / 2 + medirEm(antes) * corpo;
      antes += ch;
      const w = -largura / 2 + medirEm(antes) * corpo - x;
      if (/\s/.test(ch)) {
        if (letras.length) letras[letras.length - 1].pausa += 1.1;
        return;
      }
      const sobe = (sorte() - 0.5) * 0.05 * corpo;
      const giro = (sorte() - 0.5) * 5 + PALMA.inclinacao;
      const escala = 1 + (sorte() - 0.5) * 0.08;
      // A linha corre pela palma (u); y da escrita desce para o pulso (−v).
      const u = PALMA.u + x;
      const v = PALMA.v - (baseY + sobe) * PALMA.alto;
      const s0 = projetar(naPalma(u, v));
      const su = projetar(naPalma(u + 1, v));
      const sv = projetar(naPalma(u, v + 1));
      const matriz = [su[0] - s0[0], su[1] - s0[1], s0[0] - sv[0], s0[1] - sv[1], s0[0], s0[1]].map((k) => k.toFixed(4)).join(' ');
      const id = `mao-escrito-${n++}`;
      const g = noSvg('g', { transform: `matrix(${matriz}) scale(1 ${PALMA.alto}) rotate(${giro.toFixed(2)}) scale(${escala.toFixed(4)})` }, camada);
      const clip = noSvg('clipPath', { id, clipPathUnits: 'userSpaceOnUse' }, g);
      const janela = noSvg('rect', { x: (-folga).toFixed(2), y: (-1.1 * corpo).toFixed(2), width: 0, height: (1.55 * corpo).toFixed(2) }, clip);
      const recortado = noSvg('g', { 'clip-path': `url(#${id})` }, g);
      // O halo é a tinta que se espalha um nada na pele.
      noSvg('text', { ...fonte, fill: 'none', stroke: TINTA_ESCRITO, 'stroke-width': (0.075 * corpo).toFixed(2), 'stroke-opacity': 0.2, 'stroke-linejoin': 'round' }, recortado).textContent = ch;
      noSvg('text', { ...fonte, fill: TINTA_ESCRITO, 'fill-opacity': 0.84 }, recortado).textContent = ch;
      const larguraJanela = w + 2 * folga;
      letras.push({
        esforco: 0.55 + 1.1 * (w / corpo),
        pausa: i === caracteres.length - 1 ? 1.7 : 0,
        grupo: g,
        revelar(p) {
          janela.setAttribute('width', (clamp(p) * larguraJanela).toFixed(2));
        },
        inteira() {
          recortado.removeAttribute('clip-path');
          clip.remove();
        },
      });
    });
  });
  return letras;
}

/**
 * A caneta passa letra a letra: o som de caneta no começo de cada uma, a letra
 * revelada em 0,3 s por unidade de esforço, 0,07 s entre letras e as pausas
 * (fim de linha 1,7; espaço 1,1) a 0,16 s cada. No calmo, só uma dissolvência.
 * Devolve a linha do tempo, com `pronto`.
 */
function escreverNaPalma(gsap, { letras, camada, calmo, som }) {
  const tl = gsap.timeline();
  if (calmo) {
    for (const letra of letras) letra.inteira();
    gsap.set(camada, { opacity: 0 });
    tl.to(camada, { opacity: 1, duration: 1.4, ease: 'sine.inOut' }, 0.2).add(nada, 3);
  } else {
    let t = 0.35;
    for (const letra of letras) {
      const d = 0.3 * letra.esforco;
      const o = { p: 0 };
      letra.revelar(0);
      tl.call(() => som?.efeito?.('caneta', { duracao: d }), null, t);
      tl.to(o, { p: 1, duration: d, ease: 'sine.inOut', onUpdate: () => letra.revelar(o.p), onComplete: () => letra.inteira() }, t);
      t += d + 0.07 + 0.16 * letra.pausa;
    }
    tl.add(nada, t + 1.3);
  }
  tl.pronto = comoPromise(tl);
  return tl;
}

/* ---- brasas 2D ------------------------------------------------------------------- */

/**
 * Brasinhas que sobem do cordão (círculos SVG com o gradiente mao-brasa):
 * 72% nascem da volta e 28% das pontas (giradas com o balanço). `taxa` é por
 * segundo; soltar(x, y) acende uma no ponto. Nenhuma no movimento reduzido.
 */
function criarBrasas(camada, fontes, amb) {
  const N = amb?.reduzido ? 0 : amb?.nivel === 'baixo' ? 14 : 34;
  const sorte = semente(23);
  const brasas = [];
  for (let i = 0; i < N; i++) {
    brasas.push({
      el: noSvg('circle', { r: 0, fill: 'url(#mao-brasa)', display: 'none' }, camada),
      viva: false, x: 0, y: 0, vx: 0, vy: 0, idade: 0, vida: 1, r: 1, fase: 0,
    });
  }
  let acumulado = 0;

  const amostrar = (c) => {
    const s = sorte() * c.total;
    let i = 1;
    while (i < c.linha.length - 1 && c.acum[i] < s) i++;
    const a = c.linha[i - 1];
    const b = c.linha[i];
    const t = clamp((s - c.acum[i - 1]) / ((c.acum[i] - c.acum[i - 1]) || 1));
    return [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
  };
  const pontoAoAcaso = () => {
    if (sorte() < 0.72) return amostrar(fontes.laco);
    const [x, y] = amostrar(fontes.cauda[sorte() < 0.5 ? 0 : 1]);
    const a = fontes.angulo() * GRAU;
    const [nx, ny] = fontes.no;
    const dx = x - nx;
    const dy = y - ny;
    return [nx + dx * Math.cos(a) - dy * Math.sin(a), ny + dx * Math.sin(a) + dy * Math.cos(a)];
  };

  const api = {
    taxa: 0,
    soltar(x, y) {
      const b = brasas.find((o) => !o.viva);
      if (!b) return;
      b.viva = true;
      b.x = x;
      b.y = y;
      b.idade = 0;
      b.vida = 1.3 + 1.6 * sorte();
      b.r = 1.1 + 1.9 * sorte();
      b.vx = (sorte() - 0.5) * 9;
      b.vy = -(6 + 12 * sorte());
      b.fase = sorte() * Math.PI * 2;
      b.el.removeAttribute('display');
    },
    atualizar(dt, t) {
      if (!N) return;
      acumulado += api.taxa * dt;
      while (acumulado >= 1) {
        acumulado -= 1;
        const [x, y] = pontoAoAcaso();
        api.soltar(x, y);
      }
      const freio = Math.exp(-0.9 * dt);
      for (const b of brasas) {
        if (!b.viva) continue;
        b.idade += dt;
        const k = b.idade / b.vida;
        if (k >= 1) {
          b.viva = false;
          b.el.setAttribute('display', 'none');
          continue;
        }
        b.vx = b.vx * freio + Math.sin(1.9 * t + b.fase) * 7 * dt;
        b.vy = b.vy * freio - 3 * dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        const alfa = Math.min(1, b.idade / 0.2) * (1 - k) * (0.7 + 0.3 * Math.sin(8 * t + b.fase));
        b.el.setAttribute('cx', num(b.x));
        b.el.setAttribute('cy', num(b.y));
        b.el.setAttribute('r', (b.r * (1 - 0.4 * k) * 2.1).toFixed(2));
        b.el.setAttribute('opacity', clamp(alfa).toFixed(3));
      }
    },
  };
  return api;
}

/* ---- o fio que a câmera segue ------------------------------------------------------ */

/** Câmera de mentira (px) para o fio leve: olhos a 1,5 m, horizonte no meio da tela. */
function criarCameraLeve(mundo) {
  const cam = { x: 0, y: ALTURA_OLHOS, z: 0, focal: 1, largura: 1, altura: 1 };
  cam.ajustar = () => {
    cam.largura = Number(mundo.tamanho?.largura) || innerWidth;
    cam.altura = Number(mundo.tamanho?.altura) || innerHeight;
    cam.focal = cam.altura / 2 / Math.tan((fovPara(cam.largura / cam.altura) * GRAU) / 2);
  };
  cam.projetar = (p, saida = {}) => {
    const prof = cam.z - p.z;
    const k = cam.focal / Math.max(0.05, prof);
    saida.px = cam.largura / 2 + (p.x - cam.x) * k;
    saida.py = cam.altura / 2 + (cam.y - p.y) * k;
    saida.prof = prof;
    return saida;
  };
  cam.desprojetar = (px, py, prof) => {
    const k = prof / cam.focal;
    return { x: cam.x + (px - cam.largura / 2) * k, y: cam.y - (py - cam.altura / 2) * k, z: cam.z - prof };
  };
  cam.ajustar();
  return cam;
}

/**
 * O fio do caminho, recalculado a cada quadro: cai do pulso (na tela, a 0,9 m
 * da lente) até o chão 1,4 m à frente, segue o caminho de 0,5 em 0,5 m e sobe
 * até a âncora (a mão dele, a carta, ou nada). No mergulho o fio voa (`ar`) e
 * a ponta é levada em metros de caminho (`ponta(s)`); `ponta(null)` devolve o
 * controle ao fio.progresso de quem chama. Para sozinho quando outra peça
 * assume estado.fio, e solta a ponta quando a cena final abre a carta.
 */
function criarSeguidor(ctx, { z0, x0, pulsoPx, cam, aoParar }) {
  const { mundo, estado, diretor, amb } = ctx;
  const ok = !!mundo.ok;
  const leve = ok ? null : criarCameraLeve(mundo);
  const ar = { k: 0, assentar: 0 };

  // Comprimento do caminho no chão (com o desvio) até s metros.
  const nG = Math.ceil((S_CARTA + 4) / PASSO_G);
  const tabelaG = new Float64Array(nG + 1);
  for (let i = 1; i <= nG; i++) {
    const s = i * PASSO_G;
    tabelaG[i] = tabelaG[i - 1] + Math.hypot(PASSO_G, desvio(s) - desvio(s - PASSO_G));
  }
  const G = (s) => {
    const x = clamp(s / PASSO_G, 0, nG);
    const i = Math.min(nG - 1, Math.floor(x));
    return lerp(tabelaG[i], tabelaG[i + 1], x - i);
  };
  // Com `assentar` 0 todo o fio está no ar; com 1, todo no chão, de perto para longe.
  const vooEm = (s) => ar.k * (1 - suave((ar.assentar * (S_CARTA + 8) - 4 - s) / 4));

  let fio = null;
  let pontaS = null;
  let ancoraExtra = null;
  let soltando = false;
  let soltura = 0;
  let duracaoSoltar = 1.8;
  let alcance = 0;
  let parado = false;
  let pararQuadro = null;
  let pararTamanho = null;
  let pararDiretor = null;

  // Tudo pré-alocado: montar() roda a cada quadro.
  const pts = Array.from({ length: MAX_PONTOS }, () => ({ x: 0, y: 0, z: 0, px: 0, py: 0, prof: 1, s: 0, tela: false }));
  const cum = new Float64Array(MAX_PONTOS);
  const pares = Array.from({ length: MAX_PONTOS }, () => [0, 0]);
  const lista = [];
  const perfil = [];
  const extras = { perfil, sombraDe: 0.12 };
  let n = 0;

  const por = (x, y, z, s) => {
    if (n >= MAX_PONTOS) return;
    const p = pts[n++];
    p.x = x;
    p.y = y;
    p.z = z;
    p.s = s;
    p.tela = false;
  };
  const porNaTela = (px, py, prof, s) => {
    if (n >= MAX_PONTOS) return;
    const p = pts[n++];
    p.px = px;
    p.py = py;
    p.prof = prof;
    p.s = s;
    p.tela = true;
  };

  function lerAncora() {
    if (ancoraExtra && !soltando && Number.isFinite(ancoraExtra.x)) return ancoraExtra;
    const env = estado.envelope;
    // A carta escondida (até o clarão do encontro) não segura o fio no ar.
    if (!env || (ok && env.grupo?.visible === false)) return null;
    let a = null;
    try {
      a = env.ancoraFio || null;
    } catch {
      a = null;
    }
    if (!a) return null;
    if (ok) return Number.isFinite(a.x) ? a : null;
    return Number.isFinite(a.px) && Number.isFinite(a.py) ? a : null;
  }

  function calcular() {
    n = 0;
    const rig = mundo.rig.position;
    const sCam = z0 - rig.z;
    const sT = Math.min(sCam + TOQUE, S_CARTA - 1);
    alcance = G(sT);
    if (leve) {
      leve.x = x0 + (cam?.x || 0);
      leve.z = rig.z;
    }

    // 1. o começo: o pulso na tela, levado ao mundo a 0,9 m da lente
    const largura = Number(mundo.tamanho?.largura) || innerWidth;
    const altura = Number(mundo.tamanho?.altura) || innerHeight;
    const [px0, py0] = pulsoPx();
    const px = clamp(px0, -0.3 * largura, 1.3 * largura);
    const py = Math.min(py0, 1.2 * altura);
    let inicio;
    if (ok) {
      // As cartas do chão inclinam a câmera para baixo depois deste ouvinte:
      // a mesma inclinação aqui, para o pulso bater com o quadro desenhado.
      const olharChao = Number(estado.olharChao) || 0;
      if (olharChao) mundo.camera.rotation.x -= olharChao;
      inicio = mundo.telaParaMundo((px / largura) * 2 - 1, -((py / altura) * 2 - 1), PROF_PULSO);
      if (olharChao) {
        mundo.camera.rotation.x += olharChao;
        mundo.camera.updateMatrixWorld();
      }
    } else {
      inicio = leve.desprojetar(px, py, PROF_PULSO);
    }

    // 2. a queda: Bézier quadrática até o chão, chegando na direção do caminho
    const v = vooEm(sT);
    const tx = x0 + desvio(sT) + v * ladoAr(sT);
    const tz = z0 - sT;
    const yT = 0.02 + v * alturaAr(sT);
    let dX = desvio(sT + 0.05) - desvio(sT - 0.05);
    let dZ = -0.1;
    const dl = Math.hypot(dX, dZ);
    dX /= dl;
    dZ /= dl;
    const alc = Math.hypot(tx - inicio.x, tz - inicio.z);
    const cx = tx - dX * alc * 0.55;
    const cz = tz - dZ * alc * 0.55;
    const queda = inicio.y - yT;
    for (let i = 0; i < QUEDA; i++) {
      const u = i / QUEDA;
      const h = u ** 0.95;
      const a = (1 - h) * (1 - h);
      const b = 2 * (1 - h) * h;
      const c = h * h;
      por(a * inicio.x + b * cx + c * tx, yT + queda * (1 - u) ** 1.8, a * inicio.z + b * cz + c * tz, sT * u);
    }

    // 3. o chão (ou o ar, no mergulho), num grade fixa no mundo: o fio não "nada"
    por(tx, yT, tz, sT);
    for (let s = (Math.floor(sT / 0.5) + 1) * 0.5; s < FIM_CHAO; s += 0.5) {
      if (s - sT < 0.2) continue;
      const vs = vooEm(s);
      por(x0 + desvio(s) + vs * ladoAr(s), 0.02 + vs * alturaAr(s), z0 - s, s);
    }
    if (FIM_CHAO - sT > 0.01) {
      const vs = vooEm(FIM_CHAO);
      por(x0 + desvio(FIM_CHAO) + vs * ladoAr(FIM_CHAO), 0.02 + vs * alturaAr(FIM_CHAO), z0 - FIM_CHAO, FIM_CHAO);
    }

    // 4. a subida até a âncora: presa, ela sobe e chega de cima (o peso do fio);
    //    solta, deita no chão em direção a ela
    const a = lerAncora();
    const gx = x0 + desvio(FIM_CHAO);
    const gz = z0 - FIM_CHAO;
    const k = suave(soltura);
    if (a && ok) {
      const L = gx - a.x;
      for (let i = 1; i <= 5; i++) {
        const f = i / 5;
        const zPresa = gz + (a.z - gz) * (1 - (1 - f) ** 2);
        const zSolta = gz + (a.z - gz) * f;
        por(gx - L * f, lerp(0.02 + (a.y - 0.02) * f * f, 0.02, k), lerp(zPresa, zSolta, k), FIM_CHAO + (S_CARTA - FIM_CHAO) * f);
      }
    } else if (a) {
      const g = leve.projetar({ x: gx, y: 0.02, z: gz });
      for (let i = 1; i <= 5; i++) {
        const f = i / 5;
        porNaTela(lerp(g.px, a.px, suave(f)), lerp(lerp(g.py, a.py, f * f), g.py, k), Math.max(0.2, g.prof), FIM_CHAO + (S_CARTA - FIM_CHAO) * f);
      }
    } else if (soltura > 0) {
      for (let s = FIM_CHAO + 0.6; s <= S_CARTA + 2.5 + 1e-6; s += 0.6) por(x0 + desvio(s), 0.02, z0 - s, s);
    }
  }

  // A lista para o fio, as distâncias acumuladas e, no leve, a largura em px.
  function preparar() {
    lista.length = 0;
    for (let i = 0; i < n; i++) lista.push(pts[i]);
    cum[0] = 0;
    if (ok) {
      for (let i = 1; i < n; i++) {
        cum[i] = cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y, pts[i].z - pts[i - 1].z);
      }
      return;
    }
    for (let i = 0; i < n; i++) {
      if (!pts[i].tela) leve.projetar(pts[i], pts[i]);
    }
    for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + Math.hypot(pts[i].px - pts[i - 1].px, pts[i].py - pts[i - 1].py);
    const total = cum[n - 1] || 1;
    perfil.length = 0;
    for (let i = 0; i < n; i++) {
      const largM = i < QUEDA ? lerp(LARGURAS.inicio, LARGURAS.chao, i / QUEDA) : LARGURAS.chao;
      const prof = pts[i].prof;
      pares[i][0] = cum[i] / total;
      pares[i][1] = clamp((largM * leve.focal) / Math.max(0.2, prof), 1.3, 9) * (1 - 0.92 * suave((prof - 6.5) / 3.5));
      perfil.push(pares[i]);
    }
    extras.sombraDe = clamp(cum[Math.min(QUEDA, n - 1)] / total);
  }

  /** A posição da ponta, em metros de caminho, vira fração da polilinha. */
  function fracaoDe(s) {
    const total = cum[n - 1];
    if (!(total > 0) || s <= pts[0].s) return 0;
    for (let i = 1; i < n; i++) {
      if (pts[i].s >= s) {
        const s0 = pts[i - 1].s;
        const s1 = pts[i].s;
        return clamp(lerp(cum[i - 1], cum[i], s1 > s0 ? (s - s0) / (s1 - s0) : 1) / total);
      }
    }
    return 1;
  }

  function aplicar() {
    if (ok) {
      fio.definirCurva(lista);
      // A torção fica presa ao mundo: o começo do fio anda com ela.
      fio.fase(alcance - cum[Math.min(QUEDA, n - 1)]);
    } else {
      fio.definirCurva(lista, extras);
    }
    if (pontaS !== null) fio.progresso(fracaoDe(pontaS));
  }

  function montar() {
    calcular();
    preparar();
    aplicar();
  }

  function quadroDoFio(dt) {
    if (parado) return;
    if (estado.fio !== fio) {
      parar();
      return;
    }
    if (soltando) soltura = Math.min(1, soltura + dt / duracaoSoltar);
    montar();
    if (soltando && soltura >= 1) parar();
  }

  function soltar(duracao = 1.8) {
    if (soltando || parado) return;
    soltando = true;
    duracaoSoltar = Math.max(0.05, (Number(duracao) || 1.8) / Math.max(0.1, Number(amb?.rapido) || 1));
  }

  function parar() {
    if (parado) return;
    parado = true;
    for (const f of [pararQuadro, pararTamanho, pararDiretor]) {
      if (typeof f === 'function') f();
    }
    aoParar?.();
  }

  function criar() {
    if (fio) return fio;
    calcular();
    preparar();
    fio = criarFio(mundo, {
      curva: lista,
      largura: LARGURAS.chao,
      larguraInicio: LARGURAS.inicio,
      larguraFim: LARGURAS.fim,
      crescerEm: 1.7,
      afinarEm: 0.9,
      ...(ok ? {} : extras),
    });
    if (ok) {
      mundo.cena.add(fio.objeto);
      fio.fase(alcance - cum[Math.min(QUEDA, n - 1)]);
    }
    pararQuadro = mundo.aoQuadro(quadroDoFio);
    if (leve) pararTamanho = mundo.aoRedimensionar?.(() => leve.ajustar());
    // A cena final abre a carta: o laço se desfaz e o fio cai no chão.
    pararDiretor = diretor?.aoMudar?.((cena, etapa) => {
      if (cena === 'final' && etapa === 'carta-abrindo') soltar();
    });
    return fio;
  }

  return {
    criar,
    soltar,
    parar,
    ar,
    ancorar(v) {
      ancoraExtra = v || null;
    },
    get fio() {
      return fio;
    },
    get alcance() {
      return alcance;
    },
    ponta(s) {
      pontaS = s === null || s === undefined || !Number.isFinite(Number(s)) ? null : Number(s);
    },
    get pontaS() {
      return pontaS;
    },
  };
}

/** 22 pétalas deitadas ao longo do caminho (uma InstancedMesh; aparecem no toque). */
function petalasNoChao(mundo, { z0, x0 }) {
  const THREE = mundo.THREE;
  const forma = new THREE.Shape();
  forma.moveTo(0, -0.5);
  forma.bezierCurveTo(0.46, -0.32, 0.5, 0.2, 0.14, 0.5);
  forma.quadraticCurveTo(0, 0.4, -0.14, 0.5);
  forma.bezierCurveTo(-0.5, 0.2, -0.46, -0.32, 0, -0.5);
  const geometria = new THREE.ShapeGeometry(forma, 6);
  geometria.rotateX(-Math.PI / 2);
  geometria.scale(0.011, 1, 0.014);
  const material = new THREE.MeshBasicMaterial({ color: 0xb3123a, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false });
  const malha = new THREE.InstancedMesh(geometria, material, 22);
  const sorte = semente(2212);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const escala = new THREE.Vector3();
  for (let i = 0; i < 22; i++) {
    const s = 3 + (i / 22) * 26.75 + 0.5 * sorte();
    p.set(x0 + desvio(s) + (sorte() - 0.5) * 0.22, 0.025 + 0.004 * sorte(), z0 - s);
    e.set((sorte() - 0.5) * 1.6, sorte() * Math.PI * 2, (sorte() - 0.5) * 1.2, 'YXZ');
    escala.setScalar(2.2 + 1.1 * sorte());
    malha.setMatrixAt(i, m.compose(p, q.setFromEuler(e), escala));
  }
  malha.instanceMatrix.needsUpdate = true;
  malha.name = 'petalas-chao';
  malha.renderOrder = 5;
  malha.frustumCulled = false;
  malha.visible = false;
  malha.userData.descartar = () => {
    malha.parent?.remove(malha);
    geometria.dispose();
    material.dispose();
    malha.dispose?.();
  };
  return malha;
}

/* ---- coreografias ------------------------------------------------------------------- */

/**
 * O desenho: a mão sobe e assenta (3 s) enquanto a pena passa o contorno (12
 * traços, ~300 unidades por segundo, cada um começando antes do anterior
 * acabar), a aguada entra, depois as linhas, os vincos, a volta do fio, o nó e
 * as duas pontas. Resolve em tCordao + 1,0 s (o botão espera por isso). Com a
 * foto, só a entrada. No calmo, tudo junto em dissolvência, sem deslocamento.
 */
function desenharMao(gsap, { pose, desenho, calmo }) {
  const tl = gsap.timeline();
  let fim = 0;
  const tracar = (traco, duracao, ease, t) => {
    const o = { p: 0 };
    tl.to(o, { p: 1, duration: duracao, ease, onUpdate: () => traco.desenhar(o.p) }, t);
  };

  if (!desenho) {
    if (calmo) {
      pose.y = 0;
      pose.rot = 0;
      tl.to(pose, { opacidade: 1, duration: 1, ease: 'none' }, 0);
      fim = 1;
    } else {
      tl.to(pose, { opacidade: 1, duration: 1, ease: 'sine.inOut' }, 0)
        .to(pose, { y: 0, rot: 0, duration: 2.2, ease: curvas.branco.entrar }, 0.18);
      fim = 2.38;
    }
  } else if (calmo) {
    pose.y = 0;
    pose.rot = 0;
    tl.to(pose, { opacidade: 1, duration: 0.9, ease: 'none' }, 0);
    for (const traco of [...desenho.contorno, ...desenho.detalhes, ...desenho.vincos]) tracar(traco, 0.9, 'none', 0);
    tl.to(desenho.fundo, { opacity: 1, duration: 0.9, ease: 'none' }, 0);
    tracar(desenho.cordao.volta, 0.6, 'none', 0.3);
    tl.call(() => desenho.escalaNo(ESCALA_NO), null, 0.3);
    tracar(desenho.cordao.curta, 0.4, 'none', 0.5);
    tracar(desenho.cordao.longa, 0.5, 'none', 0.5);
    tl.to(pose, { balanco: 1, duration: 0.8, ease: 'none' }, 0.6);
    fim = 1;
  } else {
    tl.to(pose, { opacidade: 1, duration: 0.4, ease: 'sine.out' }, 0)
      .to(pose, { y: 0, rot: 0, duration: 3, ease: curvas.branco.entrar }, 0);
    const { contorno, detalhes, vincos, cordao } = desenho;
    let t = 0.15;
    contorno.forEach((traco, i) => {
      const d = clamp(traco.comprimento / 300, 0.32, 1.25);
      const ease = i < 2 || i === contorno.length - 1 ? curvas.branco.entrar : 'power1.inOut';
      tracar(traco, d, ease, t);
      t += d * (i === 0 ? 0.3 : 0.62);
    });
    const fimContorno = t + 0.3;
    tl.to(desenho.fundo, { opacity: 1, duration: 1.8, ease: 'sine.inOut' }, Math.max(0.4, fimContorno - 1.8));
    let t2 = fimContorno - 0.5;
    for (const traco of detalhes) {
      const d = clamp(traco.comprimento / 255, 0.28, 0.75);
      tracar(traco, d, 'power1.inOut', t2);
      t2 += 0.35 * d;
    }
    vincos.forEach((traco, i) => tracar(traco, 0.22, 'power1.out', t2 - 0.2 + i * 0.035));
    const tCordao = t2 + vincos.length * 0.035 + 0.05;
    tracar(cordao.volta, 0.85, curvas.branco.camera, tCordao);
    const no = { s: 0 };
    tl.to(no, { s: ESCALA_NO, duration: 0.5, ease: curvas.branco.entrar, onUpdate: () => desenho.escalaNo(no.s) }, tCordao + 0.72);
    tracar(cordao.curta, 0.35, 'power1.out', tCordao + 0.82);
    tracar(cordao.longa, 0.7, 'power1.inOut', tCordao + 0.86);
    // As pontas caem com um tranco e balançam ao vento.
    tl.fromTo(pose, { caudaKick: 14 }, { caudaKick: 0, duration: 2.4, ease: curvas.branco.entrar, immediateRender: false }, tCordao + 0.9);
    tl.to(pose, { balanco: 1, duration: 2, ease: 'sine.inOut' }, tCordao + 1.2);
    fim = tCordao + 1;
  }

  return new Promise((resolve) => {
    tl.call(resolve, null, fim);
    tl.eventCallback('onInterrupt', resolve);
  });
}

/**
 * O instante em que ela vê o fio: as pétalas quase param e o foco vem para a
 * mão, a mão chega um pouco mais perto e a câmera olha mais para baixo; o nó
 * acende, a luz corre pela volta e pelas pontas e as brasas sobem. Com a foto,
 * só o tempo de olhar.
 */
function verOFio(gsap, { pose, desenho, calmo, mundo, cam, olharMao, som }) {
  mundo.petalas?.definirTempo?.(calmo ? 0.6 : 0.28);
  mundo.petalas?.definirFoco?.(0.85);
  if (!calmo) gsap.to(pose, { zoom: 1.3, duration: 3.8, ease: curvas.branco.camera });
  if (olharMao) gsap.to(cam, { inclinacao: olharMao * 1.22, duration: 3.6, ease: curvas.branco.camera });
  if (!desenho) return espera(calmo ? 800 : 2200);

  const tl = gsap.timeline();
  tl.call(() => som?.efeito?.('brilho'), null, 0.5);
  tl.to(pose, { luz: 1, duration: calmo ? 0.9 : 1.3, ease: curvas.yourname.florescer }, 0.5);
  if (calmo) {
    tl.to(pose, { luz: 0.55, duration: 1, ease: 'sine.inOut' }, 1.6).add(nada, 3);
  } else {
    const { volta, curta, longa } = desenho.cordao;
    const correr = (cordao, tamanho, duracao, t) => {
      const o = { p: 0 };
      tl.to(o, { p: 1, duration: duracao, ease: 'sine.inOut', onUpdate: () => cordao.correrLuz(o.p, tamanho) }, t);
    };
    tl.call(() => { desenho.brasas.taxa = 20; }, null, 0.7);
    correr(volta, 0.28, 1.3, 0.8);
    correr(curta, 0.5, 0.6, 1.75);
    correr(longa, 0.4, 0.9, 1.8);
    tl.call(() => { desenho.brasas.taxa = 5; }, null, 2.7);
    tl.to(pose, { luz: 0.55, duration: 1.4, ease: 'sine.inOut' }, 2.6);
  }
  return comoPromise(tl);
}

/**
 * O pulso: um alvo de 88 px, sem texto, sobre o nó. No toque o aparelho bate
 * duas vezes, o nó acende e a luz corre pela volta com seis brasinhas. Ignora
 * toques a menos de 1 s do anterior e com a bolsa aberta. O botão continua
 * sendo a ação: este alvo é só um carinho (aria-hidden).
 */
function criarPulso(gsap, { pose, desenho, amb, inventario }) {
  const alvo = el('div', { class: 'mao-pulso', 'aria-hidden': 'true' });
  const brilho = desenho ? null : el('span', 'mao-pulso-brilho');
  if (brilho) alvo.append(brilho);
  const luz = { p: 0 };
  let ultimo = -Infinity;
  let tl = null;

  alvo.addEventListener('click', () => {
    const agora = performance.now();
    if (agora - ultimo < INTERVALO_PULSO || inventario?.aberto) return;
    ultimo = agora;
    vibrar(amb);
    tl?.kill();
    tl = gsap.timeline();
    if (brilho) {
      tl.fromTo(brilho, { opacity: 0 }, { opacity: 1, duration: 0.25, ease: curvas.yourname.florescer })
        .to(brilho, { opacity: 0, duration: 0.9, ease: 'sine.inOut' });
      return;
    }
    tl.to(pose, { luz: 1, duration: 0.25, ease: curvas.yourname.florescer }, 0)
      .to(pose, { luz: 0.55, duration: 0.9, ease: 'sine.inOut' }, 0.25);
    if (amb?.reduzido) return;
    tl.fromTo(luz, { p: 0 }, { p: 1, duration: 0.6, ease: 'sine.inOut', onUpdate: () => desenho.cordao.volta.correrLuz(luz.p, 0.28) }, 0);
    for (let i = 0; i < 6; i++) tl.call(() => desenho.brasas.soltar(desenho.no[0], desenho.no[1]), null, 0.05 + 0.07 * i);
  });

  return {
    alvo,
    parar() {
      tl?.kill();
      tl = null;
      desenho?.cordao.volta.correrLuz(0);
      alvo.remove();
    },
  };
}

/**
 * O mergulho no pulso (WebGL, sem movimento reduzido). A mão cresce até 1,7 e
 * se dissolve enquanto a câmera chega perto; a estrela nasce no nó e desenha o
 * fio no ar; o olhar acompanha a estrela; a câmera sobe para um plano aberto,
 * o fio assenta no chão de perto para longe e a ponta corre até a carta; um
 * pulso de luz percorre o fio. Devolve a linha do tempo, com `pronto` (9,3 s).
 */
function mergulhar(gsap, { pose, descer, cam, olhar, fio, seguidor, mundo, som, olharMao, z0, comEstrela }) {
  const ar = seguidor.ar;
  ar.k = 1;
  ar.assentar = 0;
  olhar.guinada = cam.guinada;
  olhar.inclinacao = cam.inclinacao;
  olhar.k = 0;
  mundo.petalas?.definirFoco?.(0.9);
  mundo.petalas?.definirAbertura?.(3.2);
  seguidor.ponta(0);

  const estrela = { k: 0, escala: 1 };
  const ponta = { s: 0 };
  const aplicarEstrela = () => {
    if (comEstrela) fio.estrela(estrela.k, undefined, estrela.escala);
  };
  const aplicarPonta = () => seguidor.ponta(ponta.s);
  const rig = mundo.rig.position;

  const tl = gsap.timeline();
  tl.to(pose, { zoom: ZOOM_MERGULHO, duration: 2.6, ease: 'power2.inOut' }, 0)
    .to(cam, { inclinacao: olharMao * 1.4, duration: 2.6, ease: curvas.branco.camera, overwrite: 'auto' }, 0)
    .to(pose, { caudaKick: -12, duration: 0.5, ease: 'sine.inOut' }, 0.45)
    .to(pose, { caudaKick: 0, duration: 1.8, ease: curvas.branco.entrar }, 0.95)
    .call(() => som?.efeito?.('brilho'), null, 0.8)
    .to(estrela, { k: 1, duration: 0.5, ease: curvas.branco.entrar, onUpdate: aplicarEstrela }, 0.9)
    .to(pose, { opacidade: 0, duration: 1.8, ease: 'sine.inOut' }, 1)
    .to(ponta, { s: 4.6, duration: 3.8, ease: 'sine.inOut', onUpdate: aplicarPonta }, 1.1)
    .to(estrela, { escala: 1.15, duration: 1.8, ease: 'sine.inOut', onUpdate: aplicarEstrela }, 1.15)
    .to(olhar, { k: 1, duration: 1.8, ease: 'sine.inOut' }, 1.3)
    .to(rig, { z: z0 - 2.3, duration: 3.6, ease: 'power2.inOut' }, 1.6)
    .to(pose, { respiro: 0, duration: 1 }, 1.8)
    .to(pose, { y: descer, rot: -3, duration: 1.75, ease: 'power2.in' }, 1.9)
    .to(cam, { guinada: 0, inclinacao: -0.12, y: 0.42, duration: 3.6, ease: 'power2.inOut' }, 4.4)
    .to(rig, { z: z0 - 1.5, duration: 3.6, ease: 'power2.inOut' }, 4.4)
    .to(olhar, { k: 0, duration: 2.8, ease: 'sine.inOut' }, 4.5)
    .call(() => {
      mundo.petalas?.definirFoco?.();
      mundo.petalas?.definirAbertura?.(1);
      mundo.petalas?.definirTempo?.(1);
    }, null, 4.6)
    .to(ar, { assentar: 1, duration: 4.2, ease: 'sine.inOut' }, 4.7)
    .to(ponta, { s: S_CARTA + 1, duration: 4.3, ease: 'power1.in', onUpdate: aplicarPonta }, 4.9)
    .call(() => {
      fio.pulso?.({ de: 0, ate: 1, duracao: 3.6, forca: 1.25, largura: 0.9, brasas: 26 });
    }, null, 5.9)
    .to(estrela, { k: 0, escala: 0.8, duration: 1.2, ease: 'power1.out', onUpdate: aplicarEstrela }, 8.1)
    .call(() => {
      // A ponta volta para o fio.progresso: esquecer isto deixaria o fio preso.
      seguidor.ponta(null);
      fio.progresso(1);
      fio.rastro(0);
      ar.k = 0;
    }, null, 9.3);
  tl.pronto = comoPromise(tl);
  return tl;
}

/** Frase longa não pode descer até a mão: a letra diminui (×0,9, até 8 vezes, nunca abaixo de 19 px). */
function caberEmDuasLinhas(frase) {
  if (!frase) return;
  let corpo = parseFloat(getComputedStyle(frase).fontSize) || 0;
  const linha = () => parseFloat(getComputedStyle(frase).lineHeight) || corpo * 1.5;
  for (let i = 0; i < 8 && corpo > 19 && frase.offsetHeight > linha() * 2.3; i++) {
    corpo *= 0.9;
    frase.style.fontSize = `${corpo.toFixed(2)}px`;
  }
}

/**
 * A carta deixada no fim do caminho flutua (env.atualizar) enquanto é desta
 * cena e das que só a olham. Quando a cena final a assume (ela mesma atualiza)
 * ou outra carta toma o lugar, para; se foi trocada, esta vai embora.
 */
function cuidarDaCarta(ctx, env) {
  const { mundo, estado, diretor } = ctx;
  const parar = mundo.aoQuadro((dt, t) => {
    if (env.descartado || estado.envelope !== env || diretor?.cena === 'final') {
      parar();
      if (!env.descartado && estado.envelope && estado.envelope !== env) {
        Promise.resolve(env.irEmbora?.()).then(() => env.dispose?.()).catch(() => {});
      }
      return;
    }
    env.atualizar?.(dt, t);
  });
}

/* ---- a cena -------------------------------------------------------------------------- */

const fracao = (v, padrao) => (typeof v === 'number' && Number.isFinite(v) ? clamp(v) : padrao);

export async function cenaMao(ctx, { frio } = {}) {
  const { conteudo, amb, mundo, som, musica, diretor, estado, recursos } = ctx;
  const gsap = window.gsap;
  const dados = conteudo?.mao || {};
  const calmo = !!amb.reduzido;
  const haEncontro = temEncontro(conteudo);
  const palco = document.getElementById('palco');
  const frases = document.getElementById('frases');
  const acoes = document.getElementById('acoes');
  const rig = mundo.rig;

  // A câmera desta cena, somada à do mundo a cada quadro (só com WebGL).
  const cam = { inclinacao: 0, guinada: 0, x: 0, y: 0, guiar: false };
  const olhar = { k: 0, guinada: 0, inclinacao: 0 };
  const corrida = { k: 0, fase: 0, lente: false };
  const luzFio = { halo: 0 };
  let x0 = rig.position.x;
  let z0 = rig.position.z;

  let pararCamera = nada;
  let pararPose = nada;
  let pararMedida = nada;
  let pararMagia = nada;
  let pararPulso = nada;
  let limparEscrito = nada;
  let ouvirJanela = null;
  let surgirEle = null;
  let mergulho = null;
  let seguidor = null;
  let fio = null;
  let ele = null;
  let petalasChao = null;
  let inteira = false;
  let mao = null;
  let veu = null;
  let botao = null;
  let frase = null;
  let leitor = null;
  let alvoPulso = null;

  try {
    /* ---- começo ---- */
    if (frio) musica?.mostrarMini?.();
    if (!ctx.pergaminho || ctx.pergaminho.estado === 'oculto') {
      // A cena anterior já enrolou a folha: só a carta que sobrou sai.
      const sobra = estado.envelope;
      estado.envelope = null;
      if (sobra) Promise.resolve(sobra.irEmbora?.()).then(() => sobra.dispose?.()).catch(() => {});
    } else {
      await voltarAoMundo(ctx);
    }
    mundo.petalas?.definirDensidade?.(1);
    x0 = rig.position.x;
    z0 = rig.position.z;

    const aspecto = (Number(mundo.tamanho?.largura) || innerWidth) / (Number(mundo.tamanho?.altura) || innerHeight);
    // Negativo olha para baixo, para a mão; mais no computador (a tela é larga).
    const olharMao = calmo ? 0 : -lerp(0.15, 0.24, clamp((aspecto - 0.6) / 1));

    pararCamera = mundo.aoQuadro((dt) => {
      const s = z0 - rig.position.z;
      if (cam.guiar) {
        // A câmera segue a curva do caminho olhando 1,5 m adiante.
        cam.x = amortecer(cam.x, desvio(s + ANTECIPA) * 0.45, 2.2 + corrida.k, dt);
        const adiante = desvio(s + 3.9) * 0.6 - cam.x;
        cam.guinada = amortecer(cam.guinada, -Math.atan2(adiante, 3.2) * (0.75 - 0.3 * corrida.k), 2.4, dt);
      }
      if (!mundo.ok) return;
      const camera = mundo.camera;
      rig.position.x = x0 + cam.x;
      rig.position.y = cam.y;
      rig.rotation.y = lerp(cam.guinada, olhar.guinada, olhar.k);
      camera.rotation.x += lerp(cam.inclinacao, olhar.inclinacao, olhar.k);
      // A passada da corrida: quique, ombro, fôlego e um rolo leve.
      corrida.fase += Math.min(dt, 0.05) * 2.85;
      const k = corrida.k;
      if (k > 0.0005) {
        const c = corrida.fase * Math.PI * 2;
        camera.position.y += (0.5 - Math.abs(Math.sin(c / 2)) ** 0.7) * 0.07 * k;
        camera.position.x += Math.sin(c / 2) * 0.028 * k;
        camera.rotation.x += Math.cos(c + 0.5) * 0.007 * k - 0.035 * k;
        camera.rotation.z += Math.sin(c / 2 + 0.35) * 0.013 * k;
      }
      if (corrida.lente) {
        const fov = fovPara(camera.aspect) + 9 * k;
        if (Math.abs(camera.fov - fov) > 1e-3) {
          camera.fov = fov;
          camera.updateProjectionMatrix();
        }
      }
    });

    /* ---- olha ---- */
    diretor.etapa('olha');
    const textoFrase = typeof dados.frase === 'string' ? dados.frase.trim() : '';
    if (textoFrase && frases) {
      frase = el('p', 'frase');
      frases.append(frase);
    }
    if (olharMao) gsap.to(cam, { inclinacao: olharMao, duration: 3.4, ease: curvas.branco.camera });
    const fraseLida = frase ? revelarPalavras(frase, textoFrase, { intervalo: 0.24, duracao: 1.8 }) : Promise.resolve();
    caberEmDuasLinhas(frase);
    const escrito = typeof dados.escrito === 'string' ? dados.escrito.trim() : '';
    const letraPronta = fonteDoEscrito(escrito);

    /* ---- a mão ---- */
    const [imagem] = await Promise.all([
      Promise.race([
        Promise.resolve(recursos?.elementoImagem?.(dados.imagem, '')).catch(() => null),
        espera(7000).then(() => null),
      ]),
      espera(calmo ? 500 : 1000),
    ]);
    mao = el('div', { class: imagem ? 'mao mao-com-imagem' : 'mao', 'aria-hidden': 'true' });
    const corpo = el('div', 'mao-corpo');
    const desenho = imagem ? null : montarDesenho(amb);
    corpo.append(imagem || desenho.raiz);
    mao.append(corpo);
    palco.append(mao);
    veu = el('div', { class: 'mao-veu', 'aria-hidden': 'true' });
    palco.prepend(veu);
    // O zoom e o giro acontecem em volta do nó (com a foto, do ponto do CSS).
    const origem = desenho ? { x: desenho.no[0] / VB_L, y: desenho.no[1] / VB_A } : ORIGEM_IMAGEM;
    if (desenho) corpo.style.transformOrigin = `${(origem.x * 100).toFixed(3)}% ${(origem.y * 100).toFixed(3)}%`;
    // Se a frase invade a mão, a mão desce (no máximo 14% da tela). Refeito a cada
    // medida enquanto a frase está na tela: girar o celular não deixa um top velho.
    const descerDaFrase = () => {
      if (!frase || !mao) return;
      mao.style.top = '';
      const invade = frase.getBoundingClientRect().bottom + 14 - mao.getBoundingClientRect().top;
      if (invade > 0) mao.style.top = `${mao.offsetTop + Math.min(invade, innerHeight * 0.14)}px`;
    };

    const pose = { y: 96, rot: 2.4, opacidade: 0, respiro: calmo ? 0.25 : 1, balanco: 0, caudaKick: 0, zoom: 1, luz: 0 };
    const folga = { x: 0, y: 0 };
    const vivo = { x: 0, y: 0, rot: 0 };
    const caixa = { left: 0, top: 0, width: 1, height: 1 };
    const foto = { left: 0, top: 0, width: 1, height: 1 };
    const ancora = { x: fracao(dados.ancoraFio?.x, 0.5), y: fracao(dados.ancoraFio?.y, 0.62) };

    // A caixa de repouso (offset*, sem o transform) e o centro do véu no nó.
    const medir = () => {
      if (!mao) return;
      descerDaFrase();
      caixa.left = mao.offsetLeft;
      caixa.top = mao.offsetTop;
      caixa.width = corpo.offsetWidth || mao.offsetWidth || 1;
      caixa.height = corpo.offsetHeight || 1;
      if (imagem) {
        foto.left = imagem.offsetLeft;
        foto.top = imagem.offsetTop;
        foto.width = imagem.offsetWidth || 1;
        foto.height = imagem.offsetHeight || 1;
      }
      veu?.style.setProperty('--vx', `${(caixa.left + origem.x * caixa.width).toFixed(1)}px`);
      veu?.style.setProperty('--vy', `${(caixa.top + origem.y * caixa.height).toFixed(1)}px`);
    };
    medir();
    pararMedida = mundo.aoRedimensionar?.(medir) || nada;
    ouvirJanela = () => medir();
    addEventListener('resize', ouvirJanela);

    // Um ponto do corpo da mão (px da caixa) na tela, com o transform do quadro.
    const naTela = (lx, ly, saida) => {
      const ox = origem.x * caixa.width;
      const oy = origem.y * caixa.height;
      const a = (pose.rot + vivo.rot) * GRAU;
      const c = Math.cos(a) * pose.zoom;
      const s = Math.sin(a) * pose.zoom;
      const dx = lx - ox;
      const dy = ly - oy;
      saida[0] = caixa.left + ox + vivo.x + c * dx - s * dy;
      saida[1] = caixa.top + oy + pose.y + vivo.y + s * dx + c * dy;
      return saida;
    };
    const local = [0, 0];
    const noPx = [0, 0];
    const pontaPx = [0, 0];
    const doDesenho = (x, y) => {
      local[0] = (x / VB_L) * caixa.width;
      local[1] = (y / VB_A) * caixa.height;
      return local;
    };
    // O nó na tela (onde o pulso bate).
    const noNaTela = () => {
      if (desenho) doDesenho(desenho.no[0], desenho.no[1]);
      else {
        local[0] = foto.left + ancora.x * foto.width;
        local[1] = foto.top + ancora.y * foto.height;
      }
      return naTela(local[0], local[1], noPx);
    };
    // De onde o fio do caminho continua: a ponta longa do laço, girada com o vento.
    const pulsoPx = () => {
      if (!desenho) return noNaTela();
      const [nx, ny] = desenho.no;
      const [px, py] = desenho.pontaSolta;
      const a = desenho.angulo * GRAU;
      const dx = px - nx;
      const dy = py - ny;
      doDesenho(nx + dx * Math.cos(a) - dy * Math.sin(a), ny + dx * Math.sin(a) + dy * Math.cos(a));
      return naTela(local[0], local[1], pontaPx);
    };

    pararPose = mundo.aoQuadro((dt, t) => {
      // Respira e segue o dedo de leve (nunca no calmo).
      const pt = mundo.ponteiro;
      const segue = !calmo && !!pt?.ativo;
      folga.x = amortecer(folga.x, segue ? -9 * pt.x : 0, 2.6, dt);
      folga.y = amortecer(folga.y, segue ? 5 * pt.y : 0, 2.6, dt);
      vivo.x = folga.x;
      vivo.y = folga.y + Math.sin(1.15 * t) * 2.4 * pose.respiro;
      vivo.rot = Math.sin(0.83 * t + 0.6) * 0.38 * pose.respiro + folga.x * 0.045;
      corpo.style.transform = `translate3d(${vivo.x.toFixed(2)}px, ${(pose.y + vivo.y).toFixed(2)}px, 0) rotate(${(pose.rot + vivo.rot).toFixed(3)}deg) scale(${pose.zoom.toFixed(4)})`;
      corpo.style.opacity = clamp(pose.opacidade).toFixed(3);
      if (desenho) {
        // O nó pulsa como um coração em repouso: um tum-tum por segundo (~60 bpm).
        const f = t % 1;
        const bate = Math.exp(-(((f - 0.2) / 0.09) ** 2)) + 0.6 * Math.exp(-(((f - 0.5) / 0.1) ** 2));
        desenho.luz.setAttribute('opacity', clamp(pose.luz * (0.84 + 0.26 * bate)).toFixed(3));
        const vento = calmo ? 1.2 : 4.5;
        desenho.angulo = (Math.sin(1.55 * t) * 0.7 + Math.sin(2.6 * t + 1.1) * 0.3) * vento * pose.balanco + pose.caudaKick;
        desenho.cordao.caudaG.setAttribute('transform', `rotate(${desenho.angulo.toFixed(2)} ${num(desenho.no[0])} ${num(desenho.no[1])})`);
        desenho.brasas.atualizar(Math.min(dt, 0.05), t);
      }
      if (alvoPulso) {
        noNaTela();
        alvoPulso.style.transform = `translate3d(${noPx[0].toFixed(1)}px, ${noPx[1].toFixed(1)}px, 0)`;
      }
    });

    await Promise.all([desenharMao(gsap, { pose, desenho, calmo }), fraseLida, letraPronta]);

    /* ---- a escrita (só na mão desenhada: com a foto, o site não sabe onde fica a palma) ---- */
    if (desenho && escrito) {
      const letras = criarEscrito(desenho.escrito, escrito);
      if (letras.length) {
        // O leitor de tela ouve o que está escrito: a região viva entra antes do texto.
        leitor = el('p', { class: 'so-leitor', 'aria-live': 'polite' });
        mao.after(leitor);
        quadro().then(quadro).then(() => {
          if (leitor) leitor.textContent = escrito;
        });
        const escrita = escreverNaPalma(gsap, { letras, camada: desenho.escrito, calmo, som });
        limparEscrito = () => {
          escrita.kill();
          leitor?.remove();
          leitor = null;
        };
        await escrita.pronto;
      }
    }

    /* ---- o véu e o olhar ---- */
    gsap.to(veu, { opacity: calmo ? 0.7 : 1, duration: calmo ? 1.2 : 3.2, ease: curvas.branco.camera });
    await verOFio(gsap, { pose, desenho, calmo, mundo, cam, olharMao, som });

    /* ---- mao-espera ---- */
    diretor.etapa('mao-espera');
    // A última carta, amarrada só com o fio. Com o encontro ela fica escondida
    // até o clarão (cartaEscondida antes de cuidarDaCarta).
    const criarCarta = (chegada) => {
      const env = criarEnvelope(mundo, { lacre: null, amarracao: 'fio', chegada });
      if (mundo.ok) {
        env.grupo.position.set(x0, ALTURA_CARTA, z0 - S_CARTA);
        mundo.cena.add(env.grupo);
      }
      estado.envelope = env;
      if (haEncontro) {
        estado.cartaEscondida = true;
        if (env.grupo) env.grupo.visible = false;
      }
      cuidarDaCarta(ctx, env);
      return env;
    };
    const carta = mundo.ok ? criarCarta(2.4) : null;

    seguidor = criarSeguidor(ctx, { z0, x0, pulsoPx, cam, aoParar: () => petalasChao?.userData.descartar?.() });
    fio = seguidor.criar();
    estado.fio = fio;
    const fioSeguido = seguidor;
    estado.seguidorFio = {
      parar: () => fioSeguido.parar(),
      soltar: (d) => fioSeguido.soltar(d),
      ancorar: (v) => fioSeguido.ancorar(v),
    };

    if (mundo.ok && haEncontro && dados.ele !== false) {
      try {
        ele = criarEle(mundo);
        if (ele) {
          ele.grupo.position.set(x0 + ELE_X, 0, z0 - S_CARTA - ELE_ATRAS);
          mundo.cena.add(ele.grupo);
          seguidor.ancorar(ele.ancora());
          estado.ele = ele;
        }
      } catch (erro) {
        console.error('[carta] ele no fim do fio', erro);
        ele?.dispose?.();
        ele = null;
      }
    }
    estado.distanciaFinal = 0;
    if (mundo.ok && amb.nivel !== 'baixo') {
      petalasChao = petalasNoChao(mundo, { z0, x0 });
      fio.objeto.add(petalasChao);
    }
    if (mundo.ok) {
      await compilarComPrazo(mundo, [fio.objeto, ele?.grupo, carta && (carta.preparar ? carta.preparar() : carta.grupo)], 1200);
    }

    const texto = typeof dados.botao === 'string' ? dados.botao.trim() : '';
    // O botão é a única saída da cena: nunca fica sem nome para o leitor de tela.
    const rotulo = texto || (typeof dados.rotuloBotao === 'string' ? dados.rotuloBotao.trim() : '') || 'Seguir o fio';
    botao = el('button', { class: 'botao botao-fio', type: 'button', dataset: { acao: 'seguir-fio' }, 'aria-label': rotulo });
    botao.append(el('span', 'botao-fio-texto', texto), svg(SUBLINHADO));
    acoes.append(botao);
    // O estado de partida precisa ser pintado antes: só então a classe dispara as transições.
    void botao.offsetWidth;
    requestAnimationFrame(() => botao?.classList.add('botao-fio-visivel'));

    const pulso = criarPulso(gsap, { pose, desenho, amb, inventario: ctx.inventario });
    palco.append(pulso.alvo);
    alvoPulso = pulso.alvo;
    noNaTela();
    alvoPulso.style.transform = `translate3d(${noPx[0].toFixed(1)}px, ${noPx[1].toFixed(1)}px, 0)`;
    pararPulso = () => {
      alvoPulso = null;
      pulso.parar();
    };

    // No celular o anel de foco apareceria sobre o botão sem ninguém ter usado teclado.
    const focado = document.activeElement;
    if (!amb.toque && (!focado || focado === document.body)) {
      try {
        botao.focus({ preventScroll: true });
      } catch {
        /* sem foco */
      }
    }
    await new Promise((ok) => botao.addEventListener('click', ok, { once: true }));

    /* ---- correndo ---- */
    diretor.etapa('correndo');
    pararPulso();
    const tocado = botao;
    botao = null;
    // O [disabled] de base.css apagaria o botão de uma vez: a saída é só a dissolvência.
    gsap.set(tocado, { opacity: 1 });
    tocado.disabled = true;
    som?.destravar?.();
    som?.efeito?.('toque');
    gsap.to(tocado, { autoAlpha: 0, duration: 0.5, ease: curvas.branco.sair, onComplete: () => tocado.remove() });
    const fraseSaindo = frase;
    frase = null;
    if (fraseSaindo) ocultarPalavras(fraseSaindo).then(() => fraseSaindo.remove());
    if (petalasChao) petalasChao.visible = true;
    if (desenho) desenho.brasas.taxa = 0;

    const magico = !calmo && !!mundo.ok;
    if (!magico) {
      mundo.petalas?.definirTempo?.(1);
      mundo.petalas?.definirFoco?.();
    }
    const veuSaindo = veu;
    veu = null;
    gsap.to(veuSaindo, { opacity: 0, duration: 2.4, ease: 'sine.inOut', onComplete: () => veuSaindo.remove() });
    gsap.to(luzFio, { halo: calmo ? 0.6 : 0.55, duration: 2.6, ease: 'sine.inOut', onUpdate: () => fio.halo(luzFio.halo) });
    // A luz do nó escorre para o fio.
    gsap.to(pose, { luz: 0, duration: magico ? 2.4 : 1.6, delay: magico ? 0.9 : 0, ease: 'power1.in' });
    fio.rastro(calmo ? 0 : 1);
    // Com a foto não há estrela: o site não sabe desenhar a luz sobre ela.
    const comEstrela = !!desenho;
    if (comEstrela) fio.estrela(0, magico ? 30 : 16, 1);
    if (ele) {
      const eleAli = ele;
      surgirEle = gsap.delayedCall(magico ? 5.2 : 1.2, () => eleAli.mostrar(calmo ? 1.6 : 4));
    }

    let andado = 0;
    let extensao = Promise.resolve();
    if (magico) {
      // A estrela puxa as pétalas em volta dela, e o olhar vai atrás.
      const ponto = new mundo.THREE.Vector3();
      pararMagia = mundo.aoQuadro((dt) => {
        fio.pontoEm(undefined, ponto);
        mundo.petalas?.magia?.(ponto, 1);
        const p = rig.position;
        const dx = ponto.x - p.x;
        const dy = ponto.y - (p.y + ALTURA_OLHOS);
        const dz = ponto.z - p.z;
        olhar.guinada = amortecer(olhar.guinada, Math.atan2(-dx, -dz), 3.4, dt);
        olhar.inclinacao = amortecer(olhar.inclinacao, Math.atan2(dy, Math.hypot(dx, dz)), 3.4, dt);
      });
      // Quanto a mão desce para sair do quadro já crescida.
      const noY = caixa.top + caixa.height * origem.y;
      const descer = caixa.height * origem.y * ZOOM_MERGULHO
        + Math.max(0, (Number(mundo.tamanho?.altura) || innerHeight) - noY) + 48;
      mergulho = mergulhar(gsap, { pose, descer, cam, olhar, fio, seguidor, mundo, som, olharMao, z0, comEstrela });
      await mergulho.pronto;
      andado = Math.max(0, z0 - rig.position.z);
    } else {
      // Sem mergulho: o fio sai do pulso e se estende pelo caminho; a mão sai.
      if (comEstrela && !calmo) {
        const nasce = { k: 0 };
        gsap.to(nasce, { k: 1, duration: 0.5, ease: curvas.branco.entrar, onUpdate: () => fio.estrela(nasce.k) });
      }
      if (desenho && !calmo) {
        gsap.timeline()
          .to(pose, { caudaKick: -9, duration: 0.22, ease: curvas.ui.resposta, overwrite: 'auto' })
          .to(pose, { caudaKick: 0, duration: 1.6, ease: curvas.branco.entrar });
      }
      const queda = clamp(1.9 / Math.max(1, fio.comprimento), 0.08, 0.3);
      const revelar = { p: 0 };
      const linhaDoFio = gsap.timeline({ onUpdate: () => fio.progresso(revelar.p) });
      if (calmo) {
        linhaDoFio.to(revelar, { p: 1, duration: 1.6, ease: curvas.branco.deriva });
      } else {
        linhaDoFio.to(revelar, { p: queda, duration: 1.1, ease: curvas.branco.camera }, 0)
          .to(revelar, { p: 1, duration: 5.2, ease: 'power2.out' }, 1);
      }
      extensao = comoPromise(linhaDoFio).then(() => {
        const o = { k: 1 };
        gsap.to(o, {
          k: 0,
          duration: 1.2,
          ease: 'power1.out',
          onUpdate: () => {
            if (comEstrela) fio.estrela(o.k);
            fio.rastro(calmo ? 0 : o.k);
          },
        });
      });
      if (!calmo) gsap.to(cam, { inclinacao: olharMao * 1.1, duration: 1.8, ease: curvas.branco.camera });
      await espera(calmo ? 600 : 900);
      gsap.to(pose, { respiro: 0, duration: 1 });
      const fora = caixa.height * 1.15 + 80;
      if (calmo) {
        gsap.to(pose, { opacidade: 0, duration: 1, ease: 'none', onComplete: () => { pose.y = fora; } });
      } else {
        gsap.timeline()
          .to(pose, { y: fora, rot: -2.5, duration: 1.8, ease: curvas.branco.camera }, 0)
          .to(pose, { opacidade: 0, duration: 0.45, ease: 'sine.in' }, 1.35);
      }
      await espera(calmo ? 200 : 400);
    }

    /* ---- a corrida ---- */
    cam.guiar = !calmo;
    const DURACAO = clamp(Number(conteudo?.corrida?.segundos) || 7, 5, 10);
    const ALINHAR = calmo ? 0.3 : 1.5;
    if (calmo) {
      cam.inclinacao = 0;
    } else {
      gsap.timeline()
        .to(cam, { inclinacao: olharMao * 0.3, y: 0, duration: 1.3, ease: curvas.branco.camera }, 0)
        .to(cam, { inclinacao: 0, duration: 2, ease: curvas.branco.camera }, DURACAO - 2.2);
    }
    if (mundo.ok && !calmo) {
      corrida.lente = true;
      gsap.timeline()
        .to(corrida, { k: 1, duration: 1.1, ease: 'power2.out' }, 0)
        .to(corrida, { k: 0, duration: 0.36 * DURACAO, ease: 'sine.inOut' }, 0.62 * DURACAO);
    }
    const andar = mundo.caminhar({
      distancia: Math.max(0.5, CAMINHADA + RESTO - andado),
      duracao: DURACAO,
      curva: calmo ? undefined : curvaDaCorrida,
    });
    // No fim da corrida a câmera se alinha com a carta.
    const alinhada = comoPromise(gsap.timeline()
      .call(() => { cam.guiar = false; }, null, DURACAO - ALINHAR)
      .to(cam, { x: 0, guinada: 0, duration: ALINHAR, ease: curvas.branco.camera }, DURACAO - ALINHAR));
    if (!mundo.ok) {
      // Sem WebGL a carta nasce do branco perto do fim; com o encontro, quem a traz é o encontro.
      await espera(DURACAO * 1000 * (calmo ? 0.1 : 0.72));
      criarCarta(haEncontro ? false : calmo ? 1.2 : 3.6);
    }
    await Promise.all([andar, extensao, alinhada]);
    Object.assign(cam, { x: 0, guinada: 0, inclinacao: 0, y: 0 });
    corrida.k = 0;
    olhar.k = 0;

    /* ---- a chegada ---- */
    if (!haEncontro) {
      const cartaAqui = estado.envelope;
      if (typeof fio.pulso === 'function') {
        const chegou = fio.pulso({ de: 0, ate: 1.02, duracao: calmo ? 1.6 : 2.8, forca: 1.15, largura: 0.8, brasas: 20, curva: 'power1.inOut' });
        await espera(calmo ? 700 : 2200);
        cartaAqui?.brilharLaco?.(0.85, calmo ? 0.6 : 1.1);
        som?.efeito?.('brilho');
        await chegou;
      }
      gsap.to(luzFio, { halo: 0.12, duration: 3, ease: 'sine.inOut', onUpdate: () => fio.halo(luzFio.halo) });
    }
    inteira = true;

    /* ---- limpeza ---- */
    pararPose();
    pararPose = nada;
    mao.remove();
    mao = null;
  } finally {
    surgirEle?.kill();
    // Cena quebrada no meio: ele não fica esperando no fim de um fio que não chegou.
    if (!inteira && ele) {
      ele.dispose?.();
      if (estado.ele === ele) estado.ele = null;
      estado.seguidorFio?.ancorar?.(null);
    }
    if (mergulho && mergulho.progress() < 1) {
      mergulho.kill();
      seguidor?.ponta(null);
      fio?.progresso(1);
      if (seguidor) seguidor.ar.k = 0;
    }
    olhar.k = 0;
    gsap?.killTweensOf([cam, olhar, corrida]);
    limparEscrito();
    pararPulso();
    pararPose();
    pararMagia();
    pararCamera();
    pararMedida();
    if (ouvirJanela) removeEventListener('resize', ouvirJanela);
    // Nada desta cena fica no palco, nem quando ela quebra no meio.
    for (const sobra of [mao, veu, botao, frase, leitor]) sobra?.remove();
    mundo.petalas?.definirTempo?.(1);
    mundo.petalas?.definirDensidade?.(1);
    mundo.petalas?.magia?.(null);
    if (mundo.ok) {
      if (corrida.lente) {
        mundo.camera.fov = fovPara(mundo.camera.aspect);
        mundo.camera.updateProjectionMatrix();
      }
      rig.position.x = x0;
      rig.position.y = 0;
      rig.rotation.y = 0;
    }
  }
}
