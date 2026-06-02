import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  intentLibraryV1,
  resolveEiahTutorContractResponse,
  resolveEiahTutorInputPlaceholder,
  resolveEiahTutorRouteQuickReplies,
  resolveEiahTutorQuickReplyHints,
} from "./eiahTutorContracts.ts";

const SNAPSHOT_PATH = resolve(
  "apps/web/src/components/agents/__snapshots__/eiahTutorContracts.baseline.v1.json"
);

type BaselineCase = {
  caseId: string;
  input: string;
  accessContext: {
    tenantId?: string;
    workspaceId?: string;
  } | null;
  resolved: {
    intentId: string;
    content: string;
    quickReplies: string[];
  } | null;
};

function buildCase(params: {
  caseId: string;
  input: string;
  accessContext?: { tenantId?: string; workspaceId?: string } | null;
}): BaselineCase {
  const resolved = resolveEiahTutorContractResponse({
    input: params.input,
    accessContext: params.accessContext ?? null,
  });

  return {
    caseId: params.caseId,
    input: params.input,
    accessContext: params.accessContext ?? null,
    resolved: resolved
      ? {
          intentId: resolved.intentId,
          content: resolved.content,
          quickReplies: resolved.quickReplies,
        }
      : null,
  };
}

function buildTutorBaselineSnapshot() {
  const canonicalIntentCases = intentLibraryV1.map((entry) => {
    const input = entry.examples[0] ?? entry.aliases?.[0] ?? entry.intentId;
    return buildCase({
      caseId: `intent:${entry.intentId}`,
      input,
      accessContext: {
        tenantId: "tenant-A",
        workspaceId: "workspace-A",
      },
    });
  });

  const specialCases = [
    buildCase({
      caseId: "special:agents_empty_state:missing_workspace_context",
      input: "não aparece agente",
      accessContext: null,
    }),
    buildCase({
      caseId: "special:pasted_context_overview",
      input: "Runs: executar, simular e acompanhar tarefas ?",
      accessContext: {
        tenantId: "tenant-A",
        workspaceId: "workspace-A",
      },
    }),
    buildCase({
      caseId: "special:unknown_input_uses_canonical_fallback",
      input: "zzzz qqqq nao relacionado",
      accessContext: {
        tenantId: "tenant-A",
        workspaceId: "workspace-A",
      },
    }),
  ];

  return {
    snapshotVersion: "1",
    source: "resolveEiahTutorContractResponse",
    cases: [...canonicalIntentCases, ...specialCases].sort((a, b) => a.caseId.localeCompare(b.caseId)),
  };
}

function matchesCatalogIntent(entry: (typeof intentLibraryV1)[number], resolvedIntentId: string | undefined) {
  if (!resolvedIntentId) return false;
  return (
    resolvedIntentId === entry.intentId ||
    resolvedIntentId === entry.mapsToKnowledgeId.replace(/\./g, "_")
  );
}

test("eiah tutor baseline snapshot stays stable per intent", () => {
  const snapshot = buildTutorBaselineSnapshot();

  if (process.env.UPDATE_TUTOR_BASELINE === "1") {
    writeFileSync(SNAPSHOT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  }

  const expected = JSON.parse(readFileSync(SNAPSHOT_PATH, "utf8"));
  assert.deepEqual(snapshot, expected);
});

test("each catalog intent has at least one self-resolving term", () => {
  for (const entry of intentLibraryV1) {
    const terms = [...entry.examples, ...(entry.aliases ?? [])];
    const hasSelfMatch = terms.some((term) => {
      const resolved = resolveEiahTutorContractResponse({
        input: term,
        accessContext: {
          tenantId: "tenant-A",
          workspaceId: "workspace-A",
        },
      });
      return matchesCatalogIntent(entry, resolved?.intentId);
    });
    assert.equal(hasSelfMatch, true, `expected at least one self-matching term for ${entry.intentId}`);
  }
});

test("ambiguous inputs keep expected routing", () => {
  const cases: Array<{ input: string; expectedIntentId: string }> = [
    { input: "chat", expectedIntentId: "policy_clarify" },
    { input: "agentes", expectedIntentId: "agents_page_overview" },
    { input: "como funciona", expectedIntentId: "policy_clarify" },
    { input: "billing", expectedIntentId: "billing_overview" },
    { input: "quero criar run", expectedIntentId: "run_create_help" },
  ];

  for (const entry of cases) {
    const resolved = resolveEiahTutorContractResponse({
      input: entry.input,
      accessContext: {
        tenantId: "tenant-A",
        workspaceId: "workspace-A",
      },
    });

    assert.ok(resolved, `expected non-null response for input ${entry.input}`);
    assert.equal(resolved?.intentId, entry.expectedIntentId);
  }
});

test("unknown input falls back to canonical platform overview", () => {
  const resolved = resolveEiahTutorContractResponse({
    input: "zzzz qqqq nao relacionado",
    accessContext: {
      tenantId: "tenant-A",
      workspaceId: "workspace-A",
    },
  });

  assert.ok(resolved, "expected non-null fallback response");
  assert.equal(resolved?.intentId, "platform_overview_fallback");
  assert.match(resolved?.content ?? "", /Como a plataforma EIAH se organiza/i);
});

test("policy branch: blocked when workspace context is missing", () => {
  const resolved = resolveEiahTutorContractResponse({
    input: "não aparece agente",
    accessContext: null,
  });

  assert.ok(resolved);
  assert.equal(resolved?.intentId, "policy_blocked_missing_workspace_context");
});

test("policy branch: clarify on short ambiguous input", () => {
  const resolved = resolveEiahTutorContractResponse({
    input: "como",
    accessContext: {
      tenantId: "tenant-A",
      workspaceId: "workspace-A",
      installedProducts: ["IMOB"],
      entitlements: {
        IMOB_INSTALLED: true,
        REAL_ESTATE_CORE: true,
      },
    },
  });

  assert.ok(resolved);
  assert.equal(resolved?.intentId, "policy_clarify");
});

test("policy branch: handoff on deep vertical need", () => {
  const resolved = resolveEiahTutorContractResponse({
    input: "quero ajuda imob",
    accessContext: {
      tenantId: "tenant-A",
      workspaceId: "workspace-A",
      installedProducts: ["IMOB"],
      entitlements: {
        IMOB_INSTALLED: true,
        REAL_ESTATE_CORE: true,
      },
    },
  });

  assert.ok(resolved);
  assert.equal(resolved?.intentId, "policy_handoff");
});

test("policy branch: blocked when entitlement is missing", () => {
  const resolved = resolveEiahTutorContractResponse({
    input: "quero ajuda imob",
    accessContext: {
      tenantId: "tenant-A",
      workspaceId: "workspace-A",
      installedProducts: [],
      entitlements: {
        IMOB_INSTALLED: false,
        REAL_ESTATE_CORE: false,
      },
    },
  });

  assert.ok(resolved);
  assert.equal(resolved?.intentId, "policy_blocked_missing_entitlement");
});

test("depth-aware intents work for non-recipe known topics", () => {
  const simple = resolveEiahTutorContractResponse({
    input: "explicacao simples billing",
    accessContext: {
      tenantId: "tenant-A",
      workspaceId: "workspace-A",
    },
  });
  const operational = resolveEiahTutorContractResponse({
    input: "explicacao operacional runs",
    accessContext: {
      tenantId: "tenant-A",
      workspaceId: "workspace-A",
    },
  });
  const governance = resolveEiahTutorContractResponse({
    input: "explicacao de governanca self-service",
    accessContext: {
      tenantId: "tenant-A",
      workspaceId: "workspace-A",
    },
  });

  assert.equal(simple?.intentId, "billing_overview_simple");
  assert.match(simple?.content ?? "", /explica..o simples/i);

  assert.equal(operational?.intentId, "run_create_help_operational");
  assert.match(operational?.content ?? "", /explica..o operacional/i);

  assert.equal(governance?.intentId, "self_service_overview_governance");
  assert.match(governance?.content ?? "", /governan/i);
});

test("thematic quick reply hints are owned by the tutor contract", () => {
  assert.deepEqual(resolveEiahTutorQuickReplyHints("explica billing do workspace"), [
    "Como funciona o billing?",
    "Como ler plano, uso e fatura",
    "Como reduzir custo no workspace",
  ]);

  assert.deepEqual(resolveEiahTutorQuickReplyHints("quero entender catalogo interno homologado"), [
    "Explicação simples tenant recipes",
    "Explicação operacional tenant recipes",
    "Explicação de governança tenant recipes",
  ]);
});

test("route quick replies are owned by the tutor contract", () => {
  assert.deepEqual(resolveEiahTutorRouteQuickReplies("orchestrator"), [
    "Qual agente devo usar?",
    "Analise este fluxo e recomende o próximo passo.",
    "Quero auditar esse processo.",
  ]);

  assert.deepEqual(resolveEiahTutorRouteQuickReplies("help"), [
    "O que o EIAH pode fazer por mim?",
    "Como criar um run no EIAH?",
    "Como funciona o billing?",
  ]);
});

test("route placeholders are owned by the tutor contract", () => {
  assert.equal(
    resolveEiahTutorInputPlaceholder("orchestrator"),
    "Ex.: analise este fluxo e recomende o próximo passo"
  );

  assert.equal(
    resolveEiahTutorInputPlaceholder("help", "quero entender billing"),
    "Ex.: quero entender plano, uso e cobrança do workspace"
  );
});
