// A animação de guardar a carta (js/cenas/bolso.js), quadro a quadro, pelo caminho de
// verdade: abre o capítulo, toca em "Guardar no bolso" e, quando o bolso começa, para a
// linha do tempo dele e a leva a cada instante (as fotos não dependem da máquina).
//
//   node _dev/ver-bolso.mjs [vp] [tema] [ms,ms,...] [--motor webkit] [--params "webgl=0"]
//     vp      iphone (padrão) | iphone-safari | celular | desktop
//     tema    poppy (padrão) | yourname
//     ms      instantes das fotos, em ms da linha do tempo do bolso
//
// Fotos em output/ver/bolso-<vp>-<tema>[-<params>]-<ms>.png; a tira: python _dev/tira.py <vp> <tema>.
// Também percorre a linha do tempo a cada 1/60 s e mede: a faixa da tela que o #mundo
// (e o #mundo-leve) deixam descoberta (tem que ser 0), onde a carta aparece e o maior
// salto dela entre dois quadros.
import { abrir, PASTA_FOTOS } from './lib.mjs';
import { mkdir, readdir, rm } from 'node:fs/promises';

const args = process.argv.slice(2);
const opcao = (nome) => { const i = args.indexOf(nome); return i < 0 ? '' : args.splice(i, 2)[1] || ''; };
const motor = opcao('--motor') || 'chromium';
const extra = opcao('--params');
const [vp = 'iphone', tema = 'poppy', lista = '0,300,600,900,1200,1500,1800,2100,2400,2700,3000,3300'] = args;
const nome = `bolso-${vp}-${tema}${extra ? `-${extra.replace(/[^a-z0-9]+/gi, '')}` : ''}`;
const fotos = lista.split(',').map(Number).filter((n) => Number.isFinite(n)).sort((a, b) => a - b);

await mkdir(PASTA_FOTOS, { recursive: true });
// (as fotos de uma rodada anterior com outros instantes não entram na tira)
for (const f of await readdir(PASTA_FOTOS)) if (new RegExp(`^${nome}-\\d+\\.png$`).test(f)) await rm(`${PASTA_FOTOS}/${f}`);
const s = await abrir({ cena: tema, vp, motor, params: Object.fromEntries(new URLSearchParams(extra)) });
let falhou = false;
try {
  await s.esperarEtapa(`${tema}:lendo`);
  // Quando o bolso começar: a primeira linha do tempo dele fica parada no 0, e a rede de
  // segurança (LIMITE_MS) é esticada para não acabar com a animação no meio das fotos.
  await s.page.evaluate(() => {
    const bolso = window.__carta.ctx.bolso;
    const guardar = bolso.guardar.bind(bolso);
    bolso.guardar = (opcoes) => {
      const { gsap } = window;
      const criar = gsap.timeline;
      const relogio = window.setTimeout;
      gsap.timeline = (...a) => { const tl = criar.apply(gsap, a); if (!window.__tlBolso) window.__tlBolso = tl.pause(0); return tl; };
      window.setTimeout = (fn, ms, ...r) => relogio(fn, ms >= 1000 ? ms * 40 : ms, ...r);
      try { return guardar(opcoes); } finally { gsap.timeline = criar; window.setTimeout = relogio; }
    };
  });
  await s.page.evaluate(() => { const r = window.__carta.ctx.pergaminho.rolagem; r.irPara(r.el.scrollHeight, { imediato: true }); });
  await s.pausa(400);
  await s.acionar('[data-acao="fechar-capitulo"]');
  await s.page.waitForFunction(() => !!window.__tlBolso, null, { timeout: 60000, polling: 16 });

  // (o fim exato da linha do tempo dispara o onComplete e limpa tudo: as medidas param 1 ms antes)
  const medida = await s.page.evaluate(() => {
    const tl = window.__tlBolso;
    const fim = tl.duration() - 0.001;
    const L = innerWidth; const A = innerHeight;
    const camadas = ['mundo', 'mundo-leve'].map((id) => document.getElementById(id)).filter((n) => n && n.getClientRects().length);
    const opacidade = (n) => { let o = 1; for (; n && n.id !== 'bolso'; n = n.parentElement) { const c = getComputedStyle(n); if (c.visibility === 'hidden') return 0; o *= Number(c.opacity); } return o; };
    const r1 = (v) => Math.round(v * 10) / 10;
    const pior = Object.fromEntries(camadas.map((n) => [n.id, { faixa: 0, t: 0, topo: 0, base: A }]));
    const carta = { aparece: null, salto: 0, tSalto: 0 };
    let antes = null;
    for (let i = 0; i <= Math.ceil(fim * 60); i++) {
      const t = Math.min(fim, i / 60);
      tl.time(t, false);
      for (const n of camadas) {
        const c = n.getBoundingClientRect();
        const p = pior[n.id];
        const faixa = Math.max(0, c.top, A - c.bottom, c.left, L - c.right);
        if (faixa > p.faixa) Object.assign(p, { faixa, t });
        p.topo = Math.min(p.topo, c.top);
        p.base = Math.max(p.base, c.bottom);
      }
      const no = document.querySelector('#bolso .bolso-carta');
      const op = no ? opacidade(no) : 0;
      if (op > 0.01) {
        const c = no.getBoundingClientRect();
        const centro = { x: c.left + c.width / 2, y: c.top + c.height / 2 };
        if (!carta.aparece) carta.aparece = { t: r1(t), pe: r1(c.bottom), topo: r1(c.top), opacidade: r1(op) };
        if (antes) {
          const d = Math.hypot(centro.x - antes.x, centro.y - antes.y);
          if (d > carta.salto) Object.assign(carta, { salto: r1(d), tSalto: r1(t) });
        }
        antes = centro;
      } else antes = null;
    }
    for (const p of Object.values(pior)) { p.faixa = r1(p.faixa); p.t = r1(p.t); p.topo = r1(p.topo); p.base = r1(p.base); }
    return { duracao: tl.duration(), L, A, pior, carta };
  });

  console.log(`${nome} (${medida.L}×${medida.A}, ${motor}): linha do tempo de ${medida.duracao.toFixed(2)} s`);
  for (const [id, p] of Object.entries(medida.pior)) {
    console.log(`  #${id}: caixa de ${p.topo} a ${p.base} px; maior faixa descoberta ${p.faixa} px${p.faixa ? ` (em ${p.t} s)` : ''}`);
    if (p.faixa > 0.5) falhou = true;
  }
  const { aparece, salto, tSalto } = medida.carta;
  if (aparece) console.log(`  carta: aparece em ${aparece.t} s, de ${aparece.topo} a ${aparece.pe} px, opacidade ${aparece.opacidade}; maior salto entre quadros ${salto} px (em ${tSalto} s)`);

  for (const ms of fotos) {
    const estado = await s.page.evaluate(async (t) => {
      const tl = window.__tlBolso;
      tl.time(Math.min(t, tl.duration() - 0.001), false);
      await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
      const caixa = (sel) => {
        const n = document.querySelector(sel);
        if (!n) return '-';
        const c = n.getBoundingClientRect();
        let o = 1;
        for (let p = n; p && p.id !== 'bolso'; p = p.parentElement) { const e = getComputedStyle(p); o *= e.visibility === 'hidden' ? 0 : Number(e.opacity); }
        return `${Math.round(c.left)},${Math.round(c.top)} ${Math.round(c.width)}×${Math.round(c.height)} op ${o.toFixed(2)}`;
      };
      return `carta ${caixa('#bolso .bolso-carta')} | bolsa ${caixa('#bolso .bolso-bolsa')} | alças ${caixa('#bolso .bolso-alcas')}`;
    }, ms / 1000);
    await s.page.screenshot({ path: `${PASTA_FOTOS}/${nome}-${ms}.png`, scale: 'css' });
    console.log(`  ${String(ms).padStart(4)} ms  ${estado}`);
  }

  // Solta a linha do tempo: o bolso termina e a carta segue.
  await s.page.evaluate(() => window.__tlBolso.play());
  await s.page.waitForFunction(() => document.getElementById('bolso').hidden, null, { timeout: 30000, polling: 50 });
  await s.pausa(600);
  await s.foto(`${nome}-depois`);
  if (s.erros.length) { falhou = true; console.log('  erros:', s.erros.slice(0, 5)); }
  console.log(`fotos: output/ver/${nome}-<ms>.png e ${nome}-depois.png`);
} catch (erro) {
  falhou = true;
  console.error(erro);
} finally {
  await s.fechar();
}
process.exit(falhou ? 1 : 0);
