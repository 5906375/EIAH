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

### Disciplina transversal de entrada semântica

O usuário se expressa naturalmente; a EIAH interpreta semanticamente. A disciplina vale para todas as superfícies destinadas a significado humano, agentes e verticais atuais e futuros. Aplicar o princípio normativo do Track P no roadmap vigente e a [especificação canônica de entrada agêntica](docs/architecture/agent-chat-runtime.md#entrada-agêntica-linguagem-natural-e-validação-determinística).

Antes de criar regex, parser ou heurística para interpretar linguagem do usuário:

1. classificar a entrada como **semântica**, **canônica** ou **híbrida**, pela finalidade do conteúdo, não pelo widget;
2. identificar o agente/vertical dono da intenção e de sua política de ambiguidade;
3. localizar o intake/runtime contextual existente;
4. verificar como provider/model participa pela arquitetura central, respeitando policy, disponibilidade, contexto, entitlement, escopo e governança;
5. estruturar intenção, slots, entidades e draft no domínio pelo intake agêntico, quando a entrada for semântica ou híbrida;
6. aplicar parser/schema/validator depois da interpretação, quando aplicável; para entrada canônica, normalizar e validar o valor informado;
7. preservar valores canônicos verificáveis, sem inventar informações ausentes;
8. em ambiguidade material ou confiança insuficiente antes de write, exigir clarificação/HITL no próprio Front Door e zero side effects da operação solicitada.

Não transformar parser determinístico em substituto do intake agêntico nem obrigar o usuário a aprender sua sintaxe. Não usar IA para inventar identificadores ou valores canônicos ausentes, nem para flexibilizar invariantes determinísticos. Exemplos, placeholders e helpers são ajuda de UX, não gramática obrigatória.

Heurísticas de segurança podem bloquear risco como safety nets; não assumem a compreensão semântica principal. Indisponibilidade de provider/model não autoriza fallback silencioso para persistência ou outra operação. Launcher/formulário coleta e renderiza; qualquer evolução cognitiva segue contrato do agente e engine.

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

## 8.1. Governança transversal de worktrees e deployment — TWDG

Este protocolo executa a obrigação do roadmap canônico, §9.6, para Claude Code, Codex e demais executores sujeitos às instruções comuns. Aplica-se às worktrees existentes e futuras, às verticais e aos serviços compartilhados.

1. **Autorização delimitada.** Antes de qualquer intervenção Git que altere índice, referências, histórico ou recursos de worktree, ou de qualquer deployment, confirmar autorização humana específica para a operação e seu escopo, origem, destino e ambiente, quando aplicáveis. Uma autorização pode abranger etapas expressamente delimitadas; não solicitar novamente o mesmo escopo já autorizado. A aprovação da política, um resultado de CI ou a existência de uma branch não autorizam essas intervenções.

2. **Preservação e reuso.** Preservar trabalho commitado, staged, não commitado, não rastreado e evidências ignoradas relevantes de todas as frentes afetadas. Reutilizar registros de worktrees, preservação e evidências existentes, verificando apenas sua aplicabilidade e as mudanças necessárias. Não criar inventários, checkpoints, backups, branches ou worktrees duplicados, nem limpar, descartar ou sobrescrever trabalho para facilitar uma integração.

3. **Reconciliação.** Identificar branch, HEAD, upstream, referência de `main`, recência conhecida das referências e relação com as frentes afetadas. Distinguir ancestralidade, commits exclusivos, equivalência de conteúdo comprovada e deltas residuais. Referência desatualizada ou de recência desconhecida deve ser declarada como limitação; sua atualização exige autorização correspondente. Divergência numérica, isoladamente, não justifica merge, rebase ou cherry-pick.

4. **Preflight por operação.** Antes de commit, push, PR e deployment, confirmar que o estado continua correspondente ao escopo autorizado: caminhos, stage, alterações locais, destino e condições dos hooks aplicáveis. Conferir o diff pertinente, inclusive arquivos novos e evidências ignoradas que serão incluídas. Não exigir worktree limpa quando o próprio delta autorizado estiver em preparação; exigir isolamento e preservação do trabalho alheio.

5. **Impacto transversal.** Identificar dependências e riscos de regressão entre verticais e serviços compartilhados, incluindo contratos, fontes e artefatos compilados, API, web, workers, persistência e configuração quando afetados. Reutilizar o preflight de estruturas existentes e os instrumentos de release, aprovação e recuperação aplicáveis, respeitando seu status e escopo. Não criar mecanismos paralelos nem transformar recomendações em bloqueios obrigatórios.

6. **Preflight de deployment.** Por componente e ambiente afetados, comparar o SHA efetivamente implantado com o SHA candidato e identificar diferenças de artefato, configuração, migrations e dependências. Revisar compatibilidade, ordem de implantação, estratégia de recuperação e limites de reversão de dados. Registrar itens não aplicáveis com justificativa. SHA implantado desconhecido ou incompatibilidade crítica não resolvida impedem autorizar o deployment afetado.

7. **Validação proporcional.** Reutilizar resultados concluídos enquanto permanecerem aplicáveis às fontes, dependências, configurações e condições relevantes do delta. Executar apenas validações necessárias às mudanças ou lacunas demonstradas, dentro da autorização recebida, preservando os gates obrigatórios. Evidência histórica não certifica automaticamente outro SHA, ambiente ou escopo; registrar resultados, falhas, pendências e limites sem promover controles antecipadamente.

8. **Bloqueio e decisão.** Na ausência de autorização, preservação demonstrada ou requisito obrigatório da intervenção, interromper a ação afetada, preservar o estado e apresentar o impedimento concreto e a providência mínima. Não realizar correções, sincronizações ou novas rodadas automaticamente. Preservar as competências, aprovações e exceções expressamente ratificadas nos instrumentos aplicáveis, sem criar bypass por esta política.

9. **Rastreabilidade.** Reutilizar os registros canônicos da frente e registrar as operações efetivamente realizadas, decisor, escopo, SHAs de origem e destino, validações, resultados e recuperação aplicável. Após deployment autorizado, registrar também a versão efetivamente implantada. Preservar históricos e sanitizar evidências; não versionar segredos ou dados pessoais indevidos. Atualizar o Evidence Index somente nas condições da §13, sem registrar planos ou conformidade não demonstrada como evidência.

10. **Aplicação contínua.** Aplicar o protocolo antes da próxima intervenção em cada frente, sem auditoria geral automática. Worktrees com instruções anteriores devem consultar a versão canônica atualizada; sua incorporação local exige autorização e preservação do delta existente. Não presumir propagação entre worktrees nem copiar regras para arquivos de cada executor. A TWDG preserva freezes, holds, No-Go Ledgers e demais bloqueios específicos; integração, publicação e autorização operacional permanecem decisões distintas.

A formalização documental não comprova conformidade das worktrees nem implementação de gate automatizado. Evolução de CI/CD exige autorização própria e deve estender mecanismos existentes após demonstrar a lacuna, sem substituir a decisão humana exigível.

---

## 9. Trabalho em andamento — IMOB

Antes de implementar qualquer mudança relacionada ao IMOB, identificar as frentes afetadas e consultar os checklists canônicos correspondentes:

- IMOB Data: `docs/ops/imob-data-pr-execution-checklist.md`
- IMOB Data — Trilha B runtime mínimo: `docs/ops/imob-data-trilha-b-runtime-minimo-execution-checklist.md`
- IMOB Run Archive: `docs/ops/imob-run-archive-pr-execution-checklist.md`
- IMOB Funil + Equipe: `docs/ops/imob-funnel-team-pr-execution-checklist.md`

Mudanças transversais devem consultar todos os checklists das frentes que comprovadamente afetem. O checklist da frente IMOB Cost ainda está ausente; nenhuma mudança nessa frente pode avançar até que seu checklist seja criado e ratificado. Essa ausência não bloqueia automaticamente mudanças que comprovadamente não afetem IMOB Cost.

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

Para implementação/adaptação de entradas, verificar:

- entradas semanticamente equivalentes geram estrutura de domínio equivalente quando não houver ambiguidade material;
- campos canônicos preservam exatidão, verificabilidade e normalização;
- ambiguidade material antes de mutação produz clarificação/confirmação e zero side effects da operação solicitada;
- parser/regex não é tratado como contrato público de linguagem.

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
