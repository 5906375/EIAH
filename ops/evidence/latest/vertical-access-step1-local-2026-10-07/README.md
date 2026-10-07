# Passo 1 — acesso transversal, validação local

Execução real local em 2026-10-07, Node v22.17.1, com fixtures sintéticas.
Escopo: `vertical.access.v1`, resolver puro e descriptor IMOB sem wiring operacional.

Resultados observados, comandos completos e exit codes: `results.json`.

| Validação | Resultado | Log |
| --- | --- | --- |
| Resolver novo | 16/16, exit 0 | `unit.log.txt` |
| Gate entitlement legado | 4/4, exit 0 | `regression-entitlement.log.txt` |
| Registry/handoff legado | 5/5, exit 0 | `regression-registry.log.txt` |
| Contrato billing/entitlement legado | 4/4, exit 0 | `regression-billing-contract.log.txt` |
| Typecheck focado, noEmit/strict | exit 0, sem diagnósticos | `typecheck.log.txt` |
| Orphan gate + testes web exigidos pelo script | exit 0; blockingOrphanCount=0 | `orphan.log.txt` |
| Launcher render-only | exit 0, violations=[] | `launcher.log.txt` |
| Links documentais | exit 0 | `docs.log.txt` |
| Reason-code canon existente | exit 0; alcance limitado aos targets canônicos existentes | `reason-canon.log.txt` |
| Whitespace | exit 0 | `diff.log.txt` |
| Integridade do Evidence Index, reexecução autorizada | 8/8, exit 0, 646 referências | `evidence-index-authorized-result.json` (resumo do retorno da ferramenta) |
| Git hygiene | exit 0 | `git-hygiene.log.txt` |

Uma tentativa agregada de regressão falhou antes de executar testes: Node local não aceita
`--test-isolation=none` (exit 9, `regression.log.txt`). Foi corrigida executando cada arquivo
com `node --import tsx <arquivo.ts>`, gerando os três logs individuais e 13/13 testes acima.
Não se contabiliza essa tentativa como execução funcional. O comando inicial `--test` também
foi executado no terminal e reportou somente três arquivos aprovados; as contagens de casos
acima vêm dos logs individuais preservados, não dessa saída agregada.

O gate Evidence Index falhou inicialmente no sandbox (`spawnSync git EPERM` no teste de
objetos Git; `evidence-index.log.txt`). A inspeção direta também mostrou referências pinned
como ausentes nesse ambiente, sem provar ausência dos objetos. A reexecução autorizada fora
do sandbox passou integralmente. O JSON autorizado é um resumo fiel do retorno da ferramenta,
não um log raw independente; a falha inicial foi preservada em `results.json`.

`boundary.json` registra HEAD, hashes SHA-256 e comparação byte a byte de 11 arquivos
protegidos com HEAD: launcher, rotas IMOB, entitlement/fallback, access gate,
ativação/provisionamento, liberação/revogação, leitor do registry, schema, handlers e manifesto.
Todos são idênticos. A busca por `resolveVerticalAccess` localiza somente definição e teste.
`source-hashes.json` identifica a fonte final alterada; não prova execução em checkout limpo.

Os sete cenários pedidos estão cobertos, com reconciliação da revogação pela ADR-011:
bloqueio total nega; somente leitura nega escrita; sem nova ativação preserva uso atual.
Stage obrigatório exige permissão avaliada pelo servidor e stage correspondente. Uma policy
de action isolada não habilita o produto. `allowed=true` mantém autorização de action
`not_evaluated`; HIGH não é habilitado.

Limites: sem DB/Redis/provider, E2E HTTP, integração operacional do resolver, full typecheck,
suíte global, lint global ou CI remoto. Não atesta enforcement novo em produção nem
proveniência/frescor dos fatos de um adapter futuro. Os reasonCodes novos são internos,
ainda não expostos por rotas/receipts; exigem reconciliação canônica antes de integração.
Entitlement financeiro/billing continua separado e não foi conectado ao novo resolver.

Status: evidenciado exclusivamente para o contrato puro e a validação local descrita.
Produção/integração não promovidas. Sem commit ou push.
