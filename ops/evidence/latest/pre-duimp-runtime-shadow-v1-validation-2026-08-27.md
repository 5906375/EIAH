# PRE_DUIMP Runtime Shadow — Validação V1 (2026-08-27)

## Árvore validada

| Campo | Valor |
| --- | --- |
| commit | `14a0c8da6b377bff2fb969aeaeebca8b31db4e59` |
| tree | `7e7985b6abe52b75f52e3be1894809314c653fd5` |
| branch | `docs/structural-gate-boundary-sha` |
| worktree antes da execução | limpo |
| worktree depois da execução | limpo |

Fonte permanente: `pre-duimp-runtime-shadow-v1-2026-08-27-manifest.json`, campos `head`, `tree`, `branch`, `repoStatusBefore`, `repoStatusAfter`, `headAfterCapture` e `treeAfterCapture`.

## Resultado dos gates capturados

Quatro gates foram executados com exit code 0. Um gate foi classificado como não aplicável ao corte e não foi executado.

| # | Comando | Exit code | Estado | Resultado observado |
| --- | --- | --- | --- | --- |
| 1 | `pnpm test:pre-duimp-runtime-shadow-route` | 0 | `EXECUTADO` | 8/8 pass, 0 fail |
| 2 | `pnpm test:pre-duimp` | 0 | `EXECUTADO` | 57/57 pass, 0 fail (43 contracts + 6 authority adapter + 8 runtime shadow) |
| 3 | `pnpm check:orphan-tests` | 0 | `EXECUTADO` | `ok:true`, `blockingOrphanCount:0` |
| 4 | `pnpm check:reason-code-canon` | — | `NAO_EXECUTADO` | O commit validado não altera reason codes nem o catálogo; decisão registrada no manifest. |
| 5 | sequência de integridade registrada no manifest | 0 | `EXECUTADO` | HEAD e tree registrados no log coincidem com o baseline; status antes/depois consta como limpo no manifest. |

Fontes permanentes:

- estado e exit code: `pre-duimp-runtime-shadow-v1-2026-08-27-manifest.json`, array `gates`;
- gate 1: `pre-duimp-runtime-shadow-v1-2026-08-27-01-test_pre-duimp-runtime-shadow-route.log.txt`;
- gate 2: `pre-duimp-runtime-shadow-v1-2026-08-27-02-test_pre-duimp.log.txt`;
- gate 3: `pre-duimp-runtime-shadow-v1-2026-08-27-03-check_orphan-tests.log.txt`;
- gate 5: `pre-duimp-runtime-shadow-v1-2026-08-27-05-integrity_tree-check.log.txt`.

Nota de integridade: o comando do gate 5 foi registrado no manifest com separadores `;`. Seu exit code combinado não é usado aqui como prova independente de sucesso de cada subcomando. O receipt se limita ao HEAD/tree materializado no log e ao estado antes/depois declarado no manifest.

### Cobertura observada no gate HTTP focado

| # | Cenário observado | Linha no log 01 |
| --- | --- | --- |
| 1 | ausência de `authContext` → 401 `UNAUTHORIZED` | 7 |
| 2 | action desconhecida → 400 `PRE_DUIMP_ACTION_UNKNOWN` | 13 |
| 3 | scope negado → 403 `PRE_DUIMP_SCOPE_DENIED` | 19 |
| 4 | contexto malformado → 400 `VALIDATION_ERROR` | 25 |
| 5 | HITL não satisfeito em `review` → 403 `PRE_DUIMP_HITL_REQUIRED` | 31 |
| 6 | `create` autorizado → 200 `authorized_shadow` | 37 |
| 7 | erro não classificado → 500 `INTERNAL_ERROR` pelo `governedErrorHandler` | 44 |
| 8 | GET não registrado → 404 | 50 |

Fonte permanente: `pre-duimp-runtime-shadow-v1-2026-08-27-01-test_pre-duimp-runtime-shadow-route.log.txt`, linhas indicadas na tabela.

## Campos operacionais

```text
dependenciesReinstalled: false
lockfileCorrespondence: pnpm-lock.yaml sem alteracoes no working tree apos a
captura; node_modules nao foi reinstalado; correspondencia completa
lockfile <-> node_modules nao foi auditada por esta captura.
```

Fonte permanente: `pre-duimp-runtime-shadow-v1-2026-08-27-manifest.json`, campos `dependenciesReinstalled` e `lockfileCorrespondence`.

## Artefatos — raw externo e cópia publicável sem masking

O diretório externo `<external-evidence-root>` contém os quatro logs e o manifest raw produzidos pela execução. As cópias preparadas em `ops/evidence/latest/` são byte a byte idênticas às origens.

| Artefato preparado para publicação | Origem raw | Masking | rawLogSha256 | publishedLogSha256 |
| --- | --- | --- | --- | --- |
| `pre-duimp-runtime-shadow-v1-2026-08-27-01-test_pre-duimp-runtime-shadow-route.log.txt` | `01-test_pre-duimp-runtime-shadow-route.log.txt` | não | `042f319b2d31ae64d0fe23ed1b9e1bafd60ff5889517d7117c5e16152a2850e2` | `042f319b2d31ae64d0fe23ed1b9e1bafd60ff5889517d7117c5e16152a2850e2` |
| `pre-duimp-runtime-shadow-v1-2026-08-27-02-test_pre-duimp.log.txt` | `02-test_pre-duimp.log.txt` | não | `44dabd8908103bcaf58f4395c17e3e7114ef0ec4852adedcee2ff7b794885abf` | `44dabd8908103bcaf58f4395c17e3e7114ef0ec4852adedcee2ff7b794885abf` |
| `pre-duimp-runtime-shadow-v1-2026-08-27-03-check_orphan-tests.log.txt` | `03-check_orphan-tests.log.txt` | não | `274a22840110ad489438d2e2a4e9913333eb29982a9f73db4dfdcbb96691e9dc` | `274a22840110ad489438d2e2a4e9913333eb29982a9f73db4dfdcbb96691e9dc` |
| `pre-duimp-runtime-shadow-v1-2026-08-27-05-integrity_tree-check.log.txt` | `05-integrity_tree-check.log.txt` | não | `656cfbdd10aaa3dff613dd2b388d3e93efe341ab55de0457c84e5125aecf45e0` | `656cfbdd10aaa3dff613dd2b388d3e93efe341ab55de0457c84e5125aecf45e0` |
| `pre-duimp-runtime-shadow-v1-2026-08-27-manifest.json` | `manifest.json` | não | `64866b15136938fa5ef5cfe77af7b4999574ac8281b95ba5dbfb7e6d918f9679` | `64866b15136938fa5ef5cfe77af7b4999574ac8281b95ba5dbfb7e6d918f9679` |

```text
maskingApplied: false
sensitivityCheck: pass
unclassifiedMatches: 0
```

Os hashes dos quatro logs também constam no manifest. O hash do próprio manifest e a igualdade das cinco cópias foram verificados separadamente antes da preparação deste receipt.

## Sensibilidade e decisão humana de publicação

A varredura mecânica dos cinco artefatos encontrou zero ocorrências de connection string, `DATABASE_URL`, credencial, e-mail ou telefone/PII.

Foram detectadas somente ocorrências da classe `tenantId`/`workspaceId`:

- log 02: 5 ocorrências, 3 valores distintos, todos correspondentes a fixtures sintéticas presentes nas cinco suítes PRE_DUIMP versionadas; zero não classificados;
- log 03: 6 ocorrências, 6 valores distintos, todos derivados de nomes de arquivos de teste já versionados; zero não classificados.

As linhas publicadas com essas ocorrências são 34, 35, 40, 41 e 282 no log 02; e 124, 169, 170, 177, 332 e 357 no log 03. A correspondência foi verificada por comparação hash-only contra as fontes versionadas, sem imprimir os valores no relatório de análise.

Decisão humana de 2026-08-27: publicar sem masking, pois todas as ocorrências foram classificadas como fixtures sintéticas ou partes de caminhos já versionados e nenhuma ocorrência permaneceu sem classificação. Essa decisão é distinta do resultado mecânico da varredura.

Fontes permanentes das fixtures PRE_DUIMP: `apps/api/src/tests/pre-duimp-context.contract.test.ts`, `apps/api/src/tests/pre-duimp-action-catalog.contract.test.ts`, `apps/api/src/tests/pre-duimp-replay.contract.test.ts`, `apps/api/src/tests/pre-duimp-server-authority-adapter.integration.test.ts` e `apps/api/src/tests/pre-duimp-runtime-shadow-route.contract.test.ts`. Para o log 03, a fonte é a lista de caminhos versionados consumida por `check:orphan-tests`.

## Fronteira exata da prova

### Comprovado dinamicamente nesta captura

- O router Express criado por `createPreDuimpRuntimeShadowRouter` foi exercitado com `supertest`, `governedErrorHandler` e dependências controladas pelo teste.
- Os oito resultados HTTP listados acima foram observados.
- O agregado PRE_DUIMP executou 43 testes de contrato, 6 do adapter de autoridade e 8 do runtime shadow.
- O gate de órfãos não encontrou órfão bloqueante.

Fonte: `apps/api/src/tests/pre-duimp-runtime-shadow-route.contract.test.ts:72` e logs 01–03 publicados.

### Comprovado estaticamente no commit validado

- `apps/api/src/index.ts:41` e `apps/api/src/index.ts:42` importam o router e o gate.
- `apps/api/src/index.ts:132`–`apps/api/src/index.ts:134` montam o router em `/api` quando o gate retorna `true`.
- `apps/api/src/routes/preDuimpRuntimeShadowGate.ts:20`–`apps/api/src/routes/preDuimpRuntimeShadowGate.ts:23` exigem o valor literal `true`; o default é OFF.
- `apps/api/src/routes/preDuimpRuntimeShadow.ts:111`–`apps/api/src/routes/preDuimpRuntimeShadow.ts:116` vinculam a instância produtiva a `enforceTenant` e `resolvePreDuimpServerAuthorityFromCanonicalSources`.
- `apps/api/src/routes/preDuimpRuntimeShadow.ts:45`–`apps/api/src/routes/preDuimpRuntimeShadow.ts:104` implementam o POST e a cadeia de decisão/bloqueio.

### Não comprovado por esta captura

- ativação real de `EIAH_PRE_DUIMP_RUNTIME_SHADOW_ROUTE_ENABLED=true` em um ambiente;
- boot completo do app via `app.listen()` e tráfego contra esse processo;
- execução do adapter Prisma/`checkScopePermission` pela rota, pois o teste HTTP usa dependências controladas; o adapter real possui cobertura separada no gate agregado;
- integração de replay/idempotência ao front door HTTP;
- persistência/atomicidade de replay;
- build global, suíte global, lint, typecheck, deploy, staging ou produção;
- correspondência completa entre lockfile e `node_modules`.

## Classificação

```text
Gate check:evidence-index: PASS — 650 referências verificadas.
Veredito pré-commit: APTO PARA COMMIT DE EVIDÊNCIA.
Classificação canônica proposta após o commit: EVIDENCIADO — somente no escopo
estrito desta validação; commit documental ainda pendente.

PRE_DUIMP: PARCIAL — enforcement HTTP comprovado no router de teste e wiring
estático confirmado; ativação real, app.listen completo, replay no front door,
persistência/atomicidade e critérios restantes continuam pendentes.
```

Este receipt não promove `PRE_DUIMP`, `CORE-01A0b` ou `CORE-01A0` e não reclassifica evidências anteriores.
