import { createHash } from "node:crypto";
import { oraculoCredentialContentV1Schema, oraculoGateIntentV1Schema, oraculoGateApprovalContextV1Schema } from "@eiah/contracts";

function points(a: string, b: string): number {
  const aa = Array.from(a, c => c.codePointAt(0)!); const bb = Array.from(b, c => c.codePointAt(0)!);
  for (let i = 0; i < Math.min(aa.length, bb.length); i++) if (aa[i] !== bb[i]) return aa[i] - bb[i];
  return aa.length - bb.length;
}
function quoted(s: string): string {
  let out = '"';
  for (const c of s) {
    const n = c.codePointAt(0)!;
    if (n >= 0xd800 && n <= 0xdfff) throw new Error("invalid Unicode");
    out += n < 32 ? "\\u" + n.toString(16).padStart(4, "0") : c === '"' ? '\\"' : c === "\\" ? "\\\\" : c;
  }
  return out + '"';
}
/** Validated values only. Raw JSON duplicate-key detection belongs to the future transport. */
export function canonicalize(value: unknown): string {
  const active = new Set<object>();
  function visit(v: unknown): string {
    if (v === null) return "null";
    if (typeof v === "string") return quoted(v);
    if (typeof v === "boolean") return String(v);
    if (typeof v === "number" && Number.isSafeInteger(v)) return String(v === 0 ? 0 : v);
    if (typeof v !== "object" || active.has(v)) throw new Error("unsupported canonical value");
    if (!Array.isArray(v) && Object.getPrototypeOf(v) !== Object.prototype && Object.getPrototypeOf(v) !== null) throw new Error("plain JSON required");
    active.add(v);
    try {
      if (Reflect.ownKeys(v).some(k => typeof k === "symbol")) throw new Error("symbol key");
      if (Array.isArray(v)) {
        if (Object.keys(v).length !== v.length) throw new Error("sparse or extended array");
        return "[" + Array.from(v, visit).join(",") + "]";
      }
      return "{" + Object.keys(v).sort(points).map(k => {
        const d = Object.getOwnPropertyDescriptor(v, k)!;
        if (!("value" in d)) throw new Error("accessor not JSON");
        return quoted(k) + ":" + visit(d.value);
      }).join(",") + "}";
    } finally { active.delete(v); }
  }
  return visit(value);
}
export const hashArtifact = (bytes: Uint8Array): string => "sha256:" + createHash("sha256").update(bytes).digest("hex");
const digest = (value: unknown) => hashArtifact(Buffer.from(canonicalize(value), "utf8"));
const sorted = (values: unknown[]) => [...values].sort((a, b) => Buffer.compare(Buffer.from(canonicalize(a)), Buffer.from(canonicalize(b))));
function normalizeSets<T extends object>(v: T): T {
  const out = { ...v } as Record<string, unknown>;
  for (const k of ["credentialRefs", "evidenceRefs", "snapshotRefs", "reviewedObservationRefs", "policyRefs"]) if (Array.isArray(out[k])) out[k] = sorted(out[k] as unknown[]);
  return out as T;
}
export function hashContent(input: unknown): string {
  const { contentHash: _hash, artifactRef: _artifact, ...projection } = oraculoCredentialContentV1Schema.parse(input);
  return digest(projection);
}
export function hashIntent(input: unknown): string {
  const { actorRef: _actor, receivedAt: _time, ...projection } = oraculoGateIntentV1Schema.parse(input);
  return digest(normalizeSets(projection));
}
export function normalizeApprovalContext(input: unknown) { return normalizeSets(oraculoGateApprovalContextV1Schema.parse(input)); }
export function hashApprovalContext(input: unknown): string { return digest(normalizeApprovalContext(input)); }
