// Abertura: o mundo branco aparece, as pétalas começam a cair e as frases surgem
// palavra por palavra, com ela já andando (o passo de base do mundo). Cada frase vai
// embora como se o vento a levasse, para o mesmo lado em que as pétalas caem.
//
//   cenaAbertura(ctx, { frio }) → Promise   resolve quando a última frase acabou de aparecer
//   aquecerAbertura(ctx) → Promise          prepara a primeira carta e as pétalas (uma vez só)
//
// Etapa publicada aqui: `frases`. A caminhada até a carta (etapas `caminhada` e
// `carta-chegando`) é feita por cenaCarta, para a câmera ter um movimento só.
//
// O RITMO (roteiro 2): do mundo aparecer até a carta surgir ao longe são uns 10 s.
// Por isso, vindo da tela preta, não há mais o segundo de branco parado (o preto se
// desfazendo já é o silêncio, e a carta é aquecida durante ele, por aquecerAbertura);
// uma frase começa enquanto a anterior ainda vai embora; e a última fica na tela
// durante o começo da caminhada, saindo sozinha pouco antes de a carta nascer da névoa.
// Pelo atalho ?cena=inicio (frio) o segundo de branco continua, para o aquecimento caber.

import { el, espera } from '../nucleo/util.js';
import { curvas, revelarPalavras } from '../nucleo/movimento.js';
import { aquecerEnvelope } from '../mundo/envelope.js';

const SILENCIO = 1000;          // ms de branco puro antes de tudo (só pelo atalho; vindo do preto não há)
const FOCO_DO_COMECO = 1.1;     // m: as primeiras pétalas nascem fora de foco...
const FOCO_DO_MUNDO = 3;        // ... e o foco assenta aqui quando a primeira palavra aparece

/** Tempo de leitura: um respiro fixo mais um tanto por letra. */
const tempoDeLer = (texto) => 1250 + texto.length * 28;
const ENTRE_FRASES = 1150;      // ms entre uma frase começar a sair e a seguinte começar a aparecer

/**
 * Prepara a primeira carta (texturas, shaders) e o programa das pétalas soltas, uma
 * vez só. Chamado pela tela preta enquanto ela se desfaz e, de novo, pela abertura
 * (que então só espera o que já está em andamento).
 */
let aquecimento = null;
export function aquecerAbertura(ctx) {
  if (!aquecimento) {
    const { mundo } = ctx;
    // Um quadro antes, para o que está na tela (o preto, o branco) já ter sido pintado.
    aquecimento = new Promise((r) => requestAnimationFrame(r))
      .then(() => Promise.all([
        aquecerEnvelope(mundo, { tema: 'poppy', lacre: 'coracao', amarracao: 'cordao' }),
        mundo.petalas?.preparar?.(),         // as protagonistas, logo adiante, usam o programa das soltas
      ]))
      .catch(() => {});
  }
  return aquecimento;
}

/**
 * A frase vai embora com o vento: cada palavra deriva para o lado em que as
 * pétalas caem (direita e um pouco para baixo), desfoca e some, uma depois da outra.
 */
function levarPeloVento(frase, amb) {
  const gsap = window.gsap;
  const palavras = frase._pedacos?.palavras?.length ? frase._pedacos.palavras : [frase];

  return new Promise((resolver) => {
    if (!gsap) { resolver(); return; }
    if (amb.reduzido) {
      gsap.to(palavras, { autoAlpha: 0, duration: 0.7, ease: 'none', onComplete: resolver });
      return;
    }
    const desfoca = amb.nivel !== 'baixo';
    // A palavra mais a favor do vento (a última) solta primeiro; as outras vão atrás,
    // cada uma para o espaço que a anterior deixou.
    const ordem = { each: 0.11, from: 'end' };
    const tl = gsap.timeline({ onComplete: resolver });
    // O vento pega devagar e depois carrega: a posição acelera, a tinta se desfaz no caminho.
    tl.to(palavras, {
      x: (i) => `${(2.1 + (i % 3) * 0.45).toFixed(2)}em`,
      y: (i) => `${(0.34 + ((i * 7) % 5) * 0.11).toFixed(2)}em`,
      rotation: (i) => 3.5 + ((i * 5) % 4) * 1.8,
      duration: 1.7,
      stagger: ordem,
      ease: curvas.branco.sair,
    }, 0);
    tl.to(palavras, {
      autoAlpha: 0,
      ...(desfoca ? { filter: 'blur(9px)' } : null),
      duration: 1.15,
      stagger: ordem,
      ease: 'power1.in',
    }, 0.4);
  });
}

export async function cenaAbertura(ctx, { frio = false } = {}) {
  const { conteudo, diretor, mundo, recursos, amb } = ctx;
  const palco = document.getElementById('frases');
  const petalas = mundo.petalas;
  const frases = (conteudo.abertura?.frases || []).filter((f) => typeof f === 'string' && f.trim());

  diretor.etapa('frases');

  petalas.definirDensidade(0);
  petalas.definirFoco?.(FOCO_DO_COMECO);
  const fonte = document.fonts && document.fonts.load
    ? document.fonts.load('400 32px "Shippori Mincho"', frases[0] || 'a').catch(() => {})
    : null;
  // A primeira carta é preparada antes do primeiro passo. Vindo da tela preta isto já
  // foi feito enquanto o preto se desfazia; pelo atalho, cabe no segundo de branco.
  const aquecer = aquecerAbertura(ctx);
  await Promise.all([
    frio ? espera(SILENCIO) : null,
    Promise.race([fonte, espera(frio ? 1800 : 700)]),
    Promise.race([aquecer, espera(frio ? 2400 : 900)]),
  ]);

  // As pétalas começam, poucas, entrando por cima; o resto do site baixa em segundo plano.
  // No movimento reduzido elas não descem do alto da tela (lentas como estão, a
  // tela ficaria vazia durante as frases): já estão no ar e só aparecem, devagar.
  // Vindo do preto, a chuva já começou em sairDaEntrada (js/cenas/senha.js), com os olhos
  // ainda fechados: recomeçar aqui apagaria de uma vez as pétalas que ela acabou de ver.
  if (frio && !amb.reduzido) petalas.comecar?.();
  petalas.definirDensidade(0.4);
  recursos.iniciar();
  diretor.aquecer();
  espera(2200).then(() => petalas.definirDensidade(1));       // ... e aumentam
  await espera(frio ? 1500 : 350);

  // Algumas enormes cruzam rente à lente durante a primeira frase, e o foco assenta.
  petalas.protagonistas?.();
  petalas.definirFoco?.(FOCO_DO_MUNDO);
  await espera(frio ? 500 : 250);

  for (let i = 0; i < frases.length; i++) {
    const texto = frases[i];
    const frase = el('p', 'frase frase-abertura');
    palco.append(frase);
    await revelarPalavras(frase, texto, { intervalo: 0.15, duracao: 1.2 });
    const ir = () => {
      // Sai do fluxo no lugar em que está: a frase seguinte nasce na mesma altura, sem pulo.
      const { offsetLeft: x, offsetTop: y, offsetWidth: l } = frase;
      Object.assign(frase.style, { position: 'absolute', left: `${x}px`, top: `${y}px`, width: `${l}px`, margin: '0' });
      return levarPeloVento(frase, amb).then(() => frase.remove());
    };

    if (i === frases.length - 1) {
      // A última fica na tela enquanto ela dá os primeiros passos (a cena seguinte começa
      // já) e sai sozinha depois de lida, pouco antes de a carta nascer da névoa.
      espera(tempoDeLer(texto)).then(ir);
      return;
    }
    await espera(tempoDeLer(texto));
    // A seguinte começa enquanto esta ainda vai embora: o vento a leva para o lado,
    // e as primeiras palavras da nova aparecem no espaço que ficou.
    ir();
    await espera(ENTRE_FRASES);
  }
}
