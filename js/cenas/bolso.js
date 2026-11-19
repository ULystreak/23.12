// O bolso: a carta lida vai para a bolsa dela, em primeira pessoa.
// (contrato: _dev/ROTEIRO2.md, seção 3d)
//
//   criarBolso({ conteudo, amb, som, mundo, raiz }) → bolso      (raiz = #bolso, no index.html)
//   bolso.guardar({ tema, envelope }) → Promise
//       tema      'poppy' | 'yourname' (a mesma cara do envelope daquele capítulo)
//       envelope  a carta aberta que ficou no mundo (ctx.estado.envelope), ou null.
//                 Ao resolver, o envelope está descartado (dispose) e #bolso, vazio e oculto.
//       Nunca rejeita e nunca passa de uns 4 s; em movimento reduzido, uma dissolvência curta.
//   bolso.ocupado → boolean (true enquanto a animação roda)
//
// O que ela vê (uns 3 s): o olhar desce (o caminho sobe um pouco e escurece por baixo)
// e a bolsinha de ombro dela aparece embaixo, com as alças subindo e se apagando no ar.
// A carta desce pela borda de cima, de onde a folha saiu (ainda cor de papel, e no
// caminho vira a cara do tema); a aba abre, a carta entra na bolsa e some lá dentro;
// a aba fecha com o fecho de fio vermelho, a bolsa dá um pulinho, as alças se apagam e
// ela vai, pequenininha, até o botão da bolsa no canto (é lá que a carta fica guardada)
// e só some quando chega. O olhar volta.
//
// Tudo é DOM/SVG desenhado aqui (funciona igual sem WebGL) e só anima transform e
// opacity. A carta desce por cima de tudo e, já acima da boca, passa para dentro da
// bolsa: fica entre o fundo (com as alças) e a frente, com a aba por cima de todos.
// É por isso que ela some lá dentro.

import { el, espera, svg } from '../nucleo/util.js';
import { curvas } from '../nucleo/movimento.js';
import { imagemDoTema } from '../mundo/envelope.js';

const TINTA = '#2a1b22';
const LIMITE_MS = 4200;          // rede de segurança: o bolso nunca prende a carta

// ---- a bolsa (viewBox 300 × 240). A boca fica em y = 74; a aba abre a partir de y = 44.
const VB_L = 300;
const VB_A = 240;
const BOCA_Y = 74;
const DOBRA_Y = 44;
const LONA = '#efdcc6';          // a lona da bolsa
const LONA_SOMBRA = '#d9bfa3';
const FORRO = '#5b3f3a';         // o escuro de dentro

function desenhoFundo() {
  return `
    <svg class="bolso-bolsa-parte" viewBox="0 0 ${VB_L} ${VB_A}" aria-hidden="true" focusable="false">
      <defs>
        <!-- as alças se apagam para cima: inteiras perto da bolsa, nada na ponta -->
        <linearGradient id="bolso-alca-ponta" gradientUnits="userSpaceOnUse" x1="0" y1="52" x2="0" y2="-216">
          <stop offset="0.3" stop-color="#ffffff"/>
          <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
        </linearGradient>
        <mask id="bolso-alca-mascara" maskUnits="userSpaceOnUse" x="-120" y="-260" width="440" height="330">
          <rect x="-120" y="-260" width="440" height="330" fill="url(#bolso-alca-ponta)"/>
        </mask>
      </defs>
      <!-- as alças, que sobem para o ombro dela (somem antes de a bolsa ir para o canto) -->
      <g class="bolso-alcas" mask="url(#bolso-alca-mascara)">
        <path d="M46 52 C34 -10 4 -80 -40 -200" fill="none" stroke="${TINTA}" stroke-width="21" stroke-linecap="round"/>
        <path d="M46 52 C34 -10 4 -80 -40 -200" fill="none" stroke="${LONA_SOMBRA}" stroke-width="16" stroke-linecap="round"/>
        <path d="M254 52 C258 -20 196 -120 100 -210" fill="none" stroke="${TINTA}" stroke-width="21" stroke-linecap="round"/>
        <path d="M254 52 C258 -20 196 -120 100 -210" fill="none" stroke="${LONA_SOMBRA}" stroke-width="16" stroke-linecap="round"/>
      </g>
      <!-- as costas da bolsa, que aparecem acima da boca -->
      <path d="M32 ${DOBRA_Y} H268 C280 ${DOBRA_Y} 287 54 285 66 L281 ${BOCA_Y + 16} H19 L15 66 C13 54 20 ${DOBRA_Y} 32 ${DOBRA_Y} Z" fill="${LONA_SOMBRA}" stroke="${TINTA}" stroke-width="2.4" stroke-linejoin="round"/>
      <!-- o escuro de dentro, logo abaixo da boca -->
      <path d="M16 ${BOCA_Y} H284 L281 ${BOCA_Y + 40} H19 Z" fill="${FORRO}"/>
    </svg>`;
}

function desenhoFrente() {
  return `
    <svg class="bolso-bolsa-parte" viewBox="0 0 ${VB_L} ${VB_A}" aria-hidden="true" focusable="false">
      <path d="M24 ${BOCA_Y} H276 C288 ${BOCA_Y} 294 82 293 94 L284 206 C282 226 268 238 248 238 H52 C32 238 18 226 16 206 L7 94 C6 82 12 ${BOCA_Y} 24 ${BOCA_Y} Z" fill="${LONA}" stroke="${TINTA}" stroke-width="2.6" stroke-linejoin="round"/>
      <!-- a sombra do lado e o pesponto -->
      <path d="M262 ${BOCA_Y + 2} C280 ${BOCA_Y + 4} 286 90 285 100 L277 204 C275 220 266 228 252 230 C264 214 266 140 262 ${BOCA_Y + 2} Z" fill="${LONA_SOMBRA}" fill-opacity="0.7"/>
      <path d="M28 ${BOCA_Y + 9} H272 C281 ${BOCA_Y + 9} 285 88 284 96 L276 202 C274 218 264 228 248 228 H52 C36 228 26 218 24 202 L16 96 C15 88 19 ${BOCA_Y + 9} 28 ${BOCA_Y + 9} Z" fill="none" stroke="${TINTA}" stroke-width="1.3" stroke-opacity="0.4" stroke-dasharray="6 5"/>
      <!-- a beirada da boca, que pega luz -->
      <path d="M22 ${BOCA_Y + 1.5} H278" stroke="#ffffff" stroke-width="2" stroke-opacity="0.75" stroke-linecap="round"/>
      <!-- um bolsinho na frente, com uma pétala bordada -->
      <path d="M96 150 H204 L200 206 C199 214 194 218 186 218 H114 C106 218 101 214 100 206 Z" fill="none" stroke="${TINTA}" stroke-width="1.6" stroke-opacity="0.55" stroke-linejoin="round"/>
      <path d="M150 172 c-7 -9 -16 -3 -12 5 c3 6 12 11 12 11 s9 -5 12 -11 c4 -8 -5 -14 -12 -5 z" fill="#f4b8c8" stroke="${TINTA}" stroke-width="1.3" stroke-opacity="0.6"/>
    </svg>`;
}

function desenhoAba() {
  return `
    <svg class="bolso-bolsa-parte" viewBox="0 0 ${VB_L} ${VB_A}" aria-hidden="true" focusable="false">
      <path d="M24 ${DOBRA_Y} H276 C285 ${DOBRA_Y} 290 52 288 61 L277 126 C262 150 202 162 150 162 C98 162 38 150 23 126 L12 61 C10 52 15 ${DOBRA_Y} 24 ${DOBRA_Y} Z" fill="${LONA}" stroke="${TINTA}" stroke-width="2.6" stroke-linejoin="round"/>
      <path d="M26 ${DOBRA_Y + 10} H274 C279 ${DOBRA_Y + 10} 281 58 280 63 L270 121 C256 141 200 151 150 151 C100 151 44 141 30 121 L20 63 C19 58 21 ${DOBRA_Y + 10} 26 ${DOBRA_Y + 10} Z" fill="none" stroke="${TINTA}" stroke-width="1.3" stroke-opacity="0.4" stroke-dasharray="6 5"/>
      <path d="M24 ${DOBRA_Y + 3} H276" stroke="${LONA_SOMBRA}" stroke-width="5" stroke-linecap="round"/>
      <!-- o fecho: um botão vermelho com uma volta do fio -->
      <path d="M150 140 C132 150 132 176 150 180 C168 176 168 150 150 140" fill="none" stroke="#d7192d" stroke-width="2.2" stroke-linecap="round"/>
      <circle cx="150" cy="156" r="10" fill="#d7192d" stroke="${TINTA}" stroke-width="2"/>
      <circle cx="146.5" cy="152.5" r="3" fill="#ffffff" fill-opacity="0.55"/>
    </svg>`;
}

/** A carta fechada, com a cara do tema (a mesma face do envelope 3D). */
function desenharCarta(tema) {
  const carta = el('div', { class: 'bolso-carta', dataset: { tema: tema || '' } });
  let face = null;
  try { face = imagemDoTema(tema, 512); } catch { face = null; }
  if (face) {
    try { carta.style.backgroundImage = `url(${face.toDataURL('image/jpeg', 0.86)})`; } catch { /* fica na cor do papel */ }
  }
  // as dobras do verso: a aba de cima fechada e as duas de baixo
  carta.append(svg(`
    <svg viewBox="0 0 460 320" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <path d="M0 320 L208 190 Q230 178 252 190 L460 320" fill="none" stroke="#000000" stroke-opacity="0.22" stroke-width="3"/>
      <path d="M0 0 L208 194 Q230 212 252 194 L460 0" fill="none" stroke="#000000" stroke-opacity="0.34" stroke-width="5" transform="translate(0 3)"/>
      <path d="M0 0 L208 194 Q230 212 252 194 L460 0" fill="none" stroke="#ffffff" stroke-opacity="${face ? 0.34 : 0.9}" stroke-width="2"/>
      <rect x="1" y="1" width="458" height="318" rx="7" fill="none" stroke="${TINTA}" stroke-opacity="${face ? 0.5 : 0.22}" stroke-width="2"/>
    </svg>`));
  return carta;
}

/** Onde está o botão da bolsa (para onde a bolsinha vai no fim). */
function alvoDaBolsa(L, A) {
  const botao = document.querySelector('.inventario-botao');
  const caixa = botao?.getBoundingClientRect?.();
  if (caixa && caixa.width > 0 && !botao.closest('[hidden]')) return { x: caixa.left + caixa.width / 2, y: caixa.top + caixa.height / 2 };
  return { x: L - 44, y: A - 44 };
}

export function criarBolso({ conteudo, amb, som, raiz }) {
  let ocupado = false;
  const rotulo = conteudo?.inventario?.rotulos?.guardando || '';
  const olhar = () => ['mundo', 'mundo-leve'].map((id) => document.getElementById(id)).filter(Boolean);

  function descartar(envelope) {
    if (!envelope || envelope.descartado) return;
    try { envelope.dispose?.(); } catch (erro) { console.error(erro); }
  }

  /** Dito em voz alta (o desenho é aria-hidden): um aviso educado, fora de #bolso. */
  function anunciar() {
    if (!rotulo || typeof document === 'undefined') return () => {};
    const aviso = el('p', { class: 'bolso-aviso', role: 'status', 'aria-live': 'polite' });
    document.body.append(aviso);
    // (o texto entra depois do nó: é a mudança que os leitores de tela anunciam)
    setTimeout(() => { aviso.textContent = rotulo; }, 60);
    return () => setTimeout(() => aviso.remove(), 1500);
  }

  async function animar(tema, envelope) {
    const gsap = window.gsap;
    const L = window.innerWidth; const A = window.innerHeight;
    const reduzido = !!amb?.reduzido;

    const larguraCarta = Math.min(L * 0.66, A * 0.42, 340);
    const alturaCarta = larguraCarta * (16 / 23);
    const centro = { x: L / 2, y: A * 0.36 };     // (no movimento reduzido, a carta aparece aqui)

    const carta = desenharCarta(tema);
    Object.assign(carta.style, { width: `${larguraCarta}px`, height: `${alturaCarta}px`, left: `${-larguraCarta / 2}px`, top: `${-alturaCarta / 2}px` });
    const levaCarta = el('div', 'bolso-leva', carta);

    raiz.textContent = '';
    raiz.dataset.tema = tema || '';
    raiz.hidden = false;

    if (reduzido || !gsap) {
      // Sem viagem: a carta aparece, fica um instante e se desfaz.
      levaCarta.style.transform = `translate3d(${centro.x}px, ${centro.y}px, 0)`;
      raiz.append(levaCarta);
      descartar(envelope);
      if (!gsap) { await espera(700); return; }
      await new Promise((ok) => {
        gsap.timeline({ onComplete: ok })
          .fromTo(levaCarta, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3, ease: 'none' })
          .to(levaCarta, { autoAlpha: 0, duration: 0.6, ease: 'none' }, 0.75);
      });
      return;
    }

    // A bolsa: no meio, embaixo, inteira na tela.
    const largura = Math.min(L * 0.8, A * 0.44, 380);
    const altura = largura * (VB_A / VB_L);
    const k = largura / VB_L;
    const esquerda = (L - largura) / 2;
    const topo = A - altura - Math.max(A * 0.05, 18);
    const bolsa = el('div', 'bolso-bolsa');
    Object.assign(bolsa.style, { left: `${esquerda}px`, top: `${topo}px`, width: `${largura}px`, height: `${altura}px` });
    const fundo = svg(desenhoFundo());
    const alcas = fundo.querySelector('.bolso-alcas');
    const frente = svg(desenhoFrente());
    const aba = svg(desenhoAba());
    aba.classList.add('bolso-aba');
    aba.style.transformOrigin = `50% ${(DOBRA_Y / VB_A) * 100}%`;
    bolsa.append(fundo, frente, aba);
    // (dentro da bolsa a carta fica entre o fundo e a frente; a aba aberta fica atrás
    // dela e, fechada, por cima de tudo)
    [fundo, levaCarta, frente, aba].forEach((n, i) => { n.style.zIndex = String([1, 3, 4, 5][i]); });
    const veu = el('div', 'bolso-veu');
    // A carta desce por cima de tudo, fora da bolsa (assim não pega o fade nem a subida dela).
    raiz.append(veu, bolsa, levaCarta);
    // Por cima da cara do tema, a cor do papel: é a folha que voltou dobrada.
    const papel = el('div', 'bolso-carta-papel');
    carta.prepend(papel);

    // Em px da tela: a carta é medida pela boca e cabe inteira atrás da frente.
    const escalaFinal = (largura * 0.74) / larguraCarta;
    const alturaFinal = alturaCarta * escalaFinal;
    const bocaY = topo + BOCA_Y * k;
    // Ela entra pela borda de cima, de onde a folha saiu, inclinada como a folha ia.
    const pose = { x: L / 2 + larguraCarta * 0.08, y: -alturaCarta * 0.6, giro: -0.08, escala: 1, dentro: 0 };
    const naBoca = { x: L / 2, y: bocaY - alturaFinal * 0.42 };
    // (lá dentro ela fica um pouco menor e reta: some inteira atrás da frente, sem o pé
    // aparecer embaixo da bolsa)
    const guardada = { y: bocaY + alturaFinal * 0.47 + 3, escala: escalaFinal * 0.94 };
    const aplicar = () => {
      // Dentro da bolsa (que a essa altura já parou), a pose é medida do canto dela.
      // (se a rede de segurança já limpou o #bolso, a bolsa saiu do DOM e a carta não volta)
      const casa = pose.dentro ? bolsa : raiz;
      if (levaCarta.parentNode !== casa && bolsa.isConnected) casa.insertBefore(levaCarta, pose.dentro ? frente : null);
      const x = pose.x - (pose.dentro ? esquerda : 0);
      const y = pose.y - (pose.dentro ? topo : 0);
      levaCarta.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) rotate(${pose.giro.toFixed(4)}rad) scale(${pose.escala.toFixed(4)})`;
    };
    aplicar();

    // Para onde a bolsinha vai no fim: o botão da bolsa.
    const alvo = alvoDaBolsa(L, A);
    const ate = { x: alvo.x - (esquerda + largura / 2), y: alvo.y - (topo + altura / 2), escala: Math.max(0.08, 48 / largura) };

    descartar(envelope);                       // a carta do mundo já não aparece: a daqui assume
    const efeito = (nome) => { try { som?.efeito?.(nome); } catch { /* sem som */ } };
    const mundo = olhar();

    await new Promise((ok) => {
      const tl = gsap.timeline({ onComplete: ok, onUpdate: aplicar });
      // 1. o olhar desce: o caminho sobe um pouco, escurece por baixo e a bolsa chega
      //    (o mundo sobe 3% e cresce 7% do meio: a caixa vai de −6,5% a 100,5% da tela,
      //    sem deixar faixa embaixo em quadro nenhum)
      tl.to(mundo, { yPercent: -3, scale: 1.07, duration: 0.8, ease: 'power2.out' }, 0)
        .fromTo(veu, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.6, ease: 'none' }, 0)
        .fromTo(bolsa, { y: altura * 0.9, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.75, ease: curvas.branco.entrar }, 0.05)
        // 2. a carta desce até a boca, ficando do tamanho da bolsa; a cor do papel vira a cara do tema
        .to(pose, { x: naBoca.x, y: naBoca.y, giro: -0.03, escala: escalaFinal, duration: 1.5, ease: 'power1.out' }, 0)
        .to(papel, { opacity: 0, duration: 0.45, ease: 'sine.inOut' }, 0.3)
        // 3. a aba abre e a carta, ainda acima da boca, passa para dentro da bolsa
        .to(aba, { scaleY: -0.45, duration: 0.45, ease: 'power2.out' }, 0.55)
        .set(aba, { zIndex: 2 }, 0.78)
        .set(pose, { dentro: 1 }, 0.85)
        .add(() => efeito('papel'), 0.6)
        // 4. e entra (some atrás da frente)
        .to(pose, { y: guardada.y, giro: 0, escala: guardada.escala, duration: 0.42, ease: 'power2.in' }, 1.5)
        .set(levaCarta, { autoAlpha: 0 }, 1.94)
        // 5. a aba fecha com o fecho, a bolsa dá um pulinho e as alças se apagam
        .to(aba, { scaleY: 1, duration: 0.32, ease: 'power3.in' }, 1.9)
        .set(aba, { zIndex: 5 }, 2.02)
        .add(() => efeito('toque'), 2.2)
        .to(bolsa, { scaleY: 0.95, scaleX: 1.03, transformOrigin: '50% 100%', duration: 0.1, ease: 'power1.out' }, 2.2)
        .to(bolsa, { scaleY: 1, scaleX: 1, duration: 0.3, ease: 'back.out(3)' }, 2.3)
        .to(alcas, { autoAlpha: 0, duration: 0.2, ease: 'none' }, 2.35)
        // 6. a bolsinha vai até o botão da bolsa e só some quando chega; o olhar volta para o caminho
        .to(bolsa, { x: ate.x, y: ate.y, scale: ate.escala, transformOrigin: '50% 50%', duration: 0.6, ease: 'power3.inOut' }, 2.55)
        .to(bolsa, { autoAlpha: 0, duration: 0.1, ease: 'none' }, 3.05)
        .to(veu, { autoAlpha: 0, duration: 0.5, ease: 'none' }, 2.6)
        .to(mundo, { yPercent: 0, scale: 1, duration: 0.6, ease: 'power2.inOut' }, 2.55);
    });
  }

  return {
    get ocupado() { return ocupado; },

    async guardar({ tema = 'poppy', envelope = null } = {}) {
      if (ocupado) { descartar(envelope); return; }
      ocupado = true;
      const calar = anunciar();
      try {
        if (!raiz) { descartar(envelope); return; }
        await Promise.race([
          animar(tema, envelope),
          espera(LIMITE_MS),
        ]);
      } catch (erro) {
        console.error('[carta] o bolso falhou', erro);
      } finally {
        descartar(envelope);
        const mundo = olhar();
        try { window.gsap?.killTweensOf?.(mundo); window.gsap?.set?.(mundo, { clearProps: 'transform' }); } catch { /* o mundo fica como está */ }
        if (raiz) {
          try { window.gsap?.killTweensOf?.(raiz.querySelectorAll('*')); } catch { /* nada a matar */ }
          raiz.textContent = '';
          raiz.hidden = true;
          delete raiz.dataset.tema;
        }
        calar();
        ocupado = false;
      }
    },
  };
}
