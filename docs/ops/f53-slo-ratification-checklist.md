# F5.3 — SLO Ratification Checklist

Data de abertura da frente: 2026-06-16
Fase: F5.3 — Auditoria pública DLT
Status: **frente aberta · fix estrutural Caminho B aplicado · guards de ratificação ativas · 6/6 testes passando · ratificação bloqueada contra dados simulados/agregados/incompletos · pendente de 3 ciclos reais com staging vars**

---

## Estado atual (2026-06-16)

| Item | Valor |
|------|-------|
| `economy-slo-targets.json` · `ratified` | `false` |
| Gate `check:slo-target` | warn-only — exit 0, não bloqueia CI |
| `economy-slo-baseline-2026-06-11.json` · `samplesCount` | `0` |
| `economy-slo-baseline-2026-06-16.json` · `sampleSource` | `aggregate-latency` (Caminho B — não conta para ratificação) |
| `high-e2e-manifest.json` · `commitSha` | `recovery-local` (dado simulado) |
| Providers `crypto` / `bank` | modo simulado — `onChainConfirmation` indefinido |

---

## Bloqueio estrutural (corrigido em 2026-06-16)

**Problema original**: `generateSloBaseline.ts` lia apenas `scenarioResults[].latencyMs` por cenário. O manifesto atual não preenche esse campo — tem apenas `latency.p95Ms / p99Ms` no nível agregado. Resultado: `samplesCount: 0` mesmo com manifesto presente.

**Fix aplicado (Caminho B)**: extração da lógica de coleta para `scripts/sloBaselineCollect.ts`. Agora o script tenta primeiro `scenarioResults[].latencyMs`; se ausente, usa `manifest.latency.p95Ms / p99Ms` como fallback com `sampleSource: "aggregate-latency"`.

Garantias do fix:
- `sampleSource: "aggregate-latency"` → `samplesCount: 0` (não satisfaz `minSamplesRequired: 3`)
- Gate `check:slo-target` permanece warn-only enquanto `ratified: false`
- Quando `ratified: true`, gate ainda exige `samplesCount >= 3` — agregado não basta
- `pouFinalize.p95Ms` e `p99Ms` ficam visíveis no baseline, úteis para verificação da fórmula antes de staging real

**Caminho A não aplicado**: corrigir `generate:e2e-high-manifest` para gravar `latencyMs` por cenário ao rodar em staging. Fazer quando staging vars forem configurados.

---

## Fórmula canônica

```
targetP95Ms = max(500, ceil(min(maxP95 × 2.5, maxP99 × 1.5) / 100) × 100)
```

Onde:
- `maxP95` = maior `p95Ms` observado entre os 3 ciclos reais
- `maxP99` = maior `p99Ms` observado entre os 3 ciclos reais
- Floor de 500ms — nunca definir target menor
- Arredondamento ×100ms — evita target artificialmente apertado por outlier

**Exemplo com agregado atual** (simulado, não válido para ratificação):
```
min(410 × 2.5, 850 × 1.5) = min(1025, 1275) = 1025
ceil(1025 / 100) × 100 = 1100
max(500, 1100) → targetP95Ms = 1100 ms
```

---

## Guards de ratificação — bloqueios em `check:slo-target`

Quando `ratified: true` for definido em `economy-slo-targets.json`, o gate **bloqueia** nas condições abaixo. Estes checks rodam antes do gate de latência:

| Condição bloqueante | Erro emitido |
|---------------------|-------------|
| `baseline.sampleSource !== "scenario-latency"` | `Cannot ratify: sampleSource must be 'scenario-latency'` |
| `baseline.manifestCommitSha === "recovery-local"` | `Cannot ratify: manifest commitSha is 'recovery-local'` |
| `baseline.manifestCommitSha === null` | `Cannot ratify: baseline does not record manifestCommitSha` |
| `baseline.samplesCount === 0` | `Cannot ratify: samplesCount is 0` |
| `baseline.pouFinalize.p95Ms === null` | `baseline does not contain real p95Ms` |
| `baseline.samplesCount < minSamplesRequired (3)` | `Insufficient samples` |
| `baseline.generatedAt` > 14 dias atrás | `SLO baseline is older than 14 days` |
| `actualP95Ms > targetP95Ms` | `SLO breach` |

**O gate permanece warn-only enquanto `ratified: false`** — nenhum desses checks dispara.

---

## Roteiro padrão por ciclo (repetir 3×)

### Preflight

```bash
#!/usr/bin/env bash
set -euo pipefail
PREFLIGHT_OK=true
fail() { echo "✗ BLOCKED: $1"; PREFLIGHT_OK=false; }
pass() { echo "✓ $1"; }

# 1. Presença das 4 vars obrigatórias
[[ -n "${STAGING_API_BASE_URL:-}" ]]  && pass "STAGING_API_BASE_URL presente" || fail "STAGING_API_BASE_URL ausente"
[[ -n "${STAGING_API_TOKEN:-}" ]]     && pass "STAGING_API_TOKEN presente"    || fail "STAGING_API_TOKEN ausente"
[[ -n "${E2E_TENANT_ID:-}" ]]         && pass "E2E_TENANT_ID presente"        || fail "E2E_TENANT_ID ausente"
[[ -n "${E2E_WORKSPACE_ID:-}" ]]      && pass "E2E_WORKSPACE_ID presente"     || fail "E2E_WORKSPACE_ID ausente"

# 2. BASE_URL não pode ser localhost, 127.x ou file://
echo "${STAGING_API_BASE_URL:-}" | grep -qE "localhost|127\.|file://" \
  && fail "STAGING_API_BASE_URL aponta para ambiente local (localhost/127.x/file://)" \
  || pass "STAGING_API_BASE_URL não é local: ${STAGING_API_BASE_URL:-<ausente>}"

# 3. TOKEN exibido apenas como ****últimos4 (nunca expor o valor completo)
TOKEN_TAIL="${STAGING_API_TOKEN: -4}"
pass "STAGING_API_TOKEN configurado (****${TOKEN_TAIL:-????})"

# 4. TENANT_ID e WORKSPACE_ID não podem ser sentinel de ambiente local/mock
echo "${E2E_TENANT_ID:-}" | grep -qiE "^(demo|local|mock|test|fake|example)$" \
  && fail "E2E_TENANT_ID parece ser sentinela de ambiente local: '${E2E_TENANT_ID}'" \
  || pass "E2E_TENANT_ID: ${E2E_TENANT_ID:-<ausente>}"
echo "${E2E_WORKSPACE_ID:-}" | grep -qiE "^(demo|local|mock|test|fake|example)$" \
  && fail "E2E_WORKSPACE_ID parece ser sentinela de ambiente local: '${E2E_WORKSPACE_ID}'" \
  || pass "E2E_WORKSPACE_ID: ${E2E_WORKSPACE_ID:-<ausente>}"

# 5. Probe de token contra API (requer BASE_URL e TOKEN presentes)
if [[ -n "${STAGING_API_BASE_URL:-}" && -n "${STAGING_API_TOKEN:-}" ]]; then
  HTTP_CODE=$(curl -sf -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer $STAGING_API_TOKEN" \
    "$STAGING_API_BASE_URL/health" 2>/dev/null || echo "000")
  [[ "$HTTP_CODE" =~ ^2 ]] \
    && pass "Token válido — /health respondeu HTTP $HTTP_CODE" \
    || fail "Token inválido ou API inacessível — /health HTTP $HTTP_CODE"
fi

# Declaração explícita de estado
echo ""
if [[ "$PREFLIGHT_OK" == "true" ]]; then
  echo "PREFLIGHT OK — ambiente validado para ciclo real de staging."
else
  echo "PREFLIGHT BLOCKED — este ambiente NÃO conta como ciclo real."
  echo "Corrija os itens acima antes de rodar generate:e2e-high-manifest."
  exit 1
fi
```

**Todos os `✓` devem aparecer e `PREFLIGHT OK` deve ser a última linha antes de prosseguir.**
Se qualquer item falhar, o script imprime `PREFLIGHT BLOCKED — este ambiente NÃO conta como ciclo real.` e sai com exit 1.

> **Melhoria futura — implementar antes do Cycle 3 ou antes da ratificação final:**
>
> Adicionar var `EXPECTED_ENVIRONMENT=staging` e validar o body de `/health` ou `/version` explicitamente:
> ```bash
> ACTUAL_ENV=$(curl -sf \
>   -H "Authorization: Bearer $STAGING_API_TOKEN" \
>   "$STAGING_API_BASE_URL/health" | node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).environment ?? '')")
> [[ "$ACTUAL_ENV" == "${EXPECTED_ENVIRONMENT:-staging}" ]] \
>   && pass "Environment confirmado: $ACTUAL_ENV" \
>   || fail "Environment inesperado: '$ACTUAL_ENV' (esperado: '${EXPECTED_ENVIRONMENT:-staging}')"
> ```
> O preflight aceita apenas `{"environment":"staging"}` ou equivalente versionado. **Não inferir staging pelo domínio da URL** — o campo deve vir explicitamente na resposta da API.

### Run

```bash
pnpm generate:e2e-high-manifest   # gera high-e2e-manifest.json com latencyMs por cenário
pnpm generate:slo-baseline         # lê manifest, deriva p95/p99, grava baseline-{data}.json
pnpm check:slo-target              # gate warn-only enquanto ratified: false
```

### Assert (inspecionar output do baseline)

```bash
BASELINE=$(ls -t ops/evidence/latest/economy-slo-baseline-*.json | head -1)
node -e "
const b = JSON.parse(require('fs').readFileSync('$BASELINE'));
const ok = (label, v) => console.log((v ? '✓' : '✗'), label, ':', JSON.stringify(v));
ok('manifestCommitSha != recovery-local', b.manifestCommitSha && b.manifestCommitSha !== 'recovery-local');
ok('sampleSource == scenario-latency',    b.sampleSource === 'scenario-latency');
ok('samplesCount > 0',                    b.samplesCount > 0);
ok('p95Ms != null',                       b.pouFinalize?.p95Ms != null);
ok('p99Ms != null',                       b.pouFinalize?.p99Ms != null);
ok('ratified still false',                !JSON.parse(require('fs').readFileSync('ops/evidence/latest/economy-slo-targets.json')).ratified);
"
```

Todos os asserts devem marcar `✓`. Se qualquer um marcar `✗`, o ciclo não conta.

**Não ratificar após o Cycle 1** — apenas registrar a evidência e repetir até completar 3 ciclos.

---

## Caminho de ratificação — 4 etapas (após 3 ciclos completos)

### Etapa 1 — Ciclos reais (repetir 3×)
Seguir o roteiro padrão acima. Cada execução válida produz:
- `high-e2e-manifest.json` com `commitSha` real (não `recovery-local`)
- `scenarioResults[].latencyMs` por cenário
- baseline com `sampleSource: "scenario-latency"` e `samplesCount >= 1`

### Etapa 2 — Verificar 3 ciclos coletados
```bash
pnpm check:slo-baseline    # verifica recência e samplesCount
```

Critério: 3 arquivos `economy-slo-baseline-*.json` distintos com `sampleSource: "scenario-latency"`.

### Etapa 3 — Computar target
Coletar `p95Ms` e `p99Ms` dos 3 baselines, aplicar fórmula canônica, confirmar com owner API/Produto.

### Etapa 4 — Ratificar
Atualizar `ops/evidence/latest/economy-slo-targets.json`:
```json
{
  "ratified": true,
  "ratifiedAt": "<ISO-DATE>",
  "ratifiedBy": "<owner>",
  "computedFromBaseline": "economy-slo-baseline-<data>.json",
  "pouFinalize": {
    "targetP95Ms": <valor calculado>,
    "targetP99Ms": null,
    "minSamplesRequired": 3
  }
}
```

Após esta etapa, `check:slo-target` passa a ser **bloqueante** (exit 1 se `p95Ms > target`).

---

## Critério de fechamento de F5.3

- [ ] 3 ciclos `generate:e2e-high-manifest` com staging real (`commitSha` ≠ `recovery-local`)
- [ ] 3 baselines com `sampleSource: "scenario-latency"` e `samplesCount >= 1`
- [ ] `economy-slo-targets.json` com `ratified: true`
- [ ] `check:slo-target` bloqueante em CI de PR
- [ ] Evidence indexada com baseline real (`docs/EVIDENCE_INDEX.md`)

**F5.3 permanece `parcial` até todos os itens acima concluídos.**

---

## Caminho A — follow-up técnico (não bloqueia próximo ciclo)

`generate:e2e-high-manifest` deve gravar `latencyMs` por entrada de `scenarioResults[]` ao rodar em staging real. O Caminho B já permite baseline agregado com metadata clara enquanto isso não for feito. Caminho A resolve o gap de forma mais precisa (p50 calculável), mas não é bloqueante para o Cycle 1.

---

## Artefatos desta abertura (2026-06-16)

| Arquivo | Papel |
|---------|-------|
| `scripts/sloBaselineCollect.ts` | Lib de coleta com Caminho B; exporta `manifestCommitSha` |
| `scripts/generateSloBaseline.ts` | Importa `sloBaselineCollect.ts`; grava `sampleSource` e `manifestCommitSha` |
| `scripts/checkSloTarget.ts` | Guards de ratificação adicionadas (4 condições bloqueantes) |
| `scripts/sloBaselineCollect.test.ts` | 6 testes: scenario-latency, aggregate-latency, none, file-not-found, commitSha, priority |
| `ops/evidence/latest/economy-slo-baseline-2026-06-16.json` | Baseline gerado via Caminho B (`sampleSource: aggregate-latency`, `samplesCount: 0`) |

Testes executados: **6/6 pass** (`node --import tsx --test scripts/sloBaselineCollect.test.ts`)
