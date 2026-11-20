// Ferramenta de verificação: sobe um servidor estático embutido e abre a carta
// num navegador de verdade (Playwright), com tudo o que um teste precisa.
//
//   import { abrir } from './lib.mjs';
//   const s = await abrir({ cena: 'poppy', vp: 'celular', motor: 'chromium', params: { rapido: 6 } });
//   await s.esperarEtapa('lendo');
//   await s.foto('poppy-lendo');
//   console.log(await s.medirQuadros(2000), s.erros);
//   await s.fechar();
//
// O Playwright é procurado em process.env.CARTA_PW; se não houver, no caminho
// padrão da sessão; por último, num `playwright` instalado normalmente.

import http from 'node:http';
import { createReadStream, existsSync, readFileSync, readdirSync } from 'node:fs';
import { stat, mkdir, rename } from 'node:fs/promises';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Raiz do repositório atual (funciona em qualquer cópia: é relativa a este arquivo). */
export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PASTA_FOTOS = path.join(RAIZ, 'output', 'ver');
export const PASTA_VIDEO = path.join(RAIZ, 'output', 'video');

const PW_PADRAO = 'C:/Users/uly/AppData/Local/Temp/claude/9d95b957e07facb6/b62111e5-c8c2-47bd-a4df-034a0239f686/scratchpad/pw/node_modules/playwright';

export const VIEWPORTS = {
  celular: { largura: 390, altura: 844, dpr: 3, toque: true },
  // O aparelho dela: iPhone 13 Pro Max. Tela 428×926 pt, DPR 3; no Safari, com as barras
  // de endereço e de baixo, a área útil fica perto de 428×746.
  iphone: { largura: 428, altura: 926, dpr: 3, toque: true },
  'iphone-safari': { largura: 428, altura: 746, dpr: 3, toque: true },
  desktop: { largura: 1440, altura: 900, dpr: 1, toque: false },
};

const UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
const UA_ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};

export function carregarPlaywright() {
  const require = createRequire(import.meta.url);
  const candidatos = [process.env.CARTA_PW, PW_PADRAO, 'playwright'].filter(Boolean);
  let ultimoErro = null;
  for (const candidato of candidatos) {
    try {
      if (candidato !== 'playwright' && !existsSync(candidato)) continue;
      return require(candidato);
    } catch (erro) {
      ultimoErro = erro;
    }
  }
  throw new Error(`Playwright não encontrado. Defina CARTA_PW com o caminho de node_modules/playwright.\n${ultimoErro || ''}`);
}

/**
 * Servidor estático: porta livre, tipos MIME corretos, sem cache e com suporte a
 * Range (o Safari/WebKit não toca áudio sem isso).
 */
export function subirServidor(raiz = RAIZ) {
  const servidor = http.createServer(async (pedido, resposta) => {
    try {
      const url = new URL(pedido.url, 'http://local');
      let relativo = decodeURIComponent(url.pathname);
      if (relativo.endsWith('/')) relativo += 'index.html';
      const arquivo = path.resolve(raiz, `.${relativo}`);
      if (arquivo !== raiz && !arquivo.startsWith(raiz + path.sep)) {
        resposta.writeHead(403).end();
        return;
      }
      const info = await stat(arquivo).catch(() => null);
      if (!info || !info.isFile()) {
        resposta.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }).end('404');
        return;
      }

      const cabecalhos = {
        'Content-Type': MIME[path.extname(arquivo).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-store',
        'Accept-Ranges': 'bytes',
      };

      const faixa = /^bytes=(\d*)-(\d*)$/.exec(pedido.headers.range || '');
      if (faixa && (faixa[1] || faixa[2])) {
        let inicio = faixa[1] ? Number(faixa[1]) : Math.max(0, info.size - Number(faixa[2]));
        let fim = faixa[1] && faixa[2] ? Math.min(Number(faixa[2]), info.size - 1) : info.size - 1;
        if (inicio > fim || inicio >= info.size) {
          resposta.writeHead(416, { ...cabecalhos, 'Content-Range': `bytes */${info.size}` }).end();
          return;
        }
        resposta.writeHead(206, {
          ...cabecalhos,
          'Content-Range': `bytes ${inicio}-${fim}/${info.size}`,
          'Content-Length': fim - inicio + 1,
        });
        if (pedido.method === 'HEAD') { resposta.end(); return; }
        createReadStream(arquivo, { start: inicio, end: fim }).pipe(resposta);
        return;
      }

      resposta.writeHead(200, { ...cabecalhos, 'Content-Length': info.size });
      if (pedido.method === 'HEAD') { resposta.end(); return; }
      createReadStream(arquivo).pipe(resposta);
    } catch (erro) {
      resposta.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' }).end(String(erro));
    }
  });

  return new Promise((resolver, rejeitar) => {
    servidor.once('error', rejeitar);
    servidor.listen(0, '127.0.0.1', () => {
      const { port } = servidor.address();
      resolver({
        porta: port,
        url: `http://127.0.0.1:${port}`,
        fechar: () => new Promise((ok) => { servidor.closeAllConnections?.(); servidor.close(() => ok()); }),
      });
    });
  });
}

/**
 * O content.js como a página vê (window.CONTEUDO), avaliado aqui no Node.
 * `videos` (opcional) põe vídeos nas cartas do chão, como injetarVideos faz na página.
 */
export function lerConteudo(videos = null) {
  const janela = {};
  vm.runInNewContext(readFileSync(path.join(RAIZ, 'js', 'content.js'), 'utf8'), { window: janela });
  const c = janela.CONTEUDO || {};
  if (videos && c.cartasChao && Array.isArray(c.cartasChao.itens)) {
    c.cartasChao.itens.forEach((item, i) => { if (videos[i]) item.video = videos[i]; });
  }
  return c;
}

/** A senha do content.js ('' = a carta abre sem pedir). */
export function senhaDoConteudo(conteudo = lerConteudo()) {
  // A senha mestra abre em qualquer dia; a dela só a partir de senha.liberaEm.
  const codigo = conteudo && conteudo.senha && (conteudo.senha.mestra || conteudo.senha.codigo);
  return typeof codigo === 'string' ? codigo.trim() : '';
}

/** Quantas cartas há no chão (= cartasDoChao do diretor: amigos com nome + Surpresinha). */
export function contarCartas(conteudo) {
  const d = (conteudo && conteudo.cartasChao) || {};
  const amigos = (Array.isArray(d.itens) ? d.itens : []).filter((i) => i && typeof i.nome === 'string' && i.nome.trim()).length;
  const surpresa = d.surpresinha && typeof d.surpresinha.nome === 'string' && d.surpresinha.nome.trim() ? 1 : 0;
  return amigos + surpresa;
}
/** A cena das cartas do chão existe? (= temCartas do diretor) */
export function temCartas(conteudo) {
  return contarCartas(conteudo) > 0;
}

/** A cena do encontro existe? (= temEncontro do diretor) */
export function temEncontro(conteudo) {
  const quadros = conteudo && conteudo.encontro && conteudo.encontro.quadros;
  return Array.isArray(quadros) && quadros.some((q) => q && typeof q.imagem === 'string' && q.imagem.trim());
}

/** O contador dos dias existe? (contador.nascimento com uma data 'AAAA-MM-DD') */
export function temContador(conteudo) {
  const n = conteudo && conteudo.contador && conteudo.contador.nascimento;
  return typeof n === 'string' && /^\s*\d{4}-\d{1,2}-\d{1,2}\s*$/.test(n);
}
/** A folha em que ela escreve de volta existe? (a seção resposta do content.js) */
export function temResposta(conteudo) {
  const r = conteudo && conteudo.resposta;
  return !!r && r.ativa !== false;
}
/** As etapas da cena final, conforme o content.js. */
export function etapasDoFinal(conteudo = lerConteudo()) {
  return ['carta-chegando', 'carta-espera', 'carta-abrindo', 'desdobrando', 'escrevendo',
    ...(temContador(conteudo) ? ['contador'] : []), ...(temResposta(conteudo) ? ['resposta'] : []), 'fim'];
}

/**
 * Vídeos de teste para as cartas do chão: o caminho (relativo à raiz) de cada .mp4
 * da pasta, na ordem; a carta 1 recebe o primeiro, a 2 o segundo... Com `falho`,
 * mais um vídeo que não existe (o 404 é esperado; ver ERRO_ESPERADO).
 */
export function videosDeTeste(pasta, { falho = false } = {}) {
  const absoluta = path.resolve(RAIZ, pasta);
  const relativa = path.relative(RAIZ, absoluta).split(path.sep).join('/');
  const videos = readdirSync(absoluta).filter((a) => a.toLowerCase().endsWith('.mp4')).sort().map((a) => `${relativa}/${a}`);
  if (falho) videos.push(`${relativa}/nao-existe.mp4`);
  return videos;
}
/** O 404 do vídeo que falta de propósito (videosDeTeste com falho). */
export const ERRO_ESPERADO = /nao-existe\.mp4/;

/**
 * Põe vídeos nas cartas do chão do content.js servido à página, sem tocar no arquivo.
 * Chame dentro de `preparar(page)`.
 */
export async function injetarVideos(page, videos, midias = null) {
  const original = readFileSync(path.join(RAIZ, 'js', 'content.js'), 'utf8');
  // `midias` (opcional): a lista da Surpresinha, [{ foto | video, legenda }], para ver a galeria cheia.
  const corpo = `${original}
;(function (v, m) { var d = window.CONTEUDO.cartasChao || {}; (d.itens || []).forEach(function (item, i) { if (v[i]) item.video = v[i]; }); if (m && d.surpresinha) d.surpresinha.midias = m; })(${JSON.stringify(videos || [])}, ${JSON.stringify(midias)});
`;
  await page.route(/\/js\/content\.js(\?.*)?$/, (rota) => rota.fulfill({
    status: 200, contentType: 'text/javascript; charset=utf-8', body: corpo, headers: { 'Cache-Control': 'no-store' },
  }));
}

/**
 * Abre a carta.
 *   cena    'senha' | 'musica' | 'inicio' | 'poppy' | 'carta2' | 'yourname' | 'mao' | 'cartas' | 'encontro' | 'final'
 *           (omitido = o começo de verdade: a tela preta da senha)
 *   entrar  true: sem `cena`, já digita a senha e escolhe a música (a sessão é entregue
 *           a caminho de inicio:frases, com a música tocando). Para testes que não são
 *           sobre a entrada.
 *   vp      'celular' (390×844, DPR 3, toque) | 'desktop' (1440×900)
 *   motor   'chromium' | 'webkit'
 *   params  parâmetros extras do endereço: { rapido: 6, webgl: 0, reduzido: 1, nivel: 'baixo', mudo: 1 }
 *   video   true grava em output/video/
 *   preparar  async (page) => {} chamado antes de carregar a página (para page.route, addInitScript etc.)
 */
export async function abrir({ cena, vp = 'celular', motor = 'chromium', params = {}, video = false, preparar = null, entrar = false } = {}) {
  const perfil = VIEWPORTS[vp];
  if (!perfil) throw new Error(`vp desconhecido: ${vp}`);
  const pw = carregarPlaywright();
  if (!pw[motor]) throw new Error(`motor desconhecido: ${motor}`);

  const servidor = await subirServidor();
  const navegador = await pw[motor].launch({
    headless: true,
    // No Chromium, tenta a GPU de verdade (senão o WebGL roda em software e a medição de quadros não vale).
    args: motor === 'chromium' ? ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist'] : [],
  });

  const tamanho = { width: perfil.largura, height: perfil.altura };
  const opcoesContexto = {
    viewport: tamanho,
    deviceScaleFactor: perfil.dpr,
    hasTouch: perfil.toque,
    locale: 'pt-BR',
  };
  if (perfil.toque) {
    opcoesContexto.isMobile = true;
    opcoesContexto.userAgent = motor === 'webkit' ? UA_IPHONE : UA_ANDROID;
  }
  if (video) {
    await mkdir(PASTA_VIDEO, { recursive: true });
    opcoesContexto.recordVideo = { dir: PASTA_VIDEO, size: tamanho };
  }

  const contexto = await navegador.newContext(opcoesContexto);
  const page = await contexto.newPage();

  // ---- erros: console.error + exceções + pedidos que falharam ---------------------
  const erros = [];
  let fechando = false;
  page.on('console', (msg) => {
    if (msg.type() === 'error') erros.push({ tipo: 'console', texto: msg.text(), onde: msg.location()?.url || '' });
  });
  page.on('pageerror', (erro) => erros.push({ tipo: 'excecao', texto: String(erro?.stack || erro) }));
  page.on('requestfailed', (pedido) => {
    if (fechando) return;
    const falha = pedido.failure()?.errorText || '';
    // O navegador cancela e refaz pedidos de mídia em pedaços; isso não é erro.
    if (pedido.resourceType() === 'media' && /abort|cancel/i.test(falha)) return;
    erros.push({ tipo: 'pedido', texto: `${pedido.url()} ${falha}` });
  });
  page.on('response', (resposta) => {
    if (resposta.status() >= 400) erros.push({ tipo: 'http', texto: `${resposta.status()} ${resposta.url()}` });
  });

  const consulta = new URLSearchParams();
  if (cena) consulta.set('cena', cena);
  for (const [chave, valor] of Object.entries(params)) {
    if (valor !== undefined && valor !== null && valor !== false) consulta.set(chave, String(valor));
  }
  // CARTA_BASE=https://ulystreak.github.io/23.12 testa o site publicado em vez do servidor local.
  const base = (process.env.CARTA_BASE || servidor.url).replace(/\/$/, '');
  const endereco = `${base}/index.html${consulta.size ? `?${consulta}` : ''}`;

  if (preparar) await preparar(page);
  await page.goto(endereco, { waitUntil: 'load' });
  await page.waitForFunction(() => !!(window.__carta && (window.__carta.ctx || window.__carta.erro)), null, { timeout: 30000 });
  const falhaBoot = await page.evaluate(() => window.__carta.erro);
  if (falhaBoot) {
    await contexto.close().catch(() => {});
    await navegador.close().catch(() => {});
    await servidor.fechar();
    throw new Error(`a carta não iniciou: ${falhaBoot}`);
  }
  const gpu = await page.evaluate(() => window.__carta.gpu || '');
  const amb = await page.evaluate(() => {
    const a = window.__carta.ctx.amb;
    return { webgl: a.webgl, nivel: a.nivel, reduzido: a.reduzido, toque: a.toque, ios: a.ios, dprMax: a.dprMax, rapido: a.rapido };
  });

  const pausa = (ms) => new Promise((ok) => setTimeout(ok, ms));

  const sessao = {
    page,
    perfil,
    endereco,
    gpu,          // texto do renderer WebGL ('' no modo leve)
    amb,
    erros,
    pausa,

    /** Espera a etapa acontecer (mesmo que já tenha passado). Aceita 'etapa' ou 'cena:etapa'. */
    async esperarEtapa(nome, timeout = 60000) {
      await page.waitForFunction((alvo) => {
        const c = window.__carta;
        if (!c) return false;
        const [cenaAlvo, etapaAlvo] = alvo.includes(':') ? alvo.split(':') : [null, alvo];
        return c.historico.some((h) => h.etapa === etapaAlvo && (!cenaAlvo || h.cena === cenaAlvo));
      }, nome, { timeout, polling: 50 });
    },

    /** Digita a senha do content.js no campo da tela preta (etapa senha:senha). */
    async digitarSenha(codigo = senhaDoConteudo()) {
      const campo = page.locator('[data-acao="senha"]').first();
      await campo.waitFor({ state: 'visible', timeout: 20000 });
      if (perfil.toque) await campo.tap(); else await campo.click();
      await page.keyboard.type(codigo, { delay: 40 });
    },

    /** Da tela preta até o mundo: senha (se houver), música e continuar. Só no começo de verdade. */
    async passarEntrada(timeout = 30000) {
      const cenaAgora = await page.evaluate(() => window.__carta.cena);
      if (cenaAgora === 'senha') {
        await sessao.esperarEtapa('senha:senha', timeout);
        await sessao.digitarSenha();
      } else if (cenaAgora !== 'musica') return;
      await sessao.esperarEtapa('musica:musica', timeout);
      const temFaixa = await page.locator('[data-acao="faixa"]').first().waitFor({ state: 'visible', timeout: 8000 }).then(() => true, () => false);
      if (temFaixa) {
        await sessao.acionar('[data-acao="faixa"]');
        await sessao.acionar('[data-acao="continuar"]');
      }
      await sessao.esperarEtapa('musica:entrando', timeout);
    },

    /**
     * Abre a bolsa e toca num item ('carta-poppy', 'carta-yourname', 'chao-1'…): o capítulo
     * ou a carta do chão reabre na frente. Só funciona nas etapas em que a bolsa abre
     * (carta2:carta-espera, mao:mao-espera, cartas:escolhendo).
     */
    async abrirDaBolsa(id, timeout = 30000) {
      await sessao.acionar('[data-acao="inventario"]', timeout);
      await page.waitForFunction(() => document.getElementById('inventario').hasAttribute('data-aberto'), null, { timeout, polling: 50 });
      await sessao.acionar(`[data-acao="inventario-item"][data-id="${id}"]`, timeout);
      await page.waitForFunction(() => !!document.querySelector('.carta-chao-visor')
        || document.getElementById('pergaminho').dataset.estado === 'aberto', null, { timeout, polling: 50 });
    },
    /** Fecha o que abrirDaBolsa abriu e espera a bolsa ficar livre de novo. A cena e a etapa não mudam. */
    async fecharDaBolsa(timeout = 30000) {
      if (await page.evaluate(() => !!document.querySelector('.carta-chao-visor'))) {
        await sessao.acionar('[data-acao="fechar-carta"]', timeout);
      } else {
        await page.evaluate(() => {
          const rolagem = window.__carta.ctx.pergaminho.rolagem;
          rolagem.irPara(rolagem.el.scrollHeight, { imediato: true });
        });
        await pausa(250);
        await sessao.acionar('[data-acao="fechar-capitulo"]', timeout);
      }
      await page.waitForFunction(() => !window.__carta.ctx.inventario.aberto && !document.querySelector('.carta-chao-visor')
        && document.getElementById('pergaminho').hidden, null, { timeout, polling: 50 });
    },

    /** Cena e etapa neste instante. */
    estado() {
      return page.evaluate(() => ({ cena: window.__carta.cena, etapa: window.__carta.etapa }));
    },

    /** Captura a tela em output/ver/<nome>.png (em pixels de CSS, para o arquivo não ficar enorme). */
    async foto(nome, { cheia = false } = {}) {
      await mkdir(PASTA_FOTOS, { recursive: true });
      const arquivo = path.join(PASTA_FOTOS, `${nome}.png`);
      await page.screenshot({ path: arquivo, scale: cheia ? 'device' : 'css' });
      return arquivo;
    },

    /** Toca (ou clica) num ponto da tela; sem argumentos, no centro. */
    async tocar(x = perfil.largura / 2, y = perfil.altura / 2) {
      if (perfil.toque) await page.touchscreen.tap(x, y);
      else await page.mouse.click(x, y);
    },
    tocarCentro() {
      return sessao.tocar();
    },

    /** Toca (ou clica) no primeiro elemento visível que casa com o seletor. */
    async acionar(seletor, timeout = 20000) {
      const alvo = page.locator(seletor).first();
      await alvo.waitFor({ state: 'visible', timeout });
      if (perfil.toque) await alvo.tap({ timeout });
      else await alvo.click({ timeout });
    },

    /** Mede os quadros por `ms` milissegundos: { fpsMedio, p95ms, pioresMs, quadros }. */
    medirQuadros(ms = 2000) {
      return page.evaluate((duracao) => new Promise((resolver) => {
        const intervalos = [];
        let anterior = performance.now();
        const inicio = anterior;
        const passo = (agora) => {
          intervalos.push(agora - anterior);
          anterior = agora;
          if (agora - inicio < duracao) { requestAnimationFrame(passo); return; }
          const ordenados = [...intervalos].sort((a, b) => a - b);
          const soma = intervalos.reduce((a, b) => a + b, 0);
          const r = (n) => Math.round(n * 10) / 10;
          resolver({
            quadros: intervalos.length,
            fpsMedio: r(1000 / (soma / intervalos.length)),
            p95ms: r(ordenados[Math.min(ordenados.length - 1, Math.floor(ordenados.length * 0.95))]),
            pioresMs: ordenados.slice(-5).reverse().map(r),
          });
        };
        requestAnimationFrame(passo);
      }), ms);
    },

    /** Fecha tudo. Se havia gravação, devolve o caminho do vídeo (renomeado para `nomeVideo`, se dado). */
    async fechar(nomeVideo) {
      fechando = true;
      const gravacao = video ? page.video() : null;
      await contexto.close().catch(() => {});
      let caminhoVideo = null;
      if (gravacao) {
        caminhoVideo = await gravacao.path().catch(() => null);
        if (caminhoVideo && nomeVideo) {
          const destino = path.join(PASTA_VIDEO, `${nomeVideo}.webm`);
          await rename(caminhoVideo, destino).then(() => { caminhoVideo = destino; }, () => {});
        }
      }
      await navegador.close().catch(() => {});
      await servidor.fechar();
      return caminhoVideo;
    },
  };

  if (entrar && !cena) await sessao.passarEntrada();
  return sessao;
}
