# API Contract — `GET /api/runs/:id/bundle`

## Objetivo
Exportar o bundle de evidências de um `run` para inspeção operacional e verificação externa.

## Endpoint
- Método: `GET`
- Rota: `/api/runs/:id/bundle`
- Auth: token com permissão `reports.view`

## Resposta 200 (resumo)
```json
{
  "ok": true,
  "runId": "run_...",
  "bundleHash": "sha256_...",
  "hashes": {
    "manifestHash": "sha256_..."
  },
  "files": {
    "manifest.json": {}
  }
}
```

## Campos obrigatórios
- `ok` igual a `true`
- `runId` (string)
- `bundleHash` (string não vazia)
- `hashes` (objeto)
- `files` (objeto)

## Resposta 404
Quando o `run` não existe no escopo do tenant/workspace.

```json
{
  "ok": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "run"
  }
}
```

## Breaking change check
- Não remover `bundleHash` da resposta `200`.
- Não mudar `error.code=NOT_FOUND` e `error.message=\"run\"` na `404`.
- Mudança estrutural de `hashes`/`files` exige atualização de contrato + evidência indexada.
