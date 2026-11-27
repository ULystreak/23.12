/* ============================================================================
   FUNDO: a foto da alameda sem WebGL e os véus anil atrás do texto
   ============================================================================
   Sem WebGL, a alameda é a foto de CONTEUDO.pagina.fundo (uma renderização do
   próprio 3D) numa camada DOM, #mundo-fundo, atrás do mundo leve. Camada DOM e
   não textura: a foto é rasterizada uma vez (o desfoque de profundidade já vem
   nela) e o que muda a cada quadro é só o transform.

   A foto está "no infinito": cresce em torno do ponto de fuga conforme ela
   anda e acompanha o balanço do passo, sem sentir a translação. O passo de
   base nunca para, então a aproximação é um laço: antes de a foto estourar,
   ela dissolve numa cópia vista de mais longe, sem salto visível. As
   caminhadas só aceleram o laço.

   A foto é do entardecer da v2: noite, todas as lanternas acesas. A hora são
   quatro camadas pintadas uma vez sobre ela, e só a opacidade delas muda: o
   véu da hora azul (a névoa anil) cobre as lanternas e se abre conforme elas
   acendem na alameda 3D; o último lilás do pôr do sol sai no mesmo passo; a
   noite funda e o cometa chegam depois.

   Com WebGL a foto não existe: criarVeus monta só as duas clareiras anil
   (#mundo-veus) que dão contraste à frase e aos botões sobre a alameda 3D.
   O CSS das camadas (#mundo-fundo, #mundo-veus, .fundo-*) é de css/mundo.css.
   ========================================================================== */

import { clamp, suave, debounce, el } from '../nucleo/util.js';
import { pintarCometa } from './hora.js';

// A névoa violeta no fim do túnel, medida na foto; sem foto, a noite (--noite).
const COR_HORIZONTE = '#4a3a66';
const COR_NOITE = '#0b1026';
// A câmera fica no meio do caminho e o horizonte cai um nada abaixo do centro
// (o comentário de content.js diz "no centro"; vale esta medida).
const PONTO_FUGA = { x: 0.5, y: 0.515 };
// 7 m de caminhada deixam a foto 15% maior.
const APROXIMA_POR_METRO = Math.log(1.15) / 7;
// LIMITE, RECOMECO, SALTO e SALTO_SOZINHA são uma relação só: mudar um deles
// pode criar um salto visível na troca de cópia.
const LIMITE = 1.55; // acima disto a foto começaria a estourar
const RECOMECO = 1; // escala mínima da cópia nova
const SALTO = 1.2; // numa caminhada, a cópia nova nasce z / 1,2
const SALTO_SOZINHA = 1.45; // no laço do passo de base, nasce z / 1,45
const TROCA_SOZINHA = 2.2; // metros de passo de base que a dissolvência do laço leva
const TETO = LIMITE * 1.35;
// Entrada direta por ?cena=: a foto nasce na escala que a caminhada teria deixado.
const INICIAL = { inicio: 1, poppy: 1.15, carta2: 1.15, yourname: 1.32, mao: 1.32, final: 1.4 };
// O filtro da foto vai no próprio <img> e vence o de css/mundo.css, que
// escurecia uma foto de dia: esta já é noite, e quem escurece é a hora (as
// camadas por cima, que só mudam de opacidade). Meio pixel de desfoque funde
// as duas cópias; na troca de cópia, um pouco mais (a transição é do CSS).
const FILTRO_QUIETO = 'blur(0.5px)';
const FILTRO_TROCANDO = 'blur(2.6px)';

/** O objeto de quem não tem foto: nada é criado e tudo é vazio. */
function nada() {
  return {
    ativo: false,
    pronto: Promise.resolve(false),
    cor: COR_NOITE,
    caminhada() {},
    atualizar() {},
    aplicarHora() {},
    ligar() {},
    desligar() {},
  };
}

/**
 * Pinta a clareira oval uma vez e publica em <html> como --fundo-veu-noite:
 * anil da sombra da noite (--hora-sombra-noite), nunca preto. Um gradiente
 * radial grande em CSS custaria um quadro longo cada vez que o véu aparece; a
 * imagem pronta só é esticada. Sem canvas não há véu, e a auréola das letras
 * continua dando a leitura.
 */
function pintarVeu() {
  if (document.documentElement.style.getPropertyValue('--fundo-veu-noite')) return;
  try {
    const tela = document.createElement('canvas');
    tela.width = 128;
    tela.height = 128;
    const g = tela.getContext('2d');
    // O miolo a 0,72 sobre a lanterna mais clara da foto ainda deixa o luar a mais de 7:1.
    const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, 'rgba(6, 9, 22, 0.72)');
    r.addColorStop(0.44, 'rgba(6, 9, 22, 0.56)');
    r.addColorStop(0.72, 'rgba(8, 11, 30, 0.24)');
    r.addColorStop(1, 'rgba(8, 11, 30, 0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 128, 128);
    document.documentElement.style.setProperty('--fundo-veu-noite', `url("${tela.toDataURL('image/png')}")`);
  } catch {
    /* sem canvas: sem véu */
  }
}

/** `{ amb, antesDe }` → objeto `fundo` (o "nada" sem foto em pagina.fundo ou sem onde pôr). */
export function criarFundo({ amb, antesDe } = {}) {
  const url = window.CONTEUDO?.pagina?.fundo;
  if (typeof url !== 'string' || !url.trim() || !antesDe?.parentNode) return nada();

  const novaFoto = () => {
    const img = el('img', { alt: '', decoding: 'async', draggable: 'false', style: { filter: FILTRO_QUIETO } });
    return { quadro: el('div', 'fundo-foto', img), img, z: 1, transform: '', opacidade: '' };
  };
  const camada = (classe) => el('div', { class: classe, style: { opacity: '0' } });

  const fotos = [novaFoto(), novaFoto()];
  // A segunda cópia espera escondida; quem a revela libera a visibilidade antes
  // de escrever a opacidade, senão a dissolvência não aparece.
  fotos[1].quadro.style.opacity = '0';
  fotos[1].quadro.style.visibility = 'hidden';
  fotos[1].opacidade = '0';
  const nevoa = camada('fundo-nevoa');
  const camadaTarde = camada('fundo-hora fundo-hora-tarde');
  const camadaNoite = camada('fundo-hora fundo-hora-noite');
  const camadaCometa = camada('fundo-hora fundo-hora-cometa');

  const raiz = el('div', { id: 'mundo-fundo', 'aria-hidden': 'true' }, [
    fotos[0].quadro,
    fotos[1].quadro,
    nevoa,
    camadaTarde,
    camadaNoite,
    camadaCometa,
    el('div', 'fundo-veu fundo-veu-alto'),
    el('div', 'fundo-veu fundo-veu-baixo'),
  ]);
  antesDe.parentNode.insertBefore(raiz, antesDe);
  pintarVeu();

  // Lido uma vez, na criação. Number() de algo herdado vira NaN, e NaN vira 1.
  fotos[0].z = Number(INICIAL[new URLSearchParams(location.search).get('cena') || document.documentElement.dataset.chegada]) || 1;

  let natural = null; // { w, h } da foto carregada
  let caixa = null; // { L, A, w, h, left, top, ox, oy, focal }
  let atual = 0;
  let troca = null; // { andado, distancia } enquanto uma cópia dissolve na outra
  let mistura = 0;
  let zAnterior = null;
  let ligado = true;
  let cometaPintado = false;
  const pose = { dx: 0, dy: 0, roll: 0 };
  const opacidades = new Map();

  /** Grava a opacidade só quando ela muda (3 casas). */
  function por(no, v) {
    const s = v.toFixed(3);
    if (opacidades.get(no) === s) return;
    opacidades.set(no, s);
    no.style.opacity = s;
  }

  function aplicarHora(e) {
    // A foto falhou e a raiz saiu: nada a pintar (nem o cometa).
    if (!raiz.isConnected) return;
    const p = clamp(Number(e?.p) || 0, 0, 4);
    const noite = clamp(Number(e?.noite) || 0);
    // A fração acesa das lanternas 3D; sem ela, a posição faz as vezes (acesas no entardecer).
    const acesas = clamp(Number.isFinite(e?.lanternas) ? e.lanternas : p / 2);
    por(nevoa, 1 - 0.78 * acesas);
    por(camadaTarde, 0.25 * (1 - acesas));
    // Multiplicada: até ~0,5 a noite aprofunda o anil sem apagar a luz das lanternas.
    por(camadaNoite, p <= 2 ? 0 : (p - 2) * 0.25);
    const k = clamp((noite - 0.2) / 0.8);
    if (k > 0 && !cometaPintado) {
      cometaPintado = true;
      try {
        Object.assign(camadaCometa.style, {
          backgroundImage: `url("${pintarCometa(384, 384).toDataURL('image/png')}")`,
          backgroundSize: '100% 100%',
          backgroundRepeat: 'no-repeat',
        });
      } catch {
        /* sem cometa; a noite continua */
      }
    }
    por(camadaCometa, k * k);
  }

  /** Cobre a tela com a foto, com o ponto de fuga onde a câmera da alameda o põe. */
  function enquadrar() {
    if (!natural) return;
    // #mundo-fundo tem a altura de var(--tela); é ela que vale, não a da janela.
    const L = Math.max(1, innerWidth);
    const A = Math.max(1, raiz.clientHeight || innerHeight);
    const aspecto = L / A;
    // O mesmo campo de visão da câmera 3D: 58° em pé, 42° deitado.
    const fov = aspecto < 0.8 ? 58 : aspecto > 1.35 ? 42 : 58 - (16 * (aspecto - 0.8)) / 0.55;
    const focal = A / 2 / Math.tan((fov * Math.PI) / 360);
    const folga = 0.035 * focal; // ~0,03 rad para o balanço
    const retrato = aspecto < 0.9;
    const c = Math.max((L + 2 * folga) / natural.w, (A + 2 * folga) / natural.h) * (retrato ? 1.12 : 1.04);
    const w = natural.w * c;
    const h = natural.h * c;
    const ox = PONTO_FUGA.x * w;
    const oy = PONTO_FUGA.y * h;
    const left = clamp(L * 0.5 - ox, L + folga - w, -folga);
    const top = clamp(A * 0.53 - oy, A + folga - h, -folga);
    caixa = { L, A, w, h, left, top, ox, oy, focal };
    for (const f of fotos) {
      Object.assign(f.quadro.style, {
        width: `${w}px`,
        height: `${h}px`,
        left: `${left}px`,
        top: `${top}px`,
        transformOrigin: `${ox}px ${oy}px`,
      });
      f.transform = '';
    }
    raiz.style.setProperty('--fundo-fuga-x', `${(((left + ox) / L) * 100).toFixed(2)}%`);
    raiz.style.setProperty('--fundo-fuga-y', `${(((top + oy) / A) * 100).toFixed(2)}%`);
    desenhar();
  }

  /** A cópia de trás nasce mais longe e começa a dissolver por cima da atual. */
  function comecarTroca(z, distancia) {
    const b = fotos[1 - atual];
    b.z = z;
    b.quadro.style.visibility = '';
    raiz.classList.add('fundo-trocando');
    for (const f of fotos) f.img.style.filter = FILTRO_TROCANDO;
    troca = { andado: 0, distancia };
    mistura = 0;
  }

  /** Começo de uma caminhada: se a foto não cabe nela, planeja a troca já. */
  function caminhada(distancia) {
    const d = Number(distancia) || 0;
    // Antes de a foto entrar não há o que trocar: a troca deixaria a foto
    // desfocada (fundo-trocando) durante a entrada; o laço cuida depois.
    if (amb?.reduzido || d <= 0 || troca || !caixa) return;
    const z = fotos[atual].z;
    if (z * Math.exp(APROXIMA_POR_METRO * d) <= LIMITE) return;
    comecarTroca(Math.max(RECOMECO, z / SALTO), d);
  }

  function avancar(metros) {
    const f = fotos[atual];
    if (!troca && f.z * Math.exp(APROXIMA_POR_METRO * TROCA_SOZINHA) > LIMITE) {
      comecarTroca(Math.max(RECOMECO, f.z / SALTO_SOZINHA), TROCA_SOZINHA);
    }
    const k = Math.exp(APROXIMA_POR_METRO * metros);
    f.z = Math.min(f.z * k, TETO);
    if (!troca) return;
    const b = fotos[1 - atual];
    b.z *= k;
    troca.andado += metros;
    mistura = suave((troca.andado - troca.distancia * 0.2) / (troca.distancia * 0.5));
    if (mistura < 1) return;

    f.quadro.style.visibility = 'hidden';
    f.quadro.style.opacity = '0';
    f.opacidade = '0';
    atual = 1 - atual;
    b.quadro.style.opacity = '';
    b.opacidade = '';
    // A atual fica embaixo e a que espera logo acima dela (antes da névoa). Quem
    // muda de lugar é a escondida: mover a visível cortaria a transição do desfoque.
    b.quadro.after(f.quadro);
    troca = null;
    mistura = 0;
    raiz.classList.remove('fundo-trocando');
    for (const foto of fotos) foto.img.style.filter = FILTRO_QUIETO;
  }

  /** Escreve uma cópia; o DOM só é tocado quando o transform ou a opacidade mudam. */
  function escrever(f, opacidade) {
    const { L, A, w, h, left, top, ox, oy } = caixa;
    const z = f.z;
    // A borda da foto nunca entra na tela (4 px de margem), nem em tela larga.
    const dx = clamp(pose.dx, L + 4 - (left + ox + z * (w - ox)), -4 - (left + ox - z * ox));
    const dy = clamp(pose.dy, A + 4 - (top + oy + z * (h - oy)), -4 - (top + oy - z * oy));
    const t = `translate3d(${dx.toFixed(1)}px, ${dy.toFixed(1)}px, 0) rotate(${pose.roll.toFixed(4)}rad) scale(${z.toFixed(4)})`;
    if (t !== f.transform) {
      f.transform = t;
      f.quadro.style.transform = t;
    }
    if (opacidade !== undefined && opacidade !== f.opacidade) {
      f.opacidade = opacidade;
      f.quadro.style.opacity = opacidade;
    }
  }

  function desenhar() {
    if (!caixa) return;
    escrever(fotos[atual]);
    if (troca) escrever(fotos[1 - atual], mistura.toFixed(3));
  }

  /** A cada quadro, pelo mundo leve: `z` já desconta o passo de base; dx/dy/roll são o balanço. */
  function atualizar({ z = 0, yaw = 0, pitch = 0, roll = 0, dx = 0, dy = 0 } = {}) {
    if (!caixa || !ligado) return;
    if (zAnterior !== null && !amb?.reduzido) {
      const passo = zAnterior - z;
      // Um salto (atalho, volta de aba) não é caminhada.
      if (passo > 0 && passo < 0.5) avancar(passo);
    }
    zAnterior = z;
    if (amb?.reduzido) {
      pose.dx = 0;
      pose.dy = 0;
      pose.roll = 0;
    } else {
      pose.dx = yaw * caixa.focal + dx;
      pose.dy = pitch * caixa.focal + dy;
      pose.roll = roll;
    }
    desenhar();
  }

  // O 100dvh do Safari muda várias vezes por segundo: medir a cada pixel refaria o layout à toa.
  const pedirEnquadrar = debounce(enquadrar, 120);
  addEventListener('resize', pedirEnquadrar);
  addEventListener('orientationchange', pedirEnquadrar);

  let resolver;
  const fundo = {
    ativo: true,
    pronto: new Promise((resolve) => {
      resolver = resolve;
    }),
    cor: COR_HORIZONTE,
    caminhada,
    atualizar,
    aplicarHora,
    ligar() {
      ligado = true;
      // O que andou com o mundo desligado não conta como caminhada.
      zAnterior = null;
      raiz.style.visibility = '';
    },
    desligar() {
      ligado = false;
      raiz.style.visibility = 'hidden';
    },
  };

  // A foto não veio: fica só a noite, sem buraco e sem aviso.
  function falhou() {
    pedirEnquadrar.cancelar();
    removeEventListener('resize', pedirEnquadrar);
    removeEventListener('orientationchange', pedirEnquadrar);
    raiz.remove();
    natural = null;
    caixa = null;
    fundo.ativo = false;
    fundo.cor = COR_NOITE;
    resolver(false);
  }

  const img = fotos[0].img;
  img.onerror = falhou;
  img.onload = () => {
    const entrar = () => {
      if (!img.naturalWidth || !img.naturalHeight) {
        falhou();
        return;
      }
      natural = { w: img.naturalWidth, h: img.naturalHeight };
      fotos[1].img.src = img.src;
      enquadrar();
      // Dois quadros: a foto já está pintada quando a opacidade começa a subir da noite.
      requestAnimationFrame(() => requestAnimationFrame(() => {
        raiz.classList.add('fundo-pronto');
        document.documentElement.classList.add('com-fundo');
        resolver(true);
      }));
    };
    if (typeof img.decode === 'function') img.decode().then(entrar, entrar);
    else entrar();
  };
  img.src = url;

  return fundo;
}

/** `{ depoisDe }` (o canvas 3D) → os véus atrás do texto, que acendem no primeiro `ligar()`. */
export function criarVeus({ depoisDe } = {}) {
  if (!depoisDe?.parentNode) return nada();
  const raiz = el('div', { id: 'mundo-veus', 'aria-hidden': 'true' }, [
    el('div', 'fundo-veu fundo-veu-alto'),
    el('div', 'fundo-veu fundo-veu-baixo'),
  ]);
  depoisDe.after(raiz);
  pintarVeu();

  let aceso = false;
  return {
    ...nada(),
    ligar() {
      raiz.style.visibility = '';
      if (aceso) return;
      aceso = true;
      document.documentElement.classList.add('com-fundo');
      // Um quadro depois, para a transição de opacidade partir do zero.
      requestAnimationFrame(() => raiz.classList.add('fundo-pronto'));
    },
    desligar() {
      raiz.style.visibility = 'hidden';
    },
  };
}
