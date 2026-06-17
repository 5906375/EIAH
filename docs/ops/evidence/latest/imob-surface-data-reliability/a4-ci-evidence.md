# A4 — Evidence Record
# IMOB Surface Data Reliability — workspaceId ausente nas queries de casos

Data de execucao: 2026-06-15
Checklist de referencia: docs/ops/imob-surface-data-reliability-checklist.md
Status promovido para: `evidenciado`

---

## Descricao do alerta

As chamadas `apiListImobCases()` e `apiListImobCaseCosts()` em `dashboard.tsx` nao
enviavam `workspaceId` na query. O backend ja isolava por tenant via `enforceTenant`
middleware (token-level, nao substituivel pelo cliente), mas a ausencia do parametro
criava uma inconsistencia de superficie: o cliente nao declarava explicitamente o escopo
da requisicao.

Classificacao de risco: Categoria 1 (frontend + API surface) — Baixa-Media.
Backend totalmente protegido via `authContext.workspaceId` + Prisma scoped.

---

## Opcao implementada

**Option B — Defense in depth (parametro como checagem de consistencia):**

- `workspaceId` vindo da query NUNCA e fonte de verdade
- Backend valida `query.workspaceId` contra `authContext.workspaceId` (token-level)
- Mismatch retorna 403 fail-closed com `WORKSPACE_SCOPE_MISMATCH`
- Frontend passa `session.workspaceId` como parametro declarativo

---

## Arquivos alterados

| Arquivo | Mudanca |
|---------|---------|
| `apps/web/src/lib/api.ts` | `apiListImobCases` e `apiListImobCaseCosts` aceitam `workspaceId?: string` |
| `apps/web/src/pages/app/imob/dashboard.tsx` | Passa `session.workspaceId` nas duas chamadas |
| `apps/api/src/routes/imobCrmRouter.ts` | Bloco de validacao adicionado em `GET /cases` e `GET /cases/costs` |
| `apps/api/src/tests/imob-crm-workspace-scope.test.ts` | Suite de 6 testes com real DB |

---

## Logica adicionada ao backend (imobCrmRouter.ts)

```ts
const requestedWorkspaceId =
  typeof req.query.workspaceId === "string" ? req.query.workspaceId.trim() : null;
if (requestedWorkspaceId && requestedWorkspaceId !== authContext.workspaceId) {
  return res.status(403).json({
    ok: false,
    error: {
      code: "WORKSPACE_SCOPE_MISMATCH",
      message: "workspaceId in query does not match authenticated workspace",
    },
  });
}
```

Bloco identico adicionado a `GET /cases` e `GET /cases/costs`, ANTES do permission check.

---

## Comandos executados

```
cd apps/api
node --import tsx/esm --test src/tests/imob-crm-workspace-scope.test.ts
```

---

## Output dos testes (6/6)

```
TAP version 13
ok 1 - GET /imob/cases without workspaceId param returns 200
ok 2 - GET /imob/cases with matching workspaceId returns 200
ok 3 - GET /imob/cases with mismatching workspaceId returns 403 WORKSPACE_SCOPE_MISMATCH
ok 4 - GET /imob/cases/costs without workspaceId param returns 200
ok 5 - GET /imob/cases/costs with matching workspaceId returns 200
ok 6 - GET /imob/cases/costs with mismatching workspaceId returns 403 WORKSPACE_SCOPE_MISMATCH
```

Todos os 6 testes passaram contra banco de dados real (PostgreSQL local porta 5433).

---

## Criterio de aceitacao — verificado

- [x] `apiListImobCases` envia `workspaceId` via URLSearchParams
- [x] `apiListImobCaseCosts` envia `workspaceId` via URLSearchParams
- [x] `dashboard.tsx` passa `session.workspaceId` nas duas chamadas
- [x] Backend rejeita mismatch com 403 + `WORKSPACE_SCOPE_MISMATCH`
- [x] Backend aceita ausencia de parametro (retro-compatibilidade)
- [x] Backend aceita match correto
- [x] `imob-crm-workspace-scope.test.ts` 6/6 pass contra DB real

---

## Conclusao

O alerta A4 esta evidenciado. A defesa em profundidade garante que mesmo que um cliente
malformado envie um `workspaceId` diferente do token, o backend rejeita fail-closed.
O `authContext.workspaceId` continua sendo a unica fonte de verdade para escopo de workspace.

Alertas A1–A3/A5/A7 permanecem abertos — nao foram alterados nesta etapa.
