# Roteiro 2: ordem nova, contrato e divisão de arquivos

Escrito pelo arquiteto antes de três grupos construírem em paralelo. Vale junto com `_dev/DIRECAO.md` e `_dev/API.md`; onde este arquivo diz outra coisa, **vale este** (o API.md ainda descreve a ordem antiga). O esqueleto já roda de ponta a ponta do jeito novo, feio: cada grupo troca o seu esqueleto pela peça de verdade **sem mudar as assinaturas, as etapas e os ganchos de teste daqui**.

## 1. A ordem nova

```
senha     senha → senha-certa
musica    musica → entrando
inicio    frases → caminhada → carta-chegando → carta-espera → carta-abrindo → papel
poppy     desenrolando → lendo → enrolando → guardando
carta2    caminhada → carta-chegando → carta-espera → carta-abrindo → papel
yourname  desenrolando → lendo → enrolando → guardando
mao       olha → mao-espera → correndo
cartas    pousando → escolhendo ⇄ assistindo → seguindo
encontro  chegando → planos → maos → carta
final     carta-chegando → carta-espera → carta-abrindo → desdobrando → escrevendo → fim
```

`ORDEM = ['senha', 'musica', 'inicio', 'poppy', 'carta2', 'yourname', 'mao', 'cartas', 'encontro', 'final']` (js/nucleo/diretor.js).

O que mudou em relação à ordem antiga:

| Antes | Agora |
|---|---|
| a carta abria direto no branco | `senha` e `musica` acontecem numa tela preta (`#entrada`), por cima de tudo |
| `inicio:musica` (seletor na folha, depois da 1ª carta) | cena `musica`, antes do mundo; `inicio` termina em `papel` |
| capítulo terminava em `lendo`; a cena seguinte fazia `enrolando` | o capítulo faz `enrolando` (a folha some) e `guardando` (a carta vai para o bolso) |
| `carta2:enrolando`, `mao:enrolando` | não existem mais: `carta2` começa em `caminhada`, `mao` em `olha` |
| `mao:seguindo` (caminhada lenta) | `mao:correndo` |
| cena `segredos` (antes da mão, só com vídeo) | cena `cartas` (depois da mão, perto dele; existe sempre que houver carta com nome) |

Regras do diretor (já implementadas, ninguém precisa tocar):

- Sem `?cena=` (ou com valor desconhecido) a carta começa em `senha`. `?cena=segredos` é apelido de `cartas`.
- `senha` é pulada se `senha.codigo` não for só algarismos; `cartas` se não houver carta com nome; `encontro` sem quadros.
- Atalho de `inicio` em diante: `#entrada` nem aparece (script no `<head>` do index.html põe `html.sem-entrada`; o diretor remove o nó), `frio: true`, e a bolsa já vem com as cartas dos capítulos anteriores àquela cena (`semearBolsa`).
- `?cena=musica` mostra a tela preta só com a música (para testar o carrossel).
- Atrás do preto o mundo fica desligado (`mundo.desligar()`), e é religado em `musica:entrando`.
- A bolsa só abre nas etapas de espera: `carta2:carta-espera`, `mao:mao-espera`, `cartas:escolhendo` (o diretor chama `inventario.liberar(bool)` a cada etapa). Em `final:desdobrando` o botão sai (`esconderBotao`).
- Depois de `musica`, seguir leva ao que já existia: `encontro` (quadros) e `final`. O autor ainda vai decidir a continuação.

## 2. Contexto novo

```
ctx = { conteudo, amb, mundo, som, musica, pergaminho, inventario, bolso, diretor, gsap, ScrollTrigger, recursos, estado }
```

`ctx.inventario` e `ctx.bolso` são criados no main.js. DOM novo no index.html: `aside#inventario[hidden]`, `div#bolso[hidden]`, `section#entrada > #entrada-senha + #entrada-musica`. O preto de `#entrada` (fixo, `z-index: 60`, acima de `--z-topo`) está no CSS crítico do index.html; `theme-color` começa `#000000`.

Exportados do diretor que as cenas podem importar: `ORDEM`, `voltarAoMundo(ctx)`, `temSenha(c)`, `temCartas(c)`, `temEncontro(c)`, `cartasDoChao(c) → [{ id, nome, tipo: 'video' | 'galeria', video, capa, midias: [{ foto, video, legenda }] }]` (ids `chao-1`…`chao-N` e `chao-surpresinha`; carta sem vídeo continua na lista).

## 3. O contrato, peça por peça

### (a) Senha: `js/cenas/senha.js` (grupo A)

```js
export async function cenaSenha(ctx, { frio })   // etapas: senha → senha-certa
export async function sairDaEntrada(ctx)          // o preto se desfaz, #entrada sai do DOM, theme-color vira #ffffff
```

- `cenaSenha` monta dentro de `#entrada-senha`. Resolve quando ela acertou **e o campo já saiu**; o preto continua (a música entra nele). Publica `senha` ao montar e `senha-certa` no acerto.
- Código em `conteudo.senha = { codigo: '8035', frase, dica, rotulo }`. O número de casas é `codigo.length`. `frase` e `dica` podem estar vazias (somem sem buraco); `dica` aparece depois de algumas tentativas erradas.
- Gancho de teste, obrigatório: um `input[data-acao="senha"]` de verdade (pode ser invisível, com as casas desenhadas por cima), `inputmode="numeric"`, `pattern="[0-9]*"`, fonte de 16 px ou mais (senão o Safari dá zoom). **Digitar os algarismos basta**: com o campo cheio a senha é conferida sozinha, sem botão. Os testes fazem `tap` no campo e `keyboard.type`.
- Errou: tremor suave (só `transform`; no reduzido, só opacidade), campo esvazia, `data-erro` no campo por um instante. Acertou: dissolve, e `som.destravar()` (o toque no campo é o primeiro gesto dela).
- No computador o campo nasce com o foco (o teste de teclado confere `document.activeElement.dataset.acao === 'senha'`). No iPhone o teclado só sobe com o toque dela: o campo precisa ser um alvo óbvio.
- `sairDaEntrada` é chamada pelo diretor em `musica:entrando`, com o mundo já ligado. Sem `#entrada` no DOM, resolve na hora. Nunca rejeita.
- Não é segurança (o código está no content.js). Nada de hash, nada de armazenamento.

### (b) Seletor de música em carrossel: `js/musica.js`, `css/musica.css` (grupo A)

```js
ctx.musica.escolher(recipiente) → Promise     // recipiente = #entrada-musica (antes era a folha)
ctx.musica.mostrarMini() / esconderMini()     // sem mudança
```

- O diretor chama `escolher(document.getElementById('entrada-musica'))` na etapa `musica`, sobre o preto. Resolve quando ela confirmou; ao resolver, o recipiente está vazio e a música tocando. Sem faixa válida, resolve na hora (como hoje). Depois o diretor publica `entrando`, liga o mundo, chama `sairDaEntrada` e `mostrarMini()`.
- Carrossel: as capas passam para o lado com o dedo (arrasto com inércia e encaixe; setas e teclado no computador; rótulos `musica.rotulos.anterior` / `proxima`). Tem de ficar bom **com uma faixa só** (o caso de hoje) e com várias (o autor vai adicionar).
- Ganchos de teste, obrigatórios e sem mudança de nome: `[data-acao="faixa"]` (o primeiro do DOM é a faixa central ao abrir, visível e tocável; tocar nela escolhe e começa a tocar) e `[data-acao="continuar"]` (confirma). Com teclado: o foco vai sozinho para a faixa central; Enter escolhe; Tab leva ao `continuar`.
- A entrega do disco para o canto (o mini) pode continuar: `#mini` fica em cima, à direita, e passa a aparecer sobre o mundo que está surgindo.
- O esqueleto usa o seletor antigo (desenhado para a folha de papel) pousado no preto: funciona, mas é provisório. A regra de CSS provisória está no fim de `css/senha.css`.
- `js/capitulos/poppy.js` aquecia o fundo quando via `inicio:musica`, que não existe mais: ver grupo B.

### Abertura: `js/cenas/abertura.js` (grupo A)

- `cenaAbertura(ctx, { frio })` continua publicando `frases` e resolvendo quando a última frase começa a sair. A especificação pede que ela ande **uns 10 s** até a primeira carta: contando da entrada do mundo, `frases` + `caminhada` devem somar perto disso. O mundo já chega andando (o preto se desfaz sobre a alameda), então o segundo de branco parado do começo não faz mais sentido. As frases de `abertura.frases` continuam aparecendo durante essa caminhada.
- O aquecimento da primeira carta já pede o tema: `aquecerEnvelope(mundo, { tema: 'poppy', lacre: 'coracao', amarracao: 'cordao' })`.
- `inicio` fria (`?cena=inicio`): o diretor já chama `mostrarMini()`.

### (c) Inventário (a bolsa): `js/inventario.js`, `css/inventario.css` (grupo B)

```js
export function criarInventario({ conteudo, amb, som, recursos, raiz })   // raiz = #inventario
inventario.guardar({ id, tipo, titulo, tema?, abrir }) → boolean   // true se o item é novo
inventario.tem(id) → boolean
inventario.itens → cópia da lista, na ordem em que foram guardados
inventario.mostrarBotao() / esconderBotao()
inventario.liberar(sim)          // só o diretor chama
inventario.abrirFolha() → boolean / fecharFolha()
inventario.aberto → boolean      // folha aberta OU item reaberto na frente
inventario.aoMudar(fn(itens)) → cancelar
```

- `tipo`: `'carta'` (capítulos; vem com `tema: 'poppy' | 'yourname'`), `'video'` (amigos), `'galeria'` (Surpresinha). `abrir()` devolve uma Promise que resolve quando ela fechou o que reabriu.
- Ids: `carta-poppy`, `carta-yourname` (postos pelo diretor), `chao-1`…`chao-6`, `chao-surpresinha` (postos por `cartas.js`). Guardar o mesmo id de novo só atualiza.
- `guardar` não mostra o botão; quem chama `mostrarBotao()` é o diretor (depois do primeiro bolso) e `cartas.js`.
- Botão no canto **inferior direito**, respeitando `--seguro-base` e `--seguro-dir`, alvo de 44 px ou mais. O mini da música fica no canto **superior** direito (`css/musica.css`: `top: seguro + 12px; right: seguro + 12px`): não se encostam. O botão não pode cobrir `#acoes` (centrado, `bottom: seguro + clamp(48px, 12vh, 112px)`) nem a dica.
- `liberar(false)`: o botão continua à vista, quieto (`#inventario[data-quieto]`), e a folha fecha se estava aberta. Itens ainda não guardados não aparecem.
- Ganchos de teste: `[data-acao="inventario"]`, `[data-acao="inventario-item"][data-id]`, `[data-acao="inventario-fechar"]`; `#inventario[data-aberto]` com a folha aberta.
- Reler um capítulo (o `abrir` das cartas) é do diretor: `receberPapel() → desenrolar(capitulo, { releitura: true }) → esperarFechar() → enrolar() → soltar()`, sem mudar cena nem etapa. O grupo B garante que isso fica bonito: o pergaminho aceita o segundo argumento (hoje ignora) e, na releitura, o mini e o tema do capítulo se comportam mesmo com `data-cena` sendo outra (o mini veste a pele por `data-cena`; ver `vestir` em js/musica.js, que é do grupo A: se precisar, combinem por um atributo em `#pergaminho`, por exemplo `data-capitulo`, que o grupo B escreve e o grupo A lê).
- Enquanto `inventario.aberto` for true, as cenas ignoram toques no mundo (ver carta.js em (f) e as cenas do grupo C).

### (d) Bolso: `js/cenas/bolso.js`, `css/bolso.css` (grupo B)

```js
export function criarBolso({ conteudo, amb, som, mundo, raiz })   // raiz = #bolso
bolso.guardar({ tema, envelope }) → Promise
bolso.ocupado → boolean
```

- O diretor chama em `poppy:guardando` e `yourname:guardando`, **depois** de `pergaminho.enrolar()` e `soltar()`: o mundo está à vista e a carta aberta (`envelope`, que era `ctx.estado.envelope`) ainda está lá, de onde saiu o papel. É a continuidade: a própria carta vai para a mão e para o bolso.
- `envelope` pode ser `null` (entrada por atalho, cena que quebrou): a animação desenha a carta sozinha, com a cara do `tema`.
- Ao resolver: o envelope **descartado** (`dispose()`), `#bolso` vazio e `hidden`, mundo ligado e limpo. Nunca rejeita, nunca passa de uns 4 s. Em movimento reduzido: uma dissolvência curta. Sem WebGL: funciona igual (a animação é DOM/SVG).
- Primeira pessoa, olhando para baixo: a mão dela (mesmo traço de `js/cenas/mao.js`; **não edite mao.js**, copie o que precisar ou peça ao grupo C para exportar) leva a carta ao bolso da saia do uniforme de verão (ver `assets/images/encontro-mitsuha-costas.webp` e `encontro-mitsuha-mao.webp`), e a carta some dentro. 2 a 3 s. Só `transform` e `opacity`.
- Texto para leitor de tela: `conteudo.inventario.rotulos.guardando`.
- Depois que `guardar` resolve, o diretor faz `inventario.guardar(...)` e `inventario.mostrarBotao()`. Se quiser que a carta "caia" no botão da bolsa, combine pelo `aoMudar` do inventário; a ordem das chamadas não muda.
- No `yourname`, logo depois vem `mao:olha` ("o fio vermelho aparece ao guardar"): a mão do grupo C entra no mesmo mundo, sem corte.

### (e) "Guardar no bolso" no lugar de "fechar capítulo" (grupo B)

- O texto vem do content.js: `poppy.fechar`, `yourname.fechar` e `yourname.rotuloFechar` agora valem `'Guardar no bolso'`. O gancho `[data-acao="fechar-capitulo"]` **não muda**, e o capítulo continua chamando `api.fechar()`; `pergaminho.esperarFechar()` é o aviso para o diretor.
- O que o grupo B ajusta nos capítulos e no pergaminho é só o que toca o fechamento: o desenho do botão (ícone/gesto de guardar em vez de fechar), o OSD `STOP` do Poppy se ainda fizer sentido, e a transição `enrolando` terminando numa carta que vai ser guardada (antes ela ia embora).
- `js/capitulos/poppy.js`, linha ~40: o `pararVigia` aquece o fundo ao ver `data-cena="inicio"` com `data-etapa="musica"`, que não existe mais. Trocar o gatilho (sugestão: `inicio` + `carta-espera`).
- `pergaminho.desenrolar(capitulo, { releitura })`: ver (c).

### (f) Envelope com tema: `js/mundo/envelope.js`, `js/cenas/carta.js` (grupo B)

```js
criarEnvelope(mundo, { lacre, amarracao, chegada, tema })     // tema: 'poppy' | 'yourname' | null (null = a carta branca de hoje)
aquecerEnvelope(mundo, { lacre, amarracao, tema })
env.tema                                                        // getter
cenaCarta(ctx, { tema, lacre, amarracao, distancia, entregar, anunciarCaminhada })
```

- O diretor já passa `tema: 'poppy'` na primeira carta e `tema: 'yourname'` na segunda; a última carta (mao.js / final.js) não passa tema e continua branca, amarrada só com o fio. A abertura já aquece com `tema: 'poppy'`.
- `chaveDe` (o cache dos aquecidos) precisa incluir o tema. O modo leve (`criarEnvelopeLeve`) também ganha o tema.
- Poppy: fita VHS / brinquedo, cores do capítulo (`#0d2534` com vermelho, amarelo, azul e verde de brinquedo). Your Name: céu do entardecer (`#090e33` a `#4a398c`, `#b25d9b`, `#ffd1a1`), cometa, cordão trançado. Reconhecível antes de abrir, sem copiar quadro, personagem ou logotipo. O papel que sai de dentro continua da cor da folha (`--papel`), para a troca com o pergaminho seguir invisível.
- `carta.js`: os toques em `carta-espera` já ignoram `#mini`; precisam ignorar também `#inventario` e tudo enquanto `ctx.inventario.aberto` (senão um toque na bolsa aberta abre a carta por baixo).
- A API do envelope que outras cenas usam não muda (`grupo`, `papel`, `abrir`, `entregarPapel`, `irEmbora`, `dispose`, `descartado`, `ancoraFio`, `caixaTela`, `brilharLaco`…): mao.js, encontro.js e final.js dependem dela.

### (g) Mão, corrida e cartas do chão (grupo C)

**`js/cenas/mao.js`**: `cenaMao(ctx, { frio })`, etapas `olha → mao-espera → correndo`.

- Entra com o mundo aberto e a folha já fora (o capítulo fez `enrolando` e `guardando`); o trecho antigo de "enrolando" virou só a limpeza de um envelope que tenha sobrado. O fio "aparece ao guardar": o começo de `olha` é a continuação direta do bolso.
- `olha` e `mao-espera` ficam como estão ("Olha a sua mão.", "eu te amo" na palma, botão `[data-acao="seguir-fio"]`, sem mudança de gancho).
- `correndo` substitui a caminhada lenta: primeira pessoa, mais rápido, balanço de corrida, o fio esticando à frente, pétalas passando, ele (`js/mundo/ele.js`) crescendo; ela desacelera ao chegar. Duração em `conteudo.corrida.segundos` (7; aceite de 5 a 10). No reduzido: sem balanço, dissolvência.
- Ao resolver deixa **o mesmo estado de hoje** (`estado.fio`, `estado.seguidorFio`, `estado.ele`, `estado.envelope` escondido com `estado.cartaEscondida`, `estado.distanciaFinal`, o entardecer aceso), porque o encontro e o final continuam dali. Ela para a uma distância dele em que caibam as cartas no chão entre os dois.
- `js/musica.js` (grupo A) recolhe o mini por `data-cena="mao"`; a etapa `enrolando` não existe mais ali, nada a combinar.

**`js/cenas/cartas.js` + `css/cartas.css`**: `export async function cenaCartas(ctx, { frio })`, etapas `pousando → escolhendo ⇄ assistindo → seguindo`.

- Lista: `cartasDoChao(conteudo)` (do diretor). Hoje são 7: Sariel, Ana, Mirai, Alpha, Pocoyoh, Nup e a Surpresinha (`tipo: 'galeria'`).
- No chão, entre ela e ele, **sem nome**. Tocar abre: `tipo 'video'` com `video` toca o vídeo (a música pausa e volta); sem `video`, abre um cartão com `cartasChao.vazio` (`{nome}` trocado pelo nome: "[vídeo de Sariel vem aqui]"). A Surpresinha abre uma galeria deslizante de `midias` (`foto` ou `video`, `legenda` opcional); vazia, o cartão `cartasChao.vazioSurpresinha`.
- Ao fechar: o nome é escrito à mão na carta (como em segredos.js), `data-estado="aberta"`, e `inventario.guardar({ id: carta.id, tipo: carta.tipo, titulo: carta.nome, abrir })` + `inventario.mostrarBotao()`. O `abrir` reabre o mesmo visor e resolve ao fechar.
- Vídeo que não carrega: a carta mostra só o nome, `data-estado="falhou"`, conta como aberta e vai para a bolsa. Nada trava.
- Botão de seguir (`cartasChao.seguir`): aparece discreto depois da primeira carta aberta, ganha `data-destaque` quando todas foram abertas. Tocar publica `seguindo`, as cartas saem e a cena resolve **sem mexer** no fio, nele, no envelope escondido nem no entardecer.
- `frio` (`?cena=cartas`): mundo aberto, mini à vista; sem ele e sem fio (ou criando-os, se for barato).
- Frase opcional no alto: `cartasChao.frase`.
- Ganchos de teste, obrigatórios: `[data-acao="carta-chao"]` com `data-id` e `data-estado="fechada|aberta|falhou"` (o estado muda **antes** de a etapa voltar a `escolhendo`); `[data-acao="fechar-carta"]`; `[data-acao="seguir-cartas"]` (com `data-destaque` quando todas abertas); o visor aberto é `.carta-chao-visor` com `data-tipo="video|galeria|vazio"`. As cartas e o botão precisam ser tocáveis pelo Playwright (elemento DOM visível sobre o desenho, como o `alvo-carta`), mesmo que o desenho seja 3D.
- Só reage a toques com `diretor.etapa() === 'escolhendo'` e `!ctx.inventario.aberto`.
- Matéria-prima: `js/cenas/segredos.js` e `css/segredos.css` (moldura do vídeo, medidas em pé/deitado, nome escrito à mão, falha de vídeo). Eles **não são mais carregados** (o index.html e o diretor apontam para cartas); absorva o que servir e apague os dois no fim.

**`js/cenas/encontro.js`**: entra depois de `cartas:seguindo` em vez de logo depois da mão. O estado que recebe é o mesmo; só conferir a emenda (o entardecer, o pulso de luz no fio, ele dando lugar à carta).

## 4. Divisão de arquivos (sem sobreposição)

**Grupo A (entrada)**
- `js/cenas/senha.js`, `css/senha.css` (novos; esqueleto pronto)
- `js/musica.js`, `css/musica.css`
- `js/cenas/abertura.js`

**Grupo B (cartas e bolso)**
- `js/mundo/envelope.js`, `js/cenas/carta.js`
- `js/pergaminho.js`, `css/pergaminho.css`
- `js/capitulos/**`, `css/poppy.css`, `css/yourname.css` (só no que toca o fechamento e o gatilho de aquecimento do Poppy)
- `js/cenas/bolso.js`, `css/bolso.css` (novos; esqueleto pronto)
- `js/inventario.js`, `css/inventario.css` (novos; esqueleto pronto)

**Grupo C (fio, corrida e cartas do chão)**
- `js/cenas/mao.js`, `css/mao.css`
- `js/mundo/ele.js`, `js/mundo/fio.js`
- `js/cenas/cartas.js`, `css/cartas.css` (novos; esqueleto pronto)
- `js/cenas/segredos.js`, `css/segredos.css` (matéria-prima; apagar no fim)
- `js/cenas/encontro.js`, `css/encontro.css`

**Ajuste em relação ao pedido original:** as cartas do chão ganharam arquivos novos (`cartas.js` / `cartas.css`) em vez de transformar `segredos.js` no lugar. Motivo: a cena mudou de nome, de posição na ordem e de ganchos, e o esqueleto precisava rodar hoje sem depender do código antigo. Os arquivos antigos ficam com o grupo C como matéria-prima.

**De ninguém (compartilhados; já feitos pelo arquiteto, não tocar):** `js/nucleo/**`, `js/main.js`, `index.html`, `js/content.js`, `css/base.css`, `css/mundo.css`, `css/final.css`, `js/cenas/final.js`, `js/som.js`, `js/mundo/mundo.js` e o resto de `js/mundo/`, `_dev/**`, `lib/**`. Se um grupo precisar de algo num desses (um campo novo no content.js, um z-index, um nó no index.html), **não edita**: devolve o pedido no relatório, com o texto exato. Para conteúdo novo, leia com valor padrão no código (`conteudo.x?.y || 'padrão'`) e peça o campo.

## 5. content.js (seções novas)

- `senha { codigo, frase, dica, rotulo }`
- `musica.rotulos.anterior`, `musica.rotulos.proxima`
- `poppy.fechar`, `yourname.fechar`, `yourname.rotuloFechar` = `'Guardar no bolso'`
- `inventario { titulo, cartaPoppy, cartaYourname, rotulos { abrir, fechar, guardando } }`
- `corrida { segundos }`
- `cartasChao { frase, seguir, vazio, vazioSurpresinha, rotulos { carta, fechar, anterior, proxima }, itens: [{ nome, video, capa }], surpresinha { nome, midias: [{ foto | video, legenda }] } }`
- A seção `segredos` saiu (o guia de formato e compressão de vídeo foi para `cartasChao`).

Vídeos em `assets/videos/` (a pasta ainda não existe; o autor cria ao pôr o primeiro).

## 6. Como testar

```
node _dev/ver.mjs --fluxo --vp iphone --rapido 6            a carta inteira, da senha a final:fim (digita a senha)
node _dev/ver.mjs --fluxo --vp iphone,desktop --rapido 6 --fotos
node _dev/ver.mjs --fluxo --vp iphone --rapido 6 --params "webgl=0"     (e "reduzido=1", e --motor webkit)
node _dev/ver.mjs --cena senha|musica|inicio|poppy|carta2|yourname|mao|cartas|encontro|final --vp iphone --rapido 6 --fotos
node _dev/ver.mjs --cena cartas --vp iphone --videos output/segredos-teste [--videos-falho]
node _dev/robustez.mjs [caso…]
```

- `--fluxo` abre sem atalho (o começo de verdade) e digita a senha do content.js; `--cena x` entra por `?cena=x`, que pula a senha.
- lib.mjs: `abrir({ cena, vp, motor, params, video, preparar, entrar })` (`entrar: true` sem `cena` já passa pela senha e pela música); sessão com `digitarSenha()`, `passarEntrada()`; `lerConteudo(videos?)`, `senhaDoConteudo(c)`, `temCartas(c)`, `contarCartas(c)`, `temEncontro(c)`, `videosDeTeste(pasta, { falho })`, `injetarVideos(page, videos)`.
- Nas cartas do chão o `--fluxo` abre e fecha as 7 e falha se alguma continuar `fechada`.
- Capturas e scripts de apoio de cada grupo: `output/roteiro/` (ignorado pelo git). Os scripts `output/roteiro/editar-*.mjs` são os que aplicaram esta mudança; não rode de novo.
- Cada grupo termina com `node _dev/ver.mjs --fluxo --vp iphone,desktop --rapido 6` em "Tudo certo." e zero erro de console, mais as variações `webgl=0`, `reduzido=1` e `--motor webkit` no iphone.

## 7. Integração (o que foi acertado depois dos três grupos)

- Reler pela bolsa: o diretor põe `html.relendo` enquanto o capítulo está na frente (o `#palco` da cena atual some: dica, mão, cartas do chão, botões; `css/base.css`); o botão da bolsa sai com `#inventario[data-relendo]`; o mini veste a pele por `#pergaminho[data-capitulo][data-releitura]` (`vestir`, em `js/musica.js`).
- `js/cenas/carta.js`: digitar a senha não conta como "usou o teclado" (a carta não nasce com o anel de foco).
- `som.diagnostico().abafo`: 1 = música inteira; menor enquanto um vídeo toca.
- Testes: `sessao.abrirDaBolsa(id)` / `fecharDaBolsa()` e `injetarVideos(page, videos, midias?)` no lib.mjs; o `--fluxo` do ver.mjs relê pela bolsa em `carta2:carta-espera`, `mao:mao-espera` e `cartas:escolhendo`, confere o destaque do botão de seguir e, com `--videos`, que a música abaixa e volta; caso novo `bolsa` no robustez.mjs.
- Folha de contato: `output/roteiro/folha.jpg` (`i-quadros.mjs` tira os quadros, `i-folha.mjs` e `i-empilhar.mjs` montam).
