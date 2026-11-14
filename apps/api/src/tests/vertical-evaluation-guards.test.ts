import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { verticalAccessNoticeMessage } from "../services/products/verticalAccessNotices";
import { describeEvaluationTerms, EVALUATION_MANDATORY_DECISIONS, type EvaluationTerms } from "../services/products/verticalEvaluationContract";

/**
 * Guardas ESTÁTICAS da avaliação gratuita: leem o código-fonte (sem banco, sem rede). Não provam comportamento em tempo de execução;
 * impedem que a estrutura que sustenta as proteções seja desfeita sem revisão (leitores novos, injeção em rotas, drift entre
 * migration e DDL de runtime, promessas sobre dados).
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const apiSrc = path.resolve(here, "..");
const repoRoot = path.resolve(apiSrc, "../../..");
const read = (relative: string) => readFileSync(path.resolve(apiSrc, relative), "utf8");

function walk(dir: string, out: string[] = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules" || entry === "tests") continue;
      walk(full, out);
    } else if (full.endsWith(".ts") && !full.endsWith(".test.ts")) out.push(full);
  }
  return out;
}
const sources = walk(apiSrc).map((file) => ({ file: path.relative(apiSrc, file).split(path.sep).join("/"), text: readFileSync(file, "utf8") }));

test("rotas e routers não recebem nem importam o núcleo com dependências injetáveis (oferta/decisões vêm só da produção)", () => {
  const forbidden = /\b\w+Core\b|evaluateEvaluationOffer|EvaluationDeps|PRODUCTION_EVALUATION_DEPS/;
  for (const file of ["routes/verticalAccess.ts", "routes/chatVerticals.ts", "routes/marketplace.ts", "routes/frontDoorIntake.ts", "routes/uploads.ts", "routes/agents.ts"]) {
    const text = read(file).replace(/@eiah\/core/g, "");
    assert.equal(forbidden.test(text), false, `${file} não pode referenciar o núcleo/injeção de oferta`);
  }
  // corpo de requisição nunca alimenta oferta ou decisões
  assert.equal(/req\.body[^;\n]*(offer|decisions)/i.test(read("routes/verticalAccess.ts")), false);
});

test("o único código que ratifica decisões obrigatórias é a constante versionada (nenhum setter, nenhum estado global mutável)", () => {
  const contract = read("services/products/verticalEvaluationContract.ts");
  assert.equal(/setEvaluationDecisionsForTest|NODE_TEST_CONTEXT|let\s+decisions/i.test(contract), false);
  assert.ok(EVALUATION_MANDATORY_DECISIONS.every((decision) => decision.status === "pending"));
  const production = sources.filter((entry) => /resolveEvaluationOfferState\(\s*[^)\s]/.test(entry.text) && !entry.file.endsWith("verticalEvaluationContract.ts"));
  assert.deepEqual(production.map((entry) => entry.file), [], "a composição de produção não passa decisões: só o ambiente (padrão) ou nada");
});

test("leitores do status 'aprovado' e SQL cru sobre a tabela de liberação: conjunto conhecido (leitor novo exige revisão)", () => {
  const approvedReaders = sources
    .filter((entry) => /status [!=]== "aprovado"|status = 'aprovado'/.test(entry.text))
    .map((entry) => entry.file)
    .sort();
  assert.deepEqual(approvedReaders, [
    "routes/chatVerticals.ts",
    "routes/marketplace.ts",
    "services/frontDoorAccess.ts",
    "services/logistica/control/logisticaContextAccess.ts",
    "services/products/productActivation.ts",
    "services/products/verticalAccessApproval.ts",
    "services/products/verticalEvaluationContract.ts",
    "services/products/verticalEvaluationPlans.ts",
  ]);
  const rawSql = sources.filter((entry) => entry.text.includes("vertical_access_approvals")).map((entry) => entry.file).sort();
  assert.deepEqual(rawSql, [
    "services/frontDoorAccess.ts",
    "services/products/productActivation.ts",
    "services/products/verticalAccessApproval.ts",
    "services/products/verticalEvaluation.ts",
  ]);
  // o leitor SQL fora do serviço só conta `aprovado` com grant iniciado e dentro da validade
  const frontDoor = read("services/frontDoorAccess.ts");
  assert.match(frontDoor, /grant_kind IS NULL OR \(grant_started_at IS NOT NULL AND grant_valid_until >/);
  // o leitor de Logística nega qualquer status diferente de `aprovado` (inclusive pre_ativacao e encerrado) e a avaliação é só IMOB
  assert.match(read("services/logistica/control/logisticaContextAccess.ts"), /a\.status !== "aprovado"\) return denied\("approval_required"\)/);
});

test("migration e DDL de runtime não divergem (mesmas restrições e colunas)", () => {
  const runtime = read("services/products/verticalAccessApproval.ts");
  const constant = /export const EVALUATION_CONSTRAINTS_SQL = `\n([\s\S]*?)\n`;/.exec(runtime)?.[1];
  assert.ok(constant, "constante de restrições encontrada");
  const migration = readFileSync(path.resolve(repoRoot, "packages/db/prisma/migrations/20261113120000_vertical_access_evaluation_grant_v1/migration.sql"), "utf8");
  const squash = (value: string) => value.replace(/\s+/g, " ").trim();
  assert.ok(squash(migration).includes(squash(constant!)), "a migration contém exatamente as restrições do runtime");
  const columns = ["request_context", "grant_kind", "grant_terms", "grant_terms_hash", "grant_accepted_by", "grant_accepted_at", "grant_accepted_hash", "grant_started_at", "grant_valid_until", "grant_closed_reason", "evaluation_used_at"];
  for (const column of columns) {
    assert.ok(runtime.includes(`"${column}"`), `runtime cria ${column}`);
    assert.ok(migration.includes(`"${column}"`), `migration cria ${column}`);
  }
  assert.ok(runtime.includes('"detail" JSONB') && migration.includes('"detail" JSONB'));
  // aditiva: nada é apagado nem reescrito em linhas existentes
  assert.equal(/\b(DROP TABLE|DROP COLUMN|DELETE FROM|TRUNCATE|UPDATE\s+"?vertical_access_approvals)/i.test(migration), false);
  // o schema do Prisma conhece as colunas
  const schema = readFileSync(path.resolve(repoRoot, "packages/db/prisma/schema.prisma"), "utf8");
  for (const column of columns) assert.ok(schema.includes(`@map("${column}")`), `schema.prisma mapeia ${column}`);
});

test("proteções novas só atuam com grant de avaliação: os caminhos diferidos usam o gate e o filtro, não regras próprias", () => {
  assert.match(read("workers/imobPostRunMutationWorker.ts"), /evaluationGate\.applies && !evaluationGate\.allowed/);
  assert.match(read("routes/agents.ts"), /filterActionsByEvaluationGate\(allowed/);
  assert.match(read("workers/runWorker.ts"), /filterActionsByEvaluationGate\(new Set\(dbAllowedByPolicy\)/);
  assert.match(read("workers/runWorker.ts"), /gate\.applies && !gate\.allowed/);
  assert.match(read("routes/uploads.ts"), /!gate\.applies \|\| gate\.allowed/);
  // o worker reconfere ANTES do ramo de intake e da mutação
  const worker = read("workers/imobPostRunMutationWorker.ts");
  assert.ok(worker.indexOf("evaluationGate.applies") < worker.indexOf("// Intake branch"), "a checagem precede o ramo de intake");
  assert.ok(worker.indexOf("evaluationGate.applies") < worker.indexOf("_mutationService.updateCase"), "a checagem precede a mutação");
});

test("a ativação relê e trava a concessão DENTRO da transação e captura o início do prazo depois da trava", () => {
  const activation = read("services/products/productActivation.ts");
  const tx = activation.indexOf("$transaction(async (tx)");
  const lock = activation.indexOf("lockVerticalAccessRow(client");
  const startedAt = activation.indexOf("const startedAt = deps.clock()");
  const update = activation.indexOf("SET status = 'aprovado'");
  assert.ok(tx > 0 && lock > tx && startedAt > lock && update > startedAt, "ordem: transação → trava → início do prazo → UPDATE condicional");
  assert.match(activation, /grant_started_at IS NULL\s*\n?\s*AND grant_terms_hash = \$\{termsHash\} AND grant_accepted_hash = \$\{termsHash\}/);
  // sucesso idempotente só com instalação ativa
  assert.match(activation, /installed\?\.status === "active"/);
  assert.match(activation, /after\?\.grantKind && after\.status === "aprovado" && installed\?\.status === "active"/);
});

test("o fechamento regular relê com trava, reavalia e só altera a versão avaliada do grant", () => {
  const approval = read("services/products/verticalAccessApproval.ts");
  const fn = approval.slice(approval.indexOf("async function materializeEvaluationClosure"));
  assert.match(fn, /lockVerticalAccessRow\(client/);
  assert.match(fn, /resolveEffectiveVerticalAccess\(locked, now\)\.closure/);
  assert.match(fn, /grant_terms_hash IS NOT DISTINCT FROM/);
  assert.match(fn, /grant_started_at IS NOT DISTINCT FROM/);
  assert.match(fn, /grant_valid_until IS NOT DISTINCT FROM/);
  assert.match(fn, /grant_valid_until <= \$\{now\}/);
  // não é revogação disciplinar: o status é `encerrado` e o score só conta eventos `revogado`
  assert.match(fn, /SET status = 'encerrado'/);
  assert.equal(/to_status = 'encerrado'/.test(approval), false);
});

test("novo pedido preserva a restrição do encerramento e o histórico (modo efetivo gravado, grant arquivado no evento)", () => {
  const approval = read("services/products/verticalAccessApproval.ts");
  assert.match(approval, /revocation_mode = \$\{existing\.revocationMode \?\? null\}::text/);
  assert.match(approval, /archivedGrant/);
  assert.match(approval, /status IN \('recusado', 'revogado', 'encerrado'\)/, "nunca reescreve uma linha aprovada/aberta que mudou depois da leitura");
  // grant lido como encerrado cuja linha crua ainda é 'aprovado': só é reescrito se for a MESMA versão (hash, início, validade)
  assert.match(approval, /\$\{existing\.status\}::text = 'encerrado' AND status = 'aprovado' AND grant_kind = 'evaluation'/);
  assert.match(approval, /grant_terms_hash IS NOT DISTINCT FROM \$\{existing\.grantTermsHash \?\? null\}::text/);
  assert.match(approval, /grant_started_at IS NOT DISTINCT FROM \$\{existing\.grantStartedAt \?\? null\}::timestamp/);
  assert.match(approval, /grant_valid_until IS NOT DISTINCT FROM \$\{existing\.grantValidUntil \?\? null\}::timestamp/);
  // o planejador é a fonte das decisões do pedido (nenhuma cópia inline das regras de pedido aberto/aprovado/uso da avaliação)
  assert.match(approval, /planVerticalAccessRequest\(\{ existing, evaluation: Boolean\(evaluation\)/);
  assert.equal(/OPEN_REQUEST_STATUSES\.includes/.test(approval), false, "a lista de estados abertos vem do planejador");
});

test("sem ciclo de imports novo: contrato e planejadores puros só dependem um do outro em uma direção", () => {
  const importsOf = (file: string) =>
    [...read(file).matchAll(/^import[^;]*?from "(\.\/[^"]+)";/gms)].map((match) => match[1]!.replace("./", "")).filter((name) => name !== "verticalAccessScore");
  const contract = importsOf("services/products/verticalEvaluationContract.ts");
  const plans = importsOf("services/products/verticalEvaluationPlans.ts");
  assert.deepEqual(contract, [], "o contrato puro não importa nenhum módulo interno (só tipo de score, apagado em runtime)");
  assert.deepEqual(plans, ["verticalEvaluationContract"], "os planejadores só importam o contrato");
});

test("textos ao usuário não prometem preservação nem acesso a dados depois do término (política não definida)", () => {
  const closed = verticalAccessNoticeMessage("avaliacao_encerrada", "IMOB");
  assert.equal(closed, "A avaliação do IMOB neste workspace foi encerrada. Consulte aqui na conversa as condições de encerramento e de acesso aos dados.");
  assert.equal(/preserv|apagad|exclu/i.test(closed), false);
  const proposed = verticalAccessNoticeMessage("avaliacao_termos_propostos", "IMOB");
  assert.match(proposed, /só a proposta: nada foi aceito nem ativado/);
  assert.match(proposed, /aceitar as condições e confirmar a ativação/);
  const terms = { conditions: { version: "c1" }, objective: "o", expectedOutcome: "e", allowedActions: ["a"], durationDays: 5, closureMode: "bloqueio_total" } as unknown as EvaluationTerms;
  for (const mode of ["bloqueio_total", "somente_leitura"] as const) {
    const text = describeEvaluationTerms({ ...terms, closureMode: mode }, "Condições.").join("\n");
    assert.equal(/preserv|apagad|exclu/i.test(text), false, mode);
    assert.match(text, /não gera cobrança nem contratação automática/);
    assert.match(text, /contados a partir da ativação efetiva \(não da aprovação nem do aceite\)/);
  }
});

test("a avaliação não escreve ledger, fatura, pagamento nem permissões de membro", () => {
  for (const file of ["services/products/verticalEvaluation.ts", "services/products/verticalEvaluationContract.ts", "services/products/verticalEvaluationPlans.ts"]) {
    const text = read(file);
    assert.equal(/billing_ledger|tenant_invoice|payment_intents|tenant_billing_account|eiah_workspace_memberships|settleWithProvider/.test(text), false, file);
  }
});
