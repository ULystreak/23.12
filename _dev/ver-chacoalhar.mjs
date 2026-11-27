/* VER-CHACOALHAR: a última carta só abre chacoalhando (com o sensor liberado).
   Simula o iPhone: DeviceMotionEvent.requestPermission devolve "granted" e os
   trancos chegam por eventos devicemotion. Confere: 1) o toque pede o sensor e
   NÃO abre; 2) um segundo toque também não abre; 3) três trancos abrem.
   Uso: node _dev/ver-chacoalhar.mjs   (sai com 0 se tudo certo) */
import { abrir } from './lib.mjs';
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const s = await abrir({
  cena: 'final', vp: 'iphone-safari', params: { rapido: 4 },
  preparar: (page) => page.addInitScript(() => {
    window.DeviceMotionEvent = window.DeviceMotionEvent || function DeviceMotionEvent() {};
    window.DeviceMotionEvent.requestPermission = () => Promise.resolve('granted');
  }),
});
const { page } = s;
const etapa = () => page.evaluate(() => window.__carta?.etapa);
const tranco = (forca) => page.evaluate((f) => {
  const e = new Event('devicemotion');
  e.acceleration = { x: f, y: 0, z: 0 };
  e.accelerationIncludingGravity = { x: f, y: 9.81, z: 0 };
  window.dispatchEvent(e);
}, forca);
let ok = true;
const conferir = (nome, cond) => { console.log(`${cond ? 'ok ' : 'FALHOU'} ${nome}`); if (!cond) ok = false; };
try {
  for (let i = 0; i < 120 && (await etapa()) !== 'carta-espera'; i++) await pausa(250);
  conferir('chegou em carta-espera', (await etapa()) === 'carta-espera');
  await pausa(600);
  const caixa = await page.locator('[data-acao="abrir-carta"]').boundingBox();
  const x = caixa.x + caixa.width / 2, y = caixa.y + caixa.height / 2;
  await tranco(0.2); // o sensor existe e está parado
  await page.touchscreen.tap(x, y);
  await pausa(900);
  conferir('1º toque não abre (pede o sensor)', (await etapa()) === 'carta-espera');
  const dica = await page.evaluate(() => document.getElementById('dica')?.textContent || '');
  conferir(`a dica pede para chacoalhar ("${dica}")`, /chacoalh/i.test(dica));
  await page.touchscreen.tap(x, y);
  await pausa(900);
  conferir('2º toque também não abre', (await etapa()) === 'carta-espera');
  await tranco(3); await pausa(150); await tranco(4);
  await pausa(400);
  conferir('balanço leve não abre', (await etapa()) === 'carta-espera');
  for (let i = 0; i < 3; i++) { await tranco(20); await pausa(140); await tranco(0.3); await pausa(60); }
  await pausa(700);
  conferir('três trancos abrem', (await etapa()) !== 'carta-espera');
  conferir(`sem erros de console (${s.erros?.length ?? 0})`, !(s.erros?.length));
} catch (erro) { console.log('FALHOU', erro.message); ok = false; }
await s.fechar();
process.exit(ok ? 0 : 1);
