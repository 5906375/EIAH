# R0A — continuidade seletiva TWDG + IPIG

Data: 2026-11-27. Executor: Codex. Estado: parcial — validação funcional residual aprovada no escopo da configuração testada; integração e divulgação pendentes.

## Natureza e autorização

Representação limitada candidata à divulgação, distinta do registro histórico integral de 2026-09-07. A preparação seletiva e a rodada funcional individualizada foram autorizadas separadamente; seus resultados foram aceitos pelo responsável humano. A presente consolidação autoriza somente a atualização desta representação e de sua entrada existente no Evidence Index. Não autoriza stage adicional, commit, publicação desta versão, implementação coletiva, piloto ou operação. A classificação atual do incremento é INTERNAL; eventual divulgação PUBLIC depende de decisão específica sobre versão e destino.

## Proveniência e evidências históricas

HEAD histórico preservado: 49ba9aaadb7f05d6cec75a90cb5f5f547f3b2824. Main utilizada: 74f68b62581cc282799f1ef4a085e6b6a51eba38. Permanecem na ancestralidade os quatro commits 8622756b, 4d241980, ef9cb1c1 e 49ba9aaa.

O registro original r0a-run-authority-reconciliation-2026-09-07.md e seus 20 logs e manifesto permanecem íntegros nos objetos Git do HEAD histórico. Foram excluídos da árvore candidata perante a main, sem reescrita dos originais nem nova preservação. Esta representação não reproduz caminhos locais ou configurações ambientais desses registros.

Os resultados de 2026-09-07 pertencem às fontes 4d241980 e ef9cb1c1: incluem builds locais e integração sintética então aprovada. Permanecem históricos o typecheck web reprovado com 63 diagnósticos comparados naquela baseline, a interrupção inicial do build da API, a regeneração do artefato derivado, falhas iniciais de conexão e referências inválidas de teardown. Não certificam a main atual. Esses resultados não são atribuídos à configuração atual nem aos novos resultados abaixo.

## Preparação seletiva inicial — registro histórico

- Preflight confirmou branch e HEAD históricos, stage vazio, worktree limpa e ausência de hooks ativos; a consulta remota focal confirmou a main indicada.
- Merge normal iniciado com --no-ff --no-commit. Seis conflitos: workflow CI, worker, testes de metadata e política de Run, package.json e Evidence Index.
- Workflow, worker e testes de governança foram resolvidos pela versão vigente da main. Package.json e Evidence Index partiram integralmente da main antes dos complementos selecionados.
- Comparação integral da árvore confirmou que os demais arquivos técnicos incorporados automaticamente equivalem à main. Não há alteração candidata de runtime de produção, política, catálogo de razões ou workflow.
- O teste interop conserva as assertions vigentes, inclusive precedência do deny do workspace. O grant ledger.view da fixture é criado no próprio caso somente após a nova assertion HTTP 403; permanecem as assertions HTTP 200 e receipt após grant válido.
- O teardown remove somente import/call de criticalMetrics, sem fonte canônica versionada na main. Permanecem os fechamentos de publisher Redis, policy store, kill switch, streams, transportes, filas e Prisma e o finalizador HTTP existentes. A rodada posterior observou os recursos residuais nos limites registrados abaixo, sem comprovar encerramento natural.
- O script de integração existente acrescenta interop e shadow ao segundo comando, com concorrência de arquivos igual a 1. O primeiro comando e o workflow AssignmentFailClosedHttp permanecem intactos.
- Ancestralidade dos quatro commits, MERGE_HEAD e ausência de conflitos não resolvidos foram conferidos estaticamente. O Evidence Index preserva integralmente o conteúdo da main e acrescenta apenas referência a esta execução documental.

## Conferências documentais da preparação inicial — registro histórico

- Conferências estáticas: quatro caminhos candidatos perante a main; assertions anteriores preservadas; runtime e workflow iguais à main; nenhum conflito não resolvido ou alteração unstaged; entrada original do Evidence Index integralmente preservada como prefixo.
- Evidence Index: a primeira execução direta de scripts/checkEvidenceIndex.ts retornou exit 1 por sete referências históricas não verificadas. Sonda focal identificou spawnSync git EPERM no sandbox, com o objeto Git existente. Execução do mesmo checker fora do sandbox retornou exit 0, ok true, 999 referências verificadas. Nenhum arquivo foi corrigido para contornar a restrição.
- Links canônicos: execução direta de scripts/checkDocsLinkIntegrity.ts, exit 0, 29 alvos. A representação limitada não introduz links relativos; sua referência no índice existe fisicamente.
- Whitespace: git diff --cached --check perante a main e git diff --check sem diagnóstico. Conferência focal da representação não encontrou caminhos locais, endpoints operacionais, padrões de credenciais ou conteúdo interno adicional; não equivale a auditoria global ou autorização de divulgação.
- Os checkers documentais foram executados diretamente com o loader TS existente, sem executar as suítes unitárias associadas aos aliases package.json. Na preparação inicial, testes de software, builds, Docker e migrations não foram executados; a rodada posterior é distinguida abaixo.

## Continuidade da prontidão e impedimentos de preparação

A prontidão foi inicialmente interrompida pelo cliente Prisma local desatualizado e pela constatação de artefatos derivados rastreados, exigindo autorização específica antes da escrita. A geração canônica Prisma 7.2.0 posteriormente autorizada terminou com exit 0 e restabeleceu a correspondência semântica com o schema candidato, sem alteração do schema fonte. Os artefatos permaneceram fora do stage.

Uma rodada anterior encerrou com dois testes reprovados por dependência declarada indisponível na instalação local, antes das assertions de autoridade; as outras três suítes não executaram pelo encadeamento do script. Isso foi classificado como impedimento de preparação, sem comprovar defeito funcional. O diagnóstico consolidado confirmou manifests e lockfile coerentes e conteúdo disponível no store local. A preparação focal offline autorizada terminou com exit 0, reutilizou 25 pacotes e realizou zero downloads, com lifecycle scripts desativados. Manifests, lockfile, cliente regenerado e stage foram preservados. Nenhuma correção de runtime, fixture ou assertion foi realizada para obter aprovação.

Os registros completos dessas etapas, inclusive falhas e resoluções, permanecem no acervo INTERNAL existente. Esta representação não incorpora logs integrais, caminhos absolutos, identificadores dos containers, credenciais ou configurações operacionais.

## Validação funcional residual individualizada — 2026-11-27

Foram executadas quatro invocações nativas individuais, sequenciais, com os parâmetros, fixtures e configurações correspondentes do script canônico, sem encadeamento entre suítes. O script canônico completo não foi executado nem certificado.

| Suíte | Aprovados | Exit code | Duração da invocação |
| --- | --- | --- | --- |
| Run Governance Policy | 2/2 | 0 | 1,493 s |
| IMOB Action | 5/5 | 0 | 2,525 s |
| Agents Interoperability | 6/6 | 0 | 2,215 s |
| Shadow Executions | 2/2 | 0 | 1,992 s |

Total: 15/15 PASS; zero falhas, cancelamentos, ignorados ou casos sem resultado. Tempo agregado da rodada, incluindo conferências entre suítes: 11,096 segundos, dentro do limite de 180 segundos. Esses resultados são da rodada atual e não dos logs históricos de setembro.

A configuração efetivamente testada foi a árvore em merge pendente sobre a main 74f68b62581cc282799f1ef4a085e6b6a51eba38, com cliente Prisma 7.2.0 regenerado localmente e dependências recuperadas offline. Foram utilizados exclusivamente PostgreSQL e Redis descartáveis, bancos principal e shadow distintos e fixtures sintéticas, sem fallback para ambientes operacionais. As 37 migrations existentes foram aplicadas com sucesso ao novo banco descartável, exit 0; não foram criadas ou alteradas migrations. O resultado não constitui validação incondicional da árvore staged original.

As assertions vigentes, preservadas, comprovaram no escopo exercitado:

- negativa HTTP 403 antes do grant explícito ledger.view, acesso HTTP 200 após concessão válida e receipt correspondente;
- precedência do deny do workspace sobre allow tenant-wide;
- autoridade da ação persistida, sanitização e projeções de governança;
- rejeição de ação inválida e sanitização nos cenários shadow.

Após cada suíte, não foram observados processos remanescentes no grupo acompanhado, listeners atribuídos aos PIDs observados, conexões PostgreSQL ou clientes Redis além da sonda. Os dois containers descartáveis foram removidos; o daemon dedicado permaneceu ativo e sem containers, e os endpoints descartáveis deixaram de escutar. Outros recursos e worktrees foram preservados.

O uso de --test-force-exit e o encerramento explícito existente no interop limitam a comprovação do teardown natural. A observação residual não demonstra ausência geral de vazamentos nem instrumenta individualmente cada fechamento de streams, transportes, filas ou Prisma.

## Destinação dos artefatos e limites de continuidade

A alternativa A permanece preferencial: artefatos derivados para preparação local, com geração canônica prevista na cadeia CI. A conferência existente é estática: o workflow vigente executa o build de @repo/db, que inclui generate, antes das suítes. Ainda não há novo CI do candidato. A defasagem dos artefatos versionados permanece uma pendência transversal independente, sem correção automática nesta frente.

Permanecem fora do stage os artefatos rastreados packages/db/src/generated/client/package.json e packages/db/src/generated/client/schema.prisma, bem como os quatro arquivos ignorados regenerados. Não foram restaurados, descartados ou incorporados ao incremento. Sua destinação final exige decisão específica antes do futuro merge commit e publicação.

AUTHZ-RUNS não está integralmente encerrada. A semântica observacional do worker histórico não foi restaurada: permanecem o enforcement e os controles atuais da main. Scopes, ator, assignment, versão e implementação coletiva não são declarados concluídos. Nenhum piloto, deployment ou operação real foi autorizado.

A documentação candidata permanece INTERNAL; a preparação da representação limitada não a torna PUBLIC. Stage documental, merge commit, divulgação da versão candidata e atualização do PR #442 permanecem dependentes de autorização específica. Todos os freezes, holds, No-Go Ledgers e AUTHZ-ROOT-001 permanecem vigentes.
