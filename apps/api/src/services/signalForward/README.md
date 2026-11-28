# Signal Forwarding (Radar → MKT) — adaptação da cadeia real

Etapa interna da entrega Radar → MKT. Usa `createRunRecord`/`assertWorkspaceAgentEnabled`
reais (não fixtures) dentro de uma transação única (`prisma.$transaction`), e
`checkScopePermission` real (fail-closed) para autorização.

Ver `signalForwardingService.ts` para o aviso completo sobre o escopo
`runs.execute` usado (provisório, não é integração da frente AUTHZ-RUNS/R0A).

## Rodar os testes (banco descartável)

Os testes usam conexões diretas via `pg`/`@prisma/adapter-pg` para observar
`pg_stat_activity` (prova de concorrência real). Como `apps/api` não declara
essas dependências diretamente, crie o symlink local (não commitado,
`.gitignore` já cobre `node_modules`) antes de rodar:

```bash
ln -s ../../../../../../packages/db/node_modules \
  apps/api/src/services/signalForward/__tests__/node_modules

export DATABASE_URL="postgresql://<usuario>:<senha>@<host>:<porta>/<banco_descartavel>"
node_modules/.bin/tsx --test apps/api/src/services/signalForward/__tests__/*.test.ts
```

**Nunca aponte `DATABASE_URL` para banco compartilhado, staging ou produção.**

## Não pronto para produção

Autorização usa um nome de escopo provisório; recuperação banco/fila,
proteção do worker e interface não são cobertas por estes testes.

## Continuidade TWDG + IPIG — 2026-11-27

Classificação: INTERNAL. Preparação estática autorizada; nenhuma divulgação autorizada.
O texto anterior é histórico. PR #441/R0A e Front Door foram integrados depois dele;
isso não concede ao SignalForward autorização de encaminhamento ou execução.

### Estado e decisões da composição

- ORIGIN_FIX reutilizada, branch `feat/radar-marketing-consumer-v1`.
- HEAD/ORIG_HEAD: `eb63d581145cf8937f198a26382a7eaef8eccf9d`.
- MERGE_HEAD/baseline: `88c1fff5c69614f47f171b8cddfb0360765a3366`.
- Merge existente retomado, sem novo merge, commit, testes ou publicação.
- Colisão original: duas migrations criavam `runs_id_tenant_id_workspace_id_key`.
  Ambas descrevem UNIQUE sobre `runs(id, tenant_id, workspace_id)`, na mesma ordem,
  sem expressão ou predicado. Reutilizado exclusivamente o índice canônico da main.
- Migration residual: `packages/db/prisma/migrations/20261127190000_radar_signalforward_residual/migration.sql`.
  Dez tabelas, 32 índices (incluindo dois parciais) e 34 FKs. Apenas estruturas novas;
  sem DROP, UPDATE/backfill, reparação, IF NOT EXISTS ou alteração de tabelas da main.
- Conferência estática dos tipos/nulabilidade dos 142 campos escalares das dez tabelas
  contra o schema candidato. Não equivale a Prisma validate/migrate diff ou SQL executado.
- Os 38 arquivos da sequência canônica (incluindo migration_lock.toml) permanecem
  byte a byte iguais à baseline. As nove migrations Radar saíram somente da sequência
  ativa candidata; continuam recuperáveis em HEAD e suas referências históricas.

### Equivalência semântica das migrations históricas

Todos os nomes abaixo são diretórios em `packages/db/prisma/migrations/` recuperáveis
no commit de origem. Os objetos residuais não existem no schema canônico da baseline.

| Origem histórica | Efeito necessário e estado final candidato | Tratamento/limite |
| --- | --- | --- |
| 20260907205017_add_signal_forward_request | Solicitação durável, escopo, origem/destino, chave de idempotência e índices | ADDITIVE_RESIDUAL; FKs simples de Run e unicidade simples de destino SUPERSEDED pelas compostas finais |
| 20260908072609_origin_scope_fk_and_snapshot | Snapshot obrigatório e FKs compostas para Run; unicidade composta de destino | ADDITIVE_RESIDUAL nas tabelas novas; índice de Run EXISTING_CANONICAL; DROP intermediário HISTORICAL_ONLY |
| 20260908094140_signal_forward_request_fingerprint_version | Versão obrigatória sem default permanente | ADDITIVE_RESIDUAL na criação; backfill v1 DATA_DEPENDENT, não executado nem generalizado para legado desconhecido |
| 20260912190837_add_human_confirmation | Janela/revisão/TTL, rascunho e snapshot confirmado; ponteiros ativo/concluído | ADDITIVE_RESIDUAL; ponteiros continuam sem FK como no contrato histórico; FK composta de confirmação preservada |
| 20260916112527_add_radar_known_entity_and_material | Entidades, material, fonte, hash, correções, operação e escopo | ADDITIVE_RESIDUAL; predecessor vinculado à mesma entidade/tenant/workspace |
| 20260917110146_add_radar_analysis_request_attempt_recommendation | Request/material/entidade, attempts, resultado intermediário, Run e recomendação | ADDITIVE_RESIDUAL; índice parcial inclui pending, running e provider_responded_pending_persistence |
| 20260917162503_add_radar_entity_access_grant | Grants por entidade, usuário e operação; revogação e unicidade | ADDITIVE_RESIDUAL; não concede acesso por migration |
| 20260917213612_add_radar_provider_call_slot | Slots por tentativa, escopo, estado e unicidade | ADDITIVE_RESIDUAL; concorrência não equivale a reserva de orçamento |
| 20260919075915_add_radar_recommendation_evaluation | Avaliações versionadas, correções encadeadas, idempotência e raiz única | ADDITIVE_RESIDUAL; índice parcial de raiz e FKs preservados; imutabilidade continua disciplina de aplicação |

### Compatibilidade e dados anteriores

- A: banco vazio recebe sequência canônica completa e depois a residual.
- B: banco com a sequência canônica aplicada recebe somente a residual.
- A/B pressupõem ausência das dez tabelas residuais: CREATE TABLE não oculta estrutura
  inesperada e falha se ela existir. Nenhum banco real foi consultado.
- C: aplicação prévia parcial/total das migrations históricas Radar é NOT_DETERMINED
  nos ambientes reais e BLOCKED para esta migration. Há evidências históricas de bancos
  sintéticos descartáveis; isso não demonstra inexistência de outros ambientes.
- origin_snapshot: em A/B nasce NOT NULL numa tabela vazia, sem backfill. No legado,
  a resposta atual do Run pode não representar o conteúdo validado no encaminhamento.
  Não se inventa snapshot nem se reconstrói automaticamente a identidade autorizada.
- fingerprint_version: preservados o algoritmo v1 e a exigência de fornecimento explícito.
  O backfill histórico v1 foi comprovado para o cenário documentado em
  EVIDENCE_20260908_FINGERPRINT_VERSION.md; não é autorização para repetir em outro legado.
- C exige decisão e validação próprias; nenhum histórico de migrations será alterado.

### Composição, exclusões e controles

- Backend/contratos Radar e D5/D6 preservados; não foi importada a POC nem restaurada
  a criação imediata de Run da REALCHAIN anterior a D6.
- Bootstrap API, App.tsx, cliente web api.ts, workflow ci.yml e símbolo do site iguais
  à main. Sem montagem de Radar no bootstrap nem cockpit Radar na árvore ativa.
- Cinco arquivos de páginas/componentes Radar e dois scripts seed/start de demonstração
  excluídos da candidata, preservados integralmente em HEAD; não há interface substituta.
- Router/gate de demonstração mantidos como dependência do teste HTTP existente,
  sem montagem no bootstrap; teste usa aplicação Express sintética e transporte substituto.
- ATTEMPT_FIX b57ca42c não foi transportada integralmente. Seu hunk corrige a URL da
  página histórica com firstAttempt.id, mas não altera o backend. Teste attempt-flow
  depende do cockpit excluído: permanece na rescue, não registrado como executável aqui.
- A divergência attempt por ID versus recomendação por request/último attempt permanece;
  a rescue não a corrige. Correção mínima futura: recuperação vinculada ao attempt
  explicitamente validado, com negativa de associação divergente, no contrato apropriado.
- Avaliação mantém recommendationId -> attemptId, rubrica e correções. Não é D6.
- workspaceAgentAssignments preserva resolveWorkspaceAgentProvisioningTarget e os
  controles da main, acrescentando só aceitação de TransactionClient quando necessária.
- Completion preserva diagnósticos, shouldRetry, propagação da falha e proveniência da
  main; override opcional de retries mantém o default de todos os demais consumidores.
  Saneamento residual é aditivo. O Radar continua sem autorização para modelo real.
- Sete derivados Prisma rastreados mantidos iguais à main; estão deliberadamente sem
  os dez modelos novos. Regeneração coerente é pré-requisito da validação futura.
- Evidence Index reconciliado por união, sem apagar registros da main; resultados
  antigos continuam históricos, sem certificação desta árvore.
- Lacunas excluídas: recommendation-to-signal, resolvedor operacional D6, outbox/dispatch,
  worker, entrega confiável, consumers, Coordinator e jornada completa no Front Door.
- Preservados AUTHZ-RUNS parcial, AUTHZ-ROOT-001 congelado e demais freezes/holds/No-Go.
- Retenção/expurgo e direitos sobre materiais continuam pendentes; TTL não é retenção.

### Prontidão e registro de testes (sem execução)

- Dependências existentes lidas: tsx 4.21.0, TypeScript 5.9.3, Supertest 6.3.4,
  pg 8.16.3 e Prisma/adapter 7.2.0. Imports de db/core/contracts resolvem nesta worktree.
  Store declarado: pnpm v10; presença não certifica completude offline nem builds atuais.
- Três suítes puras (A-contract-validation, L-radar-signal-result-validator e
  P-suggested-prompt-generator) registradas no manifesto e test:ci-unit-suite, preservando
  todas as entradas da main. D-analysis-contracts importa helper de banco e fica no Grupo A.
- As outras 25 suítes/arquivos existentes estão explicitamente registrados em
  test:radar-signalforward-ci, serializados, exigindo DATABASE_URL explícita e sem carregar
  arquivo .env pelo comando. Não foram introduzidos skips nem alteradas assertions.
- O comando de banco ainda NÃO está conectado ao workflow atual: ci.yml foi preservado.
  Cobertura executada em CI/gate de órfãos não está aprovada; ligação a job PostgreSQL
  exige autorização específica. Não inserir esses arquivos de banco no manifesto unitário.
- Socket/config do daemon dedicado existem; configuração não pôde ser lida por permissão
  de filesystem. Nenhum Docker foi executado. Funcionamento/imagens atuais não certificados.
- Futuro ambiente: daemon dedicado já existente, imagens locais, nenhum pull, destinos
  descartáveis explícitos, principal e shadow distintos, sem 5433/6379 ou fallback.
- Não reutilizar preload Supertest incompatível. O teste HTTP usa Supertest nativo;
  binds/teardown e isolamento devem ser comprovados antes da rodada, sem alterar assertions.

### Plano consolidado futuro — requer autorização própria

1. Preflight conjunto de dependências, artefatos e infraestrutura. Confirmar lockfile/linking
   e store; se faltar pacote, interromper antes de instalar. Comprovar isolamento de banco,
   principal/shadow, rede e ausência de recursos operacionais antes de qualquer escrita.
2. Preparar derivados uma vez, nesta worktree: timeout 120s pnpm --filter @eiah/contracts build;
   timeout 120s pnpm --filter @repo/db build (inclui generate); timeout 120s pnpm --filter
   @eiah/core build; timeout 120s pnpm --filter @eiah/api build (inclui typecheck oficial).
   Revisar deltas rastreados/ignorados produzidos, sem importar derivados de outra frente.
3. Schema: timeout 60s pnpm --filter @repo/db exec prisma validate. Sempre exportar URLs
   descartáveis explícitas antes da avaliação do prisma.config.ts, inclusive SHADOW_DATABASE_URL.
4. A: banco descartável vazio, timeout 120s pnpm --filter @repo/db migrate:deploy; inspecionar
   as dez tabelas, 32 índices, dois predicados parciais, 34 FKs, nulabilidade e defaults.
5. B: em outro banco descartável, aplicar somente a sequência MERGE_HEAD exportada via
   git archive para diretório temporário de validação; prisma migrate deploy --schema
   apontando ao schema dessa baseline, com a mesma versão/config e URLs explícitas.
   Criar fixtures sintéticas canônicas (tenant/workspace/user/run e registros vinculados);
   aplicar a sequência candidata e comprovar preservação dos registros e histórico anteriores.
6. Rodada de três suítes puras pelo node --import tsx --test com seus caminhos do manifesto.
   Rodada das 25 suítes pelo timeout 120s pnpm test:radar-signalforward-ci contra banco
   preparado. Cobertura: entidades/material, grants/revogação, requests/attempts/concorrência,
   recuperação/cancelamento, recomendação/avaliação, fingerprint/P2002 e D5/D6. Não são
   repetição certificadora dos 297 históricos: validam schema/serviços compartilhados novos.
7. Regressões proporcionais de serviços compartilhados: typecheck/build acima; boundary
   de falha/provider/retry, assignment fail-closed/provisioning e caller-regression existente.
   Rodar somente arquivos pertinentes uma vez; não repetir W4/IMOB completo, P1/P2/Core
   ou WhatsApp sem impacto demonstrado. Corrigir ou reexecutar requer decisão posterior.
8. Registros/gates: inventário da suíte unitária, checkOrphanTests contra baseline,
   front-door-single-surface, Evidence Index, links e whitespace. Antes de CI, autorizar
   wiring do Grupo A no job isolado, preservando integralmente os gates atuais.
9. Critérios: nenhuma perda canônica; isolamento tenant/workspace/FKs e duas unicidades
   parciais demonstrados; A/B aprovados; negativos de autoridade preservados; sem montagem,
   cockpit ou chamadas externas; zero regressão atribuível não resolvida. Não declarar C.
10. Teardown: encerrar listeners/pools/processos e remover somente bancos/containers/volumes
    descartáveis criados na rodada; preservar daemon dedicado e recursos existentes. Logs
    sanitizados no acervo existente, sem sobrescrever históricos. Não usar force-exit como
    prova de encerramento natural. Falha encerra a rodada, sem correção automática.

Nenhuma etapa de validação acima foi executada nesta preparação. SQL preparado não é
migration validada; árvore reconciliada não é integração, ativação ou prontidão produtiva.

### Fechamento da preparação estática

Oito conflitos resolvidos e caminhos preparados no index; HEAD/ORIG_HEAD e MERGE_HEAD
permanecem os registrados. Nenhum arquivo unstaged ou untracked ao encerrar a composição.
Os 80 modelos da main mantêm suas declarações canônicas; dez modelos são aditivos.
As correções da rescue permanecem históricas por dependerem da superfície excluída.
A classificação proposta é TWDG_IPIG_RADAR_SIGNALFORWARD_SELECTIVE_COMPOSITION_PREPARED,
limitada à composição estática. Status de implementação/validação: parcial.
A ligação das 25 suítes de banco ao CI exige autorização de workflow antes de publicação;
não há declaração de aprovação do gate de órfãos ou da composição em execução.

A conferência de whitespace contra HEAD histórico alcança conteúdos incorporados da main
e apresenta diagnósticos nesses conteúdos; eles não foram corrigidos nesta frente.
O controle pertinente ao residual usa MERGE_HEAD como baseline, sem confundir os deltas.

Regressões futuras individualizadas: apps/api/src/tests/workspace-agent-assignments.fail-closed.test.ts,
apps/api/src/tests/workspace-agent-provisioning.test.ts e apps/api/src/tests/run-worker-error-boundary.test.ts,
além de F-caller-regression.test.ts já incluído no comando de banco. Executar por node --import tsx
--test, com timeout 60s e configuração da suíte correspondente; não executar agora.
Controles de registro: timeout 60s node --import tsx --test scripts/tests/unitSuiteInventory.test.ts;
ORPHAN_TESTS_COMPARE_REF=88c1fff5c69614f47f171b8cddfb0360765a3366 timeout 60s node --import tsx scripts/checkOrphanTests.ts (sem alterar thresholds);
checks documentais e Front Door nativos, após a preparação autorizada. Não executar agora.
