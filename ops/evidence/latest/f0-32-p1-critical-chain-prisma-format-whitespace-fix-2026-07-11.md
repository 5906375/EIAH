# F0.32 follow-up — P1 critical chain whitespace-tolerant schema check

## Data
2026-07-11

## Objetivo
Registrar a correção do `check:p1-critical-chain` após a formatação canônica do Prisma em F0.32.

## Falha observada
O CI falhou com:

```text
missing_required_pattern
key: schema.approved_by
needle: approvedBy   String?
```

## Causa raiz

O gate `scripts/checkP1CriticalChain.ts` estava acoplado ao alinhamento textual exato do schema Prisma antes do `prisma format`.

Após F0.32, `packages/db/prisma/schema.prisma` passou a conter:

```text
approvedBy     String?           @map("approved_by")
approvedAt     DateTime?         @map("approved_at")
```

O conteúdo semântico dos campos continuava correto, mas o check seguia procurando `needle` com whitespace rígido:

```text
approvedBy   String?
approvedAt   DateTime?
```

## Correção registrada

O ajuste técnico já aplicado em `scripts/checkP1CriticalChain.ts`:

- removeu a dependência de espaçamento fixo para `approvedBy` e `approvedAt`;
- manteve a validação semântica dos campos no schema Prisma;
- preservou os demais asserts do gate P1;
- não alterou `packages/db/prisma/schema.prisma` neste follow-up documental.

Abordagem adotada:

- substituição do match literal frágil por validação whitespace-tolerant baseada em padrão;
- manutenção do vínculo semântico com os nomes de campo e tipos esperados.

## Arquivos lidos

- `CODEX.md`
- `IA_EIAH.md`
- `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`
- `AGENTS.md`
- `docs/architecture/agent-chat-runtime.md`
- `docs/EVIDENCE_INDEX.md`
- `scripts/checkP1CriticalChain.ts`
- `packages/db/prisma/schema.prisma`

## Arquivos alterados neste follow-up

- `docs/EVIDENCE_INDEX.md`
- `ops/evidence/latest/f0-32-p1-critical-chain-prisma-format-whitespace-fix-2026-07-11.md`

## Validação executada

Comando real:

```text
pnpm check:p1-critical-chain
```

Saída real:

```json
{
  "ok": true,
  "check": "check:p1-critical-chain",
  "summary": {
    "approvalChain": true,
    "failClosedEvidence": true,
    "receiptCanonOnHighFlows": true,
    "policyHighCoverage": true
  }
}
```

## Prova de isolamento

Sem alteração neste follow-up em:

- `scripts/checkP1CriticalChain.ts`
- `packages/db/prisma/schema.prisma`
- `.github/workflows/release.yml`
- `.github/workflows/release-node22-readiness.yml`
- demais workflows
- `package.json`
- `pnpm-lock.yaml`
- migrations
- Prisma Client gerado
- `apps/**`
- `apps/web/src/components/agents/ChatAgentLauncher.tsx`

## Resultado

O follow-up documental fecha a lacuna de evidência da correção já aplicada no gate P1 crítico, preservando o escopo e sem introduzir novo drift no schema Prisma.

## Status
Status: evidenciado
