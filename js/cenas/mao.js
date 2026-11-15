// A mão: o capítulo fecha, a carta vai embora, "Olha a sua mão.", a mão com o
// akai ito, o botão, e o fio vira o caminho.
//
//   cenaMao(ctx, { frio }) → Promise   resolve quando ela chegou perto da última carta
//
// Etapas: enrolando → olha → mao-espera → seguindo
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
import { voltarAoMundo } from '../nucleo/diretor.js';
import { criarFio } from '../mundo/fio.js';
import { criarEnvelope } from '../mundo/envelope.js';

const CAMINHADA = 8;                 // metros andados nesta cena, seguindo o fio
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

// =============================================================================
// O caminho no chão: quanto o fio se afasta para o lado a `s` metros da partida.
// Nos primeiros metros abre para a direita, fora da silhueta da mão (é ali que
// ela vê o fio correr), faz um S largo e chega à carta pelo lado direito: a
// subida até a carta cai em diagonal, sem cortar a dica no centro da tela.
// =============================================================================

function desvio(s) {
  const fim = suave((s - 8.5) / 3.5);
  const onda = 0.72 * Math.sin(s * 0.3 + 0.05) + 0.07 * Math.sin(s * 1.3 + 0.4);
  return lerp(onda, LADO, fim);
}

// =============================================================================
// A mão desenhada a nanquim (quando conteudo.mao.imagem está vazio).
// Mão esquerda, palma para cima, em primeira pessoa: o antebraço entra por
// baixo, o polegar abre para a esquerda. Tudo é gerado aqui: dedos paramétricos,
// traço de largura variável (um polígono que cresce ao longo da linha).
// Coordenadas no viewBox 320 × 460.
// =============================================================================

const VB_L = 320;
const VB_A = 460;
const TINTA = '#2a1b22';
const SVGNS = 'http://www.w3.org/2000/svg';

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
 * Um dedo visto pela palma. Devolve os lados e a ponta como listas de pontos e
 * o eixo (para os vincos).
 *   base [x, y], angulo (graus, 0 = para cima, + = horário), comprimento,
 *   largBase, largPonta, curva (rad ao longo do dedo), juntas (frações do eixo)
 */
function dedo({ base, angulo, comprimento, largBase, largPonta, curva = 0, juntas = [0.37, 0.69], polpa = 0.05 }) {
  const passos = 28;
  const eixo = [];
  let x = base[0];
  let y = base[1];
  for (let i = 0; i <= passos; i++) {
    const t = i / passos;
    const th = (angulo * Math.PI) / 180 + curva * t;
    const dx = Math.sin(th);
    const dy = -Math.cos(th);
    eixo.push({ t, x, y, dx, dy });
    x += dx * (comprimento / passos);
    y += dy * (comprimento / passos);
  }
  const pontoEm = (t) => {
    const f = clamp(t) * passos;
    const i = Math.min(passos - 1, Math.floor(f));
    const r = f - i;
    const a = eixo[i];
    const b = eixo[i + 1];
    return { x: lerp(a.x, b.x, r), y: lerp(a.y, b.y, r), dx: lerp(a.dx, b.dx, r), dy: lerp(a.dy, b.dy, r) };
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
    const p = pontoEm(t);
    const h = meia(t);
    // normal esquerda = (dy, −dx); o lado de fora da curva da polpa é um pouco mais cheio
    esquerda.push([p.x + p.dy * h * 1.03, p.y - p.dx * h * 1.03]);
    direita.push([p.x - p.dy * h * 0.97, p.y + p.dx * h * 0.97]);
  }
  const c = pontoEm(tc);
  const hc = meia(tc);
  const ponta = [];
  for (let i = 1; i < 8; i++) {
    const fi = (i / 8) * Math.PI;
    const lado = Math.cos(fi);
    const frente = Math.sin(fi) * 1.22;
    ponta.push([c.x + c.dy * hc * lado + c.dx * hc * frente, c.y - c.dx * hc * lado + c.dy * hc * frente]);
  }
  return { esquerda, direita: direita.reverse(), ponta, pontoEm, meia };
}

/** Pontos dos dedos e do contorno da mão (tudo à mão, em unidades do viewBox). */
function geometriaMao() {
  // Dedos relaxados: afinam bem para a ponta, a última falange encurta (estão
  // um pouco dobrados para cima, na direção dela), e cada um pende para o médio.
  const juntas = [0.42, 0.75];
  const polegar = dedo({ base: [100.5, 234], angulo: -40, comprimento: 80, largBase: 44, largPonta: 25.5, curva: 0.3, juntas: [0.52], polpa: 0.09 });
  const indicador = dedo({ base: [136, 171], angulo: -7.5, comprimento: 108, largBase: 30.5, largPonta: 19.5, curva: 0.12, juntas, polpa: 0.075 });
  const medio = dedo({ base: [166, 164.5], angulo: -0.5, comprimento: 119, largBase: 31, largPonta: 20.5, curva: 0.04, juntas, polpa: 0.075 });
  const anelar = dedo({ base: [195.5, 169.5], angulo: 6, comprimento: 110, largBase: 29.5, largPonta: 19.5, curva: -0.07, juntas, polpa: 0.075 });
  const minimo = dedo({ base: [222.5, 186], angulo: 17, comprimento: 82, largBase: 25, largPonta: 16.5, curva: -0.16, juntas, polpa: 0.08 });
  const dedos = [indicador, medio, anelar, minimo];

  // Vale entre dois dedos: um pouco abaixo do meio das bases.
  const vale = (a, b) => {
    const pa = a.direita[a.direita.length - 1];
    const pb = b.esquerda[0];
    return [(pa[0] + pb[0]) / 2, Math.max(pa[1], pb[1]) + 4.5];
  };
  const v1 = vale(indicador, medio);
  const v2 = vale(medio, anelar);
  const v3 = vale(anelar, minimo);

  const pulsoE = [112.5, 301];
  const pulsoD = [216.5, 301];
  const antebracoE = [pulsoE, [108.5, 332], [104, 370], [100, 412], [97.5, 446]];
  const antebracoD = [pulsoD, [220.5, 332], [225.5, 370], [229.5, 412], [232, 446]];
  const tenar = [pulsoE, [104, 291], [93.5, 277.5], [86, 263.5], polegar.esquerda[0]];
  const teia = [polegar.direita[polegar.direita.length - 1], [116.5, 207], [119, 189.5], indicador.esquerda[0]];
  const hipotenar = [minimo.direita[minimo.direita.length - 1], [238.5, 206], [240.5, 236], [236.5, 266], [228, 287.5], pulsoD];

  // Traços do contorno, na ordem em que o desenho acontece.
  const sem = (lista) => lista.slice(1);
  // Cada dedo são dois traços: sobe por um lado e passa da ponta; o outro desce
  // do alto da ponta. A pena levanta ali, como quem desenha de verdade.
  const subida = (d, antes) => [...antes, ...d.esquerda, ...d.ponta.slice(0, 5)];
  const descida = (d, depois) => [...d.ponta.slice(3), ...d.direita, ...depois];
  const tracos = {
    antebracoE: antebracoE,
    polegar: [
      [...tenar, ...sem(polegar.esquerda), ...polegar.ponta.slice(0, 5)],
      [...polegar.ponta.slice(3), ...polegar.direita, teia[1]],
    ],
    dedos: [
      [subida(indicador, [teia[1], teia[2]]), descida(indicador, [v1])],
      [subida(medio, [v1]), descida(medio, [v2])],
      [subida(anelar, [v2]), descida(anelar, [v3])],
      [subida(minimo, [v3]), descida(minimo, sem(hipotenar))],
    ],
    antebracoD: antebracoD,
  };

  // Silhueta fechada (para a parte branca que tapa o mundo e para a aguada).
  const silhueta = [
    ...antebracoE.slice().reverse(),
    ...sem(tenar), ...sem(polegar.esquerda), ...polegar.ponta, ...polegar.direita,
    teia[1], teia[2], ...indicador.esquerda, ...indicador.ponta, ...indicador.direita,
    v1, ...medio.esquerda, ...medio.ponta, ...medio.direita,
    v2, ...anelar.esquerda, ...anelar.ponta, ...anelar.direita,
    v3, ...minimo.esquerda, ...minimo.ponta, ...minimo.direita,
    ...sem(hipotenar), ...sem(antebracoD),
  ];

  // Vincos curtos das juntas (vistos pela palma): na base, duplo na primeira junta, simples na segunda.
  const vincos = [];
  const vinco = (d, t, abertura, curvar, desloc = 0) => {
    const p = d.pontoEm(t);
    const h = d.meia(t) * abertura;
    const nx = p.dy;
    const ny = -p.dx;
    const cx = p.x + nx * h * desloc;
    const cy = p.y + ny * h * desloc;
    return [
      [cx + nx * h, cy + ny * h],
      [cx + p.dx * curvar, cy + p.dy * curvar],
      [cx - nx * h * 0.9, cy - ny * h * 0.9],
    ];
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
    pulso1: [[127, 296.5], [150, 300.5], [177, 301.5], [203, 297]],
    pulso2: [[136, 307], [162, 310.5], [189, 308.5]],
    vida: [[120.5, 203.5], [124.5, 224], [130, 247], [138.5, 271], [149, 292]],
    cabeca: [[121.5, 206], [140, 214], [165, 222.5], [192, 233], [213, 245]],
    coracao: [[238, 213], [220, 206.5], [198, 200.5], [177, 195], [157, 184.5]],
    hipotenar: [[230, 254], [222.5, 262], [219, 275]],
  };
  // Hachura curta no lado da sombra (borda do mínimo), como quem desenha sabe fazer.
  const hachuras = [];
  for (let i = 0; i < 5; i++) {
    const y = 226 + i * 9.5;
    hachuras.push([[235.5 - i * 0.6, y], [229 - i * 0.4, y + 6.5]]);
  }

  return { tracos, silhueta, vincos, linhas, hachuras };
}

/**
 * Um traço de pena: a linha central é amostrada, cada ponto ganha uma meia
 * largura (entrada, saída e uma pressão que varia), e `desenhar(p)` monta o
 * polígono só até a fração p do comprimento.
 */
function criarTraco(pontos, { peso = 2.2, entrada = 10, saida = 14, minimo = 0.22, seed = 1, cor = TINTA, opacidade = 0.94, passos = 7 } = {}) {
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
    meia[i] = (peso / 2) * pressao * ent * sai;
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

// O akai ito no pulso: a volta na frente do pulso, o nó do lado do mínimo e duas pontas.
const CORDAO = {
  volta: [[109.5, 315.5], [133, 322], [163, 325.5], [193, 323.5], [221, 317.5]],
  no: [222.5, 318.5],
  pontaCurta: [[223, 317], [229.5, 309.5], [236, 307.5], [240, 309.5]],
  pontaLonga: [[223.5, 320.5], [230, 333], [236.5, 347], [240, 361], [240.5, 375.5]],
};
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
  grupo.append(sombra, base, trama, brilho);

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
  return { grupo, desenhar, ponta: linha[n - 1] };
}

/** Monta o desenho inteiro. Devolve o <svg>, as partes animáveis e onde fica a ponta solta. */
function montarDesenho(amb) {
  const g = geometriaMao();
  const raiz = svg(`
    <svg class="mao-desenho" viewBox="0 0 ${VB_L} ${VB_A}" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="mao-esvai" x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
          <stop offset="0" stop-color="#fff"/>
          <stop offset="0.64" stop-color="#fff"/>
          <stop offset="0.86" stop-color="#000"/>
        </linearGradient>
        <mask id="mao-mascara" maskUnits="userSpaceOnUse" x="-20" y="-20" width="${VB_L + 40}" height="${VB_A + 40}">
          <rect x="-20" y="-20" width="${VB_L + 40}" height="${VB_A + 40}" fill="url(#mao-esvai)"/>
        </mask>
      </defs>
      <g class="mao-fundo" mask="url(#mao-mascara)">
        <path class="mao-silhueta" fill="#ffffff"/>
        <path class="mao-aguada" fill="#f3d3c8" fill-opacity="0.34" transform="translate(2.6 3.4)"/>
        <path class="mao-aguada-borda" fill="none" stroke="#dcaa9b" stroke-width="1" stroke-opacity="0.42" transform="translate(2.6 3.4)"/>
      </g>
      <g class="mao-tinta"></g>
      <g class="mao-cordao"></g>
    </svg>`);

  const silhuetaD = caminhoFechado(g.silhueta);
  raiz.querySelector('.mao-silhueta').setAttribute('d', silhuetaD);
  raiz.querySelector('.mao-aguada').setAttribute('d', silhuetaD);
  raiz.querySelector('.mao-aguada-borda').setAttribute('d', silhuetaD);
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
  // Antebraço: desenhado do pulso para baixo, esvaindo (o desenho não termina, se dissolve).
  // Luz do alto à esquerda: o lado de subida (luz) é mais fino; o de descida, na sombra, mais cheio.
  juntar([tr.antebracoE.slice()], contorno, { peso: 1.9, entrada: 6, saida: 95, minimo: 0.05 });
  juntar([tr.polegar[0]], contorno, { peso: 1.75, entrada: 14, saida: 9, minimo: 0.18 });
  juntar([tr.polegar[1]], contorno, { peso: 2.2, entrada: 8, saida: 12, minimo: 0.18 });
  for (const [sobe, desce] of tr.dedos) {
    juntar([sobe], contorno, { peso: 1.7, entrada: 10, saida: 9, minimo: 0.16 });
    juntar([desce], contorno, { peso: 2.25, entrada: 7, saida: 12, minimo: 0.16 });
  }
  juntar([tr.antebracoD.slice()], contorno, { peso: 2.3, entrada: 6, saida: 95, minimo: 0.05 });

  const detalhes = [];
  juntar([g.linhas.pulso1, g.linhas.pulso2], detalhes, { peso: 1.15, entrada: 14, saida: 18, minimo: 0.1, opacidade: 0.8 });
  juntar([g.linhas.vida, g.linhas.cabeca, g.linhas.coracao], detalhes, { peso: 1.45, entrada: 16, saida: 26, minimo: 0.08, opacidade: 0.86 });
  juntar([g.linhas.hipotenar], detalhes, { peso: 1.0, entrada: 6, saida: 10, minimo: 0.1, opacidade: 0.6 });
  const vincos = [];
  juntar(g.vincos, vincos, { peso: 1.05, entrada: 3, saida: 4, minimo: 0.15, opacidade: 0.78, passos: 6 });
  juntar(g.hachuras, vincos, { peso: 0.8, entrada: 2, saida: 2.5, minimo: 0.2, opacidade: 0.45, passos: 3 });

  // O cordão vermelho e o nó.
  const volta = criarCordao(CORDAO.volta, { peso: 4.8 });
  const curta = criarCordao(CORDAO.pontaCurta, { peso: 4.1 });
  const caudaG = document.createElementNS(SVGNS, 'g');
  const longa = criarCordao(CORDAO.pontaLonga, { peso: 4.3 });
  caudaG.append(longa.grupo);
  const no = svg(`<svg><g class="mao-no">
      <ellipse cx="0" cy="0" rx="5.6" ry="4" transform="rotate(-28)" fill="${FIO_COR}" stroke="${FIO_ESCURO}" stroke-width="0.9"/>
      <ellipse cx="1.8" cy="2.2" rx="4.4" ry="3.1" transform="rotate(34)" fill="${FIO_COR}" stroke="${FIO_ESCURO}" stroke-width="0.9"/>
      <path d="M-3.4 -1.2 Q0 1.4 3.6 -0.6 M-1.6 3 Q1.2 1 4.4 2.6" fill="none" stroke="${FIO_ESCURO}" stroke-width="0.8" stroke-linecap="round"/>
      <path d="M-3 -2.8 Q-0.6 -3.9 2 -3.2" fill="none" stroke="${FIO_CLARO}" stroke-width="0.8" stroke-linecap="round" stroke-opacity="0.8"/>
    </g></svg>`).firstElementChild;
  no.setAttribute('transform', `translate(${CORDAO.no[0]} ${CORDAO.no[1]}) scale(0)`);
  camadaCordao.append(volta.grupo, curta.grupo, caudaG, no);

  return {
    raiz,
    fundo,
    contorno,
    detalhes,
    vincos,
    cordao: { volta, curta, longa, caudaG, no },
    no: CORDAO.no,
    pontaSolta: longa.ponta,             // em unidades do viewBox, antes do balanço
    reduzido: amb.reduzido,
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
  const MAX = 64;
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

  const larguras = { inicio: 0.0048, chao: 0.013, fim: 0.0065 };
  let fio = null;
  let soltura = 0;          // 0 preso à carta, 1 deitado no chão
  let soltando = null;
  let parado = false;
  let alcance = 0;          // quanto do caminho já existe à frente (m); a extensão revela por progresso

  function definirPonto(i, x, y, z) {
    const p = pontos[i];
    p.x = x; p.y = y; p.z = z;
    return p;
  }

  function lerAncora() {
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
      const ndcX = (ponta.x / mundo.tamanho.largura) * 2 - 1;
      const ndcY = -((ponta.y / mundo.tamanho.altura) * 2 - 1);
      inicio.copy(mundo.telaParaMundo(ndcX, ndcY, PROF_PULSO));
    } else {
      leve.desprojetar(ponta.x, ponta.y, PROF_PULSO, inicio);
    }

    // Queda: vertical no pulso, deitada no chão (horizontal no toque).
    const tx = x0 + desvio(sT);
    const tz = z0 - sT;
    const altura = Math.max(0.05, inicio.y - 0.02);
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
      const y = 0.02 + altura * Math.pow(1 - u, 1.8);
      const a = (1 - h) * (1 - h);
      const b = 2 * (1 - h) * h;
      const c = h * h;
      definirPonto(n++, a * inicio.x + b * cx + c * tx, y, a * inicio.z + b * cz + c * tz);
    }

    // Chão: pontos fixos no mundo a cada 0,5 m (não tremem enquanto ela anda).
    const fimChao = S_CARTA - 0.95;
    definirPonto(n++, tx, 0.02, tz);
    for (let s = Math.ceil((sT + 0.25) / 0.5) * 0.5; s < fimChao && n < MAX - 6; s += 0.5) {
      definirPonto(n++, x0 + desvio(s), 0.02, z0 - s);
    }

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

  return { criar, soltar, parar, get fio() { return fio; }, get alcance() { return alcance; } };
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
  const material = new THREE.MeshBasicMaterial({ color: '#b3123a', side: THREE.DoubleSide, transparent: true, opacity: 0.92 });
  const aleat = semente(23);
  const quantas = 9;
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
  const cam = { inclinacao: 0, guinada: 0, x: 0, guiar: false };
  let x0 = mundo.rig.position.x;
  let z0 = mundo.rig.position.z;
  const pararCamera = mundo.aoQuadro((dt) => {
    if (cam.guiar) {
      const s = z0 - mundo.rig.position.z;
      const alvoX = desvio(s + ANTECIPA) * 0.45;
      cam.x = amortecer(cam.x, alvoX, 2.2, dt);
      const adiante = desvio(s + ANTECIPA + 2.4) * 0.6 - cam.x;
      cam.guinada = amortecer(cam.guinada, -Math.atan2(adiante, 3.2) * 0.75, 2.4, dt);
    }
    if (!mundo.ok) return;
    mundo.rig.position.x = x0 + cam.x;
    mundo.rig.rotation.y = cam.guinada;
    mundo.camera.rotation.x += cam.inclinacao;
  });

  // Inclinação conforme a tela: deitada, o campo vertical é menor e precisa olhar mais para baixo.
  const aspecto = (mundo.tamanho.largura || innerWidth) / (mundo.tamanho.altura || innerHeight);
  const olharMao = calmo ? 0 : -lerp(0.15, 0.24, clamp((aspecto - 0.6) / 1.0));

  let pararPose = () => {};
  try {
    // 1. O capítulo fecha e a carta vai embora.
    diretor.etapa('enrolando');
    if (frio) musica.mostrarMini();
    else await voltarAoMundo(ctx);
    mundo.petalas.definirDensidade(1);
    x0 = mundo.rig.position.x;
    z0 = mundo.rig.position.z;

    // 2. A frase. A câmera inclina um pouco, para o chão.
    diretor.etapa('olha');
    const frase = el('p', 'frase');
    palcoFrases.append(frase);
    if (olharMao) gsap.to(cam, { inclinacao: olharMao, duration: 3.4, ease: curvas.branco.camera });
    const fraseLida = revelarPalavras(frase, dados.frase || '', { intervalo: 0.24, duracao: 1.8 });
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
    // Frase longa (duas linhas grandes) não fica embaixo dos dedos: a mão desce um pouco.
    const invade = frase.getBoundingClientRect().bottom + 14 - mao.getBoundingClientRect().top;
    if (invade > 0) mao.style.top = `${mao.offsetTop + Math.min(invade, innerHeight * 0.14)}px`;

    // Pose da mão (aplicada por quadro) e onde está a ponta solta do fio, em px.
    const pose = { y: calmo ? 0 : 54, rot: calmo ? 0 : 1.6, opacidade: 0, respiro: calmo ? 0.25 : 1, balanco: 0, caudaKick: 0 };
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
    };
    const foto = { left: 0, top: 0, width: 1, height: 1 };
    medir();
    const pararMedida = mundo.aoRedimensionar(medir);
    const ouvirJanela = () => medir();
    window.addEventListener('resize', ouvirJanela, { passive: true });

    const ancoraImagem = dados.ancoraFio || {};
    const ponta = { x: 0, y: 0 };
    let anguloCauda = 0;
    let tPose = 0;
    const ORIGEM_Y = 0.7;
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
      const ox = caixa.left + caixa.width * 0.5;
      const oy = caixa.top + caixa.height * ORIGEM_Y;
      const x = foto.left + foto.width * vx - ox;
      const y = foto.top + foto.height * vy - oy;
      const r = (pose.rot * Math.PI) / 180;
      ponta.x = ox + x * Math.cos(r) - y * Math.sin(r);
      ponta.y = oy + x * Math.sin(r) + y * Math.cos(r) + pose.y;
      return ponta;
    }

    const caudaG = desenho && desenho.cordao.caudaG;
    pararPose = mundo.aoQuadro((dt, t) => {
      tPose = t;
      const respira = Math.sin(t * 1.15) * 2.2 * pose.respiro;
      const gira = Math.sin(t * 0.83 + 0.6) * 0.35 * pose.respiro;
      corpo.style.transform = `translate3d(0, ${(pose.y + respira).toFixed(2)}px, 0) rotate(${(pose.rot + gira).toFixed(3)}deg)`;
      corpo.style.opacity = pose.opacidade.toFixed(3);
      if (caudaG) {
        const vento = calmo ? 1.2 : 4.5;
        anguloCauda = (Math.sin(t * 1.55) * 0.7 + Math.sin(t * 2.6 + 1.1) * 0.3) * vento * pose.balanco + pose.caudaKick;
        caudaG.setAttribute('transform', `rotate(${anguloCauda.toFixed(2)} ${desenho.no[0]} ${desenho.no[1]})`);
      }
    });
    void tPose;

    // O desenho e a frase correm juntos; o botão vem quando os dois assentaram.
    await Promise.all([desenharMao(gsap, { pose, desenho, imagem, calmo, mundo }), fraseLida]);

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
      cuidarDaCarta(ctx, env);
    };
    if (mundo.ok) criarCarta(2.4);

    const seguidor = criarSeguidor(ctx, { z0, x0, pulsoPx, cam });
    const fio = seguidor.criar();
    estado.fio = fio;
    estado.seguidorFio = { parar: () => seguidor.parar(), soltar: (d) => seguidor.soltar(d) };
    // Uma caminhada só, até a carta: a cena final já começa na frente dela.
    estado.distanciaFinal = 0;
    let petalasChao = null;
    if (mundo.ok && amb.nivel !== 'baixo') {
      petalasChao = petalasNoChao(mundo, { z0, x0 });
      petalasChao.visible = false;
      fio.objeto.add(petalasChao);
    }
    // a carta pelo preparar() dela: compila também a variante translúcida (na névoa) e sobe as texturas
    if (mundo.ok) await aquecer(mundo, [fio.objeto], env && env.preparar ? [env.preparar()] : [env && env.grupo]);

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
    diretor.etapa('seguindo');
    botao.disabled = true;
    som.destravar();
    som.efeito('toque');
    gsap.to(botao, { autoAlpha: 0, duration: 0.5, ease: curvas.branco.sair, onComplete: () => botao.remove() });
    ocultarPalavras(frase).then(() => frase.remove());
    if (petalasChao) petalasChao.visible = true;

    // O nó dá um puxão: a ponta solta estica antes do fio correr.
    if (desenho && !calmo) {
      gsap.timeline()
        .to(pose, { caudaKick: -9, duration: 0.22, ease: curvas.ui.resposta, overwrite: 'auto' })
        .to(pose, { caudaKick: 0, duration: 1.6, ease: curvas.branco.entrar });
    }
    // Dois tempos: o fio escorre da ponta solta até o chão, ao lado da mão; depois
    // corre pelo chão para longe, rápido no começo e assentando devagar, enquanto
    // a mão desce e abre o caminho.
    const queda = clamp(1.9 / Math.max(1, fio.comprimento), 0.08, 0.3);
    const revelar = { p: 0 };
    const extensao = new Promise((ok) => {
      const tl = gsap.timeline({ onComplete: ok, onUpdate: () => fio.progresso(revelar.p) });
      if (calmo) tl.to(revelar, { p: 1, duration: 1.6, ease: curvas.branco.deriva });
      else {
        tl.to(revelar, { p: queda, duration: 0.85, ease: curvas.branco.camera })
          .to(revelar, { p: 1, duration: 2.9, ease: curvas.branco.entrar }, 0.8);
      }
    });
    // A câmera acompanha a corrida do fio, um pouco mais para o chão.
    if (!calmo) gsap.to(cam, { inclinacao: olharMao * 1.1, duration: 1.8, ease: curvas.branco.camera });

    // A mão fica um instante enquanto o fio corre ao lado dela (o caminho abre à direita da silhueta).
    await espera(calmo ? 600 : 900);
    // A mão desce e sai do quadro (o começo do fio desce junto).
    gsap.to(pose, { respiro: 0, duration: 1.0, ease: 'none' });
    const saida = calmo
      // sem deslocamento: some por opacidade e, já invisível, o pulso sai de quadro
      // (o começo do fio passa a vir de baixo da tela, como no caminho normal)
      ? gsap.to(pose, { opacidade: 0, duration: 1.0, ease: 'none', onComplete: () => { pose.y = caixa.height * 1.15 + 80; } })
      : gsap.timeline()
        .to(pose, { y: caixa.height * 1.15 + 80, rot: -2.5, duration: 1.8, ease: curvas.branco.camera }, 0)
        .to(pose, { opacidade: 0, duration: 0.45, ease: 'none' }, 1.35);
    // 6. Ela caminha seguindo o fio, de uma vez só, até parar na frente da carta
    // (começa enquanto a mão ainda desce: a câmera sai devagar, sem degrau).
    await espera(calmo ? 200 : 400);
    cam.guiar = !calmo;
    const DURACAO = 8.0;
    if (!calmo) {
      gsap.timeline()
        .to(cam, { inclinacao: olharMao * 0.45, duration: 2.6, ease: curvas.branco.camera, overwrite: 'auto' })
        .to(cam, { inclinacao: 0, duration: 3.0, ease: curvas.branco.camera }, DURACAO - 3.4);
    } else {
      cam.inclinacao = 0;
    }
    const andar = mundo.caminhar({ distancia: CAMINHADA + RESTO, duracao: DURACAO });
    // A câmera assenta no eixo da carta durante o fim da própria caminhada.
    const ALINHAR = calmo ? 0.3 : 1.8;
    const alinhada = espera((DURACAO - ALINHAR) * 1000).then(() => new Promise((ok) => {
      cam.guiar = false;
      gsap.to(cam, { x: 0, guinada: 0, duration: ALINHAR, ease: curvas.branco.camera, onComplete: ok });
    }));
    if (!mundo.ok) {
      // Leve: a carta nasce do branco perto do fim e pousa quando ela para.
      await espera(DURACAO * 1000 * (calmo ? 0.1 : 0.72));
      criarCarta(calmo ? 1.2 : 3.6);
    }
    await Promise.all([andar, extensao, alinhada]);
    await new Promise((ok) => (saida.progress() >= 1 ? ok() : saida.eventCallback('onComplete', ok)));
    cam.guiar = false;
    cam.x = 0; cam.guinada = 0; cam.inclinacao = 0;

    pararPose();
    pararMedida();
    window.removeEventListener('resize', ouvirJanela);
    mao.remove();
  } finally {
    pararPose();
    pararCamera();
    if (mundo.ok) {
      mundo.rig.position.x = x0;
      mundo.rig.rotation.y = 0;
    }
  }
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
      tl.set(cordao.no, { attr: { transform: `translate(${desenho.no[0]} ${desenho.no[1]}) scale(1)` } }, 0.5);
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
      desenhar(traco, t, d, i === 0 || ultimo ? curvas.branco.entrar : 'power1.inOut');
      t += d * (i === 0 ? 0.45 : 0.62);
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
      attr: { transform: `translate(${desenho.no[0]} ${desenho.no[1]}) scale(1)` },
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
