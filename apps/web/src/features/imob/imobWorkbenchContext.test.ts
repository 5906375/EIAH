import test from "node:test";
import assert from "node:assert/strict";
import { extractImobWorkbenchIntakeContext, type ImobWorkbenchMessageCandidate } from "./imobWorkbenchContext";

test("extractImobWorkbenchIntakeContext prefers the selected thread", () => {
  const messages: ImobWorkbenchMessageCandidate[] = [
    {
      role: "assistant",
      text: "draft antigo",
      thread: { id: "thread-a", label: "Thread A" },
      widget: {
        kind: "contract_intake_draft",
        draftId: "draft-a",
        draftExpiresAt: "2026-06-18T10:00:00.000Z",
        documentKind: "lease_contract",
        contractType: "residential_lease",
        documentHash: "aaaa1111bbbb2222cccc3333dddd4444",
        pendingItems: ["Assinatura pendente"],
        riskFlags: [],
        actionId: "imob.contract.intake",
        requiresConfirmation: true,
      },
    },
    {
      role: "assistant",
      text: "resultado atual",
      thread: { id: "thread-b", label: "Thread B" },
      caseContext: { caseId: "case-b", threadId: "thread-b" } as any,
      widget: {
        kind: "contract_intake_result",
        runId: "run-b",
        stage: "documents_collecting",
        status: "ready_for_review",
        nextStep: "Revisar cláusulas",
        pendingItems: ["Garantia não definida"],
        riskFlags: ["Multa abaixo do mínimo"],
        documentHash: "eeee1111ffff2222gggg3333hhhh4444",
      },
    },
  ];

  const context = extractImobWorkbenchIntakeContext({ messages, preferredThreadId: "thread-b" });
  assert.equal(context?.kind, "result");
  assert.equal(context?.runId, "run-b");
  assert.equal(context?.caseId, "case-b");
});

test("extractImobWorkbenchIntakeContext builds masked extracted fields for draft payloads", () => {
  const context = extractImobWorkbenchIntakeContext({
    messages: [
      {
        role: "assistant",
        text: "draft atual",
        thread: { id: "thread-a", label: "Thread A" },
        widget: {
          kind: "contract_intake_draft",
          draftId: "draft-a",
          draftExpiresAt: "2026-06-18T10:00:00.000Z",
          documentKind: "lease_contract",
          contractType: "commercial_lease",
          documentHash: "aaaa1111bbbb2222cccc3333dddd4444",
          pendingItems: [],
          riskFlags: [],
          actionId: "imob.contract.intake",
          requiresConfirmation: true,
        },
      },
    ],
  });

  assert.equal(context?.kind, "draft");
  assert.equal(context?.extractedFields.length, 3);
  assert.equal(context?.extractedFields[0]?.masked, true);
  assert.ok(context?.extractedFields.some((item) => item.value.includes("Locação comercial")));
});
