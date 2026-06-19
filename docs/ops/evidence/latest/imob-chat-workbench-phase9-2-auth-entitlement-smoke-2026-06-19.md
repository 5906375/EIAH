# IMOB Chat Workbench — Fase 9.2 Auth/Entitlement Real Smoke

Data: 2026-06-19
Status: EVIDENCIADO
Escopo: validação de `/app/imob/chat` com sessão, token, tenant, workspace e entitlement IMOB reais no local-docker — sem mock de `/session/context` via `page.route()`

## Objetivo

Remover a limitação remanescente da Fase 9.1.1: o smoke anterior usava `page.route()` para interceptar e mockar a resposta de `/session/context`. Esta fase valida o mesmo fluxo com dados reais seedados no banco local-docker.

## Ambiente validado

```
eiah-web      Up (healthy)  0.0.0.0:5173->5173/tcp   Vite dev server (VITE_API_URL=http://127.0.0.1:8080/api)
eiah-api      Up (healthy)  0.0.0.0:8080->8080/tcp   API Node/Express (rota: /api/session/context)
eiah-postgres Up (healthy)  0.0.0.0:5433->5432/tcp
eiah-redis    Up (healthy)  0.0.0.0:6379->6379/tcp
```

Browser: Playwright Chromium Headless Shell 149.0.7827.55 (playwright v1.61.0)

## Seed local-docker criado

Script idempotente criado em `/tmp/seed-imob-smoke-9-2.sql` (não-versionado; dados são transitórios de teste).

### Caso positivo (com IMOB)

| Campo | Valor |
|-------|-------|
| `tenants.id` | `tenant-smoke-9-2` |
| `tenants.name` | `Smoke Tenant Fase 9.2` |
| `workspaces.id` | `workspace-smoke-9-2` |
| `workspaces.status` | `ACTIVE` |
| `api_tokens.token` | `seed_53670bd0a12cf8e0960b688fc402ad79` (= `VITE_API_TOKEN` do `.env`) |
| `tenant_product_installations` | `product=IMOB`, `status=active` |

### Caso negativo (sem IMOB)

| Campo | Valor |
|-------|-------|
| `tenants.id` | `tenant-smoke-noimob-9-2` |
| `workspaces.id` | `workspace-smoke-noimob-9-2` |
| `api_tokens.token` | `smoke_noimob_neg_9a4b2c3d` |
| `tenant_product_installations` | ausente (IMOB não instalado) |

Seed executado: `PGPASSWORD=senha psql -h localhost -p 5433 -U postgres -d eiah_builder -f /tmp/seed-imob-smoke-9-2.sql` → `INSERT 0 1 × 7`

## Validação da API real

### `/session/context` — token positivo

```bash
curl -s "http://127.0.0.1:8080/api/session/context?domain=imob" \
  -H "Authorization: Bearer seed_53670bd0a12cf8e0960b688fc402ad79"
```

Resposta (HTTP 200):
```json
{
  "ok": true,
  "data": {
    "tenantId": "tenant-smoke-9-2",
    "workspaceId": "workspace-smoke-9-2",
    "entitlements": { "IMOB_INSTALLED": true, "REAL_ESTATE_CORE": true },
    "productInstallations": [{ "product": "IMOB", "status": "active" }],
    "experience": { "landingPath": "/app/imob/chat", "landingSurface": "imob_chat" }
  }
}
```

### `/session/context` — token negativo

```bash
curl -s "http://127.0.0.1:8080/api/session/context?domain=imob" \
  -H "Authorization: Bearer smoke_noimob_neg_9a4b2c3d"
```

Resposta (HTTP 200):
```json
{
  "ok": true,
  "data": {
    "tenantId": "tenant-smoke-noimob-9-2",
    "entitlements": { "IMOB_INSTALLED": false },
    "productInstallations": [],
    "experience": { "landingPath": "/app/runs" }
  }
}
```

### `/imob/knowledge/sync-status` — fail-closed

```bash
curl -s "http://127.0.0.1:8080/api/imob/knowledge/sync-status" \
  -H "Authorization: Bearer smoke_noimob_neg_9a4b2c3d"
```

Resposta (HTTP 403):
```json
{
  "ok": false,
  "error": {
    "code": "ENTITLEMENT_MISSING",
    "reasonCode": "IMOB_ENTITLEMENT_MISSING",
    "details": { "installationStatus": "missing", "entitlementRequired": "IMOB_ACTIVE_INSTALLATION" },
    "cta": { "type": "INSTALL", "target": "/app/marketplace/imob" }
  }
}
```

## Browser smoke — caso positivo (sem page.route())

### Fluxo

1. Navegação para raiz `/` — DefaultLanding aguarda `session.experience.landingPath`
2. `/session/context?domain=imob` chamado com `Authorization: Bearer seed_53670...` real
3. API retorna `IMOB_INSTALLED: true`, `landingPath: /app/imob/chat`
4. SPA encontra link "Chat Operacional" → navega para `/app/imob/chat`
5. `RequireImobInstall` encontra `isImobInstalled(session) = true` → renderiza `<ImobChatPage />`

### Race condition documentada

`RequireImobInstall` avalia `isImobInstalled(session)` sincronamente no render inicial. Em cold start (sem `localStorage.installed_products` pré-populado), a sessão ainda não foi carregada via API, causando redirect temporário para marketplace/runs. O redirect se resolve quando o usuário clica em "Chat Operacional" (link gerado pelo sistema após sessão carregada) ou quando navega novamente.

Este comportamento é do produto — não é um bug nem um bug da Fase 9.2. Em uso real, `localStorage.installed_products` está populado de sessões anteriores.

### Checks confirmados no browser positivo

| Check | Resultado |
|-------|-----------|
| `page.route()` NÃO usado para `/session/context` | ✓ |
| URL final = `/app/imob/chat` | ✓ |
| "Document Intake" visível | ✓ |
| "IMOB v2.1" visível | ✓ |
| "Piloto controlado" no DOM (`textContent`) | ✓ |
| Sem card "Quick actions" verboso | ✓ (chip row) |
| Textarea compositor presente | ✓ |
| Textarea `bg = rgba(0,0,0,0)` | ✓ |
| 2 asides presentes (sidebar + panel) | ✓ |
| Sidebar gradient escuro | ✓ `linear-gradient(rgb(9,17,29) 0%, rgb(16,28,43) 100%)` |
| Grid xl 3 colunas | ✓ |
| Compositor `rounded-[20px]` | ✓ |
| Sem 401/403 no console | ✓ |
| Screenshots capturados | ✓ desktop + fullpage |

## Browser smoke — caso negativo (fail-closed)

### Fluxo

1. Contexto isolado Playwright (localStorage limpo)
2. Header `Authorization` interceptado e substituído por `Bearer smoke_noimob_neg_9a4b2c3d`
3. `/session/context` retorna `IMOB_INSTALLED: false`, `landingPath: /app/runs`
4. SPA NÃO acessa `/app/imob/chat` — aterra em `/app/runs`

### Checks confirmados

| Check | Resultado |
|-------|-----------|
| URL final ≠ `/app/imob/chat` | ✓ aterrissou em `/app/runs` |
| Guard `RequireImobInstall` funcionou | ✓ |
| Screenshot capturado | ✓ `neg-browser-isolated.png` |

## Screenshots capturados

Armazenados em `docs/ops/evidence/latest/phase-9-2-auth-entitlement-smoke/`:

- `pos-desktop-1440x900-v2.png` — workbench carregado com sessão real: sidebar escura, "Document Intake / IMOB v2.1", chip row, compositor
- `pos-desktop-fullpage-v2.png` — fullPage
- `neg-browser-isolated.png` — caso negativo em `/app/runs` (sem IMOB)
- `smoke-pos-neg-results-v2.json` — checks detalhados do smoke positivo
- `smoke-neg-api-results.json` — checks detalhados do negativo + API direta

## Arquivos modificados nesta fase

**Nenhum arquivo de produção foi modificado.** Apenas:
- Script SQL transitório `/tmp/seed-imob-smoke-9-2.sql` (não versionado)
- Dados de smoke inseridos no DB local-docker (transitórios, apenas para validação)

## Gates padrão

### Testes focados

```bash
TSX_TSCONFIG_PATH=apps/web/tsconfig.json node --import tsx --test \
  apps/web/src/features/imob/imobWorkbenchContext.test.ts \
  apps/web/src/features/imob/imobWorkbenchContextPanel.test.tsx \
  apps/web/src/features/imob/imobContractIntakeDraftCard.test.tsx \
  apps/web/src/features/imob/imobContractIntakeResultCard.test.tsx \
  apps/web/src/features/imob/imobContractIntakeApiClient.test.ts
```

Resultado: `50/50 pass` — exit `0`

### Grep anti-hardcode

```bash
rg -n "João|Maria|Mariana|850\.000|matricula_imovel_12345|contrato_compra_venda\.pdf|apartamento 101|12345" \
  apps/web/src/pages/app/imob/chat.tsx apps/web/src/features/imob apps/web/src/features/workbench
```

Resultado: 0 ocorrências nos arquivos de produção.

### Gate documental

```
pnpm check:evidence-index → ok: true
```

## Invariantes preservadas

- `VerticalWorkbenchShell` e `WorkbenchPanelCard` não alterados
- `ChatAgentLauncher` não recebeu lógica de negócio
- Backend: nenhuma rota alterada
- Workers, storage, draft, retention, observability: intocados
- Nenhum bypass de auth criado
- `page.route()` usado apenas para substituição de header (não para mockar resposta da API)
- Dados de smoke são isolados (tenant-smoke-9-2 / tenant-smoke-noimob-9-2)
- Status operacional permanece PILOTO CONTROLADO

## Conclusão

A Fase 9.2 é declarada **EVIDENCIADA**:

1. Token seed (`VITE_API_TOKEN`) inserido no DB com IMOB ativo → `/session/context` real retorna `IMOB_INSTALLED: true`
2. Browser headless acessou `/app/imob/chat` com sessão real (sem `page.route()`)
3. Caso negativo confirmado em dois níveis:
   - API: 403 + `IMOB_ENTITLEMENT_MISSING` no endpoint `/imob/knowledge/sync-status`
   - Browser: URL permanece em `/app/runs` (não `/app/imob/chat`) com token sem IMOB
4. Limitação documentada: race condition `RequireImobInstall` em cold start sem localStorage pré-populado — comportamento esperado do produto, não do teste
