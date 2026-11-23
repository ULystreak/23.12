/* ============================================================================
   POPPY / MÃOS: duas mãos de brinquedo que se procuram
   ============================================================================
   A azul vem da esquerda, presa a uma mola de aço; a vermelha vem da direita,
   presa ao fio vermelho. Esticam conforme ela rola e, no meio, os dedos se
   encaixam uns nos outros como peça de brinquedo: estalo, faíscas e o balanço
   da mola. Se chegam devagar, dão um puxão para se encaixarem de estalo.
   Física própria: uma mola de posição e uma de inclinação por mão, e a mola
   de arame desenhada espira por espira.
   Desenho original: luvas de plástico de três dedos e polegar.
   ========================================================================== */

import { clamp, el, lerp, svg } from '../../nucleo/util.js';

const ALCANCE = 120; // do punho à ponta do dedo maior
const PALMA = 76; // do punho à frente da palma
const ENCAIXE = ALCANCE + PALMA + 4; // entre punhos, com os dedos encaixados
const MEIO_PASSO = 18; // os dedos de uma ficam nos vãos da outra
const K = 150; // mola de posição
const C = 9.5;

// Uma luva vista de costas, punho na origem e dedos para +x. Os dedos têm
// passo de 36 (2 × MEIO_PASSO): com as mãos deslocadas 18 na vertical, eles se intercalam.
function mao(classe) {
  return `<g class="mao ${classe}">
    <rect class="pele" x="22" y="-67" width="44" height="18" rx="9" transform="rotate(-28 26 -50)"/>
    <rect class="pele" x="50" y="-44" width="62" height="16" rx="8"/>
    <rect class="pele" x="50" y="-8" width="70" height="16" rx="8"/>
    <rect class="pele" x="50" y="28" width="62" height="16" rx="8"/>
    <rect class="pele" x="0" y="-50" width="${PALMA}" height="100" rx="30"/>
    <rect class="sombra" x="6" y="16" width="64" height="28" rx="14"/>
    <path class="vinco" d="M20 -12q20 10 40 1"/>
    <path class="brilho" d="M12 -36q14-8 32-6"/>
    <path class="junta" d="M94 -42v12M100 -6v12M94 30v12"/>
    <rect class="unha" x="108" y="-5" width="9" height="10" rx="4"/>
    <rect class="punho" x="-26" y="-30" width="32" height="60" rx="9"/>
    <path class="friso" d="M-18 -27v54M-9 -28v56"/>
    <circle class="rebite" cx="-1" cy="0" r="3.2"/>
  </g>`;
}

export function criarMaos(bloco, { amb, gsap, som, anima }) {
  const reduzido = !!amb?.reduzido;
  const desenho = svg(`<svg class="poppy-maos-desenho" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">
    <path class="mola-sombra"/><path class="mola"/>
    <path class="fio-base"/><path class="fio-torcido"/><path class="fio-brilho"/>
    ${mao('azul')}${mao('vermelha')}
  </svg>`);
  const faiscas = el('div', 'poppy-faiscas');
  const raiz = el('div', { class: 'poppy-cena poppy-maos', 'aria-hidden': 'true' }, [desenho, faiscas]);
  const q = (s) => desenho.querySelector(s);
  const molaSombra = q('.mola-sombra');
  const mola = q('.mola');
  const fios = [q('.fio-base'), q('.fio-torcido'), q('.fio-brilho')];
  const maoA = q('.mao.azul');
  const maoB = q('.mao.vermelha');

  const a = { x: 0, v: 0, ang: 0, w: 0 };
  const b = { x: 0, v: 0, ang: 0, w: 0 };
  let W = 0;
  let H = 0;
  let k = 1;
  let meio = 0;
  let espiras = 5;
  let meioNoConteudo = null;
  let t = 0;
  let primeiro = true;
  let junto = false;
  let pAnterior = 0;
  let ultimaFaisca = -1;
  let ya = 0;
  let yb = 0;

  const alvoA = (p) => lerp(-66 * k, meio - 100 * k, p);
  const alvoB = (p) => lerp(W + 66 * k, meio + 100 * k, p);

  function medir() {
    W = raiz.clientWidth;
    H = raiz.clientHeight;
    k = clamp(W / 400, 0.8, 1.32);
    meio = W / 2;
    espiras = Math.max(5, Math.round((meio - 100 * k + 14) / 17));
    desenho.setAttribute('viewBox', `0 0 ${Math.max(1, W)} ${Math.max(1, H)}`);
    faiscas.style.transform = `translate3d(${meio}px, ${H / 2}px, 0)`;
    meioNoConteudo = null;
  }

  function estourar(forca) {
    const anel = el('i', 'anel');
    faiscas.append(anel);
    if (reduzido) {
      anima(gsap.fromTo(anel, { scale: 0.6, opacity: 0.7 }, { scale: 1.5, opacity: 0, duration: 0.9, ease: 'none', onComplete: () => anel.remove() }));
      return;
    }
    anima(gsap.fromTo(anel, { scale: 0.3, opacity: 0.9 }, { scale: 1.9 + forca, opacity: 0, duration: 0.42, ease: 'power2.out', onComplete: () => anel.remove() }));
    const n = amb?.nivel === 'baixo' ? 6 : 11;
    for (let i = 0; i < n; i++) {
      const risco = el('i', i % 3 === 2 ? 'risco creme' : 'risco');
      faiscas.append(risco);
      const angulo = (i / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.5; // ±0,25 rad
      const de = 10 + Math.random() * 10;
      const ate = (46 + Math.random() * 54) * (0.7 + 0.5 * forca) * k;
      const cos = Math.cos(angulo);
      const sen = Math.sin(angulo);
      anima(gsap.fromTo(risco,
        { x: cos * de, y: sen * de, rotation: (angulo * 180) / Math.PI + 90, scaleY: 1.3, opacity: 1 },
        { x: cos * ate, y: sen * ate, scaleY: 0.2, duration: 0.4 + Math.random() * 0.22, ease: 'power3.out' }));
      anima(gsap.to(risco, { opacity: 0, duration: 0.14, delay: 0.3 + Math.random() * 0.16, onComplete: () => risco.remove() }));
    }
  }

  function encontro(velocidade) {
    const forca = clamp(velocidade / 520, 0.25, 1);
    a.w -= 150 * forca + 40;
    b.w += 150 * forca + 40;
    if (t - ultimaFaisca > 0.35) {
      ultimaFaisca = t;
      estourar(forca);
    }
    if (!junto) som?.efeito?.('mola');
    junto = true;
  }

  function passo(dt, p) {
    a.v += (K * (alvoA(p) - a.x) - C * a.v) * dt;
    a.x += a.v * dt;
    b.v += (K * (alvoB(p) - b.x) - C * b.v) * dt;
    b.x += b.v * dt;
    const minimo = ENCAIXE * k;
    if (b.x - a.x < minimo) {
      const sobra = minimo - (b.x - a.x);
      a.x -= sobra / 2;
      b.x += sobra / 2;
      const aproximacao = a.v - b.v;
      if (aproximacao > 70) encontro(aproximacao);
      a.v = -0.42 * Math.abs(a.v);
      b.v = 0.42 * Math.abs(b.v);
    }
    for (const m of [a, b]) {
      const alvo = clamp(m.v * 0.02, -9, 9);
      m.w += (130 * (alvo - m.ang) - 7 * m.w) * dt;
      m.ang += m.w * dt;
    }
  }

  function desenhar() {
    const f = (n) => n.toFixed(2);
    maoA.setAttribute('transform', `translate(${f(a.x)} ${f(ya)}) rotate(${f(a.ang)}) scale(${f(k)})`);
    maoB.setAttribute('transform', `translate(${f(b.x)} ${f(yb)}) rotate(${f(b.ang)}) scale(${f(-k)} ${f(k)})`);

    // A mola: o arame tem comprimento fixo, então esticar achata as espiras.
    const x0 = -14;
    const comprimento = Math.max(8, a.x - x0);
    const meiaOnda = comprimento / (2 * espiras);
    const arame = 15 * k;
    const amplitude = Math.sqrt(Math.max(arame * arame - meiaOnda * meiaOnda, 3));
    let d = `M${f(x0)} ${f(ya)}`;
    for (let i = 0; i < 2 * espiras; i++) {
      const pico = ya + (i % 2 ? 2 : -2) * amplitude;
      d += `Q${f(x0 + (i + 0.5) * meiaOnda)} ${f(pico)} ${f(x0 + (i + 1) * meiaOnda)} ${f(ya)}`;
    }
    mola.setAttribute('d', d);
    molaSombra.setAttribute('d', d);

    // O fio: barriga maior quando está frouxo, e ela balança um pouco.
    const x1 = W + 14;
    const folga = clamp((x1 - b.x) / (0.5 * W || 1));
    const barriga = (7 + 9 * folga) * k + 1.3 * b.ang + (reduzido ? 0 : Math.sin(2.3 * t) * 1.6);
    const dx = x1 - b.x;
    const yc = yb + barriga * 1.33;
    const fio = `M${f(x1)} ${f(yb)}C${f(x1 - dx * 0.3)} ${f(yc)} ${f(b.x + dx * 0.3)} ${f(yc)} ${f(b.x)} ${f(yb)}`;
    for (const caminho of fios) caminho.setAttribute('d', fio);
  }

  return {
    el: raiz,
    medir,

    quadro(dt, info) {
      if (!W) medir();
      if (!W) return;
      t += dt;
      if (meioNoConteudo === null) {
        const r = raiz.getBoundingClientRect();
        meioNoConteudo = r.top + r.height / 2 - info.topo + info.y;
      }
      const centro = meioNoConteudo - info.y;
      const p = clamp((info.altura - centro) / (0.54 * info.altura));

      const cy = H / 2;
      ya = cy - (MEIO_PASSO / 2) * k + (reduzido ? 0 : Math.sin(1.9 * t) * 2.2);
      yb = cy + (MEIO_PASSO / 2) * k + (reduzido ? 0 : Math.sin(1.6 * t + 2) * 2.2);

      if (primeiro) {
        // Na primeira vez cada mão nasce no alvo (já encaixadas, se ela chegou rolando até o fim).
        primeiro = false;
        a.x = alvoA(p);
        b.x = alvoB(p);
        junto = p > 0.9;
        pAnterior = p;
      }

      if (reduzido) {
        a.x = alvoA(p);
        b.x = alvoB(p);
        a.ang = 0;
        b.ang = 0;
        if (!junto && p >= 0.995) {
          junto = true;
          estourar(0.3);
          som?.efeito?.('mola');
        }
      } else {
        // Chegou devagar, sem bater: as mãos dão um puxão para se encaixarem de estalo.
        if (!junto && p >= 0.995 && pAnterior >= 0.995 && Math.abs(alvoA(p) - a.x) < 1.5 && Math.abs(a.v) < 20) {
          a.v -= 250;
          b.v += 250;
        }
        // Passos curtos: a mola não estoura com um quadro comprido.
        const n = dt > 0.02 ? 3 : 2;
        for (let i = 0; i < n; i++) passo(dt / n, p);
      }
      if (p < 0.8) junto = false;
      pAnterior = p;
      desenhar();
    },

    destruir() {
      faiscas.textContent = '';
    },
  };
}
