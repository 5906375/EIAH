# PR-API-ERRORS-01 — tratamento global de erro na API (2026-07-07)

## Objetivo

Implementar o DoD triado de N-13 (D17 ratificado): `apps/api/src/index.ts` não tinha middleware
de erro 4-arg, nem `process.on("unhandledRejection"|"uncaughtException")`, nem wrapper
`asyncHandler`, e ~90% dos handlers de rota amostrados na triagem não tinham `try/catch` — a mesma
classe de bug que causou o crash real do N-10 (`await Promise.all(...).filter is not a function`
em `blocked-runs`, sem middleware de erro para conter a rejeição). Base: `main` (0b421ce), sem
dependência dos gates de entitlement.

## Implementação

**1. `apps/api/src/middlewares/asyncHandler.ts`** (novo) — `asyncHandler(handler)` envolve um
`RequestHandler` em `Promise.resolve(handler(...)).catch(next)`. `createGovernedRouter()` retorna
um `express.Router()` com `.get/.post/.put/.patch/.delete` interceptados para aplicar
`asyncHandler` automaticamente a todo handler registrado — **sem exigir alteração em cada uma das
chamadas individuais `router.METHOD(...)`** nos arquivos de rota.

**Abordagem escolhida para o wrapper**: centralizado na criação do router, não por handler.
Trocar `Router()` por `createGovernedRouter()` no ponto de criação de cada router é suficiente
para cobrir todos os handlers registrados nele — incluindo os registrados por um módulo separado
que recebe o router como parâmetro. Constatado que `imobCrmRouter.ts` (33 handlers, um dos 8
arquivos amostrados na triagem) não cria seu próprio router — `registerImobCrmRoutes({ router:
imobRouter, ... })` registra seus handlers diretamente no `imobRouter` criado em `imob.ts`. Logo,
**1 alteração em `imob.ts` cobre 2 dos 8 arquivos amostrados** (imob.ts: 38 handlers +
imobCrmRouter.ts: 33 handlers = 71 handlers). Total: 7 pontos de criação de router alterados
(`imob.ts`, `billing.ts`, `runs.ts`, `help.ts`, `marketplace.ts`, `delegations.ts`, `auth.ts`),
cobrindo os 8 arquivos amostrados na triagem de N-13 com o menor diff possível (1 linha de import
+ 1 linha de troca de `Router()` por `createGovernedRouter()` por arquivo).

**2. `apps/api/src/middlewares/governedErrorHandler.ts`** (novo) — middleware de erro 4-arg,
extraído em módulo próprio (não inline em `index.ts`) para ser testável isoladamente sem precisar
subir o app real (evita que o teste do DoD dependa de Postgres/Redis). Comportamento: se
`res.headersSent`, delega para `next(err)` (nunca reclassifica uma resposta já enviada); senão,
loga estruturado via `createLogger` (import do subpath `@eiah/core/logging/logger`, não do barrel
`@eiah/core` — o barrel bundla módulos que tocam `@repo/db` e exigiriam `DATABASE_URL` só para
logar, o mesmo tipo de gap transitivo documentado na Fase A desta sessão) e responde
`{ ok: false, reasonCode: "INTERNAL_ERROR" }` com status 500, sem stack no corpo.

**3. `apps/api/src/index.ts`** — `app.use(governedErrorHandler)` registrado como último middleware,
após todos os routers. `process.on("unhandledRejection", ...)`: loga e mantém o processo (uma
rejeição isolada fora do ciclo de requisição não implica estado corrompido; as rejeições de rota
já são capturadas por `asyncHandler` antes de chegarem aqui). `process.on("uncaughtException",
...)`: loga e `process.exit(1)` — o processo pode estar em estado inconsistente após uma exceção
síncrona não tratada; mesma filosofia de "deixar o supervisor (systemd/pm2/k8s) reiniciar" já usada
no shutdown gracioso via `process.once(SIGINT/SIGTERM)` existente (não alterado). Simplificação
registrada: o `uncaughtException` handler não tenta liberar a lease de worker ownership antes de
sair (o `SIGINT/SIGTERM` handler existente faz isso, mas exigiria expor a lease/redis do IIFE de
bootstrap para um handler global — fora do escopo mínimo deste DoD).

## Testes (DoD)

`apps/api/src/tests/api-global-error-handling.test.ts` (novo, 3 testes, app Express mínimo criado
no próprio teste com `createGovernedRouter`/`governedErrorHandler` — não sobe o app real, não
precisa de Postgres/Redis):

```
ok 1 - rejected promise in a route handler returns a governed 500 without leaking the stack
ok 2 - N-10 regression: an uncaught async rejection resolves the request instead of hanging or crashing the process
ok 3 - governed 4xx responses from existing gates are not reclassified as 500
# pass 3 / fail 0
```

- Teste 1: rota que lança `Error` síncrono dentro de um handler `async`; confirma 500,
  `{ok:false, reasonCode:"INTERNAL_ERROR"}` exato, e que o corpo da resposta não contém a mensagem
  do erro nem `stack` nem linha de stack trace (`.ts:`).
- Teste 2 (padrão N-10): rota cuja Promise rejeita após um `setTimeout` (rejeição genuinamente
  assíncrona, não um `throw` síncrono); corrida contra um timeout de 2s prova que a requisição
  **não pendura** — resolve com 500 governado. Como o teste inteiro roda sem crash do processo
  Node, isso também prova que a rejeição não vira `unhandledRejection` fatal.
- Teste 3: confirma que uma resposta 403 já enviada explicitamente pelo handler (mesmo formato do
  gate de entitlement, `{ok:false, error:{reasonCode:...}}`) **não é reclassificada** como 500 pelo
  middleware de erro — condição de fail-closed preservada.

Amarração: os 3 testes rodam sem Postgres/Redis (Grupo B por classificação D14/Fase A desta
sessão) — candidatos naturais ao job `ci_unit_suite` de `PR-CI-02`, quando as branches forem
integradas (não amarrados fisicamente nesta PR porque `pr-ci-unit-suite` é uma branch irmã,
divergente de `main` nesta sessão, conforme as pré-condições).

## Não-regressão dos reason codes existentes

**Ressalva de honestidade**: os arquivos de teste dedicados de GATE-01/GATE-02
(`imob-lead-intake-entitlement-gate.contract.test.ts`,
`imob-crm-endpoints-entitlement-gate.contract.test.ts`) **não existem em `main`** — foram criados
em `pr-imob-gate-01`/`pr-imob-gate-02`, branches não mescladas, e a base desta Fase B é `main`
por instrução explícita da sessão ("Fase B parte de main, não depende dos gates"). Não é possível
rodá-los aqui sem misturar branches fora do escopo desta PR.

Verificação real feita com o que **existe em `main`**, contra os 7 routers alterados:

```
imob.knowledge.search.contract.test.ts (via imobRouter, inclui assercao de 403)  pass:3/fail:0
billing.economy.contract.test.ts (via billingRouter)                             pass:3/fail:0
billing.reconciliation.contract.test.ts (via billingRouter)                      pass:3/fail:0
billing.webhook-signature.test.ts (via billingRouter, F-06)                      pass:11/fail:0
runs.imob-action.contract.test.ts (via runsRouter)                               pass:1/fail:0
marketplace.installations.activate.test.ts (via marketplaceRouter)              pass:3/fail:0
workspace.memberships.contract.test.ts (via authRouter)                         pass:5/fail:2
ledger-bundle.contract.test.ts (via runsRouter)                                 pass:0/fail:8
```

As 2 falhas de `workspace.memberships.contract.test.ts` e as 8 de `ledger-bundle.contract.test.ts`
foram confirmadas **pré-existentes em `main` sem nenhuma das minhas alterações** — via `git stash`
(mesma técnica usada em sessões anteriores), rodei os mesmos dois arquivos contra o `main` original
e obtive exatamente os mesmos números (`5/2` e `0/8`). Não são regressão de `createGovernedRouter`.

Suíte ampla de continuidade de lead (`imob-crm-dedupe`, `imob-crm-turn-continuity`,
`imob-crm-turn-engine`, `imob-turn-resolver`): `pass:147/fail:0`, sem regressão.

`imob.knowledge.search.contract.test.ts` prova especificamente que a asserção de 403 (linha 143 do
arquivo) continua idêntica com `imobRouter` envolvido por `createGovernedRouter()` — o handler que
retorna 403 explicitamente não é afetado pelo wrapper (`asyncHandler` só intercepta rejeições, não
altera respostas resolvidas normalmente).

## Evidência

Este arquivo + entrada em `docs/EVIDENCE_INDEX.md` + `check:evidence-index`.

## O que ficou de fora

- Verificação direta contra as suítes de GATE-01/GATE-02 (não existem em `main`; documentado acima
  como limitação da base escolhida, não como falha).
- Liberação da lease de worker ownership no handler de `uncaughtException` (simplificação
  registrada, ver seção de implementação).
- Wiring dos 3 novos testes num job de CI real (branch irmã `pr-ci-unit-suite` diverge de `main`
  nesta sessão; ficam prontos para a próxima integração).
- Aplicação de `asyncHandler` a routers além dos 8 arquivos amostrados na triagem original de N-13
  (outros ~24 arquivos de `routes/**` não amostrados permanecem sem o wrapper).

## Status

- Middleware de erro + process handlers + asyncHandler: **evidenciado** (código real, testes reais
  passando, sem stack leak confirmado).
- Não-regressão de reason codes existentes: **evidenciado para o que existe em `main`** (7
  routers, 8 arquivos de teste HTTP reais, 2 falhas pré-existentes confirmadas via stash) /
  **parcial para GATE-01/02 especificamente** (testes não existem nesta base, não verificado
  diretamente).
