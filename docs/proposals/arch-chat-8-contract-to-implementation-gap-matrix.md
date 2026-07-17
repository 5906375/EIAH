# ARCH-CHAT-8 — Contract-to-Implementation Gap Matrix

Status: proposta/parcial evidenciada documentalmente.

Escopo: diagnostico documental e matriz de gaps. Este documento nao implementa codigo, nao altera runtime, engine, ChatAgentLauncher, schema, workflows, packages, scripts, providers, secrets, webhooks ou mutacoes. Tambem nao inicia shadow, pilot ou small, nao declara IMOB operacionalmente fechado e nao declara Receipt Canon fechado.

## 1. Sumario executivo

ARCH-CHAT-8 compara o baseline ARCH-CHAT-1 a ARCH-CHAT-7 com o estado real do codebase e produz uma matriz de gaps entre contratos documentais e implementacao fisica.

A leitura conservadora e:

- O codebase ja possui pecas reais importantes: `/app/chat`, `/app/imob/chat`, `/app/imob/dashboard`, Command Center IMOB, gates de auth/RBAC/entitlement, approval gate IMOB, proof state IMOB, ledger, bundle, Receipt Canon e testes relevantes.
- Os contratos universais ARCH-CHAT ainda nao estao fisicamente materializados: `chat.vertical_handoff.v1`, `renderHints.verticalBadge`, `cockpitDeepLink`, `hitl.gate_state.v1` e `proof.receipt_bundle_state.v1` aparecem apenas em propostas documentais.
- O Chat universal ainda nao possui render surfaces universais de badge, gate e proof governadas por esses contratos.
- IMOB-PILOT-0 nao deve avancar para shadow real enquanto P0 e P1 bloqueantes permanecerem abertos ou enquanto o frontend precisar inferir policy, vertical, gate ou proof.

## 2. Fontes e classificacao de evidencia

Classificacao usada:

- Fato do codebase com arquivo:linha: estado verificavel em arquivos de codigo, contratos ou testes.
- Fato documental com arquivo:linha: regra/proposta registrada em documento do repositorio.
- Proposta tecnica: desenho futuro ainda nao implementado.
- Gap identificado: diferenca entre baseline documental e codebase real.
- Decisao de implementacao pendente: exige PR tecnico futuro.
- Decisao de rollout pendente: exige aprovacao futura antes de shadow/pilot/small.

Fontes normativas e documentais lidas:

- `CODEX.md:1`
- `IA_EIAH.md:23`
- `AGENTS.md:5`
- `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md:21`
- `docs/architecture/agent-chat-runtime.md:1`
- `docs/EVIDENCE_INDEX.md:1`
- `docs/proposals/universal-chat-front-door-vertical-operating-model.md:1`
- `docs/proposals/arch-chat-1-navigation-semantics.md:1`
- `docs/proposals/arch-chat-2-handoff-contract-v1.md:1`
- `docs/proposals/arch-chat-3-vertical-context-badge.md:1`
- `docs/proposals/arch-chat-4-imob-cockpit-deep-link.md:1`
- `docs/proposals/arch-chat-5-hitl-gate-rendering-standard.md:1`
- `docs/proposals/arch-chat-6-receipt-bundle-rendering-standard.md:1`
- `docs/proposals/arch-chat-7-imob-pilot-integration-plan.md:1`
- `docs/proposals/imob-chat-agentic-ops-library-integration.md:1`
- `docs/proposals/imob-data-sources.md:1`

Fontes de codebase/testes inspecionadas:

- `apps/web/src/App.tsx:56`
- `apps/web/src/App.tsx:299`
- `apps/web/src/components/agents/ChatAgentLauncher.tsx:1688`
- `apps/web/src/components/agents/ChatAgentLauncher.tsx:1820`
- `apps/web/src/components/agents/chatPresentationSnapshot.ts:6`
- `apps/web/src/components/agents/chatLauncherEngine.ts:140`
- `apps/web/src/features/imob/ImobCommandCenter.tsx:67`
- `apps/web/src/features/imob/ImobCommandCenter.tsx:236`
- `apps/web/src/pages/app/imob/dashboard.tsx:196`
- `apps/web/src/pages/app/imob/dashboard.tsx:337`
- `apps/api/src/routes/imob.ts:999`
- `apps/api/src/routes/imob.ts:1693`
- `apps/api/src/routes/imob.ts:2466`
- `apps/api/src/routes/imob.ts:3580`
- `apps/api/src/services/imob/imobApprovalGate.ts:1`
- `apps/api/src/services/imob/imobArtifactCapabilities.ts:1`
- `apps/api/src/middlewares/enforceTenant.ts:58`
- `apps/api/src/middlewares/requireScope.ts:20`
- `apps/api/src/routes/governance.ts:432`
- `apps/api/src/routes/runs.ts:1473`
- `contracts/agent-protocol.v1.schema.json:1`
- `contracts/presentation-snapshot.v1.baseline.json:37`
- `apps/web/src/components/agents/chatLauncherEngine.test.ts:1379`
- `apps/api/src/tests/imob-approval-gate.test.ts:6`
- `apps/api/src/tests/ledger-bundle.contract.test.ts:184`
- `package.json:59`

## 3. Pre-condicao ARCH-CHAT-7

Pre-condicao confirmada antes da criacao deste documento:

- Branch `main` atualizada por `git switch main`, `git pull --ff-only origin main` e `git fetch --prune`.
- Worktree limpa antes da edicao (`git status --short` sem saida).
- HEAD atual: `588eb1874cc1c47178b72a6785af432179f2b7ef`.
- Merge ARCH-CHAT-7 em `main`: `588eb18 Merge pull request #324 from 5906375/docs/arch-chat-7-imob-pilot-integration-plan`.
- `CI Monorepo`: run `29604769974`, `completed`, `success`.
- `IMOB Worker Mutation E2E`: run `29604770019`, `completed`, `success`.

## 4. Baseline ARCH-CHAT-1 a 7

- ARCH-CHAT-1: define `Chat` como front door universal e verticais como cockpits. O estado real ainda mostra o item publico `IMOB` apontando para `/app/imob/chat` em `apps/web/src/App.tsx:61`, enquanto o cockpit existe em `/app/imob/dashboard` em `apps/web/src/App.tsx:344`.
- ARCH-CHAT-2: propoe `chat.vertical_handoff.v1` com tenant/workspace/scope, vertical, intent, reasonCode, risk, HITL, render hints e refs de prova em `docs/proposals/arch-chat-2-handoff-contract-v1.md:138`. O contrato fisico nao existe na lista de `contracts/`, que contem Agent Protocol, presentation snapshot, receipt/economy e contratos IMOB, mas nao `chat.vertical_handoff.v1`.
- ARCH-CHAT-3: propoe `VerticalContextBadgeV1` e afirma que nao ha produtor fisico de `chat.vertical_handoff.v1` ou `renderHints.verticalBadge` em `docs/proposals/arch-chat-3-vertical-context-badge.md:15`.
- ARCH-CHAT-4: propoe `ImobCockpitDeepLinkV1` e afirma que `cockpitDeepLink` universal ainda nao e produzido por contrato em `docs/proposals/arch-chat-4-imob-cockpit-deep-link.md:13`.
- ARCH-CHAT-5: propoe `HitlGateStateV1` e afirma que nao ha estado universal `hitl.gate_state.v1` em `docs/proposals/arch-chat-5-hitl-gate-rendering-standard.md:13`.
- ARCH-CHAT-6: propoe `ProofReceiptBundleStateV1` e afirma que nao ha contrato transversal `proof.receipt_bundle_state.v1` em `docs/proposals/arch-chat-6-receipt-bundle-rendering-standard.md:112`.
- ARCH-CHAT-7: consolida o plano shadow -> pilot -> small e declara lacunas para piloto: sem contrato fisico universal, sem badge/gate/proof universal e sem evidencia de rollout em `docs/proposals/arch-chat-7-imob-pilot-integration-plan.md:124`.

## 5. Matriz de gaps

| Item | Baseline documental | Estado no codebase | Evidencia arquivo:linha | Gap type | Prioridade P0-P4 | Risco | Proximo PR recomendado |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `chat.vertical_handoff.v1` | ARCH-CHAT-2 define shape conceitual. | Ausente em `contracts/`; busca por termos encontrou apenas propostas. | `docs/proposals/arch-chat-2-handoff-contract-v1.md:138`; `contracts/agent-protocol.v1.schema.json:1`; lista de `contracts/` sem schema de handoff. | Contrato fisico ausente | P0 | Drift entre docs e implementacao; shadow dependeria de contrato inexistente. | ARCH-IMPL-0 |
| Produtor fisico de handoff | Deve ser produzido por agente/engine/runtime, nao launcher. | Nao ha producer universal; ha IMOB resolve-turn especifico validando contexto. | `apps/api/src/routes/imob.ts:1693`; `docs/proposals/arch-chat-2-handoff-contract-v1.md:236` | Producer ausente | P1 | Frontend pode acabar inferindo handoff. | ARCH-IMPL-1 |
| `renderHints.verticalBadge` | ARCH-CHAT-3 define badge render-only de estado validado. | `MessagePresentationSnapshot` possui `verticalContext`, mas nao `renderHints.verticalBadge` canonico. | `apps/web/src/components/agents/chatPresentationSnapshot.ts:6`; `docs/proposals/arch-chat-3-vertical-context-badge.md:111` | Contrato/render hint ausente | P1 | Badge pode ser inferido por path/texto. | ARCH-IMPL-0 e ARCH-IMPL-2 |
| Produtor fisico de badge | Badge deve vir de contrato/snapshot validado. | Nao ha producer universal; existem sinais IMOB/governed snapshot parciais. | `apps/web/src/components/agents/chatPresentationSnapshot.ts:87`; `docs/proposals/arch-chat-3-vertical-context-badge.md:80` | Producer ausente | P1 | UI pode transformar contexto parcial em autorizacao visual. | ARCH-IMPL-1 |
| `cockpitDeepLink` | ARCH-CHAT-4 define link governado Chat -> cockpit. | Existem links IMOB especificos cockpit -> chat e markdown interno, mas nao `cockpitDeepLink` universal. | `apps/web/src/pages/app/imob/dashboard.tsx:196`; `apps/web/src/features/imob/ImobCommandCenter.tsx:236`; `apps/web/src/components/agents/ChatAgentLauncher.tsx:1693`; `docs/proposals/arch-chat-4-imob-cockpit-deep-link.md:130` | Render hint/produto ausente | P1 | Link ad hoc pode virar policy ou autorizacao. | ARCH-IMPL-1 e ARCH-IMPL-2 |
| Produtor fisico de `cockpitDeepLink` | Deve produzir path interno validado com tenant/workspace/scope/reason. | Nao observado producer universal; IMOB monta links especificos com params de caso/thread. | `apps/web/src/pages/app/imob/dashboard.tsx:196`; `apps/web/src/features/imob/ImobCommandCenter.tsx:236` | Producer ausente | P1 | Deep link Chat -> cockpit exigiria inferencia no frontend. | ARCH-IMPL-1 |
| `hitl.gate_state.v1` | ARCH-CHAT-5 define estado visual universal de gate/HITL. | Approval gate IMOB real existe; estado universal para Chat nao existe. | `apps/api/src/services/imob/imobApprovalGate.ts:45`; `docs/proposals/arch-chat-5-hitl-gate-rendering-standard.md:147` | Contrato universal ausente | P1 | Chat pode expor approval indevido ou esconder bloqueio. | ARCH-IMPL-0 e ARCH-IMPL-3 |
| Produtor fisico de gate state | Gate state deve sair de backend/runtime/snapshot validado. | Existem gates IMOB/backend e approval cockpit, mas nao adapter universal read-only para Chat. | `apps/web/src/pages/app/imob/dashboard.tsx:342`; `apps/api/src/tests/imob-approval-gate.test.ts:6` | Adapter ausente | P1 | Frontend pode inferir allowed/blocked. | ARCH-IMPL-3 |
| `ProofReceiptBundleStateV1` | ARCH-CHAT-6 define estado universal de proof/receipt/bundle. | Proof IMOB especifico existe; presentation snapshot proibe campos proof/backend; contrato universal ausente. | `apps/api/src/routes/imob.ts:999`; `contracts/presentation-snapshot.v1.baseline.json:37`; `docs/proposals/arch-chat-6-receipt-bundle-rendering-standard.md:158` | Contrato universal ausente | P2 | Proof pode ser fabricado ou transportado no snapshot errado. | ARCH-IMPL-0 e ARCH-IMPL-3 |
| Produtor fisico de proof state | Deve vir de backend/runtime/contrato validado. | Backend IMOB calcula proof state e exporta conversa; nao ha produtor universal para `/app/chat`. | `apps/api/src/routes/imob.ts:999`; `apps/api/src/routes/imob.ts:3580` | Adapter/produtor ausente | P2 | `/app/chat` nao consegue renderizar proof governado sem atalho. | ARCH-IMPL-3 |
| Renderizacao universal em `/app/chat` | Chat universal deve renderizar handoff/badge/gate/proof sem inferir policy. | `/app/chat` existe; launcher renderiza markdown/snapshot e links genericos, sem cards universais ARCH-CHAT. | `apps/web/src/App.tsx:299`; `apps/web/src/components/agents/ChatAgentLauncher.tsx:1820`; `apps/web/src/components/agents/ChatAgentLauncher.tsx:1693` | Render surface ausente | P1/P2 | Pilot pode depender de UI inexistente. | ARCH-IMPL-2 |
| ChatAgentLauncher render-only | Normativo: launcher renderiza resultado resolvido. | Launcher renderiza assistant markdown/snapshot; package possui `check:chat-launcher-render-only`. | `apps/web/src/components/agents/ChatAgentLauncher.tsx:1820`; `package.json:61` | Guard existente, monitorar drift | P0 guardrail | Qualquer nova inferencia no launcher vira drift P0. | Manter gate em todos PRs |
| tenant/workspace/scope | Obrigatorio e fail-closed. | `enforceTenant` injeta tenant/workspace; `requireScope` nega 403 com reasonCode. | `apps/api/src/middlewares/enforceTenant.ts:58`; `apps/api/src/middlewares/requireScope.ts:20` | Implementado no core, falta contrato ARCH-CHAT carregar explicitamente | P1 | Handoff sem escopo verificavel. | ARCH-IMPL-0/1 |
| entitlement/RBAC | Handoff e surfaces devem falhar fechado. | IMOB resolve-turn exige `imob.chat.use`; artifact capabilities exigem permissao/stage/scope. | `apps/api/src/routes/imob.ts:1715`; `apps/api/src/services/imob/imobArtifactCapabilities.ts:37` | Implementado por IMOB, nao universalizado | P1 | Vertical futura pode bypassar padrao. | ARCH-IMPL-1 |
| policy/HITL | Chat nao decide policy; HIGH/CRITICAL exigem HITL. | Approval gate IMOB bloqueia por status/scope/expiracao; testes cobrem bloqueios. | `apps/api/src/services/imob/imobApprovalGate.ts:45`; `apps/api/src/tests/imob-approval-gate.test.ts:6` | IMOB real, universal adapter ausente | P1 | Shadow real pode expor status incompleto no Chat. | ARCH-IMPL-3 |
| run/receipt/bundle/ledger | Proof deve ser validado e render-only; Receipt Canon nao e fechado por ARCH-CHAT. | Ledger e bundle reais existem com `ledger.view`/`reports.view`; tests cobrem 200/400/404/409. | `apps/api/src/routes/governance.ts:432`; `apps/api/src/routes/runs.ts:1473`; `apps/api/src/tests/ledger-bundle.contract.test.ts:184` | Core implementado, Chat universal adapter ausente | P2 | Misturar proof IMOB especifico com snapshot universal proibido. | ARCH-IMPL-3 |
| CI contract validation | Contratos fisicos precisam de schema/baseline/compat. | Existem checks Agent Protocol, Receipt Canon e presentation snapshot; nao ha check para `chat.vertical_handoff.v1`. | `package.json:61`; `package.json:63`; `package.json:104`; `package.json:105` | CI gap | P0/P2 | Drift contratual nao bloqueado. | ARCH-IMPL-0 |
| evidence indexing | Evidence Index so aceita evidencia real. | `docs/EVIDENCE_INDEX.md` indexa evidencias reais; propostas ARCH-CHAT nao devem ser adicionadas como evidencia operacional. | `IA_EIAH.md:230`; `docs/EVIDENCE_INDEX.md:1` | Sem gap para este doc; exige disciplina | P0 guardrail | Declarar DONE sem evidencia. | Manter fora do index ate execucao real |
| IMOB shadow readiness | ARCH-CHAT-7 define shadow -> pilot -> small. | Nao ha nova evidencia de shadow ARCH-CHAT; IMOB possui evidencias historicas e testes, mas nao este rollout. | `docs/proposals/arch-chat-7-imob-pilot-integration-plan.md:159`; `docs/EVIDENCE_INDEX.md:158` | Rollout pendente | P4 | Iniciar shadow cedo demais. | IMOB-PILOT-0 apos ARCH-IMPL gates |

## 6. Classificacao P0-P4

P0: drift documental/contratual/runtime ou referencia quebrada.

- `chat.vertical_handoff.v1` ausente em `contracts/`.
- Ausencia de CI especifico para validar esse contrato, baseline e exemplo.
- Qualquer tentativa futura de implementar renderizacao ARCH-CHAT diretamente no `ChatAgentLauncher` sem contrato/produtor.

P1: governanca, policy, RBAC, entitlement, tenant/workspace/scope e HITL.

- Produtor fisico de handoff ausente.
- Produtores de badge e cockpit link ausentes.
- `hitl.gate_state.v1` universal ausente.
- Adapter read-only de gate state para Chat ausente.

P2: auditoria, receipts, bundles, ledger, proof e contratos interop.

- `ProofReceiptBundleStateV1` ausente.
- Producer universal de proof state ausente.
- Render surface universal de proof no Chat ausente.
- CI ainda nao valida drift dos contratos ARCH-CHAT de proof/gate/handoff.

P3: economy/provider/settlement/billing.

- Fora do escopo direto de ARCH-CHAT-8.
- Mantem bloqueio para provider externo, WhatsApp produtivo, secrets produtivos, webhooks produtivos, settlement/financeiro real e mutacoes criticas.

P4: rollout IMOB/Track P.

- IMOB-PILOT-0 ainda no-go enquanto P0/P1 bloqueantes estiverem abertos.
- Shadow real exige evidencia, gates, metricas e rollback; ARCH-CHAT-8 nao inicia rollout.

## 7. Sequencia segura de implementacao

ARCH-IMPL-0: formalizar schemas/contracts minimos sem runtime.

- Criar schema/baseline/exemplo para `chat.vertical_handoff.v1`.
- Definir shape minimo para `renderHints.verticalBadge`, `cockpitDeepLink`, `hitl.gate_state.v1` e `proof.receipt_bundle_state.v1` ou explicitar separacao por schemas.
- Adicionar contract validation e baseline compat sem mudar runtime.
- Status esperado: P0 reduzido, sem renderizacao nova.

ARCH-IMPL-1: produtor fisico read-only de handoff snapshot.

- Produzir handoff read-only no backend/runtime/engine com tenant/workspace/scope, verticalId, intentId, reasonCode e hints.
- Fail-closed quando contexto minimo faltar.
- Sem ChatAgentLauncher policy, sem provider, sem mutation.
- Status esperado: P1 handoff/badge/link reduzido.

ARCH-IMPL-2: render surface universal read-only no Chat.

- Criar componentes/renderizacao universal para badge e cockpit link recebidos do contrato validado.
- Launcher apenas consome props/snapshot/contrato ja resolvido.
- Testar ausencia de inferencia por path, markdown livre ou texto.
- Status esperado: render de handoff seguro, sem gate/proof ainda.

ARCH-IMPL-3: gate/proof adapters read-only.

- Criar adapters universais de `hitl.gate_state.v1` e `proof.receipt_bundle_state.v1`.
- Renderizar estados `pending/blocked/available/inconsistent` sem aprovar, mutar, gerar receipt ou bundle.
- Garantir que `presentation-snapshot.v1` continue sem campos proibidos.
- Status esperado: P1/P2 reduzidos para IMOB-PILOT-0.

IMOB-PILOT-0: Shadow Readiness Checklist.

- Executar checklist documental/operacional de shadow readiness.
- Confirmar P0=0, P1 bloqueantes=0, producers minimos definidos ou explicitamente nao exigidos para shadow.
- Validar metrics/gates/rollback.
- Ainda nao inicia shadow se checks/evidencias nao forem produzidos.

## 8. Gates de nao-regressao futuros

Gates futuros recomendados para PRs de implementacao:

- Contract schema validation para `chat.vertical_handoff.v1`.
- Baseline compatibility para contratos ARCH-CHAT.
- `pnpm check:evidence-index`.
- `pnpm check:docs-link-integrity`.
- `pnpm check:chat-launcher-render-only`.
- `pnpm check:presentation-snapshot-contract`.
- Check especifico: no policy in frontend.
- Check especifico: tenant/workspace/scope required no handoff.
- Check especifico: no provider/WhatsApp productive.
- Check especifico: no critical mutation.
- Check especifico: no fabricated proof.
- Teste de renderizacao: badge/link/gate/proof so aparecem com estado validado.
- Teste fail-closed: contrato incompleto nao renderiza CTA ativa.

## 9. Go/No-Go para IMOB-PILOT-0

Go somente se:

- P0 = 0.
- P1 bloqueantes = 0.
- Produtores fisicos minimos definidos, ou explicitamente nao exigidos para shadow read-only com justificativa documentada.
- Render surfaces safe e testadas.
- Metrics/gates definidos e versionados.
- `ChatAgentLauncher` permanece render-only.
- Tenant/workspace/scope/entitlement/RBAC falham fechado.
- Proof/gate nao sao fabricados no frontend.

No-go se:

- `chat.vertical_handoff.v1` continuar necessario para shadow real e ainda for apenas documental.
- Frontend precisar inferir policy, vertical, entitlement, HITL, proof ou risk.
- Gate/proof nao tiver estado validado.
- CI nao validar drift de contrato.
- Qualquer provider real, secret produtivo, webhook produtivo, mutacao critica ou approval no Chat for necessario.

Status atual para IMOB-PILOT-0: no-go para shadow real; go apenas para planejamento/PRs de implementacao pequenos.

## 10. Fora de escopo

- Implementacao de codigo.
- Ativar shadow/pilot/small.
- Provider/WhatsApp produtivo.
- Secrets produtivos.
- Webhook produtivo.
- Mutacoes criticas.
- Novo endpoint de approval.
- Ledger write novo.
- Geracao de receipt/bundle.
- Fechamento de Receipt Canon.
- Rollout final.
- Alterar runtime.
- Alterar engine.
- Alterar ChatAgentLauncher.
- Alterar schema, workflows, packages ou scripts.

## 11. Riscos e mitigacao

| Risco | Impacto | Mitigacao |
| --- | --- | --- |
| Matriz incompleta | PRs futuros podem atacar ordem errada. | Revalidar com `rg --no-ignore`, lista de `contracts/` e file:line em cada PR. |
| Evidencia arquivo:linha insuficiente | Decisao baseada em suposicao. | Exigir file:line para toda afirmacao de estado atual. |
| Gap classificado baixo demais | Shadow pode comecar com risco de policy/proof. | P0/P1 bloqueiam IMOB-PILOT-0; revisao obrigatoria antes de reclassificar. |
| Shadow iniciado cedo | Operacao parcial sem contrato/produtor. | No-go enquanto P0/P1 bloqueantes existirem. |
| Frontend virar policy | Violacao agent-driven. | `check:chat-launcher-render-only` e teste "no policy in frontend". |
| Proof fabricado | Auditoria enganosa. | Proof so por estado validado; snapshot v1 continua proibindo campos proof/backend. |
| Receipt Canon fechado sem evidencia | Fechamento indevido. | ARCH-CHAT-8 declara explicitamente que nao fecha Receipt Canon. |

## 12. DoD

- ARCH-CHAT-1 a 7 comparados contra o codebase real.
- Gaps classificados em P0-P4.
- Evidencia `arquivo:linha` incluída para o estado atual.
- Sequencia segura de implementacao definida.
- Go/No-Go para IMOB-PILOT-0 definido.
- Checks obrigatorios verdes.
- Nenhuma alteracao proibida realizada.
- Nenhum codigo alterado.
- Nenhum shadow/pilot/small iniciado.
- Nenhuma operacao fechada declarada.
- Receipt Canon nao declarado fechado.
- Status mantido como proposta/parcial evidenciada documentalmente.
