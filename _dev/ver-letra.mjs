// Foto da letra no alto da tela (com um verso de exemplo), no iPhone e no desktop.
import { abrir, PASTA_FOTOS } from './lib.mjs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
await mkdir(PASTA_FOTOS, { recursive: true });
for (const vp of ['iphone', 'desktop']) {
  const s = await abrir({ cena: 'poppy', vp });
  await s.page.waitForTimeout(2500);
  await s.page.evaluate(() => {
    let r = document.getElementById('letra');
    if (!r) { r = document.createElement('div'); r.id = 'letra'; r.className = 'letra'; r.innerHTML = '<p class="letra-linha"></p>'; document.body.append(r); }
    r.removeAttribute('data-vazia');
    r.querySelector('p').textContent = '[um verso de exemplo, mais ou menos deste tamanho aqui]';
  });
  await s.page.waitForTimeout(600);
  const f = path.join(PASTA_FOTOS, `letra-${vp}.png`);
  await s.page.screenshot({ path: f });
  console.log(f);
  await s.fechar?.();
}
process.exit(0);
