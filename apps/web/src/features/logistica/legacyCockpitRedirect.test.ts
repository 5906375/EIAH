import test from "node:test";
import assert from "node:assert/strict";
import * as redirectModule from "./legacyCockpitRedirect";
import { resolveLogisticaLegacyRedirect } from "./legacyCockpitRedirect";

// EIAH-FD-001: as URLs legadas sempre redirecionam ao Front Door; nada além do ?case= válido é preservado.
const CASE = "cm0synthetic0case01";
test("cockpit → conversa de Logística, preservando só um ?case= válido", () => {
  assert.equal(resolveLogisticaLegacyRedirect({ search: "", entry: "cockpit" }), "/app/chat?domain=logistica");
  assert.equal(resolveLogisticaLegacyRedirect({ search: `?case=${CASE}`, entry: "cockpit" }), `/app/chat?domain=logistica&case=${CASE}`);
  for (const search of ["?case=../x", "?case=a%20b", `?case=${CASE}&domain=imob&scope=log.admin&token=abc&entry=pre_duimp`, "?scope=log.context.read", "?x=1#frag"]) {
    const target = resolveLogisticaLegacyRedirect({ search, entry: "cockpit" });
    assert.match(target, /^\/app\/chat\?domain=logistica(&case=cm0synthetic0case01)?$/, search);
    assert.doesNotMatch(target, /scope|token|imob|entry|abc/);
  }
});
test("Pré-DUIMP → entrada Pré-DUIMP da conversa; nenhum parâmetro da URL legada é copiado", () => {
  for (const search of ["", `?case=${CASE}`, "?token=abc&scope=log.duimp_context.create&mode=live"]) {
    assert.equal(resolveLogisticaLegacyRedirect({ search, entry: "pre_duimp" }), "/app/chat?entry=pre_duimp", search);
  }
});
test("a única exportação em tempo de execução é a resolução do destino: não há flag que mantenha a página legada", () => {
  assert.deepEqual(Object.keys(redirectModule), ["resolveLogisticaLegacyRedirect"]);
});
