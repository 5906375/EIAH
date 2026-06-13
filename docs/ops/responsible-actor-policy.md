# Responsible Actor Policy

## Objetivo

Definir a política canônica de atribuição de responsável por entidade, preservando compatibilidade com o IMOB atual e preparando a futura generalização multi-vertical.

Escopo desta versão:

- política de atribuição
- compatibilidade com `ownerResponsible`
- lifecycle de `policyVersion`
- sem schema novo
- sem enforcement novo de runtime nesta rodada

## Princípios

- responsabilidade operacional deve ser explícita
- responsabilidade não deve nascer de fallback implícito de UI
- atribuição histórica não deve ser reescrita automaticamente
- policy nova não invalida retroativamente evidência já produzida
- o enforcement precisa ser audível

## Estado atual

Hoje:

- IMOB usa `ownerResponsible` em `ImobCase`
- `ImobCaseEvent` registra `actorType` e `actorRef`
- não existe `ResponsibleActorPolicy` como model Prisma
- não existe `policyVersion` persistida com a atribuição
- membership/roles vivem parcialmente em store operacional via `workspaceResponsibility.ts`

Decisão desta versão:

- `ownerResponsible` continua sendo o alias operacional do IMOB
- `responsibleActor` permanece conceito canônico futuro
- nenhuma migração de nomenclatura acontece nesta fase

## Modelo conceitual

Conceitos:

- `responsibleActor`: entidade canônica futura de responsabilidade
- `ownerResponsible`: alias compatível do IMOB para `imob.case`
- `policyVersion`: versão da policy em vigor no momento da atribuição

Regra desta fase:

- o sistema pode continuar gravando `ownerResponsible`
- a documentação passa a tratá-lo como compat layer de um futuro `responsibleActor`

## Regras de atribuição

### Regra 1 — atribuição explícita

- atribuição sensível deve ocorrer por mutation explícita
- fallback visual ou contextual não vira persistência automática

### Regra 2 — não sobrescrita silenciosa

- responsável existente não deve ser trocado sem regra explícita de policy
- overwrite manual precisa ser governado

### Regra 3 — transição terminal exige responsável

- entidade operacional sensível não pode chegar a estado terminal sem responsável exigido pela policy vigente
- no IMOB atual, isso já vale para `ImobCase`

### Regra 4 — histórico preservado

- atribuições já realizadas continuam válidas no contexto em que ocorreram
- mudança de policy não reescreve automaticamente registros antigos

## Lifecycle de `policyVersion`

### Nesta fase

- `policyVersion` ainda não existe em schema
- a policy é documental

### Regra futura

Quando `policyVersion` existir:

- cada atribuição sensível deve carregar a versão da policy vigente no momento da gravação
- a leitura histórica deve considerar a versão registrada, não a policy mais recente

## Efeito de mudança de policy

Mudanças futuras de policy:

- não revalidam automaticamente todos os registros antigos
- não removem responsável já persistido sem processo governado
- não mudam evidência histórica de forma retroativa

Nova policy deve afetar:

- novas atribuições
- reatribuições explícitas
- ações sensíveis definidas pela governança

## Revalidação

Revalidação só deve ocorrer em três situações:

1. nova atribuição manual
2. reatribuição explícita
3. migration governada com evidência e plano de impacto

Não revalidar:

- leitura simples de caso
- renderização de dashboard
- export de histórico já consolidado

## Compatibilidade com IMOB

Nesta fase:

- `ownerResponsible` permanece campo ativo do IMOB
- `CASE_RESPONSIBLE_REQUIRED` continua o gate de fail-closed
- `assignOwnerToCase()` / `assignResponsibleActor()` continuam o caminho válido de atribuição

Regra:

- a futura generalização não pode quebrar a Trilha A já fechada
- qualquer mudança precisa manter compat layer clara para o IMOB

## Compatibilidade multi-vertical

Conceito esperado para fase posterior:

- a policy de responsável deve ser definida por:
  - vertical
  - entity type
  - role elegível
  - status de entitlement

Exemplos:

- `imob.case`
- `legal.document`
- `legal.opinion`
- `finance.invoice`

## Relação com roles e membership

Nesta fase:

- roles e memberships ainda não são models Prisma canônicos
- existem estruturas operacionais em `workspaceResponsibility.ts`

Decisão:

- policy de responsável não deve assumir ainda model definitivo de membership
- primeiro documentar e auditar
- depois escolher entre formalizar os stores atuais ou criar models novos

## Requisitos mínimos para fase de modelagem

Qualquer model futuro de policy deve responder:

1. quem pode ser responsável por qual `entityType`
2. se a vertical está habilitada
3. se o contexto financeiro permite a operação
4. qual `policyVersion` foi usada
5. como reatribuição é auditada

## Fonte de verdade nesta fase

Enquanto não houver model novo:

- a política canônica está neste documento
- o enforcement atual do IMOB continua no runtime já entregue
- o schema futuro deve seguir este documento, não o contrário

## Decisões desta versão

- `ownerResponsible` continua como alias operacional do IMOB
- `responsibleActor` segue como conceito futuro, ainda não modelado
- `policyVersion` será regra obrigatória apenas quando a modelagem for aberta
- revalidação automática de histórico está explicitamente proibida
- nenhuma migration ou mudança de runtime nasce desta fase documental
