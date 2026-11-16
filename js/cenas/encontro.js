// O encontro: o fio que ela seguiu leva até ele.
//
//   cenaEncontro(ctx, { frio }) → Promise   resolve com a última carta à vista, fechada
//   prepararEncontro(ctx)       → Promise<quadros[]>   baixa e decodifica os quadros (a cena da mão chama)
//
// Etapas: chegando → planos → maos → carta
//
// A caminhada pelo fio termina no crepúsculo (a cena da mão deixa o entardecer
// aceso e a última carta escondida). Aqui a luz corre pelo fio, a alameda
// escurece e os quadros do content.js (encontro.quadros) entram como planos de
// um filme, um de cada vez, sozinhos: cada um com uma panorâmica lenta do `foco`
// até o `ate`. Os dois quadros que têm `dedo` (as mãos) voltam juntos no fim: o
// fio vermelho do site liga um dedinho ao outro, a luz corre por ele e vira um
// clarão, e de dentro do clarão surge a última carta, já com o fio no laço. A
// cena final segue dali como sempre.
//
// Tudo é DOM por cima do mundo (dentro de #palco, que o diretor limpa se a cena
// quebrar): a cena é a mesma com e sem WebGL.
//   .encontro
//     .enc-ceu                 o crepúsculo (em pé cobre a tela; deitado é só um véu sobre a alameda)
//     .enc-plano × n           .enc-fundo (o próprio quadro, desfocado, enchendo a tela em pé)
//                              .enc-faixa (máscara de bordas) > img (só transform anima)
//     .enc-mao × 2             os recortes das mãos
//     svg.enc-fio              o fio de verdade: a emenda com o fio do primeiro quadro e o laço entre os dedinhos
//     .enc-grao                grão de filme (esconde a baixa resolução)
//     .enc-clarao              o clarão
//
// Em pé (celular) os quadros, que são deitados e pequenos, ocupam uma faixa alta
// no meio da tela com as bordas dissolvidas no próprio quadro desfocado; o mundo
// 3D é desligado atrás (economia). Deitado (computador) é uma faixa larga de
// cinema com a alameda, ao entardecer, andando em volta.
//
// Quadro que não carregar é pulado. Se nenhum carregar, a cena faz só a chegada
// de antes (a luz corre pelo fio e a carta aparece). Movimento reduzido:
// dissolvências simples, sem panorâmica nem aproximação (cada quadro parado no `ate`).

import { clamp, el, espera, lerp } from '../nucleo/util.js';
import { curvas } from '../nucleo/movimento.js';
import { temEncontro } from '../nucleo/diretor.js';
import { entardecer } from './mao.js';

const NS = 'http://www.w3.org/2000/svg';
const COR_FIO = '#d7192d';
const SOBRA = 1.04;                 // o quadro cobre a faixa com esta folga (a panorâmica tem para onde ir)
const ESPERA_QUADROS = 5000;        // ms no máximo esperando os quadros (rede lenta: o que não veio é pulado)

// Tempos, em segundos de cena.
const T = {
  escurecer: 2.0,                   // a alameda escurece e a luz corre pelo fio
  entrada: 1.2,                     // quando o primeiro plano começa a aparecer
  dissolver: 1.0,                   // dissolvência entre dois planos
  plano: [3.8, 3.1, 3.2, 3.2],      // quanto cada plano fica (os seguintes repetem o último)
  maos: 4.2,                        // as mãos: o fio se desenha (0,9 → 2,3), fica, e a luz corre (3,0 → 4,0)
  fim: 3.3,                         // o plano final (`fim: true`), das mãos até o clarão
};

const ponto = (p, padrao) => ({
  x: clamp(Number.isFinite(p?.x) ? p.x : padrao.x),
  y: clamp(Number.isFinite(p?.y) ? p.y : padrao.y),
});

/** Baixa um quadro uma vez só e devolve um endereço em memória (as cópias não pedem de novo). */
async function baixar(endereco) {
  try {
    const resposta = await fetch(endereco);
    if (!resposta.ok) return null;
    const url = URL.createObjectURL(await resposta.blob());
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    if (!img.naturalWidth || !img.naturalHeight) return null;
    return { url, nw: img.naturalWidth, nh: img.naturalHeight };
  } catch {
    return null;
  }
}

/**
 * Baixa e decodifica os quadros (uma vez; a cena da mão chama enquanto ela anda).
 * Devolve só os que chegaram, na ordem do content.js.
 */
export function prepararEncontro(ctx) {
  const { conteudo, estado } = ctx;
  if (estado.encontroQuadros) return estado.encontroQuadros;
  const lista = temEncontro(conteudo) ? conteudo.encontro.quadros : [];
  estado.encontroQuadros = Promise.all(lista.map(async (q) => {
    if (!q || typeof q.imagem !== 'string' || !q.imagem.trim()) return null;
    const arquivo = await baixar(q.imagem.trim());
    if (!arquivo) return null;
    const foco = ponto(q.foco, { x: 0.5, y: 0.5 });
    const a = q.aparar || {};
    return {
      ...arquivo,
      alt: typeof q.alt === 'string' ? q.alt : '',
      foco,
      ate: ponto(q.ate, foco),
      dedo: q.dedo ? ponto(q.dedo, foco) : null,
      fim: q.fim === true,
      fio: q.fio ? ponto(q.fio, { x: 0.5, y: 0.95 }) : null,
      aparar: {
        topo: clamp(Number(a.topo) || 0, 0, 0.3), base: clamp(Number(a.base) || 0, 0, 0.3),
        esquerda: clamp(Number(a.esquerda) || 0, 0, 0.3), direita: clamp(Number(a.direita) || 0, 0, 0.3),
      },
    };
  })).then((quadros) => quadros.filter(Boolean));
  return estado.encontroQuadros;
}

/** O grão: um ladrilho de ruído pintado uma vez (publicado como --enc-grao). */
let graoPintado = false;
function pintarGrao() {
  if (graoPintado) return;
  graoPintado = true;
  try {
    const tela = document.createElement('canvas');
    tela.width = 128;
    tela.height = 128;
    const g = tela.getContext('2d');
    const dados = g.createImageData(128, 128);
    for (let i = 0; i < dados.data.length; i += 4) {
      const v = Math.random();
      const claro = v > 0.5;
      dados.data[i] = dados.data[i + 1] = dados.data[i + 2] = claro ? 255 : 0;
      dados.data[i + 3] = Math.round(Math.abs(v - 0.5) * 2 * 26);
    }
    g.putImageData(dados, 0, 0);
    document.documentElement.style.setProperty('--enc-grao', `url("${tela.toDataURL('image/png')}")`);
  } catch { /* sem canvas: sem grão */ }
}

function novaImagem(q, alt = '') {
  const img = new Image();
  img.decoding = 'sync';
  img.alt = alt;
  img.draggable = false;
  img.width = q.nw;
  img.height = q.nh;
  img.src = q.url;
  return img;
}

/**
 * A chegada sem quadros (nenhum carregou): o que a cena da mão fazia sozinha.
 * A luz corre pelo fio até o laço da carta, que acende, e a luz do dia volta.
 */
async function chegadaSimples(ctx) {
  const { estado, som, amb } = ctx;
  const gsap = window.gsap;
  const calmo = amb.reduzido;
  const fio = estado.fio;
  mostrarCarta(ctx, calmo ? 0.8 : 1.6);
  if (fio && fio.pulso) {
    const chegou = fio.pulso({ de: 0, ate: 1.02, duracao: calmo ? 1.6 : 2.8, forca: 1.15, largura: 0.8, brasas: 20, curva: 'power1.inOut' });
    await espera(calmo ? 700 : 2200);
    estado.envelope?.brilharLaco?.(0.85, calmo ? 0.6 : 1.1);
    som.efeito('brilho');
    await chegou;
  }
  entardecer(ctx, false, calmo ? 1.6 : 3.2);
  if (fio && fio.halo) {
    const luz = { halo: 0.55 };
    gsap.to(luz, { halo: 0.12, duration: 3, ease: 'sine.inOut', onUpdate: () => fio.halo(luz.halo) });
  }
}

/** A última carta, que a cena da mão deixou escondida, aparece. */
function mostrarCarta(ctx, duracao = 1.4) {
  const { mundo, estado } = ctx;
  // Ele, que esperava no fim do fio, dá lugar à carta: some, e a ponta do fio
  // (que subia até a mão dele) volta a se prender nela.
  if (estado.ele) {
    const ele = estado.ele;
    estado.ele = null;
    ele.sair(Math.min(duracao, 1.2));
    estado.seguidorFio?.ancorar?.(null);
  }
  const env = estado.envelope;
  if (!env || !estado.cartaEscondida) return;
  estado.cartaEscondida = false;
  if (mundo.ok) { if (env.grupo) env.grupo.visible = true; }
  else env.chegar?.({ duracao });
}

export async function cenaEncontro(ctx, { frio } = {}) {
  const { diretor, mundo, som, musica, estado, amb } = ctx;
  const gsap = window.gsap;
  const calmo = amb.reduzido;
  const palco = document.getElementById('palco');

  if (frio) {
    musica.mostrarMini();
    mundo.petalas.definirDensidade(1);
  }

  diretor.etapa('chegando');
  // O crepúsculo inteiro (na caminhada ele tinha clareado pela metade).
  entardecer(ctx, true, calmo ? 1.2 : T.escurecer);
  const quadros = await Promise.race([prepararEncontro(ctx), espera(ESPERA_QUADROS).then(() => [])]).catch(() => []);

  if (!quadros.length) {
    try { await chegadaSimples(ctx); } finally { entardecer(ctx, false, 1.2); mostrarCarta(ctx, 0.8); }
    return;
  }

  // ---- montagem ---------------------------------------------------------------------
  pintarGrao();
  const raiz = el('div', { class: 'encontro' });
  const ceu = el('div', { class: 'enc-ceu', 'aria-hidden': 'true' });
  raiz.append(ceu);

  // O plano final (`fim: true`, só o primeiro) entra depois das mãos; os outros, na ordem.
  const ultimoQuadro = quadros.find((q) => q.fim) || null;
  const criarPlano = (q, i) => {
    const fundoImg = novaImagem(q);
    const fundo = el('div', { class: 'enc-fundo', 'aria-hidden': 'true' }, [fundoImg]);
    fundoImg.style.objectPosition = `${(lerp(q.foco.x, q.ate.x, 0.5) * 100).toFixed(1)}% 50%`;
    const img = novaImagem(q, q.alt);
    const faixa = el('div', { class: 'enc-faixa' }, [img]);
    const no = el('div', { class: 'enc-plano' }, [fundo, faixa]);
    raiz.append(no);
    // k: 0 → 1 ao longo do plano (foco → ate, e um leve avanço)
    return { q, no, faixa, img, caixa: null, k: 0, opacidade: 0, dura: T.plano[Math.min(i, T.plano.length - 1)] };
  };
  const planos = quadros.filter((q) => q !== ultimoQuadro).map(criarPlano);
  const ultimo = ultimoQuadro ? criarPlano(ultimoQuadro, 0) : null;
  const todos = ultimo ? [...planos, ultimo] : planos;

  // As mãos: os dois primeiros quadros com `dedo`.
  const comDedo = quadros.filter((q) => q.dedo).slice(0, 2);
  const maos = comDedo.length === 2 ? comDedo.map((q, i) => {
    const img = novaImagem(q);
    const no = el('div', { class: `enc-mao enc-mao-${i ? 'b' : 'a'}`, 'aria-hidden': 'true' }, [img]);
    raiz.append(no);
    return { q, no, img, opacidade: 0, perto: 0, dedo: { x: 0, y: 0 } };
  }) : null;

  const desenho = document.createElementNS(NS, 'svg');
  desenho.setAttribute('class', 'enc-fio');
  desenho.setAttribute('aria-hidden', 'true');
  const traco = (classe) => {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('class', classe);
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke-linecap', 'round');
    desenho.append(p);
    return p;
  };
  // a emenda: o fio do caminho entra pela base e encontra o fio do quadro
  const emenda = todos.some((p) => p.q.fio) ? { sombra: traco('enc-fio-sombra'), fio: traco('enc-fio-linha') } : null;
  // o laço entre os dedinhos
  const laco = maos ? { sombra: traco('enc-fio-sombra'), fio: traco('enc-fio-linha'), luz: traco('enc-fio-luz') } : null;
  if (laco) {
    for (const p of [laco.sombra, laco.fio, laco.luz]) { p.setAttribute('pathLength', '1'); p.setAttribute('stroke-dasharray', '1 1'); p.setAttribute('stroke-dashoffset', '1'); }
  }
  // a luz que corre pelo laço: uma conta de luz macia (não um traço)
  const brasa = laco ? el('div', { class: 'enc-brasa', 'aria-hidden': 'true' }) : null;
  const grao = el('div', { class: 'enc-grao', 'aria-hidden': 'true' });
  const clarao = el('div', { class: 'enc-clarao', 'aria-hidden': 'true' });
  const branco = el('div', { class: 'enc-branco', 'aria-hidden': 'true' });
  raiz.append(desenho, ...(brasa ? [brasa] : []), grao, clarao, branco);
  palco.append(raiz);

  // ---- geometria ----------------------------------------------------------------------
  const geo = { L: 1, A: 1, emPe: true, faixa: { x: 0, y: 0, w: 1, h: 1 }, maos: [] };
  const estadoFio = { desenhado: 0, luz: 0, conta: 0, alfa: 0 };

  function medir() {
    const L = Math.max(1, raiz.clientWidth || innerWidth);
    const A = Math.max(1, raiz.clientHeight || innerHeight);
    const emPe = L / A < 1;
    geo.L = L; geo.A = A; geo.emPe = emPe;
    raiz.classList.toggle('enc-em-pe', emPe);
    if (emPe) {
      const h = Math.round(A * 0.64);
      geo.faixa = { x: 0, y: Math.round(A * 0.165), w: L, h };
      // ela em cima, ele embaixo
      geo.maos = [
        { x: 0, y: A * 0.07, w: L, h: A * 0.45, dedo: { x: 0.66, y: 0.5 }, vem: { x: 0, y: 1 } },
        { x: 0, y: A * 0.48, w: L, h: A * 0.45, dedo: { x: 0.26, y: 0.62 }, vem: { x: 0, y: -1 } },
      ];
    } else {
      const w = Math.min(L, 1680);
      const h = Math.round(Math.min(A * 0.66, w / 2.2));   // faixa alta o bastante para um rosto caber inteiro no miolo
      geo.faixa = { x: Math.round((L - w) / 2), y: Math.round((A - h) * 0.46), w, h };
      const mw = Math.min(L * 0.44, 760);
      const mh = Math.min(A * 0.6, mw * 0.72);
      const my = (A - mh) * 0.46;
      // ela à esquerda, ele à direita: os dedinhos se encontram no meio
      geo.maos = [
        { x: L / 2 - mw - L * 0.012, y: my, w: mw, h: mh, dedo: { x: 0.78, y: 0.5 }, vem: { x: 1, y: 0 } },
        { x: L / 2 + L * 0.012, y: my, w: mw, h: mh, dedo: { x: 0.2, y: 0.56 }, vem: { x: -1, y: 0 } },
      ];
    }
    for (const p of todos) {
      // Deitado, um quadro em pé não cabe na faixa de cinema: ganha uma janela alta no meio.
      const a = p.q.aparar;
      const prop = (p.q.nw * (1 - a.esquerda - a.direita)) / (p.q.nh * (1 - a.topo - a.base));
      let f = geo.faixa;
      const emPeNoLargo = !emPe && prop < 1.2;
      if (emPeNoLargo) {
        const h = Math.round(A * 0.8);
        const w = Math.round(Math.min(L, h * prop));
        f = { x: Math.round((L - w) / 2), y: Math.round((A - h) * 0.46), w, h };
      }
      p.caixa = f;
      p.faixa.classList.toggle('enc-faixa-alta', emPeNoLargo);
      const s = p.faixa.style;
      s.left = `${f.x}px`; s.top = `${f.y}px`; s.width = `${f.w}px`; s.height = `${f.h}px`;
    }
    if (maos) {
      maos.forEach((m, i) => {
        const r = geo.maos[i];
        const s = m.no.style;
        s.left = `${r.x.toFixed(1)}px`; s.top = `${r.y.toFixed(1)}px`; s.width = `${r.w.toFixed(1)}px`; s.height = `${r.h.toFixed(1)}px`;
      });
    }
    desenho.setAttribute('viewBox', `0 0 ${L} ${A}`);
    const grossura = clamp(Math.min(L, A) / 150, 2.4, 4.2);
    raiz.style.setProperty('--enc-fio-l', `${grossura.toFixed(2)}px`);
  }

  /** Enquadra um quadro numa caixa: o ponto (fx, fy) no lugar pedido, sem nunca mostrar a borda. */
  function enquadrar(q, caixa, fx, fy, zoom, alvo = { x: 0.5, y: 0.5 }) {
    const a = q.aparar;
    const utilL = q.nw * (1 - a.esquerda - a.direita);
    const utilA = q.nh * (1 - a.topo - a.base);
    const s = Math.max(caixa.w / utilL, caixa.h / utilA) * SOBRA * zoom;
    const W = q.nw * s;
    const H = q.nh * s;
    const tx = clamp(caixa.w * alvo.x - fx * W, caixa.w - W * (1 - a.direita), -W * a.esquerda);
    const ty = clamp(caixa.h * alvo.y - fy * H, caixa.h - H * (1 - a.base), -H * a.topo);
    return { s, tx, ty, W, H };
  }

  const suave = (t) => t * t * (3 - 2 * t);

  function centrarClarao() {
    const c = geo.centro || { x: geo.L / 2, y: geo.A * 0.46 };
    clarao.style.left = `${c.x.toFixed(1)}px`;
    clarao.style.top = `${c.y.toFixed(1)}px`;
  }

  function desenhar() {
    let fioAlfa = 0;
    let fioFim = null;
    for (const p of todos) {
      const f = p.caixa;
      const visivel = p.opacidade > 0.001;
      p.no.style.visibility = visivel ? 'visible' : 'hidden';
      if (!visivel) continue;
      p.no.style.opacity = p.opacidade.toFixed(3);
      const k = calmo ? 1 : suave(clamp(p.k));      // no movimento reduzido, parado onde a panorâmica chegaria
      const e = enquadrar(p.q, f, lerp(p.q.foco.x, p.q.ate.x, k), lerp(p.q.foco.y, p.q.ate.y, k), calmo ? 1 : lerp(1, 1.07, clamp(p.k)));
      p.img.style.transform = `translate3d(${e.tx.toFixed(2)}px, ${e.ty.toFixed(2)}px, 0) scale(${e.s.toFixed(5)})`;
      if (p === ultimo) p.centro = { x: f.x + e.tx + p.q.ate.x * e.W, y: f.y + e.ty + p.q.ate.y * e.H };
      if (p.q.fio && emenda) {
        fioAlfa = p.opacidade;
        fioFim = { x: f.x + e.tx + p.q.fio.x * e.W, y: f.y + e.ty + p.q.fio.y * e.H, W: e.W };
      }
    }
    if (emenda) {
      const mostra = fioAlfa > 0.001 && fioFim;
      emenda.fio.style.opacity = emenda.sombra.style.opacity = mostra ? fioAlfa.toFixed(3) : '0';
      if (mostra) {
        // Do pé da tela (por onde vinha o fio do caminho) até o fio do quadro, chegando
        // na mesma direção em que ele segue lá dentro (para cima e para a direita).
        const y0 = geo.A + 14;
        const x0 = fioFim.x - Math.min(geo.L * 0.34, (y0 - fioFim.y) * 0.9);
        const dx = Math.max(60, fioFim.W * 0.07);
        const d = `M${x0.toFixed(1)} ${y0.toFixed(1)} C${(x0 + geo.L * 0.02).toFixed(1)} ${(y0 - (y0 - fioFim.y) * 0.55).toFixed(1)}`
          + ` ${(fioFim.x - dx).toFixed(1)} ${(fioFim.y + dx * 0.42).toFixed(1)} ${fioFim.x.toFixed(1)} ${fioFim.y.toFixed(1)}`;
        emenda.fio.setAttribute('d', d);
        emenda.sombra.setAttribute('d', d);
      }
    }
    if (maos) {
      maos.forEach((m, i) => {
        const visivel = m.opacidade > 0.001;
        m.no.style.visibility = visivel ? 'visible' : 'hidden';
        if (!visivel) return;
        const r = geo.maos[i];
        const perto = calmo ? 1 : m.perto;
        // as mãos se aproximam: o recorte anda para o outro e chega um pouco mais perto
        const anda = (1 - perto) * Math.min(geo.L, geo.A) * 0.07;
        const ox = -r.vem.x * anda;
        const oy = -r.vem.y * anda;
        const e = enquadrar(m.q, r, m.q.dedo.x, m.q.dedo.y, calmo ? 1.3 : lerp(1.22, 1.34, perto), r.dedo);
        m.no.style.opacity = m.opacidade.toFixed(3);
        m.no.style.transform = `translate3d(${ox.toFixed(2)}px, ${oy.toFixed(2)}px, 0)`;
        m.img.style.transform = `translate3d(${e.tx.toFixed(2)}px, ${e.ty.toFixed(2)}px, 0) scale(${e.s.toFixed(5)})`;
        m.dedo.x = r.x + ox + e.tx + m.q.dedo.x * e.W;
        m.dedo.y = r.y + oy + e.ty + m.q.dedo.y * e.H;
      });
      const [a, b] = maos;
      // Do dedinho dela ao dele, com uma barriga que estica conforme as mãos chegam.
      const dx = b.dedo.x - a.dedo.x;
      const dy = b.dedo.y - a.dedo.y;
      const comp = Math.hypot(dx, dy) || 1;
      const folga = comp * lerp(0.2, 0.09, a.perto);
      let c1;
      let c2;
      if (geo.emPe) {
        // Em pé o fio cai reto do nó dela (por fora da mão), cruza o céu entre os dois
        // recortes e chega ao dedinho dele por cima e por fora, sem cruzar os dedos.
        const lado = dx < 0 ? -1 : 1;
        const abre = geo.L * lerp(0.2, 0.15, a.perto);
        c1 = { x: a.dedo.x - lado * geo.L * 0.02, y: a.dedo.y + dy * 0.42 };
        c2 = { x: b.dedo.x + lado * abre * 0.9, y: b.dedo.y - dy * 0.5 };
      } else {
        // Deitado, de um dedinho ao outro com uma barriga para baixo (o fio tem peso).
        c1 = { x: a.dedo.x + dx * 0.3, y: a.dedo.y + dy * 0.3 + folga };
        c2 = { x: a.dedo.x + dx * 0.7, y: a.dedo.y + dy * 0.7 + folga };
      }
      const d = `M${a.dedo.x.toFixed(1)} ${a.dedo.y.toFixed(1)} C${c1.x.toFixed(1)} ${c1.y.toFixed(1)} ${c2.x.toFixed(1)} ${c2.y.toFixed(1)} ${b.dedo.x.toFixed(1)} ${b.dedo.y.toFixed(1)}`;
      for (const p of [laco.sombra, laco.fio, laco.luz]) p.setAttribute('d', d);
      const off = (1 - estadoFio.desenhado).toFixed(4);
      laco.sombra.setAttribute('stroke-dashoffset', off);
      laco.fio.setAttribute('stroke-dashoffset', off);
      laco.luz.setAttribute('stroke-dashoffset', off);
      laco.sombra.style.opacity = laco.fio.style.opacity = estadoFio.alfa.toFixed(3);
      laco.luz.style.opacity = (estadoFio.alfa * estadoFio.luz).toFixed(3);
      // a conta de luz corre do dedinho dela ao dele (nasce e some nas pontas)
      const u = estadoFio.conta;
      const acesa = u > 0.001 && u < 0.999 && estadoFio.alfa > 0.001;
      brasa.style.opacity = acesa ? (Math.min(1, u * 8, (1 - u) * 6) * estadoFio.alfa).toFixed(3) : '0';
      if (acesa) {
        let pt = null;
        try { pt = laco.fio.getPointAtLength(laco.fio.getTotalLength() * u); } catch { /* sem geometria: fica onde está */ }
        if (pt) brasa.style.transform = `translate3d(${pt.x.toFixed(1)}px, ${pt.y.toFixed(1)}px, 0)`;
      }
      // o clarão nasce no meio do fio (o lugar é escrito uma vez, quando ele começa: ver centrarClarao)
      geo.centro = { x: (a.dedo.x + b.dedo.x) / 2, y: (a.dedo.y + b.dedo.y) / 2 };
    }
    // com o plano final à vista, o clarão nasce nele (no ponto `ate`)
    if (ultimo && ultimo.opacidade > 0.5 && ultimo.centro) geo.centro = ultimo.centro;
  }

  let mundoDesligado = false;
  const religar = () => { if (mundoDesligado) { mundoDesligado = false; mundo.ligar(); } };
  // Se a tela girar: refaz as medidas; deitada, a alameda volta a aparecer em volta da faixa.
  const aoGirar = () => { medir(); if (!geo.emPe) religar(); desenhar(); centrarClarao(); };
  medir();
  desenhar();
  const pararTamanho = mundo.aoRedimensionar(aoGirar);
  window.addEventListener('resize', aoGirar, { passive: true });
  const tl = gsap.timeline({ onUpdate: desenhar });

  try {
    // ---- chegando: a luz corre pelo fio e a alameda escurece ----------------------------
    const fio = estado.fio;
    if (fio && fio.pulso) fio.pulso({ de: 0, ate: 1.02, duracao: calmo ? 1.4 : 2.4, forca: 1.15, largura: 0.8, brasas: 16, curva: 'power1.inOut' });
    if (!frio) som.efeito('brilho');
    musica.esconderMini();
    tl.to(ceu, { opacity: 1, duration: calmo ? 1.2 : T.escurecer, ease: 'sine.inOut' }, 0);
    tl.to(grao, { opacity: 1, duration: 1.6, ease: 'none' }, calmo ? 0.4 : T.entrada);

    // ---- planos: um de cada vez, dissolvendo um no outro --------------------------------
    let t = calmo ? 0.9 : T.entrada;
    tl.call(() => diretor.etapa('planos'), null, t);
    planos.forEach((p, i) => {
      const entra = i === 0 ? 1.5 : T.dissolver;
      tl.to(p, { opacidade: 1, duration: entra, ease: 'sine.inOut' }, t);
      tl.to(p, { k: 1, duration: p.dura + T.dissolver, ease: 'none' }, t);
      const sai = t + p.dura;
      tl.to(p, { opacidade: 0, duration: i === planos.length - 1 ? 1.1 : T.dissolver, ease: 'sine.inOut' }, sai);
      t = sai;
    });
    // Em pé o céu do crepúsculo cobre a tela: o mundo 3D descansa atrás dele.
    tl.call(() => { if (geo.emPe && mundo.ligado) { mundoDesligado = true; mundo.desligar(); } }, null, (calmo ? 0.9 : T.entrada) + 1.6);

    // ---- maos: os dois dedinhos, o fio de verdade entre eles, a luz ---------------------
    const tMaos = t;
    let tFim = t;                       // quando o plano final pode entrar
    let tClarao = t + 0.5;
    if (maos) {
      tl.call(() => diretor.etapa('maos'), null, tMaos);
      tl.to(maos, { opacidade: 1, duration: 1.0, stagger: 0.28, ease: 'sine.inOut' }, tMaos);
      tl.to(maos, { perto: 1, duration: T.maos, ease: curvas.branco.camera }, tMaos);
      tl.to(estadoFio, { alfa: 1, duration: 0.3, ease: 'none' }, tMaos + 0.9);
      if (calmo) tl.set(estadoFio, { desenhado: 1 }, tMaos + 0.9);
      else tl.to(estadoFio, { desenhado: 1, duration: 1.4, ease: 'power2.inOut' }, tMaos + 0.9);
      // o fio fica um instante inteiro entre os dois antes de a luz correr
      tl.call(() => som.efeito('brilho'), null, tMaos + 3.0);
      if (!calmo) tl.to(estadoFio, { conta: 1, duration: 1.0, ease: 'power1.inOut' }, tMaos + 3.0);
      tl.to(estadoFio, { luz: 1, duration: 0.9, ease: 'power2.in' }, tMaos + 3.1);
      tFim = tMaos + T.maos - 0.3;
      tClarao = tMaos + T.maos - 0.3;
    }

    // ---- o plano final: as mãos dissolvem nele, e é dele que o clarão nasce ---------------
    if (ultimo) {
      if (maos) {
        tl.to(maos, { opacidade: 0, duration: 1.3, ease: 'sine.inOut' }, tFim);
        tl.to(estadoFio, { alfa: 0, duration: 0.9, ease: 'sine.inOut' }, tFim);
      }
      tl.to(ultimo, { opacidade: 1, duration: 1.3, ease: 'sine.inOut' }, tFim);
      tl.to(ultimo, { k: 1, duration: T.fim + 1.4, ease: 'none' }, tFim);
      tClarao = tFim + T.fim;
    }

    // ---- carta: o clarão, e de dentro dele a última carta -------------------------------
    if (calmo) tl.to(branco, { opacity: 1, duration: 0.9, ease: 'none' }, tClarao);
    else {
      tl.call(centrarClarao, null, tClarao - 0.02);
      tl.fromTo(clarao, { opacity: 0, scale: 0.08 }, { opacity: 1, scale: 1, duration: 1.0, ease: 'power2.in' }, tClarao);
      tl.to(branco, { opacity: 1, duration: 0.6, ease: 'power1.in' }, tClarao + 0.5);
    }
    const tCarta = tClarao + (calmo ? 0.95 : 1.15);
    tl.call(() => {
      diretor.etapa('carta');
      // Debaixo do clarão: os quadros saem, o mundo volta, a carta está lá e o dia retorna.
      for (const no of [ceu, grao, desenho, clarao, ...todos.map((p) => p.no), ...(brasa ? [brasa] : []), ...(maos ? maos.map((m) => m.no) : [])]) no.remove();
      religar();
      mostrarCarta(ctx, 1.2);
      entardecer(ctx, false, calmo ? 1.2 : 2.6);
      estado.envelope?.brilharLaco?.(0.85, 0.2);
      if (fio && fio.halo) {
        const luz = { halo: 0.55 };
        gsap.to(luz, { halo: 0.12, duration: 3, ease: 'sine.inOut', onUpdate: () => fio.halo(luz.halo) });
      }
      musica.mostrarMini();
    }, null, tCarta);
    tl.to(branco, { opacity: 0, duration: calmo ? 1.2 : 1.9, ease: 'sine.inOut' }, tCarta + (calmo ? 0.2 : 0.35));

    await new Promise((ok) => tl.eventCallback('onComplete', ok));
  } finally {
    tl.kill();
    pararTamanho();
    window.removeEventListener('resize', aoGirar);
    raiz.remove();
    religar();
    mostrarCarta(ctx, 0.8);
    entardecer(ctx, false, 1.2);       // (já pedido no caminho normal: aqui só vale se a cena quebrou)
  }
}
