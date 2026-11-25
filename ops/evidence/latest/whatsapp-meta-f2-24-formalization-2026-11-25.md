# WhatsApp Meta — F2.24 Documentary Formalization Evidence

## Identificacao e escopo da evidencia

- Data: 2026-11-25.
- Etapas: materializacao 8.6.7; validacao/diagnostico 8.6.8-8.6.9;
  efetivacao documental 8.6.10.
- Baseline observada: `3046f7251e3cb3d0d66bb0a47fe5f4e5ee3f7e8e`.
- Branch observada: `docs/whatsapp-meta-candidate-assessment`.
- Preflight: worktree limpa antes da materializacao.
- Agente executor: Codex, sem subagentes.

Este registro evidencia a materializacao documental efetivamente executada do
[Decision Record Meta F2.24](../../../docs/ops/whatsapp-provider-meta-f2-24-phase-transition-decision-record.md),
instancia do [instrumento canonico F2.24](../../../docs/ops/whatsapp-provider-integration-phase-transition-proposal-board-decision-stub.md).
Na etapa 8.6.10, incorpora a validacao positiva fornecida pelo responsavel
humano e a efetivacao formal da abertura exclusivamente documental.
Nao evidencia eficacia do adaptador nem autorizacao de implementacao/operacao.

## Execucao documental realizada

CLAUDE.md e CODEX.md foram lidos integralmente antes das demais acoes.
O preflight foi consultado com `git status --short --branch` e
`git rev-parse HEAD`. Uma consulta pontual por identificador, etapa e runs
na documentacao operacional e nas evidencias nao localizou registro equivalente.
O identificador proposto na etapa 8.6.4 foi reutilizado:
`wa-meta-phase-transition-20261125-864`.

Na etapa 8.6.7, foi criado o Decision Record com os 14 campos F2.24 e `decisionState: defer`,
formalizando os approvals humanos de Executive Sponsor, Security, Backend/API,
Platform governance, Product/Platform e DocOps em nome de Carlos Alberto Merlo.
A ordem humana da etapa 8.6.7 confirma a concessao desses approvals; o agente
apenas os materializa. Nao foi fabricada assinatura digital nem data anterior.

Foram registradas a nao aplicabilidade de Privacy/Compliance exclusivamente
para a abertura documental e a acumulacao funcional, sem declarar independencia
ou dispensar revisoes futuras aplicaveis. O template F2.24 e os registros
historicos Meta permanecem preservados.

## Evidencias CI incorporadas por referencia

Resultados fornecidos pela autoridade humana na etapa 8.6.7:

- SHA: `de1c32e357657af1b8cd84d7f7a98c43d7cc7adc`.
- [CI Monorepo — 29573140953](https://github.com/5906375/EIAH/actions/runs/29573140953): `success`.
- [IMOB Worker Mutation E2E — 29573140945](https://github.com/5906375/EIAH/actions/runs/29573140945): `success`.

Nao houve consulta ao GitHub, reexecucao, download de logs ou validacao
independente desses resultados. Sao evidencias historicas incorporadas com
proveniencia humana explicita; nao sao resultados do novo delta.

## Validacao complementar e decisao humana da etapa 8.6.10

Na etapa 8.6.7, nenhum check, gate ou teste foi executado, conforme a ordem
humana daquela etapa. Na 8.6.8, Docs Link Integrity passou, exit code 0,
limitado aos 29 alvos canonicos; whitespace e isolamento passaram, incluindo
os dois arquivos novos sem stage. Os dois comandos `git diff --no-index
--check` retornaram 1, sem diagnostico de whitespace, por diferenca contra
`/dev/null`. O Evidence Index falhou antes do verificador.

Na 8.6.9, o diagnostico pontual identificou `spawnSync git EPERM` em
`scripts/tests/checkEvidenceIndex.test.ts`, na chamada `execFileSync` para
`git rev-parse HEAD`. A execucao diagnostica apresentou sete testes aprovados
e um bloqueado por restricao ambiental; nao atribuiu o erro aos documentos.

Na etapa 8.6.10, o responsavel humano informou execucao direta no WSL de
`timeout 60s pnpm check:evidence-index`: oito testes aprovados, zero falhas,
Evidence Index `ok: true`, 975 referencias verificadas e exit code 0.
Esse resultado tem proveniencia humana e nao e apresentado como nova execucao
do Codex. Supre a pendencia especifica da rodada anterior.

A mesma ordem humana autoriza expressamente efetivar a abertura documental,
reutilizando approvals, evidencias e validacoes ja consolidados. O registro
existente passa a `approve-to-open-next-phase-only`, mantendo o identificador
e todos os bloqueios tecnicos. O historico `defer` nao e apagado.

As novas alteracoes sao somente de decisao/proveniencia, sem novos artefatos
referenciados. A rodada complementar autorizada nesta etapa verifica apenas
whitespace, links dos dois registros, equivalencia das referencias do indice
e isolamento; seus resultados constam da entrega da etapa. O check integral
do Evidence Index no WSL e reutilizado, sem repetir o delta anterior.
Nao ha declaracao de que o verificador canonico de links cubra esses dois
registros; seu resultado anterior abrange somente os 29 alvos informados.

O Evidence Index descreve esta materializacao e a decisao humana atualizada,
sem atribuir prontidao tecnica ao adaptador. Nao foram criados inventarios,
checkpoints, manifests, hashes ou instrumentos paralelos de governanca.

## Resultado preservado

- `decisionState: approve-to-open-next-phase-only`
- `implementationAuthorized: false`
- `executionAuthorization: not authorized`
- `productionAuthorization: not authorized`
- `provider integration blocked`
- `security-review-blocked`
- Freeze F2.23, No-Go Ledger F2.22 e Non-Implementation Boundary F2.25 ativos.
- Provider final selection nao autorizado; Bloco D nao ratificado.

Nao foram executados Docker, alteracoes de codigo/infraestrutura/configuracao,
provisionamento de credenciais, chamadas externas a Meta, git add, commit,
push, PR ou criacao de branch/worktree.

Resultado: abertura exclusivamente documental formalizada por decisao humana;
desenvolvimento e operacao permanecem bloqueados.
