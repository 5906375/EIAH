# IMOB Chat Document Intake — Runbook de Piloto Controlado

**Data:** 2026-06-18
**Feature:** `feat/imob-chat-document-intake`
**Classificação:** PILOTO CONTROLADO — single-node, não declarar DONE global.

---

## 1. Escopo do piloto

### O que está habilitado

- Upload de contratos DOCX via `POST /api/imob/chat/intake/upload`
- Confirm de draft e criação de ImobCase via `POST /api/imob/chat/intake/confirm/:draftId`
- Export do contrato processado via `GET /api/imob/runs/:runId/intake/export?format=html|docx|pdf`
- actionId habilitado: `imob.contract.intake` apenas

### O que NÃO está habilitado no piloto

- Multi-instância / escalonamento horizontal (bloqueado por ativação real de object storage + draft durável)
- Auto-delete efetivo sem opt-in operacional (`UPLOAD_CLEANUP_ENABLED=true` + `UPLOAD_CLEANUP_DRY_RUN=false`)
- Failover completo de draft fora do Redis configurado
- Outros `actionId` fora de `imob.contract.intake`

---

## 2. Tenant e workspace do piloto

| Campo | Valor | Notas |
|---|---|---|
| Tenants autorizados | Definir antes de habilitar | Máximo 2–3 tenants no piloto inicial |
| Workspaces por tenant | Máximo 1 workspace por tenant no piloto | Expandir apenas após SLO estável |
| Usuários por workspace | Sem limite técnico — limite operacional 5 | Observar volume de uploads |
| agentKey requerido | `EIAH` | `workspaceAgentAssignment.enabled=true` obrigatório |

**Pré-requisito por workspace:**
```sql
-- Verificar antes de habilitar piloto para um workspace
SELECT enabled FROM workspace_agent_assignments
WHERE workspace_id = '<workspace_id>' AND agent_key = 'EIAH';
-- Deve retornar: true
```

---

## 3. Limites de volume

| Recurso | Limite piloto | Justificativa |
|---|---|---|
| Tamanho máximo do DOCX | 10 MB (enforced pelo multer) | Proteção de memória no extrator |
| Uploads por workspace/dia | Sem limite técnico — monitorar | Baseline a ser definido no piloto |
| Uploads simultâneos | Sem rate limit específico — usar rate limit global da API | Observar durante piloto |
| Drafts ativos no store | Sem limite técnico — TTL 30min limita organicamente | Cada upload = 1 draft |
| Jobs em `imobRunCompletedQueue` | 3 tentativas com backoff exponencial (2s base) | Configurado em `imobRunCompletedQueue.ts` |
| Export HTML/DOCX por run | Sem limite — geração síncrona | Observar latência em contratos grandes |

**Alerta de volume:** Se uploads/dia superar 50 por workspace antes de object storage estar disponível, revisar o piloto (risco de esgotamento de disco local).

---

## 4. Limitações documentadas

### 4.1 Storage provider configurável (local por padrão)

- O backend agora usa um `StorageProvider` para `UploadedDocument` e arquivos `.docx`.
- Em `dev/test`, o padrão continua `STORAGE_PROVIDER=local`, com persistência em `UPLOADS_DIR`.
- O `storageKey` permanece compatível e agora é scoped por `tenantId/workspaceId` quando o upload entra pelos fluxos autenticados do intake/uploads.
- O modo `object` exige gate explícito por `env`: `OBJECT_STORAGE_ADAPTER`, `OBJECT_STORAGE_BUCKET`, `OBJECT_STORAGE_PREFIX`, `OBJECT_STORAGE_ENDPOINT`, `OBJECT_STORAGE_REGION`, `OBJECT_STORAGE_ACCESS_KEY_ID`, `OBJECT_STORAGE_SECRET_ACCESS_KEY`.
- Nesta build, `OBJECT_STORAGE_ADAPTER=s3-compatible` está **validado/configurado em fail-closed**, mas ainda **não possui adapter real instalado** no backend para executar put/get contra bucket real.
- Na decisão documental da Fase 8.5, o adapter técnico permanece `s3-compatible`, com `Cloudflare R2` como alvo preferencial do primeiro smoke e `AWS S3` como alternativa compatível.
- Na verificação operacional da Fase 8.5, o host atual não apresentou `bucket`, `endpoint`, credenciais nem seleção explícita de provider; portanto o object storage real e o smoke de bucket permaneceram `NO-GO`.
- No modo local, os arquivos ficam em `uploads/{tenantId}/{workspaceId}/{uuid}.docx` no **filesystem local do processo API**.
- Em reinício do container `eiah-api`, os arquivos **são preservados** se o volume Docker estiver mapeado.
- Em **recriação do container** (`docker compose up --force-recreate`), arquivos são perdidos se não houver volume persistente.
- Path traversal em `storageKey` é bloqueado pelo provider antes de qualquer leitura/escrita.
- Se `STORAGE_PROVIDER=object` estiver ativo sem configuração completa, a API deve falhar de forma explícita. Não existe fallback silencioso para local nesse modo.

**Ação preventiva:**
```yaml
# Verificar em docker-compose.dev.yml se existe volume para uploads/
volumes:
  - ./uploads:/app/uploads   # deve existir para preservar arquivos
```

Se o volume não estiver mapeado: uploads existentes ficam inacessíveis após recriação do container. Leitura posterior de anexos e downloads por `UploadedDocument` podem falhar.

### 4.2 Draft store configurável (Redis preferencial)

- O intake agora suporta `DRAFT_STORE=redis|memory`.
- Em runtime normal do piloto, o default é `redis`.
- Em `node --test` e fallback explícito de desenvolvimento, `memory` continua disponível para compatibilidade local.
- O TTL padrão continua `30 min` (`DRAFT_TTL_MS=1800000`), com `draftId` opaco e sem PII.
- Com `DRAFT_STORE=redis`, restart do processo API **não** perde drafts ainda válidos.
- Com `DRAFT_STORE=memory`, restart do processo ainda apaga todos os drafts.
- Cross-workspace continua fail-closed no `consumeDraft`.

**Comunicação ao usuário:**

> "Se o sistema for reiniciado enquanto você está revisando o documento, o draft deve continuar disponível quando o piloto estiver operando com Redis. Se o ambiente estiver em fallback local (`memory`), pode ser necessário reenviar o arquivo."

### 4.3 Retenção e cleanup de uploads do intake

- O piloto agora possui política de retenção por idade para uploads `agentSlug=imob-intake`, baseada em `createdAt`.
- Configuração operacional:
  - `UPLOAD_RETENTION_DAYS=30` por padrão;
  - `UPLOAD_CLEANUP_ENABLED=false` por padrão;
  - `UPLOAD_CLEANUP_DRY_RUN=true` por padrão;
  - `UPLOAD_CLEANUP_INTERVAL_MS=21600000` (6h) por padrão quando o worker estiver habilitado.
- O cleanup usa o `StorageProvider` da Fase 8.0 e só remove o registro de `uploaded_documents` após confirmar que o objeto foi apagado do storage.
- Se o objeto já não existir ou se o delete falhar, o registro **não** é removido do banco; o ciclo registra falha operacional sem PII.
- Chaves legadas sem escopo (`uuid.docx`) continuam tratadas com validação segura de `storageKey`.
- Nesta fase, o cleanup é restrito aos uploads do intake IMOB; uploads genéricos de outras superfícies não entram no sweep.

**Leitura operacional:**
- `UPLOAD_CLEANUP_ENABLED=false`: worker não inicia e nenhum sweep roda automaticamente.
- `UPLOAD_CLEANUP_ENABLED=true` + `UPLOAD_CLEANUP_DRY_RUN=true`: varredura automática apenas reporta candidatos.
- `UPLOAD_CLEANUP_ENABLED=true` + `UPLOAD_CLEANUP_DRY_RUN=false`: worker apaga objeto + registro apenas para itens vencidos e confirmados.

**Ação no piloto:** manter `dry-run` até pelo menos um ciclo operacional revisado pelo time. Limiar de atenção de storage continua `> 1 GB`, com ação imediata em `> 5 GB`.

### 4.4 Sem multi-instância

- Executar exclusivamente com **uma instância** do container `eiah-api`.
- Não configurar réplicas no docker-compose ou orquestrador antes de integrar object storage (P1).
- Verificar que não existe load balancer roteando para múltiplas instâncias do API.

---

## 5. Procedimento de re-upload após restart

Quando o usuário relatar "draft não encontrado" ou receber `409 DRAFT_EXPIRED` inesperado:

**Para o usuário:**
1. Volte à tela de intake de contrato
2. Clique em "Fazer upload novamente"
3. Selecione o mesmo arquivo DOCX
4. Aguarde o processamento (extração + mascaramento)
5. Revise o resumo e confirme

**Para o operador:**
```bash
# Verificar se houve restart recente
docker logs eiah-api --since 30m | grep "SIGTERM\|restart\|started"

# Verificar se o draft existia antes do restart (não há log de draft expirado, apenas de confirm tentado)
# Se o usuário confirma que fez upload há menos de 30min e não confirmou: restart é a causa
```

**Nota:** Em `DRAFT_STORE=redis`, restart do processo API não deve invalidar drafts ainda dentro do TTL. Em `DRAFT_STORE=memory`, não há forma de recuperar um draft perdido por restart — o arquivo `.docx` pode ainda existir em disco (se o volume persistir), mas o `draftId` e metadados em memória foram perdidos. O re-upload é a única ação.

---

## 6. Métricas mínimas a observar

| Métrica | Onde observar | Alerta |
|---|---|---|
| `imob_intake_uploads_received_total` | Logs JSON do `eiah-api` (`event=upload_received`) ou `/metrics/prom` | Queda abrupta vs uso esperado = investigar upload/auth |
| `imob_intake_drafts_created_total` | Logs JSON (`event=draft_created`) ou `/metrics/prom` | Divergência grande vs uploads recebidos = investigar parser/store |
| `imob_intake_drafts_consumed_total` | Logs JSON (`event=draft_consumed`) ou `/metrics/prom` | Muito abaixo dos drafts criados = usuários não confirmando ou falha no fluxo |
| `imob_intake_drafts_expired_total` | Logs JSON (`event=draft_expired`) ou `/metrics/prom` | Tendência de alta = revisar TTL, UX e estabilidade |
| `imob_intake_cleanup_candidates_total` | Logs JSON (`event=upload_retention_candidates`) ou `/metrics/prom` | Crescimento contínuo em dry-run = planejar janela de delete efetivo |
| `imob_intake_cleanup_failures_total` | Logs JSON (`event=upload_retention_failed`) ou `/metrics/prom` | > 0 = investigar storage/delete |
| `imob_intake_storage_provider_mode_total` | Logs JSON (`event=storage_provider_mode`) ou `/metrics/prom` | `mode=object` nesta build deve ser tratado como NO-GO |
| `imob_intake_object_storage_gate_failures_total` | Logs JSON (`event=object_storage_gate_failed`) ou `/metrics/prom` | > 0 em ambiente não planejado = revisar config |
| `imob-intake.case_created` | Logs do `eiah-api` (JSON structured) | 0 por hora durante horário de uso = investigar |
| `imob-intake.run_not_success_skip` | Logs do `eiah-api` | > 5 por hora = verificar se confirm não está rodando |
| `imob-intake.idempotent_skip_existing_case` | Logs do `eiah-api` | Normal (re-envio do mesmo doc); > 10/h = verificar loop |
| Tamanho de `uploads/` | `du -sh /app/uploads` no container | > 1 GB = atenção; > 5 GB = cleanup manual |
| Jobs em `imobRunCompletedQueue` (failed) | Redis / BullMQ dashboard | > 0 = investigar (3 retries já foram esgotados) |
| Runs com `status=pending` em `imob.contract.intake` | SQL abaixo | > 0 = bug (confirm deve criar com success) |

**Leitura operacional adicional:**
- `imob_intake_uploads_received_total` é o proxy mínimo de uploads/dia do piloto.
- `imob_intake_draft_store_mode_total` evidencia o modo ativo (`memory|redis`) sem expor payload.
- `imob_intake_storage_provider_mode_total` evidencia `local|object`.
- `imob_intake_object_storage_gate_failures_total` materializa o status NO-GO do object storage quando `STORAGE_PROVIDER=object` falha fechado.

```sql
-- Runs de intake em status inesperado (deve retornar 0)
SELECT id, status, created_at
FROM runs
WHERE (request->>'actionId') = 'imob.contract.intake'
  AND status = 'pending'
ORDER BY created_at DESC
LIMIT 10;
```

```bash
# Verificar jobs falhos na fila
docker exec eiah-redis redis-cli LLEN "bull:imob-run-completed:failed"
```

---

## 7. Critérios de promoção

Condições para promover de **piloto controlado** para **produção geral**:

| Critério | Status | Condição |
|---|---|---|
| Object storage ativado com adapter real + smoke de bucket | ❌ NO-GO operacional nesta build | Fase 8.5 confirmou ausência de env/secrets seguros neste host; continua obrigatório antes de multi-instância |
| Draft durável em Redis | ✅ Implementado para piloto | Requer Redis operacional e monitoração antes de escala |
| Auto-delete de uploads | ✅ Implementado em modo seguro | Exige `UPLOAD_CLEANUP_ENABLED=true`; `dry-run` continua recomendado no piloto |
| Política de retenção definida | ✅ Definida tecnicamente para o piloto | Janela padrão `30 dias`, sujeita a revisão jurídico/produto |
| SLO de 7 dias de piloto sem incidente P1 | ⏳ A validar | 7 dias de piloto estável |
| Volume validado (> 50 uploads/semana) | ⏳ A validar | Baseline de carga real |

**Nenhuma dessas condições deve ser ignorada para promoção.**

---

## 8. Critérios de bloqueio (rollback imediato)

| Condição | Ação |
|---|---|
| Export retorna dados com PII não mascarado (CPF/CNPJ/email real visível) | Rollback imediato + investigação |
| Worker cria ImobCase duplicado para o mesmo documento | Investigar idempotência — não declarar rollback até confirmar |
| Taxa de erro em `imobRunCompletedQueue` > 10% em 1h | Rollback + investigar worker |
| Arquivo `.docx` inacessível após recriação do container | Verificar volume Docker — comunicar usuários afetados |
| Confirm retorna `runStatus != "success"` para `imob.contract.intake` | Bug — rollback imediato |

---

## 9. Rollback

### Procedimento

1. Reverter o container `eiah-api` para a imagem anterior ao commit `fd6cfc2`:
   ```bash
   docker pull eiah-api:<tag-anterior>
   docker compose up -d eiah-api
   ```

2. Ou reverter o código no branch:
   ```bash
   git revert fd6cfc2 --no-edit
   # Rebuildar e restartar o container
   ```

3. Verificar que runs criados após `fd6cfc2` com `status=success` não causam problemas:
   ```sql
   -- Runs criados pós-fd6cfc2 com status=success e ImobCase associado
   -- Estes runs são válidos — o rollback do código não afeta os dados
   SELECT r.id, r.status, c.id as case_id
   FROM runs r
   JOIN imob_cases c ON (c.metadata->>'intakeRunId') = r.id
   WHERE (r.request->>'actionId') = 'imob.contract.intake'
   ORDER BY r.created_at DESC LIMIT 5;
   ```

4. **Impacto do rollback:** Runs criados com `status=success` permanecem válidos. ImobCases já criados não são afetados. Novos confirms criarão runs com `status=pending` (comportamento pré-Fase 5.5) — sem criação automática de ImobCase até o action runner ser integrado.

### O que NÃO é necessário no rollback

- Não excluir ImobCases criados — eles são entidades independentes válidas
- Não excluir runs com `status=success` — eles são corretos
- Não excluir uploadedDocuments — eles são evidência auditável

---

## 10. Contatos operacionais (preencher antes de habilitar o piloto)

| Papel | Nome | Canal |
|---|---|---|
| Responsável técnico pelo piloto | — | — |
| Ponto de contato do tenant piloto | — | — |
| Oncall de infra (para restart/rollback) | — | — |
