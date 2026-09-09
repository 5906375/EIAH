# PRE-DUIMP-DISCOVERY-02 — RFC dos contratos governados e ownership

| Campo normativo | Valor |
| --- | --- |
| Versão | 1.0-proposta |
| Data | 2026-09-09 |
| Status | PROPOSTA |
| Maturidade | V0_DISCOVERY |
| Vertical pública | Logística & Comex |
| Owner lógico do caso | Oráculo SC |
| Execução | Não autorizada por este RFC |
| Integração Siscomex/Portal Único | Fora de escopo |

## 1. Objetivo

Este RFC decide a forma e o ownership dos contratos necessários para uma futura
Pré-DUIMP governada. Ele não implementa contratos TypeScript, persistência,
runtime, adapter, transmissão, credencial, migration, seed, fixture ou interface.

O documento preserva:

~~~text
suggestion != authority
readiness != authorization
prepare != submit
regulatory_rule != corporate_policy
~~~

A cadeia-alvo permanece:

~~~text
fontes read-only
  -> GovernedCaseV1
  -> FactV1 + ProvenanceV1
  -> inconsistências
  -> regras regulatórias
  -> políticas corporativas
  -> risco
  -> decisões humanas de revisão
  -> BLOCK | REVIEW | READY
  -> autorização futura e separada
  -> adapter futuro e separado
  -> sistema oficial
  -> receipt/evidence/event
~~~

Este RFC termina no gate de prontidão. Tudo a partir da autorização futura
permanece fora de escopo.

## 2. Precedência e restrições

Aplicam-se, nesta ordem:

1. ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md, seção 15;
2. AGENTS.md;
3. docs/architecture/agent-chat-runtime.md;
4. docs/EVIDENCE_INDEX.md;
5. IA_EIAH.md.

Restrições:

- PRE_DUIMP continua PARCIAL, local e sem transmissão externa;
- o RFC é PROPOSTA e não constitui evidência operacional;
- Logística & Comex continua sendo a vertical pública;
- o Oráculo SC é owner lógico do caso, não autorização para novo runtime;
- identidade, tenant, workspace, entitlement, scope, policy e autoridade nunca
  vêm de payload não confiável;
- ausência, erro, conflito ou estado desconhecido falham fechado;
- nenhum dado real, credencial real ou chamada a Siscomex/Portal Único entra
  nesta fase.

## 3. Inventário e decisão de reuso

| Candidato existente | Estado observado | Decisão |
| --- | --- | --- |
| packages/contracts | pacote compartilhado, Zod/TypeScript, layout plano | **Estender** com contratos serializáveis |
| preDuimpContextContract.ts | contexto shadow atual | **Preservar**; não é o agregado governado |
| preDuimpAccessContract.ts e preDuimpAccessResolver.ts | entitlement/policy workspace-exact | **Reutilizar/adaptar** na entrada do caso |
| preDuimpActionCatalog.ts | catálogo atual de create/review | **Preservar**; não autoriza submit |
| preDuimpReplayContract.ts | semântica pura, sem persistência/atomicidade | **Reutilizar como referência** |
| TenantPolicyStore | policy server-side, workspace-exact | **Reutilizar** para policy corporativa, não para regra regulatória |
| knowledgeGate.ts | conceitos de fonte, fatos e provenance | **Adaptar conceitos**; shape atual não é o caso |
| ApprovalRecord Prisma | sem binding completo e sem consumidor canônico nomeado | **Não adotar como autoridade PRE_DUIMP** |
| Receipt Canon v1 | centrado em runId/txId | **Preservar**; extensão exige RFC próprio |
| buildRunEvidenceBundle | bundle centrado em Run | **Preservar**; não criar Run falso |
| Run/RunEvent | execução e eventos de execução | **Relacionar**, sem dar ownership do caso |
| adapter Siscomex | não encontrado e proibido no recorte | **Não criar** |

## 4. Localização e ownership

Contratos genéricos, quando implementados:

~~~text
packages/contracts/src/governance.ts
~~~

Especialização PRE_DUIMP e DTOs de snapshot:

~~~text
packages/contracts/src/preDuimp.ts
~~~

Ambos serão exportados pelo barrel packages/contracts/src/index.ts. A escolha
mantém o layout plano real do pacote e evita tipos paralelos em frontend e API.

Ports assíncronos de leitura são boundary da aplicação e viverão em:

~~~text
apps/api/src/services/logistica/ports/preDuimpSourcePort.ts
~~~

| Superfície | Owner de boundary | Pode decidir | Não pode decidir |
| --- | --- | --- | --- |
| contratos genéricos | Core / Governança de contratos | shape, versão e invariantes comuns | regra DUIMP específica |
| caso e gate | Logística & Comex / Oráculo SC | composição e prontidão | autorização externa ou submit |
| regra regulatória | catálogo regulatório versionado | conformidade jurídica aplicável | policy interna |
| política corporativa | tenant/workspace policy | allow/deny/review corporativo | alterar regra regulatória |
| risco | avaliador determinístico versionado | nível e fatores | conceder autoridade |
| revisão humana | autoridade vinculada ao subject | resolver review exata | aprovar outro caso/ação |
| UI | frontend render-only | exibir estado recebido | calcular gate, policy, risco ou authority |
| adapter externo | integração futura separada | executar após autorização válida | preparar como se autorizado |

Esses são owners de componente. Pessoas responsáveis continuam pendentes de
ratificação humana e não são inventadas neste RFC.

## 5. Contratos genéricos propostos

Os blocos são a forma normativa para task posterior. Schemas Zod deverão ser
strict e validar os invariantes não expressos por TypeScript.

~~~ts
export type JsonPrimitiveV1 = string | number | boolean | null;
export type JsonValueV1 =
  | JsonPrimitiveV1
  | readonly JsonValueV1[]
  | { readonly [key: string]: JsonValueV1 };

export type ImmutableArtifactRefV1 = {
  schemaVersion: "artifact-ref.v1";
  artifactType: "source_snapshot" | "run" | "receipt" | "evidence" | "event";
  artifactId: string;
  contentHash?: string;
  location?: string;
};

export type SourceSnapshotRefV1 = {
  schemaVersion: "source-snapshot-ref.v1";
  sourceId: string;
  sourceRole:
    | "CASE_INPUT"
    | "CORPORATE_MASTER_DATA"
    | "REGULATORY_CORPUS"
    | "REFERENCE_DATA";
  authorityClass: "PRIMARY" | "SECONDARY" | "ADVISORY";
  capturedAt: string;
  sourceVersion?: string;
  contentHash: string;
  locator?: string;
};

export type ProvenanceV1 = {
  schemaVersion: "provenance.v1";
  sourceSnapshots: readonly SourceSnapshotRefV1[];
  derivation: {
    method: "DIRECT" | "DETERMINISTIC_TRANSFORM" | "HUMAN_ATTESTED";
    methodVersion: string;
    inputFactIds: readonly string[];
  };
};

type FactBaseV1<TKey extends string> = {
  schemaVersion: "fact.v1";
  factId: string;
  namespace: string;
  key: TKey;
  observedAt: string;
  effectiveAt?: string;
  sensitivity: "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "RESTRICTED";
  provenance: ProvenanceV1;
};

export type FactV1<TKey extends string, TValue extends JsonValueV1 = JsonValueV1> =
  | (FactBaseV1<TKey> & {
      status: "OBSERVED" | "DERIVED" | "HUMAN_ATTESTED";
      value: TValue;
    })
  | (FactBaseV1<TKey> & { status: "MISSING"; value: null })
  | (FactBaseV1<TKey> & { status: "DISPUTED"; value: TValue | null });
~~~

Regras:

- contentHash é SHA-256 lowercase; não autoriza publicar conteúdo;
- locator não contém segredo, token, header ou PII não mascarada;
- DIRECT exige snapshot; DETERMINISTIC_TRANSFORM exige versão e inputs;
- HUMAN_ATTESTED exige decisão humana referenciada;
- MISSING sempre tem value null;
- confiança probabilística é risco, não provenance ou autoridade.

### 5.1 Inconsistências

~~~ts
export type SourceInconsistencyV1 = {
  schemaVersion: "source-inconsistency.v1";
  inconsistencyId: string;
  factKey: string;
  factIds: readonly string[];
  kind:
    | "VALUE_CONFLICT"
    | "MISSING_REQUIRED_FACT"
    | "SOURCE_SCOPE_MISMATCH"
    | "STALE_OBSERVATION"
    | "INVALID_FORMAT"
    | "PROVENANCE_GAP";
  severity: "BLOCK" | "REVIEW";
  status: "OPEN" | "RESOLVED_BY_HUMAN" | "SUPERSEDED";
  reasonCode: string;
  resolutionAuthorityRef?: ImmutableArtifactRefV1;
};
~~~

Inconsistência BLOCK aberta bloqueia sempre. Inconsistência REVIEW só deixa de
exigir revisão com resolução humana válida e vinculada aos mesmos inputs.

### 5.2 Regra regulatória e política corporativa

~~~ts
export type RegulatoryRuleEvaluationV1 = {
  schemaVersion: "regulatory-rule-evaluation.v1";
  evaluationId: string;
  ruleId: string;
  ruleVersion: string;
  jurisdiction: string;
  legalSourceRefs: readonly SourceSnapshotRefV1[];
  inputFactIds: readonly string[];
  outcome: "COMPLIANT" | "NON_COMPLIANT" | "UNKNOWN" | "NOT_APPLICABLE";
  reasonCodes: readonly string[];
  evaluatedAt: string;
};

export type CorporatePolicyEvaluationV1 = {
  schemaVersion: "corporate-policy-evaluation.v1";
  evaluationId: string;
  policyId: string;
  policyVersion: string;
  tenantId: string;
  workspaceId: string;
  inputFactIds: readonly string[];
  outcome: "ALLOW" | "DENY" | "REVIEW" | "NOT_APPLICABLE";
  reasonCodes: readonly string[];
  evaluatedAt: string;
};
~~~

Regra regulatória referencia fonte legal versionada. Policy corporativa é
escopada por tenant/workspace. Um resultado não sobrescreve nem se converte no
outro.

### 5.3 Risco

~~~ts
export type RiskAssessmentV1 = {
  schemaVersion: "risk-assessment.v1";
  assessmentId: string;
  methodVersion: string;
  inputHash: string;
  level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | "UNKNOWN";
  score?: number;
  factors: readonly {
    factorId: string;
    level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | "UNKNOWN";
    reasonCode: string;
    factIds: readonly string[];
    evaluationIds: readonly string[];
  }[];
  evaluatedAt: string;
};
~~~

Risco é avaliação determinística e versionada. Pode elevar a REVIEW ou BLOCK,
mas nunca produzir ALLOW, aprovação ou autorização.

### 5.4 Decisão humana

~~~ts
export type HumanAuthorityDecisionV1 = {
  schemaVersion: "human-authority-decision.v1";
  authorityDecisionId: string;
  tenantId: string;
  workspaceId: string;
  subject: {
    caseId: string;
    action: string;
    resourceType: string;
    resourceId: string;
    inputHash: string;
  };
  decision: "APPROVED" | "REJECTED";
  decidedByUserId: string;
  decidedAt: string;
  validUntil: string | null;
  policyVersion: string;
  reasonCodes: readonly string[];
  evidenceRefs: readonly ImmutableArtifactRefV1[];
};
~~~

Decisões humanas são imutáveis, subject-bound e scope-bound. Pendente não é
autoridade. Alteração de inputs invalida o binding.

## 6. GovernedCaseV1

~~~ts
export type GovernedCaseV1<
  TCaseType extends string,
  TFactKey extends string,
  TDomainState extends JsonValueV1,
> = {
  schemaVersion: "governed-case.v1";
  caseId: string;
  caseType: TCaseType;
  tenantId: string;
  workspaceId: string;
  revision: number;
  lifecycle:
    | "DISCOVERY"
    | "ASSESSING"
    | "AWAITING_REVIEW"
    | "READY"
    | "BLOCKED"
    | "CLOSED";
  facts: readonly FactV1<TFactKey>[];
  inconsistencies: readonly SourceInconsistencyV1[];
  regulatoryEvaluations: readonly RegulatoryRuleEvaluationV1[];
  corporatePolicyEvaluations: readonly CorporatePolicyEvaluationV1[];
  riskAssessment: RiskAssessmentV1;
  humanAuthorityDecisions: readonly HumanAuthorityDecisionV1[];
  domainState: TDomainState;
  runRefs: readonly ImmutableArtifactRefV1[];
  receiptRefs: readonly ImmutableArtifactRefV1[];
  evidenceRefs: readonly ImmutableArtifactRefV1[];
  eventRefs: readonly ImmutableArtifactRefV1[];
  createdAt: string;
  updatedAt: string;
};
~~~

GovernedCaseV1 é o agregado durável e fonte da leitura de prontidão. Não é
fila, Run, approval, receipt ou adapter.

## 7. PreDuimpCaseV1

O catálogo de campos regulatórios ainda não está fechado. Para não inventar
exigência aduaneira, V1 fixa namespace e forma dos fatos; fatos obrigatórios
pertencem às regras regulatórias versionadas.

~~~ts
export type PreDuimpFactKeyV1 = string; // prefixo obrigatório: log.pre_duimp.

export type PreDuimpDomainStateV1 = {
  operationMode: "READ_ONLY_DISCOVERY";
  preparationStage:
    | "SOURCE_COLLECTION"
    | "NORMALIZATION"
    | "ASSESSMENT"
    | "HUMAN_REVIEW"
    | "READINESS_DECIDED";
  sourceSnapshotIds: readonly string[];
  externalTransmissionAllowed: false;
};

export type PreDuimpCaseV1 = GovernedCaseV1<
  "log.pre_duimp",
  PreDuimpFactKeyV1,
  PreDuimpDomainStateV1
> & {
  schemaVersion: "governed-case.v1";
  caseType: "log.pre_duimp";
  subject: {
    referenceType: "INTERNAL_CASE_REFERENCE";
    referenceId: string;
  };
  gateDecision: PreDuimpGateDecisionV1;
};
~~~

Zod impõe prefixo log.pre_duimp. em toda fact key. V1 não carrega submit,
número oficial de DUIMP, credencial externa ou estado transmitido. Campo futuro
entra por catálogo/versionamento, nunca ad hoc na UI.

## 8. Semântica formal do gate

~~~ts
export type PreDuimpGateDecisionV1 = {
  schemaVersion: "log.pre_duimp.gate-decision.v1";
  gateDecisionId: string;
  caseId: string;
  tenantId: string;
  workspaceId: string;
  outcome: "BLOCK" | "REVIEW" | "READY";
  reasonCodes: readonly string[];
  inputHash: string;
  evaluatorVersion: string;
  inconsistencyIds: readonly string[];
  regulatoryEvaluationIds: readonly string[];
  corporatePolicyEvaluationIds: readonly string[];
  riskAssessmentId: string;
  humanAuthorityDecisionIds: readonly string[];
  readinessOnly: true;
  authorizationState: "NOT_REQUESTED";
  externalTransmissionAllowed: false;
  evaluatedAt: string;
};
~~~

Precedência: BLOCK > REVIEW > READY.

BLOCK ocorre com scope ausente/divergente, fonte fora do scope, fato obrigatório
ausente, provenance inválida, avaliador ausente/falho/desconhecido, regra
NON_COMPLIANT/UNKNOWN, policy ausente/indisponível/DENY, inconsistência BLOCK
aberta, risco CRITICAL/UNKNOWN ou decisão humana inválida/expirada/mismatched.

REVIEW ocorre apenas sem BLOCK e com policy REVIEW, inconsistência REVIEW
aberta, risco MEDIUM/HIGH que exija humano, atestação ou conflito pendente.

READY ocorre apenas com fatos exigidos presentes, provenance/scope válidos,
regras COMPLIANT ou NOT_APPLICABLE, policies ALLOW ou NOT_APPLICABLE, nenhuma
inconsistência aberta, risco avaliado sem review/block e revisões resolvidas.

READY é prontidão técnica. Não autoriza preparação executável, submit,
transmissão ou efeito externo. O algoritmo começa em BLOCK e só promove após
todos os avaliadores obrigatórios retornarem. reasonCodes são obrigatórios para
BLOCK/REVIEW e podem ser vazios em READY.

## 9. Uso de ApprovalRecord

O modelo atual contém id, runId opcional, tenantId, workspaceId,
decidedByUserId opcional, createdAt e decision. Não tem binding obrigatório a
caseId, action, resourceType, resourceId, inputHash, policyVersion, decidedAt,
validade ou evidence refs. Não há consumidor TypeScript canônico nomeado.

Decisão:

1. não usar ApprovalRecord diretamente como autoridade PRE_DUIMP;
2. não criar tabela paralela neste RFC;
3. adotar HumanAuthorityDecisionV1 como contrato-alvo;
4. decidir depois entre estender ApprovalRecord, projeção compatível ou legado;
5. exigir migration, compatibilidade, owner humano e testes de binding;
6. nunca inferir approval de Run.approvalStatus, ready_for_review, UI ou payload.

## 10. Caso, Run, receipts, evidence e eventos

~~~text
PreDuimpCaseV1 1 ---- 0..N Run
PreDuimpCaseV1 1 ---- 0..N case events
Run            1 ---- 0..N RunEvent
Run/tx         1 ---- 0..N receipts, quando aplicável
case/run       1 ---- 0..N evidence refs
~~~

- caso discovery pode existir sem Run;
- Run é tentativa de execução/evaluation, não o caso;
- Run PRE_DUIMP futuro referencia caseId e o mesmo tenant/workspace;
- reexecução cria novo Run/replay governado; não reescreve fatos antigos;
- não se cria Run ou txId fictício para reutilizar Receipt Canon;
- RunEvent permanece reservado a Run;
- evento de caso exige contrato futuro imutável e case-bound;
- receipt só entra para ação executada que o exija;
- evidence registra inputs, hashes, versões e decisões observadas, sem converter
  proposta em evidência operacional.

Receipt Canon v1 e buildRunEvidenceBundle permanecem canônicos para execução.
Integração PRE_DUIMP exige compatibilidade/versionamento próprio porque ambos
pressupõem Run e, no Receipt Canon, txId.

## 11. Ports read-only

~~~ts
export type PreDuimpSourceReadRequestV1 = {
  schemaVersion: "log.pre_duimp.source-read-request.v1";
  tenantId: string;
  workspaceId: string;
  caseId: string;
  sourceRole:
    | "CASE_INPUT"
    | "CORPORATE_MASTER_DATA"
    | "REGULATORY_CORPUS"
    | "REFERENCE_DATA";
  requestedKeys: readonly PreDuimpFactKeyV1[];
  asOf: string;
};

export type PreDuimpSourceSnapshotV1<TRecord extends JsonValueV1> = {
  schemaVersion: "log.pre_duimp.source-snapshot.v1";
  scope: { tenantId: string; workspaceId: string; caseId: string };
  sourceRef: SourceSnapshotRefV1;
  records: readonly TRecord[];
  readAt: string;
};

export type PreDuimpSourceReadResultV1<TRecord extends JsonValueV1> =
  | { ok: true; snapshot: PreDuimpSourceSnapshotV1<TRecord> }
  | { ok: false; reasonCode: string; retryable: boolean };

export interface PreDuimpReadOnlySourcePortV1<TRecord extends JsonValueV1> {
  readonly portVersion: "log.pre_duimp.source-port.v1";
  readonly sourceId: string;
  readonly sourceRole: PreDuimpSourceReadRequestV1["sourceRole"];
  readSnapshot(
    request: PreDuimpSourceReadRequestV1,
  ): Promise<PreDuimpSourceReadResultV1<TRecord>>;
}
~~~

O port expõe somente readSnapshot. Não existem submit/create/update/delete/
cancel/transmit. Credenciais ficam privadas no adapter. Respostas são snapshots
imutáveis com versão/hash. Erro produz ok false e gate BLOCK. Nenhuma
implementação Siscomex/Portal Único é autorizada.

## 12. Fronteira com o shadow atual

Endpoint shadow e tela atuais comprovam acesso governado e criação de contexto
no escopo já evidenciado. Eles não implementam este agregado.

Task posterior poderá materializar contratos, adaptar internamente o contexto
shadow para criação determinística de PreDuimpCaseV1, manter tenant/workspace
server-side e externalTransmissionAllowed false. Não poderá adicionar provider,
submit ou persistência de approval sem decisões separadas.

## 13. Próximas tasks permitidas

1. **PRE-DUIMP-CONTRACTS-03** — schemas Zod/TypeScript e testes puros, sem DB;
2. **PRE-DUIMP-CASE-04** — persistência/lifecycle, migration só após aprovação;
3. **PRE-DUIMP-AUTHORITY-05** — lifecycle de ApprovalRecord e binding humano;
4. **PRE-DUIMP-EVIDENCE-06** — extensão compatível de evidence/receipt/eventos;
5. **PRE-DUIMP-SOURCES-07** — adapters read-only aprovados, sem Siscomex;
6. **PRE-DUIMP-RUNTIME-VALIDATION-08** — revalidar gates sem mudar comportamento;
7. qualquer integração externa futura exige roadmap, threat model, HITL
   persistido, idempotência/atomicidade, rollback e task próprios.

## 14. Estado resultante

PRE_DUIMP: PARCIAL — o RFC de contratos e ownership fica especificado como
PROPOSTA; contratos executáveis, persistência do caso, HITL persistido,
replay/atomicidade e integração externa permanecem pendentes.
