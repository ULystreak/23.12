# Frente: capítulo 2, Your Name

**Seus arquivos:** `js/capitulos/yourname.js`, `js/capitulos/yourname/*` (crie o que precisar), `css/yourname.css`, seção `yourname` de `js/content.js`.

É o filme deles. Física deste mundo: luz, brilho, céu em camadas, tempo passando. **Nada de personagens, quadros ou logotipos do filme desenhados por você**; as quatro imagens do autor entram como estão.

## O céu (fundo de tudo)

- `api.fundo` recebe um canvas WebGL com um **shader de céu** guiado pelo progresso da rolagem: dia (azul luminoso, cúmulos grandes) → fim de tarde → crepúsculo (`#4a398c`, `#b25d9b`, `#ffd1a1` no horizonte) → noite (`#090e33`, estrelas, uma faixa de via láctea). Camadas: gradiente zênite/horizonte interpolado entre quatro paletas, brilho do sol descendo, duas camadas de nuvens em fbm com a luz da hora (paralaxe e deriva lenta), estrelas que acendem cintilando.
- **O cometa:** aparece perto de 55% da rolagem como uma cabeça brilhante de cauda longa cruzando em diagonal; perto de 70% **se divide em dois**, com caudas que se afastam (uma branco-ciano, outra magenta-rosa). Guiado pela rolagem, com cintilação no tempo.
- Base do quadro: se `yourname.fundo` existir, entra como placa na parte de baixo durante o crepúsculo; hoje não existe, então desenhe no shader uma silhueta de montanhas, um lago com reflexo e pontinhos de luz de uma cidadezinha.
- Se `yourname.video` existir e carregar, toca mudo em loop como placa no trecho do crepúsculo; senão, nada.
- Custo: DPR ≤ 1,5; oitavas de fbm por nível (4 / 3 / 2); `highp` no Safari; pausa quando não visível. Sem WebGL: gradientes CSS que mudam com a rolagem e um cometa em SVG.

## Estrutura, na ordem da rolagem

1. **Capa.** `yourname.capa` é pequena (533×300) e horizontal. Não estique: mostre-a como um quadro de filme na parte de cima-meio, largura total menos margens, com as **bordas dissolvendo no céu do shader** (máscara em degradê nos quatro lados), e o céu de dia combinando com o azul dela. Título (`yourname.titulo`) em Shippori Mincho, palavra por palavra. Ao rolar, a capa sobe em paralaxe e some, e o tempo começa a passar.
2. **Textos** (`tipo: 'texto'`): versos soltos no céu, não cartões com borda. Para o contraste ≥ 4,5:1 em todas as horas, cada bloco tem atrás um véu índigo macio, sem contorno, cuja intensidade acompanha a hora (mais forte de dia). Meça nos pixels, nas quatro horas. Entram com brilho que floresce (opacidade + desfoque que some + leve expansão do espaçamento), palavra por palavra ou linha por linha.
3. **O cordão trançado (kumihimo):** um caminho SVG que serpenteia de cima a baixo entre os textos e **se desenha com a rolagem**. Trançado de verdade: três fios (vermelho `--fio`, vermelho-alaranjado, rosa profundo) entrelaçados, com a ilusão de passar por cima e por baixo. Passa **atrás** de alguns textos e **na frente** de outros (duas camadas). Nos blocos `tipo: 'cordao'` ele dá um nó decorativo (ou usa `arquivo`, se houver imagem do cordão).
4. **O encontro** (`tipo: 'imagem-cheia'`, 860×484): de ponta a ponta. No celular em pé, fixe a seção e faça uma **panorâmica horizontal** guiada pela rolagem, com a imagem na altura em que ainda fica nítida (~56% da tela), atravessando-a da esquerda à direita; em cima e embaixo ela se funde com o céu noturno do shader. No desktop: largura total, proporção natural, um leve avanço.
5. **Imagem simples** (`tipo: 'imagem'`, ex.: a escadaria, quando existir): como um postal, com legenda em Klee One. Arquivo vazio: o bloco some.
6. **O par** (`tipo: 'par'`): `dele` (640×1139) e `dela` (720×1280) lado a lado; entram de lados opostos e param com uma fresta entre elas. **O fio vermelho passa de uma para a outra**: um caminho SVG que nasce num ponto da primeira e chega num ponto da segunda (âncoras `fioDele` e `fioDela` em 0..1 no conteúdo; nas imagens atuais a fita vermelha está no pulso, embaixo à esquerda de cada uma), desenhado com a rolagem, com folga e um balanço leve. Legendas em Klee One.
7. **Fim.** `yourname.fechar`: texto com sublinhado de fio; ao tocar, o céu acaba de anoitecer e `api.fechar()`. O fio do par deve parecer continuar para baixo, em direção ao botão: é ele que vai aparecer no pulso dela na cena seguinte.

## Regras

- Textos visíveis só do `content.js`.
- `som.efeito('brilho')` na divisão do cometa, bem baixo.
- `amb.reduzido`: céu ainda muda com a rolagem (é conteúdo, não enfeite), sem paralaxe nem panorâmica fixa; entradas por opacidade.
- Limpe tudo em `destruir()`.

## Skills

`impeccable` (contexto + `reference/craft-floor.md`), `emil-design-eng`, `animate`, `threejs-shaders` (GLSL), `gsap-scrolltrigger`, `gsap-plugins` (DrawSVG), `animation-performance`, `playwright`.

## Verificação

- Capturas do céu em 0%, 25%, 50%, 62%, 75% e 100% da rolagem, em 390×844 e 1440×900, Chromium e WebKit. Parece um céu pintado de filme, ou um degradê com ruído?
- Sequências de quadros: divisão do cometa, desenho do cordão, panorâmica do encontro, o fio do par.
- Contraste do texto medido nas quatro horas.
- `medirQuadros` rolando. Relate.
- `?cena=yourname` com `?webgl=0`, `?reduzido=1`, `?nivel=baixo`. Zero erro no console.

## Pronto quando

Rolar o capítulo dá a sensação de um dia inteiro passando, e o cometa se dividindo é o momento que ela lembra.
