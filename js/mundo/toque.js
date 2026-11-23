/* ============================================================================
   TOQUE: pétalas e vaga-lumes que fogem do dedo
   ============================================================================
   Só nas etapas em que nada pede o toque dela: as frases, a caminhada e a carta
   chegando (inicio e carta2) e as cartas do chão pousando. Nunca em
   carta-espera (o toque abre a carta), na corrida, no encontro nem no fim.
   Nunca sobre botão ou link, com a bolsa, um visor, o mini ou a folha aberta,
   nem relendo. Com o mouse, só o clique conta; passar por cima não faz nada.

   Enquanto o dedo está no mundo, as pétalas no ar e os vaga-lumes abrem
   caminho em volta dele, devagar, e voltam sem pressa quando ele sai
   (petalas.fugir). Soltar o dedo ainda solta cinco pétalas do ponto tocado
   (no movimento reduzido a própria rajada solta menos e a fuga é mais curta).
   Com WebGL, o raio do olho até o dedo cruza o plano do dedo, rente ao chão, e
   a rajada nasce ali; tocar acima do horizonte, ou longe, já na névoa, não
   solta nada. Sem WebGL, a rajada nasce do próprio ponto da tela, só nos 45%
   de baixo, e não há fuga.
   ========================================================================== */

import { pxParaNdc } from '../nucleo/util.js';

// `cena:etapa`, como o diretor publica em <html data-cena data-etapa>.
const ETAPAS = new Set([
  'inicio:frases', 'inicio:caminhada', 'inicio:carta-chegando',
  'carta2:caminhada', 'carta2:carta-chegando', 'cartas:pousando',
]);
const PETALAS = 5;
// O plano do dedo, um pouco acima das pétalas caídas (y = 0,012 m).
const CHAO = 0.05;
const LONGE = 9; // m: além disso a pétala já some na névoa
const HORIZONTE_LEVE = 0.55; // sem WebGL, só abaixo desta fração da altura
const INTERATIVO = 'a, button, input, textarea, select, label, [role="button"], [data-acao], #mini, #inventario';

/** Liga as pétalas ao dedo. Recebe o ctx (usa mundo, inventario e pergaminho). */
export function ligarToque({ mundo, inventario, pergaminho }) {
  if (!mundo) return;
  const raiz = document.documentElement;
  // O pointerId do toque que vale; um só por vez.
  let aperto = null;

  const livre = (e) => ETAPAS.has(`${raiz.dataset.cena}:${raiz.dataset.etapa}`)
    && !raiz.classList.contains('relendo')
    && !inventario?.aberto
    && (pergaminho?.estado || 'oculto') === 'oculto'
    && !document.querySelector('.carta-chao-visor, #voz[data-aberto], #mini[data-aberto]')
    && !(e.target instanceof Element && e.target.closest(INTERATIVO));

  // Lido no toque, não na criação: as pétalas podem ainda não existir.
  function fugir(e) {
    if (!mundo.ok) return;
    mundo.petalas?.fugir?.(e ? pxParaNdc(e.clientX, e.clientY, mundo.tamanho.largura, mundo.tamanho.altura) : null);
  }

  function soltar(e) {
    const petalas = mundo.petalas;
    if (!mundo.ok) {
      if (e.clientY > mundo.tamanho.altura * HORIZONTE_LEVE) petalas?.rajada?.({ px: e.clientX, py: e.clientY }, PETALAS);
      return;
    }
    const { THREE } = mundo;
    const ndc = pxParaNdc(e.clientX, e.clientY, mundo.tamanho.largura, mundo.tamanho.altura);
    const raio = new THREE.Vector3().copy(mundo.telaParaMundo(ndc.x, ndc.y, 1));
    const olho = mundo.camera.getWorldPosition(new THREE.Vector3());
    raio.sub(olho);
    if (raio.y > -1e-3) return; // olhar no horizonte ou para cima
    const t = (CHAO - olho.y) / raio.y;
    if (t * raio.length() > LONGE) return;
    petalas?.rajada?.(olho.addScaledVector(raio, t), PETALAS);
  }

  function largar() {
    aperto = null;
    fugir(null);
  }

  const passivo = { passive: true };
  // Na captura: vê a bolsa, o visor e o mini ainda abertos, antes que este mesmo toque os feche.
  window.addEventListener('pointerdown', (e) => {
    aperto = e.isPrimary && e.button === 0 && livre(e) ? e.pointerId : null;
    if (aperto !== null) fugir(e);
  }, { passive: true, capture: true });
  // O dedo arrastando leva a fuga junto; se a cena mudou no meio, ela termina.
  window.addEventListener('pointermove', (e) => {
    if (e.pointerId !== aperto) return;
    if (livre(e)) fugir(e);
    else largar();
  }, passivo);
  // Sem isto o aperto poderia ficar preso a um dedo que o sistema cancelou.
  window.addEventListener('pointercancel', (e) => {
    if (e.pointerId === aperto) largar();
  }, passivo);
  // `livre` vale de novo ao soltar: se a cena mudou no meio do toque, nada sai.
  window.addEventListener('pointerup', (e) => {
    if (e.pointerId !== aperto) return;
    largar();
    if (livre(e)) soltar(e);
  }, passivo);
}
