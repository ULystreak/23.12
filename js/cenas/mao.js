// A mão: a carta do filme foi para o bolso e o fio aparece. "Olha a sua mão.",
// a mão com o akai ito, o botão, o fio vira o caminho e ela CORRE até ele.
//
//   cenaMao(ctx, { frio }) → Promise   resolve quando ela chegou perto da última carta
//
// Etapas: olha → mao-espera → correndo   (contrato: _dev/ROTEIRO2.md)
// Deixa para a cena final:
//   ctx.estado.fio             o fio já desenhado (do pulso até a carta)
//   ctx.estado.envelope        a última carta (criarEnvelope, amarracao 'fio'), parada
//                              exatamente onde cenaCarta põe a dela
//   ctx.estado.distanciaFinal  metros que faltam até a última carta
//   ctx.estado.seguidorFio     { parar() }: quem quiser assumir o fio para o seguidor
//
// O seguidor do fio continua vivo na cena final: o começo fica preso ao pulso
// (abaixo da tela), o trecho do chão acompanha a caminhada e a ponta segue
// estado.envelope.ancoraFio (seja a carta deixada aqui ou outra que a cena final
// crie). Em final:carta-abrindo a ponta se solta e cai no chão.
//
// Gancho para os testes (não mudar): [data-acao="seguir-fio"].

import { el, espera, svg, clamp, lerp, amortecer, semente, suave } from '../nucleo/util.js';
import { curvas, revelarPalavras, ocultarPalavras } from '../nucleo/movimento.js';
import { voltarAoMundo, temEncontro } from '../nucleo/diretor.js';
import { criarFio } from '../mundo/fio.js';
import { criarEnvelope } from '../mundo/envelope.js';
import { criarEle } from '../mundo/ele.js';

const CAMINHADA = 26;                // metros percorridos nesta cena, seguindo o fio (agora correndo: conteudo.corrida.segundos)
const RESTO = 4;                     // metros que ficam para a cena final
const PARADA = 1.25;                 // distância em que a última carta fica dela (= carta.js)
const S_CARTA = CAMINHADA + RESTO + PARADA;
const ALTURA_CARTA = 1.46;           // = carta.js (olhos − 4 cm)
const ALTURA_OLHOS = 1.5;
const PROF_PULSO = 0.9;              // profundidade do pulso na câmera (m)
// A quantos metros à frente o fio encosta no chão. Perto o bastante para o
// encontro com o chão ficar abaixo da borda da tela: o fio cai do nó para fora
// do quadro e volta pelo chão, sem o "V" seco que o ponto de toque desenhava.
const TOQUE = 1.4;
const ANTECIPA = 1.5;                // a câmera olha este tanto adiante na curva
const LADO = 0.56;                   // de que lado o fio chega à carta (m à direita do eixo)
// Ele, no fim do fio (só com o encontro por vir e com WebGL): de pé, um pouco
// além de onde a última carta vai aparecer; ela para a ~5,2 m dele
// (ele com pouco mais de um quarto da altura da tela, ainda envolto na névoa).
const ELE_ATRAS = 4.0;               // metros além da carta
const ELE_X = 0.1;                   // o eixo do corpo (m à direita do eixo do caminho): a mão do fio fica do lado em que o fio chega

// =============================================================================
// O caminho no chão: quanto o fio se afasta para o lado a `s` metros da partida.
// Nos primeiros metros abre para a direita, fora da silhueta da mão (é ali que
// ela vê o fio correr), faz um S largo e chega à carta pelo lado direito: a
// subida até a carta cai em diagonal, sem cortar a dica no centro da tela.
// =============================================================================

/**
 * Curva da corrida: arranca depressa (ela viu o fio e foi), segura o passo e
 * desacelera no último terço, até parar diante dele.
 */
const curvaDaCorrida = (() => {
  const N = 96;
  const ENTRADA = 0.2;
  const CHEGADA = 0.4;
  const tabela = new Float32Array(N + 1);
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

function desvio(s) {
  const fim = suave((s - (S_CARTA - 4.75)) / 3.5);
  // um S largo e outro mais curto por cima: numa caminhada longa o fio serpenteia
  // sem repetir o mesmo desenho
  const onda = 0.72 * Math.sin(s * 0.3 + 0.05) + 0.2 * Math.sin(s * 0.71 + 1.9) * suave((s - 5) / 5) + 0.07 * Math.sin(s * 1.3 + 0.4);
  return lerp(onda, LADO, fim);
}

// =============================================================================
// A mão desenhada a nanquim (quando conteudo.mao.imagem está vazio).
// PRIMEIRA PESSOA: é a mão esquerda dela, erguida à frente do rosto para olhar o
// pulso. O antebraço entra pela borda de baixo da tela (largo, perto dos olhos),
// sobe em diagonal e afina até o pulso; a palma está voltada para ela, deitada
// para trás (em escorço), os dedos relaxados apontam para longe e curvam um
// pouco de volta, o polegar abre para a esquerda.
//
// Nada é desenhado "de frente": a mão é modelada no espaço dela
//   u  para o lado do mínimo        v  do pulso para os dedos
//   w  para fora da palma (na direção dos olhos)
// com o pulso na origem, e uma câmera de perspectiva (VISTA) projeta tudo no
// viewBox. O escorço da palma, os dedos que encurtam e o antebraço que alarga
// saem da projeção, não de ajuste à mão. O traço de largura variável (um
// polígono que cresce ao longo da linha) é feito já em 2D.
// =============================================================================

const VB_L = 400;
const VB_A = 500;
const TINTA = '#2a1b22';
const SVGNS = 'http://www.w3.org/2000/svg';
const GRAU = Math.PI / 180;

const VISTA = {
  inclinacao: 45,        // quanto a palma deita para trás (0 = de frente, o "pare" de outra pessoa)
  guinada: -7,           // a palma vira um pouco: o lado do polegar fica mais perto
  rolo: 12,              // o conjunto inclina: o braço vem de baixo, pela esquerda
  dobra: 7,              // o antebraço vem ainda mais na direção dos olhos que a palma
  desvio: 10,            // e chega mais de lado que a mão (o pulso quebra um pouco)
  distancia: 980,        // dos olhos ao pulso, na unidade do desenho (~35 cm)
  escala: 1.1,
  cx: 212,               // onde o pulso cai no viewBox
  cy: 250,
};

/** Espaço da mão → [x, y] no viewBox (e o fator de perspectiva, para quem quiser). */
const projetar = (() => {
  const ct = Math.cos(VISTA.inclinacao * GRAU); const st = Math.sin(VISTA.inclinacao * GRAU);
  const cg = Math.cos(VISTA.guinada * GRAU); const sg = Math.sin(VISTA.guinada * GRAU);
  const cr = Math.cos(VISTA.rolo * GRAU); const sr = Math.sin(VISTA.rolo * GRAU);
  return (p) => {
    const u = p[0]; const v = p[1]; const w = p[2] || 0;
    const x1 = u * cg + w * sg;
    const w1 = -u * sg + w * cg;
    const y2 = v * ct + w1 * st;
    const z2 = -v * st + w1 * ct;                      // + = na direção dos olhos
    const s = VISTA.distancia / Math.max(120, VISTA.distancia - z2);
    const X = x1 * s; const Y = y2 * s;
    return [VISTA.cx + (X * cr + Y * sr) * VISTA.escala, VISTA.cy - (-X * sr + Y * cr) * VISTA.escala, s];
  };
})();

/** Ponto do antebraço: L para o cotovelo, e para o lado do mínimo, h para fora da pele. */
const braco = (() => {
  const cb = Math.cos(VISTA.dobra * GRAU); const sb = Math.sin(VISTA.dobra * GRAU);
  const cd = Math.cos(VISTA.desvio * GRAU); const sd = Math.sin(VISTA.desvio * GRAU);
  const A = [-sd * cb, -cd * cb, sb];
  const T = [cd, -sd, 0];
  const N = [sd * sb, cd * sb, cb];
  return (L, e, h = 0) => [L * A[0] + e * T[0] + h * N[0], L * A[1] + e * T[1] + h * N[1], L * A[2] + e * T[2] + h * N[2]];
})();
/** Meia largura do antebraço a L do pulso: mais fino logo abaixo da mão, encorpa para o cotovelo. */
const meioBraco = (L) => 44.5 + 14 * suave(L / 250) + 3 * Math.sin(Math.PI * clamp(L / 380));
const BRACO_FIM = 372;               // até onde o antebraço é desenhado (bem abaixo da borda da tela)

const mais = (p, a, k, b = null, kb = 0) => [
  p[0] + a[0] * k + (b ? b[0] * kb : 0),
  p[1] + a[1] * k + (b ? b[1] * kb : 0),
  (p[2] || 0) + (a[2] || 0) * k + (b ? (b[2] || 0) * kb : 0),
];

/** Catmull-Rom uniforme: pontos de controle → polilinha densa. */
function catmull(pts, passos = 7) {
  const saida = [];
  const n = pts.length;
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(n - 1, i + 2)];
    for (let k = 0; k < passos; k++) {
      const t = k / passos;
      const t2 = t * t;
      const t3 = t2 * t;
      const c = (j) => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2
        + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3);
      saida.push([c(0), c(1)]);
    }
  }
  saida.push(pts[n - 1].slice());
  return saida;
}

/**
 * Um dedo visto pela palma, no espaço da mão (3D). Devolve os lados e a ponta
 * como listas de pontos e o eixo (para os vincos).
 *   base [u, v, w], angulo (graus no plano da palma, 0 = para os dedos, + = para o mínimo),
 *   comprimento, largBase, largPonta, curva (rad ao longo do dedo, no plano),
 *   juntas (frações do eixo), flexao (graus em cada dobra: na base e em cada
 *   junta; o dedo relaxado sai do plano da palma e volta na direção dela)
 */
function dedo({ base, angulo, comprimento, largBase, largPonta, curva = 0, juntas = [0.37, 0.69], polpa = 0.05, flexao = [0, 0, 0] }) {
  const passos = 28;
  const eixo = [];
  let p = [base[0], base[1], base[2] || 0];
  for (let i = 0; i <= passos; i++) {
    const t = i / passos;
    const th = angulo * GRAU + curva * t;
    let f = flexao[0] || 0;
    juntas.forEach((j, k) => { f += (flexao[k + 1] || 0) * suave((t - j + 0.08) / 0.16); });
    f *= GRAU;
    const d = [Math.sin(th) * Math.cos(f), Math.cos(th) * Math.cos(f), Math.sin(f)];
    const n = [Math.cos(th), -Math.sin(th), 0];            // para o lado do mínimo
    eixo.push({ p, d, n });
    p = mais(p, d, comprimento / passos);
  }
  const pontoEm = (t) => {
    const f = clamp(t) * passos;
    const i = Math.min(passos - 1, Math.floor(f));
    const r = f - i;
    const a = eixo[i];
    const b = eixo[i + 1];
    const mix = (x, y) => [lerp(x[0], y[0], r), lerp(x[1], y[1], r), lerp(x[2], y[2], r)];
    return { p: mix(a.p, b.p), d: mix(a.d, b.d), n: mix(a.n, b.n) };
  };
  // Meia largura: afina para a ponta, com as polpas de cada falange um pouco cheias.
  const limites = [0, ...juntas, 1];
  const meia = (t) => {
    let bojo = 0;
    for (let i = 0; i < limites.length - 1; i++) {
      if (t >= limites[i] && t <= limites[i + 1]) {
        const u = (t - limites[i]) / (limites[i + 1] - limites[i]);
        bojo = Math.pow(Math.sin(Math.PI * u), 0.8) * polpa * (i === 0 ? 0.6 : 1);
      }
    }
    // os "ombros" da ponta arredondam: a polpa do último dedo é uma cúpula, não um retângulo
    const ombro = 1 - 0.16 * suave((t - 0.8) / 0.2);
    return (lerp(largBase, largPonta, Math.pow(t, 1.15)) / 2) * (1 + bojo) * ombro;
  };
  const hPonta = largPonta / 2;
  const tc = 1 - (hPonta * 1.12) / comprimento;
  const esquerda = [];
  const direita = [];
  for (let i = 0; i <= 12; i++) {
    const t = (i / 12) * tc;
    const q = pontoEm(t);
    const h = meia(t);
    // o lado de fora da curva da polpa é um pouco mais cheio
    esquerda.push(mais(q.p, q.n, -h * 1.03));
    direita.push(mais(q.p, q.n, h * 0.97));
  }
  const c = pontoEm(tc);
  const hc = meia(tc);
  const ponta = [];
  for (let i = 1; i < 8; i++) {
    const fi = (i / 8) * Math.PI;
    ponta.push(mais(c.p, c.n, -hc * Math.cos(fi), c.d, hc * Math.sin(fi) * 1.22));
  }
  return { esquerda, direita: direita.reverse(), ponta, pontoEm, meia };
}

/** Pontos dos dedos, do contorno da mão, do antebraço e do cordão: modelados em 3D, devolvidos já no viewBox. */
function geometriaMao() {
  // Dedos relaxados: afinam para a ponta e saem do plano da palma, um pouco mais
  // a cada junta e a cada dedo (o mínimo é o que mais fecha): vistos por ela, as
  // primeiras falanges encurtam e as pontas voltam, com a polpa à mostra.
  const juntas = [0.42, 0.75];
  const polegar = dedo({ base: [-63, 64, 15], angulo: -51, comprimento: 79, largBase: 41, largPonta: 24.5, curva: 0.34, juntas: [0.52], polpa: 0.09, flexao: [15, 20] });
  const indicador = dedo({ base: [-29, 130, 0], angulo: -8.5, comprimento: 106, largBase: 30.5, largPonta: 19.5, curva: 0.12, juntas, polpa: 0.075, flexao: [12, 25, 16] });
  const medio = dedo({ base: [1.5, 136.5, 0], angulo: -1.5, comprimento: 117, largBase: 31, largPonta: 20.5, curva: 0.04, juntas, polpa: 0.075, flexao: [15, 29, 18] });
  const anelar = dedo({ base: [31, 131.5, 0], angulo: 6, comprimento: 108, largBase: 29.5, largPonta: 19.5, curva: -0.07, juntas, polpa: 0.075, flexao: [18, 33, 20] });
  const minimo = dedo({ base: [58, 115, 0], angulo: 16, comprimento: 81, largBase: 25, largPonta: 16.5, curva: -0.16, juntas, polpa: 0.08, flexao: [22, 37, 22] });
  const dedos = [indicador, medio, anelar, minimo];

  // Vale entre dois dedos: um pouco abaixo do meio das bases.
  const vale = (a, b) => {
    const pa = a.direita[a.direita.length - 1];
    const pb = b.esquerda[0];
    return [(pa[0] + pb[0]) / 2, Math.min(pa[1], pb[1]) - 4.5, (pa[2] + pb[2]) / 2];
  };
  const v1 = vale(indicador, medio);
  const v2 = vale(medio, anelar);
  const v3 = vale(anelar, minimo);

  // Antebraço: as duas bordas, do cotovelo (fora da tela) até o pulso. Do lado do
  // mínimo, o ossinho do pulso (a cabeça da ulna) faz um calombo logo abaixo da mão.
  const ulna = (L) => 3.4 * Math.exp(-(((L - 12) / 8.5) ** 2));
  const antebracoE = [];
  const antebracoD = [];
  const NB = 22;
  for (let i = 0; i <= NB; i++) {
    const L = BRACO_FIM * Math.pow(1 - i / NB, 1.25);
    // do lado do polegar, o músculo do antebraço enche um pouco a borda mais abaixo
    antebracoE.push(braco(L, -meioBraco(L) - 4.5 * Math.sin(Math.PI * clamp((L - 30) / 300))));
    antebracoD.push(braco(L, meioBraco(L) + ulna(L)));
  }
  const pulsoE = antebracoE[NB];
  const pulsoD = antebracoD[NB];
  // a eminência tenar: a base cheia do polegar, que sai do pulso e emenda no dedo sem quina
  const tenar = [pulsoE, [-51.5, 9, 3], [-61, 21, 8], [-69.5, 34, 12], polegar.esquerda[1]];
  const polegarE = polegar.esquerda.slice(2);
  const teia = [polegar.direita[polegar.direita.length - 1], [-48.5, 93, 5], [-46, 111.5, 0], indicador.esquerda[0]];
  const hipotenar = [minimo.direita[minimo.direita.length - 1], [74, 95, 0], [76, 66, 0], [70.5, 37, 0], [59, 14, 0], pulsoD];

  // Traços do contorno, na ordem em que o desenho acontece.
  const sem = (lista) => lista.slice(1);
  // Cada dedo são dois traços: sobe por um lado e passa da ponta; o outro desce
  // do alto da ponta. A pena levanta ali, como quem desenha de verdade.
  const subida = (d, antes) => [...antes, ...d.esquerda, ...d.ponta.slice(0, 5)];
  const descida = (d, depois) => [...d.ponta.slice(3), ...d.direita, ...depois];
  const P = (lista) => lista.map((q) => projetar(q));
  const tracos = {
    antebracoE: P(antebracoE),
    antebracoD: P(antebracoD),
    polegar: [
      P([...tenar, ...polegarE, ...polegar.ponta.slice(0, 5)]),
      P([...polegar.ponta.slice(3), ...polegar.direita, teia[1]]),
    ],
    dedos: [
      [P(subida(indicador, [teia[1], teia[2]])), P(descida(indicador, [v1]))],
      [P(subida(medio, [v1])), P(descida(medio, [v2]))],
      [P(subida(anelar, [v2])), P(descida(anelar, [v3]))],
      [P(subida(minimo, [v3])), P(descida(minimo, sem(hipotenar)))],
    ],
  };

  // Silhueta fechada (para a parte branca que tapa o mundo e para a aguada).
  const silhueta = P([
    ...antebracoE,
    ...sem(tenar), ...polegarE, ...polegar.ponta, ...polegar.direita,
    teia[1], teia[2], ...indicador.esquerda, ...indicador.ponta, ...indicador.direita,
    v1, ...medio.esquerda, ...medio.ponta, ...medio.direita,
    v2, ...anelar.esquerda, ...anelar.ponta, ...anelar.direita,
    v3, ...minimo.esquerda, ...minimo.ponta, ...minimo.direita,
    ...sem(hipotenar), ...sem(antebracoD.slice().reverse()),
  ]);

  // Vincos curtos das juntas (vistos pela palma): na base, duplo na primeira junta, simples na segunda.
  const vincos = [];
  const vinco = (d, t, abertura, curvar, desloc = 0) => {
    const q = d.pontoEm(t);
    const h = d.meia(t) * abertura;
    const c = mais(q.p, q.n, -h * desloc);
    return P([mais(c, q.n, -h), mais(c, q.d, curvar), mais(c, q.n, h * 0.9)]);
  };
  dedos.forEach((d, i) => {
    vincos.push(vinco(d, 0.035, 0.6, 2.2, i % 2 ? 0.08 : -0.06));
    vincos.push(vinco(d, 0.42, 0.55, 1.6, 0.05));
    vincos.push(vinco(d, 0.447, 0.4, 1.4, -0.1));
    vincos.push(vinco(d, 0.75, 0.48, 1.2, 0));
  });
  vincos.push(vinco(polegar, 0.52, 0.5, 2, 0.06));
  vincos.push(vinco(polegar, 0.548, 0.34, 1.6, -0.1));

  const linhas = {
    // a dobra do pulso (duas pregas) e as linhas da palma
    pulso1: P([[-33, 6], [-13, 1.5], [11, 0.5], [34, 5]]),
    pulso2: P([braco(7.5, -26), braco(10, -4), braco(8.5, 22)]),
    vida: P([[-44, 97.5, 1], [-39.5, 77, 2], [-34, 54, 3], [-26, 30, 2], [-14, 11, 0]]),
    cabeca: P([[-43, 95, 1], [-24.5, 87], [0.5, 78.5], [27.5, 68], [48.5, 56]]),
    coracao: P([[73.5, 88], [55.5, 94.5], [33.5, 100.5], [12.5, 106], [-7.5, 116.5]]),
    hipotenar: P([[65.5, 47], [58, 39], [54.5, 26]]),
    // os dois tendões do pulso, que saltam quando a mão está aberta para cima
    tendao1: P([braco(31, -9.5), braco(56, -11), braco(86, -13.5), braco(118, -16.5)]),
    tendao2: P([braco(33, 3.5), braco(54, 4.5), braco(78, 5), braco(98, 5)]),
    // o ossinho do pulso (ulna): uma vírgula por dentro do calombo
    ulna: P([braco(3.5, 37), braco(10, 40.5), braco(18, 40), braco(24, 36.5)]),
  };
  // Hachura curta no lado da sombra (a borda do mínimo), como quem desenha sabe fazer.
  const hachuras = [];
  for (let i = 0; i < 5; i++) hachuras.push(P([[71 - i * 0.6, 75 - i * 9.5], [64.5 - i * 0.4, 68.5 - i * 9.5]]));

  // A sombra própria: a luz vem do alto, pela esquerda, e a aguada escurece para o
  // lado do mínimo (um degradê atravessado na mão e no braço, dentro da silhueta).
  const sombra = [projetar(braco(40, -6)), projetar(braco(40, meioBraco(40) + 6))];

  // O akai ito: uma volta no pulso. O pulso é um cilindro achatado visto meio de
  // topo, então a parte da frente da volta é um arco de elipse que sobe no meio
  // e some atrás do braço nas duas bordas. O nó fica em cima, um pouco para o lado
  // do mínimo (o peso das pontas puxa a volta para lá), e as duas pontas caem
  // dele com a gravidade: a curta deita sobre o pulso, a comprida escorrega pela
  // borda e pende no ar, fora do braço (é dela que o fio do caminho continua).
  const L_FIO = 21;
  const ALTO = 25;                               // quanto o pulso salta do plano (a meia espessura dele)
  const anel = (a) => {
    const L = L_FIO + 3.5 * Math.cos(a);
    return braco(L, (meioBraco(L) + 1.2) * Math.cos(a), ALTO * Math.sin(a));
  };
  const volta = [];
  for (let i = 0; i <= 26; i++) volta.push(anel(Math.PI * (1 - i / 26)));
  const A_NO = 68 * GRAU;
  const no = projetar(anel(A_NO));
  const rel = (lista) => lista.map(([x, y]) => [no[0] + x, no[1] + y]);
  const esq = projetar(anel(Math.PI));
  const dir = projetar(anel(0));
  const meio = projetar(anel(Math.PI / 2));
  const cordao = {
    volta: P(volta),
    no: [no[0], no[1]],
    pontaCurta: rel([[0, 2], [3.5, 10], [8.5, 19.5], [12, 30], [12.5, 40]]),
    pontaLonga: rel([[1.5, 0.5], [11, 4.5], [21.5, 12.5], [29, 23.5], [32.5, 36], [33.5, 47], [33, 56]]),
    faixa: {
      cx: (esq[0] + dir[0]) / 2, cy: ((esq[1] + dir[1]) / 2 + meio[1]) / 2,
      rx: Math.hypot(dir[0] - esq[0], dir[1] - esq[1]) * 0.72,
      angulo: Math.atan2(dir[1] - esq[1], dir[0] - esq[0]) / GRAU,
    },
  };

  return { tracos, silhueta, vincos, linhas, hachuras, sombra, cordao };
}

/**
 * Um traço de pena: a linha central é amostrada, cada ponto ganha uma meia
 * largura (entrada, saída e uma pressão que varia), e `desenhar(p)` monta o
 * polígono só até a fração p do comprimento.
 */
function criarTraco(pontos, { peso = 2.2, entrada = 10, saida = 14, minimo = 0.22, seed = 1, cor = TINTA, opacidade = 0.94, passos = 7, afinar = 1 } = {}) {
  const linha = catmull(pontos, passos);
  const n = linha.length;
  const acum = new Float32Array(n);
  for (let i = 1; i < n; i++) acum[i] = acum[i - 1] + Math.hypot(linha[i][0] - linha[i - 1][0], linha[i][1] - linha[i - 1][1]);
  const total = acum[n - 1] || 1;
  const aleat = semente(seed);
  const fases = [aleat() * 6.28, aleat() * 6.28, aleat() * 6.28];
  const nx = new Float32Array(n);
  const ny = new Float32Array(n);
  const meia = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = linha[Math.max(0, i - 1)];
    const b = linha[Math.min(n - 1, i + 1)];
    let tx = b[0] - a[0];
    let ty = b[1] - a[1];
    const t = Math.hypot(tx, ty) || 1;
    tx /= t; ty /= t;
    nx[i] = -ty; ny[i] = tx;
    const s = acum[i];
    const pressao = 0.8 + 0.16 * Math.sin(s * 0.045 + fases[0]) + 0.08 * Math.sin(s * 0.13 + fases[1]) + 0.05 * Math.sin(s * 0.31 + fases[2]);
    const ent = minimo + (1 - minimo) * suave(s / Math.max(1, entrada));
    const sai = saida > 0 ? minimo * 0.5 + (1 - minimo * 0.5) * suave((total - s) / saida) : 1;
    // afinar < 1: o traço perde peso ao longo do caminho (o que se afasta dos olhos fica mais fino)
    meia[i] = (peso / 2) * pressao * ent * sai * lerp(1, afinar, s / total);
  }

  const caminho = document.createElementNS(SVGNS, 'path');
  caminho.setAttribute('fill', cor);
  if (opacidade < 1) caminho.setAttribute('fill-opacity', String(opacidade));
  let atual = -1;

  function desenhar(p) {
    const alvo = clamp(p) * total;
    if (alvo === atual) return;
    atual = alvo;
    if (alvo <= 0.01) { caminho.setAttribute('d', ''); return; }
    const esq = [];
    const dir = [];
    let i = 0;
    for (; i < n && acum[i] <= alvo; i++) {
      esq.push(`${(linha[i][0] + nx[i] * meia[i]).toFixed(2)} ${(linha[i][1] + ny[i] * meia[i]).toFixed(2)}`);
      dir.push(`${(linha[i][0] - nx[i] * meia[i]).toFixed(2)} ${(linha[i][1] - ny[i] * meia[i]).toFixed(2)}`);
    }
    if (i < n && i > 0) {
      // o último pedaço, interpolado: a linha cresce sem saltos
      const r = (alvo - acum[i - 1]) / Math.max(1e-6, acum[i] - acum[i - 1]);
      const x = lerp(linha[i - 1][0], linha[i][0], r);
      const y = lerp(linha[i - 1][1], linha[i][1], r);
      const m = lerp(meia[i - 1], meia[i], r);
      esq.push(`${(x + nx[i] * m).toFixed(2)} ${(y + ny[i] * m).toFixed(2)}`);
      dir.push(`${(x - nx[i] * m).toFixed(2)} ${(y - ny[i] * m).toFixed(2)}`);
    }
    if (esq.length < 2) { caminho.setAttribute('d', ''); return; }
    caminho.setAttribute('d', `M${esq.join('L')}L${dir.reverse().join('L')}Z`);
  }

  return { caminho, desenhar, comprimento: total };
}

/** Caminho fechado simples (silhueta, aguada) a partir de pontos. */
function caminhoFechado(pontos, passos = 4) {
  const d = catmull(pontos, passos);
  return `M${d.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('L')}Z`;
}

// O akai ito no pulso (a geometria dele vem de geometriaMao: a volta, o nó e as duas pontas).
const ESCALA_NO = 1.32;
const FIO_COR = '#d7192d';
const FIO_ESCURO = '#8f0b1d';
const FIO_CLARO = '#ff9a93';

/** Cordão trançado: base vermelha, fios em espinha e um brilho de seda. Desenha por fração. */
function criarCordao(pontos, { peso = 4.6, seed = 7, passos = 8 } = {}) {
  const linha = catmull(pontos, passos);
  const n = linha.length;
  const acum = [0];
  for (let i = 1; i < n; i++) acum.push(acum[i - 1] + Math.hypot(linha[i][0] - linha[i - 1][0], linha[i][1] - linha[i - 1][1]));
  const total = acum[n - 1];
  const grupo = document.createElementNS(SVGNS, 'g');
  const base = document.createElementNS(SVGNS, 'path');
  const sombra = document.createElementNS(SVGNS, 'path');
  const trama = document.createElementNS(SVGNS, 'path');
  const brilho = document.createElementNS(SVGNS, 'path');
  const d = `M${linha.map((p) => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join('L')}`;
  for (const [no, cor, largura, extra] of [
    [sombra, TINTA, peso + 1.6, { 'stroke-opacity': '0.16', transform: 'translate(0.8 1.6)' }],
    [base, FIO_COR, peso, {}],
    [brilho, FIO_CLARO, peso * 0.22, { 'stroke-opacity': '0.75', transform: 'translate(-0.5 -0.9)' }],
  ]) {
    no.setAttribute('d', d);
    no.setAttribute('fill', 'none');
    no.setAttribute('stroke', cor);
    no.setAttribute('stroke-width', String(largura));
    no.setAttribute('stroke-linecap', 'round');
    no.setAttribute('stroke-linejoin', 'round');
    no.setAttribute('pathLength', '1');
    no.setAttribute('stroke-dasharray', '1 1');
    no.setAttribute('stroke-dashoffset', '1');
    for (const [k, v] of Object.entries(extra)) no.setAttribute(k, v);
  }
  trama.setAttribute('fill', 'none');
  trama.setAttribute('stroke', FIO_ESCURO);
  trama.setAttribute('stroke-width', String(peso * 0.2));
  trama.setAttribute('stroke-linecap', 'round');
  trama.setAttribute('stroke-opacity', '0.85');
  // a luz que corre por dentro do cordão (um traço curto e quente que viaja)
  // (uma aura larga e morna e um miolo fino e claro, o mesmo traço)
  const luzes = [['#ffc77a', peso * 2.1, 0.4], ['#ffe3b0', peso * 1.1, 0.7], ['#fffaf0', peso * 0.4, 1]].map(([cor, largura, op]) => {
    const l = document.createElementNS(SVGNS, 'path');
    l.setAttribute('d', d);
    l.setAttribute('fill', 'none');
    l.setAttribute('stroke', cor);
    l.setAttribute('stroke-width', String(largura));
    l.setAttribute('stroke-linecap', 'round');
    l.setAttribute('pathLength', '1');
    l.setAttribute('stroke-dasharray', '0 2');
    l.setAttribute('opacity', '0');
    l.dataset.op = String(op);
    return l;
  });
  grupo.append(sombra, base, trama, brilho, ...luzes);

  // Espinha: pequenos traços inclinados, alternando o lado, a cada ~2,4 unidades.
  const passo = peso * 0.55;
  const marcas = [];
  let j = 0;
  for (let s = passo * 0.5; s < total; s += passo, j++) {
    let i = 1;
    while (i < n - 1 && acum[i] < s) i++;
    const r = (s - acum[i - 1]) / Math.max(1e-6, acum[i] - acum[i - 1]);
    const x = lerp(linha[i - 1][0], linha[i][0], r);
    const y = lerp(linha[i - 1][1], linha[i][1], r);
    let tx = linha[i][0] - linha[i - 1][0];
    let ty = linha[i][1] - linha[i - 1][1];
    const t = Math.hypot(tx, ty) || 1;
    tx /= t; ty /= t;
    const lado = j % 2 ? 1 : -1;
    const meia = peso * 0.46;
    // do meio para a borda, puxado para trás: o desenho da trança
    const ax = x + -ty * 0.4 * lado;
    const ay = y + tx * 0.4 * lado;
    const bx = x + -ty * meia * lado - tx * peso * 0.42;
    const by = y + tx * meia * lado - ty * peso * 0.42;
    marcas.push({ s, d: `M${ax.toFixed(2)} ${ay.toFixed(2)}L${bx.toFixed(2)} ${by.toFixed(2)}` });
  }
  let atual = -1;
  function desenhar(p) {
    const k = clamp(p);
    if (k === atual) return;
    atual = k;
    const off = String(1 - k);
    base.setAttribute('stroke-dashoffset', off);
    sombra.setAttribute('stroke-dashoffset', off);
    brilho.setAttribute('stroke-dashoffset', off);
    const ate = k * total;
    let d2 = '';
    for (const m of marcas) { if (m.s > ate) break; d2 += m.d; }
    trama.setAttribute('d', d2);
  }
  /** A luz passa pelo cordão: p de 0 (antes do começo) a 1 (depois do fim). */
  function correrLuz(p, tamanho = 0.32) {
    luzes.forEach((luz, i) => {
      // o miolo é mais curto que a aura: a luz tem cabeça clara e cauda morna
      const L = tamanho * (1 - i * 0.3);
      if (p <= 0 || p >= 1) { luz.setAttribute('opacity', '0'); return; }
      luz.setAttribute('opacity', luz.dataset.op);
      luz.setAttribute('stroke-dasharray', `${L.toFixed(3)} 2`);
      luz.setAttribute('stroke-dashoffset', String(L - p * (1 + tamanho) - i * 0.0));
    });
  }
  return { grupo, desenhar, correrLuz, ponta: linha[n - 1], linha, acum, total };
}

/** Monta o desenho inteiro. Devolve o <svg>, as partes animáveis e onde fica a ponta solta. */
function montarDesenho(amb) {
  const g = geometriaMao();
  const fx = g.cordao.faixa;
  const raiz = svg(`
    <svg class="mao-desenho" viewBox="0 0 ${VB_L} ${VB_A}" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="mao-brilho" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stop-color="#fff4d6" stop-opacity="0.95"/>
          <stop offset="0.28" stop-color="#ffc77a" stop-opacity="0.62"/>
          <stop offset="0.62" stop-color="#ff8a6e" stop-opacity="0.2"/>
          <stop offset="1" stop-color="#ff8a6e" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="mao-brasa" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stop-color="#fffaf0"/>
          <stop offset="0.22" stop-color="#ffd890"/>
          <stop offset="0.5" stop-color="#ff8a5c" stop-opacity="0.78"/>
          <stop offset="0.74" stop-color="#e2283f" stop-opacity="0.32"/>
          <stop offset="1" stop-color="#d7192d" stop-opacity="0"/>
        </radialGradient>
        <clipPath id="mao-recorte"><path class="mao-recorte-forma"/></clipPath>
        <linearGradient id="mao-sombra" gradientUnits="userSpaceOnUse" x1="${g.sombra[0][0].toFixed(1)}" y1="${g.sombra[0][1].toFixed(1)}" x2="${g.sombra[1][0].toFixed(1)}" y2="${g.sombra[1][1].toFixed(1)}">
          <stop offset="0" stop-color="#d49f8d" stop-opacity="0"/>
          <stop offset="0.55" stop-color="#d49f8d" stop-opacity="0.1"/>
          <stop offset="1" stop-color="#cf9684" stop-opacity="0.34"/>
        </linearGradient>
      </defs>
      <g class="mao-fundo">
        <path class="mao-silhueta" fill="#ffffff"/>
        <g clip-path="url(#mao-recorte)">
          <path class="mao-aguada" fill="#f3d3c8" fill-opacity="0.36" transform="translate(2.6 3.4)"/>
          <path class="mao-sombra-braco" fill="url(#mao-sombra)"/>
        </g>
        <path class="mao-aguada-borda" fill="none" stroke="#dcaa9b" stroke-width="1" stroke-opacity="0.42" transform="translate(2.6 3.4)"/>
      </g>
      <g class="mao-escrito"></g>
      <g class="mao-tinta"></g>
      <g class="mao-luz" opacity="0">
        <ellipse class="mao-luz-faixa" cx="${fx.cx.toFixed(1)}" cy="${fx.cy.toFixed(1)}" rx="${fx.rx.toFixed(1)}" ry="19" transform="rotate(${fx.angulo.toFixed(1)} ${fx.cx.toFixed(1)} ${fx.cy.toFixed(1)})" fill="url(#mao-brilho)" opacity="0.7"/>
        <circle class="mao-luz-no" cx="${g.cordao.no[0].toFixed(1)}" cy="${g.cordao.no[1].toFixed(1)}" r="48" fill="url(#mao-brilho)"/>
      </g>
      <g class="mao-cordao"></g>
      <g class="mao-brasas"></g>
    </svg>`);

  const silhuetaD = caminhoFechado(g.silhueta);
  raiz.querySelector('.mao-silhueta').setAttribute('d', silhuetaD);
  raiz.querySelector('.mao-recorte-forma').setAttribute('d', silhuetaD);
  raiz.querySelector('.mao-aguada').setAttribute('d', silhuetaD);
  raiz.querySelector('.mao-aguada-borda').setAttribute('d', silhuetaD);
  raiz.querySelector('.mao-sombra-braco').setAttribute('d', silhuetaD);
  const fundo = raiz.querySelector('.mao-fundo');
  const tinta = raiz.querySelector('.mao-tinta');
  const camadaCordao = raiz.querySelector('.mao-cordao');

  // Contorno (ordem do desenho), linhas da palma, vincos e hachuras.
  let sem = 11;
  const contorno = [];
  const juntar = (lista, destino, op) => {
    for (const pts of lista) {
      const t = criarTraco(pts, { ...op, seed: sem++ });
      tinta.append(t.caminho);
      destino.push(t);
    }
  };
  const tr = g.tracos;
  // Antebraço: entra por baixo, de fora da tela, e sobe até o pulso. O que está
  // perto dos olhos leva o traço mais cheio; ele afina com a distância.
  // Luz do alto à esquerda: o lado da luz é mais fino; o da sombra, mais cheio.
  juntar([tr.antebracoE], contorno, { peso: 2.5, entrada: 2, saida: 16, minimo: 0.5, afinar: 0.62 });
  juntar([tr.antebracoD], contorno, { peso: 3.1, entrada: 2, saida: 12, minimo: 0.5, afinar: 0.66 });
  juntar([tr.polegar[0]], contorno, { peso: 1.9, entrada: 14, saida: 9, minimo: 0.18 });
  juntar([tr.polegar[1]], contorno, { peso: 2.35, entrada: 8, saida: 12, minimo: 0.18 });
  for (const [sobe, desce] of tr.dedos) {
    juntar([sobe], contorno, { peso: 1.7, entrada: 10, saida: 9, minimo: 0.16 });
    juntar([desce], contorno, { peso: 2.25, entrada: 7, saida: 12, minimo: 0.16 });
  }

  const detalhes = [];
  juntar([g.linhas.pulso1, g.linhas.pulso2], detalhes, { peso: 1.2, entrada: 14, saida: 18, minimo: 0.1, opacidade: 0.8 });
  juntar([g.linhas.vida, g.linhas.cabeca, g.linhas.coracao], detalhes, { peso: 1.45, entrada: 16, saida: 26, minimo: 0.08, opacidade: 0.86 });
  juntar([g.linhas.hipotenar, g.linhas.ulna], detalhes, { peso: 1.05, entrada: 6, saida: 10, minimo: 0.1, opacidade: 0.62 });
  juntar([g.linhas.tendao1, g.linhas.tendao2], detalhes, { peso: 1.15, entrada: 22, saida: 40, minimo: 0.06, opacidade: 0.5 });
  const vincos = [];
  juntar(g.vincos, vincos, { peso: 1.05, entrada: 3, saida: 4, minimo: 0.15, opacidade: 0.78, passos: 6 });
  juntar(g.hachuras, vincos, { peso: 0.85, entrada: 2, saida: 2.5, minimo: 0.2, opacidade: 0.42, passos: 3 });

  // O cordão vermelho e o nó.
  const C = g.cordao;
  const volta = criarCordao(C.volta, { peso: 5.6, passos: 3 });
  const curta = criarCordao(C.pontaCurta, { peso: 4.6 });
  const caudaG = document.createElementNS(SVGNS, 'g');
  const longa = criarCordao(C.pontaLonga, { peso: 4.9 });
  caudaG.append(curta.grupo, longa.grupo);
  const no = svg(`<svg><g class="mao-no">
      <ellipse cx="0" cy="0" rx="5.6" ry="4" transform="rotate(-28)" fill="${FIO_COR}" stroke="${FIO_ESCURO}" stroke-width="0.9"/>
      <ellipse cx="1.8" cy="2.2" rx="4.4" ry="3.1" transform="rotate(34)" fill="${FIO_COR}" stroke="${FIO_ESCURO}" stroke-width="0.9"/>
      <path d="M-3.4 -1.2 Q0 1.4 3.6 -0.6 M-1.6 3 Q1.2 1 4.4 2.6" fill="none" stroke="${FIO_ESCURO}" stroke-width="0.8" stroke-linecap="round"/>
      <path d="M-3 -2.8 Q-0.6 -3.9 2 -3.2" fill="none" stroke="${FIO_CLARO}" stroke-width="0.8" stroke-linecap="round" stroke-opacity="0.8"/>
    </g></svg>`).firstElementChild;
  no.setAttribute('transform', `translate(${C.no[0].toFixed(2)} ${C.no[1].toFixed(2)}) scale(0)`);
  camadaCordao.append(volta.grupo, caudaG, no);

  return {
    raiz,
    fundo,
    contorno,
    detalhes,
    vincos,
    cordao: { volta, curta, longa, caudaG, no },
    no: C.no,
    escalaNo: ESCALA_NO,
    pontaSolta: longa.ponta,             // em unidades do viewBox, antes do balanço
    reduzido: amb.reduzido,
    luz: raiz.querySelector('.mao-luz'),
    escrito: raiz.querySelector('.mao-escrito'),
    brasas: criarBrasas(raiz.querySelector('.mao-brasas'), [volta, longa], amb),
  };
}

// =============================================================================
// O escrito na palma (conteudo.mao.escrito): tinta de caneta na pele.
// As palavras são compostas NO ESPAÇO DA MÃO (u para o mínimo, v para os dedos,
// w a concha da palma) e cada letra recebe a matriz da projeção naquele ponto:
// deitam com a palma, encurtam com o escorço e acompanham a curva dela. Ficam
// por baixo das linhas da palma (os vincos passam por cima da tinta). Cada
// letra é revelada da esquerda para a direita por um recorte que anda, uma
// depois da outra, no ritmo de quem escreve devagar.
// =============================================================================

const FONTE_ESCRITO = '"Klee One", "Shippori Mincho", Georgia, serif';
const PESO_ESCRITO = 600;
const TINTA_PELE = '#2b1e2c';
// Onde cabe na palma: abaixo da linha da cabeça e à direita da linha da vida,
// descendo junto com a primeira (nenhuma linha da mão risca as letras).
// `alto` estica as letras para o lado dos dedos: compensa o escorço da palma deitada.
const PALMA = { u: 13, v: 43, largura: 82, altura: 58, inclinacao: -13, alto: 1.28 };

/** A concha da palma: as bordas (tenar e hipotenar) sobem um pouco na direção dos olhos. */
const conchaPalma = (u, v) => 0.0026 * (u - 4) * (u - 4) + 0.0009 * (v - 60) * (v - 60);

/** Quebra o texto em linhas equilibradas (1 a 3), pela largura medida de cada palavra. */
function linhasDoEscrito(texto, medir) {
  const palavras = texto.split(/\s+/).filter(Boolean);
  if (palavras.length <= 1 || texto.length <= 5) return [palavras.join(' ')];
  const nLinhas = texto.length > 22 ? 3 : 2;
  let melhor = null;
  const tentar = (cortes) => {
    const linhas = [];
    let de = 0;
    for (const c of [...cortes, palavras.length]) { linhas.push(palavras.slice(de, c).join(' ')); de = c; }
    if (linhas.some((l) => !l)) return;
    const maior = Math.max(...linhas.map(medir));
    if (!melhor || maior < melhor.maior - 0.001) melhor = { linhas, maior };
  };
  for (let i = 1; i < palavras.length; i++) {
    if (nLinhas === 2) tentar([i]);
    else for (let j = i + 1; j < palavras.length; j++) tentar([i, j]);
  }
  return melhor ? melhor.linhas : [palavras.join(' ')];
}

/** Espera a letra manuscrita (no máximo ~1,5 s; se faltar, o navegador usa a reserva). */
async function fonteDoEscrito(texto) {
  if (!texto || !document.fonts || !document.fonts.load) return;
  try {
    await Promise.race([document.fonts.load(`${PESO_ESCRITO} 48px ${FONTE_ESCRITO}`, texto), espera(1500)]);
  } catch { /* segue com a reserva */ }
}

/**
 * Monta as letras na camada (todas escondidas). Devolve a lista, na ordem da
 * escrita: { revelar(p 0..1), secar(k 0..1), esforco, pausa }.
 */
function criarEscrito(camada, texto) {
  const lapis = document.createElement('canvas').getContext('2d');
  if (!lapis || !camada) return [];
  lapis.font = `${PESO_ESCRITO} 100px ${FONTE_ESCRITO}`;
  const medir = (t) => lapis.measureText(t).width / 100;
  const linhas = linhasDoEscrito(texto.trim(), medir);
  const maior = Math.max(...linhas.map(medir), 0.5);
  const ENTRELINHA = 1.0;
  const alturaEm = (linhas.length - 1) * ENTRELINHA + 0.92;
  const corpo = Math.min(PALMA.largura / maior, PALMA.altura / (alturaEm * PALMA.alto), 40);
  const aleat = semente(41);
  const ci = Math.cos(PALMA.inclinacao * GRAU);
  const si = Math.sin(PALMA.inclinacao * GRAU);
  const topo = PALMA.v + (alturaEm * corpo * PALMA.alto) / 2;
  const letras = [];
  let id = 0;
  linhas.forEach((linha, li) => {
    const largura = medir(linha) * corpo;
    // cada linha começa um nada mais para a direita que a de cima, como quem escreve sem pauta
    let x = -largura / 2 + (li - (linhas.length - 1) / 2) * corpo * 0.12;
    const y = topo - (0.74 + li * ENTRELINHA) * corpo * PALMA.alto;
    const chars = Array.from(linha);
    chars.forEach((ch, k) => {
      const avanco = medir(ch) * corpo;
      if (ch.trim()) {
        // posição na palma (a linha de base sobe um pouco para a direita e oscila)
        const sobe = (aleat() - 0.5) * corpo * 0.05;
        const u = PALMA.u + x * ci;
        const v = y + x * si + sobe;
        const giro = (aleat() - 0.5) * 5 * GRAU + PALMA.inclinacao * GRAU;
        const escala = 1 + (aleat() - 0.5) * 0.08;
        const cg = Math.cos(giro) * escala; const sg = Math.sin(giro) * escala;
        // a matriz da projeção neste ponto: 1 unidade de letra = 1 unidade da mão
        const em = (du, dv) => projetar([u + du, v + dv, conchaPalma(u + du, v + dv)]);
        const o = em(0, 0);
        const pu = em(cg, sg);                       // a direção da escrita
        const pv = em(-sg * PALMA.alto, cg * PALMA.alto);                      // para cima da letra
        const m = [pu[0] - o[0], pu[1] - o[1], -(pv[0] - o[0]), -(pv[1] - o[1]), o[0], o[1]];
        const g = document.createElementNS(SVGNS, 'g');
        g.setAttribute('transform', `matrix(${m.map((n) => n.toFixed(4)).join(' ')})`);
        const recorte = document.createElementNS(SVGNS, 'clipPath');
        recorte.setAttribute('id', `mao-escrito-${id}`);
        const janela = document.createElementNS(SVGNS, 'rect');
        const folga = corpo * 0.14;
        janela.setAttribute('x', (-folga).toFixed(2));
        janela.setAttribute('y', (-corpo * 1.1).toFixed(2));
        janela.setAttribute('height', (corpo * 1.55).toFixed(2));
        janela.setAttribute('width', '0');
        recorte.append(janela);
        const dentro = document.createElementNS(SVGNS, 'g');
        dentro.setAttribute('clip-path', `url(#mao-escrito-${id})`);
        dentro.setAttribute('opacity', '0');
        const comum = { 'font-family': FONTE_ESCRITO, 'font-weight': String(PESO_ESCRITO), 'font-size': corpo.toFixed(2), x: '0', y: '0' };
        // a tinta entra um pouco na pele: um halo fino da mesma cor em volta do traço
        const halo = document.createElementNS(SVGNS, 'text');
        const traco = document.createElementNS(SVGNS, 'text');
        for (const [no, extra] of [
          [halo, { fill: 'none', stroke: TINTA_PELE, 'stroke-width': (corpo * 0.075).toFixed(2), 'stroke-opacity': '0.2', 'stroke-linejoin': 'round' }],
          [traco, { fill: TINTA_PELE, 'fill-opacity': '0.84' }],
        ]) {
          for (const [a, b] of Object.entries({ ...comum, ...extra })) no.setAttribute(a, b);
          no.textContent = ch;
          dentro.append(no);
        }
        g.append(recorte, dentro);
        camada.append(g);
        id++;
        const total = avanco + folga * 2;
        letras.push({
          esforco: 0.55 + medir(ch) * 1.1,
          pausa: k === chars.length - 1 ? 1.7 : 0,          // levanta a caneta no fim da palavra/linha
          revelar(p) {
            dentro.setAttribute('opacity', p > 0 ? '1' : '0');
            janela.setAttribute('width', (total * clamp(p)).toFixed(2));
          },
          inteira() { dentro.removeAttribute('clip-path'); dentro.setAttribute('opacity', '1'); },
          grupo: dentro,
        });
      } else if (letras.length) letras[letras.length - 1].pausa += 1.1;
      x += avanco;
    });
  });
  return letras;
}

/**
 * Escreve na palma, letra por letra. Resolve quando deu tempo de ler.
 * Movimento reduzido: o escrito inteiro aparece em dissolvência.
 */
function escreverNaPalma(gsap, { letras, camada, calmo, som }) {
  return new Promise((resolver) => {
    if (!letras.length) { resolver(); return; }
    const tl = gsap.timeline({ onComplete: resolver });
    if (calmo) {
      gsap.set(camada, { opacity: 0 });
      for (const l of letras) l.inteira();
      tl.to(camada, { opacity: 1, duration: 1.4, ease: 'none' }, 0.2).add(() => {}, 3.0);
      return;
    }
    const CADENCIA = 0.3;               // segundos por letra de esforço médio (devagar: é para ela ler junto)
    let t = 0.35;
    for (const l of letras) {
      const d = CADENCIA * l.esforco;
      const e = { p: 0 };
      tl.add(() => som.efeito('caneta'), t)
        .to(e, { p: 1, duration: d, ease: 'sine.inOut', onUpdate: () => l.revelar(e.p), onComplete: () => l.inteira() }, t);
      t += d + 0.07 + l.pausa * 0.16;
    }
    // o tempo de ler antes de o fio acender
    tl.add(() => {}, t + 1.3);
  });
}

/**
 * Poeira de luz que se solta do cordão do pulso: pontinhos quentes que sobem
 * devagar, balançam e apagam. Poucos círculos SVG (sem filtro), em unidades do
 * viewBox: crescem junto com o zoom na mão. Movimento reduzido: nenhuma.
 */
function criarBrasas(camada, cordoes, amb) {
  const N = amb.reduzido ? 0 : amb.nivel === 'baixo' ? 14 : 34;
  const lista = [];
  for (let i = 0; i < N; i++) {
    const c = document.createElementNS(SVGNS, 'circle');
    c.setAttribute('r', '0');
    c.setAttribute('fill', 'url(#mao-brasa)');
    camada.append(c);
    lista.push({ c, vivo: false, x: 0, y: 0, vx: 0, vy: 0, idade: 0, vida: 1, r: 1, fase: 0 });
  }
  let acumulado = 0;
  let proxima = 0;
  const pontoNoCordao = () => {
    // a maior parte nasce no laço e no nó; algumas ao longo da ponta solta
    const cordao = Math.random() < 0.72 ? cordoes[0] : cordoes[1];
    const s = Math.random() * cordao.total;
    let i = 1;
    while (i < cordao.linha.length - 1 && cordao.acum[i] < s) i++;
    return cordao.linha[i];
  };
  function soltar(x, y) {
    if (!N) return;
    const b = lista[proxima];
    proxima = (proxima + 1) % N;
    const p = x === undefined ? pontoNoCordao() : [x, y];
    b.vivo = true;
    b.x = p[0] + (Math.random() - 0.5) * 3; b.y = p[1] + (Math.random() - 0.5) * 2;
    b.vx = (Math.random() - 0.5) * 9; b.vy = -(6 + Math.random() * 12);
    b.idade = 0; b.vida = 1.3 + Math.random() * 1.6;
    b.r = 1.1 + Math.random() * 1.9;
    b.fase = Math.random() * 6.28;
  }
  return {
    taxa: 0,
    soltar,
    atualizar(dt, t) {
      if (!N) return;
      acumulado += dt * this.taxa;
      while (acumulado >= 1) { acumulado -= 1; soltar(); }
      const freio = Math.exp(-0.9 * dt);
      for (const b of lista) {
        if (!b.vivo) continue;
        b.idade += dt;
        const k = b.idade / b.vida;
        if (k >= 1) { b.vivo = false; b.c.setAttribute('r', '0'); continue; }
        b.vx = b.vx * freio + Math.sin(t * 1.9 + b.fase) * 7 * dt;
        b.vy = b.vy * freio - 3 * dt;
        b.x += b.vx * dt; b.y += b.vy * dt;
        const a = Math.min(1, b.idade / 0.2) * (1 - k) * (0.7 + 0.3 * Math.sin(t * 8 + b.fase));
        b.c.setAttribute('cx', b.x.toFixed(1));
        b.c.setAttribute('cy', b.y.toFixed(1));
        b.c.setAttribute('r', (b.r * (1 - 0.4 * k) * 2.1).toFixed(2));
        b.c.setAttribute('opacity', a.toFixed(2));
      }
    },
  };
}

// =============================================================================
// Câmera em primeira pessoa (só para o modo leve, que não tem câmera): a mesma
// conta da câmera 3D (guinada no rig, inclinação na câmera), para o fio em SVG
// ser a projeção do mesmo caminho.
// =============================================================================

function fovPara(aspecto) {
  return lerp(58, 42, clamp((aspecto - 0.8) / (1.35 - 0.8)));
}

function criarCameraLeve() {
  const c = { x: 0, y: ALTURA_OLHOS, z: 0, inclinacao: 0, guinada: 0, l: 1, a: 1, tanM: 0.55, aspecto: 1 };
  c.ajustar = (largura, altura) => {
    c.l = largura; c.a = altura; c.aspecto = largura / altura;
    c.tanM = Math.tan((fovPara(c.aspecto) * Math.PI) / 360);
  };
  /** mundo → { px, py, prof } */
  c.projetar = (p, saida) => {
    const dx = p.x - c.x; const dy = p.y - c.y; const dz = p.z - c.z;
    const cg = Math.cos(c.guinada); const sg = Math.sin(c.guinada);
    const x1 = cg * dx - sg * dz;
    const z1 = sg * dx + cg * dz;
    const ci = Math.cos(c.inclinacao); const si = Math.sin(c.inclinacao);
    const y2 = ci * dy + si * z1;
    const z2 = -si * dy + ci * z1;
    const prof = Math.max(0.05, -z2);
    saida.px = (x1 / (prof * c.tanM * c.aspecto) * 0.5 + 0.5) * c.l;
    saida.py = (-(y2 / (prof * c.tanM)) * 0.5 + 0.5) * c.a;
    saida.prof = prof;
    return saida;
  };
  /** px de tela + profundidade → mundo */
  c.desprojetar = (px, py, prof, saida) => {
    const nx = (px / c.l) * 2 - 1;
    const ny = -((py / c.a) * 2 - 1);
    const x1 = nx * prof * c.tanM * c.aspecto;
    const y2 = ny * prof * c.tanM;
    const z2 = -prof;
    const ci = Math.cos(c.inclinacao); const si = Math.sin(c.inclinacao);
    const y = ci * y2 - si * z2;
    const z1 = si * y2 + ci * z2;
    const cg = Math.cos(c.guinada); const sg = Math.sin(c.guinada);
    saida.x = cg * x1 + sg * z1 + c.x;
    saida.z = -sg * x1 + cg * z1 + c.z;
    saida.y = y + c.y;
    return saida;
  };
  return c;
}

// =============================================================================
// O seguidor: monta a curva do fio a cada quadro.
//   começo  preso ao pulso (px de tela → mundo, na profundidade do pulso)
//   queda   do pulso até encostar no chão, TOQUE metros à frente da câmera
//   chão    o caminho fixo no mundo, até perto da carta
//   subida  do chão até env.ancoraFio (ou, solto, deitado no chão)
// =============================================================================

function criarSeguidor(ctx, { z0, x0, pulsoPx, cam }) {
  const { mundo, estado, diretor } = ctx;
  const ok = mundo.ok;
  const THREE = mundo.THREE;
  const leve = ok ? null : criarCameraLeve();

  // Tabela do comprimento do caminho no chão (para a trança não escorregar).
  const PASSO_G = 0.05;
  const nG = Math.ceil((S_CARTA + 3) / PASSO_G) + 1;
  const tabelaG = new Float32Array(nG);
  for (let i = 1; i < nG; i++) {
    const a = desvio((i - 1) * PASSO_G);
    const b = desvio(i * PASSO_G);
    tabelaG[i] = tabelaG[i - 1] + Math.hypot(PASSO_G, b - a);
  }
  const G = (s) => {
    const f = clamp(s / PASSO_G, 0, nG - 1.001);
    const i = Math.floor(f);
    return lerp(tabelaG[i], tabelaG[i + 1], f - i);
  };

  // Pontos reutilizados (nada é alocado por quadro).
  const MAX = 128;                     // (o chão leva um ponto a cada 0,5 m, e a caminhada é longa)
  const pontos = [];
  for (let i = 0; i < MAX; i++) pontos.push(ok ? new THREE.Vector3() : { x: 0, y: 0, z: 0, px: 0, py: 0, prof: 1 });
  const lista = [];
  const perfil = [];
  const perfilPool = [];
  for (let i = 0; i < MAX; i++) perfilPool.push([0, 0]);
  const tmp = { x: 0, y: 0, z: 0 };
  const inicio = ok ? new THREE.Vector3() : { x: 0, y: 0, z: 0 };
  const ultimaAncora = ok ? new THREE.Vector3() : { x: 0, y: 0, z: 0, px: 0, py: 0 };
  let temAncora = false;
  let ancoraExtra = null;   // onde a ponta se prende em vez da carta (a mão dele), ou null

  const larguras = { inicio: 0.0048, chao: 0.013, fim: 0.0065 };
  let fio = null;
  let soltura = 0;          // 0 preso à carta, 1 deitado no chão
  let soltando = null;
  let parado = false;
  let alcance = 0;          // quanto do caminho já existe à frente (m); a extensão revela por progresso

  // O voo: quando a estrela nasce, o fio é desenhado no ar, numa curva larga que
  // sobe e desce sobre o caminho; depois assenta no chão, de perto para longe.
  //   ar.k        0..1, quanto do voo existe
  //   ar.assentar 0..1, a frente que assenta (0: tudo no ar; 1: tudo no chão)
  const ar = { k: 0, assentar: 0 };
  let pontaS = null;        // a ponta, em metros de caminho desde a partida (null: quem manda é progresso())
  const sDe = new Float32Array(MAX);
  const acum = new Float32Array(MAX);

  function vooEm(s) {
    if (ar.k <= 0.0005) return 0;
    const frente = ar.assentar * (S_CARTA + 8) - 4;
    return ar.k * (1 - suave((frente - s) / 4));
  }
  // altura do voo e quanto ele abre para o lado, a `s` metros (some ao longe)
  function alturaAr(s) {
    const longe = 1 - suave((s - 6.5) / 4.5);
    return (0.98 + 0.4 * Math.sin((s - 1.2) * 0.9)) * longe;
  }
  function ladoAr(s) {
    const longe = 1 - suave((s - 7) / 4);
    return 0.26 * Math.sin((s - 1.2) * 0.62 + 0.2) * longe;
  }

  function definirPonto(i, x, y, z) {
    const p = pontos[i];
    p.x = x; p.y = y; p.z = z;
    return p;
  }

  function lerAncora() {
    // Com ele no fim do fio, a ponta sobe até a mão dele (não até a carta escondida).
    if (ancoraExtra && ok && !soltando) { ultimaAncora.copy(ancoraExtra); temAncora = true; return true; }
    const env = estado.envelope;
    if (!env || soltando) return temAncora;
    try {
      const a = env.ancoraFio;
      if (a && Number.isFinite(a.x)) {
        if (ok) ultimaAncora.copy(a);
        else { ultimaAncora.px = a.px; ultimaAncora.py = a.py; }
        temAncora = true;
      }
    } catch { /* envelope descartado no meio: fica a última posição */ }
    return temAncora;
  }

  function montar() {
    const rig = mundo.rig.position;
    const sCam = z0 - rig.z;
    // Perto da carta, o fio encosta no chão antes de começar a subir até ela.
    const sT = Math.min(sCam + TOQUE, S_CARTA - 1.0);
    let n = 0;

    // Começo: o pulso, em px de tela, levado ao mundo.
    const ponta = pulsoPx();
    if (ok) {
      const ndcX = clamp((ponta.x / mundo.tamanho.largura) * 2 - 1, -1.6, 1.6);
      // (a mão saindo de quadro no mergulho leva o pulso muito abaixo da tela: o fio não entra no chão)
      const ndcY = Math.max(-((ponta.y / mundo.tamanho.altura) * 2 - 1), -1.4);
      inicio.copy(mundo.telaParaMundo(ndcX, ndcY, PROF_PULSO));
    } else {
      leve.desprojetar(ponta.x, ponta.y, PROF_PULSO, inicio);
    }

    // Queda: vertical no pulso, deitada no chão (horizontal no toque).
    // No voo, o "toque" fica no ar: o fio sai do pulso quase reto, para a frente.
    const vT = ok ? vooEm(sT) : 0;
    const tx = x0 + desvio(sT) + vT * ladoAr(sT);
    const tz = z0 - sT;
    const yT = 0.02 + vT * alturaAr(sT);
    const altura = inicio.y - yT;
    // No plano do chão, uma curva de Bézier cujo fim já vem na direção do caminho:
    // o fio pousa sem quina e segue.
    const dS = 0.05;
    let gx = desvio(sT + dS) - desvio(sT);
    let gz = -dS;
    const gl = Math.hypot(gx, gz) || 1;
    gx /= gl; gz /= gl;
    const alcanceQueda = Math.hypot(tx - inicio.x, tz - inicio.z);
    const cx = tx - gx * alcanceQueda * 0.55;
    const cz = tz - gz * alcanceQueda * 0.55;
    const QUEDA = 10;
    for (let i = 0; i < QUEDA; i++) {
      const u = i / QUEDA;
      const h = Math.pow(u, 0.95);
      const y = yT + altura * Math.pow(1 - u, 1.8);
      const a = (1 - h) * (1 - h);
      const b = 2 * (1 - h) * h;
      const c = h * h;
      sDe[n] = sCam + (sT - sCam) * u;
      definirPonto(n++, a * inicio.x + b * cx + c * tx, y, a * inicio.z + b * cz + c * tz);
    }

    // Chão: pontos fixos no mundo a cada 0,5 m (não tremem enquanto ela anda).
    const fimChao = S_CARTA - 0.95;
    sDe[n] = sT;
    definirPonto(n++, tx, yT, tz);
    for (let s = Math.ceil((sT + 0.25) / 0.5) * 0.5; s < fimChao && n < MAX - 6; s += 0.5) {
      const v = ok ? vooEm(s) : 0;
      sDe[n] = s;
      definirPonto(n++, x0 + desvio(s) + v * ladoAr(s), 0.02 + v * alturaAr(s), z0 - s);
    }
    const nChao = n;

    // Subida até a carta (ou deitado, quando solto).
    const tem = lerAncora();
    if (tem && ok) {
      const a = ultimaAncora;
      const k = suave(soltura);
      // O fio chega pelo lado (L metros à direita da âncora) e sobe em diagonal,
      // como um fio que pende da carta: no fim, longe da dica no centro da tela.
      const L = x0 + desvio(fimChao) - a.x;
      const sub = [
        [a.x + L, 0.02, a.z + 0.95, a.x + L, 0.02, a.z + 0.95],
        [a.x + L * 0.95, 0.04, a.z + 0.62, a.x + L * 0.86 + 0.02, 0.02, a.z + 0.6],
        [a.x + L * 0.8, a.y * 0.2, a.z + 0.32, a.x + L * 0.7 + 0.05, 0.02, a.z + 0.3],
        [a.x + L * 0.5, a.y * 0.62, a.z + 0.1, a.x + L * 0.55 + 0.09, 0.02, a.z + 0.05],
        [a.x, a.y, a.z, a.x + L * 0.45 + 0.12, 0.02, a.z - 0.18],
      ];
      for (const q of sub) definirPonto(n++, lerp(q[0], q[3], k), lerp(q[1], q[4], k), lerp(q[2], q[5], k));
    } else if (!ok) {
      definirPonto(n++, x0 + desvio(fimChao), 0.02, z0 - fimChao);
    } else {
      for (let s = fimChao; s < S_CARTA + 2.5; s += 0.6) definirPonto(n++, x0 + desvio(s), 0.02, z0 - s);
    }

    // Trança presa ao chão: o comprimento consumido do caminho anda junto com ela.
    let queda = 0;
    for (let i = 1; i < QUEDA + 1; i++) queda += Math.hypot(pontos[i].x - pontos[i - 1].x, pontos[i].y - pontos[i - 1].y, pontos[i].z - pontos[i - 1].z);
    alcance = G(sT);

    lista.length = 0;
    if (ok) {
      for (let i = 0; i < n; i++) lista.push(pontos[i]);
      fio.definirCurva(lista);
      if (fio.fase) fio.fase(alcance - queda);
      if (pontaS !== null) {
        // A ponta anda em metros de caminho, não em fração do fio (o fio muda de
        // tamanho enquanto a câmera anda e enquanto ele assenta): a fração sai do
        // comprimento da polilinha até ali.
        for (let i = nChao; i < n; i++) sDe[i] = fimChao + (i - nChao + 1) * ((S_CARTA - fimChao) / Math.max(1, n - nChao));
        acum[0] = 0;
        for (let i = 1; i < n; i++) acum[i] = acum[i - 1] + pontos[i].distanceTo(pontos[i - 1]);
        const total = acum[n - 1] || 1;
        let f = 1;
        if (pontaS <= sDe[0]) f = 0;
        else {
          for (let i = 1; i < n; i++) {
            if (sDe[i] >= pontaS) {
              const r = clamp((pontaS - sDe[i - 1]) / Math.max(1e-5, sDe[i] - sDe[i - 1]));
              f = (acum[i - 1] + (acum[i] - acum[i - 1]) * r) / total;
              break;
            }
          }
        }
        fio.progresso(f);
      }
      return;
    }

    // Leve: projeta tudo na câmera de mentira e dá a largura em px pela profundidade.
    leve.x = mundo.rig.position.x + cam.x;
    leve.z = rig.z;
    leve.inclinacao = cam.inclinacao;
    leve.guinada = cam.guinada;
    const focal = leve.a / (2 * leve.tanM);
    let comprimento = 0;
    const marcos = [];
    for (let i = 0; i < n; i++) {
      const p = pontos[i];
      if (i === 0) { p.px = ponta.x; p.py = ponta.y; p.prof = PROF_PULSO; } else leve.projetar(p, p);
      if (i > 0) comprimento += Math.hypot(p.px - pontos[i - 1].px, p.py - pontos[i - 1].py);
      marcos.push(comprimento);
      lista.push(p);
    }
    if (tem) {
      // a ponta sobe até a carta leve (px), com uma curva que nasce do chão
      const ult = pontos[n - 1];
      const ax = ultimaAncora.px;
      const ay = ultimaAncora.py;
      const k = 1 - suave(soltura);
      const meio = pontos[n];
      meio.px = lerp(ult.px, lerp(ult.px, ax, 0.55), k);
      meio.py = lerp(ult.py, lerp(ult.py, ay, 0.25), k);
      // pende em diagonal para a direita (≥ ~27°), como no 3D: longe da dica no centro
      meio.px = Math.max(meio.px, ax + Math.abs(meio.py - ay) * 0.5 * k);
      const fim = pontos[n + 1];
      fim.px = lerp(ult.px + 2, ax, k);
      fim.py = lerp(ult.py, ay, k);
      for (const p of [meio, fim]) {
        comprimento += Math.hypot(p.px - lista[lista.length - 1].px, p.py - lista[lista.length - 1].py);
        marcos.push(comprimento);
        p.prof = ult.prof;
        lista.push(p);
      }
    }
    perfil.length = 0;
    for (let i = 0; i < lista.length; i++) {
      const largM = i < QUEDA ? lerp(larguras.inicio, larguras.chao, i / QUEDA) : larguras.chao;
      const prof = lista[i].prof;
      // ao longe o fio afina até sumir no branco (a névoa do modo leve)
      const px = clamp((largM * focal) / Math.max(0.2, prof), 1.3, 9) * (1 - 0.92 * suave((prof - 6.5) / 3.5));
      const par = perfilPool[i];
      par[0] = comprimento > 0 ? marcos[i] / comprimento : 0;
      // a subida até a carta leve afina até a espessura do fio desenhado nela
      const subida = tem && i >= lista.length - 2;
      par[1] = i === 0 ? (larguras.inicio * focal) / PROF_PULSO : subida ? 2.4 : Math.min(px, 5);
      perfil.push(par);
    }
    fio.definirCurva(lista, { perfil, sombraDe: QUEDA / lista.length * 0.9 });
  }

  // ---- ciclo --------------------------------------------------------------
  function criar() {
    if (leve) leve.ajustar(mundo.tamanho.largura, mundo.tamanho.altura);
    montar.primeiro = true;
    // Primeira curva só para criar o fio com o tamanho certo.
    fio = criarFio(mundo, {
      curva: ok ? [new THREE.Vector3(0, 1, -1), new THREE.Vector3(0, 0, -3)] : [{ px: 0, py: 0 }, { px: 1, py: 1 }],
      largura: larguras.chao,
      larguraInicio: larguras.inicio,
      larguraFim: larguras.fim,
      crescerEm: 1.7,
      afinarEm: 0.9,
    });
    if (ok) mundo.cena.add(fio.objeto);
    montar();
    fio.progresso(0);
    return fio;
  }

  const pararTamanho = mundo.aoRedimensionar((t) => { if (leve) leve.ajustar(t.largura, t.altura); });
  const pararQuadro = mundo.aoQuadro((dt) => {
    if (parado || !fio) return;
    if (estado.fio !== fio) { parar(); return; }       // outra peça assumiu o fio
    if (soltando) {
      soltura = Math.min(1, soltura + dt / soltando.duracao);
      if (soltura >= 1) { montar(); parar(); return; }
    }
    montar();
  });
  const pararDiretor = diretor.aoMudar((cenaAtual, etapa) => {
    if (cenaAtual === 'final' && etapa === 'carta-abrindo') soltar();
  });

  function soltar(duracao = 1.8) {
    if (soltando || parado) return;
    lerAncora();
    soltando = { duracao: Math.max(0.2, duracao / Math.max(0.1, mundo.amb.rapido || 1)) };
  }

  function parar() {
    if (parado) return;
    parado = true;
    pararQuadro();
    pararTamanho();
    pararDiretor();
  }

  return {
    criar, soltar, parar, ar,
    /** Prende a ponta do fio a um ponto do mundo em vez da carta (null devolve à carta). */
    ancorar(v) { ancoraExtra = v || null; },
    get fio() { return fio; },
    get alcance() { return alcance; },
    /** A ponta em metros de caminho desde a partida (null devolve o controle a fio.progresso). */
    ponta(s) { pontaS = s === null || s === undefined ? null : Number(s) || 0; },
    get pontaS() { return pontaS; },
  };
}

// =============================================================================
// Pétalas deitadas sobre o fio (algumas caíram e ficaram ali).
// =============================================================================

function petalasNoChao(mundo, { z0, x0 }) {
  const { THREE } = mundo;
  const forma = new THREE.Shape();
  forma.moveTo(0, -0.018);
  forma.bezierCurveTo(0.013, -0.012, 0.016, 0.01, 0.003, 0.02);
  forma.lineTo(0, 0.016);
  forma.lineTo(-0.003, 0.02);
  forma.bezierCurveTo(-0.016, 0.01, -0.013, -0.012, 0, -0.018);
  const geometria = new THREE.ShapeGeometry(forma, 6);
  geometria.rotateX(-Math.PI / 2);
  // (sem névoa: no entardecer a névoa escura as deixava cinzentas, como riscos sobre o fio)
  const material = new THREE.MeshBasicMaterial({ color: '#b3123a', side: THREE.DoubleSide, transparent: true, opacity: 0.9, fog: false });
  const aleat = semente(23);
  const quantas = 22;
  const malha = new THREE.InstancedMesh(geometria, material, quantas);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const pos = new THREE.Vector3();
  const esc = new THREE.Vector3();
  for (let i = 0; i < quantas; i++) {
    const s = 3 + (i / quantas) * (S_CARTA - 4.5) + aleat() * 0.5;
    const lado = (aleat() - 0.5) * 0.22;
    pos.set(x0 + desvio(s) + lado, 0.025 + aleat() * 0.004, z0 - s);
    e.set((aleat() - 0.5) * 1.6, aleat() * Math.PI * 2, (aleat() - 0.5) * 1.2);
    q.setFromEuler(e);
    const k = 2.2 + aleat() * 1.1;
    esc.set(k, k, k);
    m.compose(pos, q, esc);
    malha.setMatrixAt(i, m);
  }
  malha.renderOrder = 5;
  malha.name = 'petalas-no-fio';
  return malha;
}

// =============================================================================
// A cena
// =============================================================================

const SUBLINHADO = `
  <svg class="botao-fio-linha" viewBox="0 0 120 10" preserveAspectRatio="none" aria-hidden="true" focusable="false">
    <path d="M2 6.2C18 3.6 31 7.6 47 5.6S77 3.2 92 5.4C102 6.8 110 5.2 118 4.2" pathLength="1"/>
  </svg>`;

export async function cenaMao(ctx, { frio } = {}) {
  const { conteudo, diretor, mundo, som, musica, recursos, estado, amb } = ctx;
  const gsap = window.gsap;
  const dados = conteudo.mao || {};
  const palcoFrases = document.getElementById('frases');
  const palco = document.getElementById('palco');
  const acoes = document.getElementById('acoes');
  const calmo = amb.reduzido;

  // ---- câmera: inclinação e o andar que segue a curva ------------------------
  const cam = { inclinacao: 0, guinada: 0, x: 0, y: 0, guiar: false };
  // O olhar que acompanha a estrela (só no mergulho): k mistura com a câmera de sempre.
  const olhar = { k: 0, guinada: 0, inclinacao: 0 };
  let x0 = mundo.rig.position.x;
  let z0 = mundo.rig.position.z;
  // A corrida: k de 0 (andando) a 1 (correndo). Por cima do passo do mundo vêm a
  // passada (o corpo quica a cada pé no chão), o ombro que troca de lado, o
  // tronco inclinado para a frente e a lente que abre um pouco com a velocidade.
  const corrida = { k: 0, fase: 0, lente: false };
  const pararCamera = mundo.aoQuadro((dt) => {
    const k = corrida.k;
    if (cam.guiar) {
      const s = z0 - mundo.rig.position.z;
      const alvoX = desvio(s + ANTECIPA) * 0.45;
      cam.x = amortecer(cam.x, alvoX, 2.2 + k, dt);
      const adiante = desvio(s + ANTECIPA + 2.4) * 0.6 - cam.x;
      // correndo, o olhar vira menos com a curva do fio: quem corre olha para onde vai
      cam.guinada = amortecer(cam.guinada, -Math.atan2(adiante, 3.2) * (0.75 - 0.3 * k), 2.4, dt);
    }
    if (!mundo.ok) return;
    let quique = 0; let ombro = 0; let arfar = 0; let rolo = 0;
    if (k > 0.001) {
      corrida.fase += Math.min(dt, 0.05) * 2.85;          // passadas por segundo
      const c = corrida.fase * Math.PI * 2;
      // cada pé no chão é um vale curto; o corpo passa mais tempo no ar
      quique = (0.5 - Math.pow(Math.abs(Math.sin(c * 0.5)), 0.7)) * 0.07 * k;
      ombro = Math.sin(c * 0.5) * 0.028 * k;
      arfar = Math.cos(c + 0.5) * 0.007 * k - 0.035 * k;
      rolo = Math.sin(c * 0.5 + 0.35) * 0.013 * k;
    }
    mundo.rig.position.x = x0 + cam.x + ombro;
    mundo.rig.position.y = cam.y + quique;
    mundo.rig.rotation.y = lerp(cam.guinada, olhar.guinada, olhar.k);
    mundo.camera.rotation.x += lerp(cam.inclinacao, olhar.inclinacao, olhar.k) + arfar;
    mundo.camera.rotation.z += rolo;
    if (corrida.lente) {
      mundo.camera.fov = fovPara(mundo.camera.aspect) + 9 * k;
      mundo.camera.updateProjectionMatrix();
      if (k <= 0.001) corrida.lente = false;
    }
  });

  // Inclinação conforme a tela: deitada, o campo vertical é menor e precisa olhar mais para baixo.
  const aspecto = (mundo.tamanho.largura || innerWidth) / (mundo.tamanho.altura || innerHeight);
  const olharMao = calmo ? 0 : -lerp(0.15, 0.24, clamp((aspecto - 0.6) / 1.0));

  let pararPose = () => {};
  let pararMagia = () => {};
  let limparEscrito = () => {};
  let clarear = null;                   // a tarde que clareia pela metade na caminhada
  let escurecer = null;                 // ... e volta a cair aos poucos até a chegada
  let ele = null;                       // ele, no fim do fio
  let surgirEle = null;
  const haEncontro = temEncontro(ctx.conteudo);
  let inteira = false;                  // chegou ao fim com o encontro por vir (o entardecer continua aceso)
  try {
    // 1. O capítulo fecha e a carta vai embora.
    if (frio) musica.mostrarMini();
    else if (ctx.pergaminho && ctx.pergaminho.estado === 'oculto') {
      // a cena anterior já enrolou o pergaminho e devolveu o mundo: só a carta que
      // tiver ficado vai embora (sem enrolar de novo)
      const env0 = estado.envelope;
      estado.envelope = null;
      if (env0) await env0.irEmbora().then(() => env0.dispose()).catch(() => {});
    } else await voltarAoMundo(ctx);
    mundo.petalas.definirDensidade(1);
    x0 = mundo.rig.position.x;
    z0 = mundo.rig.position.z;

    // 2. A frase. A câmera inclina um pouco, para o chão.
    diretor.etapa('olha');
    const frase = el('p', 'frase');
    palcoFrases.append(frase);
    if (olharMao) gsap.to(cam, { inclinacao: olharMao, duration: 3.4, ease: curvas.branco.camera });
    const fraseLida = revelarPalavras(frase, dados.frase || '', { intervalo: 0.24, duracao: 1.8 });
    // O que ele escreveu na palma dela (só na mão desenhada; vazio = nada).
    const escrito = typeof dados.escrito === 'string' ? dados.escrito.trim() : '';
    const letraPronta = fonteDoEscrito(escrito);
    caberEmDuasLinhas(frase);

    // 3. A mão sobe e se desenha, já enquanto a frase ainda assenta.
    const [imagem] = await Promise.all([
      recursos.elementoImagem(dados.imagem, ''),
      espera(calmo ? 500 : 1000),
    ]);
    const corpo = el('div', 'mao-corpo');
    const mao = el('div', { class: imagem ? 'mao mao-com-imagem' : 'mao', 'aria-hidden': 'true' }, corpo);
    let desenho = null;
    if (imagem) corpo.append(imagem);
    else {
      desenho = montarDesenho(amb);
      corpo.append(desenho.raiz);
    }
    palco.append(mao);
    // O véu: quando ela vê o fio, a alameda escurece um pouco nas bordas (o mundo
    // prende a respiração) e a luz do laço passa a ler como luz sobre o fundo claro.
    // Fica atrás de tudo no palco; só opacidade.
    const veu = el('div', { class: 'mao-veu', 'aria-hidden': 'true' });
    palco.prepend(veu);
    // Frase longa (duas linhas grandes) não fica embaixo dos dedos: a mão desce um pouco.
    const invade = frase.getBoundingClientRect().bottom + 14 - mao.getBoundingClientRect().top;
    if (invade > 0) mao.style.top = `${mao.offsetTop + Math.min(invade, innerHeight * 0.14)}px`;

    // Pose da mão (aplicada por quadro) e onde está a ponta solta do fio, em px.
    const pose = { y: calmo ? 0 : 96, rot: calmo ? 0 : 2.4, opacidade: 0, respiro: calmo ? 0.25 : 1, balanco: 0, caudaKick: 0, zoom: 1, luz: 0 };
    const caixa = { left: 0, top: 0, width: 1, height: 1 };
    const medir = () => {
      // offset* ignora o transform: é a caixa de repouso.
      caixa.left = mao.offsetLeft; caixa.top = mao.offsetTop;
      caixa.width = mao.offsetWidth || 1; caixa.height = mao.offsetHeight || 1;
      // a âncora da imagem é relativa à própria imagem (ela pode ser mais estreita que a caixa)
      foto.left = caixa.left + (imagem ? imagem.offsetLeft : 0);
      foto.top = caixa.top + (imagem ? imagem.offsetTop : 0);
      foto.width = (imagem && imagem.offsetWidth) || caixa.width;
      foto.height = (imagem && imagem.offsetHeight) || caixa.height;
      // o centro do véu: o ponto para onde o zoom vai (perto do laço)
      veu.style.setProperty('--vx', `${(caixa.left + caixa.width * ORIGEM_X).toFixed(0)}px`);
      veu.style.setProperty('--vy', `${(caixa.top + caixa.height * ORIGEM_Y).toFixed(0)}px`);
    };
    const foto = { left: 0, top: 0, width: 1, height: 1 };
    // O zoom e o véu giram em volta do nó do laço (no desenho, onde a projeção o pôs;
    // com a imagem do autor, o ponto de sempre, igual ao transform-origin do css).
    const ORIGEM_X = desenho ? desenho.no[0] / VB_L : 0.69;
    const ORIGEM_Y = desenho ? desenho.no[1] / VB_A : 0.69;
    if (desenho) corpo.style.transformOrigin = `${(ORIGEM_X * 100).toFixed(2)}% ${(ORIGEM_Y * 100).toFixed(2)}%`;
    medir();
    const pararMedida = mundo.aoRedimensionar(medir);
    const ouvirJanela = () => medir();
    window.addEventListener('resize', ouvirJanela, { passive: true });

    const ancoraImagem = dados.ancoraFio || {};
    const ponta = { x: 0, y: 0 };
    let anguloCauda = 0;
    let tPose = 0;
    // O que está vivo na pose neste quadro (respiração e o olhar que acompanha o
    // dedo): o começo do fio 3D usa os mesmos números, para não descolar do nó.
    const vivo = { x: 0, y: 0, rot: 0 };
    function pulsoPx() {
      let vx; let vy;
      if (desenho) {
        // ponta da cauda girada em torno do nó, em unidades do viewBox
        const [kx, ky] = desenho.no;
        const [px, py] = desenho.pontaSolta;
        const a = (anguloCauda * Math.PI) / 180;
        vx = (kx + (px - kx) * Math.cos(a) - (py - ky) * Math.sin(a)) / VB_L;
        vy = (ky + (px - kx) * Math.sin(a) + (py - ky) * Math.cos(a)) / VB_A;
      } else {
        vx = clamp(Number(ancoraImagem.x ?? 0.5));
        vy = clamp(Number(ancoraImagem.y ?? 0.62));
      }
      const ox = caixa.left + caixa.width * ORIGEM_X;
      const oy = caixa.top + caixa.height * ORIGEM_Y;
      const x = (foto.left + foto.width * vx - ox) * pose.zoom;
      const y = (foto.top + foto.height * vy - oy) * pose.zoom;
      const r = ((pose.rot + vivo.rot) * Math.PI) / 180;
      ponta.x = ox + x * Math.cos(r) - y * Math.sin(r) + vivo.x;
      ponta.y = oy + x * Math.sin(r) + y * Math.cos(r) + pose.y + vivo.y;
      return ponta;
    }

    const caudaG = desenho && desenho.cordao.caudaG;
    const folga = { x: 0, y: 0 };
    pararPose = mundo.aoQuadro((dt, t) => {
      tPose = t;
      // Primeira pessoa: a mão é dela. Respira com ela e, como está perto dos
      // olhos, desliza um pouco contra o olhar quando o dedo (ou o ponteiro) anda.
      const pt = mundo.ponteiro;
      const olho = pt && pt.ativo && !calmo ? pose.respiro : 0;
      folga.x = amortecer(folga.x, olho ? clamp(pt.x, -1, 1) * -9 : 0, 2.6, dt);
      folga.y = amortecer(folga.y, olho ? clamp(pt.y, -1, 1) * 5 : 0, 2.6, dt);
      vivo.x = folga.x;
      vivo.y = folga.y + Math.sin(t * 1.15) * 2.4 * pose.respiro;
      vivo.rot = Math.sin(t * 0.83 + 0.6) * 0.38 * pose.respiro + folga.x * 0.045;
      corpo.style.transform = `translate3d(${vivo.x.toFixed(2)}px, ${(pose.y + vivo.y).toFixed(2)}px, 0) rotate(${(pose.rot + vivo.rot).toFixed(3)}deg) scale(${pose.zoom.toFixed(4)})`;
      corpo.style.opacity = pose.opacidade.toFixed(3);
      if (desenho) {
        // a luz do nó respira devagar enquanto está acesa
        const luz = pose.luz * (0.82 + 0.18 * Math.sin(t * 1.7));
        desenho.luz.setAttribute('opacity', luz.toFixed(3));
        desenho.brasas.atualizar(Math.min(dt, 0.05), t);
      }
      if (caudaG) {
        const vento = calmo ? 1.2 : 4.5;
        anguloCauda = (Math.sin(t * 1.55) * 0.7 + Math.sin(t * 2.6 + 1.1) * 0.3) * vento * pose.balanco + pose.caudaKick;
        caudaG.setAttribute('transform', `rotate(${anguloCauda.toFixed(2)} ${desenho.no[0].toFixed(2)} ${desenho.no[1].toFixed(2)})`);
      }
    });
    void tPose;

    // O desenho e a frase correm juntos; o botão vem quando os dois assentaram.
    await Promise.all([desenharMao(gsap, { pose, desenho, imagem, calmo, mundo }), fraseLida, letraPronta]);

    // 3a. As palavras são escritas na palma, devagar. Quem usa leitor de tela as
    // recebe numa região viva (o desenho é só imagem).
    if (desenho && escrito) {
      const letras = criarEscrito(desenho.escrito, escrito);
      const leitor = el('p', { class: 'so-leitor', 'aria-live': 'polite' });
      mao.after(leitor);
      limparEscrito = () => leitor.remove();
      requestAnimationFrame(() => requestAnimationFrame(() => { leitor.textContent = escrito; }));
      await escreverNaPalma(gsap, { letras, camada: desenho.escrito, calmo, som });
    }

    // 3b. O momento em que ela vê: o tempo quase para (as pétalas desaceleram), o
    // olhar chega perto do pulso (o foco vem para a mão e o resto desfoca), o laço
    // acende por dentro, uma luz quente percorre o cordão uma vez e solta poeira de luz.
    gsap.to(veu, { opacity: calmo ? 0.7 : 1, duration: calmo ? 1.2 : 3.2, ease: curvas.branco.camera });
    await verOFio(gsap, { pose, desenho, calmo, mundo, cam, olharMao, som });

    // 4. O botão. Antes dele, o caminho já existe, invisível: a última carta lá
    // dentro do branco (só no 3D; além da névoa ela é só branco) e o fio com
    // progresso 0. Os programas de shader compilam agora, não no toque.
    diretor.etapa('mao-espera');
    let env = null;
    const criarCarta = (chegada) => {
      env = criarEnvelope(mundo, { lacre: null, amarracao: 'fio', chegada });
      if (mundo.ok) {
        env.grupo.position.set(x0, ALTURA_CARTA, z0 - S_CARTA);
        mundo.cena.add(env.grupo);
      }
      estado.envelope = env;
      // Com o encontro, a carta só aparece depois dele, de dentro do clarão: até lá
      // fica escondida (o fio já termina nela).
      if (haEncontro) {
        estado.cartaEscondida = true;
        if (mundo.ok) env.grupo.visible = false;
      }
      cuidarDaCarta(ctx, env);
    };
    if (mundo.ok) criarCarta(2.4);

    const seguidor = criarSeguidor(ctx, { z0, x0, pulsoPx, cam });
    const fio = seguidor.criar();
    estado.fio = fio;
    estado.seguidorFio = { parar: () => seguidor.parar(), soltar: (d) => seguidor.soltar(d), ancorar: (v) => seguidor.ancorar(v) };
    // Ele, lá no fim do fio (invisível até ela seguir): o fio passa a terminar na mão dele.
    if (mundo.ok && haEncontro && dados.ele !== false) {
      try { ele = criarEle(mundo); } catch (e) { console.error(e); ele = null; }
      if (ele) {
        ele.grupo.position.set(x0 + ELE_X, 0, z0 - S_CARTA - ELE_ATRAS);
        mundo.cena.add(ele.grupo);
        seguidor.ancorar(ele.ancora());
        estado.ele = ele;
      }
    }
    // Uma caminhada só, até a carta: a cena final já começa na frente dela.
    estado.distanciaFinal = 0;
    let petalasChao = null;
    if (mundo.ok && amb.nivel !== 'baixo') {
      petalasChao = petalasNoChao(mundo, { z0, x0 });
      petalasChao.visible = false;
      fio.objeto.add(petalasChao);
    }
    // a carta pelo preparar() dela: compila também a variante translúcida (na névoa) e sobe as texturas
    if (mundo.ok) await aquecer(mundo, [fio.objeto, ele && ele.grupo], env && env.preparar ? [env.preparar()] : [env && env.grupo]);

    const botao = el('button', { class: 'botao botao-fio', type: 'button', dataset: { acao: 'seguir-fio' } }, [
      el('span', { class: 'botao-fio-texto', texto: dados.botao || '' }),
      svg(SUBLINHADO),
    ]);
    // Nome para leitores de tela: o texto do botão ou, sem ele, o rótulo do content.js.
    const rotulo = dados.botao || dados.rotuloBotao;
    if (rotulo) botao.setAttribute('aria-label', rotulo);
    acoes.append(botao);
    requestAnimationFrame(() => botao.classList.add('botao-fio-visivel'));
    // Quem navega pelo teclado não fica perdido no body: o foco vai para a ação da etapa.
    // (Só sem toque: no celular o anel de foco apareceria sobre o botão sem ninguém ter usado teclado.)
    if (!amb.toque && (!document.activeElement || document.activeElement === document.body)) {
      try { botao.focus({ preventScroll: true }); } catch { /* sem foco programático */ }
    }
    await new Promise((ok) => botao.addEventListener('click', ok, { once: true }));

    // 5. O fio sai do pulso e vira o caminho.
    diretor.etapa('correndo');
    botao.disabled = true;
    som.destravar();
    som.efeito('toque');
    gsap.to(botao, { autoAlpha: 0, duration: 0.5, ease: curvas.branco.sair, onComplete: () => botao.remove() });
    ocultarPalavras(frase).then(() => frase.remove());
    if (petalasChao) petalasChao.visible = true;
    if (desenho) desenho.brasas.taxa = 0;
    const magico = !calmo && mundo.ok;
    if (!magico) {
      // o tempo volta a andar e o foco volta para longe
      mundo.petalas.definirTempo?.(1);
      mundo.petalas.definirFoco?.();
    }

    // O entardecer: a alameda escurece e esfria um pouco (a foto, não o fio), e a
    // luz do fio passa a ler como luz. O véu da mão sai: quem escurece agora é o mundo.
    entardecer(ctx, true, calmo ? 1.6 : 2.8);
    gsap.to(veu, { opacity: 0, duration: 2.4, ease: 'sine.inOut', onComplete: () => veu.remove() });
    const luzFio = { halo: 0 };
    gsap.to(luzFio, { halo: calmo ? 0.6 : 0.55, duration: 2.6, ease: 'sine.inOut', onUpdate: () => fio.halo?.(luzFio.halo) });
    // a luz do nó escorre para o fio: ela vira a estrela que desenha o caminho
    gsap.to(pose, { luz: 0, duration: magico ? 2.4 : 1.6, delay: magico ? 0.9 : 0, ease: 'power1.in' });
    fio.rastro?.(calmo ? 0 : 1);
    fio.estrela?.(0, magico ? 30 : 16, 1);
    // Ele aparece ao longe quando o fio já corre para lá (no plano aberto do mergulho).
    if (ele) surgirEle = gsap.delayedCall(magico ? 5.2 : 1.2, () => ele.mostrar(calmo ? 1.6 : 4));

    const pontaFio = mundo.ok ? new mundo.THREE.Vector3() : null;
    pararMagia = mundo.aoQuadro((dt) => {
      if (!magico || !fio.pontoEm) return;
      const k = fio.progresso();
      if (k <= 0.001 || k >= 0.999) return;
      fio.pontoEm(k, pontaFio);
      mundo.petalas.magia?.(pontaFio, 1);
      if (olhar.k > 0.001) {
        // o olhar acompanha a estrela de perto, com ela um pouco abaixo do centro
        const r = mundo.rig.position;
        const dx = pontaFio.x - r.x;
        const dy = pontaFio.y - (r.y + ALTURA_OLHOS);
        const dz = Math.max(0.35, r.z - pontaFio.z);
        const guinada = clamp(-Math.atan2(dx, dz), -0.6, 0.6);
        const inclinacao = clamp(Math.atan2(dy, Math.hypot(dx, dz)) * 0.9 + 0.07, -0.62, 0.12);
        olhar.guinada = amortecer(olhar.guinada, guinada, 3.4, dt);
        olhar.inclinacao = amortecer(olhar.inclinacao, inclinacao, 3.4, dt);
      }
    });

    let andado = 0;                     // o que a câmera já avançou antes da caminhada
    let saida;
    let extensao;
    if (magico) {
      // O mergulho: o olhar chega ao pulso, a estrela nasce do nó e desenha o fio
      // no ar; a câmera vai atrás dela; depois recua e sobe, e o fio inteiro
      // aparece serpenteando pela alameda até sumir na névoa, com a luz correndo nele.
      // Quanto a mão desce para sair inteira do quadro, como quem abaixa o braço: as
      // pontas dos dedos (no alto da caixa, já com o zoom do mergulho) passam da borda de baixo.
      const noY = caixa.top + caixa.height * ORIGEM_Y;
      const descer = caixa.height * ORIGEM_Y * ZOOM_MERGULHO + Math.max(0, mundo.tamanho.altura - noY) + 48;
      saida = mergulhar(gsap, { pose, descer, cam, olhar, fio, seguidor, mundo, som, olharMao, z0 });
      await saida.pronto;
      andado = Math.max(0, z0 - mundo.rig.position.z);
      extensao = Promise.resolve();
    } else {
      if (!calmo) {
        const nasce = { k: 0 };
        gsap.to(nasce, { k: 1, duration: 0.5, ease: curvas.branco.entrar, onUpdate: () => fio.estrela?.(nasce.k) });
      }
      // O nó dá um puxão: a ponta solta estica antes do fio correr.
      if (desenho && !calmo) {
        gsap.timeline()
          .to(pose, { caudaKick: -9, duration: 0.22, ease: curvas.ui.resposta, overwrite: 'auto' })
          .to(pose, { caudaKick: 0, duration: 1.6, ease: curvas.branco.entrar });
      }
      // Dois tempos: o fio escorre da ponta solta até o chão, ao lado da mão; depois
      // corre pelo chão para longe, rápido no começo e assentando devagar.
      const queda = clamp(1.9 / Math.max(1, fio.comprimento), 0.08, 0.3);
      const revelar = { p: 0 };
      extensao = new Promise((ok) => {
        const tl = gsap.timeline({ onComplete: ok, onUpdate: () => fio.progresso(revelar.p) });
        if (calmo) tl.to(revelar, { p: 1, duration: 1.6, ease: curvas.branco.deriva });
        else {
          tl.to(revelar, { p: queda, duration: 1.1, ease: curvas.branco.camera })
            .to(revelar, { p: 1, duration: 5.2, ease: 'power2.out' }, 1.0);
        }
      }).then(() => {
        const o = { k: 1 };
        gsap.to(o, { k: 0, duration: 1.2, ease: 'power1.out', onUpdate: () => { fio.estrela?.(o.k); fio.rastro?.(calmo ? 0 : o.k); } });
      });
      if (!calmo) gsap.to(cam, { inclinacao: olharMao * 1.1, duration: 1.8, ease: curvas.branco.camera });
      await espera(calmo ? 600 : 900);
      gsap.to(pose, { respiro: 0, duration: 1.0, ease: 'none' });
      saida = calmo
        // sem deslocamento: some por opacidade e, já invisível, o pulso sai de quadro
        ? gsap.to(pose, { opacidade: 0, duration: 1.0, ease: 'none', onComplete: () => { pose.y = caixa.height * 1.15 + 80; } })
        : gsap.timeline()
          .to(pose, { y: caixa.height * 1.15 + 80, rot: -2.5, duration: 1.8, ease: curvas.branco.camera }, 0)
          .to(pose, { opacidade: 0, duration: 0.45, ease: 'none' }, 1.35);
      await espera(calmo ? 200 : 400);
    }

    // 6. Ela CORRE seguindo o fio, de uma vez só, e desacelera até parar diante
    // dele (a alguns passos: é ali, entre os dois, que as cartas estão no chão).
    // Movimento reduzido: sem corrida nem balanço; a distância some numa dissolvência.
    cam.guiar = !calmo;
    const DURACAO = clamp(Number(conteudo.corrida && conteudo.corrida.segundos) || 7, 5, 10);
    if (!calmo) {
      gsap.timeline()
        .to(cam, { inclinacao: olharMao * 0.3, y: 0, duration: 1.3, ease: curvas.branco.camera, overwrite: 'auto' })
        .to(cam, { inclinacao: 0, duration: 2.0, ease: curvas.branco.camera }, DURACAO - 2.2);
      if (mundo.ok) {
        corrida.lente = true;
        gsap.timeline()
          .to(corrida, { k: 1, duration: 1.1, ease: 'power2.out' }, 0)
          .to(corrida, { k: 0, duration: DURACAO * 0.36, ease: 'sine.inOut' }, DURACAO * 0.62);
      }
    } else {
      cam.inclinacao = 0;
    }
    const andar = mundo.caminhar({
      distancia: Math.max(0.5, CAMINHADA + RESTO - andado), duracao: DURACAO, curva: calmo ? undefined : curvaDaCorrida,
    });
    // Andando, a tarde clareia pela metade: a alameda volta a ter cor (o rosa das
    // cerejeiras não fica cinza a caminhada inteira) e o fio ainda lê como luz.
    // Com o encontro por vir ela clareia menos: a caminhada já vai dar no crepúsculo dele,
    // e a luz não pode ir ao dia e voltar em poucos segundos.
    // Depois de clarear, a tarde volta a cair, e ela chega no fim do dia (com o
    // encontro, quase no crepúsculo dele).
    if (magico) {
      clarear = gsap.delayedCall(0.5, () => entardecer(ctx, haEncontro ? 0.58 : 0.4, DURACAO * 0.36));
      escurecer = gsap.delayedCall(DURACAO * 0.42, () => entardecer(ctx, haEncontro ? 0.93 : 0.62, DURACAO * 0.56));
    }
    // A câmera assenta no eixo da carta durante o fim da própria corrida.
    const ALINHAR = calmo ? 0.3 : 1.5;
    const alinhada = espera((DURACAO - ALINHAR) * 1000).then(() => new Promise((ok) => {
      cam.guiar = false;
      gsap.to(cam, { x: 0, guinada: 0, duration: ALINHAR, ease: curvas.branco.camera, onComplete: ok });
    }));
    if (!mundo.ok) {
      // Leve: a carta nasce do branco perto do fim e pousa quando ela para.
      await espera(DURACAO * 1000 * (calmo ? 0.1 : 0.72));
      criarCarta(haEncontro ? false : calmo ? 1.2 : 3.6);
    }
    await Promise.all([andar, extensao, alinhada]);
    if (saida && saida.progress) await new Promise((ok) => (saida.progress() >= 1 ? ok() : saida.eventCallback('onComplete', ok)));
    pararMagia();
    mundo.petalas.magia?.(null);
    cam.guiar = false;
    cam.x = 0; cam.guinada = 0; cam.inclinacao = 0; cam.y = 0;
    corrida.k = 0;
    olhar.k = 0;

    // 7. Chegada: a luz corre pelo fio inteiro até o laço da carta, que acende; e a luz do dia volta.
    // (com o encontro, a chegada é dele: a luz corre pelo fio, o crepúsculo fecha e os quadros entram)
    const cartaAqui = estado.envelope;
    if (haEncontro) inteira = true;
    else if (fio.pulso) {
      const chegou = fio.pulso({ de: 0, ate: 1.02, duracao: calmo ? 1.6 : 2.8, forca: 1.15, largura: 0.8, brasas: 20, curva: 'power1.inOut' });
      await espera(calmo ? 700 : 2200);
      cartaAqui?.brilharLaco?.(0.85, calmo ? 0.6 : 1.1);
      som.efeito('brilho');
      await chegou;
    }
    if (!haEncontro) {
      entardecer(ctx, false, calmo ? 1.6 : 3.2);
      gsap.to(luzFio, { halo: 0.12, duration: 3, ease: 'sine.inOut', onUpdate: () => fio.halo?.(luzFio.halo) });
    }

    pararPose();
    pararMedida();
    window.removeEventListener('resize', ouvirJanela);
    mao.remove();
  } finally {
    clarear?.kill();
    escurecer?.kill();
    surgirEle?.kill();
    if (!inteira && ele) {              // a cena quebrou no meio: ele não fica para trás
      ele.dispose();
      if (estado.ele === ele) estado.ele = null;
      estado.seguidorFio?.ancorar?.(null);
    }
    if (!inteira) entardecer(ctx, false, 1.2);          // com o encontro, o crepúsculo fica para ele
    olhar.k = 0;
    limparEscrito();
    pararPose();
    pararMagia();
    pararCamera();
    mundo.petalas.definirTempo?.(1);
    mundo.petalas.definirDensidade(1);
    mundo.petalas.magia?.(null);
    if (mundo.ok) {
      if (corrida.lente) {              // a lente da corrida volta ao normal
        mundo.camera.fov = fovPara(mundo.camera.aspect);
        mundo.camera.updateProjectionMatrix();
      }
      mundo.rig.position.x = x0;
      mundo.rig.position.y = 0;
      mundo.rig.rotation.y = 0;
    }
  }
}

// =============================================================================
// O entardecer: enquanto o fio está acordado, a alameda escurece e esfria um
// pouco e a névoa vai junto, para o fio ao longe sumir numa névoa da mesma cor.
// Com WebGL é a luz da alameda 3D (mundo.alameda.tarde: luz, névoa e céu); sem
// WebGL, uma camada sobre a imagem da alameda (css/mao.css, só opacidade). O fio
// e a luz dele ficam por cima, intactos: a magia se lê por contraste de luz.
// =============================================================================

const NEVOA_TARDE = '#8d7f95';
const ZOOM_MERGULHO = 2.5;            // quanto o olhar chega perto do nó no mergulho
const tarde = { k: 0, alvo: 0, base: null, tween: null };

export function entardecer(ctx, ligar, duracao = 2.6) {
  const raiz = document.documentElement;
  // ligar: true (1), false (0) ou um nível 0..1 (na caminhada a tarde clareia pela metade)
  const alvo = typeof ligar === 'number' ? clamp(ligar, 0, 1) : (ligar ? 1 : 0);
  if (tarde.alvo === alvo) return;
  tarde.alvo = alvo;
  const rapido = Math.max(0.1, ctx.amb.rapido || 1);
  raiz.style.setProperty('--entardecer-dur', `${(duracao / rapido).toFixed(2)}s`);
  raiz.style.setProperty('--entardecer-k', String(alvo));
  raiz.classList.toggle('entardecer', alvo > 0);
  const { mundo } = ctx;
  const gsap = window.gsap;
  if (!mundo.ok || !mundo.cena.fog || !gsap) return;
  if (tarde.tween) tarde.tween.kill();
  if (mundo.alameda) {
    tarde.tween = gsap.to(tarde, { k: alvo, duration: duracao, ease: 'sine.inOut', onUpdate: () => mundo.alameda.tarde(tarde.k) });
    return;
  }
  if (!raiz.classList.contains('com-fundo')) return;      // sem a alameda o mundo é branco: só o fio acende
  const nevoa = mundo.cena.fog.color;
  if (!tarde.base) tarde.base = nevoa.clone();
  const escura = new mundo.THREE.Color(NEVOA_TARDE);
  tarde.tween = gsap.to(tarde, {
    k: alvo,
    duration: duracao,
    ease: 'sine.inOut',
    onUpdate: () => { if (tarde.base) nevoa.copy(tarde.base).lerp(escura, tarde.k); },
    onComplete: () => { if (!alvo) tarde.base = null; },
  });
}

/**
 * O mergulho (só com WebGL e sem movimento reduzido). Devolve a timeline com
 * `.pronto` (Promise): resolve quando o plano aberto terminou e a caminhada pode começar.
 *   0,0  o olhar mergulha no pulso: a mão cresce em volta do nó (ZOOM_MERGULHO), a lente abre
 *        (as pétalas da frente viram luz macia)
 *   0,9  a estrela nasce do nó, num clarão que assenta
 *   1,1  ela desenha o fio no ar, numa curva larga; o olhar vai atrás dela, de perto,
 *        e a mão fica para trás
 *   4,4  a câmera recua e sobe; o fio assenta no chão de perto para longe e a
 *        estrela corre até sumir na névoa; um pulso de luz percorre o fio inteiro
 */
function mergulhar(gsap, { pose, descer, cam, olhar, fio, seguidor, mundo, som, olharMao, z0 }) {
  const rig = mundo.rig.position;
  const petalas = mundo.petalas;
  const ar = seguidor.ar;
  const ponta = { s: 0 };
  const estrela = { k: 0, escala: 2.8 };
  const aplicarEstrela = () => fio.estrela?.(estrela.k, undefined, estrela.escala);
  const aplicarPonta = () => seguidor.ponta(ponta.s);
  seguidor.ponta(0);
  ar.k = 1;
  ar.assentar = 0;
  olhar.guinada = cam.guinada;
  olhar.inclinacao = cam.inclinacao;
  olhar.k = 0;
  petalas.definirFoco?.(0.9);
  petalas.definirAbertura?.(3.2);

  const tl = gsap.timeline();
  // 1. o mergulho no pulso
  tl.to(pose, { zoom: ZOOM_MERGULHO, duration: 2.6, ease: 'power2.inOut' }, 0)
    .to(cam, { inclinacao: olharMao * 1.4, duration: 2.6, ease: curvas.branco.camera, overwrite: 'auto' }, 0)
    .to(pose, { caudaKick: -12, duration: 0.5, ease: 'sine.inOut' }, 0.45)
    .to(pose, { caudaKick: 0, duration: 1.8, ease: curvas.branco.entrar }, 0.95)
    // 2. a estrela nasce do nó
    .add(() => som.efeito('brilho'), 0.8)
    .to(estrela, { k: 1, duration: 0.5, ease: curvas.branco.entrar, onUpdate: aplicarEstrela }, 0.9)
    .to(estrela, { escala: 1.15, duration: 1.8, ease: 'sine.inOut', onUpdate: aplicarEstrela }, 1.15)
    // 3. ela desenha o fio no ar; o olhar vai atrás
    .to(ponta, { s: 4.6, duration: 3.8, ease: 'sine.inOut', onUpdate: aplicarPonta }, 1.1)
    .to(olhar, { k: 1, duration: 1.8, ease: 'sine.inOut' }, 1.3)
    .to(pose, { respiro: 0, duration: 1.0, ease: 'none' }, 1.8)
    // a mão sai de quadro para baixo (o braço abaixa): sem crescer mais, até a última ponta de dedo passar da borda
    .to(pose, { y: descer, rot: -3, duration: 1.75, ease: 'power2.in' }, 1.9)
    .to(pose, { opacidade: 0, duration: 0.15, ease: 'none' }, 3.65)
    .to(rig, { z: z0 - 2.3, duration: 3.6, ease: 'power2.inOut' }, 1.6)
    // 4. o plano aberto: recua e sobe, e o fio inteiro aparece
    .to(olhar, { k: 0, duration: 2.8, ease: 'sine.inOut' }, 4.5)
    .to(cam, { guinada: 0, inclinacao: -0.12, y: 0.42, duration: 3.6, ease: 'power2.inOut', overwrite: 'auto' }, 4.4)
    .to(rig, { z: z0 - 1.5, duration: 3.6, ease: 'power2.inOut' }, 4.4)
    .add(() => { petalas.definirFoco?.(); petalas.definirAbertura?.(1); petalas.definirTempo?.(1); }, 4.6)
    .to(ar, { assentar: 1, duration: 4.2, ease: 'sine.inOut' }, 4.7)
    .to(ponta, { s: S_CARTA + 1, duration: 4.3, ease: 'power1.in', onUpdate: aplicarPonta }, 4.9)
    .add(() => { fio.pulso?.({ de: 0, ate: 1, duracao: 3.6, forca: 1.25, largura: 0.9, brasas: 26 }); }, 5.9)
    .to(estrela, { k: 0, escala: 0.8, duration: 1.2, ease: 'power1.out', onUpdate: aplicarEstrela }, 8.1)
    .add(() => {
      seguidor.ponta(null);
      fio.progresso(1);
      fio.rastro?.(0);
      ar.k = 0;
    }, 9.3);
  tl.pronto = new Promise((ok) => tl.eventCallback('onComplete', ok));
  return tl;
}

/**
 * A coreografia do desenho: o contorno em sequência (como uma pena), a aguada,
 * as linhas da palma e os vincos, e por fim o cordão, o nó e a ponta que cai.
 */
function desenharMao(gsap, { pose, desenho, imagem, calmo }) {
  return new Promise((resolver) => {
    const tl = gsap.timeline({ onComplete: resolver });
    if (imagem) {
      tl.to(pose, { opacidade: 1, duration: 1.0, ease: 'none' }, 0)
        .to(pose, { y: 0, rot: 0, duration: 2.2, ease: curvas.branco.entrar }, 0.18)
        .add(() => {}, 2.4);
      return;
    }
    const { contorno, detalhes, vincos, cordao, fundo } = desenho;
    const desenhar = (traco, inicio, duracao, ease = 'power1.inOut') => {
      const estado = { p: 0 };
      traco.desenhar(0);
      tl.to(estado, { p: 1, duration: duracao, ease, onUpdate: () => traco.desenhar(estado.p) }, inicio);
    };
    gsap.set(fundo, { opacity: 0 });

    if (calmo) {
      // Movimento reduzido: aparece por opacidade, o desenho se completa depressa.
      tl.to(pose, { opacidade: 1, duration: 1.0, ease: 'none' }, 0);
      for (const t of [...contorno, ...detalhes, ...vincos]) desenhar(t, 0, 0.9, 'none');
      tl.to(fundo, { opacity: 1, duration: 0.9, ease: 'none' }, 0);
      desenhar(cordao.volta, 0.3, 0.6, 'none');
      desenhar(cordao.curta, 0.5, 0.4, 'none');
      desenhar(cordao.longa, 0.5, 0.5, 'none');
      tl.set(cordao.no, { attr: { transform: `translate(${desenho.no[0].toFixed(2)} ${desenho.no[1].toFixed(2)}) scale(${desenho.escalaNo})` } }, 0.5);
      tl.to(pose, { balanco: 1, duration: 0.8, ease: 'none' }, 0.6);
      return;
    }

    tl.to(pose, { opacidade: 1, duration: 0.4, ease: 'none' }, 0)
      .to(pose, { y: 0, rot: 0, duration: 3.0, ease: curvas.branco.entrar }, 0);

    // Contorno: velocidade de pena (~unidades por segundo), cada traço começa
    // pouco antes do anterior acabar.
    const VEL = 300;
    let t = 0.15;
    contorno.forEach((traco, i) => {
      const d = clamp(traco.comprimento / VEL, 0.32, 1.25);
      const ultimo = i === contorno.length - 1;
      desenhar(traco, t, d, i < 2 || ultimo ? curvas.branco.entrar : 'power1.inOut');
      t += d * (i === 0 ? 0.3 : 0.62);
    });
    const fimContorno = t + 0.3;
    tl.to(fundo, { opacity: 1, duration: 1.5, ease: curvas.branco.entrar }, fimContorno - 0.9);
    let t2 = fimContorno - 0.5;
    detalhes.forEach((traco) => {
      const d = clamp(traco.comprimento / (VEL * 0.85), 0.28, 0.75);
      desenhar(traco, t2, d, curvas.branco.entrar);
      t2 += d * 0.35;
    });
    vincos.forEach((traco, i) => desenhar(traco, t2 - 0.2 + i * 0.035, 0.22, curvas.branco.entrar));
    const tCordao = t2 + vincos.length * 0.035 + 0.05;
    desenhar(cordao.volta, tCordao, 0.85, curvas.branco.camera);
    tl.to(cordao.no, {
      attr: { transform: `translate(${desenho.no[0].toFixed(2)} ${desenho.no[1].toFixed(2)}) scale(${desenho.escalaNo})` },
      duration: 0.5, ease: curvas.branco.entrar,
    }, tCordao + 0.72);
    desenhar(cordao.curta, tCordao + 0.82, 0.35, curvas.branco.entrar);
    desenhar(cordao.longa, tCordao + 0.86, 0.7, curvas.branco.entrar);
    // O botão não espera a ponta parar de balançar: a promessa resolve logo
    // depois do nó, e o assentar da cauda continua por baixo dele.
    tl.fromTo(pose, { caudaKick: 14 }, { caudaKick: 0, duration: 2.4, ease: curvas.branco.entrar }, tCordao + 0.9)
      .to(pose, { balanco: 1, duration: 2, ease: 'none' }, tCordao + 1.2)
      .call(resolver, null, tCordao + 1.0);
  });
}

/**
 * "Olha a sua mão.": o instante em que ela percebe o fio. Resolve quando o botão
 * pode aparecer (a luz continua respirando no nó por baixo dele).
 *   - as pétalas desaceleram, como se o tempo parasse;
 *   - o olhar chega perto do pulso: a mão cresce em volta do laço, a câmera desce
 *     um pouco mais e o foco vem para perto (as pétalas do fundo desfocam);
 *   - o laço acende por dentro, um pulso de luz percorre o cordão uma vez e
 *     poeira de luz se solta dele.
 * Movimento reduzido: sem zoom e sem partículas; só a luz, por opacidade.
 */
function verOFio(gsap, { pose, desenho, calmo, mundo, cam, olharMao, som }) {
  return new Promise((resolver) => {
    const tl = gsap.timeline({ onComplete: resolver });
    mundo.petalas.definirTempo?.(calmo ? 0.6 : 0.28);
    if (!calmo) {
      mundo.petalas.definirFoco?.(0.85);
      tl.to(pose, { zoom: 1.3, duration: 3.8, ease: curvas.branco.camera }, 0);
      if (olharMao) tl.to(cam, { inclinacao: olharMao * 1.22, duration: 3.6, ease: curvas.branco.camera, overwrite: 'auto' }, 0);
    }
    if (!desenho) {
      // com a foto do autor não há cordão desenhado: só o tempo e o olhar
      tl.add(() => {}, calmo ? 0.8 : 2.2);
      return;
    }
    const { volta, curta, longa } = desenho.cordao;
    tl.add(() => som.efeito('brilho'), 0.5)
      .to(pose, { luz: 1, duration: calmo ? 0.9 : 1.3, ease: curvas.yourname.florescer }, 0.5);
    if (!calmo) {
      const luz = { a: 0, b: 0, c: 0 };
      tl.add(() => { desenho.brasas.taxa = 20; }, 0.7)
        .to(luz, { a: 1, duration: 1.3, ease: 'sine.inOut', onUpdate: () => volta.correrLuz(luz.a, 0.28) }, 0.8)
        .to(luz, { b: 1, duration: 0.6, ease: 'sine.inOut', onUpdate: () => curta.correrLuz(luz.b, 0.5) }, 1.75)
        .to(luz, { c: 1, duration: 0.9, ease: 'sine.inOut', onUpdate: () => longa.correrLuz(luz.c, 0.4) }, 1.8)
        .add(() => { desenho.brasas.taxa = 5; }, 2.7)
        .to(pose, { luz: 0.55, duration: 1.4, ease: 'sine.inOut' }, 2.6);
    } else {
      tl.to(pose, { luz: 0.55, duration: 1.0, ease: 'none' }, 1.6);
    }
    tl.add(() => {}, calmo ? 1.8 : 3.0);
  });
}

/**
 * Compila os programas de shader destes objetos antes de eles aparecerem
 * (three compila na primeira vez que desenha, de forma síncrona: era o engasgo
 * do toque). Compila mesmo invisíveis. No máximo ~1,2 s de espera.
 */
function aquecer(mundo, objetos, extras = []) {
  const r = mundo.renderer;
  if (!r || typeof r.compileAsync !== 'function') return Promise.resolve();
  const lista = objetos.filter(Boolean).map((o) => {
    try { return r.compileAsync(o, mundo.camera, mundo.cena).catch(() => {}); } catch { return Promise.resolve(); }
  });
  for (const e of extras) if (e) lista.push(typeof e.then === 'function' ? e : Promise.resolve().then(() => r.compileAsync(e, mundo.camera, mundo.cena)).catch(() => {}));
  return Promise.race([Promise.all(lista), espera(1200)]);
}

/**
 * A frase da mão cabe em no máximo duas linhas (uma frase longa no content.js
 * desceria até o desenho): se passar, a letra diminui um pouco de cada vez.
 */
function caberEmDuasLinhas(frase) {
  frase.style.fontSize = '';
  for (let i = 0; i < 8; i++) {
    const estilo = getComputedStyle(frase);
    const tamanho = parseFloat(estilo.fontSize) || 16;
    const linha = parseFloat(estilo.lineHeight) || tamanho * 1.25;
    if (frase.offsetHeight <= linha * 2.3 || tamanho <= 19) return;
    frase.style.fontSize = `${(tamanho * 0.9).toFixed(2)}px`;
  }
}

/**
 * Cuida da carta deixada aqui: faz flutuar enquanto é desta cena e, se a cena
 * final criar outra carta no lugar, tira esta de cena (no leve, cruzando).
 */
function cuidarDaCarta(ctx, env) {
  const { mundo, estado, diretor } = ctx;
  let ativo = true;
  let flutuar = true;
  const parar = mundo.aoQuadro((dt, t) => {
    if (!ativo) return;
    if (estado.envelope !== env && estado.envelope) {
      ativo = false;
      parar();
      pararDiretor();
      if (mundo.ok) env.dispose();
      else env.irEmbora().then(() => env.dispose());
      return;
    }
    if (flutuar) env.atualizar(dt, t);
  });
  const pararDiretor = diretor.aoMudar((cena) => {
    // A cena final cuida da carta que reaproveitar: aqui ela só deixa de flutuar por conta própria.
    // (a troca por outra carta continua sendo vigiada a cada quadro)
    if (cena === 'final') flutuar = false;
  });
  return () => { ativo = false; parar(); pararDiretor(); };
}
