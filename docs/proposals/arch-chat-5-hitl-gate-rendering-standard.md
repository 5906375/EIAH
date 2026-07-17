# ARCH-CHAT-5 — HITL/Gate Rendering Standard

> Status: proposta/parcial evidenciada documentalmente.
>
> Escopo desta rodada: proposta documental do padrao de renderizacao HITL/Gate para o Chat universal. Nenhum codigo, schema Prisma, seed, migracao, config, workflow, package, lockfile, runtime, engine, `ChatAgentLauncher`, componente, rota, provider, WhatsApp produtivo, secret produtivo, endpoint de aprovacao ou mutacao critica foi alterado.
>
> Este documento nao declara gate implementado no Chat universal, nao declara aprovacao pelo frontend, nao declara receipt/bundle rollout, nao declara IMOB fechado, nao declara WhatsApp operacional e nao autoriza execucao critica.

## 1. Sumario executivo

ARCH-CHAT-5 define o padrao conceitual `HITL/Gate State v1` e as regras de renderizacao para estados de aprovacao humana, policy gate, entitlement/RBAC, source access e bloqueios fail-closed no Chat universal.

A decisao desta rodada e conservadora: criar apenas esta proposta documental. O codebase ja possui gate de aprovacao IMOB no backend, approval actions no cockpit, reasonCodes, rotas autenticadas, proof links e cards de acesso, mas nao ha evidencia de um estado universal `hitl.gate_state.v1` produzido por contrato/runtime e consumido pelo Chat. Implementar card no `ChatAgentLauncher` agora exigiria inferir gate, risco, policy ou permissao no frontend, violando a arquitetura agent-driven.

O padrao aqui proposto separa:

- backend/runtime/agente decide gate, risk, reasonCode, tenant/workspace/scope e estado;
- frontend renderiza somente estado recebido e validado;
- Chat nunca aprova, rejeita, delega, escala ou executa acao critica nesta fase;
- cockpit/backoffice continuam sendo as superficies adequadas para operacoes de aprovacao ja existentes.

## 2. Fontes e classificacao de evidencia

### Fontes lidas

- `CODEX.md`
- `IA_EIAH.md`
- `AGENTS.md`
- `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`
- `docs/architecture/agent-chat-runtime.md`
- `docs/EVIDENCE_INDEX.md`
- `docs/proposals/universal-chat-front-door-vertical-operating-model.md`
- `docs/proposals/arch-chat-1-navigation-semantics.md`
- `docs/proposals/arch-chat-2-handoff-contract-v1.md`
- `docs/proposals/arch-chat-3-vertical-context-badge.md`
- `docs/proposals/arch-chat-4-imob-cockpit-deep-link.md`
- `docs/proposals/imob-chat-agentic-ops-library-integration.md`
- `apps/web/src/App.tsx`
- `apps/web/src/components/agents/ChatAgentLauncher.tsx`
- `apps/web/src/components/imob/ImobAccessGateCard.tsx`
- `apps/web/src/features/imob/ImobApprovalContextCard.tsx`
- `apps/web/src/features/imob/funnel/ImobFunnelTeamSection.tsx`
- `apps/web/src/pages/app/imob/dashboard.tsx`
- `apps/web/src/pages/app/imob/chatProof.ts`
- `apps/api/src/services/imob/imobApprovalGate.ts`
- `apps/api/src/services/imob/marketScan/marketScanPolicyJudge.ts`
- `apps/api/src/routes/imobCrmRouter.ts`
- `apps/api/src/routes/imobCrmSchemas.ts`
- `apps/api/src/routes/runs.ts`
- `apps/api/src/tests/imob-approval-gate.test.ts`
- `contracts/agent-protocol.v1.schema.json`
- `contracts/imob/operational-opportunity.v1.schema.json`
- `contracts/imob/source-access-decision.v1.schema.json`
- `contracts/imob/market-scan-router-output.v1.schema.json`

### Classificacao

- **Fato do codebase:** afirmacao verificavel por `arquivo:linha`.
- **Fato documental:** regra registrada em documento do repositorio.
- **Proposta tecnica:** shape e regras futuras de `HitlGateStateV1`.
- **Gap:** diferenca entre gates ja existentes e um padrao universal de renderizacao no Chat.
- **Fora de escopo:** qualquer endpoint de aprovacao, execucao de aprovacao pelo frontend, schema fisico, policy local, RBAC local, runtime/engine producer, receipt/bundle rollout ou mutacao critica.

## 3. Pre-condicao ARCH-CHAT-4

Pre-condicao confirmada antes da alteracao documental:

- ARCH-CHAT-4 mergeada em `main` no commit `3bd9fc9ca3f073d1bb48abfb52fce6ca4a7ee540`.
- `CI Monorepo`: completed success, run `29597659171`.
- `IMOB Worker Mutation E2E`: completed success, run `29597659194`.
- `git status --short` estava limpo apos `git switch main`, `git pull --ff-only origin main` e `git fetch --prune`.

Ultimos commits observados:

- `3bd9fc9 Merge pull request #321 from 5906375/docs/arch-chat-4-imob-cockpit-deep-link`
- `de0ac77 docs(arch-chat): define imob cockpit deep link`
- `f75ecc0 Merge pull request #320 from 5906375/docs/arch-chat-3-vertical-context-badge`
- `329bc02 docs(arch-chat): define vertical context badge`
- `b9f2335 Merge pull request #319 from 5906375/docs/arch-chat-2-handoff-contract-v1`

## 4. Estado atual de gates/HITL

| Item | Status | Evidencia |
| --- | --- | --- |
| Chat universal | evidenciado | `/app/chat` renderiza `AgentsPage` com auth em `apps/web/src/App.tsx:299-307`. |
| Cockpit IMOB | evidenciado | `/app/imob/dashboard` e `/app/imob/chat` existem com `RequireAuth` e `RequireImobInstall` em `apps/web/src/App.tsx:344-366`. |
| ChatAgentLauncher | evidenciado/parcial | O launcher renderiza mensagens de assistente, snapshots, markdown, quick replies e run finance em `apps/web/src/components/agents/ChatAgentLauncher.tsx:1820-1915`; nao foi observado card universal de HITL/Gate. |
| Access gate render-only | evidenciado | `ImobAccessGateCard` renderiza CTA, workspace e trace recebidos via gate em `apps/web/src/components/imob/ImobAccessGateCard.tsx:6-45`. |
| Proof surface IMOB | evidenciado | `chatProof.ts` resolve `runId`, `txId`, `receiptPath`, `bundlePath`, `verifyUrl`, `required`, `ready` e `state` em `apps/web/src/pages/app/imob/chatProof.ts:16-71`. |
| Approval gate backend | evidenciado | `resolveImobApprovalGate` define status, criticality, reasonCodes e bloqueia HIGH/CRITICAL sem aprovacao valida em `apps/api/src/services/imob/imobApprovalGate.ts:1-107`. |
| Teste de approval gate | evidenciado | `imob-approval-gate.test.ts` cobre bloqueio HIGH/CRITICAL, aprovacao valida, expiracao, scope mismatch e payload invalido em `apps/api/src/tests/imob-approval-gate.test.ts:6-119`. |
| Approval context cockpit | evidenciado | `GET /control/approval-context` exige auth context, permissao `imob.chat.use`, tenant/workspace e monta contexto em `apps/api/src/routes/imobCrmRouter.ts:695-759`. |
| Approval action cockpit | evidenciado | `POST /control/approval-actions` valida payload, permissao, stage, reasonCode, evidencia e muta metadata/evento em `apps/api/src/routes/imobCrmRouter.ts:762-910`. |
| Schema de approval action | evidenciado | `imobApprovalActionSchema` aceita `approve`, `delegate`, `escalate`, `reasonCode`, evidencia e `runId` em `apps/api/src/routes/imobCrmSchemas.ts:144-170`. |
| Card de approvals IMOB | evidenciado | `ImobApprovalContextCard` renderiza botoes `Aprovar`, `Delegar`, `Escalar` e `Abrir aprovacao`, chamando `onAction` quando fornecido em `apps/web/src/features/imob/ImobApprovalContextCard.tsx:32-123`. |
| Dashboard approval action | evidenciado | O dashboard chama `apiPostImobApprovalAction` para `approve`, `delegate` e `escalate` em `apps/web/src/pages/app/imob/dashboard.tsx:337-375`. |
| Runs approve endpoint | evidenciado | `/runs/:id/approve` atualiza `approvalStatus`, registra ledger/evento e shadow approval em `apps/api/src/routes/runs.ts:916-972`. |
| Market scan policy judge | evidenciado | `judgeMarketScanPolicy` bloqueia sem evidenceBundleId, PII, internal ID leak, fonte fora da run e oportunidade sem human approval em `apps/api/src/services/imob/marketScan/marketScanPolicyJudge.ts:28-83`. |
| Agent Protocol | evidenciado/parcial | `agent-protocol.v1` exige `tier`, `txIdRequired`, `receiptSchema` e `trustRequirements`, com tier `LOW/MEDIUM/HIGH`, em `contracts/agent-protocol.v1.schema.json:1-55`. |
| IMOB opportunity | evidenciado | `operational-opportunity.v1` exige `requiresHumanApproval` com `const: true` em `contracts/imob/operational-opportunity.v1.schema.json:1-20`. |
| Source access decision | evidenciado | `source-access-decision.v1` modela allowed/blocked fail-closed e reasonCodes como `PII_EXPOSURE_RISK` e `TENANT_SCOPE_REQUIRED` em `contracts/imob/source-access-decision.v1.schema.json:1-40`. |
| Market scan router output | evidenciado | `market-scan-router-output.v1` carrega `requiresSourceAccessGate`, `blocked` e `reasonCode` em `contracts/imob/market-scan-router-output.v1.schema.json:1-18`. |
| Gate state universal do Chat | ausente | Nao foi observado schema/produtor canonico `hitl.gate_state.v1` ou equivalente universal validado para o Chat. |

Conclusao: existem gates reais e acoes reais em superficies IMOB/backend, mas elas nao autorizam um card de aprovacao no Chat. O padrao do Chat deve ser visual e render-only ate existir estado universal validado.

## 5. Baseline ARCH-CHAT-1/2/3/4

ARCH-CHAT-1 estabelece que:

- `Chat` e o front door conversacional universal;
- IMOB deve ser cockpit/Command Center operacional, nao chat paralelo;
- o frontend nao deve inferir intencao, vertical, entitlement, RBAC, HITL ou render hints.

ARCH-CHAT-2 estabelece o contrato conceitual `chat.vertical_handoff.v1`:

- Core governa;
- Chat orquestra;
- Vertical executa;
- Frontend renderiza;
- `ChatAgentLauncher` permanece render-only;
- `renderHints` sao apresentacao, nao autorizacao;
- `riskLevel`, `hitlRequired`, `reasonCode`, `runId`, `receiptId` e `bundleId` podem acompanhar o handoff conceitual em `docs/proposals/arch-chat-2-handoff-contract-v1.md:138-171`.

ARCH-CHAT-3 estabelece que o `Vertical Context Badge`:

- renderiza somente estado recebido de contrato/snapshot validado;
- nao valida entitlement;
- nao cria HITL;
- nao substitui proof/receipt/bundle;
- possui estado `critical_pending_hitl` apenas como apresentacao em `docs/proposals/arch-chat-3-vertical-context-badge.md:113-133`.

ARCH-CHAT-4 estabelece que o deep link Chat -> cockpit:

- e navegacao, nao execucao;
- nao substitui HITL;
- deve preservar `tenantId`, `workspaceId`, `scope`, `reasonCode` e `accessibilityLabel`;
- deve manter `ChatAgentLauncher` render-only em `docs/proposals/arch-chat-4-imob-cockpit-deep-link.md:195-208`.

ARCH-CHAT-5 complementa esses quatro documentos: quando o runtime expuser estado de gate, o Chat pode renderizar um card de status/continuidade, mas nao pode executar aprovacao.

## 6. HITL/Gate State v1

Shape conceitual proposto:

```ts
type HitlGateStateV1 = {
  version: "hitl.gate_state.v1";
  gateId: string;
  gateType:
    | "approval"
    | "policy"
    | "entitlement"
    | "rbac"
    | "source_access"
    | "proof_required"
    | "human_review";

  tenantId: string;
  workspaceId: string;
  scope: string;
  verticalId?: "imob" | "legal" | "mkt" | "fin" | "log" | string;

  approvalState:
    | "not_required"
    | "pending"
    | "approved"
    | "rejected"
    | "expired"
    | "invalid"
    | "blocked";
  hitlRequired: boolean;
  riskLevel: "read_only" | "assisted" | "high" | "critical";
  reasonCode: string;
  message: string;

  runId?: string;
  handoffId?: string;
  approvalId?: string;
  receiptId?: string;
  bundleId?: string;
  requiredRole?: string;
  requiredEntitlement?: string;

  allowedUserActions: Array<
    | "view_details"
    | "open_cockpit"
    | "open_run"
    | "view_proof"
    | "request_review"
    | "contact_admin"
  >;
  accessibilityLabel: string;
};
```

### Semantica minima

| Campo | Obrigatorio | Semantica |
| --- | --- | --- |
| `version` | sim | Versao fixa `hitl.gate_state.v1`. |
| `gateId` | sim | Identificador auditavel e estavel do gate exibido. Nao e approval endpoint. |
| `gateType` | sim | Classe do gate: aprovacao, policy, entitlement, RBAC, source access, proof ou human review. |
| `tenantId` | sim | Tenant validado antes da renderizacao. Ausencia falha fechado. |
| `workspaceId` | sim | Workspace validado antes da renderizacao. Ausencia falha fechado. |
| `scope` | sim | Scope/RBAC que justifica o estado. Ausencia falha fechado. |
| `verticalId` | condicional | Vertical resolvida pelo contrato, nao pela UI. |
| `approvalState` | sim | Estado visual do gate. `approved` nao executa acao no Chat. |
| `hitlRequired` | sim | Sinal declarativo de necessidade de humano. Nao abre endpoint de aprovacao. |
| `riskLevel` | sim | Nivel de risco ja resolvido por backend/runtime. |
| `reasonCode` | sim | Motivo auditavel para troubleshooting e suporte. |
| `message` | sim | Texto sanitizado para usuario. |
| `runId` | condicional | Referencia a run ja existente, quando houver. |
| `handoffId` | condicional | Referencia ao handoff `chat.vertical_handoff.v1`, quando existir. |
| `approvalId` | condicional | Referencia de aprovacao, sem autorizar execucao pelo Chat. |
| `receiptId`/`bundleId` | condicional | Referencias de prova; nao substituem ARCH-CHAT-6. |
| `requiredRole` | condicional | Papel exigido quando gate e RBAC/human review. |
| `requiredEntitlement` | condicional | Entitlement exigido quando gate e entitlement. |
| `allowedUserActions` | sim | Acoes visuais seguras; nao inclui `approve`, `reject`, `delegate`, `escalate` ou mutacoes. |
| `accessibilityLabel` | sim | Descricao completa para leitor de tela. |

## 7. Regras de renderizacao

### Regras obrigatorias

- Renderizar card de gate somente quando `HitlGateStateV1` vier de contrato/runtime/snapshot validado.
- Preservar `ChatAgentLauncher` como render-only: ele consome estado resolvido, nao decide gate.
- Tratar `allowedUserActions` como navegacao ou leitura, nunca como aprovacao.
- Exibir `reasonCode`, estado e proximo passo seguro quando fornecidos.
- Preservar `runId`, `gateId`, `approvalId`, `receiptId` e `bundleId` apenas como referencias visuais/auditaveis.
- Quando `approvalState=pending`, mostrar aguardando aprovacao humana fora do Chat.
- Quando `approvalState=approved`, mostrar status aprovado externamente, sem executar a acao associada.
- Quando `approvalState=rejected`, `expired`, `invalid` ou `blocked`, renderizar bloqueio fail-closed e oferecer somente leitura/navegacao segura.
- Quando `gateType=entitlement` ou `gateType=rbac`, nao sugerir workaround; apontar contato/admin/cockpit se fornecido.
- Quando houver proof pendente, nao declarar sucesso de receipt/bundle.
- Sanitizar texto visivel: sem PII, secret, payload bruto, tokens, telefone, documento, email sensivel ou endereco completo.

### Regras proibidas

- Criar `gateId`, `reasonCode`, `riskLevel`, `hitlRequired`, `approvalState`, tenant, workspace ou scope no frontend.
- Inferir gate por string da mensagem, rota atual, markdown, badge vertical, button label ou erro generico.
- Renderizar botoes `Aprovar`, `Rejeitar`, `Delegar` ou `Escalar` no Chat nesta fase.
- Chamar `/runs/:id/approve`, `/control/approval-actions` ou qualquer endpoint mutacional a partir do card de Chat.
- Implementar policy/RBAC/entitlement local no frontend.
- Converter `defaultNextStep` em acao de gate.
- Tratar receipt/bundle como aprovacao.
- Executar provider, webhook, secret produtivo, `lead.create`, `lead.discard` ou mutacao critica.

### Fail-closed

O card deve falhar fechado quando qualquer item abaixo estiver ausente ou invalido:

- `version`;
- `gateId`;
- `gateType`;
- `tenantId`;
- `workspaceId`;
- `scope`;
- `approvalState`;
- `riskLevel`;
- `reasonCode`;
- `message`;
- `accessibilityLabel`;
- fonte validada do estado.

Falhar fechado significa nao renderizar uma acao ativa de aprovacao e nao prosseguir com execucao. A UI pode mostrar uma mensagem segura de bloqueio somente se essa mensagem vier do backend/runtime.

## 8. Aplicacao inicial ao IMOB

Aplicacao proposta para IMOB, sem implementacao nesta fase:

| Cenario IMOB | GateState proposto | Renderizacao segura |
| --- | --- | --- |
| Proposta/contrato HIGH aguardando aprovacao | `gateType=approval`, `approvalState=pending`, `reasonCode=APPROVAL_REQUIRED` | Card informa que a acao aguarda aprovacao humana no cockpit/backoffice; CTA permitido: abrir cockpit ou ver run. |
| Aprovacao expirada | `gateType=approval`, `approvalState=expired`, `reasonCode=APPROVAL_EXPIRED` | Card bloqueado; CTA permitido: abrir detalhes ou solicitar revisao. |
| Scope/tenant/workspace divergente | `gateType=approval`, `approvalState=blocked`, `reasonCode=APPROVAL_SCOPE_MISMATCH` | Card bloqueado fail-closed; sem acao de aprovacao. |
| Entitlement IMOB ausente | `gateType=entitlement`, `approvalState=blocked`, `reasonCode=IMOB_ENTITLEMENT_MISSING` | Card de acesso pausado; CTA seguro recebido do backend. |
| Source access bloqueado | `gateType=source_access`, `approvalState=blocked`, `reasonCode=TENANT_SCOPE_REQUIRED` ou `PII_EXPOSURE_RISK` | Card informa bloqueio de fonte; sem scraping, provider ou fallback local. |
| Market scan com PII/internal ID | `gateType=policy`, `approvalState=blocked`, `reasonCode=MARKET_SCAN_PII_BLOCKED` ou `MARKET_SCAN_INTERNAL_ID_LEAK` | Card informa resposta bloqueada por safety; sem exibir payload. |
| Oportunidade operacional read-only com HITL requerido | `gateType=human_review`, `approvalState=pending`, `reasonCode=MARKET_SCAN_HUMAN_APPROVAL_REQUIRED` | Card indica revisao humana necessaria; CTA permitido: abrir cockpit/prova. |
| Run ja aprovada externamente | `gateType=approval`, `approvalState=approved`, `reasonCode=APPROVAL_GRANTED` | Card mostra status; nao executa a acao pelo Chat. |

O card de Chat proposto e diferente de `ImobApprovalContextCard`: o card existente no cockpit executa `approve`, `delegate` e `escalate` via `onAction` em `apps/web/src/features/imob/ImobApprovalContextCard.tsx:94-117`; o padrao ARCH-CHAT-5 proibe esses botoes no Chat.

## 9. UX e acessibilidade

Estados visuais recomendados:

| Estado | Label sugerido | Tom |
| --- | --- | --- |
| `pending` | `Aguardando aprovacao humana` | Atencao, sem urgencia artificial. |
| `approved` | `Aprovado externamente` | Neutro/positivo, sem CTA de execucao. |
| `rejected` | `Aprovacao rejeitada` | Bloqueado, com motivo. |
| `expired` | `Aprovacao expirada` | Bloqueado, com proximo passo seguro. |
| `invalid` | `Aprovacao invalida` | Bloqueado fail-closed. |
| `blocked` | `Acao bloqueada` | Bloqueado fail-closed. |
| `not_required` | `Sem aprovacao exigida` | Mostrar apenas se o runtime decidir que vale contexto visual. |

Requisitos UX:

- Card compacto, escaneavel e adequado a desktop/mobile.
- Estado nao pode depender apenas de cor.
- `accessibilityLabel` deve explicar estado, motivo e proximo passo.
- Botoes permitidos no Chat: `Ver detalhes`, `Abrir cockpit`, `Abrir run`, `Ver prova`, `Solicitar revisao`, `Contatar admin`.
- Botoes proibidos no Chat: `Aprovar`, `Rejeitar`, `Delegar`, `Escalar`, `Executar`, `Enviar`, `Publicar`, `Criar lead`, `Descartar lead`.
- O texto deve deixar claro quando a aprovacao ocorreu fora do Chat.

## 10. Fora de escopo

- Implementar componente visual.
- Alterar `ChatAgentLauncher`.
- Alterar engine/runtime.
- Criar producer backend de `HitlGateStateV1`.
- Criar schema fisico em `contracts/`.
- Criar endpoint de aprovacao.
- Executar aprovacao pelo frontend.
- Acionar `/runs/:id/approve` pelo Chat.
- Acionar `/control/approval-actions` pelo Chat.
- Implementar policy/RBAC/entitlement local.
- Definir padrao final de receipt/bundle/proof links; isso permanece para ARCH-CHAT-6.
- Criar rollout final/piloto; isso permanece para fase posterior.
- Integrar provider WhatsApp real.
- Usar secret produtivo.
- Criar webhook produtivo.
- Executar mutacoes criticas.
- Alterar workflows, release, apps, packages ou scripts.

## 11. Riscos e mitigacao

| Risco | Mitigacao |
| --- | --- |
| Frontend inferir gate por conveniencia | Exigir `HitlGateStateV1` validado; ausencia falha fechado. |
| Usuario interpretar `approved` como execucao concluida | Label deve dizer `Aprovado externamente`; card nao dispara execucao. |
| Duplicar approvals do cockpit no Chat | Proibir botoes `Aprovar`, `Delegar`, `Escalar` no Chat nesta fase. |
| Misturar proof/receipt/bundle com approval | Manter proof como referencia e deixar padrao final para ARCH-CHAT-6. |
| Expor PII ou payload bruto em reason/message | Exigir mensagem sanitizada e proibir payload bruto no contrato. |
| Gate ativo sem tenant/workspace/scope | Fail-closed obrigatorio. |
| Drift entre IMOB e Chat universal | Tratar IMOB como primeira aplicacao, mas manter contrato transversal. |
| `ChatAgentLauncher` acumular regra de negocio | Qualquer implementacao futura deve consumir estado resolvido pelo engine/runtime. |

## 12. DoD

Definition of Done para uma futura implementacao segura:

- `HitlGateStateV1` existe como contrato/snapshot validado.
- Backend/runtime/agente produz `gateId`, `gateType`, `approvalState`, `riskLevel`, `reasonCode`, tenant, workspace e scope.
- Frontend renderiza apenas o estado recebido.
- `ChatAgentLauncher` permanece render-only.
- Card de Chat nao chama endpoint mutacional.
- Card de Chat nao possui botoes `Aprovar`, `Rejeitar`, `Delegar` ou `Escalar`.
- Ausencia de estado validado falha fechado.
- Mensagem visual nao contem PII, secrets ou payload bruto.
- Teste/snapshot cobre pending, approved externally, expired, invalid, blocked e entitlement/RBAC blocked.
- Checks documentais passam:
  - `pnpm check:evidence-index`
  - `pnpm check:docs-link-integrity`
  - `git diff --check`
  - `git diff -- .github/workflows release.yml apps packages scripts`

DoD desta rodada:

- proposta documental criada em `docs/proposals/arch-chat-5-hitl-gate-rendering-standard.md`;
- nenhuma alteracao em apps, packages, scripts, workflows, release, runtime, engine ou `ChatAgentLauncher`;
- nenhuma aprovacao, provider, secret produtivo, webhook produtivo ou mutacao critica;
- status final: proposta/parcial evidenciada documentalmente.
