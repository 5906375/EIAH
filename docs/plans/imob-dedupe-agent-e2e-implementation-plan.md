# imob-dedupe-agent-e2e-implementation-plan

Status: concluído no runtime  
Prioridade: P1 após `DocumentAgent E2E`  
Data de referência: 2026-05-26  
Escopo: fechar o `IMOB_DedupeAgent` como camada E2E de merge auditável e idempotência formal para imóvel, proprietário e handoffs relacionados.

---

## 1. Resumo executivo

O runtime IMOB já endureceu partes críticas de dedupe:

- conversão idempotente de `market scan -> property.create`;
- owner/property continuity mais estável;
- prevenção parcial de side effect duplicado;
- case state e recovery já coerentes com reruns principais.

O que ainda falta para E2E:

- merge auditável de imóvel e owner;
- policy clara para conflito de identidade;
- reason codes de dedupe no contexto canônico;
- idempotência transversal em reruns de flows governados;
- queue/projeção explícita para revisão humana quando o match for ambíguo.
- replay formal sem drift em flows governados do mesmo caso/thread.

---

## 2. Ordem de execução

### PR-DEDUPE1 — canonical dedupe snapshot

Status:

- `concluído`

Objetivo:

- adicionar snapshot canônico de dedupe ao caso;
- refletir:
  - match seguro
  - match ambíguo
  - merge pendente de revisão

Arquivos prováveis:

- `apps/api/src/services/imob/crm/imobCaseContextContract.ts`
- `apps/api/src/services/imob/crm/imobCaseContextBuilder.ts`
- `apps/api/src/services/imob/orchestrator/imobNextActionResolver.ts`
- `apps/api/src/services/imob/orchestrator/imobRecoveryResolver.ts`
- `apps/api/src/tests/imob-dedupe-context.test.ts`

Critério:

- o caso passa a expor estado de dedupe sem depender de leitura implícita do CRM;
- `consultar caso`, `o que falta?` e `qual o próximo passo?` explicam revisão de dedupe quando necessário.

### PR-DEDUPE2 — property/owner merge auditável

Status:

- `concluído`

Objetivo:

- tornar merge de imóvel/proprietário auditável;
- registrar evidence/reason code do merge;
- manter side effect único e reversível.

Arquivos prováveis:

- `apps/api/src/services/imob/crm/imobCrmMutationService.ts`
- `apps/api/src/services/imob/crm/imobCrmDedupeService.ts`
- `apps/api/src/tests/imob-crm-dedupe-merge.test.ts`
- `apps/api/src/tests/imob-dedupe-owner-property.e2e.test.ts`

Critério:

- merge gera trilha auditável;
- rerun não duplica merge nem side effect;
- conflitos reais ficam pendentes para revisão humana.

### PR-DEDUPE3 — idempotência formal transversal

Status:

- `concluído`

Objetivo:

- unificar proteção contra rerun em flows governados que tocam dedupe;
- impedir duplicidade operacional em:
  - `property.create`
  - `owner.create/update`
  - `property.link_owner`

Arquivos prováveis:

- `apps/api/src/services/imob/crm/imobCrmMutationService.ts`
- `apps/api/src/services/imob/orchestrator/imobSideEffectDispatchGuard.ts`
- `apps/api/src/tests/imob-dedupe-idempotency.e2e.test.ts`

Critério:

- `duplicateSideEffects = 0` nos cenários scoped do bloco;
- reexecução do mesmo caso preserva o estado resolvido sem drift.

---

## 3. Critério de saída

O `DedupeAgent E2E` só pode ser considerado fechado quando:

- existe snapshot canônico de dedupe;
- merge de imóvel/proprietário é auditável;
- match ambíguo vira revisão explícita, não side effect silencioso;
- reruns governados ficam idempotentes de forma transversal;
- o launcher continua apenas renderizando o contrato resolvido.

---

## 4. Validação manual mínima

No chat IMOB:

1. repetir conversão do mesmo item do scan;
2. repetir update do mesmo owner;
3. tentar vincular owner/property já vinculados;
4. pedir:
   - `consultar caso`
   - `o que falta?`
   - `qual o próximo passo?`
5. confirmar que o sistema:
   - não duplica side effect;
   - expõe conflito de dedupe quando houver ambiguidade;
   - mantém continuidade coerente no caso ativo.
