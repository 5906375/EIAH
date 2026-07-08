import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const filePath = path.resolve(import.meta.dirname ?? __dirname, "../routes/imob.ts");
const source = fs.readFileSync(filePath, "utf8");

test("IMOB chat route reuses the CRM case listing capability for workspace_case_list", () => {
  assert.match(source, /businessReadIntent === "workspace_case_list"/);
  assert.match(source, /new ImobCrmRepository\(prisma\)\.listCases\(/);
  assert.match(source, /buildWorkspaceCaseListConsult\(/);
});
