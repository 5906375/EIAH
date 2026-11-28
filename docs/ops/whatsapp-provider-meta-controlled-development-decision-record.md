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

## Etapa 8.9.2 — Autorizacao especifica do delta inbound read-only desativado

Fonte: deliberacao humana expressa "EXECUTAR — Etapa 8.9.2", em 2026-11-25.
Registrada antes de iniciar codigo desta etapa, pelo mecanismo de decisao
especifica F5.0 ja utilizado neste registro. Autoriza exclusivamente desenvolver
e validar o delta operacional com ativacao desabilitada; nao autoriza execucao
real. O boundary F2.25 e delimitado para esse desenvolvimento, sem levantamento
do hold operacional F2.22 ou do Freeze F2.23. Nao altera a decisao F2.24.

Baseline consolidada: merge b1ca462ea88b7f4c4c205103791c91d1d14554b7.
Ambiente reutilizado: branch docs/whatsapp-meta-candidate-assessment, HEAD
cecc2d8ca63fddb667f86e39eaa8066e0135ede5, worktree limpa e stage vazio.
Ambos possuem a mesma arvore Git af577acc41c53bf8b7a37e527c841ce514344c22;
nenhuma branch/worktree, merge ou checkpoint e necessario para trabalhar
sobre o conteudo consolidado. Main nao sera editada diretamente.

Escopo autorizado: GET/POST /api/webhooks/meta/whatsapp, raw body anterior
ao parser JSON e ao logger generico, feature flag desativada por padrao,
configuracao operacional fail-closed sem credenciais laboratoriais, separacao
explicita dos modos, envelopes representativos exclusivamente sinteticos,
binding/entitlement e processamento read-only existentes. Persistencia tecnica
PostgreSQL transacional com unicidade/idempotencia e ACK apos commit; schema
e migration preparados somente para revisao, sem aplicacao a banco real.
Nao persistir payload, telefone, conteudo, assinatura ou tokens; nao encaminhar
a agentes/LLM, filas, Runs ou mutacoes de dominio. Nao habilitar envio.

16 KiB, 20 eventos e 14 dias continuam propostas, sem aprovacao operacional
definitiva. A configuracao devera exigir parametros e referencias explicitas
de revisao/execucao futura, sem defaults operacionais desses limites.

Uma rodada dos testes necessarios ao novo delta e regressoes diretamente
afetadas, preparacao estritamente necessaria das dependencias existentes e
validacao typecheck/build API estao autorizadas. Testes com dubles nao provam
transacoes PostgreSQL reais; eventual infraestrutura adicional sera indicada
como pendencia, sem declaracao antecipada de eficacia. Registrar apenas
resultados efetivos no registro de evidencias e indice existentes.

Permanecem: executionAuthorization: not authorized; productionAuthorization:
not authorized; provider integration blocked; security-review-blocked;
No-Go Ledger ativo; Freeze F2.23 ativo. Sem selecao definitiva Meta, sem
ratificacao do Bloco D e sem promocao automatica F2.19. A dispensa de approval
Privacy/Compliance do laboratorio nao cobre tratamento real de dados.
Nao autoriza deploy, Cloudflare, credenciais reais, migration real, callback,
WABA, publicacao Meta, pagamento, reclassificacao do numero, mensagens reais,
Docker, stage, commit, push, PR ou merge. Rollback imediato: flag desativada;
nenhuma remocao de evidencias ou dos registros F2.24.
