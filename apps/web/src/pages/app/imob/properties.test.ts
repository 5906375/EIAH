import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";

// Non-regression: properties.tsx must not use syntheticProperties
test("properties.tsx does not define syntheticProperties", () => {
  const filePath = path.resolve(import.meta.dirname ?? __dirname, "./properties.tsx");
  const source = fs.readFileSync(filePath, "utf8");
  assert.ok(
    !source.includes("syntheticProperties"),
    "properties.tsx must not use syntheticProperties — page must call apiListImobProperties",
  );
});

test("properties.tsx calls apiListImobProperties", () => {
  const filePath = path.resolve(import.meta.dirname ?? __dirname, "./properties.tsx");
  const source = fs.readFileSync(filePath, "utf8");
  assert.ok(
    source.includes("apiListImobProperties"),
    "properties.tsx must call apiListImobProperties to load real workspace data",
  );
});

test("properties.tsx imports ImobProperty from api", () => {
  const filePath = path.resolve(import.meta.dirname ?? __dirname, "./properties.tsx");
  const source = fs.readFileSync(filePath, "utf8");
  assert.ok(
    source.includes("ImobProperty"),
    "properties.tsx must import ImobProperty from @/lib/api",
  );
});

test("properties.tsx has source badge on KPI strip", () => {
  const filePath = path.resolve(import.meta.dirname ?? __dirname, "./properties.tsx");
  const source = fs.readFileSync(filePath, "utf8");
  assert.ok(
    source.includes("sem dados") || source.includes("backend"),
    "properties.tsx must show a source badge on the KPI strip to indicate data origin",
  );
});

test("properties.tsx does not use hardcoded imob-82912 synthetic id", () => {
  const filePath = path.resolve(import.meta.dirname ?? __dirname, "./properties.tsx");
  const source = fs.readFileSync(filePath, "utf8");
  assert.ok(
    !source.includes("imob-82912"),
    "properties.tsx must not reference synthetic property ids",
  );
});
