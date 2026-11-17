#!/usr/bin/env node
// Linha de comando da verificação. Percorre as etapas de uma cena (ou a carta
// inteira), tocando onde precisa, e termina com código ≠ 0 se houver erro de
// console, pedido que falhou ou etapa que não chegou.
//
//   node _dev/ver.mjs --cena poppy --vp celular,desktop --motor chromium,webkit --rapido 6 --ate lendo --fotos
//   node _dev/ver.mjs --fluxo --rapido 6 --fotos            (da senha até a frase final)
//   node _dev/ver.mjs --cena inicio --video                 (grava em output/video/)
//   node _dev/ver.mjs --cena final --params "webgl=0"       (parâmetros extras do endereço)
//   node _dev/ver.mjs --cena inicio --quadros               (mede os quadros na última etapa)
//
// Opções
//   --cena a,b      cenas a verificar (padrão: todas)
//   --vp a,b        celular (390×844) e/ou desktop (1440×900)        (padrão: celular)
//   --motor a,b     chromium e/ou webkit                              (padrão: chromium)
//   --rapido N      acelera a carta N vezes
//   --ate etapa     para nesta etapa (padrão: a última da cena)
//   --fotos         salva output/ver/<cena>-<vp>-<motor>-<etapa>.png a cada etapa
//                   (no --fluxo: fluxo-<cena>-...; com --params: ...-<etapa>-<chave><valor>.png)
//   --fluxo         roda a carta inteira, de senha:senha até final:fim
//   --video         grava output/video/<cena>-<vp>-<motor>.webm
//   --params "a=1&b=2"   parâmetros extras (webgl=0, reduzido=1, nivel=baixo, mudo=1)
//   --quadros       mede os quadros por 2 s na última etapa
//   --timeout ms    limite por etapa (padrão: 90000)
//   --videos pasta  põe vídeos nas cartas do chão (só na página, por page.route): um .mp4
//                   da pasta por carta, na ordem (ex.: output/segredos-teste)
//   --videos-falho  acrescenta um vídeo que não existe (o 404 dele é esperado)
//
// Roteiro 2 (_dev/ROTEIRO2.md): sem atalho a carta começa na tela preta. O --fluxo
// começa por ela (digita a senha do content.js e escolhe a música); "--cena x" entra
// por ?cena=x, que pula a senha. Nas cartas do chão cada carta é aberta e fechada
// (sem vídeo, abre o cartão de exemplo); depois, "seguir em frente". O --fluxo também
// reabre pela bolsa a carta do Poppy (em carta2:carta-espera), a do Your Name (em
// mao:mao-espera) e uma carta do chão e um capítulo (em cartas:escolhendo), e falha se a
// etapa mudar, se faltar item na bolsa ou se o botão de seguir não ganhar destaque.
// A cena "encontro" só existe com algum quadro em encontro.quadros; ela anda sozinha
// (chegando → planos → maos → carta), sem toque nenhum.

import { abrir, lerConteudo, senhaDoConteudo, temCartas, temEncontro, etapasDoFinal, videosDeTeste, injetarVideos, ERRO_ESPERADO } from './lib.mjs';

const ROTEIRO = {
  senha: ['senha', 'senha-certa'],
  musica: ['musica', 'entrando'],
  inicio: ['frases', 'caminhada', 'carta-chegando', 'carta-espera', 'carta-abrindo', 'papel'],
  poppy: ['desenrolando', 'lendo', 'enrolando', 'guardando'],
  carta2: ['caminhada', 'carta-chegando', 'carta-espera', 'carta-abrindo', 'papel'],
  yourname: ['desenrolando', 'lendo', 'enrolando', 'guardando'],
  mao: ['olha', 'mao-espera', 'correndo'],
  cartas: ['pousando', 'escolhendo', 'seguindo'],
  encontro: ['chegando', 'planos', 'maos', 'carta'],
  // (contador e resposta só existem com as seções contador e resposta do content.js)
  final: etapasDoFinal(),
};
const TODAS = Object.keys(ROTEIRO);

// Quanto esperar (em ms "de cena", divididos por --rapido) antes da foto de cada etapa,
// para a captura mostrar a etapa acontecendo e não o primeiro quadro dela.
const ASSENTAR = {
  frases: 4200, caminhada: 1500, 'carta-chegando': 1500, 'carta-espera': 700, 'carta-abrindo': 1500,
  papel: 900, musica: 2400, desenrolando: 900, lendo: 900, enrolando: 700, olha: 2600,
  'mao-espera': 900, seguindo: 2600, desdobrando: 1300, escrevendo: 3200, fim: 2600,
  contador: 7000, resposta: 1800,
  escolhendo: 1500, chegando: 900, planos: 2600, maos: 2600, carta: 1500,
  senha: 900, 'senha-certa': 500, entrando: 900, guardando: 900, correndo: 2600, pousando: 900, seguindo: 500,
};
// Etapas em que a carta fica parada esperando: aqui o tempo de assentar é real (não acelera).
const PARADAS = new Set(['senha', 'carta-espera', 'musica', 'lendo', 'mao-espera', 'fim', 'escolhendo', 'resposta']);

function lerArgumentos(argv) {
  const opcoes = {
    cena: null, vp: ['celular'], motor: ['chromium'], rapido: null, ate: null,
    fotos: false, fluxo: false, video: false, params: {}, quadros: false, timeout: 90000,
    videos: null, videosFalho: false,
  };
  const lista = (v) => String(v || '').split(',').map((s) => s.trim()).filter(Boolean);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const valor = () => argv[++i];
    switch (arg) {
      case '--cena': opcoes.cena = lista(valor()); break;
      case '--vp': opcoes.vp = lista(valor()); break;
      case '--motor': opcoes.motor = lista(valor()); break;
      case '--rapido': opcoes.rapido = Number(valor()); break;
      case '--ate': opcoes.ate = valor(); break;
      case '--timeout': opcoes.timeout = Number(valor()); break;
      case '--params': opcoes.params = Object.fromEntries(new URLSearchParams(valor())); break;
      case '--fotos': opcoes.fotos = true; break;
      case '--fluxo': opcoes.fluxo = true; break;
      case '--video': opcoes.video = true; break;
      case '--quadros': opcoes.quadros = true; break;
      case '--videos': case '--segredos': opcoes.videos = valor(); break;
      case '--videos-falho': case '--segredos-falho': opcoes.videosFalho = true; break;
      case '--ajuda': case '--help': case '-h': opcoes.ajuda = true; break;
      default: throw new Error(`opção desconhecida: ${arg}`);
    }
  }
  return opcoes;
}

/** Abre cada carta do chão, deixa 1 s aberta, fecha (o nome aparece); depois segue em frente. */
async function verCartas(s, { fotos, fluxo, prefixo, sufixo, timeout = 30000 }) {
  const etapaAgora = (alvo) => s.page.waitForFunction((e) => window.__carta.etapa === e, alvo, { timeout, polling: 50 });
  const cartas = s.page.locator('[data-acao="carta-chao"]');
  const n = await cartas.count();
  let abaixou = false;
  for (let i = 0; i < n; i++) {
    const c = cartas.nth(i);
    if ((await c.getAttribute('data-estado')) !== 'fechada') continue;
    await etapaAgora('escolhendo');
    if (s.perfil.toque) await c.tap(); else await c.click();
    // Abriu, ou falhou no meio e voltou a escolher (vídeo que não carrega): um dos dois.
    await s.page.waitForFunction(() => document.querySelector('.carta-chao-visor')
      || document.querySelector('[data-acao="carta-chao"][data-estado="falhou"]'), null, { timeout, polling: 50 });
    if (await s.page.evaluate(() => !!document.querySelector('.carta-chao-visor'))) {
      await s.pausa(1000);
      if (fotos) await s.foto(`${prefixo}-assistindo${i + 1}${sufixo}`);
      // Com um vídeo tocando a música abaixa (ou pausa, sem Web Audio); tem de voltar ao fechar.
      if (await s.page.evaluate(() => { const v = document.querySelector('.carta-chao-visor video'); return !!v && !v.paused; })) {
        const d = await s.page.evaluate(() => ({ ...window.__carta.ctx.som.diagnostico(), tocando: window.__carta.ctx.som.estado.tocando }));
        if (d.tocando && !d.mudo && !d.pausado && !(d.abafo < 0.5)) throw new Error(`a música não abaixou durante o vídeo (abafo ${d.abafo})`);
        abaixou = true;
      }
      await s.acionar('[data-acao="fechar-carta"]');
    }
    await etapaAgora('escolhendo');
    if (abaixou) {
      await s.pausa(900);
      const d = await s.page.evaluate(() => ({ ...window.__carta.ctx.som.diagnostico(), tocando: window.__carta.ctx.som.estado.tocando }));
      if (d.tocando && !d.mudo && (d.pausado || d.abafo < 0.9)) throw new Error(`a música não voltou depois do vídeo (pausada ${d.pausado}, abafo ${d.abafo})`);
      abaixou = false;
    }
  }
  const semNome = await s.page.evaluate(() => [...document.querySelectorAll('[data-acao="carta-chao"][data-estado="fechada"]')].length);
  if (semNome) throw new Error(`${semNome} carta(s) do chão continuaram fechadas`);
  if (!(await s.page.locator('[data-acao="seguir-cartas"][data-destaque]').count())) throw new Error('todas as cartas abertas e o botão de seguir não ganhou destaque');
  // Tudo o que ela viu está na bolsa (2 capítulos + as cartas do chão) e reabre de lá.
  if (fluxo && n) {
    await etapaAgora('escolhendo');
    await reabrirDaBolsa(s, 'chao-1', n + 2, { fotos, prefixo, sufixo });
    await reabrirDaBolsa(s, 'carta-poppy', n + 2, { fotos, prefixo, sufixo });
  }
  if (fotos) {
    await s.pausa(600);
    await s.foto(`${prefixo}-vistas${sufixo}`);
  }
  await s.acionar('[data-acao="seguir-cartas"]', timeout);
}

/**
 * No --fluxo: reabre um item pela bolsa e fecha. A cena e a etapa têm de continuar as
 * mesmas, e a bolsa tem de mostrar exatamente `esperados` itens.
 */
async function reabrirDaBolsa(s, id, esperados, { fotos, prefixo, sufixo } = {}) {
  const antes = await s.estado();
  const itens = await s.page.evaluate(() => window.__carta.ctx.inventario.itens.map((i) => i.id));
  if (!itens.includes(id)) throw new Error(`a bolsa não tem "${id}" (tem: ${itens.join(', ') || 'nada'})`);
  if (esperados != null && itens.length !== esperados) throw new Error(`a bolsa devia ter ${esperados} item(ns) e tem ${itens.length}`);
  await s.abrirDaBolsa(id);
  if (fotos) { await s.pausa(900); await s.foto(`${prefixo}-bolsa-${id}${sufixo}`); }
  await s.fecharDaBolsa();
  const depois = await s.estado();
  if (depois.cena !== antes.cena || depois.etapa !== antes.etapa) {
    throw new Error(`reabrir "${id}" pela bolsa mudou a etapa: ${antes.cena}:${antes.etapa} → ${depois.cena}:${depois.etapa}`);
  }
  await s.pausa(200);
}

/**
 * A folha em que ela escreve de volta: escreve, confere que ficou guardado no aparelho e
 * que o botão de enviar aponta para o WhatsApp com o texto dela, e toca em "Guardar".
 */
async function escreverDeVolta(s, { fotos, prefixo, sufixo } = {}) {
  const campo = s.page.locator('[data-acao="resposta-texto"]');
  await campo.waitFor({ state: 'visible', timeout: 20000 });
  const tamanho = await campo.evaluate((no) => parseFloat(getComputedStyle(no).fontSize));
  if (!(tamanho >= 16)) throw new Error(`a letra da folha de resposta tem ${tamanho} px (menos de 16: o Safari daria zoom)`);
  const frase = 'Eu li tudo. Obrigada & até já!';
  await campo.fill(frase);
  await s.pausa(200);
  const d = await s.page.evaluate(() => ({
    guardado: (() => { try { return localStorage.getItem('carta2312:resposta'); } catch { return null; } })(),
    href: document.querySelector('[data-acao="resposta-enviar"]')?.href || '',
  }));
  if (d.guardado !== frase) throw new Error(`o texto dela não ficou guardado no aparelho (ficou: ${d.guardado})`);
  if (!/^https:\/\/wa\.me\/\d*\?text=/.test(d.href) || !decodeURIComponent(d.href.split('text=')[1] || '').includes(frase)) {
    throw new Error(`o botão de enviar não leva ao WhatsApp com o texto dela (${d.href})`);
  }
  if (fotos) { await s.pausa(500); await s.foto(`${prefixo}-resposta-escrita${sufixo}`); }
  await s.acionar('[data-acao="resposta-guardar"]');
}

/** O que fazer em cada etapa para a carta seguir adiante. */
async function agir(s, cena, etapa, extra = {}) {
  if (etapa === 'senha') {
    if (senhaDoConteudo()) await s.digitarSenha();
  } else if (etapa === 'carta-espera') {
    // Na segunda carta ela já tem a do Poppy na bolsa: relê e volta, e a carta do caminho ainda abre.
    if (extra.fluxo && cena === 'carta2') await reabrirDaBolsa(s, 'carta-poppy', 1, extra);
    await s.tocarCentro();
  } else if (etapa === 'musica') {
    await s.acionar('[data-acao="faixa"]');
    await s.acionar('[data-acao="continuar"]');
  } else if (etapa === 'lendo') {
    // Rola até o fim e fecha o capítulo.
    await s.page.evaluate(() => {
      const rolagem = window.__carta.ctx.pergaminho.rolagem;
      rolagem.irPara(rolagem.el.scrollHeight, { imediato: true });
    });
    await s.pausa(250);
    await s.acionar('[data-acao="fechar-capitulo"]');
  } else if (etapa === 'mao-espera') {
    if (extra.fluxo) await reabrirDaBolsa(s, 'carta-yourname', 2, extra);
    await s.acionar('[data-acao="seguir-fio"]');
  } else if (cena === 'cartas' && etapa === 'escolhendo') {
    await verCartas(s, extra);
  } else if (etapa === 'resposta') {
    await escreverDeVolta(s, extra);
  }
}

async function rodar({ cenas, vp, motor, opcoes, rotulo }) {
  const params = { ...opcoes.params };
  if (opcoes.rapido) params.rapido = opcoes.rapido;
  const rapido = Number(params.rapido) > 0 ? Number(params.rapido) : 1;
  // Parâmetros extras entram no nome dos arquivos, para uma rodada não apagar as capturas da outra.
  const sufixo = Object.entries(opcoes.params).map(([k, v]) => `-${k}${v}`).join('').replace(/[^A-Za-z0-9_-]/g, '');
  const nome = `${rotulo}-${vp}-${motor}${sufixo}`;
  const falhas = [];
  const linhas = [];
  let s;

  try {
    const videos = opcoes.videos ? videosDeTeste(opcoes.videos, { falho: opcoes.videosFalho }) : null;
    s = await abrir({
      // O fluxo inteiro abre sem atalho (o começo de verdade: a tela preta); uma cena só entra por ?cena=.
      cena: rotulo === 'fluxo' ? undefined : cenas[0], vp, motor, params, video: opcoes.video,
      preparar: videos ? (page) => injetarVideos(page, videos) : null,
    });
  } catch (erro) {
    return { nome, ok: false, falhas: [`não abriu: ${erro.message}`], linhas, gpu: '' };
  }

  let chegouAoFim = false;
  try {
    percurso:
    for (let c = 0; c < cenas.length; c++) {
      const cena = cenas[c];
      const etapas = ROTEIRO[cena];
      const ultimaCena = c === cenas.length - 1;
      const alvo = ultimaCena ? (opcoes.ate || etapas[etapas.length - 1]) : null;
      for (const etapa of etapas) {
        const inicio = Date.now();
        await s.esperarEtapa(`${cena}:${etapa}`, opcoes.timeout);
        linhas.push(`  ${cena}:${etapa}  (+${((Date.now() - inicio) / 1000).toFixed(1)} s)`);
        if (opcoes.fotos) {
          await s.pausa(PARADAS.has(etapa) ? ASSENTAR[etapa] || 600 : (ASSENTAR[etapa] || 600) / rapido);
          await s.foto(`${rotulo === 'fluxo' ? `fluxo-${cena}` : cena}-${vp}-${motor}-${etapa}${sufixo}`);
        }
        if (etapa === alvo) { chegouAoFim = true; break percurso; }
        await agir(s, cena, etapa, {
          fluxo: rotulo === 'fluxo', fotos: opcoes.fotos, prefixo: `${rotulo === 'fluxo' ? `fluxo-${cena}` : cena}-${vp}-${motor}`, sufixo,
        });
      }
    }
    if (opcoes.quadros) {
      const q = await s.medirQuadros(2000);
      linhas.push(`  quadros: ${q.fpsMedio} fps em média, p95 ${q.p95ms} ms, piores ${q.pioresMs.join(' / ')} ms`);
    }
  } catch (erro) {
    const onde = await s.estado().catch(() => ({}));
    falhas.push(`parou em ${onde.cena || '?'}:${onde.etapa || '?'} → ${String(erro.message).split('\n')[0]}`);
    if (opcoes.fotos) await s.foto(`${nome}-FALHA`).catch(() => {});
  }
  if (!chegouAoFim && !falhas.length) falhas.push('não chegou à etapa pedida');

  for (const erro of s.erros) {
    if (opcoes.videosFalho && ERRO_ESPERADO.test(`${erro.texto} ${erro.onde || ""}`)) continue;   // o 404 de propósito
    falhas.push(`${erro.tipo}: ${erro.texto}`);
  }
  const video = await s.fechar(opcoes.video ? nome : undefined);
  if (video) linhas.push(`  vídeo: ${video}`);

  return { nome, ok: falhas.length === 0, falhas, linhas, gpu: s.gpu, amb: s.amb };
}

async function principal() {
  const opcoes = lerArgumentos(process.argv.slice(2));
  if (opcoes.ajuda) {
    console.log('Uso: node _dev/ver.mjs [--cena a,b] [--vp celular,desktop] [--motor chromium,webkit] [--rapido N] [--ate etapa] [--fotos] [--fluxo] [--video] [--params "a=1&b=2"] [--quadros]');
    return 0;
  }

  const conteudo = lerConteudo(opcoes.videos ? videosDeTeste(opcoes.videos, { falho: opcoes.videosFalho }) : null);
  const ORDEM = TODAS.filter((c) => (c !== 'senha' || senhaDoConteudo(conteudo)) && (c !== 'cartas' || temCartas(conteudo))
    && (c !== 'encontro' || temEncontro(conteudo)));
  const execucoes = [];
  if (opcoes.fluxo) {
    execucoes.push({ cenas: ORDEM, rotulo: 'fluxo' });
  } else {
    for (const cena of opcoes.cena || ORDEM) {
      if (cena === 'cartas' && !temCartas(conteudo)) throw new Error('a cena cartas não existe sem cartas em cartasChao (js/content.js)');
      if (cena === 'encontro' && !temEncontro(conteudo)) throw new Error('a cena encontro não existe sem quadros em encontro.quadros (js/content.js)');
      if (!ROTEIRO[cena]) throw new Error(`cena desconhecida: ${cena}`);
      execucoes.push({ cenas: [cena], rotulo: cena });
    }
  }

  let falhou = 0;
  for (const execucao of execucoes) {
    for (const vp of opcoes.vp) {
      for (const motor of opcoes.motor) {
        const r = await rodar({ ...execucao, vp, motor, opcoes });
        const detalhe = r.amb ? `nível ${r.amb.nivel}, webgl ${r.amb.webgl ? 'sim' : 'não'}` : '';
        console.log(`${r.ok ? 'OK   ' : 'FALHA'} ${r.nome}  [${detalhe}${r.gpu ? `; ${r.gpu}` : ''}]`);
        for (const linha of r.linhas) console.log(linha);
        for (const falha of r.falhas) console.log(`  ! ${falha}`);
        if (!r.ok) falhou++;
      }
    }
  }
  console.log(falhou ? `\n${falhou} execução(ões) com problema.` : '\nTudo certo.');
  return falhou ? 1 : 0;
}

principal().then((codigo) => process.exit(codigo), (erro) => {
  console.error(erro);
  process.exit(2);
});
