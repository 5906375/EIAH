import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { resolveKnowledgeContext } from "../services/knowledgeGate";
import { aadvProfile } from "@eiah/core/actions/agents/aadvAction";
import { defiOneProfile } from "@eiah/core/actions/agents/defiOneAction";
import { finNexusProfile } from "@eiah/core/actions/agents/finNexusAction";
import { guardianProfile } from "@eiah/core/actions/agents/guardianAction";
import { j360Profile } from "@eiah/core/actions/agents/j360Action";
import { onchainMonitorProfile } from "@eiah/core/actions/agents/onchainMonitorAction";
import { riskAnalyzerProfile } from "@eiah/core/actions/agents/riskAnalyzerAction";

type ProfileUnderTest = {
  id: string;
  profile: {
    knowledgePolicy?: {
      deterministicSources: Array<{
        sourceId: string;
        kind: "db" | "ledger" | "event_store" | "document_index" | "api" | "snapshot";
        authorityLevel: "primary" | "secondary" | "advisory";
        required: boolean;
        version: string;
      }>;
      sourcePrecedence: string[];
      conflictResolution: "fail_closed" | "use_primary" | "human_review";
      llmUsageMode:
        | "none"
        | "format_only"
        | "grounded_reasoning"
        | "open_reasoning_restricted"
        | "disallowed_for_critical_execution";
      fallbackPolicy: "block" | "approved_snapshot" | "human_review";
      provenancePolicy: "required" | "recommended" | "none";
      maskingPolicy: "required" | "conditional" | "none";
    };
  };
};

const profiles: ProfileUnderTest[] = [
  { id: "guardian", profile: guardianProfile },
  { id: "AADV", profile: aadvProfile },
  { id: "fin-nexus", profile: finNexusProfile },
  { id: "risk-analyzer", profile: riskAnalyzerProfile },
  { id: "onchain-monitor", profile: onchainMonitorProfile },
  { id: "J_360", profile: j360Profile },
  { id: "DeFi_1", profile: defiOneProfile },
];

function firstRequiredSource(profile: ProfileUnderTest) {
  return (
    profile.profile.knowledgePolicy?.deterministicSources.find((source) => source.required) ??
    profile.profile.knowledgePolicy?.deterministicSources[0]
  );
}

function buildResolvedKnowledge(profile: ProfileUnderTest, value: unknown) {
  const source = firstRequiredSource(profile);
  assert.ok(source, `expected deterministic source for ${profile.id}`);
  return {
    [source.sourceId]: value,
  };
}

function baseParams(profile: ProfileUnderTest) {
  return {
    agentId: profile.id,
    prompt: `Executar fluxo controlado do agente ${profile.id}`,
    tenantId: "tenant-test",
    workspaceId: "workspace-test",
    knowledgePolicy: profile.profile.knowledgePolicy,
  };
}

describe("knowledge policy behavioral coverage", () => {
  it("handles source missing according to fallback policy", () => {
    for (const profile of profiles) {
      const result = resolveKnowledgeContext({
        ...baseParams(profile),
        metadata: {},
      });

      assert.ok(
        result.resolvedSources.some((entry) => entry.required === true && entry.status === "missing"),
        `${profile.id} should register missing required source`,
      );
      if (profile.profile.knowledgePolicy?.fallbackPolicy === "block") {
        assert.equal(result.blocked, true, `${profile.id} should block on missing required source`);
        assert.equal(result.reasonCode, "knowledge_required_source_missing");
      } else {
        assert.equal(result.blocked, false, `${profile.id} should stay open for non-block fallback policy`);
      }
    }
  });

  it("blocks on source conflict when policy is fail_closed", () => {
    const failClosedProfiles = profiles.filter(
      (profile) => profile.profile.knowledgePolicy?.conflictResolution === "fail_closed"
    );

    for (const profile of failClosedProfiles) {
      const source = firstRequiredSource(profile);
      assert.ok(source, `expected deterministic source for ${profile.id}`);

      const result = resolveKnowledgeContext({
        ...baseParams(profile),
        metadata: {
          sourceConflict: true,
          executionInput: { objective: "validate" },
          resolvedKnowledge: buildResolvedKnowledge(profile, { status: "ok", source: source.sourceId }),
        },
      });

      assert.equal(result.blocked, true, `${profile.id} should fail closed on conflict`);
      assert.equal(result.reasonCode, "knowledge_conflict_fail_closed");
    }
  });

  it("produces grounded response metadata when deterministic facts are present", () => {
    for (const profile of profiles) {
      const source = firstRequiredSource(profile);
      assert.ok(source, `expected deterministic source for ${profile.id}`);

      const result = resolveKnowledgeContext({
        ...baseParams(profile),
        metadata: {
          executionInput: { objective: "grounded-response", actor: profile.id },
          resolvedKnowledge: buildResolvedKnowledge(profile, {
            status: "resolved",
            payload: { actor: profile.id, mode: "grounded" },
          }),
        },
      });

      assert.equal(result.blocked, false, `${profile.id} should allow grounded path`);
      assert.ok(result.provenance.grounded, `${profile.id} should carry grounded provenance`);
      assert.ok(
        result.resolvedSources.some(
          (entry) => entry.sourceId === source.sourceId && entry.status === "resolved"
        ),
        `${profile.id} should record resolved source`,
      );
      assert.ok(result.groundedFacts.runtime, `${profile.id} should expose runtime facts`);
    }
  });

  it("marks blocked response with provenance when required source is explicitly unavailable", () => {
    const blockProfiles = profiles.filter((profile) => profile.profile.knowledgePolicy?.fallbackPolicy === "block");

    for (const profile of blockProfiles) {
      const source = firstRequiredSource(profile);
      assert.ok(source, `expected deterministic source for ${profile.id}`);

      const result = resolveKnowledgeContext({
        ...baseParams(profile),
        metadata: {
          unavailableSources: [source.sourceId],
          resolvedKnowledge: buildResolvedKnowledge(profile, null),
        },
      });

      assert.equal(result.blocked, true, `${profile.id} should block when source becomes unavailable`);
      assert.ok(
        result.reasonCode === "knowledge_required_source_unavailable" ||
          result.reasonCode === "knowledge_required_source_missing",
        `${profile.id} should return explicit blocked reason`,
      );
      assert.equal(result.provenance.blocked, true, `${profile.id} should expose blocked provenance`);
    }
  });
});
