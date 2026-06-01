# Tenant Policy Fail-Closed 403 — 2026-05-31

## Status

Validado localmente por suíte automatizada.

## Fontes verificadas

- `apps/api/src/routes/agentsPolicy.ts`
- `apps/api/src/tests/agents.policy.fail-closed.test.ts`
- `apps/api/src/routes/agents.ts`

## Regra comprovada

Quando `tenant/workspace` não possui policy explícita, a API falha fechado e responde `403`.

## Payload esperado

```json
{
  "ok": false,
  "error": {
    "code": "POLICY_NOT_FOUND",
    "reasonCode": "POLICY_NOT_FOUND",
    "message": "Ação bloqueada: policy explícita ausente para tenant/workspace."
  }
}
```

## Validação executada

- comando: `pnpm test:agents-policy-fail-closed`
- resultado: `PASS`

## O que esta evidência bloqueia

- retorno do fallback permissivo que liberava catálogo completo sem policy
- regressão de `reasonCode`
- regressão de resposta `403` para ausência de policy
