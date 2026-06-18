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

- Multi-instância / escalonamento horizontal (bloqueado por P1 object storage)
- Auto-delete de uploads (política de retenção não definida)
- Draft persistente (re-upload obrigatório após restart)
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
| Drafts em memória simultâneos | Sem limite técnico — TTL 30min limita organicamente | Cada upload = 1 draft |
| Jobs em `imobRunCompletedQueue` | 3 tentativas com backoff exponencial (2s base) | Configurado em `imobRunCompletedQueue.ts` |
| Export HTML/DOCX por run | Sem limite — geração síncrona | Observar latência em contratos grandes |

**Alerta de volume:** Se uploads/dia superar 50 por workspace antes de object storage estar disponível, revisar o piloto (risco de esgotamento de disco local).

---

## 4. Limitações documentadas

### 4.1 Filesystem local

- Arquivos `.docx` são salvos em `uploads/{uuid}.docx` no **filesystem local do processo API**.
- Em reinício do container `eiah-api`, os arquivos **são preservados** se o volume Docker estiver mapeado.
- Em **recriação do container** (`docker compose up --force-recreate`), arquivos são perdidos se não houver volume persistente.

**Ação preventiva:**
```yaml
# Verificar em docker-compose.dev.yml se existe volume para uploads/
volumes:
  - ./uploads:/app/uploads   # deve existir para preservar arquivos
```

Se o volume não estiver mapeado: uploads existentes ficam inacessíveis após recriação do container. Runs com `ImobCase` criado terão export falhando (`EVIDENCE_NOT_FOUND`).

### 4.2 Draft em memória

- Drafts vivem exclusivamente no `Map<draftId, StoredDraft>` do processo API (TTL = 30 min).
- **Restart do processo** (`tsx` watcher reload, `docker restart eiah-api`) apaga todos os drafts.
- Usuários com upload pendente de confirmação devem re-fazer o upload após restart.

**Comunicação ao usuário:**

> "Se o sistema for reiniciado enquanto você está revisando o documento, você precisa fazer o upload novamente. Isso é esperado na versão atual."

### 4.3 Sem auto-delete de uploads

- Registros em `uploaded_documents` e arquivos em `uploads/` **não são deletados automaticamente**.
- Crescimento de storage é linear com o número de uploads.
- **Ação no piloto:** Monitorar tamanho de `uploads/` semanalmente. Limiar de atenção: > 1 GB.

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

**Nota:** Não há forma de recuperar um draft perdido por restart — o arquivo `.docx` pode ainda existir em disco (se o volume persistir), mas o `draftId` e metadados in-memory foram perdidos. O re-upload é a única ação.

---

## 6. Métricas mínimas a observar

| Métrica | Onde observar | Alerta |
|---|---|---|
| `imob-intake.case_created` | Logs do `eiah-api` (JSON structured) | 0 por hora durante horário de uso = investigar |
| `imob-intake.run_not_success_skip` | Logs do `eiah-api` | > 5 por hora = verificar se confirm não está rodando |
| `imob-intake.idempotent_skip_existing_case` | Logs do `eiah-api` | Normal (re-envio do mesmo doc); > 10/h = verificar loop |
| Tamanho de `uploads/` | `du -sh /app/uploads` no container | > 1 GB = atenção; > 5 GB = cleanup manual |
| Jobs em `imobRunCompletedQueue` (failed) | Redis / BullMQ dashboard | > 0 = investigar (3 retries já foram esgotados) |
| Runs com `status=pending` em `imob.contract.intake` | SQL abaixo | > 0 = bug (confirm deve criar com success) |

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
| Object storage integrado (S3/GCS) | ❌ Pendente P1 | Obrigatório antes de multi-instância |
| Draft durável em Redis | ❌ Pendente P2 | Recomendado antes de escala |
| Auto-delete de uploads | ❌ Pendente P2 | Recomendado antes de escala |
| Política de retenção definida | ❌ Pendente P2 | Decisão jurídica/produto |
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
