# ADR-003 — Hierarquia dos registros de trabalho durante a auditoria de integridade da evidência

## Status

Aceita

## Data

2026-08-03

## Contexto

Existem dois registros de trabalho vivos sem hierarquia declarada:

- `docs/ops/open-fronts.md`, versionado;
- o plano de PRs de 2026-07-31, até aqui não versionado e fora de qualquer gate.

A interseção entre os dois registros é de um único item. O plano não versionado reproduzia a configuração já registrada na frente `VERSION-UNIFICATION-PLAN-V13`.

## Decisão

Enquanto vigorar o objetivo de provar integridade da evidência, `docs/ops/open-fronts.md` é o registro primário de trabalho. O plano de PRs de 2026-07-31 fica subordinado e pausado, exceto pelos itens que servem diretamente ao objetivo.

Permanecem elegíveis, sem serem iniciados por esta decisão:

- PR-01;
- PR-04;
- PR-05;
- PR-07;
- PR-12.

Ficam pausados:

- PR-02;
- PR-03;
- PR-06;
- PR-08;
- PR-09;
- PR-11.

PR-10, `ENABLE-EVIDENCE-GRADE-ENFORCEMENT`, sai do horizonte enquanto o objetivo vigorar. Ligar enforcement sobre uma base cuja integridade está sob auditoria acoplaria um gate a dado não confiável.

PR-00, `FIX-AUTH-DEFAULT-POLARITY`, não é subordinado a esta decisão. Ele trata uma superfície de segurança e corre em paralelo. Permanece pendente verificar se já foi executado entre `main` e `HEAD`; esta decisão não realiza essa verificação nem inicia o item.

Este ADR não é indexado em `docs/EVIDENCE_INDEX.md`, pois não é evidência gerada por execução real, conforme as seções 8 e 13 de `IA_EIAH.md`. Existe precedente em sentido contrário: `docs/adr/ADR-001-domain-runtime-stack.md` está indexado na linha 89. Esse precedente diverge da norma, e a decisão do owner é seguir a norma. A conformidade da entrada existente é objeto da frente `RECONCILE-EVIDENCE-INDEX-NORM-DRIFT`, não deste ADR.

O objetivo de integridade da evidência somente pode ser encerrado quando forem demonstradas seis propriedades, cada uma com check e teste negativo:

1. cobertura do índice conforme a norma vigente;
2. proveniência com `runId`, SHA, ambiente, modo, comando e resultado;
3. não-circularidade de geradores;
4. gate discriminante bloqueante;
5. teste negativo por check crítico;
6. enforcement declarado igual ao efetivo.

## Motivações

- Eliminar a ambiguidade entre dois registros de trabalho paralelos.
- Priorizar itens que servem diretamente à prova de integridade da evidência.
- Evitar enforcement sobre uma base ainda não confiável.
- Preservar o tratamento paralelo da superfície de segurança de PR-00.
- Seguir a norma vigente do Evidence Index, em vez de reproduzir um precedente divergente.

## Alternativas consideradas

### Manter os dois registros sem hierarquia

Rejeitada porque preservaria a ambiguidade de prioridade e permitiria drift entre filas paralelas.

### Tornar o plano de PRs o registro primário

Rejeitada enquanto vigorar o objetivo de integridade da evidência, pois parte relevante de sua fila não serve diretamente a esse objetivo.

### Ligar PR-10 antes de encerrar a auditoria

Rejeitada porque enforcement sobre dados não confiáveis ampliaria o risco de bloquear ou aprovar com base em evidência cuja integridade ainda não foi demonstrada.

### Indexar este ADR por analogia com ADR-001

Rejeitada porque a prática observada na linha 89 de `docs/EVIDENCE_INDEX.md` diverge das seções 8 e 13 de `IA_EIAH.md`.

## Consequências

- `docs/ops/open-fronts.md` passa a ser o registro primário enquanto o objetivo vigorar.
- O plano de PRs permanece versionado, subordinado e pausado, ressalvados os itens elegíveis.
- Nenhum status de frente, PR ou fase é promovido ou rebaixado.
- Este ADR não estabelece status normativo próprio; o roadmap canônico permanece a fonte.
- Nem este ADR nem o plano versionado são indexados em `docs/EVIDENCE_INDEX.md`.
- Ambos ficam fora da cobertura de `scripts/checkDocsLinkIntegrity.ts`, que alcança apenas `CLAUDE.md`, `CODEX.md`, `AGENTS.md`, `IA_EIAH.md` e arquivos Markdown de `docs/architecture/`.

## Evidências obrigatórias desta decisão

Esta decisão não constitui evidência de execução e não exige entrada no Evidence Index. Suas referências documentais são:

- `docs/ops/open-fronts.md`;
- o plano de PRs de 2026-07-31 versionado sob `docs/ops/`;
- `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`;
- `IA_EIAH.md`, seções 8 e 13.

## Riscos

- A ausência de cobertura de gate sobre `docs/adr/` e `docs/ops/` deixa decisões canônicas sem verificação documental automatizada.
- A divergência entre norma e prática de indexação de ADR permanece aberta até o tratamento da frente `RECONCILE-EVIDENCE-INDEX-NORM-DRIFT`.
- A fila subordinada pode permanecer pausada além do necessário se o encerramento do objetivo não for registrado.

## Impacto em P0–P4

- `P0`: reduz drift entre registros de trabalho e explicita a divergência normativa do índice.
- `P1`: preserva o tratamento de governança sem promover status.
- `P2`: sem alteração de runtime ou contrato de interop.
- `P3`: mantém elegíveis os itens diretamente relacionados à integridade da evidência econômica.
- `P4`: sem alteração de produto ou rollout.

## Gatilhos para revisão

- Revogação por decisão registrada do owner, reativando a fila do plano na ordem original.
- Encerramento do objetivo de integridade da evidência.
- Resolução da frente `RECONCILE-EVIDENCE-INDEX-NORM-DRIFT`, que pode reabrir a questão da indexação de ADRs.
