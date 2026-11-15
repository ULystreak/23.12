# Para você — como mexer na carta

Este arquivo é só para você (não aparece no site). Tudo o que ela lê, ouve e vê sai de **um arquivo só: `js/content.js`**. Você não precisa tocar em mais nada.

## 1. Editar os textos (`js/content.js`)

Abra o arquivo num editor de texto simples (Bloco de Notas, VS Code, o próprio editor do GitHub). Ele é dividido em partes, na ordem em que ela vê: página, abertura, música, capítulo 1 (o jogo), capítulo 2 (o filme), a mão e o final. Cada parte tem um comentário em cima explicando o que é.

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
| `og-capa.jpg` | 1200×630, JPG | (a prévia do link no WhatsApp) | já está |

Atenção: a capa, o encontro e o par que estão lá agora são quadros do filme (com os personagens). O ideal é trocar por fotos de vocês ou por céus e lugares parecidos; a `capa` também pode ficar `''` (o capítulo abre só com o título e o céu).

Os textos para gerar as que faltam estão em `_dev/prompts-imagens.md`. Sem elas, o site desenha a sua própria versão de cada cena.

Dois ajustes quando trocar imagens:

- **`mao.ancoraFio`** e **`fioDele` / `fioDela`** (no bloco `par`): dizem em que ponto da imagem o fio vermelho sai ou chega. `x` vai de 0 (esquerda) a 1 (direita), `y` de 0 (topo) a 1 (base). Se trocar a imagem, mude esses números até o fio sair do lugar certo.
- **`alt`**: uma frase curta descrevendo a imagem, para quem usa leitor de tela.

## 4. Ver uma parte só

Coloque um destes finais no endereço para pular direto para uma parte:

| Final do endereço | Parte |
|---|---|
| `?cena=inicio` | as frases, a caminhada e a primeira carta (com as músicas) |
| `?cena=poppy` | capítulo 1, o jogo |
| `?cena=carta2` | a segunda carta |
| `?cena=yourname` | capítulo 2, o filme |
| `?cena=mao` | "Olha a sua mão." e o fio |
| `?cena=final` | a última carta e a frase escrita à mão |

Para testar mais rápido, junte `&rapido=4` (tudo anda 4 vezes mais rápido). Para ver a versão leve (celular fraco), junte `&webgl=0`. Para ver a versão calma (movimento reduzido), `&reduzido=1`.

O link que você manda para ela é o endereço **sem** nada no final.

## 5. Testar no seu computador

A carta precisa de um servidor (abrir o `index.html` com dois cliques não funciona). Qualquer servidor estático serve. O mais simples, com o Node instalado, na pasta do projeto:

```
npx serve
```

Depois abra o endereço que ele mostrar (algo como `http://localhost:3000`). Para ver no celular, abra no navegador do celular o endereço de rede que o `serve` também mostra (os dois aparelhos no mesmo Wi-Fi).

## 6. Publicar

O site publica sozinho pelo **GitHub Pages**: tudo o que você enviar para o ramo **`main`** do repositório `ULystreak/23.12` vai ao ar em um ou dois minutos em:

**https://ulystreak.github.io/23.12/**

As pastas que começam com `_` (como `_dev/`), a pasta `output/` e os arquivos `PRODUCT.md`, `DESIGN.md` e este `LEIA-ME.md` ficam de fora do site.

Antes de mandar o link: abra no seu iPhone uma vez do começo ao fim, com som. A prévia do link (título "Para você" e a imagem do envelope) é neutra de propósito, para não entregar a surpresa. O WhatsApp guarda a prévia por um tempo; se você mudar a imagem, ela pode demorar a atualizar.
