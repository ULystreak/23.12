// Pétalas que fogem do dedo: nas esperas em que ela só caminha, soltar o dedo no
// mundo faz um punhado de pétalas sair voando do ponto do chão que ela tocou.
//
//   ligarToque(ctx)      uma linha no main.js
//
// Só nas etapas em que nada pede o toque dela: as frases, a caminhada e a carta
// chegando (inicio e carta2) e as cartas do chão pousando. Nunca em carta-espera
// (o toque abre a carta), na corrida, no encontro nem no fim; nunca sobre botão ou
// link, com a bolsa, um visor, o mini ou a folha aberta, nem relendo. Mouse: só o clique
// (apertar e soltar o botão), nunca o passar por cima.
// Com WebGL o dedo é projetado no chão: as pétalas sobem de onde ela tocou, na
// profundidade certa; tocar acima do horizonte (ou longe, já na névoa) não faz
// nada. Sem WebGL, a rajada leve sai do próprio ponto da tela, também só da metade
// de baixo (o chão da foto). No movimento reduzido a própria rajada já sai com 2
// pétalas, mais calmas.

import { pxParaNdc } from '../nucleo/util.js';

const ETAPAS = new Set([
  'inicio:frases', 'inicio:caminhada', 'inicio:carta-chegando',
  'carta2:caminhada', 'carta2:carta-chegando', 'cartas:pousando',
]);
const PETALAS = 5;
const CHAO = 0.05;           // m: o plano onde o dedo pousa
const LONGE = 9;             // m: dali em diante as pétalas já somem na névoa
const HORIZONTE_LEVE = 0.55; // sem WebGL: fração da altura da tela onde a foto vira chão
const INTERATIVO = 'a, button, input, textarea, select, label, [role="button"], [data-acao], #mini, #inventario';

export function ligarToque({ mundo, inventario, pergaminho }) {
  const raiz = document.documentElement;
  let aperto = null;         // o pointerId do aperto que vale

  const livre = (e) => ETAPAS.has(`${raiz.dataset.cena}:${raiz.dataset.etapa}`)
    && !raiz.classList.contains('relendo')
    && !inventario?.aberto
    && (pergaminho?.estado || 'oculto') === 'oculto'
    && !document.querySelector('.carta-chao-visor, #voz[data-aberto], #mini[data-aberto]')
    && !(e.target instanceof Element && e.target.closest(INTERATIVO));

  function soltar(e) {
    const petalas = mundo.petalas;
    if (!mundo.ok) {
      if (e.clientY > mundo.tamanho.altura * HORIZONTE_LEVE) petalas?.rajada?.({ px: e.clientX, py: e.clientY }, PETALAS);
      return;
    }
    // O raio do olho até o dedo, prolongado até o chão.
    const ndc = pxParaNdc(e.clientX, e.clientY, mundo.tamanho.largura, mundo.tamanho.altura);
    const raio = mundo.telaParaMundo(ndc.x, ndc.y, 1);
    const olho = mundo.camera.getWorldPosition(new mundo.THREE.Vector3());
    raio.sub(olho);
    if (raio.y > -1e-3) return;                            // acima do horizonte
    const t = (CHAO - olho.y) / raio.y;
    if (t * raio.length() > LONGE) return;
    petalas?.rajada?.(olho.addScaledVector(raio, t), PETALAS);
  }

  const passivo = { passive: true };
  // Na captura: vê a bolsa, o visor e o mini ainda abertos, antes que este toque os feche.
  window.addEventListener('pointerdown', (e) => {
    aperto = e.isPrimary && e.button === 0 && livre(e) ? e.pointerId : null;
  }, { passive: true, capture: true });
  window.addEventListener('pointercancel', () => { aperto = null; }, passivo);
  window.addEventListener('pointerup', (e) => {
    if (e.pointerId !== aperto) return;
    aperto = null;
    if (livre(e)) soltar(e);
  }, passivo);
}
