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
     ?cena=cartas     as cartas no chão (os vídeos dos amigos e "Nossos momentos")
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

    // A partir de que dia a senha dela funciona (ano-mês-dia). Antes disso,
    // digitar 8035 mostra o aviso "cedo" abaixo e não abre. '' = vale sempre.
    liberaEm: '2026-12-23',

    // O aviso quando ela acerta a senha antes do dia.
    cedo: 'Ainda não... volta no dia 23/12.',

    // Senha mestra: abre em qualquer dia (para você testar). Fica visível no
    // código do site, como a outra. '' = sem senha mestra.
    mestra: '9999',

    // Contagem até o dia (dias, horas, minutos, segundos) na tela da senha,
    // só antes de liberaEm. false = sem contagem.
    contagem: true,

    // Frase pequena acima da contagem ('' = sem frase).
    contagemFrase: 'falta pouco...',

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
    // Quando a música que ela escolheu acaba, entra a próxima desta lista (e da
    // última volta para a primeira). A letra de cada música (campo `letra`)
    // aparece no alto da tela. Para nunca mostrar letra: legenda: false.
    legenda: true,

    faixas: [
      {
        titulo: 'undressed',
        artista: 'sombr',
        arquivo: 'assets/music/undressed.mp3',
        capa: 'assets/music/undressed.webp',
        letra: `
[00:15.99] <00:16.24>Você <00:16.92>tinha <00:17.54>um <00:17.84>sonho, <00:18.90>queria <00:19.20>algo <00:19.62>melhor
[00:20.53] <00:20.78>Estava <00:21.52>cansada <00:21.84>de <00:22.20>todos <00:22.52>os <00:22.70>buracos <00:23.14>no <00:23.36>seu <00:23.60>suéter
[00:24.57] <00:24.82>Você <00:24.82>olhou <00:25.34>para <00:25.62>mim <00:26.06>e <00:27.00>se <00:27.50>perguntou <00:27.94>se
[00:28.69] <00:28.94>Eu <00:29.68>era <00:29.94>o <00:30.32>poste <00:30.58>ao <00:30.82>qual <00:31.16>você <00:31.50>estava <00:31.92>amarrada
[00:32.65] <00:32.90>Estou <00:32.90>olhando <00:33.30>para <00:33.78>você <00:34.04>e <00:34.68>você <00:35.02>está <00:35.26>olhando <00:35.80>para <00:36.08>mim
[00:36.31] <00:36.56>Mas <00:36.56>o <00:37.08>brilho <00:37.36>nos <00:37.84>seus <00:38.12>olhos <00:38.50>me <00:38.74>diz <00:39.06>que <00:39.30>você <00:39.80>quer <00:40.14>partir
[00:40.53] <00:40.78>Você <00:41.72>está <00:42.04>me <00:42.34>dizendo <00:42.84>uma <00:43.24>coisa, <00:43.68>repetindo <00:44.06>sem <00:44.34>parar
[00:44.57] <00:44.82>Mas <00:45.36>o <00:45.66>brilho <00:46.12>nos <00:46.40>seus <00:46.76>olhos <00:46.96>me <00:47.34>diz <00:47.56>uma <00:48.12>coisa <00:48.52>diferente
[00:48.69] <00:48.94>Não <00:50.44>quero <00:51.44>me <00:52.20>despir
[00:53.55] <00:53.80>Para <00:54.08>outra <00:54.36>pessoa <00:55.18>de <00:55.92>novo
[00:57.37] <00:57.62>Não <00:57.62>quero <00:58.72>beijar <00:59.10>o <00:59.50>pescoço <00:59.96>de <01:00.56>outra <01:01.24>pessoa
[01:01.31] <01:01.56>E <01:01.56>ter <01:01.98>que <01:02.46>fingir <01:02.76>que <01:03.40>é <01:04.20>o <01:04.56>seu
[01:07.34]
[01:13.85] <01:14.10>Peguei <01:14.98>o <01:15.26>trem <01:15.70>para <01:17.08>ver <01:17.36>minha <01:17.74>mãe
[01:18.95] <01:19.20>Olho <01:19.20>do <01:19.50>outro <01:20.02>lado <01:20.34>dos <01:20.60>trilhos <01:20.60>e <01:20.94>vejo <01:21.18>você <01:21.46>com <01:21.70>outro
[01:22.45] <01:22.70>Não <01:23.52>há <01:23.78>nada <01:24.64>pior <01:25.12>do <01:26.06>que <01:26.94>ver <01:27.76>seu <01:28.26>amor
[01:28.89] <01:29.14>Seguindo <01:29.14>em <01:29.30>frente <01:29.30>enquanto <01:29.70>você <01:29.70>ainda <01:29.86>sofre
[01:30.61] <01:30.86>Estou <01:30.90>olhando <01:31.62>para <01:31.98>você <01:32.94>e <01:33.38>você <01:33.74>está <01:34.62>olhando <01:34.98>para <01:35.30>mim
[01:35.79] <01:36.04>Mas <01:36.42>o <01:36.60>brilho <01:36.94>nos <01:37.24>seus <01:37.72>olhos <01:38.06>me <01:38.74>diz <01:39.82>que <01:39.96>você <01:40.20>quer <01:40.68>partir
[01:40.91] <01:41.16>Você <01:41.62>está <01:41.96>me <01:42.28>dizendo <01:42.82>uma <01:43.30>coisa, <01:43.60>repetindo <01:44.06>sem <01:44.34>parar
[01:44.67] <01:44.92>Mas <01:45.26>o <01:45.52>brilho <01:46.06>nos <01:46.38>seus <01:47.86>olhos <01:48.46>me <01:48.80>diz <01:49.36>uma <01:50.22>coisa <01:51.16>diferente
[01:51.49] <01:51.74>Não <01:51.96>quero <01:53.10>me <01:53.84>despir
[01:55.23] <01:55.48>Para <01:55.48>outra <01:55.48>pessoa <01:55.48>de <01:55.48>novo
[01:56.63] <01:56.68>Não <01:57.10>quero <01:57.90>beijar <01:58.50>o <01:59.44>pescoço <02:00.30>de <02:00.62>outra <02:02.18>pessoa
[02:04.59] <02:04.84>E <02:04.84>ter <02:05.40>que <02:05.72>fingir <02:06.18>que <02:07.04>é <02:07.92>o <02:08.70>seu
[02:08.91] <02:09.16>E <02:09.16>não <02:09.64>quero <02:09.98>conhecer <02:09.98>outro <02:10.22>cheiro
[02:10.31] <02:10.44>Não <02:10.96>quero <02:11.44>que <02:11.92>os <02:12.22>filhos <02:12.66>de <02:13.00>outro <02:13.50>homem
[02:13.55] <02:13.80>Tenham <02:14.14>os <02:14.44>olhos <02:15.06>da <02:15.40>garota <02:16.26>que <02:22.50>não <02:23.78>vou <02:24.66>esquecer
[02:32.43] <02:32.68>Não <02:32.68>vou <02:32.68>esquecer
[02:33.83] <02:33.96>Não <02:34.34>quero <02:35.76>me <02:37.24>despir
[02:37.57] <02:37.82>Para <02:37.82>outra <02:38.62>pessoa <02:39.42>de <02:40.26>novo
[02:40.77] <02:41.02>Não <02:42.20>quero <02:42.64>beijar <02:42.96>o <02:43.42>pescoço <02:44.06>de <02:44.70>outra <02:45.00>pessoa
[02:45.59] <02:45.84>E <02:45.84>ter <02:46.22>que <02:46.22>fingir <02:46.84>que <02:47.52>é <02:47.52>o <02:48.04>seu
[02:49.03] <02:49.28>Não <02:50.44>quero <02:51.50>me <02:53.26>despir
[02:53.81] <02:54.06>Para <02:54.36>outra <02:55.20>pessoa <02:55.92>de <02:56.62>novo
[02:59.10]
`,
      },
      {
        titulo: 'we never dated',
        artista: 'sombr',
        arquivo: 'assets/music/we-never-dated.mp3',
        capa: 'assets/music/we-never-dated.webp',

        // A LETRA EM PORTUGUÊS, passando no alto da tela enquanto a música toca.
        // Um verso por linha, com o tempo em que ele começa na música (minuto:segundo):
        //   [00:12.50] primeiro verso
        //   [00:16.80] segundo verso
        // Cole tudo entre as duas crases (`). Vazio = sem letra para esta música.
        // Para marcar os tempos sem esforço, abra _dev/marcar-letra.html no computador
        // (dois cliques no arquivo; o site publicado não tem a pasta _dev): cole a letra,
        // toque "Agora!" a cada verso enquanto a música toca e copie o resultado.
        // Ou ponha a letra em letra-1.txt (primeira música) ou letra-2.txt (segunda),
        // na pasta do site, e rode o colocar-letra.bat.
        letra: `
[00:11.47] <00:11.72>Nós <00:11.72>nunca <00:11.72>namoramos
[00:12.87] <00:12.87>Você <00:12.87>era <00:12.94>inteligente, <00:14.62>sabia <00:14.86>quando <00:15.08>dizer <00:15.24>suas <00:15.84>falas
[00:16.51] <00:16.76>E <00:17.52>fazer <00:18.26>parecer <00:18.52>que <00:18.90>você <00:19.38>não <00:19.74>era <00:20.12>tão <00:20.52>inteligente
[00:21.29] <00:21.54>Você <00:21.54>era <00:21.54>melhor <00:21.54>em <00:21.54>todos <00:21.54>os <00:21.54>sentidos <00:21.54>por <00:21.54>design
[00:22.69] <00:22.69>Você <00:22.69>era <00:23.42>boa <00:24.08>demais <00:24.08>para <00:24.64>o <00:24.82>confinamento <00:24.82>de <00:25.00>um <00:25.22>homem
[00:26.47] <00:26.72>Como <00:27.72>é <00:28.14>que <00:29.10>nunca <00:29.36>namoramos?
[00:30.05] <00:30.30>Mas <00:30.30>ainda <00:30.84>me <00:31.08>pego <00:31.36>pensando <00:31.78>em <00:31.92>você <00:32.36>todos <00:32.80>os <00:33.34>dias?
[00:33.67] <00:33.92>Por <00:33.92>que <00:33.92>você <00:33.92>sempre <00:33.92>me <00:33.92>deixa <00:33.92>dolorido?
[00:35.07] <00:35.07>Quando <00:35.07>você <00:35.08>nunca <00:35.32>foi <00:35.80>minha <00:36.30>para <00:36.68>ser <00:37.10>tomada?
[00:38.69] <00:38.94>Eu <00:38.94>não <00:38.94>posso <00:38.94>fazer <00:38.94>você <00:38.94>me <00:38.94>amar
[00:40.09] <00:40.18>Não, <00:40.18>eu <00:40.52>não <00:40.96>posso <00:41.40>fazer <00:41.40>você <00:41.76>me <00:42.40>amar
[00:43.87] <00:44.12>Querida, <00:44.34>eu <00:44.66>não <00:44.86>consigo <00:45.44>fazer <00:45.88>você <00:46.32>me <00:46.78>amar
[00:47.93] <00:48.18>Não, <00:48.18>eu <00:48.98>não <00:49.52>posso <00:49.74>fazer <00:49.74>você <01:01.58>me <01:01.72>amar
[01:01.89] <01:02.14>Eu <01:02.38>não <01:02.82>posso <01:03.22>fazer <01:03.50>você <01:06.28>me <01:06.34>amar
[01:06.77] <01:07.02>Não, <01:07.02>eu <01:07.02>não <01:07.02>posso <01:07.02>fazer <01:07.02>você <01:07.02>me <01:07.02>amar
[01:08.17] <01:08.17>Querida, <01:08.17>eu <01:08.28>não <01:08.52>consigo <01:08.90>fazer <01:09.96>você <01:10.16>me <01:10.58>amar
[01:12.67] <01:12.92>Não, <01:13.58>eu <01:13.94>não <01:14.22>posso <01:14.60>fazer <01:15.22>você <01:15.90>me <01:16.34>amar
[01:16.45] <01:16.70>Você <01:16.70>é <01:16.70>bonita, <01:16.70>boa <01:16.70>para <01:16.70>romantizar
[01:17.85] <01:17.85>Mas <01:17.85>você <01:17.85>não <01:17.85>se <01:17.85>torna <01:17.96>fácil <01:17.96>de <01:18.36>gostar
[01:19.25] <01:19.25>Você <01:19.40>gosta <01:19.84>de <01:20.40>se <01:21.06>divertir, <01:22.32>você <01:23.20>dança <01:23.54>ao <01:23.98>redor <01:24.52>da <01:25.10>linha
[01:25.41] <01:25.66>Do <01:25.66>que <01:26.32>é <01:26.70>errado <01:27.08>e <01:27.08>do <01:27.60>que <01:27.94>é <01:28.56>certo
[01:29.03] <01:29.28>Como <01:29.28>é <01:29.28>que <01:29.28>nunca <01:29.28>namoramos?
[01:30.43] <01:30.43>Mas <01:30.43>ainda <01:30.46>me <01:30.96>pego <01:30.96>pensando <01:31.46>em <01:32.16>você <01:32.16>todos <01:32.50>os <01:33.18>dias?
[01:34.13] <01:34.38>Por <01:35.52>que <01:35.88>você <01:36.38>sempre <01:36.82>me <01:37.18>deixa <01:37.60>dolorido?
[01:38.85] <01:39.10>Quando <01:39.10>você <01:39.70>nunca <01:39.70>foi <01:40.04>minha <01:40.04>para <01:40.26>ser <01:40.26>tomada?
[01:40.61] <01:40.86>Eu <01:40.86>não <01:41.28>posso <01:41.28>fazer <01:41.72>você <01:41.72>me <01:42.08>amar
[01:43.01] <01:43.26>Não, <01:44.42>eu <01:44.88>não <01:45.14>posso <01:56.90>fazer <01:57.24>você <01:57.48>me <01:57.74>amar
[01:57.83] <01:58.08>Querida, <01:58.08>não <01:58.72>consigo <01:58.72>fazer <01:58.90>você <01:58.90>me <01:59.28>amar
[01:59.37] <01:59.62>Não, <01:59.62>eu <01:59.96>não <02:00.40>posso <02:01.04>fazer <02:01.28>você <02:01.70>me <02:02.16>amar
[02:02.13] <02:02.38>Eu <02:02.38>não <02:02.78>posso <02:02.78>fazer <02:02.78>você <02:02.78>me <02:03.30>amar
[02:03.53] <02:03.60>Não, <02:03.60>eu <02:04.26>não <02:04.44>posso <02:04.82>fazer <02:04.82>você <02:05.22>me <02:05.98>amar
[02:06.19] <02:06.44>Querida, <02:06.44>eu <02:07.10>não <02:07.10>consigo <02:07.44>fazer <02:07.66>você <02:07.66>me <02:08.10>amar
[02:08.11] <02:08.36>Não, <02:08.36>eu <02:08.94>não <02:08.94>posso <02:09.42>fazer <02:10.12>você <02:10.12>me <02:10.58>amar
[02:14.58]
[02:20.35] <02:20.60>Eu <02:20.60>desejo <02:21.46>nada <02:22.18>além <02:22.48>do <02:22.74>melhor <02:23.24>para <02:23.76>você
[02:24.21] <02:24.46>Mas <02:24.46>espero <02:24.74>que <02:25.48>o <02:25.74>próximo <02:26.00>veja <02:26.78>o <02:27.44>resto <02:27.84>de <02:28.40>você
[02:29.87] <02:30.12>Como <02:30.12>é <02:30.12>que <02:30.12>nunca <02:30.12>namoramos?
[02:31.27] <02:31.27>Mas <02:31.27>ainda <02:31.34>me <02:31.64>pego <02:31.94>pensando <02:32.26>em <02:32.26>você <02:32.50>todos <02:32.58>os <02:32.80>dias?
[02:34.55] <02:34.80>(Ainda <02:35.12>me <02:35.44>pego <02:36.20>pensando <02:36.70>em <02:37.10>você)
[02:39.21] <02:39.46>Por <02:39.46>que <02:39.46>você <02:39.46>sempre <02:39.46>me <02:39.46>deixa <02:39.46>dolorido?
[02:40.61] <02:40.61>Quando <02:40.61>você <02:40.94>nunca <02:41.12>foi <02:41.52>minha <02:41.76>para <02:42.02>ser <02:42.28>tomada?
[02:43.29] <02:43.54>(Quando <02:43.54>você <02:43.76>nunca <02:43.76>foi <02:43.94>minha <02:43.94>para <02:44.22>ser <02:44.22>tomada)
[02:44.69] <02:44.69>Como <02:45.20>é <02:45.88>que <02:46.32>nunca <02:46.78>namoramos?
[02:48.15] <02:48.40>Mas <02:48.40>ainda <02:49.36>me <02:49.78>pego <02:50.08>pensando <02:50.38>em <02:50.62>você <02:50.94>todos <02:51.96>os <02:52.10>dias?
[02:52.43] <02:52.68>(Ainda <02:52.68>me <02:52.68>pego <02:52.68>pensando <02:52.68>em <02:52.68>você)
[02:53.83] <02:53.83>Por <02:53.92>que <02:54.10>você <02:54.56>sempre <02:55.06>me <02:55.60>deixa <02:55.98>dolorido?
[02:56.63] <02:56.88>Quando <02:56.88>você <02:58.12>nunca <02:58.12>foi <02:58.74>minha <02:58.74>para <02:58.94>ser <02:58.94>tomada?
[02:59.07] <02:59.32>Eu <02:59.32>não <02:59.44>posso <02:59.94>fazer <03:00.10>você <03:00.42>me <03:00.92>amar
[03:01.03] <03:01.28>Não, <03:01.28>eu <03:01.62>não <03:01.62>posso <03:01.86>fazer <03:01.86>você <03:02.28>me <03:02.28>amar
[03:02.43] <03:02.43>Querida, <03:02.43>eu <03:02.76>não <03:03.24>consigo <03:03.62>fazer <03:03.90>você <03:04.10>me <03:04.56>amar
[03:04.55] <03:04.80>Não, <03:04.80>eu <03:05.14>não <03:05.58>posso <03:05.90>fazer <03:05.90>você <03:06.26>me <03:06.68>amar
[03:08.88]
`,
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
     brinquedos. No alto vai o logo do jogo; embaixo dele, o título cai em
     blocos de brinquedo, uma letra por bloco.

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
    // O logo do jogo, no alto do capítulo, acima do título: entra como um
    // adesivo colado na tela, logo que a fita começa a tocar. Imagem com fundo
    // transparente, em assets/images/. Vazio ('') tira o logo e o capítulo
    // abre só com o título em blocos.
    logo: 'assets/images/poppy-logo.webp',
    // O que o leitor de tela diz no lugar do logo.
    logoAlt: 'Poppy Playtime',

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
     Quando ela toca em "Guardar no bolso" no fim de um capítulo, o olhar dela
     desce, a bolsinha de ombro aparece embaixo e a carta entra nela; a bolsa
     vai para o botão do canto de baixo, à direita. Ali fica tudo o que ela já
     guardou (as duas cartas e cada carta do chão que ela já abriu). Tocar num
     item abre de novo.
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
      guardando: 'Você guarda a carta na bolsa.',
    },
  },

  /* --------------------------------------------------------------------------
     A SUA VOZ
     Três áudios com a sua voz, para ela ouvir sempre que quiser. Eles são o
     presente da carta "Nossos momentos" (a última do chão): quando ela abre
     essa carta, abre o cartão com os áudios, e depois a fita fica na bolsa.
     O aparelho dela lembra disso: da segunda visita em diante a fita já está
     na bolsa desde o começo. Tocar na fita abre um cartão com os áudios; cada
     um tem tocar/pausar, o fio para ir e voltar, o tempo e o botão de baixar.
     Enquanto a sua voz toca, a música do site abaixa sozinha e depois volta.

     COMO PÔR UM ÁUDIO
     1. Crie a pasta assets/audio/ e ponha o arquivo lá. Use .mp3 ou .m4a
        (os dois tocam no iPhone e no computador). Nome simples, sem espaço
        e sem acento: voz-1.mp3.
     2. Escreva o endereço em "arquivo": 'assets/audio/voz-1.mp3'.
     3. Troque o "titulo" pelo nome que ela vai ler (apague os colchetes).
     Enquanto "arquivo" estiver vazio, a linha aparece como "[áudio 1 vem
     aqui]" e não toca: é só para você ver o lugar dela.
     Áudio gravado no WhatsApp (.ogg ou .opus) NÃO toca no iPhone: converta
     para .mp3 antes. Gravações do app Gravador do iPhone (.m4a) já servem.

     O BOTÃO DE BAIXAR
     No computador e no Android o áudio vai direto para a pasta de downloads.
     No Safari do iPhone aparece a pergunta "Deseja baixar?" e o áudio fica
     no app Arquivos, na pasta Downloads. O nome do arquivo baixado é o
     "titulo" do áudio.

     PARA TESTAR SEM PERCORRER TUDO
     Abra o site com ?cena=final&voz=abrir no fim do endereço: o cartão já
     abre. Com ?cena=cartas&voz=1 a fita já vem dentro da bolsa.
     Com ?voz=0 o aparelho esquece que a fita já tinha aparecido.
     ------------------------------------------------------------------------ */
  voz: {
    // O nome da fita dentro da bolsa e o título no alto do cartão.
    titulo: 'A minha voz',

    // Uma frase curta embaixo do título (opcional; vazia, some sem buraco).
    frase: '',

    // Os áudios, na ordem em que aparecem. Pode ter mais ou menos de três.
    itens: [
      { titulo: '[nome do primeiro áudio]', arquivo: '' },
      { titulo: '[nome do segundo áudio]', arquivo: '' },
      { titulo: '[nome do terceiro áudio]', arquivo: '' },
    ],

    // O que aparece no lugar de um áudio que ainda não tem arquivo.
    // {n} vira o número dele (1, 2, 3).
    vazio: '[áudio {n} vem aqui]',

    // Nomes lidos em voz alta por leitores de tela, e o aviso de um áudio que
    // não abriu (esse aparece escrito).
    rotulos: {
      tocar: 'Tocar',
      pausar: 'Pausar',
      baixar: 'Baixar',
      fechar: 'Fechar',
      progresso: 'Onde o áudio está',
      falhou: 'Este áudio não abriu. Tente de novo mais tarde.',
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
     AS CARTAS DO CHÃO (os vídeos dos amigos e "Nossos momentos")
     Quando ela chega perto de você, há cartas no chão. As dos amigos NÃO têm
     nome: ela toca numa, o vídeo toca, e só quando ela fecha o NOME de quem
     gravou aparece escrito à mão na carta. Cada carta aberta vai para a bolsa.
     Depois da primeira carta aberta aparece, discreto, o botão de seguir em
     frente; quando ela já abriu todas, ele ganha destaque.

     A ordem das cartas é a ordem desta lista. A última, "Nossos momentos", é
     diferente: é maior, já cai com o nome escrito (e ele fica lá o tempo
     todo), mas só abre depois que ela viu todas as outras; até lá fica
     amarrada com um laço do fio. Ela guarda os áudios com a sua voz (veja
     "A SUA VOZ", mais acima).
     (Essa carta se chamava Surpresinha. Por dentro o bloco dela continua com
     o nome antigo, "surpresinha", e o texto de exemplo é "vazioSurpresinha":
     não troque esses dois nomes. O nome que ela lê é o campo "nome".)

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

    // O cartão que abre quando a carta ainda não tem vídeo (ou a "Nossos
    // momentos" ainda não tem nada). {nome} é trocado pelo nome da carta.
    vazio: '[vídeo de {nome} vem aqui]',
    vazioSurpresinha: '[os nossos momentos vêm aqui]',

    // Nomes lidos em voz alta por leitores de tela (não aparecem escritos).
    rotulos: {
      // {n} é trocado pelo número da carta (ela ainda não sabe de quem é).
      // A última, "Nossos momentos", é lida pelo nome desde o começo.
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

    // A última carta do chão, "Nossos momentos" (o bloco continua se chamando
    // "surpresinha", o nome antigo dela: não troque). Abre os seus áudios (a
    // seção "A SUA VOZ", lá em cima). Se você puser fotos e vídeos em
    // "midias", eles passam antes dos áudios.
    //   nome: aparece escrito à mão na carta desde que ela cai, o tempo todo,
    //         e também na bolsa. Funciona melhor curto (duas ou três
    //         palavras); nome comprido fica com a letra menor.
    //         Para tirar esta carta, deixe o nome vazio ('').
    surpresinha: {
      nome: 'Nossos momentos',

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
    // Na hora das duas mãos é ela quem amarra o fio: uma brasinha de luz espera
    // no dedinho dela, e ela leva o fio com o dedo até o seu. Esta é a dica que
    // aparece se ela demorar uns segundos (se ela não fizer nada, o fio se liga
    // sozinho logo depois). Está entre colchetes porque é um exemplo: troque
    // pela sua frase. Vazio ('') = sem dica.
    dicaFio: '[Leva o fio até ele.]',
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
     Depois do abraço, você está na frente dela, de mão estendida, com a última
     carta. A carta sai da sua mão e vai até ela. Ela toca, a carta abre numa
     folha em branco, e esta frase é escrita à mão, letra por letra.
     ------------------------------------------------------------------------ */
  final: {
    frase: 'Agora tem muito a escrever ainda, e você vai me ajudar.',
  },

  /* --------------------------------------------------------------------------
     O CONTADOR
     Quando a frase final termina de ser escrita, o número da senha volta, com
     a mesma letra da tela preta, e conta de 0 até os dias de vida dela HOJE.
     No dia 23/12/2026 dá 8035 (a senha). Cada dia que ela abrir o site de
     novo, o número é um a mais. Depois ele fica pequeno, no alto da tela.
     ------------------------------------------------------------------------ */
  contador: {
    // O dia em que ela nasceu, no formato 'ano-mês-dia'.
    // Deixe vazio ('') para o contador não aparecer.
    nascimento: '2004-12-23',

    // O dia em que vocês se conheceram, no formato 'ano-mês-dia' (opcional).
    // Enquanto o número conta, cada dia dela vira um pontinho de luz numa flor
    // atrás dele; os dias desde que vocês se conheceram ficam em vermelho.
    // Deixe vazio ('') para não marcar nenhum (só o dia de hoje fica vermelho).
    conhecemos: '',

    // O que vem escrito embaixo do número.
    rotulo: 'dias até aqui',

    // A sua frase, que aparece embaixo do contador (opcional; '' = sem frase).
    frase: '[Os próximos eu quero ver de perto.]',
  },

  /* --------------------------------------------------------------------------
     ELA ESCREVE DE VOLTA
     Depois do contador sobe uma folha em branco, e ela escreve o que quiser.
     O que ela escreve fica guardado só no aparelho dela (se ela fechar o site
     e voltar, o texto ainda está lá). NADA é enviado sozinho.

     Para você ver: o botão "Enviar para ele" abre o WhatsApp dela com o texto
     pronto, e ela aperta enviar. Sem número abaixo, o WhatsApp abre e ela
     escolhe para quem mandar. "enviar de outro jeito" abre o compartilhar do
     celular (mensagem, e-mail, o que ela tiver).
     Para tirar esta folha do site, apague este bloco inteiro.
     ------------------------------------------------------------------------ */
  resposta: {
    // O seu número do WhatsApp, só algarismos, com 55 e o DDD.
    // Exemplo: '5511999998888'. Com o número, a conversa já abre com você.
    // ATENÇÃO: o site é público. Quem abrir este arquivo consegue ler o número
    // que estiver aqui. Se não quiser isso, deixe vazio (''): o WhatsApp abre
    // do mesmo jeito e ela mesma escolhe o seu contato.
    whatsapp: '5511961922722',

    // O convite, no alto da folha.
    convite: '[Agora é a sua vez. Escreve o que você quiser me dizer.]',

    // O que aparece apagado dentro da folha antes de ela escrever (opcional).
    dica: 'Escreve aqui…',

    // Uma linha que vai antes do texto dela na mensagem enviada (opcional;
    // '' = vai só o que ela escreveu).
    antes: '',

    // Avisos pequenos embaixo do texto.
    guardado: 'Guardado aqui, só neste aparelho.',
    vazio: 'Escreve alguma coisa primeiro.',
    enviando: 'Abrindo o WhatsApp… é só apertar enviar.',

    // Os botões.
    rotulos: {
      enviar: 'Enviar para ele',
      outro: 'enviar de outro jeito',
      guardar: 'Guardar',
      // No fim de tudo, o botão que abre a folha de novo.
      reabrir: 'Escrever de volta',
      // Nomes lidos em voz alta por leitores de tela (não aparecem escritos).
      folha: 'Folha em branco para você escrever de volta',
      campo: 'O que você quer me dizer',
    },
  },

  /* --------------------------------------------------------------------------
     O MENU DO FIM
     Depois da última carta ela toca em "Continuar" e chega aqui: o fio com uma
     etiqueta para cada parte da carta, o botão da saudade na ponta dele e, no
     chão, a sua voz, as referências e a folha em que ela escreve de volta.
     Na primeira vez as referências passam amarradas no fio, como os créditos
     de um filme (dá para pular com um toque). Das outras vezes o menu abre
     direto, e o link do site passa a fazer senha, música e menu.

     Tudo o que está entre [colchetes] é exemplo: troque pela sua fala.
     Texto vazio ('') = aquela coisa não aparece.
     As músicas e os nomes dos amigos NÃO moram aqui: saem sozinhos de
     musica.faixas e de cartasChao.itens. Os áudios continuam em voz: { ... }.
     Para tirar o menu do site, apague este bloco inteiro.

     PARA TESTAR SEM PERCORRER TUDO
     Abra o site com ?cena=menu no fim do endereço.
     Com ?menu=0 o aparelho esquece que ela já chegou ao menu (as referências
     passam de novo e o link volta a começar do começo).
     ------------------------------------------------------------------------ */
  menu: {
    // O nome de cada etiqueta, na ordem da viagem. Apague o texto de uma
    // (deixe '') para ela não aparecer.
    partes: {
      inicio: 'Ver tudo do começo',
      poppy: 'A carta do jogo',
      yourname: 'A carta do filme',
      mao: 'A mão e o fio',
      cartas: 'As cartas dos amigos',
      encontro: 'O encontro',
      final: 'A última carta',
    },

    // O botão vermelho na ponta do fio. Abre o WhatsApp dela na conversa com
    // você (o número é o de resposta.whatsapp). Nada é enviado sozinho.
    saudade: {
      rotulo: 'Sempre que sentir saudade',
      // A sua frase embaixo do botão (opcional; '' = sem frase).
      frase: '[Eu estou na outra ponta do fio.]',
      // Um texto que já vem escrito na conversa para ela enviar (opcional;
      // '' = a conversa abre em branco).
      mensagem: '',
    },

    // AS REFERÊNCIAS: passam uma vez, na primeira chegada, e depois ficam no
    // caderninho do chão.
    // O bilhete que abre e o que fecha a fila ('' = sem bilhete).
    abertura: '[Esta carta foi feita de coisas nossas. Olha de onde veio cada uma.]',
    fecho: '[Feito para você, com todo o meu amor.]',

    // Para pôr mais uma, copie um bloco { ... } e troque os textos.
    //   titulo: o nome da obra (obrigatório).
    //   de:     de onde vem: autor, ano (opcional).
    //   sobre:  o que é, em duas ou três linhas.
    //   dele:   a sua fala sobre ela (opcional).
    //   icone:  'laco', 'cometa', 'fita', 'disco' ou '' (sem desenho).
    referencias: [
      {
        titulo: 'O fio vermelho do destino',
        de: 'akai ito · uma lenda do Japão',
        sobre: 'Um fio vermelho que ninguém vê, amarrado no dedo mindinho, liga duas pessoas que vão se encontrar. Ele estica e embaraça, mas não arrebenta.',
        dele: '[Foi ele que te trouxe até aqui.]',
        icone: 'laco',
      },
      {
        titulo: 'Your Name',
        de: 'Kimi no Na wa · filme de Makoto Shinkai, 2016',
        sobre: 'Dois desconhecidos trocam de lugar em sonho e se procuram sem lembrar o nome um do outro. O cordão trançado e o cometa vêm de lá.',
        dele: '[O nosso filme.]',
        icone: 'cometa',
      },
      {
        titulo: 'Poppy Playtime',
        de: 'jogo da Mob Entertainment, 2021',
        sobre: 'Um jogo de susto numa fábrica de brinquedos abandonada. A fita de vídeo e as mãos de brinquedo vêm de lá.',
        dele: '[Onde a gente se conheceu.]',
        icone: 'fita',
      },
    ],

    // O cartão das músicas entra sozinho depois da lista, com o nome e o
    // artista de cada uma (titulo '' = sem esse cartão).
    musicas: {
      titulo: 'As músicas',
      dele: '[As que tocaram enquanto você lia.]',   // opcional
    },

    // O cartão com os nomes dos amigos das cartas do chão ('' = sem ele).
    amigos: 'Participações especiais',

    // OS BILHETES "ABRA QUANDO..." (opcional): bilhetes seus que ficam no chão
    // do menu, num montinho amarrado com o fio. Com a lista vazia, como está,
    // o montinho nem aparece. Para escrever um, tire as duas barras da frente
    // de uma linha de exemplo e troque os textos (copie a linha para pôr mais).
    //   titulo: o que vai escrito por fora ("Abra quando...").
    //   texto:  o que ela lê quando abre.
    //   abre:   '' = pode abrir quando quiser; 'AAAA-MM-DD' = só abre a partir
    //           desse dia (antes disso aparece fechado, com a data).
    bilhetes: [
      // { titulo: '[Abra quando sentir saudade]', texto: '[Escreva aqui o que ela vai ler.]', abre: '' },
      // { titulo: '[Abra no nosso aniversário]', texto: '[Escreva aqui o que ela vai ler.]', abre: '2027-12-23' },
    ],

    // Os botões.
    rotulos: {
      // No fim da carta, o botão que leva ao menu (na primeira vez e depois).
      continuar: 'Continuar',
      voltar: 'Voltar ao menu',
      // O caderninho do chão e o título da folha que ele abre.
      referencias: 'As referências',
      // Quando ela volta a uma parte, a página recarrega e o som só volta com
      // um toque dela: é o que aparece embaixo do nome da parte.
      tocar: 'Toque para começar',
      // O montinho de bilhetes do chão e o título da folha que ele abre
      // (só aparecem com algum bilhete na lista acima).
      bilhetes: 'Abra quando...',
      // O aviso de um bilhete que ainda não pode abrir ('{dia}' vira a data).
      bilheteFechado: 'Abre em {dia}',
      // Nomes lidos em voz alta por leitores de tela (não aparecem escritos).
      pular: 'Pular as referências',
      fechar: 'Fechar',
      nome: 'Voltar a uma parte da carta',
    },
  },

};
