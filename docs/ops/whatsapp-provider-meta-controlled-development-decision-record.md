# WhatsApp Meta — Decisao especifica de desenvolvimento controlado

## Autoridade, origem e baseline

Data: 2026-11-25. Etapa: 8.7.2.
Responsavel humano: Carlos Alberto Merlo, nas funcoes de Executive Sponsor,
Security, Backend/API, Platform Governance, Product/Platform e DocOps.
Fonte: deliberacao humana expressa "EXECUTAR — Etapa 8.7.2" nesta conversa.
As seis funcoes aprovam o desenvolvimento sintetico da proposta 8.7.1.
A acumulacao funcional e registrada sem declaracao de independencia.
Privacy/Compliance: nao aplicavel como approval adicional exclusivamente
ao laboratorio sintetico; tratamento real de dados continua sujeito a revisao.

Baseline: HEAD `3046f7251e3cb3d0d66bb0a47fe5f4e5ee3f7e8e`, branch
`docs/whatsapp-meta-candidate-assessment`, mais os tres arquivos F2.24
existentes, sem stage. Os dois registros F2.24 sao preservados; o indice
pode receber somente a evidencia real desta execucao. Nao e criado estado
oficial novo nem instrumento paralelo de governanca.

## Fundamento e alcance da autorizacao

Esta e a decisao especifica da fase posterior prevista no
[F5.0, Formal Phase Opening](whatsapp-provider-final-selection-formal-phase-opening-final-selection-only-charter.md),
separada da [abertura F2.24](whatsapp-provider-meta-f2-24-phase-transition-decision-record.md).
Materializada antes de iniciar alteracoes tecnicas.

Trata expressamente o [F2.25, Explicit Non-Implementation Boundary](whatsapp-provider-integration-next-phase-charter-non-implementation-boundary.md):
a autoridade humana autoriza exclusivamente a implementacao laboratorial
abaixo. O bloqueio de integracao e operacao real nao e levantado.
Nao se interpreta a autorizacao como permissao global de implementacao.
A decisao F2.24 continua `approve-to-open-next-phase-only`; seus campos
historicos de nao-autorizacao nao sao reescritos como autorizacao tecnica.

## Escopo tecnico aprovado

Modificar somente `apps/api/src/routes/whatsapp.ts` para extrair processamento
read-only comum, preservando seu transporte, autenticacao e contrato.
Criar exclusivamente os seis arquivos tecnicos autorizados na etapa 8.7.2:

- `apps/api/src/services/whatsappReadOnlyIngress.ts`.
- `apps/api/src/services/whatsappMetaAdapter.ts`.
- `apps/api/src/tests/whatsapp.meta-adapter.test.ts`.
- `apps/api/src/tests/support/whatsappMetaFixtures.ts`.
- `apps/api/src/tests/support/whatsappMetaHarness.ts`.
- `apps/api/src/tests/support/whatsappMetaFileStore.ts`.

Limites laboratoriais: payload ate 16 KiB, ate 20 eventos por lote, bytes
assinados com HMAC-SHA256 e credenciais ficticias; fixtures sinteticas;
binding e entitlement fail-closed; sanitizacao; read-only; observabilidade
em memoria; estado tecnico sintetico em diretorio temporario exclusivo dos
testes, com escritor unico, persistencia antes de ACK e teste de restart.
Esse store de teste nao constitui backend de producao ou prova distribuida.

## Validacao e evidencias autorizadas

Uma rodada de aceitacao/regressao proposta em 8.7.1, typecheck aplicavel
e isolamento, cada execucao de testes/typecheck limitada inicialmente a
60 segundos. Falhas nao autorizam repeticao automatica. Restricoes ambientais
devem ser reportadas com comando para WSL, sem alterar codigo para contorna-las.
Registrar e indexar somente evidencias efetivamente produzidas.
Os 17 controles F2.19 nao recebem aprovacao antecipada.

## Bloqueios e rollback

Freeze F2.23, No-Go Ledger F2.22, execution hold, `security-review-blocked`
e todos os bloqueios de integracao/operacao real permanecem ativos.
Execucao operacional e producao: `not authorized`. Provider integration:
`blocked`. Provider final selection: `not authorized`. Bloco D: nao ratificado.

Proibidos: chamadas a Meta, rede pelo adaptador, numeros/mensagens/dados reais,
credenciais reais, Docker, webhook publico, bootstrap, infraestrutura,
workflows, configuracao operacional, migrations/schema, Prisma, filas, Runs,
agentes/LLM, envio e mutacoes de dominio. Nenhum stage/commit/push/PR autorizado.

Isolamento: adaptador nao montado e sem dependencia do bootstrap; harness
nega rede antes de importar os testes. Rollback: encerrar o harness e
descartar apenas seu estado temporario; qualquer reversao tecnica fica
limitada aos caminhos autorizados, preservando os registros F2.24.
Nao usar stash, backup, checkpoint, branch, worktree ou limpeza geral.
