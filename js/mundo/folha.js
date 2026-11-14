// A última folha (contrato 4.7): fica DENTRO do mundo 3D, com pétalas passando
// na frente e atrás. O texto é desenhado num canvas-textura, letra por letra,
// e tem um espelho em DOM (invisível) para leitores de tela.
//
//   const folha = criarFolha(mundo);
//   folha.grupo                  Object3D; a cena posiciona e põe em mundo.cena
//   folha.desdobrar() → Promise  abre as duas dobras
//   folha.escrever(texto) → Promise
//   folha.atualizar(dt, t)
//   folha.dispose()
//
// Sem WebGL, a folha é um retângulo de papel em DOM com o texto letra por letra.
// Versão do esqueleto: dobra em três, letra entra inteira (sem traço de caneta).

import { el, espera, objetoLeve } from '../nucleo/util.js';
import { curvas, revelarLetras } from '../nucleo/movimento.js';

const LARGURA = 0.42;
const ALTURA = 0.56;
const TELA_L = 1024;
const TELA_A = Math.round(TELA_L * (ALTURA / LARGURA));
const COR_PAPEL = '#fbf7f0';
const COR_TINTA = '#2a1b22';
const FONTE = '"Klee One", "Shippori Mincho", Georgia, serif';

export function criarFolha(mundo) {
  return mundo.ok ? criarFolha3D(mundo) : criarFolhaLeve(mundo);
}

function comoPromise(animacao) {
  return new Promise((resolver) => animacao.eventCallback('onComplete', resolver));
}

function espelhoParaLeitor(texto) {
  const p = el('p', { class: 'so-leitor', 'aria-live': 'polite' });
  (document.getElementById('palco') || document.body).append(p);
  p.textContent = texto;
  return p;
}

/** Espera a fonte manuscrita (no máximo ~1,5 s; se faltar, o navegador usa a reserva). */
async function fontePronta(texto) {
  if (!document.fonts || !document.fonts.load) return;
  try {
    await Promise.race([document.fonts.load(`600 64px ${FONTE}`, texto), espera(1500)]);
  } catch { /* segue com a reserva */ }
}

// =============================================================================
// 3D
// =============================================================================

function criarFolha3D(mundo) {
  const { THREE } = mundo;
  const gsap = window.gsap;

  const tela = document.createElement('canvas');
  tela.width = TELA_L;
  tela.height = TELA_A;
  const pincel = tela.getContext('2d');
  pincel.fillStyle = COR_PAPEL;
  pincel.fillRect(0, 0, TELA_L, TELA_A);

  const textura = new THREE.CanvasTexture(tela);
  textura.colorSpace = THREE.SRGBColorSpace;
  textura.anisotropy = Math.min(4, mundo.renderer.capabilities.getMaxAnisotropy());

  const material = new THREE.MeshBasicMaterial({ map: textura, side: THREE.DoubleSide });

  const grupo = new THREE.Group();
  grupo.name = 'folha';
  const interno = new THREE.Group();
  grupo.add(interno);

  // Três painéis (dobra de carta): cada um mostra o seu terço da textura.
  const terco = ALTURA / 3;
  function painel(indice) {                       // 0 = de cima, 1 = meio, 2 = de baixo
    const g = new THREE.PlaneGeometry(LARGURA, terco);
    const uv = g.attributes.uv;
    const v1 = 1 - indice / 3;                    // topo do painel na textura
    const v0 = 1 - (indice + 1) / 3;
    for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) > 0.5 ? v1 : v0);
    return new THREE.Mesh(g, material);
  }

  const meio = painel(1);
  const dobraCima = new THREE.Group();
  dobraCima.position.y = terco / 2;
  const cima = painel(0);
  cima.position.y = terco / 2;
  dobraCima.add(cima);
  const dobraBaixo = new THREE.Group();
  dobraBaixo.position.y = -terco / 2;
  const baixo = painel(2);
  baixo.position.y = -terco / 2;
  dobraBaixo.add(baixo);
  interno.add(meio, dobraCima, dobraBaixo);

  // Começa dobrada: as duas abas fechadas sobre o meio (ângulos diferentes para não disputar o mesmo plano).
  dobraCima.rotation.x = Math.PI * 0.975;
  dobraBaixo.rotation.x = -Math.PI * 0.94;

  let espelho = null;

  return {
    grupo,

    desdobrar() {
      const rapido = mundo.amb.reduzido;
      const tl = gsap.timeline();
      tl.to(dobraBaixo.rotation, { x: 0, duration: rapido ? 0.6 : 1.3, ease: curvas.branco.entrar }, 0)
        .to(dobraCima.rotation, { x: 0, duration: rapido ? 0.6 : 1.4, ease: curvas.branco.entrar }, rapido ? 0 : 0.45);
      return comoPromise(tl);
    },

    async escrever(texto) {
      const frase = String(texto ?? '');
      if (!espelho) espelho = espelhoParaLeitor(frase);
      else espelho.textContent = frase;
      await fontePronta(frase);

      // Quebra em linhas que cabem na folha e centraliza o bloco.
      const margem = TELA_L * 0.13;
      const larguraUtil = TELA_L - margem * 2;
      let tamanho = 84;
      let linhas = [];
      for (; tamanho >= 44; tamanho -= 6) {
        pincel.font = `600 ${tamanho}px ${FONTE}`;
        linhas = quebrar(pincel, frase, larguraUtil);
        if (linhas.length * tamanho * 1.6 <= TELA_A * 0.7) break;
      }
      const entrelinha = tamanho * 1.6;
      const topo = (TELA_A - linhas.length * entrelinha) / 2 + tamanho;

      // Posição de cada letra.
      const letras = [];
      linhas.forEach((linha, i) => {
        let x = (TELA_L - pincel.measureText(linha).width) / 2;
        for (const ch of Array.from(linha)) {
          letras.push({ ch, x, y: topo + i * entrelinha });
          x += pincel.measureText(ch).width;
        }
      });

      pincel.fillStyle = COR_TINTA;
      pincel.textBaseline = 'alphabetic';
      let desenhadas = 0;
      const desenharAte = (quantas) => {
        for (; desenhadas < quantas && desenhadas < letras.length; desenhadas++) {
          const l = letras[desenhadas];
          pincel.fillText(l.ch, l.x, l.y);
        }
        textura.needsUpdate = true;
      };

      if (mundo.amb.reduzido || !letras.length) {
        desenharAte(letras.length);
        return;
      }
      const estado = { n: 0 };
      await comoPromise(gsap.to(estado, {
        n: letras.length,
        duration: letras.length * 0.085,
        ease: 'none',
        onUpdate: () => desenharAte(Math.floor(estado.n)),
        onComplete: () => desenharAte(letras.length),
      }));
    },

    atualizar(dt, t) {
      if (mundo.amb.reduzido) return;
      interno.position.y = Math.sin(t * 0.7) * 0.006;
      interno.rotation.z = Math.sin(t * 0.45 + 0.8) * 0.008;
      interno.rotation.y = mundo.ponteiro.x * 0.12;
      interno.rotation.x = -mundo.ponteiro.y * 0.08;
    },

    dispose() {
      if (grupo.parent) grupo.parent.remove(grupo);
      for (const m of [meio, cima, baixo]) m.geometry.dispose();
      material.dispose();
      textura.dispose();
      if (espelho) espelho.remove();
    },
  };
}

function quebrar(pincel, texto, larguraMax) {
  const linhas = [];
  for (const paragrafo of texto.split('\n')) {
    let atual = '';
    for (const palavra of paragrafo.split(/\s+/).filter(Boolean)) {
      const tentativa = atual ? `${atual} ${palavra}` : palavra;
      if (atual && pincel.measureText(tentativa).width > larguraMax) {
        linhas.push(atual);
        atual = palavra;
      } else {
        atual = tentativa;
      }
    }
    linhas.push(atual);
  }
  return linhas;
}

// =============================================================================
// Leve (DOM)
// =============================================================================

function criarFolhaLeve(mundo) {
  const gsap = window.gsap;
  const texto = el('p', 'folha-leve-texto');
  const folha = el('div', 'folha-leve', texto);
  mundo.recipienteLeve.append(folha);
  gsap.set(folha, { autoAlpha: 0, scaleY: 0.12 });
  let espelho = null;

  return {
    grupo: objetoLeve(),
    desdobrar() {
      return comoPromise(gsap.to(folha, {
        autoAlpha: 1, scaleY: 1,
        duration: mundo.amb.reduzido ? 0.6 : 1.4,
        ease: curvas.branco.entrar,
      }));
    },
    async escrever(frase) {
      const inteiro = String(frase ?? '');
      if (!espelho) espelho = espelhoParaLeitor(inteiro);
      await fontePronta(inteiro);
      // #mundo-leve é aria-hidden: quem lê em voz alta recebe o espelho.
      await revelarLetras(texto, inteiro, { intervalo: 0.085, duracao: 0.5, subida: '0em' });
    },
    atualizar() {},
    dispose() {
      folha.remove();
      if (espelho) espelho.remove();
    },
  };
}
