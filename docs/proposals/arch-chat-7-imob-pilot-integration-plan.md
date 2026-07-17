# ARCH-CHAT-7 — IMOB Pilot Integration Plan

Status: proposta/parcial evidenciada documentalmente.

Este documento define o plano documental para um piloto IMOB integrado ao modelo de Chat universal e cockpit vertical. Ele nao implementa codigo, nao altera runtime, engine, ChatAgentLauncher, schema, workflows, packages, scripts, providers, secrets, webhooks ou mutacoes.

## 1. Sumario executivo

ARCH-CHAT-7 consolida um plano de piloto IMOB em tres fases: shadow, pilot e small. O objetivo e validar a ponte operacional entre Chat universal, contexto vertical IMOB, cockpit, gates HITL, proof surfaces e receipt/bundle links sem declarar operacao fechada, sem fechar Receipt Canon e sem executar acao critica.

O plano parte do baseline ARCH-CHAT-1 a ARCH-CHAT-6 e do estado atual do repositorio. O piloto proposto e documental: define escopo, gates, metricas, evidencias requeridas, Go/No-Go, rollback e DoD para uma futura execucao controlada.

## 2. Fontes e classificacao de evidencia

Fontes normativas lidas:

- `CODEX.md`: regras de governanca do executor, evidencia real e preservacao da arquitetura agent-driven.
- `IA_EIAH.md`: regras operacionais do repositorio, Evidence Index e fronteiras de fechamento.
- `AGENTS.md`: Chat deve seguir arquitetura agent-driven; agentes definem contrato, engine executa e launcher renderiza.
- `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`: IMOB ativo, mas rollout exige gates, evidencia, tenant/workspace/entitlement fail-closed e metricas.
- `docs/architecture/agent-chat-runtime.md`: ChatAgentLauncher e render-only; regras cognitivas devem residir em agente/engine.
- `docs/EVIDENCE_INDEX.md`: indice de evidencias reais ja existentes; este plano nao adiciona evidencia operacional indexavel.

Fontes de proposta lidas:

- `docs/proposals/universal-chat-front-door-vertical-operating-model.md`.
- `docs/proposals/arch-chat-1-navigation-semantics.md`.
- `docs/proposals/arch-chat-2-handoff-contract-v1.md`.
- `docs/proposals/arch-chat-3-vertical-context-badge.md`.
- `docs/proposals/arch-chat-4-imob-cockpit-deep-link.md`.
- `docs/proposals/arch-chat-5-hitl-gate-rendering-standard.md`.
- `docs/proposals/arch-chat-6-receipt-bundle-rendering-standard.md`.
- `docs/proposals/imob-chat-agentic-ops-library-integration.md`.
- `docs/proposals/imob-data-sources.md`.

Fontes de codigo inspecionadas como evidencia de estado atual:

- `apps/web/src/App.tsx:56`: navegacao inclui Chat e IMOB.
- `apps/web/src/App.tsx:147`: autenticacao atualiza tenant, workspace, entitlements e contexto.
- `apps/web/src/App.tsx:299`: rota `/app/chat`.
- `apps/web/src/App.tsx:344`: rota `/app/imob/dashboard`.
- `apps/web/src/App.tsx:356`: rota `/app/imob/chat`.
- `apps/web/src/components/agents/ChatAgentLauncher.tsx:1820`: superficie renderiza mensagens do assistente.
- `apps/web/src/features/imob/ImobCommandCenter.tsx:67`: Command Center exibe funil, bloqueios e aprovacao.
- `apps/web/src/features/imob/ImobCommandCenter.tsx:236`: item de cockpit pode abrir chat quando capability permite.
- `apps/web/src/features/imob/ImobCommandCenter.tsx:266`: superficie de comprovantes expõe dossie e recibo por capability.
- `apps/web/src/pages/app/imob/dashboard.tsx:196`: cockpit monta deep link para `/app/imob/chat`.
- `apps/web/src/pages/app/imob/dashboard.tsx:342`: dashboard executa action de approval no cockpit.
- `apps/web/src/pages/app/imob/chatProof.ts:16`: proof surface e resolvida a partir de dados recebidos.
- `apps/api/src/routes/imob.ts:999`: backend calcula estado de proof.
- `apps/api/src/routes/imob.ts:1693`: `/chat/resolve-turn` valida contexto, mensagem e permissoes.
- `apps/api/src/routes/imob.ts:2466`: `/command-center/blocked-runs` usa tenant/workspace, permission e proof export.
- `apps/api/src/routes/imob.ts:3580`: exportacao de conversa inclui mensagens, proof, telemetry e hash.
- `apps/api/src/services/imob/imobApprovalGate.ts:45`: approval gate bloqueia por status, escopo e expiracao.
- `apps/api/src/services/imob/marketScan/marketScanPolicyJudge.ts:28`: policy judge exige evidencia, bloqueia PII e exige approval humano.
- `apps/api/src/services/imob/imobArtifactCapabilities.ts:37`: capabilities bloqueiam por permissao, stage e contexto.
- `contracts/presentation-snapshot.v1.baseline.json:37`: snapshot v1 proibe campos backend/proof como `tenantId`, `workspaceId`, `receiptId`, `txId` e `runId`.

Classificacao:

- Evidencia real: arquivos de codigo, contratos e testes existentes, usados apenas para diagnostico.
- Evidencia documental: propostas ARCH-CHAT-1 a 6 e propostas IMOB relacionadas.
- Lacuna: qualquer item sem contrato fisico, teste ou rollout executado permanece proposta.

## 3. Pre-condicao ARCH-CHAT-6

Pre-condicao confirmada antes da edicao:

- Branch `main` atualizada por `git switch main`, `git pull --ff-only origin main` e `git fetch --prune`.
- Worktree limpo antes da criacao deste documento.
- HEAD: `0461edf2c825e4007f25cd5207b5c482416f6b96`.
- Merge ARCH-CHAT-6 em `main`: `0461edf Merge pull request #323 from 5906375/docs/arch-chat-6-receipt-bundle-rendering-standard`.
- `CI Monorepo`: completed success, run `29603523904`.
- `IMOB Worker Mutation E2E`: completed success, run `29603523918`.

## 4. Baseline ARCH-CHAT-1 a 6

ARCH-CHAT-1 define a semantica de navegacao: Chat e front door universal e IMOB deve atuar como cockpit vertical. O estado atual ainda mostra o item IMOB do shell apontando para `/app/imob/chat` em `apps/web/src/App.tsx:61`, enquanto o dashboard existe em `/app/imob/dashboard` em `apps/web/src/App.tsx:344`.

ARCH-CHAT-2 define o handoff conceitual `ChatVerticalHandoffV1`, com tenant/workspace/scope, vertical, intent, reasonCode, risk, HITL, hints e ids de proof. Nao ha fechamento neste documento de que esse contrato fisico exista.

ARCH-CHAT-3 define badge de contexto vertical como render-only. O piloto deve tratar badge como indicacao visual, nao como autorizacao de escopo, entitlement ou proof.

ARCH-CHAT-4 define deep link Chat -> IMOB cockpit como navegacao, nao execucao. O estado atual possui links cockpit -> chat via `buildImobChatHref` em `apps/web/src/pages/app/imob/dashboard.tsx:196` e `abrir no chat` condicionado por capability em `apps/web/src/features/imob/ImobCommandCenter.tsx:236`.

ARCH-CHAT-5 define renderizacao padrao de HITL/gates. Acoes de approval existem no cockpit em `apps/web/src/pages/app/imob/dashboard.tsx:342`, mas o piloto nao deve mover approval para o Chat.

ARCH-CHAT-6 define renderizacao de receipt/bundle como prova render-only. O contrato `presentation-snapshot.v1` proibe campos backend/proof em snapshot em `contracts/presentation-snapshot.v1.baseline.json:37`, portanto o piloto nao pode fabricar proof no frontend nem declarar Receipt Canon fechado.

## 5. Estado atual IMOB com evidencias

Chat universal:

- `/app/chat` existe como rota autenticada em `apps/web/src/App.tsx:299`.
- `ChatAgentLauncher` renderiza mensagens, markdown, quick replies e dados de runtime recebidos em `apps/web/src/components/agents/ChatAgentLauncher.tsx:1820`.
- A regra de arquitetura permanece render-only: o piloto nao pode adicionar logica cognitiva nova ao launcher.

IMOB chat e cockpit:

- `/app/imob/chat` existe como rota autenticada e protegida por install em `apps/web/src/App.tsx:356`.
- `/app/imob/dashboard` existe como cockpit/dashboard em `apps/web/src/App.tsx:344`.
- O shell ainda lista IMOB apontando para `/app/imob/chat` em `apps/web/src/App.tsx:61`, o que e uma lacuna de navegacao para a visao cockpit-first proposta.

Command Center:

- O Command Center apresenta bloqueios, approvals, custo e filtros em `apps/web/src/features/imob/ImobCommandCenter.tsx:67`.
- O cockpit habilita abertura de chat por capability em `apps/web/src/features/imob/ImobCommandCenter.tsx:236`.
- Dossie e recibo sao apresentados por capability em `apps/web/src/features/imob/ImobCommandCenter.tsx:266`.

Gates e policy:

- `/chat/resolve-turn` valida contexto autenticado, mensagem, permissao `imob.chat.use`, stage, entitlements e recipe em `apps/api/src/routes/imob.ts:1693`.
- Approval gate bloqueia criticidade alta/critica sem approval valido em `apps/api/src/services/imob/imobApprovalGate.ts:45`.
- Market scan policy exige `evidenceBundleId`, bloqueia PII, bloqueia identificador interno visivel e exige approval humano em `apps/api/src/services/imob/marketScan/marketScanPolicyJudge.ts:28`.
- Artifact capabilities bloqueiam chat, dossie, recibo e bundle por permissao, stage, contexto e scope em `apps/api/src/services/imob/imobArtifactCapabilities.ts:37`.

Proof, receipt e bundle:

- Backend calcula proof state a partir de run, txId, receiptPath e bundlePath em `apps/api/src/routes/imob.ts:999`.
- Chat proof surface no frontend apenas resolve sinais existentes em `apps/web/src/pages/app/imob/chatProof.ts:16`.
- Command Center bloqueado expõe templates de bundle e ledger em `apps/api/src/routes/imob.ts:2466`.
- Exportacao de conversa inclui mensagens, proof, telemetry e hash em `apps/api/src/routes/imob.ts:3580`.

Lacunas para piloto:

- Sem contrato fisico universal de handoff fechado.
- Sem badge/gate/proof universal implementado para todos os agentes.
- Sem evidencia de rollout shadow, pilot ou small.
- Sem autorizacao para approval dentro do Chat.
- Sem fechamento de Receipt Canon por ARCH-CHAT-7.
- Sem declaracao de operacao IMOB fechada.

## 6. Escopo do piloto IMOB

Entra no piloto proposto:

- Jornada read-only de triagem IMOB a partir do Chat universal.
- Handoff documental de contexto para cockpit IMOB sem executar acao.
- Navegacao para cockpit/dashboard quando o usuario precisar operar caso, proof, recibo ou bundle.
- Renderizacao de vertical context badge somente como contexto visual.
- Renderizacao de HITL/gates como estado recebido, sem approval no Chat.
- Renderizacao de receipt/bundle/proof somente quando backend fornecer sinais validos.
- Validacao de tenantId, workspaceId, entitlement, scope e reasonCode como pre-condicao operacional.
- Coleta de metricas minimas de renderizacao, handoff, proof, rollback e falhas fail-closed.

Nao entra no piloto:

- Provider externo real.
- WhatsApp produtivo.
- Secrets produtivos.
- Webhook produtivo.
- Mutacoes novas.
- `lead.create`, `lead.discard` ou acao critica.
- Approval executado dentro do Chat.
- Geracao de proof, receipt ou bundle no frontend.
- Fechamento de Receipt Canon.
- Rollout amplo.

## 7. Rollout shadow → pilot → small

Shadow:

- Publico: equipe interna autorizada, tenants/workspaces de teste ou controlados.
- Operacao: sem efeito externo, sem provider real, sem secret produtivo e sem webhook produtivo.
- Validacoes: handoff renderizado, reasonCodes preservados, cockpit link correto, proof nao fabricado, gates render-only.
- Saida esperada: relatorio de gaps, metricas de zero side effect e evidencias de fail-closed.

Pilot:

- Publico: usuarios internos ou clientes explicitamente autorizados, em workspaces delimitados.
- Operacao: fluxo read-only e cockpit-assisted; qualquer acao critica permanece no cockpit e atras de HITL ja existente.
- Validacoes: tenant/workspace/scope obrigatorios, entitlement fail-closed, policy gates preservados, rollback testado.
- Saida esperada: pacote de evidencias com screenshots, logs sanitizados, checks e metricas minimas.

Small:

- Publico: pequeno grupo controlado, apos Go do pilot.
- Operacao: ainda sem provider real e sem autorizacao de producao ampla.
- Validacoes: metricas em limite, ausencia de regressao no launcher, ausencia de proof fabricado, ausencia de acao critica via Chat.
- Saida esperada: recomendacao Go/No-Go para etapa futura, sem declarar operacao fechada.

## 8. Gates de nao-regressao

Gates obrigatorios antes de qualquer execucao futura:

- `CI Monorepo` verde.
- `IMOB Worker Mutation E2E` verde.
- `pnpm check:evidence-index` verde.
- `pnpm check:docs-link-integrity` verde.
- `git diff --check` sem saida.
- Isolamento sem alteracoes em `.github/workflows`, `release.yml`, `apps`, `packages` e `scripts` quando a tarefa for documental.
- `ChatAgentLauncher` permanece render-only; nenhuma regra cognitiva nova deve entrar no launcher.
- Tenant, workspace, entitlement e scope sao obrigatorios; ausencia deve falhar fechado.
- Handoff sem tenant/workspace/scope valido deve falhar fechado.
- Badge, gate e proof nao podem criar autorizacao.
- Frontend nao pode decidir policy, approval, entitlement ou criticalidade.
- Receipt/bundle/proof nao podem ser fabricados no frontend.
- Nenhum provider real, secret produtivo, webhook produtivo ou mutacao nova.
- Receipt Canon nao pode ser declarado fechado sem evidencia operacional propria.

## 9. Metricas minimas

Metricas minimas para shadow/pilot/small:

- `auditGap = 0`.
- `duplicateSideEffects = 0`.
- `unauthorizedRender = 0`.
- `frontendPolicyDecision = 0`.
- `missingTenantWorkspaceScope = 0`.
- `entitlementFailOpen = 0`.
- `scopeFailOpen = 0`.
- `invalidProofRendered = 0`.
- `proofFabricatedInFrontend = 0`.
- `criticalActionWithoutHITL = 0`.
- `chatApprovalExecution = 0`.
- `providerExternalCall = 0`.
- `productiveSecretUse = 0`.
- `productionWebhookUse = 0`.
- `mutationCreatedByPilot = 0`.
- `rollbackReady = true`.
- `hardMetricsGo = false` ate haver ciclos APE e evidencia suficiente.
- `ReceiptCanonClosed = false` neste plano.

## 10. Go/No-Go

Go para shadow:

- Pre-condicao de main e workflows verde.
- Documento aprovado para execucao futura.
- Escopo read-only aceito.
- Gates de nao-regressao definidos.
- Rollback documentado.

Go para pilot:

- Shadow com metricas minimas dentro do limite.
- Evidencias sanitizadas anexadas a PR ou pacote governado.
- Nenhum side effect externo.
- Sem drift em ChatAgentLauncher, engine ou runtime.
- Owners e responsaveis de rollback definidos.

Go para small:

- Pilot com `auditGap = 0`, `duplicateSideEffects = 0`, `criticalActionWithoutHITL = 0`, `proofFabricatedInFrontend = 0`.
- Relatorio Go/No-Go revisado.
- Escopo ainda controlado e sem autorizacao produtiva ampla.

No-Go imediato:

- Qualquer provider real, secret produtivo, webhook produtivo ou mutacao nova.
- Qualquer approval executado pelo Chat.
- Qualquer proof/receipt/bundle fabricado no frontend.
- Qualquer ausencia de tenant/workspace/scope que nao falhe fechado.
- Qualquer tentativa de declarar Receipt Canon fechado sem evidencia propria.

## 11. Rollback

Rollback deve ser simples e verificavel:

- Remover exposicao do piloto no shell, CTA, link ou configuracao de superficie se tal exposicao existir em implementacao futura.
- Reverter apenas alteracoes do piloto, preservando audit logs e evidencias.
- Manter cockpit e backend existentes em estado anterior conhecido.
- Congelar rollout em shadow/pilot/small quando metricas violarem limite.
- Registrar motivo, owner, timestamp, run/check afetado e evidencia sanitizada.

ReasonCodes propostos para rollback futuro:

- `ARCH_CHAT7_ROLLBACK_REQUESTED`.
- `ARCH_CHAT7_UNAUTHORIZED_RENDER`.
- `ARCH_CHAT7_FRONTEND_POLICY_DECISION`.
- `ARCH_CHAT7_PROOF_FABRICATION_DETECTED`.
- `ARCH_CHAT7_CRITICAL_ACTION_WITHOUT_HITL`.
- `ARCH_CHAT7_TENANT_WORKSPACE_SCOPE_MISSING`.
- `ARCH_CHAT7_PROVIDER_BOUNDARY_VIOLATION`.

## 12. Evidencias requeridas

Evidencias minimas para execucao futura:

- SHA de `main` usado no rollout.
- Links dos workflow runs de `CI Monorepo` e `IMOB Worker Mutation E2E`.
- Resultado de checks documentais e, se houver codigo futuro, checks de contrato/render-only aplicaveis.
- Screenshots ou snapshots sanitizados do Chat universal, badge, gate, cockpit link e proof surface.
- Logs sanitizados de fail-closed para tenant/workspace/scope, entitlement, policy e proof invalido.
- Registro de metricas minimas por fase.
- Plano de rollback assinado pelo owner.
- Relatorio Go/No-Go por fase.

Este documento nao atualiza `docs/EVIDENCE_INDEX.md` porque nao produz evidencia operacional nova; ele apenas referencia evidencias existentes e define proposta documental.

## 13. Fora de escopo

- Implementar codigo.
- Alterar schema.
- Alterar configs.
- Alterar workflows.
- Alterar runtime.
- Alterar engine.
- Alterar ChatAgentLauncher.
- Alterar providers.
- Usar secrets produtivos.
- Criar webhooks produtivos.
- Criar mutacoes.
- Criar `lead.create` ou `lead.discard`.
- Executar acao critica.
- Declarar WhatsApp operacional.
- Declarar IMOB operacionalmente fechado.
- Declarar Receipt Canon fechado.

## 14. Riscos e mitigacao

Risco: Chat ser tratado como superficie de operacao critica.

Mitigacao: manter Chat render-only para gates, proof e handoff; qualquer acao critica permanece fora do escopo do piloto.

Risco: proof visual ser confundido com Receipt Canon fechado.

Mitigacao: proof/receipt/bundle so podem ser exibidos quando recebidos de backend; este plano declara `ReceiptCanonClosed = false`.

Risco: rollout pequeno virar autorizacao produtiva implicita.

Mitigacao: cada fase exige Go/No-Go proprio, metricas e rollback; small continua controlado.

Risco: drift em tenant/workspace/scope.

Mitigacao: fail-closed obrigatorio e metricas `missingTenantWorkspaceScope = 0`, `entitlementFailOpen = 0` e `scopeFailOpen = 0`.

Risco: evidencia insuficiente.

Mitigacao: classificar como proposta/parcial ate que evidencias reais sejam coletadas e indexadas conforme governanca.

## 15. DoD

Definition of Done documental para ARCH-CHAT-7:

- Plano criado em `docs/proposals/arch-chat-7-imob-pilot-integration-plan.md`.
- Baseline ARCH-CHAT-1 a 6 referenciado.
- Estado atual IMOB citado com file:line.
- Escopo do piloto definido.
- Rollout shadow -> pilot -> small definido.
- Gates de nao-regressao definidos.
- Metricas minimas definidas.
- Go/No-Go definido.
- Rollback definido.
- Evidencias requeridas definidas.
- Fora de escopo preservado.
- Sem alteracoes em codigo, runtime, engine, ChatAgentLauncher, schema, workflows, packages, scripts, providers, secrets, webhooks ou mutacoes.
- Status final mantido como proposta/parcial evidenciada documentalmente.
