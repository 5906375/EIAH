// Teste em NAVEGADOR REAL (Edge via Chrome DevTools Protocol): cliques e digitação por eventos de entrada reais (Input.dispatch*).
// Uso (Node >= 20 com --experimental-websocket, no Windows): node --experimental-websocket browser-test.mjs <baseUrl> <real|mock> <portaCDP> <saida.json> [pastaPrints]
// real = SOMENTE LEITURA (nunca clica em "Verificar sessão AWS", upload ou conciliação). mock = servidor de fixture com mock-aws (pode clicar tudo).
import fs from "node:fs";
const [, , BASE, MODE, CDP, OUT, SHOTS] = process.argv;
const results = [], consoleMsgs = [], netFails = [], responses = {};
let id = 0; const pending = new Map();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function check(name, ok, detail) { results.push({ name, ok: !!ok, detail: detail === undefined ? "" : String(detail).slice(0, 300) }); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  -> " + String(detail).slice(0, 300))); }

const tgt = await (await fetch(`http://127.0.0.1:${CDP}/json/new?about:blank`, { method: "PUT" })).json();
const ws = new WebSocket(tgt.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) { const { res, rej } = pending.get(d.id); pending.delete(d.id); d.error ? rej(new Error(JSON.stringify(d.error))) : res(d.result); return; }
  if (d.method === "Runtime.consoleAPICalled") consoleMsgs.push({ type: d.params.type, text: d.params.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 300) });
  else if (d.method === "Runtime.exceptionThrown") consoleMsgs.push({ type: "exception", text: (d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text || "").slice(0, 400) });
  else if (d.method === "Log.entryAdded") consoleMsgs.push({ type: "log:" + d.params.entry.level, text: (d.params.entry.text + " " + (d.params.entry.url || "")).slice(0, 300) });
  else if (d.method === "Network.responseReceived") responses[d.params.response.url] = d.params.response.status;
  else if (d.method === "Network.loadingFailed") netFails.push(d.params.errorText + " " + (d.params.blockedReason || ""));
};
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error("avaliação falhou: " + (r.exceptionDetails.exception?.description || r.exceptionDetails.text)); return r.result.value; };
async function until(expr, ms = 8000, step = 150) { const end = Date.now() + ms; let v; while (Date.now() < end) { try { v = await ev(expr); if (v) return v; } catch (e) { /* página recarregando */ } await sleep(step); } return v; }
// helpers de DOM (seletores por texto, válidos para qualquer versão da UI)
const H = `
window.__t = {
  btn: (scope, text) => [...document.querySelectorAll(scope + ' button')].find((b) => b.textContent.trim().startsWith(text)),
  field: (label) => { const l = [...document.querySelectorAll('#view-history label')].find((x) => x.textContent.trim().startsWith(label)); return l && l.querySelector('input,select'); },
  vis: (e) => !!e && !!(e.offsetWidth || e.offsetHeight) && !e.closest('[hidden]'),
  rows: () => document.querySelectorAll('#view-history tbody tr').length,
  total: () => { const m = document.querySelector('#view-history').textContent.match(/(\\d+) registro\\(s\\) de (\\d+)/); return m ? [Number(m[1]), Number(m[2])] : null; }
};`;
async function center(expr) { const r = await ev(`(()=>{const e=${expr}; if(!e) return null; e.scrollIntoView({block:'center',inline:'center'}); const r=e.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height};})()`); return r; }
async function click(expr, label) { const c = await center(expr); if (!c || !c.w) throw new Error("elemento não encontrado/visível para clicar: " + (label || expr)); await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: c.x, y: c.y }); await send("Input.dispatchMouseEvent", { type: "mousePressed", x: c.x, y: c.y, button: "left", clickCount: 1 }); await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: c.x, y: c.y, button: "left", clickCount: 1 }); await sleep(120); }
async function typeInto(expr, text, label) { await click(expr, label); await ev(`(()=>{const e=${expr}; if('value' in e){e.select&&e.select();}})()`); for (const ch of text) { await send("Input.dispatchKeyEvent", { type: "keyDown", text: ch, key: ch }); await send("Input.dispatchKeyEvent", { type: "keyUp", key: ch }); await sleep(30); } }
async function key(k, code, vk) { await send("Input.dispatchKeyEvent", { type: "keyDown", key: k, code, windowsVirtualKeyCode: vk }); await send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code, windowsVirtualKeyCode: vk }); await sleep(80); }
async function setSelect(label, value) { await click(`__t.field(${JSON.stringify(label)})`, "select " + label); await ev(`(()=>{const s=__t.field(${JSON.stringify(label)}); s.value=${JSON.stringify(value)}; s.dispatchEvent(new Event('change',{bubbles:true}));})()`); await sleep(500); }
async function shot(name) { if (!SHOTS) return; const r = await send("Page.captureScreenshot", { format: "png" }); fs.mkdirSync(SHOTS, { recursive: true }); fs.writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(r.data, "base64")); }
async function nav(view, text) { await click(`__t.btn('#nav','${text}')`, "nav " + text); return until(`!document.getElementById('view-${view}').hidden`, 3000); }

await send("Page.enable"); await send("Runtime.enable"); await send("Log.enable"); await send("Network.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
await send("Emulation.setFocusEmulationEnabled", { enabled: true });
try { await send("Browser.grantPermissions", { origin: new URL(BASE).origin, permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"] }); } catch (e) { /* alguns builds exigem browserContext */ }
await send("Page.navigate", { url: BASE });
await until("document.readyState==='complete'", 10000); await ev(H);
const cardsOk = await until("document.querySelectorAll('#view-overview .card').length>0", 12000);
check("página carrega e renderiza cartões da visão geral", cardsOk, cardsOk);
check("app.js carregado (HTTP 200)", responses[new URL("/app.js", BASE).href] === 200, responses[new URL("/app.js", BASE).href]);
check("app.css carregado (HTTP 200)", responses[new URL("/app.css", BASE).href] === 200, responses[new URL("/app.css", BASE).href]);
check("/api/overview respondeu 200", Object.entries(responses).some(([u, s]) => u.endsWith("/api/overview") && s === 200), JSON.stringify(Object.entries(responses).filter(([u]) => u.includes("/api/")).slice(0, 4)));
check("script ativo (estado S existe e há atualização bem-sucedida)", await until("typeof S!=='undefined' && S.lastOk>0", 8000), "");
await shot("01-visao-geral");

// afford. visuais
const aff = await ev(`(()=>{const c=(e)=>e&&getComputedStyle(e).cursor; const b=document.querySelector('#nav button'); const bar=document.querySelector('.bar i'); return {navCursor:c(b), navBorder:getComputedStyle(b).borderTopWidth, barPct: bar? Math.round(100*bar.getBoundingClientRect().width/bar.parentElement.getBoundingClientRect().width):null};})()`);
check("botões de navegação têm cursor de clique", aff.navCursor === "pointer", JSON.stringify(aff));
check("barra da fila respeita o percentual (CSP não bloqueia estilo)", aff.barPct !== null && aff.barPct < 50, "largura da barra = " + aff.barPct + "% do trilho");

// navegação
check("clicar em Agenda mostra a agenda", await nav("agenda", "Agenda") && /Calendário configurado/.test(await ev("document.getElementById('view-agenda').textContent")), "");
await shot("02-agenda");
check("clicar em Depende de você mostra a seção", await nav("todo", "Depende") && /Runs aguardando upload/.test(await ev("document.getElementById('view-todo').textContent")), "");
await shot("03-depende");
// histórico
check("clicar em Histórico mostra a tabela", await nav("history", "Histórico"), "");
const hv = await until("__t.rows()>0", 6000); check("histórico lista runs", hv, "linhas=" + await ev("__t.rows()"));
const total0 = await ev("__t.total()"); const N = total0 ? total0[1] : 0;
check("histórico mostra total e fontes consultadas", total0 && /fontes consultadas/.test(await ev("document.getElementById('view-history').textContent")), JSON.stringify(total0));
const firstId = await ev("document.querySelector('#view-history tbody tr .mono').textContent");

// busca (digitação real) — deve filtrar SEM exigir sair do campo
const sfx = firstId.slice(-6);
await typeInto("__t.field('Buscar')", sfx, "campo de busca");
const filtered = await until(`__t.total() && __t.total()[0]===1`, 4000);
check("busca por identificador filtra enquanto digita (sem precisar Enter/sair do campo)", filtered, "total=" + JSON.stringify(await ev("__t.total()")) + " valor=" + await ev("__t.field('Buscar').value"));
await click("__t.btn('#view-history','Limpar')", "Limpar");
check("botão Limpar restaura a lista completa", await until(`__t.total() && __t.total()[0]===${N}`, 4000), JSON.stringify(await ev("__t.total()")));
// foco e valor sobrevivem à atualização automática de 5 s
await typeInto("__t.field('Buscar')", "zz", "busca"); await sleep(6500);
const keep = await ev("({v:__t.field('Buscar').value, focus:document.activeElement===__t.field('Buscar')})");
check("texto digitado e foco do campo sobrevivem à atualização automática (5 s)", keep.v === "zz" && keep.focus, JSON.stringify(keep));
await click("__t.btn('#view-history','Limpar')", "Limpar");
await until(`__t.total() && __t.total()[0]===${N}`, 4000);
// selects
let psum = 0, pdet = [];
for (const pf of ["daily", "weekly", "manual"]) { await setSelect("Perfil", pf); const t = await ev("__t.total()"); psum += t ? t[0] : 0; pdet.push(pf + "=" + (t ? t[0] : "?")); }
check("filtro por perfil: a soma diário+semanal+manual iguala o total (cada clique altera o resultado)", psum === N, pdet.join(" ") + " total=" + N);
await setSelect("Perfil", ""); await setSelect("Estado", "UPLOADED_VERIFIED"); const nu = await ev("__t.total()"); check("filtro por estado altera o resultado", nu && nu[0] >= 0 && nu[0] < N, JSON.stringify(nu));
await setSelect("Estado", "");
await ev(`(()=>{const e=__t.field('De'); e.value='2099-01-01'; e.dispatchEvent(new Event('change',{bubbles:true}));})()`); await sleep(600);
check("filtro de período (De 2099) zera os registros e informa 0", (await ev("__t.total()"))?.[0] === 0, JSON.stringify(await ev("__t.total()")));
await click("__t.btn('#view-history','Limpar')", "Limpar"); await until(`__t.total() && __t.total()[0]===${N}`, 4000);
await setSelect("Ordem", "asc"); const asc = await ev("document.querySelector('#view-history tbody tr .mono').textContent"); await setSelect("Ordem", "desc"); const desc = await ev("document.querySelector('#view-history tbody tr .mono').textContent");
check("ordenação por data inverte a ordem", asc !== desc && desc === firstId, `asc=${asc.slice(-14)} desc=${desc.slice(-14)}`);
// paginação
await setSelect("Por página", "5");
const pg = await ev("document.getElementById('view-history').textContent.match(/página (\\d+) de (\\d+)/)");
check("paginação: com 5 por página aparecem 2 páginas (6 runs)", N > 5 ? (pg && pg[2] === "2") : true, JSON.stringify(pg));
if (N > 5) {
  await click("__t.btn('#view-history','próxima')", "próxima"); await sleep(500);
  check("botão próxima leva à página 2 com os registros restantes", (await ev("document.getElementById('view-history').textContent.match(/página (\\d+) de/)[1]")) === "2" && (await ev("__t.rows()")) === N - 5, "linhas=" + await ev("__t.rows()"));
  await click("__t.btn('#view-history','← anterior')", "anterior"); await sleep(500);
  check("botão anterior volta à página 1", (await ev("document.getElementById('view-history').textContent.match(/página (\\d+) de/)[1]")) === "1", "");
}
await setSelect("Por página", "10");
await shot("04-historico");

// detalhes por clique real na linha
await click("document.querySelector('#view-history tbody tr')", "linha do histórico");
check("clicar na linha abre o painel de detalhes do run", await until("!document.getElementById('drawer').hidden && document.getElementById('drawer').textContent.includes('Arquivos de backup')", 8000), "");
const dtxt = await ev("document.getElementById('drawer').textContent");
check("detalhes mostram horários em Brasília e UTC", /-03:00/.test(dtxt) && /Z \(UTC\)/.test(dtxt), "");
check("detalhes mostram tamanhos, SHA-256 e recuperação", /confere com o recibo|DIVERGE/.test(dtxt) && /SHA-256/.test(dtxt) && /Descriptografia/.test(dtxt), "");
await shot("05-detalhes");
// copiar
const first = await ev("(()=>{const b=document.querySelector('#drawer button.cp'); return b? b.previousSibling.textContent : null})()");
await click("document.querySelector('#drawer button.cp')", "copiar (detalhes)");
const copied = await until("document.querySelector('#drawer button.cp').textContent==='copiado'", 3000);
check("botão copiar do detalhe muda para 'copiado'", copied, "");
let clip = null; try { clip = await ev("navigator.clipboard.readText()"); } catch (e) { clip = "ERRO: " + e.message.slice(0, 80); }
check("conteúdo copiado para a área de transferência é o valor mostrado", clip === first, `copiado=${String(clip).slice(0, 60)} esperado=${String(first).slice(0, 60)}`);
// fechar por botão e por teclado Enter na linha
await click("__t.btn('#drawer','✕')", "fechar detalhes");
check("botão Fechar esconde o painel de detalhes", await until("document.getElementById('drawer').hidden", 3000), "");
await ev("document.querySelector('#view-history tbody tr').focus()"); await key("Enter", "Enter", 13);
check("teclado: Enter em linha focada abre os detalhes", await until("!document.getElementById('drawer').hidden", 4000), "");
await click("__t.btn('#drawer','✕')", "fechar");

// depende de você / copiar login
await nav("todo", "Depende");
check("existe 'Verificar sessão AWS' (não clicado no modo real)", !!(await ev("!!__t.btn('#view-todo','Verificar sessão AWS')")) , "");
if (MODE === "real") check("modo real: nenhuma requisição POST/AWS foi disparada pela navegação", !(await ev("performance.getEntriesByType('resource').some(r=>/\\/api\\/(aws|upload)/.test(r.name))")), "");
await click("document.querySelector('#view-todo button.cp')", "copiar comando de login");
check("botão copiar do comando de login funciona", await until("document.querySelector('#view-todo button.cp').textContent==='copiado'", 3000), "");

// responsivo (emulação de celular 390 px)
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await nav("overview", "Visão geral"); await sleep(400);
const ovf = await ev("({sw:document.documentElement.scrollWidth, cw:document.documentElement.clientWidth})");
check("390 px: sem rolagem horizontal da página", ovf.sw <= ovf.cw + 1, JSON.stringify(ovf));
await shot("06-mobile-390");
await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

// ---------------- modo mock: controles de ação
if (MODE === "mock") {
  await nav("history", "Histórico"); await until("__t.rows()>0", 5000);
  await setSelect("Estado", "CAPTURED");
  await click("document.querySelector('#view-history tbody tr')", "linha CAPTURED");
  await until("!document.getElementById('drawer').hidden", 5000);
  const rid = await ev("document.querySelector('#drawer .filters b').textContent");
  check("run CAPTURED mostra o botão 'Enviar este run ao S3'", !!(await ev("!!__t.btn('#drawer','Enviar este run')")), rid);
  await click("__t.btn('#drawer','Enviar este run')", "Enviar este run");
  check("botão abre o diálogo de preparação do plano", await until("!document.getElementById('modal').hidden && document.getElementById('modal').textContent.includes('Preparar plano')", 4000), "");
  await click("__t.btn('#modal','Preparar plano')", "Preparar plano");
  check("preparar plano mostra objetos, chaves e hash do plano", await until("document.getElementById('modal').textContent.includes('Revise o plano de envio') && document.getElementById('modal').textContent.includes('Hash do plano')", 8000), "");
  await shot("07-plano");
  check("confirmar começa DESABILITADO", await ev("document.getElementById('go').disabled"), "");
  await typeInto("document.getElementById('ph')", "ENVIAR " + rid, "frase de confirmação");
  check("frase correta SEM sessão AWS válida mantém o botão desabilitado", await ev("document.getElementById('go').disabled"), "");
  await click("__t.btn('#modal','Verificar sessão AWS')", "Verificar sessão AWS (mock)");
  check("verificar sessão (mock) marca a sessão como válida", await until("document.getElementById('modal').textContent.includes('verificada recentemente e válida')", 8000), "");
  await typeInto("document.getElementById('ph')", "enviar " + rid, "frase errada");
  check("frase errada mantém o botão desabilitado", await ev("document.getElementById('go').disabled"), "");
  await typeInto("document.getElementById('ph')", "ENVIAR " + rid, "frase correta");
  check("frase correta + sessão válida habilita o botão", await until("!document.getElementById('go').disabled", 3000), "");
  // duplo clique rápido
  const c = await center("document.getElementById('go')");
  for (let k = 0; k < 2; k++) { await send("Input.dispatchMouseEvent", { type: "mousePressed", x: c.x, y: c.y, button: "left", clickCount: k + 1 }); await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: c.x, y: c.y, button: "left", clickCount: k + 1 }); }
  check("após confirmar abre o acompanhamento do upload", await until("document.getElementById('modal').textContent.includes('Acompanhamento do upload')", 8000), "");
  check("resultado final: VERIFICADO por download completo (mock)", await until("/VERIFICADO: \\d+\\/\\d+ objetos por download completo/.test(document.getElementById('modal').textContent)", 40000), (await ev("document.getElementById('modal').textContent")).slice(0, 200));
  await shot("08-job-concluido");
  await click("__t.btn('#modal','Fechar')", "fechar job");
  check("após o upload o run aparece como verificado", await until("document.getElementById('drawer').textContent.includes('verificado (')", 10000), "");
}

// console e rede
const bad = consoleMsgs.filter((m) => /error|exception|warn/.test(m.type) || m.type === "log:error");
check("sem erros/exceções no console do navegador", bad.length === 0, JSON.stringify(bad.slice(0, 4)));
check("sem requisições bloqueadas ou falhas de rede", netFails.length === 0, JSON.stringify(netFails.slice(0, 4)));
const bad4 = Object.entries(responses).filter(([u, s]) => s >= 400 && !u.endsWith("favicon.ico"));
check("sem respostas HTTP >= 400 (exceto favicon)", bad4.length === 0, JSON.stringify(bad4.slice(0, 4)));
fs.writeFileSync(OUT, JSON.stringify({ mode: MODE, base: BASE, at: new Date().toISOString(), results, console: consoleMsgs, netFails, responses }, null, 1));
const fail = results.filter((r) => !r.ok).length;
console.log(`RESULTADO ${MODE}: ${results.length - fail} OK, ${fail} FALHA`);
try { await fetch(`http://127.0.0.1:${CDP}/json/close/${tgt.id}`); } catch (e) { /* ignore */ }
ws.close(); process.exit(fail ? 1 : 0);
