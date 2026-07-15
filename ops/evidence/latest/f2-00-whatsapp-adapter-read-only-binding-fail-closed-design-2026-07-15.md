# F2.0 — WhatsApp Adapter Read-Only / Binding / Fail-Closed Design — 2026-07-15

## Resumo executivo

Esta etapa cria o design documental inicial do adapter WhatsApp para o EIAH em modo estritamente `read-only`, com papel explícito de `channel-adapter/render-only`, nunca de runtime paralelo. O objetivo é definir binding seguro entre número de telefone e identidade governada, sessão com TTL, regras de fail-closed, validação de assinatura, masking de PII, reasonCodes mínimos e o pacote mínimo de evidência por evento, sem implementar webhook real, sem endpoint produtivo e sem qualquer side effect externo.

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

Observacao:
- `plano_unificacao_EIAH_interativo_atualizado_pos_F1_7f.html` nao foi encontrado no workspace durante esta etapa.

## Contexto herdado de F1.7d/F1.7f

- F1.7d ja esta evidenciado e mergeado como primeiro run real PASS do gate informativo mobile smoke.
- F1.7f ja esta mergeado como politica documental de recorrencia e promocao futura desse gate.
- F1.7e nao deve ser aberta agora; permanece reservada exclusivamente para `Smoke Failure Analysis/Fix` caso surja falha real futura.
- O gate mobile smoke permanece informativo, nao bloqueante.
- Qualquer promocao futura do gate mobile smoke continua dependendo de etapa separada e recorrencia suficiente.

Leitura de governanca para F2.0:
- a frente F2 pode avancar apenas como design/documentacao;
- sem alterar `ChatAgentLauncher`;
- sem criar runtime paralelo;
- sem enfraquecer a arquitetura `agent-driven`.

## Decisão de não abrir F1.7e

F1.7e nao e acionada nesta etapa.

Motivo:
- nao houve falha real nova do mobile smoke;
- F2.0 e uma frente documental distinta, focada em canal WhatsApp;
- misturar failure analysis do smoke com design de adapter multicanal criaria drift de escopo.

Reserva normativa preservada:
- `F1.7e = Smoke Failure Analysis/Fix`
- somente se surgir falha real futura no gate mobile smoke.

## Objetivo da F2.0

Definir o design conceitual minimo do WhatsApp Adapter para operar como canal de entrada e saida **read-only**, com binding governado e fail-closed, sem abrir novas superficies de mutacao, sem bypass do runtime existente e sem runtime paralelo ao `engine`.

## Escopo read-only

Neste design, o adapter WhatsApp so pode:

- receber evento assinado de provedor futuro;
- validar assinatura e formato do payload;
- resolver binding numero -> identidade -> tenant -> workspace -> scope;
- validar entitlement e elegibilidade de sessao;
- encaminhar o turno para o fluxo governado do EIAH como canal de apresentacao;
- responder apenas com conteudo read-only e seguro;
- registrar evidencias e logs com masking de PII.

O adapter **nao pode**:

- criar lead;
- descartar lead;
- disparar acao critica;
- criar mutacao operacional;
- escrever em sistemas externos;
- executar side effect sem etapa futura explicitamente autorizada.

## Fora de escopo

- implementacao de webhook real
- endpoint produtivo
- alteracao de runtime
- alteracao de engine
- alteracao de `ChatAgentLauncher`
- alteracao de contratos runtime de agente
- alteracao em `apps/**`
- alteracao em `packages/**`
- alteracao em `scripts/**`
- alteracao em workflows
- migrations
- uso de secrets
- integracao com provedor WhatsApp real
- `lead.create`
- `lead.discard`
- qualquer mutacao ou side effect externo

## Contrato conceitual do adapter

Contrato conceitual proposto:

- `channel`: `whatsapp`
- `adapterMode`: `read_only`
- `adapterRole`: `render_only_channel_adapter`
- `runtimeAuthority`: `engine`
- `launcherAuthority`: `none`
- `mutationAuthority`: `blocked`
- `criticalActionAuthority`: `blocked`

Interpretacao:
- o adapter nao decide comportamento cognitivo;
- o adapter nao substitui o `engine`;
- o adapter nao cria runtime paralelo;
- o adapter so traduz entrada/saida do canal, preservando a decisao governada do sistema central.

Regra estrutural:
- `Agente define`
- `Engine executa`
- `WhatsApp adapter transporta/renderiza`

## Binding número → identidade → tenant/workspace/scope

Cadeia minima de binding proposta:

`phone_number` -> `bound_identity` -> `tenantId` -> `workspaceId` -> `scope` -> `entitlements`

Requisitos:

1. O numero de telefone precisa estar previamente vinculado a uma identidade governada.
2. A identidade precisa resolver exatamente um `tenantId` valido.
3. O `tenantId` precisa resolver um `workspaceId` valido para o contexto do canal.
4. O `scope` precisa ser explicitamente conhecido para o canal WhatsApp.
5. O entitlement precisa estar presente e ativo antes de qualquer resposta.

Invariantes:

- sem binding, bloquear;
- sem `tenantId`, bloquear;
- sem `workspaceId`, bloquear;
- sem `scope`, bloquear;
- sem entitlement, bloquear;
- nunca assumir `tenant/workspace` por default;
- nunca usar numero sozinho como autorizacao suficiente.

## Sessão e TTL

Sessao conceitual proposta:

- chave logica: `whatsapp_session:{tenantId}:{workspaceId}:{boundIdentity}:{phoneHash}`
- modo: `read_only_session`
- TTL inicial proposto: `24h`
- expiracao antecipada:
  - revogacao de binding;
  - revogacao de entitlement;
  - mudanca invalida de `workspace`;
  - invalidez de assinatura;
  - deteccao de payload inconsistente.

Regra operacional:
- sessao expirada nao pode ser renovada implicitamente por evento invalido;
- ao expirar, deve exigir nova resolucao governada do binding;
- o TTL e uma proposta de design, nao implementacao runtime nesta etapa.

## Fail-closed e reasonCodes

ReasonCodes minimos propostos:

- `WHATSAPP_SIGNATURE_INVALID`
- `WHATSAPP_PAYLOAD_INVALID`
- `WHATSAPP_PHONE_NOT_BOUND`
- `TENANT_NOT_RESOLVED`
- `WORKSPACE_NOT_RESOLVED`
- `ENTITLEMENT_REQUIRED`
- `SESSION_EXPIRED`
- `READ_ONLY_MODE`
- `CRITICAL_ACTION_BLOCKED`

Politica fail-closed:

1. assinatura invalida -> rejeitar evento, nao processar payload
2. payload invalido -> rejeitar evento, nao abrir sessao
3. numero nao vinculado -> bloquear com mensagem segura de vinculacao
4. tenant ausente -> bloquear
5. workspace ausente -> bloquear
6. entitlement ausente -> bloquear
7. sessao expirada -> bloquear ate nova resolucao governada
8. tentativa de mutacao/acao critica -> bloquear em `READ_ONLY_MODE` ou `CRITICAL_ACTION_BLOCKED`

Mensagens ao usuario devem:
- ser seguras e curtas;
- nao expor detalhes internos de tenant/workspace;
- nao confirmar dados sensiveis sem binding valido.

## Validação de assinatura webhook

Design minimo proposto:

- assinatura obrigatoria em header dedicado do provedor;
- validacao com comparacao constant-time;
- rejeicao imediata se assinatura ausente, malformada ou invalida;
- payload so pode ser processado apos assinatura valida;
- raw body deve ser preservado para a verificacao;
- nenhum fallback permissivo e permitido.

Regras:
- sem assinatura valida, retorna bloqueio fail-closed;
- nenhum evento sem assinatura valida deve abrir sessao;
- nenhum evento com payload corrompido deve seguir para binding;
- a validacao de assinatura e requisito de design desta etapa, nao implementacao real.

## PII masking e logging seguro

Masking minimo proposto:

- numero de telefone: nunca logar completo; expor apenas sufixo curto ou hash
- nome do contato: mascarar ou omitir
- payload bruto: nunca persistir integralmente em evidencia textual
- ids internos: registrar apenas os necessarios para auditoria tecnica

Politica de logging:

- logs devem ser minimamente suficientes para auditoria;
- logs nao devem conter PII aberta;
- evidencias devem privilegiar hashes, suffixes e campos estruturados;
- qualquer dado sensivel deve ser mascarado antes de aparecer em docs/evidencias.

## Evidências necessárias por evento

Cada evento relevante futuro deve gerar, no minimo:

- `eventId` ou equivalente do provedor
- timestamp
- canal `whatsapp`
- `phoneHash` ou identificador mascarado
- resultado da validacao de assinatura
- resultado da validacao do payload
- resultado do binding
- `tenantId` e `workspaceId` apenas se resolvidos e permitidos para auditoria
- `reasonCode` final
- classificacao do evento (`accepted_read_only` ou `blocked_fail_closed`)
- indicacao explicita de ausencia de mutacao
- indicacao explicita de ausencia de side effect externo

Sem esse pacote minimo:
- o evento nao deve ser tratado como evidência forte;
- e o adapter nao deve ser considerado governado.

## Fluxos textuais

### 1. Número vinculado, sessão válida, pedido read-only

1. receber evento assinado
2. validar assinatura
3. validar payload
4. resolver identidade pelo numero vinculado
5. resolver `tenantId`, `workspaceId` e `scope`
6. validar entitlement
7. validar sessao/TTL
8. encaminhar pedido ao fluxo governado do EIAH em modo read-only
9. responder sem mutacao
10. registrar evidencia segura

### 2. Número não vinculado

1. receber evento
2. validar assinatura e payload
3. falhar ao resolver binding
4. bloquear em fail-closed
5. registrar `WHATSAPP_PHONE_NOT_BOUND`
6. retornar mensagem segura de vinculacao
7. nao executar acao

### 3. Assinatura inválida

1. receber evento
2. falhar na validacao da assinatura
3. rejeitar evento imediatamente
4. registrar `WHATSAPP_SIGNATURE_INVALID`
5. nao processar payload
6. nao abrir sessao
7. nao executar acao

### 4. Tentativa de ação crítica

1. receber evento valido
2. resolver binding e contexto
3. detectar intencao de mutacao/acao critica
4. bloquear por `READ_ONLY_MODE` ou `CRITICAL_ACTION_BLOCKED`
5. nao criar run critico
6. nao gerar side effect
7. registrar evidencia do bloqueio

## Riscos e mitigação

| Risco | Impacto | Mitigação |
| --- | --- | --- |
| Adapter virar runtime paralelo | drift arquitetural | fixar contrato como `render_only_channel_adapter` e autoridade no `engine` |
| Binding fraco por numero | acesso indevido | exigir cadeia completa `numero -> identidade -> tenant -> workspace -> scope -> entitlement` |
| Payload/assinatura invalida | spoofing ou processamento indevido | fail-closed antes de qualquer resolucao |
| Vazamento de PII em logs | risco operacional/compliance | masking obrigatorio e proibicao de payload bruto em evidencia |
| Escopo expandir para mutacoes cedo demais | side effects nao governados | bloquear explicitamente `lead.create`, `lead.discard` e acoes criticas |

## Critérios de DoD

- documento de design criado
- Evidence Index atualizado
- nenhuma alteracao em `app/runtime/engine/launcher/workflows/packages/scripts`
- fail-closed documentado
- binding `tenant/workspace/scope` documentado
- PII masking documentado
- side effects explicitamente bloqueados
- F1.7e preservada para falha real futura
- gate mobile smoke preservado como informativo

## Checks executados

- `pnpm check:evidence-index`
- `pnpm check:docs-link-integrity`
- `git diff --check`
- `git diff -- .github/workflows release.yml apps packages scripts`

## Prova de isolamento

- nenhuma alteracao em `.github/workflows/**`
- nenhuma alteracao em `release.yml`
- nenhuma alteracao em `apps/**`
- nenhuma alteracao em `packages/**`
- nenhuma alteracao em `scripts/**`
- nenhuma alteracao em runtime/engine
- nenhuma alteracao em `ChatAgentLauncher`
- nenhuma alteracao em contratos runtime de agente

## Próximos passos

- abrir etapa futura separada para contrato tecnico do adapter, se a frente multicanal for priorizada
- manter WhatsApp ainda como design/read-only, nao operacional
- avaliar etapa futura de webhook controlado somente apos aprovacao explicita de implementacao e escopo de seguranca

## Status final

Status: proposta
