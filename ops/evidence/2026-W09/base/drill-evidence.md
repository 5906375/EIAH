# Runbook Drill Evidence

- data/hora: 2026-09-26T08:26:17Z (início) — 2026-09-26T08:29:38Z (fim)
- runbook exercitado: `docs/ops/runbooks/imob-worker-observability.md` (escolhido por ser infraestrutura interna — BullMQ/Redis/worker — exercitável de verdade neste ambiente sem depender de provedor externo, ao contrário dos runbooks de billing/settlement/WhatsApp)
- cenário simulado: investigação real da regra IMOB-W-007 (Queue Stall) seguida da execução das três suítes de regressão documentadas na seção "Queries seguras" do próprio runbook (`test:imob-worker:e2e`, `test:imob-worker:metrics`, `test:imob-worker:alerts`), contra o Redis (`eiah-redis`, porta 6379) e Postgres (`eiah-postgres`, porta 5433) de dev já em execução
- passos executados:
  1. `redis-cli -u redis://127.0.0.1:6379/0 ping` no host — falhou (`redis-cli: command not found`); repetido via `docker exec eiah-redis redis-cli ping` → `PONG`
  2. `docker exec eiah-redis redis-cli LLEN "bull:imob-run-completed:wait"` → `0` (chave inexistente, tipo `none`)
  3. `docker exec eiah-redis redis-cli LLEN "bull:imob-run-completed:failed"` → erro real `WRONGTYPE Operation against a key holding the wrong kind of value`
  4. Diagnóstico: `TYPE "bull:imob-run-completed:failed"` → `zset`; comando correto é `ZCARD`, que retornou `30`
  5. Inspeção dos IDs de job no zset (`ZRANGE ... WITHSCORES`) e do campo `failedReason` de uma amostra — confirmado que os IDs correspondem a identificadores sintéticos de tenant/workspace de execuções de teste anteriores (não dados reais de produção); não removidos, só documentados (fora do escopo desta tarefa alterar estado de fila compartilhado)
  6. `pnpm test:imob-worker:e2e` — falhou na primeira tentativa (`Authentication failed against the database server`); causa real: o script não carrega `packages/db/.env`, diferente de scripts irmãos (`test:pre-duimp-governed-case-foundation:integration` etc.), então usa a senha padrão hardcoded do teste, que não bate com a senha real do container. Repetido com `node --env-file-if-exists=packages/db/.env --import tsx --test --test-force-exit apps/api/src/tests/imob-post-run-mutation-e2e.test.ts` → 9/9 passou
  7. `pnpm test:imob-worker:metrics` → 10/14 passou, 4 falhas reais (não corrigidas — fora do escopo desta tarefa)
  8. `pnpm test:imob-worker:alerts` → 21/21 passou
- resultado: parcial — a cadeia Run→Worker→ImobCase está genuinamente saudável (e2e 9/9, alerts 21/21), mas a suíte de métricas revelou uma falha real: 4 combinações específicas de contador (`imob_post_run_mutations_applied_total{actionId="owner.register",...}`, `{actionId="commission.settle",terminal="true"}`, `imob_post_run_skips_total{reason="already_processed"}`, `{reason="receipt_required_no_tx_id"}`) retornam `undefined` em vez do valor incrementado esperado — indica um gap real de instrumentação/observabilidade nesses caminhos específicos do worker (`apps/api/src/tests/imob-worker-metrics.test.ts`), não investigado a fundo por estar fora do escopo desta tarefa (que é gerar evidência de drill, não corrigir o worker)
- tempo até resolução: não aplicável — a falha de métricas não foi corrigida nesta sessão, apenas documentada para follow-up
- lições aprendidas:
  1. `redis-cli` não está instalado no ambiente do host/operador — o runbook deveria mencionar o fallback via `docker exec <container> redis-cli` para quem opera fora do container
  2. O comando `LLEN` documentado no runbook para a fila `failed` está tecnicamente incorreto para a versão do BullMQ em uso — a fila `failed` é um `zset`, não uma `list`; o comando correto é `ZCARD`. O runbook deveria ser corrigido
  3. A fila `failed` real acumulou 30 entradas de execuções de teste antigas neste ambiente de dev de longa duração (2 meses), todas com identificadores sintéticos — isso é um falso-positivo latente para a regra IMOB-W-001 se alguém rodar esse comando sem investigar a origem; o runbook não documenta esse risco de acúmulo em ambientes de dev/CI compartilhados
  4. O script `pnpm test:imob-worker:e2e` não carrega `packages/db/.env` (diferente de scripts irmãos do mesmo package.json), então falha por credencial errada quando rodado exatamente como documentado — achado real, não copiado de execução anterior
  5. A suíte `test:imob-worker:metrics` revelou uma falha real e não trivial (4/14) que merece investigação própria, fora do escopo deste drill
- executado por: Claude Sonnet 5 (agente), sessão de consultoria; ratificação humana pendente antes do commit ser enviado
- evidência bruta: saída completa dos comandos acima capturada na sessão de terminal desta consultoria; não anexada como arquivo separado
