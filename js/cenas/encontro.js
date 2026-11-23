/* ============================================================================
   ENCONTRO: os quadros do filme, as duas mãos, o fio amarrado e o clarão
   ============================================================================
   Depois das cartas do chão, a alameda escurece e a luz corre pelo fio. Os
   quadros de conteudo.encontro.quadros passam como planos de um filme, um de
   cada vez, com uma panorâmica lenta do `foco` ao `ate`. Os dois quadros com
   `dedo` voltam no fim como recortes de mão, e ela amarra o fio: uma brasinha
   espera no dedinho dela, o fio vermelho acompanha o dedo dela até o dedinho
   dele (um toque no dedinho dele, Enter, Espaço ou 12 s sem gesto também
   amarram; a dica opcional vem de encontro.dicaFio), o aparelho bate na mão
   dela, a luz corre pelo fio e vira um clarão, de dentro do qual surge a
   última carta (ou ele a entrega na mão, se final.js puder).

   Tudo é DOM sobre o palco: a cena é igual com ou sem WebGL. Em pé (celular)
   os quadros, que são deitados e pequenos, ocupam uma faixa alta no meio, o
   céu do crepúsculo cobre a tela e o mundo 3D descansa atrás dele (economia).
   Deitado, a faixa é de cinema e a alameda continua andando atrás de um véu.
   Quadro que não carrega é pulado; se nenhum carrega, só a chegada simples.

   prepararEncontro(ctx) → Promise<quadro[]>   (o diretor chama na cena da mão)
   cenaEncontro(ctx, { frio }) → Promise<void>
   ========================================================================== */

import { clamp, el, espera, lerp, suave, vibrar } from '../nucleo/util.js';
import { curvas, comoPromise } from '../nucleo/movimento.js';
import { temEncontro } from '../nucleo/diretor.js';
import { entregaNaMao } from './final.js';

const gsap = window.gsap;
const NS = 'http://www.w3.org/2000/svg';
// O quadro cobre a caixa com 4% de folga: a panorâmica tem para onde andar.
const SOBRA = 1.04;
const ESPERA_QUADROS = 5000; // o que não chegar até aqui é pulado
const ESPERA_DICA = 4000; // sem gesto, a dica aparece
const ESPERA_SOZINHO = 12000; // sem gesto, o fio se liga sozinho
// Segundos de cena.
const T = {
  escurecer: 2.0, // a alameda escurece
  entrada: 1.2, // o primeiro plano começa
  dissolver: 1.0, // dissolvência entre planos
  plano: [3.8, 3.1, 3.2, 3.2], // cada plano; os seguintes repetem o último
  maos: 1.7, // as mãos chegam e a brasinha acende
  no: 1.5, // do nó até o plano final (ou o clarão)
  fim: 3.3, // o plano final, das mãos ao clarão
};
const MEIO = { x: 0.5, y: 0.5 };

let graoPintado = false;
// A promessa de cada quadro, na ordem: o prazo de 5 s vale por quadro.
let chegando = null;

/* ---- dados ------------------------------------------------------------------- */

const numero = (v, padrao) => (typeof v === 'number' && Number.isFinite(v) ? v : padrao);

/** { x, y } limitados a 0..1, com o padrão quando o valor falta. */
function ponto(p, padrao) {
  return { x: clamp(numero(p?.x, padrao.x)), y: clamp(numero(p?.y, padrao.y)) };
}

/** A tirinha cortada de cada borda (defeito do arquivo), no máximo 30%. */
function aparar(a) {
  const lado = (v) => clamp(numero(v, 0), 0, 0.3);
  return { topo: lado(a?.topo), base: lado(a?.base), esq: lado(a?.esquerda), dir: lado(a?.direita) };
}

/** Baixa e decodifica uma imagem para a memória. Falha silenciosa: null. */
async function baixar(endereco) {
  let url = '';
  try {
    const resposta = await fetch(endereco);
    if (!resposta.ok) return null;
    url = URL.createObjectURL(await resposta.blob());
    const img = new Image();
    await new Promise((ok, falha) => {
      img.onload = ok;
      img.onerror = falha;
      img.src = url;
    });
    if (typeof img.decode === 'function') await img.decode().catch(() => {});
    if (!img.naturalWidth || !img.naturalHeight) throw new Error('imagem vazia');
    return { url, nw: img.naturalWidth, nh: img.naturalHeight };
  } catch {
    if (url) URL.revokeObjectURL(url);
    return null;
  }
}

/**
 * Baixa os quadros uma vez (cache em estado.encontroQuadros) e devolve só os
 * que chegaram, na ordem do conteúdo. Começa cedo: o diretor chama ao
 * carregar a cena da mão, e a cena espera no máximo 5 s.
 */
export function prepararEncontro(ctx) {
  const estado = ctx.estado;
  if (!estado.encontroQuadros) {
    const lista = temEncontro(ctx.conteudo) ? ctx.conteudo.encontro.quadros : [];
    chegando = lista.map(async (q) => {
      const imagem = typeof q?.imagem === 'string' ? q.imagem.trim() : '';
      const baixado = imagem ? await baixar(imagem) : null;
      if (!baixado) return null;
      const foco = ponto(q.foco, MEIO);
      return {
        ...baixado,
        alt: typeof q.alt === 'string' ? q.alt.trim() : '',
        foco,
        ate: ponto(q.ate, foco),
        fio: q.fio ? ponto(q.fio, { x: 0.5, y: 0.95 }) : null,
        dedo: q.dedo ? ponto(q.dedo, MEIO) : null,
        aparar: aparar(q.aparar),
        fim: q.fim === true,
      };
    });
    estado.encontroQuadros = Promise.all(chegando).then((quadros) => quadros.filter(Boolean));
  }
  return estado.encontroQuadros;
}

/* ---- peças ------------------------------------------------------------------- */

/** O grão do filme: ruído de 128 px, pintado uma vez e publicado como --enc-grao. */
function pintarGrao() {
  if (graoPintado) return;
  graoPintado = true;
  try {
    const tela = document.createElement('canvas');
    tela.width = 128;
    tela.height = 128;
    const g = tela.getContext('2d');
    const dados = g.createImageData(128, 128);
    const px = dados.data;
    for (let i = 0; i < px.length; i += 4) {
      const v = Math.random();
      const cor = v > 0.5 ? 255 : 0;
      px[i] = cor;
      px[i + 1] = cor;
      px[i + 2] = cor;
      px[i + 3] = Math.abs(v - 0.5) * 2 * 26;
    }
    g.putImageData(dados, 0, 0);
    document.documentElement.style.setProperty('--enc-grao', `url("${tela.toDataURL('image/png')}")`);
  } catch {
    /* sem canvas: a cena segue sem grão */
  }
}

/** A imagem já decodificada na memória: entra inteira no primeiro quadro. */
function novaImagem(q, alt = '') {
  const img = new Image();
  img.decoding = 'sync';
  img.draggable = false;
  img.alt = alt;
  img.width = q.nw;
  img.height = q.nh;
  img.src = q.url;
  return img;
}

/**
 * Escala e posição para a imagem cobrir a caixa (sem mostrar a parte aparada)
 * com o ponto (fx, fy) da imagem no `alvo` da caixa, sem nunca mostrar a borda.
 */
function enquadrar(q, caixa, fx, fy, zoom, alvo) {
  const { esq, dir, topo, base } = q.aparar;
  const s = Math.max(caixa.w / (q.nw * (1 - esq - dir)), caixa.h / (q.nh * (1 - topo - base))) * SOBRA * zoom;
  const W = q.nw * s;
  const H = q.nh * s;
  return {
    s,
    W,
    H,
    tx: clamp(caixa.w * alvo.x - fx * W, caixa.w - W * (1 - dir), -W * esq),
    ty: clamp(caixa.h * alvo.y - fy * H, caixa.h - H * (1 - base), -H * topo),
  };
}

/** Um ponto da imagem (frações) na tela, com o deslocamento da peça. */
function naTela(peca, pt, dx = 0, dy = 0) {
  const { caixa, vista } = peca;
  return { x: caixa.x + dx + vista.tx + pt.x * vista.W, y: caixa.y + dy + vista.ty + pt.y * vista.H };
}

function posicionar(no, c) {
  no.style.left = `${c.x}px`;
  no.style.top = `${c.y}px`;
  no.style.width = `${c.w}px`;
  no.style.height = `${c.h}px`;
}

const r2 = (v) => Math.round(v * 100) / 100;
const mover = (x, y, s) => `translate3d(${r2(x)}px, ${r2(y)}px, 0) scale(${s.toFixed(4)})`;

// Só escreve o que mudou: a cena desenha a cada tique por uns vinte segundos.
function por(no, prop, valor) {
  const memo = (no._enc ||= {});
  if (memo[prop] === valor) return;
  memo[prop] = valor;
  if (prop === 'd') no.setAttribute('d', valor);
  else no.style[prop] = valor;
}

/* ---- a carta ----------------------------------------------------------------- */

/** O halo do fio desce de 0,55 a 0,12 em 3 s (continua na cena seguinte). */
function apagarHalo(fio) {
  if (typeof fio?.halo !== 'function') return;
  const h = { v: 0.55 };
  gsap.to(h, { v: 0.12, duration: 3, ease: 'sine.inOut', onUpdate: () => fio.halo(h.v) });
}

/**
 * A carta escondida pela cena da mão aparece. Se final.js põe a carta na mão
 * dele (com WebGL), não faz nada: a cena final entrega. Senão ele sai e a
 * ponta do fio volta à carta.
 */
function mostrarCarta(ctx, duracao = 1.4) {
  const { estado, mundo } = ctx;
  try {
    if (estado.entrega || entregaNaMao(ctx)) return;
    if (estado.ele) {
      estado.ele.sair?.();
      estado.ele = null;
      estado.seguidorFio?.ancorar?.(null);
    }
    const env = estado.envelope;
    if (!estado.cartaEscondida || !env) return;
    estado.cartaEscondida = false;
    if (mundo?.ok && env.grupo) env.grupo.visible = true;
    else env.chegar?.({ duracao });
  } catch (erro) {
    console.error('[carta] mostrar a última carta', erro);
  }
}

/** Sem quadros (nenhum chegou em 5 s): a carta aparece e a luz corre pelo fio. */
async function chegadaSimples(ctx) {
  const { estado, som, amb } = ctx;
  const calmo = !!amb?.reduzido;
  mostrarCarta(ctx, calmo ? 0.8 : 1.6);
  const fio = estado.fio;
  const chegou = fio?.pulso?.({
    de: 0, ate: 1.02, duracao: calmo ? 1.6 : 2.8, forca: 1.15, largura: 0.8, brasas: 20, curva: 'power1.inOut',
  });
  await espera(calmo ? 700 : 2200);
  estado.envelope?.brilharLaco?.(0.85, calmo ? 0.6 : 1.1);
  som?.efeito?.('brilho');
  await chegou;
  apagarHalo(fio);
}

/* ---- a cena ------------------------------------------------------------------ */

export async function cenaEncontro(ctx, { frio = false } = {}) {
  const { conteudo, amb, mundo, som, musica, inventario, diretor, estado } = ctx;
  const calmo = !!amb?.reduzido;

  if (frio) {
    musica?.mostrarMini?.();
    mundo?.petalas?.definirDensidade?.(1);
  }
  diretor.etapa('chegando');
  // A pose de entrega é pintada agora, longe do clarão.
  espera(600).then(() => estado.ele?.prepararEntrega?.());

  // O que não chegar em 5 s é pulado; os que chegaram passam (um quadro
  // preso na rede não leva os outros junto).
  const prazo = espera(ESPERA_QUADROS).then(() => null);
  const quadros = await Promise.resolve()
    .then(() => {
      const cache = prepararEncontro(ctx);
      if (!chegando) return Promise.race([cache, prazo.then(() => [])]);
      return Promise.all(chegando.map((p) => Promise.race([p, prazo]).catch(() => null))).then((l) => l.filter(Boolean));
    })
    .catch(() => []);

  if (!quadros.length) {
    try {
      await chegadaSimples(ctx);
    } finally {
      mostrarCarta(ctx, 0.8);
    }
    return;
  }

  /* ---- montagem ---- */
  pintarGrao();
  const dicaTexto = typeof conteudo?.encontro?.dicaFio === 'string' ? conteudo.encontro.dicaFio.trim() : '';

  const criarPlano = (q) => {
    const fundo = novaImagem(q);
    fundo.style.objectPosition = `${r2(((q.foco.x + q.ate.x) / 2) * 100)}% 50%`;
    const img = novaImagem(q);
    const faixa = el('div', 'enc-faixa', img);
    const no = el('div', { class: 'enc-plano', 'aria-hidden': 'true' }, [el('div', 'enc-fundo', fundo), faixa]);
    return { q, el: no, faixa, img, a: 0, k: calmo ? 1 : 0, caixa: null, vista: null };
  };
  const criarMao = (q, i) => {
    const img = novaImagem(q);
    const no = el('div', { class: `enc-mao enc-mao-${i ? 'b' : 'a'}`, 'aria-hidden': 'true' }, img);
    return { q, el: no, img, a: 0, caixa: null, alvo: null, vem: null, vista: null, dedo: { x: 0, y: 0 } };
  };

  const quadroFim = quadros.find((q) => q.fim) || null;
  const planos = quadros.filter((q) => q !== quadroFim).map(criarPlano);
  const ultimo = quadroFim ? criarPlano(quadroFim) : null;
  const todos = ultimo ? [...planos, ultimo] : planos;
  // Os dois quadros com dedo passam como planos e voltam no fim como recortes.
  const comDedo = quadros.filter((q) => q.dedo).slice(0, 2);
  const maos = comDedo.length === 2 ? comDedo.map(criarMao) : [];
  const haMaos = maos.length === 2;

  const desenho = document.createElementNS(NS, 'svg');
  desenho.setAttribute('class', 'enc-fio');
  desenho.setAttribute('aria-hidden', 'true');
  const caminho = (classe) => {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('class', classe);
    desenho.append(p);
    return p;
  };
  // A emenda: o fio do site sobe do pé da tela e encontra o fio do primeiro quadro.
  const planoFio = planos.find((p) => p.q.fio) || null;
  const emenda = planoFio ? [caminho('enc-fio-sombra'), caminho('enc-fio-linha')] : [];
  // O laço: do dedinho dela ao dedinho dele.
  const laco = haMaos ? [caminho('enc-fio-sombra'), caminho('enc-fio-linha'), caminho('enc-fio-luz')] : [];
  const lacoLinha = laco[1] || null;

  const raiz = el('div', 'encontro');
  const ceu = el('div', { class: 'enc-ceu', 'aria-hidden': 'true' });
  const brasa = haMaos ? el('div', { class: 'enc-brasa', 'aria-hidden': 'true' }) : null;
  const grao = el('div', { class: 'enc-grao', 'aria-hidden': 'true' });
  // A dica não é lida duas vezes: o texto vai no nome do alvo.
  const dica = haMaos && dicaTexto ? el('p', { class: 'enc-dica', 'aria-hidden': 'true', texto: dicaTexto }) : null;
  const clarao = el('div', { class: 'enc-clarao', 'aria-hidden': 'true' });
  const branco = el('div', { class: 'enc-branco', 'aria-hidden': 'true' });
  const alvo = haMaos
    ? el('button', {
      class: 'enc-alvo ui-escuro',
      type: 'button',
      'aria-label': dicaTexto || 'Amarrar o fio',
      dataset: { acao: 'amarrar-fio' },
      onClick: () => amarrar(),
    })
    : null;
  const arrasto = el('div', 'enc-arrasto', alvo);
  // Os planos passam sozinhos: o leitor de tela ouve a descrição de cada um.
  const voz = el('p', { class: 'so-leitor', 'aria-live': 'polite' });

  raiz.append(ceu, ...todos.map((p) => p.el), ...maos.map((m) => m.el), desenho);
  if (brasa) raiz.append(brasa);
  raiz.append(grao);
  if (dica) raiz.append(dica);
  raiz.append(clarao, branco, voz);

  /* ---- estado ---- */
  // As variáveis do fio: brilho da brasa, alfa do laço, ponta acesa, conta de
  // luz que corre, luz do laço, puxa (a ponta segue o dedo), no (a ponta chega
  // ao dedinho dele), x/y do dedo e perto (as mãos se aproximando).
  const estadoFio = { brilho: 0.66, alfa: 0, ponta: 0, conta: 0, luz: 0, puxa: 0, no: 0, x: 0, y: 0, perto: calmo ? 1 : 0 };
  let geo = null;
  let tl = null;
  let respiro = null;
  let pararTamanho = null;
  let pedido = false;
  let fora = false;
  let claraoNoAr = false;
  let mundoDesligado = false;
  let amarrado = false;
  let dedoNaTela = null;
  let vibrarAoSoltar = false;
  let vez = 0;

  /* ---- medida ---- */
  function medir() {
    const L = raiz.clientWidth || innerWidth;
    const A = raiz.clientHeight || innerHeight;
    const emPe = L / A < 1;
    const r = raiz.getBoundingClientRect();
    geo = { L, A, emPe, esq: r.left, topo: r.top, perto: clamp(Math.min(L, A) * 0.13, 48, 84) };
    raiz.classList.toggle('enc-em-pe', emPe);
    raiz.style.setProperty('--enc-fio-l', `${clamp(Math.min(L, A) / 150, 2.4, 4.2).toFixed(2)}px`);
    desenho.setAttribute('viewBox', `0 0 ${L} ${A}`);

    let faixa;
    if (emPe) {
      faixa = { x: 0, y: Math.round(0.165 * A), w: L, h: Math.round(0.64 * A) };
    } else {
      const w = Math.min(L, 1680);
      const h = Math.round(Math.min(0.66 * A, w / 2.2));
      faixa = { x: Math.round((L - w) / 2), y: Math.round((A - h) * 0.46), w, h };
    }
    for (const p of todos) {
      const { esq, dir, topo, base } = p.q.aparar;
      const prop = (p.q.nw * (1 - esq - dir)) / (p.q.nh * (1 - topo - base));
      // Deitado, um quadro quase quadrado (ou em pé) vira janela alta.
      const alta = !emPe && prop < 1.2;
      if (alta) {
        const h = Math.round(0.8 * A);
        const w = Math.round(Math.min(L, h * prop));
        p.caixa = { x: Math.round((L - w) / 2), y: Math.round((A - h) * 0.46), w, h };
      } else {
        p.caixa = faixa;
      }
      p.faixa.classList.toggle('enc-faixa-alta', alta);
      posicionar(p.faixa, p.caixa);
    }

    if (!haMaos) return;
    const [dela, dele] = maos;
    if (emPe) {
      // Empilhadas: ela em cima, ele embaixo.
      const h = Math.round(0.45 * A);
      Object.assign(dela, { caixa: { x: 0, y: Math.round(0.07 * A), w: L, h }, alvo: { x: 0.66, y: 0.5 }, vem: { x: 0, y: 1 } });
      Object.assign(dele, { caixa: { x: 0, y: Math.round(0.48 * A), w: L, h }, alvo: { x: 0.26, y: 0.62 }, vem: { x: 0, y: -1 } });
    } else {
      // Lado a lado: ela à esquerda, ele à direita.
      const mw = Math.round(Math.min(0.44 * L, 760));
      const mh = Math.round(Math.min(0.6 * A, 0.72 * mw));
      const my = Math.round((A - mh) * 0.46);
      Object.assign(dela, { caixa: { x: Math.round(L / 2 - mw - 0.012 * L), y: my, w: mw, h: mh }, alvo: { x: 0.78, y: 0.5 }, vem: { x: 1, y: 0 } });
      Object.assign(dele, { caixa: { x: Math.round(L / 2 + 0.012 * L), y: my, w: mw, h: mh }, alvo: { x: 0.2, y: 0.56 }, vem: { x: -1, y: 0 } });
    }
    for (const m of maos) posicionar(m.el, m.caixa);
  }

  /* ---- desenho ---- */
  function desenhar() {
    if (!geo || fora) return;
    const { L, A, emPe } = geo;

    for (const p of todos) {
      por(p.el, 'opacity', p.a.toFixed(3));
      por(p.el, 'visibility', p.a > 0 ? 'visible' : 'hidden');
      if (p.a <= 0) continue;
      const k = suave(p.k);
      const zoom = calmo ? 1 : lerp(1, 1.07, p.k);
      p.vista = enquadrar(p.q, p.caixa, lerp(p.q.foco.x, p.q.ate.x, k), lerp(p.q.foco.y, p.q.ate.y, k), zoom, MEIO);
      por(p.img, 'transform', mover(p.vista.tx, p.vista.ty, p.vista.s));
    }

    if (planoFio) {
      const alfa = planoFio.vista ? planoFio.a : 0;
      if (alfa > 0) {
        const f = naTela(planoFio, planoFio.q.fio);
        const y0 = A + 14;
        const x0 = f.x - Math.min(0.34 * L, (y0 - f.y) * 0.9);
        const dx = Math.max(60, 0.07 * planoFio.vista.W);
        const d = `M${r2(x0)} ${r2(y0)}C${r2(x0 + 0.02 * L)} ${r2(y0 - 0.55 * (y0 - f.y))} ${r2(f.x - dx)} ${r2(f.y + 0.42 * dx)} ${r2(f.x)} ${r2(f.y)}`;
        for (const c of emenda) por(c, 'd', d);
      }
      for (const c of emenda) por(c, 'opacity', alfa.toFixed(3));
    }

    if (!haMaos) return;
    const perto = estadoFio.perto;
    const zoom = calmo ? 1.3 : lerp(1.22, 1.34, perto);
    const anda = calmo ? 0 : (1 - perto) * Math.min(L, A) * 0.07;
    for (const m of maos) {
      por(m.el, 'opacity', m.a.toFixed(3));
      por(m.el, 'visibility', m.a > 0 ? 'visible' : 'hidden');
      const dx = -m.vem.x * anda;
      const dy = -m.vem.y * anda;
      por(m.el, 'transform', `translate3d(${r2(dx)}px, ${r2(dy)}px, 0)`);
      m.vista = enquadrar(m.q, m.caixa, m.q.dedo.x, m.q.dedo.y, zoom, m.alvo);
      por(m.img, 'transform', mover(m.vista.tx, m.vista.ty, m.vista.s));
      m.dedo = naTela(m, m.q.dedo, dx, dy);
    }

    const a = maos[0].dedo;
    const b = maos[1].dedo;
    const ponta = { x: lerp(a.x, estadoFio.x, estadoFio.puxa), y: lerp(a.y, estadoFio.y, estadoFio.puxa) };
    const fim = { x: lerp(ponta.x, b.x, estadoFio.no), y: lerp(ponta.y, b.y, estadoFio.no) };
    const dx = fim.x - a.x;
    const dy = fim.y - a.y;
    const comp = Math.hypot(dx, dy);
    let c1;
    let c2;
    if (emPe) {
      // Em pé o fio cai reto do nó e cruza o céu entre os recortes, sem cruzar os dedos.
      const lado = clamp(dx / (0.12 * L), -1, 1);
      const abre = Math.min(L * lerp(0.2, 0.15, perto), comp * 0.5);
      c1 = { x: a.x - lado * 0.02 * L, y: a.y + 0.42 * dy };
      c2 = { x: fim.x + 0.9 * lado * abre, y: fim.y - 0.5 * dy };
    } else {
      // Deitado, uma barriga que pende (o fio tem peso) e estica conforme as mãos chegam.
      const folga = comp * lerp(0.2, 0.09, perto);
      c1 = { x: a.x + 0.3 * dx, y: a.y + 0.3 * dy + folga };
      c2 = { x: a.x + 0.7 * dx, y: a.y + 0.7 * dy + folga };
    }
    const d = `M${r2(a.x)} ${r2(a.y)}C${r2(c1.x)} ${r2(c1.y)} ${r2(c2.x)} ${r2(c2.y)} ${r2(fim.x)} ${r2(fim.y)}`;
    for (const c of laco) por(c, 'd', d);
    por(laco[0], 'opacity', estadoFio.alfa.toFixed(3));
    por(laco[1], 'opacity', estadoFio.alfa.toFixed(3));
    por(laco[2], 'opacity', (estadoFio.alfa * estadoFio.luz).toFixed(3));

    // A brasa espera na ponta; quando a luz corre, ela anda pelo laço.
    let bx = fim.x;
    let by = fim.y;
    let brilhoBrasa = estadoFio.ponta * estadoFio.alfa;
    const u = estadoFio.conta;
    if (u > 0) {
      const p = lacoLinha.getPointAtLength(lacoLinha.getTotalLength() * Math.min(u, 1));
      bx = p.x;
      by = p.y;
      brilhoBrasa = clamp(Math.min(8 * u, 6 * (1 - u))) * estadoFio.alfa;
    }
    por(brasa, 'transform', mover(bx, by, estadoFio.brilho));
    por(brasa, 'opacity', brilhoBrasa.toFixed(3));
    por(alvo, 'transform', `translate3d(${r2(b.x)}px, ${r2(b.y)}px, 0)`);
  }

  // Os tweens só pedem o desenho; ele sai uma vez, no fim do tique da GSAP.
  // O dedo desenha na hora.
  function pedir() {
    pedido = true;
  }
  function aoTique() {
    if (!pedido) return;
    pedido = false;
    desenhar();
  }

  /** O clarão nasce no meio do fio e, com o plano final à vista, no `ate` dele. */
  function centrarClarao() {
    if (!geo || fora) return;
    claraoNoAr = true;
    let c = null;
    if (ultimo?.vista) {
      c = naTela(ultimo, ultimo.q.ate);
    } else if (lacoLinha) {
      const total = lacoLinha.getTotalLength();
      if (total > 0) c = lacoLinha.getPointAtLength(total / 2);
    }
    const x = c ? c.x : geo.L / 2;
    const y = c ? c.y : geo.A * 0.46;
    clarao.style.left = `${r2(x)}px`;
    clarao.style.top = `${r2(y)}px`;
  }

  function anunciar(texto) {
    if (texto) voz.textContent = texto;
  }

  function religar() {
    if (!mundoDesligado) return;
    mundoDesligado = false;
    mundo?.ligar?.();
  }

  function aoGirar() {
    if (fora) return;
    medir();
    if (!geo.emPe) religar();
    desenhar();
    if (claraoNoAr) centrarClarao();
  }

  /* ---- a espera e o nó ---- */
  function esperarFio() {
    if (amarrado) return;
    arrasto.addEventListener('pointerdown', aoApertar);
    arrasto.addEventListener('pointermove', aoMover);
    arrasto.addEventListener('pointerup', aoSoltar);
    arrasto.addEventListener('pointercancel', aoSoltar);
    raiz.append(arrasto);
    window.addEventListener('keydown', aoTeclar);
    if (!calmo) {
      // A brasa respira entre 0,58 e 0,8; sobe primeiro, sem salto do 0,66.
      respiro = gsap.timeline({ onUpdate: pedir })
        .to(estadoFio, { brilho: 0.8, duration: 0.55, ease: 'sine.out' })
        .to(estadoFio, { brilho: 0.58, duration: 1.1, ease: 'sine.inOut', yoyo: true, repeat: -1 });
    }
    contarSozinho();
    espera(ESPERA_DICA).then(mostrarDica);
  }

  function mostrarDica() {
    if (!dica || amarrado || dedoNaTela !== null) return;
    if (calmo) gsap.fromTo(dica, { opacity: 0 }, { opacity: 1, duration: 1.4, ease: curvas.branco.entrar });
    else gsap.fromTo(dica, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 1.4, ease: curvas.branco.entrar });
  }

  // Cada toque e cada soltar recomeçam a conta: dedo parado na tela também
  // não prende a cena (os 12 s contam do toque). Com a bolsa aberta, espera.
  function contarSozinho() {
    const minha = ++vez;
    espera(ESPERA_SOZINHO).then(() => {
      if (minha !== vez || amarrado) return;
      if (inventario?.aberto) contarSozinho();
      else amarrar(true);
    });
  }

  function aoApertar(ev) {
    if (amarrado || dedoNaTela !== null || ev.button > 0 || alvo.contains(ev.target)) return;
    dedoNaTela = ev.pointerId;
    contarSozinho();
    try {
      arrasto.setPointerCapture(ev.pointerId);
    } catch {
      /* sem captura: o arrasto cobre a tela de qualquer jeito */
    }
    gsap.to(estadoFio, { puxa: 1, duration: calmo ? 0.01 : 0.25, ease: 'power2.out', overwrite: 'auto', onUpdate: pedir });
    seguirDedo(ev);
  }

  function seguirDedo(ev) {
    estadoFio.x = ev.clientX - geo.esq;
    estadoFio.y = ev.clientY - geo.topo;
    const b = maos[1].dedo;
    if (Math.hypot(estadoFio.x - b.x, estadoFio.y - b.y) < geo.perto) amarrar();
    else desenhar();
  }

  function aoMover(ev) {
    if (amarrado || ev.pointerId !== dedoNaTela) return;
    seguirDedo(ev);
  }

  function aoSoltar(ev) {
    if (ev.pointerId !== dedoNaTela) return;
    dedoNaTela = null;
    if (amarrado) {
      // A batidinha do iPhone esperou o dedo levantar da própria área tocada.
      if (vibrarAoSoltar) vibrar(amb);
      vibrarAoSoltar = false;
      arrasto.remove();
      return;
    }
    // A ponta volta ao dedinho dela.
    gsap.to(estadoFio, { puxa: 0, duration: calmo ? 0.01 : 0.5, ease: 'power2.inOut', overwrite: 'auto', onUpdate: pedir });
    contarSozinho();
  }

  // Enter e Espaço só valem com o foco no corpo da página. O foco não é levado
  // até o alvo: num toque, o anel de foco apareceria no dedinho dele.
  function aoTeclar(ev) {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    if (inventario?.aberto) return;
    const foco = document.activeElement;
    if (foco && foco !== document.body) return;
    ev.preventDefault();
    amarrar();
  }

  function amarrar(sozinho = false) {
    if (amarrado) return;
    amarrado = true;
    vez += 1;
    respiro?.kill();
    window.removeEventListener('keydown', aoTeclar);
    const comDedo = dedoNaTela !== null;
    if (!sozinho) {
      // No iPhone, a batidinha no meio do arrasto espera o pointerup (aoSoltar):
      // o elemento tocado não pode sair da tela antes de o dedo levantar.
      if (amb?.ios && comDedo) vibrarAoSoltar = true;
      else vibrar(amb);
    }
    if (!comDedo) arrasto.remove();
    if (dica) gsap.to(dica, { opacity: 0, duration: 0.4, overwrite: true });

    const a = maos[0].dedo;
    const b = maos[1].dedo;
    const puxa = estadoFio.puxa;
    const ponta = { x: lerp(a.x, estadoFio.x, puxa), y: lerp(a.y, estadoFio.y, puxa) };
    const falta = clamp((1 - puxa) + (puxa * Math.hypot(ponta.x - b.x, ponta.y - b.y)) / (Math.hypot(a.x - b.x, a.y - b.y) || 1));
    // De perto é um estalo; de longe, o fio se estende.
    gsap.to(estadoFio, {
      no: 1,
      duration: calmo ? 0.01 : sozinho ? 1.4 : lerp(0.2, 0.9, falta),
      ease: sozinho ? 'power2.inOut' : 'power2.out',
      onUpdate: pedir,
      onComplete: () => tl?.play(),
    });
  }

  /* ---- a última carta ---- */
  function chegarCarta() {
    diretor.etapa('carta');
    fora = true;
    for (const no of [ceu, grao, desenho, clarao, brasa, dica, arrasto, ...todos.map((p) => p.el), ...maos.map((m) => m.el)]) no?.remove();
    religar();
    mostrarCarta(ctx, 1.2);
    estado.envelope?.brilharLaco?.(0.85, 0.2);
    apagarHalo(estado.fio);
    musica?.mostrarMini?.();
  }

  /* ---- a linha do tempo ---- */
  try {
    (document.getElementById('palco') || document.body).append(raiz);
    medir();
    desenhar();
    if (typeof mundo?.aoRedimensionar === 'function') pararTamanho = mundo.aoRedimensionar(aoGirar);
    window.addEventListener('resize', aoGirar);
    gsap.ticker.add(aoTique);

    tl = gsap.timeline({ paused: true, onUpdate: pedir });
    const tEntrada = calmo ? 0.9 : T.entrada;

    // A alameda escurece e a luz corre pelo fio.
    tl.fromTo(ceu, { opacity: 0 }, { opacity: 1, duration: calmo ? 1.2 : T.escurecer, ease: 'sine.inOut' }, 0);
    tl.fromTo(grao, { opacity: 0 }, { opacity: 1, duration: calmo ? 0.4 : 1.6, ease: 'sine.inOut' }, 1.2);

    // Os planos, um de cada vez.
    tl.call(() => diretor.etapa('planos'), null, tEntrada);
    let t = tEntrada;
    planos.forEach((p, i) => {
      const dura = T.plano[Math.min(i, T.plano.length - 1)];
      tl.call(() => anunciar(p.q.alt), null, t);
      tl.to(p, { a: 1, duration: i === 0 ? 1.5 : T.dissolver, ease: 'sine.inOut' }, t);
      if (!calmo) tl.to(p, { k: 1, duration: dura + T.dissolver, ease: 'none' }, t);
      const sai = t + dura;
      tl.to(p, { a: 0, duration: i === planos.length - 1 ? 1.1 : T.dissolver, ease: 'sine.inOut' }, sai);
      t = sai;
    });
    const tMaos = t;

    // Em pé o céu do crepúsculo cobre a tela: o mundo 3D descansa atrás dele.
    tl.call(() => {
      if (geo.emPe && mundo?.ligado) {
        mundoDesligado = true;
        mundo.desligar();
      }
    }, null, tEntrada + 1.6);

    // As mãos chegam, a brasinha acende no dedinho dela e a cena espera o gesto.
    let tFim = tMaos;
    if (haMaos) {
      tl.call(() => diretor.etapa('maos'), null, tMaos);
      tl.to(maos, { a: 1, duration: 1.0, stagger: 0.28, ease: 'sine.inOut' }, tMaos);
      if (!calmo) tl.to(estadoFio, { perto: 1, duration: T.maos + T.no, ease: curvas.branco.camera }, tMaos);
      tl.to(estadoFio, { alfa: 1, ponta: 1, duration: 0.6, ease: 'sine.out' }, tMaos + 0.9);
      const tNo = tMaos + T.maos;
      tl.addPause(tNo, esperarFio);
      // Depois do nó: a luz corre pelo laço, de um dedinho ao outro.
      tl.call(() => som?.efeito?.('brilho'), null, tNo + 0.3);
      if (!calmo) {
        tl.to(estadoFio, { ponta: 0, duration: 0.3, ease: 'sine.in' }, tNo);
        tl.to(estadoFio, { conta: 1, duration: 1.0, ease: 'power1.inOut' }, tNo + 0.3);
      }
      tl.to(estadoFio, { luz: 1, duration: 0.9, ease: 'power2.in' }, tNo + 0.4);
      tFim = tNo + T.no;
    }

    // O plano final (o abraço): é dele que vem o clarão.
    let tClarao = tFim;
    if (ultimo) {
      if (haMaos) {
        tl.to(maos, { a: 0, duration: 1.3, ease: 'sine.inOut' }, tFim);
        tl.to(estadoFio, { alfa: 0, duration: 0.9, ease: 'sine.inOut' }, tFim);
      }
      tl.call(() => anunciar(ultimo.q.alt), null, tFim);
      tl.to(ultimo, { a: 1, duration: 1.3, ease: 'sine.inOut' }, tFim);
      if (!calmo) tl.to(ultimo, { k: 1, duration: T.fim + 1.4, ease: 'none' }, tFim);
      tClarao = tFim + T.fim;
    }

    // O clarão: um disco de luz bem maior que a tela, e o branco por cima.
    if (!calmo) {
      tl.call(centrarClarao, null, tClarao - 0.02);
      tl.fromTo(clarao, { scale: 0.08, opacity: 0 }, { scale: 1, opacity: 1, duration: 1.0, ease: 'power2.in', immediateRender: false }, tClarao);
      tl.to(branco, { opacity: 1, duration: 0.6, ease: 'power1.in' }, tClarao + 0.5);
    } else {
      tl.to(branco, { opacity: 1, duration: 0.9, ease: 'sine.inOut' }, tClarao);
    }

    // De dentro do branco, a última carta.
    const tCarta = tClarao + (calmo ? 0.95 : 1.15);
    tl.call(chegarCarta, null, tCarta);
    tl.to(branco, { opacity: 0, duration: calmo ? 1.2 : 1.9, ease: 'sine.inOut' }, tCarta + (calmo ? 0.2 : 0.35));

    estado.fio?.pulso?.({
      de: 0, ate: 1.02, duracao: calmo ? 1.4 : 2.4, forca: 1.15, largura: 0.8, brasas: 16, curva: 'power1.inOut',
    });
    if (!frio) som?.efeito?.('brilho');
    musica?.esconderMini?.();
    tl.play();
    await comoPromise(tl);
  } finally {
    tl?.kill();
    amarrado = true;
    fora = true;
    vez += 1;
    window.removeEventListener('keydown', aoTeclar);
    respiro?.kill();
    gsap.killTweensOf(estadoFio);
    gsap.ticker.remove(aoTique);
    pararTamanho?.();
    window.removeEventListener('resize', aoGirar);
    raiz.remove();
    religar();
    mostrarCarta(ctx, 0.8);
  }
}
