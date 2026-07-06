# Fase 3 — Dividas Documentadas Closure

## 1. Resumo executivo da Fase 3

A Fase 3 consolidou quatro frentes de divida documental e guardrails leves sem alterar runtime critico:

- F-07: matriz conservadora de compatibilidade do Agent Protocol;
- F-08: formalizacao da divida de entrypoint unico no runtime de chat;
- F-09: auditoria de hygiene para arquivos tracked que batem com ignore;
- F-10: formalizacao do gap de white-label runtime.

Resultado consolidado:

- documentacao, evidencias e checks leves foram adicionados com sucesso;
- as quatro frentes agora possuem linguagem de status mais precisa no repositório;
- nenhuma das quatro pode ser tratada como totalmente fechada no plano tecnico mais amplo.

## 2. Escopo executado

Escopo efetivamente entregue nesta fase:

- criacao de matriz documental e check de consistencia para Agent Protocol;
- criacao de documento de divida e guardrail anti-drift para Chat runtime;
- criacao de auditoria/check de tracked ignored files com classificacao conservadora;
- criacao de documento de gap para white-label runtime;
- criacao de evidencias indexaveis para cada frente;
- conexao dos checks relevantes ao `package.json` e ao CI quando aplicavel.

Escopo deliberadamente nao executado:

- criar Agent Protocol `v2`;
- implementar entrypoint unico engine-side;
- limpar o legado tracked ignored do Git;
- implementar runtime white-label governado.

## 3. Matriz PR -> divida -> status

| PR | Divida | Entrega principal | Status conservador |
| --- | --- | --- | --- |
| PR-6 | F-07 / Agent Protocol multi-version matrix | matriz documental + check de referencias/baselines reais | matriz/check `evidenciado`; compatibilidade multi-versao real `parcial` / `proposta` |
| PR-7 | F-08 / Chat runtime entrypoint debt | documento de divida + guardrail anti-drift leve | documentacao/guardrail `evidenciado`; entrypoint unico engine-side `parcial` |
| PR-8 | F-09 / Git hygiene / tracked generated files audit | auditoria classificada + check de higiene | audit/guardrail `evidenciado`; limpeza do legado tracked ignored `parcial` |
| PR-9 | F-10 / White-label runtime gap | documento de gap + evidencia conservadora | gap formalizado `evidenciado`; capacidades runtime correlatas `parcial`; runtime completo `proposta` |

## 4. Evidencias criadas

- `ops/evidence/latest/agent-protocol-compatibility-matrix-2026-07-02.md`
- `ops/evidence/latest/chat-runtime-entrypoint-debt-2026-07-02.md`
- `ops/evidence/latest/git-hygiene-tracked-files-2026-07-02.md`
- `ops/evidence/latest/white-label-runtime-gap-2026-07-02.md`
- `ops/evidence/latest/fase-3-dividas-documentadas-closure-2026-07-02.md`

## 5. Checks/gates adicionados

### F-07

- `pnpm check:agent-protocol-compat-matrix`
- gate ligado ao job `AgentProtocolCompat`

### F-08

- `pnpm check:chat-runtime-entrypoint-debt`
- gate ligado ao job `ChatEngineRegression`

### F-09

- `pnpm check:tracked-ignored-files`
- gate ligado ao job `EvidenceIndex`

### F-10

- nenhum check novo

Justificativa:

- ainda nao existe contrato/runtime white-label suficientemente real para um gate de baixo risco;
- nesta frente, a entrega correta foi explicitar o gap e o DoD futuro.

### Check transversal

- `pnpm check:docs-link-integrity`

Esse check passou a funcionar como guardrail documental transversal para os artefatos da Fase 3.

## 6. Gaps remanescentes

### F-07

- ainda nao existe `agent-protocol.v2` com schema, baseline, changelog e evidencia;
- a janela `N-1` nao pode ser promovida a compatibilidade evidenciada.

### F-08

- o launcher continua chamando multiplos helpers engine-side;
- ainda nao existe entrypoint unico para decisao, snapshot e execucao.

### F-09

- existem arquivos `generated_safe_to_untrack` e `unknown_review` ainda rastreados;
- o guardrail atual evita novos desvios, mas nao limpa o legado por si so.

### F-10

- nao existe `partnerId` ou equivalente resolvido em runtime;
- nao existe partner/domain routing verificavel;
- nao existe segregacao economica por parceiro.

## 7. O que nao foi fechado

Nao foi fechado nesta fase:

- compatibilidade multi-versao real do Agent Protocol alem de `v1`;
- unificacao do chat em um unico entrypoint engine-side;
- untrack/limpeza do legado tracked ignored;
- white-label runtime governado de ponta a ponta.

Regra de leitura:

- o que foi fechado nesta fase e a camada de documentacao, evidencia e guardrail;
- a capacidade tecnica completa continua parcial ou proposta, conforme cada frente.

## 8. Riscos residuais

- risco de interpretar a matriz do Agent Protocol como suporte multi-versao completo quando ela ainda e conservadora;
- risco de confundir launcher `render-first` com eliminacao total da divida de entrypoint unico;
- risco de tratar o check de tracked ignored como limpeza efetiva do legado;
- risco de ler branding tenant-aware e copy de white-label como runtime multi-parceiro completo.

## 9. Recomendacoes para proximos PRs

1. F-07: so abrir PR de nova compatibilidade quando houver schema, baseline, changelog e gate reais para a nova major.
2. F-08: atacar a consolidacao `Launcher -> engine` por entrypoint unico antes de mexer em regras novas de UX/comportamento.
3. F-09: separar um PR de decisao operacional para `generated_safe_to_untrack` e outro, se necessario, para `unknown_review`.
4. F-10: nao iniciar implementacao parcial de white-label sem antes definir identificador de parceiro, resolucao runtime e gates fail-closed minimos.

## 10. Status final conservador

- Fase 3 como trilha documental/guardrail: `evidenciado`
- capacidades tecnicas subjacentes ainda abertas: `parcial`
- capacidades futuras nao implementadas: `proposta`

Conclusao:

- a Fase 3 melhorou a governanca documental e a capacidade de detectar drift;
- ela nao elimina, por si so, as dividas tecnicas estruturais de F-07, F-08, F-09 e F-10.

