# Runbook — WhatsApp Read-Only Adapter

## Objetivo

Operar o adapter WhatsApp em modo estritamente read-only, com fail-closed por padrao, evidencia auditavel e politica clara de disable/rollback.

Este runbook nao autoriza operacao produtiva do canal. Ele define a politica operacional para a superficie controlada ja evidenciada em F2.3-F2.8.

## Escopo

- Endpoint controlado: `POST /api/webhooks/whatsapp/inbound`
- Envelope: `whatsapp.adapter.event.v1`
- Export auditavel: `whatsapp.read_only.bundle_export.v1`
- Modo operacional permitido: `read_only`
- Papel do adapter: `channel-adapter/render-only`

## Fora de escopo operacional

- Integracao com provider WhatsApp real.
- Uso de secret produtivo.
- Webhook produtivo publico.
- Ledger produtivo obrigatorio.
- Mutacoes como `lead.create` ou `lead.discard`.
- Qualquer acao critica.
- Regra cognitiva nova no runtime, engine ou `ChatAgentLauncher`.

## Invariantes obrigatorios

1. Provider real ausente continua sendo estado esperado desta etapa.
2. Secret produtivo ausente continua sendo estado esperado desta etapa.
3. Toda mutacao deve permanecer bloqueada.
4. `sideEffects=0` deve aparecer no `evidenceBundle` e no `bundleExport`.
5. `piiMasked=true` deve permanecer no export auditavel.
6. O adapter nao decide intent, nao cria runtime paralelo e nao bypassa o engine.
7. Ausencia de assinatura valida, binding, tenant, workspace, scope, entitlement ou sessao valida deve falhar fechada.

## Owners

| Area | Owner primario | Escalation |
| --- | --- | --- |
| Adapter/API | Backend/API owner | Tech lead |
| Channel binding e replay guard | Platform governance owner | Tech lead |
| Evidencia e runbook | DocOps owner | Platform governance owner |
| Incidente de seguranca/PII | Security owner | Founder/Executive owner |
| Decisao de ativacao produtiva futura | Product/Platform owner | Founder/Executive owner |

Sem owner designado para a janela operacional, o adapter deve permanecer desabilitado ou limitado ao modo local/controlado.

## Classes de incidente

| Classe | Condicao | Severidade | Acao imediata |
| --- | --- | --- | --- |
| WA-RO-P0 | Mutacao executada, side effect externo, secret produtivo exposto ou PII vazada | P0 | Disable imediato, preservar evidencia, acionar Security e Founder/Executive owner |
| WA-RO-P1 | Fail-closed quebrado para assinatura, replay, binding, tenant, workspace, entitlement ou acao critica | P1 | Disable imediato e bloquear promocao ate gate voltar a passar |
| WA-RO-P2 | Drift no contrato `whatsapp.read_only.bundle_export.v1`, `sideEffects != 0`, `piiMasked != true` ou reasonCode critico ausente | P2 | Congelar deploy, corrigir contrato/gate e gerar evidencia |
| WA-RO-P3 | Degradacao documental, evidencia ausente, runbook desatualizado ou owner nao declarado | P3 | Corrigir DocOps antes de qualquer nova promocao |

## Politica de fail-closed

O adapter deve retornar bloqueio auditavel quando qualquer criterio abaixo falhar:

- provider ausente ou nao suportado;
- header de assinatura ausente, malformado ou invalido;
- timestamp fora da janela permitida;
- `eventId` duplicado ou replay detectado;
- envelope diferente de `whatsapp.adapter.event.v1`;
- payload minimo invalido;
- telefone sem binding governado;
- `tenantId`, `workspaceId`, `scope` ou entitlement nao resolvido;
- sessao expirada;
- `readOnly=false`;
- tentativa de `lead.create`, `lead.discard` ou qualquer acao critica;
- impossibilidade de gerar `evidenceBundle` ou `bundleExport` sanitizado.

Nao deve existir fallback permissivo. Na duvida, bloquear.

## Politica de disable/rollback

### Disable imediato

Aplicar disable imediato quando houver WA-RO-P0 ou WA-RO-P1.

Acao esperada:

1. Bloquear exposicao da rota no ambiente afetado ou remover roteamento externo para o webhook.
2. Manter o handler em modo read-only caso a rota continue acessivel internamente.
3. Preservar logs sanitizados, `eventId`, `reasonCode`, `decisionClass`, `status`, `sideEffects` e timestamps.
4. Confirmar que nenhum provider real, secret produtivo, mutacao ou side effect foi ativado.
5. Abrir evidencia em `ops/evidence/latest`.

### Rollback documental/contratual

Quando o problema for drift de contrato ou evidencia:

1. Reverter somente a mudanca documental/contratual que introduziu o drift.
2. Preservar o contrato congelado `whatsapp.read_only.bundle_export.v1`.
3. Reexecutar os checks documentais e de contrato aplicaveis.
4. Atualizar o Evidence Index apenas depois de evidencia fisica e verificavel.

### Rollback de codigo futuro

Se uma etapa futura alterar codigo do adapter:

1. Reverter para o ultimo commit em que F2.8 estava preservada.
2. Revalidar `sideEffects=0`, `piiMasked=true`, reasonCodes criticos e ausencia de PII/sensitives.
3. Confirmar que `lead.create`, `lead.discard` e acoes criticas continuam bloqueadas.
4. Confirmar ausencia de diff em workflows e `release.yml`, salvo autorizacao explicita em etapa separada.

## Evidencia minima por incidente

Cada incidente deve registrar:

- data/hora UTC;
- ambiente;
- classe do incidente;
- owner acionado;
- `eventId` ou identificador sanitizado equivalente;
- `reasonCode`;
- `decisionClass`;
- status HTTP;
- `sideEffects`;
- confirmacao de PII mascarada;
- confirmacao de provider real ausente ou, em etapa futura autorizada, provider envolvido;
- decisao de rollback/disable;
- checks executados apos mitigacao.

## Checks obrigatorios antes de qualquer promocao

- `pnpm check:evidence-index`
- `pnpm check:docs-link-integrity`
- `git diff --check`
- `git diff -- .github/workflows release.yml apps packages scripts`

Quando houver alteracao de codigo do adapter, tambem executar os testes focados do handler, `ChannelBinding`, `Replay Guard`, orphan tests e gate de compatibilidade do export.

## Criterios de promocao futura

Qualquer saida de read-only controlado exige etapa separada com:

- provider real escolhido e documentado;
- secret produtivo provisionado por canal governado;
- webhook produtivo criado com assinatura, replay e idempotencia validados;
- ledger/receipt quando houver acao critica;
- HITL e policy para qualquer mutacao;
- contrato versionado novo quando o shape do export mudar;
- evidencia real indexavel;
- decisao explicita de owner executivo.

Enquanto esses criterios nao existirem, o status operacional permanece `parcial/evidenciado` e o canal nao deve ser tratado como WhatsApp produtivo.
