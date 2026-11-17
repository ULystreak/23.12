// Fundo do mundo sem WebGL: a imagem da alameda atrás de tudo (content.js →
// pagina.fundo). Com WebGL a alameda é 3D (js/mundo/alameda.js) e daqui só vêm
// os véus atrás do texto (criarVeus, no fim do arquivo).
//
// Uma camada de DOM só, atrás do canvas (e atrás do mundo leve), e não uma
// textura no 3D: assim o mesmo código serve aos dois modos, a foto é rasterizada
// uma vez (o desfoque de profundidade entra nessa rasterização) e o que muda a
// cada quadro é só o transform, que o compositor resolve sem repintar nada.
//
//   #mundo-fundo
//     .fundo-foto × 2     a foto (a segunda só existe durante a troca de enquadramento)
//     .fundo-nevoa        luz de manhã nublada por cima da foto (estático)
//     .fundo-hora × 3     a hora do dia sobre a foto: a tarde (tinta morna), a noite (azul
//                         que multiplica a foto) e o cometa; só a opacidade anda (aplicarHora)
//     .fundo-veu × 2      véus claros atrás do texto (ligados pelo CSS quando há texto)
//
// Caminhar é andar pela alameda: conforme ela avança (o passo de base, que nunca
// para, mais as caminhadas), a foto aproxima devagar em direção ao ponto de fuga
// do caminho, em laço: perto do limite, dissolve sozinha para uma cópia de mais longe. A aproximação acumula pelo fluxo
// inteiro; quando a próxima caminhada a levaria além do limite, a foto dissolve,
// durante essa caminhada, para uma cópia menos aproximada que anda junto.
//
//   const fundo = criarFundo({ amb, antesDe })
//   fundo.ativo                 false sem foto (campo vazio ou arquivo que falhou)
//   fundo.pronto                Promise<boolean>: a foto chegou e está entrando
//   fundo.cor                   '#rrggbb': a cor da alameda na altura do horizonte (névoa do 3D)
//   fundo.caminhada(distancia)  avisa o começo de uma caminhada (planeja a troca)
//   fundo.atualizar({ z, yaw, pitch, roll, dx, dy, foco })  a cada quadro
//   fundo.ligar() / fundo.desligar()

import { clamp } from '../nucleo/util.js';
import { pintarCometa } from './hora.js';

// Ponto de fuga do caminho na imagem (fração). A imagem da alameda é renderizada
// do 3D com a câmera no meio do caminho, quase na horizontal (_dev/alameda-imagem.mjs): o
// horizonte cai um nada abaixo do centro.
const PONTO_FUGA = { x: 0.5, y: 0.515 };
// A cor da névoa no fundo do túnel (= js/mundo/alameda.js).
const COR_HORIZONTE = '#ece0e6';

const APROXIMA_POR_METRO = Math.log(1.15) / 7;    // 7 m de caminhada: 15% mais perto
const LIMITE = 1.55;                              // além disto a foto começaria a estourar
const RECOMECO = 1;                               // a cópia nova nunca parte de mais longe que isto...
const TROCA_SOZINHA = 2.2;                        // metros de passo de base que a dissolvência do laço leva
const SALTO_SOZINHA = 1.45;                       // no laço, a cópia nova parte daqui para trás
const SALTO = 1.2;                                // ... nem mais de 1,2× atrás da que sai (menos fantasma)
// Cena fria: onde a aproximação estaria se ela tivesse vindo andando desde o começo.
const INICIAL = { inicio: 1, poppy: 1.15, carta2: 1.15, yourname: 1.32, mao: 1.32, final: 1.4 };

const suave = (t) => { const x = clamp(t); return x * x * (3 - 2 * x); };

/**
 * A clareira atrás do texto: um oval claro de borda macia, pintado uma vez num
 * canvas pequeno e publicado como --fundo-veu (o CSS estica onde precisar).
 */
function pintarVeu() {
  try {
    const tela = document.createElement('canvas');
    tela.width = 128;
    tela.height = 128;
    const g = tela.getContext('2d');
    if (!g) return;
    // o claro (de dia) e o escuro (à noite, atrás das letras claras: css/mundo.css)
    for (const [nome, cor, forca] of [['--fundo-veu', '255, 250, 252', 1], ['--fundo-veu-noite', '7, 10, 30', 0.86]]) {
      g.clearRect(0, 0, 128, 128);
      const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      r.addColorStop(0, `rgba(${cor}, ${0.82 * forca})`);
      r.addColorStop(0.44, `rgba(${cor}, ${0.62 * forca})`);
      r.addColorStop(0.72, `rgba(${cor}, ${0.26 * forca})`);
      r.addColorStop(1, `rgba(${cor}, 0)`);
      g.fillStyle = r;
      g.fillRect(0, 0, 128, 128);
      document.documentElement.style.setProperty(nome, `url("${tela.toDataURL('image/png')}")`);
    }
  } catch { /* sem canvas: sem véu (a auréola das letras continua) */ }
}

export function criarFundo({ amb, antesDe }) {
  const url = String(window.CONTEUDO?.pagina?.fundo || '').trim();
  const nada = {
    ativo: false,
    pronto: Promise.resolve(false),
    cor: '#ffffff',
    caminhada() {},
    atualizar() {},
    aplicarHora() {},
    ligar() {},
    desligar() {},
  };
  if (!url || !antesDe || !antesDe.parentNode) return nada;

  const raiz = document.createElement('div');
  raiz.id = 'mundo-fundo';
  raiz.setAttribute('aria-hidden', 'true');
  const novaFoto = () => {
    const quadro = document.createElement('div');
    quadro.className = 'fundo-foto';
    const img = document.createElement('img');
    img.alt = '';
    img.decoding = 'async';
    img.draggable = false;
    quadro.append(img);
    return { quadro, img, z: 1, transform: '', opacidade: '' };
  };
  const fotos = [novaFoto(), novaFoto()];
  fotos[1].quadro.style.opacity = '0';
  fotos[1].quadro.style.visibility = 'hidden';
  const nevoa = document.createElement('div');
  nevoa.className = 'fundo-nevoa';
  const veuAlto = document.createElement('div');
  veuAlto.className = 'fundo-veu fundo-veu-alto';
  const veuBaixo = document.createElement('div');
  veuBaixo.className = 'fundo-veu fundo-veu-baixo';
  // A hora do dia sobre a foto (sem WebGL): três camadas pintadas uma vez; só a opacidade anda.
  const camada = (classe) => { const no = document.createElement('div'); no.className = `fundo-hora ${classe}`; no.style.opacity = '0'; return no; };
  const horaTarde = camada('fundo-hora-tarde');
  const horaNoite = camada('fundo-hora-noite');
  const horaCometa = camada('fundo-hora-cometa');
  let cometaPintado = false;
  const opacidades = new Map();
  const por = (no, v) => {
    const s = v.toFixed(3);
    if (opacidades.get(no) !== s) { opacidades.set(no, s); no.style.opacity = s; }
  };
  /** Recebe o estado de js/mundo/hora.js (estadoDaHora). */
  function aplicarHora(e) {
    const p = e.p;                                     // 0 manhã … 4 noite
    // a tarde: entra do dia ao entardecer, fica no crepúsculo e cede à noite
    por(horaTarde, p <= 1 ? 0 : p <= 2 ? (p - 1) * 0.8 : p <= 3 ? 0.8 + (p - 2) * 0.2 : 1 - (p - 3) * 0.75);
    por(horaNoite, p <= 2 ? 0 : p <= 3 ? (p - 2) * 0.42 : 0.42 + (p - 3) * 0.58);
    por(nevoa, 1 - 0.85 * e.noite);
    const k = clamp((e.noite - 0.2) / 0.8);
    if (k > 0 && !cometaPintado) {
      cometaPintado = true;
      try { horaCometa.style.backgroundImage = `url("${pintarCometa(384, 384).toDataURL('image/png')}")`; } catch { /* sem canvas: sem cometa */ }
    }
    por(horaCometa, k * k);
  }
  raiz.append(fotos[0].quadro, fotos[1].quadro, nevoa, horaTarde, horaNoite, horaCometa, veuAlto, veuBaixo);

  // ---- enquadramento ------------------------------------------------------------
  // A foto cobre a tela com folga para o balanço e o ponteiro, e o ponto de fuga
  // cai no meio da largura e um pouco abaixo do meio da altura (o horizonte do 3D).
  const caixa = { L: 1, A: 1, w: 1, h: 1, left: 0, top: 0, ox: 0, oy: 0, focal: 1 };
  let natural = { w: 0, h: 0 };

  function enquadrar() {
    if (!natural.w) return;
    const L = Math.max(1, innerWidth);
    const A = Math.max(1, raiz.clientHeight || innerHeight);
    const aspecto = L / A;
    const fov = aspecto < 0.8 ? 58 : aspecto > 1.35 ? 42 : 58 - 16 * ((aspecto - 0.8) / 0.55);
    const focal = (A / 2) / Math.tan((fov * Math.PI) / 360);
    const folga = 0.035 * focal;                  // o ponteiro gira a câmera ~0,03 rad
    const retrato = aspecto < 0.9;
    const c = Math.max((L + 2 * folga) / natural.w, (A + 2 * folga) / natural.h) * (retrato ? 1.12 : 1.04);
    const w = natural.w * c;
    const h = natural.h * c;
    const ox = PONTO_FUGA.x * w;
    const oy = PONTO_FUGA.y * h;
    const left = clamp(L * 0.5 - ox, L + folga - w, -folga);
    const top = clamp(A * 0.53 - oy, A + folga - h, -folga);
    Object.assign(caixa, { L, A, w, h, left, top, ox, oy, focal });
    for (const f of fotos) {
      const s = f.quadro.style;
      s.width = `${w.toFixed(1)}px`;
      s.height = `${h.toFixed(1)}px`;
      s.left = `${left.toFixed(1)}px`;
      s.top = `${top.toFixed(1)}px`;
      s.transformOrigin = `${ox.toFixed(1)}px ${oy.toFixed(1)}px`;
      f.transform = '';                           // escreve de novo no próximo quadro
    }
    raiz.style.setProperty('--fundo-fuga-x', `${(((left + ox) / L) * 100).toFixed(1)}%`);
    raiz.style.setProperty('--fundo-fuga-y', `${(((top + oy) / A) * 100).toFixed(1)}%`);
    desenhar();
  }

  // ---- aproximação ------------------------------------------------------------------
  const cenaFria = new URLSearchParams(location.search).get('cena');
  fotos[0].z = INICIAL[cenaFria] || 1;
  let atual = 0;                                   // índice da foto à vista
  let troca = null;                                // { andado, distancia } durante a dissolvência
  let zAnterior = null;
  let mistura = 0;
  const pose = { dx: 0, dy: 0, roll: 0 };

  function caminhada(distancia) {
    if (amb.reduzido || !(distancia > 0) || troca) return;
    const a = fotos[atual];
    if (a.z * Math.exp(APROXIMA_POR_METRO * distancia) <= LIMITE) return;
    const b = fotos[1 - atual];
    b.z = Math.max(RECOMECO, a.z / SALTO);
    b.quadro.style.visibility = '';
    // um desfoque a mais durante a troca funde as duas cópias numa só
    raiz.classList.add('fundo-trocando');
    troca = { andado: 0, distancia };
  }

  function avancar(metros) {
    if (!(metros > 0)) return;
    // O passo de base nunca para: a aproximação é um laço. Um pouco antes do
    // limite, a foto começa sozinha a dissolver para uma cópia vista de mais longe,
    // que já vem andando junto (sem salto: as duas aproximam no mesmo ritmo).
    if (!troca && fotos[atual].z * Math.exp(APROXIMA_POR_METRO * TROCA_SOZINHA) > LIMITE) {
      const b = fotos[1 - atual];
      b.z = Math.max(RECOMECO, fotos[atual].z / SALTO_SOZINHA);
      b.quadro.style.visibility = '';
      raiz.classList.add('fundo-trocando');
      troca = { andado: 0, distancia: TROCA_SOZINHA };
    }
    const k = Math.exp(APROXIMA_POR_METRO * metros);
    fotos[atual].z = Math.min(fotos[atual].z * k, LIMITE * 1.35);
    if (!troca) return;
    const b = fotos[1 - atual];
    b.z *= k;
    troca.andado += metros;
    // a dissolvência acontece no meio da caminhada, com o corpo em movimento
    mistura = suave((troca.andado - troca.distancia * 0.2) / (troca.distancia * 0.5));
    if (mistura >= 1) {
      const velha = fotos[atual];
      velha.quadro.style.visibility = 'hidden';
      velha.quadro.style.opacity = '0';
      velha.opacidade = '0';
      atual = 1 - atual;
      fotos[atual].quadro.style.opacity = '';
      fotos[atual].opacidade = '';
      // a que está à vista desce para o fundo da pilha: a próxima cópia entra por cima dela
      raiz.insertBefore(fotos[atual].quadro, raiz.firstChild);
      troca = null;
      mistura = 0;
      raiz.classList.remove('fundo-trocando');
    }
  }

  function escrever(f, opacidade) {
    // O deslocamento não deixa a borda da foto aparecer: fica dentro da folga.
    const { L, A, left, top, ox, oy, w, h } = caixa;
    const z = f.z;
    const margem = 4;
    const dx = clamp(pose.dx, L + margem - (left + ox + z * (w - ox)), -margem - (left + ox - z * ox));
    const dy = clamp(pose.dy, A + margem - (top + oy + z * (h - oy)), -margem - (top + oy - z * oy));
    const t = `translate3d(${dx.toFixed(1)}px, ${dy.toFixed(1)}px, 0) rotate(${pose.roll.toFixed(4)}rad) scale(${z.toFixed(4)})`;
    if (t !== f.transform) { f.quadro.style.transform = t; f.transform = t; }
    if (opacidade !== undefined && opacidade !== f.opacidade) { f.quadro.style.opacity = opacidade; f.opacidade = opacidade; }
  }

  function desenhar() {
    if (!natural.w) return;
    escrever(fotos[atual]);
    if (troca) escrever(fotos[1 - atual], mistura.toFixed(3));
  }

  /**
   * A cada quadro. z: posição do rig (m); yaw/pitch/roll: para onde a câmera olha
   * (rad); dx/dy: balanço já em px. A foto está "no infinito": gira com a câmera
   * por inteiro e quase não sente a translação.
   */
  function atualizar({ z = 0, yaw = 0, pitch = 0, roll = 0, dx = 0, dy = 0 } = {}) {
    if (!natural.w || !ligado) return;
    if (zAnterior !== null && !amb.reduzido) {
      const passo = zAnterior - z;
      // só o avanço conta; um salto (cena que recomeça, dissolvência) não é andar
      if (passo > 0 && passo < 0.5) avancar(passo);
    }
    zAnterior = z;
    if (amb.reduzido) {
      pose.dx = 0; pose.dy = 0; pose.roll = 0;
    } else {
      pose.dx = yaw * caixa.focal + dx;
      pose.dy = pitch * caixa.focal + dy;
      pose.roll = roll;
    }
    desenhar();
  }

  let ligado = true;
  const fundo = {
    ativo: true,
    cor: COR_HORIZONTE,
    pronto: null,
    caminhada,
    atualizar,
    aplicarHora,
    ligar() {
      ligado = true;
      raiz.style.visibility = '';
      zAnterior = null;                              // o que andou com o mundo desligado não conta
    },
    desligar() {
      ligado = false;
      raiz.style.visibility = 'hidden';
    },
  };

  antesDe.parentNode.insertBefore(raiz, antesDe);
  pintarVeu();

  fundo.pronto = new Promise((resolver) => {
    const img = fotos[0].img;
    const falhou = () => {
      raiz.remove();
      fundo.ativo = false;
      fundo.cor = '#ffffff';
      resolver(false);
    };
    img.onerror = falhou;
    img.onload = () => {
      const fim = () => {
        natural = { w: img.naturalWidth, h: img.naturalHeight };
        if (!natural.w || !natural.h) { falhou(); return; }
        fotos[1].img.src = img.currentSrc || img.src;
        enquadrar();
        // dois quadros: o primeiro desenho com opacidade 0, depois a transição
        requestAnimationFrame(() => requestAnimationFrame(() => raiz.classList.add('fundo-pronto')));
        document.documentElement.classList.add('com-fundo');      // para o CSS do texto por cima da foto
        resolver(true);
      };
      if (img.decode) img.decode().then(fim, fim);
      else fim();
    };
    img.src = url;
  });

  let id = 0;
  const pedirEnquadrar = () => { clearTimeout(id); id = setTimeout(enquadrar, 120); };
  window.addEventListener('resize', pedirEnquadrar, { passive: true });
  window.addEventListener('orientationchange', pedirEnquadrar, { passive: true });

  return fundo;
}

/**
 * Com WebGL a alameda é 3D (js/mundo/alameda.js) e daqui só vêm os véus claros
 * atrás do texto: a mesma clareira do modo leve, numa camada logo acima do
 * canvas (#mundo-veus). `ligar()` acontece quando a alameda entra.
 * Sem `depoisDe`, não cria nada (mundo branco).
 */
export function criarVeus({ depoisDe }) {
  const nada = {
    ativo: false,
    pronto: Promise.resolve(false),
    cor: '#ffffff',
    caminhada() {},
    atualizar() {},
    ligar() {},
    desligar() {},
  };
  if (!depoisDe || !depoisDe.parentNode) return nada;
  const raiz = document.createElement('div');
  raiz.id = 'mundo-veus';
  raiz.setAttribute('aria-hidden', 'true');
  const veuAlto = document.createElement('div');
  veuAlto.className = 'fundo-veu fundo-veu-alto';
  const veuBaixo = document.createElement('div');
  veuBaixo.className = 'fundo-veu fundo-veu-baixo';
  raiz.append(veuAlto, veuBaixo);
  depoisDe.parentNode.insertBefore(raiz, depoisDe.nextSibling);
  pintarVeu();
  let aceso = false;
  return {
    ...nada,
    ligar() {
      raiz.style.visibility = '';
      if (aceso) return;
      aceso = true;
      document.documentElement.classList.add('com-fundo');
      requestAnimationFrame(() => raiz.classList.add('fundo-pronto'));
    },
    desligar() { raiz.style.visibility = 'hidden'; },
  };
}
