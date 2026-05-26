# imob-guardian-evidence-agent-e2e-implementation-plan

Status: execução iniciada  
Prioridade: P1 após `VisitAgent E2E`  
Data de referência: 2026-05-26  
Escopo: fechar o `Guardian_EvidenceAgent` como camada transversal de proof, evidence bundle, audit snapshot e leitura gerencial por missão, preservando arquitetura agent-driven e launcher `render-only`.

---

## 1. Resumo executivo

O runtime IMOB já fecha as principais jornadas operacionais, mas a leitura de evidence/proof ainda está distribuída entre mission policy, proof gate, receipts e snapshots parciais.

O que falta para E2E transversal:

- snapshot canônico único de evidence/proof por caso;
- leitura consistente de receipt, bundle e ledger por missão;
- recovery e business read conscientes do estado real de evidence;
- export auditável sem depender de reconstrução manual por fluxo;
- redução de drift entre policy, gate e projeção.

---

## 2. Ordem de execução

### PR-GUARD1 — canonical evidence snapshot

Status:

- `em andamento`

Objetivo:

- adicionar snapshot canônico de evidence/proof ao contexto do caso;
- refletir:
  - proof requerida
  - proof satisfeita
  - bundle/receipt disponíveis
  - missing proof explícita

Arquivos prováveis:

- `apps/api/src/services/imob/crm/imobCaseContextContract.ts`
- `apps/api/src/services/imob/crm/imobCaseContextBuilder.ts`
- `apps/api/src/services/imob/orchestrator/imobRecoveryResolver.ts`
- `apps/api/src/tests/imob-case-context-builder.test.ts`

Critério:

- o caso passa a expor evidence/proof sem depender de leitura implícita do proof gate;
- `consultar caso`, `o que falta?` e `qual o próximo passo?` refletem o estado real de proof.

### PR-GUARD2 — proof-aware recovery and business read

Status:

- `em andamento`

Objetivo:

- refletir o snapshot de evidence no recovery e no business read;
- impedir leitura operacional “verde” quando a proof ainda está incompleta;
- alinhar copy consultiva ao estado real do bundle/receipt.

Arquivos prováveis:

- `apps/api/src/services/imob/orchestrator/imobRecoveryResolver.ts`
- `apps/api/src/services/imob/crm/imobCrmBusinessRead.ts`
- `apps/api/src/tests/ImobRecoveryResolver.test.ts`
- `apps/api/src/tests/imob-business-read*.test.ts`

Critério:

- recovery e business read não divergem do estado de evidence/proof;
- missing proof entra explicitamente como pendência.

### PR-GUARD3 — auditable evidence export surface

Status:

- `pendente`

Objetivo:

- consolidar leitura exportável de evidence bundle/receipt/ledger por missão;
- preparar superfície auditável sem reconstrução manual por fluxo;
- fechar a trilha para governança e revisão posterior.

Arquivos prováveis:

- `apps/api/src/routes/governance.ts`
- `apps/api/src/services/imob/orchestrator/*`
- `apps/api/src/tests/*evidence*.test.ts`

Critério:

- existe leitura auditável por missão com referência estável a proof e receipt;
- export não depende de conhecimento implícito do fluxo.

---

## 3. Critério de saída

O `Guardian_EvidenceAgent` só pode ser considerado fechado quando:

- existe snapshot canônico de evidence/proof;
- recovery e business read refletem proof real;
- bundle/receipt/ledger ficam visíveis por missão sem drift;
- a leitura auditável não depende de reconstrução manual;
- o launcher continua apenas renderizando o contrato resolvido.

---

## 4. Validação manual mínima

No IMOB:

1. abrir um caso com proof não aplicável;
2. abrir um caso com proof requerida e ainda incompleta;
3. abrir um caso com bundle/receipt já satisfeitos;
4. pedir:
   - `consultar caso`
   - `o que falta?`
   - `qual o próximo passo?`
5. confirmar que o sistema:
   - diferencia proof ausente, pendente e satisfeita;
   - não mascara pendência documental/contratual/financeira;
   - mantém a leitura auditável coerente com a missão.
