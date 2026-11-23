# API da v2 (gerada do código)

Resumo da API real, na ordem nova: senha → música → inicio → poppy → carta2 → yourname → mao → cartas → encontro → final → menu. Em caso de divergência com qualquer documento, vale o código. O contrato peça por peça, com o comportamento, está em `_dev/ROTEIRO2.md` e no PROMPT-V2; as assinaturas esperadas de cada módulo estão em `_dev/CONTRATOS.md`.

A lista de exports e ganchos foi gerada do código; ao mudar um export, atualize a linha dele aqui e em `_dev/CONTRATOS.md`.

## Contexto (`ctx`)
`{ conteudo, amb, mundo, som, musica, pergaminho, inventario, bolso, voz, letra, diretor, gsap, recursos, estado, mundoPronto() }`. Fica em `window.__carta.ctx` para os testes. `window.__carta` tem também `cena`, `etapa`, `historico` (`{ cena, etapa, t }`), `pronto` (Promise resolvida no começo de `diretor.rodar`), `gpu` e `erro`.

## Ambiente (`amb`)
`{ webgl, nivel ('alto'|'medio'|'baixo'), reduzido, toque, ios, dprMax (2 / 1,5 / 1), rapido (0,1 a 60), android, mudo, forcado, params }`. Marca `<html>` com `reduzido`, `sem-webgl` e `data-nivel`.

## Parâmetros de URL
`cena` (com o apelido `segredos` → `cartas`), `rapido`, `nivel`, `webgl=0`, `reduzido=1|0`, `mudo=1`, `musica=N`, `hoje=AAAA-MM-DD`, `voz=1|abrir|0`, `frase=…`, `menu=0|1`, `volta=1`. Sobrevivem à troca de cena (`enderecoDaCena`): rapido, nivel, webgl, reduzido, mudo.

## Exports por arquivo
- **js/capitulos/poppy.js**: `capitulo`
- **js/capitulos/poppy/cartao.js**: `criarCartao({ texto, indice = 0, amb, gsap, anima })`, `criarMonitor({ img, legenda, indice = 0, amb, gsap, anima })`
- **js/capitulos/poppy/esteira.js**: `criarEsteira(bloco, { amb, som })`
- **js/capitulos/poppy/fabrica.js**: `FUGA`, `desenharFabrica(largura = 640, altura = 1280)`
- **js/capitulos/poppy/fita.js**: `criarFita(bloco, { amb, gsap, som, anima, falha, piscarModo })`
- **js/capitulos/poppy/fundo.js**: `aquecerFundo()`, `criarFundo({ recipiente, amb, imagem = null })`
- **js/capitulos/poppy/maos.js**: `criarMaos(bloco, { amb, gsap, som, anima })`
- **js/capitulos/poppy/osd.js**: `criarOsd({ rotulos = {}, contadorFinal = '' } = {})`
- **js/capitulos/poppy/titulo.js**: `criarTitulo({ texto = '', subtitulo = '', logo = null, amb, gsap, anima, som } = {})`
- **js/capitulos/yourname.js**: `capitulo`
- **js/capitulos/yourname/ceu-glsl.js**: `VERTICE`, `fragmento({ oitavas = 4, detalhe = 2 } = {})`
- **js/capitulos/yourname/ceu-leve.js**: `criarPintorLeve(recipiente, amb = {}, { provisorio = false } = {})`
- **js/capitulos/yourname/ceu.js**: `criarPintorWebGL(recipiente, amb)`
- **js/capitulos/yourname/cordao.js**: `amostrar(pontos, passo = 2)`, `criarCordao({ tras, frente })`
- **js/capitulos/yourname/paleta.js**: `novoEstado()`, `misturar(hora, e)`, `cometa(k, aspecto, c)`, `css(c, alfa)`
- **js/capitulos/yourname/tempo.js**: `criarTempo({ fundo, amb = {}, aoQuadro, aoDividir, quando, aoTrocar })`
- **js/cenas/abertura.js**: `aquecerAbertura(ctx)`, `cenaAbertura(ctx, { frio = false } = {})` (async)
- **js/cenas/bolso.js**: `criarBolso({ conteudo, amb, som, raiz })`
- **js/cenas/carta.js**: `poseParada(mundo, baixar = BAIXAR, zOlhos = mundo.rig.position.z)`, `cenaCarta(ctx, opcoes = {})` (async)
- **js/cenas/cartas.js**: `abrirCartaDoChao(ctx, id)`, `semearCartas(ctx)`, `cenaCartas(ctx, { frio = false } = {})` (async)
- **js/cenas/encontro.js**: `prepararEncontro(ctx)`, `cenaEncontro(ctx, { frio = false } = {})` (async)
- **js/cenas/final.js**: `entregaNaMao(ctx)`, `cenaFinal(ctx, { frio = false } = {})` (async)
- **js/cenas/mao.js**: `cenaMao(ctx, { frio } = {})` (async)
- **js/cenas/menu.js**: `portao(ctx, cena)`, `cenaMenu(ctx, { frio = false } = {})` (async)
- **js/cenas/resposta.js**: `diasDeVida(nascimento, hoje = new Date()`, `criarDepois(ctx)`
- **js/cenas/senha.js**: `cenaSenha(ctx)` (async), `sairDaEntrada(ctx)` (async)
- **js/inventario.js**: `FITA_PEQUENA`, `criarInventario({ conteudo, amb, som, raiz })`
- **js/letra.js**: `criarLetra({ conteudo, som, amb })`
- **js/main.js**: sem exports
- **js/mundo/alameda.js**: `criarAlameda(mundo)`
- **js/mundo/ele.js**: `pintarEleEntrega()`, `criarEle(mundo)`
- **js/mundo/envelope.js**: `imagemDoTema(tema, largura = 512)`, `criarEnvelope(mundo, opcoes = {})`, `aquecerEnvelope(mundo, opcoes = {})`
- **js/mundo/fio.js**: `criarFio(mundo, opcoes = {})`
- **js/mundo/folha.js**: `criarFolha(mundo)`
- **js/mundo/fundo.js**: `criarFundo({ amb, antesDe } = {})`, `criarVeus({ depoisDe } = {})`
- **js/mundo/hora.js**: `estadoDaHora(p)`, `pintarCometa(largura = 512, altura = 512)`, `criarHora(mundo, amb, aplicar)`, `ligarHora({ mundo, diretor })`
- **js/mundo/leve.js**: `criarMundoLeve({ amb, canvas, recipienteLeve, fundo = null })`
- **js/mundo/mundo.js**: `ALTURA_OLHOS`, `curvaDaCaminhada(p)`, `criarPonteiro(amb)`, `criarMundo(opcoes)` (async)
- **js/mundo/petalas.js**: `criarPetalas(mundo, amb = mundo.amb)`
- **js/mundo/toque.js**: `ligarToque({ mundo, inventario, pergaminho })`
- **js/musica.js**: `criarMusica({ conteudo, som, amb, recursos, mini })`
- **js/nucleo/ambiente.js**: `detectarAmbiente()`, `baixarNivel(amb)`
- **js/nucleo/diretor.js**: `ORDEM`, `temSenha(conteudo)`, `cartasDoChao(conteudo)`, `temCartas(conteudo)`, `temEncontro(conteudo)`, `temMenu(conteudo)`, `voltarAoMundo(ctx)`, `criarDiretor()`
- **js/nucleo/movimento.js**: `curvas`, `iniciarMovimento(ambiente)`, `comoPromise(animacao)`, `revelarPalavras(elemento, texto, opcoes = {})`, `ocultarPalavras(elemento, opcoes = {})`
- **js/nucleo/recursos.js**: `criarRecursos(conteudo)`
- **js/nucleo/util.js**: `configurarTempo(rapido)`, `espera(ms)`, `quadro()`, `clamp(v, min = 0, max = 1)`, `lerp(a, b, t)`, `suave(t)`, `amortecer(atual, alvo, lambda, dt)`, `semente(s = 1)`, `debounce(fn, ms = 150)`, `el(tag, attrs, filhos)`, `svg(marcacao)`, `vibrar(amb)`, `compilarComPrazo(mundo, objs, ms = 1200)`, `carregarImagem(endereco)`, `pxParaNdc(x, y, largura = innerWidth, altura = innerHeight)`, `vetorLeve(x = 0, y = 0, z = 0)`, `objetoLeve()`, `menuLembrado()`, `lembrarMenu(sim = true)`, `enderecoDaCena(cena, extra = {}, som = null)`
- **js/pergaminho.js**: `criarPergaminho({ raiz, mundo, amb, som, conteudo, recursos })`
- **js/som.js**: `criarSom(conteudo, amb)`
- **js/voz.js**: `criarVoz(ctx)`

## Ganchos de teste (data-acao encontrados no código)
- `abrir-carta`
- `amarrar-fio`
- `carta-chao`
- `continuar`
- `faixa`
- `fechar-capitulo`
- `fechar-carta`
- `inventario`
- `inventario-fechar`
- `inventario-item`
- `menu-bilhete`
- `menu-bilhetes`
- `menu-escrever`
- `menu-fechar`
- `menu-ir`
- `menu-parte`
- `menu-pular`
- `menu-referencias`
- `menu-saudade`
- `menu-voz`
- `mini`
- `mini-alternar`
- `mini-menu`
- `portao`
- `portao-voltar`
- `resposta-abrir`
- `resposta-compartilhar`
- `resposta-enviar`
- `resposta-guardar`
- `resposta-texto`
- `seguir-cartas`
- `seguir-fio`
- `senha`
- `senha-ir`
- `voz-baixar`
- `voz-fechar`
- `voz-tocar`

## Chaves do armazenamento do aparelho
- `carta2312:chao`
- `carta2312:menu`
- `carta2312:resposta`
- `carta2312:voz`

## Etapas publicadas (diretor.etapa)
assistindo, carta, carta-abrindo, carta-chegando, carta-espera, chegando, contador, correndo, desdobrando, desenrolando, enrolando, entrando, escolhendo, escrevendo, fim, frases, guardando, lendo, mao-espera, maos, menu, musica, olha, papel, planos, pousando, referencias, resposta, seguindo, senha, senha-certa
, caminhada (publicada por variável em carta.js)

## DOM fixo (index.html)
`canvas#mundo`, `div#mundo-leve`, `main#palco` (`#frases`, `p#dica`, `#acoes`), `section#pergaminho`, `aside#inventario`, `aside#mini`, `div#bolso`, `section#entrada` (`#entrada-senha`, `#entrada-musica`). Atributos de estado: `html[data-cena][data-etapa][data-nivel]`, `html.reduzido`, `html.sem-webgl`, `html.sem-entrada`, `html.entra-noite`, `html.relendo`.

## Como testar
- `node _dev/conferir-imports.mjs` → "IMPORTS OK".
- `node _dev/ver.mjs --fluxo --vp iphone-safari,desktop --rapido 6` → "Tudo certo."
- `node _dev/ver.mjs --fluxo --vp iphone-safari --motor webkit --rapido 6` → "Tudo certo."
- `node _dev/ver.mjs --fluxo --vp iphone-safari --rapido 6 --params "webgl=0"` (e `reduzido=1`, `mudo=1`).
- `node _dev/ver.mjs --cena <cena> --vp iphone-safari,desktop --fotos` → fotos em output/ver/.
- `node _dev/robustez.mjs` → "ROBUSTEZ OK".
