// O bolso: a carta lida vai para o bolso da saia, em primeira pessoa.
// (contrato: _dev/ROTEIRO2.md, seção 3d)
//
//   criarBolso({ conteudo, amb, som, mundo, raiz }) → bolso      (raiz = #bolso, no index.html)
//   bolso.guardar({ tema, envelope }) → Promise
//       tema      'poppy' | 'yourname' (a mesma cara do envelope daquele capítulo)
//       envelope  a carta aberta que ficou no mundo (ctx.estado.envelope), ou null.
//                 Ao resolver, o envelope está descartado (dispose) e #bolso, vazio e oculto.
//       Nunca rejeita e nunca passa de uns 4 s; em movimento reduzido, uma dissolvência curta.
//   bolso.ocupado → boolean (true enquanto a animação roda)
//
// O que ela vê (uns 3 s): olhando para baixo, o uniforme de verão (o laço vermelho,
// o colete, a saia de pregas, a ponta dos sapatos lá embaixo). A carta fechada
// aparece no meio da tela, a mão direita dela a segura e a leva até o bolso da
// saia; a carta entra e some lá dentro; a mão sai e o olhar volta para o caminho.
//
// Tudo é DOM/SVG desenhado aqui (funciona igual sem WebGL) e só anima transform e
// opacity. A carta some no bolso porque passa POR BAIXO de um remendo: uma segunda
// cópia do desenho da saia, recortada (recorte parado) só no pano do bolso, da boca
// para dentro. O remendo só aparece quando a carta chega à boca. A mão fica por cima
// de tudo e recebe a mesma pose da carta.
//
// O traço é o da mão de js/cenas/mao.js (tinta #2a1b22, papel branco, aguada cor
// de pele deslocada); o desenho da mão aqui é outro (as costas da mão, de cima).

import { el, espera, svg } from '../nucleo/util.js';
import { curvas } from '../nucleo/movimento.js';
import { imagemDoTema } from '../mundo/envelope.js';

const TINTA = '#2a1b22';
const LIMITE_MS = 4200;          // rede de segurança: o bolso nunca prende a carta

// ---- o corpo, visto de cima (viewBox 500 × 600; a borda de baixo é o que está mais perto dos olhos)
const VB_L = 500;
const VB_A = 600;
// A boca do bolso, na costura do lado direito da saia.
const BOCA = { x1: 284, y1: 482, x2: 402, y2: 388 };

function desenhoCorpo() {
  // pregas: da cintura (embaixo) abrem em leque até a barra (em cima)
  const N = 11;
  const cintura = (i) => { const t = i / N; return [128 + 244 * t, 512 + 26 * Math.sin(Math.PI * t)]; };
  const barra = (i) => { const t = i / N; return [14 + 472 * t, 236 - 78 * Math.sin(Math.PI * t)]; };
  let pregas = '';
  let sombras = '';
  for (let i = 0; i <= N; i++) {
    const [cx, cy] = cintura(i); const [bx, by] = barra(i);
    if (i > 0 && i < N) {
      pregas += `<path d="M${cx.toFixed(1)} ${cy.toFixed(1)} L${bx.toFixed(1)} ${by.toFixed(1)}" stroke="#1d2136" stroke-width="${i % 2 ? 1.6 : 2.4}" stroke-opacity="${i % 2 ? 0.55 : 0.8}" fill="none" stroke-linecap="round"/>`;
    }
    if (i < N && i % 2 === 0) {
      const [cx2, cy2] = cintura(i + 1); const [bx2, by2] = barra(i + 1);
      sombras += `<path d="M${cx.toFixed(1)} ${cy.toFixed(1)} L${bx.toFixed(1)} ${by.toFixed(1)} L${bx2.toFixed(1)} ${by2.toFixed(1)} L${cx2.toFixed(1)} ${cy2.toFixed(1)} Z" fill="#232842" fill-opacity="0.34"/>`;
    }
  }
  // a barra em zigue-zague suave (cada prega termina num degrau)
  let barraD = '';
  for (let i = 0; i <= N; i++) {
    const [bx, by] = barra(i);
    barraD += i === 0 ? `M${bx.toFixed(1)} ${by.toFixed(1)}` : ` L${(bx - 5).toFixed(1)} ${(by + (i % 2 ? 7 : -1)).toFixed(1)} L${bx.toFixed(1)} ${by.toFixed(1)}`;
  }
  const [c0x, c0y] = cintura(0); const [cNx, cNy] = cintura(N);
  const saia = `${barraD} L${cNx} ${cNy} Q250 548 ${c0x} ${c0y} Z`;
  const sapato = (x, giro) => `
    <g transform="translate(${x} 122) rotate(${giro}) scale(0.74)">
      <path d="M-27 60 C-33 14 -27 -40 0 -46 C27 -40 33 14 27 60 Z" fill="#ffffff"/>
      <path d="M-27 60 C-33 14 -27 -40 0 -46 C27 -40 33 14 27 60 Z" fill="#5a4038" fill-opacity="0.9" stroke="${TINTA}" stroke-width="2.2" stroke-linejoin="round"/>
      <path d="M-22 12 C-10 2 10 2 22 12" fill="none" stroke="${TINTA}" stroke-width="1.6" stroke-opacity="0.7" stroke-linecap="round"/>
      <path d="M-13 -28 C-6 -36 6 -36 13 -28" fill="none" stroke="#ffffff" stroke-width="2" stroke-opacity="0.35" stroke-linecap="round"/>
      <path d="M-25 60 C-24 36 24 36 25 60 Z" fill="#fdfbf7" stroke="${TINTA}" stroke-width="1.6" stroke-linejoin="round"/>
    </g>`;
  const { x1, y1, x2, y2 } = BOCA;
  return `
    <svg class="bolso-corpo" viewBox="0 0 ${VB_L} ${VB_A}" aria-hidden="true" focusable="false">
      <ellipse cx="250" cy="150" rx="250" ry="120" fill="${TINTA}" fill-opacity="0.07"/>
      ${sapato(204, -6)}${sapato(296, 6)}
      <path d="${saia}" fill="#ffffff"/>
      <path d="${saia}" fill="#454c6e"/>
      ${sombras}
      ${pregas}
      <path d="${saia}" fill="none" stroke="${TINTA}" stroke-width="2.6" stroke-linejoin="round"/>
      <!-- a boca do bolso: um vinco escuro e a beirada que pega luz -->
      <path d="M${x1 - 4} ${y1 + 5} L${x2 + 4} ${y2 - 2}" stroke="#12152a" stroke-width="7" stroke-linecap="round" stroke-opacity="0.85" fill="none"/>
      <path d="M${x1 - 2} ${y1 + 10} L${x2 + 6} ${y2 + 3}" stroke="#8088ad" stroke-width="1.6" stroke-linecap="round" stroke-opacity="0.8" fill="none"/>
      <!-- camisa branca aparecendo sob o colete, e o colete -->
      <path d="M96 600 C100 560 112 530 ${c0x - 6} ${c0y - 6} Q250 540 ${cNx + 6} ${cNy - 6} C388 530 400 560 404 600 Z" fill="#fdfbf7" stroke="${TINTA}" stroke-width="2" stroke-linejoin="round"/>
      <path d="M84 600 C92 566 104 542 124 524 Q250 566 376 524 C396 542 408 566 416 600 Z" fill="#ffffff"/>
      <path d="M84 600 C92 566 104 542 124 524 Q250 566 376 524 C396 542 408 566 416 600 Z" fill="#2f3553" stroke="${TINTA}" stroke-width="2.4" stroke-linejoin="round"/>
      <path d="M150 600 C156 580 162 566 170 556 M330 556 C338 566 344 580 350 600" fill="none" stroke="#161a30" stroke-width="1.6" stroke-opacity="0.7" stroke-linecap="round"/>
      <!-- o laço vermelho, bem perto dos olhos -->
      <g transform="translate(250 574)">
        <path d="M-6 -4 C-40 -44 -92 -40 -96 -2 C-92 30 -40 26 -6 6 Z" fill="#b3202f" stroke="${TINTA}" stroke-width="2.2" stroke-linejoin="round"/>
        <path d="M6 -4 C40 -44 92 -40 96 -2 C92 30 40 26 6 6 Z" fill="#b3202f" stroke="${TINTA}" stroke-width="2.2" stroke-linejoin="round"/>
        <path d="M-18 -8 C-40 -22 -66 -22 -82 -10 M18 -8 C40 -22 66 -22 82 -10" fill="none" stroke="#6f0f1c" stroke-width="1.6" stroke-linecap="round" stroke-opacity="0.8"/>
        <rect x="-11" y="-13" width="22" height="24" rx="6" fill="#c7283a" stroke="${TINTA}" stroke-width="2"/>
      </g>
    </svg>`;
}

// ---- a mão direita, de cima (costas da mão; dedos juntos apontando para a boca do bolso)
// Desenhada com os dedos para cima em 160 × 420 e deitada para a esquerda (os dedos
// apontam para −x no quadro da carta); o antebraço sai da tela.
function desenhoMao() {
  const forma = 'M50 900 L54 252 C46 226 35 200 38 170 C39 150 43 132 46 118 L46 34 C46 19 62 19 63.5 34 L64.5 24 C65.5 6 85 6 86 24 L87 32 C88 15 105.5 15 106.5 32 L107.5 58 C108.5 43 123.5 43 124.5 58 L125.5 150 C126.5 192 119 226 115 252 L120 900 Z';
  return `
    <svg class="bolso-mao" viewBox="0 0 420 160" aria-hidden="true" focusable="false">
      <g transform="translate(0 160) rotate(-90)">
        <path d="${forma}" fill="#ffffff"/>
        <path d="${forma}" fill="#f3d3c8" fill-opacity="0.78"/>
        <path d="M111 262 C119 226 126.5 192 125.5 150 L124.5 58 C123.5 49 117 46 112 50 L111 150 C111 196 105 230 99 262 Z" fill="#d49f8d" fill-opacity="0.34"/>
        <path d="${forma}" fill="none" stroke="${TINTA}" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>
        <g fill="none" stroke="${TINTA}" stroke-linecap="round">
          <path d="M64 36 L64.5 122 M86.5 28 L86.5 120 M107 50 L106.5 124" stroke-width="1.8" stroke-opacity="0.85"/>
          <path d="M48 132 q6 -5 12 0 M70 128 q6 -5 12 0 M92 130 q6 -5 11 0 M112 136 q5 -4 10 0" stroke-width="1.3" stroke-opacity="0.6"/>
          <path d="M49 84 q6 -3 12 0 M68 78 q7 -3 14 0 M90 82 q7 -3 13 0 M110 94 q6 -3 11 0" stroke-width="1.1" stroke-opacity="0.45"/>
          <path d="M50 38 q5 -9 10 0 M69.5 28 q6 -10 12 0 M91 36 q5.5 -9 11 0 M111.5 60 q5 -8 9.5 0" stroke-width="1.1" stroke-opacity="0.5"/>
          <path d="M60 250 q26 9 50 0" stroke-width="1.2" stroke-opacity="0.5"/>
        </g>
      </g>
    </svg>`;
}

/** A carta fechada, com a cara do tema (a mesma face do envelope 3D). */
function desenharCarta(tema) {
  const carta = el('div', { class: 'bolso-carta', dataset: { tema: tema || '' } });
  let face = null;
  try { face = imagemDoTema(tema, 512); } catch { face = null; }
  if (face) {
    try { carta.style.backgroundImage = `url(${face.toDataURL('image/jpeg', 0.86)})`; } catch { /* fica na cor do papel */ }
  }
  // as dobras do verso: a aba de cima fechada e as duas de baixo
  carta.append(svg(`
    <svg viewBox="0 0 460 320" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <path d="M0 320 L208 190 Q230 178 252 190 L460 320" fill="none" stroke="#000000" stroke-opacity="0.22" stroke-width="3"/>
      <path d="M0 0 L208 194 Q230 212 252 194 L460 0" fill="none" stroke="#000000" stroke-opacity="0.34" stroke-width="5" transform="translate(0 3)"/>
      <path d="M0 0 L208 194 Q230 212 252 194 L460 0" fill="none" stroke="#ffffff" stroke-opacity="${face ? 0.34 : 0.9}" stroke-width="2"/>
      <rect x="1" y="1" width="458" height="318" rx="7" fill="none" stroke="${TINTA}" stroke-opacity="${face ? 0.5 : 0.22}" stroke-width="2"/>
    </svg>`));
  return carta;
}

export function criarBolso({ conteudo, amb, som, raiz }) {
  let ocupado = false;
  const rotulo = conteudo?.inventario?.rotulos?.guardando || '';

  function descartar(envelope) {
    if (!envelope || envelope.descartado) return;
    try { envelope.dispose?.(); } catch (erro) { console.error(erro); }
  }

  /** Dito em voz alta (o desenho é aria-hidden): um aviso educado, fora de #bolso. */
  function anunciar() {
    if (!rotulo || typeof document === 'undefined') return () => {};
    const aviso = el('p', { class: 'bolso-aviso', role: 'status', 'aria-live': 'polite' });
    document.body.append(aviso);
    // (o texto entra depois do nó: é a mudança que os leitores de tela anunciam)
    setTimeout(() => { aviso.textContent = rotulo; }, 60);
    return () => setTimeout(() => aviso.remove(), 1500);
  }

  async function animar(tema, envelope) {
    const gsap = window.gsap;
    const L = window.innerWidth; const A = window.innerHeight;
    const reduzido = !!amb?.reduzido;

    // A carta aparece onde a carta do mundo estava (o meio da tela, um pouco abaixo dos olhos).
    const larguraCarta = Math.min(L * 0.7, A * 0.5, 380);
    const alturaCarta = larguraCarta * (16 / 23);
    const centro = { x: L / 2, y: A * 0.46 };

    const carta = desenharCarta(tema);
    Object.assign(carta.style, { width: `${larguraCarta}px`, height: `${alturaCarta}px`, left: `${-larguraCarta / 2}px`, top: `${-alturaCarta / 2}px` });

    raiz.textContent = '';
    raiz.dataset.tema = tema || '';
    raiz.hidden = false;

    if (reduzido || !gsap) {
      // Sem viagem: a carta aparece, fica um instante e se desfaz.
      const leva = el('div', 'bolso-leva', carta);
      leva.style.transform = `translate3d(${centro.x}px, ${centro.y}px, 0)`;
      raiz.append(leva);
      descartar(envelope);
      if (!gsap) { await espera(700); return; }
      await new Promise((ok) => {
        gsap.timeline({ onComplete: ok })
          .fromTo(leva, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3, ease: 'none' })
          .to(leva, { autoAlpha: 0, duration: 0.6, ease: 'none' }, 0.75);
      });
      return;
    }

    // O corpo: ancorado embaixo, no meio; no computador não passa de ~72% da altura.
    const larguraCorpo = Math.min(L * 1.2, A * 0.6, 640);
    const alturaCorpo = larguraCorpo * (VB_A / VB_L);
    const k = larguraCorpo / VB_L;
    // (um pouco para a esquerda: ela olha para o lado direito do corpo, onde fica o bolso)
    const ox = (L - larguraCorpo) / 2 - larguraCorpo * 0.13; const oy = A - alturaCorpo;
    const corpo = svg(desenhoCorpo());
    Object.assign(corpo.style, { left: `${ox}px`, top: `${oy}px`, width: `${larguraCorpo}px`, height: `${alturaCorpo}px` });
    const palco = el('div', 'bolso-palco', corpo);
    const remendoSvg = svg(desenhoCorpo());
    Object.assign(remendoSvg.style, { left: `${ox}px`, top: `${oy}px`, width: `${larguraCorpo}px`, height: `${alturaCorpo}px` });
    const remendo = el('div', 'bolso-palco bolso-remendo', remendoSvg);

    // A boca do bolso, em px de tela.
    const p1 = { x: ox + BOCA.x1 * k, y: oy + BOCA.y1 * k };
    const p2 = { x: ox + BOCA.x2 * k, y: oy + BOCA.y2 * k };
    const boca = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const phi = Math.atan2(p2.y - p1.y, p2.x - p1.x);           // direção da boca
    const meio = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    // para dentro do bolso: perpendicular à boca, para cima e para o meio do corpo
    const dentro = { x: Math.sin(phi), y: -Math.cos(phi) };

    const levaCarta = el('div', 'bolso-leva', carta);

    // A mão: fora do recorte, com a mesma pose da carta.
    const mao = svg(desenhoMao());
    const alturaMao = alturaCarta * 0.86;
    const un = alturaMao / 160;
    Object.assign(mao.style, {
      width: `${420 * un}px`, height: `${alturaMao}px`,
      left: `${larguraCarta * 0.02 - 12 * un}px`, top: `${-alturaMao / 2 + alturaCarta * 0.04}px`,
    });
    const levaMao = el('div', 'bolso-leva', mao);

    // Pose da carta (centro, giro, escala) e, à parte, quanto a mão está afastada dela.
    const giroFinal = phi + Math.PI / 2;                          // o lado comprido na direção de entrar
    const escalaFinal = Math.min(1, (boca * 0.8) / alturaCarta);
    const larguraFinal = larguraCarta * escalaFinal;

    // O remendo: o pano do bolso, da boca para dentro (um quadrilátero, em px do próprio svg).
    {
      const fundo = larguraFinal * 1.3;
      const dx = Math.cos(phi) * boca * 0.07; const dy = Math.sin(phi) * boca * 0.07;
      const cantos = [
        [p1.x - dx, p1.y - dy], [p2.x + dx, p2.y + dy],
        [p2.x + dx + dentro.x * fundo, p2.y + dy + dentro.y * fundo], [p1.x - dx + dentro.x * fundo, p1.y - dy + dentro.y * fundo],
      ].map(([x, y]) => `${(x - ox).toFixed(1)}px ${(y - oy).toFixed(1)}px`).join(', ');
      remendoSvg.style.clipPath = `polygon(${cantos})`;
      remendoSvg.style.webkitClipPath = `polygon(${cantos})`;
    }
    remendo.style.visibility = 'hidden';
    raiz.append(palco, levaCarta, remendo, levaMao);
    const naBoca = { x: meio.x - dentro.x * larguraFinal * 0.42, y: meio.y - dentro.y * larguraFinal * 0.42 };
    const guardada = { x: meio.x + dentro.x * larguraFinal * 0.62, y: meio.y + dentro.y * larguraFinal * 0.62 };
    const pose = { x: centro.x, y: centro.y, giro: 0.1, escala: 1, mao: larguraCarta * 2.2, maoY: alturaCarta * 0.7 };
    const aplicar = () => {
      const base = `translate3d(${pose.x.toFixed(2)}px, ${pose.y.toFixed(2)}px, 0) rotate(${pose.giro.toFixed(4)}rad) scale(${pose.escala.toFixed(4)})`;
      levaCarta.style.transform = base;
      levaMao.style.transform = `${base} translate3d(${pose.mao.toFixed(2)}px, ${pose.maoY.toFixed(2)}px, 0)`;
    };
    aplicar();

    descartar(envelope);                       // a carta do mundo já não aparece: a daqui assume
    const efeito = (nome) => { try { som?.efeito?.(nome); } catch { /* sem som */ } };

    await new Promise((ok) => {
      const tl = gsap.timeline({ onComplete: ok, onUpdate: aplicar });
      // 1. o olhar desce: o uniforme sobe na tela; a carta aparece no meio
      tl.fromTo(palco, { yPercent: 46, autoAlpha: 0 }, { yPercent: 0, autoAlpha: 1, duration: 0.75, ease: curvas.branco.entrar }, 0)
        .fromTo(carta, { autoAlpha: 0, scale: 0.94 }, { autoAlpha: 1, scale: 1, duration: 0.4, ease: curvas.branco.entrar }, 0)
        // 2. a mão dela pega a carta
        .to(pose, { mao: 0, maoY: 0, duration: 0.6, ease: 'power3.out' }, 0.12)
        .fromTo(levaMao, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.25, ease: 'none' }, 0.12)
        .add(() => efeito('papel'), 0.55)
        // 3. e a leva até a boca do bolso, girando e ficando menor (está mais longe dos olhos)
        .to(pose, { x: naBoca.x, y: naBoca.y, duration: 0.95, ease: 'power2.inOut' }, 0.68)
        .to(pose, { giro: giroFinal, escala: escalaFinal, duration: 0.95, ease: 'power2.inOut' }, 0.68)
        // 4. a carta entra: escorrega para dentro e some atrás da boca (por baixo do remendo)
        .set(remendo, { visibility: 'visible' }, 1.64)
        .to(pose, { x: guardada.x, y: guardada.y, duration: 0.6, ease: 'power2.in' }, 1.66)
        .to(pose, { mao: larguraCarta * 0.6, duration: 0.6, ease: 'power2.in' }, 1.66)   // os dedos param na boca
        .add(() => efeito('toque'), 2.2)
        // já está toda coberta pelo remendo: some de vez, senão reaparece através da saia
        // enquanto o uniforme se apaga
        .set(levaCarta, { autoAlpha: 0 }, 2.3)
        // 5. a mão sai e o olhar volta para o caminho
        .to(pose, { mao: larguraCarta * 2.4, maoY: alturaCarta * 0.9, duration: 0.6, ease: 'power2.in' }, 2.32)
        .to(levaMao, { autoAlpha: 0, duration: 0.3, ease: 'none' }, 2.62)
        .to([palco, remendo], { yPercent: 40, autoAlpha: 0, duration: 0.6, ease: curvas.branco.sair }, 2.42);
    });
  }

  return {
    get ocupado() { return ocupado; },

    async guardar({ tema = 'poppy', envelope = null } = {}) {
      if (ocupado) { descartar(envelope); return; }
      ocupado = true;
      const calar = anunciar();
      try {
        if (!raiz) { descartar(envelope); return; }
        await Promise.race([
          animar(tema, envelope),
          espera(LIMITE_MS),
        ]);
      } catch (erro) {
        console.error('[carta] o bolso falhou', erro);
      } finally {
        descartar(envelope);
        if (raiz) {
          try { window.gsap?.killTweensOf?.(raiz.querySelectorAll('*')); } catch { /* nada a matar */ }
          raiz.textContent = '';
          raiz.hidden = true;
          delete raiz.dataset.tema;
        }
        calar();
        ocupado = false;
      }
    },
  };
}
