// O céu sem WebGL: o que ela vê se o WebGL do aparelho morrer. Não é um resto:
// tem a mesma hora, o mesmo sol, as nuvens, as estrelas com a via láctea, as
// serras com o lago e a cidadezinha, e o cometa que se divide.
//
//   const pintor = criarPintorLeve(recipiente, amb, { provisorio })
//     provisorio  sem nuvens nem estrelas assadas (o canvas 2D custa GPU): é o céu
//                 de enquanto o WebGL compila, e some antes de anoitecer
//   pintor.desenhar(estado)   estado de paleta.js (o mesmo do WebGL)
//   pintor.redimensionar() / pintor.destruir()
//
// Custo: nuvens e estrelas são assadas uma vez em canvas 2D (as nuvens são
// recoloridas só quando a hora anda); o resto é degradê CSS, SVG e transform.

import { css } from './paleta.js';
import { clamp, semente, suave } from '../../nucleo/util.js';

const NS = 'http://www.w3.org/2000/svg';
const no = (tag, attrs = {}) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
};
const f1 = (v) => (Math.round(v * 10) / 10).toString();

export function criarPintorLeve(recipiente, amb = {}, { provisorio = false } = {}) {
  const raiz = document.createElement('div');
  raiz.className = 'yn-ceu-leve';
  raiz.setAttribute('aria-hidden', 'true');

  const grad = document.createElement('div');
  grad.className = 'yn-leve-camada';
  const sol = document.createElement('div');
  sol.className = 'yn-leve-sol';
  const estrelas = document.createElement('canvas');
  estrelas.className = 'yn-leve-camada';
  const nuvens = document.createElement('canvas');
  nuvens.className = 'yn-leve-nuvens';
  const clarao = document.createElement('div');
  clarao.className = 'yn-leve-clarao';

  // serras, lago e cidade
  const terra = no('svg', { class: 'yn-leve-terra', preserveAspectRatio: 'none' });
  const defs = no('defs');
  const gLago = no('linearGradient', { id: 'yn-lago', x1: '0', y1: '0', x2: '0', y2: '1' });
  // O lago reflete o céu de cabeça para baixo: na margem, a cor do horizonte;
  // mais perto dela, o alto do céu, mais escuro.
  const lagoA = no('stop', { offset: '0' });
  const lagoM = no('stop', { offset: '0.28' });
  const lagoB = no('stop', { offset: '1' });
  gLago.append(lagoA, lagoM, lagoB);
  defs.append(gLago);
  const lago = no('rect', { x: '0', width: '100%', fill: 'url(#yn-lago)' });
  const brilhos = no('g', { class: 'yn-leve-brilhos' });   // riscos de luz na água
  const longe = no('path');
  const perto = no('path');
  const luzes = no('g', { class: 'yn-leve-luzes' });
  terra.append(defs, lago, brilhos, longe, perto, luzes);

  // o cometa
  const cometaSvg = no('svg', { class: 'yn-leve-cometa' });
  const cDefs = no('defs');
  const cauda = (id, a, b) => {
    const g = no('linearGradient', { id, gradientUnits: 'userSpaceOnUse' });
    g.append(no('stop', { offset: '0', 'stop-color': a, 'stop-opacity': '0.95' }),
      no('stop', { offset: '0.35', 'stop-color': b, 'stop-opacity': '0.45' }),
      no('stop', { offset: '1', 'stop-color': b, 'stop-opacity': '0' }));
    cDefs.append(g);
    return g;
  };
  const cabeca = no('radialGradient', { id: 'yn-cab' });
  cabeca.append(no('stop', { offset: '0', 'stop-color': '#ffffff', 'stop-opacity': '1' }),
    no('stop', { offset: '0.25', 'stop-color': '#dff3ff', 'stop-opacity': '0.8' }),
    no('stop', { offset: '1', 'stop-color': '#9fd8ff', 'stop-opacity': '0' }));
  cDefs.append(cabeca);
  const gradT = cauda('yn-ct', '#e9f8ff', '#5a6cff');
  const gradA = cauda('yn-ca', '#e9f8ff', '#4c7bff');
  const gradB = cauda('yn-cb', '#ffe4f4', '#c64fd8');
  cometaSvg.append(cDefs);
  const pedaco = (grad) => {
    const g = no('g');
    const corpo = no('path', { fill: `url(#${grad.id})` });
    const fio = no('path', { fill: 'none', stroke: '#ffffff', 'stroke-opacity': '0.8', 'stroke-width': '1.2', 'stroke-linecap': 'round' });
    const cab = no('circle', { r: '16', fill: 'url(#yn-cab)' });
    g.append(corpo, fio, cab);
    cometaSvg.append(g);
    return { g, corpo, fio, cab, grad };
  };
  const pT = pedaco(gradT);
  const pA = pedaco(gradA);
  const pB = pedaco(gradB);

  if (provisorio) raiz.append(grad, sol, clarao, cometaSvg, terra);
  else raiz.append(grad, estrelas, sol, nuvens, clarao, cometaSvg, terra);
  recipiente.append(raiz);

  let W = 1;
  let H = 1;
  let mascaraCorpo = null;
  let mascaraLuz = null;
  let horaNuvem = -1;
  let horaGrad = -1;
  let ultimoComet = '';

  // ---- assar ---------------------------------------------------------------------
  function assarEstrelas() {
    const ctx = estrelas.getContext('2d');
    // Na densidade da tela (até 2): a 1x, no iPhone, cada estrela vira um borrão.
    const d = Math.max(1, Math.min(2, amb.dprMax || 1.5, window.devicePixelRatio || 1));
    estrelas.width = Math.round(W * d); estrelas.height = Math.round(H * d);
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const r = semente(23);
    // faixa da via láctea: diagonal, poeira e um brilho largo
    ctx.save();
    ctx.translate(W * 0.5, H * 0.38);
    ctx.rotate(-0.62);
    const faixa = ctx.createLinearGradient(0, -H * 0.12, 0, H * 0.12);
    faixa.addColorStop(0, 'rgba(90, 80, 170, 0)');
    faixa.addColorStop(0.5, 'rgba(120, 100, 190, 0.32)');
    faixa.addColorStop(1, 'rgba(90, 80, 170, 0)');
    ctx.fillStyle = faixa;
    ctx.fillRect(-H, -H * 0.12, H * 2, H * 0.24);
    for (let i = 0; i < 900; i++) {
      const x = (r() - 0.5) * H * 2;
      const y = (r() + r() + r() - 1.5) * H * 0.07;
      ctx.fillStyle = `rgba(230, 225, 255, ${(0.15 + r() * 0.5).toFixed(2)})`;
      ctx.fillRect(x, y, r() < 0.9 ? 1 : 1.6, 1);
    }
    ctx.restore();
    // estrelas soltas, algumas grandes com halo
    const n = Math.round((W * H) / 1300);
    for (let i = 0; i < n; i++) {
      const x = r() * W;
      const y = r() * H * 0.82;
      const k = Math.pow(r(), 3);
      const raio = 0.35 + k * 1.25;
      ctx.fillStyle = r() < 0.2 ? `rgba(255, 228, 200, ${0.45 + k * 0.55})` : `rgba(215, 228, 255, ${0.4 + k * 0.6})`;
      ctx.beginPath(); ctx.arc(x, y, raio, 0, Math.PI * 2); ctx.fill();
      // só as poucas mais fortes ganham halo
      if (k > 0.62) {
        const g = ctx.createRadialGradient(x, y, 0, x, y, raio * 4.5);
        g.addColorStop(0, 'rgba(220, 230, 255, 0.3)');
        g.addColorStop(1, 'rgba(220, 230, 255, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - raio * 4.5, y - raio * 4.5, raio * 9, raio * 9);
      }
    }
  }

  // Cúmulos: cachos de gomos com a base reta; uma máscara do corpo e outra da luz.
  function assarNuvens() {
    const alt = H * 2;
    const escala = W > 900 ? 0.75 : 1;
    const lw = Math.round(W * escala);
    const lh = Math.round(alt * escala);
    mascaraCorpo = document.createElement('canvas');
    mascaraLuz = document.createElement('canvas');
    for (const c of [mascaraCorpo, mascaraLuz, nuvens]) { c.width = lw; c.height = lh; }
    const cc = mascaraCorpo.getContext('2d');
    const cl = mascaraLuz.getContext('2d');
    const r = semente(7);
    const u = Math.min(lw, lh / 2);
    const nuvem = (cx, base, larg, alto) => {
      const gomos = 10 + Math.floor(r() * 7);
      for (let i = 0; i < gomos; i++) {
        const t = i / (gomos - 1);
        const x = cx + (t - 0.5) * larg + (r() - 0.5) * larg * 0.12;
        const pico = Math.sin(t * Math.PI) * (0.6 + r() * 0.4);
        const raio = (0.18 + pico * 0.55 + r() * 0.12) * alto;
        const y = base - raio * (0.6 + pico * 0.5);
        for (const [ctx, desloc, k] of [[cc, 0, 1], [cl, -raio * 0.22, 0.75]]) {
          const g = ctx.createRadialGradient(x - raio * 0.15, y + desloc, raio * 0.2, x, y + desloc, raio);
          g.addColorStop(0, 'rgba(255,255,255,1)');
          g.addColorStop(0.55, 'rgba(255,255,255,0.9)');
          g.addColorStop(0.8, 'rgba(255,255,255,0.45)');
          g.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(x, y + desloc, raio * k, 0, Math.PI * 2); ctx.fill();
        }
      }
      // base reta: apaga o que passou da linha
      for (const ctx of [cc, cl]) {
        ctx.save();
        ctx.globalCompositeOperation = 'destination-out';
        const g = ctx.createLinearGradient(0, base - alto * 0.05, 0, base + alto * 0.12);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(1, 'rgba(0,0,0,1)');
        ctx.fillStyle = g;
        ctx.fillRect(cx - larg, base - alto * 0.05, larg * 2, alto);
        ctx.restore();
      }
    };
    const quantas = 6;
    for (let i = 0; i < quantas; i++) {
      const base = lh * (0.12 + (i / quantas) * 0.8) + (r() - 0.5) * u * 0.2;
      nuvem(lw * (0.1 + r() * 0.8), base, u * (0.6 + r() * 0.7), u * (0.22 + r() * 0.16));
    }
    horaNuvem = -1;
  }

  function pintarNuvens(e) {
    if (!mascaraCorpo) return;
    const ctx = nuvens.getContext('2d');
    const w = nuvens.width;
    const h = nuvens.height;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(mascaraCorpo, 0, 0);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = css(e.sombra);
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
    // a luz por cima, num canvas de passagem
    const tmp = pintarNuvens.tmp || (pintarNuvens.tmp = document.createElement('canvas'));
    if (tmp.width !== w || tmp.height !== h) { tmp.width = w; tmp.height = h; }
    const t = tmp.getContext('2d');
    t.globalCompositeOperation = 'source-over';
    t.clearRect(0, 0, w, h);
    t.drawImage(mascaraLuz, 0, 0);
    t.globalCompositeOperation = 'source-in';
    t.fillStyle = css(e.luz);
    t.fillRect(0, 0, w, h);
    ctx.globalAlpha = 0.9;
    ctx.drawImage(tmp, 0, 0);
    ctx.globalAlpha = 1;
  }

  // Serras: perfil com ruído de valor, igual em espírito ao do shader.
  function perfil(r, amp, base, freq) {
    const pts = [];
    const n = 48;
    const v = Array.from({ length: Math.ceil(freq) + 3 }, () => r());
    for (let i = 0; i <= n; i++) {
      const x = i / n;
      const f = x * freq;
      const j = Math.floor(f);
      const t = f - j;
      const s = t * t * (3 - 2 * t);
      const y = v[j] + (v[j + 1] - v[j]) * s;
      pts.push([x * W, base - y * amp]);
    }
    return pts;
  }
  function montarTerra() {
    terra.setAttribute('viewBox', `0 0 ${W} ${H}`);
    terra.setAttribute('width', W);
    terra.setAttribute('height', H);
    const r = semente(41);
    const yL = H * 0.86;     // a margem, em px a partir do topo
    const pl = perfil(r, H * 0.1, yL - H * 0.035, 5.2);
    const pp = perfil(r, H * 0.05, yL - H * 0.006, 9.1);
    const d = (pts) => `M0 ${f1(yL)}L${pts.map(([x, y]) => `${f1(x)} ${f1(y)}`).join('L')}L${W} ${f1(yL)}Z`;
    longe.setAttribute('d', d(pl));
    perto.setAttribute('d', d(pp));
    lago.setAttribute('y', f1(yL));
    lago.setAttribute('height', f1(H - yL + H * 0.3));
    luzes.textContent = '';
    for (let i = 0; i < 22; i++) {
      const x = W * (0.3 + (r() + r() - 1) * 0.35);
      const y = yL - 2 - r() * H * 0.012;
      const quente = r() < 0.8;
      const cor = quente ? '#ffd29a' : '#d0e2ff';
      const g = no('g', { 'data-acende': (0.47 + r() * 0.2).toFixed(3) });
      g.append(no('circle', { cx: f1(x), cy: f1(y), r: '1.3', fill: cor }));
      // o reflexo: tracinhos que se partem na água, cada vez mais curtos e fracos
      const n = 4 + Math.floor(r() * 3);
      for (let j = 0; j < n; j++) {
        const larg = Math.max(0.8, 3.4 - j * 0.45) * (0.8 + r() * 0.4);
        const yy = yL + 3 + j * (3.4 + j * 0.5);
        g.append(no('rect', {
          x: f1(x - larg / 2 + (r() - 0.5) * 1.6), y: f1(yy), width: f1(larg), height: '1.1', rx: '0.55',
          fill: cor, opacity: (0.55 * (1 - j / (n + 1))).toFixed(2),
        }));
      }
      luzes.append(g);
    }
    // riscos de luz na água: mais juntos e mais longos perto da margem
    brilhos.textContent = '';
    const fundo = H - yL + H * 0.3;
    for (let i = 0; i < 46; i++) {
      const p = Math.pow(r(), 1.8);
      const yy = yL + 4 + p * fundo * 0.75;
      const larg = W * (0.04 + r() * 0.16) * (1 - p * 0.6);
      brilhos.append(no('rect', {
        x: f1(r() * W - larg / 2), y: f1(yy), width: f1(larg), height: f1(0.8 + (1 - p) * 0.8), rx: '0.6',
        opacity: (0.1 + r() * 0.22 * (1 - p)).toFixed(2),
      }));
    }
  }

  function ajustar() {
    const w = Math.max(2, Math.round(recipiente.clientWidth || 1));
    const h = Math.max(2, Math.round(recipiente.clientHeight || 1));
    if (w === W && h === H) return;
    W = w; H = h;
    if (!provisorio) {
      assarEstrelas();
      assarNuvens();
    }
    montarTerra();
    horaGrad = -1;
    ultimoComet = '';
  }
  ajustar();

  // ---- cometa ------------------------------------------------------------------------
  const px = (x) => W / 2 + x * H;
  const py = (y) => H * (1 - y);
  function pintarPedaco(p, hx, hy, tx, ty, larg, forca, cabeca = 1) {
    if (forca <= 0.002) { p.g.setAttribute('opacity', '0'); return; }
    p.g.setAttribute('opacity', forca.toFixed(3));
    const dx = tx - hx;
    const dy = ty - hy;
    const L = Math.hypot(dx, dy) || 1;
    const nx = -dy / L;
    const ny = dx / L;
    const w0 = 1.5;
    p.corpo.setAttribute('d', `M${f1(hx + nx * w0)} ${f1(hy + ny * w0)}Q${f1(hx + dx * 0.5 + nx * larg)} ${f1(hy + dy * 0.5 + ny * larg)} ${f1(tx + nx * larg * 1.4)} ${f1(ty + ny * larg * 1.4)}L${f1(tx - nx * larg * 1.4)} ${f1(ty - ny * larg * 1.4)}Q${f1(hx + dx * 0.5 - nx * larg)} ${f1(hy + dy * 0.5 - ny * larg)} ${f1(hx - nx * w0)} ${f1(hy - ny * w0)}Z`);
    p.fio.setAttribute('d', `M${f1(hx)} ${f1(hy)}L${f1(hx + dx * 0.8)} ${f1(hy + dy * 0.8)}`);
    p.grad.setAttribute('x1', f1(hx)); p.grad.setAttribute('y1', f1(hy));
    p.grad.setAttribute('x2', f1(tx)); p.grad.setAttribute('y2', f1(ty));
    p.cab.setAttribute('cx', f1(hx)); p.cab.setAttribute('cy', f1(hy));
    p.cab.setAttribute('r', f1(10 + 8 * cabeca));
    p.cab.setAttribute('opacity', cabeca.toFixed(3));
  }
  function pintarCometa(e) {
    const c = e.cometa;
    const chave = `${c.forca.toFixed(3)}${c.sep.toFixed(3)}${c.tronco[0].toFixed(4)}${c.a[0].toFixed(4)}${W}`;
    if (chave === ultimoComet) return;
    ultimoComet = chave;
    if (c.forca <= 0.001) { cometaSvg.style.opacity = '0'; return; }
    cometaSvg.style.opacity = '1';
    cometaSvg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const ox = px(c.origem[0]); const oy = py(c.origem[1]);
    const hx = px(c.tronco[0]); const hy = py(c.tronco[1]);
    const ux = hx + (ox - hx) * 0.9; const uy = hy + (oy - hy) * 0.9;
    const sep = c.sep;
    pintarPedaco(pT, hx, hy, ux, uy, H * 0.014, 1 - 0.4 * sep, 1 - clamp(sep / 0.1));
    if (sep > 0.0005) {
      const dx = px(c.divisao[0]); const dy = py(c.divisao[1]);
      pintarPedaco(pA, px(c.a[0]), py(c.a[1]), dx, dy, H * 0.01, 1);
      pintarPedaco(pB, px(c.b[0]), py(c.b[1]), dx, dy, H * 0.01, 1);
    } else {
      pA.g.setAttribute('opacity', '0');
      pB.g.setAttribute('opacity', '0');
    }
    cometaSvg.style.opacity = c.forca.toFixed(3);
  }

  return {
    tipo: 'leve',
    tela: raiz,
    get aspecto() { return W / H; },
    redimensionar: ajustar,
    baixar() { return false; },

    desenhar(e) {
      const h = e.hora;
      if (Math.abs(h - horaGrad) > 0.003) {
        horaGrad = h;
        grad.style.background = `linear-gradient(to top, ${css(e.c0)} 0%, ${css(e.c0)} 14%, ${css(e.c1)} 30%, ${css(e.c2)} 62%, ${css(e.c3)} 100%)`;
        sol.style.opacity = e.solForca.toFixed(3);
        sol.style.background = `radial-gradient(closest-side, ${css([1, 1, 1])} 0%, ${css(e.sol)} 7%, ${css(e.sol, 0.35)} 28%, ${css(e.sol, 0)} 100%)`;
        estrelas.style.opacity = e.estrelas.toFixed(3);
        longe.setAttribute('fill', css([e.longe[0] * 0.75 + e.c0[0] * 0.25, e.longe[1] * 0.75 + e.c0[1] * 0.25, e.longe[2] * 0.75 + e.c0[2] * 0.25]));
        perto.setAttribute('fill', css(e.perto));
        const tom = (a, b, k, s) => [(a[0] + (b[0] - a[0]) * k) * s, (a[1] + (b[1] - a[1]) * k) * s, (a[2] + (b[2] - a[2]) * k) * s];
        lagoA.setAttribute('stop-color', css(tom(e.c0, e.c1, 0.35, 0.82)));
        lagoM.setAttribute('stop-color', css(tom(e.c1, e.c2, 0.5, 0.74)));
        lagoB.setAttribute('stop-color', css(tom(e.c2, e.c3, 0.4, 0.66)));
        brilhos.setAttribute('fill', css(tom(e.c0, [1, 1, 1], 0.45, 1)));
        for (const g of luzes.children) g.setAttribute('opacity', clamp((h - Number(g.dataset.acende)) / 0.03).toFixed(2));
        // À noite as nuvens quase somem: sobra um véu fino, não um bloco por cima das estrelas.
        nuvens.style.opacity = (0.92 * (1 - 0.92 * suave(e.estrelas))).toFixed(3);
      }
      if (Math.abs(h - horaNuvem) > 0.02) { horaNuvem = h; pintarNuvens(e); }
      // o sol desce; as nuvens sobem com a rolagem; a terra sobe com a hora
      sol.style.transform = `translate3d(${f1(px((e.solX - 0.5) * (W / H)) - H * 0.35)}px, ${f1(py(e.solY) - H * 0.35)}px, 0)`;
      const sobe = amb.reduzido ? 0 : Math.min(e.rol * 0.1, 1) * H;
      nuvens.style.transform = `translate3d(0, ${f1(-sobe)}px, 0)`;
      terra.style.transform = `translate3d(0, ${f1(-(e.terra + 0.125) * H * 0.6)}px, 0)`;
      clarao.style.opacity = e.clarao.toFixed(3);
      if (e.clarao > 0.002) {
        clarao.style.transform = `translate3d(${f1(px(e.cometa.divisao[0]) - H * 0.4)}px, ${f1(py(e.cometa.divisao[1]) - H * 0.4)}px, 0)`;
      }
      pintarCometa(e);
    },

    destruir() {
      raiz.remove();
      mascaraCorpo = null; mascaraLuz = null;
    },
  };
}
