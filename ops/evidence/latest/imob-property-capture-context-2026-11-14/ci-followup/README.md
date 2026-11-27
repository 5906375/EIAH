# PR #536 — correção da entrada de navegador dos contratos

Status: **parcial**. Evidência de diagnóstico remoto e validação local do build e da resolução Vite; não representa nova aprovação do CI nem validação funcional em navegador.

## Origem e escopo

- PR: https://github.com/5906375/EIAH/pull/536, aberta em Draft na consulta desta execução.
- HEAD local e da PR: `780eafb8abef0630d0ae1c9cafe69decfe3a1726`.
- CI Monorepo: run `43625317335`, tentativa mais recente consultada, concluída com failure. Os jobs fizeram checkout do merge sintético `67250024941e64760e577b152f77be15f638dbdf` contra main `751cbc3c7e23bc92db5a986136e221178af0c24b`.
- Correção posterior somente no worktree, sem stage, commit ou push. Nenhum gate ou teste foi alterado.

## Primeiro erro relevante e relação causal

| Job / ID | Primeiro erro relevante | Consequência observada |
| --- | --- | --- |
| build_validate / 132539730411 | Build Web Application (Hardened): `IMOB_PROPERTY_CAPTURE_POLICY` não exportado por `packages/contracts/src/browser.ts`, importado por `chatLauncherEngine.ts:30` | Build termina com exit 1; etapas anteriores aprovadas são preservadas. |
| ImobChatParityE2EInformative / 132539730545 | `web.log`: dependency scan do Vite sem exports de `IMOB_PROPERTY_CAPTURE_POLICY`, `IMOB_PROPERTY_CAPTURE_FIELDS` e `imobPropertyCaptureResultSchema` | O job termina com exit 1 por TimeoutError esperando o primeiro textarea, antes das jornadas. |
| ImobFrontdoorMobileSmokeInformative / 132539730712 | Mesmo export ausente no build, antes do healthcheck | O pipeline com tee retorna success na etapa, apesar do build falhar. O preview não fica disponível; healthcheck termina com exit 1, rota UNREACHABLE; smoke é skipped e avaliação final falha. Workflow preservado, sem alterar gate/pipeline. |
| P1ReconciliationRecurring / 132539730236 | `weekly_cycle_evidence_too_old`, exit 1 | Corresponde à causa já conhecida; ratificação preservada, sem reinvestigação, reexecução ou mudança de P1. |

A causa compartilhada é a exportação feita em `index.ts` sem a correspondente entrada em `browser.ts`, usada pelo alias de `@eiah/contracts` do Vite. Os testes via tsx/TypeScript não validaram essa entrada de navegador. Não há evidência nesses erros de três regressões funcionais independentes.

Os quatro logs de job estão neste diretório com os nomes dos jobs. Foram removidos códigos ANSI, espaços finais e o token seed explícito; os demais mascaramentos são os do GitHub. `parity-web.log` veio do artefato `14125004671` da mesma execução (arquivo ZIP original SHA256 `d542888c58aa557012ad19c29b5f0bb79a04a2401d8f0a077398336c4cd2f328`), confirmando a causa antes do timeout. O artefato remoto permanece disponível no run.

## Diff efetivo de código

Único arquivo de código alterado nesta correção: `packages/contracts/src/browser.ts`.

```diff
 export * from "./imobAssetDestination.js";
+export * from "./imobPropertyCapture.js";
```

Inspeção integral de `imobPropertyCapture.ts`: única importação é `zod`; contém constantes, tipos e schemas. Sem imports de API, DB, providers, módulos Node ou dependência exclusiva de servidor. Build browser e varredura Vite abaixo passaram. `CLAUDE.md` e `CODEX.md` conservam as modificações anteriores, sem alteração nesta retomada.

## Verificações efetivamente executadas

| Verificação | Resultado | Exit | Contagem / limite |
| --- | --- | --- | --- |
| Build web iniciado antes da interrupção, recuperado pela sessão existente | APROVADO | 0 | 897 módulos transformados; sem repetir build |
| Resolução e dependency scan/otimização Vite em modo serve | APROVADO | 0 | Alias confirmado em chatLauncherEngine e useImobFrontDoorForms; 11 dependências otimizadas |
| git diff --check | APROVADO | 0 | Sem teste funcional |
| Cenários mobile | NÃO EXECUTADO nesta retomada | — | O job remoto anterior foi bloqueado antes do smoke; nenhum viewport aprovado por esta validação |
| Paridade com banco | NÃO EXECUTADO nesta retomada | — | O job remoto anterior parou antes das jornadas |

Build: `NODE_ENV=production TMPDIR=/tmp TMP=/tmp TEMP=/tmp ESBUILD_TMPDIR=/tmp pnpm --filter @eiah/web build`, com chaves de providers vazias; stdout e stderr em `web-build.log`. A sessão iniciada foi recuperada e confirmou exit 0. Avisos não bloqueantes: target ES2024 no esbuild, Browserslist desatualizado e chunks acima de 500 kB. Não foram alterados para silenciar o build.

Vite: Node ESM importou `resolveConfig` e `optimizeDeps` da instalação local de Vite, resolveu a configuração real de `apps/web/vite.config.ts` em modo serve com `envFile:false`, confirmou o alias de `@eiah/contracts` nos dois consumidores e chamou `optimizeDeps(config, true, true)` sobre o projeto. Saída integral em `vite-resolution.log`. Sem servidor HTTP, browser, DB ou chamadas a providers; chaves vazias. O cache novo `/tmp/imob-property-vite-resolution-4AiSMo` foi removido no finally após a execução. O scan cobre a entrada que falhou no web.log remoto, sem executar a aplicação ou suas jornadas.

Os resultados anteriores de unitários, gates, Lint, IMOB Worker Mutation E2E, DB Preview Postgres, ChatEngineRegression e CiUnitSuite foram preservados, sem reexecução. A alteração de exportação não muda contratos de comportamento. O typecheck anterior continua limitado ao recorte documentado no pacote original; não houve novo typecheck global.

## Artefatos e limitações

Esta execução criou `ci-followup/` para preservar os logs remotos sanitizados, `parity-web.log`, o build local e a varredura Vite. Os artefatos anteriores do pacote não foram reescritos. Os logs `.log` são ignorados pela política Git atual e permanecem locais, sem stage forçado nesta etapa. O ZIP temporário `/tmp/imob-parity-ci.zip`, baixado para extrair `web.log` e conferir o hash, foi removido após essa preservação; `api.log` não foi copiado por não ser necessário ao diagnóstico confirmado.

O build gerou o output formal ignorado `apps/web/dist`; foi preservado. Nenhum processo de servidor foi iniciado nesta retomada. Sem suites adicionais, novas capturas, chamadas pagas, gravações de domínio, mudanças na oferta de avaliação, stage, commit, push, retirada de Draft, merge ou deploy.

Provider real, cenários de navegador mobile e paridade HTTP com banco continuam **não validados para esta correção**. O CI remoto continua refletindo o SHA publicado, anterior a esta linha local. Validar posteriormente apenas os jobs afetados quando houver publicação autorizada. Evidências originais de dublês e tipagem focal continuam válidas dentro dos limites já registrados.

Agentes envolvidos: somente Codex, sem subagentes.


## Preparação da publicação corretiva autorizada

As seções anteriores registram o diagnóstico e a validação anteriores ao commit corretivo. Nesta etapa posterior, o usuário autorizou um único commit e push normal na mesma branch da PR #536, mantendo Draft. A seleção contém somente `packages/contracts/src/browser.ts`, `docs/EVIDENCE_INDEX.md`, este README e os sete logs explicitamente listados abaixo. `CLAUDE.md` e `CODEX.md` ficam fora da entrega.

A busca por padrões de credenciais identificou mascaramentos do GitHub, o seed já redigido, valores de teste de `POSTGRES_PASSWORD` e `INTENT_SIGNATURE_SECRET`, e-mail sintético `e2e.local` e um caminho do workspace local. Foram criadas cópias próprias para publicação em `published/`: valores de senha/assinatura de teste e e-mail sintético foram redigidos, o caminho local foi substituído por `<WORKSPACE>` e espaços finais/códigos ANSI foram removidos. Os valores já mascarados pelo GitHub foram mantidos. Não foram encontrados padrões de chave privada, chaves de providers ou tokens GitHub em claro na busca direcionada; isso não equivale a auditoria exaustiva de segredos.

Os sete originais locais diretamente em `ci-followup/` permanecem byte a byte preservados e ignorados, sem stage. Os logs abaixo são as únicas cópias ignoradas selecionadas para `git add -f`, sem alterar `.gitignore`. As referências a logs nas seções anteriores apontam aos originais locais; para revisão versionada, usar as cópias relativas abaixo. O hash do ZIP remoto é histórico e foi conferido antes de removê-lo; não há exigência de novo download nem de novo manifesto.

| Cópia versionada (relativa a este README) | SHA256 original local preservado | SHA256 cópia sanitizada |
| --- | --- | --- |
| [`published/build_validate.log`](published/build_validate.log) | `fbcacfdf84df469d3fdf224f94c5630c34584d8c4114c3b6ca7e042122de5c05` | `fbcacfdf84df469d3fdf224f94c5630c34584d8c4114c3b6ca7e042122de5c05` |
| [`published/ImobChatParityE2EInformative.log`](published/ImobChatParityE2EInformative.log) | `a6e392927aea6a37c8a4ea74a35a51f9043a800b60ecdc7584c3269361cf4a60` | `93e490ff4005babdcace5465eaffed2b6180aadc5867b5cefadade7ea3d6c2a2` |
| [`published/ImobFrontdoorMobileSmokeInformative.log`](published/ImobFrontdoorMobileSmokeInformative.log) | `a36af95c404727bfbcc833ee81da53bc3f9d0e38126b85d756196db53881cc47` | `a36af95c404727bfbcc833ee81da53bc3f9d0e38126b85d756196db53881cc47` |
| [`published/P1ReconciliationRecurring.log`](published/P1ReconciliationRecurring.log) | `dc61d14b1293eb54b35154a8fe51347e861cd055ed3d5b3cd17127848abf6b0d` | `dc61d14b1293eb54b35154a8fe51347e861cd055ed3d5b3cd17127848abf6b0d` |
| [`published/parity-web.log`](published/parity-web.log) | `ee899f5d01e71be48abd7d4b57deadf34f7fb7bc42bbd6fc1194752ad41e0687` | `5ae833a2cacad0076a14b5258a432aacdb2bc2ceac1f536c318126e7484ad12a` |
| [`published/web-build.log`](published/web-build.log) | `e59906db11718e246baf0f35b0da19e4942d66ea19acef5a6d675c668ca0b414` | `c7e995805cf3b28e4f26bba1daa515d9d101d3eb765ec3d2538c7bcc863e3760` |
| [`published/vite-resolution.log`](published/vite-resolution.log) | `bb43a5767b140099797654676c07e0fbe99b00131fae948a18971c33bdbb0635` | `bb43a5767b140099797654676c07e0fbe99b00131fae948a18971c33bdbb0635` |

Build e resolução Vite já aprovados localmente (exit 0) foram reutilizados, sem novas execuções. Cenários mobile e paridade com banco continuam dependentes dos checks do novo SHA publicado; nenhum resultado de CI futuro é antecipado. A ratificação de P1 por `weekly_cycle_evidence_too_old` permanece preservada. Oferta de avaliação continua desligada; nenhum provider real, dado de domínio ou ambiente foi acionado para esta publicação.
