/* VER-INICIO: abrir o site começa sempre do início.
   Confere: 1) com a marca do menu já gravada, o link limpo vai da música para a
   carta (inicio), não para o menu; 2) o endereço nunca guarda ?cena=; 3) recarregar
   na mão, no meio da carta, volta à senha; 4) a aba que ficou escondida e foi
   recarregada (iPhone descartando a aba) volta para onde ela estava.
   Uso: node _dev/ver-inicio.mjs   (sai com 0 se tudo certo) */
import { abrir } from './lib.mjs';
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = true;
const conferir = (nome, cond) => { console.log(`${cond ? 'ok ' : 'FALHOU'} ${nome}`); if (!cond) ok = false; };
const cena = (page) => page.evaluate(() => document.documentElement.dataset.cena);
const ate = async (page, alvo, ms = 40000) => { for (let t = 0; t < ms && (await cena(page)) !== alvo; t += 250) await pausa(250); return (await cena(page)) === alvo; };

// 1 e 2: marca do menu gravada, link limpo, entrando pela senha.
let s = await abrir({ vp: 'iphone-safari', params: { rapido: 6, mudo: 1, menu: 1 }, entrar: true });
conferir('com o menu já visto, depois da música vem a carta (inicio)', await ate(s.page, 'inicio'));
conferir('o menu não apareceu', !(await s.page.evaluate(() => window.__carta.historico.some((p) => String(p).startsWith('menu')))));
conferir(`o endereço não guarda ?cena= (${new URL(s.page.url()).search})`, !new URL(s.page.url()).searchParams.has('cena'));
await s.fechar();

// 3 e 4: no meio da carta.
s = await abrir({ cena: 'poppy', vp: 'iphone-safari', params: { rapido: 6, mudo: 1 } });
const { page } = s;
await ate(page, 'poppy'); await pausa(1500);
conferir(`chegando por ?cena=poppy o endereço é limpo (${new URL(page.url()).search})`, !new URL(page.url()).searchParams.has('cena'));
await page.reload({ waitUntil: 'domcontentloaded' }); await pausa(2500);
const c1 = await cena(page);
conferir(`recarregar na mão recomeça do início (${c1})`, c1 === 'senha' || c1 === 'musica');
// De volta ao meio, simulando a aba escondida há 10 s e recarregada pelo aparelho.
await page.goto(page.url() + '&cena=poppy', { waitUntil: 'domcontentloaded' });
await ate(page, 'poppy'); await pausa(1500);
await page.evaluate(() => {
  const r = JSON.parse(sessionStorage.getItem('carta2312:retomada'));
  r.oculto = Date.now() - 10000;
  sessionStorage.setItem('carta2312:retomada', JSON.stringify(r));
  // O aparelho descarta a aba sem avisar a página: aqui a saída fica muda.
  window.addEventListener('visibilitychange', (e) => e.stopImmediatePropagation(), true);
  Object.defineProperty(document, 'hidden', { get: () => false });
  Storage.prototype.removeItem = () => {};
});
await page.reload({ waitUntil: 'domcontentloaded' });
conferir('aba escondida e recarregada pelo aparelho volta ao poppy', await ate(page, 'poppy', 20000));
conferir(`sem erros (${s.erros.length})`, s.erros.length === 0);
await s.fechar();
process.exit(ok ? 0 : 1);
