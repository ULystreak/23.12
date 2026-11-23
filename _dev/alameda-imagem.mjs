/* ============================================================================
   ALAMEDA-IMAGEM: a alameda 3D de frente, numa foto (assets/images/alameda.webp)
   ============================================================================
   Quadro quadrado com o ponto de fuga no centro, sem pétalas, na hora em que
   todas as lanternas estão acesas (entardecer da v2, já noite). É a imagem que o
   aparelho sem WebGL mostra atrás do mundo leve (content.js: pagina.fundo).
   Não há build: mexeu na alameda, rode de novo. A cena do site não muda; o
   script desliga o laço do mundo e renderiza um quadro à mão.

   Uso: node _dev/alameda-imagem.mjs [lado=2000] [saida=assets/images/alameda.webp] [z=-2] [q=0.75]
     A saída é contada a partir da raiz do repositório, de onde quer que rode.
   ========================================================================== */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { carregarPlaywright, subirServidor } from './lib.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Sem estes args o WebGL do Chromium roda em software.
const ARGS_GPU = ['--enable-gpu', `--use-angle=${process.platform === 'win32' ? 'd3d11' : 'default'}`, '--ignore-gpu-blocklist'];

async function principal() {
  const [ladoTxt = '2000', saidaTxt = 'assets/images/alameda.webp', zTxt = '-2', qTxt = '0.75'] = process.argv.slice(2);
  const L = Math.round(Number(ladoTxt));
  const z = Number(zTxt);
  const q = Number(qTxt);
  const saida = path.resolve(RAIZ, saidaTxt);
  if (!(L >= 64 && L <= 4096) || !Number.isFinite(z) || !(q > 0 && q <= 1)) {
    throw new Error('uso: node _dev/alameda-imagem.mjs [lado=2000] [saida] [z=-2] [q=0.75] (lado de 64 a 4096, q de 0 a 1)');
  }

  const pw = await carregarPlaywright();
  const servidor = await subirServidor(RAIZ);
  let navegador = null;
  const erros = [];
  try {
    // Dentro do try: se o navegador não abre, o servidor fecha e o processo termina.
    navegador = await (pw.chromium || pw.default?.chromium).launch({ headless: true, args: ARGS_GPU });
    const page = await navegador.newPage({ viewport: { width: L, height: L }, deviceScaleFactor: 1, locale: 'pt-BR' });
    page.on('console', (m) => { if (m.type() === 'error') erros.push(`console: ${m.text()}`); });
    page.on('pageerror', (e) => erros.push(`exceção: ${e.message}`));
    page.on('response', (r) => { if (r.status() >= 400) erros.push(`http ${r.status()}: ${r.url()}`); });

    const base = servidor.url.endsWith('/') ? servidor.url : `${servidor.url}/`;
    await page.goto(new URL('index.html?cena=inicio&mudo=1&nivel=alto', base).href);
    await page.waitForFunction(() => window.__carta?.ctx?.mundo || window.__carta?.erro, null, { timeout: 30000 });
    // A alameda compila e surge; 4 s bastam com folga.
    await new Promise((resolve) => setTimeout(resolve, 4000));

    const resultado = await page.evaluate(async ({ z, q }) => {
      const m = window.__carta.ctx?.mundo;
      if (!m?.ok) return { erro: 'sem WebGL neste navegador: a alameda 3D não montou' };
      if (!m.alameda) return { erro: 'a alameda 3D não existe (pagina.fundo está vazio no content.js?)' };
      await Promise.race([m.alameda.pronta, new Promise((r) => setTimeout(r, 3000))]);
      m.desligar();
      // A foto é do entardecer da v2: todas as lanternas acesas, sem cometa (o
      // modo leve pinta a noite e o cometa por cima, em camadas próprias).
      await m.hora?.('entardecer', { duracao: 0 });
      m.petalas.objeto.visible = false;
      // Se a cena já trouxe a carta, ela também sai da foto: a imagem é só a alameda.
      const envelope = window.__carta.ctx.estado?.envelope?.grupo;
      if (envelope) envelope.visible = false;
      // A foto é da alameda inteira, já surgida, mesmo que a cena ainda estivesse no começo.
      m.alameda.grupo.visible = true;
      if (m.alameda.uniformes?.uSurgir) m.alameda.uniformes.uSurgir.value = 1;
      m.rig.position.set(0, 0, z);
      m.camera.position.set(0, 1.5, 0);
      m.camera.rotation.set(0.02, 0, 0);
      m.camera.fov = 66;
      m.camera.aspect = 1;
      m.camera.updateProjectionMatrix();
      m.renderer.setPixelRatio(1);
      m.renderer.setSize(innerWidth, innerHeight, false);
      // Tempo fixo (17 s) e deriva zero: a mesma foto toda vez.
      m.alameda.atualizar(0, 17.0, 0);
      m.renderer.render(m.cena, m.camera);
      return { url: m.canvas.toDataURL('image/webp', q) };
    }, { z, q });

    if (resultado.erro) throw new Error(resultado.erro);
    if (!resultado.url.startsWith('data:image/webp')) throw new Error('o navegador não exportou WebP');
    const bytes = Buffer.from(resultado.url.slice(resultado.url.indexOf(',') + 1), 'base64');
    await mkdir(path.dirname(saida), { recursive: true });
    await writeFile(saida, bytes);
    console.log(`alameda: ${path.relative(RAIZ, saida)} ${L}×${L}, ${Math.round(bytes.length / 1024)} KB, qualidade ${q}`);
    for (const erro of erros) console.log(`erro: ${erro}`);
  } finally {
    await navegador?.close();
    await servidor.fechar();
  }
}

principal().catch((erro) => {
  console.error(`alameda: ${erro.message}`);
  process.exitCode = 1;
});
