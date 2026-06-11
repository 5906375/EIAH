# Self-service UX Improvements — 3 Ondas — 2026-06-09

## Objetivo

Elevar a experiência operacional do self-service em três frentes incrementais:
- **Onda 1**: catálogo filtrável + domínio/saída por agente
- **Onda 2**: progresso incremental no spinner + sentinel de conclusão + botão Reexecutar
- **Onda 3**: persistência sessionStorage do `NeedMoreInfoDialog` + recuperação de run expirado + diff visual shadow

---

## Onda 1 — Catálogo com domínio, saída esperada e filtro

### Arquivos alterados

- `apps/web/src/pages/self-service/config.ts`
  - adicionado `AgentDomain` type com 8 domínios: `auditoria | marketing | comercial | financeiro | defi | nft | operacional | suporte`
  - adicionado `AGENT_DOMAIN_LABELS` map para exibição no filtro
  - adicionado campos `domain: AgentDomain` e `exampleOutput: string` a `BaseConfig`
  - todos os 14 agentes (`aadv`, `mkt`, `j360`, `flow-orchestrator`, `risk-analyzer`, `guardian`, `fin-nexus`, `onchain-monitor`, `i-bc`, `diarias`, `nft-py`, `imagenftdiarias`, `defi-1`, `pitch`, `eiah`) receberam os dois campos

- `apps/web/src/pages/self-service/index.tsx`
  - adicionados estados `catalogSearch` e `catalogDomain`
  - adicionado memo `filteredCatalog` (filtra por domínio e busca texto em `title`, `description`, `exampleOutput`)
  - adicionada UI de filtro antes do grid: campo de busca + chips por domínio com toggle

### Resultado

Catálogo com 14 agentes filtráveis por domínio e por texto livre, incluindo busca no campo `exampleOutput`.

---

## Onda 2 — Spinner incremental + sentinel de conclusão + Reexecutar

### Arquivos alterados

- `apps/web/src/components/runs/RunViewer.tsx`
  - adicionada `humanizeEventType()` que mapeia eventos `run.*` para labels em PT-BR
  - adicionados refs `prevStatusRef` e estados `justCompleted`, `rerunValues`
  - spinner passa a exibir o label do último evento recebido em vez de texto estático
  - `useEffect` de sentinel: detecta transição `pending|running → success|error|blocked`, ativa `justCompleted` por 3 s
  - banner de sentinel exibido após conclusão com ícone de check e fade de 3 s
  - botão "Reexecutar" exibido quando run está em estado terminal e `onRerun` foi fornecido; abre alerta se `rerunValues` disponível
  - assinatura atualizada: aceita prop `onRerun?: (formValues: Record<string, string>) => void`

- `apps/web/src/pages/self-service/components/RunStatusCard.tsx`
  - adicionada prop `onRerun?: (formValues: Record<string, string>) => void`
  - repassa `onRerun` para `RunViewer`

### Resultado

Spinner mostra progresso real do agente. Conclusão é sinalizada visualmente. Usuário pode reexecutar com os mesmos valores do run anterior.

---

## Onda 3 — Persistência NeedMoreInfo + recuperação de run expirado + diff shadow

### Arquivos alterados

- `apps/web/src/pages/self-service/components/NeedMoreInfoDialog.tsx`
  - adicionada prop `runId?: string`
  - adicionadas helpers `storageKey`, `saveDialogValues`, `loadDialogValues`, `clearDialogValues` com TTL de 30 min
  - `useEffect` de init restaura valores salvos no sessionStorage quando dialog abre (chave `need_more_info:<runId>`)
  - `useEffect` de save persiste `localValues` a cada mudança enquanto dialog aberto
  - `handleSubmit` limpa sessionStorage antes de chamar `onSubmit`
  - banner "Campos restaurados da sessão anterior" exibido quando há dados salvos

- `apps/web/src/pages/self-service/components/AgentFormShell.tsx`
  - adicionados estados `staleContextWarning` e `expiredWithPendingDialog`
  - `handleRerun`: restaura valores do formulário, ativa `staleContextWarning`, limpa run ativo, faz scroll ao topo
  - `useEffect` de expired dialog: detecta run em estado `error/blocked` com `followUpDialog` ativo → aciona `expiredWithPendingDialog`
  - banner âmbar de contexto stale (dismissível) exibido antes do formulário quando `staleContextWarning=true`
  - banner rosa de dialog expirado com botão "Retomar campos preenchidos" quando `expiredWithPendingDialog=true`
  - seção de diff shadow: quando `shadowPreview` e `lastRun` estão em estado terminal, exibe custo estimado vs real, delta colorido (verde/vermelho), status previsto vs real, warnings da preview
  - `onRerun={handleRerun}` passado para `RunStatusCard`
  - `runId={followUpDialog?.runId}` passado para `NeedMoreInfoDialog`

### Resultado

Usuário não perde campos preenchidos no `NeedMoreInfoDialog` em reload/navegação (TTL 30 min). Ao reexecutar com contexto stale, recebe aviso explícito. Se run expira com dialog pendente, UI oferece retomada dos campos. Shadow diff permite comparar estimativa vs execução real.

---

## Validação

```bash
pnpm check:self-service-runtime-graph
pnpm check:frontend-duplication
pnpm --filter @eiah/web tsc --noEmit
```

---

## Cobertura de agentes por domínio

| Domínio | Agentes |
|---------|---------|
| auditoria | `aadv`, `guardian` |
| marketing | `mkt` |
| comercial | `j360`, `i-bc`, `pitch` |
| financeiro | `fin-nexus` |
| defi | `flow-orchestrator`, `onchain-monitor`, `defi-1` |
| nft | `nft-py`, `imagenftdiarias` |
| operacional | `risk-analyzer`, `diarias` |
| suporte | `eiah` |
