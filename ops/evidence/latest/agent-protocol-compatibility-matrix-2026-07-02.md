# Agent Protocol compatibility matrix — 2026-07-02

## Objetivo

Formalizar a dívida F-07 com uma matriz conservadora de compatibilidade multi-versão do Agent Protocol, sem declarar compatibilidade não evidenciada.

## Arquivos / contracts / baselines encontrados

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

## Versão atual evidenciada

- `agent-protocol.v1`

Base real encontrada para `v1`:

- schema versionado
- baseline versionado
- exemplo oficial
- changelog
- política de versionamento
- contrato de API
- rotas runtime
- check de compatibilidade
- check de interop matrix
- evidência de smoke e e2e

## Versões planejadas ou não suportadas

- `agent-protocol.v2`
  - status: `proposta`
  - motivo: não há schema, baseline, exemplo, changelog dedicado ou evidência real

- `agent-protocol.v0` / compatibilidade legada `N-1`
  - status: `nao_suportado`
  - motivo: `contracts/interop-discovery.v1.baseline.json` declara janela `N,N-1`, mas o repositório atual não contém artefatos públicos suficientes de uma versão anterior para declarar essa compatibilidade como evidenciada

## Lacunas remanescentes

- não existe baseline multi-versão pública além de `v1`
- não existe schema `v2`
- não existe changelog específico para `v2`
- não existe evidência recorrente de compatibilidade entre duas majors públicas

## Matriz criada

Arquivo documental criado:

- `docs/ops/agent-protocol-compatibility-matrix.md`

Leitura conservadora da matriz:

- `agent-protocol.v1` = `evidenciado`
- `agent-protocol.v2` = `proposta`
- `agent-protocol.v0` = `nao_suportado`
- breaking change não versionado em `v1` = `nao_suportado`

## Checks executados e saída real

### 1. Docs link integrity

```bash
pnpm check:docs-link-integrity
```

```text
{
  "ok": true,
  "check": "check:docs-link-integrity",
  "filesChecked": 10,
  "targets": [
    "AGENTS.md",
    "CLAUDE.md",
    "CODEX.md",
    "IA_EIAH.md",
    "docs/architecture/adr-imob-journey-governed-by-case.md",
    "docs/architecture/agent-chat-runtime.md",
    "docs/architecture/imob-crm-governed-runtime.md",
    "docs/architecture/p3-economy-hardening-closure.md",
    "docs/architecture/presentation-snapshot-v1.md",
    "docs/architecture/worker-topology.md"
  ]
}
```

### 2. Agent Protocol compatibility matrix

```bash
pnpm check:agent-protocol-compat-matrix
```

```text
{
  "ok": true,
  "check": "check:agent-protocol-compat-matrix",
  "matrix": "docs/ops/agent-protocol-compatibility-matrix.md",
  "currentVersion": "agent-protocol.v1",
  "rows": [
    {
      "version": "agent-protocol.v1",
      "status": "evidenciado",
      "ciChecks": [
        "check:agent-protocol-compat",
        "check:agent-protocol-compat-matrix",
        "check:interop-contract-matrix"
      ]
    },
    {
      "version": "agent-protocol.v2",
      "status": "proposta",
      "ciChecks": []
    },
    {
      "version": "agent-protocol.v0",
      "status": "nao_suportado",
      "ciChecks": []
    }
  ]
}
```

### 3. Agent Protocol compatibility

```bash
pnpm check:agent-protocol-compat
```

```text
{
  "ok": true,
  "check": "check:agent-protocol-compat",
  "files": [
    "contracts/agent-protocol.v1.baseline.json",
    "contracts/agent-protocol.v1.schema.json",
    "contracts/examples/agent-protocol.v1.example.json",
    "contracts/CHANGELOG.agent-protocol.md",
    "ops/contracts/agent-protocol-versioning-policy.md",
    "docs/ops/agent-protocol-api-contract.md",
    "docs/EVIDENCE_INDEX.md",
    "apps/api/src/routes/agents.ts"
  ],
  "schemaVersion": "agent-protocol.v1"
}
```

### 4. Interop contract matrix

```bash
pnpm check:interop-contract-matrix
```

```text
{
  "ok": true,
  "check": "check:interop-matrix",
  "files": [
    "contracts/interop-discovery.v1.baseline.json",
    "contracts/agent-protocol.v1.baseline.json",
    "contracts/agent-protocol.v1.schema.json",
    "contracts/examples/agent-protocol.v1.example.json",
    "ops/contracts/agent-protocol-versioning-policy.md",
    "docs/ops/agent-protocol-api-contract.md"
  ],
  "baseline": {
    "specVersion": "v1",
    "compatibility": "N,N-1",
    "scenarios": [
      "discovery",
      "negotiate",
      "execute"
    ],
    "publicContract": "agent-protocol.v1",
    "versioningPolicyRef": "ops/contracts/agent-protocol-versioning-policy.md"
  }
}
```

## Status conservador

- `v1`: `evidenciado`
- `v2`: `proposta`
- `N-1` legado: `nao_suportado`
- estado geral desta frente: `parcial`

Motivo do `parcial`:

- a matriz multi-versão existe;
- há check de integridade da matriz em CI;
- mas a compatibilidade multi-versão real ainda não pode ser elevada além de `v1`, porque faltam baseline/schema/evidência públicos para outra versão.

## Follow-up — correção proativa de compatibilidade de runtime CI (2026-07-04)

- `check:agent-protocol-compat-matrix` usava `node --experimental-strip-types scripts/checkAgentProtocolCompatibilityMatrix.ts`, a mesma flag que já causou falha real de CI em outras frentes (`node: bad option: --experimental-strip-types` no runtime Node do GitHub Actions).
- Correção proativa aplicada antes da abertura do PR: `package.json` passou a usar `node --import tsx scripts/checkAgentProtocolCompatibilityMatrix.ts`, seguindo o padrão já validado no repositório.
- Nenhuma lógica da matriz (`docs/ops/agent-protocol-compatibility-matrix.md`, `scripts/checkAgentProtocolCompatibilityMatrix.ts`) foi alterada.
- Este follow-up não fecha nem eleva o status `parcial` desta frente; DONE global não é declarado.
