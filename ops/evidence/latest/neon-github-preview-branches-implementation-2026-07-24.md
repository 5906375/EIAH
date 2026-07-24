# Neon + GitHub preview branches — evidência de implementação local

Data: 2026-07-24
Baseline: `main@0fb2b279224460f72aae54e46b7ab15b1b2a4ec2`
Classificação: `parcial`

## Escopo materializado

Foram materializados e inspecionados:

- `.github/workflows/neon-preview-create.yml`;
- `.github/workflows/neon-preview-cleanup.yml`;
- `.github/workflows/neon-preview-reconcile.yml`;
- `docs/ops/neon-github-preview-branches.md`;
- `scripts/checkNeonPreviewSchemaCompatibility.ts`;
- `scripts/tests/checkNeonPreviewSchemaCompatibility.test.ts`;
- scripts `check:neon-preview-schema` e `test:neon-preview-schema` em
  `package.json`.

## Validações executadas

### YAML estrutural

Os três workflows foram carregados com `yaml.BaseLoader`, preservando a chave
`on` e validando os jobs esperados:

```text
YAML_OK .github/workflows/neon-preview-create.yml
YAML_OK .github/workflows/neon-preview-cleanup.yml
YAML_OK .github/workflows/neon-preview-reconcile.yml
```

Essa validação prova sintaxe/estrutura YAML local. Não substitui execução pelo
parser do GitHub Actions.

### JavaScript inline dos workflows

Os blocos `node <<'EOF'`/`node --input-type=module <<'EOF'` e os scripts de
`actions/github-script` foram
extraídos em memória e validados com `node --check`, respeitando o modo
CommonJS/ESM de cada bloco:

```text
INLINE_NODE_OK cleanup blocks 1..3
INLINE_NODE_OK create blocks 1..2
INLINE_NODE_OK reconcile blocks 1..3
GITHUB_SCRIPT_OK create scripts 1..2
```

### JSON do package

```text
PACKAGE_JSON_OK
```

### Teste focado do gate de schema

Comando:

```bash
pnpm test:neon-preview-schema
```

Resultado:

```text
tests 1
pass 1
fail 0
```

Nota de granularidade: `runner_file_tests=1` e `declared_test_cases=5`. O
comando versionado usa `node --test` e produz o resumo TAP canônico
file-level (`tests 1 / pass 1 / fail 0`), enquanto o fonte declara cinco
chamadas `test(...)`. Portanto, `tests 1` não significa que apenas um
comportamento foi exercitado.

Lint focado:

```bash
pnpm exec eslint \
  scripts/checkNeonPreviewSchemaCompatibility.ts \
  scripts/tests/checkNeonPreviewSchemaCompatibility.test.ts
```

Resultado: exit `0`, sem findings.

O arquivo de teste cobre:

- diff vazio/aditivo como `compatible`;
- `DROP COLUMN` como `incompatible` e bloqueado sem aprovação;
- statement não classificado como `indeterminate` e bloqueado;
- índice `UNIQUE` como indeterminado;
- liberação de diff não compatível somente com aprovação explícita.

O entrypoint CLI também foi executado no mesmo formato usado pelo workflow:

```bash
pnpm check:neon-preview-schema \
  --input /dev/null \
  --output /tmp/eiah-neon-schema-gate.json \
  --approved false
```

Resultado: `ok: true`, `classification: compatible`, `statementCount: 0`.

O entrypoint também foi executado contra a migration real
`20260723120000_tool_contract_tenant_name_version_unique/migration.sql`, sem
aprovação. Resultado esperado e observado:

```text
ok: false
classification: indeterminate
statementCount: 2
blockingCondition: schema_diff_indeterminate_without_human_approval
exit: 1
```

### Comando de testes DB selecionado

Foi tentada a suíte ampla:

```bash
pnpm --filter @repo/db test
```

Resultado local: `pass 1`, `fail 3`. Os três arquivos legados de
`tenantGuard` falham antes das asserções com `t.$extends is not a function`
porque ainda invocam a extensão Prisma como middleware. O problema é
preexistente e não foi alterado nesta tarefa.

Para não criar um check permanentemente vermelho e ainda validar a migration
em banco real, o workflow usa o teste focado já versionado:

```text
packages/db/src/__tests__/toolContractUnique.integration.test.ts
```

No GitHub ele recebe `MCP_1N_DATABASE_URL` com a URL do preview e não é
skipped. Localmente, sem URL Neon, o skip é esperado e deve ser reportado como
limitação. Execução local direta: `pass 0`, `fail 0`, `skipped 1`, motivo
`MCP_1N_DATABASE_URL is required for the real DB test`.

### Gates documentais

```text
pnpm check:evidence-index
ok: true
refsChecked: 625

pnpm check:docs-link-integrity
ok: true
filesChecked: 21
```

### Integridade do diff

```text
git diff --check
exit: 0
```

## Invariantes verificados por inspeção

- naming determinístico `preview/pr-<prNumber>`;
- projeto não produtivo e parent sanitizado obrigatórios, sem default;
- eventos de criação `opened`, `reopened`, `synchronize`, `labeled` e
  `unlabeled`;
- evento de cleanup `closed`;
- reconciliação por `schedule` e `workflow_dispatch`;
- reset de branch reutilizada antes de reaplicar migrations;
- `DATABASE_URL` limitado ao `env` dos passos que usam o banco;
- artifacts montados por allowlist de campos, sem URL ou secret;
- schema drift migrado bloqueado por `prisma migrate diff --exit-code`;
- diff `incompatible`/`indeterminate` bloqueado sem a label humana
  `neon-schema-change-approved` aplicada por login listado em
  `NEON_SCHEMA_APPROVERS`;
- cleanup idempotente para branch ausente;
- reconciliação limitada ao regex exato `^preview/pr-\d+$`;
- reconciliação agendada e manual em `observe` por default, com remoção
  disponível somente por dispatch explícito `mode=delete`;
- ausência de `pull_request_target`;
- staging e produção fora do namespace e do lifecycle.

## Revisão final de segurança e rollout

A inspeção final reduziu permissões: cleanup usa `permissions: {}`,
reconciliação usa somente `pull-requests: read` e criação usa
`contents: read`, `issues: read` e `pull-requests: write`. As permissões de
criação são usadas, respectivamente, por checkout, leitura auditável da
timeline da label e comentário idempotente no PR.

O job de criação agora referencia o GitHub Environment `neon-preview`. O
runbook exige required reviewers, sem self-review, antes de permitir que
código de PR interno execute com a credencial Neon. A existência e a proteção
real desse environment ainda não foram confirmadas remotamente.

A mera presença da label deixou de aprovar o schema diff. O workflow valida o
autor da aplicação mais recente contra `NEON_SCHEMA_APPROVERS`; allowlist
vazia, erro de consulta ou autor não autorizado bloqueia. O runbook também
passou a exigir restrição administrativa da variable e prova do required
check em piloto.

A reconciliação foi alterada para observe-first. O schedule não remove
branches; `mode=delete` só existe em `workflow_dispatch` explícito e deve ser
precedido pela revisão do artifact de observe.

Foram documentados dois pilotos descartáveis — compatível e indeterminado —
e a sequência de cleanup. Nenhum deles foi executado nesta sessão.

O drift dos testes legados foi separado em
`ops/evidence/latest/tenant-guard-prisma-extension-test-drift-2026-07-24.md`.
Nenhuma issue remota foi criada porque o cliente GitHub local não está
autenticado.

## Evidência não produzida

Não houve, nesta sessão:

- chamada real à API da Neon;
- criação, reset ou remoção de branch real;
- execução dos workflows no GitHub Actions;
- artifact real de criação, cleanup ou reconciliação;
- comentário real em PR;
- confirmação externa de `NEON_API_KEY`, `NEON_PROJECT_ID`, environment
  protegido, label ou branch protection;
- confirmação de `NEON_SCHEMA_APPROVERS` ou do required check;
- migration/teste contra URL Neon real.

Por isso, esta evidência prova implementação e validação local, mas não prova
operação externa. O status permanece `parcial`.
