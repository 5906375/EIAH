# IA_EIAH.md — Instruções comuns para assistentes de coding no EIAH Builder

## 1. Papel deste arquivo

Este arquivo é a fonte operacional comum para assistentes de coding que atuem no repositório EIAH Builder, incluindo Claude Code, Codex no VS Code/IDE e outros agentes equivalentes.

O assistente deve atuar como executor técnico governado, não como fonte de verdade arquitetural.

Toda implementação deve preservar:

- fonte única de verdade;
- zero drift documental;
- arquitetura agent-driven;
- contratos versionados;
- gates de CI;
- evidência real;
- rollout seguro de verticais.

Se houver conflito entre este arquivo e as fontes normativas do projeto, prevalecem as fontes normativas.

---

## 2. Leitura obrigatória antes de qualquer alteração

Antes de editar código, abrir e considerar obrigatoriamente:

1. `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`
2. `AGENTS.md`
3. `docs/architecture/agent-chat-runtime.md`
4. `docs/EVIDENCE_INDEX.md`

Se algum desses arquivos não existir, parar a tarefa e reportar como **P0 documental**.

---

## 3. Fonte normativa canônica

A fonte normativa vigente é:

`ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`

O `docs/EVIDENCE_INDEX.md` é somente índice de evidências reais.

Não usar o Evidence Index como:

- backlog;
- plano futuro;
- lista de intenções;
- evidência antecipada.

Nunca declarar DONE sem evidência indexável.

---

## 4. Estado atual da plataforma v8.1

| Fase | Status |
|---|---|
| F0–F3 | Concluídas |
| F4 — Execução crítica imutável | Parcial avançada — hardening recorrente obrigatório |
| F5.0 — Marketplace/governança | Core fechado |
| F5.1 — Receipt Canon / PoU | Operacional — gate ativo em CI |
| F5.2 — Policies + human approvals | Parcial avançada |
| F5.3 — Auditoria pública / SLO | Parcial — ratificação SLO targets pendente |
| F5.4 — Interop | Parcial avançada+ |
| F5.5 — Outcome/experimentos | Parcial avançada |
| F5.6 — Economy | Parcial avançada+ |
| Track P — IMOB produto | Parcial avançada+ |

Pendente explícito v8.1:

`ratificação operacional dos SLO targets por ciclos recorrentes`

Sem evidência indexável, o status permanece **parcial**.

---

## 5. Verticais

| Vertical | Status |
|---|---|
| IMOB | Operacional e ativa |
| LEGAL | `context_only` — não operacional |
| HEALTH | `context_only` — desabilitada |
| URBAN | Não existe ainda no codebase |

Não promover vertical `context_only` para operacional sem:

- baseline;
- contrato;
- gates;
- decisão explícita;
- evidência indexável.

---

## 6. Regras arquiteturais obrigatórias do chat

A arquitetura do chat é **agent-driven**.

Regra-mãe:

```text
Agente define.
Engine executa.
Launcher renderiza.
```

Toda regra de:

- resposta;
- handoff;
- fallback;
- bloqueio;
- clarificação;
- quick reply;
- especialidade;
- indisponibilidade;
- limite de escopo;

deve pertencer a um agente específico e ser executada pelo engine.

O `ChatAgentLauncher` não pode receber regra cognitiva nova diretamente.

---

## 7. Sequência obrigatória para mudanças no chat

Ao implementar qualquer comportamento de chat:

1. identificar o agente dono da regra;
2. ajustar ou criar o contrato do agente;
3. implementar a execução no engine;
4. expor no launcher somente o resultado já resolvido;
5. adicionar testes/gates aplicáveis;
6. não atualizar Evidence Index sem evidência real.

Anti-padrão proibido:

```text
Adicionar comportamento novo diretamente no ChatAgentLauncher.
```

---

## 8. Regras de decisão v8.1

1. Não reabrir frentes já fechadas do IMOB Data sem decisão explícita.
2. Evidence Index só pode ser atualizado com arquivos existentes fisicamente no repositório.
3. Evidence Index só pode apontar para evidências geradas por execução real.
4. Nenhuma regra de comportamento do chat nasce no `ChatAgentLauncher`.
5. Fluxos sem `tenantId`, `workspaceId` ou `entitlement` válidos devem falhar em modo fail-closed.
6. Sem evidência indexável, o status é `parcial`.
7. Toda implementação deve ser checada contra o roadmap v8.1 antes de ser considerada válida.
8. Não declarar compatibilidade sem baseline versionado e CI.
9. Não criar breaking change sem política de versionamento e bump apropriado.
10. Não executar ação crítica sem trilha verificável.

---

## 9. Trabalho em andamento — IMOB

Antes de implementar qualquer mudança relacionada ao IMOB, consultar:

- `docs/ops/imob-data-pr-execution-checklist.md`
- `docs/ops/imob-cost-pr-execution-checklist.md`
- `docs/ops/imob-run-archive-pr-execution-checklist.md`
- `docs/ops/imob-funnel-pr-execution-checklist.md`

Regras específicas:

- não reabrir IMOB Data fechado sem decisão explícita;
- preservar isolamento multi-tenant/workspace;
- usar dados determinísticos e schema-driven;
- preservar masking de PII;
- exigir 403 fail-closed com `reasonCode` quando faltar entitlement/permissão;
- manter export de bundle/receipt por run quando aplicável.

---

## 10. Stack do projeto

- API: Node.js / TypeScript / Express
- DB: PostgreSQL via Prisma
- Queue: BullMQ + Redis
- Frontend: React / Vite
- Monorepo:
  - `apps/api`
  - `apps/web`
  - `packages/core`
  - `packages/db`

---

## 11. Referências adicionais

Consultar quando a tarefa tocar áreas relacionadas:

- `docs/architecture/vertical-context-imob.md`
- `docs/architecture/vertical-context-legal.md`
- `docs/ops/reason-codes-catalog.md`
- `docs/ops/agent-protocol-api-contract.md`
- `docs/ops/receipt-canon-versioning-policy.md`
- `docs/ops/receipt-canon-external-verifier.md`
- `docs/ops/run-bundle-api-contract.md`
- `docs/ops/ledger-txid-api-contract.md`

---

## 12. Governança cognitiva fail-closed

Para qualquer execução sensível, validar:

- intenção;
- RBAC;
- tenantId;
- workspaceId;
- entitlement;
- scope;
- Trust Score, quando aplicável;
- Policy Engine;
- reasonCode;
- audit trail;
- receipt/bundle/ledger quando aplicável.

Ausência de qualquer elemento obrigatório deve bloquear a execução.

---

## 13. Evidence Index

O arquivo `docs/EVIDENCE_INDEX.md` só pode ser alterado quando:

1. o arquivo de evidência existir fisicamente;
2. a evidência tiver sido gerada por execução real;
3. o caminho estiver correto;
4. o conteúdo provar o que a entrada declara;
5. a alteração não antecipar plano futuro.

Nunca adicionar ao Evidence Index:

- evidência planejada;
- evidência prometida;
- evidência manual sem execução;
- arquivo inexistente;
- resultado não verificável.

---

## 14. Testes e gates

Antes de encerrar uma tarefa, rodar os testes/gates aplicáveis ao escopo alterado.

Priorizar:

- testes unitários relevantes;
- testes de integração quando tocar API/runtime;
- checks de contrato quando tocar schema/interop/receipt/economy;
- checks de lint/typecheck;
- gates P1/P2/P3/P4 quando aplicável.

Se não for possível rodar algum teste, reportar explicitamente:

```text
Teste não executado:
Motivo:
Risco:
Como validar depois:
```

---

## 15. Regra de fonte canônica TypeScript em checks críticos

Em checks críticos de governança, anti-regressão, CI e gates P0/P1/P2/P3/P4, a fonte canônica de implementação é o arquivo versionado do repositório.

Para código TypeScript, a fonte canônica padrão é o arquivo `.ts`, salvo quando o objetivo explícito do check for validar artefato buildado.

Regras obrigatórias:

1. Scripts/checks escritos em TypeScript devem rodar com runtime TS compatível, preferencialmente:

```bash
node --import tsx <script.ts>
```

ou:

```bash
pnpm exec tsx <script.ts>
```

2. Não usar `node <script.ts>` puro em CI.

3. Não usar flags experimentais de Node, como `--experimental-strip-types`, sem compatibilidade explícita com a versão de Node usada no CI.

4. Checks críticos não podem depender de arquivos `.js` gerados localmente dentro de `src/**` quando a fonte canônica é `.ts`.

5. Todo arquivo validado por check crítico deve existir fisicamente no repositório e estar disponível em runner limpo de CI.

6. Arquivos `.js` locais, não rastreados pelo git ou gerados incidentalmente por build, não podem ser usados como:

   * fonte normativa;
   * evidência;
   * alvo de gate crítico;
   * prova de compatibilidade;
   * substituto de fonte `.ts`.

7. Se um check precisar validar JavaScript buildado, o alvo deve ser output formal, como `dist/*.js`, e o check deve:

   * declarar explicitamente que valida build output;
   * rodar depois do build;
   * não confundir artefato buildado com fonte canônica.

8. Qualquer divergência entre `.ts`, `.js`, `package.json`, workflows de CI, package exports, runtime e evidência deve ser classificada como drift.

9. Drift em RBAC, policy, approval, guardrail ledger, receipt, interop, economy, Evidence Index ou CI crítico deve ser tratado como P0/P1 conforme impacto.

Exemplos corretos:

```text
node --import tsx scripts/checkRbacFailClosed.ts
pnpm exec tsx scripts/checkGuardrailLedgerNoop.ts
packages/core/src/policy/TenantPolicyStore.ts
packages/core/policy/TenantPolicyStore.ts
```

Exemplos proibidos:

```text
node scripts/checkRbacFailClosed.ts
node --experimental-strip-types scripts/checkRbacFailClosed.ts
packages/core/src/policy/TenantPolicyStore.js
```

Exceção permitida:

```text
Validar dist/*.js somente quando:
- o build tiver sido executado antes;
- o check declarar que valida build output;
- o artefato for produzido de forma reproduzível no CI.
```

DoD obrigatório para checks críticos:

```text
[ ] script roda no mesmo formato local e CI;
[ ] script TypeScript usa `tsx` ou loader formal equivalente;
[ ] check valida arquivos versionados e existentes;
[ ] nenhum `.js` local não versionado é usado como fonte;
[ ] CI falha apenas por regressão real, não por artefato ausente;
[ ] `git status --short` não contém artefato gerado acidental.
```

---

## 16. Formato obrigatório de resposta final do assistente de coding

Ao concluir uma tarefa, responder com:

```text
Resumo:
- ...

Arquivos alterados:
- ...

Comandos executados:
- ...

Testes/gates:
- [pass/fail/not run] ...

Evidências geradas:
- ...

Status:
- evidenciado | parcial | proposta

Riscos remanescentes:
- ...

Observações:
- ...
```

---

## 17. Critério de status

Use somente estes status:

### evidenciado

Quando há código alterado, testes/gates executados com sucesso e evidência real/indexável quando aplicável.

### parcial

Quando a implementação foi feita, mas faltam testes, gates, evidência, validação externa ou ratificação operacional.

### proposta

Quando houve apenas plano, análise, recomendação ou patch não aplicado.

Nunca usar `DONE`, `finalizado` ou `concluído` sem evidência indexável.

---

## 18. Proibições absolutas

Não fazer:

- regra cognitiva nova no `ChatAgentLauncher`;
- Evidence Index com arquivo inexistente;
- declaração de fase como concluída sem evidência;
- promoção de vertical sem baseline;
- breaking change sem versionamento;
- ação crítica sem receipt/bundle/ledger quando aplicável;
- fluxo sensível sem tenant/workspace/scope;
- fallback permissivo em governança;
- alteração em economy/settlement sem gates específicos;
- reabertura de IMOB Data fechado sem decisão explícita.

---

## 19. Lembrete operacional

O objetivo não é apenas fazer o código compilar.

O objetivo é preservar:

```text
fonte única de verdade
zero drift
governança cognitiva
execução auditável
contratos versionados
evidência real
rollout seguro
```
