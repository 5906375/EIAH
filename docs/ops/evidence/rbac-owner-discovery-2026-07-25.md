# RBAC owner discovery — entrega 3, fatia 2/6

| Campo | Valor |
| --- | --- |
| Data da execução | `2026-07-27` |
| Baseline | `main@96ef8cf453ef3977dc33a644671dc6aa36d1998b` |
| Alvo primário | `RolePermission` / `role_permissions` |
| Dependência observada | `TenantCustomRole` / `tenant_role_customs` |
| Ambiente | repositório e artifacts locais; sem staging/produção |
| Melhor achado | `existing-service-candidate` |
| Estado final do owner | `owner-deferred` |

## Limite e masking

- Discovery não destrutivo; dump SQL não aberto.
- Resultados excluem valores de PII, secrets, tokens, e-mails,
  tenant/workspace reais e identificadores sensíveis.
- Os passes 2 e 3 geraram saída ampla. Pela regra MUST de masking, a saída real
  abaixo preserva contagem, hash e somente linhas relevantes sanitizadas.
- `dist`/JavaScript local não é fonte canônica TypeScript. Quando encontrado,
  foi classificado como artifact local e não como implementação versionada.

## Saída dos três passes

### Pass 1 — modelos/tabelas RBAC

Captura: `12` linhas; SHA-256
`4db300dcbeba9c2e0d44ccf3fe97e0011e68181591c6fee022253f2582cfb2e5`.

```text
apps/web/src/pages/profile.tsx
packages/db/src/generated/client/edge.js
packages/db/src/generated/client/index.js
packages/db/src/generated/client/index.d.ts
packages/db/src/generated/client/index-browser.js
packages/db/src/generated/client/schema.prisma
packages/db/prisma/migrations/20260213141438/migration.sql
packages/db/prisma/migrations/20260120000000_bootstrap_missing_tables/migration.sql
packages/db/prisma/schema.prisma
docs/ops/evidence/schema-migrations-drift-before-2026-07-25.md
docs/ops/evidence/db-contract-lifecycle-decisions-2026-07-25.md
docs/ops/evidence/db-contract-lifecycle-inventory-2026-07-25.md
```

A inspeção posterior por linhas, excluindo código gerado e `dist`, encontrou UI
de seleção de permissões em memória, schema/migrations e as evidências
anteriores. Não encontrou operação Prisma/SQL canônica do modelo/tabela no
runtime.

### Pass 2 — enforcement RBAC

Captura: `348` linhas; SHA-256
`192456f6c4e5c9dd07cde5bda38907f287cfda46ef819cfb786a54d0c7f7d71b`.
Saída real relevante, sanitizada:

```text
apps/api/src/middlewares/requireScope.ts:20:export function requireScope(requiredScope: string) {
apps/api/src/middlewares/requireScope.ts:33:      const decision = await requireScopeDeps.checkScopePermission({
packages/core/src/policy/TenantPolicyStore.ts:69:export class TenantPolicyStore {
packages/core/src/security/rbac.ts:43:  const store = TenantPolicyStore.getInstance();
packages/core/src/security/rbac.fail-closed.test.ts:50:test("TenantPolicyStore fails closed when policy is missing for tenant/workspace", async () => {
scripts/checkRbacFailClosed.ts:33:  "packages/core/src/policy/TenantPolicyStore.ts",
apps/api/dist/packages/core/src/policy/TenantPolicyStore.js:1:export class TenantPolicyStore {
```

A inspeção do último artifact encontrou default allow-all nas linhas `9–11`.
Esse arquivo é local, ignorado por `.gitignore:10`, não rastreado e diverge do
TypeScript canônico fail-closed.

### Pass 3 — agente-owner e trilha

Captura: `6.991` linhas em `972` arquivos; SHA-256
`b99afe05234e435fb95e4bc45c2f62472dcc44313fc777d948b9b3e5d3716ac0`.
Saída real relevante, sanitizada:

```text
packages/core/src/security/rbac.ts:9:import { guardrailLedger } from "../audit/guardrailLedger";
packages/core/src/security/rbac.ts:50:    await guardrailLedger.log({
packages/core/src/actions/agents/guardianAction.ts:235:      { sourceId: "audit.receipt-bundles", kind: "ledger", authorityLevel: "primary", required: true, version: "v1" },
packages/core/src/actions/agents/guardianAction.ts:239:    sourcePrecedence: ["audit.receipt-bundles", "audit.guardrail-logs", "security.rbac-audit"],
packages/core/src/actions/agents/aadvAction.ts:190:      { sourceId: "billing.ledger", kind: "ledger", authorityLevel: "primary", required: true, version: "v1" },
packages/core/src/actions/agents/aadvAction.ts:193:    sourcePrecedence: ["finops.run-events", "billing.ledger", "security.rbac-audit"],
```

AADV consome auditoria RBAC como fonte secundária para due diligence; Guardian
consome a mesma fonte para evidências. Nenhum dos contratos atribui enforcement,
custódia de `RolePermission`, limite específico do domínio ou delegação humana.

## Code discovery — RBAC

| Busca | Resultado (mascarado) | Classificação | evidenceRef | reasonCode | Observação |
| --- | --- | --- | --- | --- | --- |
| `RolePermission` / `role_permissions` | Contrato existe em schema/migrations; uso TypeScript/SQL canônico nomeado permanece `0` | `no-existing-owner` para o contrato DB | `{ commitSha: 96ef8cf453ef3977dc33a644671dc6aa36d1998b, location(path:linhas): packages/db/prisma/schema.prisma:1248-1256, hash(snapshot): e9036d02837852ef9b20167763b15f40bdc29bb938f6579371057fad3bdcaefb }` | `N/A`; `blockingCondition=reason-code-missing-for-rbac-owner-deferral`; issue `#386` | Grep negativo não prova desuso e não promove lifecycle. |
| `TenantPolicyStore` | Resolve policy exata/tenant-wide e nega policy ausente, mismatch, disable ou indisponibilidade | `existing-service-candidate` | `{ commitSha: 96ef8cf453ef3977dc33a644671dc6aa36d1998b, location(path:linhas): packages/core/src/policy/TenantPolicyStore.ts:79-179, hash(snapshot): f3307b4c23e5ffa187204a27e41de38398725a05bb21eeee56d120f20959e045 }` | `POLICY_NOT_FOUND`, `WORKSPACE_SCOPE_MISMATCH`, `TENANT_POLICY_DISABLED`, `POLICY_STORE_UNAVAILABLE` | Enforcement canônico é fail-closed e usa `TenantActionPolicy`, não `RolePermission`. |
| RBAC core + ledger | `checkScopePermission()` chama o policy store e grava allow/deny no GuardrailLedger | `existing-service-candidate` | `{ commitSha: 96ef8cf453ef3977dc33a644671dc6aa36d1998b, location(path:linhas): packages/core/src/security/rbac.ts:26-68, hash(snapshot): efcf21d923d8e6350f51ed2e94e5cd624e5db73b64519d90c3318c1d06551fcb }` | reason code da decisão do policy store | Há trilha real, mas service não é agente-owner. |
| Middleware HTTP `requireScope` | Propaga deny como `403` com reason code; erro inesperado retorna `500` | `existing-service-candidate` | `{ commitSha: 96ef8cf453ef3977dc33a644671dc6aa36d1998b, location(path:linhas): apps/api/src/middlewares/requireScope.ts:20-64, hash(snapshot): 75fc7b338b62bf1288e954b111a54fbe31d77d48b8c7e6c0a24e6918038dee08 }` | reason code da decisão; fallback `RBAC_ERROR` | Aplica RBAC, sem autoridade formal de owner. |
| Registry, AADV e Guardian | Agentes têm nomes estáveis e fontes auditáveis, mas nenhum declara custódia/enforcement de `RolePermission` nem delegação ratificada | `no-existing-owner` para agente formal | `{ commitSha: 96ef8cf453ef3977dc33a644671dc6aa36d1998b, location(path:linhas): packages/core/src/actions/agents/registry.ts:21-37, hash(snapshot): 768ccabb44c643c8641a7f1f2d950d276645acfe02b556ac1cb10d25dcc3f6fe }` | `N/A`; `blockingCondition=reason-code-missing-for-rbac-owner-deferral`; issue `#386` | Auditor de RBAC ou evidência de RBAC não equivale a owner operacional. |
| Artifact local `TenantPolicyStore.js` com default allow-all | Artifact ignorado/não rastreado contém retorno permissivo; snapshot não inclui dado sensível | `existing-service-candidate` + candidato a incidente P0 por drift runtime/build | `{ commitSha: 96ef8cf453ef3977dc33a644671dc6aa36d1998b, location(path:linhas): apps/api/dist/packages/core/src/policy/TenantPolicyStore.js:1-13 (artifact local ignorado), hash(snapshot): 5227ed628e861344e45b1f13a3f4bcfb4dbb6a33c6313ee6d304beb7d05b7e4a }` | `N/A`; `blockingCondition=reason-code-missing-for-rbac-build-artifact-drift`; issue `#386` | Não foi alterado. O gate atual passou, mas não inspeciona esse artifact local. Antes de usar `apps/api/dist` como runtime, regenerar em runner limpo e provar ausência do fallback. |
| Gate e testes fail-closed | Check dedicado passou; testes core e HTTP focados passaram | `existing-service-candidate` | `{ commitSha: 96ef8cf453ef3977dc33a644671dc6aa36d1998b, location(path:linhas): scripts/checkRbacFailClosed.ts:1-59, hash(snapshot): f648f0dff7d2547e191281c4bd276d0e280ea92fd6762ded884228c765f2a95d }` | deny codes acima | O resumo `tenantPolicyBuildArtifactGuarded=true` cobre o wrapper TypeScript versionado, não o `dist` local encontrado pelo Pass 2. |

## Decisão para RolePermission

| Item | Domínio | Autoridade final | Owner operacional delegado | OwnerStatus | Classificação | reasonCode | Limite | Próxima ação |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `RolePermission` / `role_permissions` | RBAC | Carlos Alberto Merlo | não confirmado | `owner-deferred` | `existing-service-candidate` — `TenantPolicyStore`, RBAC core e `requireScope`; nenhum é owner delegado do contrato | `N/A`; `blockingCondition=reason-code-missing-for-rbac-owner-deferral`; issue `#386` | Não alterar RBAC, permissões, tenant roles, contrato DB ou política sem aprovação humana explícita de Carlos Alberto Merlo. | Carlos Alberto Merlo deve ratificar owner operacional; depois, mapear relação entre `RolePermission` e `TenantActionPolicy` e decidir wiring, suporte legado ou sunset em entrega separada. |

## Dependência TenantCustomRole

| Item | Domínio relacionado | Relação com RBAC | Estado nesta fatia | evidenceRef | Próxima ação |
| --- | --- | --- | --- | --- | --- |
| `TenantCustomRole` / `tenant_role_customs` | tenant/workspace + RBAC | Parent relacional de `RolePermission` e referência opcional de membership; sem uso runtime canônico nomeado | dependência cross-domain — não fechada | `{ commitSha: 96ef8cf453ef3977dc33a644671dc6aa36d1998b, location(path:linhas): packages/db/prisma/schema.prisma:1286-1297, hash(snapshot): 85f4489bb69f12b6f7a1bccb91e9b64adb189bedb4f892f4fe9163f51937142d }` | Manter `needs-human-decision`; executar a fatia própria de tenant custom roles e obter ratificação humana independente. |

## Resultado e controles

- Melhor achado: `existing-service-candidate`.
- Owner operacional delegado: não confirmado.
- Estado final: `owner-deferred`; lifecycle permanece
  `needs-human-decision`.
- Autoridade humana final: Carlos Alberto Merlo.
- Candidato P0: artifact local ignorado com default allow-all; não prova
  regressão do TypeScript canônico, mas bloqueia confiança nesse `dist`.
- Reason code de owner/drift: não disponível devido ao source-of-truth drift do
  catálogo registrado na issue `#386`; nenhum código foi fabricado.
- Agentes novos, mudanças em schema/migrations/runtime/dump, DROP, `.env`,
  secrets e push: `0`.
- Staging/produção não observados e não declarados fechados.

## Pendências fora desta fatia

- Wallet/identity.
- Connectors.
- Agent installs.
- Tenant custom roles.
- Dump `AR-002`, ainda `defer-with-blocker`.
