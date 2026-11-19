// Foto da letra no alto da tela com a música tocando de verdade (a palavra cantada em vermelho).
// Na caminhada até a segunda carta: na leitura dos capítulos ela dá passagem (css/letra.css).
//   node _dev/ver-letra.mjs [segundo] [faixa 1|2]
import { abrir, PASTA_FOTOS } from './lib.mjs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
const seg = Number(process.argv[2] || 40);
const faixa = Number(process.argv[3] || 2) - 1;
await mkdir(PASTA_FOTOS, { recursive: true });
for (const vp of ['iphone', 'desktop']) {
  const s = await abrir({ cena: 'carta2', vp, preparar: (page) => page.addInitScript(() => {
    const tocar = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () { window.__audio = this; return tocar.call(this); };
  }) });
  await s.page.waitForTimeout(2000);
  const info = await s.page.evaluate(async ({ seg, faixa }) => {
    const som = window.__carta?.som || window.__carta?.ctx?.som;
    if (!som) return 'sem som em __carta: ' + Object.keys(window.__carta || {}).join(',');
    som.destravar?.();
    som.tocar(faixa);
    await new Promise((r) => setTimeout(r, 1500));
    const a = window.__audio;
    if (a) a.currentTime = seg;
    await new Promise((r) => setTimeout(r, 1200));
    const acesa = document.querySelector('.letra-palavra[data-agora]');
    return { tocando: som.estado.tocando, t: a?.currentTime?.toFixed(1), palavras: document.querySelectorAll('.letra-palavra').length, acesa: !!acesa, cor: acesa && getComputedStyle(acesa).color, opacidade: getComputedStyle(document.getElementById('letra')).opacity };
  }, { seg, faixa });
  console.log(vp, JSON.stringify(info));
  const f = path.join(PASTA_FOTOS, `letra-${vp}.png`);
  await s.page.screenshot({ path: f, clip: { x: 0, y: 0, width: s.page.viewportSize().width, height: 260 } });
  console.log(f);
  await s.fechar?.();
}
process.exit(0);
