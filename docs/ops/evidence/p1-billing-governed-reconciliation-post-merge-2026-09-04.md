# P1 Billing Governed Reconciliation — Post-Merge Evidence (PR #437)

## Escopo

Este artefato registra, de forma read-only e verificável, o fechamento em
`main` do escopo do PR #437: ratificação P1 Billing v1.1, Governed Operation
Catalog inicial (`billing.run_cost_debit`), binding do reconciliador de
billing, packaging runtime do catálogo, alinhamento de fixtures à
terminalidade P1-T e registro canônico do novo teste unitário na suíte de CI.

Este documento não altera código, runtime, schema, testes, workflows,
`package.json`, manifests, ruleset, threshold, o corpo do PR #437 ou o
Evidence Index. Não gera nova evidência operacional, não executa deploy,
release, tag, rerun de workflow ou merge adicional.

Autoridade humana que autorizou push, criação do PR e merge, em cada etapa
separadamente: Carlos Alberto Merlo.

## Fatos confirmados

- PR: `#437`.
- Base: `main`.
- Head do PR no momento do merge: `281d8a45149262fc04ee82a0d975d8b4562fbe81`.
- Merge commit: `3d78de56da6fdfe76d3ec255f66d4ef9c071a284`.
- `origin/main` no momento da escrita deste artefato: `3d78de56da6fdfe76d3ec255f66d4ef9c071a284` (confirmado via `git rev-parse origin/main` após `git fetch origin`).
- Merge method: merge commit (não squash, não rebase); dois parents confirmados via `git show --no-patch --format="%H%n%P"`: `4711644d8e392ab3cc60ecdde2230dd80b7ce373` (main anterior) e `281d8a45149262fc04ee82a0d975d8b4562fbe81` (head do PR #437).
- Mensagem do merge commit: `Merge pull request #437 from 5906375/fix/p1-billing-governed-reconciliation`.
- Data do merge: `2026-09-03T22:17:21Z` (`mergedAt` via API pública do GitHub).
- Domínio: `billing`. Operação de referência: `billing.run_cost_debit`.
- Ruleset ativo no momento do merge: `main-protection-hard-gates`, `enforcement=active`, `required_approving_review_count=0`, `require_code_owner_review=false`, `bypass_actors=[]`.
- Required checks do ruleset no momento do merge: `19/19`, todos com `status=COMPLETED` e `conclusion=SUCCESS`, verificados diretamente no SHA `281d8a4` (head do PR), não em SHA anterior.

## Stack real incorporada (6 commits)

O corpo original do PR #437 foi escrito quando a pilha tinha 3 commits. Este
artefato registra a pilha real, completa, incorporada ao merge:

| # | Commit | Concern | Ancestral de `origin/main` |
| --- | --- | --- | --- |
| 1 | `e9a838406f2853aca9f73ae174f3c52762cb172e` | Decision — ratifica P1 Billing v1.1 (`docs/ops/ape-audit-telemetry-decision.md` §13) | Sim |
| 2 | `8245223627afd4d596d26d19bb33676d8aa524a4` | Definition — introduz o Governed Operation Catalog | Sim |
| 3 | `2cbddec3864a535caa2700465a17ff4382f01930` | Application — vincula o reconciliador ao catálogo | Sim |
| 4 | `576576fb6632a367c4ed22d5e2d05bc5d4cae051` | Packaging — emite o catálogo como módulo JS runtime real | Sim |
| 5 | `918c7267cb9147f62ee2d39522c9bc1a8cb50852` | Fixture — alinha fixtures de contrato à terminalidade P1-T | Sim |
| 6 | `281d8a45149262fc04ee82a0d975d8b4562fbe81` | CI registration — incorpora `billingReconciliation.test.ts` à suíte canônica | Sim |

Ancestralidade confirmada via `git merge-base --is-ancestor <sha> origin/main`
para os 6 commits, com resultado positivo para todos.

## Estado incorporado

### Semântica (P1-A/T/Z/B)

Confirmado por leitura direta do conteúdo real de `origin/main` (não do
worktree local, não de memória):

- **P1-A (applicability)**: `applicable(run) = execution_terminal AND effect_expected AND run dentro da janela de medição`, onde `effect_expected = exists(RunUsageBreakdown)`.
- **P1-T (terminality)**: `Run.finishedAt IS NOT NULL` é o único predicado estrutural de terminalidade; confirmado em `apps/api/src/services/billingReconciliation.ts` (`finishedAt: { not: null }`) em `origin/main`.
- **P1-Z (zero-cost)**: breakdown ausente → `not_applicable`; breakdown presente somando zero → `applicable_zero_cost`. As duas condições são tratadas como distintas no código de `origin/main`.
- **P1-B (blocked)**: `blocked` é lifecycle-terminal, mas nunca declara audit gap automaticamente.

### Catálogo

`packages/core/src/catalog/governedOperationCatalog.ts` em `origin/main`
declara, para `billing.run_cost_debit`:

- `domain`: `billing`.
- `effectType`: `debit`.
- `outcomeAuthority`: `INTERNAL_CONFIRMED`.
- `idempotency.classification`: `SEMANTIC_IDEMPOTENCY_KEY_PARTIAL`.
- `isGovernedOperationCatalogSystemComplete()`: retorna `false` — cobertura restrita a `billing`.

### Runtime

`apps/api/src/services/billingReconciliation.ts` em `origin/main` consome
`getGovernedOperation(BILLING_RUN_COST_DEBIT_OPERATION_ID)` e valida a
definição contra o catálogo em tempo de execução.

### Packaging

`packages/core/tsup.config.ts` em `origin/main` inclui `"src/catalog/*.ts"`
entre os entry points; `dist/catalog/governedOperationCatalog.js` é emitido
como artefato JS runtime real (confirmado por prova de resolução real via
`import("@eiah/core/catalog/governedOperationCatalog")` a partir de um
consumidor real, `apps/api`, além da emissão física do arquivo).

### Tests

- `apps/api/src/tests/billing.reconciliation.contract.test.ts` em `origin/main` atribui `finishedAt` explícito aos cinco runs do fixture, tornando-os terminais sob P1-T.
- `apps/api/src/services/billingReconciliation.test.ts` está listado tanto em `package.json` (`test:ci-unit-suite`) quanto em `scripts/unit-tests-manifest.txt`, em `origin/main`.

## Authority boundary

Confirmado no código real de `origin/main`:

- `actionType: "blocked.guardrails"` — match exato, sem `startsWith` na lógica executável de resolução de authority (a única ocorrência de `startsWith`/`blocked.*` genérico no arquivo é um comentário descritivo, não lógica).
- `blocked.trustscore` não resolve `GUARDRAILS_BLOCKED` — mecanismo distinto, tratado como `authorityUnresolved`.
- Categoria `blocked.*` desconhecida também resulta em `authorityUnresolved`.
- `independentAuthorityProvenByRuntime: false` e `authorityResolutionRequired: true` são enforced como invariantes de carregamento no catálogo (`assertValidGovernedOperationDefinition` lança erro se qualquer categoria bloqueada declarar o contrário).
- `GuardrailLedger` é tratado estritamente como "o mecanismo específico de governança que registrou o bloqueio" — não é promovido a autoridade independente, humana ou externa em nenhum ponto do código ou desta documentação.

Preservado explicitamente: `request ≠ authority`; `agent output ≠ evidence`;
`confidence ≠ permission`; `test pass ≠ enforcement proven`; `status ≠
terminality`; `zero ≠ unknown`. Bloqueios não passaram a estar "autorizados" —
apenas o mecanismo específico que os registrou passou a ser resolvido com
precisão, quando existe evidência exata para isso.

## Duplicate semantics

`duplicateChargesCount` em `origin/main` implementa `Σ max(0, n − 1)` por
grupo semântico `tenantId + workspaceId + requestId + entryType`. O total é
calculado antes de qualquer truncamento por `limit` de exibição — o `limit`
afeta apenas quais itens são retornados para exibição, nunca a métrica total.

## Validações comprovadas

| Suíte / gate | Resultado | Quando verificado |
| --- | --- | --- |
| Governed Operation Catalog (`governedOperationCatalog.test.ts`) | `18/18` | Local, múltiplas rodadas desta pilha |
| Billing Reconciliation unit (`billingReconciliation.test.ts`) | `18/18` | Local, múltiplas rodadas; também dentro da execução real de `CiUnitSuite` |
| Contract reconciliation (`billing.reconciliation.contract.test.ts`) | `3/3` | Local, com Postgres/Redis reais e migrações aplicadas |
| `CiUnitSuite` (agregador `test:ci-unit-suite`, 845 testes) | `845/845` | Local, com `DATABASE_URL` idêntico ao do job real |
| `pnpm --filter @eiah/api build` | exit `0` | Local, múltiplas rodadas |
| `ImobWorkerMutationE2E` (GitHub Actions) | `SUCCESS` | No head `576576f` (pós Commit 4) e novamente no head `281d8a4` |
| `P3EconomyHardening` (GitHub Actions) | `SUCCESS` | No head `281d8a4` |
| `OrphanTestsRegression` (GitHub Actions) | `SUCCESS` | No head `281d8a4` |
| Required status checks do ruleset `main-protection-hard-gates` | `19/19 SUCCESS` | No head `281d8a4`, imediatamente antes do merge |

Este artefato não afirma "all CI green": dois jobs não-required do workflow
"CI Monorepo" permaneciam e permanecem vermelhos (próxima seção). Nenhum
typecheck cross-repo amplo foi executado como gate desta pilha; apenas os
gates de pacote citados acima foram exercitados e são os únicos aqui
reivindicados.

## Findings fechados dentro do escopo desta PR

### Packaging/runtime

- Problema: `@eiah/core/dist/catalog/governedOperationCatalog.js` não era emitido pelo `tsup`, apesar do `package.json` já expor `./catalog/*`; consumidores runtime falhavam com `ERR_MODULE_NOT_FOUND`.
- Correção: Commit 4 (`576576f`), adicionando `"src/catalog/*.ts"` aos entry points do `tsup`.
- Evidência: emissão física do arquivo, prova de import real, e `ImobWorkerMutationE2E = SUCCESS` no GitHub Actions.

### Fixture drift

- Problema: os cinco runs do fixture de `billing.reconciliation.contract.test.ts` tinham `status = "success"` mas `finishedAt = NULL`; a terminalidade P1-T (corretamente introduzida pelo Commit 3) passou a excluí-los da contagem, quebrando três asserções de `runsChecked`.
- Correção: Commit 5 (`918c726`), atribuindo `finishedAt` explícito aos cinco runs, sem alterar nenhuma asserção, status ou breakdown.
- Evidência: `3/3` local com Postgres/Redis reais; `P3EconomyHardening = SUCCESS` no GitHub Actions.

### Orphan test

- Problema: `apps/api/src/services/billingReconciliation.test.ts` (introduzido pelo Commit 3) não estava incorporado a nenhum script ou glob reconhecido pelo gate `check:orphan-tests`.
- Correção: Commit 6 (`281d8a4`), incorporando o arquivo ao agregador institucional `test:ci-unit-suite` (`package.json`) e ao manifest versionado (`scripts/unit-tests-manifest.txt`), sem allowlist, sem ignore e sem alterar o conteúdo do teste.
- Evidência: `OrphanTestsRegression = SUCCESS` e `CiUnitSuite = SUCCESS` no GitHub Actions; gate de órfãos reexecutado localmente com `newOrphans: []` e `blockingOrphans: []`.

## Limites da evidência

Este artefato NÃO prova:

- deploy;
- produção;
- uso por tenant externo;
- tráfego operacional real;
- autoridade externa (`EXTERNAL_CONFIRMED`);
- autoridade independente (`independentAuthorityProvenByRuntime = true`);
- idempotência atômica (`SEMANTIC_IDEMPOTENCY_KEY_PARTIAL` permanece, sem constraint nova em `BillingLedger`);
- catálogo sistêmico (cobertura permanece `billing`-only, `isGovernedOperationCatalogSystemComplete() = false`);
- recorrência de reconciliação funcionando de forma confiável;
- frescor do gate `P1ReconciliationRecurring`;
- receipt de medição independente;
- schedule semanal do APE ativo (permanece desativado pelo kill-switch do PR #397).

Preservado explicitamente: `MERGED ≠ DEPLOYED`; `MAIN ≠ PRODUCTION`; `CI
SUCCESS ≠ OPERATIONAL EVIDENCE`; `INTERNAL_CONFIRMED ≠ EXTERNAL_CONFIRMED`.

## Failures não-required (não resolvidos por esta PR)

| Check | Classificação | Required pelo ruleset | Status |
| --- | --- | --- | --- |
| `P1ReconciliationRecurring` | `EVIDENCE_RECENCY_FAILURE` | Não | Não resolvido por esta PR — causa: `weekly_cycle_evidence_too_old`, `maxAgeDays=14`, ciclos `run46`/`run47`/`run48` com idades entre ~38 e ~46 dias no momento das verificações desta pilha |
| `P2HighGlobalCoverage` | `PREEXISTING_OR_INDEPENDENT` | Não | Não resolvido por esta PR — causa: `p2_evidence_too_old`, evidência de `ops/evidence/latest/p2-high-global-coverage.json` gerada em `2026-07-04`, `maxAgeDays=30` |

Ambos os findings já existiam antes desta pilha, permaneceram inalterados
por ela (nenhum arquivo relacionado a esses dois gates foi tocado pelos 6
commits) e continuaram exibindo a mesma causa em verificações repetidas,
inclusive no workflow disparado automaticamente sobre o merge commit. Nenhum
dos dois é chamado de "resolved" neste artefato.

## Dívidas remanescentes

| Item | Classificação | Bloqueante para o escopo do PR #437 |
| --- | --- | --- |
| Recência de evidência do P1 recurring | `CURRENT_LIMITATION` | Não |
| Recência de evidência do P2 high coverage | `PREEXISTING_DEBT` | Não |
| `SEMANTIC_IDEMPOTENCY_KEY_PARTIAL` (sem enforcement atômico) | `EXPECTED_SCOPE` | Não |
| Catálogo restrito a `billing` | `EXPECTED_SCOPE` | Não |
| Ausência de receipt de medição independente | `FUTURE_WORK` | Não |
| Schedule semanal do APE desativado | `PREEXISTING_DEBT` | Não |
| Drift pré-existente do manifest de testes unitários (`securityRelaxationFlags.test.ts`, `auth-default-polarity.test.ts` fora do manifest, presentes no script) | `PREEXISTING_DEBT` | Não |
| Corpo do PR #437 desatualizado (descreve 3 commits, não os 6 reais) | `DOCUMENTATION_DRIFT` | Não |

Nenhum item desta tabela é tratado como resolvido apenas porque a PR foi
mesclada.

## Status split (obrigatório)

- `P1_BILLING_PR437_SCOPE`: **evidenciado**.
- `P1_RECURRING_SYSTEMIC_SCOPE`: **parcial**.

O fechamento do escopo billing desta PR específica não promove o P1
sistêmico e recorrente a fechado. A auditoria `ape-cycles-45-48-audit-2026-07-27.md`
já havia classificado a recorrência P1 como viciada para os ciclos #45–#48; o
gate `P1ReconciliationRecurring` continua vermelho por recência de evidência,
sem relação com esta PR, e nenhuma medição recorrente nova foi produzida
aqui.

## Rollback (documentação, não execução)

Os 6 commits são aditivos e tocam arquivos não sobrepostos entre si; a
reversão deve respeitar a ordem inversa de dependência:

- **Commit 6** (`281d8a4`) → remove o registro canônico de CI; reabre o achado de órfão sem afetar runtime ou semântica.
- **Commit 5** (`918c726`) → remove o alinhamento de fixture; reintroduz as 3 falhas de contract test sem afetar o reconciliador.
- **Commit 4** (`576576f`) → remove o packaging runtime; reintroduz `ERR_MODULE_NOT_FOUND` sem afetar a semântica P1.
- **Commit 3** (`2cbddec`) → remove o binding do reconciliador ao catálogo governado.
- **Commit 2** (`8245223`) → remove o Governed Operation Catalog; nada fora desta pilha depende dele até o momento.
- **Commit 1** (`e9a8384`) → remove o adendo v1.1; a decisão v1.0 permanece intocada de qualquer forma.

Nenhum rollback foi executado. Esta seção é puramente documental.

## PR body drift (finding histórico)

Classificação: `DOCUMENTATION_DRIFT_NON_BLOCKING`.

O corpo original do PR #437 foi escrito quando a pilha tinha apenas 3
commits (`e9a8384`, `8245223`, `2cbddec`) e não foi atualizado após os
Commits 4, 5 e 6. Nenhuma afirmação do corpo é hoje falsa sobre o código ou
sua segurança — a lacuna é de inventário de commits e de validação, não de
correção técnica. O corpo do PR não foi editado nesta pilha nem nesta
rodada; este artefato passa a ser a fonte pós-merge mais adequada para o
fechamento factual completo, seguindo o padrão do repositório de registrar
estado via documentos de evidência versionados, não via edição retroativa de
corpos de PR.

## Candidate Evidence Index Entry

Preparação apenas — nenhuma entrada foi inserida em
`docs/EVIDENCE_INDEX.md` nesta rodada.

- **Evidence file**: `docs/ops/evidence/p1-billing-governed-reconciliation-post-merge-2026-09-04.md`
- **Scope**: P1 Billing Governed Reconciliation / PR #437
- **Merge commit**: `3d78de56da6fdfe76d3ec255f66d4ef9c071a284`
- **Status**: evidenciado (escopo billing da PR #437); P1 sistêmico/recorrente permanece parcial
- **Descrição breve sugerida**: "Ratifica P1 Billing v1.1, introduz o Governed Operation Catalog inicial (billing-only), vincula o reconciliador de billing a ele, corrige packaging runtime do catálogo, alinha fixtures de contrato à terminalidade P1-T e incorpora o novo unit test à suíte canônica de CI. Não fecha a recorrência sistêmica do P1, não prova idempotência atômica, não prova deploy ou uso operacional."

## Critério para futura indexação

A futura entrada no Evidence Index só deve ocorrer se, cumulativamente:

1. este artefato existir fisicamente no worktree (condição satisfeita);
2. o conteúdo tiver sido revisado por decisão humana explícita;
3. o arquivo estar commitado e versionado em Git, com o SHA do commit documental conhecido (condição ainda pendente — no momento da escrita, o arquivo permanece não rastreado);
4. nenhuma afirmação nele exceder o que CI e o merge realmente provaram.

Preservado: `artifact written ≠ Evidence Index updated`; `artifact versioned
≠ Evidence Index registered`.

## Não-escopo

Este artefato:

- não fecha a recorrência sistêmica do P1;
- não fecha o gate `P1ReconciliationRecurring` nem `P2HighGlobalCoverage`;
- não altera threshold (`P1_CURRENT_MAX_AGE_DAYS` permanece `14`);
- não gera novo ciclo APE, receipt ou `ape.weekly-cycle.v3`;
- não reativa schedule;
- não altera Evidence Index;
- não altera o corpo do PR #437;
- não declara catálogo sistêmico;
- não declara idempotência atômica;
- não declara deploy, release, produção ou uso por tenant externo.

## Próximas ações

- Escrever e revisar a entrada correspondente no Evidence Index, citando este artefato, como unidade separada (`REGISTER_P1_POST_MERGE_EVIDENCE_INDEX_ENTRY`), somente após este documento estar commitado e versionado.
- Avaliar design de medição recorrente honesta (v2/v3) para o P1 sistêmico.
- Avaliar receipt de medição independente para o caminho de reconciliação.
- Avaliar discovery de enforcement atômico de idempotência em `BillingLedger`.
- Avaliar extensão do Governed Operation Catalog a outros domínios, quando justificado.
- Avaliar limpeza da branch remota `fix/p1-billing-governed-reconciliation`, como unidade trivial e não urgente.

## Proveniência da validação

- `origin/main` e ancestralidade dos 6 commits: consultados via `git fetch origin` + `git rev-parse origin/main` + `git merge-base --is-ancestor` neste worktree.
- Conteúdo de código citado: lido diretamente de `origin/main` via `git show origin/main:<path>`, não do worktree local nem de memória.
- Merge commit e PR: consultados via API pública do GitHub (`gh pr view 437`, `gh api repos/.../pulls/437`).
- Ruleset: consultado via API pública do GitHub (`gh api repos/.../rulesets/13498700`).
- Required checks e os dois failures não-required: consultados via `gh pr view 437 --json statusCheckRollup` e `gh run view --job ... --log`, no head correspondente a cada verificação, reexecutados no momento do merge e novamente no workflow disparado automaticamente sobre o merge commit.

Status documental deste artefato: `evidenciado`. Estado do escopo billing da
PR #437: `evidenciado`. Estado do P1 sistêmico e recorrente: `parcial`.
