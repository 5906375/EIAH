# ADR-010 — Unificação do chat: EIAH em `/app/chat` como front door único de todas as verticais

## Status

Aprovada pelo administrador único (ADR-008) — implementação pendente

## Data

2026-09-30

## Responsável pela decisão

Carlos Alberto Merlo

## Decisão

**Decisão de Carlos Alberto Merlo — 30/09/2026, America/Sao_Paulo.** Origem: declaração explícita do usuário em
conversa, registrada literalmente. Registro textual, sem assinatura digital ou verificação independente de identidade.

> “Eu, Carlos Alberto Merlo, aprovo em 30/09/2026 a unificação do chat: o EIAH em /app/chat é o front door único da
> plataforma. Todas as verticais e seus produtos personalizados devem ser ativados e/ou operar dentro dessa
> conversa, começando pelo IMOB. Aprovo como contrato transversal base o vertical.registry.v1 e o
> chat.vertical_handoff.v2, e autorizo a implementação em PRs sequenciais, cada um com testes, fail-closed
> preservado e ChatAgentLauncher apenas renderizando. A ativação de vertical ou produto pelo chat exige confirmação
> explícita do usuário na conversa antes de efetivar. As rotas dedicadas de cada vertical, como /app/imob/chat,
> permanecem disponíveis até a paridade ser comprovada por E2E; o redirecionamento exige decisão própria. Esta
> aprovação não altera billing/custo (IMOB Cost), ruleset ou Evidence Index, e não reabre o IMOB Data fechado sem
> decisão específica.”

## 1. Contexto

- `docs/architecture/vertical-context-imob.md` define o EIAH como front door universal e o IMOB como vertical dentro
  da conversa, mantendo `/app/imob/chat` como baseline temporária; os PRs funcionais (PR 1+) estavam bloqueados até
  existir contrato transversal aprovado e autorização explícita.
- `docs/architecture/chat-vertical-handoff-v2.md` registra `vertical.registry.v1` e `chat.vertical_handoff.v2` como
  contratos em preflight parcial, sem produtor ou consumidor operacional. O registry já prevê as verticais `core`,
  `imob`, `legal`, `mkt`, `bpo_financeiro`, `log`, `health` e produtos `custom:<slug>` registrados por tenant/workspace.
- Observação de 2026-09-30 (ambiente local, leitura de código em `main` `8a650e1`): após cadastro e ativação da
  vertical IMOB, o front door não executa runs porque toda run exige atribuição de agente no workspace
  (`apps/api/src/services/runs.ts`, `assertWorkspaceAgentEnabled` em
  `apps/api/src/services/workspaceAgentAssignments.ts`) e nenhum fluxo de produto cria essas atribuições; apenas
  scripts de validação as inserem diretamente no banco. A ativação de verticais hoje só ocorre pelas telas do
  Marketplace (`POST /marketplace/installations/activate`).

## 2. O que esta decisão autoriza

Implementação em PRs sequenciais, cada um revisado e mesclado separadamente. Ordem inicial: A → B → C → F → D (IMOB)
→ E (IMOB); as demais verticais e produtos repetem D e E com critérios próprios.

| PR | Escopo |
| --- | --- |
| A | Provisionar atribuições de agente no cadastro (EIAH) e na ativação de qualquer vertical ou produto, a partir de um mapa versionado vertical → agentes, sem relaxar o fail-closed |
| B | Registry operacional: `vertical.registry.v1` alimentado pelo estado real de instalações e atribuições do workspace, incluindo produtos `custom:<slug>` |
| C | Handoff `chat.vertical_handoff.v2` genérico executado no engine, com continuidade na mesma thread de `/app/chat` |
| F | Ativação de vertical ou produto pelo chat, com confirmação explícita do usuário na conversa antes de efetivar, reutilizando o mecanismo de ativação existente |
| D1 | Capacidades de leitura da vertical no front door (IMOB primeiro) |
| D2 | Cadastros operacionais da vertical no front door (IMOB: proprietário, imóvel, lead/inquilino, processo) |
| D3 | Intake, upload, anexos e documentos da vertical no front door (IMOB: contrato) |
| D4 | Runs, HITL, proof, receipt e bundle reais da vertical no front door |
| E | E2E das jornadas críticas por vertical, rollout por workspace e plano de rollback |

## 3. Condições obrigatórias em cada PR

- Testes da mudança, incluindo regressão fail-closed.
- `ChatAgentLauncher` apenas renderiza; regras pertencem ao contrato do agente e são executadas no engine (`AGENTS.md`).
- Isolamento tenant/workspace, RBAC/entitlement e masking de PII preservados.
- Contratos sem prompt, resposta ou documento bruto, conforme `chat-vertical-handoff-v2.md`.
- Ativação pelo chat somente após confirmação explícita do usuário na conversa; ausência de confirmação bloqueia.
- Status declarado conforme `IA_EIAH.md` §17.

## 4. O que permanece bloqueado

- Redirecionamento das rotas dedicadas de vertical (ex.: `/app/imob/chat`) para `/app/chat`: exige decisão própria
  após paridade comprovada por E2E.
- Alterações de billing/custo (frente IMOB Cost), ruleset e `docs/EVIDENCE_INDEX.md`.
- Reabertura do IMOB Data fechado sem decisão específica.
- Qualquer rollout de produção ou uso de provider não coberto pelos PRs acima.

## 5. Critério de paridade (para cada futura decisão de redirect)

Conforme `vertical-context-imob.md`, aplicado a cada vertical: continuidade de thread/caso, referências canônicas,
RBAC/entitlements, fail-closed, comportamento read-only e mutacional governado, E2E das jornadas críticas e plano de
rollout/rollback.

## 6. Evidência

Esta ADR é uma decisão, não evidência de execução, e não é indexada em `docs/EVIDENCE_INDEX.md`.
