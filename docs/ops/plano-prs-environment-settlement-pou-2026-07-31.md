<!-- BEGIN INCORPORATION BLOCK -->
## Bloco de incorporação

- **Data de incorporação:** 2026-08-03
- **SHA256 do arquivo-fonte:** `fbb08b8199309c2314c8ce8ee3fbe4860fc30fb886bbf487ce3499861c7e2a71`
- **Status normativo:** Proposta
- **Decisão de hierarquia:** `ADR-003`
- **Posição na hierarquia:** documento subordinado e pausado conforme `ADR-003`
- **Limite normativo:** este documento não estabelece status normativo próprio e não autoriza o início de nenhum PR
- **Evidence Index:** este documento não está indexado em `docs/EVIDENCE_INDEX.md`, pois é plano futuro, conforme `IA_EIAH.md` §13
- **Itens elegíveis, sem início autorizado neste ciclo:** PR-01, PR-04, PR-05, PR-07, PR-12
- **Itens pausados:** PR-02, PR-03, PR-06, PR-08, PR-09, PR-11
- **Item fora do horizonte enquanto vigorar o objetivo:** PR-10
- **Item não subordinado, em paralelo como superfície de segurança:** PR-00

<!-- END INCORPORATION BLOCK -->

# Plano revisado de PRs curtos — Environment, Auth, Settlement, Receipt, PoU e Evidence

Data de revisão: 2026-07-31  
Escopo: execução manual no Codex, com prompts curtos e sequenciais.  
Fonte canônica de roadmap: `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`  
Contexto complementar: `ROADMAP_UNIFICADO_v8.1_ATUALIZADO_2026-07-01.md`

---

## 0. Norma global para todos os prompts

Antes de qualquer ação, o Codex deve ler obrigatoriamente, nesta ordem:

1. `CODEX.md`
2. `CLAUDE.md`
3. `AGENTS.md`
4. `IA_EIAH.md` — especialmente §15 drift e §18 fail-closed
5. `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`
6. `docs/EVIDENCE_INDEX.md` apenas nas partes relacionadas ao escopo do PR

Todo prompt deve exigir:

- `git status --short` no início e no fim;
- `git log --oneline -n 10` para confirmar o commit inspecionado;
- classificação por ambiente: `dev`, `staging`, `produção`;
- camadas EIAH impactadas;
- trilha P0–P4 separada de severidade operacional;
- nenhum `DONE` sem evidência indexável;
- nenhum acesso a banco, `DATABASE_URL`, `.env` não versionado, secrets, push ou deploy, salvo prompt próprio e autorização explícita.

### Regras normativas obrigatórias

```text
NODE_ENV não é fonte de governança.
NODE_ENV pode existir apenas como sinal de build/test.

Campo ausente de evidenceGrade = unknown.
unknown não satisfaz gate crítico.

simulated/sandbox não equivale a external_confirmed.

dev/staging não podem emitir production-grade receipt.

produção só pode declarar live/external_confirmed com:
  adapter real não-stub;
  caminho externo real;
  contrato versionado;
  credenciais/config verificáveis;
  evidência CI/runtime.
```

### Higiene de saída

```text
Se algum secret aparecer em saída de ferramenta:
  não reproduzir o valor;
  informar apenas que houve ocorrência;
  informar o comando que causou a exposição;
  recomendar rotação se o valor for real.
```

### Enforcement é breaking change

```text
Adicionar campo é mudança aditiva.

Impor que ausência do campo reprova gate é mudança de comportamento
e deve ser tratada como breaking/operacional.

Todo PR que ligue enforcement deve declarar:
  quais dados existentes passam a reprovar;
  qual backfill ou política de unknown foi adotada;
  quais consumers já foram atualizados.
```

---

## 1. Fila revisada de implementação

| Ordem | Frente | Tipo | Observação |
| --- | --- | --- | --- |
| 00 | `FIX-AUTH-DEFAULT-POLARITY` | Implementação curta | Encabeça. Independente de Environment Resolver. |
| 00b | Confirmar `NODE_ENV` real por ambiente | Trilha do owner | Define risco latente vs incidente. |
| 00c | Agregações por ambiente | Trilha do owner | Bloqueia PR-08/backfill. |
| 01 | `FIX-SETTLEMENT-MATRIX-HONESTY` | Implementação curta | Corrige rótulo e check de lastro sem resolver. |
| 02 | `FIX-ECONOMY-RECEIPT-PERSISTENCE` | Implementação curta | Corrige bomba de configuração do EconomyReceipt. |
| 03 | `ADD-GOVERNED-ENVIRONMENT-RESOLVER` | Fundação | Escopo menor; auth já resolvido em 00. |
| 04 | `VERIFY-EVIDENCE-GENERATION-LAYER` | Read-only | Varredura sistêmica antes de corrigir só P3. |
| 05 | `REPLACE-P3-EVIDENCE-HARDCODED` | Implementação | Remove circularidade P3. |
| 06 | `FIX-SETTLEMENT-MATRIX-ENV-AWARE` | Implementação | Usa Environment Resolver. |
| 07 | `FIX-RECEIPT-CANON-EVIDENCE-GRADE_FIELD_ONLY` | Implementação aditiva | Campo apenas, zero enforcement. |
| 08 | `FIX-BILLING-LEDGER-EVIDENCE-GRADE` | Implementação | Depende de política de backfill decidida com agregações. |
| 09 | `FIX-SETTLEMENT-CONSUMERS-FILTERS` | Implementação | Consumers respeitam evidenceGrade. |
| 10 | `ENABLE-EVIDENCE-GRADE-ENFORCEMENT` | Implementação controlada | Só depois de consumers/backfill. |
| 11 | `CONTAIN-POU-FAIL-OPEN` | Implementação | Inclui bifurcação A1/A2 sobre persistência de strings. |
| 12 | `DOWNGRADE-POU-AND-ECONOMY-CLAIMS` | Docs/Evidence | Alinha claims ao runtime real. |

---

## 2. Trilhas do owner em paralelo

### 00b — Confirmar NODE_ENV real por ambiente

Objetivo: saber se o fail-open de auth/guardrail é risco latente ou incidente.

Resultado esperado:

| Ambiente | NODE_ENV real | Fonte | Observação |
| --- | --- | --- | --- |
| dev | ... | ... | ... |
| staging | ... | ... | ... |
| produção | ... | ... | ... |

Regras:

- Não expor secrets.
- Não rodar comandos genéricos como `printenv`.
- Confirmar apenas o nome/estado da variável necessária, por meio autorizado da plataforma.
- Se `produção` não estiver com `NODE_ENV=production`, tratar como potencial incidente operacional e revisar acessos/logs conforme política do owner.

### 00c — Agregações por ambiente

Objetivo: medir volume de contaminação antes de decidir backfill/expurgo.

Rodar em cada ambiente autorizado: `dev`, `staging`, `produção`.

```sql
-- 1. Distribuição de PaymentIntent por status
SELECT status, COUNT(*) AS intent_count
FROM payment_intents
GROUP BY status
ORDER BY status;
```

```sql
-- 2. Released count
SELECT
  COUNT(*) FILTER (WHERE status = 'released') AS released_count,
  MIN(created_at) FILTER (WHERE status = 'released') AS first_released_created_at,
  MAX(created_at) FILTER (WHERE status = 'released') AS last_released_created_at
FROM payment_intents;
```

```sql
-- 3. ProofOfUsage total/finalized
SELECT
  COUNT(*) AS pou_count,
  COUNT(*) FILTER (WHERE status = 'FINALIZED') AS finalized_count,
  MIN(created_at) AS first_created_at,
  MAX(created_at) AS last_created_at
FROM proof_of_usage;
```

```sql
-- 4. Settled commissions por metadata
SELECT
  COUNT(*) AS settled_commission_count,
  MIN(created_at) AS first_settled_commission_created_at,
  MAX(created_at) AS last_settled_commission_created_at
FROM payment_intents
WHERE status = 'settled'
  AND (
    metadata ->> 'commission' = 'true'
    OR metadata ->> 'action' = 'realestate.release_commission'
  );
```

```sql
-- 5. Receipt de settlement: coluna JSON em payment_intents
SELECT COUNT(*) AS settlement_receipts,
       MIN(updated_at) AS first_at,
       MAX(updated_at) AS last_at
FROM payment_intents
WHERE settlement_receipt IS NOT NULL;
```

```sql
-- 6. Créditos de settlement no ledger financeiro
SELECT provider,
       COUNT(*) AS entries,
       MIN(created_at) AS first_at,
       MAX(created_at) AS last_at
FROM billing_ledger
WHERE type = 'credit'
GROUP BY provider
ORDER BY provider;
```

Interpretação:

```text
zero em receipts e créditos:
  cadeia limpa no ambiente; contenção planejada.

não-zero:
  há prova/ledger emitidos; limpeza/backfill entra no plano.

released/settled não-zero em produção:
  interromper sequência e avaliar P0 operacional.
```

---

# PROMPTS PARA CODEX

---

## PR-00 — FIX-AUTH-DEFAULT-POLARITY

```text
# Prompt — FIX-AUTH-DEFAULT-POLARITY

Escopo: PR curto de segurança/governança. Implementação permitida.
Não tocar em settlement, PoU, Receipt Canon, billing_ledger ou Environment Resolver.

Antes de qualquer ação, leia obrigatoriamente:
1. CODEX.md
2. CLAUDE.md
3. AGENTS.md
4. IA_EIAH.md §15 e §18
5. ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md nas seções P0/P1
6. docs/EVIDENCE_INDEX.md somente onde citar auth, guardrail, governance, fail-closed ou environment

Contexto:
O inventário VERIFY-ENVIRONMENT-RESOLVER-INVENTORY identificou uso indevido de NODE_ENV como governança em pontos sensíveis:
- auth.ts: wallet sem assinatura permitida fora de production;
- auth.ts: bootstrap de primeira senha permitido fora de production;
- auth.ts: reset por e-mail permitido fora de production;
- runWorker.ts: guardrail degrada de block para warn em development.

Problema:
A regra atual usa ausência de production como permissão. Isso é fail-open.

Objetivo:
Inverter a polaridade:
- permissivo apenas com opt-in explícito por flag específica;
- ausência, typo ou valor inválido = modo estrito.

Decisão normativa:
Usar flags separadas por ponto. Não criar flag permissiva global.

Flags propostas:
- EIAH_ALLOW_UNVERIFIED_WALLET
- EIAH_ALLOW_PASSWORD_BOOTSTRAP
- EIAH_ALLOW_EMAIL_RESET_DEV
- EIAH_ALLOW_GUARDRAIL_WARN_ONLY

Regras:
- somente o valor literal "true" habilita exceção;
- qualquer outro valor é false;
- NODE_ENV não pode ser usado como fonte de governança;
- NODE_ENV pode continuar existindo apenas como sinal de build/test, não como autorização;
- não ler .env não versionado;
- atualizar .env.template apenas com nomes e comentários, nunca valores sensíveis.

Implementar:
1. localizar os quatro pontos sensíveis;
2. substituir permissividade baseada em NODE_ENV por flags específicas;
3. criar helper simples e testável para ler boolean env estrito, se já não existir;
4. adicionar testes de regressão:
   - flag ausente nega;
   - flag com typo nega;
   - flag "false" nega;
   - flag "true" permite somente o ponto correspondente;
   - uma flag não libera os outros pontos;
5. preservar comportamento estrito por default.

Não implementar:
- Environment Resolver;
- settlement matrix;
- evidenceGrade;
- Receipt Canon;
- billing_ledger;
- PoU;
- deploy;
- migrations;
- queries de banco.

Classificação obrigatória por ambiente:
| Ambiente | Estado | Flag permissiva permitida? | Default | Observação |
| --- | --- | --- | --- | --- |
| dev | determinado/indeterminado | sim, somente explícita | estrito | ... |
| staging | determinado/indeterminado | não por default | estrito | ... |
| produção | determinado/indeterminado | não | estrito | ... |

Camadas EIAH impactadas:
| Camada | Impacto | Justificativa |
| --- | --- | --- |
| Identity | Primária | wallet/senha/reset |
| Governance | Primária | fail-open → opt-in |
| Tool Security | Primária | guardrail block/warn |
| Compliance | Secundária | reduz acesso indevido |
| Monitoring | Secundária | registrar flags se houver superfície segura |
| MCP | — | |
| Economy | — | |
| Evidence / Receipt / Ledger | — | |

Trilha P0–P4 e severidade:
- P0: integridade/drift de ambiente
- P1: governança/execução crítica
- Severidade operacional: alta; P0 operacional potencial se ambiente implantado estiver sem NODE_ENV=production

Comandos permitidos:
- git status --short
- git log --oneline -n 10
- rg/grep escopado
- sed/nl/cat seletivo
- testes específicos relacionados a auth/guardrail, se necessários

Proibido:
- ler .env, .env.local, .env.production
- printenv completo
- usar DATABASE_URL
- conectar a banco
- migrations/seeds
- push/deploy
- alterar settlement/PoU/Receipt Canon/billing ledger

Higiene de saída:
Se algum secret aparecer em saída de ferramenta, não reproduzir. Informar apenas que houve ocorrência, comando e necessidade de rotação.

Relatório final obrigatório:
1. Resumo executivo
2. Arquivos alterados
3. Pontos NODE_ENV removidos ou mantidos, com justificativa
4. Flags criadas
5. Testes/gates executados
6. Classificação por ambiente
7. Camadas EIAH impactadas
8. P0–P4 e severidade operacional
9. Riscos remanescentes
10. Próximo PR recomendado

Encerrar com:
- Arquivos alterados:
- Testes/gates/scripts executados:
- Banco/DATABASE_URL usado:
- Secrets lidos/reproduzidos:
- git status inicial/final:
- Commit inspecionado:
- Status:
```

---

## PR-01 — FIX-SETTLEMENT-MATRIX-HONESTY

```text
# Prompt — FIX-SETTLEMENT-MATRIX-HONESTY

Escopo: PR curto. Corrigir honestidade de rótulos e check de lastro, sem Environment Resolver.

Antes de qualquer ação, leia CODEX.md e CLAUDE.md, depois AGENTS.md, IA_EIAH.md §15/§18, roadmap canônico 2026-06-15 e Evidence Index nos trechos de economy/settlement/evidence.

Contexto:
A matriz declara stripe=full, mas o adapter Stripe atual gera UUID local/succeeded sem SDK, HTTP ou transferência externa. SETTLEMENT_PROVIDER_MODE_* muda rótulo, não implementação.

Objetivo:
Corrigir a matriz e os checks para não permitir full/live sem lastro no adapter.

Implementar:
1. corrigir stripe=full para modo honesto enquanto o adapter for stub/local;
2. impedir matriz declarar full/live se adapter não tiver implementação externa real;
3. check determinístico:
   - adapter declarado;
   - path existe;
   - path não resolve para função stub/local;
   - live/full não permitido se implementação só gera UUID local;
4. teste de regressão para SETTLEMENT_PROVIDER_MODE_* não transformar stub em live.

Não implementar:
- Environment Resolver;
- providerMode compatível por ambiente;
- Receipt Canon evidenceGrade;
- billing_ledger;
- consumers;
- PoU.

Classificação obrigatória por ambiente:
dev, staging, produção. Declarar que este PR corrige honestidade do adapter, não resolve ambiente governado.

Camadas EIAH impactadas:
Governance, Compliance, Economy, Evidence / Receipt / Ledger.

Relatório final:
- matriz antes/depois;
- checks/testes executados;
- P0–P4 e severidade;
- git status inicial/final;
- Status.
```

---

## PR-02 — FIX-ECONOMY-RECEIPT-PERSISTENCE

```text
# Prompt — FIX-ECONOMY-RECEIPT-PERSISTENCE

Escopo: PR curto para corrigir persistência EconomyReceipt v1 quando ECONOMY_RECEIPT_V1_ENABLED=true.

Ler CODEX.md e CLAUDE.md primeiro.

Contexto:
A auditoria indicou que a persistência do EconomyReceipt tenta usar campos eventKey, workspaceId e payload em GuardrailLedger que não existem no schema ativo. Ligar ECONOMY_RECEIPT_V1_ENABLED pode quebrar.

Objetivo:
Corrigir ou bloquear de modo fail-closed a persistência do EconomyReceipt v1 para não depender de campos ausentes.

Implementar:
1. verificar schema ativo de GuardrailLedger;
2. verificar rota/serviço que persiste EconomyReceipt;
3. escolher uma das opções:
   A. ajustar persistência para campos existentes e contrato válido;
   B. se persistência correta não couber em PR curto, bloquear flag com reasonCode explícito e teste;
4. adicionar teste de regressão para ECONOMY_RECEIPT_V1_ENABLED=true;
5. garantir que o fluxo não falhe silenciosamente nem escreva artefato inválido.

Não implementar:
- evidenceGrade;
- settlement consumers;
- PoU;
- migrations amplas sem necessidade comprovada;
- provider externo.

Classificação por ambiente:
dev/staging/produção. Flag habilitada em qualquer ambiente não pode quebrar runtime.

Camadas EIAH:
Governance, Compliance, Economy, Evidence / Receipt / Ledger.

Relatório final:
- opção adotada A/B;
- schema/contrato reconciliado;
- testes/gates;
- riscos remanescentes.
```

---

## PR-03 — ADD-GOVERNED-ENVIRONMENT-RESOLVER

```text
# Prompt — ADD-GOVERNED-ENVIRONMENT-RESOLVER

Escopo: PR pequeno de fundação, contracts-first.
Não migrar settlement, Receipt Canon, billing_ledger, PoU ou consumers.

Antes de qualquer ação, leia CODEX.md e CLAUDE.md, depois AGENTS.md, IA_EIAH.md §15/§18, ADR-001 e roadmap canônico 2026-06-15.

Baseie-se no relatório VERIFY-ENVIRONMENT-RESOLVER-INVENTORY.

Objetivo:
Criar Environment Resolver governado mínimo.

Implementar:
1. contrato versionado deployment-environment-profile.v1;
2. tipos dev | staging | production | unknown;
3. procedência platform-injected | deployment-config | runtime-env-var | app-config;
4. resolução de conflito/ausência como unknown;
5. NODE_ENV rejeitado como fonte de governança;
6. runtime-env-var comum marcada como fraca;
7. testes dev/staging/production/unknown/conflict;
8. check CI de contrato;
9. exposição inicial em health/diagnóstico.

Não implementar:
- settlement write;
- evidenceGrade;
- Receipt Canon;
- billing_ledger;
- PoU;
- consumer filters.

Relatório final:
- classificação por ambiente;
- camadas EIAH;
- P0–P4 e severidade;
- arquivos alterados;
- testes/gates;
- git status.
```

---

## PR-04 — VERIFY-EVIDENCE-GENERATION-LAYER

```text
# Prompt — VERIFY-EVIDENCE-GENERATION-LAYER

Escopo: auditoria somente leitura.

Ler CODEX.md e CLAUDE.md primeiro.

Contexto:
A classe de defeito é "artefato afirmando fato não ocorrido". Instâncias conhecidas:
- APE hardcoded;
- evidência PoU hardcoded;
- P3 circular;
- stripe=full para stub;
- settlement receipt/ledger sem evidenceGrade.

Objetivo:
Inventariar geradores/checkers de evidência que afirmam fatos sem lastro runtime.

Permitido:
git status, git log, rg/grep, sed/nl/cat seletivo.

Proibido:
alterar arquivos, testes, gates, scripts geradores, banco, DATABASE_URL, secrets, push/deploy.

Classificar cada achado:
- arquivo/linha;
- fato afirmado;
- fonte real usada;
- hardcoded/snapshot/runtime;
- consumidor/gate;
- ambiente;
- camada EIAH;
- P0–P4;
- severidade.

Relatório final:
1. Resumo executivo
2. Escopo/comandos
3. Geradores encontrados
4. Checkers encontrados
5. Evidência hardcoded/circular
6. Classificação por ambiente
7. Camadas EIAH
8. P0–P4 e severidade
9. Recomendações de PRs
10. Riscos remanescentes

Encerrar com arquivos alterados: nenhum.
```

---

## PR-05 — REPLACE-P3-EVIDENCE-HARDCODED

```text
# Prompt — REPLACE-P3-EVIDENCE-HARDCODED

Escopo: scripts/gates P3.

Ler CODEX.md e CLAUDE.md primeiro.

Objetivo:
Remover circularidade do gate P3: gerador não pode afirmar e checker validar a mesma afirmação sem lastro.

Implementar:
1. gerar evidência a partir de contratos/runtime fixtures verificáveis;
2. validar providerMode contra adapter e matriz corrigida;
3. bloquear stripe full se adapter for stub;
4. distinguir simulated/sandbox/live;
5. testes/gates determinísticos.

Não executar provider externo real.
Não usar produção.
Não usar secrets.

Classificação por ambiente:
dev/staging/produção.

Camadas EIAH:
Governance, Compliance, Economy, Evidence / Receipt / Ledger.

Relatório final com P3, severidade operacional e ambiente.
```

---

## PR-06 — FIX-SETTLEMENT-MATRIX-ENV-AWARE

```text
# Prompt — FIX-SETTLEMENT-MATRIX-ENV-AWARE

Escopo: integrar matriz de settlement ao Environment Resolver.

Ler CODEX.md e CLAUDE.md primeiro.

Pré-requisito:
ADD-GOVERNED-ENVIRONMENT-RESOLVER já mergeado.

Objetivo:
Fazer seleção/validação de providerMode considerar EnvironmentContext governado.

Implementar:
1. matriz consome ambiente resolvido;
2. unknown environment não permite live/full;
3. dev/staging não permitem production-grade/live;
4. produção exige live somente com adapter real e lastro;
5. testes de regressão por ambiente.

Não implementar:
- Receipt Canon evidenceGrade;
- billing_ledger;
- consumers;
- PoU.

Relatório final com matriz dev/staging/produção e camadas EIAH.
```

---

## PR-07 — FIX-RECEIPT-CANON-EVIDENCE-GRADE_FIELD_ONLY

```text
# Prompt — FIX-RECEIPT-CANON-EVIDENCE-GRADE_FIELD_ONLY

Escopo: Receipt Canon, campo aditivo apenas. Zero enforcement.

Ler CODEX.md e CLAUDE.md primeiro.

Objetivo:
Adicionar evidenceGrade como campo canônico de primeira classe no Receipt Canon, sem mudar comportamento de gates/consumers neste PR.

Implementar:
1. campo aditivo evidenceGrade;
2. valores:
   - unknown
   - structural
   - simulated
   - sandbox
   - shadow
   - dry_run
   - external_confirmed
3. default de leitura para campo ausente = unknown;
4. testes de compatibilidade;
5. minor bump conforme política vigente.

Não implementar:
- enforcement;
- reprovação de gates;
- billing_ledger;
- consumers;
- backfill;
- P3 evidence;
- PoU.

Regra:
Adicionar campo é aditivo; enforcement é breaking e fica para PR posterior.

Relatório final:
- compatibilidade;
- ambientes;
- camadas EIAH;
- P0–P4;
- status.
```

---

## PR-08 — FIX-BILLING-LEDGER-EVIDENCE-GRADE

```text
# Prompt — FIX-BILLING-LEDGER-EVIDENCE-GRADE

Escopo: persistência de modo no billing_ledger.

Ler CODEX.md e CLAUDE.md primeiro.

Pré-requisito obrigatório:
Owner deve ter rodado agregações por ambiente e decidido política de backfill.

Decisão de backfill deve estar no prompt antes de implementar:
Opção A — existing rows = unknown.
  Honesto, mas pode invalidar histórico em consumers posteriores.

Opção B — existing rows = structural com data de corte declarada.
  Preserva histórico operacional, mas não afirma external confirmation.

Opção C — backfill seletivo por registros comprovados.
  Só se houver evidência suficiente.

Objetivo:
Garantir que créditos de settlement no ledger financeiro carreguem evidenceGrade, providerMode e externalMovement, ou referência canônica equivalente.

Implementar:
1. schema/migration se necessário;
2. escrita do modo nos créditos de settlement;
3. regra de backfill conforme decisão do owner;
4. testes unknown/simulated/external_confirmed;
5. APIs retornando modo sem PII;
6. idempotência preservada.

Não implementar:
- filtros de todos os consumers;
- enforcement;
- P3 evidence real;
- limpeza manual fora de migration aprovada.

Relatório final:
- política de backfill aplicada;
- agregações usadas como base;
- ambiente;
- camadas;
- testes/gates.
```

---

## PR-09 — FIX-SETTLEMENT-CONSUMERS-FILTERS

```text
# Prompt — FIX-SETTLEMENT-CONSUMERS-FILTERS

Escopo: consumers materiais de settlement/economy.

Ler CODEX.md e CLAUDE.md primeiro.

Objetivo:
Atualizar consumidores para não tratar unknown/simulated como live/external_confirmed.

Consumers mínimos:
1. quota refresh;
2. billing execution guard;
3. reconciler periódico;
4. summary/workspaces;
5. reputation/disputes;
6. optimization/economy;
7. invoice metadata;
8. UI/export.

Regras:
- unknown não conta como live;
- simulated/sandbox não equivale a external_confirmed;
- UI/export deve exibir modo quando mostrar créditos/settlements;
- preservar compatibilidade com backfill decidido no PR-08.

Não implementar:
- enforcement global do Receipt Canon;
- nova política de backfill;
- PoU.

Relatório final:
- consumers alterados;
- consumidores não alterados e motivo;
- testes de regressão;
- ambiente;
- camadas EIAH.
```

---

## PR-10 — ENABLE-EVIDENCE-GRADE-ENFORCEMENT

```text
# Prompt — ENABLE-EVIDENCE-GRADE-ENFORCEMENT

Escopo: ligar enforcement somente após campo, ledger e consumers.

Ler CODEX.md e CLAUDE.md primeiro.

Pré-requisitos:
- PR-07 campo evidenceGrade mergeado;
- PR-08 ledger com evidenceGrade mergeado;
- PR-09 consumers atualizados;
- política de backfill documentada.

Objetivo:
Ativar regra:
unknown não satisfaz gate crítico.
production-grade exige external_confirmed.

Antes de implementar, declarar:
1. quais dados existentes passam a reprovar;
2. quais gates serão afetados;
3. quais consumers já foram atualizados;
4. plano de rollback.

Implementar:
1. enforcement nos gates críticos;
2. testes de regressão;
3. reasonCodes canônicos, se necessário;
4. falha fechada para unknown;
5. sem exceção global permissiva.

Não implementar:
- novos consumers;
- backfill;
- PoU amplo.

Relatório final:
- gates afetados;
- evidência de compatibilidade;
- severidade operacional;
- ambiente;
- camadas.
```

---

## PR-11 — CONTAIN-POU-FAIL-OPEN

```text
# Prompt — CONTAIN-POU-FAIL-OPEN

Escopo: contenção PoU pós Environment/evidenceGrade.

Ler CODEX.md e CLAUDE.md primeiro.

Objetivo:
Impedir que gate SCL seja rotulado como PoU e impedir que ausência de PoU satisfaça fluxo crítico.

Antes de implementar, verificar se a string/reason "pou_gate_pass" é persistida em banco, receipt, ledger, settlement_receipt ou evidência.

Bifurcação obrigatória:

CASO A1 — string não persistida:
  renomear diretamente para scl_gate_pass onde semanticamente correto.

CASO A2 — string já persistida:
  não renomear retroativamente de forma silenciosa;
  criar compat alias ou nova versão;
  documentar migração semântica;
  preservar leitura histórica;
  emitir reasonCode novo para eventos futuros.

Implementar:
1. distinguir SCL gate de PoU gate;
2. quando PoU for obrigatório, ausência = fail-closed;
3. não exigir PoU FINALIZED em fluxos sem writer/resolver confiável sem plano de migração;
4. testes Run+SCL sem ProofOfUsage;
5. reasonCode canônico para PoU ausente, se necessário.

Não implementar:
- limpeza retroativa sem decisão;
- settlement matrix;
- Receipt Canon amplo.

Relatório final:
- CASO A1/A2;
- strings persistidas encontradas;
- mudanças realizadas;
- testes;
- ambiente/camadas/P0–P4.
```

---

## PR-12 — DOWNGRADE-POU-AND-ECONOMY-CLAIMS

```text
# Prompt — DOWNGRADE-POU-AND-ECONOMY-CLAIMS

Escopo: documentação e Evidence Index.

Ler CODEX.md e CLAUDE.md primeiro.

Objetivo:
Rebaixar claims PoU/Economy para refletir runtime real após achados de Environment Resolver, settlement, evidenceGrade e P3.

Implementar:
1. revisar roadmap canônico 2026-06-15 somente se houver drift;
2. revisar Evidence Index;
3. revisar runbooks Economy/PoU/Settlement;
4. revisar material comercial se houver claims live/produção;
5. marcar estrutural, simulated, sandbox, unknown, external_confirmed corretamente;
6. declarar que o vínculo §9.4 `receipt -> ledger -> provider settlement` não está fechado se não houver evidência runtime externa.

Não alterar runtime.

Rodar checks documentais permitidos:
- checkEvidenceIndex
- docs link integrity
- git diff --check

Relatório final:
- claims rebaixados;
- arquivos alterados;
- checks;
- P0–P4;
- severidade;
- status.
```

---

## 3. Modelo padrão de relatório final para todos os PRs

```text
1. Resumo executivo
2. Escopo executado
3. Arquivos alterados
4. Testes/gates/scripts executados
5. Classificação por ambiente
6. Camadas EIAH impactadas
7. Trilhas P0–P4 e severidade operacional
8. Evidências produzidas
9. Riscos remanescentes
10. Próximo PR recomendado
11. Status final

Encerrar com:
- Arquivos alterados:
- Testes/gates/scripts executados:
- Banco/DATABASE_URL usado:
- Secrets lidos/reproduzidos:
- git status inicial/final:
- Commit inspecionado:
- Status:
```

---

## 4. Observação final

O objetivo deste plano é reduzir risco por PRs pequenos, evitando três falhas:

```text
1. resolver tudo em uma mudança grande;
2. ligar enforcement antes de backfill/consumers;
3. criar mais uma fonte paralela de ambiente ou evidência.
```

A ordem é intencional: primeiro fechar fail-open explícito, depois honestidade de matriz e persistência quebrável, depois Environment Resolver, depois evidenceGrade e consumers, e só então enforcement.
