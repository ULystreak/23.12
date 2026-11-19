# API real do esqueleto

> **Roteiro 2:** este resumo já está na ordem nova (senha → música → inicio → poppy → carta2 → yourname → mao → cartas → encontro → final). O contrato peça por peça continua em `_dev/ROTEIRO2.md`.

Resumo do que existe de fato no código, escrito por quem verificou o esqueleto. Complementa as seções 4 e 6 de `_dev/DIRECAO.md`; se houver divergência, vale o código.

```
TEMPO E UTIL (js/nucleo/util.js)
- espera(ms) → Promise. Milissegundos, dividido por ?rapido, só conta com a aba visível.
- quadro() → Promise(próximo rAF). clamp(v, min=0, max=1), lerp(a,b,t), suave(t), amortecer(atual, alvo, lambda, dt), semente(s) → () => 0..1, debounce(fn, ms=150) (+ .cancelar()).
- el(tag, attrs|classe, filhos) → Element. attrs aceita class, dataset{}, style{}, texto, onEvento; texto nunca vira HTML. svg(marcacao) → SVGElement.
- carregarImagem(url) → Promise<HTMLImageElement|null> ('' não faz pedido). pxParaNdc(x, y, largura?, altura?) → { x, y }. vetorLeve(x,y,z), objetoLeve(). configurarTempo(rapido) é só do main.js.

MOVIMENTO (js/nucleo/movimento.js)
- curvas = { branco: { entrar, sair, camera, deriva }, poppy: { mola, quique, pulo, cair, corte }, yourname: { tempo, florescer, sumir }, ui: { resposta } }: nomes de ease da GSAP (ex.: ease: curvas.branco.entrar). Espelho em CSS: --curva-*.
- revelarPalavras(el, texto?, { duracao=1.4, intervalo=0.14, atraso=0, subida='0.4em', curva }) → Promise.
- ocultarPalavras(el, { duracao=0.9, intervalo=0.06, atraso=0, subida='-0.35em', curva }) → Promise (esvazia o elemento).
- Tempos da GSAP em segundos; ?rapido é o timeScale global. Com amb.reduzido entra só com opacidade.

AMBIENTE: amb = { webgl, nivel:'alto'|'medio'|'baixo', reduzido, toque, ios, dprMax (2|1.5|1), rapido, android, mudo, forcado, params:URLSearchParams }. <html> recebe classes toque, ios, reduzido, sem-webgl e data-nivel.

CONTEXTO: ctx = { conteudo, amb, mundo, som, musica, pergaminho, inventario, bolso, voz, diretor, gsap, recursos, estado }. estado é livre (estado.envelope, estado.fio, estado.distanciaFinal, estado.folha, estado.seguidorFio, estado.cartaEscondida, estado.encontroQuadros).
- recursos.imagem(url) → Promise<HTMLImageElement|null>; recursos.elementoImagem(url, alt='') → Promise<img novo|null>; recursos.precarregar(lista) → Promise; recursos.iniciar().

DIRETOR (js/nucleo/diretor.js)
- diretor.etapa(nome) publica em <html data-etapa>; diretor.etapa() devolve a atual. diretor.cena, .etapaAtual, .historico [{cena, etapa, t}], .ordem, .aoMudar(fn(cena, etapa)) → cancelar, .cenaInicial() → string, .aquecer(), .rodar(ctx, cenaInicial).
- ORDEM = senha, musica, inicio, poppy, carta2, yourname, mao, cartas, encontro, final. Etapas: senha (senha → senha-certa); musica (musica → entrando); inicio e carta2 (caminhada → carta-chegando → carta-espera → carta-abrindo → papel; inicio começa em frases); poppy e yourname (desenrolando → lendo → enrolando → guardando); mao (olha → mao-espera → correndo); cartas (pousando → escolhendo ⇄ assistindo → seguindo); encontro (chegando → planos → maos → carta); final (carta-chegando → carta-espera → carta-abrindo → desdobrando → escrevendo → contador → resposta → fim; contador só com contador.nascimento, resposta só com a seção resposta).
- O capítulo (cenaCapitulo no diretor): desenrolar → esperarFechar → enrolar → soltar → bolso.guardar({ tema, envelope }) → inventario.guardar(item) + mostrarBotao(). Reler pela bolsa (reler no diretor): html.relendo (o #palco some), receberPapel → desenrolar(capitulo, { releitura: true }) → esperarFechar → enrolar → soltar, sem mudar cena nem etapa. A bolsa só abre em carta2:caminhada, carta2:carta-chegando, carta2:carta-espera, mao:mao-espera, cartas:escolhendo e final:fim (BOLSA_LIVRE no diretor); em final:desdobrando o botão sai e em final:fim volta. Depois de voz.liberar() ela abre em qualquer etapa da cena final (inventario.manterLivre).
- export voltarAoMundo(ctx) → Promise (enrola, solta a folha, manda embora e descarta estado.envelope). export ORDEM. export temSenha(conteudo) → boolean (senha.codigo com qualquer texto não vazio; vazio = a carta começa pela música). export cartasDoChao(conteudo) → [{ id: 'chao-N' | 'chao-surpresinha', nome, tipo: 'video' | 'galeria', video, capa, midias }] e temCartas(conteudo) → boolean (sem carta com nome o diretor pula a cena "cartas"). export temEncontro(conteudo) → boolean (algum quadro com imagem em encontro.quadros; sem isso o diretor pula a cena "encontro").
- Cena = async (ctx, { frio }). Cena que lança exceção: o diretor limpa tudo e a próxima entra com frio: true.
- window.__carta = { ctx, cena, etapa, historico, pronto: Promise<ctx>, gpu, erro }.
- Nomes que o diretor importa: cenaSenha e sairDaEntrada (js/cenas/senha.js), cenaAbertura (js/cenas/abertura.js; exporta também aquecerAbertura), cenaCarta (js/cenas/carta.js), cenaMao (js/cenas/mao.js), cenaCartas (js/cenas/cartas.js), cenaEncontro e prepararEncontro (js/cenas/encontro.js), cenaFinal (js/cenas/final.js), capitulo (js/capitulos/poppy.js e yourname.js).
- Parâmetros: ?cena=senha|musica|inicio|poppy|carta2|yourname|mao|cartas|encontro|final (segredos = cartas; inválido ou ausente → senha; de inicio em diante pula a tela preta e a bolsa já vem com as cartas dos capítulos anteriores. Retomada: quando começam inicio, poppy, carta2, yourname, mao, cartas e final, o diretor reescreve a URL com history.replaceState para ?cena=<cena>&musica=<faixa>, mantendo os outros parâmetros; recarregar, ou voltar do WhatsApp com a aba descartada pelo iOS, cai no começo dessa cena com a mesma música), ?rapido=N (0.1 a 60), ?nivel=alto|medio|baixo, ?webgl=0, ?reduzido=1 (ou 0), ?mudo=1, ?musica=N (interno), ?hoje=AAAA-MM-DD (finge a data para o contador), ?voz=1|abrir|0 (fita na bolsa já | cartão aberto | esquecer), ?frase=… (troca a frase final).

MUNDO (ctx.mundo; export async criarMundo({ amb, canvas, recipienteLeve }))
- ok:boolean; THREE, renderer, cena, camera (PerspectiveCamera, 1,5 m, FOV 58° em pé a 42° deitado), rig (Group; a caminhada move rig.position.z); canvas; amb; gpu; tamanho { largura, altura, dpr }; ligado (getter); recipienteLeve.
- aoQuadro(fn(dt, t)) → cancelar. ligar() / desligar().
- deriva (getter): metros de chão que já passaram por baixo dela. O PASSO DE BASE: a alameda anda sempre (~0,42 m/s; 0,09 no reduzido), o rig e tudo o que está em mundo.cena andam junto com ela (as cenas não compensam nada); caminhar() acelera por cima e, enquanto é mais rápida, toma o lugar do passo de base (total = √(base² + caminhada²)).
- caminhar({ distancia=6, duracao=5, curva? }) → Promise (em fila; no reduzido vira dissolvência).
- ponteiro { x, y, ativo } em −1..1.
- telaParaMundo(xNdc, yNdc, distancia=1) → Vector3 (distancia = profundidade no eixo da câmera).
- mundoParaTela(v3) → { x, y, visivel } em px.
- retanguloParaPose(rect, obj, { distancia=0.6 }) → { pai: camera, posicao: Vector3, quaternion, escala: Vector3, distancia } no espaço da câmera: pose.pai.attach(obj) e animar até os valores.
- petalas.rajada(posMundo, n=12); petalas.definirDensidade(k 0..1); petalas.objeto. Extras: petalas.definirFoco(metros) (plano de foco, padrão 3 m), petalas.comecar() e petalas.protagonistas() (só a abertura). No leve existem como no-op ou versão CSS; chame com ?. por segurança.
- hora(alvo?, { duracao=4 }) → Promise | nome: a hora do dia (js/mundo/hora.js). Linha 0 manha → 1 dia → 2 entardecer → 3 crepusculo → 4 noite; alvo é o nome ou a posição; sem argumento devolve o nome atual. Quem chama é ligarHora({ mundo, diretor, amb }) no main.js, pelo mapa ROTEIRO de hora.js; as cenas não chamam. Para o CSS: html[data-hora] (muda só quando a hora troca). Existe também no modo leve (camadas sobre a foto).
- Pétalas sob o dedo: ligarToque(ctx) (js/mundo/toque.js; uma linha no main.js). Ao soltar o dedo (ou o botão do mouse) no mundo, 5 pétalas saem voando do ponto do chão tocado (petalas.rajada; 2 no reduzido; acima do horizonte nada; sem WebGL, a rajada leve em { px, py }, só na metade de baixo da tela). Só em inicio:frases, inicio/carta2:caminhada e :carta-chegando e cartas:pousando; nunca sobre botão ou link, com a bolsa, um visor, o mini ou o pergaminho abertos, nem com html.relendo.
- aoMudarNivel(fn(nivel)) → cancelar; aoRedimensionar(fn(tamanho)) → cancelar.
- cena.fog: névoa das cartas, de 2,5 a 9,5 m (as coisas nascem dela); com a alameda, vai do branco para a cor da névoa da alameda (#ece0e6) quando ela entra, e o envelope/pétalas que estão dentro dela ficam transparentes em vez de virar mancha. Luzes: uma HemisphereLight e uma DirectionalLight.
- mundo.alameda (js/mundo/alameda.js; null sem pagina.fundo ou sem WebGL): a alameda de cerejeiras em 3D, gerada no código (árvores por recursão, copas de cartões de flor com alpha-to-coverage, chão procedural num shader só, lago, postes e correntes, céu e névoa próprios, ~15 draw calls). Corredor infinito em −Z por vagas recicladas perto da câmera. API: pronta (Promise), surgir(s), atualizar(dt,t) (o mundo chama antes do render), aplicarHora(estado) (a hora do dia: luz, névoa, céu, estrelas e cometa; quem chama é mundo.hora), nivel(n), afastar(metros, duracao=1.2) (nenhum cacho mais perto da câmera que isso; a folha final chama com a sua distância + 0,25; 0 volta ao padrão), uniformes (os uniformes comuns da névoa e da hora, para quem entra na alameda: uNevoa, uCeu, uDens, uTarde, uLuz, uNoite), centro(z) (z do mundo, a deriva já descontada; x do meio do caminho; |centro| ≤ 0,65 m, caminho de 3,5 m, chão em y = 0). O céu é o último opaco (renderOrder 3): só pinta o que sobra.
- mundo.fundo: com WebGL e alameda, só os véus atrás do texto (#mundo-veus, por cima do canvas; html.com-fundo); sem WebGL, { ativo, pronto, cor, caminhada(d), atualizar(), ligar(), desligar() } com a imagem da alameda (#mundo-fundo atrás do mundo leve).
- Modo leve (ok=false): THREE/renderer/camera null; rig e cena são objetoLeve(); telaParaMundo devolve vetorLeve com .px/.py; rajada aceita { px, py }; retanguloParaPose → null.

ENVELOPE: criarEnvelope(mundo, { lacre:'coracao'|'estrela'|null, amarracao:'cordao'|'fio', chegada?, tema:'poppy'|'yourname'|null }) → env (tema null = a carta branca; env.tema; aquecerEnvelope(mundo, { lacre, amarracao, tema }); imagemDoTema(tema, largura) → canvas com a face da carta, usado pelo bolso e pela bolsa)
- env.grupo (Object3D), env.papel (Mesh; no leve, div com .visible), env.atualizar(dt, t), env.acertou(xNdc, yNdc) → boolean, env.ancoraFio (getter → Vector3), env.abrir() → Promise<{ papel }>, env.entregarPapel(rect) → Promise, env.irEmbora() → Promise, env.dispose(). Extras: env.chegar({ duracao, distancia, atraso }) → Promise (nasce da névoa e pousa), env.aoMarco = fn(nome) ('lacre' | 'papel'), env.pressionar(bool), env.caixaTela(), env.lacre, env.amarracao, env.aberto.
- cenaCarta(ctx, { tema, lacre='coracao', amarracao='cordao', distancia=7, entregar=true, anunciarCaminhada=true, baixar=0.12 }) → Promise<{ env, papel, parar }> (baixar: quanto a carta parada fica abaixo da linha dos olhos, em meias-alturas da tela; a última carta usa um valor maior para parar na mão dele com o rosto livre). Export poseParada(mundo, baixar?, zOlhos?) → { x, y, z } da carta parada (final.js usa a mesma conta). Etapas: caminhada → carta-chegando → carta-espera → carta-abrindo → papel. Deixa o envelope em ctx.estado.envelope.

PERGAMINHO (ctx.pergaminho; export criarPergaminho({ raiz, mundo, amb, som, conteudo, recursos }))
- retanguloAlvo() → DOMRect; receberPapel() → Promise; folha (Element); desenrolar(capitulo, { releitura=false }) → Promise (marca #pergaminho[data-capitulo] e, na releitura, [data-releitura]); esperarFechar() → Promise; enrolar() → Promise; soltar() → Promise; estado: 'oculto'|'folha'|'aberto'; el.
- rolagem = { el, y, progresso (0..1), aoRolar(fn(progresso, y)) → cancelar, irPara(y, { imediato=false }) }.
- Capítulo: export const capitulo = { id, montar(raiz, api) → { destruir() } } (montar pode ser async). api = { conteudo, amb, som, rolagem, fundo, gsap, recursos, fechar() }.
- Extras: #pergaminho[data-estado="folha|abrindo|aberto|fechando|saindo"] (sem atributo = oculto), para o CSS.

SOM (ctx.som; export criarSom(conteudo, amb))
- destravar() → Promise; tocar(indice) → Promise<boolean>; pausar(); retomar(); volume(v?) → number; estado { destravado, tocando, indice, volume, falhou }; aoMudar(fn(estado)) → cancelar; efeito('lacre'|'papel'|'desenrolar'|'toque'|'caneta'|'fita'|'mola'|'brilho'|'caixinha'; a caixinha recebe { nota } em Hz); abafar(fator=0.4, ms=600); faixas; diagnostico(); progresso() → 0..1 da faixa; aoTempo(fn(progresso, segundos, duracao)) → cancelar.
VOZ (ctx.voz; export criarVoz(ctx), js/voz.js)
- liberar() (a fita entra na bolsa, fica anotado em localStorage 'carta2312:voz'; final:fim chama sozinho); abrir() → Promise (o cartão #voz com os áudios; resolve ao fechar); fechar(); aberto; liberada. Um áudio por vez; a música abaixa (som.abafar) e volta; cada linha tem um link de baixar (atributo download).
MUSICA (ctx.musica; export criarMusica({ conteudo, som, amb, recursos, mini }))
- escolher(recipiente) → Promise (o diretor passa #entrada-musica, na tela preta; carrossel de capas; sem faixa com arquivo, resolve na hora); mostrarMini(); esconderMini(). Para o CSS: #mini[data-pele="papel|poppy|yourname"] (segue data-cena e, na releitura pela bolsa, #pergaminho[data-capitulo][data-releitura]), #mini[data-quieto] (recolhido na margem durante a rolagem), #mini[data-longe] (mão e final). O mini sai em final:desdobrando e volta em final:fim.

INVENTARIO (ctx.inventario; export criarInventario({ conteudo, amb, som, recursos, raiz: #inventario }))
- guardar({ id, tipo:'carta'|'video'|'galeria'|'voz', titulo, tema?, fixo?, abrir }) → boolean (true se novo; fixo: true mora numa faixa no alto da bolsa); manterLivre(sim) (abre em qualquer etapa); reabrir(id) → Promise; tem(id); itens (cópia); mostrarBotao() / esconderBotao(); liberar(sim) (só o diretor); abrirFolha() → boolean / fecharFolha(); aberto (folha aberta OU item reaberto na frente; as cenas ignoram toques no mundo enquanto isso); aoMudar(fn(itens)) → cancelar. Para o CSS: #inventario[data-aberto], [data-quieto] (não pode abrir agora), [data-relendo] (item reaberto: o botão sai da frente).
BOLSO (ctx.bolso; export criarBolso({ conteudo, amb, som, mundo, raiz: #bolso }))
- guardar({ tema, envelope }) → Promise (~3 s; primeira pessoa: o olhar desce, a bolsinha de ombro aparece, a carta entra nela e a bolsa vai para o botão do canto; DOM/SVG; descarta o envelope; nunca rejeita; no reduzido, dissolvência curta); ocupado.

FIO: criarFio(mundo, { curva: Vector3[] | {x,y,z}[] | THREE.Curve, largura=0.012 }) → { objeto, progresso(p?) → number, definirCurva(c), atualizar(dt, t), dispose() }.
ELE: criarEle(mundo) → { grupo (pés na origem), ancora(saida?) → Vector3 (a mão que segura o fio, no mundo), mostrar(duracao=3), sair(duracao=0.8) → Promise (some e se descarta), prepararEntrega() (pinta a pose de frente, de mão estendida), entregar() → boolean (troca a figura por essa pose), ancoraCarta(olhos, saida?) → Vector3 (onde a carta pousa na mão), dispose() } | null sem WebGL (js/mundo/ele.js; exporta também pintarEleEntrega() → canvas, para o modo sem WebGL). Figura pintada num canvas, plano em pé com sombra de contato; o material usa mundo.alameda.uniformes (uNevoa, uCeu, uDens, uTarde, por referência).
FOLHA: criarFolha(mundo) → { grupo, desdobrar() → Promise, escrever(texto) → Promise, recuar() (no fim, em tela baixa, a folha recua um pouco para o contador e o botão respirarem), atualizar(dt, t), dispose() }. Extras (final.js chama com checagem): assumir(papel) (aparece dobrada onde está o papel da carta), repousarFio() → Promise (o fio solto repousa no canto da folha), viver() (pétalas pousam de tempos em tempos).
CENAS: cenaSenha(ctx, { frio }) → Promise (senha → senha-certa; resolve com o campo já fora e o preto ainda lá) e sairDaEntrada(ctx) → Promise (o preto se desfaz, #entrada sai do DOM, theme-color vira branco); cenaCartas(ctx, { frio }) → Promise (js/cenas/cartas.js; pousando → escolhendo ⇄ assistindo → seguindo; a cada carta de amigo fechada o fio acende mais e manda um pulso de luz até ele; em seguindo o brilho do fio volta ao de antes; não mexe nele nem na carta escondida); cenaAbertura(ctx, { frio }) → Promise (etapa frases); cenaMao(ctx, { frio }) → Promise (olha → mao-espera → correndo; a corrida dura conteudo.corrida.segundos e ela para a 5,25 m dele; deixa estado.fio, estado.distanciaFinal, estado.envelope e estado.seguidorFio { parar(), soltar(duracao?), ancorar(Vector3|null) }, o seguidor que mantém o fio preso ao pulso e à carta até final:carta-abrindo; com o encontro por vir e WebGL deixa também estado.ele (criarEle), com a ponta do fio presa à mão dele por ancorar(); mostrarCarta() do encontro o tira e devolve a ponta à carta); cenaEncontro(ctx, { frio }) → Promise (js/cenas/encontro.js; chegando → planos → maos → carta; resolve com a última carta à vista e fechada) e prepararEncontro(ctx) → Promise<quadros[]> (baixa os quadros; o diretor chama no começo da mão); cenaFinal(ctx, { frio }) → nunca resolve (carta-chegando: a carta sai da mão dele; depois do escrevendo vêm contador, resposta e fim) e entregaNaMao(ctx) → boolean (final.js; ele a 2,25 m, de frente, com a última carta na mão; o encontro chama debaixo do clarão); criarDepois(ctx) → { temContador, temResposta, dias, contar(), escrever(), repousar() } e diasDeVida(nascimento, hoje?) (js/cenas/resposta.js).

DOM DO ESQUELETO (index.html): canvas#mundo, div#mundo-leve, main#palco com #frases, p#dica[hidden], #acoes; section#pergaminho[hidden]; aside#mini[hidden]; aside#inventario[hidden]; div#bolso[hidden]; section#entrada > #entrada-senha + #entrada-musica (preto, z-index 60, no CSS crítico; html.sem-entrada nos atalhos).
GANCHOS DE TESTE: input[data-acao="senha"], [data-acao="faixa"], "continuar", "mini", "mini-alternar", "fechar-capitulo" (o botão "Guardar no bolso"), "seguir-fio", "abrir-carta", "inventario", "inventario-item" (com data-id), "inventario-fechar", "carta-chao" (com data-id e data-estado fechada|aberta|falhou), "fechar-carta", "seguir-cartas" (data-destaque com todas abertas), "resposta-texto" (textarea), "resposta-enviar" (<a> para wa.me), "resposta-compartilhar", "resposta-guardar", "resposta-abrir", "voz-tocar", "voz-baixar", "voz-fechar"; .contador[data-dias]; #voz[data-aberto]; .voz-item[data-estado="pronto|vazio|falhou"]; .carta-chao-visor[data-tipo="video|galeria|vazio"]; em carta-espera um toque no centro da tela abre a carta.
GLOBAIS: gsap, CustomEase, DrawSVGPlugin, Lenis, CONTEUDO.

CONTENT.JS (window.CONTEUDO)
- pagina { titulo, fundo } (fundo: a imagem da alameda, usada só sem WebGL; com WebGL a alameda é 3D. '' volta ao mundo branco nos dois modos. Refazer a imagem: node _dev/alameda-imagem.mjs)
- senha { codigo, frase, dica, rotulo } (codigo: qualquer texto, sem diferença de maiúsculas; vazio = sem senha; frase e dica podem ficar vazias)
- abertura { frases: string[], dicaCarta }
- musica { titulo, continuar, volumeInicial, rotulos { abrir, pausar, tocar, volume, trocar, continuar, anterior, proxima }, faixas: [{ titulo, artista, arquivo, capa }] } (rotulos.continuar é o aria-label quando musica.continuar fica vazio)
- poppy { titulo, subtitulo, fundo, fechar, blocos: [{ tipo:'texto', texto } | { tipo:'imagem', arquivo, alt, legenda } | { tipo:'cena', cena:'maos'|'fita'|'esteira', etiqueta?, data?, itens? }] }
- yourname { titulo, subtitulo, capa, fundo, video, fechar, blocos: [{ tipo:'texto', texto } | { tipo:'cordao' } | { tipo:'imagem-cheia', arquivo, alt } | { tipo:'imagem', arquivo, alt, legenda } | { tipo:'par', dele, dela, legendaDele, legendaDela }] }
- inventario { titulo, cartaPoppy, cartaYourname, rotulos { abrir, fechar, guardando } }
- corrida { segundos } (7; aceita 5 a 10)
- cartasChao { frase, seguir, vazio ('{nome}' vira o nome), vazioSurpresinha, rotulos { carta, fechar, anterior, proxima }, itens: [{ nome, video, capa }], surpresinha { nome, midias: [{ foto | video, legenda }] } } (carta sem vídeo aparece e abre o cartão de exemplo; nenhuma carta com nome = a cena não existe). poppy.fechar, yourname.fechar e yourname.rotuloFechar valem 'Guardar no bolso'.
- mao { frase, escrito, imagem, ancoraFio { x, y }, botao, rotuloBotao, ele } (escrito: o que é escrito à caneta na palma, só na mão desenhada, '' = nada; rotuloBotao é o aria-label quando botao fica vazio; ele: false tira a figura dele do fim do fio)
- encontro { quadros: [{ imagem, alt, foco {x,y}?, ate {x,y}?, fio {x,y}?, dedo {x,y}?, aparar { topo, base, esquerda, direita }?, fim? }] } (lista vazia = a cena não existe; foco → ate é a panorâmica; fio é onde o fio do quadro chega à base, para a emenda; os dois quadros com dedo são as mãos; fim: true é o plano final, que entra depois das mãos e de onde o clarão nasce)
- voz { titulo, frase, itens: [{ titulo, arquivo }], vazio ('{n}' vira o número), rotulos { tocar, pausar, baixar, fechar, progresso, falhou } } (áudios em assets/audio/, .mp3 ou .m4a; arquivo vazio mostra o texto de exemplo)
- final { frase }
- contador { nascimento ('AAAA-MM-DD'; vazio = sem contador), rotulo, frase, conhecemos ('AAAA-MM-DD'; os dias desde então acendem em vermelho na flor dos dias; vazio = só o dia de hoje) }
- resposta { whatsapp (só algarismos, com 55 e DDD; vazio = ela escolhe o contato), convite, dica, antes, guardado, vazio, enviando, rotulos { enviar, outro, guardar, reabrir, folha, campo } } (sem a seção, a folha de resposta não existe)
Campo de imagem/música vazio ('') não faz pedido e a peça some.
```

## Como testar

Na raiz do repositório (ou do seu worktree) (Playwright é achado sozinho nesta sessão; fora dela, defina CARTA_PW com o caminho de node_modules/playwright). Tudo abaixo termina com código 0 e zero erro de console.

Cenas e fluxo (capturas em output/ver/):
- node _dev/ver.mjs --vp iphone,desktop --rapido 6 --fotos (as dez cenas no Chromium, cada uma por ?cena=)
- node _dev/ver.mjs --vp celular --motor webkit --rapido 6 --fotos
- node _dev/ver.mjs --fluxo --vp iphone,desktop --rapido 6 --fotos (senha:senha até final:fim: digita a senha, escolhe a música, relê as cartas pela bolsa, abre e fecha as cartas do chão)
- node _dev/ver.mjs --fluxo --vp celular --motor webkit --rapido 6 --fotos
- node _dev/ver.mjs --fluxo --vp celular,desktop --rapido 6 --fotos --params "webgl=0"
- node _dev/ver.mjs --fluxo --vp celular --rapido 6 --fotos --params "reduzido=1"
- node _dev/ver.mjs --fluxo --vp celular --rapido 6 --fotos --params "nivel=baixo"
- node _dev/ver.mjs --fluxo --vp celular (velocidade real)
- Uma cena só: `node _dev/ver.mjs --cena poppy --vp celular,desktop --motor chromium,webkit --rapido 6 --fotos [--ate etapa] [--video]`

Robustez do núcleo (capturas em output/robustez/):
- node _dev/robustez.mjs (todos os casos, uns 10 minutos)
- node _dev/robustez.mjs spam resize (rodar depois de mexer em qualquer cena); demais casos: aba contexto params faltando teclado audio quebra vazio qualidade

Cartas do chão (vídeos de teste em output/segredos-teste, injetados por page.route; o content.js não muda):
- node _dev/ver.mjs --fluxo --vp iphone,desktop --rapido 6 --videos output/segredos-teste [--videos-falho] [--fotos]
- node _dev/ver.mjs --cena cartas --vp iphone --motor webkit --videos output/segredos-teste --fotos
- lib.mjs: lerConteudo(videos?), senhaDoConteudo(c), temCartas(c), contarCartas(c), temEncontro(c), temContador(c), temResposta(c), etapasDoFinal(c), videosDeTeste(pasta, { falho }), injetarVideos(page, videos, midias?) (midias = a lista da Surpresinha), ERRO_ESPERADO; sessao.perfil.

Testes próprios: import { abrir } from './_dev/lib.mjs' → sessão com esperarEtapa('cena:etapa'), foto(nome), tocar(x,y)/tocarCentro(), acionar(seletor), digitarSenha(), passarEntrada(), abrirDaBolsa(id) / fecharDaBolsa(), medirQuadros(ms), estado(), erros, page, fechar(); abrir aceita { cena, vp, motor, params, video, preparar(page), entrar } (sem cena = a tela preta; entrar: true já passa pela senha e pela música).

Arquivos centrais: _dev/DIRECAO.md (contrato; seção 6 atualizada), _dev/ver.mjs, _dev/robustez.mjs, _dev/lib.mjs, js/main.js, js/nucleo/*.js, js/mundo/mundo.js.
