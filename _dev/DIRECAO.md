# Direção e contrato técnico

Documento só de desenvolvimento (a pasta `_dev/` não é publicada). Leia junto com `PRODUCT.md`.
Quem constrói uma cena lê isto inteiro antes de escrever código.

## 1. Contrato de direção

**TESE.** Uma carta que é um lugar. Ela não lê uma página: ela anda até as cartas, e o que amarra tudo é um fio vermelho que só no fim ela percebe que estava ali o tempo todo. Recusa: página de rolagem com seções, hero com botão, cartões iguais.

**MUNDO PRÓPRIO.** Branco absoluto como chão e céu. A única cor do mundo branco é o vermelho (pétalas `#b3123a`, fio `#d7192d`): vermelho é "nós". Tinta `#2a1b22` para texto. Papel levemente morno (`#fbf7f0`) para se destacar do branco. Tipos: Shippori Mincho nas frases do mundo e títulos; Klee One no que é manuscrito; Fredoka e VT323 só dentro do capítulo do jogo. Cada capítulo é um mundo dentro do papel: Poppy é uma fita VHS de uma fábrica de brinquedos (petróleo `#0d2534` + vermelho, amarelo, azul, verde de brinquedo); Your Name é um céu que passa do dia à noite (`#090e33`, `#4a398c`, `#b25d9b`, `#ffd1a1`).

**HISTÓRIA.** Ela entende: isto foi feito para mim → tem algo esperando → é uma carta dele → é sobre como a gente se conheceu → é sobre o nosso filme → o fio do filme está no meu pulso → o fio me leva até uma folha em branco que a gente ainda vai escrever.

**PRIMEIRA TELA.** Branco total. Um segundo de silêncio. Pétalas vermelhas começam a cair com profundidade real (três ou quatro enormes e desfocadas cruzando perto da câmera, dezenas pequenas e nítidas ao longe). No terço superior, em Shippori Mincho, tinta escura, a frase aparece palavra por palavra: "Feliz aniversário." Nada mais na tela: sem logo, sem botão, sem barra.

**FORMA.** Experiência em primeira pessoa com uma câmera só (WebGL), texto em DOM por cima. Semente: nenhuma (direção fixada pelo briefing).

**FIM.** Não revisado e não documentado é não terminado: este trabalho acaba com a revisão final, o veredito, o DESIGN.md e o LEIA-ME.md.

## 2. As nove etapas

| # | Etapa | `?cena=` | O que acontece | O que entrega para a próxima |
|---|---|---|---|---|
| 1 | Mundo branco | `inicio` | Branco, pétalas, duas frases palavra por palavra que somem | as pétalas e a câmera |
| 2 | Caminhada | | A câmera anda com balanço de passo; pétalas passam; uma carta nasce da névoa branca e para na frente dela | a carta |
| 3 | Primeira carta | | Envelope 3D, cordão vermelho, lacre de cera com coração. Flutua, segue o ponteiro/arrasto. No toque: lacre trinca, pétalas saltam, cordão solta, aba levanta, papel sai e cresce até ser a folha | o papel vira a folha DOM |
| 4 | Música | | Na folha: as nossas músicas, cada uma com a capa. Tocar começa a ~30% em loop. Mini seletor fica fixo no canto | a folha |
| 5 | Capítulo 1 | `poppy` | A folha desenrola de cima para baixo como pergaminho; dentro, a fábrica em VHS. Fim: "Fechar este capítulo" | o pergaminho |
| 6 | Segunda carta | `carta2` | O pergaminho enrola, volta ao mundo branco, caminha até a carta com estrela no lacre | o papel |
| 7 | Capítulo 2 | `yourname` | Capa, céu do dia à noite com a rolagem, cometa que se divide, cordão trançado, encontro de ponta a ponta, o par ligado pelo fio | o fio |
| 8 | A mão | `mao` | Capítulo fecha, carta vai embora, "Olha a sua mão.", a mão com o akai ito, botão "Seguir o fio", o fio vira o caminho | o fio é o caminho |
| 9 | Última carta | `final` | Amarrada só com o fio. Folha em branco desdobra. Uma frase escrita à mão, letra por letra. Fica ali com as pétalas. Sem botão, sem "fim" | — |

## 3. Gramática de movimento

- **Mundo branco:** lento, leve, curvas longas. Entradas `expo.out`/`power3.out` de 1,2 a 2,4 s; nada quica. Câmera com inércia. Texto: palavra por palavra, cada palavra sobe ~0,4em com desfoque que some.
- **Poppy:** molas e quiques (`elastic.out`, `bounce.out`, `back.out`), blocos que caem com peso, cortes de vídeo em `steps()`, falhas de tracking curtas (80–160 ms). Nada desliza suave.
- **Your Name:** luz e tempo. `sine.inOut` longos, brilhos que florescem (`expo.out`) e somem devagar, camadas de céu com paralaxe, tudo ligado à rolagem.
- **Interface (botões, mini seletor):** resposta em 120–200 ms, `:active` com `scale(0.97)`, nunca `ease-in`, hover só em `(hover: hover) and (pointer: fine)`.
- **Movimento reduzido:** sem balanço de passo, sem grandes deslocamentos de câmera (viram dissolvências), pétalas poucas e lentas, texto entra só com opacidade. Nunca tela vazia.

## 4. Arquitetura (contrato)

Sem build. Módulos ES. `index.html` carrega `js/content.js` (script clássico, define `window.CONTEUDO`), os UMD da GSAP de `lib/` (`defer`) e `js/main.js` (`type="module"`). Three.js é importado por caminho relativo (`lib/three.module.min.js`) com `import()` dinâmico para não atrasar a primeira tela.

```
index.html
js/content.js            ← ÚNICO arquivo que o autor edita
js/main.js               ← boot, monta o contexto, roda o diretor
js/nucleo/ambiente.js    ← capacidades: webgl, nivel, reduzido, toque, ios, dprMax, rapido
js/nucleo/util.js        ← espera(), clamp, lerp, amortecer, el(), carregarImagem() (falha → null)
js/nucleo/movimento.js   ← curvas nomeadas, revelarPalavras(), ocultarPalavras(), revelarLetras()
js/nucleo/diretor.js     ← ordem das cenas, ?cena=, etapa atual, gancho de teste
js/nucleo/recursos.js    ← pré-carga em segundo plano; recurso que falta vira null, sem erro no console
js/som.js                ← motor de áudio (Web Audio): música + efeitos
js/musica.js             ← seletor de músicas na folha + mini seletor fixo
js/mundo/mundo.js        ← renderer, cena, câmera, rig, laço, qualidade adaptativa, caminhada
js/mundo/petalas.js      ← pétalas (WebGL)
js/mundo/leve.js         ← mundo sem WebGL (pétalas em CSS, mesma API)
js/mundo/envelope.js     ← envelope 3D (três variantes) + variante leve em SVG
js/mundo/fio.js          ← o fio como fita 3D que se desenha
js/mundo/folha.js        ← a última folha em 3D (desdobra + escrita à mão)
js/pergaminho.js         ← a folha DOM: recebe o papel, desenrola, enrola, rolagem, fio de progresso
js/capitulos/poppy.js    ← capítulo 1 (+ js/capitulos/poppy/*)
js/capitulos/yourname.js ← capítulo 2 (+ js/capitulos/yourname/*)
js/cenas/abertura.js     ← as frases (a caminhada até a carta é de carta.js; ver seção 6)
js/cenas/carta.js        ← caminha, a carta chega, espera o toque, abre, entrega o papel (usada 3×)
js/cenas/mao.js          ← "Olha a sua mão." + seguir o fio
js/cenas/final.js        ← última carta + folha + frase
css/base.css  css/mundo.css  css/musica.css  css/pergaminho.css  css/poppy.css  css/yourname.css  css/mao.css  css/final.css
lib/                     ← three, gsap (+DrawSVGPlugin, CustomEase; ScrollTrigger e SplitText estão aqui mas não são carregados), lenis
assets/fonts  assets/images  assets/music
_dev/                    ← este documento e as ferramentas de teste: ver.mjs, robustez.mjs, lib.mjs (não publicado)
```

### 4.1 Contexto e diretor

`main.js` monta `ctx = { conteudo, amb, mundo, som, musica, pergaminho, diretor, gsap, ScrollTrigger }` e chama `diretor.rodar(ctx, cenaInicial)`. `ctx.ScrollTrigger` hoje chega `undefined` (ver "Bibliotecas" na seção 6).

Cenas, na ordem: `inicio`, `poppy`, `carta2`, `yourname`, `mao`, `final`. Cada uma é `async function(ctx, { frio })` que resolve quando a próxima deve começar. `frio: true` quando se entrou direto por `?cena=`: a cena monta sozinha as pré-condições (mundo branco parado, pergaminho aberto etc.). `final` nunca resolve.

O diretor publica o estado em `document.documentElement.dataset.cena` e `dataset.etapa` (via `diretor.etapa('nome')`). Etapas padrão:

- `inicio`: `frases` → `caminhada` → `carta-chegando` → `carta-espera` → `carta-abrindo` → `papel` → `musica`
- `poppy`: `desenrolando` → `lendo`
- `carta2`: `enrolando` → `caminhada` → `carta-chegando` → `carta-espera` → `carta-abrindo` → `papel`
- `yourname`: `desenrolando` → `lendo`
- `mao`: `enrolando` → `olha` → `mao-espera` → `seguindo`
- `final`: `carta-chegando` → `carta-espera` → `carta-abrindo` → `desdobrando` → `escrevendo` → `fim`

Gancho de teste, sempre presente e invisível: `window.__carta = { ctx, etapa, cena, pronto (Promise) }`.
Parâmetros de teste: `?rapido=N` (acelera GSAP, `espera()` e a caminhada N vezes), `?nivel=alto|medio|baixo`, `?webgl=0`, `?reduzido=1`, `?mudo=1`. Valor inválido em qualquer parâmetro (inclusive `?cena=`) é ignorado. Há ainda `?musica=N`, de uso interno (ver "Rede de segurança" na seção 6).

### 4.2 Ambiente (`amb`)

`{ webgl: bool, nivel: 'alto'|'medio'|'baixo', reduzido: bool, toque: bool, ios: bool, dprMax: number, rapido: number }`.
Nível inicial por heurística (`hardwareConcurrency`, `deviceMemory`, tamanho da tela) e depois **adaptativo**: se o tempo médio de quadro passar de ~22 ms por 2 s, o mundo baixa o DPR e depois o nível (`mundo.aoMudarNivel(fn)`), nunca sobe de volta no meio de uma cena.

### 4.3 Mundo (`ctx.mundo`)

Unidades em metros. Câmera a 1,5 m do chão olhando para −Z. FOV vertical ~58° em pé, ~42° deitado. Névoa branca (as coisas nascem do branco). Um único `<canvas id="mundo">` fixo atrás do DOM.

```
mundo.ok                      // false → modo leve (sem WebGL); a API abaixo continua existindo
mundo.THREE, .renderer, .cena, .camera, .rig
mundo.aoQuadro(fn(dt, t)) → cancelar
mundo.ligar() / mundo.desligar()          // desligar quando o pergaminho cobre a tela inteira
mundo.caminhar({ distancia, duracao, curva? }) → Promise   // anda em −Z com balanço de passo
mundo.ponteiro                // { x, y } em −1..1, suavizado (ponteiro no desktop, arrasto no toque; no Android também inclinação; no iOS NÃO pedir permissão de movimento)
mundo.telaParaMundo(xNdc, yNdc, distancia) → Vector3
mundo.mundoParaTela(v3) → { x, y } px
mundo.retanguloParaPose(rect, obj) // pose (posição/escala) para um plano cobrir exatamente um DOMRect na tela
mundo.petalas.rajada(posMundo, n)  // pétalas que saltam de um ponto
mundo.petalas.definirDensidade(k)  // 0..1
mundo.aoMudarNivel(fn)
```

### 4.4 Envelope (`criarEnvelope(mundo, { lacre: 'coracao'|'estrela'|null, amarracao: 'cordao'|'fio' })`)

```
env.grupo                     // Object3D; a cena posiciona
env.atualizar(dt, t)          // flutuar, girar devagar, seguir mundo.ponteiro com mola
env.acertou(xNdc, yNdc) → bool
env.ancoraFio → Vector3       // onde o fio do caminho chega (variante 'fio')
env.abrir() → Promise<{ papel }>          // lacre trinca, pétalas, cordão/fio solta, aba levanta, papel sai
env.entregarPapel(rect) → Promise         // papel voa e cobre exatamente o DOMRect, plano e sem luz
env.irEmbora() → Promise                  // o envelope se afasta e some no branco
env.dispose()
```

`cenaCarta(ctx, { lacre, amarracao, distancia })` em `js/cenas/carta.js` faz: caminhar → carta chega → dica discreta se ela não tocar em ~4 s → toque → `abrir()` → `entregarPapel(pergaminho.retanguloAlvo())` → `pergaminho.receberPapel()`.

### 4.5 Pergaminho (`ctx.pergaminho`)

A folha DOM. No celular cobre a tela; no desktop é uma coluna central (máx. ~720 px) com o mundo branco e as pétalas visíveis dos lados.

```
perg.retanguloAlvo() → DOMRect            // onde o papel 3D deve pousar
perg.receberPapel() → Promise             // a folha DOM aparece exatamente onde o papel 3D está (troca invisível)
perg.folha                                // elemento em branco onde o seletor de música é montado
perg.desenrolar(capitulo) → Promise       // desenrola de cima para baixo e libera a rolagem
perg.enrolar() → Promise                  // enrola de volta até virar a folha em branco
perg.soltar() → Promise                   // a folha vai embora e o mundo volta
perg.rolagem → { el, progresso, aoRolar(fn), irPara(y) }
```

Capítulo: `export const capitulo = { id, montar(raiz, api) → { destruir() } }` com `api = { conteudo, amb, som, rolagem, fundo (elemento fixo atrás do conteúdo), gsap, ScrollTrigger, fechar() }` (`api.ScrollTrigger` pode chegar `undefined`; ver seção 6). O capítulo chama `api.fechar()` no botão final. O fio de progresso na borda do pergaminho é do pergaminho, não do capítulo.

### 4.6 Som e música

`som.destravar()` (no primeiro toque), `som.tocar(indice)`, `som.pausar()`, `som.retomar()`, `som.volume(v)`, `som.estado`, `som.aoMudar(fn)`, `som.efeito(nome)` (sintetizado em Web Audio, sempre abaixo da música: `lacre`, `papel`, `desenrolar`, `toque`, `caneta`, `fita`, `mola`, `brilho`), `som.abafar(fator, ms)`.
Música passa por `MediaElementSource → GainNode` (no iPhone `audio.volume` não funciona). Começa em ~30%, loop.
`musica.escolher(perg.folha) → Promise` (resolve quando ela escolheu e tocou em continuar; sem faixas válidas, resolve na hora). `musica.mostrarMini()` / `esconderMini()`.

### 4.7 Fio e folha final

`criarFio(mundo, { curva, largura }) → { objeto, progresso(0..1), definirCurva(c), atualizar(dt,t), dispose() }`: fita voltada para a câmera, largura mínima em pixels, textura trançada no shader, sombra suave no chão.
`criarFolha(mundo) → { grupo, desdobrar() → Promise, escrever(texto) → Promise, atualizar(dt,t) }`: a última folha fica **dentro do mundo 3D** (pétalas passam na frente e atrás); o texto é desenhado num canvas-textura, letra por letra, com um espelho em DOM invisível para leitores de tela.

## 5. Regras para todos

1. **Posse de arquivos.** Cada frente edita só os arquivos da sua lista. `index.html`, `css/base.css`, `js/main.js` e `js/nucleo/*` são do esqueleto: não edite; se faltar algo, resolva nos seus arquivos e relate. Em `js/content.js` edite só a sua seção.
2. **Assinaturas congeladas.** Pode reescrever tudo por dentro; as funções e nomes da seção 4 não mudam.
3. **Conteúdo só em `content.js`.** Nenhum texto visível escrito direto no código.
4. **Recurso que falta some.** Sem buraco, sem ícone quebrado, sem erro no console. Toda cena fica completa sem as imagens geradas.
5. **O fio.** Toda cena tem o seu lugar para o fio vermelho. Não o anuncie: ele só "é".
6. **Sem emoji, sem cartões iguais, sem gradiente genérico, sem texto com gradiente, sem rótulo pequeno acima de título, sem glifo unicode fazendo papel de ícone.** Ícones são SVG desenhados.
7. **Nada de personagens, quadros ou logotipos do filme ou do jogo.** Referências são objetos genéricos (mãos de brinquedo, fita, esteira, cometa, cordão).
8. **iPhone primeiro.** Safari: áudio só após gesto, `100dvh`, áreas seguras (`env(safe-area-inset-*)`), sem pedido de permissão de movimento, `-webkit-` onde precisar, nada de `backdrop-filter` pesado em área grande.
9. **Desempenho.** Animar `transform`/`opacity`; no WebGL, instanciar; DPR máximo 2 (1,5 no nível médio, 1 no baixo); pausar o que não está visível.
10. **Contraste** de texto ≥ 4,5:1 sobre vidro e imagem. Alvos de toque ≥ 44 px. Foco visível.
11. **Verifique olhando.** Depois de construir: `_dev/` tem a ferramenta de captura. 390×844 e 1440×900, Chromium e WebKit, sem erro no console. Captura parada não prova fluidez: meça quadros ou grave vídeo nas animações principais.

## 6. Adendos do esqueleto

O esqueleto andante já existe e segue a seção 4. Esta seção só registra o que ele acrescentou ou precisou decidir, para ninguém redescobrir. Nada aqui muda as assinaturas da seção 4.

**Contexto.** Além dos nove campos, `ctx.recursos` (pré-carga; `await recursos.imagem(url)` → `HTMLImageElement | null`, `await recursos.elementoImagem(url, alt)` → `<img>` novo ou `null`; endereço vazio não faz pedido) e `ctx.estado` (objeto livre para uma cena deixar algo para a seguinte: `estado.envelope`, `estado.fio`, `estado.distanciaFinal`).

**Tempo.** `espera(ms)` recebe **milissegundos**, respeita `?rapido` e **só conta o tempo com a aba visível** (se ela trocar de aplicativo, a carta espera; a GSAP e o laço do mundo também param com a aba oculta, e a música pausa e volta sozinha). Não use `setTimeout` direto para marcar o tempo de uma cena. A GSAP usa segundos e é acelerada pelo `timeScale` global. As curvas ficam em `curvas.branco|poppy|yourname|ui` (`js/nucleo/movimento.js`) e têm espelho em CSS (`--curva-*`). Os padrões da GSAP não foram alterados.

**Ambiente no CSS.** `<html>` recebe as classes `toque`, `ios`, `reduzido`, `sem-webgl` e `data-nivel`. Movimento reduzido se trata com `html.reduzido` no CSS e `amb.reduzido` no JS (não há regra geral que mate animações: a versão calma continua viva). `amb` traz ainda `android`, `mudo`, `forcado` (nível travado por `?nivel=`) e `params`.

**Diretor.** As cenas compostas (`inicio`, `poppy`, `carta2`, `yourname`) são montadas em `js/nucleo/diretor.js` a partir das peças; capítulos, `mao.js` e `final.js` entram por `import()` dinâmico. `voltarAoMundo(ctx)` (exportado do diretor) enrola o pergaminho, solta a folha e manda embora `estado.envelope`. Cena que lança exceção é registrada no console; o diretor devolve tudo ao ponto de partida de uma cena fria (descarta `estado.envelope`, solta o pergaminho, religa o mundo, esvazia `#frases`, `#acoes`, `#dica` e remove o que mais houver dentro de `#palco`) e a seguinte entra com `frio: true`. Por isso toda cena precisa funcionar com `frio: true` a partir do mundo branco vazio. `window.__carta` tem ainda `historico` (lista de `{ cena, etapa, t }`), `gpu` e `erro`.

**Cenas.** `cenaAbertura(ctx)` publica só `frases`; a caminhada é toda de `cenaCarta`, para a câmera ter um movimento só. `cenaCarta(ctx, { lacre, amarracao, distancia, entregar = true, anunciarCaminhada = true })` devolve `{ env, papel, parar }`; com `entregar: false` ela para depois de `abrir()` (é o que a cena final usa). `cenaMao` deixa `estado.fio` e `estado.distanciaFinal` para `cenaFinal`.

**Mundo.** Extras: `mundo.amb`, `mundo.canvas`, `mundo.tamanho { largura, altura, dpr }`, `mundo.aoRedimensionar(fn)`, `mundo.gpu`, `mundo.ligado`, `mundo.recipienteLeve`. `telaParaMundo(x, y, distancia)`: `distancia` é a profundidade ao longo do eixo da câmera. `retanguloParaPose(rect, obj, { distancia = 0.6 })` devolve `{ pai, posicao, quaternion, escala }` **no espaço da câmera**: faça `pose.pai.attach(obj)` e anime até os valores (assim o papel não treme com o balanço de passo). Há uma luz hemisférica e uma direcional na cena; a névoa é `mundo.cena.fog` (2,5 a 9,5 m). No modo leve, `THREE`, `renderer` e `camera` são `null`; `rig`, `cena` e os vetores são objetos simples (`objetoLeve()`, `vetorLeve()` em `js/nucleo/util.js`); envelope, fio e folha têm a variante leve no próprio arquivo, escolhida por `mundo.ok`.

**Pergaminho.** Extras: `perg.esperarFechar()` (resolve quando o capítulo chama `api.fechar()`), `perg.estado` (`oculto` | `folha` | `aberto`), `rolagem.y`, `rolagem.irPara(y, { imediato })`, `aoRolar(fn(progresso, y))`. `api.recursos` existe. `capitulo.montar` pode ser `async`. O rolador é `api.rolagem.el`; o pergaminho só o torna padrão de `ScrollTrigger.defaults` se o plugin já estiver em `window` quando ele é criado (hoje não está), então quem usar ScrollTrigger passa `scroller: api.rolagem.el` à mão. Lenis só no computador. O pergaminho desliga o mundo quando cobre a tela e religa em `soltar()`. Para o CSS, `#pergaminho[data-estado="folha|abrindo|aberto|fechando|saindo"]` (sem o atributo, oculto).

**Som.** `som.diagnostico()` (só para testes). Sem Web Audio, cai para `audio.volume`; com `?mudo=1` o estado muda igual, sem som.

**Rede de segurança (já pronta no esqueleto; não reimplementar).**
- *WebGL que morre.* O `mundo.js` trata a perda e a devolução do contexto (o laço para e volta sozinho). Se o contexto **não** voltar em ~4 s com o mundo branco à vista (aba visível, `mundo.ligado` e `perg.estado === 'oculto'`; durante a leitura de um capítulo nada é recarregado), o `main.js` recarrega a página na cena atual em modo leve: `?cena=<atual>&webgl=0&musica=<faixa que tocava>`, mantendo os outros parâmetros; a faixa volta no primeiro toque. O mesmo acontece (uma vez só) se o boot falhar com WebGL ligado. Consequência para as frentes: a variante leve de cada peça é o que ela vê nesse caso, e precisa estar completa.
- *Ritmo do aparelho.* A qualidade adaptativa mede o ritmo natural nos primeiros quadros: iPhone em modo de pouca energia e telas de 30 Hz rodam a ~33 ms sem estar lentos, e nesses casos a qualidade **não** desce. O limite de "quadro lento" é `max(22 ms, 1,4 × ritmo)`.
- *Ouvinte de quadro que quebra.* Uma função de `mundo.aoQuadro` que lança exceção é registrada no console e sai da lista; o mundo continua desenhando.
- *Toques repetidos.* O fluxo inteiro foi martelado com toques e cliques duplos em todas as etapas: nenhuma etapa pula nem repete. Mantenha o padrão: ouvinte `once`, botão desligado no primeiro clique, e nada de ouvinte global que sobreviva à etapa. Na carta, toque é apertar e soltar no mesmo lugar (arrastar mais de 14 px para girar a carta não abre).
- *Girar o aparelho.* O mundo refaz tamanho, proporção e FOV; o pergaminho liga ou desliga o mundo conforme passa a cobrir ou não a tela. Cada peça que guarda medidas de tela deve ouvir `mundo.aoRedimensionar`.
- *Recurso que falta.* Campo vazio (`''`) não faz pedido e não deixa rastro. Arquivo citado no `content.js` que não existe vira `null` sem exceção e sem buraco, mas o navegador registra o 404 da rede no console por conta própria (não há como suprimir): é o único aviso aceito.
- *Texto fora do `content.js`.* A única exceção é o aviso do `<noscript>` no `index.html` (sem JavaScript o `content.js` não roda) e o título/descrição neutros do `<head>`.

**Ganchos de teste (não mudar).** `[data-acao="faixa"]`, `[data-acao="continuar"]`, `[data-acao="mini"]`, `[data-acao="mini-alternar"]`, `[data-acao="fechar-capitulo"]`, `[data-acao="seguir-fio"]`; na etapa `carta-espera`, um toque no centro da tela abre a carta.

**Verificação.** `node _dev/ver.mjs --cena poppy --vp celular,desktop --motor chromium,webkit --rapido 6 --fotos` (capturas em `output/ver/`), `--fluxo` (a carta inteira), `--video`, `--quadros`, `--params "webgl=0&reduzido=1"`, `--ate etapa`. Robustez do núcleo: `node _dev/robustez.mjs` (todos os casos) ou `node _dev/robustez.mjs spam resize aba contexto params faltando teclado audio quebra qualidade`; rode `spam` e `resize` depois de mexer em qualquer cena. Para testes próprios: `import { abrir } from './_dev/lib.mjs'` (`esperarEtapa`, `foto`, `tocarCentro`, `acionar(seletor)`, `medirQuadros`, `erros`, `preparar(page)`).

**Nomes que os arquivos congelados importam (não renomear).** `main.js`: `criarMundo` (`js/mundo/mundo.js`), `criarPergaminho`, `criarMusica`, `criarSom`. O `main.js` também lê `mundo.ok`, `mundo.canvas`, `mundo.ligado`, `mundo.gpu`, `perg.estado`, `som.estado.tocando`/`.indice`, `som.destravar()` e `som.tocar(i)`; o `diretor.js` usa `perg.receberPapel/desenrolar/esperarFechar/enrolar/soltar`, `musica.escolher/mostrarMini`, `mundo.ligar()`, `mundo.petalas.definirDensidade()`, `env.irEmbora()` e `env.dispose()`. `diretor.js`: `cenaAbertura`, `cenaCarta`, `cenaMao`, `cenaFinal` e `capitulo` (dos dois capítulos). Entre frentes: `final.js` usa `cenaCarta(..., { entregar: false, anunciarCaminhada: false })` e `criarFio`; envelope, fio e folha usam `mundo.amb`, `mundo.recipienteLeve`, `mundo.tamanho`, `mundo.aoRedimensionar` e `mundo.petalas.rajada`; `vetorLeve()` e `objetoLeve()` moram em `js/nucleo/util.js`. Convenção do modo leve: `telaParaMundo` devolve um vetor com `.px`/`.py` (px de tela) e `petalas.rajada` aceita `{ px, py }`. Os estilos da carta leve são aplicados pelo próprio `envelope.js`.

**Bibliotecas.** three 0.185.0 (última versão que publica os `.min.js`), gsap 3.15.1, lenis 1.3.27; ver `lib/VERSOES.txt`. `Lenis`, `gsap`, `DrawSVGPlugin` e `CustomEase` são globais em `window`. `ScrollTrigger` e `SplitText` ficam em `lib/` mas o `index.html` **não os carrega** (nenhum capítulo usa, e o ScrollTrigger mantinha um `requestAnimationFrame` rodando a carta inteira): `window.ScrollTrigger`, `window.SplitText`, `ctx.ScrollTrigger` e `api.ScrollTrigger` chegam `undefined`. Quem precisar carrega o arquivo no próprio `montar` (ex.: injetar `<script src="lib/ScrollTrigger.min.js">` e esperar o `load`), registra com `gsap.registerPlugin` e desfaz em `destruir()`. O núcleo (`movimento.js` registra só o que existir) e o pergaminho já funcionam sem eles; nunca use os dois sem checar.

**Extras de API das frentes (em uso; não renomear).**
- *Pétalas* (`js/mundo/petalas.js`, leve em `js/mundo/leve.js`): `mundo.petalas.definirFoco(metros)` (plano de foco, padrão 3 m, muda devagar; abertura e folha final), `petalas.comecar()` (só a abertura: as pétalas entram por cima) e `petalas.protagonistas()` (só a abertura: pétalas enormes e desfocadas cruzam rente à lente). Há ainda `petalas.protegerRetangulo(r)`. Chame com `?.`.
- *Envelope* (`js/mundo/envelope.js`, as duas variantes): `env.chegar({ duracao, distancia, atraso }) → Promise` (nasce da névoa ao longe e pousa), `env.aoMarco = fn(nome)` (avisado em `'lacre'` e `'papel'`; `carta.js` usa para o som), além de `env.pressionar(bool)`, `env.caixaTela()`, `env.lacre`, `env.amarracao`, `env.aberto`.
- *Mão → final* (`js/cenas/mao.js`): `ctx.estado.seguidorFio = { parar(), soltar(duracao?) }`, o seguidor que mantém o fio preso ao pulso e à `estado.envelope.ancoraFio` durante a caminhada e o solta sozinho em `final:carta-abrindo`; quem quiser assumir o fio chama `parar()`.
- *Folha final* (`js/mundo/folha.js`, as duas variantes; `final.js` chama com checagem): `folha.assumir(papel)` (aparece dobrada onde está o papel que saiu da carta), `folha.repousarFio() → Promise` (o fio solto repousa no canto de baixo da folha), `folha.viver()` (de tempos em tempos uma pétala pousa num canto e escorrega).
- *Som* (`js/som.js`): `som.progresso()` → 0..1 da faixa; `som.aoTempo(fn(progresso, segundos, duracao)) → cancelar` (algumas vezes por segundo enquanto a faixa anda; o anel do mini usa).
- *Mini* (`js/musica.js`, para o CSS): `#mini[data-pele="papel|poppy|yourname"]` acompanha a cena; `#mini[data-quieto]` quando ele se recolhe à margem durante a rolagem de um capítulo; `#mini[data-longe]` na mão e no final.
- *Pergaminho* (para o CSS): `#pergaminho[data-estado="folha|abrindo|aberto|fechando|saindo"]`; sem o atributo, oculto.
- *Conteúdo*: `musica.rotulos.continuar` e `mao.rotuloBotao` são os nomes lidos por leitores de tela quando `musica.continuar` ou `mao.botao` ficam vazios.
