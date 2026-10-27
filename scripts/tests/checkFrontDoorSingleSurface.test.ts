import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { evaluateFrontDoorSurface, type SurfaceRegister } from "../checkFrontDoorSingleSurface";

// EIAH-FD-001: o gate detecta violações de COMPOSIÇÃO (grafo de importação, consumidores do launcher, rotas, links), não só URL.
const SRC = "apps/web/src";
function tree(files: Record<string, string>) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fd001-"));
  for (const [file, text] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); fs.writeFileSync(path.join(root, file), text); }
  return root;
}
const base = (): Record<string, string> => ({
  [`${SRC}/App.tsx`]: `<Route path="/app/chat" element={<A/>} />\n<Route path="/app/imob/chat" element={<B/>} />`,
  [`${SRC}/components/agents/ChatAgentLauncher.tsx`]: `import { Panel } from "@/features/logistica/Panel";\nexport default function ChatAgentLauncher() { return <Panel/>; }`,
  [`${SRC}/features/logistica/Panel.tsx`]: `export function Panel() { return <div/>; }`,
  [`${SRC}/pages/app/agents/index.tsx`]: `import ChatAgentLauncher from "../../../components/agents/ChatAgentLauncher";\nexport default function Page() { return <ChatAgentLauncher/>; }`,
});
const register = (over: Partial<SurfaceRegister> = {}): SurfaceRegister => ({
  version: "t", ruleBaselineDate: "2026-10-21", launcherFile: `${SRC}/components/agents/ChatAgentLauncher.tsx`,
  launcherConsumers: [`${SRC}/pages/app/agents/index.tsx`], frontDoorPage: `${SRC}/pages/app/agents/index.tsx`, frontDoorPageAllowedImports: [],
  verticalFeatureDirs: ["imob", "logistica", "legal"],
  routes: [{ path: "/app/chat", nature: "front_door", since: "2026-10-21" }, { path: "/app/imob/chat", nature: "legacy_operational", since: "2026-10-21", plan: "integrar" }],
  legacyOperationalComponents: [], launcherLinksToLegacyRoutes: [], ...over,
});
const codes = (root: string, reg = register()) => evaluateFrontDoorSurface(root, reg).violations.map((v) => `${v.code}:${v.detail ?? v.file}`);

test("conforme: launcher compartilhado, componentes de vertical dentro da árvore do launcher, rotas registradas", () => {
  assert.deepEqual(codes(tree(base())), []);
});
test("rota nova não registrada (ex.: cockpit paralelo de uma vertical nova) é violação", () => {
  const files = base(); files[`${SRC}/App.tsx`] += `\n<Route path="/app/legal/cockpit" element={<C/>} />`;
  assert.deepEqual(codes(tree(files)), ["route_not_registered:/app/legal/cockpit"]);
});
test("rota operacional/pendente registrada DEPOIS da data-base é proibida; legado sem plano de integração também", () => {
  const root = tree(base());
  const late = register({ routes: [...register().routes, { path: "/app/radar/painel", nature: "legacy_operational", since: "2026-11-01", plan: "x" }] });
  assert.ok(codes(root, late).some((c) => c.startsWith("new_operational_route_forbidden:/app/radar/painel")));
  const noPlan = register({ routes: [{ path: "/app/chat", nature: "front_door", since: "2026-10-21" }, { path: "/app/imob/chat", nature: "legacy_operational", since: "2026-10-21" }] });
  assert.ok(codes(root, noPlan).some((c) => c.startsWith("legacy_route_without_integration_plan")));
});
test("segundo consumidor do launcher (página de vertical com chat secundário) e launcher alternativo são violações", () => {
  const files = base();
  files[`${SRC}/pages/app/legal/chat.tsx`] = `import L from "@/components/agents/ChatAgentLauncher";\nexport default function P() { return <L/>; }`;
  files[`${SRC}/components/agents/LegalChatLauncher.tsx`] = `export default function LegalChatLauncher() { return <div/>; }`;
  const found = codes(tree(files));
  assert.ok(found.includes(`secondary_launcher_consumer:${SRC}/pages/app/legal/chat.tsx`));
  assert.ok(found.includes(`alternative_launcher_file:${SRC}/components/agents/LegalChatLauncher.tsx`));
  assert.ok(found.includes(`alternative_launcher_declared:${SRC}/components/agents/LegalChatLauncher.tsx`));
});
test("componente operacional de vertical FORA da árvore do launcher é violação; no registro de legado é tolerado", () => {
  const files = base(); files[`${SRC}/features/legal/LegalCockpit.tsx`] = `export function LegalCockpit() { return <div/>; }`;
  const root = tree(files);
  assert.deepEqual(codes(root), [`operational_component_outside_launcher:${SRC}/features/legal/LegalCockpit.tsx`]);
  assert.deepEqual(codes(root, register({ legacyOperationalComponents: [`${SRC}/features/legal/LegalCockpit.tsx`] })), []);
});
test("a conversa não pode linkar para rota operacional legada; a página do Front Door não compõe painel de vertical", () => {
  const files = base();
  files[`${SRC}/components/agents/ChatAgentLauncher.tsx`] += `\nexport const href = "/app/imob/chat?x=1";`;
  files[`${SRC}/features/legal/Panel.tsx`] = `export function Panel() { return <div/>; }`;
  files[`${SRC}/pages/app/agents/index.tsx`] += `\nimport { Panel as LegalPanel } from "@/features/legal/Panel";`;
  const found = codes(tree(files), register({ legacyOperationalComponents: [`${SRC}/features/legal/Panel.tsx`] }));
  assert.ok(found.includes(`conversation_links_to_legacy_route:/app/imob/chat`));
  assert.ok(found.includes(`front_door_page_composes_vertical_panel:${SRC}/features/legal/Panel.tsx`));
});
test("entradas obsoletas do registro são reportadas (sem falhar) para o legado poder ser retirado com evidência", () => {
  const result = evaluateFrontDoorSurface(tree(base()), register({ routes: [...register().routes, { path: "/app/removida", nature: "front_door", since: "2026-10-21" }], legacyOperationalComponents: [`${SRC}/features/logistica/Panel.tsx`] }));
  assert.deepEqual(result.violations, []);
  assert.ok(result.staleEntries.some((entry) => entry.startsWith("route:/app/removida")));
  assert.ok(result.staleEntries.some((entry) => /já está dentro do launcher/.test(entry)));
});
test("repositório real: o registro cobre todas as rotas e o legado conhecido; nenhuma violação nova", () => {
  const registerFile = JSON.parse(fs.readFileSync("scripts/front-door-surface-register.json", "utf8")) as SurfaceRegister;
  const result = evaluateFrontDoorSurface(process.cwd(), registerFile);
  assert.deepEqual(result.violations, []);
  assert.deepEqual(registerFile.routes.filter((r) => r.nature === "technical_admin").length, 0, "sem rotas de administração técnica hoje: nada operacional é classificado como tal");
});

test("rota legada redirecionada: exige o wrapper como elemento mais externo; sem ele (ou com página antes dele) é violação", () => {
  const redirected = (wrapper = "LegacyRoute") => register({ routes: [{ path: "/app/chat", nature: "front_door", since: "2026-10-21" }, { path: "/app/imob/chat", nature: "legacy_redirected", since: "2026-10-21", wrapper, redirectTo: "/app/chat", }] });
  const wired = base(); wired[`${SRC}/App.tsx`] = `<Route path="/app/chat" element={<A/>} />\n<Route path="/app/imob/chat" element={<LegacyRoute entry="x" />} />`;
  assert.deepEqual(codes(tree(wired), redirected()), []);
  const unwired = base(); unwired[`${SRC}/App.tsx`] = `<Route path="/app/chat" element={<A/>} />\n<Route path="/app/imob/chat" element={<Layout><ChatPage/></Layout>} />`;
  assert.ok(codes(tree(unwired), redirected()).some((c) => c.startsWith("legacy_redirect_not_wired:/app/imob/chat")));
  const inner = base(); inner[`${SRC}/App.tsx`] = `<Route path="/app/chat" element={<A/>} />\n<Route path="/app/imob/chat" element={<Layout><LegacyRoute entry="x" /></Layout>} />`;
  assert.ok(codes(tree(inner), redirected()).some((c) => c.startsWith("legacy_redirect_not_wired")), "casca antes do wrapper monta interface antes do redirecionamento");
  const children = base(); children[`${SRC}/App.tsx`] = `<Route path="/app/chat" element={<A/>} />\n<Route path="/app/imob/chat" element={<LegacyRoute entry="x"><ChatPage/></LegacyRoute>} />`;
  assert.ok(codes(tree(children), redirected()).some((c) => c.startsWith("legacy_redirect_not_wired")), "wrapper com página dentro não é só redirecionamento");
  const incomplete = register({ routes: [{ path: "/app/chat", nature: "front_door", since: "2026-10-21" }, { path: "/app/imob/chat", nature: "legacy_redirected", since: "2026-10-21" }] });
  assert.ok(codes(tree(wired), incomplete).some((c) => c.startsWith("legacy_redirect_incomplete_registration")));
  const late = register({ routes: [...register().routes, { path: "/app/novo", nature: "legacy_redirected", since: "2026-11-01", wrapper: "W", redirectTo: "/x" }] });
  assert.ok(codes(tree(wired), late).some((c) => c.startsWith("new_operational_route_forbidden:/app/novo")), "legado novo é proibido mesmo redirecionado");
});
