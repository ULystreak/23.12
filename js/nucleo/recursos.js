// Recursos: pré-carga em segundo plano e acesso às imagens do content.js.
//
// Regra: recurso que falta vira null. Nunca lança exceção, e endereço vazio ('')
// nem faz pedido (por isso não aparece 404 no console).
//
//   const img = await recursos.imagem(conteudo.yourname.capa);   // HTMLImageElement | null
//   if (img) raiz.append(img);                                    // senão, a cena segue sem ela
//
// A pré-carga começa durante a abertura, uma imagem por vez e com prioridade
// baixa, para não disputar rede com a primeira tela.

import { carregarImagem } from './util.js';

const ociosa = window.requestIdleCallback
  ? (fn) => window.requestIdleCallback(fn, { timeout: 1500 })
  : (fn) => setTimeout(fn, 200);

/** Junta todos os endereços de imagem citados no content.js, na ordem em que ela vai ver. */
export function listarImagens(conteudo) {
  const lista = [];
  const por = (endereco) => {
    if (typeof endereco === 'string' && endereco.trim() && !lista.includes(endereco)) lista.push(endereco);
  };
  const c = conteudo || {};

  for (const faixa of c.musica?.faixas || []) por(faixa?.capa);

  por(c.poppy?.fundo);
  for (const bloco of c.poppy?.blocos || []) por(bloco?.arquivo);

  por(c.yourname?.capa);
  por(c.yourname?.fundo);
  for (const bloco of c.yourname?.blocos || []) {
    por(bloco?.arquivo);
    por(bloco?.dele);
    por(bloco?.dela);
  }

  por(c.mao?.imagem);
  return lista;
}

export function criarRecursos(conteudo) {
  const imagens = new Map(); // endereço → Promise<HTMLImageElement | null>
  let iniciado = false;

  const recursos = {
    /** Imagem pronta para usar (já decodificada) ou null. Pedidos repetidos reaproveitam o mesmo. */
    imagem(endereco) {
      if (typeof endereco !== 'string' || !endereco.trim()) return Promise.resolve(null);
      if (!imagens.has(endereco)) imagens.set(endereco, carregarImagem(endereco));
      return imagens.get(endereco);
    },

    /**
     * Um <img> novo para pôr na página (ou null). Usa a imagem já baixada, então
     * aparece sem piscar. `alt` vazio marca a imagem como decorativa.
     */
    async elementoImagem(endereco, alt = '') {
      const original = await recursos.imagem(endereco);
      if (!original) return null;
      const img = new Image();
      img.decoding = 'async';
      img.alt = alt || '';
      img.width = original.naturalWidth;
      img.height = original.naturalHeight;
      img.src = original.src;
      img.draggable = false;
      return img;
    },

    /** Pré-carrega uma lista de endereços, um por vez, quando o navegador estiver ocioso. */
    precarregar(lista) {
      const fila = [...lista];
      return new Promise((resolver) => {
        const proximo = () => {
          const endereco = fila.shift();
          if (endereco === undefined) return resolver();
          recursos.imagem(endereco).then(() => ociosa(proximo));
        };
        ociosa(proximo);
      });
    },

    /** Começa a pré-carga de tudo o que o content.js cita. Chamar uma vez, na abertura. */
    iniciar() {
      if (iniciado) return;
      iniciado = true;
      // As fontes que ainda não entraram (manuscrito, capítulos, títulos) chegam já agora:
      // senão cada uma só é pedida quando a primeira letra dela aparece, e numa rede de
      // celular a dica da carta, a folha da música e o capítulo do jogo nasciam na fonte
      // reserva e trocavam de letra diante dela. São ~200 kB, bem antes de serem usadas.
      try {
        if (document.fonts) document.fonts.forEach((f) => { if (f.status === 'unloaded') f.load().catch(() => {}); });
      } catch { /* sem a API, cada fonte chega quando for usada */ }
      recursos.precarregar(listarImagens(conteudo));
    },
  };

  return recursos;
}
