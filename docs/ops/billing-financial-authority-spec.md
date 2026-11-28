# Especificação mínima — escritas financeiras de billing (BILLING-002 → BILLING-003)

**Status:** PROPOSTA técnica baseada em `AUTHZ-FIN-1`. O contrato **não está ratificado**: este documento não é uma decisão
do owner, não concede autoridade a ninguém e não executa bootstrap. A referência provisória `AUTHZ-FIN-1` não deve ser
tratada como ratificada em nenhum registro ou evidência.

**Teste de referência:** `apps/api/src/tests/billing-financial-authority.contract.test.ts`
(fixture: `apps/api/src/tests/support/billingFinancialAuthorityFixture.ts`). Cada requisito abaixo tem uma etiqueta de teste.

**Escopo fechado:** somente as três rotas abaixo. As demais escritas e leituras financeiras do `billingRouter` ficam como estão.

| # | Rota | Escopo exigido | Sucesso |
|---|---|---|---|
| 1 | `PATCH /api/billing/tenant/quotas` | `billing.limits.manage` | 200 |
| 2 | `PATCH /api/billing/tenant/workspaces/:id/grant` | `billing.limits.manage` | 200 |
| 3 | `POST /api/billing/tenant/adjustment` | `billing.ledger.adjust` | **negado por padrão** (`403 BILLING_ADJUSTMENT_APPROVAL_REQUIRED`) até a ratificação da aprovação por dois atores |

## 1. Premissas (hipóteses de implementação do owner)

1. Negação por padrão: ausência, dúvida ou erro de leitura = negar.
2. Nenhuma autoridade deriva de Founder, papel, permissão de membro, `products.activate`, `actions.admin`, administrador por
   e-mail ou `ADMIN_API_TOKEN`. Autoridade = **designação** explícita (§6).
3. Token técnico sem `userId` nunca exerce.
4. Identidade humana + vínculo ativo no workspace do token são pré-condições.
5. Toda mutação autorizada gera auditoria na **mesma transação**; falha da auditoria desfaz a mutação.
6. Replay do mesmo `requestId` é idempotente. Ledger, uso de cota e auditoria são transacionalmente consistentes.
7. Não há criação de designação inicial nem bootstrap (D1 segue bloqueado).

## 2. Ordem de decisão (a primeira falha encerra, sem mutação)

| Passo | Condição | Resposta |
|---|---|---|
| 1 | `enforceTenant` (token válido, não revogado, não expirado; `x-delegation-id` só restringe) | 401 `UNAUTHORIZED` / `TOKEN_EXPIRED`; 403 `DELEGATION_MISSING` (existentes) |
| 2 | `authContext.userId` presente | 403 `BILLING_IDENTITY_REQUIRED` |
| 3 | vínculo **ativo** da pessoa no workspace do token (ausente, revogado ou inativo) | 403 `BILLING_MEMBERSHIP_REQUIRED` |
| 4 | designação `holder` **ativa** (não revogada, não expirada) da pessoa, **no tenant do token**, para o escopo da rota; limites válidos | 403 `BILLING_AUTHORITY_REQUIRED` |
| — | falha ao ler vínculo ou designação (tabela ausente, erro de consulta) | 503 `BILLING_AUTHORITY_CHECK_UNAVAILABLE` |
| 5 | corpo estrito (§3) | 400 `INVALID_PAYLOAD` (ou código existente de domínio, §3) |
| 6 | recurso no tenant (workspace do `:id` / `workspaceId`) | 404 `WORKSPACE_NOT_FOUND` (existente; indistinguível de inexistente) |
| 7 | teto da designação (só ajuste) | 403 `BILLING_LIMIT_EXCEEDED` |
| 8 | transação: efeito + auditoria (cotas e concessão) | 503 `BILLING_AUDIT_UNAVAILABLE` / `BILLING_WRITE_UNAVAILABLE` |
| 8' | ajuste: aprovação por dois atores distintos (mecanismo **não ratificado**) | 403 `BILLING_ADJUSTMENT_APPROVAL_REQUIRED`, sempre, sem mutação |

A autoridade é verificada **antes** da validação do corpo e da existência do recurso: quem não tem autoridade não aprende nada
sobre o corpo nem sobre workspaces. Leitura da designação **sem cache**: a revogação vale na chamada seguinte.
Designação `grantor` **não** exerce (separação de funções); designação de outro tenant não vale; escopo errado não vale.
Negativas de passo 2–4 são registradas em `billing.authority.denied` em **melhor esforço** (a negação nunca depende do registro).

## 3. Corpo e efeito por rota

Todos os corpos são **estritos** (campo extra, inclusive `tenantId`/`workspaceId` onde não previsto = `INVALID_PAYLOAD`) e
exigem `reason` (3–300), `evidenceRef` (3–120, `^[A-Za-z0-9][A-Za-z0-9._:/#@-]{2,119}$`) e `confirmed: true`.
Tenant e workspace vêm **só do token**.

**1. quotas** — campos de cota como hoje (`softLimitPct`, `hardLimitPct`, `monthlyRunsLimit`, `monthlyCostCentsLimit`; ao menos um).
Mantém `MISSING_REQUIRED` (nenhum campo) e `INVALID_LIMITS` (`0–100`, `soft ≤ hard`). Auditoria `billing.quota.updated` com `before`/`after`.

**2. grant** — `enabled`, `localRunLimit`, `localCostCentsLimit` como hoje (ao menos um). Workspace fora do tenant ou inexistente:
`404 WORKSPACE_NOT_FOUND`. Auditoria `billing.workspace_grant.updated` com `before`/`after`.

**3. adjustment** — `amountCents` (inteiro não nulo; zero mantém `400 INVALID_AMOUNT`), `currency` (`BRL`, padrão), `workspaceId?`,
`runId?`, `provider?`, `model?`, `description?` e **`requestId` obrigatório**. `workspaceId` inexistente: `404`. Valor absoluto acima de
`limits.maxAdjustmentCents` da designação: `403 BILLING_LIMIT_EXCEEDED`; designação sem teto válido (inteiro positivo) **não é
autoridade válida** (`BILLING_AUTHORITY_REQUIRED`). Auditoria `billing.adjustment.applied` com `ledgerEntryId`, `requestId`, `amountCents`.

Resposta de sucesso preserva o formato atual (`{ ok: true, data }`) em cotas e concessão.

**Ajuste (BILLING-003 §4):** enquanto não existir mecanismo ratificado de aprovação por **dois atores distintos**, a rota termina SEMPRE em
`403 BILLING_ADJUSTMENT_APPROVAL_REQUIRED`, depois de autoridade, corpo, workspace e teto. Não há bypass por Founder, administrador, papel,
token técnico ou sinalizador de ambiente, nem aprovação simulada. A execução atômica já existe em `applyApprovedFinancialAdjustment`
(`financialBillingWrites.ts`), que exige proponente ≠ aprovador, ambos com `billing.ledger.adjust` válida, e **nenhuma rota a chama**.
Resposta futura do serviço: `{ inserted, ledger, usage, cycleStart, cycleEnd }`.

## 4. Transação, idempotência e falha

- Ajuste (serviço `applyApprovedFinancialAdjustment`; sem rota): inserção no `billing_ledger`, incremento de `tenant_quota_usage` e evento de auditoria numa **única** `$transaction`
  (com os serviços existentes instanciados sobre o cliente transacional). Qualquer falha desfaz tudo: 503 `BILLING_WRITE_UNAVAILABLE`
  (uso) ou `BILLING_AUDIT_UNAVAILABLE` (auditoria), sem linha no ledger.
- Replay (mesmo `tenantId` + `requestId` + tipo): **200**, `inserted: false`, devolve o lançamento original, **não** incrementa o uso
  e **não** grava novo evento de sucesso.
- Quotas/grant: upsert + evento na mesma transação.
- `billing_ledger` continua append-only (triggers existentes). Correção = lançamento compensatório; fora deste escopo.

## 5. Evento de auditoria (`guardrail_audit_ledger`)

`eventType`: `billing.quota.updated` | `billing.workspace_grant.updated` | `billing.adjustment.applied` | `billing.authority.denied`.
`metadata` mínima: `contractRef: "AUTHZ-FIN-1"`, `contractVersion`, `tenantId`, `workspaceId`, `actorUserId`, `tokenId` (**id**, nunca o token),
`designationId`, `scope`, `reason`, `evidenceRef`, `outcome` (`applied`|`denied`), `reasonCode`, `decidedAt`; mais `before`/`after` (quotas, grant)
ou `requestId`/`ledgerEntryId`/`amountCents`/`currency` (ajuste). **Nunca** token, JWT, senha ou credencial.
Limite honesto: o `guardrail_audit_ledger` não é append-only nem encadeado; nada aqui afirma inviolabilidade.

## 6. Designação (contrato da tabela `financial_authority_designation`)

Tabela **separada** de `eiah_commercial_authority_designations` (esta tem `CHECK (scope = 'marketplace.subscribe')`), nível **tenant**:

| Coluna | Tipo | Observação |
|---|---|---|
| `id` | text PK | `fad_<uuid>` |
| `tenant_id` | text NOT NULL → `tenants` | autoridade nunca cruza tenants |
| `beneficiary_user_id` | text NOT NULL → `users` | pessoa |
| `scope` | text NOT NULL | `billing.limits.manage` \| `billing.ledger.adjust` |
| `authority_role` | text NOT NULL | `holder` (exerce) \| `grantor` (concede/revoga; não exerce) |
| `limits` | jsonb NOT NULL | ajuste: `{ "maxAdjustmentCents": <inteiro > 0> }` obrigatório |
| `granted_by_user_id`, `grantor_designation_id`, `evidence_ref` | text | quem concedeu e com base em quê |
| `granted_at`, `valid_until` | timestamptz | validade obrigatória |
| `revoked_at`, `revoked_by_user_id`, `revoke_reason` | | revogação |
| `grant_audit_event_id`, `revoke_audit_event_id` | text | ligação com o audit |

Índice único parcial `(tenant_id, beneficiary_user_id, scope, authority_role) WHERE revoked_at IS NULL`. **Concessão/revogação governadas
(rotas e serviço de grantor) e bootstrap NÃO fazem parte de BILLING-003**; os testes criam designações pela fixture, só em banco descartável.

## 7. Compatibilidade e fora de escopo

Preservados: `AUTHZ-SCOPE-0/1`, `adminScopes` existentes, ADR-009, AUTHZ-ROOT-001; `chargeRun`/conciliação/`ops/billing/reconcile`
(chamadas internas, sem passar por estas rotas); `frontDoorBilling` (autoridade própria, `products.activate`); demais rotas do `billingRouter`
(`charge`, `payment-intents`, `settle`, `disputes`, `plans`, `invoices/generate`) e leituras `GET /billing/tenant/*`; aprovação por dois atores;
rotas de concessão; migração de dados.

## 8. Mapa de testes

`[GUARD]` = já vale e não pode regredir. `[P0-RED]` = exigido pelo contrato.
`[TWO-PERSON]` = substitutos HTTP do ajuste sob a regra de dois atores. `[SERVICE]` = prova do serviço do ajuste aprovado.

| Requisito | Etiqueta / arquivo |
|---|---|
| 401/expirado, delegação inexistente | `[GUARD]` §1 do contrato |
| Autoridade (designação, vínculo, token técnico, Founder, outro workspace, outro tenant, revogada, expirada, escopo errado, grantor) | `[P0-RED]` §2 |
| Isolamento de tenant com autoridade própria; contratos de domínio existentes (`INVALID_AMOUNT`, `INVALID_LIMITS`, `WORKSPACE_NOT_FOUND`) | `[GUARD]` §2–§3 |
| Corpo estrito, `requestId` obrigatório, moeda, teto, política inválida | `[P0-RED]` §3 |
| Cotas e concessão: sucesso com autoria e auditoria; revogação sem cache; falha de auditoria; designações indisponíveis | `[P0-RED]` §4–§5 |
| Ajuste por HTTP: negado com 403 APPROVAL_REQUIRED, sem mutação, também com auditoria ou uso indisponíveis; revogação sem cache | `[TWO-PERSON]` §6 do contrato (S1–S5) |
| Ajuste aprovado por dois atores: sucesso, autoria dupla, independência, replay sequencial e concorrente, rollback por falha de auditoria e de uso, rota continua negada | `[SERVICE]` em `billing-financial-adjustment.service.test.ts` |

**Mapeamento dos 5 cenários originais do BILLING-002 (presumiam sucesso por UM holder):**

| Original | Substituto HTTP | Positivo preservado em |
|---|---|---|
| O1 sucesso + auditoria de autoria | S1 (403, sem mutação, negativa auditada) | `[SERVICE]` sucesso com autoria dupla e sem segredo |
| O2 revogação sem cache | S2 (APPROVAL_REQUIRED → AUTHORITY_REQUIRED) | idem (S2 já prova a propriedade por HTTP) |
| O3 replay | S3 (nada grava) | `[SERVICE]` replay sequencial e concorrente |
| O4 falha de auditoria → 503 | S4 (continua 403) | `[SERVICE]` rollback + retry |
| O5 falha de uso → 503 | S5 (continua 403) | `[SERVICE]` rollback + retry |

**Cobertura PENDENTE (depende do mecanismo de aprovação por dois atores ratificado e de uma rota que o use):** ajuste aprovado por HTTP com
201 e auditoria de autoria dupla; replay por HTTP (200, `inserted:false`); 503 `BILLING_AUDIT_UNAVAILABLE` e `BILLING_WRITE_UNAVAILABLE` por HTTP;
revogação de aprovador após ajuste aplicado. Não há `skip` nem `todo`: a pendência está registrada aqui.

Todo teste negativo verifica **ausência de mutação** (hash de `tenant_quota_policy`, `workspace_quota_grant`, `billing_ledger`,
`tenant_quota_usage`, `tenant_billing_account` dos dois tenants + nenhum evento de sucesso financeiro). Os testes de falha injetada
(gatilhos no banco) exigem `BILLING_P0_FAULT_INJECTION=disposable` e recusam os bancos de desenvolvimento conhecidos.
