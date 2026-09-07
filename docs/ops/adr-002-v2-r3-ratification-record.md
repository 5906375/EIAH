# ADR-002 v2-r3 — Registro da versão e decisão arquitetural

## 1. Objeto exato submetido

| Campo | Valor |
|---|---|
| Documento | [ADR-002 — Inteligência Coletiva Governada](../adr/ADR-002-governed-collective-intelligence.md) |
| Versão | v2-r3 |
| SHA-256 dos bytes UTF-8/LF do ADR | `13f6c01d3fb5fc739d0cc1b2a844a302a2bd7cbcdc1810f746109c20885e4431` |
| Base documental verificada | `11805d1934573281e2787c2442b546c172b76947` |
| Branch de publicação | `docs/adr-002-v2-r3` |
| Destino proposto | `main` |
| Autoridade humana designada | Carlos Alberto Merlo |
| Ratificação arquitetural desta versão | **RATIFICADA — manifestação explícita registrada em 2026-09-07** |
| Liberação de piloto | **NÃO CONCEDIDA** |

O hash identifica o conteúdo; não é assinatura. A v2-r2 permanece histórica no workspace de preparação, identificada pelo SHA-256 `ae24ce8a651d60d721b7d8bc1a86056998ceadd2a7c1c9a8ad7c7692c505f161`.

## 2. O que foi autorizado nesta tarefa

O usuário pediu para seguir com a preparação da v2-r3, o registro vinculado à versão e a publicação por branch e PR apenas documentais. Isso autoriza preparar e apresentar o pacote. A mensagem não foi convertida em ratificação de uma versão que ainda estava sendo produzida.

Origem do pedido: tarefa Codex `01a07130-0da0-74c1-a844-404a96644538`, em 2026-09-05. Não há assinatura humana gerada pelo agente. O autor técnico do commit não representa a autoridade ratificadora.

## 3. Decisão AUTHZ-RUNS já recebida

A [matriz AUTHZ-RUNS](authz-runs-scope-matrix.md) registra as escolhas de vocabulário e scopes que o documento apresentado pelo usuário declara ratificadas. A ADR passa a referenciar essa decisão, preservando implementação e reconciliação técnica pendentes.

O estado dessa matriz não é transferido automaticamente à ratificação arquitetural da ADR nem à liberação do piloto.

## 4. Manifestação humana recebida

| Campo | Registro |
|---|---|
| Decisão sobre o ADR identificado acima | **RATIFICAR A ARQUITETURA v2-r3** |
| Manifestação literal recebida | “Ratifico a arquitetura v2-r3” |
| Autoridade designada no conteúdo avaliado | Carlos Alberto Merlo, função de ratificação arquitetural definida na seção 14 do ADR |
| Finalidade apresentada ao usuário | Ratificar a arquitetura do conteúdo exato publicado no PR #441, sem liberar o piloto |
| Referência da manifestação | Resposta do usuário nesta tarefa Codex `01a07130-0da0-74c1-a844-404a96644538`, ao item `request_user_input_async / call_8UhZvlWwZrXjK2izFUu10GhW / 0` |
| Data da manifestação | 2026-09-07; horário exato de envio não fornecido pela mensagem |
| Horário de referência para este registro | 2026-09-07 09:56:00 UTC (06:56:00 America/Sao_Paulo), consultado pelo agente após receber a resposta |
| Justificativa adicional do ratificador | Não fornecida na resposta; não inferida pelo agente |
| Referência da política de autoridade | ADR-002 v2-r3, seção 14, identificada pelo SHA-256 da seção 1 desta ficha; não foi fornecido identificador de registro externo |
| Proveniência da identidade | Mensagem recebida do usuário da tarefa; não foi realizada verificação externa da identidade civil nem produzida assinatura criptográfica humana |

Pergunta à qual a resposta se vincula:

> Você ratifica arquiteturalmente o ADR-002 v2-r3 publicado no PR #441 (https://github.com/5906375/EIAH/pull/441), identificado pelo SHA-256 13f6c01d3fb5fc739d0cc1b2a844a302a2bd7cbcdc1810f746109c20885e4431? O próprio ADR exige essa decisão humana vinculada à versão; a liberação do piloto continua sendo uma decisão separada.

O conteúdo do ADR permanece congelado nos bytes submetidos à decisão. Seus campos “PROPOSTA” e “PENDENTE” retratam a submissão anterior à manifestação; **esta ficha registra o estado posterior da decisão sobre aquele conteúdo exato**. Alterar esses campos dentro do ADR mudaria o digest aprovado. Uma futura consolidação editorial deverá receber nova identificação e preservar este vínculo histórico.

A manifestação explícita de ratificação está registrada. A seção 14 do ADR prevê justificativa e identidade autenticada: a justificativa adicional e a comprovação externa de identidade não foram fornecidas nesta resposta e permanecem lacunas de completude do registro, sem fabricação de metadados. A ficha não comprova aprovação técnica de implementação ou operação.

Não deduzir aprovação da autoria do commit, abertura do PR, CI verde ou merge. Qualquer alteração posterior no conteúdo do ADR exige nova identificação da versão e avaliação do vínculo da decisão.

## 5. Escopo e verificação da publicação

Mudança documental ligada a F5.2 (políticas e aprovação humana) e à proposta coletiva. Nenhum commit estrutural é integrado, nenhum grant é criado e nenhuma alteração de runtime faz parte deste PR.

As verificações reais do pacote são registradas em [validação documental](../../ops/evidence/latest/adr-002-v2-r3-docs-validation-2026-09-05.md). Esse resultado prova somente verificações documentais realizadas; não prova testes de autorização, worker ou piloto.
