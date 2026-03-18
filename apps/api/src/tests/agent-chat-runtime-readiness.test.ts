import test from "node:test";
import assert from "node:assert/strict";

import { buildChatRuntimeSnapshot } from "../services/agentChatRuntime";

test("chat runtime readiness marks fully declared profile as ready", () => {
  const snapshot = buildChatRuntimeSnapshot("EIAH", {
    chatCopy: {
      whoIAm: "Sou o EIAH.",
      whatIDo: ["explico"],
      whenToUseMe: ["quando precisar de ajuda"],
      exampleRequests: ["o que voce faz?"],
      quickReplies: ["O que voce pode fazer por mim?"],
    },
    uxContract: {
      primaryUserValue: "explicar",
      responseShape: "executive_summary",
      toneProfile: "supportive",
      interactionPattern: "guided_flow",
      defaultCTA: "Prosseguir",
      maxCognitiveLoad: "low",
      clarificationPolicy: "targeted",
      progressExposure: "light",
      trustSignals: ["clareza"],
    },
    participation: {
      agentId: "EIAH",
      status: "active",
      visibility: "visible",
      canBeSuggested: true,
      canReceiveHandoff: true,
      requiresEntitlement: false,
    },
    modeContracts: [
      { mode: "help", label: "help", description: "help" },
      { mode: "orchestrator", label: "orchestrator", description: "orchestrator" },
      { mode: "proposal", label: "proposal", description: "proposal" },
    ],
  });

  assert.equal(snapshot.readiness, "ready");
  assert.equal(snapshot.resolver, "agent_driven");
  assert.deepEqual(snapshot.missingFields, []);
  assert.equal(snapshot.chatEnabled, true);
  assert.equal(snapshot.catalogVisibility, "visible");
  assert.equal(snapshot.blockingReason, null);
});

test("chat runtime readiness marks incomplete profile conservatively", () => {
  const snapshot = buildChatRuntimeSnapshot("agent-x", {
    chatCopy: {
      whoIAm: "Sou um agente.",
      whatIDo: ["faço algo"],
      whenToUseMe: ["quando fizer sentido"],
      exampleRequests: ["exemplo"],
      quickReplies: [],
    },
  });

  assert.equal(snapshot.readiness, "incomplete");
  assert.equal(snapshot.resolver, "legacy_compatible");
  assert.ok(snapshot.missingFields.includes("uxContract"));
  assert.ok(snapshot.missingFields.includes("participation"));
  assert.ok(snapshot.missingFields.includes("quickReplies"));
  assert.equal(snapshot.chatEnabled, false);
  assert.equal(snapshot.catalogVisibility, "blocked");
  assert.equal(snapshot.blockingReason, "missing_minimum_contract");
});
