// Gera o ícone da Tela de Início do iPhone (assets/images/icone-180.png, 180×180):
// a cartinha creme amarrada com o fio vermelho em cruz, com o lacinho no meio, sobre
// a névoa clara do site. O iPhone arredonda os cantos sozinho; o PNG é quadrado e
// sem transparência (transparente viraria preto).
//
//   node _dev/icone.mjs                        gera o ícone
//   node _dev/icone.mjs --saida output/i.png   grava em outro lugar (para comparar)
//   node _dev/icone.mjs --lado 60              outro tamanho (para ver como fica pequeno)
//
// O desenho é o SVG aqui embaixo (cores do DESIGN.md: papel, papel-linha, fio, fio-escuro).

import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { carregarPlaywright, RAIZ } from './lib.mjs';

function argumento(nome, padrao) {
  const i = process.argv.indexOf(`--${nome}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : padrao;
}

const lado = Number(argumento('lado', 180));
const saida = path.resolve(RAIZ, argumento('saida', 'assets/images/icone-180.png'));

const LACO = 'M90 92 C74 68 50 70 54 86 C57 98 76 98 90 92 C104 98 123 98 126 86 C130 70 106 68 90 92';
const PONTAS = 'M90 92 C84 104 78 114 70 122 M90 92 C96 104 102 114 110 122';

const SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 180" width="${lado}" height="${lado}">
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
  <rect width="180" height="180" fill="url(#nevoa)"/>
  <g transform="rotate(-6 90 91)">
    <!-- o envelope de costas: o papel e as dobras -->
    <rect x="20" y="42" width="140" height="98" rx="5" fill="#fbf7f0" filter="url(#sombra)"/>
    <g clip-path="url(#carta)">
      <path d="M20 140 L90 86 L160 140 Z" fill="#f4eee2"/>
      <path d="M20 42 L90 96 L160 42" fill="#fffdf8" stroke="#e3d9c8" stroke-width="2" stroke-linejoin="round"/>
      <path d="M20 140 L74 84 M160 140 L106 84" stroke="#e3d9c8" stroke-width="2"/>
    </g>
    <rect x="20" y="42" width="140" height="98" rx="5" fill="none" stroke="#e3d9c8" stroke-width="1.5"/>
    <!-- o fio em cruz (a linha escura por baixo dá o volume do cordão) -->
    <g fill="none" stroke-linejoin="round">
      <path d="M90 43 V139 M21 93 H159" stroke="#a80f22" stroke-width="7"/>
      <path d="M90 43 V139 M21 92 H159" stroke="#d7192d" stroke-width="5.5"/>
      <!-- o lacinho: duas alças e duas pontas -->
      <g stroke-linecap="round">
        <path d="${LACO} ${PONTAS}" stroke="#a80f22" stroke-width="8"/>
        <path d="${LACO} ${PONTAS}" stroke="#d7192d" stroke-width="5.5"/>
      </g>
    </g>
    <circle cx="90" cy="92" r="7.5" fill="#a80f22"/>
    <circle cx="90" cy="91.5" r="6" fill="#d7192d"/>
  </g>
</svg>`;

const navegador = await carregarPlaywright().chromium.launch({ headless: true });
try {
  const page = await navegador.newPage({ viewport: { width: lado, height: lado }, deviceScaleFactor: 1 });
  await page.setContent(`<body style="margin:0">${SVG}</body>`);
  const dados = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: lado, height: lado } });
  await mkdir(path.dirname(saida), { recursive: true });
  await writeFile(saida, dados);
  console.log(`ícone: ${path.relative(RAIZ, saida)} ${lado}×${lado}, ${(dados.length / 1024).toFixed(1)} KB`);
} finally {
  await navegador.close();
}
