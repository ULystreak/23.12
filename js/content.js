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
   Abra o site com um destes finais no endereço (os atalhos pulam a senha):
     ?cena=senha      a tela preta com a senha (é como o site abre sem atalho)
     ?cena=musica     a escolha da música, na tela preta
     ?cena=inicio     as frases, a caminhada e a primeira carta
     ?cena=poppy      o capítulo do jogo e a carta indo para o bolso
     ?cena=carta2     a segunda carta
     ?cena=yourname   o capítulo do filme e a carta indo para o bolso
     ?cena=mao        "Olha a sua mão.", o fio e a corrida até você
     ?cena=cartas     as cartas no chão (os vídeos dos amigos e a Surpresinha)
     ?cena=encontro   as imagens do encontro
     ?cena=final      a última carta
   ========================================================================== */

window.CONTEUDO = {

  /* --------------------------------------------------------------------------
     PÁGINA
     O título que aparece na aba do navegador (neutro de propósito, para não
     entregar a surpresa na prévia do link) e a foto do fundo do mundo.
     ------------------------------------------------------------------------ */
  pagina: {
    titulo: 'Para você',

    // O lugar do mundo das cartas: uma alameda de cerejeiras em flor, atrás
    // das frases do começo, das caminhadas, da mão e da última carta (os
    // capítulos não mudam). Com WebGL ela é construída em 3D pelo próprio site
    // (js/mundo/alameda.js) e ela anda por dentro dela. Este arquivo é a mesma
    // alameda renderizada numa imagem (2000 × 2000, ponto de fuga no centro),
    // usada só no aparelho sem WebGL. Para refazê-la depois de mexer na
    // alameda: node _dev/alameda-imagem.mjs.
    // Deixe vazio ('') para voltar ao mundo todo branco (com e sem WebGL).
    fundo: 'assets/images/alameda.webp',
  },

  /* --------------------------------------------------------------------------
     SENHA
     A primeira coisa que ela vê: a tela toda preta e um campo para os números.
     Errou, o campo treme de leve e esvazia; acertou, a tela se desfaz e vem a
     escolha da música.

     Não é segurança de verdade (quem abrir este arquivo lê a senha): é um
     ritual, só ela sabe o número. Os atalhos ?cena=... pulam esta tela.
     ------------------------------------------------------------------------ */
  senha: {
    // A senha que abre a carta, entre aspas. Pode ter números, letras, o que
    // você quiser. 8035 = os dias que ela está viva ao fazer 22 anos.
    // O campo não mostra quantos caracteres a senha tem.
    // Deixe vazio ('') para a carta abrir sem pedir senha.
    codigo: '8035',

    // Frase pequena acima do campo (opcional; '' = só o campo, sem frase).
    // [Só você sabe.]
    frase: '',

    // O aviso que aparece toda vez que ela erra.
    erro: 'Senha errada.',

    // As dicas, na ordem: a primeira aparece depois do 1º erro, a segunda
    // depois do 2º, a terceira depois do 3º. Do 4º erro em diante fica a
    // última. Pode pôr mais ou menos linhas; [] = nenhuma dica.
    dicas: [
      'sao numeros....',
      'eu ja te falei qual senha seria',
      'o numero de dias da sua idade',
    ],

    // Nome do campo, lido em voz alta por leitores de tela (não aparece escrito).
    rotulo: 'Senha',
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
     Depois da senha, ainda na tela preta, ela escolhe uma música passando as
     capas para o lado com o dedo. Quando ela confirma, a música começa e o
     mundo branco com as árvores aparece. A música toca em repetição, baixinha,
     até o fim.
     ------------------------------------------------------------------------ */
  musica: {
    // Frase no alto, acima das capas.
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
      // Nomes das setas do seletor de capas (só existem com duas ou mais músicas).
      anterior: 'Música anterior',
      proxima: 'Próxima música',
      // Só é usado se o texto do botão "continuar" lá de cima ficar vazio (''):
      // aí o botão vira só o desenho, e este nome é lido em voz alta por
      // leitores de tela.
      continuar: 'Continuar',
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

    // Texto do botão do fim do capítulo: ela guarda esta carta no bolso (e a
    // carta passa a morar na bolsa, no canto de baixo). É o botão de parar do
    // videocassete. Se ficar vazio (''), o botão continua lá, só com o desenho.
    fechar: 'Guardar no bolso',
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
    // ATENÇÃO: a capa, o encontro e o par de agora são quadros do filme (com os
    // personagens; o encontro traz até o logotipo e a assinatura de outro artista).
    // A regra da carta é não copiar quadros, personagens nem logotipos do filme.
    // Troque por fotos de vocês ou céus e lugares parecidos; a capa pode ficar ''
    // (o capítulo abre só com o título e o céu). Prefira .webp ou .jpg: a capa em
    // .png pesava 302 kB; em .webp (qualidade 95) a mesma imagem tem 43 kB.
    // Tamanho das imagens do capítulo (capa, imagem-cheia, par): pelo menos
    // 1300 px de largura, porque o iPhone mostra em 3x (as de agora têm 533 e 860).
    capa:'assets/images/yourname-capa.webp',

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

    // Texto do botão do fim do capítulo: ela guarda esta carta no bolso. É ao
    // guardar esta que o fio vermelho aparece.
    fechar: 'Guardar no bolso',

    // Só é usado se o texto de cima ficar vazio (''): aí o fecho vira só o fio
    // sublinhado, e este nome é lido em voz alta por leitores de tela.
    rotuloFechar: 'Guardar no bolso',
  },

  /* --------------------------------------------------------------------------
     O BOLSO E A BOLSA (o inventário)
     Quando ela toca em "Guardar no bolso" no fim de um capítulo, a mão dela
     (com o uniforme de verão da Mitsuha) leva a carta até o bolso da saia.
     Depois da primeira carta guardada aparece o botão da bolsa, no canto de
     baixo, à direita: ali fica tudo o que ela já guardou (as duas cartas e
     cada carta do chão que ela já abriu). Tocar num item abre de novo.
     ------------------------------------------------------------------------ */
  inventario: {
    // O título no alto da bolsa aberta.
    titulo: 'Sua bolsa',

    // O nome de cada carta dentro da bolsa.
    cartaPoppy: 'A carta do jogo',
    cartaYourname: 'A carta do filme',

    // Nomes lidos em voz alta por leitores de tela (não aparecem escritos).
    rotulos: {
      abrir: 'Abrir a bolsa',
      fechar: 'Fechar a bolsa',
      // Dito enquanto a animação do bolso acontece.
      guardando: 'Você guarda a carta no bolso.',
    },
  },

  /* --------------------------------------------------------------------------
     A MÃO
     Quando ela guarda a segunda carta no bolso, o fio vermelho aparece: uma
     frase e a mão dela com o fio no pulso. O botão faz o fio virar o caminho e
     ela CORRE por ele até você. Perto de você, as cartas do chão.
     ------------------------------------------------------------------------ */
  mao: {
    // A frase funciona melhor curta, em uma linha só: uma frase longa quebra
    // em várias linhas e desce até cobrir o desenho da mão.
    frase:'Olha a sua mão.',

    // O que aparece escrito na palma da mão dela, à caneta, letra por letra,
    // logo depois de a mão aparecer (como no filme, quando ele escreve na mão
    // dela). Funciona melhor curto: até umas quatro palavras pequenas.
    // Deixe vazio ('') para a mão ficar sem nada escrito.
    // (Só vale na mão desenhada pelo site: com a "imagem" aqui de baixo
    // preenchida, o site não sabe onde fica a palma e não escreve nada.)
    escrito: 'eu te amo',

    // Imagem da mão com o fio (opcional; sem ela, o site desenha uma).
    // Quando existir: 'assets/images/mao-akai-ito.webp'
    imagem: '',

    // Em que ponto da imagem o fio está amarrado, para o caminho sair
    // exatamente dali. x vai de 0 (borda esquerda) a 1 (borda direita);
    // y vai de 0 (topo) a 1 (base). 0.5 e 0.5 é o centro da imagem.
    // Só vale quando há imagem: a mão desenhada já sabe onde fica o nó.
    ancoraFio: { x: 0.5, y: 0.62 },

    // Texto do botão que aparece embaixo da mão.
    botao: 'Seguir o fio',

    // Só é usado se o texto de cima ficar vazio (''): aí o botão vira só o
    // desenho, e este nome é lido em voz alta por leitores de tela.
    rotuloBotao: 'Seguir o fio',

    // Você no fim do fio: enquanto ela caminha, um rapaz de pé, de costas,
    // aparece lá longe na alameda, esperando, e vai ficando maior conforme
    // ela chega perto; o fio termina na mão dele. true = aparece; false = não.
    // (Ele só aparece quando existe a parte "encontro" logo abaixo, e some
    // em aparelhos muito antigos, sem aceleração gráfica.)
    ele: true,
  },

  /* --------------------------------------------------------------------------
     A CORRIDA
     Depois de "Seguir o fio" ela corre pela alameda até você: o fio esticado
     à frente, as pétalas passando, você ficando maior. Ela desacelera ao
     chegar, e as cartas estão no chão entre vocês dois.
     ------------------------------------------------------------------------ */
  corrida: {
    // Quantos segundos ela corre. Entre 5 e 10 fica bom.
    segundos: 7,
  },

  /* --------------------------------------------------------------------------
     AS CARTAS DO CHÃO (os vídeos dos amigos e a Surpresinha)
     Quando ela chega perto de você, há cartas no chão. No chão elas NÃO têm
     nome: ela toca numa, o vídeo toca, e só quando ela fecha o NOME de quem
     gravou aparece escrito à mão na carta. Cada carta aberta vai para a bolsa.
     Depois da primeira carta aberta aparece, discreto, o botão de seguir em
     frente; quando ela já abriu todas, ele ganha destaque.

     A ordem das cartas é a ordem desta lista. A última, a Surpresinha, é
     diferente: em vez de um vídeo só, é uma sequência de fotos e vídeos de
     vocês, que ela passa para o lado.

     ENQUANTO O VÍDEO NÃO CHEGA
     Carta com video: '' aparece do mesmo jeito e abre um cartão com o texto
     do campo "vazio" aqui embaixo ("[vídeo de Sariel vem aqui]"), para você
     ver tudo funcionando. Para uma carta NÃO aparecer, apague o bloco dela.

     COMO COLOCAR UM VÍDEO
     1. Ponha o arquivo na pasta assets/videos/ (crie a pasta se não existir).
        Use nomes simples, sem espaço nem acento: assets/videos/sariel.mp4
     2. Escreva o caminho no campo video da pessoa:
        video: 'assets/videos/sariel.mp4'

     FORMATO DO VÍDEO
     - MP4 (vídeo H.264 e som AAC). É o que o iPhone grava quando a câmera está
       em "Mais compatível" e o que qualquer app de compressão gera.
       Vídeo .mov ou HEVC do iPhone: converta para MP4 antes (veja abaixo).
     - Pode ser em pé ou deitado: a carta mede sozinha e ajusta a moldura.
     - Até uns 25 MB cada (o GitHub aceita até 100 MB por arquivo, mas ela vai
       abrir no 4G: quanto mais leve, mais rápido começa). Um vídeo de 1 minuto
       em 720p fica com uns 10 a 15 MB.

     COMO COMPRIMIR
     - Pelo celular: um app de comprimir vídeo (por exemplo "Video Compressor")
       exportando em MP4, 720p.
     - Pelo computador, com o HandBrake (grátis): predefinição "Fast 720p30".
     - Pelo computador, com o ffmpeg (uma linha só no terminal):
         ffmpeg -i original.mov -vf "scale=w=1280:h=1280:force_original_aspect_ratio=decrease:force_divisible_by=2" -c:v libx264 -crf 26 -preset slow -pix_fmt yuv420p -c:a aac -b:a 128k -movflags +faststart assets/videos/sariel.mp4
       Serve para vídeo em pé e deitado: o lado maior fica com no máximo
       1280 px. O "+faststart" faz o vídeo começar antes de baixar inteiro.

     Se um vídeo não carregar (arquivo com nome errado, por exemplo), a carta
     mostra só o nome e conta como vista: nada trava.
     ------------------------------------------------------------------------ */
  cartasChao: {
    // Frase que aparece no alto quando ela chega (opcional; '' = sem frase).
    frase: '[Algumas pessoas também queriam te dizer uma coisa.]',

    // Texto do botão de seguir em frente.
    seguir: 'Seguir em frente',

    // O cartão que abre quando a carta ainda não tem vídeo (ou a Surpresinha
    // ainda não tem nada). {nome} é trocado pelo nome da carta.
    vazio: '[vídeo de {nome} vem aqui]',
    vazioSurpresinha: '[os nossos momentos vêm aqui]',

    // Nomes lidos em voz alta por leitores de tela (não aparecem escritos).
    rotulos: {
      // {n} é trocado pelo número da carta (ela ainda não sabe de quem é).
      carta: 'Carta {n}',
      fechar: 'Fechar',
      anterior: 'Anterior',
      proxima: 'Próxima',
    },

    // As cartas dos amigos, na ordem.
    //   nome:  quem gravou; aparece escrito à mão na carta DEPOIS que ela abre
    //   video: o .mp4 dentro de assets/videos/ ('' = ainda não chegou)
    //   capa:  imagem opcional mostrada enquanto o vídeo carrega ('' se não tiver)
    itens: [
      { nome: 'Sariel', video: '', capa: '' },
      { nome: 'Ana', video: '', capa: '' },
      { nome: 'Mirai', video: '', capa: '' },
      { nome: 'Alpha', video: '', capa: '' },
      { nome: 'Pocoyoh', video: '', capa: '' },
      { nome: 'Nup', video: '', capa: '' },
    ],

    // A última carta do chão: os momentos de vocês dois, em fotos e vídeos que
    // ela passa para o lado. Para tirar a Surpresinha, deixe o nome vazio ('').
    surpresinha: {
      nome: 'Surpresinha',

      // As fotos e os vídeos, na ordem em que aparecem. Fotos em
      // assets/images/, vídeos em assets/videos/. Exemplos de linhas prontas:
      //
      //   { foto: 'assets/images/nos-1.webp', legenda: '[O dia em que...]' },
      //   { video: 'assets/videos/nos-1.mp4', legenda: '' },
      //
      // "legenda" é opcional (pode ficar '' ou nem existir).
      midias: [
      ],
    },
  },

  /* --------------------------------------------------------------------------
     O ENCONTRO
     Depois que ela vê as cartas do chão e segue em frente, a alameda escurece e estas imagens passam
     sozinhas, uma de cada vez, como cenas de um filme: o fio leva até você.
     No fim, o fio vermelho do site liga um dedinho ao outro, vem um clarão e
     a última carta aparece.

     COMO FUNCIONA
     - As imagens passam na ordem em que estão aqui. Ela não precisa tocar em nada.
     - Para tirar uma imagem, apague o bloco { ... } dela (com a vírgula do fim).
     - Se a lista ficar vazia (quadros: []), esta parte não existe e a carta
       vai direto do fio para a última carta, como antes.
     - Imagem com o nome errado é pulada sozinha, sem aviso na tela.
     - Use imagens deitadas (largas). Quanto maiores, mais nítidas ficam.

     CAMPOS DE CADA IMAGEM
     Os pontos são frações da imagem: x vai de 0 (borda esquerda) a 1 (borda
     direita); y vai de 0 (topo) a 1 (base). 0.5 e 0.5 é o centro.
       imagem: o caminho do arquivo em assets/images/
       alt:    descrição curta, lida em voz alta por leitores de tela
       foco:   onde a câmera começa olhando (opcional; sem ele, o centro)
       ate:    para onde a câmera desliza devagar (opcional; sem ele, fica no foco)
       fio:    só na primeira imagem: o ponto em que o fio vermelho da imagem
               chega perto da borda de baixo. O fio do site sobe do pé da tela
               e emenda nele ali (opcional)
       dedo:   só nas duas imagens das mãos: onde está o dedinho com o fio.
               As duas imagens que têm "dedo" voltam juntas no fim, e o fio do
               site liga um dedinho ao outro. A primeira é a dela, a segunda a
               sua (opcional; sem as duas, o clarão vem logo depois da última imagem)
       aparar: corta uma tirinha de uma borda que veio com defeito (uma faixa
               preta, por exemplo). Ex.: aparar: { base: 0.03 } tira 3% de
               baixo. Também aceita topo, esquerda e direita (opcional)
       fim:    fim: true marca a imagem que fecha a cena: ela entra depois das
               mãos, e é dela que vem o clarão. Só uma imagem pode ter; esta
               pode ser em pé (opcional; sem ela, o clarão vem das mãos)
     ------------------------------------------------------------------------ */
  encontro: {
    quadros: [
      {
        imagem: 'assets/images/encontro-mitsuha-costas.webp',
        alt: 'Ela, de costas, olha o caminho ao entardecer. Ao longe, ele espera; o fio vermelho vai dela até ele pelo chão.',
        foco: { x: 0.37, y: 0.4 },
        ate: { x: 0.74, y: 0.55 },
        fio: { x: 0.655, y: 0.915 },
        aparar: { base: 0.03 },
      },
      {
        imagem: 'assets/images/encontro-2-ele-ve.webp',
        alt: 'Ele, de costas, se vira e olha para trás. Ao longe, ela; o fio vermelho entre os dois.',
        foco: { x: 0.42, y: 0.35 },
        ate: { x: 0.6, y: 0.45 },
      },
      {
        imagem: 'assets/images/encontro-mitsuha-mao.webp',
        alt: 'Ela estende a mão, com o fio vermelho amarrado no dedinho.',
        foco: { x: 0.47, y: 0.4 },
        ate: { x: 0.68, y: 0.5 },
        dedo: { x: 0.745, y: 0.57 },
      },
      {
        imagem: 'assets/images/encontro-4-ele-mao.webp',
        alt: 'Ele estende a mão, com o fio vermelho amarrado no dedinho.',
        foco: { x: 0.52, y: 0.4 },
        ate: { x: 0.27, y: 0.46 },
        dedo: { x: 0.115, y: 0.78 },
      },
      {
        // Arte de um artista: a assinatura dele fica no alto, junto do título
        // do filme, e não é cortada. Para tirar o abraço, apague este bloco.
        imagem: 'assets/images/encontro-5-abraco.webp',
        alt: 'Os dois se abraçam sob o céu do fim da tarde, com o cometa lá no alto.',
        foco: { x: 0.5, y: 0.42 },
        ate: { x: 0.5, y: 0.56 },
        fim: true,
      },
    ],
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
