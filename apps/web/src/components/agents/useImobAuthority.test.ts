import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveImobHandoffVerdict } from "./useImobAuthority";

// AUTHZ-IMOB-HANDOFF-001 — o cliente só repassa o veredito do Core; sem veredito de IMOB não há autoridade.
const allowed = (id: string) => ({ presentationSnapshot: { verticalHandoff: { ok: true as const, handoff: { vertical: { id } } } as never } });
const blocked = (verticalId?: string) => ({ presentationSnapshot: { verticalHandoff: { ok: false as const, reasonCode: "VERTICAL_SCOPE_DENIED", ...(verticalId ? { verticalId } : {}) } } });

test("sem handoff nas mensagens não há veredito (null) — a barra do IMOB não é oferecida por suposição", () => {
  assert.equal(resolveImobHandoffVerdict([]), null);
  assert.equal(resolveImobHandoffVerdict([{ presentationSnapshot: null }, {}]), null);
});
test("o último veredito PARA o IMOB vale; o de outra vertical não o altera", () => {
  assert.equal(resolveImobHandoffVerdict([allowed("imob")]), true);
  assert.equal(resolveImobHandoffVerdict([blocked()]), false);
  assert.equal(resolveImobHandoffVerdict([allowed("imob"), blocked()]), false, "bloqueio posterior revoga a confiança");
  assert.equal(resolveImobHandoffVerdict([blocked(), allowed("imob")]), true);
  assert.equal(resolveImobHandoffVerdict([blocked(), allowed("log"), blocked("log")]), false, "Logística não conta");
  assert.equal(resolveImobHandoffVerdict([allowed("imob"), allowed("log")]), true);
  assert.equal(resolveImobHandoffVerdict([blocked("imob")]), false);
});
test("o hook consulta o handoff (somente leitura) e nunca decide autoridade sozinho; o launcher só consome o resultado", () => {
  const hook = readFileSync(new URL("./useImobAuthority.ts", import.meta.url), "utf8");
  assert.match(hook, /apiRequestChatVerticalHandoff/);
  assert.match(hook, /\.catch\(\(\) => \{ if \(!cancelled\) setVerdict\(\{ scope, allowed: false \}\)/, "erro de rede ⇒ sem autoridade");
  const launcher = readFileSync(new URL("./ChatAgentLauncher.tsx", import.meta.url), "utf8");
  assert.match(launcher, /const showImobSurface = isImobSurfaceAvailable\(session\) && imobAuthorityAllowed;/);
  assert.doesNotMatch(launcher, /apiRequestChatVerticalHandoff\(\{ verticalId: "imob"/, "sem lógica de autoridade no launcher");
});
