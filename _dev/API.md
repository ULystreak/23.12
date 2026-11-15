# API real do esqueleto

Resumo do que existe de fato no código, escrito por quem verificou o esqueleto. Complementa as seções 4 e 6 de `_dev/DIRECAO.md`; se houver divergência, vale o código.

```
TEMPO E UTIL (js/nucleo/util.js)
- espera(ms) → Promise. Milissegundos, dividido por ?rapido, só conta com a aba visível.
- quadro() → Promise(próximo rAF). clamp(v, min=0, max=1), lerp(a,b,t), mapear(v,a,b,c,d), suave(t), amortecer(atual, alvo, lambda, dt), aleatorio(min,max), semente(s) → () => 0..1, debounce(fn, ms=150) (+ .cancelar()).
- el(tag, attrs|classe, filhos) → Element. attrs aceita class, dataset{}, style{}, texto, onEvento; texto nunca vira HTML. svg(marcacao) → SVGElement.
- carregarImagem(url) → Promise<HTMLImageElement|null> ('' não faz pedido). umaVez(alvo, evento, opcoes) → Promise. pxParaNdc(x, y, largura?, altura?) → { x, y }. vetorLeve(x,y,z), objetoLeve(). configurarTempo(rapido) é só do main.js.

MOVIMENTO (js/nucleo/movimento.js)
- curvas = { branco: { entrar, sair, camera, deriva }, poppy: { mola, quique, pulo, cair, corte }, yourname: { tempo, florescer, sumir }, ui: { resposta } }: nomes de ease da GSAP (ex.: ease: curvas.branco.entrar). Espelho em CSS: --curva-*.
- revelarPalavras(el, texto?, { duracao=1.4, intervalo=0.14, atraso=0, subida='0.4em', curva }) → Promise.
- revelarLetras(el, texto?, { duracao=0.9, intervalo=0.045, subida='0.25em', ... }) → Promise.
- ocultarPalavras(el, { duracao=0.9, intervalo=0.06, atraso=0, subida='-0.35em', curva }) → Promise (esvazia o elemento).
- Tempos da GSAP em segundos; ?rapido é o timeScale global. Com amb.reduzido entra só com opacidade.

AMBIENTE: amb = { webgl, nivel:'alto'|'medio'|'baixo', reduzido, toque, ios, dprMax (2|1.5|1), rapido, android, mudo, forcado, params:URLSearchParams }. <html> recebe classes toque, ios, reduzido, sem-webgl e data-nivel.

CONTEXTO: ctx = { conteudo, amb, mundo, som, musica, pergaminho, diretor, gsap, ScrollTrigger, recursos, estado }. ctx.ScrollTrigger chega undefined (o index.html não carrega mais o plugin; ver GLOBAIS). estado é livre (estado.envelope, estado.fio, estado.distanciaFinal, estado.folha, estado.seguidorFio).
- recursos.imagem(url) → Promise<HTMLImageElement|null>; recursos.elementoImagem(url, alt='') → Promise<img novo|null>; recursos.precarregar(lista) → Promise; recursos.iniciar().

DIRETOR (js/nucleo/diretor.js)
- diretor.etapa(nome) publica em <html data-etapa>; diretor.etapa() devolve a atual. diretor.cena, .etapaAtual, .historico [{cena, etapa, t}], .ordem, .aoMudar(fn(cena, etapa)) → cancelar, .cenaInicial() → string, .aquecer(), .rodar(ctx, cenaInicial).
- export voltarAoMundo(ctx) → Promise (enrola, solta a folha, manda embora e descarta estado.envelope). export ORDEM. export temSegredos(conteudo) → boolean (algum item de segredos com vídeo; sem isso o diretor pula a cena "segredos").
- Cena = async (ctx, { frio }). Cena que lança exceção: o diretor limpa tudo e a próxima entra com frio: true.
- window.__carta = { ctx, cena, etapa, historico, pronto: Promise<ctx>, gpu, erro }.
- Nomes que o diretor importa: cenaAbertura (js/cenas/abertura.js), cenaCarta (js/cenas/carta.js), cenaMao (js/cenas/mao.js), cenaFinal (js/cenas/final.js), capitulo (js/capitulos/poppy.js e yourname.js).
- Parâmetros: ?cena=inicio|poppy|carta2|yourname|segredos|mao|final (inválido → inicio), ?rapido=N (0.1 a 60), ?nivel=alto|medio|baixo, ?webgl=0, ?reduzido=1 (ou 0), ?mudo=1, ?musica=N (interno).

MUNDO (ctx.mundo; export async criarMundo({ amb, canvas, recipienteLeve }))
- ok:boolean; THREE, renderer, cena, camera (PerspectiveCamera, 1,5 m, FOV 58° em pé a 42° deitado), rig (Group; a caminhada move rig.position.z); canvas; amb; gpu; tamanho { largura, altura, dpr }; ligado (getter); recipienteLeve.
- aoQuadro(fn(dt, t)) → cancelar. ligar() / desligar().
- caminhar({ distancia=6, duracao=5, curva? }) → Promise (em fila; no reduzido vira dissolvência).
- ponteiro { x, y, ativo } em −1..1.
- telaParaMundo(xNdc, yNdc, distancia=1) → Vector3 (distancia = profundidade no eixo da câmera).
- mundoParaTela(v3) → { x, y, visivel } em px.
- retanguloParaPose(rect, obj, { distancia=0.6 }) → { pai: camera, posicao: Vector3, quaternion, escala: Vector3, distancia } no espaço da câmera: pose.pai.attach(obj) e animar até os valores.
- petalas.rajada(posMundo, n=12); petalas.definirDensidade(k 0..1); petalas.objeto. Extras: petalas.definirFoco(metros) (plano de foco, padrão 3 m), petalas.comecar() e petalas.protagonistas() (só a abertura). No leve existem como no-op ou versão CSS; chame com ?. por segurança.
- aoMudarNivel(fn(nivel)) → cancelar; aoRedimensionar(fn(tamanho)) → cancelar.
- cena.fog: névoa de 2,5 a 9,5 m, branca; com a foto de fundo, vai para a cor da alameda (fundo.cor) e o canvas limpa transparente. Pétalas, fio e o uBranco do envelope usam o mesmo objeto de cor. mundo.fundo = { ativo, pronto, cor, caminhada(d), atualizar(), ligar(), desligar() } (DOM #mundo-fundo atrás do canvas; html.com-fundo quando a foto entrou). Luzes: uma HemisphereLight e uma DirectionalLight.
- Modo leve (ok=false): THREE/renderer/camera null; rig e cena são objetoLeve(); telaParaMundo devolve vetorLeve com .px/.py; rajada aceita { px, py }; retanguloParaPose → null.

ENVELOPE: criarEnvelope(mundo, { lacre:'coracao'|'estrela'|null, amarracao:'cordao'|'fio', chegada? }) → env
- env.grupo (Object3D), env.papel (Mesh; no leve, div com .visible), env.atualizar(dt, t), env.acertou(xNdc, yNdc) → boolean, env.ancoraFio (getter → Vector3), env.abrir() → Promise<{ papel }>, env.entregarPapel(rect) → Promise, env.irEmbora() → Promise, env.dispose(). Extras: env.chegar({ duracao, distancia, atraso }) → Promise (nasce da névoa e pousa), env.aoMarco = fn(nome) ('lacre' | 'papel'), env.pressionar(bool), env.caixaTela(), env.lacre, env.amarracao, env.aberto.
- cenaCarta(ctx, { lacre='coracao', amarracao='cordao', distancia=7, entregar=true, anunciarCaminhada=true }) → Promise<{ env, papel, parar }>. Etapas: caminhada → carta-chegando → carta-espera → carta-abrindo → papel. Deixa o envelope em ctx.estado.envelope.

PERGAMINHO (ctx.pergaminho; export criarPergaminho({ raiz, mundo, amb, som, conteudo, recursos }))
- retanguloAlvo() → DOMRect; receberPapel() → Promise; folha (Element); desenrolar(capitulo) → Promise; esperarFechar() → Promise; enrolar() → Promise; soltar() → Promise; estado: 'oculto'|'folha'|'aberto'; el.
- rolagem = { el, y, progresso (0..1), aoRolar(fn(progresso, y)) → cancelar, irPara(y, { imediato=false }) }.
- Capítulo: export const capitulo = { id, montar(raiz, api) → { destruir() } } (montar pode ser async). api = { conteudo, amb, som, rolagem, fundo, gsap, ScrollTrigger, recursos, fechar() }. api.ScrollTrigger chega undefined por padrão; o pergaminho só aplica ScrollTrigger.defaults({ scroller: rolagem.el }) se o plugin já estiver em window quando ele é criado. Capítulo que carregar o plugin no próprio montar registra (gsap.registerPlugin) e passa scroller: api.rolagem.el à mão.
- Extras: #pergaminho[data-estado="folha|abrindo|aberto|fechando|saindo"] (sem atributo = oculto), para o CSS.

SOM (ctx.som; export criarSom(conteudo, amb))
- destravar() → Promise; tocar(indice) → Promise<boolean>; pausar(); retomar(); volume(v?) → number; estado { destravado, tocando, indice, volume, falhou }; aoMudar(fn(estado)) → cancelar; efeito('lacre'|'papel'|'desenrolar'|'toque'|'caneta'|'fita'|'mola'|'brilho'); abafar(fator=0.4, ms=600); faixas; diagnostico(); progresso() → 0..1 da faixa; aoTempo(fn(progresso, segundos, duracao)) → cancelar.
MUSICA (ctx.musica; export criarMusica({ conteudo, som, amb, recursos, mini }))
- escolher(folhaEl) → Promise (sem faixa com arquivo, resolve na hora); mostrarMini(); esconderMini(). Para o CSS: #mini[data-pele="papel|poppy|yourname"], #mini[data-quieto] (recolhido na margem durante a rolagem), #mini[data-longe] (mão e final).

FIO: criarFio(mundo, { curva: Vector3[] | {x,y,z}[] | THREE.Curve, largura=0.012 }) → { objeto, progresso(p?) → number, definirCurva(c), atualizar(dt, t), dispose() }.
FOLHA: criarFolha(mundo) → { grupo, desdobrar() → Promise, escrever(texto) → Promise, atualizar(dt, t), dispose() }. Extras (final.js chama com checagem): assumir(papel) (aparece dobrada onde está o papel da carta), repousarFio() → Promise (o fio solto repousa no canto da folha), viver() (pétalas pousam de tempos em tempos).
CENAS: cenaSegredos(ctx, { frio }) → Promise (js/cenas/segredos.js; enrolando → frase → escolhendo ⇄ assistindo; termina com o mundo aberto, sem carta e sem pergaminho); cenaAbertura(ctx) → Promise (etapa frases); cenaMao(ctx, { frio }) → Promise (enrolando → olha → mao-espera → seguindo; deixa estado.fio, estado.distanciaFinal, estado.envelope e estado.seguidorFio { parar(), soltar(duracao?) }, o seguidor que mantém o fio preso ao pulso e à carta até final:carta-abrindo); cenaFinal(ctx, { frio }) → nunca resolve.

DOM DO ESQUELETO (index.html): canvas#mundo, div#mundo-leve, main#palco com #frases, p#dica[hidden], #acoes; section#pergaminho[hidden]; aside#mini[hidden].
GANCHOS DE TESTE: [data-acao="faixa"], "continuar", "mini", "mini-alternar", "fechar-capitulo", "seguir-fio", "abrir-carta", "segredo" (com data-estado fechado|aberto|falhou), "fechar-segredo", "continuar-segredos"; em carta-espera um toque no centro da tela abre a carta.
GLOBAIS: gsap, CustomEase, DrawSVGPlugin, Lenis, CONTEUDO. ScrollTrigger e SplitText ficam em lib/ mas o index.html não os carrega (nenhum capítulo usa, e o ScrollTrigger mantinha um rAF rodando a carta inteira): quem precisar carrega no próprio montar (ex.: injetar <script src="lib/ScrollTrigger.min.js"> e esperar o load) e registra. O núcleo (movimento.js, main.js) e o pergaminho funcionam sem eles; nunca use window.ScrollTrigger/SplitText sem checar.

CONTENT.JS (window.CONTEUDO)
- pagina { titulo, fundo } (fundo: a foto atrás do mundo das cartas, js/mundo/fundo.js; '' volta ao mundo branco)
- abertura { frases: string[], dicaCarta }
- musica { titulo, continuar, volumeInicial, rotulos { abrir, pausar, tocar, volume, trocar, continuar }, faixas: [{ titulo, artista, arquivo, capa }] } (rotulos.continuar é o aria-label quando musica.continuar fica vazio)
- poppy { titulo, subtitulo, fundo, fechar, blocos: [{ tipo:'texto', texto } | { tipo:'imagem', arquivo, alt, legenda } | { tipo:'cena', cena:'maos'|'fita'|'esteira', etiqueta?, data?, itens? }] }
- yourname { titulo, subtitulo, capa, fundo, video, fechar, blocos: [{ tipo:'texto', texto } | { tipo:'cordao' } | { tipo:'imagem-cheia', arquivo, alt } | { tipo:'imagem', arquivo, alt, legenda } | { tipo:'par', dele, dela, legendaDele, legendaDela }] }
- segredos { frase, continuar, fechar (aria-label do botão de fechar o vídeo), itens: [{ titulo, video, capa, nome }] } (item com video '' some; nenhum vídeo = a cena não existe)
- mao { frase, imagem, ancoraFio { x, y }, botao, rotuloBotao } (rotuloBotao é o aria-label quando botao fica vazio)
- final { frase }
Campo de imagem/música vazio ('') não faz pedido e a peça some.
```

## Como testar

Na raiz do repositório (ou do seu worktree) (Playwright é achado sozinho nesta sessão; fora dela, defina CARTA_PW com o caminho de node_modules/playwright). Tudo abaixo termina com código 0 e zero erro de console.

Cenas e fluxo (capturas em output/ver/):
- node _dev/ver.mjs --vp celular,desktop --rapido 6 --fotos (as seis cenas no Chromium)
- node _dev/ver.mjs --vp celular --motor webkit --rapido 6 --fotos
- node _dev/ver.mjs --fluxo --vp celular,desktop --rapido 6 --fotos --quadros (inicio:frases até final:fim)
- node _dev/ver.mjs --fluxo --vp celular --motor webkit --rapido 6 --fotos
- node _dev/ver.mjs --fluxo --vp celular,desktop --rapido 6 --fotos --params "webgl=0"
- node _dev/ver.mjs --fluxo --vp celular --rapido 6 --fotos --params "reduzido=1"
- node _dev/ver.mjs --fluxo --vp celular --rapido 6 --fotos --params "nivel=baixo"
- node _dev/ver.mjs --fluxo --vp celular (velocidade real)
- Uma cena só: `node _dev/ver.mjs --cena poppy --vp celular,desktop --motor chromium,webkit --rapido 6 --fotos [--ate etapa] [--video]`

Robustez do núcleo (capturas em output/robustez/):
- node _dev/robustez.mjs (todos os casos, uns 6 minutos, 88 verificações)
- node _dev/robustez.mjs spam resize (rodar depois de mexer em qualquer cena); demais casos: aba contexto params faltando teclado audio quebra vazio qualidade

Segredos (vídeos de teste em output/segredos-teste, injetados por page.route; o content.js não muda):
- node _dev/ver.mjs --fluxo --vp iphone,desktop --rapido 6 --segredos output/segredos-teste [--segredos-falho] [--fotos]
- node _dev/ver.mjs --cena segredos --vp iphone --motor webkit --segredos output/segredos-teste --fotos
- lib.mjs: lerConteudo(itens?), temSegredos(c), segredosDeTeste(pasta, { falho }), injetarSegredos(page, itens), ERRO_ESPERADO; sessao.perfil.

Testes próprios: import { abrir } from './_dev/lib.mjs' → sessão com esperarEtapa('cena:etapa'), foto(nome), tocar(x,y)/tocarCentro(), acionar(seletor), medirQuadros(ms), estado(), erros, page, fechar(); abrir aceita { cena, vp, motor, params, video, preparar(page) }.

Arquivos centrais: _dev/DIRECAO.md (contrato; seção 6 atualizada), _dev/ver.mjs, _dev/robustez.mjs, _dev/lib.mjs, js/main.js, js/nucleo/*.js, js/mundo/mundo.js.
