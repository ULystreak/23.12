/* ============================================================================
   ABERTURA: as primeiras frases na noite
   ============================================================================
   As pétalas começam a cair, as frases de abertura.frases aparecem palavra por
   palavra, como se acendessem (cada palavra nasce em ouro claro e assenta no
   luar, com um halo anil por cima das pétalas), e cada uma sai levada pelo
   vento, para o lado em que as pétalas caem. Na primeira frase toca, uma vez por página, a voz dele (vozArquivo),
   se o arquivo já chegou. cenaAbertura resolve quando a última frase acabou de
   aparecer: a saída dela continua agendada e a carta começa com a frase ainda
   na tela. A caminhada até a carta é de cenaCarta (js/cenas/carta.js).

   aquecerAbertura prepara a primeira carta (tema poppy) e o programa das
   pétalas soltas, uma vez por página; a tela preta a chama antes de os olhos
   abrirem.
   ========================================================================== */

import { el, espera, quadro } from '../nucleo/util.js';
import { curvas, comoPromise, revelarPalavras } from '../nucleo/movimento.js';

// Noite parada antes de tudo; só no atalho ?cena=inicio (vindo do preto, a carta já aqueceu).
const SILENCIO = 1000;
// A câmera começa com foco perto e assenta no mundo quando a primeira palavra aparece.
const FOCO_DO_COMECO = 1.1;
const FOCO_DO_MUNDO = 3;
// Entre uma frase começar a sair e a seguinte começar a aparecer.
const ENTRE_FRASES = 1150;

let aquecimento = null;
let falou = false;

const tempoDeLer = (texto) => 1250 + texto.length * 28;

// O halo anil vai na própria palavra: ganha das auras do mundo e mantém o luar
// legível quando uma pétala ou uma lanterna passa atrás.
const HALO = '0 0 0.2em rgba(6, 9, 22, 0.85), 0 0 0.7em rgba(6, 9, 22, 0.7), 0 0 1.5em rgba(11, 16, 38, 0.5)';

/** Cada palavra nasce em ouro claro, junto com a subida de revelarPalavras, e esfria até o luar. */
function acenderPalavras(frase, amb) {
  const gsap = window.gsap;
  const palavras = frase._pedacos?.palavras || [];
  if (!gsap || !palavras.length) return;
  gsap.set(palavras, { textShadow: HALO });
  if (amb?.reduzido) return;
  const raiz = getComputedStyle(document.documentElement);
  const ouro = raiz.getPropertyValue('--ouro-claro').trim();
  const luar = getComputedStyle(frase).color;
  if (!ouro || !luar) return;
  gsap.fromTo(palavras, { color: ouro }, { color: luar, duration: 2.4, stagger: 0.15, ease: 'sine.inOut', clearProps: 'color' });
}

/** Prepara a primeira carta e as pétalas soltas, uma vez por página. Nunca rejeita. */
export function aquecerAbertura(ctx) {
  // Um quadro antes: o preto já está pintado quando o trabalho pesado começa.
  // O envelope vem por import dinâmico para nunca pesar na primeira tela.
  aquecimento ||= quadro()
    .then(() => Promise.all([
      import('../mundo/envelope.js')
        .then(({ aquecerEnvelope }) => aquecerEnvelope(ctx.mundo, { tema: 'poppy', lacre: 'coracao', amarracao: 'cordao' })),
      ctx.mundo?.petalas?.preparar?.(),
    ]))
    .then(() => {})
    .catch(() => {});
  return aquecimento;
}

/** A frase sai com o vento: a palavra mais à frente (a última) vai primeiro. */
function levarPeloVento(frase, amb) {
  const gsap = window.gsap;
  if (!gsap) return Promise.resolve();
  const palavras = frase._pedacos?.palavras?.length ? frase._pedacos.palavras : [frase];
  if (amb?.reduzido) {
    return comoPromise(gsap.to(palavras, { autoAlpha: 0, duration: 0.7, ease: 'none' }));
  }
  const stagger = { each: 0.11, from: 'end' };
  const fade = { autoAlpha: 0, duration: 1.15, stagger, ease: 'power1.in' };
  if (amb?.nivel !== 'baixo') fade.filter = 'blur(9px)';
  const tl = gsap.timeline()
    .to(palavras, {
      x: (i) => `${2.1 + (i % 3) * 0.45}em`,
      y: (i) => `${0.34 + ((i * 7) % 5) * 0.11}em`,
      rotation: (i) => 3.5 + ((i * 5) % 4) * 1.8,
      duration: 1.7,
      stagger,
      ease: curvas.branco.sair,
    }, 0)
    .to(palavras, fade, 0.4);
  return comoPromise(tl);
}

export async function cenaAbertura(ctx, { frio = false } = {}) {
  const { conteudo, diretor, som, amb, recursos } = ctx;
  const petalas = ctx.mundo?.petalas;
  const calmo = !!amb?.reduzido;
  const frases = (Array.isArray(conteudo?.abertura?.frases) ? conteudo.abertura.frases : [])
    .filter((t) => typeof t === 'string' && t.trim());

  diretor.etapa('frases');
  // Vindo do preto, as pétalas que ela viu abrir os olhos continuam no ar:
  // só o atalho frio começa do zero.
  if (frio) petalas?.definirDensidade?.(0);
  petalas?.definirFoco?.(FOCO_DO_COMECO);

  const fonte = document.fonts?.load
    ? document.fonts.load('400 32px "Shippori Mincho"', frases[0] || 'a').catch(() => {})
    : null;
  const aquecer = aquecerAbertura(ctx);
  await Promise.all([
    frio ? espera(SILENCIO) : null,
    Promise.race([fonte, espera(frio ? 1800 : 700)]),
    Promise.race([aquecer, espera(frio ? 2400 : 900)]),
  ]);

  // No reduzido as pétalas já estão no ar e só aparecem; recomeçar apagaria as que ela viu.
  if (frio && !calmo) petalas?.comecar?.();
  petalas?.definirDensidade?.(0.4);
  recursos?.iniciar?.();
  diretor.aquecer?.();
  espera(2200).then(() => petalas?.definirDensidade?.(1));
  await espera(frio ? 1500 : 350);

  if (!calmo) petalas?.protagonistas?.();
  petalas?.definirFoco?.(FOCO_DO_MUNDO);
  await espera(frio ? 500 : 250);

  const palco = document.getElementById('frases');
  if (!palco) return;
  const voz = conteudo?.abertura?.vozArquivo;

  for (let i = 0; i < frases.length; i++) {
    const texto = frases[i];
    const frase = el('p', 'frase frase-abertura');
    palco.append(frase);
    if (i === 0 && !falou && typeof voz === 'string' && voz) {
      falou = true;
      som?.falar?.(voz);
    }
    // revelarPalavras monta as palavras na hora; o acender anda junto com a subida delas.
    const revelada = revelarPalavras(frase, texto, { intervalo: 0.15, duracao: 1.2 });
    acenderPalavras(frase, amb);
    await revelada;

    // Fixa a frase onde está antes de a próxima nascer, para a próxima não nascer deslocada.
    const ir = () => {
      const { offsetLeft, offsetTop, offsetWidth } = frase;
      Object.assign(frase.style, {
        position: 'absolute', left: `${offsetLeft}px`, top: `${offsetTop}px`, width: `${offsetWidth}px`, margin: '0',
      });
      levarPeloVento(frase, amb).then(() => frase.remove());
    };

    if (i === frases.length - 1) {
      espera(tempoDeLer(texto)).then(ir);
      return;
    }
    await espera(tempoDeLer(texto));
    ir();
    await espera(ENTRE_FRASES);
  }
}
