# EIAH Outputs Matrix v1 Validation — 2026-07-08

## Escopo

Consolidação documental/evidencial da Matriz de Saídas do EIAH v1 sem alterar runtime, rotas, banco, contratos públicos ou `ChatAgentLauncher`.

## Arquivos analisados

- `CODEX.md`
- `IA_EIAH.md`
- `AGENTS.md`
- `docs/architecture/agent-chat-runtime.md`
- `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`
- `docs/EVIDENCE_INDEX.md`
- `apps/api/src/services/imob/orchestrator/imobNextActionResolver.ts`
- `apps/api/src/services/imob/crm/imobCrmTurnEngine.ts`
- `apps/web/src/pages/app/imob/chatProof.ts`
- `apps/web/src/features/imob/ImobCommandCenter.tsx`
- `apps/api/src/services/imob/intake/imobContractClassifier.ts`
- `apps/api/src/services/imob/intake/imobContractPiiMasker.ts`
- `apps/api/src/orchestrator/llmExecutor.ts`
- `apps/api/src/services/imob/imobSpecialistBridge.ts`
- `apps/api/src/services/imob/crm/imobCrmLegacyResolverCompat.ts`
- `apps/api/src/services/runAtivoUniversalAgent/interpreters/j360LegalInterpreter.ts`
- `packages/core/src/actions/reporting/j360LegalReportRenderer.ts`
- `apps/api/src/services/runAtivoUniversalAgent/interpreters/mktCampaignInterpreter.ts`
- `apps/api/src/services/paymentIntents.ts`
- `apps/api/src/routes/billing.ts`
- `apps/api/src/services/contracts/contractGenerator.ts`
- `apps/api/src/tests/j360-legal-interpreter.test.ts`
- `apps/api/src/tests/run-worker-mkt-output.test.ts`
- `apps/web/src/pages/app/imob/chatProof.test.ts`
- evidências IMOB/Billing/Market Scan/Command Center já indexadas no repositório

## Referência documental ausente

O arquivo obrigatório citado no pedido, `5 saidas_verticais.odt`, não foi encontrado no workspace no momento desta validação.

Tratamento adotado:

- não usar esse arquivo como prova;
- registrar a ausência como lacuna documental;
- consolidar a matriz apenas com fontes reais presentes no repositório.

## Arquivos criados/atualizados nesta sessão

- `.gitignore`
- `docs/architecture/EIAH_OUTPUTS_MATRIX_v1.md`
- `ops/evidence/latest/eiah-outputs-matrix-v1-validation-2026-07-08.md`
- `docs/EVIDENCE_INDEX.md`

## Invariantes preservadas

- `apps/web/src/components/agents/ChatAgentLauncher.tsx` permaneceu sem diff nesta sessão.
- nenhum arquivo de runtime, rota, banco ou contrato público foi alterado.
- a única alteração de infra documental foi liberar `docs/architecture/EIAH_OUTPUTS_MATRIX_v1.md` no `.gitignore`, porque `docs/architecture/*` estava ignorado por padrão.

## Checks executados

### 1. Guardrail do launcher

Comando:

```bash
pnpm check:chat-launcher-render-only
```

Resultado:

- `ok=true`
- `checkedFile=apps/web/src/components/agents/ChatAgentLauncher.tsx`
- `violations=[]`

### 2. Compatibilidade de receipt canon

Comando:

```bash
pnpm check:receipt-canon-compat
```

Resultado:

- `ok=true`
- `schemaVersion=1.0.0`

### 3. Índice de evidências

Comando:

```bash
pnpm check:evidence-index
```

Resultado:

- `ok=true`
- `file=docs/EVIDENCE_INDEX.md`
- `refsChecked=379`
- `roadmap=ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`

### 4. Testes focados de outputs

Comandos:

```bash
node --import tsx --test apps/api/src/tests/j360-legal-interpreter.test.ts
node --import tsx --test apps/api/src/tests/run-worker-mkt-output.test.ts
TSX_TSCONFIG_PATH=apps/web/tsconfig.json node --import tsx --test apps/web/src/pages/app/imob/chatProof.test.ts
```

Resultado:

- `apps/api/src/tests/j360-legal-interpreter.test.ts` -> `pass 1 / fail 0`
- `apps/api/src/tests/run-worker-mkt-output.test.ts` -> `pass 1 / fail 0`
- `apps/web/src/pages/app/imob/chatProof.test.ts` -> `pass 1 / fail 0`

## Resumo dos achados

### Achados consolidados

- `Cards/CTAs IMOB` existem e são `parcial avançado`.
- `Market Scan Card` está `evidenciado`.
- `NextAction` existe, mas ainda carrega risco de drift porque parte do texto segue em layers legadas/compat.
- `Command Center` está `evidenciado` como dashboard e não deve ser tratado como chat.
- `KPIs` de funil/ranking/custo existem em REST/dashboard, mas não são saída conversacional governada.
- `Checklist documental` existe, mas ainda é relativamente raso.
- `Intake/anexo documental` existe no chat, porém com escopo automático estreito.
- `Contrato` tem suporte de serviço mais amplo, mas o intake automático evidenciado hoje está centrado em locação.
- `Legal Review/J_360` existe como especialista/contexto e output real; não prova vertical LEGAL autônoma.
- `Handoff IMOB -> LEGAL` continua majoritariamente simbólico/textual.
- `MKT Campaign Report` existe como output de especialista, não como vertical autônoma.
- `Invoice/Settlement` está `evidenciado` no Core Billing/Economy.
- `Operation Bundle` segue `parcial`.
- `Closing Output IMOB` segue `ausente/parcial`.
- `Logistics Output` permanece `proposta`.

### Gaps explícitos confirmados

- `N-07`: masking de contrato e sanitização do `llmExecutor` não são a mesma implementação.
- `N-08`: não existe artefato automático completo de fechamento do negócio IMOB com resumo apresentável + receipts + timeline + comissão + partes + ledger + verifyUrl.
- `Chat KPIs ausentes`: os agregados operacionais ficam no Command Center, não no chat.
- `Handoff silencioso`: specialists entram mais como apoio contextual do que como fluxo funcional retornável.
- `Approval humano`: geralmente explica o que fazer, mas ainda explica pouco o porquê em linguagem de negócio.
- `Personas de mercado imobiliário`: não há modelo de persona de negócio equivalente; o repo trabalha majoritariamente com RBAC técnico e contexto operacional.

## Matriz resumida

| Saída | Status | Observação |
| --- | --- | --- |
| IMOB cards/CTAs | parcial avançado | runtime real, coexistindo com legados |
| Market Scan card | evidenciado | surface canônica preservada |
| NextAction | parcial avançado | risco de drift textual |
| Command Center | evidenciado | dashboard, não chat |
| KPIs agregados | parcial avançado | REST/dashboard, não perguntáveis no chat |
| Checklist documental | parcial avançado | existe, mas ainda raso |
| Intake documental | parcial avançado | forte em locação/documentos |
| Draft/preview de contrato | parcial | não equivale a fechamento |
| Legal review J_360 | parcial avançado | especialista/context_only |
| Handoff IMOB -> LEGAL | parcial | simbólico/textual |
| MKT campaign report | parcial avançado | especialista/output |
| Invoice/Settlement | evidenciado | Core Billing/Economy |
| Operation Bundle completo | parcial | incompleto por operação |
| Closing Output IMOB | ausente/parcial | gap N-08 |
| Logistics Output | proposta | sem runtime real |

## Gaps P0/P1

### P0 documental/funcional

- ausência do arquivo de referência `5 saidas_verticais.odt` no workspace;
- ausência de `Closing Output` canônico do IMOB;
- desalinhamento potencial de masking entre `imobContractPiiMasker` e `llmExecutor`.

### P1 de produto/governança

- `NextAction` ainda com resíduos textuais fora do resolvedor canônico;
- `Operation Bundle` sem completude homogênea por operação;
- handoff funcional de specialists ainda incompleto;
- KPIs de chat ainda não formalizados no engine/contrato.

## Declarações explícitas obrigatórias

- `Closing Output` IMOB **não está fechado**.
- `Operation Bundle` completo por operação **não está fechado**.
- `Dashboard Output` IMOB **não deve ser tratado como Chat Output**.
- `J_360` e `MKT` **não foram promovidos** a verticais autônomas nesta validação.

## Status final

- `parcial/evidenciado`

Motivo:

- houve consolidação documental real, baseada em arquivos e evidências existentes no repositório;
- os checks/documentos desta sessão podem ser indexados;
- os gaps N-07, N-08, Chat KPIs, handoff Legal e bundle completo continuam abertos.
