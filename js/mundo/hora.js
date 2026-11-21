// A hora do dia: a alameda amanhece com a primeira carta e anoitece com a última.
//
// Um ponto de controle só. A hora é uma posição numa linha:
//
//   0 manha → 1 dia → 2 entardecer → 3 crepusculo → 4 noite
//
// e tudo o que muda com ela (a luz, a névoa e o céu da alameda 3D, as pétalas,
// as camadas sobre a imagem no modo sem WebGL, o cometa, a cor das frases) é
// lido dessa posição. Ir de uma hora a outra é andar pela linha, devagar: passa
// pelas horas do meio, nunca salta.
//
//   mundo.hora()                         → nome da hora mais próxima ('manha'…'noite')
//   mundo.hora('noite', { duracao: 12 }) → Promise (duracao em segundos; 0 = já)
//   mundo.hora(2.5, { duracao })         → aceita a posição direto (entre duas horas)
//
// Quem manda é o roteiro: ligarHora({ mundo, diretor, amb }) (uma linha no
// main.js) ouve o diretor e leva cada cena:etapa à sua hora (o mapa ROTEIRO, aqui
// embaixo). As cenas não chamam nada. Entrar por atalho (?cena=…) já começa na
// hora daquela cena.
//
// Para o CSS: <html data-hora="manha|dia|entardecer|crepusculo|noite"> (a hora
// mais próxima da posição de agora; só muda quando a hora troca, nunca a cada
// quadro). À noite as frases e os botões do mundo ficam claros (css/mundo.css);
// qualquer cena pode usar html[data-hora="noite"] no próprio CSS.

import { clamp, lerp } from '../nucleo/util.js';

export const HORAS = ['manha', 'dia', 'entardecer', 'crepusculo', 'noite'];

// O que cada hora é. Cores em sRGB 0..1 (os shaders da alameda trabalham nesse espaço).
//   nevoa: a cor do fundo do túnel      ceu: a cor do alto
//   luz:   multiplica a cor de tudo     tarde: 0..1, o escuro da figura dele (js/mundo/ele.js)
//   noite: 0..1, estrelas e cometa      dens: densidade da névoa (× a do nível)
//   petalas: luz das pétalas vermelhas da frente
const PALETA = [
  { nevoa: [0.925, 0.878, 0.902], ceu: [0.972, 0.962, 0.968], luz: [1.0, 1.0, 1.0], tarde: 0, noite: 0, dens: 1, petalas: [1, 1, 1] },
  { nevoa: [0.950, 0.915, 0.895], ceu: [0.905, 0.945, 0.985], luz: [1.06, 1.03, 0.97], tarde: 0, noite: 0, dens: 0.92, petalas: [1, 1, 1] },
  { nevoa: [0.760, 0.560, 0.575], ceu: [0.640, 0.500, 0.680], luz: [0.80, 0.615, 0.63], tarde: 0.55, noite: 0, dens: 1, petalas: [0.95, 0.84, 0.86] },
  { nevoa: [0.500, 0.440, 0.580], ceu: [0.390, 0.350, 0.550], luz: [0.50, 0.47, 0.66], tarde: 0.93, noite: 0.12, dens: 1, petalas: [0.78, 0.72, 0.86] },
  { nevoa: [0.095, 0.125, 0.255], ceu: [0.022, 0.036, 0.105], luz: [0.30, 0.37, 0.60], tarde: 1, noite: 1, dens: 1.08, petalas: [0.52, 0.5, 0.74] },
];

// O roteiro: cena → hora (e, por etapa, 'cena:etapa' → hora). `s` é quanto a
// passagem demora, em segundos. Vale a chave mais específica.
const ROTEIRO = {
  senha: { hora: 'manha', s: 0 },
  musica: { hora: 'manha', s: 0 },
  inicio: { hora: 'manha', s: 4 },
  poppy: { hora: 'manha', s: 4 },
  'poppy:guardando': { hora: 0.5, s: 6 },          // a manhã já vai alta quando ela guarda a primeira carta
  carta2: { hora: 'dia', s: 9 },
  yourname: { hora: 'dia', s: 4 },
  'yourname:enrolando': { hora: 1.5, s: 5 },       // a tarde começa a cair enquanto ela guarda a segunda
  'yourname:guardando': { hora: 1.5, s: 5 },
  mao: { hora: 'entardecer', s: 3.4 },
  'mao:correndo': { hora: 'crepusculo', s: 'corrida' },   // entardece correndo
  cartas: { hora: 'crepusculo', s: 3 },
  encontro: { hora: 'crepusculo', s: 3 },
  'encontro:planos': { hora: 'noite', s: 16 },     // anoitece enquanto os quadros passam
  'encontro:maos': { hora: 'noite', s: 6 },
  'encontro:carta': { hora: 'noite', s: 3 },
  final: { hora: 'noite', s: 3 },
  menu: { hora: 'noite', s: 3 },                   // o menu do fim mora na mesma noite
};

const posicaoDe = (alvo) => {
  if (typeof alvo === 'number' && Number.isFinite(alvo)) return clamp(alvo, 0, HORAS.length - 1);
  const i = HORAS.indexOf(String(alvo));
  return i < 0 ? null : i;
};

const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

/** O estado da luz numa posição 0..4 (mistura das duas horas vizinhas). */
export function estadoDaHora(p) {
  const x = clamp(p, 0, HORAS.length - 1);
  const i = Math.min(HORAS.length - 2, Math.floor(x));
  const t = x - i;
  const a = PALETA[i]; const b = PALETA[i + 1];
  return {
    p: x,
    nevoa: mix3(a.nevoa, b.nevoa, t),
    ceu: mix3(a.ceu, b.ceu, t),
    luz: mix3(a.luz, b.luz, t),
    petalas: mix3(a.petalas, b.petalas, t),
    tarde: lerp(a.tarde, b.tarde, t),
    noite: lerp(a.noite, b.noite, t),
    dens: lerp(a.dens, b.dens, t),
  };
}

/**
 * O cometa do filme, pintado uma vez: a cabeça branca e as duas caudas que se
 * abrem, uma azul e uma rosa, mais os fragmentos que se soltam. Fundo
 * transparente; serve de textura (soma de luz) no 3D e de imagem no modo leve.
 */
export function pintarCometa(largura = 512, altura = 512) {
  const tela = document.createElement('canvas');
  tela.width = largura;
  tela.height = altura;
  const g = tela.getContext('2d');
  if (!g) return tela;
  const L = largura; const A = altura;
  g.globalCompositeOperation = 'lighter';
  // A cabeça fica embaixo, à direita; as caudas sobem para a esquerda, em arco.
  const cx = L * 0.80; const cy = A * 0.80;
  const cauda = (angulo, comprimento, curva, cor, larguraMax, forca) => {
    const N = 90;
    for (let i = 0; i < N; i++) {
      const s = i / (N - 1);                         // 0 na cabeça, 1 na ponta
      const a = angulo + curva * s * s;
      const d = comprimento * s;
      const x = cx + Math.cos(a) * d;
      const y = cy + Math.sin(a) * d;
      const r = (0.012 + larguraMax * Math.pow(s, 0.8)) * L;
      const alfa = forca * Math.pow(1 - s, 1.5) * (0.16 + 0.3 * (1 - s));
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, `rgba(${cor}, ${alfa.toFixed(4)})`);
      grad.addColorStop(0.5, `rgba(${cor}, ${(alfa * 0.36).toFixed(4)})`);
      grad.addColorStop(1, `rgba(${cor}, 0)`);
      g.fillStyle = grad;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
  };
  const base = -Math.PI * 0.76;                      // para cima e para a esquerda
  cauda(base - 0.035, L * 0.86, -0.20, '96, 170, 255', 0.050, 1.0);     // a azul, longa
  cauda(base + 0.115, L * 0.70, 0.16, '255, 120, 190', 0.058, 0.95);    // a rosa, que se abre
  cauda(base + 0.03, L * 0.52, 0.0, '200, 225, 255', 0.016, 1.3);       // o miolo claro
  // fragmentos que se soltam entre as duas caudas
  let semente = 7;
  const sorte = () => { semente = (semente * 16807) % 2147483647; return semente / 2147483647; };
  for (let i = 0; i < 46; i++) {
    const s = 0.08 + sorte() * 0.8;
    const a = base - 0.1 + sorte() * 0.3;
    const x = cx + Math.cos(a) * L * 0.8 * s;
    const y = cy + Math.sin(a) * L * 0.8 * s;
    const r = (0.4 + sorte() * 0.9) * (L / 512) * (1.4 - s);
    const grad = g.createRadialGradient(x, y, 0, x, y, r * 3);
    const cor = sorte() < 0.5 ? '190, 220, 255' : '255, 200, 228';
    grad.addColorStop(0, `rgba(${cor}, ${(0.55 * (1 - s * 0.7)).toFixed(3)})`);
    grad.addColorStop(1, `rgba(${cor}, 0)`);
    g.fillStyle = grad;
    g.fillRect(x - r * 3, y - r * 3, r * 6, r * 6);
  }
  // a cabeça: um clarão branco-azulado com o centro estourado
  const halo = g.createRadialGradient(cx, cy, 0, cx, cy, L * 0.13);
  halo.addColorStop(0, 'rgba(255, 255, 255, 1)');
  halo.addColorStop(0.1, 'rgba(225, 240, 255, 0.9)');
  halo.addColorStop(0.32, 'rgba(140, 190, 255, 0.3)');
  halo.addColorStop(1, 'rgba(120, 160, 255, 0)');
  g.fillStyle = halo;
  g.fillRect(cx - L * 0.13, cy - L * 0.13, L * 0.26, L * 0.26);
  return tela;
}

/**
 * Cria mundo.hora. `aplicar(estado)` é chamado a cada passo da passagem (o
 * mundo 3D e o leve escrevem cada um o seu). Devolve a função.
 */
export function criarHora(mundo, amb, aplicar) {
  const raiz = document.documentElement;
  const atual = { p: 0 };
  let tween = null;
  let nomeAtual = '';

  function pintar() {
    const e = estadoDaHora(atual.p);
    const nome = HORAS[Math.round(e.p)];
    if (nome !== nomeAtual) { nomeAtual = nome; raiz.dataset.hora = nome; }
    try { aplicar(e); } catch (erro) { console.error('[carta] hora', erro); }
  }

  function hora(alvo, { duracao = 4 } = {}) {
    if (alvo === undefined) return HORAS[Math.round(atual.p)];
    const p = posicaoDe(alvo);
    if (p === null) return Promise.resolve();
    const gsap = window.gsap;
    if (tween) { tween.kill(); tween = null; }
    if (!gsap || !(duracao > 0) || Math.abs(p - atual.p) < 1e-4) {
      atual.p = p;
      pintar();
      return Promise.resolve();
    }
    return new Promise((resolver) => {
      tween = gsap.to(atual, { p, duration: duracao, ease: 'sine.inOut', onUpdate: pintar, onComplete: resolver, onInterrupt: resolver });
    });
  }

  mundo.hora = hora;
  pintar();
  return hora;
}

/** Liga a hora ao roteiro: cada cena:etapa leva o mundo à sua hora. */
export function ligarHora({ mundo, diretor, amb }) {
  if (!mundo || typeof mundo.hora !== 'function' || !diretor) return;
  const corrida = () => clamp(Number(window.CONTEUDO?.corrida?.segundos) || 7, 5, 10) * 0.92;
  const para = (cena, etapa) => ROTEIRO[`${cena}:${etapa}`] || ROTEIRO[cena] || null;
  // Atalho (?cena=…): já nasce na hora daquela cena.
  const primeira = para(diretor.cenaInicial(), '');
  if (primeira) mundo.hora(primeira.hora, { duracao: 0 });
  let ultimo = primeira;
  diretor.aoMudar((cena, etapa) => {
    const r = para(cena, etapa);
    if (!r || r === ultimo) return;
    ultimo = r;
    let s = r.s === 'corrida' ? corrida() : r.s;
    if (amb?.reduzido) s = Math.min(s, 2.4);          // movimento reduzido: uma dissolvência curta
    mundo.hora(r.hora, { duracao: s });
  });
}
