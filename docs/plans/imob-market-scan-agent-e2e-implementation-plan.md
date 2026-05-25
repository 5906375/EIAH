# imob-market-scan-agent-e2e-implementation-plan

Status: execução iniciada  
Prioridade: P1 após `LeadAgent E2E`  
Data de referência: 2026-05-25  
Escopo: fechar o `IMOB_MarketScanAgent` como etapa especializada E2E, saindo de leitura exploratória para recomendação acionável governada e handoff coerente para captação/continuidade.

---

## 1. Resumo executivo

O `MarketScanAgent` já faz:

- varredura governada;
- snapshot do scan;
- seleção do item;
- conversão para `property.create`;
- registro de evidência pelo `Guardian`.

O que ainda falta para E2E:

- comparáveis mínimos por fonte;
- faixa de preço/diária quando houver base suficiente;
- liquidez e risco de precificação;
- recomendação operacional forte:
  - captar
  - ajustar preço
  - pedir documento
  - não seguir
- explicação coerente no recovery e no caso.

---

## 2. Ordem de execução

### PR-M1 — actionable recommendation base

Status:

- `concluído`

Objetivo:

- transformar o scan em recomendação acionável mínima sem inventar dados.

Arquivos prováveis:

- `apps/api/src/services/imob/crm/imobCrmBusinessRead.ts`
- `apps/api/src/services/imob/marketScan/marketScanPolicyJudge.ts`
- `apps/api/src/services/imob/orchestrator/imobRecoveryResolver.ts`
- `apps/api/src/tests/imob-market-scan-recommendation.e2e.test.ts`

Escopo:

- usar apenas sinais realmente disponíveis;
- distinguir:
  - `captar`
  - `ajustar_preco`
  - `pedir_documento`
  - `nao_seguir`
- manter disclosure quando os dados forem insuficientes.

Critério:

- existe `recommendedNextMove` canônico;
- recomendação não inventa comparáveis;
- recovery explica o porquê da recomendação.

### PR-M2 — comparables + confidence band

Status:

- `concluído`

Objetivo:

- enriquecer o scan com comparáveis mínimos e confiança comercial.

Arquivos prováveis:

- `apps/api/src/services/imob/marketScan/marketSourceRegistry.ts`
- `apps/api/src/services/imob/crm/imobCrmBusinessRead.ts`
- `apps/api/src/tests/imob-market-scan-comparables.test.ts`

Escopo:

- origem dos comparáveis;
- contagem mínima;
- `confidence band` canônica;
- faixa de preço/diária quando possível.

Critério:

- comparáveis têm provenance;
- confidence é coerente com a base disponível;
- não há falsa precisão.

### PR-M3 — operational handoff hardening

Status:

- `em andamento`

Objetivo:

- fechar o handoff `market scan -> continuity/capture` sem drift.

Arquivos prováveis:

- `apps/api/src/services/imob/crm/imobCaseContextBuilder.ts`
- `apps/api/src/services/imob/orchestrator/imobNextActionResolver.ts`
- `apps/api/src/services/imob/orchestrator/imobRecoveryResolver.ts`
- `apps/api/src/tests/imob-market-scan-handoff.e2e.test.ts`

Escopo:

- recommendation -> `nextAction`
- recommendation -> `consultar caso`
- recommendation -> `o que falta?`
- recommendation -> `qual o próximo passo?`

Critério:

- captação segue quando o scan recomenda seguir;
- `pedir documento` vira próxima ação real;
- `não seguir` não deixa o caso em estado ambíguo.

---

## 3. Critério de saída

O `MarketScanAgent E2E` só pode ser considerado fechado quando:

- o scan produz recomendação acionável governada;
- a recomendação é explicável;
- comparáveis têm provenance;
- o handoff para captação/continuidade não recicla estado antigo;
- o launcher continua apenas renderizando o contrato resolvido.

---

## 4. Validação manual mínima

No chat IMOB:

1. rodar market scan com base suficiente;
2. validar recomendação `captar` ou `ajustar preço`;
3. rodar market scan com base insuficiente;
4. validar `pedir documento` ou `não seguir`;
5. pedir:
   - `consultar caso`
   - `o que falta?`
   - `qual o próximo passo?`
6. confirmar que a recomendação aparece de forma coerente no recovery.
