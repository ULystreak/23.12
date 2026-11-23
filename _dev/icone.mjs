/* ============================================================================
   ÍCONE: o atalho da Tela de Início (assets/images/icone-180.png)
   ============================================================================
   Uma cartinha creme amarrada com o fio vermelho em cruz e um lacinho, sobre
   uma névoa rosada, desenhada em SVG com as cores do DESIGN.md (papel,
   papel-linha, fio, fio-escuro) e renderizada pelo Chromium. O PNG é quadrado
   e opaco: o iPhone arredonda os cantos sozinho, e transparência viraria
   preto. É um arquivo fixo: mudou o desenho, rode de novo e publique o PNG.

   Uso: node _dev/icone.mjs [--lado N] [--saida caminho]
     --lado   lado em px (padrão 180; --lado 60 mostra como fica pequeno)
     --saida  a partir da raiz do repositório (padrão assets/images/icone-180.png)
   ========================================================================== */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { carregarPlaywright } from './lib.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// O laço sai do nó em (90; 91,5): duas alças e duas pontas.
const LACO = 'M90 91.5C83 80 70.5 74.5 66 80.5S72.5 94.5 90 91.5ZM90 91.5C97 80 109.5 74.5 114 80.5S107.5 94.5 90 91.5Z';
const PONTAS = 'M88.5 93.5C85 101 80.5 107.5 75 112.5M91.5 93.5C95 101 99.5 107.5 105 112.5';

function argumento(nome, padrao) {
  const i = process.argv.indexOf(`--${nome}`);
  return i > 1 && i + 1 < process.argv.length ? process.argv[i + 1] : padrao;
}

function desenho(lado) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${lado}" height="${lado}" viewBox="0 0 180 180">
  <defs>
    <linearGradient id="nevoa" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fdf1f4"/>
      <stop offset="1" stop-color="#f3cfd8"/>
    </linearGradient>
    <filter id="sombra" x="-20%" y="-20%" width="140%" height="150%">
      <feDropShadow dx="0" dy="5" stdDeviation="5" flood-color="#2a1b22" flood-opacity="0.22"/>
    </filter>
    <clipPath id="carta"><rect x="20" y="42" width="140" height="98" rx="5"/></clipPath>
  </defs>
  <!-- O fundo cobre tudo: é ele que deixa o PNG opaco. -->
  <rect width="180" height="180" fill="url(#nevoa)"/>
  <g transform="rotate(-6 90 91)">
    <rect x="20" y="42" width="140" height="98" rx="5" fill="#fbf7f0" filter="url(#sombra)"/>
    <g clip-path="url(#carta)" stroke="#e3d9c8" stroke-width="2" stroke-linejoin="round">
      <path d="M20 140L90 88L160 140Z" fill="#f4eee2"/>
      <path d="M20 42L90 98L160 42Z" fill="#fffdf8"/>
    </g>
    <g fill="none">
      <path d="M90 42V140M20 91H160" stroke="#a80f22" stroke-width="7"/>
      <path d="M90 42V140M20 91H160" stroke="#d7192d" stroke-width="5.5"/>
      <g stroke-linecap="round" stroke-linejoin="round">
        <path d="${LACO}${PONTAS}" stroke="#a80f22" stroke-width="8"/>
        <path d="${LACO}${PONTAS}" stroke="#d7192d" stroke-width="5.5"/>
      </g>
    </g>
    <circle cx="90" cy="91.5" r="7.5" fill="#a80f22"/>
    <circle cx="90" cy="91.5" r="6" fill="#d7192d"/>
  </g>
</svg>`;
}

async function principal() {
  const lado = Math.round(Number(argumento('lado', 180)));
  const saida = path.resolve(RAIZ, argumento('saida', 'assets/images/icone-180.png'));
  if (!(lado >= 16 && lado <= 2048)) throw new Error('--lado precisa ser um número entre 16 e 2048');

  const pw = await carregarPlaywright();
  const navegador = await (pw.chromium || pw.default?.chromium).launch({ headless: true });
  try {
    const page = await navegador.newPage({ viewport: { width: lado, height: lado }, deviceScaleFactor: 1 });
    await page.setContent(`<!doctype html><html><body style="margin:0">${desenho(lado)}</body></html>`);
    const imagem = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: lado, height: lado } });
    await mkdir(path.dirname(saida), { recursive: true });
    await writeFile(saida, imagem);
    console.log(`ícone: ${path.relative(RAIZ, saida)} ${lado}×${lado}, ${(imagem.length / 1024).toFixed(1)} KB`);
  } finally {
    await navegador.close();
  }
}

principal().catch((erro) => {
  console.error(`ícone: ${erro.message}`);
  process.exitCode = 1;
});
