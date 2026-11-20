# Para você — como mexer na carta

Este arquivo é só para você (não aparece no site). Tudo o que ela lê, ouve e vê sai de **um arquivo só: `js/content.js`**. Você não precisa tocar em mais nada.

## 1. Editar os textos (`js/content.js`)

Abra o arquivo num editor de texto simples (Bloco de Notas, VS Code, o próprio editor do GitHub). Ele é dividido em partes, na ordem em que ela vê: página, senha, abertura, música, capítulo 1 (o jogo), capítulo 2 (o filme), o bolso e a bolsa, a sua voz (os áudios), a mão, a corrida, as cartas do chão (os vídeos), o encontro, o final, o contador e a folha em que ela escreve de volta. Cada parte tem um comentário em cima explicando o que é.

Regras para não quebrar nada:

- **Troque só o que está entre aspas simples**: `'assim'`.
- **O que está entre [colchetes] é exemplo.** Apague os colchetes e escreva o seu texto. Exemplo: `'[O nosso filme]'` vira `'O nosso filme'`. Nenhum colchete deve sobrar dentro das aspas quando você terminar.
- **Apóstrofo**: se o seu texto tiver um `'`, escreva `\'` no lugar. Exemplo: `'copo d\'água'`.
- **Quebra de linha** dentro de um texto: escreva `\n`. Exemplo: `'Primeira linha.\nSegunda linha.'`.
- **Vírgulas**: cada item de uma lista termina com vírgula. Não apague as vírgulas, as chaves `{ }` nem os colchetes `[ ]` que ficam **fora** das aspas.
- **Imagem ou música que você ainda não tem**: deixe o campo vazio, `''`. A carta se arruma sozinha, sem buraco e sem aviso.

Se depois de salvar a página ficar toda branca e parada, quase sempre é uma vírgula ou aspa faltando perto do que você mexeu por último.

Nos capítulos, os textos ficam numa lista chamada `blocos`. Você pode trocar a ordem, apagar ou repetir blocos (cada bloco vai de `{` até `},`). Os tipos possíveis estão explicados no comentário de cada capítulo.

## 2. A senha

A primeira coisa que ela vê é uma tela preta com quatro casas para um número. O número fica em `js/content.js`, na parte `senha`:

```js
codigo: '8035',
```

- Para **trocar**, mude os algarismos entre as aspas (só números; a quantidade de casas na tela acompanha).
- Para **tirar** a senha, deixe `codigo: ''`: a carta começa direto na escolha da música.
- `frase` é um texto opcional acima das casas e `dica` um texto que só aparece depois de três erros. Vazios (`''`), não aparecem.
- `palpites` são os chutes que você já espera dela antes de acertar (a data, a idade, "te amo"). Cada linha tem o chute (`se`) e a sua resposta (`diz`), que aparece no lugar do aviso de senha errada, sem tremer e sem contar como erro: `{ se: '2312', diz: '[esse é o dia, não a senha]' },`. Maiúsculas, acentos e espaços não fazem diferença no chute. As respostas de hoje são exemplos entre colchetes: troque pelas suas, acrescente ou apague linhas. `palpites: []` desliga (todo chute errado mostra só o aviso).

Não é segurança de verdade (quem abrir o arquivo vê o número): é só o primeiro gesto dela.

## 3. Músicas

Logo depois da senha, ainda na tela preta, ela escolhe a música passando as capas para o lado com o dedo (no computador, com as setas). Tocar na capa do meio começa a música; "Continuar" abre a alameda. Com uma música só também funciona; cada música que você acrescentar entra na fila, na ordem da lista.

1. Coloque o `.mp3` em `assets/music/` (nome sem espaço e sem acento, ex.: `nossa-musica.mp3`).
2. Coloque a capa na mesma pasta, de preferência **quadrada**, em `.webp` ou `.jpg`, até uns 600×600 px.
3. Em `js/content.js`, na parte `musica`, copie o bloco de exemplo que está comentado (as linhas com `//`), tire as duas barras do começo de cada linha e preencha:

```js
{
  titulo: 'Nome da música',
  artista: 'Nome do artista',
  arquivo: 'assets/music/nossa-musica.mp3',
  capa: 'assets/music/nossa-musica.webp',
},
```

Os nomes precisam ser **exatamente** iguais aos dos arquivos (maiúsculas contam). A música começa a ~30% do volume (`volumeInicial: 0.3`) e repete até o fim.

## 4. Imagens

Todas ficam em `assets/images/`. Prefira `.webp`, até ~350 KB e no máximo 1600 px no lado maior. Depois de salvar o arquivo, escreva o caminho no campo certo:

| Arquivo | Formato | Campo em `content.js` | Situação |
|---|---|---|---|
| `yourname-capa.png` | largo | `yourname.capa` | já está |
| `yourname-encontro.webp` | largo | bloco `imagem-cheia` do capítulo 2 | já está |
| `yourname-visao-dele.webp` e `yourname-visao-dela.webp` | em pé | bloco `par` (`dele` e `dela`) | já estão |
| `yourname-fundo.webp` | em pé 9:16 | `yourname.fundo` | falta |
| `yourname-ceu.mp4` | em pé, mudo, até 2,5 MB | `yourname.video` | falta (opcional) |
| `yourname-escadaria.webp` | 16:9 | bloco `imagem` do capítulo 2 | falta |
| `yourname-cordao.webp` | faixa larga, fundo transparente | bloco `cordao` (campo `arquivo`) | falta |
| `poppy-fundo.webp` | em pé 9:16 | `poppy.fundo` | falta |
| `poppy-1.webp` e `poppy-2.webp` | 16:9 | blocos `imagem` do capítulo 1 | faltam |
| `mao-akai-ito.webp` | em pé, fundo transparente | `mao.imagem` | falta |
| `encontro-mitsuha-costas.webp`, `encontro-2-ele-ve.webp`, `encontro-mitsuha-mao.webp`, `encontro-4-ele-mao.webp` | deitadas (largas) | `encontro.quadros` | já estão |
| `og-capa.jpg` | 1200×630, JPG | (a prévia do link no WhatsApp) | já está |

Atenção: a capa, o encontro e o par que estão lá agora são quadros do filme (com os personagens). O ideal é trocar por fotos de vocês ou por céus e lugares parecidos; a `capa` também pode ficar `''` (o capítulo abre só com o título e o céu).

Os textos para gerar as que faltam estão em `_dev/prompts-imagens.md`. Sem elas, o site desenha a sua própria versão de cada cena.

Dois ajustes quando trocar imagens:

- **`mao.escrito`**: o que aparece escrito à caneta na palma da mão dela, letra por letra, logo depois de "Olha a sua mão." (hoje `'eu te amo'`). Curto fica melhor: até umas quatro palavras pequenas. Vazio (`''`) deixa a mão sem nada escrito.
- **`mao.ele`**: `true` faz você aparecer no fim do fio durante a corrida (um rapaz de pé, de costas, desenhado pelo site, pequeno ao longe e maior conforme ela chega); `false` tira. Só aparece quando há imagens em `encontro.quadros`.
- **`mao.ancoraFio`** e **`fioDele` / `fioDela`** (no bloco `par`): dizem em que ponto da imagem o fio vermelho sai ou chega. `x` vai de 0 (esquerda) a 1 (direita), `y` de 0 (topo) a 1 (base). Se trocar a imagem, mude esses números até o fio sair do lugar certo.
- **`alt`**: uma frase curta descrevendo a imagem, para quem usa leitor de tela.

### O encontro (as imagens depois do fio)

Depois que ela corre pelo fio, vê as cartas do chão e toca em "Seguir em frente", a alameda escurece e as imagens da parte `encontro` do `content.js` passam sozinhas, como cenas de um filme; no fim, o fio vermelho do site liga o dedinho dela ao seu, vem um clarão e, quando ele passa, já é noite e você está na frente dela com a última carta na mão. A lista `quadros` está na ordem em que as imagens passam:

- para **trocar** uma imagem, salve a nova em `assets/images/` e mude o `imagem` do bloco dela; use imagens deitadas (as maiores ficam mais nítidas);
- `foco` e `ate` dizem de onde até onde a câmera desliza na imagem; `dedo` (só nas duas imagens das mãos) é onde está o dedinho com o fio; `fio` (só na primeira) é onde o fio vermelho da imagem chega perto da borda de baixo. Todos são frações: `x` de 0 (esquerda) a 1 (direita), `y` de 0 (topo) a 1 (base). Se trocar a imagem, ajuste esses números olhando com `?cena=encontro`;
- para **tirar** esta parte, deixe a lista vazia (`quadros: []`): a carta vai direto das cartas do chão para a última carta.

A última imagem da lista, a do abraço (`encontro-5-abraco.webp`), tem `fim: true`: ela entra depois das mãos e é dela que vem o clarão. Ela veio com o logotipo do filme e uma assinatura no alto, por isso tem `aparar: { topo: 0.18 }`, que corta essa parte. Para tirar o abraço, apague o bloco dela; o clarão volta a vir das mãos.

As versões menores (`encontro-1-ela-ve.webp` e `encontro-3-ela-mao.webp`) ficaram na pasta sem uso: as duas imagens largas dela têm o dobro da resolução e dão mais espaço para a câmera deslizar.

## 5. O bolso, a bolsa e a corrida

- No fim de cada capítulo o botão é **"Guardar no bolso"** (os textos são `poppy.fechar` e `yourname.fechar`). O olhar dela desce, a carta entra na bolsinha de ombro e a bolsa vai para o botão da **bolsa**, no canto de baixo, à direita. Na bolsa ela encontra tudo o que já guardou e pode reabrir (as duas cartas e, mais adiante, cada carta do chão já aberta, com o nome).
- Os nomes que aparecem na bolsa ficam na parte `inventario`: `titulo` (o título da bolsa), `cartaPoppy` e `cartaYourname`.
- A corrida até você dura `corrida.segundos` (hoje 7; vale de 5 a 10).

## 6. Vídeos dos amigos (as cartas do chão)

Depois de "Olha a sua mão." ela corre pelo fio até você, e perto de você há cartas no chão: Sariel, Ana, Mirai, Alpha, Pocoyoh, Nup e, por último, a Surpresinha. No chão elas não têm nome. Ela toca numa, o vídeo toca (com som; a música para e depois volta), e só quando ela fecha o nome de quem gravou aparece escrito na carta. Cada carta aberta vai para a bolsa, no canto de baixo. Depois da primeira carta aberta aparece o botão "Seguir em frente".

**Carta que ainda não tem vídeo aparece do mesmo jeito** e abre um cartão escrito "[vídeo de Sariel vem aqui]", para você ver tudo funcionando antes de os vídeos chegarem.

Para pôr um vídeo:

1. Crie a pasta `assets/videos/` e ponha o arquivo lá, com nome simples, sem espaço e sem acento: `assets/videos/sariel.mp4`.
2. Em `js/content.js`, na parte `cartasChao`, escreva o caminho na linha da pessoa:

```js
{ nome: 'Sariel', video: 'assets/videos/sariel.mp4', capa: '' },
```

- `nome`: quem gravou; só aparece depois que ela abre a carta.
- `video`: o caminho do vídeo. Vazio (`''`) = abre o cartão de exemplo.
- `capa`: uma imagem opcional que aparece enquanto o vídeo carrega (pode ficar `''`).
- Para tirar uma carta, apague a linha dela. Para ter mais uma, copie uma linha inteira, com a vírgula.

A **Surpresinha** fica logo abaixo, em `surpresinha`: é uma sequência de fotos e vídeos de vocês que ela passa para o lado. Cada linha de `midias` é uma foto ou um vídeo:

```js
midias: [
  { foto: 'assets/images/nos-1.webp', legenda: 'O dia em que...' },
  { video: 'assets/videos/nos-1.mp4', legenda: '' },
],
```

Formato e tamanho:

- **MP4 (vídeo H.264 e som AAC).** É o que todo app de compressão gera. Vídeo `.mov` ou HEVC direto do iPhone: converta antes (abaixo).
- **Em pé ou deitado**, tanto faz: a moldura mede o vídeo sozinha.
- **Até uns 25 MB cada.** O GitHub aceita até 100 MB por arquivo, mas ela vai abrir no 4G: quanto mais leve, mais rápido começa. Um minuto em 720p fica com uns 10 a 15 MB.

Como comprimir:

- **No celular:** um app de comprimir vídeo, exportando em MP4, 720p.
- **No computador, HandBrake** (grátis): predefinição "Fast 720p30", formato MP4.
- **No computador, ffmpeg** (uma linha; serve para vídeo em pé e deitado, o lado maior fica com no máximo 1280 px):

```
ffmpeg -i original.mov -vf "scale=w=1280:h=1280:force_original_aspect_ratio=decrease:force_divisible_by=2" -c:v libx264 -crf 26 -preset slow -pix_fmt yuv420p -c:a aac -b:a 128k -movflags +faststart assets/videos/sariel.mp4
```

Se um vídeo não carregar (nome do arquivo errado, por exemplo), a carta mostra só o nome e conta como vista: nada trava. Depois de pôr os vídeos, teste com `?cena=cartas` no endereço, no iPhone, com som.

Os outros textos desta parte também estão em `cartasChao`: `frase` (aparece quando as cartas caem), `seguir` (o botão "Seguir em frente"), `vazio` (o cartão de exemplo; `{nome}` vira o nome da pessoa) e `vazioSurpresinha`.

## 7. O fim: a carta na sua mão, o contador, a resposta dela e a sua voz

Depois das imagens do encontro e do clarão, já é noite na alameda, com estrelas e o cometa. Você está na frente dela, de mão estendida, com a última carta: a carta sai da sua mão e vai até ela. Ela toca, a folha abre e a frase de `final.frase` é escrita à mão.

**O céu** muda sozinho ao longo do site, sem nada para configurar: manhã no começo, dia na segunda carta, entardecer na mão, crepúsculo na corrida e nas cartas do chão, noite no fim.

### O contador (parte `contador`)

Quando a frase termina, o número volta com a mesma letra da tela da senha e conta de 0 até **os dias de vida dela no dia em que ela abrir**. No dia 23/12/2026 dá 8035 (a senha); no dia seguinte, 8036; e assim por diante, um a mais por dia.

- `nascimento`: o dia em que ela nasceu, `'ano-mês-dia'` (hoje `'2004-12-23'`). Vazio (`''`) tira o contador.
- `rotulo`: o que vem embaixo do número (`'dias até aqui'`).
- `frase`: a **sua** frase embaixo do contador. Hoje é um exemplo entre colchetes: troque pelo seu texto, ou deixe `''` para não ter frase.
- `conhecemos`: o dia em que vocês se conheceram, `'ano-mês-dia'`. Enquanto o número sobe, cada dia da vida dela vira um pontinho de luz numa flor; com esta data, os dias desde que vocês se conheceram acendem em vermelho, na borda da flor. Vazio (`''`) = só o dia de hoje fica vermelho.

Se você abrir antes do dia 23, o número é menor que 8035 (é a conta de verdade até aquele dia). Para ver como vai ficar no dia, use `?cena=final&hoje=2026-12-23`.

### Ela escreve de volta (parte `resposta`)

Depois do contador sobe uma folha em branco e ela escreve o que quiser. O texto fica guardado **só no celular dela** (se ela fechar e voltar, continua lá). O site não tem como mandar nada sozinho; para você ver, ela toca em **"Enviar para ele"**, o WhatsApp dela abre com o texto pronto e ela aperta enviar.

- `whatsapp`: o seu número, só algarismos, com 55 e o DDD (ex.: `'5511999998888'`). Com o número, a conversa já abre com você. **Atenção: o site é público e quem abrir o arquivo consegue ler esse número.** Se não quiser, deixe `''`: o WhatsApp abre do mesmo jeito e ela escolhe o seu contato.
- `convite`: a frase no alto da folha. Hoje é um exemplo entre colchetes: troque pelo seu texto.
- `dica`: o texto apagado dentro da folha antes de ela escrever. `antes`: uma linha que vai na frente do texto dela na mensagem (opcional).
- Os botões e avisos estão em `rotulos`, `guardado`, `vazio` e `enviando`.
- Para tirar a folha, apague o bloco `resposta` inteiro.

No fim de tudo fica a noite, a folha com a frase, o contador pequeno no alto, a música, a bolsa e o botão "Escrever de volta", que abre a folha dela de novo.

### A sua voz (parte `voz`)

Quando ela chega ao fim, aparece na bolsa uma fita cassete, "A minha voz", com os seus áudios. O celular dela lembra: da segunda visita em diante a fita já está na bolsa desde o começo. Cada áudio tem tocar/pausar, o fio para ir e voltar, o tempo e o botão de **baixar**. Enquanto a sua voz toca, a música do site abaixa e depois volta.

Para pôr os três áudios:

1. Crie a pasta `assets/audio/` e ponha os arquivos lá, com nome simples, sem espaço e sem acento: `voz-1.mp3`, `voz-2.mp3`, `voz-3.mp3`.
2. Use **.mp3 ou .m4a**. Gravação do app Gravador do iPhone (.m4a) já serve. **Áudio do WhatsApp (.ogg ou .opus) não toca no iPhone**: converta para .mp3 antes (qualquer conversor, ou `ffmpeg -i audio.ogg voz-1.mp3`).
3. Em `js/content.js`, na parte `voz`, preencha cada linha de `itens`:

```js
{ titulo: 'Para quando a saudade apertar', arquivo: 'assets/audio/voz-1.mp3' },
```

- `titulo`: o nome que ela lê (e o nome do arquivo quando ela baixa). Hoje são exemplos entre colchetes.
- `arquivo` vazio (`''`): a linha aparece como "[áudio 1 vem aqui]" e não toca.
- Pode ter mais ou menos de três: copie ou apague uma linha inteira, com a vírgula.
- `frase`: uma linha opcional embaixo do título do cartão.

No iPhone, o botão de baixar faz o Safari perguntar "Deseja baixar?" e o áudio vai para o app Arquivos, pasta Downloads. Teste com `?cena=final&voz=abrir`, no iPhone, com som.

## 8. Ver uma parte só

Sem nada no endereço, o site abre na tela preta da senha (o número está em `js/content.js`, na parte `senha`). Coloque um destes finais no endereço para pular direto para uma parte, sem senha:

| Final do endereço | Parte |
|---|---|
| `?cena=senha` | a tela preta com a senha |
| `?cena=musica` | a escolha da música, na tela preta |
| `?cena=inicio` | as frases, a caminhada e a primeira carta |
| `?cena=poppy` | capítulo 1, o jogo, e a carta indo para o bolso |
| `?cena=carta2` | a segunda carta |
| `?cena=yourname` | capítulo 2, o filme, e a carta indo para o bolso |
| `?cena=mao` | "Olha a sua mão.", o fio e a corrida até você |
| `?cena=cartas` | as cartas no chão (os vídeos dos amigos e a Surpresinha) |
| `?cena=encontro` | as imagens do encontro, o fio entre os dedinhos e o clarão (só se houver imagens em `encontro.quadros`) |
| `?cena=final` | você entregando a última carta, a frase escrita à mão, o contador, a folha de resposta e o fim |
| `?cena=final&voz=abrir` | o fim, já com o cartão dos seus áudios aberto |
| `?cena=final&hoje=2026-12-23` | o fim como ela vai ver no dia 23/12 (o contador finge essa data) |

Para testar mais rápido, junte `&rapido=4` (tudo anda 4 vezes mais rápido). Para ver a versão leve (celular fraco), junte `&webgl=0`. Para ver a versão calma (movimento reduzido), `&reduzido=1`.

O link que você manda para ela é o endereço **sem** nada no final.

Conforme ela avança, o endereço ganha sozinho um `?cena=…` (da primeira carta em diante). É de propósito: se a página recarregar no meio (o iPhone às vezes recarrega quando ela volta do WhatsApp), ela continua do começo da parte em que estava, com a mesma música, e não da senha. Para você ver do zero no seu celular, abra de novo o link limpo.

## 9. Testar no seu computador

A carta precisa de um servidor (abrir o `index.html` com dois cliques não funciona). Qualquer servidor estático serve. O mais simples, com o Node instalado, na pasta do projeto:

```
npx serve
```

Depois abra o endereço que ele mostrar (algo como `http://localhost:3000`). Para ver no celular, abra no navegador do celular o endereço de rede que o `serve` também mostra (os dois aparelhos no mesmo Wi-Fi).

## 10. Publicar

O site publica sozinho pelo **GitHub Pages**: tudo o que você enviar para o ramo **`main`** do repositório `ULystreak/23.12` vai ao ar em um ou dois minutos em:

**https://ulystreak.github.io/23.12/**

As pastas que começam com `_` (como `_dev/`), a pasta `output/` e os arquivos `PRODUCT.md`, `DESIGN.md` e este `LEIA-ME.md` ficam de fora do site.

Antes de mandar o link: abra no seu iPhone uma vez do começo ao fim, com som. A prévia do link (título "Para você" e a imagem do envelope) é neutra de propósito, para não entregar a surpresa. O WhatsApp guarda a prévia por um tempo; se você mudar a imagem, ela pode demorar a atualizar.
