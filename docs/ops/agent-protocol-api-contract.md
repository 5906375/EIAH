# API Contract — Agent Protocol Layer (`v1`)

## Objetivo
Estabelecer contrato inicial para interoperabilidade entre agentes/sistemas:

`discovery -> negotiate -> execute -> verify`

## Endpoints

### `POST /api/agents/discovery`
- Auth: bearer token (`enforceTenant`)
- Retorna ações disponíveis por tenant/workspace.

Request (exemplo):
```json
{
  "domain": "imob",
  "actions": ["realestate.apply_adjustment"]
}
```

Response `200` (resumo):
```json
{
  "ok": true,
  "data": {
    "protocolVersion": "agent-protocol.v1",
    "domain": "imob",
    "tenantId": "tenant_...",
    "workspaceId": "workspace_...",
    "actions": []
  }
}
```

### `POST /api/agents/negotiate`
- Auth: bearer token (`enforceTenant`)
- Negocia ação/versão e devolve contrato executável.

Request (exemplo):
```json
{
  "domain": "imob",
  "action": "realestate.apply_adjustment",
  "version": "1.2.0"
}
```

Response `200` (resumo):
```json
{
  "ok": true,
  "data": {
    "protocolVersion": "agent-protocol.v1",
    "contract": {
      "action": "realestate.apply_adjustment",
      "version": "1.2.0",
      "tier": "HIGH",
      "txIdRequired": true,
      "receiptSchema": { "specVersion": "receipt.canon.v1" }
    },
    "execution": { "endpoint": "/api/agents/execute", "method": "POST" },
    "verification": { "endpointTemplate": "/api/ledger/:txId" }
  }
}
```

### `POST /api/agents/execute`
- Auth: bearer token (`enforceTenant`)
- Enfileira execução de run no pipeline padrão.

Request (exemplo):
```json
{
  "domain": "imob",
  "action": "realestate.apply_adjustment",
  "version": "1.2.0",
  "input": {
    "propertyId": "prop_123",
    "adjustmentType": "discount",
    "amountCents": 10000,
    "reason": "incentive"
  }
}
```

Response `202` (resumo):
```json
{
  "ok": true,
  "data": {
    "runId": "run_...",
    "status": "pending",
    "verify": {
      "txId": null,
      "ledgerEndpointTemplate": "/api/ledger/:txId",
      "runBundlePath": "/api/runs/run_.../bundle"
    }
  }
}
```

## Erros principais
- `400 INVALID_PAYLOAD`
- `403 ACTION_NOT_ALLOWED`
- `403 TRUST_BLOCKED`
- `404 ACTION_NOT_FOUND`
- `409 VERSION_NOT_NEGOTIABLE`

## Invariantes de Contrato v1
- `protocolVersion` deve permanecer `agent-protocol.v1` durante toda a trilha `discovery -> negotiate -> execute`.
- o contrato negociado deve expor `action`, `version`, `tier`, `txIdRequired`, `inputSchema`, `receiptSchema` e `trustRequirements`.
- `receiptSchema.specVersion` deve permanecer `receipt.canon.v1`.
