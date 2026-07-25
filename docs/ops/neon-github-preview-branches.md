# Neon + GitHub: lifecycle histórico de bancos preview

## Objetivo e status

> **Deprecated para Pull Requests desde 2026-07-25.** Neon gerenciado não é
> fonte canônica nem required gate de PR. O gate atual é
> `.github/workflows/db-preview-postgres.yml`, com PostgreSQL efêmero,
> migrations versionadas, teste de banco, inspeção informativa de integridade
> Prisma e artifact sanitizado. O caminho obrigatório não usa secret, variable
> ou recurso Neon.

O workflow `.github/workflows/neon-preview-create.yml` permanece somente como
histórico acionável manualmente e com o job desabilitado. Cleanup e reconcile
podem permanecer temporariamente para observar ou remover recursos antigos,
mas não validam nem bloqueiam PRs.

## Gate canônico atual de PR

```text
PR opened/reopened/synchronize
  -> service pgvector/pgvector:pg16
  -> database eiah_builder descartável
  -> Prisma generate + migrate deploy + migrate status
  -> teste PostgreSQL real
  -> migrate diff informativo contra schema.prisma
  -> artifacts/db-preview/db-preview-evidence.json
  -> enforcement fail-closed para generate/migrations/status/teste
```

O novo gate não acessa staging ou produção, não cria branch persistente e não
recebe `NEON_API_KEY`, `NEON_PROJECT_ID` ou
`NEON_PREVIEW_PARENT_BRANCH`. O status permanece **parcial** até existir run
verde real no GitHub e o contexto novo ser configurado na branch protection.

Existe drift histórico P0 entre as migrations e `schema.prisma`: o banco
migrado contém enums e tabelas ainda ausentes do schema canônico. Enquanto
esse baseline não for reconciliado em frente própria, `migrate diff` não
bloqueia o PR, mas também nunca é promovido falsamente a sucesso. O artifact
registra `schemaIntegrityResult=known_schema_drift`,
`knownSchemaDrift=true`, o exit code informativo e
`blockingCondition=null` quando todos os checks obrigatórios passam.

## Contrato Neon histórico

O contrato anteriormente implementado era:

```text
PR opened/reopened/synchronize/labeled/unlabeled
  -> preview/pr-<prNumber>
  -> migrations versionadas
  -> testes de banco
  -> integridade Prisma
  -> schema diff + gate de compatibilidade
  -> comentário e evidência sanitizada

PR closed
  -> lookup exato
  -> delete idempotente
  -> evidência de cleanup

schedule/workflow_dispatch
  -> branches preview/pr-*
  -> PRs abertos
  -> observação de órfãos por default
  -> remoção somente em dispatch explícito mode=delete
  -> evidência de reconciliação
```

## Arquivos históricos

- criação, migration, testes e gate desativado:
  `.github/workflows/neon-preview-create.yml`;
- cleanup por fechamento:
  `.github/workflows/neon-preview-cleanup.yml`;
- reconciliação recorrente:
  `.github/workflows/neon-preview-reconcile.yml`;
- classificador histórico do schema diff:
  `scripts/checkNeonPreviewSchemaCompatibility.ts`;
- teste do classificador:
  `scripts/tests/checkNeonPreviewSchemaCompatibility.test.ts`.

Esses arquivos preservam proveniência e suporte à limpeza de recursos
antigos. Não são fonte de verdade para validação atual de PR.

## Configuração Neon histórica — não aplicar ao gate atual

### Secret obrigatório

| Nome | Tipo | Uso |
| --- | --- | --- |
| `NEON_API_KEY` | Actions secret | Criar, consultar e remover branches no projeto Neon. |

O token deve ter somente o escopo necessário ao projeto usado pelo CI. Nunca
registrar o valor em log, comentário, artifact ou documentação.

### Environment protegido

Criar o GitHub Environment `neon-preview` e configurar required reviewers
antes do primeiro piloto. O job de criação referencia esse environment e só
deve receber acesso ao secret após aprovação. Impedir self-review quando a
opção estiver disponível e limitar administradores com bypass.

Esse controle é obrigatório porque o job executa migrations e testes vindos
do branch do PR. Sem proteção do environment, um colaborador capaz de abrir
PR interno poderia alterar um script chamado pelo job e tentar exfiltrar a
credencial. PRs de fork continuam bloqueados pelo preflight, mas isso não
resolve o risco de branches internas.

Cleanup e reconcile não fazem checkout nem executam código do PR. Eles usam
somente scripts definidos no workflow da base e permissões GitHub mínimas.

### Variables

| Nome | Obrigatória | Default | Uso |
| --- | --- | --- | --- |
| `NEON_PROJECT_ID` | sim | nenhum | Projeto Neon não produtivo e exclusivo do fluxo governado. |
| `NEON_PREVIEW_PARENT_BRANCH` | sim | nenhum | Branch Neon sanitizada e estável clonada para cada preview. |
| `NEON_DATABASE` | não | `neondb` | Database alvo das migrations e do schema diff. |
| `NEON_ROLE` | não | `neondb_owner` | Role já existente usada pela Action de criação. |
| `NEON_SCHEMA_APPROVERS` | para override | nenhum | Logins GitHub, separados por vírgula/espaço, autorizados a aplicar a label de aprovação. |

`NEON_PROJECT_ID` é variable, não credencial. A ausência de
`NEON_API_KEY`, `NEON_PROJECT_ID` ou `NEON_PREVIEW_PARENT_BRANCH` bloqueia o
workflow de modo explícito. O projeto e o parent não podem conter dados
produtivos ou PII não sanitizada.

### Label de aprovação humana

Criar a label:

```text
neon-schema-change-approved
```

Ela deve ser aplicada somente por mantenedor listado em
`NEON_SCHEMA_APPROVERS`, após revisão da migration, da política de
versionamento e do schema diff publicado pela Action da Neon. O workflow
consulta os eventos da timeline e valida quem aplicou a ocorrência mais
recente da label. Lista vazia, evento ausente, erro de API ou autor fora da
allowlist falha fechado com `schema_approval_label_unauthorized`.

Adicionar ou remover a label dispara nova avaliação pelos eventos
`pull_request.labeled` e `pull_request.unlabeled`. A configuração da variable
deve ser restrita aos administradores do repositório. Reviewer obrigatório e
proteção de branch continuam necessários: a allowlist protege o override de
schema, mas não substitui revisão do código.

### Branch protection — transição manual obrigatória

Não selecionar nem manter como required o contexto histórico:

```text
workflow: Neon Preview Create
job: NeonPreviewCreateMigrateTest
```

Depois do primeiro run publicado do substituto, confirmar o nome exibido pelo
GitHub e tornar required:

```text
workflow: DB Preview Postgres
job: DbPreviewPostgresValidate
```

Remover o required check antigo e adicionar o novo são ações administrativas
remotas, fora deste patch local. Até a ruleset ser verificada, o status
operacional permanece `parcial`.

Nesta revisão local não foi possível consultar nem alterar rulesets remotas:
o cliente `gh` disponível não está autenticado e o conector de leitura não
expõe branch protection. Nenhum required check remoto é declarado como
configurado.

### Pendências operacionais para retirada do legado

Após publicar o patch:

- remover `NeonPreviewCreateMigrateTest` dos required checks;
- executar e validar `DbPreviewPostgresValidate`;
- adicionar o novo contexto aos required checks;
- preservar artifacts Neon históricos;
- executar reconcile em `observe` antes de retirar cleanup/reconcile ou
  remover recursos legados.

## Lifecycle histórico de criação e atualização

O workflow `Neon Preview Create` respondia somente a:

- `pull_request.opened`;
- `pull_request.reopened`;
- `pull_request.synchronize`;
- `pull_request.labeled`;
- `pull_request.unlabeled`.

O nome é determinístico e independente do nome da branch Git:

```text
preview/pr-${{ github.event.pull_request.number }}
```

O step de criação usa `fetch` nativo do Node para fazer lookup idempotente da
branch e chama `POST /projects/{project_id}/branches` uma única vez quando o
nome exato ainda não existe. Essa chamada direta preserva os mesmos inputs
governados de nome, parent, projeto, database, role e `suspend_timeout`, mas
permite capturar de forma sanitizada `response.status`,
`response.statusText`, `body.code` e `body.message` quando a API rejeita a
criação. Quando a branch já existe, `neondatabase/reset-branch-action@v1` a
restaura ao estado mais recente do parent antes de reaplicar as migrations.
Isso evita que migrations removidas ou reescritas em um novo `synchronize`
permaneçam acumuladas no preview. A concorrência é serializada por número de
PR e uma execução anterior é cancelada quando chega um novo `synchronize`.

O diagnóstico de criação nunca persiste headers, API key, `DATABASE_URL`,
senha ou connection string. URLs `postgres://` e `postgresql://`, tokens
Bearer e campos sensíveis conhecidos são mascarados por duas camadas: no step
de criação e novamente na construção do artifact. `safeMessage` é reduzida a
uma linha e truncada em 320 caracteres.

PRs originados de fork não recebem secrets no evento `pull_request`. O
preflight reconhece esse trust boundary, não cria recursos e mantém o check
bloqueado. Não trocar o evento para `pull_request_target` com checkout de
código não confiável.

## Uso da URL efêmera

A connection string devolvida pela Action:

- não é gravada em arquivo;
- não é adicionada a `$GITHUB_ENV`;
- não entra nos JSONs de evidência;
- não aparece no comentário do PR;
- é passada somente como `DATABASE_URL` nos passos que geram Prisma, aplicam
  migrations, verificam o schema ou executam testes;
- também é passada como `MCP_1N_DATABASE_URL` apenas ao teste de integração
  real já existente do pacote DB.

O artifact publicado contém somente estado sanitizado. Se um comando de
terceiro imprimir credenciais por comportamento inesperado, o incidente deve
ser tratado como vazamento de secret e a chave deve ser rotacionada.

## Aplicação de migrations e testes

A sequência bloqueante é:

1. `pnpm install --frozen-lockfile --ignore-scripts`;
2. `pnpm --filter @repo/db generate`;
3. `pnpm --filter @repo/db migrate:deploy`;
4. `pnpm --filter @repo/db prisma migrate status`;
5. teste de integração real
   `packages/db/src/__tests__/toolContractUnique.integration.test.ts`, com
   `MCP_1N_DATABASE_URL` apontando para o preview;
6. `pnpm test:neon-preview-schema`.

Somente migrations versionadas em `packages/db/prisma/migrations/` são
aplicadas. O workflow não executa `migrate dev`, não cria migration e não
altera schema em staging ou produção.

A suíte ampla `pnpm --filter @repo/db test` não é usada como gate nesta
revisão: três testes legados de `tenantGuard` ainda chamam a extensão Prisma
como middleware e falham antes das asserções com `t.$extends is not a
function`. Esse debt deve ser corrigido em frente própria; o preview não
converte uma falha conhecida e fora do lifecycle de migration em falso
bloqueio. O teste DB selecionado é o teste real diretamente relacionado à
última migration versionada.

## Schema diff como gate de CI

O gate possui duas verificações independentes.

### 1. Integridade do schema migrado

Depois de `migrate deploy`, o Prisma compara o datasource efêmero com
`packages/db/prisma/schema.prisma`:

```bash
pnpm --filter @repo/db prisma migrate diff \
  --from-config-datasource \
  --to-schema ./prisma/schema.prisma \
  --exit-code
```

Exit code `2` significa drift e bloqueia o PR. Isso evita aceitar migration
incompleta ou schema versionado que não corresponde ao banco preview.

### 2. Compatibilidade entre parent e preview

`neondatabase/schema-diff-action@v1` compara a branch preview com
`NEON_PREVIEW_PARENT_BRANCH`, publica o SQL no PR e entrega o diff ao
classificador versionado.

O classificador trata como:

- `compatible`: diff vazio ou comandos aditivos conhecidos; índices
  `UNIQUE` ficam fora desta classe;
- `incompatible`: remoções, rename, `TRUNCATE`, DML destrutiva, mudança de
  tipo ou `SET NOT NULL`;
- `indeterminate`: qualquer statement não reconhecido explicitamente.

`incompatible` e `indeterminate` falham fechado, salvo quando a label humana
`neon-schema-change-approved` está presente **e** sua aplicação mais recente
foi feita por login listado em `NEON_SCHEMA_APPROVERS`. A label não substitui
a necessidade de migration versionada nem autoriza alteração direta em
staging ou produção.

O classificador é deliberadamente conservador. Para ampliar a allowlist de
SQL compatível, alterar o script e seus testes no mesmo PR.

## Comentário e artifacts

O workflow mantém um comentário idempotente identificado por marker oculto,
contendo:

- branch preview;
- resultado das migrations;
- resultado dos testes;
- classificação do schema diff;
- status;
- condição de bloqueio.

Artifact de criação:

```text
neon-preview-pr-<prNumber>/preview-evidence.json
```

Campos mínimos:

```json
{
  "status": "success|failed|blocked",
  "timestamp": "RFC3339",
  "branchName": "preview/pr-123",
  "prNumber": 123,
  "migrationResult": "success|failure|skipped",
  "testResult": "success|failure|skipped",
  "schemaDiffResult": "compatible|incompatible|indeterminate|failed|skipped",
  "blockingCondition": null,
  "branchCreateFailure": null
}
```

Quando `blockingCondition=neon_branch_create_failed`,
`branchCreateFailure` contém somente:

```json
{
  "httpStatus": 412,
  "statusText": "Precondition Failed",
  "code": "safe_api_code_or_null",
  "safeMessage": "mensagem sanitizada e truncada",
  "branchName": "preview/pr-123",
  "parentBranch": "production",
  "projectId": "safe-project-id"
}
```

O JSON nunca inclui API key, project secret, password, host ou connection
string. Os três workflows usam retenção explícita de 30 dias para os
artifacts.

## Cleanup no fechamento

`Neon Preview Cleanup` roda em `pull_request.closed`.

Antes de remover, consulta a API e exige correspondência exata do nome
`preview/pr-<prNumber>`. Se a branch já não existir, o resultado
`already_absent` é sucesso idempotente. Se lookup ou delete falhar:

- o job emite annotation `error`;
- o job termina vermelho;
- o artifact registra a condição de bloqueio.

Artifact:

```text
neon-preview-cleanup-pr-<prNumber>/cleanup-evidence.json
```

Campos:

```json
{
  "status": "success|failed|blocked",
  "timestamp": "RFC3339",
  "branchName": "preview/pr-123",
  "prNumber": 123,
  "cleanupResult": "deleted|already_absent|lookup_failed|delete_failed|not_attempted",
  "reasonCode": "N/A",
  "blockingCondition": null
}
```

`reasonCode` permanece `N/A` porque o catálogo indicado em
`docs/ops/reason-codes-catalog.md` possui drift de fonte da verdade registrado
na issue GitHub `#386`. Este fluxo não inventa reason code novo; usa
`blockingCondition` até decisão canônica.

### Validação controlada de cleanup

Depois de fechar cada PR piloto sem merge:

1. abrir o run `Neon Preview Cleanup` associado ao evento `closed`;
2. confirmar no log apenas o nome determinístico, nunca URL ou credencial;
3. baixar `cleanup-evidence.json` e exigir `status=success`,
   `branchName=preview/pr-<n>` e
   `cleanupResult=deleted|already_absent`;
4. consultar o projeto Neon e confirmar que o nome exato não existe;
5. se houver `lookup_failed` ou `delete_failed`, manter o rollout bloqueado,
   preservar o artifact e executar reconciliação primeiro em `observe`.

Esta sequência é um roteiro ainda não executado nesta revisão.

## Reconciliação de órfãos

`Neon Preview Reconcile` roda diariamente às `03:17 UTC` em modo `observe` e
também por `workflow_dispatch`, cujo default é igualmente `observe`.

O reconciliador:

1. lista todos os PRs abertos do repositório, com paginação;
2. lista branches do projeto Neon;
3. considera somente nomes que casam exatamente com
   `^preview/pr-\d+$`;
4. identifica branches cujo número não corresponde a PR aberto;
5. em `observe`, somente marca os órfãos no artifact e emite warning;
6. em dispatch manual `mode=delete`, remove cada órfão uma única vez, sem
   retry cego de `DELETE`;
7. falha e emite alerta explícito se qualquer remoção falhar.

Branches fora do prefixo e do formato exato são intocáveis por esse workflow.
O reconciliador não remove a branch root/default nem branches de staging ou
produção.

Artifact:

```text
neon-preview-reconcile-<runId>/reconcile-evidence.json
```

Ele registra `mode`, PRs abertos, branches checados, órfãos, branches
removidos, falhas sanitizadas e `blockingCondition`, sem URLs ou secrets.

Antes do primeiro `mode=delete`:

1. executar manualmente com `mode=observe`;
2. revisar `openPrNumbers`, `checkedBranches` e `orphanBranches`;
3. comparar cada órfão com o estado real dos PRs e do projeto Neon;
4. somente com a lista aprovada disparar uma nova execução com
   `mode=delete`;
5. preservar os dois artifacts como evidência correlacionada.

O schedule nunca escolhe `delete`. A promoção para remoção automática
agendada exigiria decisão futura e evidência recorrente de observe sem falso
positivo.

## Pilotos Neon históricos — não executar como gate atual

Os pilotos abaixo pertenciam ao rollout Neon retirado. Permanecem somente
como registro de decisão e não devem ser executados como gate atual.

### Piloto A — mudança compatível

Criar uma migration descartável que adicione uma tabela isolada, por exemplo:

```sql
CREATE TABLE "neon_preview_probe" (
  "id" TEXT PRIMARY KEY,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

Resultado obrigatório:

1. criação de `preview/pr-<n>`;
2. migrations, status e teste DB verdes;
3. integridade Prisma verde;
4. schema diff classificado `compatible`, sem label;
5. comentário idempotente e artifact sanitizado;
6. required check verde;
7. fechamento sem merge e cleanup comprovado.

Se o Prisma schema não incluir a tabela sintética, a integridade falhará. O
piloto deve incluir schema e migration coerentes, ambos descartados ao fechar
o PR.

### Piloto B — mudança indeterminada

Em outro PR descartável, usar tabela sintética e migration coerente com um
índice único, por exemplo:

```sql
CREATE UNIQUE INDEX "neon_preview_probe_value_key"
  ON "neon_preview_probe" ("value");
```

Executar em duas fases:

1. sem label: exigir classificação `indeterminate`, check vermelho e merge
   bloqueado;
2. um mantenedor listado em `NEON_SCHEMA_APPROVERS` aplica
   `neon-schema-change-approved`: o evento `labeled` reexecuta o workflow, a
   timeline comprova o autor e o gate pode seguir.

Também testar que uma aplicação por login fora da allowlist produz
`schema_approval_label_unauthorized`. Fechar sem merge e validar cleanup.

## Separação histórica: preview Neon vs staging

| Aspecto | Preview | Staging |
| --- | --- | --- |
| Cardinalidade | uma branch por PR | ambiente compartilhado e controlado |
| Nome | `preview/pr-<n>` | fora do namespace `preview/pr-*` |
| Lifecycle | efêmero; PR open → closed | persistente |
| Escrita | migrations/testes do PR | somente fluxo staging autorizado |
| Dados | isolados para validação | baseline operacional de staging |
| Promoção | não promove dados nem schema | segue processo próprio |

Regras fail-closed:

- preview nunca usa `DATABASE_URL` de staging como fallback;
- staging nunca é alvo de cleanup ou reconciliação deste fluxo;
- branch preview não comprova migration aplicada em staging;
- merge do PR não aplica migration em staging ou produção;
- falha de preview não deve ser contornada apontando testes para staging.

## Riscos e mitigações históricas do lifecycle Neon

| Risco | Mitigação |
| --- | --- |
| Secret em PR de fork | Evento `pull_request`, sem `pull_request_target`; fork bloqueado antes de criar recurso. |
| Snapshot com dados produtivos | Projeto não produtivo e parent sanitizado obrigatórios, sem default permissivo. |
| Connection string em artifact | JSON montado por allowlist de campos; URL não é persistida. |
| Drift migration/schema | `migrate status` + `prisma migrate diff --exit-code`. |
| Breaking change silenciosa | classificador fail-closed + label cujo autor é validado contra `NEON_SCHEMA_APPROVERS`. |
| Uso indevido da allowlist | alteração de variables restrita a admins + revisão obrigatória; risco permanece até configuração remota comprovada. |
| Branch abandonada | cleanup por `closed` + reconciliação diária em observe e delete manual aprovado. |
| Remoção de branch errada | match exato `preview/pr-\d+`; delete por ID resolvido. |
| Falha transitória em DELETE | alerta explícito; sem retry cego de operação não idempotente. |
| Parent alterado com previews vivos | remover/recriar previews existentes antes de trocar a variable; schema diff permanece bloqueante. |
| Supply-chain de Actions | versões major canônicas; revisar e, se a política do repositório exigir, pin por commit em follow-up. |

## Rollback do legado Neon

Se a integração causar bloqueio indevido:

1. preservar os artifacts e o link do run afetado;
2. disparar manualmente `Neon Preview Reconcile` em `mode=observe`;
3. confirmar que nenhuma branch de staging/produção está no namespace
   `preview/pr-*`;
4. desabilitar temporariamente o trigger de criação por decisão explícita;
5. após revisar o artifact de observe, disparar `mode=delete` para remover
   somente os recursos efêmeros confirmados;
6. reverter os workflows e o classificador pelo fluxo normal de PR;
7. não remover `NEON_API_KEY` antes de concluir cleanup, salvo incidente de
   segurança; nesse caso, rotacionar e restaurar uma chave mínima para a
   limpeza.

Nenhum passo de rollback autoriza apagar branch fora do namespace preview.

## DoD Neon histórico — retirado do caminho obrigatório

Este checklist não descreve o DoD atual de PR e não deve ser configurado como
branch protection. Ele é preservado para proveniência do lifecycle antigo.

- [ ] `NEON_API_KEY` configurada como Actions secret de menor privilégio.
- [ ] Environment `neon-preview` com required reviewers e sem self-review
      protege a execução de código do PR com credencial Neon.
- [ ] `NEON_PROJECT_ID` configurado como Actions variable.
- [ ] Parent/database/role confirmados no projeto Neon.
- [ ] Label `neon-schema-change-approved` criada e governada.
- [ ] `NEON_SCHEMA_APPROVERS` configurada e alteração restrita a admins.
- [ ] `NeonPreviewCreateMigrateTest` configurado como required check.
- [ ] PR de teste cria ou reutiliza `preview/pr-<n>`.
- [ ] Migrations e testes passam usando somente a URL efêmera.
- [ ] Schema diff compatível passa sem aprovação.
- [ ] Schema diff incompatível/indeterminado bloqueia sem label.
- [ ] Aprovação humana explícita é auditável no PR.
- [ ] Aplicação da label por usuário fora da allowlist bloqueia o gate.
- [ ] Comentário idempotente é atualizado.
- [ ] Artifact sanitizado de criação é produzido.
- [ ] Fechamento do PR remove a branch e produz artifact de cleanup.
- [ ] Reconciliação manual em `observe` identifica órfão sem removê-lo.
- [ ] Dispatch separado em `delete` remove somente o órfão aprovado.
- [ ] Nenhum secret ou URL aparece nos artifacts.
- [ ] Staging e produção permanecem intocados.

## Referências oficiais

- [Neon Create Branch Action](https://github.com/neondatabase/create-branch-action)
- [Neon Delete Branch Action](https://github.com/neondatabase/delete-branch-action)
- [Neon Reset Branch Action](https://github.com/neondatabase/reset-branch-action)
- [Neon Schema Diff Action](https://github.com/neondatabase/schema-diff-action)
- [Neon API: list branches](https://api-docs.neon.tech/reference/listprojectbranches)
- [Neon API: delete branch](https://api-docs.neon.tech/reference/deleteprojectbranch)
