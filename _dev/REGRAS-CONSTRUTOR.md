# Regras para quem constrói um módulo da v2

Leia antes de escrever qualquer código. Estas regras vêm do autor (seção 01 do PROMPT-V2) e valem para todos os módulos.

## O projeto
- Raiz: `C:\Users\uly\Documents\23.12v2`. Site estático: HTML, CSS e JavaScript em módulos ES, sem build, sem CDN. Bibliotecas locais em `lib/` (Three.js 0.185.0 em `lib/three.module.min.js`, GSAP 3.15.1 global `window.gsap` com CustomEase e DrawSVGPlugin, Lenis global `window.Lenis` só no computador).
- A especificação completa está em `C:\Users\uly\Desktop\PROMPT-V2-completo.md` (10.209 linhas). Leia SÓ as linhas que o seu brief indica, com Read e offset/limit (o arquivo é grande).
- O conteúdo editável do autor é `js/content.js` (já está na raiz; é a global `window.CONTEUDO`). Leia as seções dele que o seu módulo usa. NÃO altere este arquivo.
- O núcleo já existe e NÃO deve ser editado por você: `index.html`, `js/main.js`, `js/nucleo/{ambiente,util,movimento,recursos,diretor}.js`, `css/base.css`. Leia-os para conhecer o `ctx`, o `amb`, as curvas (`curvas` em movimento.js), os utilitários (`el`, `svg`, `espera`, `clamp`, `semente`, `quadro`, `comoPromise`, `revelarPalavras`, `ocultarPalavras`...) e os tokens CSS. Se precisar de algo no núcleo, escreva no relatório final o que falta e por quê; não edite.
- `_dev/CONTRATOS.md` lista o que cada módulo exporta e com que assinatura. Siga à letra as assinaturas do seu módulo; ao consumir outro módulo, chame só o que está lá (e use `?.` quando o módulo pode não existir, como no modo leve).

## Proibições absolutas
1. **Nenhum código da v1.** Não abra, não leia e não copie nada de `C:\Users\uly\Documents\23.12 - especial`, `C:\Users\uly\Documents\GitHub\23.12` nem `C:\Users\uly\Documents\testeee\23.12`. A v2 é feita do zero a partir da especificação.
2. **Letra de música nunca é reproduzida** em lugar nenhum (código, comentário, relatório, teste). Não abra `letra-1.txt`, `letra-2.txt` nem imprima o campo `letra` de `content.js`. O site mostra a letra como karaokê lendo o campo em tempo de execução; isso é tudo.
3. Nada de senha, chave ou token no repositório. Não rode git.
4. Não edite arquivos fora da sua lista. Dois construtores nunca tocam o mesmo arquivo.

## Como o código deve ser
- Comentários em português, no estilo do núcleo: um cabeçalho curto no topo de cada arquivo dizendo o papel, e comentários só onde há um porquê (medida, armadilha, decisão do autor).
- Menor código que resolve; sem abstração para uma implementação só; sem opção "para depois"; sem código morto.
- No DOM anime só `transform`, `opacity` e cor. Nada pisca, nada treme sem motivo. Use GSAP (`ctx.gsap` / `window.gsap`) com as curvas nomeadas de `js/nucleo/movimento.js` (`curvas.branco.*`, `curvas.poppy.*`, `curvas.yourname.*`, `curvas.ui.resposta`), ou transições CSS com os tokens de `css/base.css` (`--mola`, `--curva-ui`, `--dur-*`).
- Tempo: `espera(ms)` de util.js recebe milissegundos e respeita `?rapido`; a GSAP usa segundos (o `?rapido` já acelera o relógio global dela).
- Sempre existe a versão de movimento reduzido (`amb.reduzido`, `html.reduzido`): deslocamentos viram dissolvências, nada de balanço, durações curtas; nunca uma tela vazia.
- Sempre existe a versão sem WebGL (`amb.webgl` falso, `mundo.ok` falso, `html.sem-webgl`): visual mais simples, mas nada pode faltar.
- Three.js: use `mundo.THREE` (o namespace do módulo, guardado pelo mundo) em vez de importar a biblioteca de novo. `mundo.cena`, `mundo.camera`, `mundo.rig`, `mundo.renderer`, `mundo.aoQuadro(fn(dt, t))` estão descritos na seção de `js/mundo/mundo.js` do PROMPT-V2 (linhas 3955 a 4069).
- Acessibilidade: tudo que ela toca é `<button>` ou elemento focável com nome (aria-label dos `rotulos` do content.js); alvos de toque de pelo menos 44 px (pílula 52, redondo 48: classes `.ui-pilula`, `.ui-redondo` de base.css); Esc fecha o que abriu; o foco volta ao lugar de onde saiu; textos para leitor de tela em `.so-leitor`; ícones em SVG 24×24 com `.ui-icone` (nunca glifo unicode ou emoji).
- Contraste de texto sobre vidro ou imagem: pelo menos 4,5:1. "Um vermelho por tela": o vermelho cheio (`--fio`) é do fio ou de UM botão principal (`data-tom="fio"`).
- Fontes com endereço: Shippori Mincho (`--fonte-titulo`) para frases e títulos; Klee One (`--fonte-mao`) para o manuscrito e a papelaria; Fredoka (`--fonte-brinquedo`) e VT323 (`--fonte-fita`) SÓ dentro do capítulo do jogo.
- Mobile first: iPhone 13 Pro Max (428 × 926, DPR 3; área útil 428 × 746 com as barras do Safari). O computador (1440 × 900) também precisa ficar bonito. Use `--tela` (100dvh) e as `--seguro-*` (safe areas).
- Campo vazio no content.js (`''`, `[]`, caminho que não abre) = aquela coisa some sem buraco e sem aviso. Nenhum leitor pode quebrar com valor ausente: use `?.` e padrões.
- Ganchos de teste (`data-acao="..."`, ids, atributos `data-estado`, `data-cena`, `data-etapa`, chaves `carta2312:*` do localStorage, nomes de etapa) são contrato: use exatamente os nomes da especificação; os testes dependem deles.
- `diretor.etapa('nome')` publica a etapa atual; cada cena publica as etapas que a especificação lista, na ordem, com os nomes exatos.
- `localStorage` sempre dentro de `try/catch` (modo privado do Safari).
- Áudio: nada de `AudioContext` nem `play()` antes do primeiro gesto dela (`som.destravar()` é chamado pelo boot no primeiro gesto). Efeitos sonoros são sintetizados pelo `som.js`, nunca arquivos.

## Skills
Antes de implementar, invoque as skills que o brief indica com a ferramenta Skill (por exemplo `threejs-materials`, `gsap-core`, `animate`, `impeccable`, `a11y`). Elas trazem a referência de API e o padrão de qualidade que o autor espera. Use-as de fato: o autor pediu um site "foda" e fofo, sem cara de template nem de IA, delicado, nada grotesco.

## Verificação mínima antes de entregar
- `node --check <arquivo.js>` em cada arquivo JS que escreveu (o Node 24 entende módulos ES).
- Confira que cada export do seu módulo bate com `_dev/CONTRATOS.md` (nome, argumentos, retorno).
- Confira que todo caminho de content.js que você lê existe no `js/content.js` real (ou é uma chave documentada como opcional).
- Confira que o CSS do seu módulo usa só tokens de base.css para cores, raios, durações e curvas (sem cor nova solta, salvo as paletas do capítulo).

## O relatório final (curto, em português)
1. Arquivos escritos, com linhas.
2. Exports e assinaturas (confirme que batem com CONTRATOS.md).
3. O que você consome de outros módulos (nome e assinatura usada), para o integrador conferir.
4. O que ficou diferente da especificação, de propósito, e por quê.
5. O que precisa do núcleo (index.html, main.js, base.css) ou de outro módulo e ainda não existe.
