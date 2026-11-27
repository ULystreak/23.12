/* ============================================================================
   BOLSO: a carta lida vai para a bolsa de ombro dela
   ============================================================================
   Primeira pessoa: o olhar desce (o mundo sobe 3% e cresce 7%, escurecido por
   baixo), a bolsinha aparece embaixo com as alças curtas, a carta desce pela
   borda de cima (de onde a folha saiu, ainda da cor do papel e já opaca), a aba
   abre, a carta entra e some, a aba fecha com o fecho de fio vermelho, a bolsa
   dá um pulinho e voa, pequenina, até o botão da bolsa no canto.
   Nada de mão desenhada: o autor reprovou ("escrota demais").

   Tudo é DOM e SVG (funciona sem WebGL) e só anima transform e opacity.
   Chamado pelo diretor (cenaCapitulo, etapa "guardando") depois de
   pergaminho.enrolar() e soltar(). `guardar` nunca rejeita e dura no máximo
   LIMITE_MS. O `mundo` que o main.js passa não é usado: o olhar mexe em
   #mundo e #mundo-leve pelo id.
   ========================================================================== */

import { el, espera, svg } from '../nucleo/util.js';
import { curvas, comoPromise } from '../nucleo/movimento.js';

const TINTA = '#2a1b22';
// Rede de segurança: o bolso nunca prende a carta (espera divide por ?rapido).
const LIMITE_MS = 4200;

// A bolsa, no viewBox 300 × 240.
const BOCA_Y = 74; // a boca (a borda de cima da frente)
const DOBRA_Y = 44; // a aba abre a partir daqui
const LONA = '#efdcc6';
const SOMBRA = '#d9bfa3';
const FORRO = '#5b3f3a';
const CORPO = 'M30 74 Q150 82 270 74 L282 204 Q284 230 258 232 L42 232 Q16 230 18 204 Z';
const ABA = 'M24 44 Q150 32 276 44 L272 118 Q268 146 238 154 L168 166 Q150 170 132 166 L62 154 Q32 146 28 118 Z';
const ALCA_E = 'M30 104 C22 74 20 40 34 0 S84 -120 110 -200';
const ALCA_D = 'M270 104 C278 74 280 40 266 0 S216 -120 190 -200';
const PETALA = 'M10 18C5 14 2.5 10 3.5 6 4.2 3.4 6.5 2 8.4 2.6L10 5l1.6-2.4c1.9-.6 4.2.8 4.9 3.4C17.5 10 15 14 10 18z';

const px = (v) => `${v}px`;

/** As costas: as alças (curtas, que se apagam para cima), a parede de trás e o forro escuro logo abaixo da boca. */
function desenhoFundo() {
  return `<svg class="bolso-bolsa-parte" viewBox="0 0 300 240" aria-hidden="true" focusable="false">
  <defs>
    <linearGradient id="bolso-alca-ponta" gradientUnits="userSpaceOnUse" x1="0" y1="${DOBRA_Y}" x2="0" y2="${BOCA_Y + 2}">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="1"/>
    </linearGradient>
    <mask id="bolso-alca-mascara" maskUnits="userSpaceOnUse" x="-60" y="-220" width="420" height="480">
      <rect x="-60" y="-220" width="420" height="480" fill="url(#bolso-alca-ponta)"/>
    </mask>
  </defs>
  <g class="bolso-alcas" mask="url(#bolso-alca-mascara)" fill="none" stroke-linecap="round">
    <path d="${ALCA_E}" stroke="${TINTA}" stroke-width="21"/>
    <path d="${ALCA_E}" stroke="${SOMBRA}" stroke-width="16"/>
    <path d="${ALCA_D}" stroke="${TINTA}" stroke-width="21"/>
    <path d="${ALCA_D}" stroke="${SOMBRA}" stroke-width="16"/>
  </g>
  <path d="M34 80 C34 60 40 47 54 43 Q150 31 246 43 C260 47 266 60 266 80 Z" fill="${SOMBRA}" stroke="${TINTA}" stroke-width="2" stroke-linejoin="round"/>
  <path d="M58 46.5 Q150 36 242 46.5" fill="none" stroke="#f6dca6" stroke-opacity="0.55" stroke-width="2" stroke-linecap="round"/>
  <path d="M44 84 C45 66 52 56 64 53 Q150 45 236 53 C248 56 255 66 256 84 Z" fill="${FORRO}"/>
</svg>`;
}

/** A frente: lona, sombra lateral, pesponto, a beirada que pega luz e o bolsinho com uma pétala bordada. */
function desenhoFrente() {
  return `<svg class="bolso-bolsa-parte" viewBox="0 0 300 240" aria-hidden="true" focusable="false">
  <path d="${CORPO}" fill="${LONA}"/>
  <path d="M252 76.5 Q262 75.8 270 74 L282 204 Q284 230 258 232 L246 232 Q266 206 252 76.5 Z" fill="${SOMBRA}"/>
  <path d="M40 87 Q150 95 260 87 L270.5 201 Q271.5 220 252 221 L48 221 Q28.5 220 29.5 201 Z" fill="none" stroke="${TINTA}" stroke-opacity="0.36" stroke-width="1.4" stroke-dasharray="5 4.5" stroke-linecap="round"/>
  <path d="M104 176 H196 V210 Q196 220 186 220 H114 Q104 220 104 210 Z" fill="${LONA}" stroke="${TINTA}" stroke-opacity="0.5" stroke-width="1.5" stroke-linejoin="round"/>
  <path d="M106 179.5 H194" stroke="${TINTA}" stroke-opacity="0.12" stroke-width="2.4"/>
  <path d="M110 183 H190 V208 Q190 214 184 214 H116 Q110 214 110 208 Z" fill="none" stroke="${TINTA}" stroke-opacity="0.3" stroke-width="1.1" stroke-dasharray="3.5 3.5"/>
  <path transform="translate(139 186) scale(1.1)" d="${PETALA}" fill="#f4b8c8" stroke="#b3123a" stroke-opacity="0.55" stroke-width="0.9" stroke-dasharray="1.6 1.2"/>
  <path d="M34 77.6 Q150 85.6 266 77.6" fill="none" stroke="#f6dca6" stroke-opacity="0.7" stroke-width="2.4" stroke-linecap="round"/>
  <path d="${CORPO}" fill="none" stroke="${TINTA}" stroke-width="2.2" stroke-linejoin="round"/>
</svg>`;
}

/** A aba com pesponto e o fecho: um botão com uma volta de fio vermelho. */
function desenhoAba() {
  return `<svg class="bolso-bolsa-parte bolso-aba" viewBox="0 0 300 240" aria-hidden="true" focusable="false">
  <path d="${ABA}" fill="${LONA}" stroke="${TINTA}" stroke-width="2.2" stroke-linejoin="round"/>
  <path d="M35 54 Q150 43.5 265 54 L262.5 115 Q259 137 234 143 L167 155.5 Q150 158.5 133 155.5 L66 143 Q41 137 37.5 115 Z" fill="none" stroke="${TINTA}" stroke-opacity="0.36" stroke-width="1.4" stroke-dasharray="5 4.5" stroke-linecap="round"/>
  <path d="M28 46.5 Q150 35 272 46.5" fill="none" stroke="#f6dca6" stroke-opacity="0.6" stroke-width="2.4" stroke-linecap="round"/>
  <path d="M150 168.4c2.6 5.4 8 9 12.6 9.6" fill="none" stroke="#e3283c" stroke-width="2.2" stroke-linecap="round"/>
  <ellipse cx="150" cy="156" rx="14.5" ry="12.5" fill="none" stroke="#e3283c" stroke-width="2.2"/>
  <circle cx="150" cy="156" r="10" fill="#f7ecd6" stroke="${TINTA}" stroke-width="1.8"/>
  <path d="M146.4 156h7.2" stroke="#e3283c" stroke-width="2.2" stroke-linecap="round"/>
  <circle cx="146.4" cy="156" r="1.2" fill="${TINTA}"/>
  <circle cx="153.6" cy="156" r="1.2" fill="${TINTA}"/>
</svg>`;
}

// As dobras do envelope por cima da face (460 × 320, como a carta).
const DOBRAS = `<svg viewBox="0 0 460 320" preserveAspectRatio="none" aria-hidden="true" focusable="false">
  <path d="M5 6 230 176 455 6" fill="none" stroke="${TINTA}" stroke-opacity="0.26" stroke-width="2.6" stroke-linejoin="round"/>
  <path d="M7 10 230 180 453 10" fill="none" stroke="#f6dca6" stroke-opacity="0.55" stroke-width="1.8"/>
  <path d="M6 314 184 150M454 314 276 150" fill="none" stroke="${TINTA}" stroke-opacity="0.12" stroke-width="2"/>
  <rect x="1.5" y="1.5" width="457" height="317" rx="8" fill="none" stroke="#f6dca6" stroke-opacity="0.5" stroke-width="2"/>
</svg>`;

/**
 * O centro do botão da bolsa. No primeiro capítulo a bolsa ainda está escondida:
 * mede, sem mostrar, onde o botão vai aparecer (com a área segura do iPhone).
 * Sem botão nenhum, o canto (L − 44, A − 44).
 */
function alvoDaBolsa(L, A) {
  const botao = document.querySelector('.inventario-botao');
  let r = botao?.getBoundingClientRect();
  const inv = botao?.closest('#inventario');
  if (botao && !(r.width > 0) && inv?.hidden) {
    inv.style.visibility = 'hidden';
    inv.hidden = false;
    r = botao.getBoundingClientRect();
    inv.hidden = true;
    inv.style.visibility = '';
  }
  if (r && r.width > 0 && r.height > 0) return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  return { x: L - 44, y: A - 44 };
}

// O mundo que o olhar desce: o canvas, o mundo leve e, sem WebGL, a foto da
// alameda por trás dele (senão a foto ficaria parada sob o mundo que se move).
function partesDoMundo() {
  return ['mundo', 'mundo-leve', 'mundo-fundo'].map((id) => document.getElementById(id)).filter(Boolean);
}

export function criarBolso({ conteudo, amb, som, raiz }) {
  let ocupado = false;
  let linha = null;
  let imagemDoTema = null;
  const descartados = new WeakSet();

  // A face do tema vem do envelope (que a cena da carta já carregou antes de qualquer capítulo).
  import('../mundo/envelope.js').then((m) => { imagemDoTema = m.imagemDoTema || null; }, () => {});

  // A carta 3D some e a DOM assume do mesmo lugar. Duas vezes não faz mal.
  function descartar(envelope) {
    if (!envelope || envelope.descartado || descartados.has(envelope)) return;
    descartados.add(envelope);
    try {
      envelope.dispose?.();
    } catch (erro) {
      console.error('[carta] descartar o envelope', erro);
    }
  }

  // O desenho é aria-hidden; o aviso para o leitor de tela fica fora de #bolso.
  function anunciar() {
    const texto = conteudo?.inventario?.rotulos?.guardando;
    if (typeof texto !== 'string' || !texto.trim()) return () => {};
    const aviso = el('p', { class: 'bolso-aviso', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });
    document.body.append(aviso);
    const timer = setTimeout(() => { aviso.textContent = texto; }, 60);
    return () => {
      clearTimeout(timer);
      setTimeout(() => aviso.remove(), 1500);
    };
  }

  // A face vai como cópia num canvas, não como fundo em data URL: a carta troca de
  // pai no meio do caminho, e com fundo o navegador redesenhava a imagem (engasgo de ~50 ms).
  function desenharCarta(tema) {
    const carta = el('div', { class: 'bolso-carta', dataset: { tema } });
    let face = null;
    try {
      face = imagemDoTema?.(tema, 512) || null;
    } catch {
      face = null;
    }
    if (face?.width) {
      const copia = el('canvas', { width: face.width, height: face.height });
      copia.getContext('2d')?.drawImage(face, 0, 0);
      carta.append(copia);
    }
    carta.append(svg(DOBRAS));
    return carta;
  }

  function animar(tema, envelope) {
    const gsap = window.gsap;
    const L = window.innerWidth;
    const A = window.innerHeight;
    const larg = Math.min(L * 0.66, A * 0.42, 340);
    const alt = (larg * 16) / 23;

    const carta = desenharCarta(tema);
    Object.assign(carta.style, { left: px(-larg / 2), top: px(-alt / 2), width: px(larg), height: px(alt) });
    const leva = el('div', 'bolso-leva', carta);
    raiz.textContent = '';
    raiz.dataset.tema = tema;
    raiz.hidden = false;

    // A versão calma: a carta aparece no centro e se desfaz. Sem bolsa, sem véu, sem viagem.
    if (amb?.reduzido || !gsap) {
      leva.style.transform = `translate3d(${L / 2}px, ${A * 0.36}px, 0)`;
      raiz.append(leva);
      descartar(envelope);
      if (!gsap) return espera(700);
      linha = gsap.timeline();
      linha
        .fromTo(carta, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3, ease: 'none' }, 0)
        .to(carta, { autoAlpha: 0, duration: 0.6, ease: 'none' }, 0.75);
      return comoPromise(linha);
    }

    // A bolsa na tela, dimensionada pela tela (o mesmo no celular e no computador).
    const largura = Math.min(L * 0.8, A * 0.44, 380);
    const altura = (largura * 240) / 300;
    const k = largura / 300;
    const esquerda = (L - largura) / 2;
    const topo = A - altura - Math.max(A * 0.05, 18);
    const bocaY = topo + BOCA_Y * k;
    const escalaFinal = (largura * 0.74) / larg;
    const alturaFinal = alt * escalaFinal;

    const veu = el('div', 'bolso-veu');
    const fundo = svg(desenhoFundo());
    const frente = svg(desenhoFrente());
    const aba = svg(desenhoAba());
    const alcas = fundo.querySelector('.bolso-alcas');
    fundo.style.zIndex = '1';
    frente.style.zIndex = '4';
    aba.style.zIndex = '5';
    leva.style.zIndex = '3';
    const bolsa = el('div', 'bolso-bolsa', [fundo, frente, aba]);
    Object.assign(bolsa.style, { left: px(esquerda), top: px(topo), width: px(largura), height: px(altura) });
    // A cor do papel por cima da face: é a folha que volta dobrada e vira a carta.
    const papel = el('div', 'bolso-carta-papel');
    carta.insertBefore(papel, carta.lastChild);
    raiz.append(veu, bolsa, leva);
    // Antes de qualquer quadro: nunca duas cartas (a 3D e a DOM) juntas.
    descartar(envelope);

    // A pose da carta, em px da tela. Entra de onde a folha saiu: um pouco à
    // direita e girada como a folha que voou (−4,5°).
    const valores = { x: L / 2 + larg * 0.08, y: -alt * 0.6, giro: -0.08, escala: 1, dentro: 0 };
    // Depois que sai da boca, a carta passa para dentro da bolsa, entre o fundo
    // (com as alças) e a frente; as coordenadas passam a contar do canto da bolsa.
    const aplicar = () => {
      const dentro = valores.dentro >= 1;
      if (dentro && leva.parentNode !== bolsa) bolsa.insertBefore(leva, frente);
      else if (!dentro && leva.parentNode !== raiz) raiz.append(leva);
      const x = dentro ? valores.x - esquerda : valores.x;
      const y = dentro ? valores.y - topo : valores.y;
      leva.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) rotate(${valores.giro.toFixed(4)}rad) scale(${valores.escala.toFixed(4)})`;
    };
    // A pose se aplica a cada valor que a GSAP escreve: a carta fica certa até
    // quando a linha do tempo é posicionada à mão (sem callbacks), como no ver-bolso.
    const pose = {};
    for (const chave of Object.keys(valores)) {
      Object.defineProperty(pose, chave, {
        enumerable: true,
        get: () => valores[chave],
        set: (v) => {
          valores[chave] = v;
          aplicar();
        },
      });
    }
    aplicar();

    const alvo = alvoDaBolsa(L, A);
    const ate = {
      x: alvo.x - (esquerda + largura / 2),
      y: alvo.y - (topo + altura / 2),
      scale: Math.max(0.08, 48 / largura),
    };
    const mundo = partesDoMundo();
    gsap.set(aba, { transformOrigin: `50% ${((DOBRA_Y / 240) * 100).toFixed(2)}%` });

    // Os tempos casam entre si e com LIMITE_MS: mudar um pede revisar os outros.
    linha = gsap.timeline();
    linha
      // ela olha para baixo; a escala centrada cobre a tela inteira enquanto o mundo sobe
      .to(mundo, { yPercent: -3, scale: 1.07, transformOrigin: '50% 50%', duration: 0.8, ease: 'power2.out' }, 0)
      .fromTo(veu, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.6, ease: 'none' }, 0)
      .fromTo(bolsa, { y: altura * 0.9, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.75, ease: curvas.branco.entrar }, 0.05)
      .to(pose, { x: L / 2, y: bocaY - alturaFinal * 0.42, giro: -0.03, escala: escalaFinal, duration: 1.5, ease: 'power1.out' }, 0)
      .to(papel, { opacity: 0, duration: 0.45, ease: 'sine.inOut' }, 0.3)
      .to(aba, { scaleY: -0.45, duration: 0.45, ease: 'power2.out' }, 0.55)
      .call(() => som?.efeito?.('papel'), null, 0.6)
      .set(aba, { zIndex: 2 }, 0.78)
      .set(pose, { dentro: 1 }, 0.85)
      .to(pose, { y: bocaY + alturaFinal * 0.47 + 3, escala: escalaFinal * 0.94, duration: 0.42, ease: 'power2.in' }, 1.5)
      .to(aba, { scaleY: 1, duration: 0.32, ease: 'power3.in' }, 1.9)
      .set(carta, { autoAlpha: 0 }, 1.94)
      .set(aba, { zIndex: 5 }, 2.02)
      .call(() => som?.efeito?.('toque'), null, 2.2)
      .to(bolsa, { scaleY: 0.95, scaleX: 1.03, transformOrigin: '50% 100%', duration: 0.1, ease: 'power1.out' }, 2.2)
      .to(bolsa, { scaleY: 1, scaleX: 1, duration: 0.3, ease: 'back.out(3)' }, 2.3)
      // as alças somem antes do voo
      .to(alcas, { autoAlpha: 0, duration: 0.2, ease: 'none' }, 2.35)
      .to(bolsa, { x: ate.x, y: ate.y, scale: ate.scale, transformOrigin: '50% 50%', duration: 0.6, ease: 'power3.inOut' }, 2.55)
      .to(mundo, { yPercent: 0, scale: 1, duration: 0.6, ease: 'power2.inOut' }, 2.55)
      .to(veu, { autoAlpha: 0, duration: 0.5, ease: 'none' }, 2.6)
      .to(bolsa, { autoAlpha: 0, duration: 0.1, ease: 'none' }, 3.05);
    return comoPromise(linha);
  }

  return {
    async guardar({ tema = 'poppy', envelope = null } = {}) {
      if (ocupado) {
        descartar(envelope);
        return;
      }
      ocupado = true;
      const calar = anunciar();
      try {
        await Promise.race([animar(tema, envelope), espera(LIMITE_MS)]);
      } catch (erro) {
        console.error('[carta] guardar no bolso', erro);
      } finally {
        linha?.kill();
        linha = null;
        descartar(envelope);
        const gsap = window.gsap;
        const mundo = partesDoMundo();
        if (gsap) {
          gsap.killTweensOf(mundo);
          // sem isto o mundo ficaria deslocado depois do olhar
          gsap.set(mundo, { clearProps: 'transform,transformOrigin' });
          gsap.killTweensOf(raiz.querySelectorAll('*'));
        }
        raiz.textContent = '';
        raiz.hidden = true;
        delete raiz.dataset.tema;
        calar();
        ocupado = false;
      }
    },
    get ocupado() {
      return ocupado;
    },
  };
}
