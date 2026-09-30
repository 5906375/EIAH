# Persistência de transições de Run e publicação durável — contrato proposto

Status: **proposta técnica com implementação local parcial** (desde #458): existem o adaptador
`apps/api/src/services/p1RunTransitionPersistence.ts`, as migrations
`packages/db/prisma/migrations/20260929170000_p1_run_transition_storage/` e
`packages/db/prisma/migrations/20260929180000_p1_transition_immutability/` e o teste
`packages/db/src/p1RunTransitionPersistence.integration.test.ts`, configurado no CI. Não há wiring
dos writers operacionais, aplicação das migrations em produção nem execução operacional.
Complementa `p1-run-transition-writer-inventory.draft.md` e `scripts/lib/p1AtomicRunTransition.ts`;
não substitui decisões da ADR-009.

## Transação local ao banco

Uma transação de escrita para uma run existente deve:

1. localizar e bloquear a run por `(id, tenant_id, workspace_id)`, rejeitando
   ausência ou divergência de escopo; localizar `command_id` antes de mutar;
2. conferir estado e `finished_at` atuais com a última transição versionada
   e com a versão esperada; runs sem evento inicial ficam bloqueadas;
3. avançar a sequência exatamente em uma unidade e atualizar estado,
   `finished_at` e evento de transição na mesma transação;
4. quando houver publicação, inserir na mesma transação uma intenção de
   outbox imutavelmente vinculada ao comando, à run e ao payload; commit
   apenas se todas as escritas ocorrerem; conflito de unicidade falha fechado
   ou retorna o mesmo comando íntegro, jamais um comando diferente;
5. não publicar no Redis/BullMQ dentro da transação. Um despachante lê a
   outbox **após** commit e publica com ID estável; falha de transporte deixa
   a intenção pendente para retry. Confirmação pode falhar após publicação,
   portanto consumidor e despachante precisam de deduplicação durável.

A criação da run exige evento inicial `sequence=0` atômico à criação.
Transições de replay não podem publicar job antes de persistir `pending`;
worker não pode prosseguir se a transição falhar. Estados terminais exigem
`finishedAt` coerente, incluindo o caminho legado que hoje o omite.

## Estrutura mínima a revisar antes da migration

| Registro | Campos/restrições propostas |
| --- | --- |
| `run_state_transitions` | ID estável; tenant/workspace/run; command ID; schema version; `sequence` inteiro não negativo; status e `finished_at` anteriores/novos; produtor e referência de operação; payload/digest de comando; `UNIQUE(run_id, sequence)` e `UNIQUE(command_id)`; FK e escopo coerente com a run. Sem `UPDATE`/`DELETE` operacional. |
| `run_publish_outbox` | intent ID e command ID únicos; tenant/workspace/run; destino; referência ou payload durável suficiente para reenvio; estado, tentativas e marcador de publicação; vínculo FK com transição. Payload não deve depender de objeto transitório em memória. |
| `runs` | Considerar versão de estado por run ou usar lock explícito + última sequência. Toda mudança de `status`/`finished_at` precisa passar pela operação transacional. Um índice, trigger ou permissão DB pode ser necessário para impedir caminhos diretos não instrumentados; proposta depende de revisão de todos os escritores. |

O contrato TypeScript atual usa `committedAt` informado pelo chamador.
Esse campo **não é prova de hora ou ordem de commit**. Uma sequência por run
ordena transições daquela run, mas não ordena commits de runs diferentes
nem prova quais commits estavam visíveis em C. Antes de certificar estado no
cutoff histórico, definir e testar um marcador de visibilidade da fonte e
watermark independente. Não atribuir `verified` a partir de timestamp de
aplicação, `now()` na transação ou digest autodeclarado.

## Ensaios necessários

- Rollback da atualização da run se evento ou outbox falhar.
- Duas transições concorrentes sobre a mesma sequência: exatamente uma
  persiste, e a outra recebe conflito verificável.
- Mesmo comando após timeout: idempotência sem nova sequência ou intenção;
  mesmo ID com payload alterado falha.
- Queda após commit, antes de publicar; queda após publicar, antes do ack;
  retry sem execução duplicada.
- `pending` de replay não sobrepõe `success`/`error` de job já iniciado.
- Tenant/workspace inválido, run sem evento inicial, escritor legado e
  caminhos de manutenção falham fechados até cobertura completa.
- Migração comparada ao schema Prisma e testada em PostgreSQL efêmero antes
  de qualquer integração; sem dados operacionais neste incremento.

A futura migration deve ser preparada a partir do diretório de migrations
atual e das convenções reais do pacote `@repo/db`, ainda não incluídos no
recorte desta revisão. Este rascunho não autoriza aplicação automática em
banco. `stateAtCutoffVerification=not_demonstrated` e elegibilidade bloqueada.
