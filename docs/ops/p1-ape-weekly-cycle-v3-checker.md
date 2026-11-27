# Checker local P1 `ape.weekly-cycle.v3` (Entrega 1 de M1)

Ferramenta local, somente leitura, que avalia um pacote de evidências
`ape.weekly-cycle.v3` contra uma política explícita. **Não aprova o retorno
de `P1ReconciliationRecurring` como required check.** Ver ADR-009 §14 para o
contrato completo e as decisões ainda reservadas a Carlos Alberto Merlo.

## Dois modos

- `--mode package`: verifica consistência interna do pacote — schema, digest,
  vínculo evidence↔receipt, e consistência das métricas declaradas contra os
  receipts INCLUÍDOS no próprio pacote. `exit 0` = consistente sob essas
  verificações — **não** é aprovação de elegibilidade de P1, e a consistência
  com os receipts incluídos **nunca** é apresentada como "verificação contra
  a fonte" (essa é uma categoria independente, sempre `not_demonstrated`).
- `--mode gate`: adiciona escopo, seleção de janelas distintas/consecutivas,
  recência, thresholds e ratificação, e relata seis garantias
  **independentes**: `packageConsistency`, `policyCompliance`,
  `historyProvenance`, `metricsVerifiedAgainstSource`,
  `populationCompleteness` e a elegibilidade final. As três últimas nunca
  passam de `not_demonstrated`/`not_verified` nesta entrega — não há acesso a
  `Run`/`RunUsageBreakdown`/`BillingLedger` ao vivo nem a um índice
  imutável por `cycleId`. `gateEligibility.blockedBy` lista **todos** os
  bloqueios simultaneamente (nunca só o primeiro); resolver um deles num
  futuro Entrega 2 não aprova os demais automaticamente. O modo gate
  **nunca** retorna `exit 0` nesta entrega — o melhor resultado possível é
  `GUARANTEE_NOT_DEMONSTRATED` (`exit 3`).

## Exit codes

| Código | Categoria | Significado |
| --- | --- | --- |
| 0 | `OK` | Só em `--mode package`: pacote internamente consistente |
| 1 | `INPUT_ERROR` | Argumento/arquivo/JSON/política inválidos — nunca aprovação por omissão |
| 2 | `VALIDATION_FAILED` | Uma verificação concreta falhou (schema, digest, recência, threshold, escopo, conflito, ratificação) |
| 3 | `GUARANTEE_NOT_DEMONSTRATED` | Só em `--mode gate`: tudo que é verificável localmente passou; a elegibilidade completa depende de garantias que esta entrega não pode demonstrar |

## Uso

```bash
node --import tsx scripts/checkP1ApeWeeklyCycleV3.ts \
  --mode package \
  --package caminho/para/pacote.json \
  --policy caminho/para/politica.json \
  [--checker-now 2026-10-12T15:00:00Z]
```

`--checker-now` é opcional; quando omitido, usa o relógio real e a saída
marca `checkerNowSource: "real"`. Quando fornecido, marca
`checkerNowSource: "simulated"` — nunca aparece como avaliação real.

## Formato do pacote (`package.json`)

```json
{
  "schemaVersion": "p1-ape-weekly-cycle-v3-local-package.v1",
  "cycles": [
    { "evidence": { /* CycleEvidenceV3 */ }, "rawReceipts": [ /* RawReceiptV3[] */ ], "ratification": null, "history": null }
  ]
}
```

`history`, quando fornecido, é **autodeclarado** — o checker verifica sua
consistência interna (digest atual presente, sem entradas futuras em relação
a `checkerNow`, sem contradição entre entradas do mesmo digest), mas isso
nunca é tratado como prova de que nenhuma versão anterior foi omitida.
`historyProvenance.status` fica, no máximo, `"self_declared_unverified"` —
nunca `"verified"`/`"passed"`, mesmo que o próprio histórico inclua campos
extras como `verified`/`trusted` (esses campos são ignorados, nunca
honrados). A recência de cada ciclo relata duas idades diagnósticas
separadas — `ageDaysFromGeneratedAt` e `ageDaysFromSelfDeclaredHistory` — e
usa explicitamente a mais antiga disponível (`governingAgeDays` +
`governingBasis`) para decidir passa/falha, impedindo que uma regeneração
recente renove uma primeira geração já vencida.

## Formato da política (`policy.json`) — todos os campos obrigatórios

```json
{
  "scenario": "test",
  "scope": { "tenantId": "...", "workspaceId": "...", "domain": "billing" },
  "minCycles": 3,
  "maxAgeDays": 14,
  "requireConsecutiveWindows": true,
  "requireLatestWindowIsLastClosed": true,
  "captureToleranceDays": 0,
  "requireRatification": false
}
```

`scenario: "test"` identifica cenários sintéticos; `"operational"` é apenas
um rótulo — nenhum dos dois campos constitui aprovação de política. Cenários
de referência devem usar `minCycles: 3` e `maxAgeDays: 14` (constantes
vigentes, não alteradas por este checker).

## Testes

```bash
pnpm test:p1-ape-weekly-cycle-v3
```

Cobre, entre outros: pacote válido sob política explícita; JSON/schema/
política inválidos; receipt ausente/digest inconsistente; métricas fora do
threshold e `sampleSize=0`; evidência vencida/futura/exatamente no limite;
digest duplicado; versões conflitantes; mistura de escopos; janelas
ausentes/não consecutivas; histórico ausente ou autodeclarado; ratificação
ausente/incompatível; diferença de exit code entre os dois modos; e uma
simulação de 4 transições semanais (`A/B/C → B/C/D → C/D/E → D/E/F`) que
demonstra que, sob captura semanal pontual, o ciclo mais antigo do conjunto
chega a exatamente 14,000 dias no instante em que o terceiro é capturado e
vence pouco depois — em regime permanente, não só na primeira reavaliação.

## Governança dos motivos de falha (reason codes) — correção desta rodada

A rodada anterior concluiu que os identificadores locais deste módulo
(`future_generated_at`, `window_not_consecutive`, etc.) eram permitidos
porque `scripts/checkReasonCodeCanon.ts` não os inclui em
`REASON_CODE_CANON_TARGETS` e `pnpm check:reason-code-canon` continua
`ok:true`. **Essa conclusão estava incorreta na forma como foi apresentada:**
a ausência de um arquivo na lista de enforcement de um checker é um fato
sobre o que aquele checker específico examina hoje — não é uma autorização
normativa. Um checker que ainda não foi estendido para olhar `scripts/` não
prova que `scripts/` está isento; prova apenas que ninguém o testou lá ainda.

**Busca por uma regra normativa explícita** (não apenas pelo comportamento do
checker), desta vez em `IA_EIAH.md`, `AGENTS.md` e
`docs/ops/reason-codes-catalog.md` por qualquer variação de "todo motivo de
falha deve ser registrado": **nenhuma regra desse tipo foi encontrada.** A
única exigência normativa de registro localizada é textualmente **restrita**
aos cinco códigos do gate de publicação de release
(`ape-audit-telemetry-decision.md:80`: "Reason codes. Devem ser registrados
no catálogo canônico... antes do uso" — seguido da lista fechada
`APE_TELEMETRY_*`, no contexto do job `ReleasePromotionTelemetry`). Essa
frase não se estende, por texto, a identificadores de diagnóstico internos de
outros validadores.

**Conclusão corrigida:** não há autorização normativa comprovada para
identificadores locais de validador em geral — há uma **lacuna** (nenhuma
regra os proíbe, nenhuma regra explícita os permite) e um precedente de fato
(`apeWeeklyCycleV3Validator.ts`'s `scope_mismatch`, também nunca registrado
nem desafiado). Um precedente de fato não é uma fonte normativa. Registro
isto como lacuna explícita, não como permissão demonstrada. Se for desejada
conformidade estrita, a decisão de exigir (ou dispensar formalmente) registro
canônico para identificadores locais de checkers como este é de Carlos
Alberto Merlo — não foi tomada aqui, e este módulo continua usando
identificadores locais enquanto essa lacuna não for resolvida.

## Verificação do cálculo de tolerância e correção do histórico relatado

**Cálculo confirmado correto hoje:** `latestWindowWithinTolerance` mede
`checkerNow − realLastClosed.to` (linha ~556 de `p1CycleSelection.ts`) — ou
seja, há quanto tempo a janela mais nova **se tornou** a última fechada, não
há quanto tempo desde o início dela. Isso está certo: `now − window.from`
normalmente excede `now − window.to` em uma semana inteira (a duração da
própria janela), e usar `.from` mediria a tolerância como se ela já estivesse
correndo desde uma semana antes do que realmente está — teria liberado
conjuntos que já deveriam ter expirado.

**Correção do histórico relatado, verificada nesta rodada:** o relatório da
rodada de correção anterior ("Achado real durante a implementação... Bug real
#1 — a tolerância de captura media o limite errado... Corrigido e coberto por
teste") **descreveu incorretamente esse ajuste como uma correção nova daquela
rodada.** Conferido: a correção `.from` → `.to` foi feita na rodada de
**implementação original** da Entrega 1, antes de qualquer teste ter
rodado pela primeira vez; a rodada de correção seguinte não tocou esse trecho
do arquivo (as edições daquela rodada foram nos tipos de `PerCycleGuarantees`,
em `evaluateHistoryAndAnchor`, em `evaluateSingleCycle` e na condição de
`window_not_consecutive` — não no cálculo de tolerância). **Não houve
regressão; o relatório da rodada anterior repetiu, por engano, a descrição de
uma correção já feita antes, como se fosse nova.** Esta seção corrige esse
relato. Não invento nenhum histórico além do que pôde ser conferido lendo o
próprio arquivo e comparando com as edições efetivamente aplicadas em cada
rodada.

## Limitações desta entrega (ver ADR-009 §14 e Entrega 2)

- `populationCompleteness` nunca é demonstrada (exige acesso a banco ao vivo).
- `historyProvenance` nunca passa de `self_declared_unverified`/`absent`
  (exige um índice append-only por `cycleId`, ainda não construído).
- `supersedesEvidenceRef`/`supersedesRatificationRef` não são resolvidos
  automaticamente — uma versão conflitante é sempre rejeitada explicitamente,
  nunca descartada ou sobrescrita.
- Nenhuma decisão de política (escopo canônico, tolerância, exigência de
  ratificação) é tomada por esta ferramenta — todas são parâmetros
  explícitos de entrada, sem valor padrão que implique aprovação.

## Material de origem e diagnóstico local v2 — etapa 1

O manifesto persistido `p1-ape-weekly-cycle-v3-operational-package.v1` continua legível. `describePackageGuarantees` agora retorna `schemaVersion=p1-source-diagnostic.v2`: `sourceMaterial=absent|metadata_only|rows_included`, `recomputation={status:not_run, reason:executor_not_implemented}` e `independentSourceVerification.status=not_demonstrated`. O campo antigo `recomputedAgainstSourceSnapshot` foi removido intencionalmente (mudança incompatível do diagnóstico); consumidores devem ler a versão nova, nunca traduzir sua ausência em aprovação. A CLI de gate não consome esse helper e mantém os bloqueios existentes.

`sourceSnapshot` legado é validado como metadados (description/sourceQueryDescription/capturedAt/rowCount), sem modificação do input. O novo campo opcional `sourceMaterial` usa `p1-source-material.v1`; fornecer ambos é ambíguo e rejeitado. Projeções incluídas contêm scope/window/cutoff/generation, runs por id e datas, fatos por kind/id/data e referência ligada a runId/runDigest ou vínculo explicitamente não resolvido, contagens deriváveis e digest canônico. Digest de cada linha e do envelope usa a canonicalização existente, excluindo apenas o campo digest da própria estrutura. A identidade de fato é (kind,id), não uma chave de cobrança. Arrays conservam ordem e não podem repetir identidades.

Validação exige UTC ISO com segundos ou milissegundos, datas reais, from<to<=cutoff<=generatedAt<=packagedAt, criação das runs em [from,to), término observado até cutoff, fatos até cutoff sem filtro semanal inferior e escopo igual ao manifesto. Não calcula maturação/recência aqui: essas regras continuam no seletor canônico. Metadados legados exigem capturedAt<=packagedAt. rowCount legado é claim não verificável contra linhas ausentes. Arrays vazios são estruturalmente possíveis, sem medição ou amostra positiva inferida.

`operationMapping`, `duplicateKey` e `denominators` só admitem `unresolved`. Nenhuma semântica de billing nova está aprovada. As projeções de identidade/tempo não incluem valores financeiros nem comprovam população completa, autoridade, consistência transacional ou visibilidade. `validateSourceDiagnostic` só aceita not_run nesta etapa; resultados passed/failed de execução requerem executor verificável e evolução contratual futura. Campos extras/claims em sourceMaterial ou diagnóstico são rejeitados. Claims extras no envelope legado não são usados para produzir diagnóstico; os bytes originais permanecem intactos.

Testes locais, sem infraestrutura: `node --import tsx --test scripts/tests/p1SourceMaterial.test.ts scripts/tests/p1OperationalPackage.test.ts`. A suíte integrada deve também manter `GUARANTEE_NOT_DEMONSTRATED`/exit 3. Não autoriza operações reais nem retorno P1/P2.
