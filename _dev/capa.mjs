// Gera a prévia do link (assets/images/og-capa.jpg, 1200×630, JPEG ≤ 200 KB)
// a partir do próprio site: o envelope em pé, com o cordão e o lacre de coração,
// parado no mundo branco com as pétalas. Sem texto e sem nada que entregue a surpresa.
//
//   node _dev/capa.mjs                      gera a capa
//   node _dev/capa.mjs --motor webkit       outro motor
//   node _dev/capa.mjs --espera 2500        ms depois de a carta parar (pétalas e flutuação)
//   node _dev/capa.mjs --ponteiro 0.85,0.2  onde o ponteiro descansa (a carta inclina para lá)
//   node _dev/capa.mjs --perto 0.85         aproxima a carta da câmera (fator da distância)
//   node _dev/capa.mjs --saida output/capa/teste.jpg   grava em outro lugar (para comparar)
//
// A dica ("Toque na carta.") e o mini seletor são escondidos por CSS injetado só
// nesta captura; o site não muda.

import { writeFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { abrir, RAIZ } from './lib.mjs';

const LARGURA = 1200;
const ALTURA = 630;
const LIMITE = 200 * 1024;

function argumento(nome, padrao) {
  const i = process.argv.indexOf(`--${nome}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : padrao;
}

const motor = argumento('motor', 'chromium');
const esperaMs = Number(argumento('espera', 3000));
// Onde o ponteiro descansa (fração da tela): a carta inclina um pouco na direção dele.
const [px, py] = argumento('ponteiro', '0.85,0.2').split(',').map(Number);
// Fator da distância até a câmera (< 1 aproxima a carta).
const perto = Number(argumento('perto', 0.85));
const saida = path.resolve(RAIZ, argumento('saida', 'assets/images/og-capa.jpg'));

const CSS_CAPTURA = `
  #dica, #mini, #frases, #acoes { display: none !important; visibility: hidden !important; }
  * { cursor: none !important; }
`;

const s = await abrir({
  cena: 'inicio',
  vp: 'desktop',
  motor,
  params: { rapido: 4, mudo: 1, nivel: 'alto' },
  preparar: async (page) => {
    await page.setViewportSize({ width: LARGURA, height: ALTURA });
    await page.addInitScript((css) => {
      const aplicar = () => {
        const estilo = document.createElement('style');
        estilo.textContent = css;
        document.head.appendChild(estilo);
      };
      if (document.head) aplicar();
      else document.addEventListener('DOMContentLoaded', aplicar, { once: true });
    }, CSS_CAPTURA);
  },
});

try {
  await s.esperarEtapa('inicio:carta-espera', 90000);
  await s.page.mouse.move(LARGURA * px, ALTURA * py, { steps: 12 });
  if (perto !== 1) {
    await s.page.evaluate((k) => {
      const { mundo, estado } = window.__carta.ctx;
      const env = estado.envelope;
      if (!mundo.ok || !env) return;
      const olho = new mundo.THREE.Vector3();
      mundo.camera.getWorldPosition(olho);
      env.grupo.position.sub(olho).multiplyScalar(k).add(olho);
    }, perto);
  }
  // Sem aceleração daqui em diante: as pétalas caem no ritmo de verdade e a carta assenta.
  await s.page.evaluate(() => { window.gsap?.globalTimeline.timeScale(1); });
  await s.pausa(esperaMs);
  // A inclinação também desloca a carta: recentraliza (o recorte quadrado do WhatsApp pega o meio).
  for (let i = 0; i < 3; i++) {
    await s.page.evaluate(({ ax, ay }) => {
      const { mundo, estado } = window.__carta.ctx;
      const env = estado.envelope;
      if (!mundo.ok || !env) return;
      const { THREE, camera } = mundo;
      const caixa = new THREE.Box3().setFromObject(env.grupo);
      const centro = caixa.getCenter(new THREE.Vector3());
      const tela = mundo.mundoParaTela(centro);
      const olho = camera.getWorldPosition(new THREE.Vector3());
      const prof = Math.abs(centro.z - olho.z);
      const mpp = (2 * prof * Math.tan((camera.fov * Math.PI) / 360)) / innerHeight;
      env.grupo.position.x -= (tela.x - innerWidth * ax) * mpp;
      env.grupo.position.y += (tela.y - innerHeight * ay) * mpp;
    }, { ax: 0.5, ay: Number(argumento('centroY', 0.49)) });
    await s.pausa(250);
  }
  await s.pausa(400);

  await mkdir(path.dirname(saida), { recursive: true });
  let qualidade = 90;
  let dados;
  do {
    dados = await s.page.screenshot({ type: 'jpeg', quality: qualidade, scale: 'css' });
    qualidade -= 4;
  } while (dados.length > LIMITE && qualidade >= 50);
  await writeFile(saida, dados);
  const { size } = await stat(saida);
  console.log(`capa: ${path.relative(RAIZ, saida)} ${LARGURA}×${ALTURA}, ${(size / 1024).toFixed(1)} KB, qualidade ${qualidade + 4}`);
  if (s.erros.length) console.log('erros:', s.erros);
} finally {
  await s.fechar();
}
