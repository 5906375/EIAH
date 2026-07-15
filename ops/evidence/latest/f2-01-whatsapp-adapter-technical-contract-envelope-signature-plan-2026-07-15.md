# F2.1 — WhatsApp Adapter Technical Contract / Envelope / Signature Validation Plan — 2026-07-15

## Resumo executivo

Esta etapa define o contrato técnico documental do WhatsApp Adapter em modo estritamente `contracts-first`, preservando o desenho read-only e fail-closed da F2.0. O foco aqui é formalizar envelope versionado de evento inbound, headers obrigatórios, canonical string conceitual para assinatura, replay protection, idempotência, validação de payload, reasonCodes técnicos adicionais, masking de PII e pacote mínimo de evidência por evento, sem implementar webhook real, sem endpoint produtivo e sem qualquer side effect externo.

## Arquivos lidos

- `CODEX.md`
- `IA_EIAH.md`
- `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`
- `AGENTS.md`
- `docs/architecture/agent-chat-runtime.md`
- `docs/EVIDENCE_INDEX.md`
- `.github/workflows/ci.yml`
- `ops/evidence/latest/f1-07d-first-real-ci-informative-mobile-smoke-run-2026-07-15.md`
- `ops/evidence/latest/f1-07f-mobile-smoke-informative-recurrence-promotion-policy-2026-07-15.md`
- `ops/evidence/latest/f2-00-whatsapp-adapter-read-only-binding-fail-closed-design-2026-07-15.md`

## Contexto herdado de F1.7d/F1.7f/F2.0

- F1.7d provou o primeiro run real PASS do gate informativo mobile smoke.
- F1.7f formalizou a política de recorrência e eventual promoção futura desse gate, ainda sem status bloqueante.
- F2.0 formalizou o adapter WhatsApp como `channel-adapter/render-only`, com binding governado, read-only e fail-closed.
- WhatsApp segue não operacional nesta etapa.
- Não existe webhook real nesta etapa.

Leitura de governança:
- a evolução F2.x continua estritamente documental;
- o canal WhatsApp ainda não autoriza runtime novo;
- qualquer implementação futura deve preservar a autoridade do `engine` e o `ChatAgentLauncher` como render-only.

## Decisão de não abrir F1.7e

F1.7e continua fechada nesta etapa.

Motivo:
- não houve falha real nova do mobile smoke;
- F2.1 é uma frente multicanal documental distinta;
- misturar failure analysis do smoke com contrato técnico do adapter geraria drift de escopo.

Reserva normativa preservada:
- `F1.7e = Smoke Failure Analysis/Fix`
- somente se surgir falha real futura no gate mobile smoke.

## Objetivo da F2.1

Definir o contrato técnico mínimo do WhatsApp Adapter para eventos inbound em modo read-only:

- envelope versionado;
- headers obrigatórios;
- assinatura conceitual;
- replay protection;
- idempotência;
- validação fail-closed do payload;
- evidência mínima por evento.

## Escopo contracts-first

Esta etapa documenta:

- a forma canônica do evento inbound;
- os campos mínimos necessários para governança;
- o protocolo técnico conceitual de verificação;
- os campos necessários para binding e escopo;
- os bloqueios obrigatórios antes de qualquer ação.

Esta etapa não implementa:
- handler;
- rota;
- persistência;
- chamadas ao provedor;
- segredos reais;
- fluxo produtivo.

## Fora de escopo

- implementação de webhook real
- endpoint produtivo
- alteração de runtime
- alteração de engine
- alteração de `ChatAgentLauncher`
- alteração em `apps/**`
- alteração em `packages/**`
- alteração em `scripts/**`
- alteração em workflows
- migrations
- uso de secrets
- integração com provedor WhatsApp real
- chamadas de API externas
- `lead.create`
- `lead.discard`
- qualquer mutação
- qualquer side effect externo

## Envelope técnico versionado

Envelope técnico mínimo proposto:

```json
{
  "version": "whatsapp.adapter.event.v1",
  "eventId": "string",
  "provider": "whatsapp",
  "receivedAt": "ISO-8601",
  "providerTimestamp": "ISO-8601",
  "fromPhoneHash": "string",
  "fromPhoneMasked": "string",
  "messageType": "text | interactive | unknown",
  "text": "string | null",
  "rawPayloadRef": "masked-or-redacted-ref",
  "tenantId": "string | null",
  "workspaceId": "string | null",
  "scope": "string | null",
  "readOnly": true
}
```

Invariantes propostos:

- `version` obrigatória e fixa para o contrato atual
- `provider` deve ser exatamente `whatsapp`
- `eventId` obrigatório e único por evento
- `receivedAt` e `providerTimestamp` obrigatórios
- `fromPhoneHash` obrigatório
- `fromPhoneMasked` obrigatório
- `readOnly` deve ser sempre `true` nesta fase
- `tenantId`, `workspaceId` e `scope` podem começar `null` antes da resolução governada, mas não podem seguir para resposta se permanecerem `null`

## Headers obrigatórios

Headers mínimos propostos:

- `X-EIAH-Provider`
- `X-EIAH-Event-Id`
- `X-EIAH-Timestamp`
- `X-EIAH-Signature`
- `X-EIAH-Signature-Version`

Interpretação:

- `X-EIAH-Provider`: identifica o canal/provedor esperado
- `X-EIAH-Event-Id`: chave de idempotência lógica do evento
- `X-EIAH-Timestamp`: base para replay protection
- `X-EIAH-Signature`: material assinado a validar
- `X-EIAH-Signature-Version`: permite versionar algoritmo/política sem ambiguidades

Regra:
- ausência de qualquer header obrigatório deve resultar em bloqueio fail-closed

## Payload mínimo inbound

Payload mínimo inbound esperado pelo adapter:

- `eventId`
- `provider`
- `providerTimestamp`
- `messageType`
- `text` quando aplicável
- `rawPayloadRef` mascarado/redigido
- identidade de origem representada apenas por forma segura (`fromPhoneHash`, `fromPhoneMasked`)

Campos proibidos nesta fase:

- qualquer campo que autorize mutação direta
- qualquer sinal que bypass o binding governado
- qualquer conteúdo bruto de PII em evidência textual

## Canonical string e assinatura

Canonical string conceitual proposta:

```text
X-EIAH-Provider + "\n" +
X-EIAH-Event-Id + "\n" +
X-EIAH-Timestamp + "\n" +
version + "\n" +
providerTimestamp + "\n" +
messageType + "\n" +
payloadDigest
```

Onde:

- `payloadDigest` é um digest determinístico do corpo bruto ou de representação canônica equivalente;
- a string deve ser montada sempre na mesma ordem;
- validação deve usar comparação constant-time;
- nenhum secret real é usado nesta etapa, apenas o plano conceitual do processo.

Política proposta:

- assinatura ausente -> bloqueio
- assinatura malformada -> bloqueio
- versão de assinatura desconhecida -> bloqueio
- canonical string inconsistente -> bloqueio
- payload alterado após assinatura -> bloqueio

## Replay protection

Replay protection proposta:

- janela temporal máxima baseada em `X-EIAH-Timestamp`
- `eventId` deve ser reutilizado para detectar replay
- eventos fora da janela devem ser rejeitados antes de binding

Critério conceitual:

- `X-EIAH-Timestamp` ausente -> bloqueio
- `X-EIAH-Timestamp` fora da janela aceitável -> bloqueio
- repetição de `eventId` dentro da janela -> classificar como replay ou duplicado

Janela conceitual inicial proposta:

- `5 minutos` como baseline de design

Esta janela é proposta documental, não implementação final.

## Idempotência

Idempotência proposta:

- chave primária lógica: `eventId`
- mesmo `eventId` não deve gerar reprocessamento funcional
- eventos duplicados devem retornar decisão segura e auditável

Estados conceituais possíveis:

- `first_seen`
- `duplicate_ignored`
- `replay_blocked`

Regra:
- idempotência deve ser resolvida antes de qualquer tentativa de resposta operacional;
- nenhum evento duplicado pode gerar mutação ou side effect.

## Validação de payload

Validações mínimas propostas:

- `provider` deve ser suportado
- `eventId` obrigatório e não vazio
- `providerTimestamp` obrigatório e parseável
- `messageType` permitido apenas em `text | interactive | unknown`
- `text` obrigatório somente quando `messageType=text`
- payload bruto não pode ultrapassar limite máximo aceitável
- `readOnly` deve permanecer verdadeiro no envelope interno

Critérios fail-closed:

- campo obrigatório ausente -> bloquear
- tipo inválido -> bloquear
- payload excessivo -> bloquear
- provider não suportado -> bloquear
- `messageType` não suportado -> bloquear

## Binding e escopo

O contrato técnico herda de F2.0 a seguinte cadeia:

`fromPhoneHash/fromPhoneMasked` -> identidade vinculada -> `tenantId` -> `workspaceId` -> `scope` -> `entitlement`

Regra técnica:

- validações de envelope/assinatura/replay/idempotência acontecem antes do binding;
- binding só pode ocorrer após evento tecnicamente válido;
- ausência de binding ou escopo válido interrompe o fluxo;
- não existe fallback permissivo para `tenant/workspace`.

## Fail-closed e reasonCodes

ReasonCodes herdados de F2.0:

- `WHATSAPP_SIGNATURE_INVALID`
- `WHATSAPP_PAYLOAD_INVALID`
- `WHATSAPP_PHONE_NOT_BOUND`
- `TENANT_NOT_RESOLVED`
- `WORKSPACE_NOT_RESOLVED`
- `ENTITLEMENT_REQUIRED`
- `SESSION_EXPIRED`
- `READ_ONLY_MODE`
- `CRITICAL_ACTION_BLOCKED`

ReasonCodes técnicos adicionais propostos em F2.1:

- `WHATSAPP_SIGNATURE_MISSING`
- `WHATSAPP_SIGNATURE_VERSION_UNSUPPORTED`
- `WHATSAPP_TIMESTAMP_MISSING`
- `WHATSAPP_TIMESTAMP_OUT_OF_WINDOW`
- `WHATSAPP_REPLAY_DETECTED`
- `WHATSAPP_EVENT_DUPLICATE`
- `WHATSAPP_EVENT_ID_MISSING`
- `WHATSAPP_PROVIDER_UNSUPPORTED`
- `WHATSAPP_MESSAGE_TYPE_UNSUPPORTED`
- `WHATSAPP_PAYLOAD_TOO_LARGE`

Leitura operacional:

- falhas técnicas devem bloquear antes do binding;
- falhas de binding/escopo devem bloquear antes de qualquer resposta contextual;
- falhas de mutação/ação crítica devem bloquear em `READ_ONLY_MODE` ou `CRITICAL_ACTION_BLOCKED`.

## PII masking e logging seguro

Masking obrigatório proposto:

- telefone completo: proibido em logs/evidências
- usar `fromPhoneHash`
- usar `fromPhoneMasked` com sufixo curto
- `text` sensível: truncar, redigir ou omitir quando necessário
- `rawPayloadRef`: apenas referência mascarada/redigida

Logging seguro deve registrar:

- versão do envelope
- `eventId`
- provider
- `receivedAt`
- resultado da assinatura
- resultado do replay/idempotência
- resultado do binding
- `reasonCode`
- classificação final

Sem registrar:

- telefone completo
- payload bruto integral
- secret
- assinatura em claro reaproveitável

## Evidências necessárias por evento

Cada evento relevante futuro deve produzir, no mínimo:

- `eventId`
- `version`
- `provider`
- `receivedAt`
- `providerTimestamp`
- `fromPhoneHash`
- `fromPhoneMasked`
- `messageType`
- resultado da validação de headers
- resultado da validação de assinatura
- resultado do replay protection
- resultado da idempotência
- resultado da validação de payload
- resultado do binding
- `tenantId/workspaceId/scope` somente quando adequadamente resolvidos e permitidos em auditoria
- `reasonCode`
- classificação final
- prova de ausência de mutação
- prova de ausência de side effect externo

## Testes negativos futuros

Lista mínima de testes negativos futuros proposta:

1. assinatura ausente
2. assinatura malformada
3. versão de assinatura não suportada
4. timestamp ausente
5. timestamp fora da janela
6. `eventId` ausente
7. `eventId` duplicado
8. replay do mesmo evento
9. provider não suportado
10. `messageType` não suportado
11. payload acima do limite
12. payload inconsistente com `messageType`
13. telefone não vinculado
14. `tenantId` não resolvido
15. `workspaceId` não resolvido
16. entitlement ausente
17. sessão expirada
18. tentativa de ação crítica em modo read-only

## Fluxos textuais

### 1. Evento válido read-only

1. validar headers
2. validar assinatura
3. validar timestamp
4. validar idempotência
5. validar payload
6. resolver binding
7. responder em modo read-only
8. registrar evidência mascarada

### 2. Assinatura ausente ou inválida

1. receber headers/payload
2. detectar ausência ou invalidade de assinatura
3. bloquear fail-closed
4. registrar `WHATSAPP_SIGNATURE_MISSING` ou `WHATSAPP_SIGNATURE_INVALID`
5. não processar payload
6. não resolver binding
7. não gerar side effect

### 3. Replay ou evento duplicado

1. validar assinatura e timestamp
2. detectar `eventId` repetido ou replay
3. bloquear reprocessamento
4. registrar `WHATSAPP_REPLAY_DETECTED` ou `WHATSAPP_EVENT_DUPLICATE`
5. retornar decisão segura
6. não executar ação

### 4. Tentativa de ação crítica

1. evento tecnicamente válido
2. binding resolvido
3. intencao de mutacao detectada
4. bloquear em `READ_ONLY_MODE` ou `CRITICAL_ACTION_BLOCKED`
5. não criar run crítico
6. não executar mutação
7. registrar evidência do bloqueio

## Riscos e mitigação

| Risco | Impacto | Mitigação |
| --- | --- | --- |
| Envelope ambíguo | implementações divergentes | versão fixa `whatsapp.adapter.event.v1` |
| Headers insuficientes | assinatura/replay frágeis | headers mínimos obrigatórios |
| Assinatura sem canonicalização | validação inconsistente | canonical string explícita e ordenada |
| Duplicidade/replay | reprocessamento indevido | timestamp + `eventId` + decisão idempotente |
| PII em evidências | risco operacional/compliance | hash, masked phone e redaction obrigatórios |
| Escopo expandir cedo demais | side effects não governados | read-only explícito e bloqueio de mutações |

## Critérios de DoD

- documento de contrato técnico criado
- Evidence Index atualizado
- nenhuma alteração em `app/runtime/engine/launcher/workflows/packages/scripts`
- envelope versionado documentado
- headers obrigatórios documentados
- assinatura conceitual documentada
- replay protection documentado
- idempotência documentada
- reasonCodes documentados
- testes negativos futuros listados
- side effects explicitamente bloqueados
- F1.7e preservada para falha real futura
- gate mobile smoke preservado como informativo

## Checks executados

- `pnpm check:evidence-index`
- `pnpm check:docs-link-integrity`
- `git diff --check`
- `git diff -- .github/workflows release.yml apps packages scripts`

## Prova de isolamento

- nenhuma alteração em `.github/workflows/**`
- nenhuma alteração em `release.yml`
- nenhuma alteração em `apps/**`
- nenhuma alteração em `packages/**`
- nenhuma alteração em `scripts/**`
- nenhuma alteração em runtime/engine
- nenhuma alteração em `ChatAgentLauncher`

## Próximos passos

- abrir etapa futura separada para especificação de endpoint/webhook controlado, se a frente multicanal for priorizada
- manter WhatsApp como design técnico não operacional
- só avançar para implementação após aprovação explícita de segurança, contrato e escopo

## Status final

Status: proposta
