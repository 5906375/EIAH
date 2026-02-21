# CHANGELOG PRs

## PR-2.1 — `cockpit-queues-api`
**Escopo:** API only (sem UI)

### Entregas
- Endpoint `GET /cockpit/queues`.
- Agregação de filas:
  - approvals pendentes;
  - reconcile pendente;
  - delegations expirando;
  - falhas WhatsApp (`whatsapp_message_log` com status de erro).
- Enforcement de segurança:
  - RBAC (`admin/execute`);
  - escopo `tenant/workspace`.
- Feature flag `COCKPIT_QUEUES_ENABLED` (off por padrão).

### Testes
- Testes unitários do shape/contrato de resposta.
- Integração com mock store quando serviços externos não disponíveis.

---

## PR-2.2 — `cockpit-panel-addon`
**Escopo:** UI incremental sem redesign

### Entregas
- Componente `CockpitPanel` colapsável.
- Desktop: painel lateral sem alterar grid principal.
- Mobile: seção abaixo do chat, colapsável.
- Render condicionado por `COCKPIT_CARDS_ENABLED`.
- Conteúdo inicial: card de `Queues` consumindo `GET /cockpit/queues` quando `COCKPIT_QUEUES_ENABLED`.

### Testes
- Smoke/render tests sem alteração de UX global.

---

## PR-2.3 — `cockpit-cards-realestate`
**Escopo:** UI de cards para fluxo real estate (sem redesign)

### Entregas
- `DryRunCard`
  - Chama `POST /realestate/dry-run`;
  - Exibe `policyDecision`, preview, `planHash`, `diffHash`.
- `ApprovalsCard`
  - Usa `POST /runs/:id/approve`;
  - Fluxo approve/reject com `reason`.
- `ReceiptsCard`
  - Exibe PoU, evidências de ledger e logs WhatsApp por lease/run.

### Testes
- Smoke de abertura dos cards em run.
- Mocks de API (fixture/MSW).

---

## PR-2.4 — `llm-task-router-wiring`
**Escopo:** Core/API para real estate (sem UI)

### Entregas
- Integração de `runTaskWithFallback(task, ...)` no caminho produtivo de ações real estate:
  - `contract_extract`
  - `intent_classify`
  - `judge_policy`
  - `tenant_faq`
  - `collections_message`
- Validators aplicados para tasks JSON (com retry restritivo em saída inválida).
- Audit metadata LLM (`promptHash`, `outputHash`, provider, model, latency) gerado.
- Metadata anexado ao payload de `RunEvent` (`run.action.llm.audit`) no fluxo de `apply-adjustment`.
- Cache de TTL curto apenas para:
  - `intent_classify`
  - `tenant_faq`
- Feature flag `LLM_TASK_ROUTER_ENABLED` (off por padrão).

### Testes
- Unit tests de LLM router/validator/audit.
- Teste adicional de integração validando presença de hashes no evento.

---

## PR-2.5 — `whatsapp-provider-meta`
**Escopo:** Integração provider + webhook (sem UI)

### Entregas
- Implementação `WhatsAppTransportMeta` para Meta Graph API.
- Seleção de provider por flag `WHATSAPP_PROVIDER_ENABLED` (off por padrão).
- Fallback para stub quando:
  - flag off; ou
  - configuração Meta ausente/inválida.
- Novo endpoint webhook:
  - `GET /integrations/whatsapp/webhook` (handshake/verify token);
  - `POST /integrations/whatsapp/webhook` (receipts).
- Validação de assinatura (`x-hub-signature-256`) quando segredo configurado.
- Persistência de delivery receipt por `message_id/status/timestamp/raw`.

### Testes
- Unit:
  - parsing de webhook;
  - verificação de assinatura.
- Integration:
  - mock HTTP transport para envio Meta;
  - validação de persistência com sink/store mockado.

---

## Feature Flags consolidadas
- `COCKPIT_QUEUES_ENABLED` (default: off)
- `COCKPIT_CARDS_ENABLED` (default: off)
- `LLM_TASK_ROUTER_ENABLED` (default: off)
- `WHATSAPP_PROVIDER_ENABLED` (default: off)

---

## Observações de compatibilidade
- Nenhum PR alterou layout global fora do escopo definido.
- Alterações foram incrementais e com fallback controlado por flags.
- Fluxos críticos mantidos com guardrails existentes (RBAC, tenant/workspace, idempotência e trilhas de evidência).
