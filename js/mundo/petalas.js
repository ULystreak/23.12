// Pétalas (WebGL): pétalas de rosa com profundidade de campo de fotografia.
//
//   petalas.rajada(posMundo, n)     pétalas que saltam de um ponto e depois caem como as outras
//   petalas.definirDensidade(k)     0..1 (0 = nenhuma, 1 = todas); muda devagar
//   petalas.definirFoco(metros)     distância do plano de foco (padrão 3 m); muda devagar
//   petalas.comecar()               só a abertura usa: as pétalas entram por cima, como se
//                                   tivessem começado a cair agora (sem isso, já estão no ar)
//   petalas.protagonistas()         só a abertura usa: algumas pétalas enormes e bem
//                                   desfocadas cruzam devagar rente à lente
//   petalas.protegerRetangulo(r)    r = { left, top, right, bottom } em px (ou função que o
//                                   devolve a cada quadro), ou null: as pétalas desfocadas
//                                   entre a lente e esse retângulo quase somem. Nas etapas de
//                                   foco (carta-espera, mao-espera, desdobrando, escrevendo,
//                                   fim...) vale sozinho, com o miolo da tela como retângulo.
//   petalas.atualizar(dt, t)        chamado pelo mundo a cada quadro
//   petalas.objeto                  Object3D (já está na cena)
//   petalas.dispose()
//
// Três chamadas de desenho, todas instanciadas e com o mesmo par de shaders:
//   chuva   as que caem. Posição, tombo e balanço saem do tempo, dentro do vertex shader
//           (nada é simulado na CPU): uma caixa de ar acompanha a câmera e a pétala que sai
//           por um lado renasce pelo outro, então a caminhada atravessa as pétalas.
//   chão    as que já caíram: deitadas, com uma sombra de contato mínima. Dão o horizonte.
//   soltas  as das rajadas e as protagonistas, simuladas na CPU (são poucas).
//
// A forma é desenhada por distância (SDF) no fragment shader: gota larga de base
// curta, com um entalhe raso na margem de cima, sobre um quadrado curvado em
// concha no vertex shader.
// O desfoque é por instância: o círculo de confusão sai da distância ao plano de
// foco; quanto mais fora de foco, maior e mais macia a borda e menor a opacidade
// (a luz se espalha). Muito desfocada, a pétala se vira para a câmera e vira
// mancha: é o que impede a borda reta do quadrado de aparecer rente à lente.
// Ao longe elas rareiam e somem na névoa: perto são poucas e grandes, longe são
// dezenas pequenas. Sem isso o fundo vira confete.

import { clamp, amortecer, semente } from '../nucleo/util.js';

// Quantas pétalas em cada nível (as que caem + as do chão).
const QUANTIDADE = {
  alto: { chuva: 700, chao: 300 },
  medio: { chuva: 420, chao: 180 },
  baixo: { chuva: 220, chao: 90 },
};
const FOLGA_TELA_LARGA = 1.7;        // em tela deitada a caixa de ar é mais larga: mais pétalas, mesma densidade
const ESTOQUE_RAJADA = 96;
const PROTAGONISTAS = 5;
const FOCO_PADRAO = 3;               // metros
const ALTURA_CAIXA = 5.6;
const FUNDO_CAIXA = 9;
const LARGURA_MINIMA = 5;
// Etapas em que ela está olhando algo no meio da tela: nada desfocado passa na frente.
const ETAPAS_FOCO = new Set(['carta-espera', 'carta-abrindo', 'mao-espera', 'desdobrando', 'escrevendo', 'fim']);
const SOPRO = { velocidade: 0.5, calma: 2.2 };   // o primeiro sopro da abertura: m/s a mais, e em quantos segundos passa

const VERTICE = /* glsl */ `
  #define TAU 6.2831853

  uniform float uFoco;        // distância do plano de foco (m)
  uniform vec2 uAbertura;     // raio do desfoque (m): x antes do foco, y depois dele
  uniform vec2 uNevoa;        // onde a névoa branca começa e onde some tudo
  uniform vec2 uPerto;        // rente à lente a pétala some (antes de cortar no plano próximo)
  uniform vec3 uLuzDir;       // de onde vem a luz (mundo)
  uniform float uConcha;      // quão funda é a concha
  uniform vec4 uProtege;      // retângulo protegido em NDC (x0, y0, x1, y1)
  uniform float uProtegeK;    // 0..1, quanto a zona protegida vale agora

  varying vec2 vP;            // coordenada na pétala (a silhueta cabe em ±0,8)
  varying vec2 vQ;            // coordenada no quadrado (±1)
  varying vec4 vDados;        // x: desfoque (em unidades da pétala), y: opacidade, z: tom, w: forma
  varying vec3 vLuz;          // x: normal·luz (sem virar), y: névoa, z: o quanto a face olha para a câmera

  mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1., 0., 0., 0., c, s, 0., -s, c); }
  mat3 rotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0., -s, 0., 1., 0., s, 0., c); }
  mat3 rotZ(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0., -s, c, 0., 0., 0., 1.); }

  void sumir() {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);               // fora do quadro: nem chega ao rasterizador
    vP = vec2(0.0); vQ = vec2(0.0); vDados = vec4(0.0); vLuz = vec3(0.0);
  }

  // Recebe o centro da pétala no mundo, a rotação e o tamanho; resolve foco, concha e projeção.
  void montar(vec3 centro, mat3 R, float tamanho, float rolagem, float extra, float alfa, float tom, float forma) {
    vec4 mvC = viewMatrix * vec4(centro, 1.0);
    float prof = -mvC.z;
    #ifndef CHAO
    // Com a folha perto (foco curto), a pétala que passa à frente dela tem teto de
    // tamanho na tela (~5% da altura, menos que uma palavra): continua passando, mas
    // nunca vira uma mancha sobre a frase. As de trás da folha ficam como são.
    if (uProtegeK > 0.001 && extra <= 1.2) {
      float teto = 0.1 * prof / projectionMatrix[1][1];
      float k = uProtegeK * smoothstep(2.0, 1.2, uFoco) * (1.0 - smoothstep(0.85, 1.0, prof / uFoco));
      tamanho = mix(tamanho, min(tamanho, teto), k);
    }
    #endif
    float unidade = tamanho / 1.62;                       // metros por unidade da pétala

    // Círculo de confusão: cresce com a distância ao plano de foco.
    float abertura = prof < uFoco ? uAbertura.x : uAbertura.y;
    float sLuz = abertura * abs(prof - uFoco) / uFoco * extra / unidade;
    // A forma tem teto baixo (a rampa da borda nunca passa do raio da pétala): rente
    // à lente ela continua pétala, macia e clara, não
    // bolha. Só as protagonistas da abertura (desfoque extra > 1,2) viram mancha.
    float s = min(sLuz, extra > 1.2 ? 2.2 : 0.62);

    float nev = smoothstep(uNevoa.x, uNevoa.y, prof);
    float a = alfa * smoothstep(uPerto.x, uPerto.y, prof) * (1.0 - nev);
    a *= max(1.0 / (1.0 + 1.5 * sLuz * sLuz), 0.15);      // a luz se espalha: quanto maior, mais fraca

    #ifndef CHAO
    // Zona protegida (a carta, a mão, a folha): a pétala desfocada que passa entre a
    // lente e o que ela está olhando quase some; as nítidas e as de trás continuam.
    if (uProtegeK > 0.001 && extra <= 1.2 && prof < uFoco) {
      vec4 clipC = projectionMatrix * mvC;
      vec2 ndc = clipC.xy / max(clipC.w, 1e-4);
      vec2 raio = vec2(projectionMatrix[0][0], projectionMatrix[1][1]) * unidade * (0.86 + s) / max(prof, 0.05);
      vec2 fora = max(max(uProtege.xy - ndc, ndc - uProtege.zw), 0.0) / max(raio, vec2(1e-3));
      float dentro = 1.0 - smoothstep(0.35, 1.0, length(fora));
      float borrada = smoothstep(0.45, 0.85, sLuz);
      a *= 1.0 - 0.92 * uProtegeK * borrada * dentro;
      // Com a folha perto (foco curto), as que estão bem à frente dela somem pela
      // profundidade, borradas ou não: rente à lente até uma pétala pouco desfocada
      // é grande o bastante para tapar uma frase inteira. As de trás seguem passando.
      float rente = (1.0 - smoothstep(0.4, 0.6, prof / uFoco)) * smoothstep(2.0, 1.2, uFoco);
      a *= 1.0 - uProtegeK * rente;
    }
    #endif

    if (a < 0.004) { sumir(); return; }

    // O quadrado cresce o bastante para a borda macia caber inteira dentro dele.
    #ifdef CHAO
    float margem = max(s, 0.42);                          // a sombra de contato também precisa caber
    #else
    float margem = s;
    #endif
    float e = max(1.0, (0.86 + margem) / 1.12);
    vec2 q = position.xy * 2.0;
    vec2 pp = q * 1.12 * e;

    // Concha: côncava nos dois eixos, com a margem de cima levemente virada para trás.
    vec2 c = clamp(pp, vec2(-0.8), vec2(0.8));
    float k = uConcha * (0.6 + 0.8 * fract(forma * 7.3));
    float tp = clamp((c.y - 0.15) / 0.65, 0.0, 1.0);
    float ponta = tp * tp * (3.0 - 2.0 * tp);
    float z = k * (0.62 * c.x * c.x + 0.3 * (c.y + 0.1) * (c.y + 0.1) - 0.34 * ponta * ponta);
    vec3 local = vec3(pp, z) * unidade;
    vec3 nLocal = normalize(vec3(
      -k * 1.24 * c.x,
      -k * (0.6 * (c.y + 0.1) - 0.68 * ponta * 6.0 * tp * (1.0 - tp) / 0.65),
      1.0));

    // Quanto mais desfocada, mais de frente para a câmera (uma mancha não tem perfil).
    #ifdef CHAO
    float f = 0.0;
    #else
    // (começa cedo: meio desfocada e de perfil, ela viraria um risco esticado)
    float f = smoothstep(0.05, 0.42, s);
    #endif
    mat3 V = mat3(viewMatrix);
    float cr = cos(rolagem), sr = sin(rolagem);
    vec3 dMundo = V * (R * local);
    vec3 dFrente = vec3(cr * local.x - sr * local.y, sr * local.x + cr * local.y, local.z);
    gl_Position = projectionMatrix * vec4(mvC.xyz + mix(dMundo, dFrente, f), 1.0);

    vec3 lV = V * uLuzDir;
    vec3 nMundo = V * (R * nLocal);
    vec3 nFrente = vec3(cr * nLocal.x - sr * nLocal.y, sr * nLocal.x + cr * nLocal.y, nLocal.z);
    float nl = mix(dot(nMundo, lV), dot(nFrente, lV), f);
    float nv = mix(abs(dot(nMundo, normalize(-mvC.xyz))), 1.0, f);

    vP = pp;
    vQ = q;
    vDados = vec4(s, a, tom, forma);
    vLuz = vec3(nl, nev, nv);
  }

  #if defined(CHUVA) || defined(CHAO)
  attribute vec3 aSemente;    // posição inicial na caixa (0..1)
  attribute vec4 aR1;         // x: fase, y: giro (rad/s, com sinal), z: fase do balanço, w: tamanho
  attribute vec4 aR2;         // x: tom, y: sorte (densidade), z: modo (plana ↔ gira), w: forma

  uniform vec3 uCaixa;        // tamanho da caixa de ar
  uniform vec3 uCentro;       // centro da caixa (acompanha a câmera)
  uniform float uDensidade;
  uniform vec2 uTamanho;      // menor e maior pétala (m)
  uniform vec3 uRalo;         // ao longe elas rareiam: x de onde, y até onde, z a fração que sobra

  // Quantas ficam a esta profundidade: perto todas, longe só uma parte.
  float presenca(vec3 p) {
    float prof = -(viewMatrix * vec4(p, 1.0)).z;
    float limite = uDensidade * 1.06 * mix(1.0, uRalo.z, smoothstep(uRalo.x, uRalo.y, prof));
    return smoothstep(aR2.y, aR2.y + 0.06, limite);
  }
  #endif

  #ifdef CHUVA
  uniform float uTempo;       // relógio das pétalas (s)
  uniform vec2 uVento;        // deriva em x e z (m/s)
  uniform float uDesde;       // segundos desde que começaram a cair (abertura)
  uniform float uSopro;       // metros a mais que todas desceram (o primeiro sopro, na abertura)
  uniform float uTanFov;      // tangente de metade do campo de visão vertical

  void main() {
    float t = uTempo;
    float gira = smoothstep(0.62, 0.74, aR2.z);                         // 0 plana, 1 tomba sem parar
    float vel = mix(0.35, 0.6, fract(aR2.w * 13.7 + aR2.z * 5.1));      // queda (m/s)

    // Balanço lateral: duas ondas de períodos que não casam (parece ruído, custa dois senos).
    float fb = t * (0.55 + 0.7 * aR1.x) + aR1.z * TAU;
    float bal = sin(fb);
    float amp = mix(0.24, 0.09, gira);

    vec3 p = aSemente * uCaixa;
    p.y -= t * vel + uSopro;
    p.x += t * uVento.x * (0.75 + 0.5 * aR1.z) + bal * amp + sin(fb * 0.43 + aR1.x * 9.0) * 0.16;
    p.z += t * uVento.y * (0.75 + 0.5 * aR1.x) + cos(fb * 0.8 + 1.3) * amp * 0.6;
    // quem plana sobe um nada no fim de cada balanço, como folha
    p.y += (1.0 - gira) * (1.0 - bal * bal) * 0.035;

    // A caixa acompanha a câmera: quem sai por um lado renasce pelo outro.
    p = mod(p - uCentro + 0.5 * uCaixa, uCaixa) - 0.5 * uCaixa + uCentro;

    float a = presenca(p);
    a *= smoothstep(0.0, 0.7, uCaixa.y * 0.5 - abs(p.y - uCentro.y));  // teto e fundo da caixa
    a *= smoothstep(0.0, 0.5, uCaixa.x * 0.5 - abs(p.x - uCentro.x));  // lados
    a *= smoothstep(0.03, 0.3, p.y);                                    // some antes de atravessar o chão

    // Abertura: só aparece quem entrou por cima do quadro depois que elas começaram a cair.
    float frente = max(cameraPosition.z - p.z, 0.3);
    float topo = min(uCentro.y + uCaixa.y * 0.5, cameraPosition.y + frente * uTanFov * 1.08 + 0.15);
    // (as que passam rente à lente esperam um pouco: as primeiras a aparecer são as nítidas)
    float desde = uDesde - 1.7 * (1.0 - smoothstep(0.6, 1.7, frente));
    a *= smoothstep(0.0, 0.45, vel * desde * 1.1 + uSopro - (topo - p.y)) * step(0.0, desde);

    if (a < 0.004) { sumir(); return; }

    // Tombo em eixo próprio: as planas oscilam como folha, as outras giram sem parar.
    float guinada = aR1.x * TAU + t * (0.2 + 0.5 * aR2.w) * sign(aR1.y);
    float incl = (aR1.z - 0.5) * 2.6 + bal * mix(0.6, 0.2, gira) + gira * t * aR1.y;
    float rol = aR2.x * TAU + t * 0.12 * aR1.y;
    mat3 R = rotY(guinada) * rotX(incl - 1.5708) * rotZ(rol);

    float tamanho = mix(uTamanho.x, uTamanho.y, aR1.w * aR1.w);
    montar(p, R, tamanho, rol + guinada * 0.5, 1.0, a, aR2.x, aR2.w);
  }
  #endif

  #ifdef CHAO
  void main() {
    vec3 p = vec3(aSemente.x * uCaixa.x, 0.0, aSemente.z * uCaixa.z);
    p.xz = mod(p.xz - uCentro.xz + 0.5 * uCaixa.xz, uCaixa.xz) - 0.5 * uCaixa.xz + uCentro.xz;
    p.y = 0.012;

    float a = presenca(p);
    vec2 beira = uCaixa.xz * 0.5 - abs(p.xz - uCentro.xz);
    a *= smoothstep(0.0, 0.7, beira.x) * smoothstep(0.0, 0.7, beira.y);
    if (a < 0.004) { sumir(); return; }

    // Deitada, com rotação qualquer; metade caiu de barriga para baixo.
    float virada = step(0.5, aR2.z) * 3.14159265;
    mat3 R = rotY(aR1.x * TAU) * rotX(-1.5708 + (aR1.z - 0.5) * 0.3 + virada) * rotZ(aR1.y);

    float tamanho = mix(uTamanho.x, uTamanho.y, aR1.w * aR1.w);
    montar(p, R, tamanho, 0.0, 1.0, a, aR2.x, aR2.w);
  }
  #endif

  #ifdef SOLTA
  attribute vec3 aPos;        // posição no mundo
  attribute vec4 aGiro;       // x: guinada, y: inclinação, z: rolagem, w: forma
  attribute vec4 aSolta;      // x: tamanho (m), y: opacidade, z: tom, w: desfoque extra

  void main() {
    mat3 R = rotY(aGiro.x) * rotX(aGiro.y - 1.5708) * rotZ(aGiro.z);
    montar(aPos, R, aSolta.x, aGiro.z, aSolta.w, aSolta.y, aSolta.z, aGiro.w);
  }
  #endif
`;

const FRAGMENTO = /* glsl */ `
  uniform vec3 uCorBaseA;     // base (onde prendia na flor): mais escura
  uniform vec3 uCorBordaA;
  uniform vec3 uCorBaseB;     // segunda variação de tom
  uniform vec3 uCorBordaB;
  uniform vec3 uCorLuz;       // a cor da pétala atravessada pela luz
  uniform vec3 uCorSombra;
  uniform vec3 uNevoaCor;     // a cor da névoa (branco, ou a luz da alameda com a foto)

  varying vec2 vP;
  varying vec2 vQ;
  varying vec4 vDados;
  varying vec3 vLuz;

  // Cápsula desigual (Inigo Quilez): círculo de raio r1 na origem, r2 em (0, h).
  float capsula(vec2 p, float r1, float r2, float h) {
    p.x = abs(p.x);
    float b = (r1 - r2) / h;
    float a = sqrt(1.0 - b * b);
    float k = dot(p, vec2(-b, a));
    if (k < 0.0) return length(p) - r1;
    if (k > a * h) return length(p - vec2(0.0, h)) - r2;
    return dot(p, vec2(a, b)) - r1;
  }

  // Pétala de rosa: uma gota larga, de base curta e arredondada (a unha, onde
  // prendia na flor), que abre num leque redondo. A nervura do meio é levemente
  // curva (nenhuma é simétrica) e a margem de cima leva um entalhe raso.
  float petala(vec2 p, float forma, float nitidez) {
    float lado = fract(forma * 11.3) - 0.5;
    p.x += lado * 0.3 * (p.y * p.y - 0.18);                // a curva da nervura
    p.x *= mix(0.82, 0.98, fract(forma * 3.7));            // umas mais largas que outras
    float r2 = mix(0.6, 0.54, fract(forma * 5.3));
    float d = capsula(p - vec2(0.0, -0.43), 0.25, r2, 0.55);

    // entalhe: um círculo pequeno morde a margem de cima, raso e fora do centro
    // (fundo e no meio, a pétala vira coração); some com o desfoque
    float fundo = 0.05 * smoothstep(0.25, 0.9, fract(forma * 7.9)) * nitidez;
    float dn = length(p - vec2(lado * 0.3 + sign(lado) * 0.09, 0.12 + r2 + 0.11 - fundo)) - 0.11;
    float k = 0.07 * smoothstep(0.0, 0.02, fundo) + 0.0001;
    float h = clamp(0.5 - 0.5 * (d + dn) / k, 0.0, 1.0);
    return mix(d, -dn, h) + k * h * (1.0 - h);
  }

  float ruido(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

  void main() {
    float s = vDados.x;
    float forma = vDados.w;
    float nitidez = 1.0 - smoothstep(0.03, 0.3, s);

    float d = petala(vP, forma, nitidez);
    // margem de cima levemente ondulada: nenhuma pétala é um desenho de compasso
    float ang = atan(vP.x, vP.y + 0.3);
    d += (0.016 * sin(ang * 5.0 + forma * 40.0) + 0.007 * sin(ang * 11.0 + forma * 17.0))
      * smoothstep(-0.25, 0.45, vP.y) * nitidez;

    // Borda: nítida no foco; fora dele a luz se espalha para fora da silhueta.
    // Por dentro a rampa é curta: o miolo fica liso, sem os vincos da função de distância.
    float aa = fwidth(d) * 0.75 + 0.0001;
    float cobertura = 1.0 - smoothstep(-max(min(s, 0.16), aa), max(s, aa), d);
    // rede de segurança: na beira do quadrado a opacidade é sempre zero
    float janela = 1.0 - smoothstep(0.84, 1.0, max(abs(vQ.x), abs(vQ.y)));
    float alfa = cobertura * janela * vDados.y;

    // Cor: da base escura para a borda viva.
    // Fora de foco o desenho de dentro também se desfaz: sobra a cor média, viva.
    float liso = smoothstep(0.18, 0.9, s);
    float g = smoothstep(0.0, 1.0, length((vP - vec2(0.0, -0.68)) * vec2(0.85, 1.0)) / 1.3);
    g = mix(g, 0.74, liso);
    vec3 cor = mix(mix(uCorBaseA, uCorBaseB, vDados.z), mix(uCorBordaA, uCorBordaB, vDados.z), g);

    // Nervura central e veios em leque, quase invisíveis (somem com o desfoque).
    float nervura = exp(-vP.x * vP.x / 0.0016) * smoothstep(0.5, -0.6, vP.y);
    float veios = 0.5 + 0.5 * sin(atan(vP.x, vP.y + 1.1) * 44.0);
    cor *= 1.0 - nitidez * (0.09 * nervura + 0.04 * veios * smoothstep(-0.6, 0.35, vP.y));

    // A margem é mais fina: deixa passar um pouco de luz.
    cor = mix(cor, uCorLuz, smoothstep(-0.2, 0.0, d) * 0.22);

    // Luz do alto, sem brilho de plástico. Vista pelo lado da sombra, a luz
    // atravessa a pétala e ela clareia. Nas faces que fogem do olhar, o veludo.
    float nl = vLuz.x * (gl_FrontFacing ? 1.0 : -1.0);
    cor *= mix(mix(0.66, 1.06, smoothstep(-1.0, 1.0, nl)), 0.98, liso);
    cor = mix(cor, uCorLuz, max(max(-nl, 0.0) * 0.4, liso * 0.28));
    float veludo = 1.0 - vLuz.z;
    cor = mix(cor, uCorLuz, veludo * veludo * 0.3);
    cor *= 0.9 + 0.2 * fract(forma * 9.1);

    // Ao longe, some na névoa (branca; com a foto, a luz da alameda).
    cor = mix(cor, uNevoaCor, vLuz.y * 0.8);

    // Com a foto atrás, a pétala rente à lente é luz, não tinta: sobre o branco a
    // mancha macia já lia como claridade; sobre a alameda, vermelha e densa, lia
    // como sujeira na lente. Ela clareia e deixa a foto aparecer através dela.
    // (foto: 0 com a névoa branca, 1 com a luz da alameda)
    float foto = smoothstep(0.02, 0.4, length(vec3(1.0) - uNevoaCor));
    float bokeh = foto * smoothstep(0.28, 0.62, s);
    cor = mix(cor, mix(uCorLuz, vec3(1.0, 0.93, 0.95), 0.45), bokeh * 0.45);
    alfa *= 1.0 - 0.5 * bokeh;

    #ifdef CHAO
    // Sombra de contato: uma mancha escura mínima, deslocada um nada.
    float ds = petala(vP - vec2(0.05, -0.06), forma, 0.0);
    float sombra = (1.0 - smoothstep(-0.36, 0.36, ds)) * janela * 0.085 * min(vDados.y * 1.4, 1.0);
    float total = alfa + sombra * (1.0 - alfa);
    cor = mix(uCorSombra, cor, alfa / max(total, 0.0001));
    alfa = total;
    #endif

    // um grão mínimo desfaz os degraus das manchas grandes e macias
    alfa += (ruido(gl_FragCoord.xy) - 0.5) * 0.012 * step(0.2, s) * step(0.004, alfa);

    if (alfa < 0.003) discard;
    gl_FragColor = vec4(cor, alfa);
    #include <colorspace_fragment>
    gl_FragColor.rgb *= gl_FragColor.a;                   // alfa pré-multiplicado
  }
`;

export function criarPetalas(mundo, amb) {
  const { THREE, cena, camera, rig } = mundo;
  const sorte = semente(231223);
  const entre = (a, b) => a + sorte() * (b - a);

  // Quadrado com subdivisão, para a concha aparecer.
  const base = new THREE.PlaneGeometry(1, 1, amb.nivel === 'baixo' ? 4 : 6, amb.nivel === 'baixo' ? 5 : 7);

  const comuns = {
    uFoco: { value: FOCO_PADRAO },
    uAbertura: { value: new THREE.Vector2(0.04, 0.008) },
    uNevoa: { value: new THREE.Vector2(3.8, 9.2) },
    // movimento reduzido: nada enorme passando rente à lente
    uPerto: { value: amb.reduzido ? new THREE.Vector2(0.6, 1.1) : new THREE.Vector2(0.16, 0.38) },
    uLuzDir: { value: new THREE.Vector3(-0.3, 1, 0.45).normalize() },
    uConcha: { value: 0.55 },
    uProtege: { value: new THREE.Vector4(-0.8, -0.62, 0.8, 0.7) },
    uProtegeK: { value: 0 },
    uCorBaseA: { value: new THREE.Color('#6d0a22') },
    uCorBordaA: { value: new THREE.Color('#b3123a') },
    uCorBaseB: { value: new THREE.Color('#7d0c28') },
    uCorBordaB: { value: new THREE.Color('#c9184a') },
    uCorLuz: { value: new THREE.Color('#e4486c') },
    uCorSombra: { value: new THREE.Color('#2a1b22') },
    // o mesmo objeto da névoa da cena: acompanha a troca para a cor da foto
    uNevoaCor: { value: cena.fog ? cena.fog.color : new THREE.Color(0xffffff) },
  };

  const material = (variante, uniformes) => new THREE.ShaderMaterial({
    vertexShader: VERTICE,
    fragmentShader: FRAGMENTO,
    defines: { [variante]: '' },
    uniforms: { ...comuns, ...uniformes },
    transparent: true,
    premultipliedAlpha: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const geometriaInstanciada = () => {
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index;
    g.setAttribute('position', base.getAttribute('position'));
    g.setAttribute('uv', base.getAttribute('uv'));
    return g;
  };

  /** Atributos aleatórios de `n` pétalas (os mesmos nomes servem à chuva e ao chão). */
  const semear = (g, n) => {
    const sementes = new Float32Array(n * 3);
    const r1 = new Float32Array(n * 4);
    const r2 = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      sementes[i * 3] = sorte();
      sementes[i * 3 + 1] = sorte();
      sementes[i * 3 + 2] = sorte();
      r1[i * 4] = sorte();
      r1[i * 4 + 1] = entre(1.2, 3.6) * (sorte() < 0.5 ? -1 : 1);
      r1[i * 4 + 2] = sorte();
      r1[i * 4 + 3] = sorte();
      r2[i * 4] = sorte();
      r2[i * 4 + 1] = sorte();
      r2[i * 4 + 2] = sorte();
      r2[i * 4 + 3] = sorte();
    }
    g.setAttribute('aSemente', new THREE.InstancedBufferAttribute(sementes, 3));
    g.setAttribute('aR1', new THREE.InstancedBufferAttribute(r1, 4));
    g.setAttribute('aR2', new THREE.InstancedBufferAttribute(r2, 4));
  };

  // ---- as que caem ----------------------------------------------------------------
  const maxChuva = Math.ceil(QUANTIDADE.alto.chuva * FOLGA_TELA_LARGA);
  const geoChuva = geometriaInstanciada();
  semear(geoChuva, maxChuva);
  const matChuva = material('CHUVA', {
    uTempo: { value: 0 },
    uCaixa: { value: new THREE.Vector3(LARGURA_MINIMA, ALTURA_CAIXA, FUNDO_CAIXA) },
    uCentro: { value: new THREE.Vector3() },
    uDensidade: { value: 0 },
    uTamanho: { value: new THREE.Vector2(0.07, 0.15) },
    uRalo: { value: new THREE.Vector3(3, 7.5, 0.28) },
    uVento: { value: new THREE.Vector2(0.12, 0.02) },
    uDesde: { value: 1e5 },
    uSopro: { value: 0 },
    uTanFov: { value: 0.55 },
  });
  const chuva = new THREE.Mesh(geoChuva, matChuva);
  chuva.frustumCulled = false;
  chuva.renderOrder = 5;

  // ---- as do chão -----------------------------------------------------------------
  const maxChao = Math.ceil(QUANTIDADE.alto.chao * FOLGA_TELA_LARGA);
  const geoChao = geometriaInstanciada();
  semear(geoChao, maxChao);
  const matChao = material('CHAO', {
    uCaixa: { value: new THREE.Vector3(LARGURA_MINIMA + 2, 1, FUNDO_CAIXA + 1) },
    uCentro: { value: new THREE.Vector3() },
    uDensidade: { value: 0 },
    uTamanho: { value: new THREE.Vector2(0.07, 0.14) },
    uRalo: { value: new THREE.Vector3(3.5, 8, 0.32) },
  });
  const chao = new THREE.Mesh(geoChao, matChao);
  chao.frustumCulled = false;
  chao.renderOrder = 4;

  // ---- soltas: rajadas e protagonistas, simuladas na CPU ---------------------------
  const totalSoltas = ESTOQUE_RAJADA + PROTAGONISTAS;
  const geoSoltas = geometriaInstanciada();
  const sPos = new Float32Array(totalSoltas * 3);
  const sGiro = new Float32Array(totalSoltas * 4);
  const sDados = new Float32Array(totalSoltas * 4);
  const atribPos = new THREE.InstancedBufferAttribute(sPos, 3).setUsage(THREE.DynamicDrawUsage);
  const atribGiro = new THREE.InstancedBufferAttribute(sGiro, 4).setUsage(THREE.DynamicDrawUsage);
  const atribDados = new THREE.InstancedBufferAttribute(sDados, 4).setUsage(THREE.DynamicDrawUsage);
  geoSoltas.setAttribute('aPos', atribPos);
  geoSoltas.setAttribute('aGiro', atribGiro);
  geoSoltas.setAttribute('aSolta', atribDados);
  geoSoltas.instanceCount = totalSoltas;
  const matSoltas = material('SOLTA', {});
  const malhaSoltas = new THREE.Mesh(geoSoltas, matSoltas);
  malhaSoltas.frustumCulled = false;
  malhaSoltas.renderOrder = 6;
  malhaSoltas.visible = false;

  const soltas = Array.from({ length: totalSoltas }, () => ({
    viva: false, roteiro: null, partiu: false,
    de: new THREE.Vector3(), ate: new THREE.Vector3(),
    x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
    idade: 0, vida: 1, queda: 0.45, fase: 0,
    guinada: 0, incl: 0, rol: 0, vGuinada: 0, vIncl: 0, vInclFinal: 0,
    tam: 0.06, tom: 0, forma: 0, extra: 1,
  }));
  let vivas = 0;
  let preparo = null;                               // ver petalas.preparar()

  const objeto = new THREE.Group();
  objeto.name = 'petalas';
  objeto.add(chao, chuva, malhaSoltas);
  cena.add(objeto);

  // ---- estado ---------------------------------------------------------------------
  const ritmo = amb.reduzido ? 0.45 : 1;            // movimento reduzido: tudo mais lento
  const tetoChuva = amb.reduzido ? 0.34 : 1;        // ... e poucas
  const tetoChao = amb.reduzido ? 0.6 : 1;
  let relogio = sorte() * 40;                       // relógio próprio (anda no ritmo acima)
  let densidadeAlvo = 1;
  let focoAlvo = FOCO_PADRAO;
  let desde = 1e5;                                  // tempo desde comecar(); enorme = já estavam no ar
  const posCamera = new THREE.Vector3();
  let protegido = null;                             // retângulo (ou função) pedido por uma cena
  const MIOLO = [-0.8, -0.62, 0.8, 0.7];            // sem retângulo pedido: o miolo da tela

  function atualizarProtecao(dt) {
    const raiz = document.documentElement;
    let r = null;
    try { r = typeof protegido === 'function' ? protegido() : protegido; } catch { r = null; }
    const pedido = !!(r && r.right > r.left && r.bottom > r.top);
    const foco = ETAPAS_FOCO.has(raiz.dataset.etapa);
    const u = comuns.uProtege.value;
    if (pedido) {
      const L = Math.max(1, mundo.tamanho?.largura || innerWidth);
      const A = Math.max(1, mundo.tamanho?.altura || innerHeight);
      u.set((r.left / L) * 2 - 1, 1 - (r.bottom / A) * 2, (r.right / L) * 2 - 1, 1 - (r.top / A) * 2);
    } else if (foco) {
      u.set(MIOLO[0], MIOLO[1], MIOLO[2], MIOLO[3]);
    }
    const alvo = pedido || foco ? 1 : 0;
    comuns.uProtegeK.value = amortecer(comuns.uProtegeK.value, alvo, alvo ? 3 : 1.2, dt);
  }

  function ajustarQuantidade() {
    const q = QUANTIDADE[amb.nivel] || QUANTIDADE.medio;
    const largura = matChuva.uniforms.uCaixa.value.x;
    const folga = clamp(largura / LARGURA_MINIMA, 1, FOLGA_TELA_LARGA);
    geoChuva.instanceCount = Math.min(maxChuva, Math.round(q.chuva * folga));
    geoChao.instanceCount = Math.min(maxChao, Math.round(q.chao * folga));
  }

  function ajustarCaixa() {
    // A caixa precisa ser mais larga que o que a câmera vê lá no fundo (telas deitadas).
    const tan = Math.tan((camera.fov * Math.PI) / 360);
    const larguraVista = 2 * tan * FUNDO_CAIXA * camera.aspect;
    const largura = Math.max(LARGURA_MINIMA, larguraVista * 1.06);
    matChuva.uniforms.uCaixa.value.x = largura;
    matChuva.uniforms.uTanFov.value = tan;
    matChao.uniforms.uCaixa.value.x = largura + 2;
    ajustarQuantidade();
  }
  ajustarCaixa();
  const pararTamanho = mundo.aoRedimensionar(ajustarCaixa);
  const pararNivel = mundo.aoMudarNivel(ajustarQuantidade);

  function pegarSolta() {
    // Primeiro uma livre; se não houver, a que está mais perto do fim dá a vez.
    let escolhida = soltas[0];
    for (let i = 0; i < ESTOQUE_RAJADA; i++) {
      const p = soltas[i];
      if (!p.viva) return p;
      if (p.idade / p.vida > escolhida.idade / escolhida.vida) escolhida = p;
    }
    return escolhida;
  }

  /** Metade do quadro (em metros) a `prof` metros da câmera. */
  function meiaVista(prof) {
    const meiaAltura = Math.tan((camera.fov * Math.PI) / 360) * prof;
    return { x: meiaAltura * camera.aspect, y: meiaAltura };
  }

  function atualizarSoltas(dt) {
    const vento = matChuva.uniforms.uVento.value;
    const assenta = 1 - Math.exp(-1.9 * dt);
    let sobrou = 0;

    for (let i = 0; i < totalSoltas; i++) {
      const p = soltas[i];
      if (!p.viva) { sDados[i * 4 + 1] = 0; continue; }
      p.idade += dt;
      let alfa = 1;

      if (p.roteiro) {
        // Protagonista: atravessa o quadro devagar, rente à lente. O caminho é
        // fixado no mundo quando ela entra: se a caminhada começar antes de ela
        // sair, ela passa pela câmera como qualquer outra.
        const r = p.roteiro;
        if (p.idade < 0) { sDados[i * 4 + 1] = 0; sobrou++; continue; }     // ainda não entrou
        const k = p.idade / p.vida;
        if (k >= 1) { p.viva = false; p.roteiro = null; sDados[i * 4 + 1] = 0; continue; }
        if (!p.partiu) {
          const meia = meiaVista(r.prof);
          const folga = p.tam * 2.4;                            // o quanto ela (desfocada) ocupa para fora do centro
          camera.updateWorldMatrix(true, false);
          p.de.set(r.de[0] * (meia.x + folga), r.de[1] * (meia.y + folga), -r.prof).applyMatrix4(camera.matrixWorld);
          p.ate.set(r.ate[0] * (meia.x + folga), r.ate[1] * (meia.y + folga), -r.prof).applyMatrix4(camera.matrixWorld);
          p.partiu = true;
        }
        p.x = p.de.x + (p.ate.x - p.de.x) * k;
        p.y = p.de.y + (p.ate.y - p.de.y) * k + Math.sin(k * 5 + p.fase) * 0.012;
        p.z = p.de.z + (p.ate.z - p.de.z) * k;
        alfa = clamp(k / 0.14) * clamp((1 - k) / 0.14);
      } else {
        // Rajada: sai em leque, o ar freia, e ela passa a cair como as outras.
        const fim = p.idade >= p.vida || p.y < 0.03 || p.z > posCamera.z + 0.4;
        if (fim) { p.viva = false; sDados[i * 4 + 1] = 0; continue; }
        const bal = Math.sin(p.idade * 1.3 + p.fase) * 0.18 * clamp(p.idade - 0.6);
        p.vx += (vento.x + bal - p.vx) * assenta;
        p.vy += (-p.queda - p.vy) * assenta;
        p.vz += (vento.y - p.vz) * assenta;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        p.vIncl += (p.vInclFinal - p.vIncl) * (1 - Math.exp(-1.1 * dt));
        alfa = clamp(p.idade / 0.12) * clamp((p.vida - p.idade) / 1.6) * clamp((p.y - 0.03) / 0.3);
      }

      p.guinada += p.vGuinada * dt;
      p.incl += p.vIncl * dt;
      sPos[i * 3] = p.x; sPos[i * 3 + 1] = p.y; sPos[i * 3 + 2] = p.z;
      sGiro[i * 4] = p.guinada; sGiro[i * 4 + 1] = p.incl; sGiro[i * 4 + 2] = p.rol; sGiro[i * 4 + 3] = p.forma;
      sDados[i * 4] = p.tam; sDados[i * 4 + 1] = alfa; sDados[i * 4 + 2] = p.tom; sDados[i * 4 + 3] = p.extra;
      sobrou++;
    }

    vivas = sobrou;
    atribPos.needsUpdate = true;
    atribGiro.needsUpdate = true;
    atribDados.needsUpdate = true;
  }

  const petalas = {
    objeto,

    definirDensidade(k) {
      densidadeAlvo = clamp(Number(k) || 0);
    },

    definirFoco(metros) {
      const d = Number(metros);
      focoAlvo = Number.isFinite(d) && d > 0 ? clamp(d, 0.4, 30) : FOCO_PADRAO;
    },

    protegerRetangulo(r) {
      protegido = r || null;
    },

    comecar() {
      desde = 0;
      matChuva.uniforms.uDesde.value = 0;
      matChuva.uniforms.uSopro.value = 0;
      matChao.uniforms.uDensidade.value = 0;
    },

    protagonistas() {
      if (amb.reduzido) return;                       // nada grande cruzando a tela
      // Cada uma: de onde vem e para onde vai (±1 = já fora do quadro), a que
      // distância da lente, em quantos segundos e depois de quanto tempo.
      // Todas derivam para o lado do vento (direita) e para baixo.
      const roteiros = [
        { de: [-1, 0.3], ate: [1, -0.42], prof: 0.44, dura: 6.4, atraso: 0 },
        { de: [0.2, 1], ate: [1, 0.1], prof: 0.58, dura: 5.2, atraso: 1.9 },
        { de: [-1, -0.2], ate: [0.4, -1], prof: 0.5, dura: 5.8, atraso: 3.6 },
        { de: [-1, 0.78], ate: [1, 0.12], prof: 0.76, dura: 6.6, atraso: 5.4 },
        { de: [-0.5, 1], ate: [1, -0.66], prof: 0.47, dura: 6.2, atraso: 7.5 },
      ];
      const quantas = amb.nivel === 'baixo' ? 3 : roteiros.length;
      for (let i = 0; i < quantas; i++) {
        const r = roteiros[i];
        const p = soltas[ESTOQUE_RAJADA + i];
        if (!p.viva) vivas++;
        p.viva = true;
        p.roteiro = r;
        p.partiu = false;
        p.idade = -r.atraso;                          // negativa: ainda não entrou
        p.vida = r.dura;
        p.fase = sorte() * 6.28;
        p.guinada = sorte() * 6.28; p.incl = entre(-0.5, 0.5); p.rol = sorte() * 6.28;
        p.vGuinada = entre(-0.25, 0.25); p.vIncl = entre(-0.3, 0.3); p.vInclFinal = p.vIncl;
        p.tam = entre(0.085, 0.11); p.tom = sorte(); p.forma = sorte();
        // quanto mais longe da lente, mais desfoque a mais: todas chegam como mancha macia
        p.extra = entre(1.4, 1.8) * (r.prof / 0.45);
      }
      malhaSoltas.visible = true;
    },

    /**
     * Compila o programa das soltas (rajadas e protagonistas) antes do primeiro uso:
     * a malha fica invisível até lá, e o three só compilaria no quadro em que ela
     * aparece (~40 ms). Uma vez só; chamadas seguintes devolvem a mesma promessa.
     */
    preparar() {
      if (!preparo) {
        const r = mundo.renderer;
        preparo = Promise.resolve().then(() => (r && r.compileAsync
          ? r.compileAsync(malhaSoltas, camera, cena)
          : r?.compile?.(malhaSoltas, camera, cena))).catch(() => {});
      }
      return preparo;
    },

    rajada(posMundo, n = 12) {
      if (!posMundo || !Number.isFinite(posMundo.x)) return;
      const quantas = Math.min(amb.reduzido ? Math.ceil(n / 3) : n, ESTOQUE_RAJADA);
      const forca = amb.reduzido ? 0.5 : 1;
      for (let i = 0; i < quantas; i++) {
        const p = pegarSolta();
        if (!p.viva) vivas++;
        p.viva = true;
        p.roteiro = null;
        // Leque: para todos os lados, um pouco para cima e na direção dela.
        const angulo = sorte() * Math.PI * 2;
        const impulso = entre(0.5, 1.9) * forca;
        p.x = posMundo.x; p.y = posMundo.y; p.z = posMundo.z;
        p.vx = Math.cos(angulo) * impulso;
        p.vy = Math.sin(angulo) * impulso * 0.8 + 0.7 * forca;
        p.vz = entre(0.3, 1.5) * forca;
        p.idade = 0;
        p.vida = entre(7, 12);
        p.queda = entre(0.35, 0.6) * ritmo;
        p.fase = sorte() * 6.28;
        p.guinada = sorte() * 6.28; p.incl = sorte() * 6.28; p.rol = sorte() * 6.28;
        p.vGuinada = entre(-1.2, 1.2);
        p.vIncl = entre(5, 11) * (sorte() < 0.5 ? -1 : 1) * forca;   // sai rodopiando
        p.vInclFinal = (sorte() < 0.4 ? entre(1.2, 3) : entre(0.1, 0.5)) * Math.sign(p.vIncl);
        p.tam = entre(0.046, 0.085); p.tom = sorte(); p.forma = sorte();
        p.extra = 1;
      }
      malhaSoltas.visible = true;
    },

    atualizar(dt) {
      const passo = dt * ritmo;
      relogio += passo;

      camera.getWorldPosition(posCamera);

      const uc = matChuva.uniforms;
      if (desde < 1e4) {
        desde += passo;
        // O primeiro sopro: as primeiras descem um pouco mais depressa e o ar se acalma.
        uc.uSopro.value = SOPRO.velocidade * SOPRO.calma * (1 - Math.exp(-desde / SOPRO.calma));
      }
      uc.uTempo.value = relogio;
      uc.uDesde.value = desde;
      uc.uDensidade.value = amortecer(uc.uDensidade.value, densidadeAlvo * tetoChuva, 0.9, dt);
      // A caixa segue o rig (não o balanço do passo): as bordas não tremem.
      uc.uCentro.value.set(rig.position.x, ALTURA_CAIXA * 0.5 - 0.1, rig.position.z - FUNDO_CAIXA * 0.44);

      // O chão só junta pétalas depois que elas tiveram tempo de cair.
      const uh = matChao.uniforms;
      const alvoChao = desde < 3.6 ? 0 : densidadeAlvo * tetoChao;
      uh.uDensidade.value = amortecer(uh.uDensidade.value, alvoChao, desde < 60 ? 0.32 : 0.9, dt);
      uh.uCentro.value.set(rig.position.x, 0, rig.position.z - (FUNDO_CAIXA + 1) * 0.46);

      comuns.uFoco.value = amortecer(comuns.uFoco.value, focoAlvo, 2.2, dt);
      atualizarProtecao(dt);

      if (vivas) atualizarSoltas(passo);
      else if (malhaSoltas.visible) malhaSoltas.visible = false;
    },

    dispose() {
      pararTamanho();
      pararNivel();
      cena.remove(objeto);
      geoChuva.dispose();
      geoChao.dispose();
      geoSoltas.dispose();
      base.dispose();
      matChuva.dispose();
      matChao.dispose();
      matSoltas.dispose();
    },
  };

  return petalas;
}
