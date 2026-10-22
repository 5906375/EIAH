import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * EIAH-FD-001 — Superfície Operacional Única. O Front Door (Chat Agent Launcher) é a única interface operacional; nenhuma vertical pode
 * exigir ou oferecer cockpit operacional paralelo. A verificação NÃO compara só URL: usa o grafo de importações do launcher, os
 * consumidores do launcher, as rotas registradas e os componentes de vertical, contra o registro versionado
 * `scripts/front-door-surface-register.json` (catraca: o legado conhecido fica registrado; qualquer violação NOVA falha).
 */
const CHECK = "check:front-door-single-surface";
const REASON_CODE = "FRONT_DOOR_SINGLE_SURFACE_VIOLATION";

/**
 * `legacy_redirected`: a rota ainda existe (a página segue no código), mas o elemento da rota passa por um wrapper que redireciona ao Front
 * Door sem montar nada (EIAH-FD-001: nenhuma URL pode acessar interface operacional independente). O gate exige o wrapper auto-fechado.
 */
export type SurfaceNature = "front_door" | "identity" | "technical_admin" | "legacy_operational" | "legacy_redirected" | "pending_classification";
export type RouteEntry = { path: string; nature: SurfaceNature; since: string; plan?: string; note?: string; wrapper?: string; redirectTo?: string };
export type SurfaceRegister = {
  version: string;
  ruleBaselineDate: string;
  launcherFile: string;
  launcherConsumers: string[];
  frontDoorPage: string;
  frontDoorPageAllowedImports: string[];
  verticalFeatureDirs: string[];
  routes: RouteEntry[];
  legacyOperationalComponents: string[];
  launcherLinksToLegacyRoutes: string[];
};
export type Violation = { code: string; file: string; detail?: string };

const SRC = "apps/web/src";
const isSource = (name: string) => /\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) && !name.endsWith(".d.ts");

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { if (entry.name !== "node_modules") walk(full, out); }
    else if (isSource(entry.name)) out.push(full);
  }
  return out;
}

const IMPORT = /(?:import|export)\s[^;]*?from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)|import\s+["']([^"']+)["']/gs;
function resolveImport(root: string, from: string, spec: string): string | null {
  const base = spec.startsWith("@/") ? path.join(root, SRC, spec.slice(2)) : spec.startsWith(".") ? path.normalize(path.join(path.dirname(from), spec)) : null;
  if (!base) return null;
  for (const suffix of ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    const candidate = base + suffix;
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return path.normalize(candidate);
  }
  return null;
}
function importsOf(root: string, file: string): string[] {
  const text = fs.readFileSync(file, "utf8");
  const out = new Set<string>();
  for (const match of text.matchAll(IMPORT)) {
    const resolved = resolveImport(root, file, match[1] ?? match[2] ?? match[3] ?? "");
    if (resolved) out.add(resolved);
  }
  return [...out];
}
function reachable(root: string, start: string): Set<string> {
  const seen = new Set<string>([start]); const stack = [start];
  while (stack.length) for (const dep of importsOf(root, stack.pop()!)) if (!seen.has(dep)) { seen.add(dep); stack.push(dep); }
  return seen;
}
const rel = (root: string, file: string) => path.relative(root, file).split(path.sep).join("/");

export function appRoutes(appSource: string): string[] {
  return [...appSource.matchAll(/<Route\s+path=\s*"([^"]+)"/g)].map((match) => match[1]!);
}

/** Avalia o repositório em `root` contra o registro. Puro quanto ao processo (só lê arquivos): testável com árvores sintéticas. */
export function evaluateFrontDoorSurface(root: string, register: SurfaceRegister): { violations: Violation[]; staleEntries: string[]; stats: Record<string, number> } {
  const violations: Violation[] = [];
  const staleEntries: string[] = [];
  const launcher = path.join(root, register.launcherFile);
  const sources = walk(path.join(root, SRC));
  const inside = fs.existsSync(launcher) ? reachable(root, launcher) : new Set<string>();
  if (!fs.existsSync(launcher)) violations.push({ code: "launcher_missing", file: register.launcherFile });

  // 1–2. Rotas: toda rota está registrada; entradas novas só podem ser front_door/identity/technical_admin (nunca operacionais paralelas).
  const appFile = path.join(root, SRC, "App.tsx");
  const routes = fs.existsSync(appFile) ? appRoutes(fs.readFileSync(appFile, "utf8")) : [];
  const registered = new Map(register.routes.map((entry) => [entry.path, entry]));
  for (const route of routes) {
    const entry = registered.get(route);
    if (!entry) { violations.push({ code: "route_not_registered", file: `${SRC}/App.tsx`, detail: route }); continue; }
  }
  for (const entry of register.routes) {
    const isNew = entry.since > register.ruleBaselineDate;
    if (isNew && (entry.nature === "legacy_operational" || entry.nature === "legacy_redirected" || entry.nature === "pending_classification")) violations.push({ code: "new_operational_route_forbidden", file: register.version, detail: `${entry.path} (${entry.nature})` });
    if (entry.nature === "legacy_operational" && !entry.plan) violations.push({ code: "legacy_route_without_integration_plan", file: register.version, detail: entry.path });
    if (!routes.includes(entry.path)) staleEntries.push(`route:${entry.path}`);
    if (entry.nature === "legacy_redirected") {
      if (!entry.wrapper || !entry.redirectTo) violations.push({ code: "legacy_redirect_incomplete_registration", file: register.version, detail: entry.path });
      else if (fs.existsSync(appFile) && routes.includes(entry.path)) {
        const source = fs.readFileSync(appFile, "utf8").replace(/^\s*\/\/.*$/gm, "");
        const start = source.indexOf(`path="${entry.path}"`);
        const next = source.indexOf("<Route", start + 1);
        const block = source.slice(start, next === -1 ? undefined : next);
        // A rota só pode ser o redirecionamento (auto-fechado, sem filhos): nenhuma casca, guarda ou página montada.
        if (!new RegExp(`element=\\{<${entry.wrapper}\\b[^>]*/>\\}`).test(block)) violations.push({ code: "legacy_redirect_not_wired", file: `${SRC}/App.tsx`, detail: entry.path });
        else if (/<(?:Layout|RequireAuth|Require\w+)\b|<\w+Page\b/.test(block)) violations.push({ code: "legacy_route_renders_page", file: `${SRC}/App.tsx`, detail: entry.path });
      }
    }
  }

  // 3. Launcher compartilhado: só os consumidores registrados importam o launcher; nenhum launcher/chat alternativo é declarado.
  for (const file of sources) {
    const relative = rel(root, file);
    if (file !== launcher && importsOf(root, file).includes(launcher) && !register.launcherConsumers.includes(relative)) violations.push({ code: "secondary_launcher_consumer", file: relative });
    if (file !== launcher && /Launcher/.test(path.basename(file)) && /\.tsx$/.test(file)) violations.push({ code: "alternative_launcher_file", file: relative });
    const text = fs.readFileSync(file, "utf8");
    if (file !== launcher && /export\s+(?:default\s+)?(?:function|const)\s+\w*(?:Chat|Conversation)\w*Launcher\w*/.test(text)) violations.push({ code: "alternative_launcher_declared", file: relative });
  }
  for (const consumer of register.launcherConsumers) {
    const full = path.join(root, consumer);
    if (!fs.existsSync(full) || !importsOf(root, full).includes(launcher)) staleEntries.push(`launcherConsumer:${consumer}`);
  }

  // 4. Componentes operacionais de vertical fora da árvore do launcher: só o legado registrado.
  const featureComponents = sources.filter((file) => file.endsWith(".tsx") && register.verticalFeatureDirs.some((dir) => rel(root, file).startsWith(`${SRC}/features/${dir}/`)));
  const baseline = new Set(register.legacyOperationalComponents);
  for (const file of featureComponents) {
    const relative = rel(root, file);
    if (!inside.has(file) && !baseline.has(relative)) violations.push({ code: "operational_component_outside_launcher", file: relative });
  }
  for (const entry of register.legacyOperationalComponents) {
    const full = path.join(root, entry);
    if (!fs.existsSync(full)) staleEntries.push(`component:${entry} (arquivo removido)`);
    else if (inside.has(full)) staleEntries.push(`component:${entry} (já está dentro do launcher: remover do registro)`);
  }

  // 5. Dentro da conversa não pode haver link/rota literal para rota operacional legada (navegação obrigatória fora do Front Door).
  const legacyPaths = register.routes.filter((entry) => entry.nature === "legacy_operational" || entry.nature === "legacy_redirected").map((entry) => entry.path);
  const knownLinks = new Set(register.launcherLinksToLegacyRoutes);
  const currentLinks = new Set<string>();
  for (const file of inside) {
    if (!isSource(path.basename(file))) continue;
    const text = fs.readFileSync(file, "utf8");
    for (const route of legacyPaths) {
      const literal = new RegExp(`["'\`]${route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:[?#/][^"'\`]*)?["'\`]`);
      if (literal.test(text)) {
        const key = `${rel(root, file)}|${route}`;
        currentLinks.add(key);
        if (!knownLinks.has(key)) violations.push({ code: "conversation_links_to_legacy_route", file: rel(root, file), detail: route });
      }
    }
  }
  for (const entry of knownLinks) if (!currentLinks.has(entry)) staleEntries.push(`link:${entry}`);

  // 6. A página do Front Door não compõe painel de vertical fora do launcher (só o fixture registrado).
  const page = path.join(root, register.frontDoorPage);
  if (fs.existsSync(page)) {
    for (const dep of importsOf(root, page)) {
      const relative = rel(root, dep);
      const verticalPanel = register.verticalFeatureDirs.some((dir) => relative.startsWith(`${SRC}/features/${dir}/`)) && relative.endsWith(".tsx");
      const chatPanel = /^apps\/web\/src\/components\/chat\/\w*Panel\.tsx$/.test(relative);
      if ((verticalPanel || chatPanel) && !register.frontDoorPageAllowedImports.includes(relative)) violations.push({ code: "front_door_page_composes_vertical_panel", file: register.frontDoorPage, detail: relative });
    }
  } else violations.push({ code: "front_door_page_missing", file: register.frontDoorPage });

  return { violations, staleEntries, stats: { routes: routes.length, sources: sources.length, insideLauncher: inside.size, legacyComponents: register.legacyOperationalComponents.length } };
}

/** Calcula o baseline atual (componentes de vertical fora do launcher e links do launcher a rotas legadas), para atualizar o registro com revisão. */
export function computeBaseline(root: string, register: SurfaceRegister) {
  const launcher = path.join(root, register.launcherFile);
  const inside = reachable(root, launcher);
  const components = walk(path.join(root, SRC)).filter((file) => file.endsWith(".tsx") && register.verticalFeatureDirs.some((dir) => rel(root, file).startsWith(`${SRC}/features/${dir}/`)) && !inside.has(file)).map((file) => rel(root, file)).sort();
  return { legacyOperationalComponents: components };
}

function main() {
  const root = process.cwd();
  const registerFile = path.join(root, "scripts/front-door-surface-register.json");
  if (!fs.existsSync(registerFile)) {
    console.error(JSON.stringify({ ok: false, check: CHECK, reasonCode: "FRONT_DOOR_SURFACE_REGISTER_MISSING", file: "scripts/front-door-surface-register.json" }, null, 2));
    process.exit(1);
  }
  const register = JSON.parse(fs.readFileSync(registerFile, "utf8")) as SurfaceRegister;
  if (process.argv.includes("--print-baseline")) { console.log(JSON.stringify(computeBaseline(root, register), null, 2)); return; }
  const result = evaluateFrontDoorSurface(root, register);
  if (result.violations.length) {
    console.error(JSON.stringify({ ok: false, check: CHECK, reasonCode: REASON_CODE, violations: result.violations, staleEntries: result.staleEntries }, null, 2));
    process.exit(1);
  }
  // Conformidade com a regra (mais estrita que "sem violação nova"): qualquer página operacional paralela, componente fora da conversa, link da
  // conversa para legado ou rota ainda não classificada impede declarar CONFORME, mesmo com todas as funções também no Front Door.
  const blockers = [
    ...register.routes.filter((r) => r.nature === "legacy_operational").map((r) => `rota operacional paralela: ${r.path}`),
    ...register.routes.filter((r) => r.nature === "pending_classification").map((r) => `rota sem classificação: ${r.path}`),
    ...register.legacyOperationalComponents.map((file) => `componente operacional fora da conversa: ${file}`),
    ...register.launcherLinksToLegacyRoutes.map((entry) => `link da conversa para rota legada: ${entry}`),
  ];
  console.log(JSON.stringify({ ok: true, check: CHECK, rule: "EIAH-FD-001", conformant: blockers.length === 0, conformanceBlockers: blockers.length, conformanceBlockerSummary: { operationalParallelRoutes: register.routes.filter((r) => r.nature === "legacy_operational").length, unclassifiedRoutes: register.routes.filter((r) => r.nature === "pending_classification").length, componentsOutsideConversation: register.legacyOperationalComponents.length, conversationLinksToLegacy: register.launcherLinksToLegacyRoutes.length }, registerVersion: register.version, ...result.stats, staleEntries: result.staleEntries, legacyOperationalRoutes: register.routes.filter((r) => r.nature === "legacy_operational").map((r) => r.path), legacyRedirectedRoutes: register.routes.filter((r) => r.nature === "legacy_redirected").map((r) => r.path), pendingClassificationRoutes: register.routes.filter((r) => r.nature === "pending_classification").map((r) => r.path) }, null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
