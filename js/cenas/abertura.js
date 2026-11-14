// Abertura: branco total, um segundo de silêncio, pétalas e as frases palavra por palavra.
//
//   cenaAbertura(ctx, { frio }) → Promise   resolve quando a última frase sumiu
//
// Etapa publicada aqui: `frases`. A caminhada até a carta (etapas `caminhada` e
// `carta-chegando`) é feita por cenaCarta, para a câmera ter um movimento só.
//
// Versão do esqueleto: tempos simples. A assinatura não muda.

import { el, espera } from '../nucleo/util.js';
import { revelarPalavras, ocultarPalavras } from '../nucleo/movimento.js';

export async function cenaAbertura(ctx) {
  const { conteudo, diretor, mundo, recursos } = ctx;
  const palco = document.getElementById('frases');
  const frases = (conteudo.abertura?.frases || []).filter((f) => typeof f === 'string' && f.trim());

  diretor.etapa('frases');

  // Branco total e um segundo de silêncio; a fonte da frase termina de chegar nesse tempo.
  mundo.petalas.definirDensidade(0);
  const fonte = document.fonts && document.fonts.load
    ? document.fonts.load('400 32px "Shippori Mincho"', frases[0] || 'a').catch(() => {})
    : null;
  await Promise.all([espera(1000), Promise.race([fonte, espera(1800)])]);

  // As pétalas começam a cair; o resto do site baixa em segundo plano.
  mundo.petalas.definirDensidade(1);
  recursos.iniciar();
  diretor.aquecer();
  await espera(900);

  for (const texto of frases) {
    const frase = el('p', 'frase');
    palco.append(frase);
    await revelarPalavras(frase, texto, { intervalo: 0.24, duracao: 1.8 });
    await espera(1500 + texto.length * 28);          // tempo de leitura
    await ocultarPalavras(frase, { intervalo: 0.08, duracao: 1.1 });
    frase.remove();
    await espera(350);
  }
}
