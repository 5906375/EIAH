# Agent Protocol Compatibility Matrix

## Objetivo

Registrar, de forma conservadora, quais versões do Agent Protocol estão:

- evidenciadas;
- apenas planejadas;
- explicitamente não suportadas.

Regra operacional:

- nenhuma versão pode ser declarada compatível sem schema, baseline versionado, política de evolução, check de CI e evidência real;
- breaking change sem major bump continua proibido;
- `N,N-1` só pode ser tratado como compatibilidade real quando existirem artefatos e evidência para ambas as versões.

## Matriz

| Versão | Status | Schema | Baseline | Exemplo | Policy | CI | Evidência | Notas |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `agent-protocol.v1` | `evidenciado` | `contracts/agent-protocol.v1.schema.json` | `contracts/agent-protocol.v1.baseline.json` | `contracts/examples/agent-protocol.v1.example.json` | `ops/contracts/agent-protocol-versioning-policy.md` | `check:agent-protocol-compat`, `check:agent-protocol-compat-matrix`, `check:interop-contract-matrix` | `ops/evidence/latest/interop-routes-smoke-2026-06-17.json`, `ops/evidence/latest/interop-e2e-agent-call-2026-06-17.json` | Versão pública atual suportada no runtime e na documentação. |
| `agent-protocol.v2` | `proposta` | — | — | — | `ops/contracts/agent-protocol-versioning-policy.md` | — | — | Planejada apenas como próxima major para breaking change futuro. Sem schema, baseline, changelog dedicado ou evidência. |
| `agent-protocol.v0` ou janela `N-1` legada | `nao_suportado` | — | — | — | `ops/contracts/agent-protocol-versioning-policy.md` | — | — | O baseline `contracts/interop-discovery.v1.baseline.json` declara objetivo `N,N-1`, mas o repositório atual não contém artefatos públicos suficientes para declarar compatibilidade legada evidenciada. |
| Breaking change não versionado em `v1` | `nao_suportado` | — | — | — | `ops/contracts/agent-protocol-versioning-policy.md` | `check:agent-protocol-compat` | — | Qualquer mudança breaking sem novo major deve falhar no CI. |

## Artefatos encontrados

- `contracts/agent-protocol.v1.schema.json`
- `contracts/agent-protocol.v1.baseline.json`
- `contracts/examples/agent-protocol.v1.example.json`
- `contracts/CHANGELOG.agent-protocol.md`
- `contracts/interop-discovery.v1.baseline.json`
- `ops/contracts/agent-protocol-versioning-policy.md`
- `docs/ops/agent-protocol-api-contract.md`
- `scripts/checkAgentProtocolVersioning.ts`
- `scripts/checkInteropContractsMatrix.ts`
- `apps/api/src/routes/agents.ts`
- `ops/evidence/latest/interop-routes-smoke-2026-06-17.json`
- `ops/evidence/latest/interop-e2e-agent-call-2026-06-17.json`

## Regras de evolução

- `major` obrigatório para breaking change.
- `minor/patch` apenas para mudanças aditivas e backward-compatible.
- baseline versionado obrigatório para cada versão pública declarada.
- check de CI obrigatório para declarar compatibilidade.
- ausência de baseline/schema/example/evidência mantém a versão em `proposta` ou `nao_suportado`.

## Bloco verificável

<!-- AGENT_PROTOCOL_COMPAT_MATRIX:START -->
```json
{
  "currentVersion": "agent-protocol.v1",
  "rows": [
    {
      "version": "agent-protocol.v1",
      "status": "evidenciado",
      "schema": "contracts/agent-protocol.v1.schema.json",
      "baseline": "contracts/agent-protocol.v1.baseline.json",
      "example": "contracts/examples/agent-protocol.v1.example.json",
      "policy": "ops/contracts/agent-protocol-versioning-policy.md",
      "apiContract": "docs/ops/agent-protocol-api-contract.md",
      "changelog": "contracts/CHANGELOG.agent-protocol.md",
      "ciChecks": [
        "check:agent-protocol-compat",
        "check:agent-protocol-compat-matrix",
        "check:interop-contract-matrix"
      ],
      "evidence": [
        "ops/evidence/latest/interop-routes-smoke-2026-06-17.json",
        "ops/evidence/latest/interop-e2e-agent-call-2026-06-17.json"
      ]
    },
    {
      "version": "agent-protocol.v2",
      "status": "proposta",
      "schema": null,
      "baseline": null,
      "example": null,
      "policy": "ops/contracts/agent-protocol-versioning-policy.md",
      "apiContract": null,
      "changelog": null,
      "ciChecks": [],
      "evidence": []
    },
    {
      "version": "agent-protocol.v0",
      "status": "nao_suportado",
      "schema": null,
      "baseline": null,
      "example": null,
      "policy": "ops/contracts/agent-protocol-versioning-policy.md",
      "apiContract": null,
      "changelog": null,
      "ciChecks": [],
      "evidence": []
    }
  ]
}
```
<!-- AGENT_PROTOCOL_COMPAT_MATRIX:END -->
