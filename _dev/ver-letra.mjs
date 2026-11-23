/* ============================================================================
   VER-LETRA: foto da letra com a música tocando
   ============================================================================
   Abre a cena carta2 no iPhone (428 × 926) e no computador (1440 × 900), toca
   a faixa pelo som da própria carta, pula para o segundo pedido e tira um
   recorte de 260 px do topo, com a palavra cantada agora. Imprime números
   (quantas palavras, se alguma está acesa, a cor dela, a opacidade de #letra);
   nunca o texto da letra. Na leitura dos capítulos a letra dá passagem
   (css/letra.css). É um relatório, não uma aprovação: sai sempre com 0.

   Uso: node _dev/ver-letra.mjs [segundo] [faixa 1|2]   (padrão: 40 e 2)
   Fotos em output/ver/letra-<vp>.png.
   ========================================================================== */

import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { abrir, PASTA_FOTOS } from './lib.mjs';

const segundo = Number(process.argv[2] ?? 40);
const faixa = Math.max(1, Number(process.argv[3] ?? 2)) - 1;
const pausa = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Guarda em window.__audio o último elemento de áudio que chamou play().
function capturarAudio() {
  const tocar = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function (...args) {
    if (this instanceof HTMLAudioElement) window.__audio = this;
    return tocar.apply(this, args);
  };
}

await mkdir(PASTA_FOTOS, { recursive: true });
for (const vp of ['iphone', 'desktop']) {
  const s = await abrir({ cena: 'carta2', vp, preparar: (page) => page.addInitScript(capturarAudio) });
  try {
    await pausa(2000);
    await s.page.evaluate(async (i) => {
      const som = window.__carta?.som || window.__carta?.ctx?.som;
      await som?.destravar?.();
      await som?.tocar?.(i);
    }, faixa);
    await pausa(1500);
    await s.page.evaluate((t) => {
      if (window.__audio) window.__audio.currentTime = t;
    }, segundo);
    await pausa(1200);
    const r = await s.page.evaluate(() => {
      const som = window.__carta?.som || window.__carta?.ctx?.som;
      const acesa = document.querySelector('.letra-palavra[data-agora]');
      const letra = document.getElementById('letra');
      return {
        tocando: !!som?.estado?.tocando,
        t: window.__audio ? Math.round(window.__audio.currentTime * 10) / 10 : null,
        palavras: document.querySelectorAll('.letra-palavra').length,
        acesa: !!acesa,
        cor: acesa ? getComputedStyle(acesa).color : null,
        opacidade: letra ? getComputedStyle(letra).opacity : null,
      };
    });
    console.log(`${vp}: ${JSON.stringify(r)}`);
    const arquivo = path.join(PASTA_FOTOS, `letra-${vp}.png`);
    await s.page.screenshot({ path: arquivo, clip: { x: 0, y: 0, width: s.perfil.largura, height: 260 } });
    console.log(`  ${arquivo}`);
  } finally {
    await s.fechar();
  }
}
process.exit(0);
