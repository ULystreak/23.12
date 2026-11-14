# Frente: mundo branco, pétalas, caminhada, frases

**Seus arquivos:** `js/mundo/petalas.js`, `js/mundo/leve.js`, `js/cenas/abertura.js`, `css/mundo.css`, seção `abertura` de `js/content.js`. Em `js/mundo/mundo.js` você pode melhorar o interior (luz, névoa, foco, caminhada) sem mudar nenhuma assinatura; outras três frentes dependem dela.

## O que ela vê

1. **Branco.** Um segundo de branco puro. Depois as pétalas começam, poucas, e aumentam.
2. **Frases.** No terço superior, Shippori Mincho, tinta `#2a1b22`, `clamp(1.6rem, 6.6vw, 3.4rem)`, centralizado, no máximo ~14 caracteres por linha no celular. Palavra por palavra: cada palavra sobe ~0,4em, sai de um desfoque de ~8 px e ganha opacidade (`expo.out`, ~0,9 s, intervalo ~0,14 s). Segura o tempo de ler. Sai como se o vento levasse: as palavras derivam para o lado em que as pétalas caem, desfocam e somem, escalonadas. Segunda frase igual. A saída da segunda frase e o primeiro passo se sobrepõem.
3. **Caminhada.** A câmera anda para frente. Balanço de passo de verdade: ~2,5 cm vertical, ~1,2 cm lateral, rolagem de ~0,3°, ~1,8 passos/s, entrando e saindo com suavidade. As pétalas passam por ela (algumas cruzam enormes e desfocadas rente à lente). Pétalas caídas no chão invisível dão horizonte e velocidade.

## Pétalas (o coração desta frente)

- Instanciadas (uma chamada de desenho para as que caem, outra para as do chão). Forma de pétala de rosa de verdade: silhueta em gota larga com um leve entalhe na ponta, desenhada por SDF no fragment shader sobre um quad **curvado no vertex shader** (côncava nos dois eixos, como uma colher rasa). Nada de quadrado, círculo ou coração.
- Cor: vermelho-rosa profundo com gradiente da base (mais escura, `#7d0c28`) para a borda (`#c9184a`), nervura central quase invisível, variação por instância de matiz, brilho e tamanho. Translucidez falsa: clareia quando a normal fica contra a luz. Sem brilho especular plástico.
- Movimento: queda de 0,35 a 0,6 m/s, balanço lateral em ruído, rotação de tombo em eixo próprio (algumas planam, outras giram). Volume que acompanha a câmera com reaproveitamento (as que saem por baixo/atrás renascem na frente/acima), para a caminhada atravessá-las.
- **Profundidade de campo real por instância:** círculo de confusão a partir da distância ao plano de foco (foco padrão ~3 m; exponha `petalas.definirFoco(d)` como método extra, as cartas vão usar). Longe do foco a pétala cresce, a borda amolece e a opacidade cai para conservar energia; perto da lente vira uma mancha grande e macia. Ao longe, somem na névoa branca.
- Três ou quatro pétalas "protagonistas" roteirizadas no primeiro plano durante a primeira frase, cruzando a tela devagar, bem desfocadas.
- Chão: pétalas deitadas com rotação aleatória e uma sombra de contato mínima (mancha escura a ~6%). Esparsas. É o que dá o horizonte.
- `rajada(posMundo, n)`: pétalas saltam de um ponto com velocidade inicial em leque, gravidade e arrasto, e depois entram no fluxo normal.
- `definirDensidade(k)` com transição suave.
- Mistura: alfa pré-multiplicado, sem escrita de profundidade; ordene só se o custo couber.
- Quantidades (caindo + chão): alto ~700 + 300, médio ~420 + 180, baixo ~220 + 90. Reaja a `mundo.aoMudarNivel`.

## Modo leve e movimento reduzido

- `js/mundo/leve.js` (sem WebGL): mesma API. Três camadas de pétalas em CSS (longe pequenas e nítidas, perto grandes e já desenhadas macias, sem `filter: blur` em tempo real), queda por `transform`. `caminhar()` vira um avanço das camadas (escala/paralaxe) pelo mesmo tempo. Tem que ficar bonito, não só funcionar.
- `amb.reduzido`: sem balanço, pétalas poucas e lentas, frases só com opacidade, caminhada vira um avanço lento e contínuo.

## Skills

Carregue: `impeccable` (rode o contexto e leia `reference/craft-floor.md` antes de editar interface), `emil-design-eng`, `animate`, `threejs-shaders`, `animation-performance`, `gsap-core`, `playwright`.

## Verificação

- Capturas em 390×844 e 1440×900 (Chromium e WebKit): branco inicial, cada frase no meio da entrada e completa, meio da caminhada. Sequência de 8 a 12 quadros a cada ~150 ms da entrada de uma frase e de um trecho da caminhada, para julgar o movimento.
- `medirQuadros` durante a caminhada no nível alto com GPU: meta ≥ 55 fps médios, p95 ≤ 22 ms. Relate os números reais.
- `?webgl=0`, `?reduzido=1`, `?nivel=baixo`: sem erro e ainda bonito.
- Zero erro no console.

## Pronto quando

Alguém que veja só os primeiros 15 segundos descreve "pétalas de rosa caindo num lugar branco, com profundidade de foto" e não "partículas vermelhas".
