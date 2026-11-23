/* ============================================================================
   UTIL: a caixa de ferramentas sem dependências
   ============================================================================
   Tempo: espera(ms) recebe MILISSEGUNDOS (como setTimeout) e respeita o fator
   de ?rapido=N. A GSAP usa segundos; não misture. A espera só conta com a aba
   visível: a GSAP e o laço do mundo também param quando a aba se esconde, e
   assim nenhuma cena "pula" enquanto ela está em outro app.
   ========================================================================== */

let fatorRapido = 1;
let interruptor = null;

const CHAVE_MENU = 'carta2312:menu';
const PARAMETROS_QUE_FICAM = ['rapido', 'nivel', 'webgl', 'reduzido', 'mudo'];

/** Define o fator de ?rapido (0,1 a 60). Chamado uma vez no boot. */
export function configurarTempo(rapido) {
  const v = Number(rapido);
  fatorRapido = Number.isFinite(v) && v > 0 ? Math.min(60, Math.max(0.1, v)) : 1;
}

/** Espera `ms` milissegundos (divididos por ?rapido), congelando com a aba oculta. */
export function espera(ms) {
  return new Promise((resolve) => {
    let resta = Math.max(0, Number(ms) || 0) / fatorRapido;
    let timer = 0;
    let inicio = 0;

    const fim = () => {
      document.removeEventListener('visibilitychange', aoMudar);
      resolve();
    };
    const armar = () => {
      inicio = performance.now();
      timer = setTimeout(fim, resta);
    };
    const aoMudar = () => {
      if (document.hidden) {
        if (timer) {
          clearTimeout(timer);
          timer = 0;
          resta = Math.max(0, resta - (performance.now() - inicio));
        }
      } else if (!timer) {
        armar();
      }
    };

    document.addEventListener('visibilitychange', aoMudar);
    if (!document.hidden) armar();
  });
}

/** Próximo quadro de animação. */
export function quadro() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

export function clamp(v, min = 0, max = 1) {
  return v < min ? min : v > max ? max : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Curva em S (smoothstep) entre 0 e 1. */
export function suave(t) {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

/** Aproximação exponencial: lambda 4 é lento e macio; 12 é firme. */
export function amortecer(atual, alvo, lambda, dt) {
  return lerp(atual, alvo, 1 - Math.exp(-lambda * dt));
}

/** Gerador com semente (mulberry32): mesma semente, mesma sequência. */
export function semente(s = 1) {
  let a = s >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Adia `fn` até `ms` sem novas chamadas. A função devolvida tem `.cancelar()`. */
export function debounce(fn, ms = 150) {
  let timer = 0;
  const saida = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
  saida.cancelar = () => clearTimeout(timer);
  return saida;
}

/**
 * Cria um elemento. `attrs` pode ser uma string (classe) ou um objeto:
 * class → className; dataset → Object.assign(dataset); style (objeto) → Object.assign(style);
 * texto → textContent; onXxx (função) → addEventListener('xxx'); o resto vira atributo
 * (true vira ''). Valores null, undefined e false são pulados. Filhos: nó → append; outro → texto.
 */
export function el(tag, attrs, filhos) {
  const node = document.createElement(tag);
  if (typeof attrs === 'string') {
    if (attrs) node.className = attrs;
  } else if (attrs && typeof attrs === 'object') {
    for (const [chave, valor] of Object.entries(attrs)) {
      if (valor === null || valor === undefined || valor === false) continue;
      if (chave === 'class') node.className = valor;
      else if (chave === 'dataset') Object.assign(node.dataset, valor);
      else if (chave === 'style' && typeof valor === 'object') Object.assign(node.style, valor);
      else if (chave === 'texto') node.textContent = valor;
      else if (chave.startsWith('on') && typeof valor === 'function') node.addEventListener(chave.slice(2).toLowerCase(), valor);
      else node.setAttribute(chave, valor === true ? '' : valor);
    }
  }
  if (filhos !== undefined && filhos !== null) {
    for (const filho of Array.isArray(filhos) ? filhos : [filhos]) {
      if (filho === null || filho === undefined || filho === false) continue;
      node.append(filho instanceof Node ? filho : document.createTextNode(String(filho)));
    }
  }
  return node;
}

/** Cria um elemento SVG a partir da marcação (o primeiro filho de um <template>). */
export function svg(marcacao) {
  const t = document.createElement('template');
  t.innerHTML = String(marcacao).trim();
  return t.content.firstElementChild;
}

/**
 * Pulso tátil curto. No Android, navigator.vibrate. No iPhone não há vibrate:
 * um interruptor (input[switch]) escondido, clicado dentro do gesto dela, dá o
 * toque háptico do Safari 18+. Sem suporte, nada acontece e nada quebra.
 */
export function vibrar(amb) {
  try {
    if (!amb?.ios) {
      navigator.vibrate?.([14, 120, 22]);
      return;
    }
    if (!interruptor) {
      const rotulo = document.createElement('label');
      rotulo.hidden = true;
      rotulo.setAttribute('aria-hidden', 'true');
      interruptor = document.createElement('input');
      interruptor.type = 'checkbox';
      interruptor.setAttribute('switch', '');
      rotulo.append(interruptor);
      document.body.append(rotulo);
    }
    interruptor.click();
    setTimeout(() => interruptor && interruptor.click(), 130);
  } catch {
    /* sem háptico */
  }
}

/**
 * Compila os programas de shader de `objs` antes de eles aparecerem (o three
 * compila na primeira vez que desenha, de forma síncrona: era o engasgo do
 * toque). Devolve depois de todos compilarem ou depois do prazo, o que vier antes.
 */
export function compilarComPrazo(mundo, objs, ms = 1200) {
  if (!mundo?.ok || !mundo.renderer) return Promise.resolve();
  const lista = [objs].flat().filter(Boolean);
  const tarefas = lista.map((o) => {
    const p = typeof o?.then === 'function' ? o : mundo.renderer.compileAsync(o, mundo.camera, mundo.cena);
    return Promise.resolve(p).catch(() => {});
  });
  return Promise.race([Promise.all(tarefas), espera(ms)]);
}

/** Carrega uma imagem; endereço vazio não faz pedido; falha devolve null. */
export function carregarImagem(endereco) {
  if (typeof endereco !== 'string' || !endereco) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      const pronto = () => resolve(img);
      if (typeof img.decode === 'function') img.decode().then(pronto, pronto);
      else pronto();
    };
    img.onerror = () => resolve(null);
    img.src = endereco;
  });
}

/** Pixels de tela → coordenadas normalizadas (−1..1, y para cima). */
export function pxParaNdc(x, y, largura = innerWidth, altura = innerHeight) {
  return { x: (x / largura) * 2 - 1, y: -((y / altura) * 2 - 1) };
}

/** Substituto leve de Vector3 para o modo sem WebGL. */
export function vetorLeve(x = 0, y = 0, z = 0) {
  const v = {
    x, y, z,
    set(nx, ny, nz = 0) { v.x = nx; v.y = ny; v.z = nz; return v; },
    copy(o) { v.x = o.x; v.y = o.y; v.z = o.z ?? 0; return v; },
    add(o) { v.x += o.x; v.y += o.y; v.z += o.z ?? 0; return v; },
    sub(o) { v.x -= o.x; v.y -= o.y; v.z -= o.z ?? 0; return v; },
    multiplyScalar(k) { v.x *= k; v.y *= k; v.z *= k; return v; },
    setScalar(k) { v.x = k; v.y = k; v.z = k; return v; },
    lerp(o, t) { v.x = lerp(v.x, o.x, t); v.y = lerp(v.y, o.y, t); v.z = lerp(v.z, o.z ?? 0, t); return v; },
    clone() { return vetorLeve(v.x, v.y, v.z); },
  };
  return v;
}

/** Substituto leve de Object3D para o modo sem WebGL. */
export function objetoLeve() {
  return {
    position: vetorLeve(),
    rotation: vetorLeve(),
    scale: vetorLeve(1, 1, 1),
    visible: true,
    add() {},
    remove() {},
    attach() {},
    traverse() {},
  };
}

/** A marca do menu no aparelho dela: ela já chegou ao fim uma vez. */
export function menuLembrado() {
  try {
    return localStorage.getItem(CHAVE_MENU) === '1';
  } catch {
    return false;
  }
}

export function lembrarMenu(sim = true) {
  try {
    if (sim) localStorage.setItem(CHAVE_MENU, '1');
    else localStorage.removeItem(CHAVE_MENU);
  } catch {
    /* aba anônima ou armazenamento cheio: segue sem marca */
  }
}

/**
 * Endereço de uma parte da carta: ?cena=, a faixa que toca (ou a do endereço)
 * e os parâmetros de teste que ficam. `extra` entra por último e tem a última palavra.
 */
export function enderecoDaCena(cena, extra = {}, som = null) {
  const atual = new URLSearchParams(location.search);
  const params = new URLSearchParams();
  params.set('cena', cena);
  const indice = som?.estado?.indice;
  if (Number.isInteger(indice) && indice >= 0) params.set('musica', String(indice));
  else if (atual.get('musica')) params.set('musica', atual.get('musica'));
  for (const nome of PARAMETROS_QUE_FICAM) {
    if (atual.has(nome)) params.set(nome, atual.get(nome));
  }
  for (const [chave, valor] of Object.entries(extra || {})) {
    if (valor === null || valor === undefined) params.delete(chave);
    else params.set(chave, String(valor));
  }
  return `${location.pathname}?${params.toString()}`;
}
