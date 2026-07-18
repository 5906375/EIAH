import fs from "node:fs";
import path from "node:path";

const CHECK = "check:imob-static-harness-contract";
const PASS_DECISION = "GO_FOR_NEXT_REVIEW_ONLY";
const FAIL_DECISION = "NO_GO";

type Severity = "blocking" | "required" | "advisory";

type Violation = {
  reasonCode: string;
  severity: Severity;
  sourcePath: string;
  message: string;
};

type Source = {
  path: string;
  text: string;
};

const requiredReferences = [
  "docs/proposals/imob-pilot-2-dry-run-fixture-pack-evidence-template.md",
  "docs/proposals/imob-pilot-4-non-operational-dry-run-harness-spec.md",
  "docs/proposals/imob-pilot-5-non-operational-harness-skeleton.md",
  "docs/proposals/imob-pilot-6a-static-harness-contract-check.md",
  "docs/proposals/imob-pilot-6b-static-check-implementation-design.md",
  "docs/proposals/imob-pilot-6c-static-check-non-executable-pseudocode.md",
  "docs/proposals/imob-pilot-6d-static-check-implementation-plan.md",
  "ops/evidence/templates/imob-pilot-2-shadow-dry-run-evidence-template.md",
  "apps/api/src/tests/fixtures/imob-pilot-2/imob-pilot-2-shadow-dry-run.fixture.json",
  "contracts/chat/chat.vertical_handoff.v1.schema.json",
  "contracts/chat/hitl.gate_state.v1.schema.json",
  "contracts/chat/proof_receipt_bundle_state.v1.schema.json",
  "AGENTS.md",
  "docs/architecture/agent-chat-runtime.md",
] as const;

const documentationPaths = [
  "docs/proposals/imob-pilot-2-dry-run-fixture-pack-evidence-template.md",
  "docs/proposals/imob-pilot-4-non-operational-dry-run-harness-spec.md",
  "docs/proposals/imob-pilot-5-non-operational-harness-skeleton.md",
  "docs/proposals/imob-pilot-6a-static-harness-contract-check.md",
  "docs/proposals/imob-pilot-6b-static-check-implementation-design.md",
  "docs/proposals/imob-pilot-6c-static-check-non-executable-pseudocode.md",
  "docs/proposals/imob-pilot-6d-static-check-implementation-plan.md",
  "ops/evidence/templates/imob-pilot-2-shadow-dry-run-evidence-template.md",
] as const;

const guardrailDocPaths = [
  "docs/proposals/imob-pilot-6a-static-harness-contract-check.md",
  "docs/proposals/imob-pilot-6b-static-check-implementation-design.md",
  "docs/proposals/imob-pilot-6c-static-check-non-executable-pseudocode.md",
  "docs/proposals/imob-pilot-6d-static-check-implementation-plan.md",
] as const;

const zeroMetrics = [
  "sideEffects",
  "providerExternalCall",
  "mutationExternalSideEffect",
  "dbWrite",
  "ledgerWrite",
  "auditWrite",
  "receiptGenerated",
  "bundleGenerated",
  "proofGenerated",
  "proofFabricatedInFrontend",
  "frontendPolicyDecision",
  "chatLauncherBusinessRule",
  "criticalActionExecuted",
  "criticalActionWithoutHITL",
  "piiLeakageDetected",
  "missingReasonCode",
  "checksumMismatch",
] as const;

const requiredReasonCodes = [
  "IMOB_PILOT_6A_STATIC_CHECK_ONLY",
  "IMOB_PILOT_5_SKELETON_ONLY",
  "IMOB_HARNESS_NO_GO",
  "IMOB_HARNESS_GO_FOR_NEXT_REVIEW_ONLY",
  "IMOB_PILOT_2_FIXTURE_PACK_ONLY",
  "CHAT_VERTICAL_HANDOFF_TO_COCKPIT",
  "APPROVAL_REQUIRED",
  "PROOF_UNAVAILABLE_READ_ONLY",
  "NO_PROVIDER_EXTERNAL_CALL",
  "NO_MUTATION_EXTERNAL_SIDE_EFFECT",
  "NO_DB_LEDGER_AUDIT_WRITE",
  "NO_RECEIPT_BUNDLE_PROOF_GENERATION",
  "NO_PII_LEAKAGE",
  "NO_SHADOW_DRY_RUN_EXECUTION",
  "NO_PILOT_SMALL_ROLLOUT_EXECUTION",
  "IMOB_PILOT_6B_IMPLEMENTATION_DESIGN_ONLY",
  "IMOB_PILOT_6C_PSEUDOCODE_ONLY",
  "IMOB_STATIC_CHECK_NON_EXECUTABLE",
  "IMOB_STATIC_CHECK_FAIL_CLOSED",
] as const;

const textualBoundaries = [
  {
    name: "sem provider",
    pattern: /\bsem\s+provider\b|no\s+provider|without\s+provider/i,
  },
  {
    name: "sem DB",
    pattern: /\bsem\s+db\b|\bsem\s+db\s+write\b|\bno\s+db\b|\bwithout\s+db\b/i,
  },
  {
    name: "sem ledger/audit",
    pattern: /\bsem\s+ledger\/audit\b|\bsem\s+ledger\b[\s\S]{0,80}\bsem\s+audit\b|ledger\/audit\s+write|no\s+ledger|no\s+audit/i,
  },
  {
    name: "sem receipt/bundle/proof",
    pattern: /sem\s+receipt[\s\S]{0,80}sem\s+bundle[\s\S]{0,80}sem\s+proof|receipt\/bundle\/proof|no\s+receipt|no\s+bundle|no\s+proof/i,
  },
  {
    name: "sem frontend preview",
    pattern: /\bsem\s+frontend\s+preview\b|nao\s+cria\s+preview\s+frontend|nao\s+autoriza\s+preview\s+frontend/i,
  },
  {
    name: "sem ChatAgentLauncher logic",
    pattern: /sem\s+regra\s+de\s+negocio\s+no\s+`?ChatAgentLauncher`?|ChatAgentLauncher[\s\S]{0,80}render-only|ChatAgentLauncher[\s\S]{0,80}apenas\s+renderiza/i,
  },
  {
    name: "sem autorizacao produtiva",
    pattern: /sem\s+autorizacao\s+produtiva|nao\s+autoriza\s+producao|productionAuthorization\s*=\s*false/i,
  },
] as const;

const forbiddenAuthorizationTerms = [
  "autoriza producao",
  "shadow real autorizado",
  "dry-run real autorizado",
  "frontend preview autorizado",
  "provider real autorizado",
] as const;

const forbiddenClosureTerms = ["receipt canon fechado", "imob operacionalmente fechado"] as const;

const expectedContracts = [
  {
    path: "contracts/chat/chat.vertical_handoff.v1.schema.json",
    version: "chat.vertical_handoff.v1",
    requiredFields: [
      "version",
      "handoffId",
      "tenantId",
      "workspaceId",
      "scope",
      "userId",
      "verticalId",
      "intentId",
      "handoffMessage",
      "reasonCode",
      "riskLevel",
      "hitlRequired",
    ],
  },
  {
    path: "contracts/chat/hitl.gate_state.v1.schema.json",
    version: "hitl.gate_state.v1",
    requiredFields: [
      "version",
      "gateId",
      "gateType",
      "tenantId",
      "workspaceId",
      "scope",
      "approvalState",
      "hitlRequired",
      "riskLevel",
      "reasonCode",
      "verticalId",
      "message",
    ],
  },
  {
    path: "contracts/chat/proof_receipt_bundle_state.v1.schema.json",
    version: "proof_receipt_bundle_state.v1",
    requiredFields: [
      "version",
      "proofKind",
      "proofStatus",
      "runId",
      "verticalId",
      "tenantId",
      "workspaceId",
      "scope",
      "source",
      "reasonCode",
      "accessibilityLabel",
    ],
  },
] as const;

const repositoryRoot = process.cwd();

function emit(report: Record<string, unknown>, exitCode: 0 | 1): never {
  console.log(JSON.stringify(report, null, 2));
  process.exit(exitCode);
}

function addViolation(violations: Violation[], reasonCode: string, sourcePath: string, message: string, severity: Severity = "blocking") {
  violations.push({ reasonCode, severity, sourcePath, message });
}

function resolveRepoPath(relativePath: string): string {
  return path.resolve(repositoryRoot, relativePath);
}

function isInsideRepository(absolutePath: string): boolean {
  const relative = path.relative(repositoryRoot, absolutePath);
  return relative.length === 0 || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function readRequiredSources(violations: Violation[]): Source[] {
  const sources: Source[] = [];

  for (const relativePath of requiredReferences) {
    const absolutePath = resolveRepoPath(relativePath);

    if (!isInsideRepository(absolutePath)) {
      addViolation(violations, "IMOB_STATIC_CHECK_REFERENCE_OUT_OF_SCOPE", relativePath, "required reference resolves outside repository");
      continue;
    }

    if (!fs.existsSync(absolutePath)) {
      addViolation(violations, "IMOB_STATIC_CHECK_REFERENCE_MISSING", relativePath, "required reference is missing");
      continue;
    }

    try {
      sources.push({ path: relativePath, text: fs.readFileSync(absolutePath, "utf8") });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addViolation(violations, "IMOB_STATIC_CHECK_REFERENCE_UNREADABLE", relativePath, message);
    }
  }

  return sources;
}

function parseJson<T>(source: Source, violations: Violation[]): T | null {
  try {
    return JSON.parse(source.text) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addViolation(violations, "IMOB_STATIC_CHECK_JSON_INVALID", source.path, message);
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getSource(sources: Source[], sourcePath: string): Source | null {
  return sources.find((source) => source.path === sourcePath) ?? null;
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function hasZeroMetric(text: string, metric: string): boolean {
  const escapedMetric = metric.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp("[\"'`]?" + escapedMetric + "[\"'`]?\\s*(?::|=|\\|)\\s*[`\"]?0[`\"]?", "i").test(text);
}

function validateMetrics(sources: Source[], violations: Violation[]) {
  const combinedDocs = documentationPaths
    .map((sourcePath) => getSource(sources, sourcePath)?.text ?? "")
    .join("\n");

  const checked: string[] = [];
  for (const metric of zeroMetrics) {
    if (hasZeroMetric(combinedDocs, metric)) {
      checked.push(`${metric}=0`);
      continue;
    }
    addViolation(
      violations,
      "IMOB_STATIC_CHECK_REQUIRED_METRIC_MISSING",
      "docs/proposals",
      `required zero metric declaration missing: ${metric}=0`,
    );
  }

  return checked;
}

function validateReasonCodes(sources: Source[], violations: Violation[]) {
  const combinedDocs = documentationPaths
    .map((sourcePath) => getSource(sources, sourcePath)?.text ?? "")
    .join("\n");

  const checked: string[] = [];
  for (const reasonCode of requiredReasonCodes) {
    if (combinedDocs.includes(reasonCode)) {
      checked.push(reasonCode);
      continue;
    }
    addViolation(
      violations,
      "IMOB_STATIC_CHECK_REASON_CODE_MISSING",
      "docs/proposals",
      `required reasonCode declaration missing: ${reasonCode}`,
    );
  }

  return checked;
}

function validateBoundaries(sources: Source[], violations: Violation[]) {
  const combinedDocs = [
    ...documentationPaths.map((sourcePath) => getSource(sources, sourcePath)?.text ?? ""),
    getSource(sources, "AGENTS.md")?.text ?? "",
    getSource(sources, "docs/architecture/agent-chat-runtime.md")?.text ?? "",
  ].join("\n");

  const normalized = normalizeText(combinedDocs);
  const checked: string[] = [];
  for (const boundary of textualBoundaries) {
    if (boundary.pattern.test(normalized)) {
      checked.push(boundary.name);
      continue;
    }
    addViolation(
      violations,
      "IMOB_STATIC_CHECK_BOUNDARY_DECLARATION_MISSING",
      "docs/proposals",
      `required textual boundary missing: ${boundary.name}`,
    );
  }

  return checked;
}

function occurrenceIsNegatedOrListed(normalized: string, index: number): boolean {
  const before = normalized.slice(Math.max(0, index - 180), index);
  return (
    /\b(nao|sem|never|not|no)\b[\s\S]{0,170}$/.test(before) ||
    /(linguagem que|termos que|termos proibidos|forbidden|proibida|proibido|falha|fail|criterio)[\s\S]{0,170}$/.test(
      before,
    )
  );
}

function collectForbiddenTermFindings(source: Source, terms: readonly string[]) {
  const normalized = normalizeText(source.text);
  const findings: string[] = [];

  for (const term of terms) {
    let offset = normalized.indexOf(term);
    while (offset >= 0) {
      if (!occurrenceIsNegatedOrListed(normalized, offset)) {
        findings.push(term);
        break;
      }
      offset = normalized.indexOf(term, offset + term.length);
    }
  }

  return findings;
}

function validateForbiddenLanguage(sources: Source[], violations: Violation[]) {
  const checked: string[] = [];

  for (const sourcePath of guardrailDocPaths) {
    const source = getSource(sources, sourcePath);
    if (!source) continue;

    const authorizationFindings = collectForbiddenTermFindings(source, forbiddenAuthorizationTerms);
    for (const finding of authorizationFindings) {
      addViolation(
        violations,
        "IMOB_STATIC_CHECK_PRODUCTIVE_LANGUAGE_FORBIDDEN",
        source.path,
        `unnegated productive authorization term found: ${finding}`,
      );
    }

    const closureFindings = collectForbiddenTermFindings(source, forbiddenClosureTerms);
    for (const finding of closureFindings) {
      addViolation(
        violations,
        "IMOB_STATIC_CHECK_OPERATIONAL_CLOSURE_FORBIDDEN",
        source.path,
        `unnegated closure declaration found: ${finding}`,
      );
    }

    checked.push(source.path);
  }

  return checked;
}

function expectValue(
  value: unknown,
  expected: unknown,
  violations: Violation[],
  sourcePath: string,
  fieldPath: string,
  reasonCode = "IMOB_STATIC_CHECK_FIXTURE_POLICY_INVALID",
) {
  if (value !== expected) {
    addViolation(violations, reasonCode, sourcePath, `${fieldPath} expected ${String(expected)}, got ${String(value)}`);
  }
}

function validateFixture(sources: Source[], violations: Violation[]) {
  const sourcePath = "apps/api/src/tests/fixtures/imob-pilot-2/imob-pilot-2-shadow-dry-run.fixture.json";
  const source = getSource(sources, sourcePath);
  if (!source) return { parsed: false, checkedFields: [] as string[] };

  const fixture = parseJson<Record<string, unknown>>(source, violations);
  if (!fixture || !isRecord(fixture)) return { parsed: false, checkedFields: [] as string[] };

  const checkedFields: string[] = [];
  const dataPolicy = isRecord(fixture.dataPolicy) ? fixture.dataPolicy : {};
  const executionPolicy = isRecord(fixture.executionPolicy) ? fixture.executionPolicy : {};
  const expectedMetrics = isRecord(fixture.expectedMetrics) ? fixture.expectedMetrics : {};
  const renderExpectation = isRecord(fixture.renderExpectation) ? fixture.renderExpectation : {};
  const nonAuthorization = isRecord(fixture.nonAuthorization) ? fixture.nonAuthorization : {};

  const expectedBooleans: Array<[Record<string, unknown>, string, boolean]> = [
    [dataPolicy, "syntheticOnly", true],
    [dataPolicy, "sanitized", true],
    [dataPolicy, "containsPii", false],
    [dataPolicy, "containsSensitiveData", false],
    [dataPolicy, "containsProductionSecret", false],
    [dataPolicy, "containsProductionWebhook", false],
    [nonAuthorization, "doesNotAuthorizeShadow", true],
    [nonAuthorization, "doesNotAuthorizeDryRun", true],
    [nonAuthorization, "doesNotAuthorizePilot", true],
    [nonAuthorization, "doesNotAuthorizeSmallRollout", true],
    [nonAuthorization, "doesNotAuthorizeProvider", true],
    [nonAuthorization, "doesNotAuthorizeProductionWebhook", true],
    [nonAuthorization, "doesNotAuthorizeProductiveSecret", true],
    [nonAuthorization, "doesNotAuthorizeMutation", true],
    [nonAuthorization, "doesNotAuthorizeReceiptCanonClosure", true],
    [nonAuthorization, "doesNotAuthorizeImobOperationalClosure", true],
  ];

  for (const [record, field, expected] of expectedBooleans) {
    expectValue(record[field], expected, violations, sourcePath, field);
    checkedFields.push(field);
  }

  for (const metric of [
    "criticalActionExecuted",
    "providerExternalCall",
    "mutationExternalSideEffect",
    "dbWrite",
    "ledgerWrite",
    "auditWrite",
    "receiptGenerated",
    "bundleGenerated",
    "proofGenerated",
  ] as const) {
    expectValue(executionPolicy[metric], 0, violations, sourcePath, `executionPolicy.${metric}`);
    checkedFields.push(`executionPolicy.${metric}`);
  }

  for (const metric of [
    "sideEffects",
    "providerExternalCall",
    "mutationExternalSideEffect",
    "dbWrite",
    "ledgerWrite",
    "auditWrite",
    "receiptGenerated",
    "bundleGenerated",
    "proofGenerated",
    "criticalActionExecuted",
    "piiLeakageDetected",
    "frontendPolicyDecision",
  ] as const) {
    expectValue(expectedMetrics[metric], 0, violations, sourcePath, `expectedMetrics.${metric}`);
    checkedFields.push(`expectedMetrics.${metric}`);
  }

  expectValue(renderExpectation.providerExternalCall, 0, violations, sourcePath, "renderExpectation.providerExternalCall");
  expectValue(renderExpectation.frontendPolicyDecision, 0, violations, sourcePath, "renderExpectation.frontendPolicyDecision");
  expectValue(renderExpectation.proofFabricatedInFrontend, 0, violations, sourcePath, "renderExpectation.proofFabricatedInFrontend");
  checkedFields.push("renderExpectation.providerExternalCall");
  checkedFields.push("renderExpectation.frontendPolicyDecision");
  checkedFields.push("renderExpectation.proofFabricatedInFrontend");

  return { parsed: true, checkedFields };
}

function validateContracts(sources: Source[], violations: Violation[]) {
  const checked: string[] = [];

  for (const contract of expectedContracts) {
    const source = getSource(sources, contract.path);
    if (!source) continue;

    const schema = parseJson<Record<string, unknown>>(source, violations);
    if (!schema || !isRecord(schema)) continue;

    if (schema.type !== "object") {
      addViolation(violations, "IMOB_STATIC_CHECK_CONTRACT_INVALID", contract.path, "schema root type must be object");
    }
    if (schema.additionalProperties !== false) {
      addViolation(violations, "IMOB_STATIC_CHECK_CONTRACT_INVALID", contract.path, "schema root additionalProperties must be false");
    }

    const required = Array.isArray(schema.required) ? schema.required : [];
    const properties = isRecord(schema.properties) ? schema.properties : {};
    const versionProperty = isRecord(properties.version) ? properties.version : {};

    if (versionProperty.const !== contract.version) {
      addViolation(violations, "IMOB_STATIC_CHECK_CONTRACT_INVALID", contract.path, `version const must be ${contract.version}`);
    }

    for (const field of contract.requiredFields) {
      if (!required.includes(field)) {
        addViolation(violations, "IMOB_STATIC_CHECK_CONTRACT_FIELD_MISSING", contract.path, `required field missing: ${field}`);
      }
      if (!(field in properties)) {
        addViolation(violations, "IMOB_STATIC_CHECK_CONTRACT_FIELD_MISSING", contract.path, `property missing: ${field}`);
      }
    }

    checked.push(`${contract.version}:${contract.requiredFields.length}`);
  }

  return checked;
}

function validatePackageAndCiAbsence(sources: Source[], violations: Violation[]) {
  const packageJsonPath = "package.json";
  const ciPath = ".github/workflows/ci.yml";
  const scriptReferences = ["checkImobStaticHarnessContract", "check:imob-static-harness-contract"];
  const checked: string[] = [];

  for (const sourcePath of [packageJsonPath, ciPath] as const) {
    const absolutePath = resolveRepoPath(sourcePath);
    if (!fs.existsSync(absolutePath)) {
      continue;
    }
    const text = fs.readFileSync(absolutePath, "utf8");
    for (const reference of scriptReferences) {
      if (text.includes(reference)) {
        addViolation(
          violations,
          "IMOB_STATIC_CHECK_REGISTRATION_FORBIDDEN_IN_6E",
          sourcePath,
          `6E must not register package script or CI gate: ${reference}`,
        );
      }
    }
    checked.push(sourcePath);
  }

  return checked;
}

const violations: Violation[] = [];
const sources = readRequiredSources(violations);
const metricChecks = validateMetrics(sources, violations);
const reasonCodeChecks = validateReasonCodes(sources, violations);
const boundaryChecks = validateBoundaries(sources, violations);
const forbiddenLanguageChecks = validateForbiddenLanguage(sources, violations);
const fixtureChecks = validateFixture(sources, violations);
const contractChecks = validateContracts(sources, violations);
const registrationChecks = validatePackageAndCiAbsence(sources, violations);

const ok = violations.length === 0;

emit(
  {
    ok,
    check: CHECK,
    decision: ok ? PASS_DECISION : FAIL_DECISION,
    localOfflineDeterministic: true,
    stdoutOnly: true,
    writesFiles: false,
    readsEnvOrSecrets: false,
    networkCalls: false,
    runtimeServiceImports: false,
    packageScriptRegistered: false,
    ciGateRegistered: false,
    evidenceIndexUpdated: false,
    dryRunExecuted: false,
    shadowStarted: false,
    frontendPreviewCreated: false,
    providerExternalCall: 0,
    mutationExternalSideEffect: 0,
    dbWrite: 0,
    ledgerWrite: 0,
    auditWrite: 0,
    receiptGenerated: 0,
    bundleGenerated: 0,
    proofGenerated: 0,
    referencesChecked: sources.map((source) => source.path),
    metricsChecked: metricChecks,
    reasonCodesChecked: reasonCodeChecks,
    boundariesChecked: boundaryChecks,
    forbiddenLanguageDocsChecked: forbiddenLanguageChecks,
    fixtureChecks,
    contractChecks,
    registrationChecks,
    violations,
  },
  ok ? 0 : 1,
);
