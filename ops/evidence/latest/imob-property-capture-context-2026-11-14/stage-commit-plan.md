# Plano vigente — instrumentação correlacionada do intake IMOB

Preparado em 2026-11-16 por Codex, sem subagentes. **Somente preparação; nenhum stage/commit/push/deploy executado.** Esta é a seleção vigente. Todo o plano anterior permanece integralmente após o marcador de histórico, sem validade executável para esta entrega.

## Estado conferido e prontidão

- Branch `fix/llm-provider-failure-propagation`; HEAD `a047a1b20a6dd0558fbe3a374b49e7aa4480a475`; upstream `origin/fix/llm-provider-failure-propagation`. Stage vazio; sem fetch nem alteração de histórico nesta preparação.
- **40 caminhos únicos: 26 normais e 14 logs publicáveis ignorados.** Seis fontes de instrumentação, três testes já registrados, duas documentações, este plano e pacote de evidências. Nenhuma nova fonte/teste mudou após as aprovações reutilizadas.
- Seleção coerente para um único commit revisável, condicionada aos bytes staged e hooks normais. **Bloqueio local de empacotamento removido:** contracts build e novo build API autorizados passaram com exit 0; fontes/configurações intactas. A falha API anterior fica histórica. Não presumir aprovação integral ou CI.
- CLAUDE.md, CODEX.md, changes.diff e todos os logs originais locais ficam excluídos. Sem .gitignore alterado, diretórios implícitos ou temporários na seleção.

## Escopo e dependências

A API usa o engine/intake existente, executeLlmStep, runCompletion, registry/router e adaptador compartilhados com runs; não há novo runtime nem conversão de perguntas em runs. A instrumentação reutiliza x-trace-id do middleware, classifica falha pré-provider por etapa e separa despacho de transporte/resposta/validação. Mantém mensagem pública, domínio, autorização, seleção, retries, fallback e billing.

A leitura do Render já concluída encontrou API live em 64fe82d, consumidor de runs desabilitado e nenhum worker separado visível no workspace acessível. Intake usa EIAH; runs usam agente da execução e executeCapability. Presença das variáveis de provider e perfil/modelo efetivo daquele turno não foram verificados. Nenhuma configuração foi alterada e esses fatos não provam a causa histórica.

Os três arquivos de teste já são registrados por test:llm-provider-failure e test:ci-unit-suite; scripts/workflow/manifesto não mudaram. Os wrappers de evidência reutilizam ../typecheck-deltas.mjs e ../package-smoke.mjs do HEAD (não adicionar novamente), e a fixture atual já está versionada em packages/providers/tests/fixtures/. Sem alteração de contrato público, engine/launcher, modelos ou finanças.

## Resultados reais, reaproveitamento e limites

| Verificação | Resultado | Exit | Alcance |
| --- | --- | --- | --- |
| Providers, runtime, intake/rota | APROVADO, reutilizado | 0 | 5/5, 8/8 e 16/16; dublês/transporte sintético, sem novas execuções nesta preparação |
| ProviderBoundary | APROVADO, reutilizado | 0 | 1/1, gate oficial; EPERM inicial preservado |
| Core/providers builds | APROVADO | 0 | Processos concluídos e recuperados, sem repetição |
| Smoke de dist | APROVADO | 0 | Novos exports/declarations e etapas do transporte sintético; falha inicial do verificador preservada |
| Typecheck focal | REPROVADO | 1 | 17 raízes; 2 diagnósticos focais antigos +16 de dependências, zero introduzido contra HEAD virtual; EPERM anterior à compilação preservado |
| Build API anterior (histórico) | REPROVADO | 2 | 24 diagnósticos, primeiro TS2305 por exports IMOB ausentes em contracts dist local; fonte exporta; tsup não executou. Sem baseline do build completo |
| Build contracts e novo build API | APROVADO | 0 | Sequência posterior autorizada; exports confirmados no dist ignorado; API passou tipagem oficial e tsup; zero diagnósticos restantes nesse build |
| Provider real, navegador, HTTP/banco, CI remoto, deploy | NÃO EXECUTADO | — | Não autorizados/validados nesta etapa |

A ausência de diagnósticos introduzidos vale somente para a comparação focal; não classifica todos os diagnósticos do build API. Não corrigir erros antigos nem gates para obter aprovação. Causa específica de staging e vínculo da chave à organização abastecida continuam não comprovados. Status técnico PARCIAL; demais políticas transversais PROPOSTA. P1 e oferta de avaliação preservados.

## Evidências, proveniência e hashes

O pacote intake-observability/README.md descreve cada execução; results.json distingue a fase inicial da preparação. preparation-typecheck.json preserva todos os diagnósticos atuais/baseline. operational-comparison.json é projeção somente dos campos permitidos das consultas já realizadas, sem nova consulta após retomada ou leitura de segredos.

Todos os 14 originais .log ficam locais. A entrega usa published/*.log: substitui somente o caminho literal do repositório por <REPO> e omite payloads inline data-URL do código do checker. results.json → publication.logs registra contagem de cada transformação e hashes antes/depois. Demais bytes, ANSI, erros, quebras de linha e falhas históricas permanecem; não são cópias apresentadas como originais. Nenhum prompt/rascunho/resposta bruta real integra o pacote.

Campos log e evidenceSha256 históricos nos registros descrevem originais locais; resolver a evidência entregável pelo mapeamento publication.logs, sem exigir stage dos originais. source-hashes.json é fotografia inicial: nove fontes/testes não mudaram; hash documental anterior é histórico. preparation-manifest.json lista os 40 caminhos/flags e SHA-256 dos outros 39; ele próprio é conferido por igualdade com a cópia revisada. Não há gzip nesta seleção.

## Adição normal — 26 caminhos (somente proposta)

```bash
git add -- \
  'apps/api/src/orchestrator/llmExecutor.ts' \
  'apps/api/src/routes/imob.ts' \
  'apps/api/src/services/imob/intake/imobPropertyCaptureIntake.ts' \
  'apps/api/src/tests/imob-property-capture-intake.test.ts' \
  'apps/api/src/tests/llm-provider-failure.test.ts' \
  'docs/EVIDENCE_INDEX.md' \
  'docs/architecture/agent-chat-runtime.md' \
  'ops/evidence/latest/imob-property-capture-context-2026-11-14/stage-commit-plan.md' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/README.md' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/dependency-preparation.json' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/executions.json' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/operational-comparison.json' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/packaging-executions.json' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/packaging-preparation.mjs' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/preparation-executions.json' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/preparation-manifest.json' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/preparation-typecheck.json' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/provider-boundary-sandbox.json' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/results.json' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/source-hashes.json' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/typecheck-preparation.mjs' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/verification-first.json' \
  'packages/core/src/llm/LLMProviderError.ts' \
  'packages/core/src/llm/completionEngine.ts' \
  'packages/providers/src/OpenAIProvider.ts' \
  'packages/providers/tests/openai-provider-failure.test.ts'
```

## Adição forçada — 14 caminhos ignorados (somente proposta)

```bash
git add -f -- \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/published/affected-tests-first.log' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/published/api-build-after-contracts.log' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/published/api-build.log' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/published/contracts-build.log' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/published/core-build.log' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/published/intake-final.log' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/published/packaging-smoke-final.log' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/published/packaging-smoke.log' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/published/preparation-typecheck-outside.log' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/published/preparation-typecheck.log' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/published/provider-boundary.log' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/published/providers-build.log' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/published/providers-final.log' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/published/runtime-final.log'
```

## Exclusões explícitas

- `CLAUDE.md`
- `CODEX.md`
- `ops/evidence/latest/imob-property-guided-draft-2026-11-14/changes.diff`
- `ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/affected-tests-first.log`
- `ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/api-build-after-contracts.log`
- `ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/api-build.log`
- `ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/contracts-build.log`
- `ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/core-build.log`
- `ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/intake-final.log`
- `ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/packaging-smoke-final.log`
- `ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/packaging-smoke.log`
- `ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/preparation-typecheck-outside.log`
- `ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/preparation-typecheck.log`
- `ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/provider-boundary.log`
- `ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/providers-build.log`
- `ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/providers-final.log`
- `ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/runtime-final.log`

Também excluídos: originais históricos de outros pacotes, .env/segredos, caches, dist, node_modules e temporários, sem inventário de seus valores. Nenhum original é removido. A seleção não readiciona arquivos já versionados sem diff, incluindo fixtures/scripts antigos de apoio.

## Verificações dos bytes staged — somente após autorização

1. Conferir branch/HEAD e preservação dos hashes de CLAUDE.md, CODEX.md e changes.diff conforme results.json. Exigir conjunto staged igual aos 40 caminhos do manifesto, sem extras/ausências, e os três protegidos fora do índice. Usar apenas os dois comandos explícitos acima, nunca git add . / -A / -N.
2. Ler preparation-manifest.json do índice. Calcular SHA-256 dos bytes de git show :<caminho> para as 39 entradas files; conferir o manifesto também contra a cópia revisada do working tree. Não usar arquivos locais como substitutos dos bytes staged.
3. Resolver README, results, Evidence Index e dependências pelos bytes staged/HEAD. Campos de proveniência dos originais excluídos são resolvidos pelo mapeamento publication.logs. Conferir os hashes das cópias publicáveis e das fontes; não exigir hash documental histórico igual à documentação atual.
4. Conferir padrões de credenciais/dados sensíveis no conjunto staged sem ler ambientes ou secrets. Não normalizar originais ou omitir falhas. Confirmar gate/registro CI intactos.
5. Exigir git diff --cached --check exit 0. Stage vazio agora não comprova a aprovação futura. Se uma verificação/hook falhar, registrar causa/exit e parar antes de prosseguir; nunca contornar hooks.
6. Não repetir testes/builds válidos. Contracts dist e novo build API já foram autorizados e concluídos com exit 0; não repeti-los sem mudança concreta. Isso não é aprovação de CI remoto/deploy.

## Título e corpo sugeridos

```text
chore(imob): correlate property intake provider diagnostics

Carry HTTP correlation through the existing IMOB engine/intake and central
executor; distinguish profile/policy/provider resolution, adapter dispatch,
transport attempt, response receipt and parsing/validation. Sanitize generic
failures by controlled stage without raw errors, prompts, drafts or secrets.

Preserve public responses, authorization, provider selection, retries,
fallback and billing. Do not create another runtime or operational run.

Reuse passing doubles/synthetic tests: providers 5/5, runtime 8/8,
intake/route 16/16 and ProviderBoundary 1/1. Core/providers builds and
formal-dist smoke passed locally. Evidence includes historical failures,
original-log hashes and explicitly sanitized public copies.

Technical status PARCIAL. Focal typecheck FAILED: 17 roots, 2 old focal
and 16 dependency diagnostics, no introduced diagnostics versus virtual HEAD.
The initial API build failed with exit 2 and 24 type diagnostics against stale
local compiled contracts. After the authorized documented contracts build,
required exports were confirmed and the official API typecheck plus tsup build
passed with exit 0 and no remaining diagnostics. Preserve the original failure;
the separate focal typecheck remains failed and is not replaced by this build.

No real provider, browser, HTTP/database, remote CI or deployment validation.
Historical staging cause remains unproven. API live at 64fe82d has its run
consumer disabled; no separate worker is visible in the accessible workspace;
provider-variable presence is unverified. No infrastructure/financial changes.
Other transversal policies remain PROPOSTA; real retest requires separate
explicit authorization and must not save a property.
```

## Menor sequência posterior (não executada)

1. Preparação da dependência e build API já passaram, sem mudar fontes/configuração. Aguardar autorização específica para stage/commit/publicação e executar as conferências dos bytes staged e hooks normais.
2. Após autorização específica de stage/commit/publicação e gates, versionar a seleção e entregar API + core/providers à eiah-api-staging. Web não mudou; nenhum worker de runs separado foi identificado. Não habilitar consumidor nem criar serviço/runtime.
3. Conferir SHA implantado e API do bundle. Antes de qualquer chamada real, informar finalidade, ambiente, provider/modelo efetivo permitido, solicitação lógica prevista, tentativas/retries/fallback e custo/teto disponível, e obter autorização. Só então usar fixture sintética, recolher x-trace-id e confrontar cada etapa até intake, sem salvar imóvel. Timeout não comprova cancelamento físico.

---

# Histórico — plano Δ1–Δ3 e anteriores preservado integralmente; não executar

# Plano vigente — propagação de falhas IMOB Δ1–Δ3

Preparação revisável em 2026-11-16 por Codex, sem subagentes. **Nenhum stage ou commit executado.** Esta seção rege a próxima seleção; as seções anteriores estão preservadas integralmente após o marcador de histórico, inclusive seus títulos, comandos e contagens já superados.

## Estado e escopo conferidos

- Branch: `feat/imob-guided-property-draft`.
- HEAD: `70e66db4e7eea727f0f3567d8291595b1f86243b`.
- Upstream: `origin/feat/imob-guided-property-draft`, conforme configuração local; sem fetch nem afirmação de sincronismo remoto atualizado.
- Stage vazio. O diff da entrega contém 11 arquivos de implementação, 7 de testes/fixture/registro CI e 3 de documentação/preparação; os dois pacotes acrescentam 50 caminhos de evidência. Total abaixo: **71 caminhos únicos**.
- `CLAUDE.md` e `CODEX.md` já estavam modificados, foram preservados byte a byte e permanecem fora da entrega. O diff original da conversa guiada e os logs originais excluídos permanecem locais.
- Nenhuma fonte de implementação ou teste mudou nesta preparação. Não se reaplicaram patches nem se repetiram suites, builds ou chamadas de provider.

## Classificação de cada arquivo e dependências

Os caminhos dos comandos abaixo são a lista canônica desta seleção; cada grupo é classificado aqui, sem diretórios implícitos:

| Arquivo | Classe e função |
| --- | --- |
| `apps/api/src/orchestrator/llmExecutor.ts` | Δ1–Δ2: propagação e IDs do runtime |
| `apps/api/src/routes/imob.ts` | Δ2: correlação interna do intake |
| `apps/api/src/services/capabilityExecution.ts` | Δ2: normalização, referência legada e guarda sem replay/fallback |
| `apps/api/src/services/imob/intake/imobPropertyCaptureIntake.ts` | Δ1: unavailable antes do parsing e diagnóstico sanitizado |
| `apps/web/src/features/imob/structured/useImobFrontDoorForms.ts` | Δ3: tipagem de presentationSnapshot já produzido |
| `packages/contracts/src/imobPropertyCapture.ts` | Δ1: mensagem contextual do contrato, consumida pelo engine |
| `packages/core/src/llm/LLMProviderError.ts` | Δ1: exceção interna compartilhada, arquivo novo |
| `packages/core/src/llm/completionEngine.ts` | Δ1–Δ2: elegibilidade de retry, erro e IDs no log |
| `packages/core/src/llm/types.ts` | Δ2: campos aditivos e semântica dos identificadores |
| `packages/core/src/utils/retry.ts` | Δ1: predicado opcional preservando limites existentes |
| `packages/providers/src/OpenAIProvider.ts` | Δ1–Δ2: status/erro antes da extração e metadados reais |
| `.github/workflows/ci.yml` | CI: registro oficial dos testes afetados |
| `apps/api/src/tests/capability-execution.test.ts` | Teste: resultado determinístico não comprova provider/modelo |
| `apps/api/src/tests/fixtures/openai-credit-balance-exhausted.json` | Fixture nova: type/code derivados do erro real sanitizado |
| `apps/api/src/tests/imob-property-capture-intake.test.ts` | Teste: contrato unavailable e harness da rota |
| `apps/api/src/tests/llm-provider-failure.test.ts` | Teste novo: transporte sintético, falhas, IDs e consumidores |
| `apps/web/src/features/imob/structured/createImobStructuredForms.test.ts` | Teste: preservação do formulário/proposta e término da espera |
| `package.json` | CI/testes: comando formal da nova suíte sintética |
| `docs/EVIDENCE_INDEX.md` | Documentação: somente duas entradas de execuções existentes |
| `docs/architecture/agent-chat-runtime.md` | Documentação: proposta transversal preservada + adoção autorizada Δ1–Δ3 |
| `ops/evidence/latest/imob-property-capture-context-2026-11-14/stage-commit-plan.md` | Documentação: este plano reutilizado, histórico preservado |

Todos os 7 caminhos sob `imob-property-provider-diagnostic-2026-11-16/`, explicitados nos comandos, são **evidências do diagnóstico real anterior**: README, resumo, resultado, snapshot de staging, runner executado, log e manifesto histórico. Não são execução pós-patch. O runner não é chamado pelo CI e não será executado para preparar ou criar o commit.

Todos os 43 caminhos selecionados sob `imob-property-provider-failure-2026-11-16/` são **evidências da correção com transporte sintético e dublês**, incluindo runners focais, diagnóstico comparativo de tipos, consolidação, hashes, resultados finais e falhas intermediárias. Os dois logs gzip são cópias sem perda dos originais locais; os outros logs são os originais textuais. Arquivos novos e ignorados estão explicitados abaixo.

As 11 fontes dependem conjuntamente dos tipos/erro compartilhados, contrato IMOB, adapter, runtime e intake. Os testes novos precisam da fixture e da fonte de erro; package.json e workflow registram sua execução oficial. Engine e launcher já versionados consomem o contrato e o resultado unavailable; não há alteração cognitiva nova no launcher. generateText e recordCapabilityUsage não foram alterados; seus consumidores pertinentes foram exercitados, com writer substituído por dublê. Billing/reservas/cobrança, manifests antigos de testes e exports sem diff já estão no HEAD e não recebem adição redundante.

O conjunto é coerente para **um único commit**: a cadeia de propagação, compatibilidade dos consumidores e suas provas precisam permanecer juntas. Não há dependência de alteração financeira para versionar a guarda segura atual. Metering durável sem identidade real continua bloqueio separado, não entregue nem implicitamente autorizado. A proposta arquitetural é contexto da adoção delimitada; sua inclusão não ratifica o restante.

## Evidências, hashes e proveniência

- Pacotes reutilizados: README/results da correção e README/diagnostic-summary do diagnóstico anterior. As duas linhas novas do Evidence Index apontam para arquivos desta seleção. Referências a fontes estáveis e provas anteriores versionadas são satisfeitas pelo HEAD; referências aos dois logs locais excluídos são somente proveniência e têm cópias gzip entregáveis.
- Antes desta preparação, **62/62 hashes** do manifesto da correção coincidiam com os bytes locais. Nenhuma fonte/teste mudou depois. O manifesto atual contém **70 hashes dos outros 70 caminhos**, excluindo somente a si próprio; a fotografia anterior está em previousSnapshot, histórica, não usada como lista de stage.
- O manifesto do diagnóstico real permanece intacto: os 6 artefatos que enumera conservam os hashes; 8 fontes agora corrigidas correspondem ao HEAD anterior, e o hash histórico do Evidence Index coincide com o índice sem a nova linha de correção. São diferenças históricas esperadas, não drift a corrigir reescrevendo o original.
- `provider-tests-direct.log.gz` e `provider-tests-final.log.gz`: gzip mtime=0, sem alteração dos bytes descomprimidos. Originais contêm respectivamente 4 e 2 linhas com espaços finais, permanecem locais e não entram no stage. Original/cópia, SHA-256 e tratamento exato constam de results.json → packaging.losslessLogs. Nenhum log foi normalizado ou truncado.
- Fixture de teste: somente error.type/error.code do resultado real sanitizado, cujo SHA-256 é `f77384445eebd224b210fb2d9101e79e7a0b46d7b4a9462172df0b454333bbd7`. Message/param omitidos. Status/IDs dos testes são sintéticos. O runner histórico já sanitizava chave/Bearer/caminhos dos retornos; seu original e resultado foram preservados.
- Leitura e busca de padrões no escopo selecionado não identificaram valores reais de credenciais ou dados de usuários. Configurações de teste são sintéticas; paths locais e IDs públicos de deploy/correlação permanecem. Não é auditoria exaustiva. Nenhum .env, segredo, cache, dist, node_modules ou temporário integra a seleção.

## Resultados reaproveitados e ressalvas obrigatórias

| Verificação registrada | Resultado | Exit | Alcance |
| --- | --- | --- | --- |
| Falhas/consumidores | APROVADO | 0 | 9 executados, 9 aprovados, 0 falhas/ignorados; sintético/dublês |
| Seleção final afetada de retry/IDs | APROVADO | 0 | 3 executados, 3 aprovados, 0 falhas/ignorados; subconjunto dos nove |
| Capacidade determinística | APROVADO | 0 | 1 executado/aprovado, 0 falhas/ignorados |
| Intake/adaptador reaproveitados | APROVADO | 0 | 13/13 e 15/15; execução seletiva, não todos os intakes |
| Contratos; builds core/providers; smoke dist | APROVADO | 0 | Pacotes/empacotamento focais; não aplicação completa |
| Registro oficial CI e Evidence Index | APROVADO local | 0 | Não CI remoto; Index fora do sandbox após EPERM preservado |
| Typecheck focal final | REPROVADO | 1 | 16 raízes; 2 diagnósticos antigos focais, 16 de dependências, 0 introduzidos conforme baseline virtual |
| Diagnóstico real anterior | REPROVADO funcionalmente | 2 | Quota local, sem proposta; não reteste da correção |
| Provider real pós-patch, navegador, HTTP com banco | NÃO EXECUTADO | — | Não validados |

Falhas intermediárias permanecem preservadas, inclusive sandbox, tipagem e asserções antigas. Um log vazio sem exit não é promovido a aprovação; os resultados finais com saída/exit próprios estão discriminados em results.json/delta-executions.json. O check textual registrado anteriormente não certifica stage futuro nem logs antes não rastreados.

**Status técnico PARCIAL.** Quota local não comprova quota em staging. A causa da tentativa específica de staging continua não comprovada; não se declara o incidente resolvido nem o fluxo real de quartos/vaga aprovado. Alinhamento web/API e reteste são etapa separada. Nenhuma alteração financeira, novo fallback, orçamento global ou cancelamento físico transversal. Demais políticas continuam PROPOSTA. Oferta de avaliação desligada e ratificação P1 weekly_cycle_evidence_too_old preservadas.

## Lista exata — 39 adições normais

Comando **somente proposto**, a partir da raiz e após autorização:

```bash
git add -- \
  '.github/workflows/ci.yml' \
  'apps/api/src/orchestrator/llmExecutor.ts' \
  'apps/api/src/routes/imob.ts' \
  'apps/api/src/services/capabilityExecution.ts' \
  'apps/api/src/services/imob/intake/imobPropertyCaptureIntake.ts' \
  'apps/api/src/tests/capability-execution.test.ts' \
  'apps/api/src/tests/fixtures/openai-credit-balance-exhausted.json' \
  'apps/api/src/tests/imob-property-capture-intake.test.ts' \
  'apps/api/src/tests/llm-provider-failure.test.ts' \
  'apps/web/src/features/imob/structured/createImobStructuredForms.test.ts' \
  'apps/web/src/features/imob/structured/useImobFrontDoorForms.ts' \
  'docs/EVIDENCE_INDEX.md' \
  'docs/architecture/agent-chat-runtime.md' \
  'ops/evidence/latest/imob-property-capture-context-2026-11-14/stage-commit-plan.md' \
  'ops/evidence/latest/imob-property-provider-diagnostic-2026-11-16/README.md' \
  'ops/evidence/latest/imob-property-provider-diagnostic-2026-11-16/diagnostic-summary.json' \
  'ops/evidence/latest/imob-property-provider-diagnostic-2026-11-16/openai-integrated.json' \
  'ops/evidence/latest/imob-property-provider-diagnostic-2026-11-16/run-integrated.mjs' \
  'ops/evidence/latest/imob-property-provider-diagnostic-2026-11-16/source-hashes.json' \
  'ops/evidence/latest/imob-property-provider-diagnostic-2026-11-16/staging-snapshot.json' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/README.md' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/delta-executions.json' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/delta-typecheck-final.json' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/delta-typecheck.json' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/package-smoke.mjs' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/provider-tests-direct.log.gz' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/provider-tests-final.log.gz' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/results.json' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/source-hashes.json' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/typecheck-deltas.mjs' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/typecheck-focused.mjs' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/validate-deltas.mjs' \
  'package.json' \
  'packages/contracts/src/imobPropertyCapture.ts' \
  'packages/core/src/llm/LLMProviderError.ts' \
  'packages/core/src/llm/completionEngine.ts' \
  'packages/core/src/llm/types.ts' \
  'packages/core/src/utils/retry.ts' \
  'packages/providers/src/OpenAIProvider.ts'
```

## Lista exata — 32 adições forçadas

Todos são arquivos individualmente ignorados por `.gitignore:17:*.log`. Não usar -f em outros caminhos, diretórios ou curingas. As duas cópias .log.gz não são ignoradas e estão na lista normal.

```bash
git add -f -- \
  'ops/evidence/latest/imob-property-provider-diagnostic-2026-11-16/openai-runtime.log' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/adapter-tests-direct.log' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/adapter-tests-first.log' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/ci-registration.log' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/contracts-typecheck.log' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/delta-capability.log' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/delta-ci-final.log' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/delta-contracts.log' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/delta-core-build.log' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/delta-core-final.log' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/delta-evidence-index-outside.log' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/delta-evidence-index.log' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/delta-final-types.log' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/delta-first-types.log' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/delta-first.log' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/delta-ids-final.log' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/delta-outside-types.log' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/delta-package-final.log' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/delta-package-smoke.log' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/delta-providers-build.log' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/delta-whitespace-final.log' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/delta-whitespace.log' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-tests-direct.log' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-tests-first.log' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/presentation-contract.log' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/provider-quota-final.log' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/provider-tests-first.log' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/provider-tests-second.log' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/provider-tests-validated.log' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/render-only.log' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/runtime-entrypoint.log' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/typecheck-first.log'
```

**Total: 71 caminhos únicos = 39 normais + 32 ignorados.** Listas disjuntas; nenhum git add foi executado, inclusive -N.

## Excluídos e preservados

- `CLAUDE.md` e `CODEX.md`: alterações preexistentes. SHA-256 preservados respectivamente `66c82eb6465ab1b5c6d3c5142b591f8b5a6ee82b4840e4b4a74c578fdc2e5f37` e `2cad8b66e0cb2d35eb71308cbc8d3b10c3ba031ef7a18ac72622ab0ccf179525`.
- `ops/evidence/latest/imob-property-guided-draft-2026-11-14/changes.diff`: original de entrega anterior, sem reaplicação.
- `ops/evidence/latest/imob-property-provider-failure-2026-11-16/provider-tests-direct.log` e `ops/evidence/latest/imob-property-provider-failure-2026-11-16/provider-tests-final.log`: originais locais, entregues por gzip sem perda.
- Originais locais anteriores de `imob-property-guided-draft-2026-11-14/intake-first.log`, `forms-first.log` e `web-build.log`: já tratados na entrega anterior; não adicionar de novo.
- `apps/web/dist/`, `packages/core/dist/`, `packages/providers/dist/`, quaisquer dist/caches/node_modules/ambientes, .env, .agents/.codex, temporários, scratchpad e demais caminhos fora das duas listas. Nenhum arquivo foi removido; nenhuma alteração de .gitignore.

## Verificações futuras — somente após autorização

```bash
git diff --cached --name-only
git diff --cached --name-status
git diff --cached --stat
git diff --cached --name-only -- CLAUDE.md CODEX.md
git diff --cached --check
git diff --cached
```

1. Exigir igualdade exata entre as duas listas e os 71 caminhos staged, sem extras, omissões ou duplicações. Exigir nenhuma saída para CLAUDE.md/CODEX.md. Reconfirmar branch/HEAD antes de stage.
2. Ler o manifesto do próprio índice com `git show :ops/evidence/latest/imob-property-provider-failure-2026-11-16/source-hashes.json`. Para cada uma das 70 entradas de files, calcular SHA-256 dos bytes de `git show :<caminho>`; todas devem estar staged. Comparar os bytes do próprio manifesto com a cópia revisada do working tree. previousSnapshot é histórico; não exigir que seus originais locais estejam staged.
3. Descomprimir os dois gzip **lidos do índice**, conferir SHA-256 e igualdade com os hashes originais declarados em results.json também lido do índice; não normalizar o conteúdo descomprimido. Não há changes.diff novo nesta entrega; o diff consolidado de código é o próprio git diff --cached.
4. Ler README, results, manifesto e novas referências do Evidence Index pelos bytes staged, resolvendo dependências contra a seleção ou HEAD para arquivos reutilizados. Conferir todos os logs referidos em delta-executions.json, a fixture e sua proveniência. Confirmar os hashes dos seis artefatos do diagnóstico com o manifesto histórico staged; preservar suas diferenças de fontes explicadas acima.
5. Repetir a inspeção de sensíveis sobre os bytes staged, incluindo gzip descomprimido; conferir que só os 32 logs explicitados receberam -f. Hashes não provam ausência de segredos.
6. Exigir git diff --cached --check exit 0, inclusive nos novos logs textuais. Nenhum check do stage vazio nesta etapa vale como prova dessa aprovação futura. Se houver divergência, parar antes do commit e explicar a causa.
7. Se autorizado, criar somente o commit acordado pelo fluxo normal, **sem contornar hooks**. Não repetir suítes aprovadas sem mudança concreta; não enfraquecer gates. Eventual hook reprovado deve ser relatado com saída/exit reais, sem --no-verify.

## Título e corpo sugeridos

```text
fix(llm): propagate provider failures without replaying completed generations

Conclui somente a adoção autorizada de Δ1–Δ3: propaga erro estruturado sanitizado do adaptador OpenAI pelo runtime central ao intake, sem conteúdo vazio ou sucesso indevido. Quota financeira não recebe retry; erros elegíveis preservam os limites existentes. O intake mantém unavailable e o contrato/engine preserva formulário, rascunho e proposta, encerrando a espera sem escrita.

Distingue correlação interna, completion ID e request ID do provider. Preserva a referência legada de idempotência; identificadores/modelo efetivo/uso ausentes não são inventados. Geração concluída sem identidade de contabilização encerra explicitamente sem retry ou fallback da capacidade. Não altera billing, reservas ou cobrança; metering durável sem identidade continua bloqueio financeiro separado.

Validação com transporte sintético, fixture sanitizada e dublês: 9/9 casos, revalidação final dos 3 afetados e 1/1 capacidade determinística; resultados 13/13 de intake e 15/15 do adaptador reaproveitados. Contratos, builds oficiais core/providers e smoke de módulos empacotados aprovados. Evidências do diagnóstico real anterior e falhas intermediárias preservadas; dois logs publicados em gzip sem perda, com proveniência e hashes.

Status técnico PARCIAL. Typecheck focal de 16 raízes reprovado: dois diagnósticos antigos focais e 16 de dependências, sem diagnósticos introduzidos conforme comparação virtual com HEAD. Provider real pós-patch, navegador e HTTP com banco não validados. A causa da tentativa específica de staging permanece não comprovada; alinhamento web/API e reteste são etapa separada. Demais políticas transversais continuam PROPOSTA. Oferta de avaliação e ratificação P1 preservadas.
```

## Prontidão

Preparação pronta para revisão/autorização de um único commit, condicionada aos bytes staged e hooks normais. Não há mudança posterior em fonte/teste que invalide as verificações recuperadas; somente plano, documentação de empacotamento, consolidação, manifesto e cópias gzip foram preparados. Limitações operacionais e reprovação focal de tipos permanecem explícitas, sem promessa de CI ou staging corrigido. Sem stage, commit, push, PR, merge, deploy, chamadas reais ou alterações financeiras nesta etapa.

---

# Histórico — plano da conversa guiada e anteriores, preservado integralmente; não executar

# Plano vigente — conversa guiada do cadastro IMOB

Preparado em 2026-11-16 por Codex, sem subagentes. **Somente preparação: nenhum comando de stage ou commit executado.**
Esta seção rege o próximo commit. Abaixo do marcador de histórico conserva-se integralmente o plano anterior, já superado; seus 39 caminhos e título antigo não compõem a seleção atual.

## Estado conferido

- Branch: `fix/imob-property-draft-context`.
- HEAD: `d60655c4fd344dca39fbbdb90d2e46bbd44a3b78`.
- Upstream: `origin/fix/imob-property-draft-context` (consulta local, sem fetch/push).
- Stage vazio. Dez arquivos de código/testes, Evidence Index, este plano e pacote de evidências integram o incremento.
- `CLAUDE.md` e `CODEX.md`: alterações preexistentes preservadas byte a byte e excluídas. Nenhuma outra alteração local alheia foi identificada no status normal.
- Testes já registrados em `scripts/unit-tests-manifest.txt:233` e `:280`, script `test:ci-unit-suite`, chamado por `.github/workflows/ci.yml:820`. Esses três arquivos já estão em HEAD, não mudaram e não devem ser adicionados neste incremento. Nenhum teste novo órfão.
- Os resultados anteriores continuam válidos segundo o relatório reaproveitado. Nenhum teste, build, provider ou gate amplo foi repetido para preparar o plano.

## Evidências e limites

Pacote: `ops/evidence/latest/imob-property-guided-draft-2026-11-14/README.md` e `results.json`.

- Validação com dublês, em execuções seletivas: 13 casos de intake, 14 do adaptador e 5 de correlação; falhas iniciais preservadas. Não equivale a nova suíte integral.
- Build web 897 módulos e contratos exit 0 reaproveitados. Typecheck focal final exit 0: somente 12 raízes, inclui vite-env, exclui 17 diagnósticos de dependências.
- Reaproveitamento explícito dos logs de formulários, no-DB e três gates do pacote anterior, todos já versionados em HEAD. Não duplicar esses arquivos no stage.
- Provider real, navegador e HTTP com banco não validados. **Status técnico PARCIAL. A causa do retorno inválido em staging continua não comprovada.**
- Oferta de avaliação intocada. P1 `weekly_cycle_evidence_too_old` preservado, sem reinvestigação ou alteração de gate.
- Hashes anteriores: 29/29 coincidentes antes do empacotamento. Inventário de entrega: `source-hashes.json`, 28 hashes para os 29 caminhos abaixo, excluindo o próprio inventário.
- Busca por padrões sensíveis não identificou credencial real no escopo revisado; ocorrência de atribuição classificada como fixture preexistente `synthetic-test-only`. Não é auditoria exaustiva.
- Três cópias de logs em `published/`: somente remoção explícita do prefixo absoluto do workspace (2/6/1 ocorrências) e espaços finais em 2/0/1 linhas. Originais locais intactos/excluídos. Proveniência e hashes em `results.json` → `packaging.sanitizedLogs`.
- `changes.diff.gz` entrega o diff original comprimido sem normalização (27 linhas de contexto contêm espaço no original). Descompressão idêntica ao Git e ao `changes.diff` local, que fica excluído.

## Lista exata — 16 adições normais

Comando **proposto**, somente após autorização, a partir da raiz:

```bash
git add -- \
  'apps/api/src/routes/imob.ts' \
  'apps/api/src/services/imob/crm/imobProposalReviewContinuity.ts' \
  'apps/api/src/services/imob/imobAgentContract.ts' \
  'apps/api/src/services/imob/intake/imobPropertyCaptureIntake.ts' \
  'apps/api/src/tests/imob-property-capture-intake.test.ts' \
  'apps/web/src/components/agents/chatLauncherEngine.ts' \
  'apps/web/src/features/imob/structured/createImobStructuredForms.test.ts' \
  'apps/web/src/features/imob/structured/types.ts' \
  'apps/web/src/features/imob/structured/useImobFrontDoorForms.ts' \
  'docs/EVIDENCE_INDEX.md' \
  'ops/evidence/latest/imob-property-capture-context-2026-11-14/stage-commit-plan.md' \
  'ops/evidence/latest/imob-property-guided-draft-2026-11-14/README.md' \
  'ops/evidence/latest/imob-property-guided-draft-2026-11-14/changes.diff.gz' \
  'ops/evidence/latest/imob-property-guided-draft-2026-11-14/results.json' \
  'ops/evidence/latest/imob-property-guided-draft-2026-11-14/source-hashes.json' \
  'packages/contracts/src/imobPropertyCapture.ts'
```

## Lista exata — 13 adições forçadas

Cada caminho é ignorado pela regra `.gitignore:17:*.log`; não usar `-f` nos demais caminhos, diretórios, curingas ou no scratchpad inteiro.

```bash
git add -f -- \
  'ops/evidence/latest/imob-property-guided-draft-2026-11-14/adapter-confirmation-guards.log' \
  'ops/evidence/latest/imob-property-guided-draft-2026-11-14/adapter-withdrawal.log' \
  'ops/evidence/latest/imob-property-guided-draft-2026-11-14/contracts-typecheck.log' \
  'ops/evidence/latest/imob-property-guided-draft-2026-11-14/diff-check.log' \
  'ops/evidence/latest/imob-property-guided-draft-2026-11-14/forms-second.log' \
  'ops/evidence/latest/imob-property-guided-draft-2026-11-14/intake-reproduction.log' \
  'ops/evidence/latest/imob-property-guided-draft-2026-11-14/intake-withdrawal.log' \
  'ops/evidence/latest/imob-property-guided-draft-2026-11-14/published/forms-first.log' \
  'ops/evidence/latest/imob-property-guided-draft-2026-11-14/published/intake-first.log' \
  'ops/evidence/latest/imob-property-guided-draft-2026-11-14/published/web-build.log' \
  'ops/evidence/latest/imob-property-guided-draft-2026-11-14/review-correlation-regression.log' \
  'ops/evidence/latest/imob-property-guided-draft-2026-11-14/typecheck-final.log' \
  'ops/evidence/latest/imob-property-guided-draft-2026-11-14/typecheck-first.log'
```

**Total: 29 caminhos únicos = 16 normais + 13 ignorados.** As duas listas não se sobrepõem.

## Arquivos excluídos

- `CLAUDE.md` e `CODEX.md` — trabalho preexistente; hashes preservados em `results.json`.
- `ops/evidence/latest/imob-property-guided-draft-2026-11-14/changes.diff` — original local, entregue como gzip sem perda.
- `ops/evidence/latest/imob-property-guided-draft-2026-11-14/intake-first.log` — original local; entregar somente a cópia `published/intake-first.log`.
- `ops/evidence/latest/imob-property-guided-draft-2026-11-14/forms-first.log` — original local; entregar somente a cópia `published/forms-first.log`.
- `ops/evidence/latest/imob-property-guided-draft-2026-11-14/web-build.log` — original local; entregar somente a cópia `published/web-build.log`.
- `apps/web/dist/`, caches, `node_modules/`, temporários, ambientes e scratchpad fora da seleção explícita.
- Package/workflow/manifesto, exports browser e demais arquivos anteriores sem diff: já presentes em HEAD; não adicionar novamente. A única alteração no pacote de evidências anterior é este plano reutilizado.

## Verificações após autorização do stage

Não executadas nesta etapa:

```bash
git diff --cached --name-only
git diff --cached --name-status
git diff --cached --stat
git diff --cached --check
git diff --cached --name-only -- CLAUDE.md CODEX.md
git diff --cached
```

1. Comparar o conjunto staged com as duas listas acima: igualdade exata de 29 caminhos, sem duplicações/extras. Consulta específica às instruções sem saída.
2. Ler `:ops/evidence/latest/imob-property-guided-draft-2026-11-14/source-hashes.json` do índice. Para cada entrada, conferir SHA-256 dos bytes retornados por `git show :<caminho>`; todos os 28 alvos devem estar staged. Conferir o próprio inventário contra a cópia revisada do working tree.
3. Validar JSON e referências usando o conteúdo staged e arquivos reaproveitados de HEAD: README, results, nova linha do Evidence Index, plano, helper de tipagem e logs versionados. Originais explicitamente locais são só proveniência, não dependências da entrega.
4. Descomprimir o diff staged e comparar com `git diff --cached -- <dez caminhos de código/testes>`; preservar os bytes do artefato original. Se o Git variar apenas ordem de apresentação, comparar também os dez blocos por arquivo antes de concluir divergência.
5. Conferir novamente dados sensíveis nos bytes staged e o tratamento declarado dos três logs. Não normalizar logs originais nem adicionar uma fonte local excluída por engano.
6. `git diff --cached --check` deve sair com 0. Stage vazio agora não demonstra esse check futuro; se algo divergir após autorização, parar antes do commit.
7. Criar somente o commit autorizado, por fluxo normal com hooks. Não usar `--no-verify`, não desativar hooks nem alterar gates para aprovação. Não repetir suítes já válidas sem nova alteração que justifique.

## Mensagem proposta do commit

Título:

```text
feat(imob): confirm guided property draft updates in chat
```

Corpo:

```text
Apresenta uma proposta de alterações pelo intake contextual central do IMOB com o rascunho atual. Somente a confirmação contextual da proposta vigente aplica suas mudanças integralmente ao mesmo rascunho; salvar o imóvel permanece uma ação explícita separada do formulário.

Preserva perguntas, recusa, ambiguidade, pausa e retomada pelo provider contextual. Edição manual, proposta substituída ou resposta tardia não sobrescrevem campos; retirar todas as diferenças limpa a proposta anterior.

Validação local com dublês: cobertura seletiva de 13 casos de intake, 14 do adaptador e 5 de correlação, reutilizando resultados válidos e preservando falhas históricas. Build web (897 módulos) e contratos aprovados localmente. Typecheck limitado a 12 raízes, com 17 diagnósticos de dependências excluídos.

Status técnico PARCIAL. Provider real, navegador e HTTP com banco não validados. A causa do retorno inválido em staging continua não comprovada; esta entrega não é apresentada como correção comprovada desse incidente. Evidências e transformações de publicação documentadas; ratificação P1 weekly_cycle_evidence_too_old preservada.
```

## Prontidão

Seleção preparada para futura autorização de stage/commit, condicionada à conferência dos bytes staged e aos hooks normais. Não há alegação de CI remoto aprovado ou de validação operacional completa. A implementação continua PARCIAL.
Nenhum código/teste, build, ambiente externo ou .gitignore alterado nesta preparação. Originais preservados; novos artefatos de publicação têm destino explícito na seleção. Sem exclusões genéricas, stage, commit, push, PR, merge ou deploy.

---

# Histórico — plano anterior preservado, não executar

# Preparação exata de stage e commit — continuidade IMOB

Preparado em 2026-11-14 por Codex, sem subagentes. **Os comandos abaixo não foram executados.**
Branch: `feat/front-door-intake-run-lifecycle-imob-evaluation`.
HEAD: `453a3b0bf5e666e227a129b4930399e5ffac6efb`.

## Conferência realizada

- Stage vazio, HEAD e branch preservados.
- Antes do stage, `changes.diff` coincidiu byte a byte com o diff da tarefa (SHA-256 original: `a5633388e3974883b093f281445d81dbe2d2c886b39fecb26d82da038f3b42cf`). No stage autorizado, 20 linhas vazias de contexto tiveram o marcador de espaço removido para satisfazer `git diff --cached --check`, sem alterar conteúdo de código. SHA-256 do artefato normalizado: `2f6bc3f83318d225310d2530fd10bbd798f66cfd095ddb5367fd0570852e0651`.
- `git diff --check` aprovado, saída 0.
- Manifesto de testes e `test:ci-unit-suite` sincronizados; 12 nomes de logs referenciados no JSON existem. Os quatro logs históricos complementares também entram na seleção.
- Evidências anteriores reaproveitadas. Nenhuma suíte foi repetida nesta preparação.
- Uma busca por padrões de credenciais encontrou apenas a fixture local existente `user:pass@127.0.0.1:1/test` no contexto de package.json dentro do diff. Nenhum padrão de chave privada foi encontrado nessa busca; isso não equivale a uma auditoria completa de segredos.
- `CLAUDE.md` e `CODEX.md` permanecem com suas alterações preexistentes e ficam fora dos comandos.
- O conjunto tem **39 arquivos**: 18 de implementação/contrato/testes/CI/índice e 21 de evidências/preparação. Entre eles, 16 logs são ignorados por `.gitignore:17` e exigem adição explícita com `-f`.
- Nenhuma exceção global de gitignore é necessária. Nenhum caminho de diretório, curinga, `git add .` ou `git add -A` é usado.

## Stage proposto: 23 arquivos não ignorados

Executar a partir da raiz do repositório, somente quando for autorizado fazer stage:

```bash
git add -- \
  'apps/api/src/routes/imob.ts' \
  'apps/api/src/services/imob/crm/imobCrmTurnEngine.ts' \
  'apps/api/src/services/imob/imobAgentContract.ts' \
  'apps/api/src/services/imob/imobTurnResolver.ts' \
  'apps/api/src/services/imob/intake/imobPropertyCaptureIntake.ts' \
  'apps/api/src/tests/imob-property-capture-intake.test.ts' \
  'apps/web/src/components/agents/ChatAgentLauncher.tsx' \
  'apps/web/src/components/agents/chatLauncherEngine.ts' \
  'apps/web/src/features/imob/structured/createImobStructuredForms.test.ts' \
  'apps/web/src/features/imob/structured/types.ts' \
  'apps/web/src/features/imob/structured/useImobFormState.ts' \
  'apps/web/src/features/imob/structured/useImobFrontDoorForms.ts' \
  'apps/web/src/lib/api.ts' \
  'docs/EVIDENCE_INDEX.md' \
  'ops/evidence/latest/imob-property-capture-context-2026-11-14/README.md' \
  'ops/evidence/latest/imob-property-capture-context-2026-11-14/changes.diff' \
  'ops/evidence/latest/imob-property-capture-context-2026-11-14/results.json' \
  'ops/evidence/latest/imob-property-capture-context-2026-11-14/stage-commit-plan.md' \
  'ops/evidence/latest/imob-property-capture-context-2026-11-14/typecheck-focused.mjs' \
  'package.json' \
  'packages/contracts/src/imobPropertyCapture.ts' \
  'packages/contracts/src/index.ts' \
  'scripts/unit-tests-manifest.txt'
```

## Stage proposto: 16 logs ignorados

O `-f` é limitado aos logs locais reais desta tarefa; preserva aprovações, falhas iniciais e as revalidações autorizadas fora do sandbox.

```bash
git add -f -- \
  'ops/evidence/latest/imob-property-capture-context-2026-11-14/contracts-typecheck.log' \
  'ops/evidence/latest/imob-property-capture-context-2026-11-14/entrypoint-gate.log' \
  'ops/evidence/latest/imob-property-capture-context-2026-11-14/evidence-gate-authorized.log' \
  'ops/evidence/latest/imob-property-capture-context-2026-11-14/evidence-gate.log' \
  'ops/evidence/latest/imob-property-capture-context-2026-11-14/forms-final-focused.log' \
  'ops/evidence/latest/imob-property-capture-context-2026-11-14/forms-tests.log' \
  'ops/evidence/latest/imob-property-capture-context-2026-11-14/intake-final.log' \
  'ops/evidence/latest/imob-property-capture-context-2026-11-14/intake-tests.log' \
  'ops/evidence/latest/imob-property-capture-context-2026-11-14/launcher-gate.log' \
  'ops/evidence/latest/imob-property-capture-context-2026-11-14/no-db-diagnostic.log' \
  'ops/evidence/latest/imob-property-capture-context-2026-11-14/no-db-gate.log' \
  'ops/evidence/latest/imob-property-capture-context-2026-11-14/regression-tests.log' \
  'ops/evidence/latest/imob-property-capture-context-2026-11-14/snapshot-gate.log' \
  'ops/evidence/latest/imob-property-capture-context-2026-11-14/tests-initial.log' \
  'ops/evidence/latest/imob-property-capture-context-2026-11-14/typecheck-final.log' \
  'ops/evidence/latest/imob-property-capture-context-2026-11-14/typecheck-initial.log'
```

## Conferência depois do stage

Com o stage originalmente vazio e sem outras alterações simultâneas, `--name-only` deve listar exatamente os 39 caminhos dos dois comandos acima. A consulta específica a CLAUDE.md/CODEX.md deve continuar sem saída.

```bash
git diff --cached --check
git diff --cached --name-only
git diff --cached --name-only -- CLAUDE.md CODEX.md
git diff --cached --stat
```

## Commit proposto

Título:

```text
fix(imob): preserve property draft context in chat
```

Descrição sugerida:

> Prioriza o formulário de imóvel pendente antes do roteamento isolado e interpreta a continuação pelo runtime central com o rascunho atual. Aplica somente patches validados ao mesmo formulário, preserva perguntas/edições e descarta retornos de outro contexto, sem persistência automática.
>
> Inclui testes e evidências locais: intake 9/9, formulários 180/180 com revalidação final dos 7 afetados, isolamento sem DB 2/2, gates arquiteturais, tipagem focal/contratos e Evidence Index. Provider real, navegador e HTTP com banco permanecem não validados; 17 diagnósticos de dependências ficaram fora do typecheck focal.

A criação de commit permanece pendente de autorização. Preparar a seleção não executa stage nem commit.

## Estado e limites

A preparação está evidenciada pelas verificações de leitura e consistência acima; a implementação continua **parcial** quanto à validação externa. Não altera o status dos testes anteriores nem afirma aprovação global de tipagem ou CI remoto. Os comandos de stage, conferência pós-stage e commit são apenas propostos.

Arquivos de código/testes não foram alterados nesta etapa. Foi criado somente este plano de preparação, incluído explicitamente na própria seleção. Os artefatos anteriores foram preservados. Sem chamadas pagas, gravações de domínio, stage, commit, push, PR ou deploy.
