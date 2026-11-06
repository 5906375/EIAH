> Cópia sanitizada de `guards_review.md` (SHA-256 do original: f3ea6bc4fbd6a9f97b5b25aa7f13b1f107fedaae2cb5c2bad08f4210bb31df51). Caminhos/identificadores substituídos por marcadores; texto técnico inalterado.

# Revisão estática das duas guardas (worktree P11, base 88bb3a2) — pontos e linhas lidos no código real

## Guarda 1 — `vertical.access.v1` (`resolveVerticalAccess` + `buildImobVerticalAccessFacts`, `verticalRegistryComposition.ts`)
- **Fatos do servidor:** `readVerticalRegistryFacts(prisma, { tenantId, workspaceId, userId })` com `authContext` do TOKEN (ramo `claimOnly` de `routes/imob.ts`); nada vem do corpo (`tenantId`/`workspaceId`/`authority` no corpo são ignorados — coberto no teste de integração P11).
- **Instalação/entitlement:** `IMOB_INSTALLATION_STATUS` → instalação sintetizada só com `active|inactive` (ausente → `null`); `entitled` e `agentsReady` entram no handoff v2.
- **Permissão da capability:** `imob.chat.use` (`userCanUse`) + capability `crm.case.consult` só em `read_only`.
- **Uso/revogação:** `usage` (`blocked` nega tudo; `read_only` nega escrita). Antes disso, `imobRevocationGate` (middleware do router IMOB) já recusa o POST sob revogação → 403 (mais estrito; não foi enfraquecido).
- **Acesso ≠ autorização de action:** a decisão devolve `actionAuthorization: "not_evaluated"`; o ramo `claimOnly` só executa a etapa transversal de LEITURA (sem `upsert`, sem pendência, sem execução); testado (sem escrita no banco; 0 runs/habilitações/delegações).
- **Resultado: sem divergência nem bypass próprios.** Falhas de ordem/escopo encontradas estão no vínculo com o CASO (abaixo), não nesta guarda.

## Guarda 2 — `chat.vertical_handoff.v2` (`buildAndEvaluateVerticalHandoff`)
- **Registry/capability:** `composeVerticalRegistry` só oferece `crm.case.consult` quando o IMOB está `enabled` (instalação ativa ∧ `entitled` ∧ `agentsReady` ∧ usage≠blocked); modo `read_only`.
- **Compatibilidade com o v1:** o v2 é MAIS estrito (exige também `entitled` e `agentsReady`); o ramo `claimOnly` exige AMBOS (E lógico), fail-closed. Nenhum caso em que o v1 permita e o v2 negue vire acesso.
- **Ausência de bypass por fallback/`claimOnly`/contexto restaurado:** a avaliação roda a cada turno, depois de reconhecer o turno e ANTES de ler o caso (`authorize`); `threadState` e `caseId` restaurados do `sessionStorage` só influenciam o fluxo pendente/ID, nunca a autorização. **Exceção de ordem:** o fallback de CASO (abaixo) ignora a permissão de ETAPA.
- **Revogação existente:** preservada (gate do router antes do ramo). Em somente leitura o gate recusa o POST (403) embora o v1/v2 permitiriam a consulta — fail-closed; não harmonizar enfraquecendo.

## Achados (todos no vínculo com o caso; origem indicada)
1. **Fallback silencioso ao caso mais recente** — `imobCrmOperationalCase.ts` (`params.caseId ? findFirst(id) : findFirst(orderBy updatedAt desc)`), acionado no ramo `claimOnly` porque `routes/imob.ts` envia `caseId: existingScopedCase?.id ?? null`: SEM `caseId`, ou com `caseId` inexistente/de outro workspace/de outro tenant, o consultivo lê o caso mais recente do workspace. O texto transversal ainda afirma "estou usando o imóvel deste caso" e a nota "Usei o caso IMOB mais recente…" é descartada por `applyTransversalTurnPresentation`. Origem: P10 (consulta sem caso) estendida pelo P11 ao Front Door.
2. **Fallback ignora a permissão de ETAPA** — `ensureImobStagePermission` só roda para `existingScopedCase`; no fallback o caso lido não passa pelo gate. Origem: já existe no `resolve-turn` normal ("qual o status desse caso?" sem `caseId` devolve o mesmo caso a quem só opera outra etapa — ver `stage_permission_check.json`); o P11 o expõe também pelo Front Door.
3. **500 em vez de 403 na negação de etapa/permissão** — `ensureImobStagePermission(res, …)` chama `sendImobPermissionDenied(undefined, …)` ⇒ `tenantId=""` ⇒ ZodError ⇒ 500 (fail-closed, sem vazamento, mas código errado). Origem: preexistente em `routes/imob.ts` (o hunk CRM/C4 pendente em `imobCrmRouter.ts` já passa `req`); não é do P11.
