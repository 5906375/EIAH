import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { PRE_DUIMP_FRONT_DOOR_HREF } from "@/components/agents/logisticaCaseContextEngine";

// FD-CHAT-ONLY-001 (evidência estrutural): a jornada operacional da Logística não tem link para o cockpit nem painel fora do launcher.
const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const files = (dir: string, accept: RegExp) => readdirSync(new URL(dir, import.meta.url)).filter((name) => accept.test(name) && !/\.test\./.test(name)).map((name) => ({ name, text: read(`${dir}${name}`) }));
const strip = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("componentes e engines da jornada (features/logistica + components/agents): nenhuma rota/rótulo de cockpit", () => {
  const scanned = [...files("./", /\.(ts|tsx)$/), ...files("../../components/agents/", /\.(ts|tsx)$/)].filter(({ name }) => name !== "legacyCockpitRedirect.ts" && name !== "preDuimp.ts");
  assert.ok(scanned.length > 20);
  for (const { name, text } of scanned) {
    const code = strip(text);
    assert.doesNotMatch(code, /\/app\/logistica/, `${name}: rota do cockpit`);
    assert.doesNotMatch(code, /[Cc]ockpit/, `${name}: menção operacional a cockpit`);
  }
});

test("a página do Front Door não compõe painéis de Logística fora do launcher", () => {
  const page = strip(read("../../pages/app/agents/index.tsx"));
  assert.doesNotMatch(page, /Logistica(FrontDoorContext|PendingDecisions|Conversation)/);
  assert.doesNotMatch(page, /OraculoPreparationPanel|OraculoHumanDecisionPanel/);
});

test("a jornada operacional é renderizada pelo launcher (mensagens), que expõe a superfície conversacional", () => {
  const launcher = read("../../components/agents/ChatAgentLauncher.tsx");
  assert.match(launcher, /data-testid="launcher-conversation-surface"/);
  assert.match(launcher, /<LogisticaConversationJourney/); assert.match(launcher, /<LogisticaPendingDecisionsPanel/);
});

test("os menus de Logística e de Pré-DUIMP levam ao Front Door; as rotas legadas passam pelo redirecionamento antes de montar a página", () => {
  const app = read("../../App.tsx");
  assert.match(app, /\{ to: "\/app\/chat\?domain=logistica", label: "Logística & Comex" \}/);
  assert.match(app, /\{ to: "\/app\/chat\?entry=pre_duimp", label: "Pré-DUIMP", requiresPreDuimp: true \}/);
  assert.equal(PRE_DUIMP_FRONT_DOOR_HREF, "/app/chat?entry=pre_duimp", "o literal do menu é a constante da entrada");
  assert.doesNotMatch(app.slice(app.indexOf("SHELL_NAV_ITEMS"), app.indexOf("SHELL_NAV_ITEMS") + 900).replace(/\/\/.*$/gm, ""), /to: "\/app\/logistica/, "nenhum item de menu aponta a rota legada");
  const routes = app.replace(/\/\/.*$/gm, "");
  for (const [path, entry] of [["/app/logistica", "cockpit"], ["/app/logistica/pre-duimp", "pre_duimp"], ["/app/logistica/*", "cockpit"]] as const) {
    const at = routes.indexOf(`path="${path}"`);
    assert.ok(at >= 0, `${path}: rota registrada só para redirecionar`);
    const block = routes.slice(at, routes.indexOf("<Route", at + 1) === -1 ? undefined : routes.indexOf("<Route", at + 1));
    assert.match(block, new RegExp(`element=\\{<LegacyLogisticaRoute entry="${entry}" />\\}`), `${path}: o elemento é só o redirecionamento`);
    assert.doesNotMatch(block, /Layout|RequireAuth|Page\b/, `${path}: nenhuma casca/página montada`);
  }
});
