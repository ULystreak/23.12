/* ============================================================================
   VER-BOLSO: a guarda da carta no bolso, quadro a quadro
   ============================================================================
   Pelo caminho real: abre o capítulo, rola até o fim e aciona "Guardar no
   bolso" (fechar-capitulo). Quando a animação começa, congela a linha do tempo
   do bolso (js/cenas/bolso.js) e a leva aos instantes pedidos: as fotos não
   dependem da máquina. Mede também, a cada 1/60 s, a faixa da tela que
   #mundo e #mundo-leve deixam descoberta (tem que ser 0), o instante em que a
   carta aparece e o maior salto dela entre dois quadros. Ao fim, solta a linha.

   Uso: node _dev/ver-bolso.mjs [vp] [tema] [ms,ms,...] [--motor webkit] [--params "webgl=0"]
     vp    iphone (padrão), iphone-safari, celular ou desktop
     tema  poppy (padrão) ou yourname
     ms    instantes das fotos, em ms da linha do tempo do bolso
   Fotos em output/ver/bolso-<vp>-<tema>[-params]-<ms>.png; junte com _dev/tira.py.
   Com reduzido=1 o bolso só dissolve: a primeira linha criada é outra e a
   medida não descreve a viagem.
   ========================================================================== */

import path from 'node:path';
import { mkdir, readdir, rm } from 'node:fs/promises';
import { abrir, PASTA_FOTOS } from './lib.mjs';

const INSTANTES = [0, 300, 600, 900, 1200, 1500, 1800, 2100, 2400, 2700, 3000, 3300];
const FOLGA_PX = 0.5;

const argv = process.argv.slice(2);
/** Lê o valor de um flag e o tira da lista (o resto é posicional: vp, tema, ms). */
function opcao(nome) {
  const i = argv.indexOf(nome);
  if (i < 0) return null;
  const [, valor] = argv.splice(i, 2);
  return valor ?? null;
}

const motor = opcao('--motor') || 'chromium';
const textoParams = opcao('--params') || '';
const [vp = 'iphone', tema = 'poppy', listaMs] = argv;
const instantes = listaMs ? listaMs.split(',').map(Number).filter((n) => Number.isFinite(n) && n >= 0) : INSTANTES;
const nome = `bolso-${vp}-${tema}${textoParams ? `-${textoParams.replace(/[^a-z0-9]/gi, '')}` : ''}`;
const pausa = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Na página: envolve ctx.bolso.guardar. Durante a chamada, a primeira linha do
// tempo criada vira window.__tlBolso (pausada em 0) e os setTimeout de 1 s ou
// mais ficam 40× mais longos: a rede de segurança (LIMITE_MS, 4200 ms) é
// esticada para não acabar com a animação no meio das fotos.
function prender() {
  const bolso = window.__carta.ctx.bolso;
  const original = bolso.guardar.bind(bolso);
  bolso.guardar = async (...args) => {
    const gsap = window.gsap;
    const linhaOriginal = gsap.timeline;
    const timerOriginal = window.setTimeout;
    gsap.timeline = (...a) => {
      const tl = linhaOriginal.apply(gsap, a);
      if (!window.__tlBolso) {
        window.__tlBolso = tl;
        tl.pause(0);
      }
      return tl;
    };
    window.setTimeout = (fn, ms, ...resto) => timerOriginal(fn, ms >= 1000 ? ms * 40 : ms, ...resto);
    try {
      return await original(...args);
    } finally {
      gsap.timeline = linhaOriginal;
      window.setTimeout = timerOriginal;
    }
  };
}

// Na página: percorre a linha a 60 amostras por segundo e mede.
function medir() {
  const tl = window.__tlBolso;
  // O fim exato da linha do tempo dispara o onComplete e limpa tudo: as medidas param 1 ms antes.
  const fim = tl.duration() - 0.001;
  const L = innerWidth;
  const A = innerHeight;
  const camadas = {};
  for (const id of ['mundo', 'mundo-leve']) {
    const no = document.getElementById(id);
    if (no) camadas[id] = { no, topo: Infinity, base: -Infinity, pior: 0, em: 0 };
  }
  let aparece = null;
  let salto = 0;
  let saltoEm = 0;
  let antes = null;
  for (let t = 0; t <= fim + 1e-9; t += 1 / 60) {
    const agora = Math.min(t, fim);
    tl.seek(agora, false);
    for (const c of Object.values(camadas)) {
      const caixa = [...c.no.getClientRects()].find((r) => r.width > 0 && r.height > 0);
      if (!caixa || getComputedStyle(c.no).visibility === 'hidden') continue;
      c.topo = Math.min(c.topo, caixa.top);
      c.base = Math.max(c.base, caixa.bottom);
      const descoberto = Math.max(0, caixa.top, caixa.left, L - caixa.right, A - caixa.bottom);
      if (descoberto > c.pior) {
        c.pior = descoberto;
        c.em = agora;
      }
    }
    const carta = document.querySelector('#bolso .bolso-carta');
    if (carta) {
      const op = Number(getComputedStyle(carta).opacity);
      if (aparece === null && op > 0.01) aparece = agora;
      const r = carta.getBoundingClientRect();
      const centro = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      if (antes && op > 0.01) {
        const d = Math.hypot(centro.x - antes.x, centro.y - antes.y);
        if (d > salto) {
          salto = d;
          saltoEm = agora;
        }
      }
      antes = centro;
    }
  }
  const um = (v) => Math.round(v * 10) / 10;
  return {
    duracao: Math.round(tl.duration() * 1000),
    camadas: Object.fromEntries(Object.entries(camadas).map(([id, c]) => [id, {
      topo: Number.isFinite(c.topo) ? um(c.topo) : null,
      base: Number.isFinite(c.base) ? um(c.base) : null,
      pior: um(c.pior),
      em: Math.round(c.em * 1000),
    }])),
    aparece: aparece === null ? null : Math.round(aparece * 1000),
    salto: um(salto),
    saltoEm: Math.round(saltoEm * 1000),
  };
}

// Na página: caixa e opacidade acumulada (até #bolso) das peças do bolso.
function pecas() {
  const raiz = document.getElementById('bolso');
  const ler = (sel) => {
    const no = raiz?.querySelector(sel);
    if (!no) return null;
    let op = 1;
    for (let n = no; n && n !== raiz.parentElement; n = n.parentElement) op *= Number(getComputedStyle(n).opacity);
    const r = no.getBoundingClientRect();
    return `${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}×${Math.round(r.height)} op ${Math.round(op * 100) / 100}`;
  };
  return { carta: ler('.bolso-carta'), bolsa: ler('.bolso-bolsa'), alcas: ler('.bolso-alcas') };
}

async function principal() {
  if (!['poppy', 'yourname'].includes(tema)) throw new Error(`tema desconhecido: ${tema} (use poppy ou yourname)`);
  await mkdir(PASTA_FOTOS, { recursive: true });
  // Só as fotos deste nome (instantes e "depois"): a tira e as de outros --params ficam.
  const minhas = new RegExp(`^${nome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d+|depois)\\.png$`);
  const antigas = (await readdir(PASTA_FOTOS)).filter((f) => minhas.test(f));
  await Promise.all(antigas.map((f) => rm(path.join(PASTA_FOTOS, f), { force: true })));

  const s = await abrir({ cena: tema, vp, motor, params: Object.fromEntries(new URLSearchParams(textoParams)) });
  let falhou = false;
  try {
    await s.esperarEtapa(`${tema}:lendo`, 60000);
    await s.page.evaluate(prender);
    await s.page.evaluate(() => {
      const rolagem = window.__carta.ctx.pergaminho?.rolagem;
      if (rolagem?.el) rolagem.irPara(rolagem.el.scrollHeight, { imediato: true });
    });
    await pausa(400);
    await s.acionar('[data-acao="fechar-capitulo"]');
    await s.page.waitForFunction(() => !!window.__tlBolso, null, { polling: 16, timeout: 60000 });

    const m = await s.page.evaluate(medir);
    console.log(`linha do tempo do bolso: ${m.duracao} ms`);
    for (const [id, c] of Object.entries(m.camadas)) {
      console.log(`  #${id}: topo ${c.topo} base ${c.base}; maior faixa descoberta ${c.pior} px em ${c.em} ms`);
      if (c.pior > FOLGA_PX) {
        console.log(`  ! #${id} deixa ${c.pior} px da tela descobertos (máximo ${FOLGA_PX})`);
        falhou = true;
      }
    }
    console.log(`  carta: aparece em ${m.aparece ?? 'nunca'} ms; maior salto ${m.salto} px em ${m.saltoEm} ms`);

    for (const ms of instantes) {
      // Para trás, sem eventos: os callbacks da linha (limpezas) não rodam de novo.
      await s.page.evaluate((t) => {
        const tl = window.__tlBolso;
        tl.seek(Math.min(t / 1000, tl.duration() - 0.001));
      }, ms);
      await s.page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      const p = await s.page.evaluate(pecas);
      await s.foto(`${nome}-${ms}`);
      console.log(`  ${ms} ms: carta ${p.carta ?? '-'} | bolsa ${p.bolsa ?? '-'} | alças ${p.alcas ?? '-'}`);
    }

    await s.page.evaluate(() => window.__tlBolso.play());
    await s.page.waitForFunction(() => !!document.getElementById('bolso')?.hidden, null, { polling: 50, timeout: 30000 });
    await pausa(600);
    console.log(`  depois: ${await s.foto(`${nome}-depois`)}`);

    for (const e of s.erros) {
      console.log(`  ! ${e.tipo}: ${e.texto}`);
      falhou = true;
    }
  } finally {
    await s.fechar();
  }
  return falhou ? 1 : 0;
}

principal().then(
  (codigo) => process.exit(codigo),
  (erro) => {
    console.error(`erro: ${erro?.message || erro}`);
    process.exit(1);
  },
);
