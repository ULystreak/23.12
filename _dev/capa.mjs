/* ============================================================================
   CAPA: a prévia do link (assets/images/og-capa.jpg, 1200 × 630)
   ============================================================================
   Tirada do próprio site: o envelope parado no mundo branco, com as pétalas.
   Sem texto e sem nada que entregue a surpresa: a dica ("Toque na carta."),
   as frases, a letra e o mini seletor somem por um CSS injetado só nesta
   captura; o site não muda. O index.html aponta para o arquivo em og:image:
   quando a cena mudar, rode de novo e publique a imagem.

   Uso: node _dev/capa.mjs [--motor chromium|webkit] [--espera ms]
        [--ponteiro x,y] [--perto k] [--centroY y] [--saida caminho]
     --espera   tempo para as pétalas e a carta assentarem (padrão 3000 ms)
     --ponteiro onde o ponteiro descansa, em fração da tela; a carta inclina
                para ali (padrão 0.85,0.2)
     --perto    abaixo de 1 aproxima a carta da câmera; 1 desliga (padrão 0.85)
     --centroY  altura do centro da carta, em fração da tela (padrão 0.49)
     --saida    a partir da raiz do repositório (padrão assets/images/og-capa.jpg)
   ========================================================================== */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { carregarPlaywright, subirServidor } from './lib.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LARGURA = 1200;
const ALTURA = 630;
// O WhatsApp e o iMessage recusam ou recomprimem prévias grandes.
const LIMITE = 200 * 1024;
const CSS_CAPTURA = '#dica, #mini, #frases, #acoes, #letra { display: none !important; visibility: hidden !important; } * { cursor: none !important; }';
// No Chromium, a GPU de verdade: sem estes args o WebGL roda em software.
const ARGS_GPU = ['--enable-gpu', `--use-angle=${process.platform === 'win32' ? 'd3d11' : 'default'}`, '--ignore-gpu-blocklist'];

function argumento(nome, padrao) {
  const i = process.argv.indexOf(`--${nome}`);
  return i > 1 && i + 1 < process.argv.length ? process.argv[i + 1] : padrao;
}

const pausa = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function principal() {
  const motor = argumento('motor', 'chromium');
  const esperaMs = Number(argumento('espera', 3000));
  const [px, py] = argumento('ponteiro', '0.85,0.2').split(',').map(Number);
  const perto = Number(argumento('perto', 0.85));
  const centroY = Number(argumento('centroY', 0.49));
  const saida = path.resolve(RAIZ, argumento('saida', 'assets/images/og-capa.jpg'));
  if (!['chromium', 'webkit'].includes(motor)) throw new Error(`motor desconhecido: ${motor} (use chromium ou webkit)`);
  if (![esperaMs, px, py, perto, centroY].every(Number.isFinite)) throw new Error('algum número da linha de comando não é número');

  const pw = await carregarPlaywright();
  const tipo = pw[motor] || pw.default?.[motor];
  const servidor = await subirServidor(RAIZ);
  let navegador = null;
  const erros = [];
  try {
    // Dentro do try: se o navegador não abre, o servidor fecha e o processo termina.
    navegador = await tipo.launch({ headless: true, args: motor === 'chromium' ? ARGS_GPU : [] });
    const contexto = await navegador.newContext({ viewport: { width: LARGURA, height: ALTURA }, deviceScaleFactor: 1, locale: 'pt-BR' });
    const page = await contexto.newPage();
    page.on('console', (m) => { if (m.type() === 'error') erros.push(`console: ${m.text()}`); });
    page.on('pageerror', (e) => erros.push(`exceção: ${e.message}`));
    // O navegador cancela e refaz pedidos de mídia em pedaços; isso não é erro.
    page.on('requestfailed', (r) => { if (r.resourceType() !== 'media') erros.push(`pedido: ${r.url()}`); });
    page.on('response', (r) => { if (r.status() >= 400) erros.push(`http ${r.status()}: ${r.url()}`); });

    // O CSS entra antes de a página rodar: a captura nunca vê texto.
    await page.addInitScript((css) => {
      const por = () => {
        const estilo = document.createElement('style');
        estilo.textContent = css;
        document.head.append(estilo);
      };
      if (document.head) por();
      else document.addEventListener('DOMContentLoaded', por, { once: true });
    }, CSS_CAPTURA);

    const base = servidor.url.endsWith('/') ? servidor.url : `${servidor.url}/`;
    await page.goto(new URL('index.html?cena=inicio&rapido=4&mudo=1&nivel=alto', base).href);
    await page.waitForFunction(() => window.__carta?.ctx?.mundo || window.__carta?.erro, null, { timeout: 30000 });
    const erroBoot = await page.evaluate(() => window.__carta.erro);
    if (erroBoot) throw new Error(`a carta não iniciou: ${erroBoot}`);

    await page.waitForFunction(
      () => (window.__carta?.historico || []).some((h) => h.cena === 'inicio' && h.etapa === 'carta-espera'),
      null,
      { timeout: 90000, polling: 100 },
    ).catch(() => { throw new Error('a cena não chegou a inicio:carta-espera em 90 s'); });

    await page.mouse.move(LARGURA * px, ALTURA * py, { steps: 12 });

    if (perto !== 1) {
      // Encolhe a distância até o olho: posição = (posição − olho) × k + olho.
      await page.evaluate((k) => {
        const { mundo: m, estado } = window.__carta.ctx;
        const g = estado?.envelope?.grupo;
        if (!m?.ok || !g) return;
        m.camera.updateMatrixWorld();
        g.updateWorldMatrix(true, false);
        const olho = m.camera.getWorldPosition(new m.THREE.Vector3());
        const alvo = g.getWorldPosition(new m.THREE.Vector3()).sub(olho).multiplyScalar(k).add(olho);
        g.position.copy(g.parent ? g.parent.worldToLocal(alvo) : alvo);
      }, perto);
    }

    // Sem a aceleração de ?rapido daqui em diante: as pétalas caem no tempo dela.
    await page.evaluate(() => window.gsap?.globalTimeline.timeScale(1));
    await pausa(esperaMs);

    // O recorte quadrado do WhatsApp pega o meio: a carta vai para o centro.
    for (let passada = 0; passada < 3; passada++) {
      await page.evaluate((cy) => {
        const { mundo: m, estado } = window.__carta.ctx;
        const g = estado?.envelope?.grupo;
        if (!m?.ok || !g) return;
        const T = m.THREE;
        m.camera.updateMatrixWorld();
        g.updateWorldMatrix(true, true);
        const centro = new T.Box3().setFromObject(g).getCenter(new T.Vector3());
        const tela = m.mundoParaTela(centro);
        const olho = m.camera.getWorldPosition(new T.Vector3());
        // Profundidade ao longo do olhar e eixos da própria câmera: vale para
        // qualquer direção, não só para quem olha para −Z.
        const profundidade = centro.clone().sub(olho).dot(m.camera.getWorldDirection(new T.Vector3()));
        const mpp = (2 * profundidade * Math.tan(T.MathUtils.degToRad(m.camera.fov) / 2)) / innerHeight;
        const giro = m.camera.getWorldQuaternion(new T.Quaternion());
        const alvo = g.getWorldPosition(new T.Vector3())
          .addScaledVector(new T.Vector3(1, 0, 0).applyQuaternion(giro), (innerWidth / 2 - tela.x) * mpp)
          .addScaledVector(new T.Vector3(0, 1, 0).applyQuaternion(giro), (tela.y - innerHeight * cy) * mpp);
        g.position.copy(g.parent ? g.parent.worldToLocal(alvo) : alvo);
      }, centroY);
      await pausa(250);
    }
    await pausa(400);

    // Qualidade de 90 para baixo, de 4 em 4, até caber; para em 50.
    let qualidade = 90;
    let imagem = await page.screenshot({ type: 'jpeg', quality: qualidade });
    while (imagem.length > LIMITE && qualidade - 4 >= 50) {
      qualidade -= 4;
      imagem = await page.screenshot({ type: 'jpeg', quality: qualidade });
    }

    await mkdir(path.dirname(saida), { recursive: true });
    await writeFile(saida, imagem);
    console.log(`capa: ${path.relative(RAIZ, saida)} ${LARGURA}×${ALTURA}, ${Math.round(imagem.length / 1024)} KB, qualidade ${qualidade}`);
    if (imagem.length > LIMITE) console.log('aviso: mesmo na qualidade 50 a imagem passou de 200 KB; a prévia pode não aparecer no WhatsApp.');
    if (!(await page.evaluate(() => !!window.__carta.ctx.mundo?.ok))) console.log('aviso: sem WebGL, sem o envelope 3D; a imagem é o que estava na tela.');
    for (const erro of erros) console.log(`erro: ${erro}`);
    await contexto.close();
  } finally {
    await navegador?.close();
    await servidor.fechar();
  }
}

principal().catch((erro) => {
  console.error(`capa: ${erro.message}`);
  process.exitCode = 1;
});
