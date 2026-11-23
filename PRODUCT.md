# Para você: brief de produto

Uma carta de aniversário interativa, feita por ele para a namorada. Ela abre um link no dia 23/12/2026, no iPhone dela, sozinha, e vê uma vez só, com atenção total.

## Plataforma
- Web. HTML, CSS e JavaScript puros, em módulos ES, sem build, publicado pelo GitHub Pages.
- Bibliotecas locais em `lib/`: Three.js (o mundo 3D), GSAP com CustomEase e DrawSVGPlugin (o movimento) e Lenis (rolagem suave, só com mouse). Nada vem de CDN.
- Fontes locais em `assets/fonts/`, imagens em `assets/images/`, músicas em `assets/music/`, áudios em `assets/audio/` e vídeos em `assets/videos/`.

## Quem usa
- **Ela.** Usuária única. iPhone 13 Pro Max, Safari, em pé, sozinha. Não sabe o que vai encontrar.
- **Ele, o autor.** Edita só `js/content.js` e testa cada parte com `?cena=`. Não é programador.

## Propósito
Que ela sinta que cada segundo foi feito para ela. Ela digita uma senha que só ela sabe (os dias que já viveu), escolhe a música dos dois, entra numa alameda de cerejeiras em flor, caminha até duas cartas (cada uma com o capítulo de algo que é dos dois: o jogo em que se conheceram e o filme deles) e guarda cada uma na bolsa. Ao guardar a segunda, o fio vermelho aparece no pulso dela e ela corre por ele até ele. Perto dele, as cartas dos amigos no chão. Depois, o encontro, uma folha em branco e uma frase escrita à mão. No fim, ela escreve de volta, e um menu deixa tudo à mão para sempre.

## Posicionamento
Nada com cara de modelo pronto, de template ou de IA. A régua é a de um site premiado: direção de arte própria, movimento com intenção, transições contínuas. Vale investir em momentos que seriam exagero num site comum. Delicado e fofo; nada grotesco.

## Contexto de uso
- Celular em pé primeiro, de 360 a 430 px de largura. A área útil do iPhone dela, com as barras do Safari, é perto de 428 × 746. O computador também precisa ficar bonito (1440 × 900).
- O som só começa depois do primeiro toque dela: a senha e a escolha da música são esse toque.
- A música começa a cerca de 30% e fica em repetição.
- A senha é um ritual, não segurança: o site é estático e o número está no content.js.
- Do link à última frase, ela nunca fica sem saber o que fazer e nunca vê um corte seco.

## Capacidades e restrições
- Atalhos `?cena=` para ver cada parte: senha, musica, inicio, poppy, carta2, yourname, mao, cartas, encontro, final e menu. Sem atalho, a carta começa na senha.
- O menu do fim: o fio com uma etiqueta por parte, o botão "Sempre que sentir saudade" (abre o WhatsApp dela; nada é enviado sozinho), as referências, a voz dele para ouvir e baixar, e a folha em que ela escreve de volta. O aparelho lembra que ela já chegou ali; daí em diante o link faz senha, música e menu.
- A bolsa, no canto de baixo à direita, mostra só o que ela já guardou. Tocar num item reabre o conteúdo.
- Sem login, sem analytics, sem cookies, com `noindex`. Título e prévia do link neutros: "Para você".
- Android intermediário fluido. Aparelho fraco, sem WebGL ou com movimento reduzido cai numa versão mais leve, nunca quebrada.
- Imagem, música, vídeo ou áudio que faltar some sem buraco e sem aviso.

## Compromissos de marca
- **O fio vermelho é a assinatura**, e ela só percebe no fim: o traço sob a senha, o cordão dos envelopes, a costura do pergaminho, o cordão trançado do filme, o fio entre as duas imagens, o laço no pulso, o caminho até ele, o que amarra as cartas do chão, o caminho até a última carta e o varal do menu.
- **Uma câmera só**, e cada mundo com a sua física: o branco lento e leve; a fábrica do jogo com molas, quiques e interferência de vídeo; o céu do filme com luz, brilho e tempo passando.
- Paleta: branco #ffffff, tinta #2a1b22, rosa #b3123a, fio #d7192d. Jogo em azul-petróleo #0d2534 com as cores de brinquedo. Filme de #090e33 a #4a398c, com #b25d9b e #ffd1a1.
- Fontes: Shippori Mincho (títulos e frases), Klee One (o manuscrito), Fredoka e VT323 (só no capítulo do jogo).

## Princípios
1. Nenhum efeito entra para constar: cada um serve à cena.
2. Continuidade acima de tudo: o elemento de uma cena vira o da próxima (a carta vira o pergaminho, o fio vira o caminho).
3. O autor troca conteúdo sem tocar em código.
4. Um por vez: uma frase, um objeto e uma ação por tela.
5. A primeira impressão (senha, abertura, primeira carta) é a parte mais importante.

## Acessibilidade
Teclado em todas as telas, leitor de tela (o texto de cada frase é dito inteiro, sem aparecer duas vezes), alvos de toque de pelo menos 44 px, contraste de pelo menos 4,5:1 sobre vidro e sobre imagem, áreas seguras do iPhone e `100dvh`, e a versão de movimento reduzido sempre viva.
