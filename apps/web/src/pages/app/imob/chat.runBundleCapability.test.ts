import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const filePath = path.resolve(import.meta.dirname ?? __dirname, "./chat.tsx");
const source = fs.readFileSync(filePath, "utf8");

test("chat.tsx gates run bundle CTA by canViewRunBundle capability", () => {
  assert.match(source, /artifactCapabilities\.canViewRunBundle\.allowed/);
});

test("chat.tsx does not call runBundlePath a case dossier in the CTA", () => {
  assert.match(source, /Ver bundle da execução/);
  assert.doesNotMatch(source, /label:\s*"Ver dossiê"/);
});
