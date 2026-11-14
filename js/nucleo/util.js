// Utilidades pequenas, sem dependências.
//
// TEMPO: espera(ms) recebe MILISSEGUNDOS (como setTimeout) e respeita ?rapido=N.
// A GSAP usa segundos; não misture.

let fatorRapido = 1;

/** Chamado uma vez pelo main.js com amb.rapido. */
export function configurarTempo(rapido) {
  fatorRapido = rapido > 0 ? rapido : 1;
}

/**
 * Promise que resolve depois de `ms` milissegundos (divididos por ?rapido=N).
 * Só conta o tempo com a aba visível: se ela trocar de aplicativo no meio, a
 * carta espera por ela (a GSAP e o laço do mundo também param com a aba oculta).
 */
export function espera(ms) {
  return new Promise((resolver) => {
    let resta = Math.max(0, Number(ms) || 0) / fatorRapido;
    let inicio = 0;
    let id = 0;
    const fim = () => {
      document.removeEventListener('visibilitychange', aoMudar);
      resolver();
    };
    const armar = () => {
      inicio = performance.now();
      id = setTimeout(fim, resta);
    };
    const aoMudar = () => {
      clearTimeout(id);
      if (document.hidden) resta = Math.max(0, resta - (performance.now() - inicio));
      else armar();
    };
    document.addEventListener('visibilitychange', aoMudar);
    if (document.hidden) inicio = performance.now();     // começa a contar quando a aba aparecer
    else armar();
  });
}

/** Promise que resolve no próximo quadro de animação. */
export function quadro() {
  return new Promise((resolver) => requestAnimationFrame(resolver));
}

export const clamp = (v, min = 0, max = 1) => Math.min(max, Math.max(min, v));
export const lerp = (a, b, t) => a + (b - a) * t;

/** Leva `v` do intervalo [a, b] para [c, d], preso nas pontas. */
export function mapear(v, a, b, c, d) {
  return c + (d - c) * clamp((v - a) / (b - a));
}

/** Curva em S entre 0 e 1. */
export function suave(t) {
  const x = clamp(t);
  return x * x * (3 - 2 * x);
}

/**
 * Amortecimento exponencial independente da taxa de quadros.
 * `lambda` maior = chega mais rápido (4 é lento e macio, 12 é firme).
 */
export function amortecer(atual, alvo, lambda, dt) {
  return lerp(atual, alvo, 1 - Math.exp(-lambda * dt));
}

/** Número aleatório entre min e max. */
export const aleatorio = (min = 0, max = 1) => min + Math.random() * (max - min);

/** Gerador aleatório com semente (mesma semente = mesma sequência). */
export function semente(s = 1) {
  let a = s >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Atrasa a chamada até `ms` depois do último pedido. */
export function debounce(fn, ms = 150) {
  let id = 0;
  const chamar = (...args) => {
    clearTimeout(id);
    id = setTimeout(() => fn(...args), ms);
  };
  chamar.cancelar = () => clearTimeout(id);
  return chamar;
}

/**
 * Cria um elemento.
 *   el('p', 'frase')                          → <p class="frase">
 *   el('button', { class: 'botao', type: 'button', dataset: { acao: 'x' } }, 'Texto')
 *   el('div', 'caixa', [filho1, filho2])
 * Atributos com valor null/undefined/false são ignorados. Texto entra como texto
 * (nunca como HTML).
 */
export function el(tag, attrs, filhos) {
  const no = document.createElement(tag);
  if (typeof attrs === 'string') {
    if (attrs) no.className = attrs;
  } else if (attrs) {
    for (const [chave, valor] of Object.entries(attrs)) {
      if (valor === null || valor === undefined || valor === false) continue;
      if (chave === 'class') no.className = valor;
      else if (chave === 'dataset') Object.assign(no.dataset, valor);
      else if (chave === 'style' && typeof valor === 'object') Object.assign(no.style, valor);
      else if (chave === 'texto') no.textContent = valor;
      else if (chave.startsWith('on') && typeof valor === 'function') no.addEventListener(chave.slice(2), valor);
      else no.setAttribute(chave, valor === true ? '' : String(valor));
    }
  }
  if (filhos !== undefined && filhos !== null) {
    for (const filho of Array.isArray(filhos) ? filhos : [filhos]) {
      if (filho === null || filho === undefined || filho === false) continue;
      no.append(filho instanceof Node ? filho : document.createTextNode(String(filho)));
    }
  }
  return no;
}

/** Cria um elemento SVG a partir de uma string (para ícones e desenhos pequenos). */
export function svg(marcacao) {
  const molde = document.createElement('template');
  molde.innerHTML = marcacao.trim();
  return molde.content.firstElementChild;
}

/**
 * Carrega uma imagem. Endereço vazio ou falha → null (nunca lança exceção).
 * Endereço vazio nem chega a fazer pedido, então não aparece 404 no console.
 */
export function carregarImagem(endereco) {
  if (typeof endereco !== 'string' || !endereco.trim()) return Promise.resolve(null);
  return new Promise((resolver) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      // decode() evita o engasgo de decodificar no meio de uma animação.
      if (img.decode) img.decode().then(() => resolver(img), () => resolver(img));
      else resolver(img);
    };
    img.onerror = () => resolver(null);
    img.src = endereco;
  });
}

/** Promise que resolve na próxima vez que `evento` acontecer em `alvo`. */
export function umaVez(alvo, evento, opcoes) {
  return new Promise((resolver) => {
    alvo.addEventListener(evento, resolver, { once: true, ...opcoes });
  });
}

/** Converte coordenadas de tela (px) para NDC (−1..1, y para cima). */
export function pxParaNdc(x, y, largura = innerWidth, altura = innerHeight) {
  return { x: (x / largura) * 2 - 1, y: -((y / altura) * 2 - 1) };
}

// ---------------------------------------------------------------------------
// Modo leve (sem WebGL): substitutos simples para Vector3 e Object3D, para as
// cenas poderem escrever `obj.position.set(...)` nos dois modos.
// ---------------------------------------------------------------------------

/** Vetor de mentira: tem x, y, z e os métodos mais usados, todos encadeáveis. */
export function vetorLeve(x = 0, y = 0, z = 0) {
  const v = {
    x, y, z,
    set(nx = 0, ny = 0, nz = 0) { v.x = nx; v.y = ny; v.z = nz; return v; },
    copy(o) { v.x = o.x; v.y = o.y; v.z = o.z ?? 0; return v; },
    clone() { return vetorLeve(v.x, v.y, v.z); },
    add(o) { v.x += o.x; v.y += o.y; v.z += o.z ?? 0; return v; },
    sub(o) { v.x -= o.x; v.y -= o.y; v.z -= o.z ?? 0; return v; },
    multiplyScalar(s) { v.x *= s; v.y *= s; v.z *= s; return v; },
    setScalar(s) { v.x = s; v.y = s; v.z = s; return v; },
    lerp(o, t) { v.x += (o.x - v.x) * t; v.y += (o.y - v.y) * t; v.z += ((o.z ?? 0) - v.z) * t; return v; },
  };
  return v;
}

/** Object3D de mentira: position/rotation/scale, visible e add/remove que não fazem nada. */
export function objetoLeve() {
  return {
    position: vetorLeve(),
    rotation: vetorLeve(),
    scale: vetorLeve(1, 1, 1),
    visible: true,
    add() {}, remove() {}, attach() {}, traverse() {},
  };
}
