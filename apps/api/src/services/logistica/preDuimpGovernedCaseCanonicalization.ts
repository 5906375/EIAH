import { createHash } from "node:crypto";

import {
  jsonValueV1Schema,
  preDuimpCaseV1Schema,
  type JsonValueV1,
  type PreDuimpCaseV1,
} from "@eiah/contracts";

export const PRE_DUIMP_INVALID_CANONICAL_JSON =
  "PRE_DUIMP_INVALID_CANONICAL_JSON" as const;

export class PreDuimpCanonicalizationError extends Error {
  readonly reasonCode = PRE_DUIMP_INVALID_CANONICAL_JSON;

  constructor(message: string) {
    super(message);
    this.name = "PreDuimpCanonicalizationError";
  }
}

function serializeCanonicalJson(value: JsonValueV1): string {
  if (value === null) return "null";

  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new PreDuimpCanonicalizationError(
        "PRE-DUIMP canonical JSON rejects non-finite numbers",
      );
    }
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return "[" + value.map(serializeCanonicalJson).join(",") + "]";
  }

  const objectValue = value as Readonly<Record<string, JsonValueV1>>;
  return (
    "{" +
    Object.keys(objectValue)
      .sort()
      .map(
        (key) =>
          JSON.stringify(key) +
          ":" +
          serializeCanonicalJson(objectValue[key]),
      )
      .join(",") +
    "}"
  );
}

export function canonicalizeGovernedJsonV1(input: unknown): string {
  const parsed = jsonValueV1Schema.safeParse(input);
  if (!parsed.success) {
    throw new PreDuimpCanonicalizationError(
      "PRE-DUIMP canonical JSON received a value outside JsonValueV1",
    );
  }
  return serializeCanonicalJson(parsed.data);
}

export function computePreDuimpGovernedCaseSnapshotHash(
  snapshot: unknown,
): string {
  const parsed = preDuimpCaseV1Schema.safeParse(snapshot);
  if (!parsed.success) {
    throw new PreDuimpCanonicalizationError(
      "PRE-DUIMP snapshot must satisfy PreDuimpCaseV1 before hashing",
    );
  }

  return (
    "sha256:" +
    createHash("sha256")
      .update(canonicalizeGovernedJsonV1(parsed.data), "utf8")
      .digest("hex")
  );
}

export function validateAndHashPreDuimpGovernedCaseSnapshot(
  snapshot: unknown,
): { snapshot: PreDuimpCaseV1; snapshotHash: string } {
  const parsed = preDuimpCaseV1Schema.safeParse(snapshot);
  if (!parsed.success) {
    throw new PreDuimpCanonicalizationError(
      "PRE-DUIMP snapshot failed the governed case contract",
    );
  }

  return {
    snapshot: parsed.data,
    snapshotHash: computePreDuimpGovernedCaseSnapshotHash(parsed.data),
  };
}
