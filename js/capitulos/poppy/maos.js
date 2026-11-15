// Cena "maos": duas mãos de brinquedo que se procuram.
//
// A azul vem da esquerda, presa a uma mola de aço; a vermelha vem da direita,
// presa ao fio vermelho (a mesma cor e o mesmo trançado do resto da carta).
// Esticam conforme ela rola e, no meio, os dedos se encaixam uns nos outros
// como peça de brinquedo: estalo, faíscas e o balanço da mola.
//
//   criarMaos(bloco, ctx) → { el, quadro(dt, info), medir(), destruir() }
//   ctx = { amb, gsap, som, anima }
//   info = { topo, altura } da janela de rolagem, em px de tela
//
// Desenho original: luvas de plástico de três dedos e polegar.

import { clamp, el, lerp, svg } from '../../nucleo/util.js';

const ALCANCE = 120;      // do punho à ponta do dedo mais comprido
const PALMA = 76;         // do punho à frente da palma
const ENCAIXE = ALCANCE + PALMA + 4;   // distância entre os punhos com os dedos encaixados
const MEIO_PASSO = 18;    // os dedos de uma ficam nos vãos da outra

const mao = (classe) => `
  <g class="mao ${classe}">
    <rect class="pele" x="-11" y="-40" width="22" height="46" rx="11" transform="translate(42 -32) rotate(28)"/>
    <path class="brilho fino" d="M-4 -33v14" transform="translate(42 -32) rotate(28)"/>
    <rect class="pele" x="56" y="-45" width="58" height="18" rx="9"/>
    <rect class="pele" x="56" y="-9" width="64" height="18" rx="9"/>
    <rect class="pele" x="56" y="27" width="55" height="18" rx="9"/>
    <path class="junta" d="M86 -43.5v15M92 -7.5v15M84 28.5v15"/>
    <path class="unha" d="M106 -41.5a5 5 0 0 1 0 11M112 -5.5a5 5 0 0 1 0 11M103 30.5a5 5 0 0 1 0 11"/>
    <rect class="pele" x="14" y="-46" width="62" height="92" rx="27"/>
    <path class="sombra" d="M22 20c8 18 34 22 48 6"/>
    <path class="vinco" d="M63 -29c5 18 5 40 0 58"/>
    <path class="brilho" d="M25 -24c3-9 11-14 21-14M68 -40h30M68 -4h36M68 32h27"/>
    <rect class="punho" x="0" y="-23" width="21" height="46" rx="8"/>
    <path class="friso" d="M7 -17v34M13.5 -17v34"/>
    <circle class="rebite" cx="4" cy="0" r="2.4"/>
  </g>`;

export function criarMaos(bloco, { amb, gsap, som, anima }) {
  const desenho = svg(`
    <svg class="poppy-maos-desenho" aria-hidden="true" focusable="false">
      <path class="mola-sombra"/>
      <path class="mola"/>
      <path class="fio-base"/>
      <path class="fio-torcido"/>
      <path class="fio-brilho"/>
      ${mao('azul')}
      ${mao('vermelha')}
    </svg>`);
  const faiscas = el('div', 'poppy-faiscas');
  const palco = el('div', { class: 'poppy-cena poppy-maos', 'aria-hidden': 'true' }, [desenho, faiscas]);

  const no = (seletor) => desenho.querySelector(seletor);
  const molaSombra = no('.mola-sombra');
  const mola = no('.mola');
  const fios = [no('.fio-base'), no('.fio-torcido'), no('.fio-brilho')];
  const azul = no('.mao.azul');
  const vermelha = no('.mao.vermelha');

  let W = 0;
  let H = 0;
  let k = 1;
  let espiras = 6;
  let meio = 0;

  // cada mão: posição do punho, velocidade, inclinação e velocidade angular
  const a = { x: 0, v: 0, ang: 0, w: 0 };
  const b = { x: 0, v: 0, ang: 0, w: 0 };
  let iniciado = false;
  let junto = false;
  let ultimaFaisca = -10;
  let t = 0;
  let pAnterior = 0;

  function medir() {
    W = palco.clientWidth;
    H = palco.clientHeight;
    if (!W || !H) return;
    k = clamp(W / 400, 0.8, 1.32);
    meio = W / 2;
    espiras = Math.max(5, Math.round((meio - (ENCAIXE / 2) * k + 14) / 17));
    desenho.setAttribute('viewBox', `0 0 ${W} ${H}`);
    faiscas.style.transform = `translate3d(${meio.toFixed(1)}px, ${(H / 2).toFixed(1)}px, 0)`;
  }

  const alvoA = (p) => lerp(-66 * k, meio - (ENCAIXE / 2) * k, p);
  const alvoB = (p) => lerp(W + 66 * k, meio + (ENCAIXE / 2) * k, p);

  function estourar(forca) {
    if (amb.reduzido) {
      const anel = el('i', 'anel');
      faiscas.append(anel);
      anima(gsap.fromTo(anel, { scale: 0.6, opacity: 0.7 }, { scale: 1.5, opacity: 0, duration: 0.9, ease: 'power1.out', onComplete: () => anel.remove() }));
      return;
    }
    const n = amb.nivel === 'baixo' ? 6 : 11;
    const anel = el('i', 'anel');
    faiscas.append(anel);
    anima(gsap.fromTo(anel, { scale: 0.3, opacity: 0.9 }, { scale: 1.9 + forca, opacity: 0, duration: 0.42, ease: 'power2.out', onComplete: () => anel.remove() }));
    for (let i = 0; i < n; i++) {
      const risco = el('i', i % 3 === 0 ? 'risco creme' : 'risco');
      faiscas.append(risco);
      const ang = (i / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
      const de = 10 + Math.random() * 10;
      const ate = (46 + Math.random() * 54) * (0.7 + forca * 0.5) * k;
      gsap.set(risco, { x: Math.cos(ang) * de, y: Math.sin(ang) * de, rotation: (ang * 180) / Math.PI + 90, scaleY: 1.3 });
      anima(gsap.to(risco, {
        x: Math.cos(ang) * ate, y: Math.sin(ang) * ate + 14, scaleY: 0.2,
        duration: 0.4 + Math.random() * 0.22, ease: 'power3.out',
      }));
      anima(gsap.to(risco, { opacity: 0, duration: 0.14, delay: 0.3 + Math.random() * 0.16, ease: 'steps(2)', onComplete: () => risco.remove() }));
    }
  }

  function encontro(velocidade) {
    const forca = clamp(velocidade / 520, 0.25, 1);
    a.w -= 150 * forca + 40;
    b.w += 150 * forca + 40;
    if (t - ultimaFaisca > 0.35) {
      ultimaFaisca = t;
      estourar(forca);
      if (!junto) som.efeito('mola');
    }
    junto = true;
  }

  function passo(dt, p) {
    const K = 150;
    const C = 9.5;
    const xa = alvoA(p);
    const xb = alvoB(p);
    a.v += (K * (xa - a.x) - C * a.v) * dt;
    b.v += (K * (xb - b.x) - C * b.v) * dt;
    a.x += a.v * dt;
    b.x += b.v * dt;

    // os dedos chegaram ao fundo: batem e voltam
    const distancia = b.x - a.x;
    const minima = ENCAIXE * k;
    if (distancia < minima) {
      const sobra = (minima - distancia) / 2;
      a.x -= sobra;
      b.x += sobra;
      const aproximacao = a.v - b.v;
      if (aproximacao > 0) {
        if (aproximacao > 70) encontro(aproximacao);
        const va = a.v;
        a.v = -0.42 * Math.abs(va);
        b.v = 0.42 * Math.abs(b.v);
      }
    }

    // a inclinação é uma mola própria, sacudida pelo estalo e pela pressa
    const alvoAng = clamp(a.v * 0.02, -9, 9);
    a.w += (130 * (alvoAng - a.ang) - 7 * a.w) * dt;
    a.ang += a.w * dt;
    const alvoAngB = clamp(b.v * 0.02, -9, 9);
    b.w += (130 * (alvoAngB - b.ang) - 7 * b.w) * dt;
    b.ang += b.w * dt;
  }

  function desenhar() {
    const cy = H / 2;
    const balanco = amb.reduzido ? 0 : 1;
    const ya = cy - (MEIO_PASSO / 2) * k + Math.sin(t * 1.9) * 2.2 * balanco;
    const yb = cy + (MEIO_PASSO / 2) * k + Math.sin(t * 1.6 + 2) * 2.2 * balanco;
    azul.setAttribute('transform', `translate(${a.x.toFixed(2)} ${ya.toFixed(2)}) rotate(${a.ang.toFixed(2)}) scale(${k.toFixed(3)})`);
    vermelha.setAttribute('transform', `translate(${b.x.toFixed(2)} ${yb.toFixed(2)}) rotate(${(-b.ang).toFixed(2)}) scale(${(-k).toFixed(3)} ${k.toFixed(3)})`);

    // a mola: o arame tem comprimento fixo, então esticar achata as espiras
    const x0 = -14;
    const comprimento = Math.max(8, a.x - x0);
    const meiaOnda = comprimento / (espiras * 2);
    const arame = 15 * k;
    const amplitude = Math.sqrt(Math.max(arame * arame - meiaOnda * meiaOnda, 3));
    let d = `M${x0} ${ya.toFixed(1)}`;
    for (let i = 0; i < espiras * 2; i++) {
      const cx = x0 + (i + 0.5) * meiaOnda;
      const fx = x0 + (i + 1) * meiaOnda;
      d += `Q${cx.toFixed(1)} ${(ya + (i % 2 ? 2 : -2) * amplitude).toFixed(1)} ${fx.toFixed(1)} ${ya.toFixed(1)}`;
    }
    mola.setAttribute('d', d);
    molaSombra.setAttribute('d', d);

    // o fio: quase esticado, com uma barriga que treme junto com a mão
    const x1 = W + 14;
    const folga = clamp((x1 - b.x) / (W * 0.5));
    const barriga = (7 + 9 * folga) * k + b.ang * 1.3 + Math.sin(t * 2.3) * 1.6 * balanco;
    const terco = (x1 - b.x) / 3;
    const dFio = `M${b.x.toFixed(1)} ${yb.toFixed(1)}C${(b.x + terco).toFixed(1)} ${(yb + barriga).toFixed(1)} ${(b.x + terco * 2).toFixed(1)} ${(yb + barriga * 0.9 - b.ang).toFixed(1)} ${x1} ${(yb - 3).toFixed(1)}`;
    for (const f of fios) f.setAttribute('d', dFio);
  }

  return {
    el: palco,
    medir,

    quadro(dt, info) {
      if (!W) medir();
      if (!W) return;
      t += dt;
      const caixa = palco.getBoundingClientRect();
      const centro = caixa.top - info.topo + caixa.height / 2;
      const p = clamp((info.altura - centro) / (info.altura * 0.54));

      if (!iniciado) {
        iniciado = true;
        a.x = alvoA(p);
        b.x = alvoB(p);
        junto = p > 0.9;
      }

      if (amb.reduzido) {
        a.x = alvoA(p);
        b.x = alvoB(p);
        if (p >= 0.995 && !junto) { junto = true; estourar(0.3); }
      } else {
        // dois passos por quadro: a mola não estoura com um quadro comprido
        const n = dt > 0.02 ? 3 : 2;
        for (let i = 0; i < n; i++) passo(dt / n, p);
        // chegou devagar, sem bater: as mãos dão um puxão para se encaixarem de estalo
        if (!junto && p >= 0.995 && pAnterior >= 0.995 && Math.abs(alvoA(p) - a.x) < 1.5 && Math.abs(a.v) < 20) {
          a.v -= 250;
          b.v += 250;
        }
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
