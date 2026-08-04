# Exceções nominais do detector de circularidade estrutural

- **Data:** 2026-08-04
- **Status:** `Proposta`
- **Decisão:** registrar exceções temporárias para os cinco pares confirmados antes de ligar o detector ao CI
- **Aprovado por:** Carlos Alberto Merlo
- **Prazo comum:** 2026-11-02

## Decisão do owner

O owner decidiu registrar exceções agora. Corrigir os pares exige substituir os geradores P2 interop e P3 economy por captura real, trabalho que depende de caminhos executáveis e de handlers que ainda são stub. As exceções permitem que o detector reconheça as cinco dívidas existentes, enquanto qualquer par novo permanece sem exceção e é reprovado.

Cada remoção futura de exceção deverá acompanhar a remoção por mérito do respectivo par estrutural. Este registro não afirma que os geradores atuais capturam execução real.

## Ajustes ao desenho do ADR-006

### Contrato próprio com forma equivalente

As exceções ficam em [`circularity-exceptions.v1.json`](../../contracts/circularity-exceptions.v1.json), e não em `gate-waivers.v1.json`. O checker de gate waivers exige `continue-on-error` no job correspondente e classificaria estes cinco registros como `GATE_WAIVER_STALE`, pois os jobs não têm essa supressão.

O contrato próprio não duplica finalidade: gate waivers governa supressão de resultado; circularity exceptions governa pares gerador–check. A forma equivalente preserva identificação nominal, motivo, concessão, prazo, frente de restauração e aprovação.

### Detector fora do CI neste ciclo

O alvo `check:structural-circularity` é criado, mas não é ligado a `ci.yml`. Adicionar um job não o torna required; essa alteração depende de decisão própria e de mudança no ruleset. A credencial disponível registrada no percurso tem escopos `gist`, `read:org`, `repo` e `workflow`, sem escopo administrativo.

O ADR-006 permanece como decisão datada e não é emendado por este registro.

## Exceções registradas

| Job | Gerador | Check | Motivo de saída | Frente de restauração | Concedida em | Expira em | Aprovado por |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `p2_audit_interop` | `generate:p2-interop-evidence` | `check:p2-audit-interop` | Substituir os artefatos declarativos por execução real dos segmentos capturáveis e deixar de declarar receipt sem handler executável. | `RESOLVE-P2-INTEROP-DECLARATIVE-EVIDENCE` | 2026-08-04 | 2026-11-02 | Carlos Alberto Merlo |
| `p3_economy_hardening` | `generate:p3-economy-evidence` | `check:p3-evidence-recency` | Fazer a recência avaliar capturas reais independentes, não payloads montados imediatamente antes do check. | `DISCRIMINATE-P3-EVIDENCE-MODE` | 2026-08-04 | 2026-11-02 | Carlos Alberto Merlo |
| `p3_economy_hardening` | `generate:p3-economy-evidence` | `check:p3-economy-hardening` | Consumir resultados econômicos capturados independentemente e remover a preparação estática dos campos verificados no mesmo job. | `DISCRIMINATE-P3-EVIDENCE-MODE` | 2026-08-04 | 2026-11-02 | Carlos Alberto Merlo |
| `p3_settlement_support_by_env` | `generate:p3-economy-evidence` | `check:p3-evidence-recency` | Basear recência settlement em capturas independentes e deixar de regenerar os sete artefatos estáticos antes da validação. | `DISCRIMINATE-P3-EVIDENCE-MODE` | 2026-08-04 | 2026-11-02 | Carlos Alberto Merlo |
| `p3_settlement_support_by_env` | `generate:p3-economy-evidence` | `check:p3-settlement-support-by-env` | Capturar suporte de provider a partir de adapters executáveis e deixar de verificar modos escritos antes no próprio job. | `DISCRIMINATE-P3-EVIDENCE-MODE` | 2026-08-04 | 2026-11-02 | Carlos Alberto Merlo |

## Limites deste ciclo

- O detector não é ligado a `ci.yml` e não se torna required.
- Nenhum dos cinco pares é corrigido ou removido.
- Nenhum workflow, gerador, checker existente ou gate waiver é alterado.
- Nenhuma frente, PR, fase ou status é promovido, rebaixado, reclassificado ou resolvido. As dezesseis frentes permanecem `pendente`; PR-01 permanece `Parcial`.
- Este registro é decisão e não evidência de execução real; `docs/EVIDENCE_INDEX.md` permanece inalterado.

## Emenda F14b — correção do extrator de destinos compostos por template (2026-08-04)

### Limitação de extração encontrada

Na primeira execução do detector após a implementação do F14, apenas 1 dos 5 pares do ADR-006 foi encontrado; os 4 pares de P3 economy escaparam. `scripts/generateP3EconomyEvidence.ts` grava cada artefato assim:

```ts
const evidences = [
  { file: `settlement-provider-e2e-${timestamp}.json`, payload: ... },
  // ... mais 6 entradas
];
for (const { file, payload } of evidences) {
  const filePath = path.join(EVIDENCE_DIR, file);
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
}
```

Duas lacunas concretas no extrator impediam a resolução:

1. `writeFileSync` recebia o identificador `filePath`, não a expressão `path.join(...)` diretamente — `filePath` é atribuído em uma instrução `const` separada, uma instrução a mais do que o extrator seguia.
2. O helper que buscava o valor da propriedade `file:` usava uma classe de caracteres (`[^\n,}]+`) que exclui `}`, então parava no meio de `${timestamp}` e nunca reconhecia o valor como um template literal válido.

### Correção aplicada

Em `scripts/checkStructuralCircularity.ts`:

- `identifierAssignment` resolve um identificador solto (`filePath`) até sua única atribuição `const` no mesmo arquivo, antes de testar o padrão `path.join(CONST, var)`.
- `forOfArrayLiteralBinding` confirma que `var` é vinculado por um `for...of`, direto ou com destructuring, sobre um array literal `const` no mesmo arquivo, e devolve o corpo balanceado desse array.
- `quotedPropertyValues` (destructuring) e `arrayLiteralElementValues` (vínculo direto) extraem os valores de cada elemento do array respeitando aspas balanceadas, incluindo template literals com `${...}`.
- A interpolação já era tratada como curinga por `canonicalArtifact`, reaproveitada sem alteração; o cruzamento com o check permanece por igualdade de padrão canônico, não por igualdade literal.

Padrão suportado e seu limite, documentados na constante exportada `SUPPORTED_DESTINATION_TEMPLATE_PATTERNS` (refletida na saída do check em `scope.supportedDestinationTemplatePatterns`):

- `path.join(CONST, var)` resolvido através de no máximo um identificador `const` intermediário;
- `var` vinculado por `for...of`, direto ou com destructuring, sobre um array literal `const` do mesmo arquivo;
- valores de elemento do array que são template literals com prefixo literal e uma ou mais interpolações, cada interpolação tratada como um único segmento curinga.

Fora de alcance, permanece `undetermined`: array vindo de chamada de função, import, reatribuição, spread, índice computado ou entrada externa (env, argumento, config). O extrator não foi transformado em analisador de fluxo geral.

### Pares após a correção

Com a correção, o detector reporta os cinco pares do ADR-006, todos com exceção ativa (`STRUCTURAL_CIRCULARITY_EXCEPTION_ACTIVE`), igual à tabela do ADR-006. Nenhum par além dos cinco foi encontrado: os outros cinco caminhos que permaneciam `undetermined` antes da correção (um em `checkP1CriticalChain.ts`, dois em `checkP2AuditInterop.ts`, um em `checkP3EconomyHardening.ts`, um em `checkP3SettlementSupportByEnv.ts`) não pertencem ao padrão corrigido — quatro são a própria declaração de função `findLatestEvidenceFile`/`findLatestEvidenceByPattern` sendo capturada como se fosse uma chamada, e um (`item.evidencePattern as string`) é genuinamente dinâmico, vindo de configuração de policy carregada em runtime. Nenhum dos cinco alimenta um par estrutural nesta correção; permanecem `undetermined`, fora do alcance autorizado deste ciclo, e são reportados, não omitidos.

O `check:structural-circularity` continua saindo com código diferente de zero após a correção, porque esses cinco caminhos residuais geram violação `STRUCTURAL_CIRCULARITY_UNDETERMINED` — o contrato do detector nunca aceita caminho dinâmico em silêncio. A saída literal, os cinco pares e os cinco `undetermined` restantes estão registrados no relatório final da tarefa que aplicou esta emenda.
