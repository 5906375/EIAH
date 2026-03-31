# Política Operacional de Billing da EIAH

## Objetivo

O controle financeiro da EIAH opera em duas trilhas complementares:

1. `Custos para Operação/Plataforma`
2. `Custos visíveis para o Usuário da Plataforma`

A primeira trilha existe para governança, auditoria, reconciliação e controle econômico da plataforma.
A segunda existe para dar transparência contextual de uso, sem mover lógica financeira para o frontend.

## Modelo operacional

### 1. Custos para Operação/Plataforma

Objetivo:
- dar controle financeiro e auditável para quem opera a plataforma

Telas foco:
- `Billing`
- `Runs`
- `Agentes`
- `Reconciliação`
- `Ledger`
- `Grants por workspace`

Essa trilha responde:
- quanto custa operar cada workspace
- qual agente está consumindo mais
- qual run gerou custo
- há divergência entre custo operacional e ledger
- houve cobrança duplicada

Base técnica:
- `RunUsageBreakdown` = custo operacional detalhado
- `BillingLedger` = razão financeira oficial
- `Run.costCents` = valor derivado
- `Reconciliação` = auditoria entre as camadas

### 2. Custos visíveis para o Usuário da Plataforma

Objetivo:
- mostrar custo de uso de forma clara para quem está executando tarefas

Telas foco:
- `Chat Agent Launcher`
- `Chat IMOB`
- `Marketplace`
- pontos contextuais de execução

Essa trilha responde:
- quanto custou essa execução
- quanto meu workspace já consumiu no mês
- estou perto do limite
- esse agente é caro ou barato de usar
- vale a pena rodar isso agora

Base técnica:
- consome custo já resolvido no backend
- não calcula custo novo na UI
- mostra custo real, estimado quando disponível, tokens, quota e contexto

## Responsabilidades por perfil

| Perfil | Tela principal | Uso principal |
|---|---|---|
| Founder | `Billing` | governança econômica |
| Financeiro | `Billing` | fechamento e reconciliação |
| Operação | `Runs` + `Billing` | investigação e controle |
| Usuário final | `Launcher` / `Chat IMOB` | transparência de uso |

## Tabela executiva

| Tema | Frequência | Dono | SLA | Ação obrigatória |
|---|---|---|---|---|
| Custo total da plataforma | semanal | Founder | até 5 dias úteis | revisar tendência de custo, workspaces dominantes e agentes dominantes |
| Custo por tenant/workspace | semanal | Operação | até 2 dias úteis | identificar workspaces fora do padrão e validar causa |
| Custo por agente | semanal | Operação | até 2 dias úteis | revisar agentes com maior custo e maior volume |
| Reconciliação geral | diária | Financeiro | até 1 dia útil | verificar `audit gaps`, `ledger gaps`, duplicidades e divergências |
| `missing_breakdown` | diária | Operação | até 1 dia útil | abrir o `runId`, confirmar ausência de breakdown e escalar correção |
| `missing_ledger` | diária | Financeiro | até 1 dia útil | confirmar breakdown existente e ausência de lançamento financeiro |
| `run_vs_breakdown_mismatch` | diária | Operação + Tech | até 1 dia útil | comparar run com soma do breakdown e registrar causa |
| `breakdown_vs_ledger_mismatch` | diária | Financeiro + Tech | até 1 dia útil | comparar breakdown com ledger e bloquear uso financeiro até ajuste |
| `duplicate_charge` | diária | Financeiro | até 4 horas úteis | validar duplicidade e impedir ajuste/cobrança incorreta |
| Adjustment manual no ledger | sob demanda | Financeiro | no mesmo dia útil | registrar motivo, workspace e contexto do ajuste |
| Quota alta / soft limit | diária | Operação | até 4 horas úteis | revisar consumo do workspace, agente dominante e necessidade de contenção |
| Hard limit atingido | imediato | Operação + Founder | até 1 hora útil | decidir contenção, redistribuição ou ajuste de limite |
| Grant por workspace | semanal | Operação | até 2 dias úteis | revisar workspaces habilitados, limites locais e consumo |
| Agente não habilitado no workspace | sob evento | Operação | até 4 horas úteis | corrigir grant/assignment; não contornar pela UI |
| Custo alto por run | sob evento | Operação | até 1 dia útil | abrir breakdown e validar provider/model/tokens |
| Custo alto por processo IMOB | semanal | Operação IMOB | até 2 dias úteis | revisar etapa mais custosa e fluxo responsável |
| Gate 403 IMOB | sob evento | Operação/Admin | até 4 horas úteis | validar `reasonCode`, `scope`, `traceId` e orientar correção pelo CTA |
| Transparência de custo no Launcher | contínua | Produto + Operação | revisão quinzenal | validar se custo, quota e status continuam claros |
| Transparência de custo no Chat IMOB | contínua | Produto + Operação IMOB | revisão quinzenal | validar leitura contextual de custo, quota e navegação |

## Definição de SLA

`SLA` é o tempo máximo esperado para reação e tratamento.

Não significa apenas responder. Significa:
- reconhecer o problema
- investigar
- tomar a ação mínima obrigatória

Leitura prática:
- `1 hora útil`: incidente relevante, reação imediata
- `4 horas úteis`: prioridade alta
- `1 dia útil`: precisa entrar no ciclo operacional do dia
- `2 a 5 dias úteis`: revisão gerencial e otimização

## Runbook operacional

### 1. Se acontecer `missing_breakdown`

- Abrir tela: `Billing > Reconciliação`
- Ver campo: `Issue = missing_breakdown`, `runId`
- Tomar ação:
  1. clicar no `runId`
  2. abrir `Runs`
  3. confirmar que o run existe
  4. validar ausência do breakdown
  5. registrar como gap operacional e escalar para correção

### 2. Se acontecer `missing_ledger`

- Abrir tela: `Billing > Reconciliação`
- Ver campo: `Issue = missing_ledger`, `runId`
- Tomar ação:
  1. abrir o `runId`
  2. confirmar que o breakdown existe
  3. confirmar ausência de lançamento no ledger
  4. tratar como gap financeiro
  5. escalar antes de fechar números do período

### 3. Se acontecer `run_vs_breakdown_mismatch`

- Abrir tela: `Billing > Reconciliação` e depois `Runs`
- Ver campo:
  - `Run`
  - `Breakdown`
  - `Issue = run_vs_breakdown_mismatch`
- Tomar ação:
  1. comparar custo do run com soma do breakdown
  2. identificar a diferença
  3. registrar causa
  4. acionar Tech se for erro de write path

### 4. Se acontecer `breakdown_vs_ledger_mismatch`

- Abrir tela: `Billing > Reconciliação` e `Billing > Ledger`
- Ver campo:
  - `Breakdown`
  - `Ledger`
  - `Issue = breakdown_vs_ledger_mismatch`
- Tomar ação:
  1. validar o lançamento financeiro
  2. bloquear uso desse número para fechamento
  3. corrigir antes de consolidar relatório financeiro

### 5. Se acontecer `duplicate_charge`

- Abrir tela: `Billing > Reconciliação` e `Billing > Ledger`
- Ver campo:
  - `duplicate charges`
  - `requestId`
  - `runId`
- Tomar ação:
  1. confirmar se é duplicidade real
  2. não aplicar adjustment cego
  3. tratar a duplicidade antes de cobrança ou fechamento

### 6. Se o workspace estiver perto do limite

- Abrir tela: `Billing`
- Ver campo:
  - `quota`
  - `workspace cost`
  - `runs`
  - `grants por workspace`
- Tomar ação:
  1. identificar o workspace dominante
  2. revisar o agente dominante
  3. decidir entre reduzir uso, redistribuir carga ou ajustar limite

### 7. Se o hard limit for atingido

- Abrir tela: `Billing`
- Ver campo:
  - `quota`
  - `hard limit`
  - consumo do workspace/tenant
- Tomar ação:
  1. tratar como prioridade imediata
  2. decidir contenção ou ajuste de capacidade
  3. envolver Founder se impactar política comercial ou operacional

### 8. Se um agente não estiver habilitado no workspace

- Abrir tela: `Billing > Grants por workspace`
- Ver campo:
  - workspace
  - agentes habilitados
  - grant/local limits
- Tomar ação:
  1. revisar grant
  2. revisar assignment
  3. corrigir no backend/configuração
  4. não contornar pela UI

### 9. Se um run estiver caro

- Abrir tela: `Runs`
- Ver campo:
  - custo do run
  - breakdown operacional
  - provider/model
  - tokens
- Tomar ação:
  1. abrir o detalhe financeiro do run
  2. ver provider/model dominante
  3. validar se o custo era esperado
  4. ajustar uso do agente ou fluxo, se necessário

### 10. Se um processo IMOB estiver caro

- Abrir tela: `IMOB Dashboard` ou `IMOB Processes`
- Ver campo:
  - custo do processo
  - agregação por etapa
  - etapa mais custosa
- Tomar ação:
  1. identificar a etapa crítica
  2. revisar o fluxo operacional do caso
  3. avaliar simplificação ou mudança de uso

### 11. Se aparecer `Gate 403` no IMOB

- Abrir tela: a própria superfície IMOB bloqueada
- Ver campo:
  - `reasonCode`
  - `traceId`
  - `scope`
  - CTA
- Tomar ação:
  1. validar se o problema é entitlement, instalação ou permissão
  2. seguir o CTA
  3. usar `traceId` para suporte/investigação
  4. não tentar contornar por fluxo paralelo

### 12. Se o usuário perguntar “quanto custou isso?”

- Abrir tela:
  - `Chat Agent Launcher`
  - `Chat IMOB`
  - ou `Runs`
- Ver campo:
  - custo real
  - estimado, se disponível
  - tokens
  - quota do workspace
- Tomar ação:
  1. informar custo da execução
  2. informar impacto no workspace
  3. se necessário, abrir `Runs` ou `Billing` para detalhe

### 13. Se houver diferença entre custo estimado e real

- Abrir tela:
  - `Launcher`
  - `Chat IMOB`
  - `Runs`
- Ver campo:
  - `Estimado`
  - `Custo real`
  - `variance`
- Tomar ação:
  1. verificar se a diferença é esperada
  2. usar o valor real como referência final
  3. usar a estimativa apenas como orientação prévia

## Regras gerais

- `Billing` é a superfície oficial de controle financeiro
- `Runs` é a superfície principal de investigação por execução
- `Agentes` mostra impacto econômico por agente
- `Launcher` e `Chat IMOB` mostram custo no contexto de uso
- nenhum número relevante deve ser aceito sem:
  - origem
  - vínculo com workspace
  - reconciliação mínima
