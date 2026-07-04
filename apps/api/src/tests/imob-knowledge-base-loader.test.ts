import "./support/testInfraEnv";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync, cpSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import assert from "node:assert/strict";
import {
  buildImobKnowledgeBaseShadowSnapshot,
  ImobKnowledgeBaseLoaderError,
  loadImobKnowledgeBase,
} from "../services/imob/imobKnowledgeBaseLoader";

const tempDirs: string[] = [];

function createTempRoot() {
  const dir = mkdtempSync(path.join(os.tmpdir(), "eiah-imob-kb-loader-"));
  tempDirs.push(dir);
  return dir;
}

function copyKnowledgeTree(tempRoot: string) {
  mkdirSync(path.join(tempRoot, "knowledge"), { recursive: true });
  cpSync(path.resolve("knowledge/imob"), path.join(tempRoot, "knowledge/imob"), { recursive: true });
}

after(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("loader carrega as 5 entries seed válidas", () => {
  const result = loadImobKnowledgeBase();

  assert.equal(result.manifest.kbId, "imob-knowledge-base");
  assert.equal(result.entries.length, 5);
  assert.deepEqual(
    result.entries.map((entry) => entry.id).sort(),
    [
      "imob.checklist.locacao-checklist.v1",
      "imob.glossary.termos-operacionais.v1",
      "imob.playbook.captacao-basics.v1",
      "imob.policy.atendimento-inicial.v1",
      "imob.template.briefing-visita.v1",
    ],
  );
});

test("loader preserva riskLevel, requiresHumanReview, allowedScopes e disallowedUses", () => {
  const result = loadImobKnowledgeBase();
  const entry = result.entries.find((item) => item.id === "imob.policy.atendimento-inicial.v1");

  assert.ok(entry);
  assert.equal(entry?.riskLevel, "high");
  assert.equal(entry?.requiresHumanReview, true);
  assert.deepEqual(entry?.allowedScopes, ["tenant", "workspace", "role_scoped"]);
  assert.deepEqual(entry?.disallowedUses, [
    "automatic_legal_opinion",
    "automatic_pricing_decision",
    "automatic_approval_decision",
  ]);
});

test("loader falha fechado se o manifesto estiver ausente ou inválido", () => {
  const missingRoot = createTempRoot();
  assert.throws(
    () => loadImobKnowledgeBase({ rootDir: missingRoot }),
    (error: unknown) =>
      error instanceof ImobKnowledgeBaseLoaderError && error.code === "MANIFEST_MISSING",
  );

  const invalidRoot = createTempRoot();
  copyKnowledgeTree(invalidRoot);
  writeFileSync(
    path.join(invalidRoot, "knowledge/imob/manifest.v1.json"),
    JSON.stringify({ kbId: "imob-knowledge-base", schemaVersion: "broken" }, null, 2),
    "utf8",
  );

  assert.throws(
    () => loadImobKnowledgeBase({ rootDir: invalidRoot }),
    (error: unknown) =>
      error instanceof ImobKnowledgeBaseLoaderError && error.code === "INVALID_MANIFEST_SCHEMA_VERSION",
  );
});

test("loader falha fechado se uma entry listada não existir", () => {
  const tempRoot = createTempRoot();
  copyKnowledgeTree(tempRoot);
  unlinkSync(path.join(tempRoot, "knowledge/imob/categories/templates/briefing-visita.v1.json"));

  assert.throws(
    () => loadImobKnowledgeBase({ rootDir: tempRoot }),
    (error: unknown) =>
      error instanceof ImobKnowledgeBaseLoaderError && error.code === "ENTRY_FILE_MISSING",
  );
});

test("shadow mode retorna resultado auditável sem alterar resposta final", () => {
  const result = loadImobKnowledgeBase();
  const snapshot = buildImobKnowledgeBaseShadowSnapshot(result);

  assert.equal(snapshot.shadowMode, true);
  assert.equal(snapshot.source, "imob_kb_manifest_v1");
  assert.equal(snapshot.entryCount, 5);
  assert.equal(Array.isArray(snapshot.entries), true);
  assert.equal(typeof snapshot.audit.manifestPath, "string");
  assert.equal("userFacingResponse" in (snapshot as Record<string, unknown>), false);
});

test("loader não importa nem referencia ChatAgentLauncher", () => {
  const file = readFileSync(
    path.resolve("apps/api/src/services/imob/imobKnowledgeBaseLoader.ts"),
    "utf8",
  );

  assert.equal(file.includes("ChatAgentLauncher"), false);
  assert.equal(file.includes("apps/web"), false);
});
