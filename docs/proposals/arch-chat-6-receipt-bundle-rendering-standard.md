# ARCH-CHAT-6 — Receipt/Bundle Rendering Standard

> Status: proposta/parcial evidenciada documentalmente.
>
> Escopo desta rodada: proposta documental do padrao de renderizacao de receipt, bundle e proof links para o Chat universal. Nenhum codigo, schema Prisma, seed, migracao, config, workflow, package, lockfile, runtime, engine, `ChatAgentLauncher`, componente, rota, provider, WhatsApp produtivo, secret produtivo, ledger/audit write ou mutacao critica foi alterado.
>
> Este documento nao declara Receipt Canon fechado por esta rodada, nao declara proof card implementado no Chat universal, nao gera receipt, nao gera bundle, nao executa ledger/audit no frontend, nao declara rollout final e nao autoriza execucao critica.

## 1. Sumario executivo

ARCH-CHAT-6 define como receipts, bundles e proof links devem ser exibidos no Chat usando estado validado vindo do backend/runtime, sem fabricar prova ou executar ledger/audit no frontend.

A decisao desta rodada e conservadora: criar apenas esta proposta documental. O codebase ja possui Receipt Canon, endpoint de ledger, endpoint de bundle, proof surface no Chat IMOB, links/capabilities no Command Center e testes de contrato. Porem o Chat universal ainda nao possui um contrato `Proof/Receipt/Bundle State v1` canonicamente produzido para renderizacao transversal. Alem disso, `presentation-snapshot.v1` proibe explicitamente campos de backend/proof como `runId`, `txId`, `receiptId`, `ledger` e `receipt`, entao proof rendering nao deve ser enfiado nesse snapshot por atalho.

O padrao alvo separa:

- backend/runtime valida prova, integrity, tenant/workspace/scope e capability;
- frontend renderiza somente estado recebido e validado;
- Chat nao gera receipt;
- Chat nao gera bundle;
- Chat nao executa ledger/audit;
- Chat nao valida Receipt Canon;
- links de proof sao evidencia e navegacao, nao execucao nem autorizacao.

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
- `docs/proposals/arch-chat-5-hitl-gate-rendering-standard.md`
- `docs/proposals/imob-chat-agentic-ops-library-integration.md`
- `apps/web/src/App.tsx`
- `apps/web/src/components/agents/ChatAgentLauncher.tsx`
- `apps/web/src/components/agents/chatPresentationSnapshot.ts`
- `apps/web/src/components/agents/chatLauncherEngine.test.ts`
- `apps/web/src/pages/app/imob/chat.tsx`
- `apps/web/src/pages/app/imob/chatProof.ts`
- `apps/web/src/pages/app/imob/chat.runBundleCapability.test.ts`
- `apps/web/src/features/imob/ImobCommandCenter.tsx`
- `apps/api/src/routes/governance.ts`
- `apps/api/src/routes/runs.ts`
- `apps/api/src/routes/imob.ts`
- `apps/api/src/services/receiptCanonService.ts`
- `apps/api/src/services/imob/imobArtifactCapabilities.ts`
- `contracts/presentation-snapshot.v1.baseline.json`
- `docs/ops/ledger-txid-api-contract.md`
- `docs/ops/run-bundle-api-contract.md`
- `docs/ops/receipt-canon-external-verifier.md`

### Classificacao

- **Fato do codebase:** afirmacao verificavel por `arquivo:linha`.
- **Fato documental:** regra registrada em documento do repositorio.
- **Proposta tecnica:** shape e regras futuras de `ProofReceiptBundleStateV1`.
- **Decisao de implementacao pendente:** onde materializar contrato, producer, card compartilhado, testes/snapshots e consumo pelo Chat.
- **Fora de escopo:** gerar receipt, gerar bundle, executar ledger/audit no frontend, validar Receipt Canon no frontend, criar proof local, alterar runtime/engine, alterar `ChatAgentLauncher` com regra de negocio, piloto IMOB e rollout final.

## 3. Pre-condicao ARCH-CHAT-5

Pre-condicao confirmada antes da alteracao documental:

- ARCH-CHAT-5 mergeada em `main` no commit `82e6899273846a82a5a8ca53c39f03c60cbfe794`.
- `CI Monorepo`: completed success, run `29598672482`.
- `IMOB Worker Mutation E2E`: completed success, run `29598672390`.
- `git status --short` estava limpo apos `git switch main`, `git pull --ff-only origin main` e `git fetch --prune`.

Ultimos commits observados:

- `82e6899 Merge pull request #322 from 5906375/docs/arch-chat-5-hitl-gate-rendering-standard`
- `c05f077 docs(arch-chat): define hitl gate rendering standard`
- `3bd9fc9 Merge pull request #321 from 5906375/docs/arch-chat-4-imob-cockpit-deep-link`
- `de0ac77 docs(arch-chat): define imob cockpit deep link`
- `f75ecc0 Merge pull request #320 from 5906375/docs/arch-chat-3-vertical-context-badge`

## 4. Estado atual de receipts/bundles/proof

| Item | Status | Evidencia |
| --- | --- | --- |
| `/app/chat` | evidenciado | O Chat universal renderiza `AgentsPage` com auth em `apps/web/src/App.tsx:299-307`. |
| `/app/imob/dashboard` e `/app/imob/chat` | evidenciado | As rotas IMOB existem com `RequireAuth` e `RequireImobInstall` em `apps/web/src/App.tsx:344-366`. |
| `ChatAgentLauncher` | evidenciado/parcial | O launcher renderiza mensagens, markdown, snapshots, quick replies e dados financeiros de run em `apps/web/src/components/agents/ChatAgentLauncher.tsx:1820-1915`; nao foi observado proof card universal para `/app/chat`. |
| Presentation snapshot | evidenciado | `MessagePresentationSnapshot` possui campos de apresentacao e `governedRuntime.launcherPolicy="render_only"` em `apps/web/src/components/agents/chatPresentationSnapshot.ts:6-58`. |
| Proibicao de proof no snapshot | evidenciado | O baseline proibe `tenantId`, `workspaceId`, `payload`, `proofHash`, `receiptId`, `ledger`, `receipt`, `txId` e `runId` em `contracts/presentation-snapshot.v1.baseline.json:37-54`. |
| Teste de snapshot render-only | evidenciado | O teste garante que snapshot serializado nao contem `proofHash`, `receiptId`, `ledger`, `receipt`, `txId` ou `runId` em `apps/web/src/components/agents/chatLauncherEngine.test.ts:1379-1428`. |
| Proof surface no Chat IMOB | evidenciado/parcial | `chatProof.ts` resolve `runId`, `txId`, `receiptPath`, `bundlePath`, `verifyUrl`, `ready`, `required` e `state` a partir de presentation/card/message em `apps/web/src/pages/app/imob/chatProof.ts:16-71`. |
| Proof shape no Chat IMOB | evidenciado/parcial | `MessageCard.proof` aceita `state`, `runId`, `txId`, `receiptPath`, `bundlePath` e `verifyUrl` em `apps/web/src/pages/app/imob/chat.tsx:121-151`; `ChatMessage.proof` existe em `apps/web/src/pages/app/imob/chat.tsx:166-187`. |
| Normalizacao de proof | evidenciado/parcial | `normalizeMessageCardProof` deriva `ready`, `required` e `state` quando o card traz proof em `apps/web/src/pages/app/imob/chat.tsx:231-252`. |
| Bloco tecnico de prova | evidenciado/parcial | O Chat IMOB renderiza `Bloco de prova`, estado, txId, receipt e bundle somente quando `SHOW_TECHNICAL_CHAT && visibleProof` em `apps/web/src/pages/app/imob/chat.tsx:5555-5572` e `apps/web/src/pages/app/imob/chat.tsx:5601-5617`. Isso nao e padrao publico universal. |
| CTA de run bundle no Chat IMOB | evidenciado/parcial | Teste textual garante que o CTA de bundle depende de `artifactCapabilities.canViewRunBundle.allowed` e usa o label `Ver bundle da execucao` em `apps/web/src/pages/app/imob/chat.runBundleCapability.test.ts:9-15`. |
| Command Center proof links | evidenciado | O Command Center mostra `abrir no chat`, dossie e comprovante PDF/HTML conforme capabilities em `apps/web/src/features/imob/ImobCommandCenter.tsx:236-321`. |
| Proof state backend IMOB | evidenciado | `resolveProofStateFromMessage` calcula `proofRequired`, `proofReady` e `proofState`; `buildImobProofSurfaceFromMessage` retorna `required`, `ready`, `state`, `runId`, `txId`, `receiptPath`, `bundlePath` e `verifyUrl` em `apps/api/src/routes/imob.ts:999-1060`. |
| Command Center blocked-runs | evidenciado | `/command-center/blocked-runs` retorna runs scoped por tenant/workspace, reasonCodes, `bundleHash`, `txId`, proof paths, verifyUrl e capabilities em `apps/api/src/routes/imob.ts:2466-2557`. |
| Conversation export IMOB | evidenciado | Export de conversa coleta mensagens, `runId`, `txId`, `receiptPath`, `bundlePath`, proof, audit hash, links e telemetria em `apps/api/src/routes/imob.ts:3580-3828`. |
| Artifact capabilities | evidenciado | `resolveRunBundleCapability` exige `reports.view` para bundle e retorna reasonCode quando negado em `apps/api/src/services/imob/imobArtifactCapabilities.ts:50-63`; `resolveImobArtifactCapabilities` compoe `canViewCaseDossier`, `canViewCaseReceipt` e `canViewRunBundle` em `apps/api/src/services/imob/imobArtifactCapabilities.ts:65-96`. |
| Ledger endpoint | evidenciado | `GET /ledger/:txId` exige `ledger.view`, valida formato de txId, busca run/SCL, reconstrui bundleHash e falha fechado em inconsistencias em `apps/api/src/routes/governance.ts:432-568`. |
| Receipt Canon response | evidenciado | O ledger retorna `receiptCanon` construido por `buildLedgerReceiptCanonV1` quando a cadeia esta valida em `apps/api/src/routes/governance.ts:675-735`. |
| Bundle endpoint | evidenciado | `GET /runs/:id/bundle` exige `reports.view`, chama `buildRunEvidenceBundle`, registra ledger `bundle.exported.v1` e retorna `bundleHash`, `hashes` e `files` em `apps/api/src/routes/runs.ts:1473-1504`. |
| Receipt Canon service | evidenciado | `ReceiptCanonEnvelope` fixa `specVersion: "receipt.canon.v1"` e receipts; `buildTxLinkReceipt` inclui `txId`, `bundleHash`, invariantes, reconciliation e reasonCodes em `apps/api/src/services/receiptCanonService.ts:22-115`. |
| Contrato ledger | evidenciado documentalmente | `docs/ops/ledger-txid-api-contract.md:1-118` define a cadeia `txId -> runId -> bundleHash -> /api/runs/:runId/bundle`, auth `ledger.view`, 400/404/409 e invariant fail-closed. |
| Contrato bundle | evidenciado documentalmente | `docs/ops/run-bundle-api-contract.md:1-49` define `GET /api/runs/:id/bundle`, auth `reports.view`, campos obrigatorios e breaking-change check. |
| Guia externo Receipt Canon | evidenciado documentalmente | `docs/ops/receipt-canon-external-verifier.md:1-56` define fluxo manual/CLI de verificacao e respostas 200/400/404/409. |
| Proof/Receipt/Bundle State universal | ausente | Nao foi observado contrato transversal `proof.receipt_bundle_state.v1` para o Chat universal. |

Conclusao: o estado seguro existe em partes no IMOB/backend, mas a renderizacao universal ainda deve ser especificada antes de ser implementada. O frontend pode renderizar proof somente quando receber estado validado; nao pode criar proof nem validar integridade.

## 5. Baseline ARCH-CHAT-1/2/3/4/5

ARCH-CHAT-1 estabelece:

- `Chat` como front door conversacional universal;
- verticais como IMOB como cockpits/command centers;
- frontend sem inferencia de intencao, vertical, entitlement, RBAC, HITL ou render hints.

ARCH-CHAT-2 estabelece:

- `chat.vertical_handoff.v1` conceitual;
- Core governa, Chat orquestra, Vertical executa, Frontend renderiza;
- `runId`, `receiptId` e `bundleId` podem acompanhar handoff quando existirem;
- ausencia de tenant/workspace/scope/entitlement/contrato minimo falha fechado.

ARCH-CHAT-3 estabelece:

- `VerticalContextBadgeV1` renderiza apenas estado recebido;
- badge nao cria HITL;
- badge nao substitui proof/receipt/bundle;
- `proofState` pode existir como indicador visual, mas nao como prova fabricada.

ARCH-CHAT-4 estabelece:

- deep link para cockpit e navegacao, nao execucao;
- link nao substitui receipt/bundle;
- `ChatAgentLauncher` permanece render-only.

ARCH-CHAT-5 estabelece:

- `HitlGateStateV1` e status visual de gates;
- receipt/bundle sao referencias de prova, nao aprovacao;
- proof pendente nao pode ser apresentado como sucesso;
- Chat nao aprova, nao rejeita, nao delega, nao escala e nao executa mutacao.

ARCH-CHAT-6 complementa esse baseline: proof/receipt/bundle card e evidencia renderizada, nao geracao de evidencia.

## 6. Proof/Receipt/Bundle State v1

Contrato conceitual proposto:

```ts
type ProofReceiptBundleStateV1 = {
  version: "proof.receipt_bundle_state.v1";

  proofId?: string;
  proofKind:
    | "run_execution"
    | "ledger_receipt"
    | "evidence_bundle"
    | "conversation_export"
    | "case_dossier"
    | "market_scan_evidence"
    | "document_checklist";
  proofStatus:
    | "not_required"
    | "pending"
    | "available"
    | "blocked"
    | "failed"
    | "inconsistent";

  runId: string;
  receiptId?: string;
  bundleId?: string;
  ledgerRef?: string;

  verticalId?: "imob" | "legal" | "mkt" | "fin" | "log" | string;
  tenantId: string;
  workspaceId: string;
  scope: string;

  source:
    | "runtime"
    | "ledger"
    | "run_bundle"
    | "vertical_runtime_contract"
    | "chat.vertical_handoff.v1";
  reasonCode: string;

  createdAt?: string;
  verifiedAt?: string;
  receiptLink?: string;
  bundleLink?: string;
  verifyLink?: string;

  accessibilityLabel: string;
};
```

### Semantica minima

| Campo | Obrigatorio | Semantica |
| --- | --- | --- |
| `version` | sim | Versao fixa do estado de proof/renderizacao. |
| `proofId` | nao | Identificador visual/auditavel quando houver. Nao deve ser inventado pela UI. |
| `proofKind` | sim | Classe da evidencia exibida. |
| `proofStatus` | sim | Estado visual: disponivel, pendente, bloqueado, inconsistente etc. |
| `runId` | sim | Run associada. Ausencia impede proof card ativo. |
| `receiptId` | condicional | Referencia de receipt quando o runtime/ledger fornecer. |
| `bundleId` | condicional | Referencia de bundle quando o runtime/ledger fornecer. |
| `ledgerRef` | condicional | Referencia de ledger ou `txId` sem expor payload bruto. |
| `verticalId` | condicional | Vertical dona do contexto, nunca inferida pela UI. |
| `tenantId` | sim | Escopo tenant validado antes da renderizacao. |
| `workspaceId` | sim | Escopo workspace validado antes da renderizacao. |
| `scope` | sim | Scope exigido para visualizar ou navegar para a prova. |
| `source` | sim | Fonte canonica do estado. |
| `reasonCode` | sim | Motivo auditavel para estado ou bloqueio. |
| `createdAt` | nao | Data de criacao da evidencia quando fornecida. |
| `verifiedAt` | nao | Data de verificacao quando fornecida. |
| `receiptLink` | condicional | Link interno recebido, por exemplo `/api/ledger/:txId`. |
| `bundleLink` | condicional | Link interno recebido, por exemplo `/api/runs/:runId/bundle`. |
| `verifyLink` | condicional | Link de verificacao quando fornecido. |
| `accessibilityLabel` | sim | Descricao acessivel completa do estado e proximo passo. |

### Estados propostos

| `proofStatus` | Uso | Renderizacao |
| --- | --- | --- |
| `not_required` | A interacao nao exige receipt/bundle. | Mostrar somente se util para contexto; sem sugerir sucesso operacional. |
| `pending` | A prova e obrigatoria ou esperada, mas ainda nao disponivel. | Exibir "prova pendente"; nao mostrar receipt/bundle como disponivel. |
| `available` | Receipt/bundle/link estao disponiveis e recebidos de estado validado. | Exibir links seguros conforme capability. |
| `blocked` | Entitlement/RBAC/scope/capability impede visualizacao. | Exibir bloqueio e reasonCode; sem workaround. |
| `failed` | Geração/consulta da prova falhou fora do frontend. | Exibir falha segura; nao reexecutar no frontend. |
| `inconsistent` | Ledger/Receipt Canon/invariant retornou inconsistencia. | Exibir fail-closed; nao declarar comprovado. |

## 7. Regras de renderizacao

### Regras obrigatorias

- Proof card so renderiza `ProofReceiptBundleStateV1` recebido de backend/runtime/contrato validado.
- Frontend nao cria receipt.
- Frontend nao cria bundle.
- Frontend nao executa ledger/audit.
- Frontend nao valida Receipt Canon.
- Frontend nao decide integridade de `txId`, `bundleHash` ou receipt.
- Frontend nao executa mutacao critica.
- Ausencia de estado valido resulta em fail-closed: nao renderizar prova ativa nem declarar comprovado.
- Link de proof nao substitui entitlement/RBAC/scope; destino deve revalidar permissao.
- `receiptLink`, `bundleLink` e `verifyLink` devem ser links internos recebidos e validados, nao URL arbitraria fabricada.
- `available` exige estado recebido com referencia de link/capability coerente.
- `pending`, `blocked`, `failed` e `inconsistent` nao podem ser exibidos como sucesso.
- `receiptId` e `bundleId` sao referencias, nao autorizacao de execucao.
- Mensagem visual deve ser sanitizada: sem PII, secret, payload bruto, token, documento, email sensivel, telefone ou endereco completo.

### Regras proibidas

- Fabricar `proofId`, `ledgerRef`, `receiptLink`, `bundleLink` ou `verifyLink` no componente por heuristica.
- Chamar `/api/ledger/:txId` para validar integridade no componente de Chat universal.
- Chamar `/api/runs/:runId/bundle` para gerar bundle automaticamente no render.
- Executar `recordGovernanceLedger` ou qualquer audit write no frontend.
- Usar `presentation-snapshot.v1` para transportar campos proibidos como `runId`, `txId`, `receiptId` ou `ledger`.
- Declarar Receipt Canon fechado por esta rodada.
- Tratar proof link como aprovacao, permissao, pagamento, envio, publicacao ou mutacao.

### Fail-closed minimo

O card deve falhar fechado se faltar:

- `version`;
- `proofKind`;
- `proofStatus`;
- `runId`;
- `tenantId`;
- `workspaceId`;
- `scope`;
- `source`;
- `reasonCode`;
- `accessibilityLabel`;
- fonte validada do estado.

## 8. Aplicacao inicial ao IMOB

Exemplos conceituais, sem implementacao nesta rodada:

| Cenario IMOB | Estado esperado | Renderizacao segura |
| --- | --- | --- |
| Lead capture com runId e receipt pendente | `proofKind=run_execution`, `proofStatus=pending`, `runId`, `reasonCode=PROOF_PENDING` | Mostrar "prova pendente"; nao exibir como comprovado. |
| Proposta IMOB com bundle disponivel | `proofKind=evidence_bundle`, `proofStatus=available`, `runId`, `bundleLink`, `scope=reports.view` | Mostrar "bundle disponivel" e link apenas se capability permitir. |
| Checklist documental bloqueado | `proofKind=document_checklist`, `proofStatus=blocked`, `reasonCode=IMOB_CASE_CONTEXT_MISSING` ou `IMOB_STAGE_FORBIDDEN` | Mostrar bloqueio com reasonCode; sem inventar link. |
| Market scan read-only com evidence link | `proofKind=market_scan_evidence`, `proofStatus=available`, `bundleId` ou `bundleLink` | Mostrar evidence link como inspecao; nao criar recomendacao operacional sem HITL. |
| Acao critica sem receipt | `proofStatus=pending` ou `inconsistent` | Nao exibir como comprovada; manter fail-closed. |
| Ledger inconsistente | `proofStatus=inconsistent`, `reasonCode=RECEIPT_CANON_INCONSISTENT` | Mostrar inconsistencia; orientar abrir cockpit/runbook, sem revalidar no frontend. |

O Chat IMOB ja possui `chatProof.ts` e bloco tecnico de prova, mas essa superficie nao deve ser promovida a padrao publico universal sem contrato v1, producer validado e teste/snapshot dedicado. O cockpit IMOB pode continuar oferecendo comprovantes e dossies conforme capabilities existentes.

## 9. UX e acessibilidade

Estados de copy recomendados:

| Estado | Label curto | Descricao |
| --- | --- | --- |
| `available` + receipt | `Recibo disponivel` | Link interno para ledger/receipt validado pelo backend. |
| `available` + bundle | `Bundle disponivel` | Link interno para evidence bundle conforme capability. |
| `pending` | `Prova pendente` | Prova esperada ainda nao disponivel. |
| `blocked` | `Prova bloqueada` | Acesso negado por entitlement/RBAC/scope/contexto. |
| `failed` | `Falha ao obter prova` | Falha externa ao frontend; sem retry mutacional implicito. |
| `inconsistent` | `Prova inconsistente` | Cadeia ledger/receipt/bundle falhou fechado. |
| sem estado valido | `Nao comprovado` | Nao renderizar link ativo. |

Requisitos UX:

- Desktop: card compacto dentro da resposta ou painel contextual, com estado, motivo e links seguros.
- Mobile: layout empilhado, sem overflow horizontal, labels curtos e links em linhas separadas.
- Texto curto: diferenciar claramente "recibo disponivel", "bundle disponivel", "prova pendente", "prova bloqueada", "nao comprovado".
- Acessibilidade: `accessibilityLabel` deve explicar estado, proof kind, motivo e link disponivel.
- Cor nao pode ser o unico indicador de estado.
- Proof link deve ser descrito como evidencia/verificacao, nunca como execucao.
- Links devem ter destino interno legivel e nao depender de tooltip para entendimento essencial.

## 10. Fora de escopo

- Geracao de receipt.
- Geracao de bundle.
- Ledger/audit write no frontend.
- Validacao de Receipt Canon no frontend.
- Fechar Receipt Canon completo por esta rodada.
- Implementar card visual.
- Alterar `ChatAgentLauncher`.
- Alterar runtime/engine para produzir proof.
- Criar schema fisico em `contracts/`.
- Criar proof local.
- Criar ledger produtivo obrigatorio.
- Criar provider externo.
- Habilitar WhatsApp produtivo.
- Usar secrets produtivos.
- Criar mutacoes criticas.
- Piloto IMOB; fica para ARCH-CHAT-7.
- Rollout final.

## 11. Riscos e mitigacao

| Risco | Mitigacao |
| --- | --- |
| Frontend fabricar prova | Exigir estado v1 recebido de backend/runtime; ausencia falha fechado. |
| Proof link virar autorizacao | Copy e contrato declaram link como evidencia/navegacao, nao execucao. |
| Receipt Canon ser declarado fechado sem evidencia | Nao declarar fechado nesta rodada; manter status parcial sem evidencia indexavel nova. |
| Perda de tenant/workspace/scope | `tenantId`, `workspaceId` e `scope` obrigatorios no estado. |
| Audit trail incompleta | Frontend nao escreve ledger; backend/ledger continuam fonte de verdade. |
| UX confusa entre receipt e bundle | Labels separados: recibo, bundle, prova pendente, bloqueada, inconsistente. |
| Mobile overflow | Exigir layout empilhado e links curtos no DoD futuro. |
| Drift com ARCH-CHAT-2/3/4/5 | Reutilizar invariantes: Chat front door, renderHints apresentacao, deep link navegacao, gate render-only. |
| Vazamento de PII em proof card | Proibir payload bruto e campos sensiveis; exibir apenas referencias sanitizadas. |
| Bundle export disparar side effect por render | Card nao deve chamar export automaticamente; somente renderizar link recebido/capability. |

## 12. DoD

Definition of Done para futura implementacao segura:

- `ProofReceiptBundleStateV1` existe como contrato/snapshot proprio validado, separado de `presentation-snapshot.v1`.
- Backend/runtime/agente produz `proofKind`, `proofStatus`, `runId`, tenant, workspace, scope, source, reasonCode e accessibility label.
- Frontend renderiza apenas estado recebido.
- `ChatAgentLauncher` permanece render-only.
- Proof card nao gera receipt.
- Proof card nao gera bundle.
- Proof card nao executa ledger/audit.
- Proof card nao valida Receipt Canon.
- Links internos sao recebidos de estado validado e respeitam entitlement/RBAC/scope/capability.
- Ausencia de estado valido falha fechado.
- Teste/snapshot cobre `available`, `pending`, `blocked`, `failed`, `inconsistent` e `not_required`.
- Mensagem visual nao contem PII, secrets ou payload bruto.
- Receipt Canon nao e declarado fechado sem evidencia indexavel real.
- Checks documentais passam:
  - `pnpm check:evidence-index`
  - `pnpm check:docs-link-integrity`
  - `git diff --check`
  - `git diff -- .github/workflows release.yml apps packages scripts`

DoD desta rodada:

- proposta documental criada em `docs/proposals/arch-chat-6-receipt-bundle-rendering-standard.md`;
- evidencia `arquivo:linha` registrada neste documento;
- boundaries preservados;
- nenhuma alteracao em apps, packages, scripts, workflows, release, runtime, engine ou `ChatAgentLauncher`;
- nenhum receipt, bundle, ledger/audit write, provider, secret produtivo, webhook produtivo ou mutacao critica;
- status final: proposta/parcial evidenciada documentalmente.
