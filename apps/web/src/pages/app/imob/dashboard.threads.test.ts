import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";

const filePath = path.resolve(import.meta.dirname ?? __dirname, "./dashboard.tsx");
const source = fs.readFileSync(filePath, "utf8");

test("dashboard.tsx does not define syntheticThreads", () => {
  assert.ok(
    !source.includes("syntheticThreads"),
    "dashboard.tsx must not define syntheticThreads — synthetic thread data is not allowed in operational context",
  );
});

test("dashboard.tsx does not use synthetic thread IDs", () => {
  const syntheticIds = ["th-captacao", "th-contrato", "th-comissao"];
  for (const id of syntheticIds) {
    assert.ok(
      !source.includes(id),
      `dashboard.tsx must not reference synthetic thread id '${id}'`,
    );
  }
});

test("dashboard.tsx threadSource type does not include 'synthetic'", () => {
  assert.ok(
    !source.includes('"synthetic"'),
    "threadSource must not use the value 'synthetic' — use 'no_conversation' | 'empty' | 'error' | 'real'",
  );
});

test("dashboard.tsx selectedThreadId initializes to null (not requestedThreadId)", () => {
  assert.ok(
    source.includes("useState<string | null>(null)"),
    "selectedThreadId must initialize to null — URL param is only honored after real thread validation",
  );
});

test("dashboard.tsx threads state initializes to empty array", () => {
  assert.ok(
    source.includes("useState<ImobChatThread[]>([])"),
    "threads must initialize to [] — no synthetic data in initial state",
  );
});

test("dashboard.tsx does not blindly sync requestedThreadId to selectedThreadId", () => {
  assert.ok(
    !source.includes("setSelectedThreadId(requestedThreadId);\n  }, [requestedThreadId])"),
    "blind sync useEffect (setSelectedThreadId(requestedThreadId) on [requestedThreadId]) must not exist",
  );
});

test("dashboard.tsx honors requestedThreadId only when confirmed in real threads", () => {
  assert.ok(
    source.includes("confirmed ? requestedThreadId : null"),
    "requestedThreadId must only become selectedThreadId when found in real API response",
  );
});

test("dashboard.tsx uses no_conversation empty state (not synthetic fallback) when conversationId is absent", () => {
  assert.ok(
    source.includes('"no_conversation"'),
    "when conversationId is absent, threadSource must be 'no_conversation', not 'synthetic'",
  );
});

test("dashboard.tsx shows semantic empty state messages in ThreadPanel section", () => {
  assert.ok(
    source.includes("Abra uma conversa no chat para ver os threads desta jornada."),
    "must show explicit message when no conversation is active",
  );
});
