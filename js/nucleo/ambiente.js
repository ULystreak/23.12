/* ============================================================================
   AMBIENTE: o que o aparelho é e o que o endereço pede
   ============================================================================
   Devolve `amb`, o contrato que atravessa o site: webgl, nivel, reduzido,
   toque, ios, dprMax, rapido, android, mudo, forcado, params. Também marca
   <html> com as classes `reduzido` e `sem-webgl` e com `data-nivel`, que o CSS lê.

   Parâmetros de teste no endereço:
     ?nivel=alto|medio|baixo   força a qualidade (e desliga a adaptação)
     ?webgl=0                  versão leve, sem o mundo 3D
     ?reduzido=1 | =0          liga ou desliga o movimento reduzido
     ?rapido=N                 tudo N vezes mais rápido (0,1 a 60)
     ?mudo=1                   sem som (quem silencia é som.js)
   ========================================================================== */

const NIVEIS = ['baixo', 'medio', 'alto'];
// Regra 9 do contrato: DPR máximo 2 (1,5 no nível médio, 1 no baixo).
const DPR_POR_NIVEL = { alto: 2, medio: 1.5, baixo: 1 };

function temWebGL() {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return false;
    // O iOS aceita poucos contextos vivos: o de teste é devolvido na hora.
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}

function nivelPorHeuristica({ ios, android, toque, reduzido }) {
  if (reduzido) return 'medio';
  const nucleos = navigator.hardwareConcurrency || 4;
  const memoria = navigator.deviceMemory || 4; // o Safari e o Firefox não informam
  const ladoMenor = Math.min(screen?.width || 390, screen?.height || 844);
  if (ios) {
    // iPhones dos últimos anos sobram; só os bem pequenos/antigos ficam no médio.
    return ladoMenor <= 375 && (window.devicePixelRatio || 2) <= 2 ? 'medio' : 'alto';
  }
  if (android || toque) {
    if (nucleos <= 4 || memoria <= 2) return 'baixo';
    if (nucleos <= 6 || memoria <= 4) return 'medio';
    return 'alto';
  }
  if (nucleos <= 2 || memoria <= 2) return 'baixo';
  if (nucleos <= 4) return 'medio';
  return 'alto';
}

export function detectarAmbiente() {
  const params = new URLSearchParams(location.search);
  const ua = navigator.userAgent || '';
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const android = /Android/i.test(ua);
  const toque = (window.matchMedia?.('(pointer: coarse)').matches) || navigator.maxTouchPoints > 0 || 'ontouchstart' in window;
  const pedeReduzido = params.get('reduzido');
  const reduzido = pedeReduzido === '1' || (pedeReduzido !== '0' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  const webgl = params.get('webgl') === '0' ? false : temWebGL();
  const forcado = NIVEIS.includes(params.get('nivel'));
  const nivel = forcado ? params.get('nivel') : nivelPorHeuristica({ ios, android, toque, reduzido });
  const r = Number(params.get('rapido'));
  const rapido = Number.isFinite(r) && r > 0 ? Math.min(60, Math.max(0.1, r)) : 1;

  const amb = {
    webgl,
    nivel,
    reduzido,
    toque,
    ios,
    dprMax: DPR_POR_NIVEL[nivel],
    rapido,
    android,
    mudo: params.get('mudo') === '1',
    forcado,
    params,
  };

  const raiz = document.documentElement;
  raiz.classList.toggle('reduzido', reduzido);
  raiz.classList.toggle('sem-webgl', !webgl);
  raiz.dataset.nivel = nivel;
  return amb;
}

/** Desce um degrau de qualidade. Devolve o nível novo, ou null se já está no piso. */
export function baixarNivel(amb) {
  const i = NIVEIS.indexOf(amb.nivel);
  if (i <= 0) return null;
  amb.nivel = NIVEIS[i - 1];
  amb.dprMax = DPR_POR_NIVEL[amb.nivel];
  document.documentElement.dataset.nivel = amb.nivel;
  return amb.nivel;
}
