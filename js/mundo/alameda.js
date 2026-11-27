/* ============================================================================
   ALAMEDA: o corredor de cerejeiras à noite, aceso por lanternas de papel
   ============================================================================
   Nenhum arquivo de modelo nem de imagem: as texturas (ruído fbm e Voronoi,
   atlas de flores pintado num canvas), as árvores (tubos recursivos e cartões
   de flor instanciados), o salgueiro, o capim, as sebes, o chão com caminho e
   lago, o céu estrelado, as pétalas no ar, o cometa e as lanternas: baixas
   em postes dos dois lados do caminho e em fieiras penduradas de copa a copa.

   O corredor é infinito para a frente: árvores, lanternas, sebes e capim
   moram em "vagas" pelo índice; só as vagas perto da câmera existem, e a
   névoa esconde onde elas nascem. A mesma árvore volta sempre no mesmo lugar.
   Sem luz real, sem shadow map e sem pós-processamento: a luz é a da hora
   (uLuz) somada à das lanternas, que o shader calcula pela posição analítica
   delas (periódica ao longo do caminho, as duas vizinhas de cada fila). A
   chama tem halo em sprite e a sombra de contato é falsa.

   As lanternas se acendem de perto para longe: a frente de luz fica a
   uLanternas × 62 m da câmera (o valor `lanternas` da hora), então a luz vai
   sempre na frente dela. Cada chama respira devagar (3,6 a 5,5 s, ±10%).

   Passo de base: a alameda fica parada e a câmera anda. Os shaders trabalham
   em coordenadas da alameda (camA, viewA), que descontam `deriva` (o passeio
   contínuo de mundo.js).

   criarAlameda(mundo) → { grupo, pronta, surgir, atualizar, aplicarHora,
   nivel, afastar, uniformes, centro }. mundo.js chama atualizar(dt, t, deriva)
   a cada quadro, antes do render.
   ========================================================================== */

import { clamp, lerp, suave, semente, espera } from '../nucleo/util.js';
import { pintarCometa } from './hora.js';

/* ---- lugar ------------------------------------------------------------------ */

const MEIA_PISTA = 1.75; // o caminho tem 3,5 m
const ESP_ARVORE = 4.6; // entre cerejeiras do mesmo lado
const ESP_SEBE = 2.6;
const ESP_CAPIM = 2.3;
const LAGO = 5.1; // margem do lago, a partir do meio do caminho
const ATRAS = 9; // vagas até 9 m atrás da câmera
const ALCANCE = { alto: 46, medio: 42, baixo: 34 }; // metros à frente
const CARTOES = { alto: 1000, medio: 800, baixo: 520 }; // cartões de flor por árvore
const PETALAS = { alto: 220, medio: 160, baixo: 80 };
const PETALAS_CALMAS = 60;
const VARIANTES = 3;
const SALGUEIRO_A_CADA = 38;
const ATLAS = { colunas: 4, linhas: 2 };
const LAD = { massas: [0, 1, 2], cachos: [3, 4, 7], salgueiro: 5, capim: 6 };

// As lanternas baixas: cada lado tem uma a cada 4,6 m, no meio entre as
// cerejeiras do mesmo lado (a da esquerda deslocada meio vão). As fieiras
// atravessam o caminho a cada 9,2 m. Os shaders refazem estas contas para
// achar a luz: mudar aqui muda lá (os números entram no GLSL).
const ESP_LANTERNA = ESP_ARVORE;
const LADO_LANTERNA = MEIA_PISTA + 0.22;
const ALT_LANTERNA = 0.86; // o meio do papel
const ESP_FIEIRA = 2 * ESP_ARVORE;
const DESLOC_FIEIRA = 3.4;
const ALT_FIEIRA = 2.95; // a altura média das penduradas, para a luz
const MEIA_FIEIRA = 1.7; // as penduradas vão de −1,7 a 1,7 m do meio

// Cores em sRGB, sem conversão no shader. A hora azul (as outras estão em hora.js).
const NEVOA = [0.27, 0.25, 0.47];
const CEU = [0.075, 0.105, 0.27];
const NOITE = [0.043, 0.063, 0.149]; // --noite (#0b1026): a alameda surge dela

// Limites de instância. MAX_ARVORES, MAX_LANTERNAS, os 12 vizinhos do chão e
// o laço de 12 do FRAG_CHAO precisam combinar com ALCANCE e ATRAS.
const MAX_ARVORES = 2 * Math.ceil((ATRAS + ALCANCE.alto) / ESP_ARVORE + 2); // 28 por variante
const MAX_LANTERNAS = 2 * Math.ceil((ATRAS + ALCANCE.alto) / ESP_LANTERNA + 2); // 28
const MAX_FIEIRAS = Math.ceil((ATRAS + ALCANCE.alto) / ESP_FIEIRA + 2); // 8
const MAX_SEBES = 48;
const MAX_CAPIM = 40;
const MAX_SALGUEIROS = 3;
const VIZINHAS = 12;

// Galhos por nível: segmentos, lados do tubo (0 = sem tubo), torção do plano
// do zigue-zague, arco (sobe no começo e abre na ponta) e zigue-zague.
const GALHO = {
  1: { segs: 7, lados: 8, torcao: 0.22, arco: 0.5, zig: 0.12, flex: 0.3 },
  2: { segs: 5, lados: 6, torcao: 0.3, arco: 0.35, zig: 0.16, flex: 0.3 },
  3: { segs: 4, lados: 0, torcao: 0.35, arco: 0.25, zig: 0.2, flex: 0.35 },
};

/* ---- funções de lugar ------------------------------------------------------- */

/** x do meio do caminho em z (coordenadas da alameda). */
function centroCaminho(z) {
  const u = -z;
  return 0.45 * Math.sin(0.12 * u) + 0.18 * Math.sin(0.047 * u);
}

/** Hash de vaga em [0, 1): a mesma vaga devolve sempre o mesmo número. */
function h(k, lado, sal) {
  const v = Math.sin(k * 12.9898 + lado * 78.233 + sal * 37.719) * 43758.5453;
  return v - Math.floor(v);
}

/** Altura mínima do galho: sobre o caminho os galhos passam de 3,3 m. */
function teto(x) {
  return 3.3 * suave((x - 0.9) / 1.3);
}

/* ---- texturas ---------------------------------------------------------------- */

/**
 * Ruído 256² em ladrilho. R: fbm de 5 oitavas, base 4. G: fbm, base 8.
 * B: id da célula de Voronoi (32 × 32). A: distância até a borda da célula.
 */
function texturaRuido(THREE, anisotropia) {
  const N = 256;
  const dados = new Uint8Array(N * N * 4);
  const oitavas = (base, s0) => Array.from({ length: 5 }, (_, o) => {
    const f = base << o;
    const r = semente(s0 + 7 * o);
    const g = new Float32Array(f * f);
    for (let i = 0; i < g.length; i++) g[i] = r();
    return { f, g, amp: 0.5 / (1 << o) };
  });
  const valor = (g, f, x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const tx = suave(x - xi);
    const ty = suave(y - yi);
    const x0 = xi % f;
    const y0 = yi % f;
    const x1 = (x0 + 1) % f;
    const y1 = (y0 + 1) % f;
    return lerp(lerp(g[y0 * f + x0], g[y0 * f + x1], tx), lerp(g[y1 * f + x0], g[y1 * f + x1], tx), ty);
  };
  const fbm = (lista, u, v) => {
    let soma = 0;
    let total = 0;
    for (const { f, g, amp } of lista) {
      soma += valor(g, f, u * f, v * f) * amp;
      total += amp;
    }
    return soma / total;
  };
  const contraste = (v) => clamp((v - 0.5) * 1.9 + 0.5);
  const R = oitavas(4, 11);
  const G = oitavas(8, 53);

  const C = 32;
  const rv = semente(97);
  const celulas = new Float32Array(C * C * 3);
  for (let i = 0; i < celulas.length; i++) celulas[i] = rv();

  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const u = x / N;
      const v = y / N;
      const px = u * C;
      const py = v * C;
      const cx = Math.floor(px);
      const cy = Math.floor(py);
      let d1 = 9;
      let d2 = 9;
      let id = 0;
      for (let j = -1; j <= 1; j++) {
        for (let i = -1; i <= 1; i++) {
          const gx = cx + i;
          const gy = cy + j;
          const k = ((((gy % C) + C) % C) * C + (((gx % C) + C) % C)) * 3;
          const d = Math.hypot(gx + celulas[k] - px, gy + celulas[k + 1] - py);
          if (d < d1) {
            d2 = d1;
            d1 = d;
            id = celulas[k + 2];
          } else if (d < d2) {
            d2 = d;
          }
        }
      }
      const o = (y * N + x) * 4;
      dados[o] = Math.round(contraste(fbm(R, u, v)) * 255);
      dados[o + 1] = Math.round(contraste(fbm(G, u, v)) * 255);
      dados[o + 2] = Math.round(id * 255);
      dados[o + 3] = Math.round(clamp((d2 - d1) * 1.6) * 255);
    }
  }

  const tex = new THREE.DataTexture(dados, N, N, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = Math.min(8, anisotropia);
  tex.needsUpdate = true;
  return tex;
}

/**
 * Atlas de flores 2048 × 1024: 4 × 2 ladrilhos de 512 px, desenhados em
 * coordenadas de 256. A ordem das chamadas ao gerador é o atlas: mudar a
 * ordem muda tudo. Ladrilhos 0–2: massas de flor; 3, 4: cachos; 7: raminho;
 * 5: salgueiro; 6: capim (os dois últimos em cinza, tingidos pelo cartão).
 */
function texturaFlores(THREE) {
  const L = 512;
  const tela = document.createElement('canvas');
  tela.width = L * ATLAS.colunas;
  tela.height = L * ATLAS.linhas;
  const c = tela.getContext('2d');
  const r = semente(2312);
  const U = (a, b) => a + (b - a) * r();
  const tinta = (cor, k = 1, a = 1) => `rgba(${Math.round(cor[0] * k)}, ${Math.round(cor[1] * k)}, ${Math.round(cor[2] * k)}, ${a})`;
  const DOIS_PI = Math.PI * 2;

  // Uma flor de cinco pétalas com o entalhe na ponta, estames e miolo.
  const flor = (x, y, raio, tom, achat, giro) => {
    c.save();
    c.translate(x, y);
    c.rotate(giro);
    c.scale(1, achat);
    for (let i = 0; i < 5; i++) {
      const R = raio * U(0.88, 1.1);
      c.save();
      c.rotate((i / 5) * DOIS_PI + U(-0.15, 0.15));
      const g = c.createRadialGradient(0, 0, 0, 0, 0, R);
      g.addColorStop(0, tinta([228, 140, 172], tom));
      g.addColorStop(0.45, tinta([244, 198, 215], tom));
      g.addColorStop(1, tinta([253, 238, 243], tom));
      c.beginPath();
      c.moveTo(0, 0);
      c.bezierCurveTo(-0.5 * R, -0.18 * R, -0.66 * R, -0.8 * R, -0.18 * R, -R);
      c.lineTo(0, -0.84 * R);
      c.lineTo(0.18 * R, -R);
      c.bezierCurveTo(0.66 * R, -0.8 * R, 0.5 * R, -0.18 * R, 0, 0);
      c.fillStyle = g;
      c.fill();
      c.lineWidth = 0.5;
      c.strokeStyle = tinta([196, 112, 146], tom, 0.35);
      c.stroke();
      c.restore();
    }
    c.lineWidth = 0.45;
    for (let i = 0; i < 9; i++) {
      const a = r() * DOIS_PI;
      const d = raio * U(0.22, 0.42);
      const ex = Math.cos(a) * d;
      const ey = Math.sin(a) * d;
      c.strokeStyle = tinta([206, 110, 142], tom);
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(ex, ey);
      c.stroke();
      c.fillStyle = tinta(r() < 0.5 ? [236, 196, 120] : [226, 140, 168], tom);
      c.beginPath();
      c.arc(ex, ey, 0.75, 0, DOIS_PI);
      c.fill();
    }
    c.fillStyle = tinta([206, 118, 148], tom);
    c.beginPath();
    c.arc(0, 0, raio * 0.1, 0, DOIS_PI);
    c.fill();
    c.restore();
  };

  const botao = (x, y, raio, tom, giro) => {
    c.save();
    c.translate(x, y);
    c.rotate(giro);
    c.fillStyle = tinta([214, 108, 146], tom);
    c.beginPath();
    c.ellipse(0, 0, raio * 0.55, raio, 0, 0, DOIS_PI);
    c.fill();
    c.fillStyle = 'rgba(250, 205, 222, 0.7)';
    c.beginPath();
    c.ellipse(-raio * 0.14, -raio * 0.28, raio * 0.2, raio * 0.48, 0, 0, DOIS_PI);
    c.fill();
    c.restore();
  };

  // Cachos: cada centro dá `porCacho` flores penduradas num pedúnculo comum.
  const cachos = (centros, porCacho, raioFlor, espalha) => {
    const flores = [];
    for (const [cx, cy] of centros) {
      const ox = cx + U(-2, 2);
      const oy = cy - espalha * 0.35;
      for (let i = 0; i < porCacho; i++) {
        const a = r() * DOIS_PI;
        const d = espalha * Math.sqrt(r());
        flores.push({
          x: cx + Math.cos(a) * d,
          y: cy + Math.sin(a) * d * 0.8 + espalha * 0.15,
          z: r(),
          achat: 0.45 + 0.55 * r(),
          giro: r() * DOIS_PI,
          botao: r() < 0.12,
          ox,
          oy,
          curva: U(-2, 2),
        });
      }
    }
    c.lineCap = 'round';
    c.strokeStyle = tinta([104, 60, 58]);
    c.lineWidth = raioFlor * 0.075;
    for (const f of flores) {
      c.beginPath();
      c.moveTo(f.ox, f.oy);
      c.quadraticCurveTo((f.ox + f.x) / 2 + f.curva, (f.oy + f.y) / 2, f.x, f.y);
      c.stroke();
    }
    flores.sort((a, b) => a.z - b.z);
    for (const f of flores) {
      const tom = 0.72 + 0.28 * f.z;
      if (f.botao) botao(f.x, f.y, raioFlor * 0.55, tom, f.giro);
      else flor(f.x, f.y, raioFlor, tom, f.achat, f.giro);
    }
  };

  const espalhados = (n, raio) => Array.from({ length: n }, () => {
    const a = r() * DOIS_PI;
    const d = raio * Math.sqrt(r());
    return [128 + Math.cos(a) * d, 128 + Math.sin(a) * d * 0.85];
  });
  const massa = (n, raio) => cachos(espalhados(n, raio), 4, 9.5, 15);

  const raminho = () => {
    const pts = [];
    let x = 34;
    let y = 222;
    for (let i = 0; i < 7; i++) {
      pts.push([x, y]);
      x += U(22, 32);
      y -= U(22, 34);
    }
    c.lineCap = 'round';
    c.strokeStyle = tinta([70, 50, 48]);
    for (let i = 1; i < pts.length; i++) {
      c.lineWidth = lerp(5, 1.6, i / (pts.length - 1));
      c.beginPath();
      c.moveTo(pts[i - 1][0], pts[i - 1][1]);
      c.lineTo(pts[i][0], pts[i][1]);
      c.stroke();
    }
    cachos(pts.slice(2), 3, 10.5, 13);
  };

  const salgueiro = () => {
    for (let i = 0; i < 9; i++) {
      const x0 = 16 + i * 28 + U(-6, 6);
      const comp = U(190, 252);
      const curva = U(-14, 14);
      const cinza = Math.round(U(170, 249));
      const xEm = (t) => x0 + curva * 2 * t * (1 - t) + curva * 0.4 * t * t;
      c.strokeStyle = tinta([cinza, cinza, cinza]);
      c.lineWidth = 1.1;
      c.beginPath();
      c.moveTo(x0, 2);
      c.quadraticCurveTo(x0 + curva, comp / 2, x0 + curva * 0.4, comp);
      c.stroke();
      let lado = 1;
      for (let y = 8; y < comp; y += U(6, 10)) {
        const g = Math.round(U(170, 249));
        c.fillStyle = tinta([g, g, g]);
        c.beginPath();
        c.ellipse(xEm(y / comp) + lado * 2.5, y, 2.2, 7.5, lado * 0.5, 0, DOIS_PI);
        c.fill();
        lado = -lado;
      }
    }
  };

  const capim = () => {
    for (let i = 0; i < 26; i++) {
      const x = U(20, 236);
      const H = U(150, 250);
      const w = U(3, 6);
      const inclina = U(-30, 30);
      const g = Math.round(U(140, 254));
      c.fillStyle = tinta([g, g, g]);
      c.beginPath();
      c.moveTo(x - w / 2, 256);
      c.quadraticCurveTo(x + inclina * 0.3, 256 - H * 0.6, x + inclina, 256 - H);
      c.quadraticCurveTo(x + inclina * 0.3 + w * 0.3, 256 - H * 0.55, x + w / 2, 256);
      c.fill();
    }
  };

  // Cada ladrilho é recortado para nada vazar para o vizinho (nem nos mipmaps).
  const ladrilho = (i, desenhar) => {
    c.setTransform(2, 0, 0, 2, (i % ATLAS.colunas) * L, Math.floor(i / ATLAS.colunas) * L);
    c.save();
    c.beginPath();
    c.rect(2, 2, 252, 252);
    c.clip();
    desenhar();
    c.restore();
  };
  ladrilho(0, () => massa(26, 82));
  ladrilho(1, () => massa(22, 76));
  ladrilho(2, () => massa(30, 88));
  ladrilho(3, () => cachos(espalhados(4, 50), 5, 12, 21));
  ladrilho(4, () => cachos(espalhados(3, 44), 6, 13, 22));
  ladrilho(7, raminho);
  ladrilho(5, salgueiro);
  ladrilho(6, capim);
  c.setTransform(1, 0, 0, 1, 0, 0);

  // Pré-multiplicado na subida: os mipmaps não ganham franja escura nem branca.
  // Sem colorSpace: os shaders da alameda trabalham em sRGB direto.
  const tex = new THREE.CanvasTexture(tela);
  tex.premultiplyAlpha = true;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

/* ---- geometrias: tubos ------------------------------------------------------- */

function novosTubos() {
  return { pos: [], nor: [], uv: [], flex: [], ao: [], idx: [], n: 0 };
}

/**
 * Um tubo ao longo de uma polilinha, com referencial de transporte paralelo
 * (não torce). `rugas` enruga a casca no sentido do comprimento.
 */
function tubo(THREE, pontos, raios, lados, flex, ao, saida, rugas, fase) {
  const n = pontos.length;
  if (n < 2 || lados < 3) return;
  const T = new THREE.Vector3();
  const N = new THREE.Vector3();
  const B = new THREE.Vector3();
  T.subVectors(pontos[1], pontos[0]).normalize();
  N.set(0, 1, 0);
  if (Math.abs(T.y) > 0.9) N.set(1, 0, 0);
  // Voltas inteiras da textura em volta do tubo: o ruído é periódico, sem costura.
  const voltas = Math.max(1, Math.round((2 * Math.PI * raios[0]) / 0.6));
  const base = saida.n;
  let comp = 0;
  for (let i = 0; i < n; i++) {
    if (i > 0) comp += pontos[i].distanceTo(pontos[i - 1]);
    T.subVectors(pontos[Math.min(n - 1, i + 1)], pontos[Math.max(0, i - 1)]).normalize();
    N.addScaledVector(T, -N.dot(T)).normalize();
    B.crossVectors(T, N);
    for (let j = 0; j <= lados; j++) {
      const ang = (j / lados) * Math.PI * 2;
      const cs = Math.cos(ang);
      const sn = Math.sin(ang);
      const rx = N.x * cs + B.x * sn;
      const ry = N.y * cs + B.y * sn;
      const rz = N.z * cs + B.z * sn;
      const ruga = 1 + rugas * (0.6 * Math.sin(ang * 5 + fase + comp * 0.9) + 0.4 * Math.sin(ang * 11 + fase * 2.3 - comp * 1.3));
      const rr = raios[i] * ruga;
      saida.pos.push(pontos[i].x + rx * rr, pontos[i].y + ry * rr, pontos[i].z + rz * rr);
      saida.nor.push(rx, ry, rz);
      saida.uv.push((j / lados) * voltas, comp / 0.6);
      saida.flex.push(flex[i]);
      saida.ao.push(ao[i]);
    }
  }
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < lados; j++) {
      const a = base + i * (lados + 1) + j;
      const b = a + lados + 1;
      saida.idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  saida.n += n * (lados + 1);
}

/** Catmull-Rom com `sub` pontos por trecho; as listas auxiliares vão por lerp. */
function suavizar(THREE, pts, listas, sub) {
  const pontos = [];
  const extras = listas.map(() => []);
  const ultimo = pts.length - 1;
  for (let i = 0; i < ultimo; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(ultimo, i + 2)];
    for (let k = 0; k < sub; k++) {
      const t = k / sub;
      const t2 = t * t;
      const t3 = t2 * t;
      const cr = (a, b, c, d) => 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (3 * b - a - 3 * c + d) * t3);
      pontos.push(new THREE.Vector3(cr(p0.x, p1.x, p2.x, p3.x), cr(p0.y, p1.y, p2.y, p3.y), cr(p0.z, p1.z, p2.z, p3.z)));
      listas.forEach((l, j) => extras[j].push(lerp(l[i], l[i + 1], t)));
    }
  }
  pontos.push(pts[ultimo].clone());
  listas.forEach((l, j) => extras[j].push(l[ultimo]));
  return { pontos, listas: extras };
}

function geometriaDeTubos(THREE, s) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(s.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(s.nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(s.uv, 2));
  g.setAttribute('aFlex', new THREE.Float32BufferAttribute(s.flex, 1));
  g.setAttribute('aAo', new THREE.Float32BufferAttribute(s.ao, 1));
  g.setIndex(s.idx);
  return g;
}

/* ---- geometrias: cartões ------------------------------------------------------ */

function novosCartoes(s) {
  return { r: semente(s * 7 + 3), pos: [], uv: [], centro: [], nor: [], cor: [], dados: [], canto: [], idx: [], n: 0 };
}

/**
 * Um cartão: quad de 4 vértices no ladrilho do atlas. aDados = (ao, flex,
 * semente, virar): `virar` é quanto ele se vira para a câmera; aCanto é o
 * canto já girado ao acaso, para a parte que se vira. Embaixo usa flexBaixo,
 * em cima flexCima. fracU < 1 mostra só uma faixa do ladrilho.
 */
function cartao(o, c, l, a, ex, ey, ladrilho, cor, ao, flexBaixo, flexCima, virar, fracU = 1) {
  const du = 1 / ATLAS.colunas;
  const dv = 1 / ATLAS.linhas;
  const col = ladrilho % ATLAS.colunas;
  const lin = Math.floor(ladrilho / ATLAS.colunas);
  const margem = 1 / 2048;
  const larg = du * fracU;
  const u0 = col * du + (du - larg) * o.r() + margem;
  const u1 = u0 + larg - 2 * margem;
  const v1 = 1 - lin * dv - margem; // o canvas sobe com flipY: a linha 0 fica em cima
  const v0 = 1 - (lin + 1) * dv + margem;
  const nx = ex.y * ey.z - ex.z * ey.y;
  const ny = ex.z * ey.x - ex.x * ey.z;
  const nz = ex.x * ey.y - ex.y * ey.x;
  const sem = o.r();
  const giro = virar > 0 ? o.r() * Math.PI * 2 : 0;
  const cs = Math.cos(giro);
  const sn = Math.sin(giro);
  const base = o.n;
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const hx = (sx * l) / 2;
    const hy = (sy * a) / 2;
    o.pos.push(c.x + ex.x * hx + ey.x * hy, c.y + ex.y * hx + ey.y * hy, c.z + ex.z * hx + ey.z * hy);
    o.uv.push(sx < 0 ? u0 : u1, sy < 0 ? v0 : v1);
    o.centro.push(c.x, c.y, c.z);
    o.nor.push(nx, ny, nz);
    o.cor.push(cor[0], cor[1], cor[2]);
    o.dados.push(ao, sy < 0 ? flexBaixo : flexCima, sem, virar);
    o.canto.push(hx * cs - hy * sn, hx * sn + hy * cs);
  }
  o.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  o.n += 4;
}

function geometriaDeCartoes(THREE, o) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(o.pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(o.uv, 2));
  g.setAttribute('aCentro', new THREE.Float32BufferAttribute(o.centro, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(o.nor, 3));
  g.setAttribute('aCor', new THREE.Float32BufferAttribute(o.cor, 3));
  g.setAttribute('aDados', new THREE.Float32BufferAttribute(o.dados, 4));
  g.setAttribute('aCanto', new THREE.Float32BufferAttribute(o.canto, 2));
  g.setIndex(o.idx);
  return g;
}

/* ---- as árvores ---------------------------------------------------------------- */

/**
 * Uma cerejeira: tronco inclinado para o caminho (+x), 3 ou 4 pernadas (a
 * primeira, a mais longa, cruza o caminho) e galhos recursivos até o nível 3.
 * Os pontos dos galhos viram nós de flor; os cartões da copa se espalham
 * pelos nós conforme o peso.
 */
function gerarCerejeira(THREE, s, nCartoes) {
  const r = semente(s);
  const U = (a, b) => a + (b - a) * r();
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const tubos = novosTubos();
  const nos = [];

  function galho(p0, dir0, comp, r0, r1, nivel, flex0, peso) {
    const { segs, lados, torcao, arco, zig, flex } = GALHO[nivel];
    const dir = dir0.clone().normalize();
    const lateral = V(r() - 0.5, r() - 0.5, r() - 0.5).cross(dir);
    if (lateral.lengthSq() < 1e-6) lateral.set(0, 0, 1);
    lateral.normalize();
    const pts = [p0.clone()];
    const raios = [r0];
    const flexs = [flex0];
    for (let i = 1; i <= segs; i++) {
      const t = i / segs;
      lateral.applyAxisAngle(dir, torcao * U(0.5, 1.5));
      dir.addScaledVector(lateral, zig * (i % 2 ? 1 : -1) * U(0.6, 1.2));
      dir.y += arco * (0.3 - t) * 0.35;
      dir.normalize();
      lateral.addScaledVector(dir, -lateral.dot(dir)).normalize();
      const p = pts[i - 1].clone().addScaledVector(dir, (comp / segs) * U(0.8, 1.2));
      p.y = Math.max(p.y, teto(p.x), 0.4);
      pts.push(p);
      let rr = lerp(r0, r1, Math.pow(t, 0.7)) * U(0.94, 1.06);
      if (nivel <= 2 && r() < 0.22) rr *= U(1.15, 1.32);
      if (i === segs) rr *= 0.4;
      raios.push(rr);
      flexs.push(flex0 + t * flex);
    }
    if (lados) {
      const ao = pts.map((p) => clamp(0.45 + p.y * 0.08));
      const sv = suavizar(THREE, pts, [raios, flexs, ao], 3);
      tubo(THREE, sv.pontos, sv.listas[0], lados, sv.listas[1], sv.listas[2], tubos, nivel === 1 ? 0.07 : 0.03, r() * 6.28);
    }
    const curto = nivel === 1 && comp < 2.2;
    for (let i = 1; i <= segs; i++) {
      const t = i / segs;
      let w = 1;
      if (nivel === 1 && !curto) {
        if (t < 0.3) continue;
        w = i === segs ? 2.5 : 0.9;
      }
      if (nivel === 3) w *= 1.4;
      nos.push({ p: pts[i], peso: w * peso, flex: flexs[i], t });
    }
    if (nivel >= 3) return;
    const filhos = nivel === 1 ? (r() < 0.5 ? 5 : 6) : (r() < 0.5 ? 2 : 3);
    for (let j = 0; j < filhos; j++) {
      const t = U(0.3, 1);
      const idx = t * segs;
      const i0 = Math.min(segs - 1, Math.floor(idx));
      const f = idx - i0;
      const base = pts[i0].clone().lerp(pts[i0 + 1], f);
      const rb = lerp(raios[i0], raios[i0 + 1], f);
      const fx = lerp(flexs[i0], flexs[i0 + 1], f);
      const pai = pts[i0 + 1].clone().sub(pts[i0]).normalize();
      const eixo = V(r() - 0.5, r() - 0.5, r() - 0.5).cross(pai);
      if (eixo.lengthSq() < 1e-6) eixo.set(0, 1, 0);
      const d = pai.clone().applyAxisAngle(eixo.normalize(), U(0.45, 0.95));
      d.y += 0.25;
      const compF = comp * (nivel === 1 ? U(0.3, 0.45) : U(0.35, 0.55));
      galho(base, d, compF, rb * 0.62, rb * 0.25, nivel + 1, fx, peso);
    }
  }

  // Tronco: inclinado, levemente torto, com o pé alargado e um domo no alto.
  const incl = U(0.12, 0.34);
  const giro = U(-0.35, 0.35);
  const altura = U(1.6, 2.3);
  const raio = U(0.2, 0.27);
  const eixo = V(Math.sin(incl) * Math.cos(giro), Math.cos(incl), Math.sin(incl) * Math.sin(giro));
  const torto = V(U(-0.06, 0.06), 0, U(-0.06, 0.06));
  const pts = [];
  const raios = [];
  const flexs = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    const p = eixo.clone().multiplyScalar(altura * t).addScaledVector(torto, Math.sin(t * Math.PI));
    if (i === 0) p.y = -0.1;
    pts.push(p);
    raios.push(lerp(1.15 * raio, 0.82 * raio, t) * U(0.93, 1.07) * (i === 0 ? 1.6 : 1));
    flexs.push(t * 0.04);
  }
  const topo = pts[6];
  const rTopo = raios[6];
  pts.push(topo.clone().addScaledVector(eixo, 0.55 * raio * 0.6), topo.clone().addScaledVector(eixo, 0.55 * raio));
  raios.push(rTopo * 0.7, rTopo * 0.15);
  flexs.push(0.04, 0.04);
  const aoTronco = pts.map((p) => clamp(0.5 + p.y * 0.12));
  const sv = suavizar(THREE, pts, [raios, flexs, aoTronco], 3);
  tubo(THREE, sv.pontos, sv.listas[0], 12, sv.listas[1], sv.listas[2], tubos, 0.13, r() * 6.28);

  const nPernadas = r() < 0.5 ? 3 : 4;
  for (let i = 0; i < nPernadas; i++) {
    const az = i === 0 ? U(-0.35, 0.35) : (i / nPernadas) * Math.PI * 2 + U(-0.4, 0.4);
    const el = i === 0 ? U(0.72, 0.92) : U(0.6, 1.05);
    const comp = i === 0 ? U(3.7, 4.4) : U(2.6, 3.6);
    const dir = V(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az));
    galho(topo.clone().addScaledVector(eixo, -U(0, 0.25)), dir, comp, 0.62 * raio, 0.16 * raio, 1, 0.04, i === 0 ? 1.7 : 1);
  }

  // Cartões da copa, sorteados pelo peso dos nós. A ordem é aleatória, então
  // cortar o fim (drawRange do nível) tira uma amostra uniforme.
  let somaPeso = 0;
  let cx = 0;
  let cz = 0;
  let ymin = Infinity;
  let ymax = -Infinity;
  const acumulado = nos.map((no) => {
    somaPeso += no.peso;
    cx += no.p.x;
    cz += no.p.z;
    ymin = Math.min(ymin, no.p.y);
    ymax = Math.max(ymax, no.p.y);
    return somaPeso;
  });
  cx /= nos.length;
  cz /= nos.length;
  const foraMax = Math.max(1e-3, ...nos.map((no) => Math.hypot(no.p.x - cx, no.p.z - cz)));
  const cartoes = novosCartoes(s);
  const rc = cartoes.r;
  const g = () => (rc() + rc() + rc() - 1.5) * 0.8;
  for (let i = 0; i < nCartoes; i++) {
    const alvo = rc() * somaPeso;
    let lo = 0;
    let hi = acumulado.length - 1;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (acumulado[m] < alvo) lo = m + 1;
      else hi = m;
    }
    const no = nos[lo];
    const c = V(no.p.x + g() * 0.5, no.p.y + g() * 0.32 + 0.12, no.p.z + g() * 0.5);
    c.y = Math.max(c.y, 2.0 + 0.3 * rc(), teto(c.x) - 0.25);
    const ehMassa = rc() < 0.6;
    const tam = ehMassa ? lerp(0.56, 0.84, rc()) : lerp(0.3, 0.42, rc());
    const lad = ehMassa ? LAD.massas[Math.floor(rc() * 3)] : LAD.cachos[Math.floor(rc() * 3)];
    const n = V(rc() - 0.5, 0.8 * rc(), rc() - 0.5).add(V(c.x - cx, 0, c.z - cz).multiplyScalar(0.12)).normalize();
    const ex = V(-n.z, 0, n.x);
    if (ex.lengthSq() < 1e-6) ex.set(1, 0, 0);
    ex.normalize();
    const ey = V().crossVectors(ex, n).normalize(); // "cima" do cartão para o alto
    const v = Math.pow(rc(), 1.3);
    const cor = [lerp(1.0, 0.98, v), lerp(0.92, 0.7, v), lerp(0.95, 0.82, v)];
    const alto = (c.y - ymin) / Math.max(1e-3, ymax - ymin);
    const fora = Math.hypot(c.x - cx, c.z - cz) / foraMax;
    const ao = clamp(0.06 + 0.5 * clamp(alto) + 0.22 * clamp(fora) + 0.26 * no.t + (rc() - 0.5) * 0.14);
    cartao(cartoes, c, tam, tam, ex, ey, lad, cor, ao, no.flex + 0.35, no.flex + 0.45, 0.72);
  }

  return { tronco: geometriaDeTubos(THREE, tubos), copa: geometriaDeCartoes(THREE, cartoes) };
}

/** O salgueiro: tronco curto, seis ramos que se abrem e caem, 420 fios pendentes. */
function gerarSalgueiro(THREE, s) {
  const r = semente(s);
  const U = (a, b) => a + (b - a) * r();
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const tubos = novosTubos();
  const cartoes = novosCartoes(s);

  const pts = [V(0, -0.1, 0), V(0.1, 1.1, 0.05), V(0.05, 2.2, -0.08), V(0.12, 3.2, 0)];
  const sv = suavizar(THREE, pts, [[0.36, 0.3, 0.25, 0.2], [0, 0.01, 0.03, 0.05], [0.5, 0.6, 0.7, 0.8]], 4);
  tubo(THREE, sv.pontos, sv.listas[0], 10, sv.listas[1], sv.listas[2], tubos, 0.1, r() * 6.28);

  const pontas = [];
  for (let i = 0; i < 6; i++) {
    const az = (i / 6) * Math.PI * 2 + U(-0.3, 0.3);
    const dir = V(Math.cos(az), 0.55, Math.sin(az)).normalize();
    const ramo = [pts[3].clone().add(V(0, U(-0.4, 0), 0))];
    const raios = [0.12];
    const flexs = [0.05];
    const ao = [0.7];
    for (let k = 1; k <= 5; k++) {
      dir.y -= 0.12;
      dir.normalize();
      const p = ramo[k - 1].clone().addScaledVector(dir, 0.65);
      ramo.push(p);
      raios.push(0.12 * (1 - k / 6));
      flexs.push(0.05 + k * 0.06);
      ao.push(0.8);
      pontas.push({ p, flex: flexs[k], t: k / 5 });
    }
    const sr = suavizar(THREE, ramo, [raios, flexs, ao], 3);
    tubo(THREE, sr.pontos, sr.listas[0], 6, sr.listas[1], sr.listas[2], tubos, 0.03, r() * 6.28);
  }

  for (let i = 0; i < 420; i++) {
    // Mais fios perto das pontas.
    let no = pontas[Math.floor(r() * pontas.length)];
    while (r() > 0.3 + 0.7 * no.t) no = pontas[Math.floor(r() * pontas.length)];
    const comp = Math.min(U(1.4, 2.6), no.p.y - 0.25);
    const larg = U(0.25, 0.4);
    const az = r() * Math.PI * 2;
    const c = V(no.p.x + U(-0.3, 0.3), no.p.y - comp / 2, no.p.z + U(-0.3, 0.3));
    const cor = [U(0.55, 0.72), U(0.66, 0.82), U(0.38, 0.5)];
    const ao = clamp(0.35 + 0.5 * (c.y / 3.5) + (r() - 0.5) * 0.2);
    // O fio está preso em cima: quem balança é a ponta de baixo.
    cartao(cartoes, c, larg, comp, V(Math.cos(az), 0, Math.sin(az)), V(0, 1, 0), LAD.salgueiro, cor, ao, no.flex + 0.6, no.flex, 0, 0.4);
  }

  return { tronco: geometriaDeTubos(THREE, tubos), copa: geometriaDeCartoes(THREE, cartoes) };
}

/** Uma touceira de capim: 36 cartões em pé, 35% cor de palha. */
function gerarCapim(THREE, s) {
  const cartoes = novosCartoes(s);
  const r = cartoes.r;
  const U = (a, b) => a + (b - a) * r();
  for (let i = 0; i < 36; i++) {
    const az = r() * Math.PI * 2;
    const d = 0.25 * Math.sqrt(r());
    const H = U(0.4, 0.95);
    const larg = U(0.26, 0.42);
    const abre = U(0, 0.25);
    const ey = new THREE.Vector3(Math.cos(az) * abre, 1, Math.sin(az) * abre).normalize();
    const ex = new THREE.Vector3(-Math.sin(az), 0, Math.cos(az));
    const c = new THREE.Vector3(Math.cos(az) * d, 0, Math.sin(az) * d).addScaledVector(ey, H / 2);
    const palha = r() < 0.35;
    const cor = palha ? [U(0.78, 0.86), U(0.72, 0.8), U(0.5, 0.58)] : [U(0.45, 0.6), U(0.58, 0.7), U(0.3, 0.4)];
    cartao(cartoes, c, larg, H, ex, ey, LAD.capim, cor, U(0.6, 1), 0, 0.5, 0, 0.5);
  }
  return geometriaDeCartoes(THREE, cartoes);
}

/**
 * Junta partes numa geometria só, sem índice, com uv e o gancho de cada
 * vértice: `em` é o ponto de onde a parte pende (o pêndulo gira em volta
 * dele); sem `em`, o gancho é o próprio vértice e ele não balança. `sem`
 * desencontra o balanço de cada lanterna.
 */
function montar(THREE, partes) {
  const pos = [];
  const nor = [];
  const uv = [];
  const gancho = [];
  const sem = [];
  for (const { geo, em, s = 0 } of partes) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const P = g.attributes.position;
    const N = g.attributes.normal;
    const T = g.attributes.uv;
    for (let i = 0; i < P.count; i++) {
      pos.push(P.getX(i), P.getY(i), P.getZ(i));
      nor.push(N.getX(i), N.getY(i), N.getZ(i));
      uv.push(T ? T.getX(i) : 0, T ? T.getY(i) : 0);
      if (em) gancho.push(em[0], em[1], em[2]);
      else gancho.push(P.getX(i), P.getY(i), P.getZ(i));
      sem.push(s);
    }
    if (g !== geo) g.dispose();
    geo.dispose();
  }
  const saida = new THREE.BufferGeometry();
  saida.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  saida.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  saida.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  saida.setAttribute('aGancho', new THREE.Float32BufferAttribute(gancho, 3));
  saida.setAttribute('aSem', new THREE.Float32BufferAttribute(sem, 1));
  return saida;
}

/**
 * O corpo de papel (chōchin): um barril torneado de meia altura `hh`, mais
 * largo no meio, com as bocas a meio raio (a tampa e a base escuras cobrem).
 * O uv.y vai de 0 (embaixo) a 1 (em cima): o shader desenha as costelas por ele.
 */
function corpoDePapel(THREE, r, hh) {
  const perfil = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 5 - 1;
    perfil.push(new THREE.Vector2(r * (0.5 + 0.5 * Math.sqrt(Math.max(0, 1 - t * t))), t * hh));
  }
  return new THREE.LatheGeometry(perfil, 14);
}

/** Um quad de halo (−0,5..0,5) por centro; o shader o vira para a câmera. */
function gerarHalos(THREE, centros) {
  const pos = [];
  const centro = [];
  const sem = [];
  const idx = [];
  centros.forEach(([x, y, z, s], i) => {
    for (const [a, b] of [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]) {
      pos.push(a, b, 0);
      centro.push(x, y, z);
      sem.push(s);
    }
    idx.push(4 * i, 4 * i + 1, 4 * i + 2, 4 * i, 4 * i + 2, 4 * i + 3);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aCentro', new THREE.Float32BufferAttribute(centro, 3));
  g.setAttribute('aSem', new THREE.Float32BufferAttribute(sem, 1));
  g.setIndex(idx);
  return g;
}

/** A lanterna baixa: poste de madeira escura, base, tampa e o corpo de papel. */
function gerarLanterna(THREE) {
  const r = 0.135;
  const hh = 0.18;
  const y = ALT_LANTERNA;
  const madeira = montar(THREE, [
    { geo: new THREE.CylinderGeometry(0.03, 0.04, y - hh, 8, 1, true).translate(0, (y - hh) / 2, 0) },
    { geo: new THREE.CylinderGeometry(0.085, 0.1, 0.035, 14).translate(0, -0.012, 0) },
    { geo: new THREE.CylinderGeometry(0.6 * r, 0.62 * r, 0.03, 14).translate(0, y - hh - 0.01, 0) },
    { geo: new THREE.CylinderGeometry(0.42 * r, 0.7 * r, 0.05, 14).translate(0, y + hh + 0.02, 0) },
    { geo: new THREE.SphereGeometry(0.018, 8, 4).translate(0, y + hh + 0.055, 0) },
  ]);
  const papel = montar(THREE, [{ geo: corpoDePapel(THREE, r, hh).translate(0, y, 0) }]);
  const halo = gerarHalos(THREE, [[0, y, 0, 0]]);
  return { madeira, papel, halo };
}

/**
 * Uma fieira, de copa a copa ao longo de +x: a corda em catenária rasa (uma
 * fita em pé, de frente para quem anda), cinco lanternas penduradas por
 * cordões de comprimentos diferentes, cada uma com tampa e base.
 */
function gerarFieira(THREE) {
  const L = 5.8;
  const yCorda = (x) => 3.62 - 0.42 * (1 - (2 * x / L) ** 2);
  const r = semente(4231);
  const madeira = [];
  const papel = [];
  const halos = [];

  const fita = (x0, y0, x1, y1, larg) => {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const c = Math.hypot(dx, dy) || 1;
    const nx = (-dy / c) * larg / 2;
    const ny = (dx / c) * larg / 2;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([
      x0 - nx, y0 - ny, 0, x1 - nx, y1 - ny, 0, x1 + nx, y1 + ny, 0,
      x0 - nx, y0 - ny, 0, x1 + nx, y1 + ny, 0, x0 + nx, y0 + ny, 0,
    ], 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(Array(18).fill(0).map((_, i) => (i % 3 === 2 ? 1 : 0)), 3));
    return g;
  };

  const N = 24;
  for (let i = 0; i < N; i++) {
    const x0 = -L / 2 + (L * i) / N;
    const x1 = -L / 2 + (L * (i + 1)) / N;
    madeira.push({ geo: fita(x0, yCorda(x0), x1, yCorda(x1), 0.014) });
  }

  for (let i = 0; i < 5; i++) {
    const x = -MEIA_FIEIRA + (MEIA_FIEIRA / 2) * i + (r() - 0.5) * 0.16;
    const yg = yCorda(x);
    const cordao = 0.16 + 0.14 * r();
    const rr = 0.095 + 0.02 * r();
    const hh = rr * 1.3;
    const yc = yg - cordao - hh;
    const s = r();
    const em = [x, yg, 0];
    madeira.push(
      { geo: fita(x, yg, x, yc + hh, 0.008), em, s },
      { geo: new THREE.CylinderGeometry(0.45 * rr, 0.62 * rr, 0.03, 12).translate(x, yc + hh + 0.012, 0), em, s },
      { geo: new THREE.CylinderGeometry(0.62 * rr, 0.5 * rr, 0.025, 12).translate(x, yc - hh - 0.01, 0), em, s },
    );
    papel.push({ geo: corpoDePapel(THREE, rr, hh).translate(x, yc, 0), em, s });
    halos.push([x, yc, 0, s]);
  }
  return { madeira: montar(THREE, madeira), papel: montar(THREE, papel), halo: gerarHalos(THREE, halos) };
}

/** A sebe: esfera puxada para um superelipsoide, com calombos e a base achatada. */
function gerarArbusto(THREE) {
  const g = new THREE.SphereGeometry(1, 22, 14);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const norma = Math.pow(Math.abs(v.x) ** 3.2 + Math.abs(v.y) ** 3.2 + Math.abs(v.z) ** 3.2, 1 / 3.2) || 1;
    v.divideScalar(norma);
    v.multiplyScalar(1 + 0.09 * Math.sin(v.x * 7.1) * Math.cos(v.z * 6.3) + 0.06 * Math.sin(v.y * 9.2) * Math.sin(v.x * 5.4) + 0.035 * Math.sin(v.z * 13.7 + v.y * 4.1));
    if (v.y < -0.3) v.y = -0.3 + (v.y + 0.3) * 0.08;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

/* ---- shaders ------------------------------------------------------------------- */

// Passo de base: a alameda fica parada e a câmera anda. camA e viewA são a
// câmera e a vista em coordenadas da alameda (descontam `uDeriva`).
const DERIVA = /* glsl */ `
uniform float uDeriva;
#define camA (cameraPosition - vec3(0.0, 0.0, uDeriva))
#define viewA (viewMatrix * mat4(1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, uDeriva, 1.0))
`;

const CENTRO_GLSL = /* glsl */ `
float centro(float z) {
  float u = -z;
  return 0.45 * sin(0.12 * u) + 0.18 * sin(0.047 * u);
}
`;

const COMUM = CENTRO_GLSL + /* glsl */ `
uniform vec3 uNevoa;
uniform vec3 uCeu;
uniform float uDens;
uniform float uTarde;
uniform vec3 uLuz;
uniform float uNoite;
uniform float uSurgir;
uniform float uTempo;
uniform vec3 uVao;
uniform float uVaoZ;
uniform float uLanternas;
uniform float uPassoLuz;
uniform float uVeu;

const vec3 CHAMA = vec3(1.0, 0.64, 0.32);
const vec3 VIOLETA = vec3(0.37, 0.26, 0.54);
const vec3 NOITE = vec3(${NOITE.map((c) => c.toFixed(3)).join(', ')});

// O fundo numa direção: do horizonte (névoa) ao alto (céu), o véu violeta
// rente ao horizonte e, com as lanternas acesas, a névoa baixa aquecida.
vec3 fundo(vec3 d) {
  vec3 c = mix(uNevoa, uCeu, smoothstep(0.0, 0.55, d.y));
  c = mix(c, VIOLETA, (1.0 - smoothstep(0.0, 0.3, abs(d.y - 0.05))) * uVeu * 0.42);
  return c + CHAMA * (0.07 * uLanternas) * (1.0 - smoothstep(-0.05, 0.18, d.y));
}

// Névoa exponencial com expoente 1,45: 0,26 a 10 m, 0,55 a 20 m, 0,93 a 45 m.
vec3 nevoar(vec3 c, vec3 d) {
  float dist = length(d);
  float f = 1.0 - exp(-pow(dist * uDens, 1.45));
  return mix(c, fundo(d / max(dist, 0.001)), f);
}
vec3 aquecer(vec3 c, vec3 q) { return c * (uLuz + q); }
vec3 acabar(vec3 c) { return mix(NOITE, c, uSurgir); }

/* A luz das lanternas, sem luz real. A frente acesa fica a uLanternas × 62 m
   da câmera (a hora) ou a uPassoLuz m (o passo dela: as mais próximas se acendem
   conforme ela anda), o que for maior; cada uma leva 6 m para acender inteira. */
float acesa(float z) {
  float x = clamp((max(uLanternas * 62.0, uPassoLuz) - max(0.0, camA.z - z)) / 6.0, 0.0, 1.0);
  return x * x * (3.0 - 2.0 * x);
}
// Respira devagar: 3,6 a 5,5 s por ciclo, ±10%. Nada pisca.
float respira(float s) { return 0.9 + 0.1 * sin(uTempo * (1.15 + 0.6 * s) + 37.0 * s); }
float semLanterna(float z, float lado) { return fract(z * 0.1344 + lado * 0.31); }
float poca(vec3 d, float r2) {
  float q = 1.0 + dot(d, d) / r2;
  return 1.0 / (q * q);
}
vec3 luzQuente(vec3 p) {
  if (uLanternas < 0.001 && uPassoLuz < 0.001) return vec3(0.0);
  float soma = 0.0;
  // As baixas: as duas vizinhas de cada lado.
  for (int i = 0; i < 2; i++) {
    float lado = float(i) * 2.0 - 1.0;
    float desl = lado < 0.0 ? ${(ESP_LANTERNA / 2).toFixed(3)} : 0.0;
    float k0 = floor((-p.z - desl) / ${ESP_LANTERNA.toFixed(3)});
    for (int j = 0; j < 2; j++) {
      float z = -((k0 + float(j)) * ${ESP_LANTERNA.toFixed(3)} + desl);
      vec3 q = vec3(centro(z) + lado * ${LADO_LANTERNA.toFixed(3)}, ${ALT_LANTERNA.toFixed(3)}, z);
      soma += 2.6 * poca(p - q, 1.4) * acesa(z) * respira(semLanterna(z, lado));
    }
  }
  // As fieiras: um segmento de luz sobre o caminho, as duas vizinhas.
  float f0 = floor((-p.z - ${DESLOC_FIEIRA.toFixed(3)}) / ${ESP_FIEIRA.toFixed(3)});
  for (int j = 0; j < 2; j++) {
    float z = -((f0 + float(j)) * ${ESP_FIEIRA.toFixed(3)} + ${DESLOC_FIEIRA.toFixed(3)});
    float cx = centro(z);
    vec3 q = vec3(clamp(p.x, cx - ${MEIA_FIEIRA.toFixed(3)}, cx + ${MEIA_FIEIRA.toFixed(3)}), ${ALT_FIEIRA.toFixed(3)}, z);
    soma += 1.7 * poca(p - q, 1.6) * acesa(z);
  }
  return CHAMA * soma;
}

// O vão em volta da linha dos olhos: nada passa a menos de uVao.z do olhar.
// O pé do tronco fica no lugar, e o efeito só vale perto da câmera.
vec3 abrirVao(vec3 p) {
  vec2 q = p.xy - uVao.xy;
  float r = length(q);
  float raio = uVao.z;
  float rFora = raio + 1.0;
  if (r >= rFora || r < 0.0001) return p;
  float e = rFora / (rFora - raio);
  float r2 = raio + (rFora - raio) * pow(r / rFora, e);
  float peso = smoothstep(0.3, 1.1, p.y) * (1.0 - smoothstep(2.5, 6.5, abs(p.z - uVaoZ)));
  p.xy += q / r * (r2 - r) * peso;
  return p;
}

vec3 vento(vec3 p, float flex, float forca, float s) {
  float t = uTempo;
  float f = t * 0.55 + p.x * 0.19 + p.z * 0.13;
  vec3 v = vec3(sin(f) * 0.05, sin(1.1 * f + 0.6) * 0.012, cos(0.83 * f + 1.3) * 0.05);
  v += vec3(sin(2.3 * t + 41.0 * s), 0.0, cos(1.9 * t + 23.0 * s)) * 0.012;
  return p + v * flex * forca;
}
`;

// Só no fragmento (gl_FragCoord não existe no vértice).
const SO_FRAG = /* glsl */ `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float pontilhado() {
  return fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
}
`;

const VERT_CHAO = /* glsl */ `
varying vec3 vW;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewA * w;
}
`;

// O chão: caminho de lajes com meio-fio e pétalas caídas, grama com tapete de
// pétalas sob as copas, terra e sombra de contato nos pés das árvores, luz
// manchada e o lago à direita, que reflete o céu e as copas.
const FRAG_CHAO = /* glsl */ `
uniform sampler2D uRuido;
uniform vec4 uArvores[${VIZINHAS}];
uniform float uDetalhe;
varying vec3 vW;
void main() {
  vec2 xz = vW.xz;
  float dx = vW.x - centro(vW.z);
  float adx = abs(dx);
  vec4 nA = texture2D(uRuido, xz * 0.045);
  vec4 nB = texture2D(uRuido, xz * 0.19);
  vec4 nC = texture2D(uRuido, xz * 0.83);
  float g1 = texture2D(uRuido, xz * 1.9).r;
  float g2 = 0.5;
  if (uDetalhe > 0.5) g2 = texture2D(uRuido, xz * 4.3 + 0.5).g;
  vec3 dv = vW - camA;
  vec3 V = dv / max(length(dv), 0.001);

  float sob = 1.0 - smoothstep(4.2, 7.0, adx);
  vec3 grama = mix(vec3(0.40, 0.49, 0.30), vec3(0.56, 0.62, 0.39), nA.r);
  grama *= 0.86 + 0.28 * mix(g1, g2, 0.4);
  float tapete = smoothstep(0.42, 0.78, nB.g * 0.55 + nA.g * 0.25 + g2 * 0.2 + sob * 0.22);
  vec3 cor = mix(grama, vec3(0.95, 0.81, 0.87) * (0.92 + 0.08 * g1), tapete * (0.35 + 0.55 * sob));

  float sh = 0.0;
  float terra = 0.0;
  for (int i = 0; i < ${VIZINHAS}; i++) {
    vec4 a = uArvores[i];
    vec2 q = xz - a.xy;
    float r2 = dot(q, q);
    if (r2 > 14.0 * a.z) continue;
    sh += 0.5 * exp(-r2 / (0.35 * a.z)) + 0.16 * exp(-r2 / (3.0 * a.z));
    terra = max(terra, exp(-r2 / (1.3 * a.z)));
  }
  cor = mix(cor, vec3(0.44, 0.35, 0.33) * (0.85 + 0.3 * nC.r), smoothstep(0.25, 0.7, terra + (nC.g - 0.5) * 0.3));

  float W = 1.75 + (nB.r - 0.5) * 0.16;
  float aa = fwidth(adx) * 1.2 + 0.006;
  float fila = floor(vW.z * 1.9);
  float lx = (dx + 3.0 + hash12(vec2(fila, 1.7)) * 0.7) / 0.7;
  float jz = min(fract(vW.z * 1.9), 1.0 - fract(vW.z * 1.9)) / 1.9;
  float jx = min(fract(lx), 1.0 - fract(lx)) * 0.7;
  float j = min(jz, jx);
  float junta = 1.0 - smoothstep(0.006, 0.006 + fwidth(j) * 1.5 + 0.002, j);
  vec3 pedra = vec3(0.72, 0.69, 0.7) * (0.94 + 0.1 * hash12(vec2(fila, floor(lx)))) * (0.9 + 0.14 * nC.r);
  pedra = mix(pedra, vec3(0.42, 0.38, 0.42), junta * 0.75);
  float chance = 0.08 + 0.3 * smoothstep(W - 0.6, W, adx);
  pedra = mix(pedra, vec3(0.98, 0.85, 0.9), step(1.0 - chance, nC.b) * smoothstep(0.25, 0.45, nC.a));
  vec3 guia = vec3(0.8, 0.76, 0.76) * (0.92 + 0.1 * nC.g);
  vec3 piso = mix(pedra, guia, smoothstep(W - aa, W + aa, adx));
  cor = mix(piso, cor, smoothstep(W + 0.12 - aa, W + 0.12 + aa, adx));

  float luz = smoothstep(0.42, 0.68, nB.g * 0.6 + nA.b * 0.4);
  cor *= mix(1.0, mix(0.8, 1.05, luz), sob);
  cor = mix(cor, cor * vec3(0.6, 0.53, 0.64), clamp(sh, 0.0, 1.0) * 0.8);

  float lago = dx - (${LAGO.toFixed(2)} + (nA.g - 0.5) * 1.5);
  float margem = smoothstep(-0.8, -0.15, lago);
  cor = mix(cor, cor * vec3(0.72, 0.7, 0.74), smoothstep(-1.4, -0.6, lago) * (1.0 - margem));
  cor = aquecer(cor, luzQuente(vW));
  float rasante = 1.0 - clamp(-V.y, 0.0, 1.0);
  float fresnel = 0.15 + 0.85 * pow(rasante, 5.0);
  float elev = -V.y + (nC.r - 0.5) * 0.03;
  float topo = 0.09 + 0.13 * nA.b;
  vec3 ceuRef = fundo(normalize(vec3(V.x, max(elev, 0.0), V.z)));
  vec3 copaRef = mix(uNevoa, vec3(0.97, 0.8, 0.88) * (uLuz + CHAMA * 0.35 * uLanternas), 0.6);
  vec3 agua = mix(vec3(0.16, 0.18, 0.26) * uLuz, mix(copaRef, ceuRef, smoothstep(topo - 0.04, topo + 0.06, elev)), fresnel);
  cor = mix(cor, agua, margem);

  cor = nevoar(cor, dv);
  gl_FragColor = vec4(acabar(cor), 1.0);
}
`;

const VERT_TRONCO = /* glsl */ `
attribute float aFlex;
attribute float aAo;
uniform float uVento;
varying vec3 vW;
varying vec3 vN;
varying vec2 vUv;
varying float vAo;
varying vec3 vQuente;
void main() {
  mat4 m = modelMatrix * instanceMatrix;
  vec4 w = m * vec4(position, 1.0);
  float s = fract(m[3].x * 0.731 + m[3].z * 0.197);
  w.xyz = abrirVao(vento(w.xyz, aFlex, uVento, s));
  vW = w.xyz;
  vQuente = luzQuente(w.xyz);
  vN = normalize(mat3(m) * normal);
  vUv = uv;
  vAo = aAo;
  gl_Position = projectionMatrix * viewA * w;
}
`;

// Casca: placas, fissuras, lenticelas e musgo; relevo por derivadas de tela
// só de perto. Perto da câmera o tronco se dissolve (cobertura ou pontilhado).
const FRAG_TRONCO = /* glsl */ `
uniform sampler2D uRuido;
uniform float uDetalhe;
uniform vec3 uCasca;
varying vec3 vW;
varying vec3 vN;
varying vec2 vUv;
varying float vAo;
varying vec3 vQuente;
void main() {
  vec3 dv = vW - camA;
  float d = length(dv);
  float perto = mix(smoothstep(1.05, 1.75, d), smoothstep(1.4, 2.7, d), smoothstep(1.9, 2.3, vW.y));
  vec4 placa = texture2D(uRuido, vUv * vec2(1.0, 0.5));
  vec4 fissura = texture2D(uRuido, vUv * vec2(2.0, 0.35) + 0.5);
  vec3 n = normalize(vN);
  if (uDetalhe > 0.5) {
    float H = (placa.r * 0.6 + (1.0 - fissura.a) * 0.4) * 0.022 * (1.0 - smoothstep(5.0, 16.0, d));
    vec3 dpx = dFdx(vW);
    vec3 dpy = dFdy(vW);
    vec3 r1 = cross(dpy, n);
    vec3 r2 = cross(n, dpx);
    float det = dot(dpx, r1);
    vec3 grad = sign(det) * (dFdx(H) * r1 + dFdy(H) * r2);
    n = normalize(abs(det) * n - grad);
  }
  vec3 cor = uCasca * (0.85 + 0.35 * placa.r);
  cor *= mix(0.6, 1.0, smoothstep(0.04, 0.2, fissura.a));
  float lenticela = step(0.93, fract(vUv.y * 9.0 + placa.g * 0.5)) * step(0.5, fissura.g);
  cor = mix(cor, vec3(0.3, 0.25, 0.24), lenticela * 0.6);
  float musgo = smoothstep(0.55, 0.8, placa.g) * (1.0 - smoothstep(0.3, 1.4, vW.y)) * smoothstep(-0.2, 0.6, n.y + 0.4);
  cor = mix(cor, vec3(0.24, 0.27, 0.15), musgo * 0.7);
  float ceu = 0.45 + 0.55 * (n.y * 0.5 + 0.5);
  float lado = 0.85 + 0.25 * max(dot(n, normalize(vec3(-0.3, 0.4, 0.8))), 0.0);
  cor = cor * ceu * lado + vec3(0.075, 0.04, 0.055) * max(-n.y, 0.0) * vAo;
  cor = mix(cor, cor * vec3(1.15, 0.95, 1.12) + vec3(0.04, 0.02, 0.04), smoothstep(2.5, 4.5, vW.y) * 0.6);
  cor = nevoar(aquecer(cor, vQuente), dv);
#ifdef SEM_COBERTURA
  if (perto < pontilhado()) discard;
#else
  if (perto < 0.02) discard;
#endif
  gl_FragColor = vec4(acabar(cor), perto);
}
`;

// Cartão: a parte `virar` se vira para a câmera; o centro sai do vão e
// balança com o vento, mais em cima do que embaixo.
const VERT_CARTAO = /* glsl */ `
attribute vec3 aCentro;
attribute vec3 aCor;
attribute vec4 aDados;
attribute vec2 aCanto;
uniform float uVento;
uniform float uEscala;
varying vec2 vUv;
varying vec3 vCor;
varying vec3 vW;
varying vec3 vN;
varying float vAo;
varying float vFlor;
varying vec3 vQuente;
void main() {
  mat4 m = modelMatrix * instanceMatrix;
  vec3 c = (m * vec4(aCentro, 1.0)).xyz;
  vQuente = luzQuente(c);
  vec3 p = (m * vec4(position, 1.0)).xyz;
  float esc = length(m[0].xyz);
  vec3 direita = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 cima = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 b = c + (direita * aCanto.x + cima * aCanto.y) * esc;
  p = c + (mix(p, b, aDados.w) - c) * uEscala;
  p = vento(p, aDados.y, uVento, aDados.z) + (abrirVao(c) - c);
  vec3 n = normalize(mat3(m) * normal);
  vec3 paraCam = normalize(camA - c);
  if (dot(n, paraCam) < 0.0) n = -n;
  vN = normalize(mix(n, paraCam, aDados.w));
  vUv = uv;
  vCor = aCor;
  vW = p;
  vAo = aDados.x;
  vFlor = step(0.01, aDados.w);
  gl_Position = projectionMatrix * viewA * vec4(p, 1.0);
}
`;

const FRAG_CARTAO = /* glsl */ `
uniform sampler2D uFlor;
uniform vec2 uPerto;
varying vec2 vUv;
varying vec3 vCor;
varying vec3 vW;
varying vec3 vN;
varying float vAo;
varying float vFlor;
varying vec3 vQuente;
void main() {
  vec4 t = texture2D(uFlor, vUv);
  t.rgb = mix(t.rgb, t.rgb / max(t.a, 0.001), smoothstep(0.12, 0.55, t.a));
  vec3 dv = vW - camA;
  float d = length(dv);
  vec3 n = normalize(vN);
  float some = smoothstep(uPerto.x, uPerto.y, d) * smoothstep(0.08, 0.32, abs(dot(n, dv / max(d, 0.001))));
#ifdef SEM_COBERTURA
  if (t.a < 0.5 || some < pontilhado()) discard;
  float a = 1.0;
#else
  // Alfa afiado: a borda fica nítida e a cobertura (MSAA) faz o antisserrilhado.
  float a = clamp((t.a - 0.5) / max(fwidth(t.a), 0.0001) + 0.5, 0.0, 1.0) * some;
  if (a < 0.02) discard;
#endif
  vec3 cor = t.rgb * vCor * mix(0.8, 1.0, smoothstep(0.3, 0.9, t.a));
  vec3 sombra = mix(vec3(0.5, 0.56, 0.46), vec3(0.66, 0.47, 0.6), vFlor);
  vec3 claro = mix(vec3(1.0, 1.02, 0.98), vec3(1.05, 1.03, 1.04), vFlor);
  cor *= mix(sombra, claro, vAo);
  // A noite vem de cima, fraca; a chama vem de baixo: a face que olha para o
  // chão é a que mais se acende.
  float ceu = clamp(n.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 luz = uLuz * (0.62 + 0.38 * ceu) + vQuente * (1.25 - 0.6 * ceu);
  cor = nevoar(cor * luz, dv);
  gl_FragColor = vec4(acabar(cor), a);
}
`;

const VERT_SIMPLES = /* glsl */ `
varying vec3 vW;
varying vec3 vN;
varying vec3 vQuente;
void main() {
  mat4 m = modelMatrix * instanceMatrix;
  vec4 w = m * vec4(position, 1.0);
  vN = normalize(mat3(m) * normal);
  vW = w.xyz;
  vQuente = luzQuente(w.xyz);
  gl_Position = projectionMatrix * viewA * w;
}
`;

// As lanternas: a origem da instância é o pé da baixa ou o meio da fieira.
// PENDURADA: cada parte gira em volta do seu gancho, um pêndulo de ±2° em
// dois eixos com períodos de 4,2 a 6,2 s (uBalanco 0 no movimento reduzido).
const VERT_LANTERNA = /* glsl */ `
attribute vec3 aGancho;
attribute float aSem;
uniform float uBalanco;
varying vec3 vW;
varying vec3 vN;
varying vec2 vUv;
varying float vAcesa;
varying vec3 vQuente;
void main() {
  mat4 m = modelMatrix * instanceMatrix;
  vec3 p = position;
  vec3 nl = normal;
#ifdef PENDURADA
  float fase = aSem * 6.2832 + m[3].z * 0.37;
  float a = uBalanco * 0.035 * sin(uTempo * 6.2832 / (4.2 + 2.0 * aSem) + fase);
  float b = uBalanco * 0.022 * sin(uTempo * 6.2832 / (5.2 + 1.0 * aSem) + 1.7 * fase);
  mat3 ra = mat3(1.0, 0.0, 0.0, 0.0, cos(a), sin(a), 0.0, -sin(a), cos(a));
  mat3 rb = mat3(cos(b), sin(b), 0.0, -sin(b), cos(b), 0.0, 0.0, 0.0, 1.0);
  p = aGancho + rb * ra * (p - aGancho);
  nl = rb * ra * nl;
  float sem = fract(m[3].z * 0.217 + aSem);
#else
  float sem = semLanterna(m[3].z, sign(m[3].x - centro(m[3].z)));
#endif
  vec4 w = m * vec4(p, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(m) * nl);
  vUv = uv;
  vAcesa = acesa(m[3].z) * respira(sem);
  vQuente = luzQuente(w.xyz);
  gl_Position = projectionMatrix * viewA * w;
}
`;

// Madeira escura laqueada: a luz é a da hora e a da chama mais perto (que,
// no poste, é a da própria lanterna), com um fio de brilho rasante.
const FRAG_MADEIRA = /* glsl */ `
varying vec3 vW;
varying vec3 vN;
varying vec3 vQuente;
void main() {
  vec3 dv = vW - camA;
  vec3 V = -dv / max(length(dv), 0.001);
  vec3 n = normalize(vN);
  if (dot(n, V) < 0.0) n = -n;
  float fr = 1.0 - abs(dot(n, V));
  vec3 cor = vec3(0.12, 0.08, 0.065) * (0.7 + 0.3 * (n.y * 0.5 + 0.5));
  cor = aquecer(cor, vQuente) + (uLuz * 0.12 + vQuente * 0.1) * fr * fr * fr;
  gl_FragColor = vec4(acabar(nevoar(cor, dv)), 1.0);
}
`;

// O papel: apagado, é washi pálido na luz da hora; aceso, o miolo (onde o
// papel fica de frente) clareia quase a branco e as bordas ficam cor de
// chama; as costelas de bambu fazem as linhas. A chama fura um pouco a névoa.
const FRAG_PAPEL = /* glsl */ `
varying vec3 vW;
varying vec3 vN;
varying vec2 vUv;
varying float vAcesa;
void main() {
  vec3 dv = vW - camA;
  float d = length(dv);
  vec3 n = normalize(vN);
  float frente = abs(dot(n, dv / max(d, 0.001)));
  float alt = vUv.y * 2.0 - 1.0;
  float costela = (1.0 - smoothstep(0.0, 0.22, abs(sin(alt * 14.137)))) * (1.0 - smoothstep(3.0, 11.0, d));
  float pontas = smoothstep(0.6, 1.0, abs(alt));
  vec3 apagada = vec3(0.93, 0.88, 0.78) * uLuz * (0.5 + 0.4 * frente) * (1.0 - 0.3 * costela);
  vec3 chama = mix(vec3(1.0, 0.55, 0.22), vec3(1.0, 0.9, 0.7), frente * frente) * (1.28 - 0.5 * pontas) * (1.0 - 0.4 * costela);
  vec3 cor = mix(apagada, chama, clamp(vAcesa * 1.1, 0.0, 1.0));
  float f = 1.0 - exp(-pow(d * uDens * mix(1.0, 0.72, vAcesa), 1.45));
  cor = mix(cor, fundo(dv / max(d, 0.001)), f);
  gl_FragColor = vec4(acabar(cor), 1.0);
}
`;

// O halo de cada chama: um quad virado para a câmera, somado por cima. Some
// na névoa e perto do olho (não vira um borrão do tamanho da tela).
const VERT_HALO = /* glsl */ `
attribute vec3 aCentro;
attribute float aSem;
uniform float uTam;
varying vec2 vQ;
varying float vBrilho;
void main() {
  mat4 m = modelMatrix * instanceMatrix;
  vec3 c = (m * vec4(aCentro, 1.0)).xyz;
  vec3 direita = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 cima = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 p = c + (direita * position.x + cima * position.y) * uTam;
  vQ = position.xy * 2.0;
  float d = length(c - camA);
  float f = 1.0 - exp(-pow(d * uDens * 0.8, 1.45));
#ifdef PENDURADA
  float sem = fract(m[3].z * 0.217 + aSem);
#else
  float sem = semLanterna(m[3].z, sign(m[3].x - centro(m[3].z)));
#endif
  vBrilho = acesa(m[3].z) * respira(sem) * (1.0 - f) * smoothstep(0.6, 1.8, d) * uSurgir;
  gl_Position = projectionMatrix * viewA * vec4(p, 1.0);
}
`;

const FRAG_HALO = /* glsl */ `
uniform float uForca;
varying vec2 vQ;
varying float vBrilho;
void main() {
  float r2 = dot(vQ, vQ);
  float a = (0.55 * exp(-r2 * 9.0) + 0.45 * exp(-r2 * 2.6)) * (1.0 - smoothstep(0.5, 1.0, r2));
  vec3 cor = CHAMA * (a * vBrilho * uForca);
  if (cor.r < 0.002) discard;
  gl_FragColor = vec4(cor, 1.0);
}
`;

// Sebe: tufos e folhas projetados pelo eixo dominante da normal, pétalas
// caídas no alto e a silhueta recortada em folhas (perfil).
const FRAG_ARBUSTO = /* glsl */ `
uniform sampler2D uRuido;
varying vec3 vW;
varying vec3 vN;
varying vec3 vQuente;
void main() {
  vec3 n = normalize(vN);
  vec3 an = abs(n);
  vec2 uv = an.x > an.y && an.x > an.z ? vW.zy : (an.y > an.z ? vW.xz : vW.xy);
  vec4 tufo = texture2D(uRuido, uv * 0.3 + 0.21);
  vec4 folha = texture2D(uRuido, uv * 1.7 + 0.57);
  vec4 mancha = texture2D(uRuido, uv * 0.11 + 0.83);
  vec3 dv = vW - camA;
  float d = length(dv);
  vec3 V = -dv / max(d, 0.001);
  float fino = 1.0 - smoothstep(7.0, 20.0, d);
  float tom = clamp(tufo.r * 0.55 + mancha.g * 0.45 + (folha.g - 0.5) * 0.5 * fino, 0.0, 1.0);
  vec3 cor = mix(vec3(0.13, 0.2, 0.09), vec3(0.4, 0.5, 0.22), tom);
  cor *= mix(0.7, 1.0, mix(0.6, folha.a, fino));
  float petala = smoothstep(0.82, 0.9, folha.b) * smoothstep(0.3, 0.8, n.y) * step(0.6, mancha.r);
  cor = mix(cor, vec3(0.93, 0.76, 0.84), petala);
  float ceu = 0.45 + 0.55 * (n.y * 0.5 + 0.5);
  float lado = 0.85 + 0.25 * max(dot(n, normalize(vec3(-0.3, 0.4, 0.8))), 0.0);
  cor = nevoar(aquecer(cor * ceu * lado, vQuente), dv);
  float a = smoothstep(0.0, 0.25, abs(dot(n, V)) + (folha.r - 0.5) * 0.35 * fino);
#ifdef SEM_COBERTURA
  if (a < 0.5) discard;
  a = 1.0;
#else
  if (a < 0.02) discard;
#endif
  gl_FragColor = vec4(acabar(cor), a);
}
`;

// O céu fica no plano do fundo (z = w) e é desenhado depois do chão: só paga
// os pixels que sobraram.
const VERT_CEU = /* glsl */ `
varying vec3 vW;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewA * w;
  gl_Position.z = gl_Position.w * 0.99999;
}
`;

// Estrelas pequenas e nítidas: uma por célula sorteada. O raio nunca fica
// abaixo de ~1 px (px), e o brilho cai na mesma conta: nada cintila de
// serrilhado. As mais fortes aparecem primeiro conforme uEstrelas sobe, e
// todas respiram devagar (7 a 18 s), sem piscar.
const FRAG_CEU = /* glsl */ `
uniform float uEstrelas;
varying vec3 vW;
float estrela(vec2 uv, float chance, float raio, float px) {
  vec2 cel = floor(uv);
  float h1 = hash12(cel);
  if (h1 < 1.0 - chance) return 0.0;
  float h2 = hash12(cel + 17.3);
  vec2 lugar = vec2(hash12(cel + 3.1), hash12(cel + 7.7)) * 0.7 + 0.15;
  float r = length(uv - cel - lugar);
  float re = max(raio, 1.1 * px);
  float forca = fract(13.1 * h1);
  float ver = clamp((uEstrelas * 1.3 - (1.0 - forca)) * 3.0, 0.0, 1.0);
  float respiro = 0.84 + 0.16 * sin(uTempo * (0.35 + 0.5 * h2) + 40.0 * h1);
  float nucleo = 1.0 - smoothstep(0.0, re, r);
  float halo = 1.0 - smoothstep(0.0, 3.5 * re, r);
  return (nucleo + 0.16 * halo * halo) * (raio * raio) / (re * re) * (0.35 + 0.65 * forca) * ver * respiro;
}
void main() {
  vec3 d = normalize(vW - camA);
  vec3 cor = fundo(d);
  vec2 uv = d.xz / max(d.y + 0.4, 0.05) * 22.0;
  float px = max(fwidth(uv.x), fwidth(uv.y));
  if (uEstrelas > 0.01) {
    float alto = smoothstep(0.03, 0.24, d.y);
    float e = estrela(uv, 0.5, 0.065, px) + 0.55 * estrela(uv * 2.7 + 3.7, 0.4, 0.05, px * 2.7);
    cor += vec3(1.0, 0.96, 0.9) * e * alto;
  }
  cor += (hash12(gl_FragCoord.xy) - 0.5) / 255.0;
  gl_FragColor = vec4(acabar(cor), 1.0);
}
`;

// Pétalas no ar: uma caixa de 9 × 6 × 18 m à frente da câmera. Cada pétala é
// fixa no mundo e recicla pela borda da caixa (fract), então andar não as arrasta.
const VERT_PETALAS = /* glsl */ `
attribute float aW;
uniform vec3 uCaixa;
uniform float uQueda;
uniform float uPx;
varying float vAlfa;
varying float vRot;
varying float vLarg;
varying vec3 vW;
varying vec3 vQuente;
void main() {
  float t = uTempo * uQueda;
  vec3 base = camA + vec3(-4.5, -1.4, -14.76);
  vec3 anda = vec3(t * 0.32 + sin(t * 0.7 + aW * 21.0) * 0.4, -t * (0.45 + 0.35 * aW), t * 0.1 + cos(t * 0.53 + aW * 13.0) * 0.35);
  vec3 q = fract((position * uCaixa + anda - base) / uCaixa);
  vec3 w = base + q * uCaixa;
  vec3 borda = min(q, 1.0 - q);
  vec4 mv = viewA * modelMatrix * vec4(w, 1.0);
  // A que passa rente ao olho some antes de virar um borrão do tamanho da tela.
  vAlfa = smoothstep(0.0, 0.08, min(min(borda.x, borda.y), borda.z)) * smoothstep(0.25, 0.6, -mv.z);
  gl_PointSize = uPx * (0.6 + 0.6 * aW) / max(0.2, -mv.z);
  vRot = t * (0.6 + 1.4 * aW) + aW * 40.0;
  vLarg = 0.35 + 0.65 * abs(cos(t * (0.9 + aW) + aW * 17.0));
  vW = w;
  vQuente = luzQuente(w);
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG_PETALAS = /* glsl */ `
varying float vAlfa;
varying float vRot;
varying float vLarg;
varying vec3 vW;
varying vec3 vQuente;
void main() {
  vec2 q = gl_PointCoord - 0.5;
  q.y = -q.y;
  float cs = cos(vRot);
  float sn = sin(vRot);
  q = vec2(cs * q.x - sn * q.y, sn * q.x + cs * q.y);
  q.x /= vLarg;
  // pow() com base negativa é indefinido em GLSL: o quadrado vai por multiplicação.
  float e = (q.y - 0.04) / 0.44;
  float meia = 0.22 * sqrt(max(0.0, 1.0 - e * e)) * (0.7 + 0.3 * smoothstep(-0.4, 0.3, q.y));
  float forma = min(meia - abs(q.x), length(vec2(q.x * 1.4, q.y - 0.47)) - 0.075);
  float aa = max(fwidth(forma), 0.002);
  float a = smoothstep(-aa, aa, forma) * vAlfa;
  if (a < 0.01) discard;
  vec3 cor = mix(vec3(0.97, 0.78, 0.86), vec3(1.0, 0.94, 0.96), 1.0 - smoothstep(-0.3, 0.2, q.y));
  cor = nevoar(aquecer(cor, vQuente * 1.2), vW - camA);
  gl_FragColor = vec4(acabar(cor), a * 0.92);
}
`;

/* ---- a alameda ------------------------------------------------------------------ */

export function criarAlameda(mundo) {
  const { THREE, renderer, cena, camera, amb, tamanho } = mundo;
  const gsap = window.gsap;
  const reduzido = !!amb?.reduzido;
  let nivelAtual = CARTOES[amb?.nivel] ? amb.nivel : 'alto';
  // Alpha-to-coverage pede MSAA, e o renderer só o tem se nasceu fora do nível
  // baixo. Cair para o baixo depois não tira o MSAA: a escolha vale para sempre.
  const cobertura = nivelAtual !== 'baixo' && renderer.getContext?.()?.getContextAttributes?.()?.antialias !== false;
  const semCobertura = () => (cobertura ? {} : { SEM_COBERTURA: '' });
  const densBase = () => (nivelAtual === 'baixo' ? 0.05 : 0.043);

  let densHora = 1;
  let surgido = false;
  let ultimaVaga = null;
  let vaoIniciado = false;
  let derivaAtual = 0;
  let zInicio = null; // onde a caminhada começou, para medir o caminho feito
  let cometa = null; // false se não deu para criar: não tenta de novo a cada quadro
  let cometaDesde = 0;
  let cometaPronto = false;
  const corNevoa = [...NEVOA];
  const olho = new THREE.Vector3();
  const camPos = new THREE.Vector3();

  // Uniformes compartilhados por referência com todos os materiais (e com ele.js).
  const comuns = {
    uNevoa: { value: new THREE.Vector3(...NEVOA) },
    uCeu: { value: new THREE.Vector3(...CEU) },
    uDens: { value: densBase() },
    uTarde: { value: 0 },
    uLuz: { value: new THREE.Vector3(1, 1, 1) },
    uNoite: { value: 0 },
    uSurgir: { value: 0 },
    uTempo: { value: 0 },
    uVao: { value: new THREE.Vector3(0, 1.6, 1.32) },
    uVaoZ: { value: 0 },
    uDeriva: { value: 0 },
    uLanternas: { value: 0 },
    uPassoLuz: { value: 0 },
    uVeu: { value: 1 },
    uEstrelas: { value: 0 },
  };
  const uBalanco = { value: reduzido ? 0 : 1 };
  const uVento = { value: reduzido ? 0.25 : 1 };
  const uEscala = { value: 1 };
  const uPerto = { value: new THREE.Vector2(0.55, 1.25) };
  const uDetalhe = { value: nivelAtual === 'baixo' ? 0 : 1 };
  const uPx = { value: 1 };
  const arvoresU = Array.from({ length: VIZINHAS }, () => new THREE.Vector4(1e4, 1e4, 1, 0));

  const uRuido = { value: texturaRuido(THREE, renderer.capabilities?.getMaxAnisotropy?.() || 1) };
  const uFlor = { value: texturaFlores(THREE) };
  // O atlas sobe agora, atrás do preto, e não no primeiro quadro da alameda.
  try {
    renderer.initTexture?.(uRuido.value);
    renderer.initTexture?.(uFlor.value);
  } catch {
    /* sobe no primeiro desenho */
  }

  function material({ vertexShader, fragmentShader, uniforms = {}, ...op }) {
    const opcoes = {
      ...op,
      uniforms: { ...comuns, ...uniforms },
      vertexShader: DERIVA + COMUM + vertexShader,
      fragmentShader: DERIVA + COMUM + SO_FRAG + fragmentShader,
    };
    // Com alpha-to-coverage o navegador também gravaria o alfa no canvas, e a
    // página vazaria por ele (um contorno claro em cada cacho): a cor
    // entra inteira e o alfa do destino fica como está.
    if ('alphaToCoverage' in op) {
      Object.assign(opcoes, {
        blending: THREE.CustomBlending,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.ZeroFactor,
        blendSrcAlpha: THREE.ZeroFactor,
        blendDstAlpha: THREE.OneFactor,
      });
    }
    return new THREE.ShaderMaterial(opcoes);
  }

  const grupo = new THREE.Group();
  grupo.name = 'alameda';
  grupo.visible = false;

  // Nada da alameda passa pelo recorte do three: os shaders desenham em
  // coordenadas da alameda (deriva), e a caixa que o three veria estaria errada.
  const malha = (geometria, mat, max, ordem = 0) => {
    const m = new THREE.InstancedMesh(geometria, mat, max);
    m.count = 0;
    m.frustumCulled = false;
    m.renderOrder = ordem;
    grupo.add(m);
    return m;
  };

  const matTronco = material({
    vertexShader: VERT_TRONCO,
    fragmentShader: FRAG_TRONCO,
    uniforms: { uRuido, uDetalhe, uVento, uCasca: { value: new THREE.Vector3(0.15, 0.12, 0.112) } },
    alphaToCoverage: cobertura,
    defines: semCobertura(),
  });
  const cartoes = (escala) => material({
    vertexShader: VERT_CARTAO,
    fragmentShader: FRAG_CARTAO,
    uniforms: { uFlor, uVento, uEscala: escala, uPerto },
    side: THREE.DoubleSide,
    alphaToCoverage: cobertura,
    defines: semCobertura(),
  });
  // Só as copas das cerejeiras perdem cartões no nível; o salgueiro e o capim
  // ficam inteiros e não crescem para compensar.
  const matCopa = cartoes(uEscala);
  const matFolhas = cartoes({ value: 1 });

  // Ordem de desenho: troncos e madeira 0, cartões e papel 1, chão 2 (a parte
  // coberta não paga o shader), céu 3 (só o que sobrou), pétalas 4, halos 5;
  // o cometa, transparente, −5.
  const variantes = Array.from({ length: VARIANTES }, (_, v) => {
    const arvore = gerarCerejeira(THREE, 101 + 37 * v, CARTOES.alto);
    return { tronco: malha(arvore.tronco, matTronco, MAX_ARVORES, 0), copa: malha(arvore.copa, matCopa, MAX_ARVORES, 1), n: 0 };
  });
  const salgueiro = gerarSalgueiro(THREE, 211);
  const salgueiros = {
    tronco: malha(salgueiro.tronco, matTronco, MAX_SALGUEIROS, 0),
    copa: malha(salgueiro.copa, matFolhas, MAX_SALGUEIROS, 1),
  };
  const capim = malha(gerarCapim(THREE, 307), matFolhas, MAX_CAPIM, 1);
  // As lanternas: madeira e papel opacos; o halo somado depois das pétalas.
  const lampiao = (geo, max, pendurada, tam, forca) => {
    const defines = pendurada ? { PENDURADA: '' } : {};
    const uniforms = { uBalanco };
    return {
      madeira: malha(geo.madeira, material({ vertexShader: VERT_LANTERNA, fragmentShader: FRAG_MADEIRA, uniforms, defines, side: THREE.DoubleSide }), max),
      papel: malha(geo.papel, material({ vertexShader: VERT_LANTERNA, fragmentShader: FRAG_PAPEL, uniforms, defines, side: THREE.DoubleSide }), max, 1),
      halo: malha(geo.halo, material({
        vertexShader: VERT_HALO,
        fragmentShader: FRAG_HALO,
        uniforms: { uTam: { value: tam }, uForca: { value: forca } },
        defines,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }), max, 5),
    };
  };
  const lanternas = lampiao(gerarLanterna(THREE), MAX_LANTERNAS, false, 1.15, 0.5);
  const fieiras = lampiao(gerarFieira(THREE), MAX_FIEIRAS, true, 0.8, 0.42);
  const sebes = malha(
    gerarArbusto(THREE),
    material({ vertexShader: VERT_SIMPLES, fragmentShader: FRAG_ARBUSTO, uniforms: { uRuido }, alphaToCoverage: cobertura, defines: semCobertura() }),
    MAX_SEBES,
  );

  // O chão: 96 × 120 m deitado, com o centro 42 m à frente da câmera.
  const chao = new THREE.Mesh(
    new THREE.PlaneGeometry(96, 120).rotateX(-Math.PI / 2).translate(0, 0, -42),
    material({ vertexShader: VERT_CHAO, fragmentShader: FRAG_CHAO, uniforms: { uRuido, uDetalhe, uArvores: { value: arvoresU } } }),
  );
  chao.renderOrder = 2;
  chao.frustumCulled = false;
  grupo.add(chao);

  // O céu por último entre os opacos e sem escrever profundidade: antes ele
  // somava 38% dos fragmentos para 3% de céu visível.
  const ceu = new THREE.Mesh(
    new THREE.SphereGeometry(50, 24, 12),
    material({ vertexShader: VERT_CEU, fragmentShader: FRAG_CEU, side: THREE.BackSide, depthWrite: false }),
  );
  ceu.renderOrder = 3;
  ceu.frustumCulled = false;
  grupo.add(ceu);

  // Pétalas no ar: um ponto fixo no mundo por pétala, dentro de uma caixa que
  // segue a câmera. O nível só muda quantas são desenhadas.
  const maxPetalas = reduzido ? PETALAS_CALMAS : PETALAS.alto;
  const sorte = semente(1223);
  const lugares = new Float32Array(maxPetalas * 3);
  const pesos = new Float32Array(maxPetalas);
  for (let i = 0; i < maxPetalas; i++) {
    lugares[i * 3] = sorte();
    lugares[i * 3 + 1] = sorte();
    lugares[i * 3 + 2] = sorte();
    pesos[i] = sorte();
  }
  const geoPetalas = new THREE.BufferGeometry();
  geoPetalas.setAttribute('position', new THREE.BufferAttribute(lugares, 3));
  geoPetalas.setAttribute('aW', new THREE.BufferAttribute(pesos, 1));
  const petalas = new THREE.Points(geoPetalas, material({
    vertexShader: VERT_PETALAS,
    fragmentShader: FRAG_PETALAS,
    uniforms: { uCaixa: { value: new THREE.Vector3(9, 6, 18) }, uQueda: { value: reduzido ? 0.35 : 1 }, uPx },
    transparent: true,
    depthWrite: false,
  }));
  petalas.renderOrder = 4;
  petalas.frustumCulled = false;
  grupo.add(petalas);

  /* ---- vagas ------------------------------------------------------------------ */

  const matriz = new THREE.Matrix4();
  const giroQ = new THREE.Quaternion();
  const lugar = new THREE.Vector3();
  const tam = new THREE.Vector3();
  const EIXO_Y = new THREE.Vector3(0, 1, 0);
  const proximas = []; // as cerejeiras em uso: { x, z, s2 }

  /** Compõe a matriz da instância `i` (fica em `matriz` para quem quiser reusar). */
  function por(m, i, x, y, z, giro, s, sy = s, sz = s) {
    lugar.set(x, y, z);
    giroQ.setFromAxisAngle(EIXO_Y, giro);
    tam.set(s, sy, sz);
    m.setMatrixAt(i, matriz.compose(lugar, giroQ, tam));
  }

  function fechar(m, n) {
    m.count = n;
    m.instanceMatrix.needsUpdate = true;
  }

  // Cada vaga é um índice k numa fila de espaçamento fixo; o hash da vaga dá o
  // resto (folga, lado, tamanho, giro), então a mesma árvore volta sempre igual.
  function colocar(zc) {
    const ate = zc - ALCANCE[nivelAtual];
    const desde = zc + ATRAS;
    const dentro = (z) => z > ate && z < desde;
    const fila = (esp, desloc, folga, fn) => {
      const k1 = Math.ceil((-ate - desloc + folga) / esp);
      for (let k = Math.floor((-desde - desloc - folga) / esp); k <= k1; k++) fn(k);
    };

    for (const v of variantes) v.n = 0;
    proximas.length = 0;
    for (const lado of [-1, 1]) {
      const desloc = lado > 0 ? ESP_ARVORE / 2 : 0;
      fila(ESP_ARVORE, desloc, 0.7, (k) => {
        const z = -(k * ESP_ARVORE + desloc) + (h(k, lado, 1) - 0.5) * 1.4;
        if (!dentro(z)) return;
        const v = variantes[Math.floor(h(k, lado, 2) * VARIANTES) % VARIANTES];
        if (v.n >= MAX_ARVORES) return;
        const x = centroCaminho(z) + lado * (MEIA_PISTA + 1.0 + h(k, lado, 3) * 0.75);
        const s = 0.86 + 0.3 * h(k, lado, 4);
        // A árvore nasce inclinada para +x: do lado direito ela gira meia volta
        // e sempre se debruça sobre o caminho.
        por(v.tronco, v.n, x, 0, z, (lado > 0 ? Math.PI : 0) + (h(k, lado, 5) - 0.5) * 0.6, s);
        v.copa.setMatrixAt(v.n, matriz);
        v.n += 1;
        proximas.push({ x, z, s2: s * s });
      });
    }
    for (const v of variantes) {
      fechar(v.tronco, v.n);
      fechar(v.copa, v.n);
    }

    // As 12 árvores que sombreiam o chão: perto de onde o olhar pousa (8 m à frente).
    const foco = zc - 8;
    const sombreiam = proximas
      .filter((a) => a.z > zc - 28 && a.z < zc + 5)
      .sort((a, b) => Math.abs(a.z - foco) - Math.abs(b.z - foco));
    arvoresU.forEach((p, i) => {
      const a = sombreiam[i];
      if (a) p.set(a.x, a.z, a.s2, 0);
      else p.set(1e4, 1e4, 1, 0);
    });

    let n = 0;
    fila(SALGUEIRO_A_CADA, 19, 4, (k) => {
      const z = -(k * SALGUEIRO_A_CADA + 19) + (h(k, 0, 11) - 0.5) * 8;
      if (!dentro(z) || n >= MAX_SALGUEIROS) return;
      const x = centroCaminho(z) - (9 + 3 * h(k, 0, 12));
      por(salgueiros.tronco, n, x, 0, z, h(k, 0, 13) * Math.PI * 2, 0.9 + 0.25 * h(k, 0, 14));
      salgueiros.copa.setMatrixAt(n, matriz);
      n += 1;
    });
    fechar(salgueiros.tronco, n);
    fechar(salgueiros.copa, n);

    // As mesmas contas de luzQuente(): mudar uma é mudar a outra.
    const lampioes = (l, n) => {
      l.papel.setMatrixAt(n, matriz);
      l.halo.setMatrixAt(n, matriz);
    };
    const fecharLampioes = (l, n) => {
      fechar(l.madeira, n);
      fechar(l.papel, n);
      fechar(l.halo, n);
    };
    n = 0;
    for (const lado of [-1, 1]) {
      const desloc = lado < 0 ? ESP_LANTERNA / 2 : 0;
      fila(ESP_LANTERNA, desloc, 0, (k) => {
        const z = -(k * ESP_LANTERNA + desloc);
        if (!dentro(z) || n >= MAX_LANTERNAS) return;
        por(lanternas.madeira, n, centroCaminho(z) + lado * LADO_LANTERNA, 0, z, 0, 1);
        lampioes(lanternas, n);
        n += 1;
      });
    }
    fecharLampioes(lanternas, n);

    // A fieira atravessa o caminho de frente para quem anda (giro pela curva).
    n = 0;
    fila(ESP_FIEIRA, DESLOC_FIEIRA, 0, (k) => {
      const z = -(k * ESP_FIEIRA + DESLOC_FIEIRA);
      if (!dentro(z) || n >= MAX_FIEIRAS) return;
      por(fieiras.madeira, n, centroCaminho(z), 0, z, -Math.atan(centroCaminho(z - 1) - centroCaminho(z)), 1);
      lampioes(fieiras, n);
      n += 1;
    });
    fecharLampioes(fieiras, n);

    // Sebes compridas à esquerda (78% das vagas); touceiras à direita (25%).
    n = 0;
    for (const lado of [-1, 1]) {
      const desloc = lado > 0 ? ESP_SEBE / 2 : 0;
      fila(ESP_SEBE, desloc, 0.4, (k) => {
        const z = -(k * ESP_SEBE + desloc) + (h(k, lado, 21) - 0.5) * 0.8;
        if (!dentro(z) || n >= MAX_SEBES || h(k, lado, 22) > (lado < 0 ? 0.78 : 0.25)) return;
        const hx = h(k, lado, 23);
        const giro = (h(k, lado, 24) - 0.5) * 0.4;
        if (lado < 0) {
          const s = 0.45 + 0.4 * h(k, lado, 25);
          por(sebes, n, centroCaminho(z) - (4.3 + 2.2 * hx), 0.3 * s, z, giro, s, s, s * (1.3 + 0.9 * h(k, lado, 26)));
        } else {
          const s = 0.32 + 0.18 * h(k, lado, 25);
          por(sebes, n, centroCaminho(z) + 3.9 + 0.4 * hx, 0.3 * s, z, giro * 8, s);
        }
        n += 1;
      });
    }
    fechar(sebes, n);

    // Capim na beira do lago (75% das vagas).
    n = 0;
    fila(ESP_CAPIM, 0.6, 0.4, (k) => {
      const z = -(k * ESP_CAPIM + 0.6) + (h(k, 1, 31) - 0.5) * 0.8;
      if (!dentro(z) || n >= MAX_CAPIM || h(k, 1, 32) > 0.75) return;
      const x = centroCaminho(z) + LAGO - 0.3 + 1.1 * h(k, 1, 33);
      por(capim, n, x, 0, z, h(k, 1, 34) * Math.PI * 2, 0.8 + 0.45 * h(k, 1, 35));
      n += 1;
    });
    fechar(capim, n);
  }

  /* ---- qualidade, hora e quadro ---------------------------------------------- */

  function aplicarNivel(nivel) {
    if (!CARTOES[nivel]) return;
    nivelAtual = nivel;
    const parte = CARTOES[nivel] / CARTOES.alto;
    // Os cartões nasceram em ordem sorteada: cortar o fim tira uma amostra
    // uniforme da copa, e os que ficam crescem para cobrir o buraco.
    for (const v of variantes) {
      const total = v.copa.geometry.index.count;
      v.copa.geometry.setDrawRange(0, Math.floor((total * parte) / 6) * 6);
    }
    uEscala.value = (1 / Math.sqrt(Math.max(0.4, parte))) * (parte < 1 ? 0.92 : 1);
    uDetalhe.value = nivel === 'baixo' ? 0 : 1;
    comuns.uDens.value = densBase() * densHora;
    geoPetalas.setDrawRange(0, Math.min(maxPetalas, PETALAS[nivel]));
    ultimaVaga = null;
  }

  // A cor do fog da cena acompanha a névoa (as pétalas a leem por referência).
  // A paleta é sRGB: a cor entra convertida, para quem a desenha em sRGB ver o mesmo tom.
  function pintarNevoa() {
    if (!surgido || !cena.fog) return;
    const k = comuns.uSurgir.value;
    cena.fog.color.setRGB(lerp(NOITE[0], corNevoa[0], k), lerp(NOITE[1], corNevoa[1], k), lerp(NOITE[2], corNevoa[2], k), THREE.SRGBColorSpace);
  }

  function aplicarHora(e) {
    if (!e) return;
    const copiar = (alvo, cor) => {
      if (Array.isArray(cor) && cor.length >= 3) alvo.set(cor[0], cor[1], cor[2]);
    };
    copiar(comuns.uNevoa.value, e.nevoa);
    copiar(comuns.uCeu.value, e.ceu);
    copiar(comuns.uLuz.value, e.luz);
    if (Number.isFinite(e.tarde)) comuns.uTarde.value = e.tarde;
    if (Number.isFinite(e.noite)) comuns.uNoite.value = e.noite;
    if (Number.isFinite(e.dens)) densHora = e.dens;
    if (Number.isFinite(e.lanternas)) comuns.uLanternas.value = clamp(e.lanternas);
    if (Number.isFinite(e.estrelas)) comuns.uEstrelas.value = clamp(e.estrelas);
    if (Number.isFinite(e.veu)) comuns.uVeu.value = clamp(e.veu);
    comuns.uDens.value = densBase() * densHora;
    if (Array.isArray(e.nevoa) && e.nevoa.length >= 3) corNevoa.splice(0, 3, e.nevoa[0], e.nevoa[1], e.nevoa[2]);
    pintarNevoa();
  }

  // O cometa a 3,2 m, no alto e somado por cima das flores: as copas fecham o
  // túnel, e um cometa de verdade no céu ficaria escondido. Nasce na primeira
  // noite e só aparece depois de o programa compilar (sem engasgo no meio dela).
  function criarCometa(t) {
    const mapa = new THREE.CanvasTexture(pintarCometa(512, 512));
    mapa.colorSpace = THREE.SRGBColorSpace;
    cometa = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: mapa,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
        toneMapped: false,
      }),
    );
    cometa.name = 'cometa';
    cometa.renderOrder = -5;
    cometa.frustumCulled = false;
    cometa.visible = false;
    cometaDesde = t;
    grupo.add(cometa);
    const pronto = () => { cometaPronto = true; };
    try {
      renderer.initTexture?.(mapa);
      Promise.resolve(renderer.compileAsync?.(cometa, camera, cena)).then(pronto, pronto);
    } catch {
      pronto();
    }
    espera(1500).then(pronto);
  }

  function atualizarCometa(t) {
    const noite = comuns.uNoite.value;
    if (noite <= 0.2) {
      if (cometa) cometa.visible = false;
      return;
    }
    if (cometa === null) {
      try {
        criarCometa(t);
      } catch (erro) {
        cometa = false;
        console.error('[carta] o cometa não nasceu', erro);
      }
    }
    if (!cometa || !cometaPronto) return;
    const k = clamp((noite - 0.2) / 0.8);
    const meiaA = Math.tan(((camera.fov || 58) * Math.PI) / 360) * 3.2;
    const meiaL = meiaA * (camera.aspect || 1);
    const lado = Math.min(meiaA * 1.12, meiaL * 2.05);
    // Desce devagar e vai para a direita ao longo de ~70 s; parado no reduzido.
    const anda = reduzido ? 0 : 1 - Math.exp(-(t - cometaDesde) / 70);
    cometa.position.set(olho.x + meiaL * 0.06 + lado * 0.07 * anda, olho.y + meiaA * 0.55 - lado * 0.06 * anda, olho.z - 3.2);
    cometa.scale.set(lado, lado, 1);
    cometa.material.opacity = k * k * (0.9 + 0.06 * Math.sin(0.9 * t)) * comuns.uSurgir.value;
    cometa.visible = true;
  }

  // Chamado por mundo.js a cada quadro, antes do render. `deriva` é o passo de
  // base: a alameda fica parada e a câmera anda; sem ele a alameda para de vir.
  function atualizar(dt, t, deriva = 0) {
    const tempo = Number.isFinite(t) ? t : 0;
    const passo = Number.isFinite(dt) ? dt : 0;
    derivaAtual = Number(deriva) || 0;
    comuns.uTempo.value = tempo;
    comuns.uDeriva.value = derivaAtual;
    camera.getWorldPosition(olho);
    camPos.set(olho.x, olho.y, olho.z - derivaAtual);
    // As lanternas mais próximas se acendem conforme ela anda: o alcance cresce
    // com o caminho já feito (até 17 m à frente) e não volta atrás.
    const zA = camPos.z;
    if (zInicio === null) zInicio = zA;
    const alvoPerto = Math.min(17, Math.max(0, zInicio - zA) * 2.4);
    if (alvoPerto > comuns.uPassoLuz.value) comuns.uPassoLuz.value = alvoPerto;

    // O vão segue a câmera de lado com atraso (~1,25 s): o galho sai do caminho
    // do olhar devagar, como quem passa por baixo.
    const vao = comuns.uVao.value;
    if (!vaoIniciado) {
      vao.x = camPos.x;
      vaoIniciado = true;
    } else {
      vao.x += (camPos.x - vao.x) * (1 - Math.exp(-Math.min(passo, 0.1) * 0.8));
    }
    comuns.uVaoZ.value = camPos.z;

    ceu.position.copy(camPos);
    // O salto de 1 m não aparece: o chão é pintado pelas coordenadas da alameda.
    chao.position.set(Math.round(camPos.x), 0, Math.round(camPos.z));
    const vaga = Math.floor(camPos.z / 2);
    if (vaga !== ultimaVaga) {
      ultimaVaga = vaga;
      colocar(camPos.z);
    }
    // O tamanho do ponto é em pixels do buffer: a altura da tela vezes a DPR.
    uPx.value = 0.055 * (tamanho?.altura || 1) * (tamanho?.dpr || 1);
    atualizarCometa(tempo);
  }

  /** Nasce da noite: uSurgir de 0 a 1 em `duracao` s, linear, e o fog com ele. */
  function surgir(duracao = 1.8) {
    grupo.visible = true;
    surgido = true;
    const u = comuns.uSurgir;
    gsap?.killTweensOf(u);
    const d = Math.max(0, Number(duracao) || 0);
    if (!gsap || d === 0) {
      u.value = 1;
      pintarNevoa();
      return;
    }
    gsap.to(u, { value: 1, duration: d, ease: 'none', onUpdate: pintarNevoa, onComplete: pintarNevoa });
  }

  /** Afasta a dissolução dos cartões para `metros` (0 volta ao normal): nada na frente da folha. */
  function afastar(metros = 0, duracao = 1.2) {
    const m = Math.max(0, Number(metros) || 0);
    const x = m > 0 ? m : 0.55;
    const y = m > 0 ? m + 0.45 : 1.25;
    const d = Math.max(0, Number(duracao) || 0);
    const alvo = uPerto.value;
    if (!gsap || d === 0) {
      gsap?.killTweensOf(alvo);
      alvo.set(x, y);
      return;
    }
    gsap.to(alvo, { x, y, duration: d, ease: 'power2.out', overwrite: true });
  }

  aplicarNivel(nivelAtual);
  colocar(0);
  cena.add(grupo);

  // Os programas compilam antes de aparecer (também os do grupo invisível). No
  // iPhone a compilação pode demorar: 2,5 s no máximo, e o que faltar compila
  // no primeiro desenho.
  let compilando;
  try {
    compilando = Promise.resolve(renderer.compileAsync?.(grupo, camera, cena)).catch(() => {});
  } catch {
    compilando = Promise.resolve();
  }
  const pronta = Promise.race([compilando, espera(2500)]).then(() => {});

  return {
    grupo,
    pronta,
    surgir,
    atualizar,
    aplicarHora,
    nivel: aplicarNivel,
    afastar,
    uniformes: comuns,
    centro: (z) => centroCaminho(z - derivaAtual),
  };
}
