/* ============================================================================
   LEVE: o mundo sem WebGL
   ============================================================================
   É o que ela vê se o WebGL do aparelho faltar ou morrer no meio: precisa ser
   bonito por conta própria, não um resto. Mesmo contrato de js/mundo/mundo.js,
   com `ok` falso. Tudo o que é 3D vira DOM dentro de #mundo-leve.

   As pétalas são pintadas uma vez em canvas 2D (nítidas, macias, manchas de
   perto e as do chão) e entram como imagem de fundo nas classes .leve-s<i>; o
   que se move depois é só transform e opacity, em animações de CSS, em três
   profundidades (longe, meio, perto) e o chão deitado. Nenhum filtro roda em
   tempo real. Rajadas e protagonistas são <i class="leve-solta"> do GSAP.

   A caminhada não move câmera: cada camada cresce a partir do horizonte no
   seu ritmo (a de perto muito, a de longe quase nada), enquanto a gêmea dela
   nasce lá atrás; a foto de js/mundo/fundo.js se aproxima junto. Não há
   figura dele, foco nem luz da hora nas pétalas: só a foto recebe a hora.

   O CSS das pétalas vem daqui (style#estilo-mundo-leve, antes das folhas de
   css/), para o modo leve não depender de outro arquivo; css/mundo.css pode
   refiná-lo por cima.
   ========================================================================== */

import { clamp, suave, amortecer, semente, espera, el, vetorLeve, objetoLeve } from '../nucleo/util.js';
import { curvas } from '../nucleo/movimento.js';
import { criarPonteiro, curvaDaCaminhada } from './mundo.js';
import { criarHora } from './hora.js';

const gsap = window.gsap;

// Contorno de colher larga, mais alta que larga, base embaixo (caixa 100 × 100).
// Lados retos que convergem numa ponta, ou entalhe fundo no meio, leem como
// coração, e isso a pétala não pode ser: o entalhe da 1ª e da 3ª é raso e fora do centro.
const CONTORNOS = [
  'M50 94C41 94 36 89 33 81C28 69 15 57 15 39C15 20 30 7 45 7C48 7 49 9 51.5 9C54 9 55 6.5 59 6.5C75 7 86 20 85 39C85 57 72 69 67 81C64 89 59 94 50 94Z',
  'M48 94C40 93 36 88 34 80C30 67 18 56 19 37C20 18 33 6 50 6C67 6 81 18 81 37C81 56 68 68 64 80C61 89 56 95 48 94Z',
  'M52 93C43 94 38 89 35 81C30 68 12 58 12 40C12 22 26 10 42 9C51 9 54 11.5 58 11.5C61 11.5 62 9.5 66 9.5C80 10 90 24 89 40C88 58 74 69 69 81C66 89 60 93 52 93Z',
];

// O mesmo passo de base de js/mundo/mundo.js: a alameda nunca para.
const PASSO_BASE = 0.42; // m/s

// Por camada: quantas (num celular em pé), tamanho em px, queda e balanço em s
// e px, alfa, onde a queda acaba (vh), deriva lateral (vw), quanto cresce por
// metro andado, a profundidade que divide o balanço do passo e a espera da
// chuva na abertura (s).
const CAMADAS = {
  longe: { n: 28, tamanho: [9, 17], queda: [17, 26], balanco: [4, 9], alfa: [0.42, 0.78], fim: [54, 70], deriva: [3, 8], avanco: 0.02, prof: 6, atraso: [0, 5.6] },
  meio: { n: 17, tamanho: [22, 42], queda: [10.5, 15], balanco: [12, 22], alfa: [0.92, 1], fim: [84, 108], deriva: [7, 15], avanco: 0.085, prof: 2, atraso: [0, 5.6] },
  perto: { n: 4, tamanho: [120, 200], queda: [7.5, 10.5], balanco: [18, 34], alfa: [0.7, 0.95], fim: [128, 136], deriva: [14, 26], avanco: 0.26, prof: 0.9, atraso: [2.2, 7] },
};
const CHAO = { n: 24, avanco: 0.075, prof: 3.2 };

// As grandes e desfocadas que cruzam a tela na abertura (fração da tela; s).
const PROTAGONISTAS = [
  { de: [-0.3, 0.2], ate: [1.3, 0.56], atraso: 0, dura: 6.6 },
  { de: [0.55, -0.25], ate: [1.3, 0.42], atraso: 2.1, dura: 5.6 },
  { de: [-0.3, 0.52], ate: [0.72, 1.3], atraso: 4, dura: 6.2 },
];
// Teto de pétalas soltas vivas (o mesmo estoque das rajadas do 3D): toque
// em série recicla a mais velha em vez de encher o DOM.
const ESTOQUE_SOLTAS = 96;

// Os ids e as classes são contrato com css/mundo.css (.leve-*). A imagem de
// cada pétala vem das classes .leve-s<i> (estilo-petalas-leves), por isso aqui
// o fundo vai em propriedades separadas: um `background` abreviado apagaria a imagem.
const ESTILO = `
#mundo-leve { contain: strict; }
.leve-mundo, .leve-frente { position: absolute; inset: 0; pointer-events: none; }
.leve-frente { z-index: 2; }
.leve-frente:not(.leve-soltas) { transition: opacity 1.2s linear; }
.leve-camada { position: absolute; inset: 0; transform-origin: 50% 46%; will-change: transform, opacity; }
.leve-petala {
  position: absolute; left: 0; top: 0;
  width: var(--tam, 24px); height: var(--tam, 24px);
  margin: calc(var(--tam, 24px) * -0.5) 0 0 calc(var(--tam, 24px) * -0.5);
  opacity: 0;
  animation: leve-cair var(--dur, 12s) linear var(--atraso, 0s) infinite;
}
.leve-petala > b {
  display: block; width: 100%; height: 100%;
  background-position: center; background-size: contain; background-repeat: no-repeat;
  transition: opacity 1.6s linear;
  animation: leve-tombar var(--tombo, 5s) var(--curva-branco-deriva) var(--fase, 0s) infinite alternate;
}
.leve-petala.fora > b { opacity: 0; }
.leve-camada.parada .leve-petala, .leve-camada.parada .leve-petala > b { animation-play-state: paused; }
.leve-zerar .leve-petala, .leve-zerar .leve-petala > b { animation: none; }
.leve-chao {
  position: absolute; left: 0; right: 0; top: 46%; bottom: 0;
  transform-origin: 50% 0;
  will-change: transform, opacity;
}
.leve-chao > i {
  position: absolute;
  width: var(--tam, 20px); height: var(--tam, 20px);
  margin: calc(var(--tam, 20px) * -0.5) 0 0 calc(var(--tam, 20px) * -0.5);
  background-position: center; background-size: contain; background-repeat: no-repeat;
  opacity: var(--alfa, 1);
  transform: scale(1, var(--achata, 0.4)) rotate(var(--r, 0deg));
  transition: opacity 2.4s linear;
}
.leve-chao > i.fora { opacity: 0; }
.leve-solta {
  position: absolute; left: 0; top: 0;
  width: var(--tam, 22px); height: var(--tam, 22px);
  margin: calc(var(--tam, 22px) * -0.5) 0 0 calc(var(--tam, 22px) * -0.5);
  background-position: center; background-size: contain; background-repeat: no-repeat;
  will-change: transform, opacity;
  pointer-events: none;
}
.leve-protege .leve-frente:not(.leve-soltas),
html:is([data-etapa="frases"], [data-etapa="carta-espera"], [data-etapa="carta-abrindo"], [data-etapa="mao-espera"], [data-etapa="desdobrando"], [data-etapa="escrevendo"], [data-etapa="fim"]) .leve-frente:not(.leve-soltas) { opacity: 0.1; }
html.reduzido .leve-petala > b { animation: none; transform: rotate(var(--r0, -30deg)) scale(0.72, 1); }
.leve-instante, .leve-instante * { transition: none !important; }
@keyframes leve-cair {
  0% { transform: translate3d(var(--x0), -12vh, 0); opacity: 0; }
  7% { opacity: var(--alfa, 1); }
  88% { opacity: var(--alfa, 1); }
  100% { transform: translate3d(var(--x1), var(--y1, 112vh), 0); opacity: 0; }
}
@keyframes leve-tombar {
  from { transform: translate3d(calc(var(--bal, 12px) * -1), 0, 0) rotate(var(--r0, -30deg)) scale(var(--s0, 0.9), 1); }
  to { transform: translate3d(var(--bal, 12px), 0, 0) rotate(var(--r1, 50deg)) scale(var(--s1, 0.3), 1); }
}
`;

/* ---- as pétalas pintadas uma vez ----------------------------------------------- */

function novaTela(tam) {
  const tela = document.createElement('canvas');
  tela.width = tam;
  tela.height = tam;
  const g = tela.getContext('2d');
  if (!g) throw new Error('sem canvas 2D');
  return { tela, g };
}

/** A pétala em foco: base escura, margem viva, sombra do côncavo, luz do alto e nervura. */
function pintarNitida(tam, contorno, noChao = false) {
  const { tela, g } = novaTela(tam);
  const forma = new Path2D(contorno);
  const k = (tam / 100) * 0.84;
  const borda = tam * 0.08;

  if (noChao) {
    // Sombra de contato mínima: a forma é desenhada fora da tela e só a sombra
    // deslocada cai dentro, um nada à direita e abaixo da pétala.
    g.save();
    g.shadowColor = 'rgba(42, 27, 34, 0.2)';
    g.shadowBlur = tam * 0.07;
    g.shadowOffsetX = tam * 3.03;
    g.shadowOffsetY = tam * 0.05;
    g.translate(-tam * 3 + borda, borda);
    g.scale(k, k);
    g.fillStyle = '#000';
    g.fill(forma);
    g.restore();
  }

  g.save();
  g.translate(borda, borda);
  g.scale(k, k);
  const corpo = g.createLinearGradient(50, 92, 50, 8);
  corpo.addColorStop(0, '#650920');
  corpo.addColorStop(0.42, '#a01035');
  corpo.addColorStop(1, '#cb1c4d');
  g.fillStyle = corpo;
  g.fill(forma);
  g.clip(forma);
  const concha = g.createRadialGradient(50, 62, 3, 50, 58, 40);
  concha.addColorStop(0, 'rgba(66, 4, 22, 0.3)');
  concha.addColorStop(1, 'rgba(66, 4, 22, 0)');
  g.fillStyle = concha;
  g.fillRect(0, 0, 100, 100);
  const luz = g.createRadialGradient(34, 26, 2, 38, 34, 46);
  luz.addColorStop(0, 'rgba(255, 156, 180, 0.36)');
  luz.addColorStop(1, 'rgba(255, 156, 180, 0)');
  g.fillStyle = luz;
  g.fillRect(0, 0, 100, 100);
  g.beginPath();
  g.moveTo(50, 90);
  g.quadraticCurveTo(52.5, 55, 50, 20);
  g.strokeStyle = 'rgba(78, 6, 26, 0.2)';
  g.lineWidth = 1.1;
  g.stroke();
  // Só a metade de dentro do traço aparece (o recorte): a margem viva.
  g.strokeStyle = 'rgba(238, 104, 136, 0.5)';
  g.lineWidth = 2.6;
  g.stroke(forma);
  g.restore();
  return tela.toDataURL('image/png');
}

/**
 * A pétala fora de foco. O desfoque vem do shadowBlur da forma desenhada fora
 * da tela: funciona em todo navegador, ao contrário de ctx.filter.
 */
function pintarMacia(tam, contorno, desfoque, alfa) {
  const { tela, g } = novaTela(tam);
  const forma = new Path2D(contorno);
  const escala = 1 - desfoque * 2.7;
  const k = (tam / 100) * escala;
  const longe = tam * 3;
  const passar = (cor, blur, encolhe) => {
    g.save();
    g.shadowColor = cor;
    g.shadowBlur = blur;
    g.shadowOffsetX = longe;
    g.translate(tam / 2 - longe, tam / 2);
    g.scale(k * encolhe, k * encolhe);
    g.translate(-50, -50);
    g.fillStyle = '#000';
    g.fill(forma);
    g.restore();
  };
  passar(`rgba(204, 44, 84, ${alfa})`, tam * desfoque, 1);
  passar(`rgba(160, 18, 56, ${alfa * 0.45})`, tam * desfoque * 0.9, 0.6);

  // Navegador que não desenha a sombra deixaria a tela vazia: vale uma mancha radial.
  let veio = true;
  try {
    veio = g.getImageData(tam / 2, tam / 2, 1, 1).data[3] > 8;
  } catch {
    /* sem leitura: conta como veio */
  }
  if (!veio) {
    const r = g.createRadialGradient(tam / 2, tam / 2, 0, tam / 2, tam / 2, tam / 2);
    r.addColorStop(0, `rgba(196, 40, 78, ${alfa})`);
    r.addColorStop(0.45, `rgba(204, 52, 90, ${alfa * 0.7})`);
    r.addColorStop(1, 'rgba(210, 60, 98, 0)');
    g.clearRect(0, 0, tam, tam);
    g.fillStyle = r;
    g.fillRect(0, 0, tam, tam);
  }
  return tela.toDataURL('image/png');
}

/** Põe (ou reescreve) um <style> com id; `antes` decide onde ele entra no <head>. */
function injetarEstilo(id, texto, antes = null) {
  let estilo = document.getElementById(id);
  if (!estilo) {
    estilo = el('style', { id });
    document.head.insertBefore(estilo, antes);
  }
  estilo.textContent = texto;
}

/** Pinta as dez imagens e devolve os índices de cada tipo, ou null sem canvas. */
function prepararImagens() {
  const urls = [];
  const pintar = (fn) => {
    try {
      urls.push(fn());
      return [urls.length - 1];
    } catch {
      return [];
    }
  };
  const nitidas = CONTORNOS.flatMap((c) => pintar(() => pintarNitida(128, c)));
  const macias = [
    ...pintar(() => pintarMacia(144, CONTORNOS[1], 0.045, 0.92)),
    ...pintar(() => pintarMacia(144, CONTORNOS[2], 0.06, 0.88)),
  ];
  const manchas = [
    ...pintar(() => pintarMacia(224, CONTORNOS[0], 0.14, 0.66)),
    ...pintar(() => pintarMacia(224, CONTORNOS[1], 0.16, 0.58)),
  ];
  const chao = CONTORNOS.flatMap((c) => pintar(() => pintarNitida(128, c, true)));
  if (!nitidas.length) return null;

  // :root dá à imagem mais peso que qualquer regra de forma (.leve-petala > b).
  injetarEstilo('estilo-petalas-leves', urls.map((u, i) => `:root .leve-s${i} { background-image: url("${u}"); }`).join('\n'));
  const ou = (lista) => (lista.length ? lista : nitidas);
  return { nitidas, macias: ou(macias), manchas: ou(manchas), chao: ou(chao) };
}

/** Curva em S de `a` a `b`. */
const degrau = (a, b, x) => suave((x - a) / (b - a));

/* ---- o mundo leve ---------------------------------------------------------------- */

/** `{ amb, canvas, recipienteLeve, fundo }` → objeto `mundo` (síncrono), com `ok` falso. */
export function criarMundoLeve({ amb, canvas, recipienteLeve, fundo = null }) {
  if (canvas) canvas.style.display = 'none';
  injetarEstilo('estilo-mundo-leve', ESTILO, document.head.querySelector('link[rel="stylesheet"]'));
  const tipos = prepararImagens();
  const recipiente = recipienteLeve || document.getElementById('mundo-leve');

  const reduzido = !!amb?.reduzido;
  const sorte = semente(2312);
  const entre = (a, b) => (Array.isArray(a) ? entre(a[0], a[1]) : a + sorte() * (b - a));
  const escolher = (lista) => lista[Math.floor(sorte() * lista.length)];

  // Tela grande ganha mais pétalas (fartura) e pétalas maiores (porte).
  const area = (innerWidth * innerHeight) / (390 * 844);
  const fartura = clamp(Math.sqrt(area), 1, 2) * (amb?.nivel === 'baixo' ? 0.7 : 1) * (reduzido ? 0.45 : 1);
  const porte = clamp(Math.min(innerWidth, innerHeight) / 390, 1, 1.7);
  const calma = reduzido ? 2.3 : 1;

  const todas = []; // { no, sorte, camada, atraso } de cada pétala
  const pares = []; // { a (à vista), b (esperando no fundo), prof, avanco, fator }
  let densidade = 1;
  let chaoLiberado = true;
  let jaDefinida = false;
  let comecos = 0;
  const criadoEm = performance.now();

  /* ---- camadas e chão ---- */

  function novaPetala(nome, imagens) {
    const c = CAMADAS[nome];
    const perto = nome === 'perto';
    const imagem = escolher(imagens);
    const tam = entre(c.tamanho) * porte;
    const dur = entre(c.queda) * calma;
    const atraso = -sorte() * dur; // negativo: ela já está no ar
    const x0 = entre(-10, 96);
    const x1 = x0 + entre(c.deriva);
    const y1 = entre(c.fim);
    const alfa = entre(c.alfa);
    const tombo = entre(3.2, 6.4) * calma;
    const sentido = sorte() < 0.5 ? -1 : 1;
    const giro = entre(-180, 180);
    const fase = -sorte() * tombo * 2;
    const bal = entre(c.balanco) * porte;
    const s0 = perto ? entre(0.82, 1) : entre(0.7, 1);
    const s1 = perto ? entre(0.62, 0.86) : entre(0.16, 0.6);
    const r1 = giro + sentido * entre(40, 130);

    const i = el('i', 'leve-petala');
    i.style.cssText = `--tam:${tam.toFixed(1)}px;--dur:${dur.toFixed(2)}s;--atraso:${atraso.toFixed(2)}s;`
      + `--x0:${x0.toFixed(2)}vw;--x1:${x1.toFixed(2)}vw;--y1:${y1.toFixed(1)}vh;--alfa:${alfa.toFixed(3)}`;
    const b = el('b', `leve-s${imagem}`);
    b.style.cssText = `--tombo:${tombo.toFixed(2)}s;--fase:${fase.toFixed(2)}s;--bal:${bal.toFixed(1)}px;`
      + `--r0:${giro.toFixed(1)}deg;--r1:${r1.toFixed(1)}deg;--s0:${s0.toFixed(3)};--s1:${s1.toFixed(3)}`;
    i.append(b);
    todas.push({ no: i, sorte: sorte(), camada: nome, atraso: c.atraso });
    return i;
  }

  function novaCamada(nome, imagens) {
    const camada = el('div', `leve-camada leve-${nome}`);
    const n = Math.max(2, Math.round(CAMADAS[nome].n * fartura));
    for (let k = 0; k < n; k++) camada.append(novaPetala(nome, imagens));
    return camada;
  }

  // O chão: pétalas deitadas, maiores, mais baixas e mais nítidas quanto mais perto dela.
  function novoChao() {
    const camada = el('div', 'leve-chao');
    const n = Math.round((CHAO.n * fartura) / (reduzido ? 0.7 : 1));
    const lista = [];
    for (let k = 0; k < n; k++) {
      const desce = sorte() ** 1.7;
      const i = el('i', `leve-s${escolher(tipos.chao)}`);
      i.style.cssText = `left:${entre(-4, 104).toFixed(2)}%;top:${(8 + desce * 90).toFixed(2)}%;`
        + `--tam:${((7 + desce * 34) * porte).toFixed(1)}px;--r:${entre(0, 360).toFixed(1)}deg;`
        + `--achata:${(0.24 + desce * 0.26).toFixed(3)};--alfa:${(0.3 + desce * 0.7).toFixed(3)}`;
      todas.push({ no: i, sorte: sorte(), camada: 'chao', atraso: null });
      lista.push({ i, desce });
    }
    // As de perto pintam por cima das de longe.
    lista.sort((x, y) => x.desce - y.desce);
    camada.append(...lista.map((p) => p.i));
    return camada;
  }

  function novoPar(criar, { prof, avanco }) {
    const a = criar();
    const b = criar();
    b.style.visibility = 'hidden';
    b.classList.add('parada');
    const par = { a, b, prof, avanco, fator: 1 };
    pares.push(par);
    return par;
  }

  const raiz = el('div', 'leve-mundo');
  const frente = el('div', 'leve-frente');
  const soltas = el('div', 'leve-frente leve-soltas');
  if (tipos) {
    const imagens = {
      longe: tipos.nitidas,
      meio: [...tipos.nitidas, ...tipos.nitidas, ...tipos.macias],
      perto: tipos.manchas,
    };
    const camada = (nome) => novoPar(() => novaCamada(nome, imagens[nome]), CAMADAS[nome]);
    const longe = camada('longe');
    const chao = novoPar(novoChao, CHAO);
    const meio = camada('meio');
    const perto = camada('perto');
    // A ordem dos filhos é a ordem de pintura: não reordene.
    raiz.append(longe.b, longe.a, chao.b, chao.a, meio.b, meio.a);
    frente.append(perto.b, perto.a);
  }
  // As soltas (rajadas e protagonistas) passam por cima da carta.
  raiz.append(frente, soltas);
  recipiente?.append(raiz);

  /* ---- densidade e abertura ---- */

  function aplicarDensidade() {
    for (const p of todas) {
      p.no.classList.toggle('fora', p.sorte > densidade || (p.camada === 'chao' && !chaoLiberado));
    }
  }

  // Sem transição: o reflow com .leve-instante grava o estado novo antes de a transição voltar.
  function aplicarJa() {
    raiz.classList.add('leve-instante');
    aplicarDensidade();
    void raiz.offsetWidth;
    raiz.classList.remove('leve-instante');
  }

  function definirDensidade(k) {
    densidade = clamp(Number(k) || 0);
    if (!jaDefinida || performance.now() - criadoEm < 1200) {
      jaDefinida = true;
      aplicarJa();
    } else {
      aplicarDensidade();
    }
  }

  // A chuva recomeça do alto, ainda com os olhos dela fechados; o chão só junta
  // pétalas depois que elas tiveram tempo de cair.
  function comecar() {
    const vez = ++comecos;
    raiz.classList.add('leve-zerar');
    chaoLiberado = false;
    aplicarJa();
    espera(4200).then(() => {
      if (vez !== comecos) return;
      chaoLiberado = true;
      aplicarDensidade();
    });
    for (const p of todas) {
      if (p.atraso) p.no.style.setProperty('--atraso', `${(entre(p.atraso) * calma).toFixed(2)}s`);
    }
    // Sem este reflow, os atrasos novos não valem quando as animações voltam.
    void raiz.offsetWidth;
    raiz.classList.remove('leve-zerar');
  }

  /* ---- soltas: protagonistas e rajadas ---- */

  function soltar(imagem, tam) {
    while (soltas.childElementCount >= ESTOQUE_SOLTAS) {
      const velha = soltas.firstElementChild;
      gsap.killTweensOf(velha);
      velha.remove();
    }
    const i = el('i', `leve-solta leve-s${imagem}`);
    i.style.setProperty('--tam', `${tam.toFixed(1)}px`);
    soltas.append(i);
    return i;
  }

  function protagonistas() {
    if (!gsap || !tipos || reduzido) return;
    const lado = Math.min(innerWidth, innerHeight);
    const roteiros = amb?.nivel === 'baixo' ? PROTAGONISTAS.slice(0, 2) : PROTAGONISTAS;
    for (const r of roteiros) {
      const i = soltar(escolher(tipos.manchas), lado * entre(0.62, 0.84));
      const giro = entre(-40, 40);
      const tl = gsap.timeline({ delay: r.atraso, onComplete: () => i.remove() });
      // fromTo desenha o começo já na criação: ela espera invisível, fora do lugar.
      tl.fromTo(i, {
        x: r.de[0] * innerWidth,
        y: r.de[1] * innerHeight,
        rotation: giro,
        scaleY: entre(0.7, 0.95),
      }, {
        x: r.ate[0] * innerWidth,
        y: r.ate[1] * innerHeight,
        rotation: giro + entre(-50, 50),
        scaleY: entre(0.8, 1),
        duration: r.dura,
        ease: 'none',
      }, 0);
      tl.fromTo(i, { autoAlpha: 0 }, { autoAlpha: 0.9, duration: r.dura * 0.16, ease: 'none' }, 0);
      tl.to(i, { autoAlpha: 0, duration: r.dura * 0.16, ease: 'none' }, r.dura * 0.84);
    }
  }

  /** Um leque de pétalas a partir de `pos.px, pos.py` (sem eles, do centro da tela). */
  function rajada(pos, n = 10) {
    if (!gsap || !tipos) return;
    const quantia = Math.min(reduzido ? Math.ceil(n / 3) : n, 18);
    const forca = reduzido ? 0.5 : 1;
    const x0 = Number.isFinite(pos?.px) ? pos.px : innerWidth / 2;
    const y0 = Number.isFinite(pos?.py) ? pos.py : innerHeight / 2;
    for (let k = 0; k < quantia; k++) {
      const i = soltar(escolher(tipos.nitidas), entre(16, 30) * porte);
      const angulo = sorte() * Math.PI * 2;
      const alcance = entre(50, 170) * forca * porte;
      const sobe = entre(0.38, 0.6);
      const dura = entre(2.6, 3.8);
      const dx = Math.cos(angulo) * alcance;
      const dy = Math.sin(angulo) * alcance * 0.7 - 34 * forca;
      const cai = dura * (1 - sobe);
      const giro = entre(-180, 180);
      gsap.set(i, { x: x0, y: y0, scale: 0.5, rotation: giro });
      gsap.timeline({ onComplete: () => i.remove() })
        .to(i, { scale: 1, duration: 0.5, ease: 'power2.out' }, 0)
        .to(i, { x: x0 + dx, y: y0 + dy, duration: dura * sobe, ease: 'power2.out' }, 0)
        // Depois do leque, desce embalada no mesmo rumo, cada vez mais rápido.
        .to(i, { x: x0 + dx * 1.3, duration: cai, ease: 'sine.inOut' }, dura * sobe)
        .to(i, { y: y0 + dy + entre(150, 300) * porte, duration: cai, ease: 'power1.in' }, dura * sobe)
        .to(i, { rotation: giro + (sorte() < 0.5 ? -320 : 320), duration: dura, ease: 'none' }, 0)
        // O tombo (a pétala vista de lado) só começa quando o crescer acabou.
        .to(i, { scaleX: entre(0.2, 0.7), duration: dura - 0.5, ease: 'sine.inOut' }, 0.5)
        .to(i, { autoAlpha: 0, duration: dura * 0.36, ease: 'none' }, dura * 0.64);
    }
  }

  /* ---- caminhada ---- */

  const rig = objetoLeve();
  const balanco = { x: 0, y: 0, rol: 0 }; // px, px e graus
  let filaCaminhada = Promise.resolve();
  let andando = false;
  let ligado = true;

  // Cada par: a camada à vista cresce e passa por baixo do olhar; a de trás
  // cresce do horizonte. O balanço do passo pesa menos quanto mais longe.
  function desenhar(p) {
    for (const par of pares) {
      const passo = `translate3d(${(balanco.x / par.prof).toFixed(1)}px, ${(balanco.y / par.prof).toFixed(1)}px, 0) rotate(${balanco.rol.toFixed(3)}deg)`;
      par.a.style.transform = `${passo} scale(${(par.fator ** p).toFixed(4)})`;
      par.a.style.opacity = (1 - degrau(0.4, 1, p)).toFixed(3);
      par.b.style.transform = `${passo} scale(${(par.fator ** (p - 1)).toFixed(4)})`;
      par.b.style.opacity = degrau(0, 0.62, p).toFixed(3);
    }
  }

  // Desligado ou com a aba escondida, a chuva de CSS congela onde está.
  const parado = () => !ligado || document.hidden;

  function pausar() {
    for (const par of pares) {
      par.a.classList.toggle('parada', parado());
      if (andando) par.b.classList.toggle('parada', parado());
    }
  }

  function andarAgora(distancia, duracao, curva) {
    if (!gsap || distancia <= 0) {
      rig.position.z -= distancia;
      return undefined;
    }
    const z0 = rig.position.z;
    fundo?.caminhada?.(distancia);
    const alcance = distancia * (reduzido ? 0.3 : 1);
    const pxPorMetro = innerHeight / (innerWidth > innerHeight ? 0.77 : 1.11);
    for (const par of pares) par.fator = Math.min(Math.exp(par.avanco * alcance), 5.5);
    // A de trás já nasce pequena e transparente no horizonte, antes de aparecer.
    desenhar(0);
    andando = true;
    for (const par of pares) {
      par.b.style.visibility = '';
      par.b.classList.toggle('parada', parado());
    }

    // O balanço do passo tem a forma do da câmera 3D (~2,5 cm na vertical,
    // ~1,2 cm de lado, ~0,3°) e segue a velocidade da caminhada.
    let tAnterior = 0;
    let pAnterior = 0;
    let amp = 0;
    let fase = 0;
    const balancar = (t, p) => {
      const dt = t - tAnterior;
      if (dt <= 0) return;
      const velocidade = ((p - pAnterior) / dt) * duracao;
      tAnterior = t;
      pAnterior = p;
      const alvo = reduzido ? 0 : clamp(velocidade);
      amp = amortecer(amp, alvo, alvo > amp ? 3.4 : 2.2, dt);
      fase += dt * 1.8 * clamp(amp * 4);
      const ciclo = fase * Math.PI * 2;
      const a = amp * Math.min(degrau(0, 0.08, p), 1 - degrau(0.86, 1, p));
      balanco.y = (Math.cos(ciclo) + 0.18 * Math.cos(2 * ciclo + 0.7)) * 0.025 * a * pxPorMetro;
      balanco.x = Math.sin(ciclo / 2) * 0.012 * a * pxPorMetro;
      balanco.rol = Math.sin(ciclo / 2 + 0.4) * 0.3 * a;
    };

    return new Promise((resolve) => {
      const estado = { p: 0 };
      let acabou = false;
      const terminar = () => {
        if (acabou) return;
        acabou = true;
        // A de trás vira a camada à vista; a outra volta a esperar, limpa.
        for (const par of pares) {
          const { a, b } = par;
          par.a = b;
          par.b = a;
          b.style.transform = '';
          b.style.opacity = '';
          a.style.visibility = 'hidden';
          a.style.transform = '';
          a.style.opacity = '';
          a.classList.add('parada');
        }
        andando = false;
        balanco.x = 0;
        balanco.y = 0;
        balanco.rol = 0;
        resolve();
      };
      gsap.to(estado, {
        p: 1,
        duration: duracao,
        ease: reduzido ? curvas.branco.deriva : (curva || curvaDaCaminhada),
        onUpdate() {
          rig.position.z = z0 - distancia * estado.p;
          balancar(this.time(), estado.p);
          desenhar(estado.p);
        },
        onComplete: terminar,
        onInterrupt: terminar,
      });
    });
  }

  /** Caminhadas entram numa fila: duas nunca se sobrepõem. */
  function caminhar({ distancia = 6, duracao = 5, curva } = {}) {
    const andar = () => andarAgora(Number(distancia) || 0, Math.max(0, Number(duracao) || 0), curva);
    filaCaminhada = filaCaminhada.then(andar, andar);
    return filaCaminhada;
  }

  /* ---- o laço ---- */

  const ponteiro = criarPonteiro(amb);
  const ouvintes = new Set();
  let deriva = 0;
  let zAnterior = 0;
  let ultimo = performance.now();
  let tempo = 0;

  // Ouvinte do ticker do GSAP, não um rAF próprio: um rAF por quadro, e as
  // tweens sempre andam antes de o quadro ser lido.
  function laco() {
    const agora = performance.now();
    const dt = Math.min(Math.max(agora - ultimo, 0) / 1000, 0.05);
    ultimo = agora;
    tempo += dt;
    ponteiro.atualizar(dt);
    if (!reduzido && dt > 0) {
      // Passo de base: a caminhada acelera por cima dele, somada em quadratura.
      const caminhada = Math.min(4, Math.abs(rig.position.z - zAnterior) / dt);
      deriva += (Math.hypot(PASSO_BASE, caminhada) - caminhada) * dt;
    }
    zAnterior = rig.position.z;
    for (const fn of ouvintes) {
      try {
        fn(dt, tempo);
      } catch (erro) {
        ouvintes.delete(fn);
        console.error('[carta] aoQuadro falhou', erro);
      }
    }
    if (fundo?.ativo) {
      fundo.atualizar({
        z: rig.position.z - deriva,
        roll: (balanco.rol * Math.PI) / 180,
        dx: balanco.x / 8,
        dy: balanco.y / 8,
      });
    }
  }

  // Liga e desliga juntos o laço e as camadas de CSS (também na troca de aba).
  function atualizarLaco() {
    pausar();
    if (!gsap) return;
    gsap.ticker.remove(laco);
    if (!parado()) {
      ultimo = performance.now();
      gsap.ticker.add(laco);
    }
  }
  document.addEventListener('visibilitychange', atualizarLaco);

  function ligar() {
    ligado = true;
    zAnterior = rig.position.z;
    atualizarLaco();
    fundo?.ligar?.();
  }

  function desligar() {
    ligado = false;
    atualizarLaco();
    fundo?.desligar?.();
  }

  /* ---- o objeto ---- */

  const tamanho = {
    get largura() { return innerWidth; },
    get altura() { return innerHeight; },
    dpr: 1,
  };

  const petalas = {
    objeto: raiz,
    definirDensidade,
    definirFoco() {},
    // Sem retângulo de verdade: só recua a camada de perto.
    protegerRetangulo(r) {
      raiz.classList.toggle('leve-protege', !!r);
    },
    comecar,
    protagonistas,
    rajada,
    atualizar() {},
    dispose() {
      gsap?.killTweensOf([...soltas.children]);
      raiz.remove();
    },
  };

  const mundo = {
    ok: false,
    amb,
    THREE: null,
    renderer: null,
    camera: null,
    canvas,
    recipienteLeve: recipiente,
    gpu: '',
    cena: objetoLeve(),
    rig,
    tamanho,
    ponteiro,
    get ligado() { return ligado; },
    get deriva() { return deriva; },
    aoQuadro(fn) {
      ouvintes.add(fn);
      return () => {
        ouvintes.delete(fn);
      };
    },
    ligar,
    desligar,
    caminhar,
    /** NDC → vetor leve, com o ponto em px de tela em `.px` e `.py`. */
    telaParaMundo(xNdc, yNdc, distancia = 1) {
      const v = vetorLeve(xNdc, yNdc, -distancia);
      v.px = (xNdc * 0.5 + 0.5) * innerWidth;
      v.py = (-yNdc * 0.5 + 0.5) * innerHeight;
      return v;
    },
    mundoParaTela(v) {
      return {
        x: Number.isFinite(v?.px) ? v.px : ((v?.x ?? 0) * 0.5 + 0.5) * innerWidth,
        y: Number.isFinite(v?.py) ? v.py : (-(v?.y ?? 0) * 0.5 + 0.5) * innerHeight,
        visivel: true,
      };
    },
    retanguloParaPose() {
      return null;
    },
    // Sem medidor de quadros no modo leve: o nível nunca muda.
    aoMudarNivel() {
      return () => {};
    },
    aoRedimensionar(fn) {
      const ouvir = () => fn(tamanho);
      addEventListener('resize', ouvir);
      return () => removeEventListener('resize', ouvir);
    },
    petalas,
    fundo,
  };

  // Só a foto recebe a hora: as pétalas leves não têm luzDaHora.
  criarHora(mundo, amb, (e) => fundo?.aplicarHora?.(e));
  atualizarLaco();
  return mundo;
}
