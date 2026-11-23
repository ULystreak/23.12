/* ============================================================================
   POPPY / ESTEIRA: a linha de montagem ainda funciona
   ============================================================================
   Uma fila alternando caixas com as palavras de bloco.itens e peças de
   brinquedo (bola, tijolo, argola, cunha). As caixas caem de uma calha,
   quicam na lona, andam com a esteira e caem na caçamba no fim; a fila
   recomeça quando acaba. Física 2D própria: gravidade, quique com perda,
   mola de inclinação e o atrito da lona. Rolar depressa acelera a esteira.
   Para leitores de tela, as palavras numa lista simples.
   ========================================================================== */

import { clamp, el, svg } from '../../nucleo/util.js';

const GRAVIDADE = 2100; // px/s²
const PASSO_LONA = 18; // distância entre as ripas
const MAX_VIVAS = 9;
const ORDEM_PECAS = ['bola', 'tijolo', 'argola', 'cunha'];
const CORES_CAIXA = ['amarelo', 'azul', 'verde', 'creme'];

const PECAS = {
  bola: () => `<svg viewBox="0 0 34 34" width="34" height="34" aria-hidden="true" focusable="false">
    <circle cx="17" cy="17" r="16" fill="#2a7fc2"/>
    <path d="M2.4 12.4Q17 19 31.6 12.4L32.8 17Q17 24 1.2 17z" fill="#f2ead8"/>
    <path d="M1.2 17Q17 24 32.8 17L31.8 21.8Q17 28.4 2.2 21.8z" fill="#e2332f"/>
    <ellipse cx="11" cy="8.6" rx="4.4" ry="2.4" fill="#f2ead8" opacity="0.35" transform="rotate(-30 11 8.6)"/>
  </svg>`,
  tijolo: () => `<svg viewBox="0 0 52 34" width="52" height="34" aria-hidden="true" focusable="false">
    <rect x="5" y="1.5" width="11" height="9" rx="2" fill="#2a8a4d"/><rect x="20.5" y="1.5" width="11" height="9" rx="2" fill="#2a8a4d"/><rect x="36" y="1.5" width="11" height="9" rx="2" fill="#2a8a4d"/>
    <rect x="5" y="0" width="11" height="5" rx="2" fill="#3fb86b"/><rect x="20.5" y="0" width="11" height="5" rx="2" fill="#3fb86b"/><rect x="36" y="0" width="11" height="5" rx="2" fill="#3fb86b"/>
    <rect x="0" y="7" width="52" height="27" rx="3.5" fill="#2a8a4d"/>
    <rect x="0" y="7" width="52" height="21" rx="3.5" fill="#3fb86b"/>
  </svg>`,
  argola: () => `<svg viewBox="0 0 44 26" width="44" height="26" aria-hidden="true" focusable="false">
    <ellipse cx="22" cy="14.5" rx="21" ry="11" fill="#c9960f"/>
    <ellipse cx="22" cy="12" rx="21" ry="11" fill="#f6c12d"/>
    <ellipse cx="22" cy="12" rx="9" ry="4.4" fill="#7a5a06"/>
  </svg>`,
  cunha: () => `<svg viewBox="0 0 40 34" width="40" height="34" aria-hidden="true" focusable="false">
    <path d="M1 33.5H39V2.5z" fill="#c9bc9c"/>
    <path d="M1 31H37V1z" fill="#e9dec4"/>
    <circle cx="28.5" cy="23" r="3.4" fill="#0d2534"/>
  </svg>`,
};

export function criarEsteira(bloco, { amb, som }) {
  const reduzido = !!amb?.reduzido;
  const palavras = (Array.isArray(bloco?.itens) ? bloco.itens : [])
    .map((p) => (typeof p === 'string' ? p.trim() : ''))
    .filter(Boolean);

  // A fila: palavra, peça, palavra, peça... Sem palavras, só as quatro peças.
  const fila = palavras.length
    ? palavras.flatMap((texto, i) => [
      { tipo: 'caixa', texto, cor: i === palavras.length - 1 ? 'vermelho' : CORES_CAIXA[i % 4], alta: i % 2 === 1, w: 0, h: 0 },
      { tipo: 'peca', peca: ORDEM_PECAS[i % 4], w: 0, h: 0 },
    ])
    : ORDEM_PECAS.map((peca) => ({ tipo: 'peca', peca, w: 0, h: 0 }));

  const ripas = el('i', 'esteira-ripas');
  const lona = el('div', 'esteira-lona', ripas);
  const rolo = el('i', 'esteira-rolo');
  const itensEl = el('div', 'esteira-itens');
  const palco = el('div', { class: 'esteira-palco', 'aria-hidden': 'true' }, [
    el('i', 'esteira-chao'), el('i', 'esteira-pe a'), el('i', 'esteira-pe b'), el('i', 'esteira-saia'),
    lona, rolo, itensEl, el('i', 'esteira-cacamba'), el('i', 'esteira-calha'),
  ]);
  const leitura = palavras.length ? el('ul', 'so-leitor', palavras.map((p) => el('li', null, p))) : null;
  const raiz = el('div', 'poppy-cena poppy-esteira', [palco, leitura]);

  let W = 0;
  let H = 0;
  let lonaY = 0;
  let fim = 0;
  let nascente = 0;
  let medida = false;
  let aquecido = false;
  let fase = 0;
  let indiceFila = 0;
  let vivos = [];
  let ultimo = null;
  let vivo = true;

  // A letra das caixas muda com a largura da tela e com a fonte que chega depois.
  document.fonts?.ready?.then(() => { medida = false; });

  function criarNo(molde) {
    if (molde.tipo === 'caixa') {
      return el('div', {
        class: molde.alta ? 'esteira-item esteira-caixa alta' : 'esteira-item esteira-caixa',
        dataset: { cor: molde.cor },
      }, el('span', null, molde.texto));
    }
    return el('div', { class: 'esteira-item esteira-peca', dataset: { tipo: molde.peca } }, svg(PECAS[molde.peca]()));
  }

  // Mede a fila inteira de uma vez: um cálculo de layout só, em vez de um por peça.
  function medirFila() {
    const nos = fila.map((molde) => {
      const no = criarNo(molde);
      no.style.visibility = 'hidden';
      itensEl.append(no);
      return no;
    });
    nos.forEach((no, i) => {
      fila[i].w = no.offsetWidth;
      fila[i].h = no.offsetHeight;
    });
    for (const no of nos) no.remove();
    for (const item of vivos) {
      item.w = item.molde.w;
      item.h = item.molde.h;
    }
    medida = true;
  }

  function criarItem(molde) {
    const no = criarNo(molde);
    itensEl.append(no);
    const item = {
      no, molde, w: molde.w, h: molde.h, bola: molde.peca === 'bola', caixa: molde.tipo === 'caixa',
      x: 0, y: 0, vx: 0, vy: 0, ang: 0, w2: 0, naLona: false, caindo: false, quiques: 0,
    };
    vivos.push(item);
    return item;
  }

  const proximaDaFila = () => fila[indiceFila++ % fila.length];
  // Onde a peça nasce: na boca da calha; no reduzido, entrando pela esquerda, já na lona.
  const xDeNascer = (molde) => (reduzido ? molde.w / 2 - 16 : Math.max(nascente, molde.w / 2 + 6));

  function soltar(item) {
    item.x = xDeNascer(item.molde);
    item.vx = 0;
    item.ang = 0;
    item.w2 = 0;
    if (reduzido) {
      item.y = lonaY - item.h / 2;
      item.naLona = true;
      item.vy = 0;
    } else {
      item.y = -item.h / 2 - 8;
      item.vy = 80;
    }
  }

  function posicionar(item) {
    item.no.style.transform = `translate3d(${(item.x - item.w / 2).toFixed(1)}px, ${(item.y - item.h / 2).toFixed(1)}px, 0) rotate(${item.ang.toFixed(1)}deg)`;
  }

  // A primeira vez que aparece já tem coisa na lona: ninguém olha esteira vazia.
  function preencher(velLona) {
    let x = fim - 30;
    while (x > nascente + 40 && vivos.length < MAX_VIVAS) {
      const molde = fila[indiceFila % fila.length];
      if (x - molde.w < nascente + 70) break;
      indiceFila++;
      const item = criarItem(molde);
      item.x = x - molde.w / 2;
      item.y = lonaY - molde.h / 2;
      item.naLona = true;
      item.vx = velLona;
      ultimo = item;
      x -= molde.w + 22;
    }
  }

  function passo(dt, velLona) {
    for (const it of vivos) {
      if (it.naLona) {
        it.vx += (velLona - it.vx) * Math.min(1, dt * 9);
        if (it.bola) it.ang += ((it.vx * dt) / (it.w / 2)) * 57.3;
        else {
          it.w2 += (-190 * it.ang - 13 * it.w2) * dt;
          it.ang += it.w2 * dt;
        }
        it.x += it.vx * dt;
        it.y = lonaY - it.h / 2;
        if (it.x > fim + (it.bola ? 0 : 4)) {
          // Passou do rolo: cai na caçamba girando.
          it.naLona = false;
          it.caindo = true;
          it.vy = 20;
          it.w2 = it.bola ? 240 : 170;
        }
        continue;
      }
      it.vy += GRAVIDADE * dt;
      it.x += it.vx * dt;
      it.y += it.vy * dt;
      // No ar a caixa procura ficar de pé (na queda da caçamba, não).
      if (!it.bola && !it.caindo) it.w2 += (-90 * it.ang - 6 * it.w2) * dt;
      it.ang += it.w2 * dt;
      if (!it.caindo && it.vy > 0 && it.y + it.h / 2 >= lonaY && it.x <= fim) {
        it.y = lonaY - it.h / 2;
        if (it.vy > 150 && it.quiques < 4) {
          it.quiques += 1;
          it.vy = -it.vy * (it.bola ? 0.52 : 0.34);
          it.vx += (velLona - it.vx) * 0.45;
          if (!it.bola) it.w2 = (it.quiques % 2 ? 1 : -1) * (60 + it.vy * -0.12);
        } else {
          it.vy = 0;
          it.naLona = true;
        }
      }
    }
  }

  // Movimento reduzido: nada cai nem quica; as peças andam e aparecem e somem nas bordas.
  function calmo(dt, velLona) {
    for (const it of vivos) {
      it.x += velLona * dt;
      it.y = lonaY - it.h / 2;
      const entrada = clamp((it.x - it.w / 2 - 4) / 40 + 0.5);
      const saida = clamp((fim - it.x) / 50);
      it.no.style.opacity = Math.min(entrada, saida).toFixed(2);
    }
  }

  function medir() {
    W = palco.clientWidth;
    H = palco.clientHeight;
    lonaY = lona.offsetTop;
    fim = lona.offsetLeft + lona.offsetWidth - 6;
    nascente = Math.min(W * 0.34, 150);
    medida = false;
  }

  return {
    el: raiz,
    medir,

    quadro(dt, info) {
      if (!vivo) return;
      if (!W) medir();
      if (!W) return;
      if (!medida) medirFila();
      const velLona = reduzido ? 30 : 64 + Math.min(380, Math.abs(info?.vel || 0) * 0.3);
      if (!aquecido) {
        aquecido = true;
        preencher(velLona);
      }

      fase += velLona * dt;
      ripas.style.transform = `translate3d(${(fase % PASSO_LONA).toFixed(1)}px, 0, 0)`;
      rolo.style.transform = `rotate(${(fase / 11).toFixed(3)}rad)`;

      // Solta a próxima quando a última já saiu da calha.
      if (vivos.length < MAX_VIVAS) {
        if (ultimo && !vivos.includes(ultimo)) ultimo = null;
        const esperando = fila[indiceFila % fila.length];
        const xe = xDeNascer(esperando);
        if (!ultimo || ultimo.x - ultimo.w / 2 > xe + esperando.w / 2 + 10) {
          const item = criarItem(proximaDaFila());
          soltar(item);
          ultimo = item;
        }
      }

      if (reduzido) calmo(dt, velLona);
      else {
        const n = dt > 0.02 ? 2 : 1;
        for (let i = 0; i < n; i++) passo(dt / n, velLona);
      }

      // Tirar o nó e tirar da lista andam juntos.
      vivos = vivos.filter((it) => {
        const saiu = it.y - it.h > H + 30 || it.x - it.w > W + 40 || (reduzido && it.x > fim + 4);
        if (saiu) it.no.remove();
        return !saiu;
      });
      for (const it of vivos) posicionar(it);
    },

    tocar(alvo) {
      const caixa = alvo?.closest?.('.esteira-caixa');
      if (!caixa) return;
      const item = vivos.find((it) => it.no === caixa);
      if (!item) return;
      som?.efeito?.('toque');
      if (reduzido) {
        caixa.classList.remove('piscou');
        void caixa.offsetWidth;
        caixa.classList.add('piscou');
        caixa.addEventListener('animationend', () => caixa.classList.remove('piscou'), { once: true });
        return;
      }
      // O tranco: a caixa pula da lona e gira.
      item.w2 += (item.ang > 0 ? -1 : 1) * 110;
      if (item.naLona) {
        item.naLona = false;
        item.vy = -120;
      }
    },

    destruir() {
      vivo = false;
      for (const it of vivos) it.no.remove();
      vivos = [];
      ultimo = null;
    },
  };
}
