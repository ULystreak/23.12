// Abertura: branco total, um segundo de silêncio, as pétalas começam a cair e as
// frases aparecem palavra por palavra. Cada frase vai embora como se o vento a
// levasse, para o mesmo lado em que as pétalas caem.
//
//   cenaAbertura(ctx, { frio }) → Promise   resolve quando a última frase começa a ir embora
//
// Etapa publicada aqui: `frases`. A caminhada até a carta (etapas `caminhada` e
// `carta-chegando`) é feita por cenaCarta, para a câmera ter um movimento só; por
// isso a Promise resolve um instante depois de a última frase começar a sair: a
// saída dela e o primeiro passo se sobrepõem.

import { el, espera } from '../nucleo/util.js';
import { curvas, revelarPalavras } from '../nucleo/movimento.js';
import { aquecerEnvelope } from '../mundo/envelope.js';

const SILENCIO = 1000;          // ms de branco puro antes de tudo
const FOCO_DO_COMECO = 1.1;     // m: as primeiras pétalas nascem fora de foco...
const FOCO_DO_MUNDO = 3;        // ... e o foco assenta aqui quando a primeira palavra aparece

/** Tempo de leitura: um respiro fixo mais um tanto por letra. */
const tempoDeLer = (texto) => 1700 + texto.length * 30;

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

export async function cenaAbertura(ctx) {
  const { conteudo, diretor, mundo, recursos, amb } = ctx;
  const palco = document.getElementById('frases');
  const petalas = mundo.petalas;
  const frases = (conteudo.abertura?.frases || []).filter((f) => typeof f === 'string' && f.trim());

  diretor.etapa('frases');

  // Branco total e um segundo de silêncio; a fonte da frase termina de chegar nesse tempo.
  petalas.definirDensidade(0);
  petalas.definirFoco?.(FOCO_DO_COMECO);
  const fonte = document.fonts && document.fonts.load
    ? document.fonts.load('400 32px "Shippori Mincho"', frases[0] || 'a').catch(() => {})
    : null;
  // No branco parado, a primeira carta é preparada (texturas, shaders): o primeiro
  // passo da caminhada não paga por isso. Um quadro antes, para o branco já estar na tela.
  const aquecer = new Promise((r) => requestAnimationFrame(r))
    .then(() => aquecerEnvelope(mundo, { lacre: 'coracao', amarracao: 'cordao' }))
    .catch(() => {});
  await Promise.all([espera(SILENCIO), Promise.race([fonte, espera(1800)]), Promise.race([aquecer, espera(2400)])]);

  // As pétalas começam, poucas, entrando por cima; o resto do site baixa em segundo plano.
  // No movimento reduzido elas não descem do alto da tela (lentas como estão, a
  // tela ficaria vazia durante as frases): já estão no ar e só aparecem, devagar.
  if (!amb.reduzido) petalas.comecar?.();
  petalas.definirDensidade(0.4);
  recursos.iniciar();
  diretor.aquecer();
  espera(2600).then(() => petalas.definirDensidade(1));       // ... e aumentam
  await espera(1500);

  // Algumas enormes cruzam rente à lente durante a primeira frase, e o foco assenta.
  petalas.protagonistas?.();
  petalas.definirFoco?.(FOCO_DO_MUNDO);
  await espera(500);

  for (let i = 0; i < frases.length; i++) {
    const texto = frases[i];
    const frase = el('p', 'frase frase-abertura');
    palco.append(frase);
    await revelarPalavras(frase, texto, { intervalo: 0.15, duracao: 1.2 });
    await espera(tempoDeLer(texto));

    const saida = levarPeloVento(frase, amb).then(() => frase.remove());
    if (i === frases.length - 1) {
      // A última sai junto com o primeiro passo: a cena seguinte começa já.
      await espera(420);
      return;
    }
    await saida;
    await espera(420);
  }
}
