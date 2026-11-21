#!/usr/bin/env node
// Robustez do núcleo: o que não pode quebrar de jeito nenhum.
//
//   node _dev/robustez.mjs              todos os casos (leva alguns minutos)
//   node _dev/robustez.mjs spam resize  só os casos pedidos
//
// Casos
//   spam       toques e cliques duplos o tempo todo, do começo ao fim: nenhuma etapa pula nem repete
//   resize     gira o aparelho a cada etapa; janela larga/estreita com a folha aberta
//   aba        aba oculta e visível (simulada): laço do mundo, espera() e música
//   contexto   perda e devolução do contexto WebGL; perda definitiva → recarrega no modo leve
//   params     ?cena= e outros parâmetros inválidos
//   faltando   todas as imagens e a música respondendo 404
//   teclado    a senha pelo teclado; Tab e Enter escolhem a música e abrem a carta
//   audio      nada de áudio antes do toque; depois, GainNode em 0,30; pausa e retoma
//   quebra     capítulo que não carrega e ouvinte de quadro que lança exceção
//   vazio      content.js vazio (só informa onde parou)
//   bolsa      a bolsa sob toques repetidos, Esc e giro do aparelho: reler não muda a etapa, nada abre por baixo
//   qualidade  travado em 30 fps desde o início não baixa a qualidade; ficar lento no meio baixa
//   menu       o menu do fim: a marca no aparelho, pular as referências, recarregar, o link limpo,
//              ?menu=0, a saudade, as etiquetas, reler pelo menu, o portão do som, os quatro tamanhos
//              de tela, a carta sem o bloco menu e a letra das músicas fora de tudo
//
// Capturas em output/robustez/. Código de saída ≠ 0 se algo falhar.

import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { abrir, RAIZ, lerConteudo, temEncontro, temCartas, temMenu, senhaDoConteudo, etapasDoFinal } from './lib.mjs';

const FOTOS = path.join(RAIZ, 'output', 'robustez');
await mkdir(FOTOS, { recursive: true });

// Roteiro 2 (_dev/ROTEIRO2.md): a carta começa na tela preta (senha e música).
const CONTEUDO = lerConteudo();
const ESPERADO = [
  ...(senhaDoConteudo(CONTEUDO) ? ['senha:senha', 'senha:senha-certa'] : []),
  'musica:musica', 'musica:entrando',
  'inicio:frases', 'inicio:caminhada', 'inicio:carta-chegando', 'inicio:carta-espera', 'inicio:carta-abrindo', 'inicio:papel',
  'poppy:desenrolando', 'poppy:lendo', 'poppy:enrolando', 'poppy:guardando',
  'carta2:caminhada', 'carta2:carta-chegando', 'carta2:carta-espera', 'carta2:carta-abrindo', 'carta2:papel',
  'yourname:desenrolando', 'yourname:lendo', 'yourname:enrolando', 'yourname:guardando',
  'mao:olha', 'mao:mao-espera', 'mao:correndo',
  // as cartas do chão: uma é aberta e fechada (assistindo), e ela segue em frente
  ...(temCartas(CONTEUDO) ? ['cartas:pousando', 'cartas:escolhendo', 'cartas:assistindo', 'cartas:escolhendo', 'cartas:seguindo'] : []),
  // o encontro só existe com quadros em encontro.quadros (js/content.js); anda sozinho
  ...(temEncontro(CONTEUDO) ? ['encontro:chegando', 'encontro:planos', 'encontro:maos', 'encontro:carta'] : []),
  // (contador e resposta só existem com as seções contador e resposta do content.js)
  ...etapasDoFinal(CONTEUDO).map((etapa) => `final:${etapa}`),
  // o menu do fim só existe com o bloco menu do content.js; num aparelho sem a marca as referências passam
  ...(temMenu(CONTEUDO) ? ['menu:referencias', 'menu:menu'] : []),
];
const COM_MENU = temMenu(CONTEUDO);
/** O roteiro até o fim da última carta (os percursos que param em final:fim comparam com este). */
const ATE_FIM = ESPERADO.slice(0, ESPERADO.indexOf('final:fim') + 1);

const falhas = [];
const ok = (cond, msg) => { if (!cond) falhas.push(msg); console.log(`${cond ? 'ok   ' : 'FALHA'} ${msg}`); };
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
/**
 * O histórico, com as cartas do chão normalizadas: ela pode abrir quantas quiser (cada uma
 * é um par assistindo → escolhendo); para comparar com ESPERADO fica só o primeiro par.
 */
const historico = async (s) => {
  const h = await s.page.evaluate(() => window.__carta.historico.map((x) => `${x.cena}:${x.etapa}`));
  const saida = [];
  let pares = 0;
  for (let i = 0; i < h.length; i++) {
    if (h[i] === 'cartas:assistindo' && h[i + 1] === 'cartas:escolhendo') {
      if (pares++ > 0) { i++; continue; }
    }
    saida.push(h[i]);
  }
  return saida;
};
const foto = (s, nome) => s.page.screenshot({ path: path.join(FOTOS, `${nome}.png`), scale: 'css' });

/** Faz o que a etapa pede para seguir adiante (tolerante: se já foi feito, segue). */
async function agir(s, etapa, { curto = 6000 } = {}) {
  const tentar = (seletor) => s.acionar(seletor, curto).catch(() => {});
  // fill em vez de digitar: funciona mesmo com toques tirando o foco do campo (caso spam)
  if (etapa === 'senha') await s.page.locator('[data-acao="senha"]').first().fill(senhaDoConteudo(CONTEUDO), { timeout: curto }).catch(() => {});
  else if (etapa === 'escolhendo') {
    // primeira vez: abre uma carta; depois de uma aberta, segue em frente
    const abertas = await s.page.locator('[data-acao="carta-chao"]:not([data-estado="fechada"])').count();
    await tentar(abertas ? '[data-acao="seguir-cartas"]' : '[data-acao="carta-chao"][data-estado="fechada"]');
    // (caso spam: um toque repetido pode abrir outra carta antes do "seguir"; fecha e tenta de novo)
    for (let i = 0; abertas && i < 6; i++) {
      await pausa(400);
      const agora = await s.page.evaluate(() => window.__carta.etapa).catch(() => '');
      if (agora !== 'assistindo' && agora !== 'escolhendo') break;
      if (agora === 'assistindo') await agir(s, 'assistindo', { curto: 2500 });
      await s.acionar('[data-acao="seguir-cartas"]', 2500).catch(() => {});
    }
  } else if (etapa === 'assistindo') {
    await tentar('[data-acao="fechar-carta"]');
    await tentar('#voz[data-aberto] [data-acao="voz-fechar"]');   // a Surpresinha abre os áudios
    await s.page.waitForFunction(() => window.__carta.etapa === 'escolhendo', null, { timeout: 20000, polling: 50 }).catch(() => {});
  }
  else if (etapa === 'carta-espera') await s.tocarCentro();
  else if (etapa === 'musica') { await tentar('[data-acao="faixa"]'); await tentar('[data-acao="continuar"]'); }
  else if (etapa === 'lendo') {
    await s.page.evaluate(() => { const r = window.__carta.ctx.pergaminho.rolagem; r.irPara(r.el.scrollHeight, { imediato: true }); });
    await pausa(250);
    await tentar('[data-acao="fechar-capitulo"]');
  } else if (etapa === 'mao-espera') await tentar('[data-acao="seguir-fio"]');
  else if (etapa === 'resposta') await tentar('[data-acao="resposta-guardar"]');
  // o fim já não é o fim: a pílula leva ao menu, e as referências se pulam com o botão
  else if (etapa === 'fim') await tentar('[data-acao="menu-ir"]');
  else if (etapa === 'referencias') await tentar('[data-acao="menu-pular"]');
}

/** Percorre o roteiro de `de` até `ate` (inclusive na espera, exclusive na ação). */
async function percorrer(s, ate = 'final:fim', aoChegar = null, timeout = 90000, roteiro = ESPERADO) {
  for (const passo of roteiro) {
    await s.esperarEtapa(passo, timeout);
    if (aoChegar) await aoChegar(passo);
    if (passo === ate) return;
    await agir(s, passo.split(':')[1]);
  }
}

const casos = {
  // 1. Toques repetidos o tempo todo: nada quebra, nenhuma etapa pula ou repete.
  async spam() {
    for (const vp of ['celular', 'desktop']) {
      const s = await abrir({ vp, params: { rapido: 5 } });
      let parar = false;
      const { width, height } = s.page.viewportSize();
      const pontos = [[0.5, 0.5], [0.5, 0.86], [0.5, 0.5], [0.5, 0.62], [0.3, 0.3], [0.5, 0.5], [0.92, 0.05]];
      const martelar = (async () => {
        let i = 0;
        while (!parar) {
          const [px, py] = pontos[i++ % pontos.length];
          try {
            await s.tocar(width * px, height * py);
            if (i % 3 === 0) await s.tocar(width * px, height * py);     // toque duplo
          } catch { /* página fechando */ }
          await pausa(70);
        }
      })();
      let erro = null;
      // Com o menu do fim a carta segue até ele, debaixo dos toques. Quando as referências
      // começam os toques param (assentado o menu, um toque numa etiqueta recarregaria a
      // página); se nenhum deles pulou as referências, o botão de pular pula.
      const pararNoMenu = async (passo) => { if (passo === 'menu:referencias') { parar = true; await martelar; } };
      try { await percorrer(s, COM_MENU ? 'menu:menu' : 'final:fim', pararNoMenu, 60000); } catch (e) { erro = e; }
      await pausa(1500);
      parar = true;
      await martelar;
      const h = await historico(s).catch(() => []);
      ok(!erro, `spam ${vp}: chegou ao fim (${erro ? String(erro.message).split('\n')[0] : 'sim'})`);
      ok(JSON.stringify(h) === JSON.stringify(ESPERADO), `spam ${vp}: etapas exatamente na ordem, sem pular nem repetir (${h.length}/${ESPERADO.length}${JSON.stringify(h) === JSON.stringify(ESPERADO) ? '' : ` → ${h.join(' ')}`})`);
      ok(s.erros.length === 0, `spam ${vp}: sem erros (${JSON.stringify(s.erros).slice(0, 400)})`);
      await foto(s, `spam-${vp}-fim`);
      await s.fechar();
    }
  },

  // 2. Girar o aparelho em cada parte.
  async resize() {
    const s = await abrir({ vp: 'celular', params: { rapido: 5 } });
    const deitado = { width: 844, height: 390 };
    const empe = { width: 390, height: 844 };
    const medir = () => s.page.evaluate(() => {
      const m = window.__carta.ctx.mundo;
      return {
        css: [m.canvas.clientWidth, m.canvas.clientHeight], buffer: [m.canvas.width, m.canvas.height],
        aspecto: +m.camera.aspect.toFixed(3), fov: +m.camera.fov.toFixed(1), tam: { ...m.tamanho }, ligado: m.ligado,
        janela: [innerWidth, innerHeight],
      };
    });
    let n = 0;
    await percorrer(s, 'final:fim', async (passo) => {
      n++;
      // alterna a orientação a cada etapa, com a animação em curso
      await s.page.setViewportSize(n % 2 ? deitado : empe);
      await pausa(420);
      const m = await medir();
      const esperado = n % 2 ? deitado : empe;
      const bate = m.css[0] === esperado.width && m.css[1] === esperado.height
        && Math.abs(m.aspecto - esperado.width / esperado.height) < 0.01
        && Math.abs(m.buffer[0] - m.tam.largura * m.tam.dpr) <= 2;
      ok(bate, `resize em ${passo}: canvas ${m.css.join('×')} buffer ${m.buffer.join('×')} aspecto ${m.aspecto} fov ${m.fov} ligado ${m.ligado}`);
      if (/carta-espera|musica|lendo|mao-espera|fim|carta-abrindo|papel|correndo|escolhendo|desdobrando/.test(passo)) await foto(s, `resize-${String(n).padStart(2, '0')}-${passo.replace(':', '-')}`);
      // o alvo do toque acompanha a tela nova
      if (passo.endsWith('carta-espera')) {
        const { width, height } = s.page.viewportSize();
        await s.tocar(width / 2, height / 2);
      }
    });
    await s.page.setViewportSize(empe);
    await pausa(600);
    await foto(s, 'resize-99-fim-em-pe');
    const h = await historico(s);
    ok(JSON.stringify(h) === JSON.stringify(ATE_FIM), `resize: fluxo inteiro na ordem (${h.length}/${ATE_FIM.length})`);
    ok(s.erros.length === 0, `resize: sem erros (${JSON.stringify(s.erros).slice(0, 400)})`);
    await s.fechar();

    // Computador: janela larga → estreita → larga com a folha aberta (o mundo liga/desliga junto).
    const d = await abrir({ vp: 'desktop', cena: 'poppy', params: { rapido: 5 } });
    await d.esperarEtapa('poppy:lendo');
    const ligado = () => d.page.evaluate(() => window.__carta.ctx.mundo.ligado);
    ok(await ligado() === true, 'desktop largo com a folha aberta: mundo ligado (pétalas dos lados)');
    await d.page.setViewportSize({ width: 600, height: 800 });
    await pausa(500);
    ok(await ligado() === false, 'janela estreita (folha cobre tudo): mundo desligado');
    await d.page.setViewportSize({ width: 1440, height: 900 });
    await pausa(500);
    ok(await ligado() === true, 'janela larga de novo: mundo religado');
    await foto(d, 'resize-desktop-religado');
    ok(d.erros.length === 0, `resize desktop: sem erros (${JSON.stringify(d.erros).slice(0, 300)})`);
    await d.fechar();
  },

  // 3. Aba oculta e visível (simulada: document.hidden + visibilitychange).
  async aba() {
    const s = await abrir({ vp: 'celular', params: { rapido: 1 }, entrar: true, preparar: async (page) => {
      await page.addInitScript(() => {
        let oculto = false;
        Object.defineProperty(Document.prototype, 'hidden', { configurable: true, get() { return oculto; } });
        Object.defineProperty(Document.prototype, 'visibilityState', { configurable: true, get() { return oculto ? 'hidden' : 'visible'; } });
        window.__ocultar = (v) => { oculto = v; document.dispatchEvent(new Event('visibilitychange')); };
      });
    } });
    await s.page.evaluate(() => {
      window.__quadros = 0;
      window.__carta.ctx.mundo.aoQuadro(() => { window.__quadros++; });
    });
    await pausa(600);
    const q0 = await s.page.evaluate(() => window.__quadros);
    await s.page.evaluate(() => window.__ocultar(true));
    const h0 = await historico(s);
    const q1 = await s.page.evaluate(() => window.__quadros);
    await pausa(4000);
    const q2 = await s.page.evaluate(() => window.__quadros);
    ok(q0 > 10, `mundo rodando antes (${q0} quadros)`);
    ok(q2 - q1 <= 1, `aba oculta: laço do mundo parado (${q2 - q1} quadros em 4 s)`);
    await s.page.evaluate(() => window.__ocultar(false));
    await pausa(700);
    const q3 = await s.page.evaluate(() => window.__quadros);
    ok(q3 - q2 > 10, `aba visível: laço voltou (${q3 - q2} quadros em 0,7 s)`);
    // espera() só conta tempo visível
    const t = await s.page.evaluate(async () => {
      const { espera } = await import('./js/nucleo/util.js');
      const t0 = performance.now();
      const p = espera(600);
      setTimeout(() => window.__ocultar(true), 200);
      setTimeout(() => window.__ocultar(false), 1700);
      await p;
      return Math.round(performance.now() - t0);
    });
    ok(t > 1950 && t < 2500, `espera(600) com 1,5 s de aba oculta no meio levou ${t} ms (esperado ~2100)`);
    ok(h0.length >= 1, 'histórico existe');
    await s.fechar();

    // Com música: oculta pausa, visível retoma.
    const m = await abrir({ vp: 'celular', params: { rapido: 6 }, preparar: async (page) => {
      await page.addInitScript(() => {
        let oculto = false;
        Object.defineProperty(Document.prototype, 'hidden', { configurable: true, get() { return oculto; } });
        window.__ocultar = (v) => { oculto = v; document.dispatchEvent(new Event('visibilitychange')); };
      });
    } });
    await percorrer(m, 'poppy:lendo');
    await pausa(2500);
    const diag = () => m.page.evaluate(() => ({ ...window.__carta.ctx.som.diagnostico(), estado: { ...window.__carta.ctx.som.estado } }));
    const a = await diag();
    await m.page.evaluate(() => window.__ocultar(true));
    await pausa(600);
    const b = await diag();
    await m.page.evaluate(() => window.__ocultar(false));
    await pausa(900);
    const c = await diag();
    ok(a.pausado === false && a.contexto === 'running' && Math.abs(a.ganho - 0.3) < 0.03, `música tocando pelo GainNode (ganho ${a.ganho.toFixed(3)}, contexto ${a.contexto}, webAudio ${a.webAudio})`);
    ok(b.pausado === true, 'aba oculta: música pausada');
    ok(c.pausado === false && c.tempo > b.tempo, `aba visível: música retomou (${b.tempo.toFixed(2)} → ${c.tempo.toFixed(2)} s)`);
    ok(m.erros.length === 0, `aba+música: sem erros (${JSON.stringify(m.erros).slice(0, 300)})`);
    await m.fechar();
  },

  // 4. Perda e devolução do contexto WebGL.
  async contexto() {
    const s = await abrir({ vp: 'celular', params: { rapido: 5 } });
    await s.page.evaluate(() => { window.__quadros = 0; window.__carta.ctx.mundo.aoQuadro(() => { window.__quadros++; }); });
    const perder = () => s.page.evaluate(() => {
      const gl = window.__carta.ctx.mundo.renderer.getContext();
      window.__ext = gl.getExtension('WEBGL_lose_context');
      window.__ext.loseContext();
    });
    const devolver = () => s.page.evaluate(() => window.__ext.restoreContext());
    const quadros = () => s.page.evaluate(() => window.__quadros);
    await percorrer(s, 'final:fim', async (passo) => {
      if (passo === 'inicio:carta-espera' || passo === 'final:carta-espera' || passo === 'final:fim') {
        await perder();
        await pausa(300);
        const q1 = await quadros();
        await pausa(500);
        const q2 = await quadros();
        ok(q2 - q1 <= 1, `contexto perdido em ${passo}: laço parado`);
        await devolver();
        await pausa(900);
        const q3 = await quadros();
        ok(q3 - q2 > 15, `contexto devolvido em ${passo}: laço voltou (${q3 - q2} quadros)`);
        await foto(s, `contexto-${passo.replace(':', '-')}`);
      }
    });
    const h = await historico(s);
    ok(JSON.stringify(h) === JSON.stringify(ATE_FIM), `contexto: fluxo inteiro (${h.length}/${ATE_FIM.length})`);
    ok(s.erros.length === 0, `contexto: sem erros (${JSON.stringify(s.erros).slice(0, 400)})`);
    await s.fechar();

    // Contexto perdido e NUNCA devolvido: recarrega na mesma cena, no modo leve, e a música volta no primeiro toque.
    const n = await abrir({ vp: 'celular', params: { rapido: 6 } });
    await percorrer(n, 'carta2:carta-espera');
    await pausa(1500);
    const tocandoAntes = await n.page.evaluate(() => window.__carta.ctx.som.estado.tocando);
    await n.page.evaluate(() => window.__carta.ctx.mundo.renderer.getContext().getExtension('WEBGL_lose_context').loseContext());
    await n.page.waitForURL(/webgl=0/, { timeout: 9000 }).catch(() => {});
    await n.page.waitForFunction(() => !!(window.__carta && window.__carta.ctx), null, { timeout: 15000 });
    const url = n.page.url();
    ok(/webgl=0/.test(url) && /cena=carta2/.test(url) && /musica=0/.test(url) && /rapido=6/.test(url), `contexto perdido para sempre: recarregou em ${url.split('?')[1]} (tocava antes: ${tocandoAntes})`);
    const modo = await n.page.evaluate(() => ({ ok: window.__carta.ctx.mundo.ok, cena: window.__carta.cena, tocando: window.__carta.ctx.som.estado.tocando }));
    ok(modo.ok === false && modo.cena === 'carta2' && modo.tocando === false, `depois de recarregar: modo leve, cena carta2, música esperando o toque (${JSON.stringify(modo)})`);
    let erro = null;
    try {
      const resto = ESPERADO.slice(ESPERADO.indexOf('carta2:caminhada'));
      for (const passo of resto) {
        await n.page.waitForFunction((alvo) => window.__carta.historico.some((h) => `${h.cena}:${h.etapa}` === alvo), passo, { timeout: 40000 });
        if (passo === 'carta2:carta-abrindo') {
          await pausa(1200);
          const d = await n.page.evaluate(() => ({ ...window.__carta.ctx.som.diagnostico(), e: { ...window.__carta.ctx.som.estado } }));
          ok(d.e.tocando && d.e.indice === 0 && d.pausado === false, `a música voltou no primeiro toque (${JSON.stringify(d.e)}, pausado ${d.pausado})`);
        }
        if (passo === 'final:fim') break;
        await agir(n, passo.split(':')[1]);
      }
    } catch (e) { erro = e; }
    ok(!erro, `depois de recarregar no modo leve: chega ao fim (${erro ? String(erro.message).slice(0, 160) : 'sim'})`);
    await pausa(600);
    await foto(n, 'contexto-nunca-fim');
    await n.fechar();

    // Com a folha na frente (ela está lendo), nada recarrega.
    const l = await abrir({ vp: 'desktop', cena: 'poppy', params: { rapido: 6 } });
    await l.esperarEtapa('poppy:lendo');
    const antes = l.page.url();
    await l.page.evaluate(() => window.__carta.ctx.mundo.renderer.getContext().getExtension('WEBGL_lose_context').loseContext());
    await pausa(6000);
    ok(l.page.url() === antes, 'contexto perdido durante a leitura de um capítulo: a página não recarrega');
    await l.fechar();
  },

  // 5. Parâmetros estranhos.
  async params() {
    for (const [rotulo, cena, params] of [['cena=xyz', 'xyz', {}], ['cena vazia', '', { cena: '' }], ['rapido=abc nivel=xyz webgl=banana', undefined, { rapido: 'abc', nivel: 'xyz', webgl: 'banana' }], ['cena=FINAL', 'FINAL', {}]]) {
      const s = await abrir({ vp: 'celular', cena, params });
      await s.esperarEtapa('senha:senha', 15000);
      const e = await s.page.evaluate(() => ({ cena: window.__carta.cena, etapa: window.__carta.etapa, d: document.documentElement.dataset.cena, amb: { r: window.__carta.ctx.amb.rapido, n: window.__carta.ctx.amb.nivel, w: window.__carta.ctx.amb.webgl } }));
      ok(e.cena === 'senha' && e.d === 'senha', `${rotulo} → cai no começo, a senha (${JSON.stringify(e)})`);
      ok(s.erros.length === 0, `${rotulo}: sem erros`);
      await s.fechar();
    }
  },

  // 6. Todas as imagens e a música faltando.
  async faltando() {
    for (const params of [{ rapido: 6 }, { rapido: 6, webgl: 0 }]) {
      const s = await abrir({ vp: 'celular', params, preparar: async (page) => {
        await page.route('**/assets/images/**', (r) => r.fulfill({ status: 404, body: '404' }));
        await page.route('**/assets/music/**', (r) => r.fulfill({ status: 404, body: '404' }));
      } });
      let erro = null;
      try {
        await percorrer(s, 'final:fim', async (passo) => {
          if (/musica|lendo/.test(passo)) { await pausa(500); await foto(s, `faltando-${params.webgl === 0 ? 'leve-' : ''}${passo.replace(':', '-')}`); }
          // (sem nenhum quadro, o encontro faz só a chegada: a luz corre pelo fio e a carta aparece)
        }, 40000, ESPERADO.filter((p) => !/^encontro:(planos|maos|carta)$/.test(p)));
      } catch (e) { erro = e; }
      ok(!erro, `tudo faltando ${JSON.stringify(params)}: chega ao fim (${erro ? String(erro.message).split('\n')[0] : 'sim'})`);
      const outros = s.erros.filter((e) => !/404/.test(e.texto));
      ok(outros.length === 0, `tudo faltando: só os 404 do navegador no console (${s.erros.length} avisos; outros: ${JSON.stringify(outros).slice(0, 300)})`);
      const quebradas = await s.page.evaluate(() => [...document.images].filter((i) => !i.complete || !i.naturalWidth).length);
      ok(quebradas === 0, `tudo faltando: nenhuma imagem quebrada na página (${quebradas})`);
      await s.fechar();
    }
  },

  // 7. Teclado.
  async teclado() {
    const s = await abrir({ vp: 'desktop', params: { rapido: 6 } });
    // A senha: no computador o campo já nasce com o foco; digitar basta.
    await s.esperarEtapa('senha:senha');
    const focoSenha = await s.page.evaluate(() => document.activeElement?.dataset?.acao);
    ok(focoSenha === 'senha', `o campo da senha já tem o foco (${focoSenha})`);
    await s.page.keyboard.type(senhaDoConteudo(CONTEUDO), { delay: 40 });
    await s.esperarEtapa('musica:musica', 20000);
    await pausa(800);
    // A música já leva o foco à primeira faixa sozinha; só tabula se não levou.
    const jaNaFaixa = await s.page.evaluate(() => document.activeElement?.dataset?.acao === 'faixa');
    if (!jaNaFaixa) await s.page.keyboard.press('Tab');
    const foco2 = await s.page.evaluate(() => document.activeElement?.dataset?.acao);
    await s.page.keyboard.press('Enter');
    await pausa(500);
    // As setas do carrossel ficam fora do Tab (tabindex -1): o Tab vai direto ao continuar.
    // O laço só garante, caso alguma peça nova entre no meio.
    let foco3 = '';
    for (let i = 0; i < 6 && foco3 !== 'continuar'; i++) {
      await s.page.keyboard.press('Tab');
      foco3 = await s.page.evaluate(() => document.activeElement?.dataset?.acao);
    }
    await foto(s, 'teclado-foco-continuar');
    await s.page.keyboard.press('Enter');
    await s.esperarEtapa('inicio:carta-espera', 40000);
    // A carta já leva o foco ao alvo sozinha (foco solto no body); só tabula se não levou.
    const jaNaCarta = await s.page.evaluate(() => document.activeElement?.dataset?.acao === 'abrir-carta');
    if (!jaNaCarta) await s.page.keyboard.press('Tab');
    const foco = await s.page.evaluate(() => document.activeElement?.dataset?.acao || document.activeElement?.tagName);
    ok(foco === 'abrir-carta', `Tab foca o alvo da carta (${foco})`);
    await s.page.keyboard.press('Enter');
    await s.esperarEtapa('poppy:lendo', 20000);
    ok(foco2 === 'faixa' && foco3 === 'continuar', `Tab/Enter escolhe a música e continua (${foco2}, ${foco3})`);
    ok(s.erros.length === 0, `teclado: sem erros (${JSON.stringify(s.erros).slice(0, 300)})`);
    await s.fechar();
  },

  // 8. Áudio: nada antes do toque; depois, GainNode.
  async audio() {
    const s = await abrir({ vp: 'celular', params: { rapido: 6 }, preparar: async (page) => {
      await page.addInitScript(() => {
        window.__contextos = 0;
        const Original = window.AudioContext;
        if (Original) window.AudioContext = class extends Original { constructor(...a) { super(...a); window.__contextos++; } };
        window.__plays = 0;
        const play = HTMLMediaElement.prototype.play;
        HTMLMediaElement.prototype.play = function (...a) { window.__plays++; return play.apply(this, a); };
      });
    } });
    await s.esperarEtapa('senha:senha');
    await pausa(600);
    const antes = await s.page.evaluate(() => ({ c: window.__contextos, p: window.__plays, e: { ...window.__carta.ctx.som.estado } }));
    ok(antes.c === 0 && antes.p === 0 && antes.e.destravado === false, `antes de qualquer toque: nenhum AudioContext, nenhum play (${JSON.stringify(antes)})`);
    await s.digitarSenha();
    await s.esperarEtapa('musica:musica');
    const meio = await s.page.evaluate(() => ({ c: window.__contextos, p: window.__plays, d: window.__carta.ctx.som.diagnostico() }));
    ok(meio.c === 1 && meio.p === 0 && meio.d.contexto === 'running', `depois da senha: contexto criado e rodando, música ainda não (${JSON.stringify(meio)})`);
    await s.acionar('[data-acao="faixa"]');
    await pausa(2600);
    const tocando = await s.page.evaluate(() => {
      const a = window.__carta.ctx.som;
      return { d: a.diagnostico(), e: { ...a.estado }, c: window.__contextos, p: window.__plays };
    });
    ok(tocando.d.webAudio && Math.abs(tocando.d.ganho - 0.3) < 0.02 && !tocando.d.pausado && tocando.d.tempo > 1, `tocando: ganho ${tocando.d.ganho.toFixed(3)} (alvo 0,30), tempo ${tocando.d.tempo.toFixed(2)} s`);
    await s.acionar('[data-acao="continuar"]');
    await s.esperarEtapa('inicio:carta-espera');
    await s.tocarCentro();
    await s.esperarEtapa('poppy:lendo');
    await s.acionar('[data-acao="mini"]');
    await pausa(300);
    await foto(s, 'audio-mini-aberto');
    await s.acionar('[data-acao="mini-alternar"]');
    await pausa(900);
    const pausado = await s.page.evaluate(() => window.__carta.ctx.som.diagnostico());
    await s.acionar('[data-acao="mini-alternar"]');
    await pausa(2400);
    const retomado = await s.page.evaluate(() => window.__carta.ctx.som.diagnostico());
    ok(pausado.pausado === true && pausado.ganho < 0.01, `mini pausa (ganho ${pausado.ganho.toFixed(3)})`);
    ok(retomado.pausado === false && Math.abs(retomado.ganho - 0.3) < 0.02, `mini retoma (ganho ${retomado.ganho.toFixed(3)})`);
    const laco = await s.page.evaluate(() => { const a = document.querySelector('audio'); return a ? 'no DOM' : 'fora do DOM'; });
    ok(s.erros.length === 0, `áudio: sem erros (${JSON.stringify(s.erros).slice(0, 300)}) [${laco}]`);
    await s.fechar();
  },

  // 9. Cena que quebra (módulo do capítulo não carrega) e ouvinte de quadro que quebra.
  async quebra() {
    const s = await abrir({ vp: 'celular', params: { rapido: 6 }, entrar: true, preparar: async (page) => {
      await page.route('**/js/capitulos/poppy.js', (r) => r.fulfill({ status: 404, body: '' }));
    } });
    await s.page.evaluate(() => {
      window.__quadros = 0;
      const m = window.__carta.ctx.mundo;
      m.aoQuadro(() => { throw new Error('ouvinte quebrado de propósito'); });
      m.aoQuadro(() => { window.__quadros++; });
    });
    await pausa(500);
    ok(await s.page.evaluate(() => window.__quadros) > 10, 'ouvinte de quadro que lança exceção não para o mundo');
    let erro = null;
    const etapas = ESPERADO.filter((p) => !/^(senha|musica):/.test(p) && !['poppy:lendo', 'poppy:enrolando', 'poppy:guardando'].includes(p));
    try {
      for (const passo of etapas) {
        await s.esperarEtapa(passo, 40000);
        if (passo === 'final:fim') break;
        await agir(s, passo.split(':')[1]);
      }
    } catch (e) { erro = e; }
    const h = await historico(s);
    ok(!erro, `capítulo que não carrega: a carta segue até o fim (${erro ? `${String(erro.message).split('\n')[0]} | ${h.join(' ')}` : 'sim'})`);
    await foto(s, 'quebra-fim');
    await s.fechar();
  },

  // 10. content.js vazio (o autor quebrou o arquivo).
  async vazio() {
    const s = await abrir({ vp: 'celular', params: { rapido: 6 }, preparar: async (page) => {
      await page.route('**/js/content.js', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: 'window.CONTEUDO = {};' }));
    } });
    let erro = null;
    try { await percorrer(s, 'final:fim', null, 25000); } catch (e) { erro = e; }
    const h = await historico(s);
    console.log(`info  content.js vazio: ${erro ? `parou em ${h[h.length - 1]} (${String(erro.message).split('\n')[0]})` : 'chegou ao fim'}; erros: ${JSON.stringify(s.erros).slice(0, 300)}`);
    await foto(s, 'vazio-onde-parou');
    await s.fechar();
  },

  // 11. Qualidade adaptativa: ritmo natural de 30 fps não é lentidão.
  async qualidade() {
    const medir = async (script, ms) => {
      // por ?cena=inicio: o mundo ligado desde a carga da página (atrás da tela preta ele fica desligado)
      const s = await abrir({ vp: 'celular', cena: 'inicio', preparar: (page) => page.addInitScript(script) });
      const ler = () => s.page.evaluate(() => { const m = window.__carta.ctx.mundo; return { nivel: m.amb.nivel, dpr: m.tamanho.dpr }; });
      const antes = await ler();
      await pausa(ms);
      const depois = await ler();
      await s.fechar();
      return { antes, depois };
    };
    const travado = () => {
      const original = window.requestAnimationFrame.bind(window);
      let quadro = 0;
      let fila = [];
      const tique = (t) => {
        if (quadro++ % 2 === 0) { const f = fila; fila = []; for (const fn of f) fn(t); }
        original(tique);
      };
      original(tique);
      window.requestAnimationFrame = (fn) => { fila.push(fn); return 0; };
      window.cancelAnimationFrame = () => {};
    };
    const sofrendo = () => {
      const original = window.requestAnimationFrame.bind(window);
      const t0 = performance.now();
      window.requestAnimationFrame = (fn) => (performance.now() - t0 < 3000 ? original(fn) : setTimeout(() => fn(performance.now()), 40));
    };
    const a = await medir(travado, 12000);
    ok(a.depois.nivel === a.antes.nivel && a.depois.dpr === a.antes.dpr, `travado em 30 fps desde o início: qualidade mantida (${JSON.stringify(a.depois)})`);
    const b = await medir(sofrendo, 16000);
    ok(b.depois.dpr < b.antes.dpr || b.depois.nivel !== b.antes.nivel, `ficou lento no meio: qualidade desce (${JSON.stringify(b.antes)} → ${JSON.stringify(b.depois)})`);
  },

  /** A bolsa: abre na caminhada e na espera, não deixa a carta abrir por baixo, relê sem mudar a etapa. */
  async bolsa() {
    const s = await abrir({ cena: 'carta2', vp: 'iphone', params: { rapido: 6 } });
    const inv = () => s.page.evaluate(() => {
      const i = window.__carta.ctx.inventario;
      const r = document.getElementById('inventario');
      return { aberto: i.aberto, itens: i.itens.map((x) => x.id), folha: r.hasAttribute('data-aberto'), oculto: r.hidden, etapa: `${window.__carta.cena}:${window.__carta.etapa}` };
    });
    // a bolsa já abre enquanto ela anda até a carta (o botão acabou de aparecer)
    await s.esperarEtapa('carta2:caminhada');
    await s.page.waitForSelector('[data-acao="inventario"]', { state: 'visible', timeout: 10000 });
    await s.page.locator('[data-acao="inventario"]').tap({ force: true, timeout: 3000 }).catch(() => {});
    await pausa(300);
    let e = await inv();
    ok(e.aberto && e.folha && e.itens.join() === 'carta-poppy', `bolsa: abre durante a caminhada, só com o que ela já guardou (${JSON.stringify(e)})`);
    await s.page.locator('[data-acao="inventario-fechar"]').tap({ force: true, timeout: 3000 }).catch(() => {});
    await s.esperarEtapa('carta2:carta-espera');
    await pausa(400);
    // toques repetidos no botão: termina num estado coerente
    for (let i = 0; i < 3; i++) await s.page.locator('[data-acao="inventario"]').tap({ force: true, timeout: 3000 }).catch(() => {});
    await pausa(500);
    e = await inv();
    ok(e.aberto === e.folha, `bolsa: três toques seguidos no botão deixam a folha coerente (${JSON.stringify(e)})`);
    if (!e.folha) await s.acionar('[data-acao="inventario"]');
    await pausa(400);
    // com a bolsa aberta, tocar no meio da tela (em cima da carta) não abre a carta
    await s.tocarCentro();
    await pausa(500);
    e = await inv();
    ok(e.etapa === 'carta2:carta-espera', `bolsa aberta: o toque no meio da tela não abre a carta por baixo (${e.etapa})`);
    // relê o capítulo; toque duplo no item, giro do aparelho no meio
    if (!(await inv()).folha) await s.acionar('[data-acao="inventario"]');
    await pausa(400);
    const item = s.page.locator('[data-acao="inventario-item"][data-id="carta-poppy"]');
    await item.tap({ timeout: 5000 });
    await item.tap({ force: true, timeout: 1000 }).catch(() => {});
    await s.page.waitForFunction(() => document.getElementById('pergaminho').dataset.estado === 'aberto', null, { timeout: 30000 });
    await s.page.setViewportSize({ width: 926, height: 428 });
    await pausa(600);
    await s.page.setViewportSize({ width: 428, height: 926 });
    await pausa(600);
    const lendo = await s.page.evaluate(() => ({
      etapa: `${window.__carta.cena}:${window.__carta.etapa}`, pele: document.getElementById('mini').dataset.pele,
      palco: getComputedStyle(document.getElementById('palco')).visibility, botao: getComputedStyle(document.querySelector('[data-acao="inventario"]')).opacity,
      rotulo: (document.querySelector('[data-acao="fechar-capitulo"]') || {}).textContent || '',
    }));
    ok(lendo.etapa === 'carta2:carta-espera' && lendo.pele === 'poppy' && lendo.palco === 'hidden' && Number(lendo.botao) < 0.05,
      `relendo pela bolsa: a etapa não muda, o mini veste o capítulo, o palco e o botão da bolsa saem da frente (${JSON.stringify(lendo)})`);
    ok(!/fechar/i.test(lendo.rotulo), `o botão do fim do capítulo não diz "fechar" ("${lendo.rotulo.trim()}")`);
    await foto(s, 'bolsa-relendo');
    await s.fecharDaBolsa();
    await pausa(500);
    const volta = await s.page.evaluate(() => ({
      etapa: `${window.__carta.cena}:${window.__carta.etapa}`, pele: document.getElementById('mini').dataset.pele,
      palco: getComputedStyle(document.getElementById('palco')).visibility, mundo: window.__carta.ctx.mundo.ligado, aberto: window.__carta.ctx.inventario.aberto,
    }));
    ok(volta.etapa === 'carta2:carta-espera' && volta.pele === 'papel' && volta.palco === 'visible' && volta.mundo && !volta.aberto,
      `depois de guardar de novo: tudo como estava (${JSON.stringify(volta)})`);
    // Esc fecha a folha (teclado)
    await s.acionar('[data-acao="inventario"]');
    await pausa(300);
    await s.page.keyboard.press('Escape');
    await pausa(400);
    ok(!(await inv()).aberto, 'Esc fecha a bolsa');
    // e a carta do caminho ainda abre
    await s.tocarCentro();
    await s.esperarEtapa('carta2:papel', 30000).then(() => ok(true, 'depois da bolsa, a carta do caminho ainda abre'), () => ok(false, 'depois da bolsa, a carta do caminho não abriu'));
    ok(s.erros.length === 0, `bolsa: sem erros (${JSON.stringify(s.erros).slice(0, 300)})`);
    await s.fechar();
  },

  /** O menu do fim (js/cenas/menu.js): só existe com o bloco menu do content.js. */
  async menu() {
    if (!COM_MENU) { console.log('info  sem o bloco menu no content.js: a carta termina em final:fim (nada a testar aqui)'); return; }
    const M = CONTEUDO.menu;
    const marca = (s) => s.page.evaluate(() => { try { return localStorage.getItem('carta2312:menu'); } catch { return null; } });
    const hist = (s) => s.page.evaluate(() => window.__carta.historico.map((x) => `${x.cena}:${x.etapa}`));
    // (as etiquetas balançam o tempo todo: o Playwright esperaria para sempre elas pararem; force pula essa espera)
    const tocarEtiqueta = async (s, cena) => {
      const alvo = s.page.locator(`[data-acao="menu-parte"][data-cena="${cena}"]`).first();
      await alvo.waitFor({ state: 'visible', timeout: 20000 });
      if (s.perfil.toque) await alvo.tap({ force: true, timeout: 20000 }); else await alvo.click({ force: true, timeout: 20000 });
    };
    const pronta = (s) => s.page.waitForFunction(() => !!(window.__carta && (window.__carta.ctx || window.__carta.erro)), null, { timeout: 30000 });
    /** O content.js servido à página com um remendo no fim (o arquivo não muda). */
    const comConteudo = (remendo) => async (page) => {
      const corpo = `${readFileSync(path.join(RAIZ, 'js', 'content.js'), 'utf8')}\n;(function (C) { ${remendo} })(window.CONTEUDO);\n`;
      await page.route(/\/js\/content\.js(\?.*)?$/, (rota) => rota.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: corpo, headers: { 'Cache-Control': 'no-store' } }));
    };
    // os versos das músicas (sem as marcas de tempo): nenhum pode aparecer no menu
    const versos = (CONTEUDO.musica?.faixas || []).flatMap((f) => String(f.letra || '').split(/\r?\n/))
      .map((l) => l.replace(/\[[^\]]*\]|<[^>]*>/g, '').replace(/\s+/g, ' ').trim().toLowerCase()).filter((l) => l.length >= 14);
    const semLetra = async (s, onde) => {
      const t = await s.page.evaluate(() => [...document.querySelectorAll('.menu, .menu-gaveta, .menu-portao')].map((n) => n.textContent).join(' ').replace(/\s+/g, ' ').toLowerCase());
      const achou = versos.find((v) => t.includes(v));
      ok(!achou, `menu ${onde}: nenhum verso das músicas no texto (${versos.length} versos conferidos${achou ? `; achou "${achou}"` : ''})`);
    };

    // (1)(2)(5)(6)(7)(8)(9)(12): com WebGL, sem WebGL e com movimento reduzido
    for (const extra of [{}, { webgl: 0 }, { reduzido: 1 }]) {
      const r = Object.keys(extra).length ? JSON.stringify(extra) : 'padrão';
      const s = await abrir({ cena: 'menu', vp: 'iphone-safari', params: { rapido: 3, musica: 0, ...extra } });
      await s.esperarEtapa('menu:referencias');
      await pausa(900);
      const durante = await s.page.evaluate(() => ({
        bolsa: document.getElementById('inventario').hidden, mini: document.getElementById('mini').hidden,
        contador: getComputedStyle(document.querySelector('.depois')).opacity,
        cartoes: document.querySelectorAll('.menu-creditos .menu-cred').length,
        inerte: document.querySelector('.menu nav').inert,
      }));
      ok(await marca(s) !== '1', `menu ${r}: com as referências passando a marca ainda não existe`);
      ok(durante.bolsa && durante.mini && Number(durante.contador) < 0.05 && durante.cartoes >= 2 && durante.inerte,
        `menu ${r}: nas referências a bolsa, o disco e o contador saem, e as etiquetas ainda não recebem foco (${JSON.stringify(durante)})`);
      await semLetra(s, `${r}, referências`);
      await foto(s, `menu-referencias${extra.webgl === 0 ? '-leve' : ''}${extra.reduzido ? '-calmo' : ''}`);
      await s.acionar('[data-acao="menu-pular"]', 15000);
      await s.esperarEtapa('menu:menu', 20000).then(() => ok(true, `menu ${r}: pular as referências chega ao menu`), () => ok(false, `menu ${r}: pular as referências não chegou ao menu`));
      await pausa(1800);
      ok(await marca(s) === '1', `menu ${r}: a marca fica no aparelho quando o menu assenta`);
      const assentado = await s.page.evaluate(() => ({
        bolsa: !document.getElementById('inventario').hidden, mini: !document.getElementById('mini').hidden,
        contador: getComputedStyle(document.querySelector('.depois')).opacity,
        creditos: document.querySelectorAll('.menu-creditos').length, pular: document.querySelectorAll('[data-acao="menu-pular"]').length,
        ordem: [...document.querySelectorAll('#palco .menu, #palco .depois')].map((n) => n.className.split(' ')[0]).join(','),
        partes: [...document.querySelectorAll('[data-acao="menu-parte"]')].map((n) => n.dataset.cena),
        bilhetes: document.querySelectorAll('[data-acao="menu-bilhetes"]').length,
        itens: window.__carta.ctx.inventario.itens.map((i) => i.id),
        url: location.search,
      }));
      ok(assentado.bolsa && assentado.mini && Number(assentado.contador) > 0.95 && !assentado.creditos && !assentado.pular && assentado.ordem === 'menu,depois',
        `menu ${r}: assentado, a bolsa, o disco e o contador voltam e as referências saem do DOM (${JSON.stringify(assentado)})`);
      const esperadas = ['inicio', 'poppy', 'yourname', 'mao', 'cartas', 'encontro', 'final']
        .filter((c) => String(M.partes?.[c] || '').trim() && (c !== 'cartas' || temCartas(CONTEUDO)) && (c !== 'encontro' || temEncontro(CONTEUDO)));
      ok(assentado.partes.join() === esperadas.join(), `menu ${r}: uma etiqueta por parte que existe, na ordem (${assentado.partes.join(' ')})`);
      ok(assentado.bilhetes === (Array.isArray(M.bilhetes) && M.bilhetes.length ? 1 : 0), `menu ${r}: o montinho de bilhetes só existe com bilhetes na lista (${assentado.bilhetes})`);
      ok(/cena=menu/.test(assentado.url) && /musica=0/.test(assentado.url), `menu ${r}: o endereço passa a retomar no menu (${assentado.url})`);
      await semLetra(s, `${r}, assentado`);
      await foto(s, `menu-assentado${extra.webgl === 0 ? '-leve' : ''}${extra.reduzido ? '-calmo' : ''}`);

      // (5) a saudade: um link de verdade para o WhatsApp, nada enviado sozinho
      const numero = String(CONTEUDO.resposta?.whatsapp || '').replace(/\D/g, '');
      const mensagem = String(M.saudade?.mensagem || '').trim();
      const saudade = await s.page.evaluate(() => { const a = document.querySelector('[data-acao="menu-saudade"]'); return a ? { href: a.getAttribute('href'), alvo: a.target, rel: a.rel, tag: a.tagName } : null; });
      if (numero || mensagem) {
        ok(!!saudade && saudade.tag === 'A' && saudade.href === `https://wa.me/${numero}${mensagem ? `?text=${encodeURIComponent(mensagem)}` : ''}` && saudade.alvo === '_blank' && /noopener/.test(saudade.rel),
          `menu ${r}: a pílula da saudade é um link para o WhatsApp (${JSON.stringify(saudade)})`);
      } else ok(!saudade, `menu ${r}: sem número e sem mensagem a pílula da saudade não existe`);

      // (6) cada etiqueta-link aponta para a cena certa, com volta=1 e a música
      const elos = await s.page.evaluate(() => [...document.querySelectorAll('a[data-acao="menu-parte"]')].map((a) => ({ cena: a.dataset.cena, href: a.getAttribute('href') })));
      const elosCertos = elos.length > 0 && elos.every((e) => {
        const p = new URLSearchParams(e.href.split('?')[1] || '');
        return p.get('cena') === e.cena && p.get('volta') === '1' && p.get('musica') === '0' && p.get('rapido') === '3' && !p.has('menu')
          && (extra.webgl === 0 ? p.get('webgl') === '0' : !p.has('webgl')) && (extra.reduzido ? p.get('reduzido') === '1' : !p.has('reduzido'));
      });
      ok(elosCertos, `menu ${r}: as etiquetas são links para ?cena=…&musica=…&volta=1, mantendo os parâmetros (${JSON.stringify(elos).slice(0, 300)})`);

      // a folha das referências: abre, o menu fica inerte, Esc fecha e o foco volta ao caderninho
      await s.acionar('[data-acao="menu-referencias"]');
      await pausa(700);
      const gaveta = await s.page.evaluate(() => ({
        aberta: !!document.querySelector('.menu-gaveta[data-aberto] [role="dialog"][aria-modal="true"]'), inerte: document.querySelector('.menu').inert,
        linhas: document.querySelectorAll('.menu-gaveta .menu-ref').length, foco: document.activeElement?.dataset?.acao || '',
      }));
      ok(gaveta.aberta && gaveta.inerte && gaveta.linhas >= 1 && gaveta.foco === 'menu-fechar', `menu ${r}: a folha das referências abre como diálogo e o resto fica inerte (${JSON.stringify(gaveta)})`);
      await semLetra(s, `${r}, folha das referências`);
      if (!Object.keys(extra).length) await foto(s, 'menu-folha-referencias');
      await s.page.keyboard.press('Escape');
      await pausa(500);
      const fechada = await s.page.evaluate(() => ({ aberta: !!document.querySelector('.menu-gaveta[data-aberto]'), inerte: document.querySelector('.menu').inert, foco: document.activeElement?.dataset?.acao || '' }));
      ok(!fechada.aberta && !fechada.inerte && fechada.foco === 'menu-referencias', `menu ${r}: Esc fecha a folha e o foco volta ao caderninho (${JSON.stringify(fechada)})`);

      // (7) reler um capítulo pelo menu: a etapa não muda e o foco volta à etiqueta
      await tocarEtiqueta(s, 'poppy');
      await s.page.waitForFunction(() => document.getElementById('pergaminho').dataset.estado === 'aberto', null, { timeout: 30000 });
      const relendo = await s.page.evaluate(() => ({ etapa: `${window.__carta.cena}:${window.__carta.etapa}`, palco: getComputedStyle(document.getElementById('palco')).visibility }));
      await s.fecharDaBolsa();
      await pausa(600);
      const releu = await s.page.evaluate(() => ({ etapa: `${window.__carta.cena}:${window.__carta.etapa}`, foco: document.activeElement?.dataset?.cena || '', palco: getComputedStyle(document.getElementById('palco')).visibility }));
      ok(relendo.etapa === 'menu:menu' && relendo.palco === 'hidden' && releu.etapa === 'menu:menu' && releu.foco === 'poppy' && releu.palco === 'visible',
        `menu ${r}: reler a carta do jogo pelo menu não muda a etapa e devolve o foco à etiqueta (${JSON.stringify({ relendo, releu })})`);

      // (2) recarregar no menu, já com a marca: sem referências
      await s.page.reload({ waitUntil: 'load' });
      await pronta(s);
      await s.esperarEtapa('menu:menu', 20000);
      const h2 = await hist(s);
      ok(h2.join() === 'menu:menu', `menu ${r}: recarregar com a marca volta ao menu assentado, sem referências (${h2.join(' ')})`);
      await pausa(1500);

      // (8) o portão: a etiqueta recarrega naquela parte; um toque devolve o som e inicia a cena
      const alvo = esperadas.includes('mao') ? 'mao' : esperadas.find((c) => c !== 'poppy' && c !== 'yourname');
      await Promise.all([
        s.page.waitForURL(new RegExp(`cena=${alvo}.*volta=1|volta=1.*cena=${alvo}`), { timeout: 20000 }),
        tocarEtiqueta(s, alvo),
      ]);
      await pronta(s);
      await s.page.waitForSelector('[data-acao="portao"]', { state: 'visible', timeout: 15000 });
      await pausa(700);
      const noPortao = await s.page.evaluate(() => ({
        portao: document.documentElement.hasAttribute('data-portao'), cena: window.__carta.cena, rotulo: document.querySelector('[data-acao="portao"]').getAttribute('aria-label'),
        voltar: document.querySelector('[data-acao="portao-voltar"]')?.getAttribute('href') || '', tocando: window.__carta.ctx.som.estado.tocando,
      }));
      ok(noPortao.portao && noPortao.cena === null && noPortao.rotulo.startsWith(String(M.partes[alvo]).trim()) && /cena=menu/.test(noPortao.voltar) && !/volta=/.test(noPortao.voltar) && !noPortao.tocando,
        `menu ${r}: o portão espera o toque antes de a cena começar (${JSON.stringify(noPortao)})`);
      await semLetra(s, `${r}, portão`);
      if (!Object.keys(extra).length) await foto(s, 'menu-portao');
      await s.acionar('[data-acao="portao"]');
      await s.page.waitForFunction((c) => window.__carta.cena === c && !document.documentElement.hasAttribute('data-portao'), alvo, { timeout: 20000 })
        .then(() => ok(true, `menu ${r}: o toque no portão inicia a cena "${alvo}"`), () => ok(false, `menu ${r}: o toque no portão não iniciou a cena "${alvo}"`));
      await pausa(1500);
      const depoisPortao = await s.page.evaluate(() => ({ url: location.search, som: { ...window.__carta.ctx.som.estado }, resto: document.querySelectorAll('.menu-portao').length }));
      ok(!/volta=/.test(depoisPortao.url) && new RegExp(`cena=${alvo}`).test(depoisPortao.url) && depoisPortao.som.indice === 0 && depoisPortao.som.tocando && !depoisPortao.resto,
        `menu ${r}: depois do toque o endereço perde o volta e a música volta (${JSON.stringify(depoisPortao)})`);
      // o atalho no painel do disco: de dentro de uma parte, "Voltar ao menu"
      const elo = await s.page.evaluate(() => { const a = document.querySelector('[data-acao="mini-menu"]'); return a ? { href: a.getAttribute('href'), oculto: a.hidden } : null; });
      ok(!!elo && !elo.oculto && /cena=menu/.test(elo.href) && /musica=0/.test(elo.href), `menu ${r}: o painel do disco tem o elo de volta ao menu (${JSON.stringify(elo)})`);
      ok(s.erros.length === 0, `menu ${r}: sem erros (${JSON.stringify(s.erros).slice(0, 400)})`);
      await s.fechar();
    }

    // (3) o link limpo num aparelho com a marca: senha, música e menu, com a bolsa semeada. (4) ?menu=0 apaga a marca.
    {
      const s = await abrir({ vp: 'iphone-safari', params: { rapido: 6, menu: 1 } });
      await s.passarEntrada();
      await s.esperarEtapa('menu:menu', 40000);
      await pausa(1500);
      const h = await hist(s);
      const e = await s.page.evaluate(() => ({ itens: window.__carta.ctx.inventario.itens.map((i) => i.id), bolsa: !document.getElementById('inventario').hidden, hora: document.documentElement.dataset.hora, url: location.search, entrada: !!document.getElementById('entrada') }));
      ok(!h.some((p) => !/^(senha|musica|menu):/.test(p)) && h[h.length - 1] === 'menu:menu' && !h.includes('menu:referencias'), `link limpo com a marca: da música direto ao menu (${h.join(' ')})`);
      ok(e.itens.includes('carta-poppy') && e.itens.includes('carta-yourname') && e.bolsa && e.hora === 'noite' && !e.entrada && !/menu=1/.test(e.url), `link limpo com a marca: a bolsa vem semeada e a noite já está pronta (${JSON.stringify(e)})`);
      await foto(s, 'menu-link-limpo');
      await s.page.goto(`${s.endereco.split('?')[0]}?cena=menu&menu=0&rapido=6`, { waitUntil: 'load' });
      await pronta(s);
      await s.esperarEtapa('menu:referencias', 20000).then(() => ok(true, '?menu=0: as referências passam de novo'), () => ok(false, '?menu=0: as referências não passaram'));
      const z = await s.page.evaluate(() => ({ marca: (() => { try { return localStorage.getItem('carta2312:menu'); } catch { return 'erro'; } })(), url: location.search }));
      ok(z.marca === null && !/menu=0/.test(z.url), `?menu=0 apaga a marca e sai do endereço (${JSON.stringify(z)})`);
      ok(s.erros.length === 0, `link limpo e ?menu=0: sem erros (${JSON.stringify(s.erros).slice(0, 300)})`);
      await s.fechar();
    }

    // (5) a saudade com mensagem, sem número, e sem os dois; os bilhetes ligados
    for (const [rotulo, remendo, conferir] of [
      ['com mensagem', "C.menu.saudade.mensagem = 'Oi & saudade';", (d) => /^https:\/\/wa\.me\/\d*\?text=Oi%20%26%20saudade$/.test(d.href || '')],
      ['sem número, com mensagem', "C.resposta.whatsapp = ''; C.menu.saudade.mensagem = 'Oi';", (d) => d.href === 'https://wa.me/?text=Oi'],
      ['sem número e sem mensagem', "C.resposta.whatsapp = ''; C.menu.saudade.mensagem = '';", (d) => d.href === null && d.laco === 1],
    ]) {
      const s = await abrir({ cena: 'menu', vp: 'iphone-safari', params: { rapido: 6, menu: 1 }, preparar: comConteudo(remendo) });
      await s.esperarEtapa('menu:menu', 20000);
      await pausa(1200);
      const d = await s.page.evaluate(() => ({ href: document.querySelector('[data-acao="menu-saudade"]')?.getAttribute('href') ?? null, laco: document.querySelectorAll('.menu-ponta-laco').length }));
      ok(conferir(d), `saudade ${rotulo}: ${JSON.stringify(d)}`);
      if (d.href === null) await foto(s, 'menu-sem-saudade');
      ok(s.erros.length === 0, `saudade ${rotulo}: sem erros (${JSON.stringify(s.erros).slice(0, 300)})`);
      await s.fechar();
    }
    {
      const s = await abrir({ cena: 'menu', vp: 'iphone-safari', params: { rapido: 6, menu: 1, hoje: '2026-12-23' }, preparar: comConteudo("C.menu.bilhetes = [{ titulo: 'Abra hoje', texto: 'Texto do bilhete.', abre: '' }, { titulo: 'Abra depois', texto: 'Segredo.', abre: '2027-01-01' }, { titulo: '', texto: 'sem título não entra' }];") });
      await s.esperarEtapa('menu:menu', 20000);
      await pausa(1500);
      await s.acionar('[data-acao="menu-bilhetes"]');
      await pausa(700);
      await s.acionar('[data-acao="menu-bilhete"]');
      await pausa(300);
      const b = await s.page.evaluate(() => ({
        objetos: document.querySelectorAll('.menu-chao .menu-coisa').length, itens: document.querySelectorAll('.menu-bilhete-item').length,
        aberto: document.querySelector('.menu-bilhete-item[data-aberto] .menu-bilhete-texto')?.textContent || '',
        fechado: document.querySelector('.menu-bilhete-item[data-fechado]')?.textContent || '',
      }));
      ok(b.objetos === 4 && b.itens === 2 && b.aberto === 'Texto do bilhete.' && /01\/01\/2027/.test(b.fechado) && !/Segredo/.test(b.fechado), `bilhetes ligados: o que já pode abre, o que tem data espera fechado (${JSON.stringify(b)})`);
      await foto(s, 'menu-bilhetes');
      ok(s.erros.length === 0, `bilhetes: sem erros (${JSON.stringify(s.erros).slice(0, 300)})`);
      await s.fechar();
    }

    // sem nada para listar (sem referências, sem o cartão das músicas, sem o dos amigos): o caderninho não existe
    {
      const s = await abrir({ cena: 'menu', vp: 'iphone-safari', params: { rapido: 6, menu: 1 }, preparar: comConteudo("C.menu.referencias = []; C.menu.musicas = { titulo: '' }; C.menu.amigos = '';") });
      await s.esperarEtapa('menu:menu', 20000);
      await pausa(800);
      const d = await s.page.evaluate(() => ({ caderno: document.querySelectorAll('[data-acao="menu-referencias"]').length, partes: document.querySelectorAll('[data-acao="menu-parte"]').length }));
      ok(d.caderno === 0 && d.partes > 0, `menu sem nada para listar: o caderninho não aparece (${JSON.stringify(d)})`);
      ok(s.erros.length === 0, `menu sem nada para listar: sem erros (${JSON.stringify(s.erros).slice(0, 300)})`);
      await s.fechar();
    }
    // toque duplo no caderninho: a folha abre e fica aberta (o segundo toque cai no fundo, com ela ainda subindo);
    // e em 214×373 (zoom alto) nada sai pela lateral
    {
      const s = await abrir({ cena: 'menu', vp: 'iphone-safari', params: { rapido: 6, menu: 1 } });
      await s.esperarEtapa('menu:menu', 20000);
      await pausa(800);
      const caderno = s.page.locator('[data-acao="menu-referencias"]').first();
      await caderno.tap({ force: true });
      await caderno.tap({ force: true }).catch(() => {});
      await pausa(700);
      const g = await s.page.evaluate(() => ({ abertas: document.querySelectorAll('.menu-gaveta[data-aberto]').length, inerte: document.querySelector('.menu').inert }));
      ok(g.abertas === 1 && g.inerte, `menu: o toque duplo no caderninho deixa a folha aberta (${JSON.stringify(g)})`);
      await s.page.locator('.menu-gaveta-fundo').tap({ position: { x: 20, y: 20 }, force: true });
      await pausa(500);
      ok(await s.page.evaluate(() => !document.querySelector('.menu-gaveta[data-aberto]')), 'menu: depois disso, um toque no fundo fecha a folha');
      // o mesmo na fita: o segundo toque cai no véu do cartão da voz, que ainda está chegando
      const fita = s.page.locator('[data-acao="menu-voz"]').first();
      if (await fita.count()) {
        await fita.tap({ force: true });
        await fita.tap({ force: true }).catch(() => {});
        await pausa(700);
        ok(await s.page.evaluate(() => !!document.querySelector('#voz[data-aberto]')), 'menu: o toque duplo na fita deixa o cartão da voz aberto');
        await s.page.keyboard.press('Escape');
        await pausa(600);
        ok(await s.page.evaluate(() => !document.querySelector('#voz[data-aberto]') && !window.__carta.ctx.inventario.aberto), 'menu: Esc fecha o cartão da voz e a bolsa fica livre');
      }
      await s.page.setViewportSize({ width: 214, height: 373 });
      await pausa(900);
      const e = await s.page.evaluate(() => ({
        rola: document.documentElement.scrollWidth > innerWidth || document.querySelector('.menu').scrollWidth > document.querySelector('.menu').clientWidth + 1,
        fora: [...document.querySelectorAll('.menu [data-acao]')].filter((n) => { const q = n.getBoundingClientRect(); return q.left < -1 || q.right > innerWidth + 1; }).map((n) => n.dataset.cena || n.dataset.acao),
      }));
      ok(!e.rola && !e.fora.length, `menu em 214×373: nada sai pela lateral (${JSON.stringify(e)})`);
      await foto(s, 'menu-214x373');
      ok(s.erros.length === 0, `menu, toque duplo e 214×373: sem erros (${JSON.stringify(s.erros).slice(0, 300)})`);
      await s.fechar();
    }

    // (10) os quatro tamanhos: sem rolagem lateral, alvos de 44 px ou mais, nada fora da tela nem montado
    {
      const s = await abrir({ cena: 'menu', vp: 'iphone-safari', params: { rapido: 6, menu: 1 } });
      await s.esperarEtapa('menu:menu', 20000);
      for (const [w, h] of [[428, 746], [428, 926], [375, 667], [1440, 900]]) {
        await s.page.setViewportSize({ width: w, height: h });
        await pausa(900);
        const m = await s.page.evaluate(() => {
          const caixa = (n) => { const q = n.getBoundingClientRect(); return { x: Math.round(q.left), y: Math.round(q.top), w: Math.round(q.width), h: Math.round(q.height), d: Math.round(q.right), b: Math.round(q.bottom) }; };
          const alvos = [...document.querySelectorAll('.menu [data-acao], [data-acao="inventario"], [data-acao="mini"]')].filter((n) => n.offsetParent !== null || n.getClientRects().length);
          const etiquetas = [...document.querySelectorAll('[data-acao="menu-parte"]')].map(caixa);
          const chao = [...document.querySelectorAll('.menu-coisa')].map(caixa);
          const ponta = caixa(document.querySelector('.menu-ponta'));
          const bolsa = caixa(document.querySelector('[data-acao="inventario"]'));
          const contador = caixa(document.querySelector('.contador-rotulo'));   // (a frase do contador, invisível, ainda ocupa lugar na caixa inteira)
          return {
            rola: document.documentElement.scrollWidth > innerWidth || document.querySelector('.menu').scrollWidth > innerWidth,
            pequenos: alvos.map((n) => ({ a: n.dataset.acao, ...caixa(n) })).filter((c) => c.w < 44 || c.h < 44),
            fora: [...etiquetas, ...chao, ponta].filter((c) => c.x < 0 || c.y < 0 || c.d > innerWidth || c.b > innerHeight),
            chaoPequeno: chao.filter((c) => c.w < 88 || c.h < 84),
            montado: ponta.b > Math.min(...chao.map((c) => c.y)) || Math.max(...chao.map((c) => c.d)) > bolsa.x || etiquetas[0].y < contador.b,
            frase: !!document.querySelector('.menu-saudade-frase') && getComputedStyle(document.querySelector('.menu-saudade-frase')).display !== 'none',
            alturaEtiqueta: etiquetas[0].h,
          };
        });
        ok(!m.rola && !m.pequenos.length && !m.fora.length && !m.chaoPequeno.length && !m.montado,
          `menu em ${w}×${h}: sem rolagem lateral, alvos ≥ 44 px, nada fora da tela nem montado (${JSON.stringify(m).slice(0, 500)})`);
        if (h < 700) ok(!m.frase, `menu em ${w}×${h}: a frase da saudade sai`);
        await foto(s, `menu-${w}x${h}`);
      }
      ok(s.erros.length === 0, `menu nos quatro tamanhos: sem erros (${JSON.stringify(s.erros).slice(0, 300)})`);
      await s.fechar();
    }

    // (11) sem o bloco menu, final:fim continua sendo o fim
    {
      const s = await abrir({ cena: 'final', vp: 'iphone-safari', params: { rapido: 8 }, preparar: comConteudo('delete C.menu;') });
      await percorrer(s, 'final:fim', null, 60000, ATE_FIM.filter((p) => p.startsWith('final:')));
      await pausa(3500);
      const f = await s.page.evaluate(() => ({
        etapa: `${window.__carta.cena}:${window.__carta.etapa}`, pilula: document.querySelectorAll('[data-acao="menu-ir"]').length,
        reabrir: document.querySelector('[data-acao="resposta-abrir"]')?.textContent.trim() || '', elo: document.querySelectorAll('[data-acao="mini-menu"]').length,
      }));
      ok(f.etapa === 'final:fim' && f.pilula === 0 && f.elo === 0 && (!CONTEUDO.resposta || f.reabrir.length > 0), `sem o bloco menu: final:fim continua sendo o fim, com o botão de sempre (${JSON.stringify(f)})`);
      ok(s.erros.length === 0, `sem o bloco menu: sem erros (${JSON.stringify(s.erros).slice(0, 300)})`);
      await s.fechar();
    }
  },
};

const pedidos = process.argv.slice(2);

for (const nome of pedidos.length ? pedidos : Object.keys(casos)) {
  console.log(`\n##### ${nome}`);
  if (!casos[nome]) { ok(false, `caso desconhecido: ${nome}`); continue; }
  try { await casos[nome](); } catch (erro) { ok(false, `${nome}: exceção no teste → ${String(erro && erro.stack || erro).split('\n').slice(0, 3).join(' | ')}`); }
}
console.log(falhas.length ? `\n${falhas.length} FALHA(S):\n- ${falhas.join('\n- ')}` : '\nROBUSTEZ OK');
process.exit(falhas.length ? 1 : 0);
