import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

// Regressão de ImobLeadContinuityScoped: o motor de turno do IMOB (usado por testes puros, sem banco e sem builds) não pode
// carregar @repo/db (cliente Prisma gerado) nem módulos que o importam. Em CI limpo o pacote gerado não existe e o import
// falha com ERR_MODULE_NOT_FOUND; aqui o mesmo ambiente é reproduzido de forma determinística tornando @repo/db inalcançável.
const BLOCK_DB_HOOK = `export async function resolve(specifier, context, nextResolve) {
  if (specifier === "@repo/db" || specifier.startsWith("@repo/db/")) throw new Error("DB_IMPORT_BLOCKED:" + specifier);
  return nextResolve(specifier, context);
}`;
const REGISTER = `import { register } from "node:module"; register("data:text/javascript," + encodeURIComponent(${JSON.stringify(BLOCK_DB_HOOK)}));`;

function importWithoutDb(modulePath: string) {
  return spawnSync(
    process.execPath,
    ["--import", "tsx", "--import", `data:text/javascript,${encodeURIComponent(REGISTER)}`, "-e", `import(${JSON.stringify(modulePath)}).then(() => console.log("IMPORT_OK"), (e) => { console.error(String(e && e.message || e)); process.exit(1); });`],
    { encoding: "utf8", timeout: 60_000, env: { ...process.env, TSX_TSCONFIG_PATH: process.env.TSX_TSCONFIG_PATH ?? "tsconfig.base.json" }, cwd: process.cwd() },
  );
}

test("controle: o bloqueio de @repo/db é efetivo (o módulo que o importa de fato falha)", () => {
  const result = importWithoutDb("./apps/api/src/services/agents.ts");
  assert.notEqual(result.status, 0);
  assert.match(`${result.stderr}${result.stdout}`, /DB_IMPORT_BLOCKED:@repo\/db/);
});

test("motor de turno do IMOB e vocabulário de capacidades carregam sem @repo/db", () => {
  for (const modulePath of ["./apps/api/src/services/imob/imobTransversalTurn.ts", "./apps/api/src/services/imob/crm/imobCrmTurnEngine.ts", "./apps/api/src/services/agentCapabilityVocabulary.ts"]) {
    const result = importWithoutDb(modulePath);
    assert.equal(result.status, 0, `${modulePath}: ${result.stderr.slice(0, 300)}`);
    assert.match(result.stdout, /IMPORT_OK/);
  }
});
