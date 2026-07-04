import { spawnSync } from "node:child_process";

const CHECK = "check:tracked-ignored-files";

type Classification =
  | "generated_safe_to_untrack"
  | "evidence_keep"
  | "contract_keep"
  | "source_keep"
  | "unknown_review";

type Finding = {
  path: string;
  classification: Classification;
  reason: string;
  legacyAllowed: boolean;
};

const LEGACY_ALLOWED_GENERATED = new Set([
  "apps/api/uploads/31e26590-7825-47e8-aebc-6ab459479b01.pdf",
  "apps/api/uploads/33c3edbe-df4e-4d5e-8a61-0ed24191c2c6.txt",
  "apps/api/uploads/606bee44-1628-47d1-9c26-2cf838f4513d.pdf",
  "apps/api/uploads/61428e08-a13d-42cc-8d3e-32d3ca535ad6.png",
  "apps/api/uploads/64ee6870-c177-4b95-88be-4ae97de75adc.pdf",
  "apps/api/uploads/69abf67b-9404-4b0f-8660-6db5bf5f0609.png",
  "apps/api/uploads/8a3a5869-787f-480d-b6ca-5029686cb85d.txt",
  "apps/api/uploads/ef02749e-f7b2-413a-8cb1-63510c26b9d3.txt",
]);

const LEGACY_ALLOWED_UNKNOWN = new Set([
  "Backups/Agentic_1.odt",
  "Backups/Guia Interativo.odt",
  "Backups/Imagens/1.png",
  "Backups/Imagens/EIAH_0.mp4",
  "Backups/Imagens/EIAH_1.mp4",
  "Backups/Imagens/grok-video-cc8242b3-86dd-4868-856c-ba6c87279002-2.mp4",
  "Backups/Imagens/j_360.mp4",
  "Backups/Prompt_otimizador.odt",
  "Backups/RAG_Tradicional_vs_Visual.odt",
  "Backups/SISTEMA EIAH.odt",
  "Backups/agentic_2.odt",
  "Backups/comparação_1_e_2.odt",
  "Backups/construir agentes de IA sem usar código.odt",
  "Backups/custo_RAG_Hibrido.odt",
  "Backups/fluxo_x_onboarding_interativo_html.html",
  "Backups/formS_Wasapp.odt",
  "Backups/gpt-realtime_prompt.odt",
  "Backups/guia_interativo_html_billing_quotas_footer.html",
  "Backups/onboarding_web2_web3_docs.html",
  "Backups/prompt resiliente .odt",
  "Backups/prompts...odt",
  "Backups/roteiro_1.odt",
  "MODELOS_COGNIÇÃO.odt",
]);

function listTrackedIgnoredFiles() {
  const result = spawnSync(
    "git",
    ["-c", "core.quotepath=off", "ls-files", "-ci", "--exclude-standard"],
    { encoding: "utf8" },
  );

  if ((result.status ?? 1) !== 0) {
    console.error(
      JSON.stringify(
        {
          ok: false,
          check: CHECK,
          reasonCode: "TRACKED_IGNORED_GIT_COMMAND_FAILED",
          status: result.status,
          stderr: result.stderr ?? "",
          stdout: result.stdout ?? "",
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }

  const raw = result.stdout ?? "";

  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}

function classify(path: string): Omit<Finding, "legacyAllowed"> {
  if (path.startsWith("ops/evidence/")) {
    return {
      path,
      classification: "evidence_keep",
      reason: "path is under ops/evidence/** and must be preserved",
    };
  }

  if (path.startsWith("contracts/")) {
    return {
      path,
      classification: "contract_keep",
      reason: "path is under contracts/** and must be preserved",
    };
  }

  if (path.startsWith("docs/")) {
    return {
      path,
      classification: "source_keep",
      reason: "path is under docs/**; current .gitignore is broad and this is tracked source documentation",
    };
  }

  if (path.startsWith("apps/api/uploads/")) {
    return {
      path,
      classification: "generated_safe_to_untrack",
      reason: "path is under uploads/ and matches generated upload artifact policy",
    };
  }

  if (path.startsWith("Backups/")) {
    return {
      path,
      classification: "unknown_review",
      reason: "backup/manual asset tracked under ignored Backups/; requires explicit repository hygiene decision",
    };
  }

  if (/\.(odt|zip|log)$/i.test(path)) {
    return {
      path,
      classification: "unknown_review",
      reason: "ignored root artifact requires explicit review before untracking",
    };
  }

  return {
    path,
    classification: "unknown_review",
    reason: "tracked ignored path does not match a known preservation or generated rule",
  };
}

function isLegacyAllowed(path: string, classification: Classification) {
  if (classification === "generated_safe_to_untrack") {
    return LEGACY_ALLOWED_GENERATED.has(path);
  }
  if (classification === "unknown_review") {
    return LEGACY_ALLOWED_UNKNOWN.has(path);
  }
  return true;
}

function buildFindings() {
  return listTrackedIgnoredFiles().map((path) => {
    const finding = classify(path);
    return {
      ...finding,
      legacyAllowed: isLegacyAllowed(path, finding.classification),
    };
  });
}

const findings = buildFindings();

const newViolations = findings.filter(
  (finding) =>
    (finding.classification === "generated_safe_to_untrack" || finding.classification === "unknown_review")
    && !finding.legacyAllowed,
);

const summary = {
  generated_safe_to_untrack: findings.filter((entry) => entry.classification === "generated_safe_to_untrack").length,
  evidence_keep: findings.filter((entry) => entry.classification === "evidence_keep").length,
  contract_keep: findings.filter((entry) => entry.classification === "contract_keep").length,
  source_keep: findings.filter((entry) => entry.classification === "source_keep").length,
  unknown_review: findings.filter((entry) => entry.classification === "unknown_review").length,
  legacyPending:
    findings.some((entry) => entry.classification === "generated_safe_to_untrack")
    || findings.some((entry) => entry.classification === "unknown_review"),
  newViolations: newViolations.length,
};

if (newViolations.length > 0) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        check: CHECK,
        reasonCode: "NEW_TRACKED_IGNORED_FILES_DETECTED",
        summary,
        findings,
        newViolations,
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      check: CHECK,
      summary,
      findings,
    },
    null,
    2,
  ),
);
