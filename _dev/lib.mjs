/* ============================================================================
   LIB: a biblioteca do harness de testes
   ============================================================================
   Sobe um servidor estático em 127.0.0.1 (porta livre), abre a carta num
   navegador de verdade (Playwright: Chromium ou WebKit), junta os erros e
   devolve uma sessão com as ações de teste. Também lê o js/content.js num vm
   (lerConteudo, senhaDoConteudo, temX, etapasDoFinal) e cuida dos vídeos de
   teste das cartas do chão (videosDeTeste, injetarVideos).

   Quem usa: ver.mjs, robustez.mjs, ver-bolso.mjs, ver-letra.mjs, capa.mjs,
   icone.mjs e alameda-imagem.mjs. O campo `letra` do content.js nunca é
   impresso por nada daqui.

   Variáveis de ambiente:
     CARTA_PW    pasta do pacote playwright (…\node_modules\playwright)
     CARTA_BASE  endereço do site publicado (sem servidor local)
   ========================================================================== */

import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createReadStream, existsSync, readFileSync, readdirSync } from 'node:fs';
import { stat, mkdir, rename, rm } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

export const RAIZ = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
export const PASTA_FOTOS = path.join(RAIZ, 'output', 'ver');
export const PASTA_VIDEO = path.join(RAIZ, 'output', 'video');

export const VIEWPORTS = {
  celular: { largura: 390, altura: 844, dpr: 3, toque: true },
  // O aparelho dela: iPhone 13 Pro Max.
  iphone: { largura: 428, altura: 926, dpr: 3, toque: true },
  // A área útil no Safari, com as barras: o tamanho que mais importa.
  'iphone-safari': { largura: 428, altura: 746, dpr: 3, toque: true },
  desktop: { largura: 1440, altura: 900, dpr: 1, toque: false },
};

export const ERRO_ESPERADO = /nao-existe\.mp4/;

const MOTORES = ['chromium', 'webkit'];
const UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
const UA_ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
// No Chromium, tenta a GPU de verdade (senão o WebGL roda em software e a medição de quadros não vale).
const ARGS_CHROMIUM = ['--enable-gpu', `--use-angle=${process.platform === 'win32' ? 'd3d11' : 'default'}`, '--ignore-gpu-blocklist'];
// O Playwright não é dependência do repositório: nesta máquina ele mora no "projeto integrador".
const PW_PADRAO = path.join(os.homedir(), 'Documents', 'projeto integrador', 'node_modules', 'playwright');
// Executáveis por revisão, na pasta ms-playwright (Windows), na ordem de preferência.
const EXECUTAVEIS = {
  chromium: [['chromium_headless_shell-', 'chrome-headless-shell-win64/chrome-headless-shell.exe'], ['chromium-', 'chrome-win64/chrome.exe']],
  webkit: [['webkit-', 'Playwright.exe']],
};

const ESPERA_BOOT = 30000;
const ESPERA_CAMPO = 20000;
const ESPERA_FAIXA = 8000;
const ESPERA_ACIONAR = 20000;
const INTERVALO_TECLA = 40;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
};

const pausa = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const aparar = (v) => (typeof v === 'string' ? v.trim() : '');

/* ---- o Playwright ----------------------------------------------------------- */

let playwright = null;

/**
 * Carrega o Playwright, nesta ordem: CARTA_PW (a pasta do pacote), PW_PADRAO
 * (~/Documents/projeto integrador/node_modules/playwright) e require('playwright').
 *
 * Revisão dos navegadores: cada versão do pacote espera uma revisão exata em
 * ms-playwright (o 1.63 pede chromium-1243 e webkit-2359; esta máquina tem
 * chromium-1255, chromium_headless_shell-1255 e webkit-2388). Quando a revisão
 * esperada não existe, o launch de cada motor passa a usar, por executablePath,
 * a revisão instalada mais nova do mesmo navegador (testado: o 1.63 abre as
 * duas). Um executablePath passado por quem chama tem a última palavra.
 * O vídeo (--video) precisa do ffmpeg da revisão do pacote (o 1.63 pede o
 * ffmpeg-1011): sem ele, aponte CARTA_PW para um pacote cuja revisão exista.
 */
export function carregarPlaywright() {
  if (playwright) return playwright;
  const requerer = createRequire(import.meta.url);
  for (const nome of [process.env.CARTA_PW, PW_PADRAO, 'playwright']) {
    if (!nome) continue;
    try {
      playwright = requerer(nome);
      break;
    } catch {
      /* tenta o próximo */
    }
  }
  if (!playwright) {
    throw new Error('Playwright não encontrado. Defina CARTA_PW com a pasta do pacote, por exemplo: set CARTA_PW=C:\\caminho\\node_modules\\playwright');
  }
  for (const motor of MOTORES) acertarRevisao(playwright[motor], motor);
  return playwright;
}

function acertarRevisao(tipo, motor) {
  if (!tipo || tipo.__revisaoAcertada) return;
  tipo.__revisaoAcertada = true;
  let esperado = '';
  try {
    esperado = tipo.executablePath();
  } catch {
    /* o pacote não sabe onde fica */
  }
  if (esperado && existsSync(esperado)) return;
  const achado = navegadorInstalado(motor);
  if (!achado) return; // o launch explica o que falta
  const lancar = tipo.launch.bind(tipo);
  tipo.launch = (opcoes = {}) => lancar({ executablePath: achado, ...opcoes });
}

function pastaDosNavegadores() {
  const definida = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (definida && definida !== '0') return definida;
  if (process.platform === 'win32') return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'ms-playwright');
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright');
  return path.join(os.homedir(), '.cache', 'ms-playwright');
}

function navegadorInstalado(motor) {
  const pasta = pastaDosNavegadores();
  let nomes = [];
  try {
    nomes = readdirSync(pasta);
  } catch {
    return null;
  }
  for (const [prefixo, exe] of EXECUTAVEIS[motor] || []) {
    const achado = nomes
      .filter((n) => n.startsWith(prefixo) && /^\d+$/.test(n.slice(prefixo.length)))
      .sort((a, b) => Number(b.slice(prefixo.length)) - Number(a.slice(prefixo.length)))
      .map((n) => path.join(pasta, n, exe))
      .find((caminho) => existsSync(caminho));
    if (achado) return achado;
  }
  return null;
}

/* ---- o servidor ------------------------------------------------------------- */

/** Servidor estático da raiz (inteira, sem cache), com Range: o WebKit não toca áudio sem ele. */
export function subirServidor(raiz = RAIZ) {
  const base = path.resolve(raiz);
  const servidor = http.createServer((req, res) => {
    responder(req, res, base).catch(() => {
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('500');
    });
  });
  return new Promise((resolve, reject) => {
    servidor.once('error', reject);
    servidor.listen(0, '127.0.0.1', () => {
      const porta = servidor.address().port;
      resolve({
        porta,
        url: `http://127.0.0.1:${porta}`,
        fechar: () => new Promise((fim) => {
          servidor.closeAllConnections?.();
          servidor.close(() => fim());
        }),
      });
    });
  });
}

async function responder(req, res, base) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    res.end();
    return;
  }
  const caminho = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
  let arquivo = path.resolve(base, `.${caminho}`);
  if (arquivo !== base && !arquivo.startsWith(base + path.sep)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403');
    return;
  }
  let info = await stat(arquivo).catch(() => null);
  if (info?.isDirectory()) {
    arquivo = path.join(arquivo, 'index.html');
    info = await stat(arquivo).catch(() => null);
  }
  if (!info?.isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end('404');
    return;
  }

  const tamanho = info.size;
  const cabecalho = {
    'Content-Type': MIME[path.extname(arquivo).toLowerCase()] || 'application/octet-stream',
    'Cache-Control': 'no-store',
    'Accept-Ranges': 'bytes',
  };
  let inicio = 0;
  let fim = tamanho - 1;
  let status = 200;
  const pedido = req.headers.range;
  if (pedido) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(pedido.trim());
    if (m && m[1]) {
      inicio = Number(m[1]);
      if (m[2]) fim = Math.min(Number(m[2]), tamanho - 1);
    } else if (m && m[2]) {
      inicio = Math.max(0, tamanho - Number(m[2]));
    }
    if (!m || (!m[1] && !m[2]) || inicio > fim || inicio >= tamanho) {
      res.writeHead(416, { 'Content-Range': `bytes */${tamanho}`, 'Cache-Control': 'no-store' });
      res.end();
      return;
    }
    status = 206;
    cabecalho['Content-Range'] = `bytes ${inicio}-${fim}/${tamanho}`;
  }
  cabecalho['Content-Length'] = tamanho ? fim - inicio + 1 : 0;
  res.writeHead(status, cabecalho);
  if (req.method === 'HEAD' || !tamanho) {
    res.end();
    return;
  }
  createReadStream(arquivo, { start: inicio, end: fim }).on('error', () => res.destroy()).pipe(res);
}

/* ---- o conteúdo ------------------------------------------------------------- */

// Vídeos de teste nas cartas do chão com nome, em ciclo (a mesma regra do
// diretor: chao-N é a N-ésima carta com nome). Roda no Node e, como texto, na página.
function porVideos(conteudo, videos, midias) {
  const chao = conteudo && conteudo.cartasChao;
  if (!chao) return;
  const lista = Array.isArray(videos) ? videos : [];
  let n = 0;
  for (const item of Array.isArray(chao.itens) ? chao.itens : []) {
    if (lista.length && item && typeof item.nome === 'string' && item.nome.trim()) {
      item.video = lista[n % lista.length];
      n += 1;
    }
  }
  if (midias && chao.surpresinha) chao.surpresinha.midias = midias;
}

/** Avalia js/content.js num vm (window = {}). Um erro de sintaxe ali derruba o harness. */
export function lerConteudo(videos = null) {
  const codigo = readFileSync(path.join(RAIZ, 'js', 'content.js'), 'utf8');
  const caixa = { window: {} };
  runInNewContext(codigo, caixa, { filename: 'js/content.js' });
  const conteudo = caixa.window.CONTEUDO || {};
  if (Array.isArray(videos) && videos.length) porVideos(conteudo, videos, null);
  return conteudo;
}

/** A senha que os testes digitam: a mestra (vale em qualquer dia) ou o código. */
export function senhaDoConteudo(conteudo = lerConteudo()) {
  const senha = conteudo?.senha || {};
  return aparar(senha.mestra) || aparar(senha.codigo);
}

export function contarCartas(conteudo) {
  const chao = conteudo?.cartasChao || {};
  const amigos = (Array.isArray(chao.itens) ? chao.itens : []).filter((item) => aparar(item?.nome)).length;
  return amigos + (aparar(chao.surpresinha?.nome) ? 1 : 0);
}

export function temCartas(conteudo) {
  return contarCartas(conteudo) > 0;
}

export function temEncontro(conteudo) {
  const quadros = conteudo?.encontro?.quadros;
  return Array.isArray(quadros) && quadros.some((q) => aparar(q?.imagem));
}

export function temContador(conteudo) {
  return /^\d{4}-\d{1,2}-\d{1,2}$/.test(aparar(conteudo?.contador?.nascimento));
}

export function temResposta(conteudo) {
  const r = conteudo?.resposta;
  return !!r && typeof r === 'object' && r.ativa !== false;
}

export function etapasDoFinal(conteudo = lerConteudo()) {
  return [
    'carta-chegando', 'carta-espera', 'carta-abrindo', 'desdobrando', 'escrevendo',
    ...(temContador(conteudo) ? ['contador'] : []),
    ...(temResposta(conteudo) ? ['resposta'] : []),
    'fim',
  ];
}

export function temMenu(conteudo) {
  const m = conteudo?.menu;
  return !!m && typeof m === 'object' && !Array.isArray(m);
}

/** Os .mp4 da pasta, em ordem, com o caminho a partir da raiz (a pasta precisa estar dentro dela). */
export function videosDeTeste(pasta, { falho = false } = {}) {
  const absoluta = existsSync(path.resolve(pasta)) ? path.resolve(pasta) : path.resolve(RAIZ, pasta);
  const relativo = (nome) => path.relative(RAIZ, path.join(absoluta, nome)).split(path.sep).join('/');
  const lista = readdirSync(absoluta)
    .filter((nome) => /\.mp4$/i.test(nome))
    .sort((a, b) => a.localeCompare(b))
    .map(relativo);
  if (falho) lista.push(relativo('nao-existe.mp4'));
  return lista;
}

/** Acrescenta ao js/content.js servido o código que põe os vídeos nas cartas (o arquivo não muda). */
export function injetarVideos(page, videos, midias = null) {
  return page.route('**/js/content.js', async (rota) => {
    const resposta = await rota.fetch();
    const corpo = await resposta.text();
    await rota.fulfill({
      response: resposta,
      body: `${corpo}\n;(${porVideos})(window.CONTEUDO, ${JSON.stringify(videos || [])}, ${JSON.stringify(midias)});\n`,
    });
  });
}

/* ---- a sessão --------------------------------------------------------------- */

// Repete uma consulta na página até ela devolver algo verdadeiro. Sobrevive a
// recargas (o contexto de execução some e volta).
async function esperarNaPagina(page, fn, arg, timeout, descrever) {
  const fim = Date.now() + timeout;
  for (;;) {
    try {
      const valor = await page.evaluate(fn, arg);
      if (valor) return valor;
    } catch {
      /* a página está trocando: tenta de novo */
    }
    if (Date.now() > fim) throw new Error(typeof descrever === 'function' ? await descrever() : descrever);
    await pausa(50);
  }
}

function montarEndereco(base, cena, params) {
  const busca = new URLSearchParams();
  if (cena !== undefined && cena !== null && cena !== false) busca.set('cena', String(cena));
  for (const [chave, valor] of Object.entries(params || {})) {
    if (valor === false || valor === null || valor === undefined) continue;
    busca.set(chave, String(valor));
  }
  return `${base}/index.html?${busca}`;
}

/** Abre a carta e devolve a sessão de teste. */
export async function abrir({ cena, vp = 'celular', motor = 'chromium', params = {}, video = false, preparar = null, entrar = false } = {}) {
  const perfilBase = VIEWPORTS[vp];
  if (!perfilBase) throw new Error(`vp desconhecido: ${vp} (use ${Object.keys(VIEWPORTS).join(', ')})`);
  if (!MOTORES.includes(motor)) throw new Error(`motor desconhecido: ${motor} (use ${MOTORES.join(' ou ')})`);
  const perfil = { nome: vp, motor, ...perfilBase };

  const pw = carregarPlaywright();
  const servidor = process.env.CARTA_BASE ? null : await subirServidor();
  let navegador = null;
  let contexto = null;
  let page = null;
  const fecharTudo = async () => {
    await contexto?.close().catch(() => {});
    await navegador?.close().catch(() => {});
    await servidor?.fechar().catch(() => {});
  };

  try {
    navegador = await pw[motor].launch({ headless: true, args: motor === 'chromium' ? ARGS_CHROMIUM : [] });
    const opcoes = {
      viewport: { width: perfil.largura, height: perfil.altura },
      deviceScaleFactor: perfil.dpr,
      hasTouch: perfil.toque,
      isMobile: perfil.toque,
      locale: 'pt-BR',
    };
    if (perfil.toque) opcoes.userAgent = motor === 'webkit' ? UA_IPHONE : UA_ANDROID;
    if (video) {
      await mkdir(PASTA_VIDEO, { recursive: true });
      opcoes.recordVideo = { dir: PASTA_VIDEO, size: { width: perfil.largura, height: perfil.altura } };
    }
    contexto = await navegador.newContext(opcoes);
    page = await contexto.newPage();
  } catch (erro) {
    await fecharTudo();
    if (video && /ffmpeg/i.test(String(erro?.message))) {
      throw new Error('o vídeo precisa do ffmpeg da revisão deste Playwright; aponte CARTA_PW para um pacote cujo ffmpeg esteja em ms-playwright (o do npx 1.66 serve)');
    }
    throw erro;
  }

  const erros = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') erros.push({ tipo: 'console', texto: msg.text() });
  });
  page.on('pageerror', (erro) => erros.push({ tipo: 'excecao', texto: erro?.message || String(erro) }));
  page.on('requestfailed', (pedido) => {
    const falha = pedido.failure()?.errorText || '';
    // O navegador cancela e refaz pedidos de mídia em pedaços; isso não é erro.
    if (pedido.resourceType() === 'media' && /abort|cancel/i.test(falha)) return;
    erros.push({ tipo: 'pedido', texto: `${falha} ${pedido.url()}` });
  });
  page.on('response', (resposta) => {
    if (resposta.status() >= 400) erros.push({ tipo: 'http', texto: `${resposta.status()} ${resposta.url()}` });
  });

  const base = process.env.CARTA_BASE ? process.env.CARTA_BASE.replace(/\/+$/, '') : servidor.url;
  const endereco = montarEndereco(base, cena, params);
  let fechada = false;

  const sessao = {
    page,
    perfil,
    endereco,
    gpu: '',
    amb: null,
    erros,
    pausa,

    estado() {
      return page.evaluate(() => ({ cena: window.__carta?.cena ?? null, etapa: window.__carta?.etapa ?? null }));
    },

    /** Espera a etapa ('etapa' ou 'cena:etapa') aparecer no histórico. */
    esperarEtapa(nome, timeout = 60000) {
      return esperarNaPagina(page, (alvo) => {
        const historico = window.__carta?.historico || [];
        return historico.some((h) => (alvo.includes(':') ? `${h.cena}:${h.etapa}` : h.etapa) === alvo);
      }, nome, timeout, async () => {
        const agora = await sessao.estado().catch(() => ({}));
        return `a etapa ${nome} não chegou em ${Math.round(timeout / 1000)} s (está em ${agora.cena}:${agora.etapa})`;
      });
    },

    async digitarSenha(codigo = senhaDoConteudo()) {
      const campo = page.locator('input[data-acao="senha"]').filter({ visible: true }).first();
      await campo.waitFor({ state: 'visible', timeout: ESPERA_CAMPO });
      if (perfil.toque) await campo.tap();
      else await campo.click();
      await page.keyboard.type(codigo, { delay: INTERVALO_TECLA });
    },

    async passarEntrada(timeout = 30000) {
      if ((await sessao.estado()).cena === 'senha') await sessao.digitarSenha();
      await sessao.esperarEtapa('musica:musica', timeout);
      const faixa = page.locator('[data-acao="faixa"]').filter({ visible: true }).first();
      const temFaixa = await faixa.waitFor({ state: 'visible', timeout: ESPERA_FAIXA }).then(() => true, () => false);
      if (temFaixa) {
        await sessao.acionar('[data-acao="faixa"]');
        await sessao.acionar('[data-acao="continuar"]');
      }
      await sessao.esperarEtapa('musica:entrando', timeout);
    },

    async abrirDaBolsa(id) {
      await sessao.acionar('[data-acao="inventario"]');
      await esperarNaPagina(page, () => !!document.querySelector('#inventario[data-aberto]'), null, 10000, 'a bolsa não abriu');
      await sessao.acionar(`[data-acao="inventario-item"][data-id="${id}"]`);
      await esperarNaPagina(page, () => !!(
        document.querySelector('.carta-chao-visor')
        || document.querySelector('#pergaminho[data-estado="aberto"]')
        || document.querySelector('#voz[data-aberto]')
      ), null, 20000, `o item ${id} da bolsa não abriu`);
    },

    async fecharDaBolsa(timeout = 30000) {
      const aberto = await page.evaluate(() => ({
        visor: !!document.querySelector('.carta-chao-visor'),
        voz: !!document.querySelector('#voz[data-aberto]'),
      }));
      if (aberto.visor) {
        await sessao.acionar('[data-acao="fechar-carta"]', timeout);
      } else if (aberto.voz) {
        await sessao.acionar('[data-acao="voz-fechar"]', timeout);
      } else {
        await page.evaluate(() => {
          const rolagem = window.__carta?.ctx?.pergaminho?.rolagem;
          if (rolagem?.el) rolagem.irPara(rolagem.el.scrollHeight, { imediato: true });
        });
        await pausa(250);
        await sessao.acionar('[data-acao="fechar-capitulo"]', timeout);
      }
      await esperarNaPagina(page, () => {
        const perg = document.getElementById('pergaminho');
        return !window.__carta?.ctx?.inventario?.aberto
          && (!perg || perg.hidden)
          && !document.querySelector('.carta-chao-visor')
          && !document.querySelector('#voz[data-aberto]');
      }, null, timeout, 'a bolsa não ficou livre depois de fechar');
    },

    async foto(nome, { cheia = false } = {}) {
      await mkdir(PASTA_FOTOS, { recursive: true });
      const arquivo = path.join(PASTA_FOTOS, `${nome}.png`);
      await page.screenshot({ path: arquivo, scale: cheia ? 'device' : 'css' });
      return arquivo;
    },

    async tocar(x, y) {
      if (perfil.toque) await page.touchscreen.tap(x, y);
      else await page.mouse.click(x, y);
    },

    async tocarCentro() {
      const tela = page.viewportSize() || { width: perfil.largura, height: perfil.altura };
      await sessao.tocar(tela.width / 2, tela.height / 2);
    },

    /** Toca (ou clica) no primeiro elemento visível do seletor. */
    async acionar(seletor, timeout = ESPERA_ACIONAR) {
      const alvo = page.locator(seletor).filter({ visible: true }).first();
      await alvo.waitFor({ state: 'visible', timeout });
      if (perfil.toque) await alvo.tap({ timeout });
      else await alvo.click({ timeout });
    },

    /** Mede os quadros da página (requestAnimationFrame). Numa aba oculta mede pouco. */
    medirQuadros(ms = 2000) {
      return page.evaluate((duracao) => new Promise((resolve) => {
        const marcas = [];
        const inicio = performance.now();
        const passo = (t) => {
          marcas.push(t);
          if (t - inicio < duracao) {
            requestAnimationFrame(passo);
            return;
          }
          const intervalos = marcas.slice(1).map((m, i) => m - marcas[i]);
          const um = (v) => Math.round(v * 10) / 10;
          if (!intervalos.length) {
            resolve({ fpsMedio: 0, p95ms: 0, pioresMs: [], quadros: 0 });
            return;
          }
          const media = intervalos.reduce((a, b) => a + b, 0) / intervalos.length;
          const ordem = [...intervalos].sort((a, b) => a - b);
          resolve({
            fpsMedio: um(1000 / media),
            p95ms: um(ordem[Math.min(ordem.length - 1, Math.floor(ordem.length * 0.95))]),
            pioresMs: ordem.slice(-5).reverse().map(um),
            quadros: intervalos.length,
          });
        };
        requestAnimationFrame(passo);
      }), ms);
    },

    /** Fecha contexto, navegador e servidor. Com vídeo, renomeia para `nomeVideo.webm` e devolve o caminho. */
    async fechar(nomeVideo = null) {
      if (fechada) return null;
      fechada = true;
      const gravacao = page.video();
      await fecharTudo();
      if (!gravacao) return null;
      const origem = await gravacao.path().catch(() => null);
      if (!origem || !nomeVideo) return origem;
      const destino = path.join(PASTA_VIDEO, `${nomeVideo}.webm`);
      await rm(destino, { force: true });
      await rename(origem, destino);
      return destino;
    },
  };

  try {
    if (preparar) await preparar(page);
    await page.goto(endereco, { waitUntil: 'domcontentloaded' });
    // Pelo link limpo o mundo chega depois do ctx, atrás da tela preta: espera os dois.
    const boot = await esperarNaPagina(page, () => {
      const c = window.__carta;
      if (c?.erro) return { erro: c.erro };
      return c?.ctx?.mundo ? { erro: null } : null;
    }, null, ESPERA_BOOT, 'a carta não iniciou: o mundo não chegou em 30 s');
    if (boot.erro) throw new Error(`a carta não iniciou: ${boot.erro}`);
    const leitura = await page.evaluate(() => {
      const a = window.__carta.ctx.amb || {};
      return {
        gpu: window.__carta.gpu || window.__carta.ctx.mundo?.gpu || '',
        amb: { webgl: a.webgl, nivel: a.nivel, reduzido: a.reduzido, toque: a.toque, ios: a.ios, dprMax: a.dprMax, rapido: a.rapido },
      };
    });
    sessao.gpu = leitura.gpu;
    sessao.amb = leitura.amb;
    if (entrar && !cena) await sessao.passarEntrada();
  } catch (erro) {
    await sessao.fechar();
    throw erro;
  }
  return sessao;
}
