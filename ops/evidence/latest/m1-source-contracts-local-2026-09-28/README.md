# M1 — contratos locais de origem e diagnóstico v2, 2026-09-28

Agente: Codex, sem subagentes. Execução sintética local, sem .env, clientes de infraestrutura, produtores, banco, CI ou workflows. Status evidenciado somente para esta validação local; M1 operacional permanece parcial e ADR-009 Proposta.

Resultado novo desta rodada: 103 testes, 103 pass, 0 fail na suíte focada; typecheck focado exit 0; git diff --check exit 0. Os 72/72 anteriores são históricos, não o resultado atual. Comandos completos e exit codes em validation-commands.json; logs originais anexos. SHA-256 das fontes testadas em source-hashes.json.

A suíte inclui CLI/validadores reais com fixtures sintéticas. Cobre legado sem/com metadados, projeções incluídas sem recomputação, claims falsos passed/failed, versões inválidas, estrutura e identidades duplicadas, referências/digests/contagens/datas, consumers do diagnóstico e bloqueios existentes do gate. Nenhum teste desta rodada demonstra população operacional ou recomputação de métricas da fonte.

Implementado p1-source-material.v1 e saída p1-source-diagnostic.v2; manifesto v1 preservado. sourceSnapshot legado → metadata_only; presença de linhas → rows_included, nunca execução de métricas. recomputation=not_run, independentSourceVerification=not_demonstrated. O executor fica para etapa posterior; passed/failed não são aceitos por claims do pacote. Projeções mínimas de identidade/tempo não são snapshots financeiros completos. Mapeamento, chave de duplicidade e denominadores continuam unresolved.

Sem alterações no catálogo, reconciliador HTTP, produtor/coletor operacional, Prisma/migrations, política operacional, checker legado, workflows ou rulesets. Nenhum retorno P1/P2 autorizado. Index/staging/intent-to-add/stashes preservados; nenhum comando Git mutador.
