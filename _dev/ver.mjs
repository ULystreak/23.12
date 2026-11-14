#!/usr/bin/env node
// Linha de comando da verificação. Percorre as etapas de uma cena (ou a carta
// inteira), tocando onde precisa, e termina com código ≠ 0 se houver erro de
// console, pedido que falhou ou etapa que não chegou.
//
//   node _dev/ver.mjs --cena poppy --vp celular,desktop --motor chromium,webkit --rapido 6 --ate lendo --fotos
//   node _dev/ver.mjs --fluxo --rapido 6 --fotos            (de inicio até a frase final)
//   node _dev/ver.mjs --cena inicio --video                 (grava em output/video/)
//   node _dev/ver.mjs --cena final --params "webgl=0"       (parâmetros extras do endereço)
//   node _dev/ver.mjs --cena inicio --quadros               (mede os quadros na última etapa)
//
// Opções
//   --cena a,b      cenas a verificar (padrão: as seis)
//   --vp a,b        celular (390×844) e/ou desktop (1440×900)        (padrão: celular)
//   --motor a,b     chromium e/ou webkit                              (padrão: chromium)
//   --rapido N      acelera a carta N vezes
//   --ate etapa     para nesta etapa (padrão: a última da cena)
//   --fotos         salva output/ver/<cena>-<vp>-<motor>-<etapa>.png a cada etapa
//                   (no --fluxo: fluxo-<cena>-...; com --params: ...-<etapa>-<chave><valor>.png)
//   --fluxo         roda a carta inteira, de inicio:frases até final:fim
//   --video         grava output/video/<cena>-<vp>-<motor>.webm
//   --params "a=1&b=2"   parâmetros extras (webgl=0, reduzido=1, nivel=baixo, mudo=1)
//   --quadros       mede os quadros por 2 s na última etapa
//   --timeout ms    limite por etapa (padrão: 90000)

import { abrir } from './lib.mjs';

const ROTEIRO = {
  inicio: ['frases', 'caminhada', 'carta-chegando', 'carta-espera', 'carta-abrindo', 'papel', 'musica'],
  poppy: ['desenrolando', 'lendo'],
  carta2: ['enrolando', 'caminhada', 'carta-chegando', 'carta-espera', 'carta-abrindo', 'papel'],
  yourname: ['desenrolando', 'lendo'],
  mao: ['enrolando', 'olha', 'mao-espera', 'seguindo'],
  final: ['carta-chegando', 'carta-espera', 'carta-abrindo', 'desdobrando', 'escrevendo', 'fim'],
};
const ORDEM = Object.keys(ROTEIRO);

// Quanto esperar (em ms "de cena", divididos por --rapido) antes da foto de cada etapa,
// para a captura mostrar a etapa acontecendo e não o primeiro quadro dela.
const ASSENTAR = {
  frases: 4200, caminhada: 1500, 'carta-chegando': 1500, 'carta-espera': 700, 'carta-abrindo': 1500,
  papel: 900, musica: 2400, desenrolando: 900, lendo: 900, enrolando: 700, olha: 2600,
  'mao-espera': 900, seguindo: 2600, desdobrando: 1300, escrevendo: 3200, fim: 900,
};
// Etapas em que a carta fica parada esperando: aqui o tempo de assentar é real (não acelera).
const PARADAS = new Set(['carta-espera', 'musica', 'lendo', 'mao-espera', 'fim']);

function lerArgumentos(argv) {
  const opcoes = {
    cena: null, vp: ['celular'], motor: ['chromium'], rapido: null, ate: null,
    fotos: false, fluxo: false, video: false, params: {}, quadros: false, timeout: 90000,
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
      case '--ajuda': case '--help': case '-h': opcoes.ajuda = true; break;
      default: throw new Error(`opção desconhecida: ${arg}`);
    }
  }
  return opcoes;
}

/** O que fazer em cada etapa para a carta seguir adiante. */
async function agir(s, cena, etapa) {
  if (etapa === 'carta-espera') {
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
    await s.acionar('[data-acao="seguir-fio"]');
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
    s = await abrir({ cena: cenas[0] === 'inicio' ? undefined : cenas[0], vp, motor, params, video: opcoes.video });
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
        await agir(s, cena, etapa);
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

  for (const erro of s.erros) falhas.push(`${erro.tipo}: ${erro.texto}`);
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

  const execucoes = [];
  if (opcoes.fluxo) {
    execucoes.push({ cenas: ORDEM, rotulo: 'fluxo' });
  } else {
    for (const cena of opcoes.cena || ORDEM) {
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
