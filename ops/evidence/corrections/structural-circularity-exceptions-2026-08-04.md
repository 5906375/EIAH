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

## Emenda F14c — auto-match de declaração e semântica de undetermined (2026-08-04)

### Defeito de auto-match e correção

Dos cinco `undetermined` remanescentes após o F14b, quatro eram o mesmo defeito, não caminho dinâmico real:

- `checkP1CriticalChain.ts:31`, `checkP2AuditInterop.ts:29`, `checkP3EconomyHardening.ts:31` e `checkP3SettlementSupportByEnv.ts:12` declaram `function findLatestEvidenceFile(pattern: RegExp): string { ... }` (ou `findLatestEvidenceByPattern(pattern: string)`). O scanner de chamadas (`callArguments`) casava `nome(` por regex simples, sem distinguir declaração de invocação, e capturava a própria lista de parâmetros da declaração como se fosse um argumento de chamada.
- A heurística de supressão existente (`functionParameter(source, name)?.includes(expression)`) comparava o nome do parâmetro (`"pattern"`) contra o texto completo capturado (`"pattern: RegExp"`), que inclui a anotação de tipo — a comparação nunca batia, e a declaração era reportada como leitura dinâmica indeterminável.
- Em todos os quatro casos, o valor real lido pelo check já era capturado corretamente em um ponto de chamada verdadeiro no mesmo arquivo (ex.: `checkP1CriticalChain.ts:51`, `checkP2AuditInterop.ts:132-134`, `checkP3EconomyHardening.ts:52-79`, `checkP3SettlementSupportByEnv.ts:227`) — corrigir o auto-match não altera nenhum artefato realmente lido, só remove ruído duplicado do próprio detector.

Correção aplicada em `scripts/checkStructuralCircularity.ts` (`callArguments`): antes de registrar uma ocorrência de `nome(` como chamada, o texto imediatamente anterior é testado contra `DECLARATION_KEYWORD_PATTERN` (`function`, `class`, `const`, `let` ou `var` seguidos de espaço, na posição imediatamente anterior ao nome); se casar, a ocorrência é ignorada. Não foi usada lista de nomes conhecidos — a distinção é sintática (declaração vs. chamada), válida para qualquer nome passado a `callArguments`. Nenhum dos quatro `checkP*.ts` de domínio foi editado; o defeito era do scanner.

Após a correção, os quatro somem da lista de `undetermined` e os cinco pares do ADR-006 permanecem exatamente cinco — nenhuma chamada real foi suprimida.

### Semântica de undetermined

**O que o ADR-006 decide:** o item 6 da lista de requisitos da implementação futura (linha 66) diz: *"o tratamento de caminhos dinâmicos: quando a extração não determinar o destino, o resultado deve ser diagnóstico explícito conforme o contrato, nunca aceitação silenciosa"*. Isso obriga o campo `undetermined` a listar sempre, na íntegra, todo caminho não resolvido — e proíbe qualquer semântica que o omita ou o trate como aceito sem diagnóstico. O ADR **não decide**, explicitamente, se um `undetermined` deve zerar `ok` incondicionalmente, ser apenas informativo, ou admitir exceção — as três opções da seção 4b do prompt satisfazem igualmente a exigência de "diagnóstico explícito, nunca aceitação silenciosa", desde que o campo `undetermined` nunca seja filtrado. A decisão de qual das três não estava, portanto, tomada pelo ADR-006, e coube a este ciclo.

**Decisão: Exceção declarada.** Por padrão, todo `undetermined` continua zerando `ok` (`STRUCTURAL_CIRCULARITY_UNDETERMINED`), exatamente como antes desta emenda. Uma exceção nominal, datada, com motivo, frente de restauração e aprovação — na mesma forma e no mesmo arquivo `ops/contracts/circularity-exceptions.v1.json` usado para os pares estruturais — pode suspender essa falha para um caminho identificado por `target`+`source`+`operation`+`expression`. Enquanto ativa, o caminho aparece em `undeterminedExcepted` com o código `STRUCTURAL_CIRCULARITY_UNDETERMINED_EXCEPTION_ACTIVE`; ao expirar, volta a falhar com `STRUCTURAL_CIRCULARITY_UNDETERMINED_EXCEPTION_EXPIRED`; uma exceção sem caminho `undetermined` correspondente falha como `STRUCTURAL_CIRCULARITY_UNDETERMINED_EXCEPTION_STALE`. Em nenhum estado o caminho desaparece do array `undetermined`.

Uma entrada foi registrada: `checkP2AuditInterop.ts:234`, `findLatestEvidenceByPattern(item.evidencePattern as string)`, onde `item` vem de `extractHighPolicyConfig()`, que faz parse do bloco `HIGH_POLICY` em `docs/ops/risk-tiering-by-action.md` em runtime — genuinamente dinâmico, não um array literal do script. `restoreFront: "RESOLVE-P2-INTEROP-DECLARATIVE-EVIDENCE"` (frente 16 de `docs/ops/open-fronts.md`), reaproveitada por ser a mesma frente que já governa `check:p2-audit-interop`/`generate:p2-interop-evidence` na exceção de par existente; `approvedBy: "Carlos Alberto Merlo"`, `grantedAt: "2026-08-04"`, `expiresAt: "2026-11-02"`, iguais às demais exceções deste contrato.

**Alternativas descartadas:**

- **Reprova pura** (`undetermined` zera `ok` sempre, sem exceção): descartada porque o caso de `checkP2AuditInterop.ts:234` é legitimamente indeterminável — a política é conteúdo de documentação versionada, lida e interpretada em runtime, não um array do script. Sob reprova pura, o detector nunca sairia com `ok: true` mesmo depois de toda correção possível, tornando impossível declará-lo pronto para ligar ao CI sem reescrever a leitura de política para eliminar essa indireção — fora do escopo deste ciclo.
- **Avisa** (`undetermined` nunca afeta `ok`): descartada porque o próprio prompt já nomeia o risco — "um undetermined que esconda par real passa despercebido" — e o ADR-006 exige "nunca aceitação silenciosa"; tratar todo undetermined como mero aviso enfraquece essa garantia para qualquer caminho dinâmico futuro que de fato esconda um par circular, sem qualquer registro nominal, prazo ou aprovação exigindo revisão periódica.
- **Exceção declarada** (adotada): preserva "reprova por padrão" (nenhum caminho novo passa despercebido) e ainda assim permite que o único caso comprovadamente indeterminável do repositório seja governado — nominal, datado, com frente de restauração — em vez de bloquear o detector indefinidamente ou de virar aviso permanente sem prazo.

### Estado final do detector

Cinco pares do ADR-006, todos excetuados; um `undetermined` (`checkP2AuditInterop.ts:234`), com exceção ativa; `ok: true`; exit 0. Saída literal completa no relatório final da tarefa que aplicou esta emenda.

### O que continua fora de alcance

- O detector segue fora de `ci.yml`; `ok: true` não o torna required, e ligá-lo permanece decisão própria.
- Nenhum dos cinco pares circulares foi corrigido por mérito; as exceções de par expiram em 2026-11-02, inalteradas por esta emenda.
- A leitura de `item.evidencePattern` em `checkP2AuditInterop.ts:234` continua genuinamente dinâmica; a exceção concedida governa o risco, não o resolve. Resolver exigiria mudar como a política de risco declara padrões de evidência, fora do escopo autorizado.
- O scanner permanece um casador de padrões sintáticos, não um analisador de fluxo geral; declarações usando sintaxe fora de `function`/`class`/`const`/`let`/`var` seguidos do nome (por exemplo, um método de classe ou um objeto literal com propriedade de mesmo nome) não foram testadas e podem não ser reconhecidas como declaração.
