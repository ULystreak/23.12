// Ambiente: o que este aparelho consegue fazer.
//
// detectarAmbiente() devolve o objeto `amb` do contrato (_dev/DIRECAO.md, 4.2):
//   { webgl, nivel, reduzido, toque, ios, dprMax, rapido }
// mais alguns campos de apoio: android, mudo, forcado, params.
//
// Parâmetros de teste no endereço:
//   ?nivel=alto|medio|baixo   força o nível (e desliga a qualidade adaptativa)
//   ?webgl=0                  finge que não há WebGL (modo leve)
//   ?reduzido=1               força movimento reduzido
//   ?rapido=N                 acelera GSAP, espera() e a caminhada N vezes
//   ?mudo=1                   desliga todo o som

const NIVEIS = ['baixo', 'medio', 'alto'];

/** DPR máximo de cada nível (regra 9 do contrato). */
const DPR_POR_NIVEL = { alto: 2, medio: 1.5, baixo: 1 };

function temWebGL() {
  try {
    const tela = document.createElement('canvas');
    const gl = tela.getContext('webgl2') || tela.getContext('webgl');
    if (!gl) return false;
    // Devolve o contexto de teste na hora: o iOS aceita poucos contextos vivos.
    const perder = gl.getExtension('WEBGL_lose_context');
    if (perder) perder.loseContext();
    return true;
  } catch {
    return false;
  }
}

function nivelPorHeuristica({ ios, android, toque, reduzido }) {
  const nucleos = navigator.hardwareConcurrency || 4;
  const memoria = navigator.deviceMemory || 4; // o Safari e o Firefox não informam
  const ladoMenor = Math.min(screen.width || 390, screen.height || 844);

  if (reduzido) return 'medio';

  if (ios) {
    // iPhones dos últimos anos sobram; só os bem pequenos/antigos ficam no médio.
    return ladoMenor <= 375 && (window.devicePixelRatio || 2) <= 2 ? 'medio' : 'alto';
  }

  if (android || toque) {
    if (nucleos <= 4 || memoria <= 2) return 'baixo';
    if (nucleos <= 6 || memoria <= 4) return 'medio';
    return 'alto';
  }

  // Computador
  if (nucleos <= 2 || memoria <= 2) return 'baixo';
  if (nucleos <= 4) return 'medio';
  return 'alto';
}

export function detectarAmbiente() {
  const params = new URLSearchParams(location.search);
  const ua = navigator.userAgent || '';

  const ios = /iPad|iPhone|iPod/.test(ua)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPadOS se apresenta como Mac
  const android = /Android/i.test(ua);
  const toque = (window.matchMedia && matchMedia('(pointer: coarse)').matches)
    || navigator.maxTouchPoints > 0
    || 'ontouchstart' in window;

  const reduzido = params.get('reduzido') === '1'
    || (params.get('reduzido') !== '0'
      && !!window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

  const webgl = params.get('webgl') === '0' ? false : temWebGL();

  const nivelPedido = params.get('nivel');
  const forcado = NIVEIS.includes(nivelPedido);
  const nivel = forcado ? nivelPedido : nivelPorHeuristica({ ios, android, toque, reduzido });

  const rapidoPedido = Number(params.get('rapido'));
  const rapido = Number.isFinite(rapidoPedido) && rapidoPedido > 0
    ? Math.min(Math.max(rapidoPedido, 0.1), 60)
    : 1;

  const amb = {
    webgl,
    nivel,
    reduzido,
    toque,
    ios,
    dprMax: DPR_POR_NIVEL[nivel],
    rapido,
    // apoio
    android,
    mudo: params.get('mudo') === '1',
    forcado,          // true quando ?nivel= veio no endereço: a qualidade não se adapta
    params,
  };

  // O CSS enxerga o ambiente por classes (reduzido, sem-webgl) e pelo data-nivel no <html>.
  const raiz = document.documentElement;
  raiz.classList.toggle('reduzido', reduzido);
  raiz.classList.toggle('sem-webgl', !webgl);
  raiz.dataset.nivel = nivel;

  return amb;
}

/** Desce um degrau de nível. Devolve o novo nível, ou null se já estava no mais baixo. */
export function baixarNivel(amb) {
  const i = NIVEIS.indexOf(amb.nivel);
  if (i <= 0) return null;
  amb.nivel = NIVEIS[i - 1];
  amb.dprMax = DPR_POR_NIVEL[amb.nivel];
  document.documentElement.dataset.nivel = amb.nivel;
  return amb.nivel;
}
