/* global console, process */

import { createHash, randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const ESCALATION_REASON_CODE = "NOTIFICATION_NON_DELIVERY_ESCALATION";
export const BLOCKING_REASON_CODES = {
  freeze: "NOTIFICATION_BLOCKED_FREEZE",
  secretProvenance: "NOTIFICATION_BLOCKED_SECRET_PROVENANCE",
  reasonCodeMissing: "NOTIFICATION_BLOCKED_REASON_CODE_MISSING",
  runMissing: "NOTIFICATION_BLOCKED_RUN_MISSING",
} as const;

const DEFAULT_MANIFEST = "ops/evidence/latest/high-e2e-manifest.json";
const DEFAULT_CATALOG = "docs/ops/reason-codes-catalog.md";
const DEFAULT_OUTPUT_DIR = "artifacts/e2e-high-escalation";

type ScenarioResult = { status?: unknown };
type Manifest = {
  generatedAt?: unknown;
  scenarioResults?: ScenarioResult[];
};

export type DeliveryReceipt = {
  id: string;
  hash: string;
  reasonCode: string | null;
  timestamp: string;
  channel: "email";
  dryRun: false;
  blockingCondition: string;
};

export type EmailGate = {
  eligible: boolean;
  blockingCondition: string | null;
};

export type EscalationPlan = {
  status: "delivery-confirmed" | "non-delivery";
  reportDate: string;
  reasonCode: string | null;
  readableReason: string | null;
  authenticatedLink: string;
  notice: string | null;
  blockingCondition: string | null;
  github: {
    surfaceIssue: boolean;
    title: string | null;
  };
  email: {
    eligible: boolean;
    transmit: false;
    blockingCondition: string | null;
    receipt: DeliveryReceipt | null;
  };
};

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function assertReportDate(value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("reportDate must use YYYY-MM-DD");
  }
}

function assertAuthenticatedGithubLink(value: string): void {
  const parsed = new URL(value);
  if (
    parsed.protocol !== "https:" ||
    parsed.hostname !== "github.com" ||
    !/^\/[^/]+\/[^/]+\/actions\/runs\/\d+/.test(parsed.pathname)
  ) {
    throw new Error("authenticatedLink must identify a GitHub Actions run");
  }
}

export function catalogContainsReasonCode(catalog: string, reasonCode: string): boolean {
  return catalog.includes(`\`${reasonCode}\``);
}

export function manifestConfirmsDelivery(manifest: Manifest | null, reportDate: string): boolean {
  if (!manifest || typeof manifest.generatedAt !== "string") return false;
  if (!manifest.generatedAt.startsWith(reportDate)) return false;
  if (!Array.isArray(manifest.scenarioResults) || manifest.scenarioResults.length < 2) return false;
  return manifest.scenarioResults.every((scenario) => scenario.status === "passed");
}

export function evaluateEmailGate(input: {
  googleProvenanceConfirmed: boolean;
  reasonCodeRatified: boolean;
  send: boolean;
}): EmailGate {
  if (!input.reasonCodeRatified) {
    return { eligible: false, blockingCondition: "reason-code-missing-escalation" };
  }
  if (!input.googleProvenanceConfirmed) {
    return { eligible: false, blockingCondition: "email-secret-provenance-unconfirmed" };
  }
  if (!input.send) {
    return { eligible: false, blockingCondition: "email-send-not-explicitly-enabled" };
  }
  return { eligible: true, blockingCondition: null };
}

export function buildEscalationPlan(input: {
  reportDate: string;
  authenticatedLink: string;
  manifest: Manifest | null;
  reasonCodeRatified: boolean;
  googleProvenanceConfirmed: boolean;
  sendEmail: boolean;
  now?: Date;
}): EscalationPlan {
  assertReportDate(input.reportDate);
  assertAuthenticatedGithubLink(input.authenticatedLink);

  if (manifestConfirmsDelivery(input.manifest, input.reportDate)) {
    return {
      status: "delivery-confirmed",
      reportDate: input.reportDate,
      reasonCode: null,
      readableReason: null,
      authenticatedLink: input.authenticatedLink,
      notice: null,
      blockingCondition: null,
      github: { surfaceIssue: false, title: null },
      email: {
        eligible: false,
        transmit: false,
        blockingCondition: "notice-not-required",
        receipt: null,
      },
    };
  }

  const reasonCode = input.reasonCodeRatified ? ESCALATION_REASON_CODE : null;
  const readableReason = input.reasonCodeRatified
    ? "execução ou relatório E2E HIGH indisponível"
    : "execução ou relatório indisponível; código canônico de escalonamento pendente";
  const notice =
    `EIAH — Relatório E2E HIGH de ${input.reportDate} NÃO será entregue. ` +
    `Motivo: ${readableReason}. Detalhes e decisão: ${input.authenticatedLink}.`;
  const emailGate = evaluateEmailGate({
    googleProvenanceConfirmed: input.googleProvenanceConfirmed,
    reasonCodeRatified: input.reasonCodeRatified,
    send: input.sendEmail,
  });
  const emailBlockingCondition = emailGate.eligible
    ? "email-provider-unavailable"
    : emailGate.blockingCondition;
  const timestamp = (input.now ?? new Date()).toISOString();

  return {
    status: "non-delivery",
    reportDate: input.reportDate,
    reasonCode,
    readableReason,
    authenticatedLink: input.authenticatedLink,
    notice,
    blockingCondition: input.reasonCodeRatified
      ? "e2e-high-run-missing-or-unsuccessful"
      : "escalation-reason-code-pending",
    github: {
      surfaceIssue: true,
      title: `E2E HIGH ${input.reportDate}: aviso de não entrega`,
    },
    email: {
      eligible: emailGate.eligible,
      transmit: false,
      blockingCondition: emailBlockingCondition,
      receipt: {
        id: randomUUID(),
        hash: sha256(notice),
        reasonCode,
        timestamp,
        channel: "email",
        dryRun: false,
        blockingCondition: emailBlockingCondition ?? "email-delivery-blocked",
      },
    },
  };
}

async function readManifest(file: string): Promise<Manifest | null> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as Manifest;
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT") return null;
    throw error;
  }
}

async function runCli(): Promise<void> {
  const reportDate = process.env.REPORT_DATE || new Date().toISOString().slice(0, 10);
  const repository = process.env.GITHUB_REPOSITORY;
  const runId = process.env.GITHUB_RUN_ID;
  if (!repository || !runId) throw new Error("GitHub Actions run identity is required");

  const catalog = await readFile(process.env.REASON_CODES_CATALOG ?? DEFAULT_CATALOG, "utf8");
  const reasonCodeRatified =
    catalogContainsReasonCode(catalog, ESCALATION_REASON_CODE) &&
    Object.values(BLOCKING_REASON_CODES).every((code) => catalogContainsReasonCode(catalog, code));
  const plan = buildEscalationPlan({
    reportDate,
    authenticatedLink: `https://github.com/${repository}/actions/runs/${runId}`,
    manifest: await readManifest(process.env.E2E_MANIFEST_PATH ?? DEFAULT_MANIFEST),
    reasonCodeRatified,
    googleProvenanceConfirmed: process.env.GOOGLE_PROVENANCE_CONFIRMED === "true",
    sendEmail: process.env.SEND_EMAIL === "true",
  });

  const outputDir = process.env.ESCALATION_OUTPUT_DIR ?? DEFAULT_OUTPUT_DIR;
  await mkdir(outputDir, { recursive: true, mode: 0o700 });
  const planFile = path.join(outputDir, "escalation-plan.json");
  await writeFile(planFile, `${JSON.stringify(plan, null, 2)}\n`, { mode: 0o600 });

  if (process.env.GITHUB_OUTPUT) {
    await appendFile(
      process.env.GITHUB_OUTPUT,
      `plan_file=${planFile}\nshould_surface_issue=${String(plan.github.surfaceIssue)}\n`,
    );
  }

  console.log(
    JSON.stringify({
      status: plan.status,
      reportDate: plan.reportDate,
      blockingCondition: plan.blockingCondition,
      githubIssueRequired: plan.github.surfaceIssue,
      emailEligible: plan.email.eligible,
      emailTransmit: false,
      emailBlockingCondition: plan.email.blockingCondition,
    }),
  );
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  runCli().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "escalation planning failed");
    process.exitCode = 1;
  });
}
