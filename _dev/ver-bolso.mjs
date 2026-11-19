// Fotos da animação de guardar a carta (js/cenas/bolso.js), quadro a quadro.
//   node _dev/ver-bolso.mjs [iphone|desktop] [tema]
import { abrir, PASTA_FOTOS } from './lib.mjs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
const vp = process.argv[2] || 'iphone';
const tema = process.argv[3] || 'poppy';
await mkdir(PASTA_FOTOS, { recursive: true });
const s = await abrir({ cena: 'poppy', vp });
await s.page.waitForTimeout(2500);
await s.page.evaluate(() => { const p = document.getElementById('pergaminho'); if (p) p.style.display = 'none'; });
await s.page.evaluate((tema) => { window.__fim = window.__carta.ctx.bolso.guardar({ tema }); }, tema);
const fotos = [];
for (const ms of (process.argv[4] || '250,700,1200,1700,2200,2700,3200').split(',').map(Number)) {
  await s.page.waitForTimeout(ms - (fotos.at(-1) ?? 0));
  const f = path.join(PASTA_FOTOS, `bolso-${vp}-${ms}.png`);
  await s.page.screenshot({ path: f, scale: 'css' });
  fotos.push(ms);
}
console.log(fotos.map((m) => `bolso-${vp}-${m}.png`).join(' '));
await s.fechar?.();
process.exit(0);
