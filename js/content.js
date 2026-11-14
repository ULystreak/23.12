/* ==========================================================================
   TUDO O QUE VOCÊ PRECISA EDITAR ESTÁ NESTE ARQUIVO.

   - Textos entre crases ( ` ) podem ter várias linhas.
     Uma linha em branco começa um novo parágrafo.
   - Tudo que está entre [colchetes] é texto de exemplo: troque pelo seu.
   - Músicas vão na pasta  assets/music/   (mp3, m4a, ogg ou wav)
   - Imagens vão na pasta  assets/images/  (jpg, png, webp ou gif)

   IMAGENS: basta salvar o arquivo com o MESMO NOME que está escrito aqui.
   Enquanto o arquivo não existir, o fundo fica desenhado e a foto mostra
   um aviso com o nome que falta (só no seu computador: no site publicado
   o espaço da foto some). Veja a lista completa no LEIA-ME.md.

   TIPOS DE BLOCO (valem nos dois capítulos; pode repetir, apagar e reordenar):
     { tipo: "texto",  texto: `...` }
     { tipo: "imagem", arquivo: "assets/images/foto.jpg", legenda: "..." }
     { tipo: "imagem", arquivo: "...", largura: "cheia" }     de ponta a ponta, como um quadro de cinema
     { tipo: "par", esquerda: "...", direita: "...",          duas imagens em pé (9:16) lado a lado,
       legendaEsquerda: "...", legendaDireita: "..." }        ligadas por um fio vermelho
     { tipo: "cena",   cena: "nome" }                         um desenho animado (nomes em cada capítulo)
   ========================================================================== */

window.CONTEUDO = {

  /* Frases que aparecem no fundo branco, antes da primeira carta.
     Deixe  []  se não quiser nenhuma. */
  abertura: [
    "Feliz aniversário.",
    "Tem uma coisa esperando por você.",
  ],

  /* ---------- MÚSICAS ---------- */
  musica: {
    titulo: "Antes de abrir, escolhe a nossa trilha",
    texto: "Toque em uma música para ouvir. Ela fica baixinho enquanto você lê.",
    volume: 0.3, // de 0 (mudo) a 1 (máximo)
    // "capa" é opcional: uma imagem quadrada que aparece ao lado do nome da música
    lista: [
      { titulo: "undressed", artista: "sombr", arquivo: "assets/music/undressed.mp3", capa: "assets/music/undressed.webp" },
      { titulo: "Música de exemplo 1", artista: "[troque pelo nome da música]", arquivo: "assets/music/exemplo-1.wav" },
      { titulo: "Música de exemplo 2", artista: "[troque pelo nome da música]", arquivo: "assets/music/exemplo-2.wav" },
    ],
  },

  /* ---------- CAPÍTULO 1: POPPY PLAYTIME ----------
     Cenas disponíveis:
       { tipo: "cena", cena: "maos" }                 duas mãos, azul e vermelha, se encontrando
       { tipo: "cena", cena: "fita", rotulo: "..." }  uma fita VHS com o rótulo que você escrever
       { tipo: "cena", cena: "espiada" }              um robozinho de brinquedo espiando pelo canto
       { tipo: "cena", cena: "esteira" }              uma esteira de fábrica levando brinquedos e um coração
  */
  capitulo1: {
    tema: "poppy",
    etiqueta: "Fita 01",
    titulo: "Onde a gente se conheceu",
    capa: "",                                // opcional: imagem que abre o capítulo, de ponta a ponta
    fundo: "assets/images/poppy-fundo.jpg",  // imagem do jogo que fica atrás de tudo
    blocos: [
      { tipo: "texto", texto: `[Texto 1: conte como foi a primeira vez que vocês jogaram Poppy Playtime juntos.]

[Uma linha em branco começa outro parágrafo. Dois ou três parágrafos ficam bem em cada cartão.]` },
      { tipo: "imagem", arquivo: "assets/images/poppy-1.jpg", legenda: "" },
      { tipo: "cena", cena: "esteira" },
      { tipo: "texto", texto: `[Texto 2: o que você pensou dela naquele dia, o susto que vocês levaram, a piada que ficou.]` },
      { tipo: "cena", cena: "maos" },
      { tipo: "imagem", arquivo: "assets/images/poppy-2.jpg", legenda: "" },
      { tipo: "cena", cena: "fita", rotulo: "[nossa primeira partida]" },
      { tipo: "texto", texto: `[Texto 3: como aquele jogo virou conversa, e a conversa virou vocês dois.]` },
      { tipo: "cena", cena: "espiada" },
    ],
    fechar: "Fechar este capítulo",
  },

  /* ---------- CAPÍTULO 2: YOUR NAME ----------
     Cenas disponíveis:
       { tipo: "cena", cena: "cometa" }       o cometa que se divide em dois
       { tipo: "cena", cena: "cordao" }       o cordão trançado vermelho
       { tipo: "cena", cena: "crepusculo" }   duas pessoas se encontrando no crepúsculo
  */
  capitulo2: {
    tema: "yourname",
    etiqueta: "君の名は。",                      // só aparece se não houver capa
    titulo: "O filme que é nosso",
    capa: "assets/images/yourname-capa.png",  // a imagem que abre o capítulo
    fundo: "",                                // opcional: imagem atrás de tudo (vazio = céu desenhado)
    blocos: [
      { tipo: "texto", texto: `[Texto 1: quando vocês assistiram Your Name juntos e por que esse filme ficou sendo de vocês.]` },
      { tipo: "cena", cena: "cometa" },
      { tipo: "texto", texto: `[Texto 2: a cena favorita, a frase que vocês repetem, o que ela te lembra.]` },
      { tipo: "imagem", arquivo: "assets/images/yourname-encontro.webp", largura: "cheia", legenda: "" },
      { tipo: "cena", cena: "cordao" },
      { tipo: "texto", texto: `[Texto 3: o que você quer que ela nunca esqueça.]` },
      { tipo: "par",
        esquerda: "assets/images/yourname-visao-dele.webp", legendaEsquerda: "O que ele vê",
        direita: "assets/images/yourname-visao-dela.webp",  legendaDireita: "O que ela vê" },
    ],
    fechar: "Fechar este capítulo",
  },

  /* ---------- A MÃO E O FIO VERMELHO (o akai ito do filme) ---------- */
  mao: {
    texto: "Olha a sua mão.",
    kanji: "赤い糸",                                  // "akai ito" em japonês; deixe "" para não mostrar
    legenda: "akai ito, o fio vermelho do destino",  // aparece logo abaixo; deixe "" para não mostrar
    botao: "Seguir o fio",
  },

  /* ---------- A ÚLTIMA CARTA ---------- */
  final: {
    frase: "Agora tem muito a escrever ainda, e você vai me ajudar.",
    assinatura: "", // opcional, ex. "Com amor, [seu nome]"
  },
};
