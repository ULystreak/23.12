/* ============================================================================
   ROBUSTEZ: o que não pode quebrar de jeito nenhum
   ============================================================================
   Toques repetidos, giro do aparelho, aba oculta, perda de WebGL, parâmetros
   estranhos, recursos faltando, teclado, áudio, capítulo que não carrega,
   content.js vazio, qualidade adaptativa, bolsa e menu do fim. Roda no
   navegador de verdade (lib.mjs) e confere o histórico de etapas, os erros de
   console, o canvas e os estados do DOM.

   Uso: node _dev/robustez.mjs            (todos os casos, na ordem)
        node _dev/robustez.mjs spam resize (só os pedidos)
   Casos: spam, resize, aba, contexto, params, faltando, teclado, audio,
   quebra, vazio, qualidade, bolsa, menu.

   Termina com "ROBUSTEZ OK" (código 0) ou com a lista de FALHAs (código 1).
   Capturas em output/robustez/. As pausas do teste são em tempo real; o
   ?rapido= acelera só a carta (a GSAP e o espera() dela). Os tempos fixos não
   seguem eventos: numa máquina lenta, repita antes de concluir que quebrou.
   O "spam celular" é o caso instável conhecido (o robô reabre cartas mais
   rápido do que fecha): investigue antes de publicar.
   ========================================================================== */

import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import {
  abrir, RAIZ, lerConteudo, temEncontro, temCartas, temMenu, temContador, temResposta, senhaDoConteudo, etapasDoFinal,
} from './lib.mjs';

const CONTEUDO = lerConteudo();
const SENHA = senhaDoConteudo(CONTEUDO);
// "Há senha" segue o diretor (só senha.codigo); a mestra é só a que o teste digita.
const HA_SENHA = typeof CONTEUDO.senha?.codigo === 'string' && CONTEUDO.senha.codigo.trim() !== '';
const ESPERADO = roteiroDe(CONTEUDO);
const COM_MENU = temMenu(CONTEUDO);
const ATE_FIM = ESPERADO.slice(0, ESPERADO.indexOf('final:fim') + 1);
const PASTA = path.join(RAIZ, 'output', 'robustez');

const falhas = [];
const pausa = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const texto = (v) => (typeof v === 'string' ? v.trim() : '');
const perto = (v, alvo, folga) => typeof v === 'number' && Math.abs(v - alvo) <= folga;
const arred = (v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v);

/* ---- apoios ----------------------------------------------------------------- */

function roteiroDe(c) {
  const r = [];
  const com = (cena, etapas) => r.push(...etapas.map((e) => `${cena}:${e}`));
  if (typeof c.senha?.codigo === 'string' && c.senha.codigo.trim()) com('senha', ['senha', 'senha-certa']);
  com('musica', ['musica', 'entrando']);
  com('inicio', ['frases', 'caminhada', 'carta-chegando', 'carta-espera', 'carta-abrindo', 'papel']);
  com('poppy', ['desenrolando', 'lendo', 'enrolando', 'guardando']);
  com('carta2', ['caminhada', 'carta-chegando', 'carta-espera', 'carta-abrindo', 'papel']);
  com('yourname', ['desenrolando', 'lendo', 'enrolando', 'guardando']);
  com('mao', ['olha', 'mao-espera', 'correndo']);
  if (temCartas(c)) com('cartas', ['pousando', 'escolhendo', 'assistindo', 'escolhendo', 'seguindo']);
  if (temEncontro(c)) com('encontro', ['chegando', 'planos', 'maos', 'carta']);
  com('final', etapasDoFinal(c));
  if (temMenu(c)) com('menu', ['referencias', 'menu']);
  return r;
}

/** O pedaço do roteiro a partir de um passo (inclusive). */
function trecho(roteiro, de) {
  const i = roteiro.indexOf(de);
  return i < 0 ? [] : roteiro.slice(i);
}

function ok(cond, msg) {
  if (cond) console.log(`  ok    ${msg}`);
  else {
    falhas.push(msg);
    console.log(`  FALHA ${msg}`);
  }
  return !!cond;
}

function igual(lista, esperado) {
  if (lista.length === esperado.length && lista.every((x, i) => x === esperado[i])) return '';
  const i = esperado.findIndex((x, k) => lista[k] !== x);
  const k = i < 0 ? esperado.length : i;
  return ` (no passo ${k + 1}: esperava ${esperado[k] ?? 'o fim'}, veio ${lista[k] ?? 'nada'})`;
}

function semErro(s, rotulo, filtro = () => true) {
  const erros = s.erros.filter(filtro);
  const amostra = erros.slice(0, 4).map((e) => `${e.tipo}: ${e.texto}`).join(' | ');
  return ok(erros.length === 0, `${rotulo}: sem erro de console${erros.length ? ` (${erros.length}: ${amostra})` : ''}`);
}

/** "cena:etapa" do histórico. Cada carta do chão aberta gera um par assistindo → escolhendo: só o primeiro conta. */
async function historico(s) {
  const h = await s.page.evaluate(() => (window.__carta?.historico || []).map((p) => `${p.cena}:${p.etapa}`));
  const lista = [];
  let viuPar = false;
  for (let i = 0; i < h.length; i++) {
    if (h[i] === 'cartas:assistindo' && h[i + 1] === 'cartas:escolhendo') {
      if (viuPar) {
        i += 1;
        continue;
      }
      viuPar = true;
    }
    lista.push(h[i]);
  }
  return lista;
}

async function foto(s, nome) {
  await mkdir(PASTA, { recursive: true });
  await s.page.screenshot({ path: path.join(PASTA, `${nome}.png`), scale: 'css' }).catch(() => {});
}

// Repete uma consulta na página até ela dar verdadeiro (sobrevive a recargas).
async function esperar(page, fn, arg, timeout, msg) {
  const fim = Date.now() + timeout;
  for (;;) {
    try {
      const v = await page.evaluate(fn, arg);
      if (v) return v;
    } catch {
      /* a página está trocando */
    }
    if (Date.now() > fim) throw new Error(msg);
    await pausa(60);
  }
}

const esperarBoot = (page) => esperar(page, () => !!(window.__carta?.ctx?.mundo || window.__carta?.erro), null, 30000, 'a carta não iniciou depois de recarregar');

async function esperarAgora(s, passo, timeout) {
  const fim = Date.now() + timeout;
  for (;;) {
    const e = await s.estado().catch(() => ({}));
    if (`${e.cena}:${e.etapa}` === passo) return;
    if (Date.now() > fim) throw new Error(`não voltou a ${passo} em ${Math.round(timeout / 1000)} s (está em ${e.cena}:${e.etapa})`);
    await pausa(80);
  }
}

function diag(s) {
  return s.page.evaluate(() => {
    const som = window.__carta.ctx.som;
    const d = som?.diagnostico?.() || {};
    return { ...d, tocando: !!som?.estado?.tocando, indice: som?.estado?.indice, destravado: !!som?.estado?.destravado };
  });
}

/** Conta os quadros do laço do mundo durante `ms` (tempo real). */
function contarQuadros(s, ms) {
  return s.page.evaluate(async (duracao) => {
    const mundo = window.__carta.ctx.mundo;
    let n = 0;
    const parar = mundo.aoQuadro(() => { n += 1; });
    await new Promise((r) => setTimeout(r, duracao));
    if (typeof parar === 'function') parar();
    return n;
  }, ms);
}

// Dentro da página: visível de verdade (sem display none, visibility hidden ou opacidade ~0 no caminho).
function AJUDA() {
  window.__vis = (el) => {
    if (!el || !el.isConnected) return false;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      if (n.hidden) return false;
      const cs = getComputedStyle(n);
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) return false;
    }
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
}

/** Acrescenta código ao js/content.js servido (o arquivo não muda). */
function mexerNoConteudo(codigo) {
  return (page) => page.route('**/js/content.js', async (rota) => {
    const resposta = await rota.fetch();
    const corpo = await resposta.text();
    await rota.fulfill({ response: resposta, body: `${corpo}\n;(function () { ${codigo} })();\n` });
  });
}

/** Abre uma sessão, roda o caso e fecha sempre; uma exceção vira FALHA com o rótulo. */
async function sessao(rotulo, opcoes, fn) {
  let s = null;
  try {
    s = await abrir({
      ...opcoes,
      preparar: async (page) => {
        await page.addInitScript(AJUDA);
        await opcoes.preparar?.(page);
      },
    });
    await fn(s);
  } catch (erro) {
    ok(false, `${rotulo}: ${String(erro?.message || erro).split('\n')[0]}`);
    if (s) await foto(s, `${rotulo.replace(/[^a-z0-9]+/gi, '-')}-erro`);
  } finally {
    await s?.fechar().catch(() => {});
  }
}

async function tocarForca(s, seletor) {
  // As etiquetas balançam o tempo todo: o Playwright esperaria para sempre elas pararem; force pula essa espera.
  const alvo = s.page.locator(seletor).first();
  await alvo.waitFor({ state: 'attached', timeout: 10000 });
  if (s.perfil.toque) await alvo.tap({ force: true });
  else await alvo.click({ force: true });
}

async function toqueDuplo(s, seletor) {
  const caixa = await s.page.locator(seletor).filter({ visible: true }).first().boundingBox();
  if (!caixa) throw new Error(`${seletor} não está na tela`);
  const x = caixa.x + caixa.width / 2;
  const y = caixa.y + caixa.height / 2;
  await s.tocar(x, y);
  await pausa(90);
  await s.tocar(x, y);
}

/* ---- o percurso ------------------------------------------------------------- */

/** Ação tolerante de cada etapa: o que não acha em `curto` ms é ignorado. */
async function agir(s, etapa, { curto = 6000 } = {}) {
  const tentar = async (fn) => {
    try {
      await fn();
    } catch {
      /* tolerante: a carta pode já ter seguido */
    }
  };
  switch (etapa) {
    case 'senha':
      // fill em vez de digitar: funciona mesmo com toques tirando o foco do campo (caso spam).
      await tentar(() => s.page.fill('input[data-acao="senha"]', SENHA, { timeout: curto }));
      return;
    case 'escolhendo':
    case 'assistindo':
      for (let i = 0; i < 20; i++) {
        const e = await s.estado().catch(() => ({}));
        if (e.cena !== 'cartas' || !['assistindo', 'escolhendo'].includes(e.etapa)) return;
        if (e.etapa === 'assistindo') {
          await tentar(() => s.acionar('[data-acao="fechar-carta"]', 1500));
          await tentar(() => s.acionar('[data-acao="voz-fechar"]', 1500));
          await tentar(() => esperarAgora(s, 'cartas:escolhendo', 20000));
        } else {
          const abriuAlguma = await s.page.evaluate(() => !!document.querySelector('[data-acao="carta-chao"]:not([data-estado="fechada"])'));
          if (abriuAlguma) await tentar(() => s.acionar('[data-acao="seguir-cartas"]', curto));
          else await tentar(() => s.acionar('[data-acao="carta-chao"][data-estado="fechada"]:not([data-trancada])', curto));
        }
        await pausa(400);
      }
      return;
    case 'carta-espera':
      await tentar(() => s.tocarCentro());
      return;
    case 'musica':
      await tentar(() => s.acionar('[data-acao="faixa"]', curto));
      await tentar(() => s.acionar('[data-acao="continuar"]', curto));
      return;
    case 'lendo':
      await tentar(() => s.page.evaluate(() => {
        const rolagem = window.__carta.ctx.pergaminho?.rolagem;
        if (rolagem?.el) rolagem.irPara(rolagem.el.scrollHeight, { imediato: true });
      }));
      await pausa(250);
      await tentar(() => s.acionar('[data-acao="fechar-capitulo"]', curto));
      return;
    case 'mao-espera':
      await tentar(() => s.acionar('[data-acao="seguir-fio"]', curto));
      return;
    case 'maos':
      await tentar(() => s.acionar('[data-acao="amarrar-fio"]', curto));
      return;
    case 'resposta':
      await tentar(() => s.acionar('[data-acao="resposta-guardar"]', curto));
      return;
    case 'fim':
      await tentar(() => s.acionar('[data-acao="menu-ir"]', curto));
      return;
    case 'referencias':
      await tentar(() => s.acionar('[data-acao="menu-pular"]', curto));
      return;
    default:
  }
}

/**
 * Espera cada passo do roteiro, chama `aoChegar(passo)`, para em `ate` e age
 * nos demais. Só age se a carta ainda está naquele passo (um passo antigo do
 * histórico não repete a ação).
 */
async function percorrer(s, ate = 'final:fim', aoChegar = null, timeout = 90000, roteiro = ESPERADO) {
  for (const passo of roteiro) {
    await s.esperarEtapa(passo, timeout);
    if (aoChegar) await aoChegar(passo);
    if (passo === ate) return;
    const etapa = passo.split(':')[1];
    const e = await s.estado().catch(() => ({}));
    const agora = `${e.cena}:${e.etapa}`;
    if (agora === passo || (etapa === 'escolhendo' && agora === 'cartas:assistindo')) await agir(s, etapa);
  }
  throw new Error(`o roteiro acabou antes de ${ate}`);
}

/* ---- dentro da página: perder o WebGL --------------------------------------- */

function perderContexto() {
  const renderer = window.__carta.ctx.mundo?.renderer;
  const ext = renderer?.getContext?.()?.getExtension('WEBGL_lose_context');
  if (!ext) return false;
  window.__perda = ext;
  ext.loseContext();
  return true;
}

// A aba oculta de mentira: document.hidden e visibilityState obedecem a window.__ocultar(v).
function OCULTAR() {
  let oculto = false;
  Object.defineProperty(Document.prototype, 'hidden', { configurable: true, get: () => oculto });
  Object.defineProperty(Document.prototype, 'visibilityState', { configurable: true, get: () => (oculto ? 'hidden' : 'visible') });
  window.__ocultar = (v) => {
    oculto = !!v;
    document.dispatchEvent(new Event('visibilitychange'));
  };
}

// Conta as criações de AudioContext e as chamadas de play() desde o primeiro script.
function CONTAR_AUDIO() {
  window.__contagem = { contextos: 0, plays: 0 };
  for (const nome of ['AudioContext', 'webkitAudioContext']) {
    const Original = window[nome];
    if (typeof Original !== 'function') continue;
    window[nome] = class extends Original {
      constructor(...args) {
        super(...args);
        window.__contagem.contextos += 1;
      }
    };
  }
  const tocar = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function (...args) {
    window.__contagem.plays += 1;
    return tocar.apply(this, args);
  };
}

// Quadros de mentira: window.__modoQuadro = 'travado' entrega um quadro a cada
// dois tiques (30 fps); 'sofrendo' faz cada quadro pesar 40 ms.
function QUADROS() {
  const raf = window.requestAnimationFrame.bind(window);
  const caf = window.cancelAnimationFrame.bind(window);
  window.__modoQuadro = '';
  let tique = 0;
  const contar = () => {
    tique += 1;
    if (window.__modoQuadro === 'sofrendo') {
      const fim = performance.now() + 40;
      while (performance.now() < fim) { /* o quadro pesa */ }
    }
    raf(contar);
  };
  raf(contar);
  const ids = new Map();
  let proximo = 1;
  window.requestAnimationFrame = (fn) => {
    const id = proximo++;
    const rodar = (t) => {
      if (!ids.has(id)) return;
      if (window.__modoQuadro === 'travado' && tique % 2) {
        ids.set(id, raf(rodar));
        return;
      }
      ids.delete(id);
      fn(t);
    };
    ids.set(id, raf(rodar));
    return id;
  };
  window.cancelAnimationFrame = (id) => {
    const r = ids.get(id);
    if (r !== undefined) caf(r);
    ids.delete(id);
  };
}

/* ---- os casos --------------------------------------------------------------- */

// Os sete pontos do spam, em frações da tela, um a cada 70 ms; a cada três, um toque duplo.
const PONTOS_SPAM = [[0.5, 0.5], [0.5, 0.86], [0.5, 0.5], [0.5, 0.62], [0.3, 0.3], [0.5, 0.5], [0.92, 0.05]];
const SEM_ENCONTRO_VISTO = ['encontro:planos', 'encontro:maos', 'encontro:carta'];

const casos = {
  /** 1. Toques e cliques duplos sem parar, do começo ao fim: nenhuma etapa pulada ou repetida. */
  async spam() {
    for (const vp of ['celular', 'desktop']) {
      await sessao(`spam ${vp}`, { vp, params: { rapido: 5 } }, async (s) => {
        let tocando = true;
        const laco = (async () => {
          for (let i = 0; tocando; i++) {
            const [fx, fy] = PONTOS_SPAM[i % PONTOS_SPAM.length];
            const tela = s.page.viewportSize();
            const x = fx * tela.width;
            const y = fy * tela.height;
            try {
              if (s.perfil.toque) {
                await s.page.touchscreen.tap(x, y);
                if (i % 3 === 2) await s.page.touchscreen.tap(x, y);
              } else if (i % 3 === 2) {
                await s.page.mouse.dblclick(x, y);
              } else {
                await s.page.mouse.click(x, y);
              }
            } catch {
              /* a página pode estar trocando */
            }
            await pausa(70);
          }
        })();
        const fim = COM_MENU ? 'menu:menu' : 'final:fim';
        try {
          // Com menu, os toques param nas referências (o toque pularia os créditos).
          await percorrer(s, fim, (passo) => {
            if (passo === 'menu:referencias') tocando = false;
          }, 60000);
        } finally {
          tocando = false;
          await laco;
        }
        const h = await historico(s);
        ok(h.includes(fim), `spam ${vp}: chegou a ${fim}`);
        const diferenca = igual(h, ESPERADO);
        ok(!diferenca, `spam ${vp}: histórico igual ao roteiro, nenhuma etapa pulada ou repetida${diferenca}`);
        semErro(s, `spam ${vp}`);
        await foto(s, `spam-${vp}-fim`);
      });
    }
  },

  /** 2. Gira o aparelho a cada etapa; o canvas acompanha. No computador, a folha cobre e o mundo desliga. */
  async resize() {
    await sessao('resize celular', { vp: 'celular', params: { rapido: 5 } }, async (s) => {
      let deitado = false;
      let giros = 0;
      const erradas = [];
      await percorrer(s, 'final:fim', async (passo) => {
        deitado = !deitado;
        const [largura, altura] = deitado ? [844, 390] : [390, 844];
        await s.page.setViewportSize({ width: largura, height: altura });
        await pausa(420);
        const c = await s.page.evaluate(() => {
          const mundo = window.__carta.ctx.mundo;
          if (!mundo?.ok || !mundo.canvas) return null;
          // Caixa de layout, não getBoundingClientRect: no "guardar no bolso" o
          // mundo cresce de propósito (transform) enquanto ela olha para baixo.
          const r = { width: mundo.canvas.clientWidth, height: mundo.canvas.clientHeight };
          const dpr = mundo.renderer?.getPixelRatio?.() || 1;
          const L = innerWidth;
          const A = innerHeight;
          const tamanho = Math.abs(r.width - L) <= 1 && Math.abs(r.height - A) <= 1;
          const aspecto = Math.abs(mundo.canvas.width / mundo.canvas.height - r.width / r.height) < 0.01;
          const buffer = Math.abs(mundo.canvas.width - r.width * dpr) <= 2 && Math.abs(mundo.canvas.height - r.height * dpr) <= 2;
          return { certo: tamanho && aspecto && buffer, texto: `css ${r.width}×${r.height}, buffer ${mundo.canvas.width}×${mundo.canvas.height}, dpr ${dpr}, tela ${L}×${A}` };
        });
        if (!c) return;
        giros += 1;
        if (!c.certo) erradas.push(`${passo} (${c.texto})`);
      });
      ok(giros > 0 && !erradas.length, `resize: o canvas acompanhou ${giros} giros${erradas.length ? `; errado em ${erradas.slice(0, 3).join('; ')}` : ''}`);
      await s.page.setViewportSize({ width: 390, height: 844 });
      await pausa(600);
      const diferenca = igual(await historico(s), ATE_FIM);
      ok(!diferenca, `resize: histórico igual ao roteiro até final:fim${diferenca}`);
      semErro(s, 'resize celular');
    });

    await sessao('resize desktop', { cena: 'poppy', vp: 'desktop', params: { rapido: 5 } }, async (s) => {
      const ligado = () => s.page.evaluate(() => !!window.__carta.ctx.mundo?.ligado);
      await s.esperarEtapa('poppy:lendo', 90000);
      await pausa(900);
      ok(await ligado(), 'resize desktop: com a folha aberta em 1440×900 o mundo segue ligado');
      await s.page.setViewportSize({ width: 600, height: 800 });
      await pausa(900);
      ok(!(await ligado()), 'resize desktop: em 600×800 a folha cobre tudo e o mundo desliga');
      await s.page.setViewportSize({ width: 1440, height: 900 });
      await pausa(900);
      ok(await ligado(), 'resize desktop: de volta a 1440×900 o mundo religa');
      await foto(s, 'resize-desktop-religado');
    });
  },

  /** 3. Aba oculta: o laço para, o espera() congela e a música pausa e volta. */
  async aba() {
    await sessao('aba laço', { vp: 'celular', entrar: true, preparar: (p) => p.addInitScript(OCULTAR) }, async (s) => {
      await pausa(600);
      const visivel = await contarQuadros(s, 600);
      ok(visivel > 10, `aba: visível, ${visivel} quadros em 600 ms (mais de 10)`);
      await s.page.evaluate(() => window.__ocultar(true));
      const oculta = await contarQuadros(s, 4000);
      ok(oculta <= 1, `aba: oculta, ${oculta} quadro(s) em 4 s (no máximo 1: o laço parou)`);
      await s.page.evaluate(() => window.__ocultar(false));
      const volta = await contarQuadros(s, 700);
      ok(volta > 10, `aba: visível de novo, ${volta} quadros em 0,7 s (mais de 10)`);
      const ms = await s.page.evaluate(async () => {
        const { espera } = await import(new URL('js/nucleo/util.js', location.href).href);
        const t0 = performance.now();
        setTimeout(() => window.__ocultar(true), 200);
        setTimeout(() => window.__ocultar(false), 1700);
        await espera(600);
        return Math.round(performance.now() - t0);
      });
      ok(ms >= 1950 && ms <= 2500, `aba: espera(600) com 1,5 s oculta no meio levou ${ms} ms (esperado ~2100)`);
      semErro(s, 'aba laço');
    });

    await sessao('aba música', { vp: 'celular', params: { rapido: 6 }, entrar: true, preparar: (p) => p.addInitScript(OCULTAR) }, async (s) => {
      await percorrer(s, 'poppy:lendo', null, 90000, trecho(ESPERADO, 'inicio:frases'));
      await pausa(900);
      const d1 = await diag(s);
      ok(perto(d1.ganho, 0.3, 0.03) && d1.contexto === 'running' && d1.pausado === false,
        `aba: música tocando em poppy:lendo (ganho ${arred(d1.ganho)}, contexto ${d1.contexto}, pausada ${d1.pausado})`);
      await s.page.evaluate(() => window.__ocultar(true));
      await pausa(600);
      const d2 = await diag(s);
      ok(d2.pausado === true, `aba: oculta, a música pausa (pausada ${d2.pausado})`);
      await s.page.evaluate(() => window.__ocultar(false));
      await pausa(900);
      const d3 = await diag(s);
      await pausa(700);
      const d4 = await diag(s);
      ok(d3.pausado === false && d4.tempo > d3.tempo, `aba: visível, a música volta e o tempo anda (${arred(d3.tempo)} s → ${arred(d4.tempo)} s)`);
    });
  },

  /** 4. Perda de WebGL: o laço para e volta; perda definitiva recarrega no modo leve; na leitura não recarrega. */
  async contexto() {
    await sessao('contexto devolvido', { vp: 'celular', params: { rapido: 5 } }, async (s) => {
      const ALVOS = new Set(['inicio:carta-espera', 'final:carta-espera', 'final:fim']);
      await percorrer(s, 'final:fim', async (passo) => {
        if (!ALVOS.has(passo)) return;
        if (!ok(await s.page.evaluate(perderContexto), `contexto ${passo}: o WebGL foi perdido (WEBGL_lose_context)`)) return;
        await pausa(300);
        const parado = await contarQuadros(s, 500);
        ok(parado <= 1, `contexto ${passo}: sem contexto, ${parado} quadro(s) em 500 ms (no máximo 1)`);
        await s.page.evaluate(() => window.__perda.restoreContext());
        const volta = await contarQuadros(s, 900);
        ok(volta > 15, `contexto ${passo}: contexto devolvido, ${volta} quadros em 900 ms (mais de 15)`);
      });
      const diferenca = igual(await historico(s), ATE_FIM);
      ok(!diferenca, `contexto: histórico completo${diferenca}`);
      semErro(s, 'contexto devolvido');
    });

    await sessao('contexto perdido de vez', { vp: 'celular', params: { rapido: 6 } }, async (s) => {
      await percorrer(s, 'carta2:carta-espera');
      ok(await s.page.evaluate(perderContexto), 'contexto: o WebGL foi perdido de vez em carta2:carta-espera');
      await s.page.waitForURL((u) => u.searchParams.get('webgl') === '0', { timeout: 20000 });
      await esperarBoot(s.page);
      const u = new URL(s.page.url()).searchParams;
      // O endereço é limpo logo depois da chegada; a cena e a faixa se conferem na página.
      const onde = await s.page.evaluate(() => ({ cena: document.documentElement.dataset.cena, musica: window.__carta.ctx.amb?.params?.get('musica') }));
      ok(u.get('webgl') === '0' && onde.cena === 'carta2' && onde.musica === '0' && u.get('rapido') === '6',
        `contexto: recarregou no modo leve (webgl=${u.get('webgl')}, cena=${onde.cena}, musica=${onde.musica}, rapido=${u.get('rapido')})`);
      const depois = await s.page.evaluate(() => ({ ok: window.__carta.ctx.mundo.ok, tocando: !!window.__carta.ctx.som?.estado?.tocando }));
      ok(depois.ok === false, 'contexto: depois da recarga, mundo.ok é false');
      ok(!depois.tocando, 'contexto: a música espera o primeiro toque');
      let musica = null;
      await percorrer(s, 'final:fim', async (passo) => {
        if (passo !== 'carta2:carta-abrindo') return;
        await pausa(600);
        musica = await diag(s);
      }, 90000, trecho(ESPERADO, 'carta2:caminhada'));
      ok(musica && musica.indice === 0 && musica.tocando && musica.pausado === false,
        `contexto: a música volta no primeiro toque (faixa ${musica?.indice}, tocando ${musica?.tocando}, pausada ${musica?.pausado})`);
    });

    await sessao('contexto na leitura', { cena: 'poppy', vp: 'desktop', params: { rapido: 6 } }, async (s) => {
      await s.esperarEtapa('poppy:lendo', 90000);
      await s.page.evaluate(() => { window.__marca = 1; });
      ok(await s.page.evaluate(perderContexto), 'contexto: o WebGL foi perdido durante a leitura');
      await pausa(6000);
      const ficou = await s.page.evaluate(() => window.__marca === 1).catch(() => false);
      ok(ficou, 'contexto: com a folha na frente, a página não recarrega em 6 s');
      await s.page.evaluate(() => window.__perda?.restoreContext()).catch(() => {});
    });
  },

  /** 5. Endereços estranhos caem no começo, sem erro. A comparação de cena é sensível a maiúsculas. */
  async params() {
    const primeira = HA_SENHA ? 'senha' : 'musica';
    for (const params of [{ cena: 'xyz' }, { cena: '' }, { rapido: 'abc', nivel: 'xyz', webgl: 'banana' }, { cena: 'FINAL' }]) {
      const rotulo = `params ?${new URLSearchParams(params)}`;
      await sessao(rotulo, { vp: 'celular', params }, async (s) => {
        await pausa(500);
        const cena = await s.page.evaluate(() => document.documentElement.dataset.cena);
        ok(cena === primeira, `${rotulo}: começa em ${primeira} (data-cena="${cena}")`);
        semErro(s, rotulo);
      });
    }
  },

  /** 6. Sem imagens e sem músicas (404), com e sem WebGL: chega ao fim, só com 404 no console. */
  async faltando() {
    const roteiro = ATE_FIM.filter((p) => !SEM_ENCONTRO_VISTO.includes(p));
    const so404 = (e) => !((e.tipo === 'http' && /^404 /.test(e.texto)) || (e.tipo === 'console' && /404|Failed to load resource/i.test(e.texto)));
    for (const extra of [{}, { webgl: 0 }]) {
      const rotulo = extra.webgl === 0 ? 'faltando webgl=0' : 'faltando';
      const preparar = async (page) => {
        const nao = (rota) => rota.fulfill({ status: 404, contentType: 'text/plain; charset=utf-8', body: '404' });
        await page.route('**/assets/images/**', nao);
        await page.route('**/assets/music/**', nao);
      };
      await sessao(rotulo, { vp: 'celular', params: { rapido: 6, ...extra }, preparar }, async (s) => {
        await percorrer(s, 'final:fim', null, 90000, roteiro);
        ok(true, `${rotulo}: chegou a final:fim`);
        await pausa(500);
        semErro(s, `${rotulo} (fora os 404)`, so404);
        const quebradas = await s.page.evaluate(() => [...document.images]
          .filter((img) => img.getAttribute('src') && img.complete && img.naturalWidth === 0)
          .map((img) => img.getAttribute('src')));
        ok(!quebradas.length, `${rotulo}: nenhuma imagem quebrada no DOM${quebradas.length ? ` (${quebradas.slice(0, 3).join(', ')})` : ''}`);
        await foto(s, extra.webgl === 0 ? 'faltando-webgl0' : 'faltando');
      });
    }
  },

  /** 7. Só teclado, no computador: senha, faixa, continuar e a primeira carta. */
  async teclado() {
    await sessao('teclado', { vp: 'desktop', params: { rapido: 6 } }, async (s) => {
      const { page } = s;
      const foco = () => page.evaluate(() => document.activeElement?.closest?.('[data-acao]')?.dataset.acao || '');
      const tabAte = async (acao, vezes = 6) => {
        for (let i = 0; i < vezes && (await foco()) !== acao; i++) {
          await page.keyboard.press('Tab');
          await pausa(120);
        }
        return foco();
      };
      if (HA_SENHA) {
        await s.esperarEtapa('senha:senha', 20000);
        await pausa(800);
        const foco1 = await foco();
        ok(foco1 === 'senha', `teclado: o campo da senha já nasce com o foco (${foco1 || 'nada'})`);
        await page.keyboard.type(SENHA, { delay: 40 });
      }
      await s.esperarEtapa('musica:musica', 30000);
      await pausa(800);
      const foco2 = await tabAte('faixa');
      ok(foco2 === 'faixa', `teclado: foco na faixa (${foco2 || 'nada'})`);
      await page.keyboard.press('Enter');
      await pausa(500);
      const foco3 = await tabAte('continuar');
      ok(foco3 === 'continuar', `teclado: foco no continuar (${foco3 || 'nada'})`);
      await page.keyboard.press('Enter');
      await s.esperarEtapa('inicio:carta-espera', 90000);
      await pausa(800);
      const foco4 = await tabAte('abrir-carta');
      ok(foco4 === 'abrir-carta', `teclado: foco na carta (${foco4 || 'nada'})`);
      await page.keyboard.press('Enter');
      await s.esperarEtapa('poppy:lendo', 90000);
      ok(true, 'teclado: chegou a poppy:lendo só com o teclado');
      semErro(s, 'teclado');
    });
  },

  /** 8. Áudio: nada antes do primeiro gesto; um contexto depois da senha; a faixa por Web Audio; pausa e volta no disco. */
  async audio() {
    await sessao('audio', { vp: 'celular', params: { rapido: 6 }, preparar: (p) => p.addInitScript(CONTAR_AUDIO) }, async (s) => {
      const ler = () => s.page.evaluate(() => {
        const som = window.__carta.ctx.som;
        return { ...window.__contagem, ...som.diagnostico(), destravado: !!som.estado.destravado, tocando: !!som.estado.tocando };
      });
      const a0 = await ler();
      ok(a0.contextos === 0 && a0.plays === 0 && !a0.destravado,
        `audio: antes de qualquer toque, ${a0.contextos} contexto(s), ${a0.plays} play(s), destravado ${a0.destravado}`);
      if (HA_SENHA) {
        await s.digitarSenha(SENHA);
        await s.esperarEtapa('senha:senha-certa', 20000);
        await pausa(600);
        const a1 = await ler();
        ok(a1.contextos === 1 && a1.contexto === 'running' && a1.plays === 0,
          `audio: depois da senha, ${a1.contextos} contexto(s) em ${a1.contexto}, ${a1.plays} play(s)`);
      }
      await s.esperarEtapa('musica:musica', 30000);
      await s.acionar('[data-acao="faixa"]');
      await s.acionar('[data-acao="continuar"]');
      await s.esperarEtapa('musica:entrando', 30000);
      await pausa(2600);
      const a2 = await ler();
      ok(a2.tocando && a2.webAudio && perto(a2.ganho, 0.3, 0.02) && a2.tempo > 1,
        `audio: a faixa toca por Web Audio (ganho ${arred(a2.ganho)}, tempo ${arred(a2.tempo)} s)`);
      await s.acionar('[data-acao="mini"]');
      await s.acionar('[data-acao="mini-alternar"]');
      await pausa(900);
      const a3 = await ler();
      ok(a3.ganho < 0.01 && a3.pausado === true, `audio: o disco pausa (ganho ${arred(a3.ganho)}, pausada ${a3.pausado})`);
      await s.acionar('[data-acao="mini-alternar"]');
      await pausa(2400);
      const a4 = await ler();
      ok(perto(a4.ganho, 0.3, 0.02) && a4.pausado === false, `audio: o disco retoma (ganho ${arred(a4.ganho)})`);
      semErro(s, 'audio');
    });
  },

  /** 9. O capítulo poppy não carrega e um ouvinte de quadro quebra: o mundo segue e a carta pula o capítulo. */
  async quebra() {
    const preparar = (page) => page.route('**/js/capitulos/poppy.js', (rota) => rota.fulfill({ status: 404, contentType: 'text/plain; charset=utf-8', body: '404' }));
    const roteiro = ATE_FIM.filter((p) => !CAPITULO_POPPY.includes(p));
    await sessao('quebra', { vp: 'celular', params: { rapido: 6 }, preparar }, async (s) => {
      await percorrer(s, 'final:fim', async (passo) => {
        // Mede com o mundo à vista e a carta parada esperando o toque.
        if (passo !== 'inicio:carta-espera') return;
        const n = await s.page.evaluate(async () => {
          const mundo = window.__carta.ctx.mundo;
          let quadros = 0;
          const tirarQuebrado = mundo.aoQuadro(() => { throw new Error('ouvinte de quadro quebrado de propósito (robustez)'); });
          const tirarConta = mundo.aoQuadro(() => { quadros += 1; });
          await new Promise((r) => setTimeout(r, 500));
          if (typeof tirarQuebrado === 'function') tirarQuebrado();
          if (typeof tirarConta === 'function') tirarConta();
          return quadros;
        });
        ok(n > 10, `quebra: com um ouvinte de quadro lançando exceção, ${n} quadros em 500 ms (mais de 10: o mundo não para)`);
      }, 90000, roteiro);
      const h = await historico(s);
      const pulou = !h.some((p) => CAPITULO_POPPY.includes(p));
      ok(h.includes('final:fim') && pulou, `quebra: chegou a final:fim pulando o capítulo poppy${pulou ? '' : ' (mas ele apareceu no histórico)'}`);
      await foto(s, 'quebra-fim');
    });
  },

  /** 10. content.js vazio. Só informa onde a carta parou: este caso não tem verificação. */
  async vazio() {
    const preparar = (page) => page.route('**/js/content.js', (rota) => rota.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: 'window.CONTEUDO = {};\n' }));
    const roteiro = roteiroDe({});
    await sessao('vazio', { vp: 'celular', params: { rapido: 6 }, preparar }, async (s) => {
      let onde = 'final:fim';
      try {
        await percorrer(s, 'final:fim', null, 25000, roteiro);
      } catch {
        const e = await s.estado().catch(() => ({}));
        onde = `${e.cena}:${e.etapa}`;
      }
      const amostra = s.erros.slice(0, 4).map((e) => `${e.tipo}: ${e.texto}`).join(' | ');
      console.log(`  info  vazio: parou em ${onde}; ${s.erros.length} erro(s)${s.erros.length ? ` (${amostra})` : ''}`);
      await foto(s, 'vazio-onde-parou');
    });
  },

  /** 11. Qualidade adaptativa: 30 fps estáveis não mexem em nada; quadros de 40 ms baixam o DPR ou o nível. */
  async qualidade() {
    const ler = (s) => s.page.evaluate(() => {
      const mundo = window.__carta.ctx.mundo;
      return { ok: !!mundo?.ok, nivel: window.__carta.ctx.amb?.nivel, dpr: mundo?.renderer?.getPixelRatio?.() ?? null };
    });
    const semMundo = (a, rotulo) => {
      if (a.ok) return false;
      console.log(`  info  ${rotulo}: sem WebGL nesta máquina; nada a medir`);
      return true;
    };
    const comQuadros = { cena: 'inicio', vp: 'celular', preparar: (p) => p.addInitScript(QUADROS) };

    await sessao('qualidade travado', comQuadros, async (s) => {
      await pausa(1500);
      const a = await ler(s);
      if (semMundo(a, 'qualidade travado')) return;
      await s.page.evaluate(() => { window.__modoQuadro = 'travado'; });
      await pausa(12000);
      const b = await ler(s);
      ok(a.nivel === b.nivel && a.dpr === b.dpr, `qualidade travado (30 fps por 12 s): nível e DPR não mudam (${a.nivel}/${a.dpr} → ${b.nivel}/${b.dpr})`);
    });

    await sessao('qualidade sofrendo', comQuadros, async (s) => {
      await pausa(3000);
      const a = await ler(s);
      if (semMundo(a, 'qualidade sofrendo')) return;
      await s.page.evaluate(() => { window.__modoQuadro = 'sofrendo'; });
      await pausa(16000);
      const b = await ler(s);
      await s.page.evaluate(() => { window.__modoQuadro = ''; });
      ok(b.dpr < a.dpr || b.nivel !== a.nivel, `qualidade sofrendo (quadros de 40 ms por 16 s): o DPR cai ou o nível muda (${a.nivel}/${a.dpr} → ${b.nivel}/${b.dpr})`);
    });
  },

  /** 12. A bolsa no iPhone: toques seguidos, releitura sem mexer na etapa, giro, Esc e a carta por baixo. */
  async bolsa() {
    await sessao('bolsa', { cena: 'carta2', vp: 'iphone', params: { rapido: 6 } }, async (s) => {
      const { page } = s;
      const ler = () => page.evaluate(() => {
        const vis = window.__vis;
        const inv = window.__carta.ctx.inventario;
        const raiz = document.getElementById('inventario');
        const palco = document.getElementById('palco');
        // O botão pode só cair no fim da leitura: sem um visível, vale o que existe.
        const botoes = [...document.querySelectorAll('[data-acao="fechar-capitulo"]')];
        const fechar = botoes.find(vis) || botoes[0];
        return {
          aberto: !!inv?.aberto,
          marca: !!raiz?.hasAttribute('data-aberto'),
          folha: vis(document.getElementById('inventario-folha')),
          itens: [...document.querySelectorAll('#inventario [data-acao="inventario-item"]')].map((b) => b.dataset.id),
          botao: vis(document.querySelector('[data-acao="inventario"]')),
          pele: document.getElementById('mini')?.dataset.pele || '',
          palco: !!palco && getComputedStyle(palco).visibility !== 'hidden' && vis(palco),
          nomeFechar: fechar ? (fechar.getAttribute('aria-label') || fechar.textContent || '').replace(/\s+/g, ' ').trim() : '',
          ligado: !!window.__carta.ctx.mundo?.ligado,
        };
      });
      const abrirBolsa = async () => {
        await s.acionar('[data-acao="inventario"]', 10000);
        await esperar(page, () => !!document.querySelector('#inventario[data-aberto]'), null, 10000, 'a bolsa não abriu');
      };
      const fechada = () => esperar(page, () => !window.__carta.ctx.inventario?.aberto, null, 10000, 'a bolsa não fechou');

      await s.esperarEtapa('carta2:caminhada', 60000);
      await abrirBolsa();
      await pausa(400);
      const b0 = await ler();
      ok(b0.itens.join(',') === 'carta-poppy', `bolsa: abre na caminhada e mostra só carta-poppy (${b0.itens.join(', ') || 'nada'})`);
      await s.acionar('[data-acao="inventario-fechar"]', 5000);
      await fechada();

      await s.esperarEtapa('carta2:carta-espera', 60000);
      await esperarAgora(s, 'carta2:carta-espera', 20000);
      await pausa(500);
      const caixa = await page.locator('[data-acao="inventario"]').filter({ visible: true }).first().boundingBox();
      if (!caixa) throw new Error('o botão da bolsa não está na tela em carta2:carta-espera');
      for (let i = 0; i < 3; i++) {
        await s.tocar(caixa.x + caixa.width / 2, caixa.y + caixa.height / 2);
        await pausa(60);
      }
      await pausa(600);
      const b1 = await ler();
      ok(b1.aberto === b1.marca && b1.folha === b1.aberto, `bolsa: três toques seguidos deixam a folha coerente (aberta ${b1.aberto}, data-aberto ${b1.marca}, folha visível ${b1.folha})`);
      // O toque no meio é conferido com a bolsa aberta (se os toques a deixaram fechada, ele abriria a carta de propósito).
      if (!b1.aberto) await abrirBolsa();
      await pausa(300);
      await s.tocarCentro();
      await pausa(500);
      const e1 = await s.estado();
      ok(`${e1.cena}:${e1.etapa}` === 'carta2:carta-espera', `bolsa: o toque no meio não abre a carta por baixo (está em ${e1.cena}:${e1.etapa})`);

      // Releitura pelo item (toque duplo): a etapa não muda e o capítulo veste a tela.
      if (!(await ler()).aberto) await abrirBolsa();
      await pausa(400);
      await toqueDuplo(s, '#inventario [data-acao="inventario-item"][data-id="carta-poppy"]');
      await esperar(page, () => !!document.querySelector('#pergaminho[data-estado="aberto"]'), null, 20000, 'a releitura de carta-poppy não abriu');
      await pausa(900);
      const conferirReleitura = async (rotulo) => {
        const e = await s.estado();
        const r = await ler();
        ok(`${e.cena}:${e.etapa}` === 'carta2:carta-espera', `bolsa ${rotulo}: a releitura não muda a etapa (${e.cena}:${e.etapa})`);
        ok(r.pele === 'poppy', `bolsa ${rotulo}: o disco veste a pele poppy (${r.pele || 'nenhuma'})`);
        ok(!r.palco, `bolsa ${rotulo}: o palco some atrás do capítulo`);
        ok(!r.botao, `bolsa ${rotulo}: o botão da bolsa some na leitura`);
        ok(!!r.nomeFechar && !/^fechar\b/i.test(r.nomeFechar), `bolsa ${rotulo}: o botão de fechar do capítulo não diz "fechar" (${r.nomeFechar || 'sem nome'})`);
      };
      await conferirReleitura('em pé');
      await page.setViewportSize({ width: 926, height: 428 });
      await pausa(600);
      await conferirReleitura('deitado');
      await page.setViewportSize({ width: 428, height: 926 });
      await pausa(600);

      await page.evaluate(() => {
        const rolagem = window.__carta.ctx.pergaminho?.rolagem;
        if (rolagem?.el) rolagem.irPara(rolagem.el.scrollHeight, { imediato: true });
      });
      await pausa(300);
      await s.acionar('[data-acao="fechar-capitulo"]', 10000);
      await esperar(page, () => !!document.getElementById('pergaminho')?.hidden && !window.__carta.ctx.inventario?.aberto, null, 30000, 'o capítulo relido não fechou');
      await pausa(900);
      const b2 = await ler();
      ok(b2.pele === 'papel' && b2.palco && b2.ligado && !b2.aberto,
        `bolsa: ao fechar, pele papel, palco visível, mundo ligado e bolsa fechada (pele ${b2.pele}, palco ${b2.palco}, ligado ${b2.ligado}, aberta ${b2.aberto})`);

      await abrirBolsa();
      await pausa(400);
      await page.keyboard.press('Escape');
      await pausa(500);
      ok(!(await ler()).aberto, 'bolsa: Esc fecha a bolsa');
      await s.tocarCentro();
      await s.esperarEtapa('carta2:papel', 20000);
      ok(true, 'bolsa: depois, o toque no meio abre a carta (carta2:papel)');
      await foto(s, 'bolsa-fim');
      semErro(s, 'bolsa');
    });
  },

  /** 13. O menu do fim. Sem o bloco menu no content.js, só informa. */
  async menu() {
    if (!COM_MENU) {
      console.log('  info  menu: o content.js não tem o bloco menu; nada a verificar');
      return;
    }
    // (a) O caminho do fim às referências e ao menu, nas três variantes.
    for (const extra of [{}, { webgl: 0 }, { reduzido: 1 }]) await menuVariante(extra);
    await menuLinkLimpo();
    await menuSaudade();
    await menuBilhetes();
    await menuSemLista();
    await menuToques();
    await menuTamanhos();
    await menuSemBloco();
  },
};

/* ---- o caso menu, por partes ------------------------------------------------ */

const CAPITULO_POPPY = ['poppy:lendo', 'poppy:enrolando', 'poppy:guardando'];
const MENU = CONTEUDO.menu || {};
// As etiquetas esperadas: uma por parte que existe e tem nome (a regra de js/cenas/menu.js).
const PARTES_MENU = ['inicio', 'poppy', 'yourname', 'mao', 'cartas', 'encontro', 'final']
  .filter((c) => (c !== 'cartas' || temCartas(CONTEUDO)) && (c !== 'encontro' || temEncontro(CONTEUDO)) && texto(MENU.partes?.[c]));
const RELIDAS = new Set(['poppy', 'yourname']);
const NO_MENU = { rapido: 3, musica: 0 };
// O menu já visto (marca): entra direto no varal, sem as referências.
const MENU_VISTO = { cena: 'menu', vp: 'iphone-safari', params: { ...NO_MENU, menu: 1 } };

// Os versos das músicas, só para procurar no texto do menu. Nunca são impressos:
// uma falha diz a faixa e o número do verso.
const VERSOS = (Array.isArray(CONTEUDO.musica?.faixas) ? CONTEUDO.musica.faixas : []).flatMap((f, i) => {
  const linhas = Array.isArray(f?.letra)
    ? f.letra.map((x) => (typeof x === 'string' ? x : x?.texto || ''))
    : String(f?.letra || '').split(/\r?\n/);
  return linhas
    .map((l, k) => ({ faixa: i + 1, verso: k + 1, texto: l.replace(/\[[^\]]*\]|<[^>]*>/g, '').replace(/\s+/g, ' ').trim().toLowerCase() }))
    .filter((v) => v.texto.length >= 12);
});

const lerMarca = (page) => page.evaluate(() => {
  try {
    return localStorage.getItem('carta2312:menu');
  } catch {
    return null;
  }
});

/** Quantos objetos o chão do menu deve ter com este content.js (a regra de js/cenas/menu.js). */
function objetosDoChao(c, comBilhetes) {
  const m = c.menu || {};
  const ligado = (chave) => typeof m.rotulos?.[chave] !== 'string' || m.rotulos[chave].trim() !== '';
  const voz = (Array.isArray(c.voz?.itens) ? c.voz.itens : []).some((i) => texto(i?.titulo) || texto(i?.arquivo));
  const refs = (Array.isArray(m.referencias) ? m.referencias : []).some((r) => texto(r?.titulo) && (texto(r?.sobre) || texto(r?.dele)));
  const faixas = (Array.isArray(c.musica?.faixas) ? c.musica.faixas : []).some((f) => texto(f?.titulo));
  const amigos = !!texto(m.amigos) && (Array.isArray(c.cartasChao?.itens) ? c.cartasChao.itens : []).some((i) => texto(i?.nome));
  const lista = refs || (faixas && !!texto(m.musicas?.titulo)) || amigos;
  const reabrir = c.resposta?.rotulos?.reabrir;
  const escrever = temResposta(c) && (typeof reabrir !== 'string' || reabrir.trim() !== '');
  return [voz, lista && ligado('referencias'), escrever, comBilhetes && ligado('bilhetes')].filter(Boolean).length;
}

/** (a) Do fim às referências, o pulo, o menu assentado, a folha, a releitura, a recarga e o portão. */
async function menuVariante(extra) {
  const rotulo = `menu ${Object.keys(extra).length ? new URLSearchParams(extra) : 'sem parâmetro'}`;
  await sessao(rotulo, { cena: 'final', vp: 'iphone-safari', params: { ...NO_MENU, ...extra } }, async (s) => {
    const { page } = s;
    await percorrer(s, 'menu:referencias', null, 90000, trecho(ESPERADO, 'final:carta-chegando'));
    await pausa(1500);
    const r = await page.evaluate((versos) => {
      const vis = window.__vis;
      const texto = (document.querySelector('#palco .menu')?.textContent || '').replace(/\s+/g, ' ').toLowerCase();
      const focaveis = [...document.querySelectorAll('#palco .menu .menu-etiqueta')].filter((e) => {
        e.focus({ preventScroll: true });
        return document.activeElement === e;
      }).length;
      document.activeElement?.blur?.();
      return {
        bolsa: vis(document.querySelector('[data-acao="inventario"]')),
        disco: vis(document.getElementById('mini')),
        contador: vis(document.querySelector('.contador-rotulo')),
        focaveis,
        achados: versos.map((v, i) => (texto.includes(v) ? i : -1)).filter((i) => i >= 0),
      };
    }, VERSOS.map((v) => v.texto));
    ok(!r.bolsa && !r.disco && !r.contador, `${rotulo}: nas referências, bolsa, disco e contador saem (bolsa ${r.bolsa}, disco ${r.disco}, contador ${r.contador})`);
    ok(r.focaveis === 0, `${rotulo}: nas referências, as etiquetas ainda não recebem foco (${r.focaveis} receberam)`);
    const achados = r.achados.slice(0, 3).map((i) => `faixa ${VERSOS[i].faixa}, verso ${VERSOS[i].verso}`).join('; ');
    ok(!r.achados.length, `${rotulo}: nenhum verso das músicas no texto do menu${achados ? ` (achados: ${achados})` : ''}`);
    ok((await lerMarca(page)) !== '1', `${rotulo}: a marca carta2312:menu ainda não é "1" nas referências`);
    await foto(s, `menu-${rotulo.slice(5).replace(/[^a-z0-9]+/gi, '-')}-referencias`);

    await s.acionar('[data-acao="menu-pular"]', 15000);
    await s.esperarEtapa('menu:menu', 30000);
    const marca = await lerMarca(page);
    ok(marca === '1', `${rotulo}: a marca carta2312:menu vira "1" quando o menu assenta (${marca})`);
    await pausa(3200);
    const a = await page.evaluate(() => {
      const vis = window.__vis;
      const palco = document.getElementById('palco');
      const u = new URL(location.href).searchParams;
      const saudade = document.querySelector('#palco .menu [data-acao="menu-saudade"]');
      return {
        bolsa: vis(document.querySelector('[data-acao="inventario"]')),
        disco: vis(document.getElementById('mini')),
        contador: vis(document.querySelector('.contador-rotulo')),
        creditos: [...document.querySelectorAll('.menu-cred')].some(vis),
        pular: vis(document.querySelector('[data-acao="menu-pular"]')),
        ordem: [...palco.children].filter((n) => n.matches('.menu, .depois')).map((n) => (n.matches('.menu') ? 'menu' : 'depois')).join(','),
        partes: [...document.querySelectorAll('#palco .menu .menu-etiqueta')].map((e) => e.dataset.cena),
        cena: u.get('cena'),
        musica: u.get('musica'),
        saudade: saudade ? { href: saudade.getAttribute('href') || '', target: saudade.target, rel: saudade.rel } : null,
        links: [...document.querySelectorAll('#palco .menu a.menu-etiqueta')].map((e) => ({ cena: e.dataset.cena, href: e.href })),
      };
    });
    ok(a.bolsa && a.disco, `${rotulo}: no menu, a bolsa e o disco voltam (bolsa ${a.bolsa}, disco ${a.disco})`);
    if (temContador(CONTEUDO)) ok(a.contador, `${rotulo}: no menu, o contador aparece`);
    ok(!a.creditos && !a.pular, `${rotulo}: sem créditos nem botão de pular (créditos ${a.creditos}, pular ${a.pular})`);
    ok(a.ordem === 'menu,depois', `${rotulo}: ordem no palco menu,depois (${a.ordem || 'nada'})`);
    ok(a.partes.join(',') === PARTES_MENU.join(','), `${rotulo}: uma etiqueta por parte (${a.partes.join(', ')})`);
    ok(a.cena === null && a.musica === null, `${rotulo}: o endereço fica limpo, sem cena nem musica (cena=${a.cena}, musica=${a.musica})`);
    if (a.saudade) {
      ok(/^https:\/\/wa\.me\//.test(a.saudade.href) && a.saudade.target === '_blank' && /\bnoopener\b/.test(a.saudade.rel),
        `${rotulo}: a pílula da saudade abre o WhatsApp em nova aba (_blank, noopener)`);
    }
    const certo = (l) => {
      const u = new URL(l.href).searchParams;
      return u.get('cena') === l.cena && u.has('musica') && u.get('volta') === '1' && u.get('rapido') === '3'
        && (extra.webgl === 0 ? u.get('webgl') === '0' : !u.has('webgl'))
        && (extra.reduzido === 1 ? u.get('reduzido') === '1' : !u.has('reduzido'));
    };
    const ruins = a.links.filter((l) => !certo(l));
    ok(!ruins.length, `${rotulo}: cada etiqueta leva a ?cena=…&musica=…&volta=1&rapido=3${ruins.length ? ` (erradas: ${ruins.map((l) => l.cena).join(', ')})` : ''}`);
    await foto(s, `menu-${rotulo.slice(5).replace(/[^a-z0-9]+/gi, '-')}-menu`);

    // A folha das referências é um diálogo; o resto fica inerte; Esc fecha e o foco volta.
    if (await page.locator('[data-acao="menu-referencias"]').count()) {
      await tocarForca(s, '[data-acao="menu-referencias"]');
      await esperar(page, () => !!document.querySelector('.menu-gaveta[data-aberto]'), null, 5000, 'a folha das referências não abriu');
      await pausa(500);
      const d = await page.evaluate(() => {
        const f = document.querySelector('.menu-gaveta[data-aberto] [role="dialog"]');
        return { dialogo: !!f && f.getAttribute('aria-modal') === 'true', inerte: !!document.querySelector('#palco .menu')?.inert };
      });
      ok(d.dialogo && d.inerte, `${rotulo}: a folha das referências é diálogo modal e o menu fica inerte (diálogo ${d.dialogo}, inerte ${d.inerte})`);
      await page.keyboard.press('Escape');
      await pausa(500);
      const f = await page.evaluate(() => ({ fechada: !document.querySelector('.menu-gaveta[data-aberto]'), foco: document.activeElement?.dataset?.acao || '' }));
      ok(f.fechada && f.foco === 'menu-referencias', `${rotulo}: Esc fecha a folha e o foco volta ao caderninho (fechada ${f.fechada}, foco ${f.foco || 'nada'})`);
    }

    // Reler poppy pela etiqueta: a etapa não muda e o foco volta à etiqueta.
    if (a.partes.includes('poppy')) {
      await tocarForca(s, '#palco .menu [data-acao="menu-parte"][data-cena="poppy"]');
      await esperar(page, () => !!document.querySelector('#pergaminho[data-estado="aberto"]'), null, 20000, 'a etiqueta de poppy não abriu a releitura');
      await pausa(900);
      const durante = await s.estado();
      await s.fecharDaBolsa();
      await pausa(600);
      const depois = await s.estado();
      const foco = await page.evaluate(() => (document.activeElement?.matches?.('.menu-etiqueta') ? document.activeElement.dataset.cena : ''));
      ok(durante.etapa === 'menu' && depois.etapa === 'menu' && foco === 'poppy',
        `${rotulo}: reler poppy pela etiqueta não muda a etapa e o foco volta a ela (${durante.cena}:${durante.etapa} → ${depois.cena}:${depois.etapa}, foco ${foco || 'nada'})`);
    }

    // Recarregar na mão recomeça do início; ?cena=menu com a marca abre o menu sem as referências.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await esperarBoot(page);
    await pausa(800);
    const recomeco = await page.evaluate(() => document.documentElement.dataset.cena);
    ok(recomeco === 'senha' || recomeco === 'musica', `${rotulo}: recarregar na mão recomeça do início (${recomeco})`);
    const volta = new URL(page.url());
    volta.searchParams.set('cena', 'menu');
    volta.searchParams.set('musica', '0');
    await page.goto(volta.href, { waitUntil: 'domcontentloaded' });
    await esperarBoot(page);
    await s.esperarEtapa('menu:menu', 30000);
    ok(!(await historico(s)).includes('menu:referencias'), `${rotulo}: ?cena=menu com a marca abre o menu, sem as referências`);

    // O portão: a etiqueta de uma parte que não é capítulo recarrega com volta=1.
    const parte = a.partes.includes('mao') ? 'mao' : a.partes.find((c) => !RELIDAS.has(c));
    if (!parte) return;
    await pausa(1500);
    await tocarForca(s, `#palco .menu a[data-acao="menu-parte"][data-cena="${parte}"]`);
    await page.waitForURL((u) => u.searchParams.get('cena') === parte && u.searchParams.get('volta') === '1', { timeout: 20000 });
    await esperarBoot(page);
    await esperar(page, () => document.documentElement.hasAttribute('data-portao') && !!document.querySelector('[data-acao="portao"]'), null, 20000, `o portão de ${parte} não apareceu`);
    await pausa(600);
    const p = await page.evaluate(() => {
      const voltar = document.querySelector('[data-acao="portao-voltar"]');
      const u = voltar ? new URL(voltar.href).searchParams : null;
      return {
        nome: document.querySelector('[data-acao="portao"]')?.getAttribute('aria-label') || '',
        voltar: !!u && u.get('cena') === 'menu' && !u.has('volta'),
        tocando: !!window.__carta.ctx.som?.estado?.tocando,
      };
    });
    ok(p.nome.includes(texto(MENU.partes?.[parte])) && p.voltar && !p.tocando,
      `${rotulo}: o portão de ${parte} tem o nome da parte, o link para o menu sem volta e a música parada (nome ${!!p.nome}, voltar ${p.voltar}, tocando ${p.tocando})`);
    await foto(s, `menu-${rotulo.slice(5).replace(/[^a-z0-9]+/gi, '-')}-portao`);
    await s.acionar('[data-acao="portao"]', 10000);
    const saiu = await esperar(page, () => !document.documentElement.hasAttribute('data-portao') && !new URL(location.href).searchParams.has('volta'), null, 10000, '').then(() => true, () => false);
    const comecou = await esperar(page, (c) => (window.__carta?.historico || []).some((h) => h.cena === c), parte, 15000, '').then(() => true, () => false);
    const tocando = await esperar(page, () => !!window.__carta.ctx.som?.estado?.tocando, null, 10000, '').then(() => true, () => false);
    ok(saiu && comecou && tocando, `${rotulo}: o toque no portão inicia ${parte}, tira volta do endereço e devolve a música (saiu ${saiu}, começou ${comecou}, música ${tocando})`);
    const miniMenu = await s.acionar('[data-acao="mini"]', 10000)
      .then(() => esperar(page, () => [...document.querySelectorAll('[data-acao="mini-menu"]')].some(window.__vis), null, 5000, ''))
      .then(() => true, () => false);
    ok(miniMenu, `${rotulo}: o painel do disco tem o link mini-menu`);
  });
}

/** (b) Link limpo com a marca: começa do início mesmo assim; ?cena=menu&menu=0 traz as referências e apaga a marca. */
async function menuLinkLimpo() {
  await sessao('menu link limpo', { vp: 'iphone-safari', params: { ...NO_MENU, menu: 1 }, entrar: true }, async (s) => {
    const { page } = s;
    // Abrir o site começa sempre do início: mesmo com a marca, depois da música vem a carta.
    for (let t = 0; t < 60000 && !(await historico(s)).some((p) => p.startsWith('inicio:')); t += 300) await pausa(300);
    const h = await historico(s);
    ok(h.some((p) => p.startsWith('inicio:')) && !h.some((p) => p.startsWith('menu:')), `menu link limpo: com a marca, da música vai à carta, não ao menu (${h.slice(-3).join(' → ')})`);

    const u = new URL(s.endereco);
    u.search = new URLSearchParams({ cena: 'menu', menu: '0', rapido: '3', musica: '0' }).toString();
    await page.goto(u.href, { waitUntil: 'domcontentloaded' });
    await esperarBoot(page);
    await s.esperarEtapa('menu:referencias', 30000);
    const marca = await lerMarca(page);
    ok(marca !== '1', `menu link limpo: ?cena=menu&menu=0 mostra as referências e apaga a marca (${marca})`);
  });
}

/** (c) A saudade em três versões: com número e mensagem, só com mensagem, sem os dois (o laço). */
async function menuSaudade() {
  const versoes = [
    { nome: 'com mensagem', numero: '5500900000000', mensagem: 'Saudade de teste', href: 'https://wa.me/5500900000000?text=Saudade%20de%20teste' },
    { nome: 'sem número', numero: '', mensagem: 'Saudade de teste', href: 'https://wa.me/?text=Saudade%20de%20teste' },
    { nome: 'sem os dois', numero: '', mensagem: '', href: '' },
  ];
  for (const v of versoes) {
    const codigo = `var c = window.CONTEUDO; c.resposta = c.resposta || { ativa: false }; c.resposta.whatsapp = ${JSON.stringify(v.numero)};
      c.menu.saudade = Object.assign({}, c.menu.saudade, { rotulo: (c.menu.saudade && c.menu.saudade.rotulo) || 'Saudade', mensagem: ${JSON.stringify(v.mensagem)} });`;
    await sessao(`menu saudade ${v.nome}`, { ...MENU_VISTO, preparar: mexerNoConteudo(codigo) }, async (s) => {
      await s.esperarEtapa('menu:menu', 30000);
      await pausa(1200);
      const r = await s.page.evaluate(() => {
        const a = document.querySelector('#palco .menu [data-acao="menu-saudade"]');
        return { href: a ? a.getAttribute('href') || '' : '', laco: !!document.querySelector('#palco .menu .menu-ponta-laco') };
      });
      if (v.href) ok(r.href === v.href, `menu saudade ${v.nome}: href ${r.href || 'nenhum'} (esperado ${v.href})`);
      else ok(!r.href && r.laco, `menu saudade ${v.nome}: sem link e com o laço (link ${r.href || 'nenhum'}, laço ${r.laco})`);
    });
  }
}

/** (d) Bilhetes com hoje=2026-12-23: um liberado abre e fecha; o fechado mostra a data; o sem título some. */
async function menuBilhetes() {
  const codigo = `window.CONTEUDO.menu.bilhetes = [
    { titulo: 'Abra hoje', texto: 'Bilhete de teste, já liberado.', abre: '2026-12-01' },
    { titulo: 'Abra depois', texto: 'Bilhete de teste, ainda fechado.', abre: '2027-01-10' },
    { titulo: '', texto: 'Bilhete sem título: não aparece.' },
  ];`;
  const params = { ...MENU_VISTO.params, hoje: '2026-12-23' };
  await sessao('menu bilhetes', { ...MENU_VISTO, params, preparar: mexerNoConteudo(codigo) }, async (s) => {
    const { page } = s;
    await s.esperarEtapa('menu:menu', 30000);
    await pausa(1500);
    const esperado = objetosDoChao(CONTEUDO, true);
    const chao = await page.evaluate(() => ({
      n: document.querySelectorAll('#palco .menu .menu-chao > li').length,
      muitos: !!document.querySelector('#palco .menu .menu-chao[data-muitos]'),
    }));
    ok(chao.n === esperado && chao.muitos === chao.n > 3, `menu bilhetes: ${chao.n} objetos no chão (esperado ${esperado}; data-muitos ${chao.muitos})`);
    await tocarForca(s, '[data-acao="menu-bilhetes"]');
    await esperar(page, () => !!document.querySelector('.menu-gaveta[data-aberto]'), null, 5000, 'a folha dos bilhetes não abriu');
    await pausa(500);
    const n = await page.evaluate(() => document.querySelectorAll('.menu-gaveta[data-aberto] .menu-bilhete-item').length);
    ok(n === 2, `menu bilhetes: dois itens na lista (${n})`);
    await s.acionar('.menu-gaveta[data-aberto] [data-acao="menu-bilhete"]', 5000);
    await pausa(400);
    const b = await page.evaluate(() => {
      const g = document.querySelector('.menu-gaveta[data-aberto]');
      return {
        texto: g?.querySelector('.menu-bilhete-texto:not([hidden])')?.textContent.trim() || '',
        // O fechado é o título e "Abre em dd/mm/aaaa" (rotulos.bilheteFechado), sem classe própria para a data.
        quando: g?.querySelector('.menu-bilhete-item[data-fechado]')?.textContent.replace(/\s+/g, ' ').trim() || '',
      };
    });
    ok(b.texto === 'Bilhete de teste, já liberado.', `menu bilhetes: o liberado abre com o texto (${b.texto || 'nada'})`);
    ok(/\b10\/01\/2027\b/.test(b.quando), `menu bilhetes: o fechado mostra a data em dd/mm/aaaa (${b.quando || 'nada'})`);
    await foto(s, 'menu-bilhetes');
  });
}

/** (e) Sem nada para listar: sem caderninho, com as partes. */
async function menuSemLista() {
  const codigo = 'var m = window.CONTEUDO.menu; m.referencias = []; m.musicas = {}; m.amigos = "";';
  await sessao('menu sem lista', { ...MENU_VISTO, preparar: mexerNoConteudo(codigo) }, async (s) => {
    await s.esperarEtapa('menu:menu', 30000);
    await pausa(1200);
    const r = await s.page.evaluate(() => ({
      caderno: !!document.querySelector('[data-acao="menu-referencias"]'),
      partes: [...document.querySelectorAll('#palco .menu .menu-etiqueta')].map((e) => e.dataset.cena),
    }));
    ok(!r.caderno && r.partes.join(',') === PARTES_MENU.join(','), `menu sem lista: sem caderninho e com as partes (caderninho ${r.caderno}; ${r.partes.join(', ')})`);
  });
}

/** (f) Toques duplos, toque no fundo, Esc e a tela estreita de 214 × 373. */
async function menuToques() {
  await sessao('menu toques', MENU_VISTO, async (s) => {
    const { page } = s;
    await s.esperarEtapa('menu:menu', 30000);
    await pausa(1500);
    if (await page.locator('[data-acao="menu-referencias"]').count()) {
      // Há uma gaveta por lista (referências e, com bilhetes, a dos bilhetes): o toque duplo não pode criar outra.
      const antes = await page.evaluate(() => document.querySelectorAll('.menu-gaveta').length);
      await toqueDuplo(s, '[data-acao="menu-referencias"]');
      await pausa(700);
      const g = await page.evaluate(() => {
        const folha = document.querySelector('.menu-gaveta[data-aberto] .menu-folha');
        return {
          gavetas: document.querySelectorAll('.menu-gaveta').length,
          abertas: document.querySelectorAll('.menu-gaveta[data-aberto]').length,
          topo: folha ? folha.getBoundingClientRect().top : 0,
        };
      });
      ok(g.gavetas <= Math.max(antes, 1) && g.abertas === 1, `menu toques: toque duplo no caderninho abre a folha uma vez (${antes} → ${g.gavetas} gaveta(s), ${g.abertas} aberta(s))`);
      if (g.topo > 16) {
        await s.tocar(page.viewportSize().width / 2, g.topo / 2);
        await pausa(600);
        ok(await page.evaluate(() => !document.querySelector('.menu-gaveta[data-aberto]')), 'menu toques: o toque no fundo fecha a folha');
      } else {
        console.log('  info  menu toques: a folha cobre a tela inteira; sem fundo para tocar');
        await page.keyboard.press('Escape');
        await pausa(600);
      }
    }
    if (await page.locator('[data-acao="menu-voz"]').count()) {
      await toqueDuplo(s, '[data-acao="menu-voz"]');
      const abriu = await esperar(page, () => !!document.querySelector('#voz[data-aberto]'), null, 5000, '').then(() => true, () => false);
      await pausa(600);
      const segue = await page.evaluate(() => !!document.querySelector('#voz[data-aberto]'));
      ok(abriu && segue, `menu toques: toque duplo na fita abre o cartão da voz (abriu ${abriu}, segue aberto ${segue})`);
      await page.keyboard.press('Escape');
      await pausa(600);
      ok(await page.evaluate(() => !document.querySelector('#voz[data-aberto]')), 'menu toques: Esc fecha o cartão da voz');
    }
    await page.setViewportSize({ width: 214, height: 373 });
    await pausa(900);
    const lat = await page.evaluate(() => {
      const L = innerWidth;
      const fora = [...document.querySelectorAll('#palco .menu a[href], #palco .menu button')].filter(window.__vis)
        .filter((e) => {
          const r = e.getBoundingClientRect();
          return r.left < -1 || r.right > L + 1;
        }).map((e) => e.dataset.acao + (e.dataset.cena ? `:${e.dataset.cena}` : ''));
      return { rola: document.documentElement.scrollWidth > L, fora };
    });
    ok(!lat.rola && !lat.fora.length, `menu toques: em 214×373 nada passa da lateral (rolagem ${lat.rola}${lat.fora.length ? `; fora: ${lat.fora.slice(0, 4).join(', ')}` : ''})`);
    await foto(s, 'menu-214x373');
  });
}

// Dentro da página: rolagem lateral, alvos pequenos, fora da tela, objetos do chão e sobreposição.
function MEDIR_MENU() {
  const vis = window.__vis;
  const L = innerWidth;
  const A = innerHeight;
  const nome = (e) => e.dataset.acao + (e.dataset.cena ? `:${e.dataset.cena}` : '');
  const alvos = [...document.querySelectorAll('#palco .menu a[href], #palco .menu button')].filter(vis)
    .map((e) => ({ nome: nome(e), r: e.getBoundingClientRect() }));
  const sobre = [];
  for (let i = 0; i < alvos.length; i++) {
    for (let j = i + 1; j < alvos.length; j++) {
      const a = alvos[i].r;
      const b = alvos[j].r;
      if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2) sobre.push(`${alvos[i].nome}×${alvos[j].nome}`);
    }
  }
  const frase = document.querySelector('#palco .menu .menu-saudade-frase');
  return {
    A,
    rola: document.documentElement.scrollWidth > L,
    pequenos: alvos.filter((a) => a.r.width < 44 || a.r.height < 44).map((a) => `${a.nome} ${Math.round(a.r.width)}×${Math.round(a.r.height)}`),
    fora: alvos.filter((a) => a.r.left < -1 || a.r.top < -1 || a.r.right > L + 1 || a.r.bottom > A + 1).map((a) => a.nome),
    coisas: [...document.querySelectorAll('#palco .menu .menu-coisa')].filter(vis).map((e) => e.getBoundingClientRect())
      .filter((r) => r.width < 88 || r.height < 84).map((r) => `${Math.round(r.width)}×${Math.round(r.height)}`),
    sobre,
    frase: frase ? vis(frase) : null,
  };
}

/** (g) Quatro tamanhos: sem rolagem lateral, alvos de 44 px, nada fora, chão de 88 × 84, sem sobreposição. */
async function menuTamanhos() {
  for (const [vp, largura, altura] of [['iphone-safari', 428, 746], ['iphone', 428, 926], ['celular', 375, 667], ['desktop', 1440, 900]]) {
    const rotulo = `menu ${largura}×${altura}`;
    await sessao(rotulo, { ...MENU_VISTO, vp }, async (s) => {
      const tela = s.page.viewportSize();
      if (tela.width !== largura || tela.height !== altura) await s.page.setViewportSize({ width: largura, height: altura });
      await s.esperarEtapa('menu:menu', 30000);
      await pausa(3000);
      const m = await s.page.evaluate(MEDIR_MENU);
      ok(!m.rola, `${rotulo}: sem rolagem lateral`);
      ok(!m.pequenos.length, `${rotulo}: alvos com pelo menos 44 px${m.pequenos.length ? ` (${m.pequenos.slice(0, 4).join(', ')})` : ''}`);
      ok(!m.fora.length, `${rotulo}: nada fora da tela${m.fora.length ? ` (${m.fora.slice(0, 4).join(', ')})` : ''}`);
      ok(!m.coisas.length, `${rotulo}: objetos do chão com pelo menos 88×84${m.coisas.length ? ` (${m.coisas.join(', ')})` : ''}`);
      ok(!m.sobre.length, `${rotulo}: sem sobreposição${m.sobre.length ? ` (${m.sobre.slice(0, 3).join(', ')})` : ''}`);
      if (m.frase !== null) ok(m.frase === m.A >= 700, `${rotulo}: a frase da saudade ${m.A >= 700 ? 'aparece' : 'some abaixo de 700 px'} (visível ${m.frase})`);
      await foto(s, `menu-${largura}x${altura}`);
      semErro(s, rotulo);
    });
  }
}

/** (h) Sem o bloco menu: final:fim continua o fim, sem pílula, sem link no disco, com o reabrir da resposta. */
async function menuSemBloco() {
  const roteiro = etapasDoFinal(CONTEUDO).map((e) => `final:${e}`);
  await sessao('menu sem bloco', { cena: 'final', vp: 'iphone-safari', params: NO_MENU, preparar: mexerNoConteudo('delete window.CONTEUDO.menu;') }, async (s) => {
    const { page } = s;
    await percorrer(s, 'final:fim', null, 90000, roteiro);
    await pausa(3000);
    const e = await s.estado();
    const r = await page.evaluate(() => ({
      menu: !!document.querySelector('#palco .menu'),
      saudade: !!document.querySelector('[data-acao="menu-saudade"]'),
      ir: !!document.querySelector('[data-acao="menu-ir"]'),
      reabrir: window.__vis(document.querySelector('[data-acao="resposta-abrir"]')),
    }));
    ok(`${e.cena}:${e.etapa}` === 'final:fim' && !r.menu, `menu sem bloco: final:fim continua o fim (${e.cena}:${e.etapa}, menu ${r.menu})`);
    ok(!r.ir && !r.saudade, `menu sem bloco: sem a pílula do menu nem a da saudade (menu-ir ${r.ir}, saudade ${r.saudade})`);
    if (temResposta(CONTEUDO)) ok(r.reabrir, 'menu sem bloco: com o botão de reabrir a resposta');
    await s.acionar('[data-acao="mini"]', 8000).catch(() => {});
    await pausa(600);
    ok(await page.evaluate(() => !document.querySelector('[data-acao="mini-menu"]')), 'menu sem bloco: sem o link do menu no disco');
    semErro(s, 'menu sem bloco');
  });
}

/* ---- principal -------------------------------------------------------------- */

async function principal() {
  const pedidos = process.argv.slice(2);
  for (const nome of pedidos.length ? pedidos : Object.keys(casos)) {
    console.log(`\n${nome}`);
    if (!Object.hasOwn(casos, nome)) {
      ok(false, `caso desconhecido: ${nome} (use ${Object.keys(casos).join(', ')})`);
      continue;
    }
    try {
      await casos[nome]();
    } catch (erro) {
      ok(false, `${nome}: ${String(erro?.message || erro).split('\n')[0]}`);
    }
  }
  if (falhas.length) {
    console.log(`\n${falhas.length} FALHA(S):`);
    for (const f of falhas) console.log(`  - ${f}`);
    return 1;
  }
  console.log('\nROBUSTEZ OK');
  return 0;
}

principal().then(
  (codigo) => process.exit(codigo),
  (erro) => {
    console.error(`erro: ${erro?.message || erro}`);
    process.exit(1);
  },
);
