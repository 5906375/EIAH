import assert from "node:assert/strict";
import test from "node:test";

import {
  classifySchemaDiff,
  evaluateSchemaDiff,
} from "../checkNeonPreviewSchemaCompatibility.js";

test("classifies empty and additive schema diffs as compatible", () => {
  assert.equal(classifySchemaDiff("-- no schema changes").classification, "compatible");
  assert.equal(
    classifySchemaDiff(`
      CREATE TABLE "PreviewAudit" ("id" TEXT PRIMARY KEY);
      ALTER TABLE "PreviewAudit" ADD COLUMN "note" TEXT;
      CREATE INDEX "PreviewAudit_note_idx" ON "PreviewAudit"("note");
    `).classification,
    "compatible",
  );
});

test("blocks destructive schema diffs without approval", () => {
  const result = evaluateSchemaDiff(
    'ALTER TABLE "ToolContract" DROP COLUMN "version";',
    false,
  );

  assert.equal(result.ok, false);
  assert.equal(result.classification, "incompatible");
  assert.deepEqual(result.incompatibleRules, ["drop_column"]);
  assert.equal(
    result.blockingCondition,
    "schema_diff_incompatible_without_human_approval",
  );
});

test("fails closed for schema statements that are not classified", () => {
  const result = evaluateSchemaDiff(
    'ALTER TABLE "ToolContract" ADD CONSTRAINT "tool_name" UNIQUE ("name");',
    false,
  );

  assert.equal(result.ok, false);
  assert.equal(result.classification, "indeterminate");
  assert.equal(result.indeterminateStatements, 1);
  assert.equal(
    result.blockingCondition,
    "schema_diff_indeterminate_without_human_approval",
  );
});

test("requires approval for new uniqueness constraints", () => {
  const result = evaluateSchemaDiff(
    'CREATE UNIQUE INDEX "ToolContract_name_key" ON "ToolContract"("name");',
    false,
  );

  assert.equal(result.ok, false);
  assert.equal(result.classification, "indeterminate");
});

test("allows an explicit human approval for incompatible or indeterminate diffs", () => {
  const result = evaluateSchemaDiff('DROP TABLE "LegacyTool";', true);

  assert.equal(result.ok, true);
  assert.equal(result.classification, "incompatible");
  assert.equal(result.approved, true);
  assert.equal(result.blockingCondition, null);
});
