/* ============================================================================
   RECURSOS: pré-carga e acesso às imagens do content.js
   ============================================================================
   Regra: recurso que falta vira null; endereço vazio não faz pedido (e não
   gera 404 no console). A pré-carga começa durante a abertura, uma imagem por
   vez e com prioridade baixa, para não disputar rede com a primeira tela.
   ========================================================================== */

import { carregarImagem } from './util.js';

const ociosa = typeof requestIdleCallback === 'function'
  ? (fn) => requestIdleCallback(fn, { timeout: 1500 })
  : (fn) => setTimeout(fn, 200);

function listarImagens(conteudo) {
  const lista = [];
  const por = (v) => {
    if (typeof v === 'string' && v.trim() && !lista.includes(v)) lista.push(v);
  };
  for (const f of conteudo?.musica?.faixas || []) por(f?.capa);
  por(conteudo?.poppy?.fundo);
  for (const b of conteudo?.poppy?.blocos || []) por(b?.arquivo);
  por(conteudo?.yourname?.capa);
  por(conteudo?.yourname?.fundo);
  for (const b of conteudo?.yourname?.blocos || []) {
    por(b?.arquivo);
    por(b?.dele);
    por(b?.dela);
  }
  por(conteudo?.mao?.imagem);
  return lista;
}

export function criarRecursos(conteudo) {
  const cache = new Map();
  let iniciado = false;

  function imagem(endereco) {
    if (typeof endereco !== 'string' || !endereco) return Promise.resolve(null);
    if (!cache.has(endereco)) cache.set(endereco, carregarImagem(endereco));
    return cache.get(endereco);
  }

  async function elementoImagem(endereco, alt = '') {
    const original = await imagem(endereco);
    if (!original) return null;
    const img = new Image();
    img.decoding = 'async';
    img.alt = alt || '';
    img.width = original.naturalWidth;
    img.height = original.naturalHeight;
    img.src = original.src;
    img.draggable = false;
    return img;
  }

  function precarregar(lista) {
    const fila = [...(lista || [])];
    return new Promise((resolve) => {
      const proximo = () => {
        const endereco = fila.shift();
        if (!endereco) {
          resolve();
          return;
        }
        imagem(endereco).then(() => ociosa(proximo));
      };
      ociosa(proximo);
    });
  }

  function iniciar() {
    if (iniciado) return;
    iniciado = true;
    try {
      // As fontes que ainda não entraram chegam já na abertura; senão cada uma
      // só é pedida quando a primeira letra dela aparece, e a letra troca na frente dela.
      document.fonts?.forEach?.((f) => {
        if (f.status === 'unloaded') f.load().catch(() => {});
      });
    } catch {
      /* sem document.fonts */
    }
    precarregar(listarImagens(conteudo));
  }

  return { imagem, elementoImagem, precarregar, iniciar };
}
