// Cena "esteira": a linha de montagem ainda funciona.
//
// Caixas com as palavras de `itens` caem de uma calha, quicam na lona, seguem
// com a esteira e despencam na caçamba do fim; entre uma e outra vêm bolas e
// peças de encaixe. A fila dá a volta e recomeça. Física 2D pequena, feita
// aqui: gravidade, quique com perda, atrito da lona. Rolar depressa acelera a
// esteira.
//
//   criarEsteira(bloco, ctx) → { el, quadro(dt, info), medir(), destruir() }
//   bloco = { itens: ['palavra', ...] }
//   ctx = { amb, gsap, som, anima }
//
// A última caixa é a única vermelha.

import { clamp, el, svg } from '../../nucleo/util.js';

const GRAVIDADE = 2100;       // px/s²
const PASSO_LONA = 18;        // px entre uma ripa e outra

const PECAS = {
  bola: () => svg(`
    <svg viewBox="0 0 34 34" width="34" height="34">
      <circle cx="17" cy="17" r="16" fill="#2a7fc2"/>
      <path d="M2.6 12.5c9 4.6 20 4.6 28.8 0" fill="none" stroke="#f2ead8" stroke-width="4.4"/>
      <path d="M2.2 21.5c9.4 4.4 20.2 4.4 29.6 0" fill="none" stroke="#e2332f" stroke-width="3.4"/>
      <circle cx="17" cy="17" r="16" fill="none" stroke="#124a78" stroke-width="2"/>
      <path d="M8 8.5c2.6-3 6-4.6 9.6-4.6" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="2.4" stroke-linecap="round"/>
    </svg>`),
  tijolo: () => svg(`
    <svg viewBox="0 0 52 34" width="52" height="34">
      <rect x="7" y="1" width="14" height="10" rx="3" fill="#3fb86b"/>
      <rect x="31" y="1" width="14" height="10" rx="3" fill="#3fb86b"/>
      <rect x="1" y="8" width="50" height="25" rx="5" fill="#3fb86b"/>
      <rect x="1" y="24" width="50" height="9" rx="4.5" fill="#2a8a4d"/>
      <path d="M6 13.5h40M10 3.6h8M34 3.6h8" stroke="#fff" stroke-opacity=".4" stroke-width="2.2" stroke-linecap="round"/>
    </svg>`),
  argola: () => svg(`
    <svg viewBox="0 0 44 26" width="44" height="26">
      <rect x="1" y="1" width="42" height="24" rx="12" fill="#f6c12d"/>
      <rect x="1" y="14" width="42" height="11" rx="5.5" fill="#c9960f"/>
      <rect x="14" y="9" width="16" height="6" rx="3" fill="#7a5a06"/>
      <path d="M8 7.5c5-3 22-3 28 0" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="2.2" stroke-linecap="round"/>
    </svg>`),
  cunha: () => svg(`
    <svg viewBox="0 0 40 34" width="40" height="34">
      <path d="M17 3.4a3.6 3.6 0 0 1 6 0l15 23.8A3.6 3.6 0 0 1 35 33H5a3.6 3.6 0 0 1-3-5.8z" fill="#e9dec4"/>
      <path d="M3.4 27 2 29.4A3.6 3.6 0 0 0 5 33h30a3.6 3.6 0 0 0 3-3.6L36.6 27z" fill="#c9bc9c"/>
      <circle cx="20" cy="21" r="4.4" fill="#0d2534" opacity=".8"/>
    </svg>`),
};
const ORDEM_PECAS = ['bola', 'tijolo', 'argola', 'cunha'];
const CORES_CAIXA = ['amarelo', 'azul', 'verde', 'creme'];

export function criarEsteira(bloco, { amb }) {
  const palavras = (Array.isArray(bloco?.itens) ? bloco.itens : []).map((s) => String(s ?? '').trim()).filter(Boolean);

  // A fila: palavra, peça, palavra, peça... (sem palavras, só as peças)
  const fila = [];
  if (palavras.length) {
    palavras.forEach((texto, i) => {
      fila.push({ tipo: 'caixa', texto, cor: i === palavras.length - 1 ? 'vermelho' : CORES_CAIXA[i % CORES_CAIXA.length], alta: i % 2 === 1 });
      fila.push({ tipo: ORDEM_PECAS[i % ORDEM_PECAS.length] });
    });
  } else {
    for (const tipo of ORDEM_PECAS) fila.push({ tipo });
  }

  // ---- o cenário -----------------------------------------------------------------------
  const ripas = el('i', 'esteira-ripas');
  const lona = el('div', 'esteira-lona', ripas);
  const rolo = el('i', 'esteira-rolo');
  const itensEl = el('div', 'esteira-itens');
  const palco = el('div', { class: 'esteira-palco', 'aria-hidden': 'true' }, [
    el('i', 'esteira-chao'),
    el('i', 'esteira-pe a'), el('i', 'esteira-pe b'),
    el('i', 'esteira-saia'),
    lona, rolo,
    itensEl,
    el('i', 'esteira-cacamba'),
    el('i', 'esteira-calha'),
  ]);
  // Para leitores de tela, as palavras numa lista simples.
  const lista = palavras.length ? el('ul', 'so-leitor', palavras.map((p) => el('li', null, p))) : null;
  const raiz = el('div', 'poppy-cena poppy-esteira', [palco, lista]);

  let W = 0;
  let H = 0;
  let lonaY = 0;        // altura do topo da lona
  let fim = 0;          // x onde a lona acaba
  let nascente = 0;     // x do meio da calha

  function medir() {
    W = palco.clientWidth;
    H = palco.clientHeight;
    if (!W || !H) return;
    lonaY = lona.offsetTop;
    fim = lona.offsetLeft + lona.offsetWidth - 6;
    nascente = Math.min(W * 0.34, 150);
    medida = false;           // a letra das caixas muda com a largura da tela
  }
  document.fonts?.ready?.then(() => { medida = false; });

  const vivos = [];
  let proximo = 0;
  let ultimo = null;
  let esperando = null;
  let fase = 0;
  let aquecido = false;

  function criarNo(molde) {
    const no = molde.tipo === 'caixa'
      ? el('div', { class: `esteira-caixa${molde.alta ? ' alta' : ''}`, dataset: { cor: molde.cor } }, el('span', null, molde.texto))
      : el('div', { class: 'esteira-peca', dataset: { tipo: molde.tipo } }, PECAS[molde.tipo]());
    no.classList.add('esteira-item');
    return no;
  }

  /** Mede a fila inteira de uma vez (um cálculo de layout só, em vez de um por peça). */
  let medida = false;
  function medirFila() {
    const nos = fila.map(criarNo);
    for (const no of nos) no.style.visibility = 'hidden';
    itensEl.append(...nos);
    fila.forEach((molde, i) => { molde.w = nos[i].offsetWidth; molde.h = nos[i].offsetHeight; });
    for (const no of nos) no.remove();
    medida = true;
  }

  function criarItem(molde) {
    if (!medida) medirFila();
    const no = criarNo(molde);
    itensEl.append(no);
    const { w, h } = molde;
    const item = {
      no, w, h,
      redonda: molde.tipo === 'bola',
      // caixa larga não nasce com um pedaço para fora da tela
      x: Math.max(nascente, w / 2 + 6), y: -h / 2 - 8,
      vx: 0, vy: 80,
      ang: 0, w2: 0,
      naLona: false, caindo: false, quiques: 0,
    };
    posicionar(item);
    return item;
  }

  /** Tira a próxima peça da fila (ainda escondida atrás da calha). */
  function proximaDaFila() {
    const molde = fila[proximo % fila.length];
    proximo++;
    return criarItem(molde);
  }

  function soltar(item) {
    vivos.push(item);
    ultimo = item;
    return item;
  }

  function posicionar(item) {
    item.no.style.transform = `translate3d(${(item.x - item.w / 2).toFixed(1)}px, ${(item.y - item.h / 2).toFixed(1)}px, 0) rotate(${item.ang.toFixed(2)}deg)`;
  }

  function passo(dt, velLona) {
    for (const item of vivos) {
      const chao = lonaY - item.h / 2;
      if (item.naLona) {
        item.vx += (velLona - item.vx) * Math.min(1, dt * 9);
        item.x += item.vx * dt;
        if (item.redonda) item.ang += (item.vx * dt / (item.w / 2)) * 57.3;
        else {
          item.w2 += (-190 * item.ang - 13 * item.w2) * dt;
          item.ang += item.w2 * dt;
        }
        if (item.x > fim + (item.redonda ? 0 : 4)) {
          // passou do rolo: tomba para a frente e cai na caçamba
          item.naLona = false;
          item.caindo = true;
          item.w2 = item.redonda ? 240 : 170;
          item.vy = 20;
        }
        continue;
      }
      item.vy += GRAVIDADE * dt;
      item.y += item.vy * dt;
      item.x += item.vx * dt;
      item.ang += item.w2 * dt;
      if (!item.caindo && item.y >= chao && item.vy > 0) {
        item.y = chao;
        const perda = item.redonda ? 0.52 : 0.34;
        if (item.vy > 150 && item.quiques < 4) {
          item.vy = -item.vy * perda;
          item.quiques++;
          item.vx += (velLona - item.vx) * 0.45;
          if (!item.redonda) item.w2 = (item.quiques % 2 ? 1 : -1) * (60 + item.vy * -0.12);
        } else {
          item.vy = 0;
          item.naLona = true;
        }
      }
      if (!item.caindo && !item.redonda) {
        // no ar a caixa procura ficar de pé
        item.w2 += (-90 * item.ang - 6 * item.w2) * dt;
      }
    }
  }

  function calmo(dt, velLona) {
    // movimento reduzido: sem queda nem quique; as peças aparecem na lona e seguem devagar
    for (const item of vivos) {
      item.y = lonaY - item.h / 2;
      item.x += velLona * dt;
      const entrada = clamp((item.x - item.w / 2 - 4) / 40 + 0.5);
      const saida = clamp((fim - item.x) / 50);
      item.no.style.opacity = String(Math.min(entrada, saida));
    }
  }

  return {
    el: raiz,
    medir,

    quadro(dt, info) {
      if (!W) medir();
      if (!W) return;
      const pressa = Math.min(380, Math.abs(info.vel) * 0.3);
      const velLona = amb.reduzido ? 30 : 64 + pressa;

      // a lona e o rolo
      fase += velLona * dt;
      ripas.style.transform = `translate3d(${(fase % PASSO_LONA).toFixed(2)}px, 0, 0)`;
      rolo.style.transform = `rotate(${((fase / 11) * 57.3 % 360).toFixed(1)}deg)`;

      // a primeira vez que aparece já tem coisa na lona (ninguém olha esteira vazia)
      if (!aquecido) {
        aquecido = true;
        let x = fim - 30;
        for (let i = 0; i < fila.length && x > nascente + 40; i++) {
          const item = soltar(proximaDaFila());
          x -= item.w / 2;
          item.x = x;
          item.y = lonaY - item.h / 2;
          item.vy = 0;
          item.vx = velLona;
          item.naLona = true;
          x -= item.w / 2 + 22;
          if (x < nascente + 70) break;
        }
        ultimo = vivos.reduce((menor, it) => (!menor || it.x < menor.x ? it : menor), null);
      }

      // solta a próxima quando a anterior abriu espaço
      if (!esperando && vivos.length < 9) esperando = proximaDaFila();
      if (esperando) {
        const livre = !ultimo || !vivos.includes(ultimo)
          || ultimo.x - ultimo.w / 2 > esperando.x + esperando.w / 2 + 10;
        if (livre) {
          soltar(esperando);
          esperando = null;
        }
      }

      if (amb.reduzido) calmo(dt, velLona);
      else {
        const n = dt > 0.02 ? 2 : 1;
        for (let i = 0; i < n; i++) passo(dt / n, velLona);
      }

      for (let i = vivos.length - 1; i >= 0; i--) {
        const item = vivos[i];
        if (item.y - item.h > H + 30 || item.x - item.w > W + 40 || (amb.reduzido && item.x > fim + 4)) {
          item.no.remove();
          vivos.splice(i, 1);
          continue;
        }
        posicionar(item);
      }
    },

    destruir() {
      vivos.length = 0;
      itensEl.textContent = '';
    },
  };
}
