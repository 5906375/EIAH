# Avaliação gratuita da vertical (IMOB) — contrato e operação

Estende a liberação de verticais pela EIAH (ADR-011, `docs/ops/vertical-access-approval.md`). **Oferta desligada por padrão e sem
concessão real**: nenhuma decisão comercial foi ratificada por esta implementação. Este documento descreve o que o código faz; não
é evidência de execução e não está no Evidence Index.

## Cinco conceitos distintos

| Conceito | Representação | Libera uso? |
| --- | --- | --- |
| Pedido | `aguardando_humano` + `request_context` (qualificação confirmada pela pessoa) | Não |
| Aprovação humana das condições | `pre_ativacao` + `grant_terms` (+ hash). O aprovador **propõe** termos | Não |
| Aceite da versão vigente | `grant_accepted_*` com o hash dos termos; só o solicitante | Não |
| Ativação efetiva | única transição `pre_ativacao → aprovado`: grava `grant_started_at` e `grant_valid_until` | Começa aqui |
| Uso | derivado: `aprovado` com grant íntegro e dentro da validade (leitura efetiva) | — |

Fim regular: `encerrado` (validade vencida ou termos inconsistentes), com o modo dos termos (`somente_leitura` ou `bloqueio_total`;
inconsistência ⇒ bloqueio total). **Não é revogação**: o score só conta eventos `revogado`. Recusa do aceite: `recusado`.

Pedido recusado, em análise, pendente, com termos propostos ou aceitos: o uso **nunca** é `full` (`resolveVerticalUsage`). Linhas sem
`grant_kind` mantêm exatamente o comportamento legado.

## Onde cada coisa vive

- Contrato puro (sem banco): `apps/api/src/services/products/verticalEvaluationContract.ts` (termos, hash, oferta, decisões
  obrigatórias, acesso efetivo, uso, policies, gate).
- Planejadores puros das transições: `verticalEvaluationPlans.ts`.
- Aplicação (transação, `FOR UPDATE`, UPDATE condicional, evento, aviso): `verticalEvaluation.ts`, `verticalAccessApproval.ts`,
  `productActivation.ts`.
- Operações reais usam sempre `PRODUCTION_EVALUATION_DEPS` (decisões obrigatórias reais). As funções `…Core` recebem dependências
  explícitas e existem só para a composição de testes; nenhuma rota as usa (guarda estática em
  `vertical-evaluation-guards.test.ts`).
- Persistência: colunas aditivas nulas em `vertical_access_approvals` e `detail` nos eventos
  (`packages/db/prisma/migrations/20261113120000_vertical_access_evaluation_grant_v1`, espelhada em `ensureVerticalAccessStore`).
  Migration **preparada, não executada**.
- Intake: `services/frontDoorIntake.ts` (`interpretEvaluationTurn`) e `routes/frontDoorIntake.ts`
  (`POST /front-door/intake/evaluation`): o provider só interpreta; o servidor valida e compõe a resposta.
- Front Door (engine): `verticalEvaluationEngine.ts` + `verticalActivationEngine.ts`. Aprovador: `/app/admin/aprovacoes`.

## Proteção do uso (só atua com grant de avaliação)

| Caminho | Como |
| --- | --- |
| `/api/imob/*`, uploads (leitura), registry, handoff | `readVerticalAccess`/`readVerticalUsage` devolvem o acesso **efetivo** (validade verificada na leitura, sem depender de scheduler) |
| Envio de upload (escrita) | exige grant ativo e válido |
| Agent Protocol (`realestate.*`) | `filterActionsByEvaluationGate` em `agents.ts` |
| Execução de runs enfileirados | `runWorker`: lista de actions e decisão por action |
| Efeito diferido (worker pós-run) | reconfere o grant antes de qualquer escrita (intake e mutação de caso) |
| Leitores de `status = 'aprovado'` | `pre_ativacao` e `encerrado` não casam: negam por padrão |

**Não coberto (decisão pendente):** leituras de governance (`/governance/imob/cases/:caseId/evidence`) e bundle de run continuam
legíveis após o término; a revogação legada continua sem alcançar Agent Protocol, worker e uploads (fora deste incremento).

## Bloqueios para habilitar a oferta (código, não configuração)

`EVALUATION_MANDATORY_DECISIONS` lista as decisões humanas ainda **não ratificadas**: elegibilidade, autoridade do aprovador em
produção, encerramento e dados após o término, renovação/repetição, **política de consumo**, **definição e enforcement de vagas de
usuário**, visibilidade do contexto do pedido ao administrador (emenda do ADR-011 §2.3) e texto/limites da configuração. Enquanto
qualquer uma estiver `pending`, `resolveEvaluationOfferState` nunca devolve `enabled`, mesmo com `EIAH_VERTICAL_EVALUATION_ENABLED=true`
e configuração válida (`EIAH_VERTICAL_EVALUATION_CONFIG`). Não há setter, variável ou parâmetro público que as ratifique.

- **Consumo:** não há limite próprio da avaliação. A estrutura existente (cota de workspace/tenant, guard só em criação de run, modo
  `shadow` por padrão) não mede por vertical; a avaliação sem limite próprio não foi autorizada; medição por vertical não foi
  implementada. Os termos **não têm campo de consumo** e o texto das condições não pode prometê-lo.
- **Usuários:** os termos não têm `maxUsers`. "Vaga" = usuário autorizado no IMOB (não membro do workspace) ainda não foi definida nem
  aplicada; nenhum limite foi imposto ao workspace.

## Validação (em camadas; só a última é integração real, executada apenas localmente)

| Camada | O que prova | Onde roda |
| --- | --- | --- |
| Pura (contrato, planejadores, guardas estáticas, engine web, intake com provider falso) | regras, transições, textos, ordem do código; despacho e tratamento do provider falso | `test:ci-unit-suite` |
| Serviço com dublê injetado (prisma em memória, relógio controlado) | ordem trava → releitura → UPDATE condicional → escrita, ausência de escrita quando bloqueado | `test:assignment-fail-closed` (precisa de `@repo/db` construído) |
| Gate do worker pós-run | efeito diferido não muta depois do fim | `test:evaluation-worker-gate` (sem `--test-force-exit`: a fila IMOB é criada no primeiro uso, não na importação) |
| Integração real (Prisma → PostgreSQL real, rotas autenticadas, concorrência com sessões independentes) | ciclo completo com relógio controlado, atomicidade, datas/`::timestamp` em 3 fusos, oferta de produção desligada, legado preservado, 5 cenários de concorrência | `test:vertical-evaluation:integration` (passo no job de integração do CI; **não executado no CI**, só em infraestrutura descartável local) |

**Execução descartável em PGlite:** anterior à integração real; o SQL, a migration e o DDL de runtime também foram executados num Postgres
embarcado em memória (PGlite). Não substitui a integração real abaixo e não é evidência indexável.

**Integração real (2026-11-14, infraestrutura descartável local):** PostgreSQL 16.16 + pgvector 0.8.0 e Redis 7.4.2 compilados e
iniciados em diretório exclusivo, portas e banco próprios; as 36 migrations foram aplicadas somente nesse banco (`prisma migrate
deploy`); a diferença entre `schema.prisma` e o banco migrado são 5 renomeações de constraint preexistentes, fora das tabelas da
avaliação. Os testes exigem `EIAH_DISPOSABLE_INFRA=1` além da guarda de nome de banco. Cenários de concorrência usam uma conexão
independente que retém o `FOR UPDATE` e só liberam cada operação depois de o servidor reportar o bloqueio no lock
(`pg_stat_activity`). Os logs ficam fora do repositório (diretório da tarefa); **não há evidência indexável** e o Evidence Index não
foi alterado.

**Primeiro pedido concorrente (corrigido):** o INSERT do primeiro pedido de um escopo (`tenant/workspace/vertical`) não tinha
`ON CONFLICT` desde antes desta feature, e os perdedores de uma disputa recebiam erro 23505. Agora o INSERT nomeia só o índice do
escopo (`ON CONFLICT (tenant_id, workspace_id, vertical) DO NOTHING`); quem perde relê a linha e responde pelo mesmo planejador
(`already_requested`, ou o resultado que corresponda ao estado real). Outras violações de unicidade (ex.: chave primária) continuam
propagando (teste dedicado). O efeito legado é restrito a trocar um erro de unicidade por uma resposta idempotente; o comportamento
sem disputa não muda.

**Não validado:** provider real (interpretação semântica de frases equivalentes), staging, CI do GitHub, Agent Protocol via HTTP, `runWorker` com fila Redis real. Passar nesses testes não autoriza habilitar a oferta.
