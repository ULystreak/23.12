// Envelope (contrato 4.4).
//
//   const env = criarEnvelope(mundo, { lacre: 'coracao' | 'estrela' | null, amarracao: 'cordao' | 'fio' });
//   env.grupo                       Object3D; a cena posiciona e põe em mundo.cena
//   env.atualizar(dt, t)            flutua, gira devagar, segue mundo.ponteiro
//   env.acertou(xNdc, yNdc) → bool  o toque caiu na carta?
//   env.ancoraFio → Vector3         onde o fio do caminho chega (variante 'fio')
//   env.abrir() → Promise<{ papel }>
//   env.entregarPapel(rect) → Promise   o papel voa e cobre exatamente o DOMRect
//   env.irEmbora() → Promise
//   env.dispose()
//
// Sem WebGL (mundo.ok === false) a mesma API é servida por uma carta em SVG.
// Opção extra só para a variante leve: `chegada` (segundos que ela leva para aparecer).
//
// Versão do esqueleto: formas simples. A assinatura acima não muda.

import { amortecer, el, svg, objetoLeve, vetorLeve } from '../nucleo/util.js';
import { curvas } from '../nucleo/movimento.js';

const LARGURA = 0.36;
const ALTURA = 0.25;
const COR_PAPEL = '#fbf7f0';

export function criarEnvelope(mundo, opcoes = {}) {
  return mundo.ok ? criarEnvelope3D(mundo, opcoes) : criarEnvelopeLeve(mundo, opcoes);
}

function comoPromise(animacao) {
  return new Promise((resolver) => animacao.eventCallback('onComplete', resolver));
}

// =============================================================================
// 3D
// =============================================================================

function formaLacre(THREE, tipo) {
  const forma = new THREE.Shape();
  if (tipo === 'estrela') {
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 0.0075 : 0.0175;
      const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
      if (i === 0) forma.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else forma.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    forma.closePath();
  } else {
    // coração
    const s = 0.0155;
    forma.moveTo(0, -s);
    forma.bezierCurveTo(-s * 1.7, -s * 0.1, -s * 1.1, s * 1.25, 0, s * 0.45);
    forma.bezierCurveTo(s * 1.1, s * 1.25, s * 1.7, -s * 0.1, 0, -s);
  }
  return forma;
}

function criarEnvelope3D(mundo, { lacre = 'coracao', amarracao = 'cordao' }) {
  const { THREE, camera } = mundo;
  const gsap = window.gsap;

  const grupo = new THREE.Group();
  grupo.name = 'envelope';
  const interno = new THREE.Group();     // flutua e gira aqui dentro, sem brigar com a posição dada pela cena
  grupo.add(interno);

  const matCorpo = new THREE.MeshLambertMaterial({ color: '#f1e8d8' });
  const matAba = new THREE.MeshLambertMaterial({ color: '#e7dcc8', side: THREE.DoubleSide });
  const matFio = new THREE.MeshBasicMaterial({ color: '#d7192d' });
  const matLacre = new THREE.MeshLambertMaterial({ color: '#b3123a' });
  const matMarca = new THREE.MeshBasicMaterial({ color: '#8a0c2a' });
  const matPapel = new THREE.MeshBasicMaterial({ color: COR_PAPEL, fog: false, side: THREE.DoubleSide });
  const matBorda = new THREE.LineBasicMaterial({ color: '#cbbda3' });

  // corpo
  const corpo = new THREE.Mesh(new THREE.BoxGeometry(LARGURA, ALTURA, 0.008), matCorpo);
  interno.add(corpo);
  const borda = new THREE.LineSegments(new THREE.EdgesGeometry(corpo.geometry), matBorda);
  interno.add(borda);

  // papel (dentro, escondido até abrir)
  const papel = new THREE.Mesh(new THREE.PlaneGeometry(LARGURA * 0.9, ALTURA * 0.86), matPapel);
  papel.position.set(0, 0, 0.0005);
  papel.visible = false;
  interno.add(papel);

  // aba: triângulo que gira na borda de cima
  const dobradica = new THREE.Group();
  dobradica.position.set(0, ALTURA / 2, 0.0046);
  const formaAba = new THREE.Shape();
  formaAba.moveTo(-LARGURA / 2, 0);
  formaAba.lineTo(LARGURA / 2, 0);
  formaAba.lineTo(0, -ALTURA * 0.6);
  formaAba.closePath();
  const aba = new THREE.Mesh(new THREE.ShapeGeometry(formaAba), matAba);
  const bordaAba = new THREE.LineSegments(new THREE.EdgesGeometry(aba.geometry), matBorda);
  dobradica.add(aba, bordaAba);
  interno.add(dobradica);

  // amarração: cordão em cruz, ou só o fio dando uma volta
  const amarra = new THREE.Group();
  amarra.position.z = 0.0062;
  const espessura = amarracao === 'fio' ? 0.0035 : 0.005;
  const faixaH = new THREE.Mesh(new THREE.PlaneGeometry(LARGURA * 1.01, espessura), matFio);
  faixaH.position.y = -ALTURA * 0.1;
  amarra.add(faixaH);
  if (amarracao !== 'fio') {
    const faixaV = new THREE.Mesh(new THREE.PlaneGeometry(espessura, ALTURA * 1.01), matFio);
    amarra.add(faixaV);
  } else {
    // o fio desce pela lateral até a âncora, de onde segue pelo caminho
    const descida = new THREE.Mesh(new THREE.PlaneGeometry(espessura, ALTURA * 0.4), matFio);
    descida.position.set(0, -ALTURA * 0.3, 0);
    amarra.add(descida);
  }
  interno.add(amarra);

  // lacre de cera com a marca (coração ou estrela)
  let selo = null;
  if (lacre) {
    selo = new THREE.Group();
    selo.position.set(0, -ALTURA * 0.1, 0.0075);
    const disco = new THREE.Mesh(new THREE.CircleGeometry(0.03, 40), matLacre);
    const marca = new THREE.Mesh(new THREE.ShapeGeometry(formaLacre(THREE, lacre)), matMarca);
    marca.position.z = 0.0006;
    selo.add(disco, marca);
    interno.add(selo);
  }

  let flutuando = true;
  let papelSolto = false;
  const cantos = [
    new THREE.Vector3(-LARGURA * 0.7, -ALTURA * 0.85, 0),
    new THREE.Vector3(LARGURA * 0.7, -ALTURA * 0.85, 0),
    new THREE.Vector3(LARGURA * 0.7, ALTURA * 0.85, 0),
    new THREE.Vector3(-LARGURA * 0.7, ALTURA * 0.85, 0),
  ];
  const vAux = new THREE.Vector3();

  const env = {
    grupo,
    papel,

    atualizar(dt, t) {
      if (!flutuando || !grupo.visible) return;
      const calmo = mundo.amb.reduzido ? 0.3 : 1;
      interno.position.y = Math.sin(t * 0.9) * 0.012 * calmo;
      interno.rotation.z = Math.sin(t * 0.6 + 1.3) * 0.02 * calmo;
      interno.rotation.y = amortecer(interno.rotation.y, mundo.ponteiro.x * 0.38 * calmo, 3.5, dt);
      interno.rotation.x = amortecer(interno.rotation.x, -mundo.ponteiro.y * 0.26 * calmo, 3.5, dt);
    },

    acertou(xNdc, yNdc) {
      if (!grupo.visible) return false;
      grupo.updateWorldMatrix(true, true);
      camera.updateWorldMatrix(true, false);
      let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity;
      for (const canto of cantos) {
        vAux.copy(canto).applyMatrix4(interno.matrixWorld).project(camera);
        if (vAux.z > 1) return false;                      // atrás da câmera
        minX = Math.min(minX, vAux.x); maxX = Math.max(maxX, vAux.x);
        minY = Math.min(minY, vAux.y); maxY = Math.max(maxY, vAux.y);
      }
      return xNdc >= minX && xNdc <= maxX && yNdc >= minY && yNdc <= maxY;
    },

    get ancoraFio() {
      grupo.updateWorldMatrix(true, true);
      return new THREE.Vector3(0, -ALTURA * 0.5, 0.006).applyMatrix4(interno.matrixWorld);
    },

    abrir() {
      const tl = gsap.timeline();
      if (selo) {
        tl.to(selo.scale, { x: 1.18, y: 1.18, duration: 0.18, ease: curvas.ui.resposta }, 0)
          .to(selo.rotation, { z: 0.5, duration: 0.5, ease: curvas.branco.sair }, 0.12)
          .to(selo.scale, { x: 0.001, y: 0.001, duration: 0.5, ease: curvas.branco.sair }, 0.16)
          .add(() => {
            selo.updateWorldMatrix(true, false);
            mundo.petalas.rajada(new THREE.Vector3().setFromMatrixPosition(selo.matrixWorld), 16);
          }, 0.2);
      }
      tl.to(amarra.scale, { x: 0.001, duration: 0.7, ease: curvas.branco.sair }, 0.25)
        .add(() => { amarra.visible = false; if (selo) selo.visible = false; }, 0.96)
        .to(dobradica.rotation, { x: -Math.PI * 0.9, duration: 1.2, ease: curvas.branco.entrar }, 0.6)
        .add(() => { papel.visible = true; }, 0.9)
        .to(papel.position, { y: ALTURA * 0.78, z: 0.012, duration: 1.1, ease: curvas.branco.entrar }, 1.0);
      return comoPromise(tl).then(() => ({ papel }));
    },

    entregarPapel(rect) {
      flutuando = false;
      papelSolto = true;
      papel.visible = true;
      const pose = mundo.retanguloParaPose(rect, papel);
      pose.pai.attach(papel);                              // mantém onde está, agora no espaço da câmera
      papel.renderOrder = 20;
      matPapel.depthTest = false;                          // passa na frente de tudo enquanto cresce

      const deQ = papel.quaternion.clone();
      const estado = { p: 0 };
      const duracao = mundo.amb.reduzido ? 0.8 : 1.5;
      const tl = gsap.timeline();
      tl.to(papel.position, { x: pose.posicao.x, y: pose.posicao.y, z: pose.posicao.z, duration: duracao, ease: curvas.branco.entrar }, 0)
        .to(papel.scale, { x: pose.escala.x, y: pose.escala.y, duration: duracao, ease: curvas.branco.entrar }, 0)
        .to(estado, {
          p: 1,
          duration: duracao * 0.8,
          ease: curvas.branco.entrar,
          onUpdate: () => papel.quaternion.slerpQuaternions(deQ, pose.quaternion, estado.p),
        }, 0);
      return comoPromise(tl);
    },

    irEmbora() {
      flutuando = false;
      const tl = gsap.timeline();
      tl.to(grupo.position, { z: grupo.position.z - 9, y: grupo.position.y + 0.7, duration: 2.2, ease: curvas.branco.sair }, 0)
        .to(interno.rotation, { x: -0.5, z: 0.25, duration: 2.2, ease: curvas.branco.deriva }, 0);
      return comoPromise(tl).then(() => { grupo.visible = false; });
    },

    dispose() {
      if (grupo.parent) grupo.parent.remove(grupo);
      if (papelSolto && papel.parent) papel.parent.remove(papel);
      const geometrias = new Set();
      grupo.traverse((no) => { if (no.geometry) geometrias.add(no.geometry); });
      geometrias.add(papel.geometry);
      for (const g of geometrias) g.dispose();
      for (const m of [matCorpo, matAba, matFio, matLacre, matMarca, matPapel, matBorda]) m.dispose();
    },
  };

  return env;
}

// =============================================================================
// Leve (SVG + DOM)
// =============================================================================

// Estilos da carta leve, aplicados pelo próprio módulo (uma vez).
const ESTILO_LEVE = `
.carta-leve {
  position: absolute;
  left: 50%;
  top: 50%;
  width: min(72vw, 400px);
  margin: calc(min(72vw, 400px) * -0.35) 0 0 calc(min(72vw, 400px) * -0.5);
  filter: drop-shadow(0 18px 28px rgba(42, 27, 34, 0.12));
}
.carta-leve-desenho { position: relative; width: 100%; height: auto; overflow: visible; }
.carta-leve-papel {
  position: absolute;
  left: 6%; right: 6%;
  top: 8%;
  height: 84%;
  background: var(--papel);
  border: 1px solid var(--papel-linha);
  visibility: hidden;
}
.carta-leve-papel-solto {
  position: fixed;
  right: auto;
  margin: 0;
  border: 0;
  z-index: calc(var(--z-pergaminho) - 1);
}
`;

function garantirEstiloLeve() {
  if (document.getElementById('estilo-carta-leve')) return;
  const estilo = document.createElement('style');
  estilo.id = 'estilo-carta-leve';
  estilo.textContent = ESTILO_LEVE;
  document.head.append(estilo);
}

const MARCAS = {
  coracao: '<path d="M0 9C-13 0-9-12 0-5 9-12 13 0 0 9z" fill="#8a0c2a"/>',
  estrela: '<path d="M0-11 3.2-3.6 11-3.4 4.8 1.6 7 9.4 0 4.9-7 9.4-4.8 1.6-11-3.4-3.2-3.6z" fill="#8a0c2a"/>',
};

function criarEnvelopeLeve(mundo, { lacre = 'coracao', amarracao = 'cordao', chegada = 2 }) {
  const gsap = window.gsap;
  const recipiente = mundo.recipienteLeve;
  garantirEstiloLeve();

  const cordao = amarracao === 'fio'
    ? '<g class="cl-amarra"><path d="M0 138H360M180 138V250" stroke="#d7192d" stroke-width="3" fill="none"/></g>'
    : '<g class="cl-amarra"><path d="M0 138H360M180 0V250" stroke="#d7192d" stroke-width="5" fill="none"/></g>';
  const selo = lacre
    ? `<g class="cl-lacre" transform="translate(180 138)"><circle r="30" fill="#b3123a"/>${MARCAS[lacre] ? `<g transform="scale(1.5)">${MARCAS[lacre]}</g>` : ''}</g>`
    : '';

  const desenho = svg(`
    <svg class="carta-leve-desenho" viewBox="-4 -4 368 258" aria-hidden="true">
      <rect class="cl-corpo" x="0" y="0" width="360" height="250" rx="4" fill="#f1e8d8" stroke="#cbbda3" stroke-width="2"/>
      <path class="cl-aba" d="M0 0H360L180 150z" fill="#e7dcc8" stroke="#cbbda3" stroke-width="2" stroke-linejoin="round"/>
      ${cordao}
      ${selo}
    </svg>`);
  const papel = el('div', 'carta-leve-papel');
  const carta = el('div', 'carta-leve', [papel, desenho]);
  recipiente.append(carta);

  if (gsap) {
    gsap.fromTo(carta,
      { autoAlpha: 0, scale: 0.55, yPercent: -6 },
      { autoAlpha: 1, scale: 1, yPercent: 0, duration: Math.max(0.8, chegada), ease: curvas.branco.entrar });
  }

  const env = {
    grupo: objetoLeve(),
    papel,

    atualizar(dt, t) {
      if (mundo.amb.reduzido || !gsap) return;
      desenho.style.transform = `translateY(${(Math.sin(t * 0.9) * 5).toFixed(2)}px) rotate(${(Math.sin(t * 0.6 + 1.3) * 1.2).toFixed(2)}deg)`;
    },

    acertou(xNdc, yNdc) {
      const r = carta.getBoundingClientRect();
      const x = (xNdc * 0.5 + 0.5) * innerWidth;
      const y = (-yNdc * 0.5 + 0.5) * innerHeight;
      const folga = 28;
      return x >= r.left - folga && x <= r.right + folga && y >= r.top - folga && y <= r.bottom + folga;
    },

    get ancoraFio() {
      const r = carta.getBoundingClientRect();
      const v = vetorLeve(0, 0, 0);
      v.px = r.left + r.width / 2;
      v.py = r.bottom;
      return v;
    },

    abrir() {
      const r = carta.getBoundingClientRect();
      mundo.petalas.rajada({ px: r.left + r.width / 2, py: r.top + r.height * 0.55 }, 12);
      const tl = gsap.timeline();
      const alvoLacre = desenho.querySelector('.cl-lacre');
      if (alvoLacre) tl.to(alvoLacre, { scale: 0, autoAlpha: 0, transformOrigin: '50% 50%', duration: 0.5, ease: curvas.branco.sair }, 0);
      tl.to(desenho.querySelector('.cl-amarra'), { autoAlpha: 0, duration: 0.5, ease: 'none' }, 0.2)
        .to(desenho.querySelector('.cl-aba'), { scaleY: -0.7, transformOrigin: '50% 0%', duration: 0.9, ease: curvas.branco.entrar }, 0.5)
        .fromTo(papel, { autoAlpha: 0, yPercent: 0 }, { autoAlpha: 1, yPercent: -55, duration: 0.9, ease: curvas.branco.entrar }, 0.9);
      return comoPromise(tl).then(() => ({ papel }));
    },

    entregarPapel(rect) {
      // O papel sai da carta e vira um retângulo fixo que cresce até o DOMRect pedido.
      const de = papel.getBoundingClientRect();
      document.body.append(papel);
      papel.classList.add('carta-leve-papel-solto');
      gsap.set(papel, { clearProps: 'transform' });
      gsap.set(papel, { left: de.left, top: de.top, width: de.width, height: de.height, autoAlpha: 1 });
      return comoPromise(gsap.to(papel, {
        left: rect.left, top: rect.top, width: rect.width, height: rect.height,
        duration: mundo.amb.reduzido ? 0.6 : 1.3,
        ease: curvas.branco.entrar,
      }));
    },

    irEmbora() {
      return comoPromise(gsap.to(carta, { autoAlpha: 0, scale: 0.6, yPercent: -12, duration: 1.4, ease: curvas.branco.sair }));
    },

    dispose() {
      carta.remove();
      papel.remove();
    },
  };

  // `papel.visible = false` funciona nos dois modos.
  Object.defineProperty(papel, 'visible', {
    configurable: true,
    get() { return papel.style.visibility !== 'hidden'; },
    set(v) { papel.style.visibility = v ? '' : 'hidden'; },
  });

  return env;
}
