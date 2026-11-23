# Contratos entre módulos (extraído do PROMPT-V2, seção "Exporta" de cada arquivo)

Este arquivo é a referência rápida do que cada módulo exporta e com que assinatura. Quem implementa um módulo segue o que está aqui; quem consome um módulo lê aqui o que pode chamar. Detalhes de comportamento estão na seção do módulo no PROMPT-V2 (C:/Users/uly/Desktop/PROMPT-V2-completo.md).


### js/content.js (1131 linhas)
- **Exporta:** nada. Não há função, classe nem import. O efeito é a global `window.CONTEUDO = {` (linha 34).

### LEIA-ME.md (325 linhas)
- **Exporta:** nada. É documentação.

### PRODUCT.md (70 linhas)
- **Exporta:** nada.

### DESIGN.md (299 linhas)
- **Exporta:** nada.

### _dev/ROTEIRO2.md (347 linhas)
- **Exporta:** nada (documento). Descreve as assinaturas do contrato: `cenaSenha(ctx, {frio})`, `sairDaEntrada(ctx)`, `ctx.musica.escolher(recipiente)`, `criarInventario({conteudo, amb, som, recursos, raiz})`, `inventario.guardar({id, tipo, titulo, tema?, abrir})`, `criarBolso({conteudo, amb, som, mundo, raiz})`, `criarEnvelope(mundo, {lacre, amarracao, chegada, tema})`, `aquecerEnvelope`, `cenaCarta(ctx, {...})`, `cenaMao(ctx, {frio})`, `cenaCartas(ctx, {frio})`, `criarDepois(ctx)`, `diasDeVida(nascimento, hoje?)`, `ctx.voz = criarVoz(ctx)`, `mundo.hora(alvo, {duracao})`. Também exporta `ORDEM`, `voltarAoMundo`, `temSenha`, `temCartas`, `temEncontro` e `cartasDoChao` (seção 2).

### PROMPT.md (101 linhas) — fora do repositório (`23.12 - especial/PROMPT.md`, só leitura)
- **Exporta:** nada.

### index.html (174 linhas)
- **Exporta:** nada (documento HTML). O único script próprio é um IIFE sem nome no `<head>`, que não devolve nada.

### js/main.js (261 linhas)
- **Exporta:** nada (não há `export`). Efeitos colaterais: `window.__carta` (via `criarDiretor`) e a chamada `iniciar()` no fim do arquivo.

### js/nucleo/ambiente.js (115 linhas)
- **Exporta:**
  - `detectarAmbiente()` → `amb` (objeto).
  - `baixarNivel(amb)` → nova string de nível, ou `null` se já está em `'baixo'`. Atualiza `amb.nivel`, `amb.dprMax` e `dataset.nivel`.

### js/nucleo/diretor.js (513 linhas)
- **Exporta:**
  - `ORDEM`: array de 11 nomes, `['senha','musica','inicio','poppy','carta2','yourname','mao','cartas','encontro','final','menu']`.
  - `temSenha(conteudo)` → boolean: `conteudo.senha.codigo` é string com texto depois de `trim()`.
  - `cartasDoChao(conteudo)` → array de `{ id, nome, tipo: 'video' | 'galeria', video, capa, midias }`. Itens de `cartasChao.itens` (sem nome, descartados) viram `tipo: 'video'` com `id: 'chao-N'` (N sequencial entre os aceitos). `cartasChao.surpresinha` (com nome) vem por último, com `id: 'chao-surpresinha'`, `tipo: 'galeria'`, `video: ''`, `capa: ''` e `midias` (só as que têm `foto` ou `video`, com `legenda`). Carta sem vídeo continua na lista.
  - `temCartas(conteudo)` → boolean: `cartasDoChao(conteudo).length > 0`.
  - `temEncontro(conteudo)` → boolean: algum item de `encontro.quadros` tem `imagem` string não vazia.
  - `temMenu(conteudo)` → boolean: `conteudo.menu` é objeto e não array.
  - `voltarAoMundo(ctx)` → Promise: `pergaminho.enrolar()`; zera `estado.envelope`; `Promise.all([pergaminho.soltar(), envelope ? envelope.irEmbora().then(() => envelope.dispose()) : null])`. Quem chama é mao.js.
  - `criarDiretor()` → objeto `diretor` (métodos abaixo) e instala `window.__carta`.

### js/nucleo/movimento.js (216 linhas)
- **Exporta:**
  - `curvas`: objeto `{ branco: { entrar, sair, camera, deriva }, poppy: { mola, quique, pulo, cair, corte }, yourname: { tempo, florescer, sumir }, ui: { resposta } }`. Os valores são nomes de ease registrados no GSAP.
  - `iniciarMovimento(ambiente)` → nada. Guarda a referência de `ambiente` (o mesmo `amb`) e registra as curvas, uma vez.
  - `comoPromise(animacao)` → Promise que resolve no `onComplete` ou no `onInterrupt`.
  - `revelarPalavras(elemento, texto?, opcoes?)` → Promise.
  - `ocultarPalavras(elemento, opcoes?)` → Promise.

### js/nucleo/recursos.js (101 linhas)
- **Exporta:** `criarRecursos(conteudo)` → objeto `recursos` com `imagem(endereco)`, `elementoImagem(endereco, alt = '')`, `precarregar(lista)` e `iniciar()`.

### js/nucleo/util.js (245 linhas)
- **Exporta** (todas as funções são exportadas; não há função interna):
  - `configurarTempo(rapido)` → nada. Define `fatorRapido`.
  - `espera(ms)` → Promise.
  - `quadro()` → Promise (próximo `requestAnimationFrame`).
  - `clamp(v, min = 0, max = 1)` → número.
  - `lerp(a, b, t)` → número.
  - `suave(t)` → número (curva em S entre 0 e 1).
  - `amortecer(atual, alvo, lambda, dt)` → número.
  - `semente(s = 1)` → função que devolve número entre 0 e 1.
  - `debounce(fn, ms = 150)` → função com `.cancelar()`.
  - `el(tag, attrs, filhos)` → elemento.
  - `svg(marcacao)` → elemento SVG (o primeiro filho do `<template>`).
  - `vibrar(amb)` → nada.
  - `compilarComPrazo(mundo, objs, ms = 1200)` → Promise.
  - `carregarImagem(endereco)` → Promise de `HTMLImageElement` ou `null`.
  - `pxParaNdc(x, y, largura = innerWidth, altura = innerHeight)` → `{ x, y }`.
  - `vetorLeve(x = 0, y = 0, z = 0)` → objeto com `x`, `y`, `z` e métodos.
  - `objetoLeve()` → objeto com `position`, `rotation`, `scale`, `visible`, `add`, `remove`, `attach`, `traverse`.
  - `menuLembrado()` → boolean.
  - `lembrarMenu(sim = true)` → nada.
  - `enderecoDaCena(cena, extra = {}, som = null)` → string (endereço).

### css/base.css (670 linhas)
- **Exporta:** nada (CSS). Define custom properties em `:root` e classes.

### js/cenas/senha.js (318 linhas)
- **Exporta:**
  - `cenaSenha(ctx)` → Promise<void>. Resolve quando a senha (ou a mestra) foi aceita e o campo já saiu do DOM; o preto continua para a música. Divergência: o cabeçalho (linha 4) e _dev/ROTEIRO2.md (linha 61) dizem `cenaSenha(ctx, { frio })`; o código declara `cenaSenha(ctx)` e não lê o segundo argumento, embora o diretor passe `{ frio: false }` (js/nucleo/diretor.js, linhas 260–261). Quem chama: só o diretor.
  - `sairDaEntrada(ctx)` → Promise<void>. Abre o preto sobre o mundo, remove `#entrada` e põe `sem-entrada` em `<html>`. Nunca rejeita (o erro vai para `console.error`). Sem `#entrada`, retorna na hora. Quem chama: só o diretor, em `cenas.musica` (js/nucleo/diretor.js, linha 282).

### js/cenas/abertura.js (158 linhas)
- **Exporta:**
  - `aquecerAbertura(ctx)` → Promise<void>. Prepara o envelope da primeira carta (tema `poppy`) e o programa das pétalas soltas, uma vez por página. Devolve sempre a mesma Promise e nunca rejeita (`.catch(() => {})`). Quem chama: `sairDaEntrada` (js/cenas/senha.js, linha 283) e a própria `cenaAbertura` (linha 109).
  - `cenaAbertura(ctx, { frio = false } = {})` → Promise<void>. Resolve quando a última frase acabou de aparecer (cabeçalho, linha 5). A saída dela continua agendada, e a carta começa com a frase ainda na tela. Quem chama: só o diretor, em `cenas.inicio` (js/nucleo/diretor.js, linha 288).

### css/senha.css (310 linhas)
- **Exporta:** nada (arquivo de CSS).

### js/letra.js (131 linhas)
- **Exporta:**
  - `criarLetra({ conteudo, som, amb })` → `{ parar() }`. Cria `div#letra` no `<body>` e devolve o cancelador. Se `conteudo.musica.legenda === false` ou nenhuma faixa tem linha, devolve `{ parar() {} }` e não cria nada.
  - `lerLrc` não é exportado (commit 38fdd2e: "Exports que ninguém importava viram internos: lerLrc, ...").

### css/letra.css (76 linhas)
- **Exporta:** nada (arquivo de CSS).

### js/som.js (722 linhas)
- **Exporta:** `criarSom(conteudo, amb)` → devolve o objeto `som` (API no item 3 de Comportamento). Nada mais é exportado: `RECEITAS` e `sintetizar` são internos desde o commit 38fdd2e.

### js/musica.js (1147 linhas)
- **Exporta:** `criarMusica({ conteudo, som, amb, recursos, mini })` → devolve `{ escolher(folha), mostrarMini(), esconderMini() }`. `escolher` devolve uma Promise que resolve quando ela toca em Continuar, ou na hora, se não há faixa válida. `js/main.js:107` chama com `mini: document.getElementById('mini')`.

### js/voz.js (447 linhas)
- **Exporta:** `criarVoz(ctx)` → devolve `api` = `{ liberar(), abrir() → Promise, fechar(), get aberto, get liberada }`. Chamada em `js/main.js:117` por `import('./voz.js')`, depois de `criarMusica` e da bolsa e antes de `letra.js`. Lê de `ctx`: `conteudo`, `amb`, `som`, `inventario` e `diretor`.

### css/musica.css (1013 linhas)
- **Exporta:** nada (CSS).

### css/voz.css (383 linhas)
- **Exporta:** nada (CSS).

### js/cenas/carta.js (434 linhas)
- **Exporta:**
  - `poseParada(mundo, baixar = 0.12, zOlhos = mundo.rig.position.z)` → `{ x, y, z }`. `x` = `rig.position.x`; `y` = `1.5 − d·tan(fov/2)·baixar`; `z` = `zOlhos − d`, com `d = distanciaDaCarta(mundo)` e `fov = camera.fov || 58` (graus). O `final.js` a usa com `baixar` 0,45.
  - `cenaCarta(ctx, opcoes = {})` → `Promise<{ env, papel, parar }>`. Opções e padrões: `tema = null` (`'poppy' | 'yourname' | null`), `lacre = 'coracao'` (`'coracao' | 'estrela' | null`), `amarracao = 'cordao'` (`'cordao' | 'fio'`), `distancia = 7` (metros; 0 = ela já está na frente), `entregar = true`, `anunciarCaminhada = true`, `baixar = 0.12`, `chacoalhar = ''` (texto do convite; só a última carta passa).
  - Chamadas reais: `diretor.js` (`inicio`: `tema 'poppy', lacre 'coracao', amarracao 'cordao', distancia 7`; `carta2`: `tema 'yourname', lacre 'estrela', amarracao 'cordao', distancia 7`) e `final.js` (`lacre: null, amarracao: 'fio', entregar: false, anunciarCaminhada: false, baixar: estado.entrega ? 0.45 : (padrão), chacoalhar: conteudo.final?.dicaChacoalhar`).

### js/cenas/cartas.js (979 linhas)
- **Exporta:**
  - `cenaCartas(ctx, { frio } = {})` → `Promise`: resolve quando ela toca em "Seguir em frente" e o `finally` termina a cena.
  - `abrirCartaDoChao(ctx, id)` → `Promise`: acha a carta por id em `cartasDoChao(ctx.conteudo)`, cria o visor fora da cena na primeira vez (`visorFora`) e chama `mostrar(carta)`; resolve quando o visor fecha. Sem carta, `Promise.resolve()`.
  - `semearCartas(ctx)` → nada: para cada id lembrado, chama `ctx.inventario.guardar({ id, tipo, titulo, abrir: () => abrirCartaDoChao(ctx, id) })`.

### js/cenas/bolso.js (299 linhas)
- **Exporta:**
  - `criarBolso({ conteudo, amb, som, raiz })` → objeto `bolso` com `guardar({ tema = 'poppy', envelope = null })` → `Promise` (nunca rejeita; dura no máximo `LIMITE_MS`) e o getter `ocupado` (boolean).
  - `raiz` é `#bolso` (`<div id="bolso" aria-hidden="true" hidden>`, em `index.html`).
  - Doc diz: o cabeçalho e `_dev/ROTEIRO2.md` (§3d) dizem `criarBolso({ conteudo, amb, som, mundo, raiz })`. Código faz: não usa `mundo` (`main.js` passa, e é ignorado). As partes do mundo são achadas pelos ids `#mundo` e `#mundo-leve`.

### js/inventario.js (320 linhas)
- **Exporta:**
  - `FITA_PEQUENA` → string SVG (viewBox 92 × 60) da fita cassete com coração no rótulo. Usada na faixa fixa desta bolsa e por `js/cenas/menu.js` (chão do menu).
  - `criarInventario({ conteudo, amb, som, raiz })` → API `inventario` (abaixo).
  - Doc diz: o cabeçalho e `_dev/ROTEIRO2.md` (§3c) dizem `{ conteudo, amb, som, recursos, raiz }`. Código faz: não recebe `recursos` (`main.js` passa, e é ignorado).
  - API: `guardar(item)` → boolean (true se novo; mesmo id só atualiza); `tem(id)`; `itens` (getter, cópia na ordem de entrada); `mostrarBotao()`; `esconderBotao()`; `liberar(sim)`; `manterLivre(sim = true)`; `reabrir(id)` → Promise; `abrirFolha()` → boolean; `fecharFolha(imediato = false)`; `aberto` (getter: folha aberta ou item reaberto); `aoMudar(fn)` → função que cancela.

### js/pergaminho.js (978 linhas)
- **Exporta:**
  - `criarPergaminho({ raiz, mundo, amb, som, conteudo, recursos })` → objeto `perg` (é o que `main.js` guarda em `ctx.pergaminho`).
  - `perg.el` (= `raiz`, `#pergaminho`); `perg.folha` (o elemento em branco, onde o seletor de música é montado); `perg.rolagem` (`el`, getter `y`, getter `progresso`, `aoRolar(fn(progresso, y))` → função que cancela, `irPara(y, { imediato })`).
  - `perg.estado` (getter): `'oculto' | 'folha' | 'aberto'` na variável JS. `'abrindo'`, `'fechando'` e `'saindo'` existem só em `data-estado`.
  - `perg.retanguloAlvo()` → `DOMRect` da moldura (se oculto, mede por um instante com `visibility: hidden` e marca `papelACaminho`).
  - `perg.receberPapel()` → Promise. Só age com `estado === 'oculto'`.
  - `perg.desenrolar(capitulo, { releitura = false })` → Promise (resolve quando o capítulo acaba de desenrolar). `capitulo` é `{ id, montar(raiz, api) → { destruir() } }`.
  - `perg.esperarFechar()` → Promise (resolve quando o capítulo chama `api.fechar()`).
  - `perg.enrolar()` → Promise, idempotente (`promessaEnrolar`).
  - `perg.soltar()` → Promise, idempotente (`promessaSoltar`).
  - Doc diz: o cabeçalho diz que `api` = `{ conteudo, amb, som, rolagem, fundo, gsap, fechar(), recursos }`. Código faz: também entrega `api.aberto`, uma Promise que resolve `true` quando o desenrolar termina e `false` se foi interrompido.
  - Doc diz: "o desenrolar é feito com um recorte (clip-path)". Código faz: `camada` e `miolo` se movem por `translate3d` em sentidos opostos, dentro de `overflow: hidden`. `clip-path` só aparece na costura (`recortar`).

### css/cartas.css (510 linhas)
- **Exporta:** nada (arquivo de estilo). Não há funções nem JS aqui.

### css/bolso.css (75 linhas)
- **Exporta:** nada (arquivo de estilo).

### css/inventario.css (358 linhas)
- **Exporta:** nada (arquivo de estilo).

### css/pergaminho.css (383 linhas)
- **Exporta:** nada (arquivo de estilo).

### js/cenas/mao.js (2107 linhas)
- **Exporta:** `cenaMao(ctx, { frio } = {}) → Promise<void>` (linha 1353, `async`). Não devolve valor. Não exporta mais nada.

### js/mundo/fio.js (1413 linhas)
- **Exporta:** `criarFio(mundo, opcoes = {}) → objeto do fio` (linha 840). É a única função exportada. `criarFio3D`, `criarFioLeve` e as demais são internas. O objeto devolvido tem: `objeto`, `comprimento` (getter, em m), `progresso(p?)`, `definirCurva(c, extras?)`, `fase(m?)`, `opacidade(v?)`, `acender(v?)`, `respirar(k = 0.22)`, `rastro(v?)`, `estrela(v?, taxa?, escala?)`, `halo(v?)`, `pulso({ de, ate, duracao, forca, largura, brasas, curva })` (Promise), `pontoEm(u?, saida?)`, `faiscar(ponto, n = 18)`, `atualizar(dt, t)` e `dispose()`. A versão leve acrescenta `elemento` (o `<svg>`).

### js/cenas/encontro.js (659 linhas)
- **Exporta:**
  - `prepararEncontro(ctx) → Promise<quadro[]>` (linha 90). Baixa e decodifica os quadros uma vez (cache em `estado.encontroQuadros`) e devolve só os que chegaram, na ordem do conteúdo. A cena da mão (js/cenas/mao.js) não chama esta função: quem chama é o diretor, ao carregar a cena da mão (js/nucleo/diretor.js:305).
  - `cenaEncontro(ctx, { frio } = {}) → Promise<void>` (linha 194, `async`). O cabeçalho (linha 3) diz que resolve "com a última carta à vista, fechada"; o código não devolve valor, e a carta aparece por `mostrarCarta`.

### css/mao.css (159 linhas)
- **Exporta:** nada (é um arquivo de estilos).

### css/encontro.css (235 linhas)
- **Exporta:** nada (é um arquivo de estilos).

### js/mundo/mundo.js (644 linhas)
- **Exporta:**
  - `ALTURA_OLHOS` (número, 1.5).
  - `curvaDaCaminhada(p)` → número: ease de 0..1 para 0..1 (tabela de 97 pontos, ver Constantes).
  - `criarPonteiro(amb)` → `{ x, y, ativo, atualizar(dt) }`; x e y suavizados em −1..1.
  - `criarMundo(opcoes)` → Promise do mundo. `opcoes = { amb, canvas, recipienteLeve }`. Devolve o objeto `mundo` (com `ok: true`) ou o do `leve.js` (`ok` falso).

### js/mundo/alameda.js (1786 linhas)
- **Exporta:** `criarAlameda(mundo)` → `{ grupo, pronta, surgir, atualizar, aplicarHora, nivel, afastar, uniformes, centro }`:
  - `grupo`: Object3D `alameda` (já na cena; `visible = false` até `surgir`).
  - `pronta`: Promise. Resolve quando `renderer.compileAsync(grupo, camera, cena)` termina, ou em 2.5 s.
  - `surgir(duracao = 1.8)` → `undefined`. Mostra o grupo e anima `uSurgir` de 0 a 1 (linear).
  - `atualizar(dt, t, deriva = 0)` → `undefined`. Chamado a cada quadro por `mundo.js`, antes do render. O cabeçalho do arquivo diz `atualizar(dt, t)`: o terceiro argumento existe e é obrigatório na prática.
  - `aplicarHora(estado)` → `undefined`. Recebe o objeto de `estadoDaHora` (hora.js).
  - `nivel(nivel)` → `undefined`. `'alto' | 'medio' | 'baixo'`.
  - `afastar(metros = 0, duracao = 1.2)` → `undefined`. Usado por `js/cenas/menu.js:535` (com 0) e por `js/mundo/folha.js:1561`.
  - `uniformes` → objeto `comuns` (`uNevoa, uCeu, uDens, uTarde, uLuz, uNoite, uSurgir, uTempo, uVao, uVaoZ, uDeriva`). Usado por `js/mundo/ele.js:548`.
  - `centro(z)` → número: x do meio do caminho em `z` do mundo (desconta `derivaAtual`). Não tem chamador em `js/`; só o cabeçalho e `_dev/DIRECAO.md` o citam.

### js/mundo/hora.js (211 linhas)
- **Exporta:**
  - `estadoDaHora(p)` → `{ p, nevoa, ceu, luz, petalas (cada um [r, g, b]), tarde, noite, dens }`. `p` é limitado a 0..4.
  - `pintarCometa(largura = 512, altura = 512)` → canvas com fundo transparente.
  - `criarHora(mundo, amb, aplicar)` → função `hora(alvo, { duracao = 4 } = {})`; também grava `mundo.hora = hora` e pinta o estado inicial. `aplicar(estado)` roda a cada passo.
  - `ligarHora({ mundo, diretor, amb })` → `undefined`. Chamado em `js/main.js:86`, logo após `criarMundo`.
  - `HORAS`, `PALETA`, `ROTEIRO`, `posicaoDe` e `mix3` não são exportados (commit `9ed0c56`: "ninguém fora do próprio arquivo usa").

### css/mundo.css (281 linhas)
- **Exporta:** nada (arquivo CSS). Variáveis que o arquivo usa e que vêm de `css/base.css`: `--branco` (`:root` na linha 60, `#ffffff`), `--tinta` (linha 61, `#2a1b22`), `--tela` (linha 110, `100vh`; linha 185 a redefine como `100dvh` numa regra `:root`, condição não verificada), `--curva-branco-deriva` (linha 115, `cubic-bezier(0.37, 0, 0.63, 1)`), `--z-mundo` (linha 124, `0`). Variáveis que o JS escreve: `--fundo-fuga-x` e `--fundo-fuga-y` (`js/mundo/fundo.js:171-172`), `--fundo-veu` e `--fundo-veu-noite` (`js/mundo/fundo.js:62`).

### js/mundo/petalas.js (877 linhas)
- **Exporta:** `criarPetalas(mundo, amb)` → devolve o objeto `petalas`. `petalas.objeto` é um `THREE.Group` chamado `'petalas'`, já adicionado a `mundo.cena` (js/mundo/mundo.js o esconde até o `compileAsync` terminar ou até 1,5 s, o que vier primeiro). Métodos (retorno vazio, salvo onde indicado):
  - `definirDensidade(k)`: `k = clamp(Number(k) || 0)` (0..1). Só muda o alvo (`densidadeAlvo`); o valor sobe ou desce amortecido.
  - `luzDaHora(cor)`: `cor` = `[r, g, b]`. Grava `uLuzHora`, que multiplica a cor de cada pétala. js/mundo/mundo.js chama com `e.petalas` de js/mundo/hora.js.
  - `definirFoco(metros)`: alvo do plano de foco. Número finito e > 0 vira `clamp(d, 0.4, 30)`; qualquer outra coisa vira 3 (FOCO_PADRAO).
  - `definirAbertura(k)`: alvo de `abertura` = `clamp(v, 0.5, 4)`; inválido vira 1.
  - `definirTempo(k)`: alvo de `tempoAlvo` = `clamp(v, 0.05, 1)`; inválido vira 1.
  - `protegerRetangulo(r)`: guarda `r`, que pode ser `{left, top, right, bottom}` em px, uma função que devolve isso a cada quadro, ou `null`.
  - `comecar()`: reinicia o relógio da abertura: `desde = 0`, `uDesde = 0`, `uSopro = 0` e `uDensidade` do chão = 0.
  - `protagonistas()`: agenda as protagonistas (ver Comportamento, item 8). Não faz nada no movimento reduzido.
  - `preparar()` → Promise: `renderer.compileAsync(malhaSoltas, camera, cena)`, uma vez. Chamadas seguintes devolvem a mesma Promise.
  - `rajada(posMundo, n = 12)`: `posMundo` é um `THREE.Vector3`. Não faz nada se `x` não for número.
  - `fugir(ndc)` (v2): `{x, y}` em coordenadas normalizadas da tela, ou `null`. As pétalas no ar e os vaga-lumes se afastam desse ponto; com `null`, voltam em uns 2 s. Não existe no modo leve (quem chama usa `?.`).
  - `magia(pos, forca = 1)`: `pos` = `{x, y, z}` ou `null`. A força vira alvo `clamp(forca, 0, 1)`.
  - `atualizar(dt)`: chamado a cada quadro (js/mundo/mundo.js: `aoQuadro(petalas.atualizar)`). O segundo argumento, `t`, chega e é ignorado.
  - `dispose()`: tira o grupo da cena, libera as três geometrias e os três materiais e cancela `aoRedimensionar` e `aoMudarNivel`.


### js/mundo/ele.js (653 linhas)
- **Exporta:**
  - `pintarEleEntrega()` → canvas 1024 × 2048 com a pose de entrega, ou `null` (try/catch). Não depende de WebGL. Usado por js/cenas/final.js:129.
  - `criarEle(mundo)` → objeto, ou `null` se `!mundo || !mundo.ok`, se a pintura falhar ou se a sombra falhar. O objeto tem:
    - `grupo`: `THREE.Group` chamado `'ele'`, com `visible = false` até `mostrar`. Os pés ficam em y = 0.
    - `prepararEntrega()`: pinta a pose de entrega (uma vez, sem efeito depois de `dispose`).
    - `entregar()` → boolean: prepara e troca `uMapa` do corpo pela pose de entrega. `false` se estiver descartado ou se a pintura falhou.
    - `ancoraCarta(olhos, saida = new Vector3())` → Vector3: onde pousar a carta (ver Comportamento).
    - `ancora(saida = new Vector3())` → Vector3: a mão que segura o fio, no mundo.
    - `mostrar(duracao = 3)` → Promise: deixa o grupo visível e faz `uOpacidade` ir de 0 a 1.
    - `sair(duracao = 0.8)` → Promise: faz `uOpacidade` ir a 0 e chama `dispose` no fim.
    - `dispose()`: idempotente (flag `fora`).


### js/mundo/fundo.js (369 linhas)
- **Exporta:**
  - `criarFundo({ amb, antesDe })` → objeto `fundo`. Se não houver URL em `CONTEUDO.pagina.fundo` ou `antesDe`, devolve o objeto "nada": `ativo: false`, `pronto: Promise.resolve(false)`, `cor: '#ffffff'`, e funções vazias. Com foto, o objeto tem:
    - `ativo` (boolean; vira false se a foto falhar).
    - `pronto` (Promise<boolean>; `true` quando a foto entra, `false` na falha).
    - `cor` = `'#ece0e6'` (`COR_HORIZONTE`), ou `'#ffffff'` se a foto falhar.
    - `caminhada(distancia)`: avisa o começo de uma caminhada e planeja a troca de foto.
    - `atualizar({ z, yaw, pitch, roll, dx, dy })`: a cada quadro (ver Comportamento, item 9).
    - `aplicarHora(estado)`: recebe o estado de js/mundo/hora.js (`estadoDaHora`).
    - `ligar()` e `desligar()`.
  - `criarVeus({ depoisDe })` → objeto com `ativo: false`, `pronto: Promise.resolve(false)`, `cor: '#ffffff'`, `caminhada()`, `atualizar()` (vazias), `ligar()` e `desligar()`. Sem `depoisDe` (ou sem `parentNode`) não cria nada.


### js/mundo/leve.js (587 linhas)
- **Exporta:** `criarMundoLeve({ amb, canvas, recipienteLeve, fundo = null })` → objeto `mundo` (síncrono). js/mundo/mundo.js:158-159 o carrega com `await import('./leve.js')` e passa `fundo`. Campos e métodos do objeto:
  - `ok: false`, `amb`, `THREE: null`, `renderer: null`, `camera: null`, `canvas`, `recipienteLeve`, `gpu: ''`.
  - `cena: objetoLeve()` (cabeçalho, linha 16, diz `null`; código faz `objetoLeve()`, e `_dev/API.md:54` confere com o código).
  - `rig` = `objetoLeve()` (`position` é `vetorLeve()`); `tamanho` (getters `largura` = innerWidth, `altura` = innerHeight, `dpr: 1`).
  - `ponteiro` (criarPonteiro de js/mundo/mundo.js, atualizado no laço), `ligado` e `deriva` (getters).
  - `aoQuadro(fn)` → cancela; `ligar()`, `desligar()`; `caminhar({distancia = 6, duracao = 5, curva})` → Promise.
  - `telaParaMundo(xNdc, yNdc, distancia = 1)` → `vetorLeve(xNdc, yNdc, −distancia)` com `.px` e `.py` em px de tela; `mundoParaTela(v)` → `{x, y, visivel: true}`; `retanguloParaPose()` → null.
  - `aoMudarNivel()` → função vazia (sem medidor de quadros no modo leve); `aoRedimensionar(fn)` → listener de `resize`, cancela.
  - `petalas` (objeto leve, abaixo) e `fundo` (o recebido).
  - `hora` é acrescentado por `criarHora(mundo, amb, …)` no fim.
  - `petalas`: `objeto` (a raiz `div.leve-mundo`), `definirDensidade(k)`, `definirFoco()` (vazio), `protegerRetangulo(r)`, `comecar()`, `protagonistas()`, `rajada(pos, n = 10)`, `atualizar()` (vazio), `dispose()`. Não há `luzDaHora`, `definirAbertura`, `definirTempo`, `magia` nem `preparar`: os chamadores usam `?.` (ex.: js/cenas/mao.js:1664, 1686, 1826) ou só chamam os métodos que existem.


### js/mundo/toque.js (68 linhas)
- **Exporta:** `ligarToque({ mundo, inventario, pergaminho })` → nada (`undefined`). Registra três listeners em `window`: `pointerdown` em fase de captura, `pointercancel` e `pointerup`. js/main.js:19 importa e js/main.js:97 chama `ligarToque(ctx)` (o `ctx` tem `mundo`, `inventario` e `pergaminho`).


### js/mundo/envelope.js (2435 linhas)
- **Exporta:**
  - `criarEnvelope(mundo, opcoes = {})` → `env`. Sem `mundo.ok`, devolve `criarEnvelopeLeve(mundo, opcoes)`. Com WebGL, procura em `aquecidos` uma carta com a mesma chave (`lacre|amarracao|tema`), do mesmo `mundo` e não descartada; se achar, tira da lista e devolve. Senão, `criarEnvelope3D(mundo, opcoes)`.
  - `aquecerEnvelope(mundo, opcoes = {})` → Promise. Sem `mundo.ok`, ou se já existe uma carta igual para o mesmo `mundo`, resolve na hora. Senão cria a 3D, guarda `{ chave, mundo, env }` em `aquecidos` e devolve `env.preparar()`. Em erro: `console.error('[carta] aquecer envelope', erro)` e resolve.
  - `imagemDoTema(tema, largura = 512)` → `HTMLCanvasElement` com a face do tema, cacheado por tema e largura; `null` para tema inválido ou erro.
  - Opções aceitas: `lacre` (`'coracao'` por padrão, `'estrela'`, ou `null` para sem lacre); `amarracao` (`'cordao'` por padrão ou `'fio'`); `tema` (`null`, `'poppy'` ou `'yourname'`; outro valor vira `null`); `chegada` (só na leve: segundos da entrada automática, padrão 2; `false` espera `env.chegar()`; a 3D ignora).
  - Nada mais é exportado.

### js/mundo/folha.js (2385 linhas)
- **Exporta:**
  - `criarFolha(mundo)` → objeto da folha, 3D ou leve. Campos: `grupo` (THREE.Group na 3D; objeto leve na DOM); `preparar(texto)` → Promise; `assumir(papel)` → nada; `desdobrar()` → Promise; `escrever(texto, opcoes = {})` → Promise; `escreverDela(texto, opcoes = {})` → Promise; `apagarDela()` → nada; `repousarFio()` → Promise; `viver()` → nada; `recuar()` → nada; `irEmbora()` → Promise; `atualizar(dt, t)` → nada; `dispose()` → nada.
  - Não há outro export.


### js/cenas/final.js (323 linhas)
- **Exporta:**
  - `entregaNaMao(ctx)` → boolean. Põe ele à frente de ela e a carta na mão dele, e marca `estado.entrega = true`. Devolve false, sem mudar nada, se não há WebGL, se não há carta ou a carta já está aberta, se `conteudo.mao.ele === false` ou se algo falha. Chamada por js/cenas/encontro.js (linha 178), sob o clarão.
  - `cenaFinal(ctx, { frio } = {})` → Promise (async). Só resolve quando ela toca na pílula que leva ao menu (`depois.seguir`). Sem o bloco `menu`, nunca resolve.


### css/final.css (152 linhas)
- **Exporta:** nada (arquivo de estilo).


### js/cenas/resposta.js (715 linhas)
- **Exporta:**
  - `criarDepois(ctx)` → objeto `{ temContador, temResposta, get dias(), contar, escrever, repousar, seguir, reescrever, noAlto, limparFim, reposicionar, raiz }`. `contar()`, `escrever()`, `reescrever()` e `limparFim()` devolvem Promise. `seguir` é uma Promise (não função) que resolve no toque da pílula. `repousar()`, `noAlto()` e `reposicionar()` devolvem nada. `raiz` é o `div.depois`.
  - `diasDeVida(nascimento, hoje = new Date())` → inteiro de dias entre `nascimento` ('AAAA-MM-DD') e `hoje` (Date ou 'AAAA-MM-DD'); `null` se a data é vazia, inválida ou futura.

### js/cenas/menu.js (895 linhas)
- **Exporta:**
  - `cenaMenu(ctx, { frio } = {})` → `async`; nunca resolve (`await new Promise(() => {})`). Roda referências e menu.
  - `portao(ctx, cena)` → Promise. Mostra o portão da parte `cena` e resolve depois do toque e da saída. Resolve já, sem portão, se `menu.partes[cena]` está vazio.

### css/resposta.css (388 linhas)
- **Exporta:** nada (arquivo de estilo). Não tem JavaScript.

### css/menu.css (699 linhas)
- **Exporta:** nada (arquivo de estilo).

### js/capitulos/poppy.js (528 linhas)
- **Exporta:** `capitulo` (objeto) com `id: 'poppy'` e `async montar(raiz, api)`, que devolve `{ destruir() }`. Nada mais é exportado. `CENAS` e `ICONE_PARAR` são internos.

### js/capitulos/poppy/cartao.js (182 linhas)
- **Exporta:**
  - `criarCartao({ texto, indice, amb, gsap, anima })` → `{ el, entrar({ imediato }) }`.
  - `criarMonitor({ img, legenda, indice, amb, gsap, anima })` → `{ el, entrar({ imediato }) }`.

### js/capitulos/poppy/esteira.js (301 linhas)
- **Exporta:** `criarEsteira(bloco, { amb, som })` → `{ el, quadro(dt, info), medir(), tocar(alvo), destruir() }`.
  - Doc diverge: o cabeçalho diz `ctx = { amb, gsap, som, anima }`; o código desestrutura só `amb` e `som` (`esteira.js:55`). `gsap` e `anima` não são usados.

### js/capitulos/poppy/fabrica.js (551 linhas)
- **Exporta:**
  - `FUGA = { x: 0.5, y: 0.46 }`: ponto de fuga, em fração da imagem, com y contado a partir do topo.
  - `desenharFabrica(largura = 640, altura = 1280)` → `HTMLCanvasElement`. Quem chama (`fundo.js`) não passa tamanho.

### js/capitulos/poppy/fita.js (206 linhas)
- **Exporta:** `criarFita(bloco, ctx)` → `{ el, medir(), quadro(dt, info), destruir() }`. O cabeçalho diz o mesmo. `bloco = { etiqueta, data }`; `ctx = { amb, gsap, som, anima, falha, piscarModo }`.

### js/capitulos/poppy/fundo.js (646 linhas)
- **Exporta:**
  - `criarFundo({ recipiente, amb, imagem = null })` → objeto `fundo` (API abaixo).
  - `aquecerFundo()` → nada; só agenda os passos ociosos.

### js/capitulos/poppy/maos.js (236 linhas)
- **Exporta:** `criarMaos(bloco, ctx)` → `{ el, quadro(dt, info), medir(), destruir() }`. O `ctx` usado é `{ amb, gsap, som, anima }`. `bloco` não é lido (o bloco `{ cena: 'maos' }` não tem campos).

### js/capitulos/poppy/osd.js (119 linhas)
- **Exporta:** `criarOsd({ rotulos = {}, contadorFinal = '' })` → `{ el, tela, clarao, get modoAtual(), modo(nome), contador(progresso), mostrarContador(), medir(altura), zonas(), encobrir(parte, sim) }`.

### js/capitulos/poppy/titulo.js (298 linhas)
- **Exporta:** `criarTitulo({ texto = '', subtitulo = '', logo = null, amb, gsap, anima, som })` → `{ el, preparar(), cair(), digitar(), tocar(alvo), destruir() }`.
  - Doc diverge: o cabeçalho (`titulo.js:5-11`) não lista `preparar()`, mas `poppy.js:202` chama. Ele existe e monta a pilha antes de cair.

### css/poppy.css (918 linhas)
- **Exporta:** nada (arquivo de estilo).

### js/capitulos/yourname.js (756 linhas)
- **Exporta:** `capitulo = { id: 'yourname', montar(raiz, api) }`. `montar` é `async` e resolve com `{ destruir() }`. O ramo `if (!vivo) return { destruir() {} }` logo após o `await` das imagens não pode disparar: `vivo` só vira `false` dentro de `destruir()`.

### js/capitulos/yourname/ceu-glsl.js (348 linhas)
- **Exporta:**
  - `VERTICE` (string): `attribute vec2 aPos; void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`.
  - `fragmento({ oitavas = 4, detalhe = 2 } = {}) → string`: a fonte do fragment shader.

### js/capitulos/yourname/ceu.js (231 linhas)
- **Exporta:** `criarPintorWebGL(recipiente, amb) → pintor | null`. O `pintor` tem `tipo: 'webgl'`, `tela` (o canvas), `aspecto` (getter: `largura/altura`), `pronto` (Promise de booleano), `redimensionar()`, `baixar() → bool`, `desenhar(e)` e `destruir()`. Devolve `null` se o navegador não dá contexto WebGL.

### js/capitulos/yourname/ceu-leve.js (394 linhas)
- **Exporta:** `criarPintorLeve(recipiente, amb = {}, { provisorio = false } = {}) → pintor`. `pintor = { tipo: 'leve', tela (a raiz div), aspecto (getter W/H), redimensionar() (igual a ajustar), baixar() → false, desenhar(estado), destruir() }`.

### js/capitulos/yourname/cordao.js (234 linhas)
- **Exporta:**
  - `amostrar(pontos, passo = 2) → { n, x, y, tx, ty, seg, comprimento, passo }`: curva Catmull-Rom centrípeta, reamostrada a cada `passo` px. `x` e `y` são Float32Array; `tx` e `ty` são as tangentes unitárias; `seg` (Uint16Array) é o índice do segmento de origem. Com menos de dois pontos úteis, devolve `n: 0`.
  - `criarCordao({ tras, frente }) → { construir(pontos, { linha }), revelar(rolagem) → { x, y, camada } | null, destruir() }`.

### js/capitulos/yourname/paleta.js (174 linhas)
- **Exporta:**
  - `novoEstado() → e`: objeto com `hora, tempo, rol, clarao, fim` em zero; dez cores (`c0, c1, c2, c3, luz, sombra, borda, sol, longe, perto`), cada uma `[r, g, b]` de 0 a 1; cinco números (`solForca, cobertura, estica, estrelas, veu`); `solX = 0.72`, `solY = 1.2`, `terra = -0.125`; `cometa = { forca, sep, tronco, a, b, origem, divisao }`.
  - `misturar(hora, e) → e`: preenche `e` in place com as cores e medidas da hora.
  - `cometa(k, aspecto, c)`: preenche `c` (o `estado.cometa`) para o instante `k`, de 0 a 2.
  - `css(c, alfa?) → 'rgb(r, g, b)'` ou `'rgba(r, g, b, alfa)'`, com cada canal de 0 a 1 limitado e convertido para 0–255.

### js/capitulos/yourname/tempo.js (179 linhas)
- **Exporta:** `criarTempo({ fundo, amb, aoQuadro, aoDividir, quando, aoTrocar }) → { estado, get tipo(), definir({ hora, k, rol }), assentar(), encerrar(), redimensionar(), destruir() }`. Parâmetros: `fundo` (o `.perg-fundo`), `amb`, `aoQuadro(e)` (chamado quando a hora do céu muda mais de 0,002), `aoDividir()` (no instante em que o cometa se divide), `quando` (Promise que libera o WebGL) e `aoTrocar(tipo)` (chamado quando o pintor muda).

### css/yourname.css (463 linhas)
- **Exporta:** nada (CSS puro). Carregado direto por `index.html:97`.

### _dev/ver.mjs (350 linhas)
- **Exporta:** nada. Ao carregar, chama `principal()` e encerra com `process.exit`.

### _dev/lib.mjs (475 linhas)
- **Exporta:**
  - `RAIZ`: raiz do repositório (pasta acima de _dev).
  - `PASTA_FOTOS` = RAIZ/output/ver; `PASTA_VIDEO` = RAIZ/output/video.
  - `VIEWPORTS`: objeto com celular, iphone, iphone-safari e desktop.
  - `carregarPlaywright()` → módulo do Playwright. Procura, nesta ordem, `CARTA_PW`, um caminho fixo de pasta temporária desta sessão e `'playwright'`. Sem achar: erro com a dica de definir CARTA_PW.
  - `subirServidor(raiz = RAIZ)` → Promise de `{ porta, url, fechar() }`.
  - `lerConteudo(videos = null)` → objeto CONTEUDO (avalia js/content.js num vm com `window = {}`); com `videos`, põe `item.video` nas cartas do chão.
  - `senhaDoConteudo(conteudo = lerConteudo())` → `senha.mestra` ou `senha.codigo`, aparados; '' se não há nenhuma.
  - `contarCartas(conteudo)` → amigos com nome, mais 1 se `cartasChao.surpresinha` tem nome.
  - `temCartas(conteudo)` → contarCartas > 0.
  - `temEncontro(conteudo)` → há quadro com imagem em `encontro.quadros`.
  - `temContador(conteudo)` → `contador.nascimento` no formato AAAA-M-D.
  - `temResposta(conteudo)` → `resposta` existe e `ativa !== false`.
  - `etapasDoFinal(conteudo = lerConteudo())` → lista de etapas da cena final.
  - `temMenu(conteudo)` → `menu` é objeto que não é array.
  - `videosDeTeste(pasta, { falho = false })` → caminhos relativos à raiz dos .mp4 da pasta, em ordem; com `falho`, acrescenta `nao-existe.mp4`.
  - `ERRO_ESPERADO = /nao-existe\.mp4/`.
  - `injetarVideos(page, videos, midias = null)` → Promise; intercepta js/content.js (page.route) e acrescenta código que põe `item.video` em cada carta e, com `midias`, `surpresinha.midias`.
  - `abrir({ cena, vp = 'celular', motor = 'chromium', params = {}, video = false, preparar = null, entrar = false })` → Promise da sessão.

### _dev/robustez.mjs (933 linhas)
- **Exporta:** nada. Linha de comando: `node _dev/robustez.mjs` (todos os casos) ou `node _dev/robustez.mjs spam resize` (só os pedidos). Caso desconhecido: "FALHA caso desconhecido".

### _dev/capa.mjs (109 linhas)
- **Exporta:** nada. Linha de comando: `node _dev/capa.mjs [--motor webkit] [--espera ms] [--ponteiro x,y] [--perto k] [--saida caminho]`.

### _dev/icone.mjs (74 linhas)
- **Exporta:** nada. Linha de comando: `node _dev/icone.mjs [--lado N] [--saida caminho]`.

### _dev/alameda-imagem.mjs (29 linhas)
- **Exporta:** nada. Argumentos posicionais: `node _dev/alameda-imagem.mjs [lado=2000] [saida=assets/images/alameda.webp] [z=-2] [q=0.75]`.

### _dev/colocar-textos.mjs (369 linhas)
- **Exporta:** nada. Linha de comando: `node _dev/colocar-textos.mjs` (lê textos/ da raiz), `node _dev/colocar-textos.mjs <pasta>` ou `node _dev/colocar-textos.mjs --teste`.

### _dev/tira.py (25 linhas)
- **Exporta:** nada. Uso: `python _dev/tira.py <vp> [tema] [ms...]`. Sem ms, usa todas as fotos desse vp e tema, em ordem numérica.

### _dev/ver-bolso.mjs (130 linhas)
- **Exporta:** nada. Uso: `node _dev/ver-bolso.mjs [vp] [tema] [ms,ms,...] [--motor webkit] [--params "webgl=0"]`. vp: `iphone` (padrão), `iphone-safari`, `celular` ou `desktop`. tema: `poppy` (padrão) ou `yourname`. ms: instantes das fotos, em ms da linha do tempo do bolso.

### _dev/API.md (144 linhas)
- **Exporta:** nada (documento). Sem funções nem constantes próprias.

### _dev/DIRECAO.md (272 linhas)
- **Exporta:** nada.

### _dev/UI.md (46 linhas)
- **Exporta:** nada (documento).

### _dev/ideias.md (41 linhas)
- **Exporta:** nada (documento).

### _dev/prompts-imagens.md (60 linhas)
- **Exporta:** nada (documento).

### colocar-textos.bat (33 linhas)
- **Exporta:** nada.

### _config.yml (9 linhas)
- **Exporta:** nada.

### .gitignore (20 linhas)
- **Exporta:** nada.

### .gitattributes (1 linha)
- **Exporta:** nada.

### lib/VERSOES.txt (24 linhas)
- **Exporta:** nada.

### _dev/colocar-letra.mjs (56 linhas)
- **Exporta:** nada. É uma linha de comando: `node _dev/colocar-letra.mjs <número> <arquivo.txt>`.

### _dev/sincronizar-letra.mjs (79 linhas)
- **Exporta:** nada. Linha de comando: `node _dev/sincronizar-letra.mjs <tempos.json>`.

### _dev/ver-letra.mjs (34 linhas)
- **Exporta:** nada. Linha de comando: `node _dev/ver-letra.mjs [segundo] [faixa 1|2]`.

### colocar-letra.bat (30 linhas)
- **Exporta:** nada.

### _dev/marcar-letra.html (106 linhas)
- **Exporta:** nada. É uma página HTML com script inline.
