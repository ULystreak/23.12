# O que a v2 faz diferente da v1, de propósito

## O que ela percebe

1. Volume inicial zero agora é de verdade mudo, e os efeitos de som acompanham o volume dela.
2. Botão de tocar: só o rótulo muda entre "Tocar: título" e "Pausar: título", sem aria-pressed.
3. As setas no fio de progresso pulam 5 segundos em vez de frações imperceptíveis.
4. Nome da faixa vazia de áudio ficou mais claro, mantendo contraste legível.
5. Canvas não pisca branco na entrada noturna, e dissolve na cor da névoa.
6. Respiro da brasa tem duas fases: sobe suave e depois balança.
7. Aba do envelope gira em 3D com perspectiva, em vez de girar flat.
8. Fio do caminho não entra na mão nem no rosto dele.
9. Chão do fundo-leve cresce a partir do horizonte, em vez de do meio.
10. Pétalas da carta aberta descem mais opacas ao abrir o visor.
11. Continuar toca novamente se o toque anterior foi recusado.
12. Fio repouso novo com 13 pontos, que não havia antes.

## Por dentro

### som-voz

volumeInicial 0 é mudo (Decisão para a v2). O fio de progresso pula 5 s em vez do passo nativo imperceptível. Sem aria-pressed no botão; só aria-label muda entre "Tocar: X" e "Pausar: X". Região so-leitor com role=status anuncia falha; foco passa para próximo botão. Linha vazia não usa opacity 0,6 no nome (tinta-suave em vez disso, mantém 4,5:1 de contraste). Tempo em Klee One, não Fredoka. Lacinho mantém translateX(-50%) em ambos estados; balanço da fita pausa onde estava, sem pulo; repouso em −3°. No celular deitado, miolo ganha padding-left 128 px.

### musica

Voo: cópia do disco continua girando na mesma fase, sem inércia de partida. Saída: capas vizinhas somem em 0,45 s junto com o resto. Faixa sem capa: some só a encarta (.car-capa), moldura fica com botão e lacinho. Continuar: toca novamente se navegador recusou play (NotAllowedError). Mini: foco sai com focusout; "Música N" quando falta título; aria-label por faixa.

### cartas

Visor baixa densidade de pétalas 0,3 ao abrir, devolve 1 ao fechar (só com cena=cartas). Ao girar tela no reduzido, carta vai direto à pose nova, sem tween. Carta reaproveitada não chama env.chegar(). Terceira coluna de matrix3d é c1×c2 (rotação própria, sem espelho). Visor com role=button e aria-label que alterna. Sombra aparece por opacidade quando assenta. Pontos de galeria com forma de pétala. Pétala de carregando parada (opacidade 0,7) no reduzido.

### bolsa-pergaminho

Alças desbotam em gradiente de y 44 a 76. Inventário: título virou h2; folha com aria-modal e aria-labelledby; Tab preso enquanto aberta; classes (chegou, recebeu, vazia) saem em animationend. Pergaminho: rolo usa R·(1 − afina)/2; revelar limita y a [0, H]; receberPapel e desenrolar esperam soltar em curso; agulha com desenho próprio e corpo em var(--tinta) a 86%.

### mao

Sem zoom no reduzido e sem estrela com foto. lerAncora ignora carta escondida. pararMedida e listener de resize saem no finally. Mergulho quebrado: finally mata timeline, devolve ponta(null), progresso(1), ar.k = 0. Balanço das pontas (vento 1,2) e respiro 0,25 no reduzido conforme spec. Respiração gira e estica a partir das solas, não do centro (pés não escorregam).

### fio

uPontoMax limita gl_PointSize ao ALIASED_POINT_SIZE_RANGE. Halo descarta além da ponta, encolhe para zero quando k < 0,002. Cores em sRGB cru. Points invisível por material.visible. pontoEm no 3D devolve coordenadas do mundo. Pulso 3D segue fração (trilha.u). Leve: contorno preenchido, fill var(--fio), sombra var(--tinta) deslocada (2, 3). Sem vento nem progresso como opções.

### encontro

Respiro da brasa: sobe 0,66 → 0,8 em 0,55 s, depois yoyo 0,8 ↔ 0,58 em 1,1 s. Ponta apaga 0,3 s antes de conta correr. Sombra do fio com translateY 0,6·espessura. Região so-leitor com aria-live='polite' lê alt de cada plano. No iPhone, sem vibração ao soltar. mostrarCarta zera estado.ele após sair. Faixa alta com mask-composite intersect. Cursor grab/grabbing no arrasto. Respeita prefers-reduced-motion no grão.

### mundo

Com nitidezMaxima ligada, medidor espera, não baixa DPR. Canvas dissolve na cor da névoa durante caminhada reduzida, fundo do body fica com essa cor. Entrada noturna: opacidade 0 posta antes do primeiro desenho (sem clarão branco). aplicarTamanho redesenha sempre com mundo vivo, mesmo desligado. DPR parte do efetivo (min de atual). Medidor suspenso enquanto nitidezMaxima ligada. Hora de entrada noturna bem depois de setTimeout(0).

### alameda

Eixo cima do cartão da copa é ex × n, fita fica de pé. uEscala só nas copas de cerejeiras. Opacidade do cometa multiplicada por uSurgir; aparece após compileAsync (guarda 1,5 s). uTarde lido no céu. Pétalas no ar somem quando < 0,25–0,6 m do olho. Janela de vagas (zc − ALCANCE, zc + ATRAS). pow((q.y − 0,04)/0,44, 2) virou multiplicação.

### fundo-leve

b.quadro.after(f.quadro) em vez de insertBefore, foto escondida muda de lugar. Debounce 120 ms com cancelar(). CSS injetado antes de primeira folha. Pétala com ':root .leve-s{i}' para não apagar por background abreviado. .leve-chao com transform-origin 50% 0 (cresce do horizonte). ESTOQUE_SOLTAS = 96 recicla pétala velha. Rajada: scaleX do tombo começa 0,5 s. comecar() guarda vez. ligar() iguala zAnterior. pausar() congela camadas com aba oculta. Semente 2312.

### envelope

Leve: voo por FLIP (transform, não left/top); aba gira com perspective(1100px) rotateX(+a); 6 pétalas em reduzido. acertou devolve false com invisível. Corpo é polígono explícito (V recortada), não evenodd. Nó do laço usa primeira cor do cordão (#d7192d na branca). clip-path corte-b é complemento de corte-a. 3D: tabelas de abrir, entregar, chegar, irEmbora; sementes; uniformes GLSL. Tudo confere.

### folha

Preparar usa composição em fatias 6 ms (prepararAosPoucos). Primeira linha de base em topo + 0,95·fs. Frase dele entra sem corte se não couber. Pétala 3D com depthTest falso (não se enterra). Fio e sombra dentro de `interno` (sem vento em repouso). FIO_REPOUSO novo: 13 pontos, x ≥ 0,83, sem laço. Efeitos (petalas.definirFoco, alameda.afastar) só após aparecer. textoDela tira , ; : . antes de '...'. Espessura mediana de lerTinta.

### final

Fio de 7 pontos termina na ponta do laço real (poseParada + PONTA_DO_LACO). Fio do caminho nasce sem entrega e estado.fio com distância ≥ 1 m. Sem WebGL: criarFioLeve só se não há estado.fio. Ele-leve respeita mao.ele === false. Sem arco no voo reduzido. repousarFio tem prazo 6,5 s (3 s reduzido). Erro em criarFolha entra em #frases com revelarPalavras. Fio-leve-caminho entra logo após ele-leve. Brilho fl-fio-respira usa --curva-branco-deriva.

### resposta

Contador não sobe sem pulo: margem some, data-alto muda tamanho, fio/rótulo/frase deslizam (1,5 s power2.inOut). Leitor: p.so-leitor[role=status] lê '<dias> <rótulo>' no momento. Tab preso na folha (reabertura). Celular: foco vai à section (tabindex=-1), não ao campo. Aviso vazio se texto apagado. Teclado aberto: aviso de erro continua visível. Fileira some com autoAlpha. Pena só com resposta ligada. Texto apagado em --tinta-suave (6,6:1). Virada usa radial closest-side.

### menu

Portão: GSAP sobe pendura; etiqueta de dentro balança. Etiqueta quebra linha sempre que não cabe. Pular/portão aparecem só com visibility. Frase final sem folha sai com ocultarPalavras. Gaveta montada uma vez só na primeira vez. Altura em var(--tela) em vez de vh. Nomes das referências em h3. Objetos que abrem folha com aria-haspopup=dialog. Links atualizam href em pointerdown.

### poppy

rolo gira fase/11 em radianos (não graus). Peças nascem na lona entrando pela esquerda (x = w/2 − 16) no reduzido. Tecla STOP com ::before parado (#8b7f66). Fábrica desenhada guardada no módulo. folhaAberta() usa html[data-etapa='lendo']. osd.zonas() medido quando modo muda. Recorte medido na própria raiz, não com rolagem.y. aria-label de reserva 'Parar a fita'.

### yourname

Ids SVG levam número do pintor (yn-lago-N, etc) em vez de ids fixos. canvas de passagem é variável `passagem`. Luzes da cidade olham coluna vizinha. 1 − smoothstep(subindo) em vez de smoothstep invertido. Aspecto inválido vira 1. `.yn` ganhou position: relative e overflow-x: clip. --yn-tinta-dia no bloco titulos. `.yn-abre` recuo com --seguro-topo. margin-left: auto dos versos pares em `.yn-texto`. Animações yn-surge e yn-desce sem fill-mode. Fio engrossa 2,8 px e "acende" para #e2303d.

### testes

robustez: se verso aparece, falha diz só "faixa N, verso K" (nunca o verso). Quebra contada em inicio:carta-espera, não na carga. objetosDoChao do content.js. Toque no fundo cai na faixa acima. Portão e link em três variantes. "Fechar" não precisa começar com a palavra. Sem WebGL: imprime 'info'. "há senha" segue diretor. ver-bolso: percorre timeline para frente com eventos ligados. tira.py: sem fotos dá mensagem. ver.mjs lista todas opções. Música e vídeo só em Chromium se tocavam.

### ferramentas

.bat convertidos para CRLF. _config.yml exclui PROMPT.md, node_modules, graphify-out, letra-*.txt, textos. .gitignore sem barra inicial, ignora *.lrc e tempos*.json. colocar-textos valida com new Function. sincronizar-letra: (?!arquivo:) no pareamento; aviso de chave JSON que não bate; linha de pausa nunca passa verso seguinte. capa.mjs e alameda-imagem.mjs montam próprio contexto. Auto-teste colocar-textos deu 'Tudo certo: 9 casos'.
