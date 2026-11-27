/* ============================================================================
   VER: a carta percorrida num navegador de verdade
   ============================================================================
   Abre a carta (pelo lib.mjs), percorre o roteiro de uma cena ou da carta
   inteira (--fluxo), toca ou clica onde cada etapa pede, tira fotos (--fotos),
   grava vídeo (--video) e mede quadros (--quadros).

   Roteiro 2 (_dev/ROTEIRO2.md): sem atalho a carta começa na tela preta, na
   senha; "--cena x" entra por ?cena=x, que pula a senha (e chega "fria", sem o
   que as cenas anteriores deixam: só o --fluxo mostra a carta como ela é).

   Exemplos:
     node _dev/ver.mjs --cena inicio --vp celular
     node _dev/ver.mjs --fluxo --vp iphone-safari,desktop --rapido 6
     node _dev/ver.mjs --fluxo --vp iphone-safari --motor webkit --rapido 6

   Sai com 0 (tudo certo), 1 (alguma execução teve erro de console, exceção,
   pedido com status 400 ou mais, pedido que falhou ou etapa que não chegou) ou
   2 (o próprio script quebrou). Fotos em output/ver, vídeos em output/video.
   ========================================================================== */

import {
  abrir, lerConteudo, senhaDoConteudo, temCartas, temEncontro, temMenu,
  etapasDoFinal, videosDeTeste, injetarVideos, ERRO_ESPERADO, VIEWPORTS, contarCartas,
} from './lib.mjs';

const USO = 'uso: node _dev/ver.mjs [--cena a,b] [--fluxo] [--vp celular,iphone,iphone-safari,desktop] '
  + '[--motor chromium,webkit] [--rapido N] [--ate etapa] [--timeout ms] [--params "a=1&b=2"] '
  + '[--fotos] [--video] [--quadros] [--videos pasta] [--videos-falho]';

const ORDEM = ['senha', 'musica', 'inicio', 'poppy', 'carta2', 'yourname', 'mao', 'cartas', 'encontro', 'final', 'menu'];
const ROTEIRO = {
  senha: ['senha', 'senha-certa'],
  musica: ['musica', 'entrando'],
  inicio: ['frases', 'caminhada', 'carta-chegando', 'carta-espera', 'carta-abrindo', 'papel'],
  poppy: ['desenrolando', 'lendo', 'enrolando', 'guardando'],
  carta2: ['caminhada', 'carta-chegando', 'carta-espera', 'carta-abrindo', 'papel'],
  yourname: ['desenrolando', 'lendo', 'enrolando', 'guardando'],
  mao: ['olha', 'mao-espera', 'correndo'],
  // "assistindo" entra no histórico a cada carta aberta, não no roteiro.
  cartas: ['pousando', 'escolhendo', 'seguindo'],
  encontro: ['chegando', 'planos', 'maos', 'carta'],
  menu: ['referencias', 'menu'],
};

// Ms de espera antes da foto, em tempo de cena (divididos por --rapido, salvo PARADAS).
const ASSENTAR = {
  frases: 4200, caminhada: 1500, 'carta-chegando': 1500, 'carta-espera': 700, 'carta-abrindo': 1500,
  papel: 900, musica: 2400, desenrolando: 900, lendo: 900, enrolando: 700, olha: 2600,
  'mao-espera': 900, desdobrando: 1300, escrevendo: 3200, fim: 2600, contador: 7000, resposta: 1800,
  escolhendo: 1500, chegando: 900, planos: 2600, maos: 2600, carta: 1500, senha: 900,
  'senha-certa': 500, entrando: 900, guardando: 900, correndo: 2600, pousando: 900,
  seguindo: 500, referencias: 9000, menu: 3200,
};
const ASSENTAR_PADRAO = 600;
// Etapas em que a carta fica parada esperando: aqui o tempo de assentar é real (não acelera).
const PARADAS = new Set(['senha', 'carta-espera', 'musica', 'lendo', 'mao-espera', 'fim', 'escolhendo', 'resposta', 'menu']);

const T_CARTAS = 30000;
const T_AGIR = 20000;
const FONTE_MINIMA = 16;
const FRASE_TESTE = 'Eu li tudo. Obrigada & até já!';

const pausa = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* ---- argumentos ------------------------------------------------------------- */

function lerArgumentos(argv) {
  const op = {
    cena: null, vp: ['celular'], motor: ['chromium'], rapido: null, ate: null, timeout: 90000,
    params: '', fotos: false, fluxo: false, video: false, quadros: false,
    videos: null, videosFalho: false, ajuda: false,
  };
  const lista = (v) => String(v).split(',').map((x) => x.trim()).filter(Boolean);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const valor = () => {
      if (i + 1 >= argv.length) throw new Error(`a opção ${a} pede um valor`);
      i += 1;
      return argv[i];
    };
    switch (a) {
      case '--cena': op.cena = lista(valor()); break;
      case '--vp': op.vp = lista(valor()); break;
      case '--motor': op.motor = lista(valor()); break;
      case '--rapido': op.rapido = Number(valor()); break;
      case '--ate': op.ate = valor(); break;
      case '--timeout': op.timeout = Number(valor()); break;
      case '--params': op.params = valor(); break;
      case '--fotos': op.fotos = true; break;
      case '--fluxo': op.fluxo = true; break;
      case '--video': op.video = true; break;
      case '--quadros': op.quadros = true; break;
      case '--videos': case '--segredos': op.videos = valor(); break;
      case '--videos-falho': case '--segredos-falho': op.videosFalho = true; break;
      case '--ajuda': case '--help': case '-h': op.ajuda = true; break;
      default: throw new Error(`opção desconhecida: ${a}`);
    }
  }
  if (op.rapido !== null && !(op.rapido > 0)) throw new Error('--rapido pede um número maior que 0');
  if (!(op.timeout > 0)) throw new Error('--timeout pede milissegundos maiores que 0');
  if (op.videosFalho && !op.videos) throw new Error('--videos-falho pede --videos <pasta>');
  for (const vp of op.vp) if (!VIEWPORTS[vp]) throw new Error(`vp desconhecido: ${vp} (use ${Object.keys(VIEWPORTS).join(', ')})`);
  for (const m of op.motor) if (!['chromium', 'webkit'].includes(m)) throw new Error(`motor desconhecido: ${m} (use chromium ou webkit)`);
  return op;
}

/* ---- apoios ----------------------------------------------------------------- */

function ordemDoConteudo(conteudo) {
  const haSenha = typeof conteudo.senha?.codigo === 'string' && conteudo.senha.codigo.trim() !== '';
  return ORDEM.filter((cena) => {
    if (cena === 'senha') return haSenha;
    if (cena === 'cartas') return temCartas(conteudo);
    if (cena === 'encontro') return temEncontro(conteudo);
    if (cena === 'menu') return temMenu(conteudo);
    return true;
  });
}

function etapasDa(cena, conteudo) {
  return cena === 'final' ? etapasDoFinal(conteudo) : ROTEIRO[cena];
}

// Espera a etapa ATUAL (não o histórico): cada carta do chão volta a "escolhendo".
async function esperarAgora(s, etapa, timeout) {
  const fim = Date.now() + timeout;
  for (;;) {
    const agora = await s.estado().catch(() => ({}));
    if (agora.etapa === etapa) return;
    if (Date.now() > fim) throw new Error(`a etapa ${etapa} não voltou em ${Math.round(timeout / 1000)} s (está em ${agora.cena}:${agora.etapa})`);
    await pausa(80);
  }
}

async function musicaAgora(s) {
  return s.page.evaluate(() => {
    const som = window.__carta.ctx.som;
    const d = som?.diagnostico?.() || {};
    return { tocando: !!som?.estado?.tocando, abafo: d.abafo, pausado: d.pausado };
  });
}

async function fotografar(s, extra, nome) {
  if (extra.op.fotos) await s.foto(nome);
}

/* ---- ações ------------------------------------------------------------------ */

/** Reabre um item pela bolsa e confere que cena e etapa não mudaram. */
async function reabrirDaBolsa(s, id, esperados, extra) {
  const antes = await s.estado();
  const itens = await s.page.evaluate(() => window.__carta.ctx.inventario.itens.map((i) => i.id));
  if (itens.length !== esperados) throw new Error(`a bolsa tem ${itens.length} itens (esperava ${esperados}): ${itens.join(', ')}`);
  await s.abrirDaBolsa(id);
  await pausa(900);
  await fotografar(s, extra, `${extra.prefixo}bolsa-${id}-${extra.vp}-${extra.motor}${extra.sufixo}`);
  await s.fecharDaBolsa();
  const depois = await s.estado();
  if (antes.cena !== depois.cena || antes.etapa !== depois.etapa) {
    throw new Error(`reabrir ${id} pela bolsa mudou ${antes.cena}:${antes.etapa} para ${depois.cena}:${depois.etapa}`);
  }
  extra.linhas.push(`  bolsa: ${id} reaberto sem mudar ${antes.cena}:${antes.etapa}`);
}

/** Abre e fecha as cartas do chão, conferindo a música e o botão de seguir. */
async function verCartas(s, extra) {
  const { page } = s;
  const fechadas = await page.$$eval('[data-acao="carta-chao"][data-estado="fechada"]', (els) => els.map((e) => e.dataset.id));
  // O WebKit do Windows não toca mídia de forma confiável: a música só é conferida no Chromium.
  const conferirSom = extra.motor === 'chromium';

  for (const id of fechadas) {
    await esperarAgora(s, 'escolhendo', T_CARTAS);
    const antes = await musicaAgora(s);
    await s.acionar(`[data-acao="carta-chao"][data-id="${id}"]`, T_CARTAS);
    const aberto = await esperarVisor(s, id);
    const base = `${extra.prefixo}cartas-${extra.vp}-${extra.motor}-${id}${extra.sufixo}`;

    if (id === 'chao-surpresinha') {
      await pausa(800);
      await fotografar(s, extra, base);
      // Com fotos e vídeos em "midias", a galeria vem antes dos áudios: fecha o que estiver aberto.
      for (let i = 0; i < 3; i++) {
        const agora = await page.evaluate(() => ({ voz: !!document.querySelector('#voz[data-aberto]'), visor: !!document.querySelector('.carta-chao-visor') }));
        if (agora.voz) await s.acionar('[data-acao="voz-fechar"]', T_AGIR);
        else if (agora.visor) await s.acionar('[data-acao="fechar-carta"]', T_AGIR);
        else break;
        await pausa(900);
      }
      extra.linhas.push(`  ${id}: aberta (${aberto})`);
      continue;
    }

    if (aberto === 'video' && conferirSom && antes.tocando && antes.pausado === false) {
      await pausa(1000);
      const durante = await musicaAgora(s);
      // cartas.js abaixa a música com som.pausar() quando há Web Audio, ou com abafar(0,04): as duas valem.
      if (!(durante.abafo < 0.5 || durante.pausado === true)) throw new Error(`${id}: a música não abaixou durante o vídeo (abafo ${durante.abafo})`);
      const videoParado = await page.evaluate(() => document.querySelector('.carta-chao-visor video')?.paused);
      const falhou = await page.evaluate((x) => document.querySelector(`[data-acao="carta-chao"][data-id="${x}"]`)?.dataset.estado === 'falhou', id);
      if (videoParado === true && !falhou) throw new Error(`${id}: o vídeo está pausado`);
      await fotografar(s, extra, base);
      await s.acionar('[data-acao="fechar-carta"]', T_AGIR);
      await pausa(900);
      const depois = await musicaAgora(s);
      if (!(depois.abafo >= 0.9 && depois.pausado === false)) throw new Error(`${id}: a música não voltou depois do vídeo (abafo ${depois.abafo}, pausada ${depois.pausado})`);
    } else if (aberto !== 'falhou' || await page.evaluate(() => !!document.querySelector('.carta-chao-visor'))) {
      await pausa(1000);
      await fotografar(s, extra, base);
      await s.acionar('[data-acao="fechar-carta"]', T_AGIR);
      await pausa(900);
    }
    extra.linhas.push(`  ${id}: aberta (${aberto})`);
  }

  await esperarAgora(s, 'escolhendo', T_CARTAS);
  const fim = await page.evaluate(() => ({
    fechadas: document.querySelectorAll('[data-acao="carta-chao"][data-estado="fechada"]').length,
    destaque: !!document.querySelector('[data-acao="seguir-cartas"][data-destaque]'),
  }));
  if (fim.fechadas) throw new Error(`${fim.fechadas} carta(s) do chão continuam fechadas`);
  if (!fim.destaque) throw new Error('o botão de seguir não ganhou destaque com todas as cartas abertas');

  if (extra.op.fluxo) {
    const n = contarCartas(extra.conteudo);
    // Com texto dele, "Nossos momentos" também vai para a bolsa, além da fita da voz.
    const c = extra.conteudo;
    const comTexto = String(c?.cartasChao?.surpresinha?.texto || '').trim() && (c?.voz?.itens?.length || 0) > 0 ? 1 : 0;
    await reabrirDaBolsa(s, 'chao-1', n + 2 + comTexto, extra);
    await reabrirDaBolsa(s, 'carta-poppy', n + 2 + comTexto, extra);
    await esperarAgora(s, 'escolhendo', T_CARTAS);
  }
  await pausa(600);
  await fotografar(s, extra, `${extra.prefixo}cartas-${extra.vp}-${extra.motor}-vistas${extra.sufixo}`);
  await s.acionar('[data-acao="seguir-cartas"]', T_AGIR);
}

// O que a carta abriu: 'video', 'galeria', 'vazio' (o visor), 'voz' (o cartão) ou 'falhou'.
async function esperarVisor(s, id) {
  const fim = Date.now() + T_CARTAS;
  for (;;) {
    const r = await s.page.evaluate((x) => {
      const visor = document.querySelector('.carta-chao-visor');
      if (visor) return visor.dataset.tipo || 'vazio';
      if (document.querySelector('#voz[data-aberto]')) return 'voz';
      return document.querySelector(`[data-acao="carta-chao"][data-id="${x}"]`)?.dataset.estado === 'falhou' ? 'falhou' : '';
    }, id).catch(() => '');
    if (r) return r;
    if (Date.now() > fim) throw new Error(`a carta ${id} não abriu em ${T_CARTAS / 1000} s`);
    await pausa(80);
  }
}

/** A folha de resposta: campo, localStorage, link do WhatsApp e Guardar. */
async function escreverDeVolta(s, extra) {
  const { page } = s;
  const campo = page.locator('[data-acao="resposta-texto"]').filter({ visible: true }).first();
  await campo.waitFor({ state: 'visible', timeout: 20000 });
  const fonte = await campo.evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
  if (!(fonte >= FONTE_MINIMA)) throw new Error(`a letra do campo tem ${fonte} px (o Safari dá zoom abaixo de ${FONTE_MINIMA})`);
  await campo.fill(FRASE_TESTE);
  await pausa(200);
  const r = await page.evaluate(() => {
    let guardado = null;
    try {
      guardado = localStorage.getItem('carta2312:resposta');
    } catch {
      guardado = null;
    }
    return { guardado, href: document.querySelector('[data-acao="resposta-enviar"]')?.getAttribute('href') || '' };
  });
  if (r.guardado !== FRASE_TESTE) throw new Error('o texto não foi guardado em carta2312:resposta');
  const link = /^https:\/\/wa\.me\/\d*\?text=/.test(r.href) ? new URL(r.href) : null;
  if (!link || !(link.searchParams.get('text') || '').includes(FRASE_TESTE)) throw new Error(`o link de enviar não é o WhatsApp com a frase: ${r.href}`);
  extra.linhas.push(`  resposta: letra ${fonte} px, guardada, link ${link.origin}${link.pathname}`);
  await pausa(500);
  await fotografar(s, extra, `${extra.prefixo}final-${extra.vp}-${extra.motor}-resposta-escrita${extra.sufixo}`);
  await s.acionar('[data-acao="resposta-guardar"]', T_AGIR);
}

// A carta-espera pede um toque na carta; a última pode pedir licença ao movimento: um segundo toque sempre abre.
async function tocarNaCarta(s) {
  const antes = await s.estado();
  await s.tocarCentro();
  for (let i = 0; i < 25; i++) {
    await pausa(100);
    const agora = await s.estado();
    if (agora.etapa !== antes.etapa || agora.cena !== antes.cena) return;
  }
  await s.tocarCentro();
}

/** A ação de cada etapa; as demais não fazem nada (a carta anda sozinha). */
async function agir(s, cena, etapa, extra) {
  switch (etapa) {
    case 'senha': {
      const codigo = senhaDoConteudo(extra.conteudo);
      if (codigo) await s.digitarSenha(codigo);
      return;
    }
    case 'carta-espera':
      if (extra.op.fluxo && cena === 'carta2') await reabrirDaBolsa(s, 'carta-poppy', 1, extra);
      await tocarNaCarta(s);
      return;
    case 'musica':
      await s.acionar('[data-acao="faixa"]', T_AGIR);
      await s.acionar('[data-acao="continuar"]', T_AGIR);
      return;
    case 'lendo':
      await s.page.evaluate(() => {
        const rolagem = window.__carta.ctx.pergaminho?.rolagem;
        if (rolagem?.el) rolagem.irPara(rolagem.el.scrollHeight, { imediato: true });
      });
      await pausa(250);
      await s.acionar('[data-acao="fechar-capitulo"]', T_AGIR);
      return;
    case 'mao-espera':
      if (extra.op.fluxo) await reabrirDaBolsa(s, 'carta-yourname', 2, extra);
      await s.acionar('[data-acao="seguir-fio"]', T_AGIR);
      return;
    case 'escolhendo':
      if (cena === 'cartas') await verCartas(s, extra);
      return;
    case 'maos':
      // Sem toque, o fio se liga sozinho; o teste leva o fio pelo botão.
      if (cena === 'encontro') await s.acionar('[data-acao="amarrar-fio"]', T_AGIR);
      return;
    case 'resposta':
      await escreverDeVolta(s, extra);
      return;
    case 'fim':
      if (cena === 'final') await s.acionar('[data-acao="menu-ir"]', T_AGIR);
      return;
    default:
  }
}

/* ---- uma execução ----------------------------------------------------------- */

async function rodar({ cenas, vp, motor, opcoes: op, rotulo, conteudo, videos }) {
  const params = Object.fromEntries(new URLSearchParams(op.params));
  if (op.rapido) params.rapido = op.rapido; // --rapido sobrescreve rapido de --params
  const rapido = Number(params.rapido) > 0 ? Number(params.rapido) : 1;
  const sufixo = op.params ? `-${op.params.replace(/[^a-z0-9]/gi, '')}` : '';
  const prefixo = op.fluxo ? 'fluxo-' : '';
  const nome = `${rotulo}-${vp}-${motor}${sufixo}`;
  const linhas = [];
  const falhas = [];
  const extra = { op, conteudo, vp, motor, sufixo, prefixo, linhas };

  let s;
  try {
    s = await abrir({
      cena: op.fluxo ? undefined : cenas[0],
      vp,
      motor,
      params,
      video: op.video,
      preparar: videos ? (page) => injetarVideos(page, videos) : null,
    });
  } catch (erro) {
    return { nome, ok: false, falhas: [`não abriu: ${erro.message}`], linhas, gpu: '', amb: {} };
  }

  const ultimaCena = cenas[cenas.length - 1];
  let chegou = false;
  let ondeEsta = '';
  try {
    percurso: for (const cena of cenas) {
      const etapas = etapasDa(cena, conteudo);
      for (const etapa of etapas) {
        ondeEsta = `${prefixo}${cena}-${vp}-${motor}-${etapa}${sufixo}`;
        const t0 = Date.now();
        await s.esperarEtapa(`${cena}:${etapa}`, op.timeout);
        linhas.push(`${cena}:${etapa} em ${Date.now() - t0} ms`);
        if (op.fotos) {
          const ms = ASSENTAR[etapa] ?? ASSENTAR_PADRAO;
          await pausa(PARADAS.has(etapa) ? ms : ms / rapido);
          await s.foto(ondeEsta);
        }
        const alvo = cena === ultimaCena && (op.ate ? etapa === op.ate : etapa === etapas[etapas.length - 1]);
        if (alvo) {
          chegou = true;
          break percurso;
        }
        await agir(s, cena, etapa, extra);
      }
    }
    if (chegou && op.quadros) {
      const q = await s.medirQuadros(2000);
      linhas.push(`quadros: ${q.fpsMedio} fps em média, p95 ${q.p95ms} ms, piores ${q.pioresMs.join(', ')} ms`);
    }
    if (!chegou) falhas.push('não chegou à etapa pedida');
  } catch (erro) {
    const agora = await s.estado().catch(() => ({}));
    falhas.push(`parou em ${agora.cena}:${agora.etapa} → ${String(erro.message).split('\n')[0]}`);
    if (op.fotos) await s.foto(`${ondeEsta}-FALHA`).catch(() => {});
  }

  for (const e of s.erros) {
    if (op.videosFalho && ERRO_ESPERADO.test(e.texto)) continue;
    falhas.push(`${e.tipo}: ${e.texto}`);
  }
  const video = await s.fechar(op.video ? nome : null).catch(() => null);
  if (video) linhas.push(`vídeo: ${video}`);
  return { nome, ok: falhas.length === 0, falhas, linhas, gpu: s.gpu, amb: s.amb || {} };
}

/* ---- principal -------------------------------------------------------------- */

async function principal() {
  const op = lerArgumentos(process.argv.slice(2));
  if (op.ajuda) {
    console.log(USO);
    return 0;
  }
  const videos = op.videos ? videosDeTeste(op.videos, { falho: op.videosFalho }) : null;
  const conteudo = lerConteudo(videos);
  const ordem = ordemDoConteudo(conteudo);

  let execucoes;
  if (op.fluxo) {
    execucoes = [{ cenas: ordem, rotulo: 'fluxo' }];
  } else {
    execucoes = (op.cena || ordem).map((cena) => {
      if (!ORDEM.includes(cena)) throw new Error(`cena desconhecida: ${cena} (use ${ORDEM.join(', ')})`);
      if (!ordem.includes(cena)) throw new Error(`a cena ${cena} não existe com este content.js (sem senha, sem cartas com nome, sem quadros do encontro ou sem o bloco menu)`);
      return { cenas: [cena], rotulo: cena };
    });
  }

  const resultados = [];
  for (const exec of execucoes) {
    for (const vp of op.vp) {
      for (const motor of op.motor) {
        const r = await rodar({ ...exec, vp, motor, opcoes: op, conteudo, videos });
        resultados.push(r);
        const nivel = r.amb?.nivel ?? '?';
        const webgl = r.amb?.webgl ? 'sim' : 'não';
        console.log(`${r.ok ? 'OK' : 'FALHA'} ${r.nome} [${nivel}; webgl ${webgl}; ${r.gpu || 'sem gpu'}]`);
        for (const l of r.linhas) console.log(`  ${l}`);
        for (const f of r.falhas) console.log(`  ! ${f}`);
      }
    }
  }
  const ruins = resultados.filter((r) => !r.ok).length;
  console.log(ruins ? `${ruins} execução(ões) com problema.` : 'Tudo certo.');
  return ruins ? 1 : 0;
}

principal().then(
  (codigo) => process.exit(codigo),
  (erro) => {
    console.error(`erro: ${erro?.message || erro}`);
    process.exit(2);
  },
);
