# imob-document-agent-e2e-implementation-plan

Status: execução iniciada  
Prioridade: P1 após `MarketScanAgent E2E`  
Data de referência: 2026-05-25  
Escopo: fechar o `IMOB_DocumentAgent` como etapa especializada E2E, com checklist por operação, suficiência documental explícita, blockers claros e handoff jurídico/documental coerente com proof.

---

## 1. Resumo executivo

O `DocumentAgent` já participa do runtime por:

- `documents.review`;
- pendências documentais básicas;
- integração parcial com recovery;
- dependência conceitual de proof/evidence.

O que ainda falta para E2E:

- checklist específico por operação;
- suficiência documental explícita;
- blockers claros e auditáveis;
- preparo de pacote documental;
- handoff jurídico/documental com proof coerente.

---

## 2. Ordem de execução

### PR-DOC1 — checklist by operation

Status:

- `em andamento`

Objetivo:

- tornar o checklist documental específico por:
  - `venda`
  - `locacao_anual`
  - `temporada`

Arquivos prováveis:

- `apps/api/src/services/imob/crm/imobCrmDocumentService.ts`
- `apps/api/src/services/imob/crm/imobCaseContextBuilder.ts`
- `apps/api/src/services/imob/orchestrator/imobNextActionResolver.ts`
- `apps/api/src/services/imob/orchestrator/imobRecoveryResolver.ts`
- `apps/api/src/tests/imob-document-checklist.e2e.test.ts`

Escopo:

- checklist muda conforme a operação;
- documentos faltantes viram `pendingFields`/blockers claros;
- recovery explica o que falta sem reciclar blocker antigo.

Critério:

- o checklist é governado por operação;
- o caso deixa explícito o que falta;
- `consultar caso`, `o que falta?` e `qual o próximo passo?` refletem a pendência documental real.

### PR-DOC2 — sufficiency + proof + legal handoff

Objetivo:

- introduzir suficiência documental mínima;
- bloquear avanço sensível quando o pacote ainda não estiver pronto;
- expor handoff jurídico/documental coerente com proof.

Arquivos prováveis:

- `apps/api/src/services/imob/crm/imobCrmDocumentService.ts`
- `apps/api/src/services/imob/orchestrator/imobMissionPolicy.ts`
- `apps/api/src/services/imob/orchestrator/imobProofGate.ts`
- `apps/api/src/services/imob/orchestrator/imobRecoveryResolver.ts`
- `apps/api/src/tests/imob-document-sufficiency.e2e.test.ts`
- `apps/api/src/tests/imob-document-handoff.test.ts`

Escopo:

- pacote insuficiente bloqueia contrato/fechamento quando aplicável;
- proof documental entra na leitura do caso;
- handoff jurídico aparece como próxima ação real;
- documentos já validados não reabrem sem motivo.

Critério:

- existe leitura de suficiência documental;
- blockers impedem avanço indevido;
- handoff jurídico/documental é explícito e auditável.

---

## 3. Critério de saída

O `DocumentAgent E2E` só pode ser considerado fechado quando:

- o checklist varia corretamente por operação;
- a suficiência documental aparece no contexto canônico;
- blockers documentais são claros e explicáveis;
- proof documental participa da decisão de avanço;
- o handoff jurídico/documental é refletido no recovery;
- o launcher continua apenas renderizando o contrato resolvido.

---

## 4. Validação manual mínima

No chat IMOB:

1. abrir uma jornada com `documents.review`;
2. validar checklist diferente para venda e locação;
3. deixar um documento crítico faltando;
4. pedir:
   - `consultar caso`
   - `o que falta?`
   - `qual o próximo passo?`
5. confirmar que o sistema:
   - explicita a pendência documental real;
   - não avança para etapa sensível sem suficiência;
   - aponta handoff jurídico/documental quando aplicável.
