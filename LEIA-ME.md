# Para você — como mexer na carta

Este arquivo é só para você (não aparece no site). Tudo o que ela lê, ouve e vê sai de **um arquivo só: `js/content.js`**. Você não precisa tocar em mais nada.

## 1. Editar os textos (`js/content.js`)

Abra o arquivo num editor de texto simples (Bloco de Notas, VS Code, o próprio editor do GitHub). Ele é dividido em partes, na ordem em que ela vê: página, abertura, música, capítulo 1 (o jogo), capítulo 2 (o filme), os segredos (os vídeos), a mão, o encontro e o final. Cada parte tem um comentário em cima explicando o que é.

Regras para não quebrar nada:

- **Troque só o que está entre aspas simples**: `'assim'`.
- **O que está entre [colchetes] é exemplo.** Apague os colchetes e escreva o seu texto. Exemplo: `'[O nosso filme]'` vira `'O nosso filme'`. Nenhum colchete deve sobrar dentro das aspas quando você terminar.
- **Apóstrofo**: se o seu texto tiver um `'`, escreva `\'` no lugar. Exemplo: `'copo d\'água'`.
- **Quebra de linha** dentro de um texto: escreva `\n`. Exemplo: `'Primeira linha.\nSegunda linha.'`.
- **Vírgulas**: cada item de uma lista termina com vírgula. Não apague as vírgulas, as chaves `{ }` nem os colchetes `[ ]` que ficam **fora** das aspas.
- **Imagem ou música que você ainda não tem**: deixe o campo vazio, `''`. A carta se arruma sozinha, sem buraco e sem aviso.

Se depois de salvar a página ficar toda branca e parada, quase sempre é uma vírgula ou aspa faltando perto do que você mexeu por último.

Nos capítulos, os textos ficam numa lista chamada `blocos`. Você pode trocar a ordem, apagar ou repetir blocos (cada bloco vai de `{` até `},`). Os tipos possíveis estão explicados no comentário de cada capítulo.

## 2. Músicas

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

## 3. Imagens

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
- **`mao.ele`**: `true` faz você aparecer no fim do fio durante a caminhada (um rapaz de pé, de costas, desenhado pelo site, pequeno ao longe e maior conforme ela chega); `false` tira. Só aparece quando há imagens em `encontro.quadros`.
- **`mao.ancoraFio`** e **`fioDele` / `fioDela`** (no bloco `par`): dizem em que ponto da imagem o fio vermelho sai ou chega. `x` vai de 0 (esquerda) a 1 (direita), `y` de 0 (topo) a 1 (base). Se trocar a imagem, mude esses números até o fio sair do lugar certo.
- **`alt`**: uma frase curta descrevendo a imagem, para quem usa leitor de tela.

### O encontro (as imagens depois do fio)

Depois que ela segue o fio, a alameda escurece e as imagens da parte `encontro` do `content.js` passam sozinhas, como cenas de um filme; no fim, o fio vermelho do site liga o dedinho dela ao seu, vem um clarão e a última carta aparece. A lista `quadros` está na ordem em que as imagens passam:

- para **trocar** uma imagem, salve a nova em `assets/images/` e mude o `imagem` do bloco dela; use imagens deitadas (as maiores ficam mais nítidas);
- `foco` e `ate` dizem de onde até onde a câmera desliza na imagem; `dedo` (só nas duas imagens das mãos) é onde está o dedinho com o fio; `fio` (só na primeira) é onde o fio vermelho da imagem chega perto da borda de baixo. Todos são frações: `x` de 0 (esquerda) a 1 (direita), `y` de 0 (topo) a 1 (base). Se trocar a imagem, ajuste esses números olhando com `?cena=encontro`;
- para **tirar** esta parte, deixe a lista vazia (`quadros: []`): a carta vai direto do fio para a última carta.

A última imagem da lista, a do abraço (`encontro-5-abraco.webp`), tem `fim: true`: ela entra depois das mãos e é dela que vem o clarão. Ela veio com o logotipo do filme e uma assinatura no alto, por isso tem `aparar: { topo: 0.18 }`, que corta essa parte. Para tirar o abraço, apague o bloco dela; o clarão volta a vir das mãos. O original (`encontro-5-abraco.png`) ficou na pasta, sem uso.

As versões menores (`encontro-1-ela-ve.webp` e `encontro-3-ela-mao.webp`) ficaram na pasta sem uso: as duas imagens largas dela têm o dobro da resolução e dão mais espaço para a câmera deslizar.

## 4. Vídeos dos amigos (os segredos)

Depois do capítulo do filme, antes de "Olha a sua mão.", podem aparecer bilhetes amarrados com o fio vermelho: "Segredo 1", "Segredo 2", "Segredo 3"... Ela toca num, o bilhete se abre e vira o vídeo (com som; a música abaixa sozinha). Quando o vídeo acaba ou ela fecha, o nome de quem gravou é escrito à mão no bilhete, e a música volta. Quando ela já viu todos, aparece o botão "Seguir".

**Enquanto nenhum bilhete tiver vídeo, essa parte não aparece**: a carta vai direto do filme para a mão.

Para pôr um vídeo:

1. Crie a pasta `assets/videos/` e ponha o arquivo lá, com nome simples, sem espaço e sem acento: `assets/videos/ana.mp4`.
2. Em `js/content.js`, na parte `segredos`, preencha um item da lista `itens`:

```js
{
  titulo: 'Segredo 1',
  video: 'assets/videos/ana.mp4',
  capa: '',
  nome: 'Ana',
},
```

- `titulo`: o que vem escrito no bilhete fechado.
- `video`: o caminho do vídeo. Vazio (`''`) = esse bilhete não aparece.
- `capa`: uma imagem opcional que aparece enquanto o vídeo carrega (pode ficar `''`).
- `nome`: quem gravou; é escrito à mão quando o vídeo termina.
- Para ter mais bilhetes, copie um bloco `{ ... },` inteiro, com a vírgula. Até uns 6 cabem bem no celular.
- O seu vídeo também pode ser um deles: o último costuma ser o melhor lugar.

Formato e tamanho:

- **MP4 (vídeo H.264 e som AAC).** É o que todo app de compressão gera. Vídeo `.mov` ou HEVC direto do iPhone: converta antes (abaixo).
- **Em pé ou deitado**, tanto faz: a moldura mede o vídeo sozinha.
- **Até uns 25 MB cada.** O GitHub aceita até 100 MB por arquivo, mas ela vai abrir no 4G: quanto mais leve, mais rápido começa. Um minuto em 720p fica com uns 10 a 15 MB.

Como comprimir:

- **No celular:** um app de comprimir vídeo, exportando em MP4, 720p.
- **No computador, HandBrake** (grátis): predefinição "Fast 720p30", formato MP4.
- **No computador, ffmpeg** (uma linha; serve para vídeo em pé e deitado, o lado maior fica com no máximo 1280 px):

```
ffmpeg -i original.mov -vf "scale=w=1280:h=1280:force_original_aspect_ratio=decrease:force_divisible_by=2" -c:v libx264 -crf 26 -preset slow -pix_fmt yuv420p -c:a aac -b:a 128k -movflags +faststart assets/videos/ana.mp4
```

Se um vídeo não carregar (nome do arquivo errado, por exemplo), o bilhete mostra só o nome e conta como visto: nada trava. Depois de pôr os vídeos, teste com `?cena=segredos` no endereço, no iPhone, com som.

## 5. Ver uma parte só

Coloque um destes finais no endereço para pular direto para uma parte:

| Final do endereço | Parte |
|---|---|
| `?cena=inicio` | as frases, a caminhada e a primeira carta (com as músicas) |
| `?cena=poppy` | capítulo 1, o jogo |
| `?cena=carta2` | a segunda carta |
| `?cena=yourname` | capítulo 2, o filme |
| `?cena=segredos` | os bilhetes com os vídeos (só se houver algum vídeo) |
| `?cena=mao` | "Olha a sua mão." e o fio |
| `?cena=encontro` | as imagens do encontro, o fio entre os dedinhos e o clarão (só se houver imagens em `encontro.quadros`) |
| `?cena=final` | a última carta e a frase escrita à mão |

Para testar mais rápido, junte `&rapido=4` (tudo anda 4 vezes mais rápido). Para ver a versão leve (celular fraco), junte `&webgl=0`. Para ver a versão calma (movimento reduzido), `&reduzido=1`.

O link que você manda para ela é o endereço **sem** nada no final.

## 6. Testar no seu computador

A carta precisa de um servidor (abrir o `index.html` com dois cliques não funciona). Qualquer servidor estático serve. O mais simples, com o Node instalado, na pasta do projeto:

```
npx serve
```

Depois abra o endereço que ele mostrar (algo como `http://localhost:3000`). Para ver no celular, abra no navegador do celular o endereço de rede que o `serve` também mostra (os dois aparelhos no mesmo Wi-Fi).

## 7. Publicar

O site publica sozinho pelo **GitHub Pages**: tudo o que você enviar para o ramo **`main`** do repositório `ULystreak/23.12` vai ao ar em um ou dois minutos em:

**https://ulystreak.github.io/23.12/**

As pastas que começam com `_` (como `_dev/`), a pasta `output/` e os arquivos `PRODUCT.md`, `DESIGN.md` e este `LEIA-ME.md` ficam de fora do site.

Antes de mandar o link: abra no seu iPhone uma vez do começo ao fim, com som. A prévia do link (título "Para você" e a imagem do envelope) é neutra de propósito, para não entregar a surpresa. O WhatsApp guarda a prévia por um tempo; se você mudar a imagem, ela pode demorar a atualizar.
