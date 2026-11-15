/* ============================================================================
   CONTEÚDO DA CARTA
   ============================================================================
   Este é o ÚNICO arquivo que você precisa editar. Tudo o que ela lê, ouve e vê
   de imagem sai daqui: frases, textos dos capítulos, músicas e fotos.

   COMO EDITAR SEM QUEBRAR NADA
   - Troque só o que está entre aspas simples: 'assim'.
   - O que está entre [colchetes] é texto de exemplo: apague os colchetes e
     escreva o seu.
   - Se o seu texto tiver um apóstrofo ( ' ), escreva \' no lugar dele.
     Exemplo: 'copo d\'água'.
   - Para quebrar a linha dentro de um texto, escreva \n.
   - Cada linha de uma lista termina com vírgula. Não apague as vírgulas, as
     chaves { } nem os colchetes [ ] que ficam FORA das aspas.
   - Imagem ou música que você ainda não tem: deixe o campo vazio, assim: ''.
     A carta se arruma sozinha, sem buraco e sem aviso.
   - Imagens ficam em assets/images/ e músicas em assets/music/.

   COMO TESTAR UMA PARTE SÓ
   Abra o site com um destes finais no endereço:
     ?cena=inicio     as frases, a caminhada e a primeira carta
     ?cena=poppy      o capítulo do jogo
     ?cena=carta2     a segunda carta
     ?cena=yourname   o capítulo do filme
     ?cena=mao        "Olha a sua mão." e o fio
     ?cena=final      a última carta
   ========================================================================== */

window.CONTEUDO = {

  /* --------------------------------------------------------------------------
     PÁGINA
     O título que aparece na aba do navegador. Fica neutro de propósito, para
     não entregar a surpresa na prévia do link.
     ------------------------------------------------------------------------ */
  pagina: {
    titulo: 'Para você',
  },

  /* --------------------------------------------------------------------------
     ABERTURA
     As frases aparecem uma de cada vez no mundo branco, palavra por palavra,
     e somem antes da caminhada. Pode ter mais de duas: é só acrescentar outra
     linha entre aspas, com vírgula no fim.
     ------------------------------------------------------------------------ */
  abertura: {
    frases: [
      'Feliz aniversário.',
      'Tem uma coisa esperando por você.',
    ],

    // Aparece baixinho se ela demorar alguns segundos para tocar na carta.
    dicaCarta: 'Toque na carta.',
  },

  /* --------------------------------------------------------------------------
     MÚSICA
     Depois de abrir a primeira carta, ela escolhe uma música. A música toca em
     repetição, baixinha, até o fim.
     ------------------------------------------------------------------------ */
  musica: {
    // Frase no alto da folha, acima das capas.
    titulo: 'Escolhe a nossa música.',

    // Texto do botão que aparece depois que ela escolhe.
    continuar: 'Continuar',

    // Volume em que a música começa: 0 é mudo, 1 é o máximo. 0.3 = 30%.
    volumeInicial: 0.3,

    // Nomes dos controles do mini seletor que fica no canto (lidos em voz alta
    // por leitores de tela; não aparecem escritos na tela).
    rotulos: {
      abrir: 'Música',
      pausar: 'Pausar a música',
      tocar: 'Tocar a música',
      volume: 'Volume',
      // Nome da lista de músicas dentro do mini seletor (só aparece com duas ou mais).
      trocar: 'Trocar de música',
    },

    // As músicas, na ordem em que aparecem.
    //   titulo:  nome da música
    //   artista: quem canta
    //   arquivo: o .mp3 dentro de assets/music/
    //   capa:    a imagem da capa (quadrada fica melhor); '' se não tiver
    faixas: [
      {
        titulo: 'undressed',
        artista: 'sombr',
        arquivo: 'assets/music/undressed.mp3',
        capa: 'assets/music/undressed.webp',
      },

      // PARA ADICIONAR OUTRA MÚSICA: copie o bloco abaixo, tire as duas barras
      // do começo de cada linha e troque os nomes. Coloque o .mp3 e a capa em
      // assets/music/ com exatamente os mesmos nomes que você escrever aqui.
      //
      // {
      //   titulo: 'Nome da música',
      //   artista: 'Nome do artista',
      //   arquivo: 'assets/music/nome-do-arquivo.mp3',
      //   capa: 'assets/music/nome-da-capa.webp',
      // },
    ],
  },

  /* --------------------------------------------------------------------------
     CAPÍTULO 1: O JOGO
     A folha desenrola e vira uma fita de vídeo antiga, achada numa fábrica de
     brinquedos. O título cai em blocos de brinquedo, uma letra por bloco.

     Os "blocos" são as partes do capítulo, na ordem em que ela vai rolando.
     Você pode trocar a ordem, apagar ou repetir blocos à vontade. Tipos:

       { tipo: 'texto', texto: '...' }
           um parágrafo seu, num cartão de vidro escuro.

       { tipo: 'imagem', arquivo: '...', alt: '...', legenda: '...' }
           uma foto ou captura, mostrada num monitor antigo. "alt" descreve a
           imagem para quem não enxerga; "legenda" aparece embaixo (pode ficar
           vazia). Sem arquivo, o bloco inteiro some.

       { tipo: 'cena', cena: 'maos' }
           uma cena desenhada pelo próprio site. As três que existem:
             'maos'     duas mãos de brinquedo que se esticam conforme ela rola
                        e se encontram no meio
             'fita'     uma fita de vídeo com etiqueta escrita à mão, que entra
                        no aparelho
             'esteira'  uma esteira de fábrica onde caem caixas com palavras
     ------------------------------------------------------------------------ */
  poppy: {
    // O título: cada letra vira um bloco de brinquedo. Títulos curtos (até
    // umas 5 palavras) ficam mais bonitos.
    titulo: '[Onde a gente se conheceu]',

    // A frase digitada logo abaixo do título, com letra de videocassete.
    subtitulo: '[Fita 01: uma fábrica de brinquedos, um corredor escuro e você.]',

    // Imagem de fundo do capítulo (opcional). Sem ela, o site desenha a
    // fábrica sozinho.
    // Quando existir, salve como assets/images/poppy-fundo.webp e escreva aqui:
    // 'assets/images/poppy-fundo.webp'
    fundo: '',

    // As palavrinhas que o videocassete escreve no canto da tela.
    //   tocar:   aparece quando a fita começa                [PLAY]
    //   avancar: aparece quando ela rola rápido para baixo   [FF]
    //   voltar:  aparece quando ela rola rápido para cima    [REW]
    //   parar:   aparece quando ela fecha o capítulo         [STOP]
    // Qualquer uma pode ficar vazia (''): aí só o desenho aparece.
    osd: {
      tocar: 'PLAY',
      avancar: 'FF',
      voltar: 'REW',
      parar: 'STOP',
    },

    // O contador da fita, no canto de baixo. Começa em zero e vai subindo
    // conforme ela rola; quando ela chega ao fim do capítulo, mostra exatamente
    // este valor. Formato: horas:minutos:segundos. [0:23:12 lembra 23/12]
    // Vazio ('') esconde o contador.
    contadorFinal: '0:23:12',

    blocos: [
      {
        tipo: 'texto',
        texto: '[Antes de qualquer coisa, teve um jogo. Eu entrei naquela partida para passar o tempo e saí dela pensando em alguém que eu nem conhecia direito.]',
      },
      {
        tipo: 'cena',
        cena: 'maos',
      },
      {
        tipo: 'texto',
        texto: '[Você falava rápido, ria no meio do susto e fingia que não estava com medo. Eu fingia que estava prestando atenção no mapa. Não estava.]',
      },
      {
        tipo: 'imagem',
        // Quando existir: 'assets/images/poppy-1.webp'
        arquivo: '',
        alt: '[Captura de tela de uma das nossas primeiras partidas]',
        legenda: '[A primeira vez que a gente jogou junto.]',
      },
      {
        tipo: 'cena',
        cena: 'fita',
        // O que vai escrito à mão na etiqueta da fita.
        etiqueta: '[NOSSA PRIMEIRA PARTIDA]',
        // A data ou o texto pequeno embaixo, na mesma etiqueta.
        data: '[00/00/0000]',
      },
      {
        tipo: 'texto',
        texto: '[Uma partida virou duas. Duas viraram a noite inteira. Quando eu vi, eu estava entrando no jogo só para saber se você ia estar lá.]',
      },
      {
        tipo: 'cena',
        cena: 'esteira',
        // As palavras que caem na esteira, uma por caixa. Palavras curtas
        // cabem melhor. Entre uma caixa e outra o site põe bolas e peças.
        itens: ['[sua risada]', '[os sustos]', '[as madrugadas]', '[mais uma partida]', '[você]'],
      },
      {
        tipo: 'texto',
        texto: '[Eu nunca fui de acreditar que alguma coisa importante pudesse começar assim, de fone no ouvido e com um boneco correndo atrás da gente. Começou.]',
      },
      {
        tipo: 'imagem',
        // Quando existir: 'assets/images/poppy-2.webp'
        arquivo: '',
        alt: '[Outra captura de tela do jogo]',
        legenda: '[Essa aqui eu guardei sem você saber.]',
      },
      {
        tipo: 'texto',
        texto: '[Então, se alguém perguntar, a resposta é essa: a gente se conheceu fugindo de um brinquedo. E eu faria tudo de novo, na mesma ordem.]',
      },
    ],

    // Texto do botão que fecha o capítulo e leva para a próxima carta. É o
    // botão de parar do videocassete. Se ficar vazio (''), o botão continua
    // lá, só com o desenho.
    fechar: 'Fechar este capítulo',
  },

  /* --------------------------------------------------------------------------
     CAPÍTULO 2: O FILME
     A folha desenrola e vira um céu que vai do dia à noite conforme ela rola.

     Tipos de bloco deste capítulo:

       { tipo: 'texto', texto: '...' }
           um parágrafo seu.

       { tipo: 'cordao' }
           o cordão trançado vermelho dá um nó ali (não tem texto). Se quiser
           uma imagem no lugar do nó: { tipo: 'cordao', arquivo: '...' }.

       { tipo: 'imagem-cheia', arquivo: '...', alt: '...' }
           uma imagem de ponta a ponta da folha.

       { tipo: 'imagem', arquivo: '...', alt: '...', legenda: '...' }
           uma imagem menor, com legenda opcional.

       { tipo: 'par', dele: '...', dela: '...', legendaDele: '...', legendaDela: '...' }
           duas imagens lado a lado, ligadas por um fio: a visão dele e a dela.
     ------------------------------------------------------------------------ */
  yourname: {
    titulo: '[O nosso filme]',
    subtitulo: '[Dois lugares, o mesmo céu.]',

    // A imagem que abre o capítulo.
    capa: 'assets/images/yourname-capa.png',

    // Imagem de fundo do céu (opcional).
    // Quando existir: 'assets/images/yourname-fundo.webp'
    fundo: '',

    // Vídeo curto do céu, sem som (opcional).
    // Quando existir: 'assets/images/yourname-ceu.mp4'
    video: '',

    blocos: [
      {
        tipo: 'texto',
        texto: '[Tem um filme que a gente não consegue ver sem ficar em silêncio no final. Você sabe qual é. Eu sei exatamente em que cena você aperta a minha mão.]',
      },
      {
        tipo: 'texto',
        texto: '[Ele fala de duas pessoas que se procuram sem saber o nome uma da outra. Toda vez que eu vejo, eu penso que a gente teve sorte: eu sei o seu.]',
      },
      {
        tipo: 'cordao',
      },
      {
        tipo: 'texto',
        texto: '[No filme, o tempo é um cordão trançado: os fios se torcem, se embaraçam, às vezes se desfazem e depois se ligam de novo. Eu gosto de pensar que o nosso é assim também.]',
      },
      {
        tipo: 'imagem-cheia',
        arquivo: 'assets/images/yourname-encontro.webp',
        alt: '[Duas pessoas se encontrando no alto de uma montanha, no fim da tarde]',
      },
      {
        tipo: 'texto',
        texto: '[A hora em que o dia e a noite se encostam dura muito pouco. Foi nesse pedacinho de tempo que eles se viram. A gente também tem as nossas horas assim, e eu guardo todas.]',
      },
      {
        tipo: 'imagem',
        // Quando existir: 'assets/images/yourname-escadaria.webp'
        arquivo: '',
        alt: '[Uma escadaria numa rua tranquila]',
        legenda: '[A escadaria onde tudo se resolve.]',
      },
      {
        tipo: 'par',
        dele: 'assets/images/yourname-visao-dele.webp',
        dela: 'assets/images/yourname-visao-dela.webp',
        legendaDele: '[O que ele via.]',
        legendaDela: '[O que ela via.]',
        // Onde a fita vermelha está em cada imagem, para o fio sair e chegar
        // exatamente ali. x vai de 0 (borda esquerda) a 1 (borda direita); y vai
        // de 0 (topo) a 1 (base). Se trocar as imagens, ajuste estes números.
        fioDele: { x: 0.27, y: 0.86 },
        fioDela: { x: 0.02, y: 0.81 },
      },
      {
        tipo: 'imagem',
        // Quando existir: 'assets/images/yourname-cordao.webp'
        arquivo: '',
        alt: '[Um cordão trançado vermelho]',
        legenda: '',
      },
      {
        tipo: 'texto',
        texto: '[Se um dia eu acordar sem lembrar de nada, eu queria que sobrasse pelo menos isto: a certeza de que eu estava procurando alguém. E que era você.]',
      },
    ],

    fechar: 'Fechar este capítulo',

    // Só é usado se o texto de cima ficar vazio (''): aí o fecho vira só o fio
    // sublinhado, e este nome é lido em voz alta por leitores de tela.
    // [Fechar este capítulo]
    rotuloFechar: 'Fechar este capítulo',
  },

  /* --------------------------------------------------------------------------
     A MÃO
     Depois do segundo capítulo, uma frase e a mão dela com o fio vermelho no
     pulso. O botão faz o fio virar o caminho até a última carta.
     ------------------------------------------------------------------------ */
  mao: {
    frase: 'Olha a sua mão.',

    // Imagem da mão com o fio (opcional; sem ela, o site desenha uma).
    // Quando existir: 'assets/images/mao-akai-ito.webp'
    imagem: '',

    // Em que ponto da imagem o fio está amarrado, para o caminho sair
    // exatamente dali. x vai de 0 (borda esquerda) a 1 (borda direita);
    // y vai de 0 (topo) a 1 (base). 0.5 e 0.5 é o centro da imagem.
    // Só vale quando há imagem: a mão desenhada já sabe onde fica o nó.
    ancoraFio: { x: 0.5, y: 0.62 },

    botao: 'Seguir o fio',
  },

  /* --------------------------------------------------------------------------
     FINAL
     A última carta abre numa folha em branco, e esta frase é escrita à mão,
     letra por letra. É a última coisa que ela lê.
     ------------------------------------------------------------------------ */
  final: {
    frase: 'Agora tem muito a escrever ainda, e você vai me ajudar.',
  },

};
