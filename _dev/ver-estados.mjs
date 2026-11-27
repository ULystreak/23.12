/* VER-ESTADOS: fotos de estados que o ver.mjs não alcança (capítulos rolados,
   bolsa aberta, foco no menu, sem WebGL). Uso: node _dev/ver-estados.mjs
   Fotos em output/ver/estado-*.png. */
import path from 'node:path';
import { abrir, PASTA_FOTOS } from './lib.mjs';
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const foto = (page, nome) => page.screenshot({ path: path.join(PASTA_FOTOS, `estado-${nome}.png`) });

/** Rola o maior elemento rolável da página para a fração pedida. */
const rolar = (page, f) => page.evaluate((f) => {
  let melhor = null, max = 0;
  for (const e of document.querySelectorAll('*')) {
    const d = e.scrollHeight - e.clientHeight;
    if (d > max && /auto|scroll/.test(getComputedStyle(e).overflowY)) { max = d; melhor = e; }
  }
  if (melhor) melhor.scrollTop = max * f;
  return max;
}, f);

async function capitulo(cena, fracoes, params = {}, sufixo = '') {
  const s = await abrir({ cena, vp: 'iphone-safari', params: { rapido: 6, ...params } });
  const page = s.page;
  await pausa(5000);
  for (const f of fracoes) {
    const max = await rolar(page, f);
    await pausa(1600);
    await foto(page, `${cena}${sufixo}-${Math.round(f * 100)}`);
    if (!max) break;
  }
  console.log(cena + sufixo, 'erros:', s.erros?.length ?? '?');
  await s.fechar();
}

async function menu() {
  const s = await abrir({ cena: 'menu', vp: 'iphone-safari', params: { rapido: 6 } });
  const page = s.page;
  await pausa(7000);
  await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
  await pausa(900);
  await foto(page, 'menu-foco');
  const bolsa = page.locator('[data-acao="inventario"]').first();
  if (await bolsa.count()) { await bolsa.click({ force: true }).catch(() => {}); await pausa(1500); await foto(page, 'bolsa-aberta'); }
  console.log('menu erros:', s.erros?.length ?? '?');
  await s.fechar();
}

await capitulo('poppy', [0.25, 0.5, 0.75, 1]);
await capitulo('yourname', [0.3, 0.6, 0.85, 1]);
await capitulo('yourname', [0, 0.6], { webgl: 0 }, '-webgl0');
await capitulo('final', [0], { reduzido: 1 }, '-reduzido');
await menu();
