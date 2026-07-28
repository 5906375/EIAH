import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  REASON_CODE_CATALOG,
  type ReasonCodeDefinition,
} from "../packages/core/src/reasons/reasonCatalog.js";

export const CANONICAL_REASON_CODE_SOURCE =
  "packages/core/src/reasons/reasonCatalog.ts";
export const REASON_CODE_DOCUMENTATION = "docs/ops/reason-codes-catalog.md";

export const REASON_CODE_CANON_TARGETS = [
  CANONICAL_REASON_CODE_SOURCE,
  REASON_CODE_DOCUMENTATION,
  "apps/api/src/services/imob/control/imobReasonCodeCatalog.ts",
  "apps/api/src/routes/imobCrmSchemas.ts",
  "apps/api/src/types/chatVerticalHandoffV2Contract.ts",
  "contracts/chat/vertical.reason_codes.v1.json",
  "scripts/tests/checkReasonCodeCanon.test.ts",
] as const;

const BOOTSTRAP_ACTIVE_CODES = new Set<string>([
  "COMMERCIAL_PRIORITY",
  "FOLLOW_UP_DISCIPLINE",
  "DOCUMENT_BLOCKER",
  "FINANCIAL_BLOCKER",
  "AUDIT_BLOCKER",
  "BLOCKERS_PRESENT",
  "PENDING_ITEMS_PRESENT",
  "NEXT_STEP_AVAILABLE",
  "CASE_STATUS_BLOCKED",
  "CASE_RESPONSIBLE_REQUIRED",
  "CASE_OWNER_ASSIGNMENT_FORBIDDEN",
  "MEMBER_NOT_ELIGIBLE_AS_RESPONSIBLE",
  "RESPONSIBLE_ACTOR_CONTRACT_INVALID",
  "INVALID_ACTION_TYPE",
  "CASE_TRANSITION_EVENT_REQUIRED",
  "PENDING_ACTION_MISSING",
  "PENDING_ACTION_MISMATCH",
  "PENDING_ACTION_EXPIRED",
  "PENDING_ACTION_CANCELLED_BY_USER",
  "CONFIRMATION_TARGET_AMBIGUOUS",
  "DIRECTED_ACTION_CONTEXT_LOST",
  "DIRECTED_ACTION_ENTITY_MISMATCH",
  "DIRECTED_ACTION_JOURNEY_MISMATCH",
  "VERTICAL_NOT_REGISTERED",
  "VERTICAL_DISABLED",
  "VERTICAL_ENTITLEMENT_REQUIRED",
  "VERTICAL_SCOPE_DENIED",
  "VERTICAL_CAPABILITY_NOT_AVAILABLE",
  "VERTICAL_REGISTRY_VERSION_MISMATCH",
  "VERTICAL_POLICY_DENIED",
  "VERTICAL_HITL_REQUIRED",
  "VERTICAL_GOVERNANCE_NOT_EVALUATED",
  "VERTICAL_PRESENTATION_INVALID",
  "VERTICAL_HANDOFF_ALLOWED",
  "VERTICAL_PREVIEW_ONLY",
]);

const DOCUMENTED_CATALOG_START = "<!-- reason-code-canon:start -->";
const DOCUMENTED_CATALOG_END = "<!-- reason-code-canon:end -->";
const REASON_CODE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export type ReasonCodeCanonViolation = Readonly<{
  code: string;
  source: string;
  message: string;
}>;

function violation(
  code: string,
  source: string,
  message: string,
): ReasonCodeCanonViolation {
  return { code, source, message };
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function validateReasonCodeCatalog(
  catalog: readonly ReasonCodeDefinition[],
): ReasonCodeCanonViolation[] {
  const violations: ReasonCodeCanonViolation[] = [];
  const seen = new Set<string>();

  for (const definition of catalog) {
    const source = `${CANONICAL_REASON_CODE_SOURCE}#${definition.code}`;
    if (!REASON_CODE_TOKEN.test(definition.code)) {
      violations.push(
        violation("REASON_CODE_TOKEN_INVALID", source, "code is not a canonical token"),
      );
    }
    if (seen.has(definition.code)) {
      violations.push(
        violation("REASON_CODE_DUPLICATE", source, "code occurs more than once"),
      );
    }
    seen.add(definition.code);

    if (!nonEmpty(definition.description)) {
      violations.push(
        violation("REASON_CODE_DESCRIPTION_MISSING", source, "description is required"),
      );
    }

    if (definition.status !== "active") continue;

    if (!nonEmpty(definition.owner)) {
      violations.push(
        violation("ACTIVE_REASON_CODE_OWNER_MISSING", source, "active requires owner"),
      );
    }
    if (!definition.approver || !nonEmpty(definition.approver.actor)) {
      violations.push(
        violation(
          "ACTIVE_REASON_CODE_APPROVER_MISSING",
          source,
          "active requires an identified approver",
        ),
      );
    }
    if (!nonEmpty(definition.evidenceRef)) {
      violations.push(
        violation(
          "ACTIVE_REASON_CODE_EVIDENCE_MISSING",
          source,
          "active requires evidenceRef",
        ),
      );
    }
    if (
      definition.approver?.kind === "bootstrap-validator" &&
      !BOOTSTRAP_ACTIVE_CODES.has(definition.code)
    ) {
      violations.push(
        violation(
          "ACTIVE_REASON_CODE_BOOTSTRAP_FORBIDDEN",
          source,
          "bootstrap-validator is fenced to the pre-RC-0 domain-validator baseline",
        ),
      );
    }
  }

  return violations;
}

export function validateReasonCodeReferences(
  reasonCodes: readonly string[],
  catalog: readonly ReasonCodeDefinition[],
  source: string,
  requireActive = true,
): ReasonCodeCanonViolation[] {
  const definitions = new Map(catalog.map((definition) => [definition.code, definition]));
  const violations: ReasonCodeCanonViolation[] = [];

  for (const reasonCode of reasonCodes) {
    const definition = definitions.get(reasonCode);
    if (!definition) {
      violations.push(
        violation(
          "UNKNOWN_REASON_CODE",
          source,
          `reasonCode is absent from the canonical source: ${reasonCode}`,
        ),
      );
    } else if (requireActive && definition.status !== "active") {
      violations.push(
        violation(
          "REASON_CODE_NOT_ACTIVE",
          source,
          `reasonCode is ${definition.status}, not enforceable: ${reasonCode}`,
        ),
      );
    }
  }

  return violations;
}

export function validateCanonicalSourcePointer(
  documentation: string,
  canonicalSourceExists: boolean,
): ReasonCodeCanonViolation[] {
  const violations: ReasonCodeCanonViolation[] = [];
  if (!documentation.includes(`\`${CANONICAL_REASON_CODE_SOURCE}\``)) {
    violations.push(
      violation(
        "CANONICAL_REASON_CODE_POINTER_MISMATCH",
        REASON_CODE_DOCUMENTATION,
        `documentation must point to ${CANONICAL_REASON_CODE_SOURCE}`,
      ),
    );
  }
  if (!canonicalSourceExists) {
    violations.push(
      violation(
        "CANONICAL_REASON_CODE_SOURCE_MISSING",
        CANONICAL_REASON_CODE_SOURCE,
        "documented canonical source does not exist",
      ),
    );
  }
  return violations;
}

export function parseDocumentedReasonCodeCatalog(
  documentation: string,
): Map<string, string> {
  const start = documentation.indexOf(DOCUMENTED_CATALOG_START);
  const end = documentation.indexOf(DOCUMENTED_CATALOG_END);
  if (start === -1 || end === -1 || end <= start) return new Map();

  const block = documentation.slice(start + DOCUMENTED_CATALOG_START.length, end);
  const documented = new Map<string, string>();
  for (const line of block.split("\n")) {
    const match = line.match(/^\|\s*`([^`]+)`\s*\|\s*(active|proposed|deprecated)\s*\|/);
    if (match) documented.set(match[1], match[2]);
  }
  return documented;
}

export function validateDocumentedReasonCodeCatalog(
  documentation: string,
  catalog: readonly ReasonCodeDefinition[],
): ReasonCodeCanonViolation[] {
  const documented = parseDocumentedReasonCodeCatalog(documentation);
  const canonical = new Map(catalog.map((definition) => [definition.code, definition.status]));
  const violations: ReasonCodeCanonViolation[] = [];

  if (documented.size === 0) {
    return [
      violation(
        "DOCUMENTED_REASON_CODE_CATALOG_MISSING",
        REASON_CODE_DOCUMENTATION,
        "machine-checkable documented catalog block is missing or empty",
      ),
    ];
  }

  for (const [code, status] of canonical) {
    if (documented.get(code) !== status) {
      violations.push(
        violation(
          "DOCUMENTED_REASON_CODE_CATALOG_DRIFT",
          REASON_CODE_DOCUMENTATION,
          `canonical ${code}:${status} is absent or has a different documented status`,
        ),
      );
    }
  }
  for (const code of documented.keys()) {
    if (!canonical.has(code)) {
      violations.push(
        violation(
          "DOCUMENTED_REASON_CODE_UNKNOWN",
          REASON_CODE_DOCUMENTATION,
          `documentation contains an unknown reasonCode: ${code}`,
        ),
      );
    }
  }

  return violations;
}

export function extractStringArrayConstant(source: string, constantName: string): string[] {
  const escapedName = constantName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(
    new RegExp(`export const ${escapedName}\\s*=\\s*\\[([\\s\\S]*?)\\]\\s*as const`),
  );
  if (!match) return [];
  return [...match[1].matchAll(/"([^"]+)"/g)].map((entry) => entry[1]);
}

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    [...left].sort().every((value, index) => value === [...right].sort()[index])
  );
}

function validateDomainCatalog(
  codes: readonly string[],
  domain: "imob" | "chat_vertical",
  source: string,
): ReasonCodeCanonViolation[] {
  const activeDomainCodes = REASON_CODE_CATALOG.filter(
    (definition) => definition.domain === domain && definition.status === "active",
  ).map((definition) => definition.code);
  const violations = validateReasonCodeReferences(
    codes,
    REASON_CODE_CATALOG,
    source,
    true,
  );
  if (!sameSet(codes, activeDomainCodes)) {
    violations.push(
      violation(
        "DOMAIN_REASON_CODE_CATALOG_DRIFT",
        source,
        `${domain} validator and canonical active set differ`,
      ),
    );
  }
  return violations;
}

export function runReasonCodeCanonCheck(root = process.cwd()): ReasonCodeCanonViolation[] {
  const read = (relativePath: string) =>
    readFileSync(path.join(root, relativePath), "utf8");
  const documentation = read(REASON_CODE_DOCUMENTATION);
  const imobSource = read(
    "apps/api/src/services/imob/control/imobReasonCodeCatalog.ts",
  );
  const imobSchemaSource = read("apps/api/src/routes/imobCrmSchemas.ts");
  const chatSource = read("apps/api/src/types/chatVerticalHandoffV2Contract.ts");
  const chatCatalog = JSON.parse(
    read("contracts/chat/vertical.reason_codes.v1.json"),
  ) as { codes?: unknown };

  const imobCodes = extractStringArrayConstant(imobSource, "IMOB_REASON_CODE_VALUES");
  const chatCodes = extractStringArrayConstant(
    chatSource,
    "VERTICAL_HANDOFF_REASON_CODES",
  );
  const chatJsonCodes = Array.isArray(chatCatalog.codes)
    ? chatCatalog.codes.filter((code): code is string => typeof code === "string")
    : [];

  const violations = REASON_CODE_CANON_TARGETS.flatMap((target) =>
    existsSync(path.join(root, target))
      ? []
      : [
          violation(
            "REASON_CODE_CANON_TARGET_MISSING",
            target,
            "explicit checker target does not exist",
          ),
        ],
  );
  violations.push(
    ...validateReasonCodeCatalog(REASON_CODE_CATALOG),
    ...validateCanonicalSourcePointer(
      documentation,
      existsSync(path.join(root, CANONICAL_REASON_CODE_SOURCE)),
    ),
    ...validateDocumentedReasonCodeCatalog(documentation, REASON_CODE_CATALOG),
    ...validateDomainCatalog(imobCodes, "imob", REASON_CODE_CANON_TARGETS[2]),
    ...validateDomainCatalog(chatCodes, "chat_vertical", REASON_CODE_CANON_TARGETS[4]),
    ...validateDomainCatalog(
      chatJsonCodes,
      "chat_vertical",
      REASON_CODE_CANON_TARGETS[5],
    ),
  );

  if (!imobSchemaSource.includes("z.enum(IMOB_REASON_CODE_VALUES)")) {
    violations.push(
      violation(
        "IMOB_REASON_CODE_NEGATIVE_VALIDATOR_MISSING",
        REASON_CODE_CANON_TARGETS[3],
        "IMOB reasonCode must remain enforced by z.enum(IMOB_REASON_CODE_VALUES)",
      ),
    );
  }
  if (!chatSource.includes("reasonCode: z.enum(VERTICAL_HANDOFF_REASON_CODES)")) {
    violations.push(
      violation(
        "CHAT_VERTICAL_REASON_CODE_NEGATIVE_VALIDATOR_MISSING",
        REASON_CODE_CANON_TARGETS[4],
        "Chat to Vertical reasonCode must remain enforced by its enum",
      ),
    );
  }

  return violations;
}

function runCli(): void {
  const violations = runReasonCodeCanonCheck();
  if (violations.length > 0) {
    console.error(
      JSON.stringify(
        { ok: false, check: "reason-code-canon-v1", violations },
        null,
        2,
      ),
    );
    process.exitCode = 1;
    return;
  }
  console.log(
    JSON.stringify({
      ok: true,
      check: "reason-code-canon-v1",
      catalogSize: REASON_CODE_CATALOG.length,
      targets: REASON_CODE_CANON_TARGETS,
      enforcement: "informational-until-ruleset-ratification",
    }),
  );
}

const entryPoint = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : null;
if (entryPoint === import.meta.url) runCli();
