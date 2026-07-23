import fs from "node:fs";
import path from "node:path";

const CHECK = "check:mcp-contract-drift";
const REASON_CODE = "MCP_CONTRACT_DRIFT";

type Violation = {
  message: string;
  file?: string;
  field?: string;
  details?: Record<string, unknown>;
};

const TOOL_CONTRACT_FILE = "packages/mcp-runner/src/types/ToolContract.ts";
const MCP_EXECUTOR_FILE = "packages/mcp-runner/src/executor/MCPExecutor.ts";
const RUN_WORKER_FILE = "apps/api/src/workers/runWorker.ts";
const RUN_WORKER_ACTION_RESOLUTION_FILE =
  "apps/api/src/workers/runWorkerActionResolution.ts";
const IMOB_CANONICAL_FILE = "apps/api/src/services/imob/imobCanonical.ts";
const MCP_ADAPTER_FILE = "apps/workers/action-runner/src/services/mcpAdapter.ts";
const MCP_ENFORCEMENT_FILE = "apps/workers/action-runner/src/services/mcpEnforcement.ts";
const AGENT_ORCHESTRATOR_FILE = "packages/core/src/orchestrator/agentOrchestrator.ts";
const INTENT_VALIDATOR_FILE = "apps/api/src/services/intentValidator.ts";
const MCP_GOVERNANCE_ENV_HELPER_FILE = "packages/core/src/services/mcpGovernanceEnv.ts";

// PR MCP-1C — guard v1: bloqueia drift silencioso entre ToolContract, os
// modos de MCPExecutor, os call sites de runtime de @repo/mcp-runner, o
// fail-closed de contrato ausente, a defesa historica de outputs simulados e os
// parsers duplicados dos env vars de governanca MCP. Nao cria doc canonica,
// nao introduz tipo compartilhado, nao consolida os parsers de env — apenas
// detecta quando um desses pontos se move sem decisao explicita (allowlist
// atualizada). Segue o mesmo padrao ja usado em checkArchChatContracts.ts.
//
// PR MCP-1F — os 4 call sites abaixo foram consolidados para chamar o helper
// puro packages/core/src/services/mcpGovernanceEnv.ts em vez de ler
// process.env diretamente. O helper e o unico arquivo autorizado a conter os
// literais process.env.MCP_ENFORCE_CONTRACTS/MCP_PROXY_ALL_ACTIONS; os 4 call
// sites agora sao verificados por uma checagem positiva separada (import do
// helper presente), para nao criar falso negativo quando pararam de conter
// esses literais.

// Item 4: unico consumidor autorizado de MCPExecutor/ToolRegistry fora do
// proprio packages/mcp-runner/src. Novo call site exige atualizar esta lista.
const ALLOWED_MCP_EXECUTOR_CONSUMERS = new Set(
  [MCP_ADAPTER_FILE, RUN_WORKER_FILE].map((file) => path.normalize(file))
);

// Item 6: unico arquivo autorizado a fazer parsing bruto de
// MCP_ENFORCE_CONTRACTS/MCP_PROXY_ALL_ACTIONS via process.env. Novo parser
// bruto exige atualizar esta lista — o objetivo nao e permitir reintroducao
// de duplicacao, so impedir que um parser bruto apareca sem decisao
// consciente.
const ALLOWED_MCP_ENV_PARSERS = new Set(
  [MCP_GOVERNANCE_ENV_HELPER_FILE].map((file) => path.normalize(file))
);

// Item 6b (MCP-1F): call sites que devem consumir o helper canonico em vez de
// parsing bruto. Novo call site exige atualizar esta lista.
const EXPECTED_MCP_GOVERNANCE_ENV_HELPER_CONSUMERS = new Set(
  [MCP_ENFORCEMENT_FILE, RUN_WORKER_FILE, AGENT_ORCHESTRATOR_FILE, INTENT_VALIDATOR_FILE].map((file) =>
    path.normalize(file)
  )
);

const SCAN_ROOTS = ["apps/api/src", "apps/web/src", "apps/workers", "packages/core/src"];

function fail(violations: Violation[]): never {
  console.error(
    JSON.stringify(
      {
        ok: false,
        reasonCode: REASON_CODE,
        check: CHECK,
        violations,
      },
      null,
      2
    )
  );
  process.exit(1);
}

function readFile(file: string, violations: Violation[]): string | null {
  const abs = path.resolve(file);
  if (!fs.existsSync(abs)) {
    violations.push({ message: "mcp_guarded_file_missing", file });
    return null;
  }
  return fs.readFileSync(abs, "utf8");
}

function sourceFiles(root: string): string[] {
  if (!fs.existsSync(root)) return [];

  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist") return [];
      return sourceFiles(file);
    }
    return /\.(ts|tsx)$/.test(entry.name) ? [file] : [];
  });
}

function isOperationalSource(file: string) {
  return (
    !file.includes(`${path.sep}tests${path.sep}`) &&
    !file.includes(`${path.sep}types${path.sep}`) &&
    !/\.test\.(ts|tsx)$/.test(file)
  );
}

function sameStringSet(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value) => right.includes(value));
}

// Remove comentarios de bloco e de linha antes de casar os padroes abaixo —
// evita falso positivo quando "mcpGovernanceEnv" ou um nome de funcao
// parseMcp* aparece apenas em comentario/TODO, nao em import ou uso real.
// Nao e um parser real (nao lida com "//" dentro de strings), suficiente
// para os 4 arquivos conhecidos escaneados aqui.
function stripComments(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

const MCP_GOVERNANCE_ENV_HELPER_MODULE_NAME = path.basename(
  MCP_GOVERNANCE_ENV_HELPER_FILE,
  path.extname(MCP_GOVERNANCE_ENV_HELPER_FILE)
);
const MCP_GOVERNANCE_ENV_HELPER_IMPORT_PATTERN = new RegExp(
  `from\\s*["'][^"']*${MCP_GOVERNANCE_ENV_HELPER_MODULE_NAME}["']`
);
const MCP_GOVERNANCE_ENV_HELPER_FUNCTION_PATTERN =
  /\bparseMcp(?:EnforceContractsEnv|ProxyAllActionsEnv|DefaultVersionEnv)\b/;

const violations: Violation[] = [];

// ---------------------------------------------------------------------------
// Itens 1-3: ToolContract.executor (union) vs. MCPExecutor.run() (switch)
// ---------------------------------------------------------------------------

const toolContractSrc = readFile(TOOL_CONTRACT_FILE, violations);
const mcpExecutorSrc = readFile(MCP_EXECUTOR_FILE, violations);

if (toolContractSrc && mcpExecutorSrc) {
  const executorFieldMatch = toolContractSrc.match(/executor:\s*((?:"[a-zA-Z0-9_]+"\s*\|?\s*)+);/);
  if (!executorFieldMatch) {
    violations.push({
      message: "mcp_tool_contract_executor_union_not_found",
      file: TOOL_CONTRACT_FILE,
    });
  } else {
    const contractModes = [...executorFieldMatch[1].matchAll(/"([a-zA-Z0-9_]+)"/g)].map((m) => m[1]);
    const executorCases = [...mcpExecutorSrc.matchAll(/case\s+"([a-zA-Z0-9_]+)"\s*:/g)].map((m) => m[1]);

    if (contractModes.length === 0) {
      violations.push({
        message: "mcp_tool_contract_executor_union_empty",
        file: TOOL_CONTRACT_FILE,
      });
    }
    if (executorCases.length === 0) {
      violations.push({
        message: "mcp_executor_switch_cases_not_found",
        file: MCP_EXECUTOR_FILE,
      });
    }
    if (
      contractModes.length > 0 &&
      executorCases.length > 0 &&
      !sameStringSet(contractModes, executorCases)
    ) {
      violations.push({
        message: "mcp_executor_modes_drift",
        details: {
          toolContractFile: TOOL_CONTRACT_FILE,
          toolContractModes: contractModes,
          mcpExecutorFile: MCP_EXECUTOR_FILE,
          mcpExecutorCases: executorCases,
        },
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Item 5: fail-closed de contrato ausente + defesa historica de simulated
// ---------------------------------------------------------------------------

const runWorkerSrc = readFile(RUN_WORKER_FILE, violations);
const runWorkerActionResolutionSrc = readFile(
  RUN_WORKER_ACTION_RESOLUTION_FILE,
  violations
);
const imobCanonicalSrc = readFile(IMOB_CANONICAL_FILE, violations);

if (
  runWorkerSrc &&
  (!runWorkerSrc.includes("MissingToolContractError") ||
    !runWorkerSrc.includes("recordMissingToolContractAudit"))
) {
  violations.push({
    message: "mcp_missing_contract_fail_closed_runtime_missing",
    file: RUN_WORKER_FILE,
    details: {
      expectedTokens: [
        "MissingToolContractError",
        "recordMissingToolContractAudit",
      ],
    },
  });
}
if (
  runWorkerActionResolutionSrc &&
  (!runWorkerActionResolutionSrc.includes("MCP_TOOL_CONTRACT_MISSING") ||
    !runWorkerActionResolutionSrc.includes("mcp.tool.missing_contract"))
) {
  violations.push({
    message: "mcp_missing_contract_canonical_contract_missing",
    file: RUN_WORKER_ACTION_RESOLUTION_FILE,
    details: {
      expectedTokens: [
        "MCP_TOOL_CONTRACT_MISSING",
        "mcp.tool.missing_contract",
      ],
    },
  });
}
if (imobCanonicalSrc && !imobCanonicalSrc.includes("simulated")) {
  violations.push({
    message: "mcp_historical_simulated_defense_missing",
    file: IMOB_CANONICAL_FILE,
    details: { expectedToken: "simulated" },
  });
}

// ---------------------------------------------------------------------------
// Itens 4 e 6: varredura de call sites de MCPExecutor/ToolRegistry e de
// parsers de env de governanca MCP, comparados contra allowlists explicitas.
// ---------------------------------------------------------------------------

const operationalSources = SCAN_ROOTS.flatMap((root) => sourceFiles(root)).filter(isOperationalSource);

for (const file of operationalSources) {
  const content = fs.readFileSync(file, "utf8");
  const normalized = path.normalize(file);

  if (
    !ALLOWED_MCP_EXECUTOR_CONSUMERS.has(normalized) &&
    (content.includes("MCPExecutor") || content.includes("ToolRegistry"))
  ) {
    violations.push({
      message: "mcp_executor_toolregistry_callsite_requires_explicit_decision",
      file,
    });
  }

  if (
    !ALLOWED_MCP_ENV_PARSERS.has(normalized) &&
    (content.includes("process.env.MCP_ENFORCE_CONTRACTS") ||
      content.includes("process.env.MCP_PROXY_ALL_ACTIONS"))
  ) {
    violations.push({
      message: "mcp_governance_env_parser_requires_explicit_decision",
      file,
    });
  }
}

// ---------------------------------------------------------------------------
// Item 6b (MCP-1F): cada call site esperado precisa (a) importar de fato o
// helper canonico de packages/core/src/services/mcpGovernanceEnv.ts e (b)
// usar pelo menos uma das funcoes parseMcp*Env exportadas por ele. Evita
// falso negativo: como os call sites nao contem mais os literais
// process.env.* diretamente, a checagem acima sozinha nao detectaria
// regressao para parsing inline duplicado nem remocao silenciosa do uso do
// helper. As duas condicoes sao casadas apos stripComments() para nao passar
// quando "mcpGovernanceEnv"/"parseMcp*" aparecem so em comentario.
// ---------------------------------------------------------------------------

for (const file of EXPECTED_MCP_GOVERNANCE_ENV_HELPER_CONSUMERS) {
  const content = readFile(file, violations);
  if (!content) continue;

  const withoutComments = stripComments(content);
  const hasHelperImport = MCP_GOVERNANCE_ENV_HELPER_IMPORT_PATTERN.test(withoutComments);
  const hasHelperFunctionUsage = MCP_GOVERNANCE_ENV_HELPER_FUNCTION_PATTERN.test(withoutComments);

  if (!hasHelperImport || !hasHelperFunctionUsage) {
    violations.push({
      message: "mcp_governance_env_helper_usage_missing",
      file,
      details: {
        expectedHelper: MCP_GOVERNANCE_ENV_HELPER_FILE,
        hasHelperImport,
        hasHelperFunctionUsage,
      },
    });
  }
}

if (violations.length > 0) {
  fail(violations);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      check: CHECK,
      toolContractFile: TOOL_CONTRACT_FILE,
      mcpExecutorFile: MCP_EXECUTOR_FILE,
      allowedMcpExecutorConsumers: [...ALLOWED_MCP_EXECUTOR_CONSUMERS],
      allowedMcpEnvParsers: [...ALLOWED_MCP_ENV_PARSERS],
      expectedMcpGovernanceEnvHelperConsumers: [...EXPECTED_MCP_GOVERNANCE_ENV_HELPER_CONSUMERS],
      missingContractFailClosed: [
        RUN_WORKER_FILE,
        RUN_WORKER_ACTION_RESOLUTION_FILE,
      ],
      historicalSimulatedDefense: IMOB_CANONICAL_FILE,
      scanRoots: SCAN_ROOTS,
      operationalSourcesScanned: operationalSources.length,
    },
    null,
    2
  )
);
