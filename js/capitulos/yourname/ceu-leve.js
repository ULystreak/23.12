/* ============================================================================
   CÉU LEVE: o céu sem WebGL
   ============================================================================
   Não é um resto: tem a mesma hora, o mesmo sol, as nuvens, as estrelas com a
   via láctea, as serras com o lago e a cidadezinha, e o cometa que se divide.
   Serve quando o aparelho não tem WebGL e, enquanto o shader compila, como o
   céu provisório que o WebGL cobre com uma dissolvência.

   Custo: nuvens e estrelas são assadas uma vez em canvas 2D (as nuvens são
   recoloridas só quando a hora anda); o resto é degradê CSS, SVG e transform.
   Com `provisorio`, nada é assado (sem estrelas e sem nuvens), para não
   disputar a GPU com o shader que está compilando.

   Diferenças do shader, de propósito: a via láctea é uma faixa fixa, as
   estrelas são sorteadas (não a grade) e o cometa tem gradientes próprios.
   ========================================================================== */

import { css } from './paleta.js';
import { clamp, semente, suave } from '../../nucleo/util.js';

const NS = 'http://www.w3.org/2000/svg';
const BRANCO = [1, 1, 1];
const DOIS_PI = Math.PI * 2;

// Cada pintor leve tem ids próprios: o provisório e o completo chegam a
// conviver na tela, e um url(#id) repetido pegaria o gradiente do outro.
let serie = 0;
// Canvas de passagem das nuvens, reaproveitado de um pintor para o seguinte.
let passagem = null;

function no(tag, attrs = {}) {
  const n = document.createElementNS(NS, tag);
  for (const [chave, valor] of Object.entries(attrs)) n.setAttribute(chave, valor);
  return n;
}

const f1 = (v) => String(Math.round(v * 10) / 10);

function camada(tag, classe) {
  const n = document.createElement(tag);
  n.className = classe;
  return n;
}

// Um trecho de cor entre a e b, escurecido por s.
function tom(a, b, k, s) {
  return [(a[0] + (b[0] - a[0]) * k) * s, (a[1] + (b[1] - a[1]) * k) * s, (a[2] + (b[2] - a[2]) * k) * s];
}

export function criarPintorLeve(recipiente, amb = {}, { provisorio = false } = {}) {
  serie += 1;
  const id = (nome) => `${nome}-${serie}`;

  const raiz = camada('div', 'yn-ceu-leve');
  raiz.setAttribute('aria-hidden', 'true');
  const degrade = camada('div', 'yn-leve-camada');
  const estrelas = provisorio ? null : camada('canvas', 'yn-leve-camada');
  const sol = camada('div', 'yn-leve-sol');
  const nuvens = provisorio ? null : camada('canvas', 'yn-leve-nuvens');
  const clarao = camada('div', 'yn-leve-clarao');

  // O cometa: três caudas (o tronco e os dois pedaços) e um brilho de cabeça.
  const cometa = no('svg', { class: 'yn-leve-cometa' });
  const defsCometa = no('defs');
  const cauda = (nome, a, b) => {
    const g = no('linearGradient', { id: id(nome), gradientUnits: 'userSpaceOnUse' });
    g.append(
      no('stop', { offset: '0', 'stop-color': a, 'stop-opacity': '0.95' }),
      no('stop', { offset: '0.35', 'stop-color': b, 'stop-opacity': '0.45' }),
      no('stop', { offset: '1', 'stop-color': b, 'stop-opacity': '0' }),
    );
    defsCometa.append(g);
    return g;
  };
  const cabeca = no('radialGradient', { id: id('yn-cab') });
  cabeca.append(
    no('stop', { offset: '0', 'stop-color': '#ffffff', 'stop-opacity': '1' }),
    no('stop', { offset: '0.25', 'stop-color': '#dff3ff', 'stop-opacity': '0.8' }),
    no('stop', { offset: '1', 'stop-color': '#9fd8ff', 'stop-opacity': '0' }),
  );
  const pedaco = (grad) => {
    const g = no('g');
    const corpo = no('path', { fill: `url(#${grad.id})` });
    const fio = no('path', { fill: 'none', stroke: '#ffffff', 'stroke-width': '1.2', 'stroke-linecap': 'round', opacity: '0.8' });
    const cab = no('circle', { fill: `url(#${cabeca.id})` });
    g.append(corpo, fio, cab);
    return { g, corpo, fio, cab, grad };
  };
  const tronco = pedaco(cauda('yn-ct', '#e9f8ff', '#5a6cff'));
  const pedacoA = pedaco(cauda('yn-ca', '#e9f8ff', '#4c7bff'));
  const pedacoB = pedaco(cauda('yn-cb', '#ffe4f4', '#c64fd8'));
  defsCometa.append(cabeca);
  cometa.append(defsCometa, tronco.g, pedacoA.g, pedacoB.g);

  const terra = no('svg', { class: 'yn-leve-terra', preserveAspectRatio: 'none' });

  raiz.append(...[degrade, estrelas, sol, nuvens, clarao, cometa, terra].filter(Boolean));
  recipiente.append(raiz);

  let W = 0;
  let H = 0;
  let yL = 0;
  let mascaraCorpo = null;
  let mascaraLuz = null;
  let horaNuvem = -1;
  let horaGrad = -1;
  let ultimoComet = '';
  let ultimoSol = '';
  let ultimaNuvem = '';
  let ultimaTerra = '';
  let claraoAceso = false;
  // A terra, montada a cada tamanho.
  let lago = [];
  let longe = null;
  let perto = null;
  let brilhos = null;
  let luzes = [];

  const px = (x) => W / 2 + x * H;
  const py = (y) => H * (1 - y);

  function assarEstrelas() {
    // Densidade: em iPhone a 1x cada estrela vira um borrão.
    const d = Math.max(1, Math.min(2, amb.dprMax || 1.5, window.devicePixelRatio || 1));
    estrelas.width = Math.round(W * d);
    estrelas.height = Math.round(H * d);
    const g = estrelas.getContext('2d');
    if (!g) return;
    g.setTransform(d, 0, 0, d, 0, 0);
    g.clearRect(0, 0, W, H);
    const r = semente(23);

    // A faixa da via láctea, com a poeira dela.
    g.save();
    g.translate(0.5 * W, 0.38 * H);
    g.rotate(-0.62);
    const faixa = g.createLinearGradient(0, -0.12 * H, 0, 0.12 * H);
    faixa.addColorStop(0, 'rgba(90, 80, 170, 0)');
    faixa.addColorStop(0.5, 'rgba(120, 100, 190, 0.32)');
    faixa.addColorStop(1, 'rgba(90, 80, 170, 0)');
    g.fillStyle = faixa;
    g.fillRect(-H, -0.12 * H, 2 * H, 0.24 * H);
    for (let i = 0; i < 900; i++) {
      const x = (r() - 0.5) * 2 * H;
      const y = (r() + r() + r() - 1.5) * 0.07 * H;
      const a = 0.15 + 0.5 * r();
      const lado = r() < 0.85 ? 1 : 1.6;
      g.fillStyle = `rgba(228, 224, 255, ${a.toFixed(2)})`;
      g.fillRect(x, y, lado, lado);
    }
    g.restore();

    const n = Math.round((W * H) / 1300);
    for (let i = 0; i < n; i++) {
      const x = r() * W;
      const y = r() * 0.82 * H;
      const k = r() ** 3;
      const raio = 0.35 + 1.25 * k;
      const rgb = r() < 0.2 ? '255, 228, 200' : '215, 228, 255';
      if (k > 0.62) {
        const halo = g.createRadialGradient(x, y, 0, x, y, raio * 4.5);
        halo.addColorStop(0, `rgba(${rgb}, 0.3)`);
        halo.addColorStop(1, `rgba(${rgb}, 0)`);
        g.fillStyle = halo;
        g.beginPath();
        g.arc(x, y, raio * 4.5, 0, DOIS_PI);
        g.fill();
      }
      g.fillStyle = `rgba(${rgb}, ${(0.55 + 0.45 * k).toFixed(2)})`;
      g.beginPath();
      g.arc(x, y, raio, 0, DOIS_PI);
      g.fill();
    }
  }

  function telaNova(l, a) {
    const t = document.createElement('canvas');
    t.width = l;
    t.height = a;
    return t;
  }

  // Um gomo de cúmulo: um disco macio.
  function gomo(g, x, y, raio) {
    const r = g.createRadialGradient(x, y, 0, x, y, raio);
    r.addColorStop(0, 'rgba(255, 255, 255, 1)');
    r.addColorStop(0.55, 'rgba(255, 255, 255, 0.9)');
    r.addColorStop(0.8, 'rgba(255, 255, 255, 0.45)');
    r.addColorStop(1, 'rgba(255, 255, 255, 0)');
    g.fillStyle = r;
    g.beginPath();
    g.arc(x, y, raio, 0, DOIS_PI);
    g.fill();
  }

  // A base reta do cúmulo some num degradê, como a de uma nuvem de verdade.
  function apagarBase(g, x0, x1, base, alt) {
    const d = g.createLinearGradient(0, base - 0.05 * alt, 0, base + 0.12 * alt);
    d.addColorStop(0, 'rgba(0, 0, 0, 0)');
    d.addColorStop(1, 'rgba(0, 0, 0, 1)');
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = d;
    g.fillRect(x0, base - 0.05 * alt, x1 - x0, 0.7 * alt);
    g.globalCompositeOperation = 'source-over';
  }

  function assarNuvens() {
    const s = W > 900 ? 0.75 : 1;
    const lw = Math.max(2, Math.round(W * s));
    const lh = Math.max(2, Math.round(2 * H * s));
    nuvens.width = lw;
    nuvens.height = lh;
    mascaraCorpo = telaNova(lw, lh);
    mascaraLuz = telaNova(lw, lh);
    const gc = mascaraCorpo.getContext('2d');
    const gl = mascaraLuz.getContext('2d');
    if (!gc || !gl) return;
    const r = semente(7);
    const u = Math.min(lw, lh / 2);
    for (let i = 0; i < 6; i++) {
      const base = lh * (0.12 + (i / 6) * 0.8) + (r() - 0.5) * 0.2 * u;
      const quantas = 2 + Math.floor(r() * 2);
      for (let q = 0; q < quantas; q++) {
        const centro = lw * (0.1 + 0.8 * r());
        const largura = u * (0.6 + 0.7 * r());
        const alt = u * (0.22 + 0.16 * r());
        const gomos = 10 + Math.floor(r() * 7);
        for (let j = 0; j < gomos; j++) {
          const t = (j + 0.5) / gomos;
          const pico = Math.sin(Math.PI * t) * (0.6 + 0.4 * r());
          const raio = (0.18 + 0.55 * pico + 0.12 * r()) * alt;
          const x = centro - largura / 2 + t * largura;
          const y = base - raio * (0.6 + 0.5 * pico);
          gomo(gc, x, y, raio);
          // A luz vem de cima: a mesma forma, menor e mais alta.
          gomo(gl, x, y - 0.22 * raio, raio * 0.75);
        }
        const x0 = centro - largura / 2 - alt;
        const x1 = centro + largura / 2 + alt;
        apagarBase(gc, x0, x1, base, alt);
        apagarBase(gl, x0, x1, base, alt);
      }
    }
    horaNuvem = -1;
  }

  function pintarNuvens(e) {
    if (!mascaraCorpo) return;
    const g = nuvens.getContext('2d');
    if (!g) return;
    const { width: lw, height: lh } = nuvens;
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    g.clearRect(0, 0, lw, lh);
    g.drawImage(mascaraCorpo, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = css(e.sombra);
    g.fillRect(0, 0, lw, lh);

    passagem ||= document.createElement('canvas');
    if (passagem.width !== lw || passagem.height !== lh) {
      passagem.width = lw;
      passagem.height = lh;
    }
    const t = passagem.getContext('2d');
    if (!t) return;
    t.globalCompositeOperation = 'source-over';
    t.clearRect(0, 0, lw, lh);
    t.drawImage(mascaraLuz, 0, 0);
    t.globalCompositeOperation = 'source-in';
    t.fillStyle = css(e.luz);
    t.fillRect(0, 0, lw, lh);
    t.globalCompositeOperation = 'source-over';

    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 0.9;
    g.drawImage(passagem, 0, 0);
    g.globalAlpha = 1;
  }

  // Uma linha de serra: 48 amostras entre valores sorteados, fechada na margem.
  function perfil(r, amp, base, freq) {
    const valores = Array.from({ length: Math.ceil(freq) + 3 }, () => r());
    let d = `M0 ${f1(yL + 1)}`;
    for (let i = 0; i <= 48; i++) {
      const t = (i / 48) * freq;
      const j = Math.floor(t);
      const f = t - j;
      const s = f * f * (3 - 2 * f);
      const v = valores[j] + (valores[j + 1] - valores[j]) * s;
      d += `L${f1((i / 48) * W)} ${f1(base - amp * v)}`;
    }
    return `${d}L${f1(W)} ${f1(yL + 1)}Z`;
  }

  function montarTerra() {
    terra.textContent = '';
    terra.setAttribute('viewBox', `0 0 ${W} ${H}`);
    yL = 0.86 * H;
    const r = semente(41);

    // O lago reflete o céu de cabeça para baixo: na margem, a cor do
    // horizonte; mais perto dela, o alto do céu, mais escuro.
    const defs = no('defs');
    const grad = no('linearGradient', { id: id('yn-lago'), x1: '0', y1: '0', x2: '0', y2: '1' });
    lago = ['0', '0.28', '1'].map((offset) => no('stop', { offset }));
    grad.append(...lago);
    defs.append(grad);
    const agua = no('rect', { x: '0', y: f1(yL), width: f1(W), height: f1(H - yL + 0.3 * H), fill: `url(#${grad.id})` });

    longe = no('path', { d: perfil(r, 0.1 * H, yL - 0.035 * H, 5.2) });
    perto = no('path', { d: perfil(r, 0.05 * H, yL - 0.006 * H, 9.1) });

    luzes = [];
    const grupoLuzes = no('g', { class: 'yn-leve-luzes' });
    for (let i = 0; i < 22; i++) {
      const x = W * (0.3 + 0.35 * (r() + r() - 1));
      const y = yL - 2 - 0.012 * H * r();
      const cor = r() < 0.8 ? '#ffd29a' : '#d0e2ff';
      const acende = 0.47 + 0.2 * r();
      const g = no('g', { 'data-acende': acende.toFixed(3), fill: cor });
      g.append(no('circle', { cx: f1(x), cy: f1(y), r: '1.3' }));
      // O reflexo: tracinhos que encolhem e somem na água.
      const n = 4 + Math.floor(3 * r());
      const k = 0.8 + 0.4 * r();
      for (let j = 0; j < n; j++) {
        const largura = Math.max(0.8, 3.4 - 0.45 * j) * k;
        g.append(no('rect', {
          x: f1(x - largura / 2),
          y: f1(yL + 3 + j * (3.4 + 0.5 * j)),
          width: f1(largura),
          height: '1.1',
          opacity: (0.55 * (1 - j / (n + 1))).toFixed(3),
        }));
      }
      g.style.opacity = '0';
      grupoLuzes.append(g);
      luzes.push({ g, acende, aceso: -1 });
    }

    brilhos = no('g', { class: 'yn-leve-brilhos' });
    const fundoLago = H - yL;
    for (let i = 0; i < 46; i++) {
      const p = r() ** 1.8;
      const largura = W * (0.04 + 0.16 * r()) * (1 - 0.6 * p);
      const x = r() * W;
      brilhos.append(no('rect', {
        x: f1(x - largura / 2),
        y: f1(yL + 4 + p * fundoLago * 0.75),
        width: f1(largura),
        height: f1(0.8 + 0.8 * (1 - p)),
        opacity: (0.1 + 0.22 * r() * (1 - p)).toFixed(3),
      }));
    }

    terra.append(defs, agua, brilhos, longe, perto, grupoLuzes);
  }

  function ajustar() {
    const w = Math.max(2, recipiente.clientWidth || innerWidth);
    const h = Math.max(2, recipiente.clientHeight || innerHeight);
    if (w === W && h === H) return;
    W = w;
    H = h;
    // O sol e o clarão medem a altura do céu (e não a da janela).
    sol.style.width = sol.style.height = `${f1(0.7 * H)}px`;
    clarao.style.width = clarao.style.height = `${f1(0.8 * H)}px`;
    cometa.setAttribute('viewBox', `0 0 ${W} ${H}`);
    if (!provisorio) {
      assarEstrelas();
      assarNuvens();
    }
    montarTerra();
    horaGrad = -1;
    horaNuvem = -1;
    ultimoComet = '';
    ultimoSol = '';
    ultimaNuvem = '';
    ultimaTerra = '';
  }

  function pintarPedaco(p, hx, hy, tx, ty, larg, forca, cab) {
    const dx = tx - hx;
    const dy = ty - hy;
    const L = Math.hypot(dx, dy) || 1;
    const ux = dx / L;
    const uy = dy / L;
    const nx = -uy;
    const ny = ux;
    const w0 = larg * 0.12;
    const w1 = larg * 0.5;
    p.grad.setAttribute('x1', f1(hx));
    p.grad.setAttribute('y1', f1(hy));
    p.grad.setAttribute('x2', f1(tx));
    p.grad.setAttribute('y2', f1(ty));
    p.corpo.setAttribute('d',
      `M${f1(hx + nx * w0)} ${f1(hy + ny * w0)}L${f1(tx + nx * w1)} ${f1(ty + ny * w1)}`
      + `Q${f1(tx + ux * w1)} ${f1(ty + uy * w1)} ${f1(tx - nx * w1)} ${f1(ty - ny * w1)}`
      + `L${f1(hx - nx * w0)} ${f1(hy - ny * w0)}Z`);
    p.fio.setAttribute('d', `M${f1(hx)} ${f1(hy)}L${f1(hx + dx * 0.7)} ${f1(hy + dy * 0.7)}`);
    p.cab.setAttribute('cx', f1(hx));
    p.cab.setAttribute('cy', f1(hy));
    p.cab.setAttribute('r', f1(10 + 8 * cab));
    p.cab.style.opacity = cab.toFixed(3);
    p.g.style.opacity = forca.toFixed(3);
    p.g.style.display = '';
  }

  function pintarCometa(e) {
    const c = e.cometa;
    // x e y entram na chave: uma trajetória curva em y não congela o cometa.
    const chave = `${c.forca.toFixed(4)}|${c.sep.toFixed(4)}|${c.tronco[0].toFixed(4)}|${c.tronco[1].toFixed(4)}|${c.a[0].toFixed(4)}|${c.a[1].toFixed(4)}|${W}x${H}`;
    if (chave === ultimoComet) return;
    ultimoComet = chave;
    if (c.forca <= 0.001) {
      cometa.style.opacity = '0';
      return;
    }
    const hx = px(c.tronco[0]);
    const hy = py(c.tronco[1]);
    const ox = px(c.origem[0]);
    const oy = py(c.origem[1]);
    // O tronco vai da cabeça até 90% do caminho para a origem.
    pintarPedaco(tronco, hx, hy, hx + (ox - hx) * 0.9, hy + (oy - hy) * 0.9, 0.014 * H, 1 - 0.4 * c.sep, 1 - clamp(c.sep / 0.1));
    if (c.sep > 0.0005) {
      const dx = px(c.divisao[0]);
      const dy = py(c.divisao[1]);
      pintarPedaco(pedacoA, px(c.a[0]), py(c.a[1]), dx, dy, 0.01 * H, 1, 1);
      pintarPedaco(pedacoB, px(c.b[0]), py(c.b[1]), dx, dy, 0.01 * H, 1, 1);
    } else {
      pedacoA.g.style.display = 'none';
      pedacoB.g.style.display = 'none';
    }
    cometa.style.opacity = c.forca.toFixed(3);
  }

  function desenhar(e) {
    if (Math.abs(e.hora - horaGrad) > 0.003) {
      horaGrad = e.hora;
      const c0 = css(e.c0);
      degrade.style.background = `linear-gradient(to top, ${c0} 0%, ${c0} 14%, ${css(e.c1)} 30%, ${css(e.c2)} 62%, ${css(e.c3)} 100%)`;
      sol.style.opacity = e.solForca.toFixed(3);
      sol.style.background = `radial-gradient(closest-side, #ffffff 0%, ${css(e.sol)} 7%, ${css(e.sol, 0.35)} 28%, ${css(e.sol, 0)} 100%)`;
      if (estrelas) estrelas.style.opacity = e.estrelas.toFixed(3);
      const corLonge = [0, 1, 2].map((i) => 0.75 * e.longe[i] + 0.25 * e.c0[i]);
      longe.setAttribute('fill', css(corLonge));
      perto.setAttribute('fill', css(e.perto));
      lago[0].setAttribute('stop-color', css(tom(e.c0, e.c1, 0.35, 0.82)));
      lago[1].setAttribute('stop-color', css(tom(e.c1, e.c2, 0.5, 0.74)));
      lago[2].setAttribute('stop-color', css(tom(e.c2, e.c3, 0.4, 0.66)));
      brilhos.setAttribute('fill', css(tom(e.c0, BRANCO, 0.45, 1)));
      for (const luz of luzes) {
        const o = clamp((e.hora - luz.acende) / 0.03);
        if (o === luz.aceso) continue;
        luz.aceso = o;
        luz.g.style.opacity = o.toFixed(3);
      }
      // À noite as nuvens quase somem: sobra um véu fino, não um bloco por cima das estrelas.
      if (nuvens) nuvens.style.opacity = (0.92 * (1 - 0.92 * suave(e.estrelas))).toFixed(3);
    }
    if (nuvens && Math.abs(e.hora - horaNuvem) > 0.02) {
      horaNuvem = e.hora;
      pintarNuvens(e);
    }

    const transformSol = `translate3d(${f1(px((e.solX - 0.5) * (W / H)) - 0.35 * H)}px, ${f1(py(e.solY) - 0.35 * H)}px, 0)`;
    if (transformSol !== ultimoSol) {
      ultimoSol = transformSol;
      sol.style.transform = transformSol;
    }
    if (nuvens) {
      // e.rol já chega zerado no movimento reduzido: as nuvens não sobem com a rolagem.
      const t = `translate3d(0, ${f1(-Math.min(e.rol * 0.1, 1) * H)}px, 0)`;
      if (t !== ultimaNuvem) {
        ultimaNuvem = t;
        nuvens.style.transform = t;
      }
    }
    const transformTerra = `translate3d(0, ${f1(-(e.terra + 0.125) * 0.6 * H)}px, 0)`;
    if (transformTerra !== ultimaTerra) {
      ultimaTerra = transformTerra;
      terra.style.transform = transformTerra;
    }
    if (e.clarao > 0.002) {
      claraoAceso = true;
      clarao.style.opacity = e.clarao.toFixed(3);
      clarao.style.transform = `translate3d(${f1(px(e.cometa.divisao[0]) - 0.4 * H)}px, ${f1(py(e.cometa.divisao[1]) - 0.4 * H)}px, 0)`;
    } else if (claraoAceso) {
      claraoAceso = false;
      clarao.style.opacity = '0';
    }
    pintarCometa(e);
  }

  ajustar();

  return {
    tipo: 'leve',
    tela: raiz,
    get aspecto() {
      return W / H;
    },
    redimensionar: ajustar,
    // O leve não tem degraus de resolução: a adaptação é só do WebGL.
    baixar: () => false,
    desenhar,
    destruir() {
      raiz.remove();
      mascaraCorpo = null;
      mascaraLuz = null;
    },
  };
}
