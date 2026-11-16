// Renderiza a alameda 3D numa imagem quadrada (ponto de fuga no centro) para o
// modo sem WebGL: node _dev/alameda-imagem.mjs [lado=2000] [saida] [z=-2] [q=0.75]
import { abrir } from './lib.mjs';
import { writeFile } from 'node:fs/promises';
const [lado = '2000', saida = 'assets/images/alameda.webp', z = '-2', qual = '0.75'] = process.argv.slice(2);
const L = Number(lado);
const s = await abrir({ cena: 'inicio', vp: 'desktop', params: { mudo: 1, nivel: 'alto' }, preparar: async (page) => {
  await page.setViewportSize({ width: L, height: L });
} });
await s.pausa(4000);
const url = await s.page.evaluate(({ z, qual }) => {
  const m = window.__carta.ctx.mundo;
  m.desligar();
  m.petalas.objeto.visible = false;
  const cam = m.camera;
  m.rig.position.set(0, 0, z);
  cam.position.set(0, 1.5, 0);
  cam.rotation.set(0.02, 0, 0);
  cam.fov = 66; cam.aspect = 1; cam.updateProjectionMatrix();
  m.renderer.setPixelRatio(1);
  m.renderer.setSize(window.innerWidth, window.innerHeight, false);
  m.alameda.atualizar(0, 12.0);
  m.renderer.render(m.cena, cam);
  return m.canvas.toDataURL('image/webp', qual);
}, { z: Number(z), qual: Number(qual) });
const buf = Buffer.from(url.split(',')[1], 'base64');
await writeFile(saida, buf);
console.log(saida, buf.length, 'bytes', JSON.stringify(s.erros));
await s.fechar();
