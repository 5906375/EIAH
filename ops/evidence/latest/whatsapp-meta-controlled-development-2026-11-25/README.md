# WhatsApp Meta — Desenvolvimento controlado 8.7.2

## Escopo e autoridade

Data: 2026-11-25. Executor: Codex, sem subagentes.
Baseline: `3046f7251e3cb3d0d66bb0a47fe5f4e5ee3f7e8e`, branch
`docs/whatsapp-meta-candidate-assessment`, stage vazio.
Preflight continha somente os tres arquivos F2.24 autorizados.

A [decisao especifica de desenvolvimento](../../../../docs/ops/whatsapp-provider-meta-controlled-development-decision-record.md)
foi materializada antes do codigo, por aprovacao humana expressa nas seis
funcoes exigidas, conforme F5.0 e com alcance laboratorial delimitado perante
F2.25. Nao altera a decisao de abertura F2.24, suas evidencias ou seu template.

## Implementacao efetivamente materializada

Extracao do processamento comum em whatsappReadOnlyIngress.ts; transporte
legado continua autenticando x-eiah-* e usando os mesmos contratos, rota e
replay guard. O adaptador Meta e modulo sem router, bootstrap, ambiente ou
cliente de rede: HMAC sobre bytes originais, parsing UTF-8 estrito, schema
limitado a fixtures sinteticas, 16 KiB/20 eventos, binding/entitlement,
pseudonimizacao, idempotencia por port e resultado read-only sanitizado.

Suporte de testes: fixtures ficticias, preload que nega rede, observacoes em
memoria e journal temporario com escritor unico, fsync e rename antes de ACK.
O journal e exclusivo de testes; nao e backend produtivo. Testes incluem
falhas de persistencia, perda de ACK, concorrencia, colisoes e outro processo.
Implementacao de um cenario nao significa que ele foi validado com sucesso.

## Rodada unica executada

### Aceitacao e regressao — exit code 1

```bash
timeout 60s node --import tsx --import ./apps/api/src/tests/support/whatsappMetaHarness.ts --test apps/api/src/tests/whatsapp.meta-adapter.test.ts apps/api/src/tests/whatsapp.webhook-read-only.test.ts apps/api/src/tests/channel-binding.test.ts apps/api/src/tests/replay-guard.test.ts
```

Saida efetiva: [acceptance.log](acceptance.log).

- channel-binding.test.ts: PASS.
- replay-guard.test.ts: PASS.
- whatsapp.webhook-read-only.test.ts: PASS.
- whatsapp.meta-adapter.test.ts: FAIL, `ERR_TEST_FAILURE`, exit code do arquivo 1.
- Reporter agregou quatro arquivos: tres aprovados, um reprovado; duracao 891.708923 ms.

O TAP nao expoe o diagnostico interno ou os resultados de cada caso Meta.
Nao se atribui essa falha a EPERM sem evidencia especifica. Nao houve
reexecucao, diagnostico por outro comando de teste, correcao apos a rodada
ou tentativa de contornar restricao ambiental.

Comando especifico indicado naquela etapa para diagnostico no WSL pelo
responsavel humano, sem execucao pelo Codex:

```bash
timeout 60s node --trace-uncaught --trace-warnings --import tsx --import ./apps/api/src/tests/support/whatsappMetaHarness.ts apps/api/src/tests/whatsapp.meta-adapter.test.ts
```

### Aceitacao Meta complementar — WSL, resultado humano incorporado em 8.7.4

O responsavel humano informou a execucao do comando direto acima no WSL:
24 testes executados, 24 aprovados, zero falhas, zero cancelamentos, zero
ignorados, duracao 324.459767 ms e exit code 0. Foram aprovados os cenarios
de autenticacao, payload, binding, entitlement, replay, idempotencia,
concorrencia, ACK duravel, restart em processo distinto, sanitizacao e
isolamento de dependencias. Aceitacao Meta: **PASS no laboratorio sintetico**.

Proveniencia: resultado fornecido expressamente pelo responsavel humano na
solicitacao 8.7.4, incorporado documentalmente; nao e uma execucao do Codex
nem um novo log bruto anexado. O acceptance.log e a primeira falha acima
permanecem intactos. O resultado positivo nao identifica retrospectivamente
a causa do ERR_TEST_FAILURE inicial. As tres regressoes PASS sao reutilizadas,
sem repeticao; nenhum teste ou typecheck foi executado em 8.7.4.

### Typecheck API — exit code 2

```bash
timeout 60s pnpm --filter @eiah/api typecheck
```

Saida efetiva: [typecheck.log](typecheck.log).
178 diagnosticos TypeScript, nenhum em routes/whatsapp.ts,
services/whatsappReadOnlyIngress.ts ou services/whatsappMetaAdapter.ts.
Os diagnosticos incluem exports ausentes de @eiah/core/@eiah/contracts e
erros em modulos nao alterados. Nao houve baseline limpa comparativa;
portanto nao sao classificados automaticamente como preexistentes.
tsconfig.build.json exclui src/tests: este resultado nao tipa os arquivos
de teste. Nao houve build de dependencias, instalacao ou segunda execucao.

### Classificacao estatica dos 178 diagnosticos — 8.7.4

Contagem extraida exclusivamente do typecheck.log existente, por ocorrencia
de diagnostico (nao por simbolo unico). Todos receberam classificacao por
categoria; isso nao equivale a comprovar uma causa raiz unica.

| Categoria observada | Codigos e quantidades | Total |
| --- | --- | --- |
| Resolucao de imports/exports | TS2305: 112; TS2307: 3; TS2724: 3 | 118 |
| Parametros implicitamente any | TS7006: 23 | 23 |
| Atribuicao, argumentos, indexacao, unknown, spread e iteracao | TS2322: 4; TS2345: 11; TS2538: 13; TS18046: 3; TS2698: 1; TS2488: 1 | 33 |
| Propriedades ausentes | TS2339: 4 | 4 |

Superficies: Logistica/Oraculo 90; IMOB 48; sessao, produtos, marketplace,
telemetria, tipos e worker 31; financeiro 5; orquestracao LLM 4. Total 178
em 36 arquivos. Os quatro TS2339 sao tres acessos em llmExecutor.ts
(completionId, providerRequestId e modelUsed) e confirmed em verticalAccess.ts.

Dos 118 erros de resolucao, 110 referem-se a @eiah/contracts (107 TS2305,
3 TS2724), cinco a exports da raiz @eiah/core e tres ao modulo
@eiah/core/llm/LLMProviderError. O tsconfig.build.json resolve esses pacotes
em packages/*/dist. Ha divergencia local verificavel entre fontes e
declaracoes: contracts/src/index.ts exporta platformAccess e
imobPropertyCapture, enquanto dist/index.d.ts nao os exporta; as fontes
core contem FinancialAuthorityScope, FINANCIAL_AUTHORITY_SCOPES e
LLMProviderError, ausentes nas declaracoes consultadas, incluindo a ausencia
de dist/llm/LLMProviderError.d.ts. Isso comprova uma superficie local de
dependencias compiladas incompletas/desatualizadas; nao comprova que todos
os 118 erros tenham a mesma causa, nem que os outros 60 sejam cascatas.
Nao houve reconstrucao ou alteracao de dependencias.

#### Evidencia anterior e limite da classificacao como preexistente

Foram reutilizados os registros existentes, sem nova execucao:

- [Vertical evaluation grant](../../../../docs/evidence/vertical-evaluation-grant/README.md),
  results/typecheck/api-typecheck.log (243 diagnosticos) e
  api-typecheck-run2.log (13): respectivamente 18 e 13 ocorrencias atuais
  coincidem em arquivo, codigo e mensagem; os 13 sao subconjunto dos 18.
- [Intake observability](../imob-property-provider-failure-2026-11-16/intake-observability/README.md),
  published/api-build.log (24 diagnosticos): 24 ocorrencias atuais coincidem
  nos mesmos tres criterios. O registro identifica base a047a1b e documenta
  posteriormente build API aprovado apos preparacao autorizada de contracts.
  O registro vertical tambem documenta terceira tentativa aprovada apos
  preparacao local de dependencias. As falhas historicas nao eram permanentes.

A uniao contem **42 ocorrencias com antecedente historico comprovado**:
21 TS2305, 9 TS7006, 9 TS2345, 2 TS18046 e 1 TS2538. Comparacao nao exige
igualdade de linha/coluna, que podem mudar entre revisoes; nao e prova de
identidade integral de ambiente ou baseline. Restam 136 ocorrencias sem
correspondencia nesses logs reutilizados. **Nenhum dos 178 e certificado
como preexistente especificamente na baseline 3046f725**, pois nao ha
resultado comparativo dessa baseline sob as mesmas dependencias locais.

A worktree existente /home/jusall/projects/EIAH_SITE_IMOB_PUBLICACAO, HEAD
2b9225da68e4dd83fecec9cc5ff322b932a9e0ee, e candidata por equivalencia de
fontes rastreadas com 3046f725 nos escopos apps/api, packages/core,
packages/contracts, package.json, pnpm-lock.yaml e tsconfig.base.json.
Nao possui os dist de core/contracts nem node_modules/typescript/package.json
consultados na worktree atual; nao constitui ambiente pronto ou typecheck
comparativo concluido. Nao foi preparada nem alterada.

#### Relacao com o delta Meta e providencia minima

As fontes dos 36 arquivos diagnosticados sao identicas aos respectivos
objetos Git de 3046f725. Tambem permanecem identicos a baseline os dois
tsconfig da API, tsconfig.base.json, apps/api/package.json e pnpm-lock.yaml.
Zero diagnosticos sao localizados nos tres arquivos de producao do delta
WhatsApp. Nao foi demonstrado diagnostico causado pelo delta; isso nao e
certificacao global de ausencia de regressao ou de tipagem dos testes.

Nao restam diagnosticos sem categoria; permanecem sem atribuicao causal
conclusiva os efeitos entre as categorias e sem comparacao de baseline os
178. Os 136 sem antecedente nos logs citados nao sao automaticamente novos.

A lacuna especifica do delta e a tipagem dos testes, excluidos pelo comando
global. Providencia minima posterior, mediante autorizacao propria: uma
comparacao focal noEmit, preservando opcoes estritas/resolucao da API,
com os sete arquivos autorizados como raizes explicitas (routes/whatsapp.ts,
os dois services e os quatro arquivos novos em tests/support e tests),
incluindo diagnosticos de dependencias transitivas e comparacao com fontes
3046f725 lidas de objetos Git sob as mesmas dependencias. Os arquivos novos
nao possuem contraparte na baseline e precisam ser tipados integralmente.
Usar a abordagem de baseline virtual ja documentada no pacote intake,
sem nova worktree, sem tratar exclusao de testes como aprovacao de tipagem.
Nenhum comando focal foi executado nesta etapa.

O typecheck global permanece FAIL, exit 2; para encerra-lo sera necessaria
autorizacao distinta para tratar a coerencia dos artefatos de dependencias
e validar o resultado. Os registros historicos sugerem preparacao de
dependencias como caminho, sem justificar correcao das fontes nem assegurar
antecipadamente que ela elimine todos os 178 diagnosticos.

## Isolamento e limites de comprovacao

A prova de caminhos, stage, branch, HEAD e superficies proibidas e registrada
em [isolation.log](isolation.log), sem nova execucao do adaptador.
Os tres arquivos .log existem fisicamente e sao ignorados pelo Git;
nao foram adicionados ao stage. O README e os arquivos tecnicos/documentais
novos permanecem sem stage. A observacao de isolamento precede somente a
gravacao do proprio isolation.log e a adicao desta entrada ao Evidence Index.
Os dois registros F2.24 existentes nao foram modificados. O Evidence Index
recebe somente a referencia a esta execucao e preserva a entrada F2.24.

Nenhum servidor, bootstrap, Docker, infraestrutura, workflow, schema,
migration ou configuracao operacional foi alterado ou iniciado. Nenhum
stage, commit, push, PR, branch, worktree, stash ou backup foi criado.

O codigo do adaptador/core nao importa Prisma, filas, Runs, agentes ou LLM;
o bootstrap nao o monta. A primeira execucao Codex nao comprovou os probes
Meta; o resultado humano complementar comprova os cenarios laboratoriais
de isolamento e sanitizacao relatados acima. As tres regressoes existentes
passaram. Nenhum desses resultados comprova isolamento operacional de um
provider real ou autoriza efeitos de dominio.

Limitacoes: identidades obrigatoriamente sinteticas; schema nativo reduzido;
janela temporal e limites somente laboratoriais; durabilidade de escritor
unico e tipagem dos testes ainda pendente; lock de processo interrompido nao
e recuperado automaticamente; sem validacao distribuida, de SLO ou provider real.

Freeze F2.23, No-Go Ledger, execution hold, security-review-blocked e bloqueios
de integracao/operacao permanecem ativos. Nenhum controle F2.19 e promovido.
Provider final selection nao autorizado; Bloco D nao ratificado.

Status consolidado 8.7.4: aceitacao Meta PASS, 24/24 no WSL, por evidencia
humana complementar; tres regressoes PASS reutilizadas; falha inicial Codex
preservada; typecheck global FAIL (178), classificacao estatica concluida e
tipagem focal do delta pendente. Sem declaracao de prontidao operacional.

## Etapa 8.7.5 — Typecheck focal executado, sem correcao

Data: 2026-11-25. Executor: Codex, sem subagentes. Autorizacao humana:
uma unica rodada focal, incluindo testes e suporte, sem correcao ou rebuild.
**Resultado focal FAIL; exit code 1**, sem timeout ou impedimento ambiental.

### Comando, configuracao e comparacao

O comando integral abaixo foi executado uma unica vez, na raiz do repositorio.
O limite de 60 segundos abrange os dois programas focais da rodada.
A CLI Git leu somente a rota da baseline; o compilador usou esse texto em
memoria, sem checkout, arquivo temporario ou tsconfig adicional.

TypeScript 5.9.3; configuracao apps/api/tsconfig.build.json, com heranca
original resolvida pela Compiler API. Unica opcao acrescentada: noEmit true.
strict true, skipLibCheck true (ja canonico), moduleResolution Bundler,
rootDir, baseUrl, paths e dependencias locais preservados. Raizes explicitas
incluem os testes apesar do exclude do comando global. Nenhum modulo de
aplicacao, teste ou harness foi executado em runtime; somente analise de tipos.

A baseline focal usa a rota de 3046f725 e seus imports, com as mesmas
opcoes/dependencias locais: 203 source files incluindo bibliotecas/declaracoes,
zero diagnosticos. O programa atual usa sete raizes: 223 source files e
10 diagnosticos. A sobreposicao do texto Git e a inclusao das sete raizes
foram verificadas pelo proprio comando. Os seis arquivos novos nao existem
na baseline e nao foram substituidos por stubs; ficaram fora do programa
baseline e foram integralmente incluidos no programa atual. Dependencias
transitivas rastreadas reutilizadas permanecem sem alteracao conforme o delta
tecnico existente; esta comparacao nao e um typecheck global da baseline.

<details>
<summary>Comando integral executado (stdin, sem arquivo de configuracao novo)</summary>

```bash
EIAH_META_BASELINE="$(git show 3046f725:apps/api/src/routes/whatsapp.ts)" timeout 60s node --input-type=module <<'NODE'
import ts from 'typescript';
import path from 'node:path';
const repo = process.cwd();
const names = [
  'apps/api/src/routes/whatsapp.ts',
  'apps/api/src/services/whatsappReadOnlyIngress.ts',
  'apps/api/src/services/whatsappMetaAdapter.ts',
  'apps/api/src/tests/whatsapp.meta-adapter.test.ts',
  'apps/api/src/tests/support/whatsappMetaFixtures.ts',
  'apps/api/src/tests/support/whatsappMetaHarness.ts',
  'apps/api/src/tests/support/whatsappMetaFileStore.ts',
];
const roots = names.map(p => path.resolve(p));
const config = ts.readConfigFile('apps/api/tsconfig.build.json', ts.sys.readFile);
if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, path.resolve('apps/api'));
if (parsed.errors.length) throw new Error(ts.formatDiagnostics(parsed.errors, {
  getCanonicalFileName: p => p, getCurrentDirectory: () => repo, getNewLine: () => '\n'
}));
const options = { ...parsed.options, noEmit: true };
if (options.strict !== true) throw new Error('Existing strict option is not true');
const baselineText = process.env.EIAH_META_BASELINE;
if (!baselineText) throw new Error('Missing Git baseline route');
const formatHost = {
  getCanonicalFileName: p => p, getCurrentDirectory: () => repo, getNewLine: () => '\n'
};
const normalize = d => ({
  file: d.file ? path.relative(repo, d.file.fileName) : null,
  line: d.file && d.start !== undefined ? d.file.getLineAndCharacterOfPosition(d.start).line + 1 : null,
  column: d.file && d.start !== undefined ? d.file.getLineAndCharacterOfPosition(d.start).character + 1 : null,
  code: d.code,
  category: ts.DiagnosticCategory[d.category],
  message: ts.flattenDiagnosticMessageText(d.messageText, '\n'),
  focused: Boolean(d.file && roots.includes(path.resolve(d.file.fileName))),
});
function check(baseline) {
  const host = ts.createCompilerHost(options);
  const read = host.readFile.bind(host);
  if (baseline) host.readFile = file => path.resolve(file) === roots[0] ? baselineText : read(file);
  const program = ts.createProgram(baseline ? [roots[0]] : roots, options, host);
  const coverage = names.map((name, i) => ({
    file: name, included: Boolean(program.getSourceFile(roots[i]))
  }));
  if (baseline && coverage.slice(1).some(x => x.included)) throw new Error('New Meta roots leaked into baseline');
  if (!baseline && coverage.some(x => !x.included)) throw new Error('Focal coverage incomplete');
  if (baseline && program.getSourceFile(roots[0]).text !== baselineText) throw new Error('Baseline overlay not applied');
  const diagnostics = ts.getPreEmitDiagnostics(program);
  console.log(baseline ? 'BASELINE 3046f725 — existing route plus unchanged transitives' : 'CURRENT — all seven authorized roots');
  console.log(ts.formatDiagnostics(diagnostics, formatHost) || '(no diagnostics)');
  return { coverage, sourceFiles: program.getSourceFiles().length, diagnostics: diagnostics.map(normalize) };
}
console.log(JSON.stringify({
  typescriptVersion: ts.version, config: 'apps/api/tsconfig.build.json',
  noEmit: options.noEmit, strict: options.strict,
  skipLibCheck: options.skipLibCheck,
  moduleResolution: ts.ModuleResolutionKind[options.moduleResolution],
  rootDir: options.rootDir, baseUrl: options.baseUrl, paths: options.paths,
  baseline: '3046f725:apps/api/src/routes/whatsapp.ts',
  scope: 'Two focal programs in one round; no global typecheck; six new roots have no baseline counterpart'
}, null, 2));
const baseline = check(true);
const current = check(false);
const signature = d => JSON.stringify([d.file, d.code, d.category, d.message]);
const budget = new Map();
for (const d of baseline.diagnostics) {
  const key = signature(d); budget.set(key, (budget.get(key) || 0) + 1);
}
const unmatched = [];
for (const d of current.diagnostics) {
  const key = signature(d), remaining = budget.get(key) || 0;
  if (remaining) budget.set(key, remaining - 1); else unmatched.push(d);
}
const result = {
  baseline, current,
  focusedDiagnostics: current.diagnostics.filter(d => d.focused).length,
  transitiveDiagnostics: current.diagnostics.filter(d => !d.focused && d.file).length,
  configDiagnostics: current.diagnostics.filter(d => !d.file).length,
  unmatchedAgainstExistingRouteBaseline: unmatched,
  limitations: 'Baseline comparison covers the existing route and its imports only; unmatched diagnostics in new dependency closure do not by themselves prove a new defect.'
};
console.log('RESULT_JSON');
console.log(JSON.stringify(result, null, 2));
process.exitCode = current.diagnostics.some(d => d.category === 'Error') ? 1 : 0;
NODE
```

</details>

### Cobertura e diagnosticos reais

| Arquivo autorizado | Incluido | Diagnosticos |
| --- | --- | --- |
| apps/api/src/routes/whatsapp.ts | sim | 0 |
| apps/api/src/services/whatsappReadOnlyIngress.ts | sim | 0 |
| apps/api/src/services/whatsappMetaAdapter.ts | sim | 0 |
| apps/api/src/tests/whatsapp.meta-adapter.test.ts | sim | 8 TS2322 |
| apps/api/src/tests/support/whatsappMetaFixtures.ts | sim | 0 |
| apps/api/src/tests/support/whatsappMetaHarness.ts | sim | 2 TS2741 |
| apps/api/src/tests/support/whatsappMetaFileStore.ts | sim | 0 |

- Harness, linha 22, colunas 3 e 24: atribuicoes de denied a dns.lookup
  e dns.resolve nao possuem __promisify__, obrigatorio nos respectivos
  tipos Node. Dois erros diretos do novo suporte de testes.
- Teste, linhas 85, 145, 146, 147, 159, 208, 222 e 231: oito atribuicoes
  de valores alternativos incompatíveis com literais inferidos a partir de
  META_FIXTURE congelada e do retorno de metaPayload. Afetam identidades
  WABA/phone/sender e conteudo dos cenarios sinteticos.
- Dependencias transitivas: **zero diagnosticos** neste recorte.
- Configuracao/diagnosticos sem arquivo: **zero**.
- Dez ocorrencias nao correspondem a baseline focal; estao localizadas nos
  dois arquivos novos de testes/suporte, sem classificacao como preexistentes.
  Nenhum erro foi excluido da saida ou do exit code.

<details>
<summary>Saida integral capturada da unica execucao focal</summary>

```text
{
  "typescriptVersion": "5.9.3",
  "config": "apps/api/tsconfig.build.json",
  "noEmit": true,
  "strict": true,
  "skipLibCheck": true,
  "moduleResolution": "Bundler",
  "rootDir": "/home/jusall/projects/EIAH_BUILDER/apps/api/src",
  "baseUrl": "/home/jusall/projects/EIAH_BUILDER",
  "paths": {
    "@repo/db": [
      "packages/db/dist"
    ],
    "@repo/db/*": [
      "packages/db/dist/*"
    ],
    "@repo/db/client": [
      "packages/db/dist/generated/client"
    ],
    "@eiah/core": [
      "packages/core/dist"
    ],
    "@eiah/core/*": [
      "packages/core/dist/*"
    ],
    "@eiah/providers": [
      "packages/providers/dist"
    ],
    "@eiah/providers/*": [
      "packages/providers/dist/*"
    ],
    "@eiah/contracts": [
      "packages/contracts/dist"
    ],
    "@eiah/contracts/*": [
      "packages/contracts/dist/*"
    ],
    "@repo/mcp-runner": [
      "packages/mcp-runner/dist"
    ],
    "@repo/mcp-runner/*": [
      "packages/mcp-runner/dist/*"
    ]
  },
  "baseline": "3046f725:apps/api/src/routes/whatsapp.ts",
  "scope": "Two focal programs in one round; no global typecheck; six new roots have no baseline counterpart"
}
BASELINE 3046f725 — existing route plus unchanged transitives
(no diagnostics)
CURRENT — all seven authorized roots
apps/api/src/tests/support/whatsappMetaHarness.ts(22,3): error TS2741: Property '__promisify__' is missing in type '() => never' but required in type 'typeof lookup'.
apps/api/src/tests/support/whatsappMetaHarness.ts(22,24): error TS2741: Property '__promisify__' is missing in type '() => never' but required in type 'typeof resolve'.
apps/api/src/tests/whatsapp.meta-adapter.test.ts(85,39): error TS2322: Type '"123456789"' is not assignable to type '"synthetic-waba-A"'.
apps/api/src/tests/whatsapp.meta-adapter.test.ts(145,26): error TS2322: Type '"synthetic-unbound-waba"' is not assignable to type '"synthetic-waba-A"'.
apps/api/src/tests/whatsapp.meta-adapter.test.ts(146,27): error TS2322: Type '"synthetic-unbound-phone"' is not assignable to type '"synthetic-phone-A"'.
apps/api/src/tests/whatsapp.meta-adapter.test.ts(147,28): error TS2322: Type '"synthetic-unbound-sender"' is not assignable to type '"synthetic-sender-A"'.
apps/api/src/tests/whatsapp.meta-adapter.test.ts(159,28): error TS2322: Type '"lead.create"' is not assignable to type '"SYNTHETIC-CONTENT-NOT-FOR-EXPORT"'.
apps/api/src/tests/whatsapp.meta-adapter.test.ts(208,3): error TS2322: Type '"SYNTHETIC-DIFFERENT-CONTENT"' is not assignable to type '"SYNTHETIC-CONTENT-NOT-FOR-EXPORT"'.
apps/api/src/tests/whatsapp.meta-adapter.test.ts(222,3): error TS2322: Type '"synthetic-unbound-sender"' is not assignable to type '"synthetic-sender-A"'.
apps/api/src/tests/whatsapp.meta-adapter.test.ts(231,3): error TS2322: Type '"synthetic-phone-B"' is not assignable to type '"synthetic-phone-A"'.

RESULT_JSON
{
  "baseline": {
    "coverage": [
      {
        "file": "apps/api/src/routes/whatsapp.ts",
        "included": true
      },
      {
        "file": "apps/api/src/services/whatsappReadOnlyIngress.ts",
        "included": false
      },
      {
        "file": "apps/api/src/services/whatsappMetaAdapter.ts",
        "included": false
      },
      {
        "file": "apps/api/src/tests/whatsapp.meta-adapter.test.ts",
        "included": false
      },
      {
        "file": "apps/api/src/tests/support/whatsappMetaFixtures.ts",
        "included": false
      },
      {
        "file": "apps/api/src/tests/support/whatsappMetaHarness.ts",
        "included": false
      },
      {
        "file": "apps/api/src/tests/support/whatsappMetaFileStore.ts",
        "included": false
      }
    ],
    "sourceFiles": 203,
    "diagnostics": []
  },
  "current": {
    "coverage": [
      {
        "file": "apps/api/src/routes/whatsapp.ts",
        "included": true
      },
      {
        "file": "apps/api/src/services/whatsappReadOnlyIngress.ts",
        "included": true
      },
      {
        "file": "apps/api/src/services/whatsappMetaAdapter.ts",
        "included": true
      },
      {
        "file": "apps/api/src/tests/whatsapp.meta-adapter.test.ts",
        "included": true
      },
      {
        "file": "apps/api/src/tests/support/whatsappMetaFixtures.ts",
        "included": true
      },
      {
        "file": "apps/api/src/tests/support/whatsappMetaHarness.ts",
        "included": true
      },
      {
        "file": "apps/api/src/tests/support/whatsappMetaFileStore.ts",
        "included": true
      }
    ],
    "sourceFiles": 223,
    "diagnostics": [
      {
        "file": "apps/api/src/tests/support/whatsappMetaHarness.ts",
        "line": 22,
        "column": 3,
        "code": 2741,
        "category": "Error",
        "message": "Property '__promisify__' is missing in type '() => never' but required in type 'typeof lookup'.",
        "focused": true
      },
      {
        "file": "apps/api/src/tests/support/whatsappMetaHarness.ts",
        "line": 22,
        "column": 24,
        "code": 2741,
        "category": "Error",
        "message": "Property '__promisify__' is missing in type '() => never' but required in type 'typeof resolve'.",
        "focused": true
      },
      {
        "file": "apps/api/src/tests/whatsapp.meta-adapter.test.ts",
        "line": 85,
        "column": 39,
        "code": 2322,
        "category": "Error",
        "message": "Type '\"123456789\"' is not assignable to type '\"synthetic-waba-A\"'.",
        "focused": true
      },
      {
        "file": "apps/api/src/tests/whatsapp.meta-adapter.test.ts",
        "line": 145,
        "column": 26,
        "code": 2322,
        "category": "Error",
        "message": "Type '\"synthetic-unbound-waba\"' is not assignable to type '\"synthetic-waba-A\"'.",
        "focused": true
      },
      {
        "file": "apps/api/src/tests/whatsapp.meta-adapter.test.ts",
        "line": 146,
        "column": 27,
        "code": 2322,
        "category": "Error",
        "message": "Type '\"synthetic-unbound-phone\"' is not assignable to type '\"synthetic-phone-A\"'.",
        "focused": true
      },
      {
        "file": "apps/api/src/tests/whatsapp.meta-adapter.test.ts",
        "line": 147,
        "column": 28,
        "code": 2322,
        "category": "Error",
        "message": "Type '\"synthetic-unbound-sender\"' is not assignable to type '\"synthetic-sender-A\"'.",
        "focused": true
      },
      {
        "file": "apps/api/src/tests/whatsapp.meta-adapter.test.ts",
        "line": 159,
        "column": 28,
        "code": 2322,
        "category": "Error",
        "message": "Type '\"lead.create\"' is not assignable to type '\"SYNTHETIC-CONTENT-NOT-FOR-EXPORT\"'.",
        "focused": true
      },
      {
        "file": "apps/api/src/tests/whatsapp.meta-adapter.test.ts",
        "line": 208,
        "column": 3,
        "code": 2322,
        "category": "Error",
        "message": "Type '\"SYNTHETIC-DIFFERENT-CONTENT\"' is not assignable to type '\"SYNTHETIC-CONTENT-NOT-FOR-EXPORT\"'.",
        "focused": true
      },
      {
        "file": "apps/api/src/tests/whatsapp.meta-adapter.test.ts",
        "line": 222,
        "column": 3,
        "code": 2322,
        "category": "Error",
        "message": "Type '\"synthetic-unbound-sender\"' is not assignable to type '\"synthetic-sender-A\"'.",
        "focused": true
      },
      {
        "file": "apps/api/src/tests/whatsapp.meta-adapter.test.ts",
        "line": 231,
        "column": 3,
        "code": 2322,
        "category": "Error",
        "message": "Type '\"synthetic-phone-B\"' is not assignable to type '\"synthetic-phone-A\"'.",
        "focused": true
      }
    ]
  },
  "focusedDiagnostics": 10,
  "transitiveDiagnostics": 0,
  "configDiagnostics": 0,
  "unmatchedAgainstExistingRouteBaseline": [
    {
      "file": "apps/api/src/tests/support/whatsappMetaHarness.ts",
      "line": 22,
      "column": 3,
      "code": 2741,
      "category": "Error",
      "message": "Property '__promisify__' is missing in type '() => never' but required in type 'typeof lookup'.",
      "focused": true
    },
    {
      "file": "apps/api/src/tests/support/whatsappMetaHarness.ts",
      "line": 22,
      "column": 24,
      "code": 2741,
      "category": "Error",
      "message": "Property '__promisify__' is missing in type '() => never' but required in type 'typeof resolve'.",
      "focused": true
    },
    {
      "file": "apps/api/src/tests/whatsapp.meta-adapter.test.ts",
      "line": 85,
      "column": 39,
      "code": 2322,
      "category": "Error",
      "message": "Type '\"123456789\"' is not assignable to type '\"synthetic-waba-A\"'.",
      "focused": true
    },
    {
      "file": "apps/api/src/tests/whatsapp.meta-adapter.test.ts",
      "line": 145,
      "column": 26,
      "code": 2322,
      "category": "Error",
      "message": "Type '\"synthetic-unbound-waba\"' is not assignable to type '\"synthetic-waba-A\"'.",
      "focused": true
    },
    {
      "file": "apps/api/src/tests/whatsapp.meta-adapter.test.ts",
      "line": 146,
      "column": 27,
      "code": 2322,
      "category": "Error",
      "message": "Type '\"synthetic-unbound-phone\"' is not assignable to type '\"synthetic-phone-A\"'.",
      "focused": true
    },
    {
      "file": "apps/api/src/tests/whatsapp.meta-adapter.test.ts",
      "line": 147,
      "column": 28,
      "code": 2322,
      "category": "Error",
      "message": "Type '\"synthetic-unbound-sender\"' is not assignable to type '\"synthetic-sender-A\"'.",
      "focused": true
    },
    {
      "file": "apps/api/src/tests/whatsapp.meta-adapter.test.ts",
      "line": 159,
      "column": 28,
      "code": 2322,
      "category": "Error",
      "message": "Type '\"lead.create\"' is not assignable to type '\"SYNTHETIC-CONTENT-NOT-FOR-EXPORT\"'.",
      "focused": true
    },
    {
      "file": "apps/api/src/tests/whatsapp.meta-adapter.test.ts",
      "line": 208,
      "column": 3,
      "code": 2322,
      "category": "Error",
      "message": "Type '\"SYNTHETIC-DIFFERENT-CONTENT\"' is not assignable to type '\"SYNTHETIC-CONTENT-NOT-FOR-EXPORT\"'.",
      "focused": true
    },
    {
      "file": "apps/api/src/tests/whatsapp.meta-adapter.test.ts",
      "line": 222,
      "column": 3,
      "code": 2322,
      "category": "Error",
      "message": "Type '\"synthetic-unbound-sender\"' is not assignable to type '\"synthetic-sender-A\"'.",
      "focused": true
    },
    {
      "file": "apps/api/src/tests/whatsapp.meta-adapter.test.ts",
      "line": 231,
      "column": 3,
      "code": 2322,
      "category": "Error",
      "message": "Type '\"synthetic-phone-B\"' is not assignable to type '\"synthetic-phone-A\"'.",
      "focused": true
    }
  ],
  "limitations": "Baseline comparison covers the existing route and its imports only; unmatched diagnostics in new dependency closure do not by themselves prove a new defect."
}

```

</details>

### Limites e providencia minima

Aceitacao humana WSL 24/24 e tres regressoes PASS permanecem validas,
sem repeticao. Os 178 diagnosticos do typecheck global nao foram reexecutados
nem reclassificados: este recorte menor nao certifica a API integral.
Zero diagnosticos nos tres arquivos de producao e zero nos transitivos desta
rodada nao tornam os sete arquivos aprovados: os dez erros focais bloqueiam
a validacao de tipos do delta.

Providencia minima, dependente de autorizacao futura especifica: ajustar
somente a tipagem do suporte sintetico para permitir os valores alternativos
intencionais das fixtures e implementar dublês DNS compativeis com as
assinaturas e propriedades exigidas, mantendo toda tentativa de rede negada.
Nao requer alterar contratos/validadores de producao, desabilitar strictness,
introduzir any ou supressoes. Apos correcao autorizada, nova validacao focal
tambem necessita autorizacao; nao foi iniciada automaticamente.

Nesta etapa foram atualizados exclusivamente este README e sua entrada
existente no Evidence Index. Nenhum codigo, configuracao canonica, dependencia,
log anterior ou registro F2.24 foi alterado. Nenhum novo arquivo de evidencia,
branch, worktree, backup ou checkpoint foi criado. Nenhum stage, commit,
push, PR, Docker, rede externa ou integracao operacional foi executado.
Freeze F2.23, No-Go Ledger, security-review-blocked e os bloqueios de
integracao/operacao real permanecem vigentes; sem selecao definitiva Meta,
ratificacao do Bloco D ou promocao de controles F2.19.

Status 8.7.5: **parcial** — rodada focal evidenciada, resultado FAIL,
dez erros diretamente no suporte/testes do delta, zero transitivos,
sem correcao ou segunda rodada.

## Etapa 8.7.6 — Correcao pontual e unica rodada apos correcao

Data: 2026-11-25. Executor: Codex, sem subagentes. Autorizacao humana:
corrigir somente os dez diagnosticos focais e executar uma rodada limitada.
Historicos 8.7.2 a 8.7.5 preservados, inclusive falhas e aceite humano WSL.

### Correcao efetivamente aplicada

Somente dois arquivos tecnicos foram modificados nesta etapa:

- apps/api/src/tests/support/whatsappMetaFixtures.ts: anotacao explicita
  Readonly com campos string e now number para META_FIXTURE; Object.freeze
  e todos os valores sinteticos permanecem. Permite os valores alternativos
  deliberados dos cenarios sem modificar schemas ou contratos de producao.
- apps/api/src/tests/support/whatsappMetaHarness.ts: substituto DNS com
  __promisify__ e Symbol de promisify.custom, ambos rejeitando pela mesma
  funcao denied; dns.lookup e dns.resolve usam esse substituto. O bloqueio
  existente de dns.promises e demais superficies de rede permanece.

whatsapp.meta-adapter.test.ts nao foi modificado; nenhum cenario ou assertion
foi removido. Sem any, supressoes, coercoes para esconder incompatibilidades,
alteracao de strictness, dependencia, tsconfig ou codigo de producao.

### Typecheck focal — PASS, exit code 0

Foi reutilizado **exatamente o comando integral da secao 8.7.5**, sem alterar
seu script, suas sete raizes, noEmit, opcoes ou dependencias locais.
Uma execucao com timeout 60s; TypeScript 5.9.3. Baseline focal 3046f725:
203 source files, zero diagnosticos. Programa atual: 223 source files,
sete raizes incluidas, zero diagnosticos focais, transitivos ou de
configuracao. Os dez diagnosticos anteriormente observados nao reapareceram.
Nao e execucao global nem reclassificacao dos 178 diagnosticos anteriores.

<details>
<summary>Saida integral do typecheck focal 8.7.6</summary>

```text
{
  "typescriptVersion": "5.9.3",
  "config": "apps/api/tsconfig.build.json",
  "noEmit": true,
  "strict": true,
  "skipLibCheck": true,
  "moduleResolution": "Bundler",
  "rootDir": "/home/jusall/projects/EIAH_BUILDER/apps/api/src",
  "baseUrl": "/home/jusall/projects/EIAH_BUILDER",
  "paths": {
    "@repo/db": [
      "packages/db/dist"
    ],
    "@repo/db/*": [
      "packages/db/dist/*"
    ],
    "@repo/db/client": [
      "packages/db/dist/generated/client"
    ],
    "@eiah/core": [
      "packages/core/dist"
    ],
    "@eiah/core/*": [
      "packages/core/dist/*"
    ],
    "@eiah/providers": [
      "packages/providers/dist"
    ],
    "@eiah/providers/*": [
      "packages/providers/dist/*"
    ],
    "@eiah/contracts": [
      "packages/contracts/dist"
    ],
    "@eiah/contracts/*": [
      "packages/contracts/dist/*"
    ],
    "@repo/mcp-runner": [
      "packages/mcp-runner/dist"
    ],
    "@repo/mcp-runner/*": [
      "packages/mcp-runner/dist/*"
    ]
  },
  "baseline": "3046f725:apps/api/src/routes/whatsapp.ts",
  "scope": "Two focal programs in one round; no global typecheck; six new roots have no baseline counterpart"
}
BASELINE 3046f725 — existing route plus unchanged transitives
(no diagnostics)
CURRENT — all seven authorized roots
(no diagnostics)
RESULT_JSON
{
  "baseline": {
    "coverage": [
      {
        "file": "apps/api/src/routes/whatsapp.ts",
        "included": true
      },
      {
        "file": "apps/api/src/services/whatsappReadOnlyIngress.ts",
        "included": false
      },
      {
        "file": "apps/api/src/services/whatsappMetaAdapter.ts",
        "included": false
      },
      {
        "file": "apps/api/src/tests/whatsapp.meta-adapter.test.ts",
        "included": false
      },
      {
        "file": "apps/api/src/tests/support/whatsappMetaFixtures.ts",
        "included": false
      },
      {
        "file": "apps/api/src/tests/support/whatsappMetaHarness.ts",
        "included": false
      },
      {
        "file": "apps/api/src/tests/support/whatsappMetaFileStore.ts",
        "included": false
      }
    ],
    "sourceFiles": 203,
    "diagnostics": []
  },
  "current": {
    "coverage": [
      {
        "file": "apps/api/src/routes/whatsapp.ts",
        "included": true
      },
      {
        "file": "apps/api/src/services/whatsappReadOnlyIngress.ts",
        "included": true
      },
      {
        "file": "apps/api/src/services/whatsappMetaAdapter.ts",
        "included": true
      },
      {
        "file": "apps/api/src/tests/whatsapp.meta-adapter.test.ts",
        "included": true
      },
      {
        "file": "apps/api/src/tests/support/whatsappMetaFixtures.ts",
        "included": true
      },
      {
        "file": "apps/api/src/tests/support/whatsappMetaHarness.ts",
        "included": true
      },
      {
        "file": "apps/api/src/tests/support/whatsappMetaFileStore.ts",
        "included": true
      }
    ],
    "sourceFiles": 223,
    "diagnostics": []
  },
  "focusedDiagnostics": 0,
  "transitiveDiagnostics": 0,
  "configDiagnostics": 0,
  "unmatchedAgainstExistingRouteBaseline": [],
  "limitations": "Baseline comparison covers the existing route and its imports only; unmatched diagnostics in new dependency closure do not by themselves prove a new defect."
}

```

</details>

### Prova especifica DNS — PASS, exit code 0

Doze chamadas sinteticas intencionais foram bloqueadas antes de acesso
a rede: interfaces tradicionais default e named, __promisify__, util.promisify,
dns.promises e named imports de node:dns/promises. Callback nao invocado.
O incremento exato de 12 no contador de tentativas foi confirmado. A prova
rodou em processo proprio, sem alterar os contadores da suite de aceitacao.

<details>
<summary>Comando e saida integrais da prova DNS</summary>

```bash
timeout 60s node --import tsx --import ./apps/api/src/tests/support/whatsappMetaHarness.ts --input-type=module <<'NODE'
import assert from 'node:assert/strict';
import dns, { lookup, resolve } from 'node:dns';
import { lookup as lookupPromise, resolve as resolvePromise } from 'node:dns/promises';
import { promisify } from 'node:util';
import { metaLabNetworkAttempts } from './apps/api/src/tests/support/whatsappMetaHarness.ts';
const error = /META_LAB_NETWORK_FORBIDDEN/;
const start = metaLabNetworkAttempts();
let callbackCalled = false;
const callback = () => { callbackCalled = true; };
for (const [name, operation] of [
  ['dns.lookup', () => dns.lookup('synthetic-meta.invalid', callback)],
  ['dns.resolve', () => dns.resolve('synthetic-meta.invalid', callback)],
  ['named lookup', () => lookup('synthetic-meta.invalid', callback)],
  ['named resolve', () => resolve('synthetic-meta.invalid', callback)],
]) {
  assert.throws(operation, error);
  console.log('PASS ' + name);
}
for (const [name, operation] of [
  ['lookup.__promisify__', () => dns.lookup.__promisify__('synthetic-meta.invalid')],
  ['resolve.__promisify__', () => dns.resolve.__promisify__('synthetic-meta.invalid')],
  ['promisify(lookup)', () => promisify(dns.lookup)('synthetic-meta.invalid')],
  ['promisify(resolve)', () => promisify(dns.resolve)('synthetic-meta.invalid')],
  ['dns.promises.lookup', () => dns.promises.lookup('synthetic-meta.invalid')],
  ['dns.promises.resolve', () => dns.promises.resolve('synthetic-meta.invalid')],
  ['named promises lookup', () => lookupPromise('synthetic-meta.invalid')],
  ['named promises resolve', () => resolvePromise('synthetic-meta.invalid')],
]) {
  await assert.rejects(async () => operation(), error);
  console.log('PASS ' + name);
}
assert.equal(callbackCalled, false);
assert.equal(metaLabNetworkAttempts() - start, 12);
console.log('DNS isolation PASS: 12 intentional attempts blocked before network access; callback not invoked');
NODE
```

```text
PASS dns.lookup
PASS dns.resolve
PASS named lookup
PASS named resolve
PASS lookup.__promisify__
PASS resolve.__promisify__
PASS promisify(lookup)
PASS promisify(resolve)
PASS dns.promises.lookup
PASS dns.promises.resolve
PASS named promises lookup
PASS named promises resolve
DNS isolation PASS: 12 intentional attempts blocked before network access; callback not invoked

```

</details>

### Suite Meta apos correcao — exit code 1, restart impedido pelo ambiente

Uma unica execucao, timeout 60s:

```bash
timeout 60s node --trace-uncaught --trace-warnings --import tsx --import ./apps/api/src/tests/support/whatsappMetaHarness.ts apps/api/src/tests/whatsapp.meta-adapter.test.ts
```

Resultado real: 24 testes, 23 aprovados, 1 reprovado, zero cancelamentos,
zero ignorados; duracao 310.355284 ms. O teste 20, restart em processo
distinto, reprovou em assert.ifError(child.error), com erro objetivo
spawnSync /usr/local/bin/node EPERM. Esta execucao comprova a restricao
ambiental do subprocesso; nao identifica retrospectivamente a causa da
primeira falha ERR_TEST_FAILURE de 8.7.2. Nao foi modificado o teste para
contornar a restricao, nem repetida a execucao ou escalada sua permissao.
O PASS humano 24/24 anterior continua historico e nao substitui o aceite
apos esta correcao de suporte.

<details>
<summary>Saida integral da unica suite Meta apos correcao</summary>

```text
TAP version 13
# Subtest: Meta lab handshake verifies mode, token and synthetic challenge without a server
ok 1 - Meta lab handshake verifies mode, token and synthetic challenge without a server
  ---
  duration_ms: 3.125591
  type: 'test'
  ...
# Subtest: Meta lab accepts authenticated synthetic ingress and preserves the internal bundle contract
ok 2 - Meta lab accepts authenticated synthetic ingress and preserves the internal bundle contract
  ---
  duration_ms: 12.418526
  type: 'test'
  ...
# Subtest: Meta lab signature validation covers raw bytes, strict prefix and exact digest length
ok 3 - Meta lab signature validation covers raw bytes, strict prefix and exact digest length
  ---
  duration_ms: 3.39129
  type: 'test'
  ...
# Subtest: Meta lab rejects malformed JSON, non-UTF8, schema drift and non-synthetic identities
ok 4 - Meta lab rejects malformed JSON, non-UTF8, schema drift and non-synthetic identities
  ---
  duration_ms: 2.194961
  type: 'test'
  ...
# Subtest: Meta lab enforces the raw 16 KiB boundary before JSON parsing
ok 5 - Meta lab enforces the raw 16 KiB boundary before JSON parsing
  ---
  duration_ms: 3.825292
  type: 'test'
  ...
# Subtest: Meta lab admits twenty events and rejects an oversized aggregate batch
ok 6 - Meta lab admits twenty events and rejects an oversized aggregate batch
  ---
  duration_ms: 8.283537
  type: 'test'
  ...
# Subtest: Meta lab validates interactive replies without interpreting their meaning
ok 7 - Meta lab validates interactive replies without interpreting their meaning
  ---
  duration_ms: 6.023723
  type: 'test'
  ...
# Subtest: Meta lab fails closed on missing channel, sender, tenant, workspace, scope and entitlement
ok 8 - Meta lab fails closed on missing channel, sender, tenant, workspace, scope and entitlement
  ---
  duration_ms: 2.719727
  type: 'test'
  ...
# Subtest: Meta lab blocks explicit mutation fields while treating message text only as data
ok 9 - Meta lab blocks explicit mutation fields while treating message text only as data
  ---
  duration_ms: 4.629908
  type: 'test'
  ...
# Subtest: Meta lab applies signed event timestamp boundaries without inventing delivery headers
ok 10 - Meta lab applies signed event timestamp boundaries without inventing delivery headers
  ---
  duration_ms: 7.511776
  type: 'test'
  ...
# Subtest: Meta lab duplicate delivery and reformatted JSON do not repeat processing
ok 11 - Meta lab duplicate delivery and reformatted JSON do not repeat processing
  ---
  duration_ms: 4.135373
  type: 'test'
  ...
# Subtest: Meta lab classifies a repeated member within one batch without a second processing
ok 12 - Meta lab classifies a repeated member within one batch without a second processing
  ---
  duration_ms: 4.552598
  type: 'test'
  ...
# Subtest: Meta lab detects event identity collisions and commits no partial batch
ok 13 - Meta lab detects event identity collisions and commits no partial batch
  ---
  duration_ms: 3.602881
  type: 'test'
  ...
# Subtest: Meta lab validates every batch member before processing authorized entries
ok 14 - Meta lab validates every batch member before processing authorized entries
  ---
  duration_ms: 0.837936
  type: 'test'
  ...
# Subtest: Meta lab namespaces the same native event across independent authorized channels
ok 15 - Meta lab namespaces the same native event across independent authorized channels
  ---
  duration_ms: 4.880592
  type: 'test'
  ...
# Subtest: Meta lab serializes concurrent duplicate delivery with one committed acceptance
ok 16 - Meta lab serializes concurrent duplicate delivery with one committed acceptance
  ---
  duration_ms: 3.751628
  type: 'test'
  ...
# Subtest: Meta lab ACK waits for durable transaction completion
ok 17 - Meta lab ACK waits for durable transaction completion
  ---
  duration_ms: 18.300763
  type: 'test'
  ...
# Subtest: Meta lab storage failure never produces ACK or leaks raw exception details
ok 18 - Meta lab storage failure never produces ACK or leaks raw exception details
  ---
  duration_ms: 2.595249
  type: 'test'
  ...
# Subtest: Meta lab retry after lost ACK recovers a durable acceptance without reprocessing
ok 19 - Meta lab retry after lost ACK recovers a durable acceptance without reprocessing
  ---
  duration_ms: 3.839352
  type: 'test'
  ...
# Subtest: Meta lab persists acceptance across an actual separate Node process
not ok 20 - Meta lab persists acceptance across an actual separate Node process
  ---
  duration_ms: 185.301801
  type: 'test'
  location: '/home/jusall/projects/EIAH_BUILDER/apps/api/src/tests/whatsapp.meta-adapter.test.ts:1:14118'
  failureType: 'testCodeFailure'
  error: 'ifError got unwanted exception: spawnSync /usr/local/bin/node EPERM'
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: ~
  actual:
    errno: -1
    syscall: 'spawnSync /usr/local/bin/node'
    path: '/usr/local/bin/node'
    spawnargs:
      0: '--import'
      1: 'tsx'
      2: '--import'
      3: './apps/api/src/tests/support/whatsappMetaHarness.ts'
      4: '--input-type=module'
      5: '--eval'
      6: |-

            import { openMetaLabFileStore } from './apps/api/src/tests/support/whatsappMetaFileStore.ts';
            import { metaAdapterFixture, metaPayload, signMetaBytes } from './apps/api/src/tests/support/whatsappMetaFixtures.ts';
            const store = openMetaLabFileStore(process.argv[1]);
            try {
              const { adapter } = metaAdapterFixture(store);
              const raw = Buffer.from(JSON.stringify(metaPayload()));
              const r = await adapter.inbound(raw, signMetaBytes(raw));
              console.log(JSON.stringify({status:r.status,accepted:r.accepted,duplicates:r.duplicates}));
            } finally { await store.close(); }

      7: '/tmp/eiah-meta-lab-ZMJU0o'
  error: 'spawnSync /usr/local/bin/node EPERM'
  code: 'EPERM'
  stack: |-
    Object.spawnSync (node:internal/child_process:1120:20)
    spawnSync (node:child_process:869:24)
    TestContext.<anonymous> (/home/jusall/projects/EIAH_BUILDER/apps/api/src/tests/whatsapp.meta-adapter.test.ts:306:17)
    async Test.run (node:internal/test_runner/test:1054:7)
    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
  operator: 'ifError'
  stack: |-
    TestContext.<anonymous> (/home/jusall/projects/EIAH_BUILDER/apps/api/src/tests/whatsapp.meta-adapter.test.ts:310:10)
    Object.spawnSync (node:internal/child_process:1120:20)
    spawnSync (node:child_process:869:24)
    TestContext.<anonymous> (/home/jusall/projects/EIAH_BUILDER/apps/api/src/tests/whatsapp.meta-adapter.test.ts:306:17)
    async Test.run (node:internal/test_runner/test:1054:7)
    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
  ...
# Subtest: Meta lab rejects another writer, corrupt storage and observation loss
ok 21 - Meta lab rejects another writer, corrupt storage and observation loss
  ---
  duration_ms: 1.343842
  type: 'test'
  ...
# Subtest: Meta lab outputs, metrics and persisted state exclude payload, identities and credentials
ok 22 - Meta lab outputs, metrics and persisted state exclude payload, identities and credentials
  ---
  duration_ms: 6.807273
  type: 'test'
  ...
# Subtest: Meta lab requires explicit lab credentials and unambiguous fixed channel registry
ok 23 - Meta lab requires explicit lab credentials and unambiguous fixed channel registry
  ---
  duration_ms: 0.820868
  type: 'test'
  ...
# Subtest: Meta lab dependency closure excludes domain infrastructure, outbound clients and bootstrap
ok 24 - Meta lab dependency closure excludes domain infrastructure, outbound clients and bootstrap
  ---
  duration_ms: 0.623394
  type: 'test'
  ...
1..24
# tests 24
# suites 0
# pass 23
# fail 1
# cancelled 0
# skipped 0
# todo 0
# duration_ms 310.355284

```

</details>

### Isolamento, whitespace e encerramento na falha

Preflight observado antes da correcao: branch
docs/whatsapp-meta-candidate-assessment; HEAD
3046f7251e3cb3d0d66bb0a47fe5f4e5ee3f7e8e; stage vazio; delta documental e
tecnico anterior preservado. Apenas fixtures e harness receberam patches
tecnicos nesta etapa. Os registros F2.24 e arquivos de producao nao receberam
alteracoes por esta execucao.

**Prova final de isolamento e git diff --check: NAO EXECUTADOS.**
A sequencia foi interrompida na primeira validacao reprovada, conforme
instrucao humana. Nao se promove o preflight nem a prova antiga a comprovacao
do delta final; arquivos novos tambem aguardam verificacao final de whitespace.
Nenhum resultado PASS e antecipado para essas verificacoes.

Providencia minima externa: executar no WSL, na raiz deste mesmo repositorio,
o comando exato da suite acima, preservando os arquivos corrigidos, para
validar o restart sem a restricao do Codex. A prova final de isolamento e
whitespace, incluindo arquivos novos pertinentes, continua pendente;
nenhum desses comandos foi iniciado automaticamente apos a falha.

Nao houve rebuild, instalacao, typecheck global, repeticao das tres regressoes,
Docker, GitHub, chamadas externas, stage, commit, push ou PR. Nenhum novo
arquivo de evidencia, branch, worktree, backup ou checkpoint. Evidencia
registrada somente neste README e na entrada existente do Evidence Index.

Freeze F2.23, No-Go Ledger, security-review-blocked e bloqueios de integracao,
execucao operacional e producao permanecem ativos. Nenhuma selecao final Meta,
ratificacao do Bloco D ou promocao de controles F2.19.

Status 8.7.6: **parcial** — correcao focal aplicada, tipagem e prova DNS PASS;
aceitacao apos correcao 23/24 com restart bloqueado por EPERM; isolamento e
whitespace finais pendentes; sem segundo ciclo de correcao ou validacao.

## Etapa 8.7.7 — Encerramento da validacao laboratorial

Data: 2026-11-25. Executor: Codex, sem subagentes. Nenhuma nova execucao
de testes, typecheck, probes DNS ou regressoes; somente evidencia humana
e verificacoes finais autorizadas.

### Aceitacao final apos correcao — PASS humano no WSL

Comando executado diretamente pelo responsavel humano no WSL:

```bash
timeout 60s node --trace-uncaught --trace-warnings --import tsx --import ./apps/api/src/tests/support/whatsappMetaHarness.ts apps/api/src/tests/whatsapp.meta-adapter.test.ts
```

Resultado fornecido na solicitacao 8.7.7: **24 testes executados, 24 aprovados,
zero falhas, zero cancelamentos, zero ignorados, 310.686479 ms, exit code 0**.
Restart em processo Node distinto: PASS. A execucao direta no WSL superou
a restricao ambiental EPERM do Codex. Proveniencia humana, sem nova
execucao Codex ou log bruto humano separado.

O historico 8.7.6 (23/24, exit 1, spawnSync Node EPERM) permanece acima.
O novo resultado supre o aceite apos correcao, sem apagar falhas anteriores
ou provar retrospectivamente a causa do ERR_TEST_FAILURE de 8.7.2.

Reutilizados: typecheck focal 8.7.6 dos sete arquivos, zero diagnosticos
focais/transitivos/configuracao, exit 0; bloqueio DNS 12/12, exit 0.
channel-binding.test.ts, replay-guard.test.ts e whatsapp.webhook-read-only.test.ts
sao PASS **historicos da rodada 8.7.2**, sem repeticao apos correcao do
suporte; nao constituem nova certificacao sob o harness corrigido.

### Isolamento final — PASS, exit code 0

Executados: git branch --show-current; git rev-parse HEAD;
git status --short --untracked-files=all; git diff --name-status;
git diff --cached --name-status; git ls-files --others --exclude-standard;
git diff -- .github/workflows release.yml apps/api/src/index.ts packages scripts;
git check-ignore -v -- nos tres logs. Todos com exit 0.
O conjunto de caminhos confere exatamente com os 12 autorizados,
considerando arquivos novos e rastreados. Nenhuma superficie operacional
proibida, codigo adicional ou bootstrap modificado.

SHA-256 comparados com as referencias em memoria anteriores a 8.7.6:
os dois registros F2.24, decisao especifica F5.0/F2.25, producao, teste,
file store, tsconfigs, manifests, lockfile e tres logs consultados continuam
preservados. Fixtures/harness sao as duas correcoes autorizadas em 8.7.6,
sem alteracao nesta etapa. A entrada F2.24 do Evidence Index nao foi editada.

A observacao de isolamento precede somente a atualizacao autorizada deste
README e da entrada existente no Evidence Index; nao ha novo caminho ou
outra mutacao. Logs continuam ignorados por .gitignore:17 (*.log),
fisicamente presentes e byte-identicos. Resultado real:

```json
{
  "branch": "docs/whatsapp-meta-candidate-assessment",
  "head": "3046f7251e3cb3d0d66bb0a47fe5f4e5ee3f7e8e",
  "stageEmpty": true,
  "trackedModified": [
    "apps/api/src/routes/whatsapp.ts",
    "docs/EVIDENCE_INDEX.md"
  ],
  "newFiles": [
    "apps/api/src/services/whatsappMetaAdapter.ts",
    "apps/api/src/services/whatsappReadOnlyIngress.ts",
    "apps/api/src/tests/support/whatsappMetaFileStore.ts",
    "apps/api/src/tests/support/whatsappMetaFixtures.ts",
    "apps/api/src/tests/support/whatsappMetaHarness.ts",
    "apps/api/src/tests/whatsapp.meta-adapter.test.ts",
    "docs/ops/whatsapp-provider-meta-controlled-development-decision-record.md",
    "docs/ops/whatsapp-provider-meta-f2-24-phase-transition-decision-record.md",
    "ops/evidence/latest/whatsapp-meta-controlled-development-2026-11-25/README.md",
    "ops/evidence/latest/whatsapp-meta-f2-24-formalization-2026-11-25.md"
  ],
  "forbiddenSurfaceDiffEmpty": true,
  "f224RecordsPreserved": true,
  "ignoredLogs": {
    "ops/evidence/latest/whatsapp-meta-controlled-development-2026-11-25/acceptance.log": {
      "exists": true,
      "bytes": 989,
      "sha256": "1e211d32df34b7b17f9eeb7e08fa3640522579710f66d156265f3333799e4457"
    },
    "ops/evidence/latest/whatsapp-meta-controlled-development-2026-11-25/typecheck.log": {
      "exists": true,
      "bytes": 25386,
      "sha256": "de74d4834cdf3e1e2853c056aed704c95e980e268a3c3dccea908a1811e1c1c0"
    },
    "ops/evidence/latest/whatsapp-meta-controlled-development-2026-11-25/isolation.log": {
      "exists": true,
      "bytes": 3006,
      "sha256": "978c866399da2d1d51fe075e19d239412bd50d7b57d0f8da50ef684bdb348382"
    }
  },
  "recordedCommandsExitCodes": {
    "branch": 0,
    "head": 0,
    "status": 0,
    "tracked": 0,
    "cached": 0,
    "untracked": 0,
    "protected": 0,
    "ignored_logs": 0
  }
}
```

### Whitespace final — PASS, unica verificacao

git diff --check cobriu os rastreados modificados. Os novos receberam
git diff --no-index --check -- /dev/null CAMINHO. O README final e a linha
substituta final do Evidence Index foram verificados por /dev/stdin antes
da gravacao, na mesma rodada, sem arquivo temporario. Apos gravacao,
a identidade dos bytes com os candidatos verificados foi conferida;
nao houve segunda execucao do check.

Cobertura: os 12 caminhos do delta Git, incluindo os dez novos.
Nenhum diagnostico de whitespace. Exit 1 de --no-index sem diagnostico
seria diferenca de conteudo, nao falha de whitespace; nenhum erro foi
ocultado. Logs ignorados receberam verificacao fisica/hash, sem reescrita.

Na atualizacao documental foram normalizados apenas espacos finais e
linhas vazias excedentes no Markdown, preservando mensagens, comandos,
resultados e historico. Os tres logs originais permanecem byte-identicos.

### Estado tecnico consolidado e pendencias

**Validacao laboratorial concluida no escopo comprovado**: aceite humano
Meta 24/24 apos correcao, tipagem focal dos sete arquivos, bloqueio DNS,
isolamento e whitespace. Evidenciado para desenvolvimento sintetico
isolado; nao certifica a API global ou prontidao operacional.

**Typecheck global continua pendencia separada: FAIL, exit 2, 178 diagnosticos
anteriores, sem dispensa, reexecucao ou reclassificacao.** Permanecem schema
sintetico reduzido, 16 KiB/20 eventos laboratoriais, store exclusivo de
testes com escritor unico e sem recuperacao automatica de lock interrompido,
sem validacao distribuida, SLO ou provider real. As regressoes conservam
exclusivamente o escopo historico informado acima.

O delta permanece sem stage/commit; tres logs ignorados nao estao no Git.
Proposta minima, nao executada: revisar o delta e os logs; fazer stage
explicito dos 12 caminhos e inclusao deliberada somente dos tres logs
relacionados; revisar o diff staged e preservar em um commit local.
Sem git add, commit, push ou PR nesta etapa. Sem novas branches,
worktrees, backups ou checkpoints.

Freeze F2.23, No-Go Ledger, security-review-blocked e todos os bloqueios de
integracao, execucao operacional e producao permanecem. Adaptador nao montado
na aplicacao; sem selecao definitiva Meta, ratificacao do Bloco D ou promocao
de controles F2.19. Nenhuma investigacao ou rodada adicional iniciada.

## Etapa 8.8.4 — Correcao pontual OrphanTestsRegression

Data: 2026-11-25. Executor: Codex, sem subagentes. Branch
docs/whatsapp-meta-candidate-assessment; HEAD preservado
37605583afb0af1652b2467f7cf9f5ada3f6e571; preflight com worktree limpa e
stage vazio. Draft PR existente: https://github.com/5906375/EIAH/pull/560.

### Causa comprovada no job especifico

Job OrphanTestsRegression:
https://github.com/5906375/EIAH/actions/runs/45628997764/job/139256805746

Somente o log desse job foi consultado para diagnostico, com limite remoto
de 30 segundos. Em 2026-11-25T14:00:24Z, o gate reportou previousOrphanCount
92, currentOrphanCount 93 e blockingOrphanCount 1; newOrphans e
blockingOrphans continham exclusivamente
apps/api/src/tests/whatsapp.meta-adapter.test.ts. A comparacao foi com
2b9225da68e4dd83fecec9cc5ff322b932a9e0ee. O arquivo nao estava no manifesto
nem no script bloqueante test:ci-unit-suite; execucao laboratorial manual
e mencao na documentacao nao satisfazem o gate execution-aware.

### Correcao minima

Adicionado somente o caminho da suite Meta a scripts/unit-tests-manifest.txt,
fonte canonica do Grupo B, apos whatsapp.webhook-read-only.test.ts.
Regenerado o valor correspondente de test:ci-unit-suite no package.json
segundo o comando documentado no manifesto, preservando os demais caminhos,
ordem, opcoes e scripts. Manifesto passa a conter 253 arquivos.
A suite ja importa seu proprio harness; nao foi acrescentado preload global.

Nenhuma alteracao estrutural do CI: workflows, gate, baseline de orfaos,
allowlists e codigo/testes do adaptador permanecem intactos.

### Unica validacao focal — PASS, exit code 0

Executado o proprio verificador canonico, com a mesma base do job:

```bash
ORPHAN_TESTS_COMPARE_REF=2b9225da68e4dd83fecec9cc5ff322b932a9e0ee timeout 60s node --import tsx scripts/checkOrphanTests.ts
```

Execucao autorizada fora do sandbox para permitir consultas Git por
subprocesso, sem alterar o verificador ou repetir uma tentativa reprovada.
Nao executou o job inteiro, pre-testes web do wrapper, suite Meta, outros
32 checks, builds, Docker ou workflows remotos.

Resultado efetivo:

```json
{
  "ok": true,
  "check": "check:orphan-tests",
  "totalTestFiles": 524,
  "executedBlocking": 432,
  "comparison": {
    "ref": "2b9225da68e4dd83fecec9cc5ff322b932a9e0ee",
    "previousOrphanCount": 92,
    "decreasingCeiling": 92,
    "currentOrphanCount": 92,
    "newOrphans": [],
    "removedOrphans": []
  },
  "blockingOrphanCount": 0,
  "blockingOrphans": [],
  "metaSuiteClassifiedAsBlocking": true,
  "exitCode": 0
}
```

executedBlocking e classificacao de alcance do CI, nao declaracao de que
432 arquivos de teste foram executados nesta etapa. O resultado local nao
antecipa novo PASS remoto: a correcao continua sem stage/commit/push.

P1ReconciliationRecurring nao foi investigado, corrigido ou reclassificado;
sua ratificacao anterior permanece conforme deliberacao humana. Nenhuma
alteracao financeira, de billing ou reconciliacao foi realizada.
Typecheck global de 178 diagnosticos permanece pendencia separada, sem
investigacao, reexecucao ou dispensa. Freeze F2.23, No-Go Ledger,
security-review-blocked e todos os bloqueios operacionais continuam ativos.

## Etapa 8.9.2 — Delta inbound read-only, ativacao desabilitada

Fonte: autorizacao humana expressa desta etapa; decisao especifica F5.0/F2.25
acrescentada ao registro de decisao existente antes do primeiro codigo.
Nao altera os registros F2.24, a selecao do provider ou o hold operacional.
Executor: Codex, sem subagentes. P1ReconciliationRecurring nao investigado.

### Baseline e ambiente efetivamente utilizados

Main consolidada informada e confirmada pela referencia local: b1ca462ea88b7f4c4c205103791c91d1d14554b7.
Worktree existente reutilizada: /home/jusall/projects/EIAH_BUILDER, branch
docs/whatsapp-meta-candidate-assessment, HEAD cecc2d8ca63fddb667f86e39eaa8066e0135ede5.
Preflight limpo e stage vazio. HEAD e origin/main possuem exatamente a mesma
arvore af577acc41c53bf8b7a37e527c841ce514344c22. Nao houve merge, checkout,
criacao de branch/worktree ou alteracao direta da main. Os resultados abaixo
se referem a esse conteudo mais o delta local nao commitado, sem novo SHA.
CI pos-merge anterior e reutilizado conforme evidencia humana; sem consulta
remota ou repeticao dos jobs. Nao e certificado novo CI para o delta local.

### Delta efetivamente implementado

- apps/api/src/index.ts: monta somente a nova namespace antes de requestLogger
  e express.json; demais rotas e parser permanecem. A URL do GET com token nao
  chega ao logger generico. Nao inicia conexao PostgreSQL por essa rota desativada.
- apps/api/src/routes/whatsappMeta.ts: GET autenticado e POST com bytes brutos,
  HMAC, limite explicito, sem descompressao; resposta minima, sem dados internos.
  Namespace terminal tambem em erros/subpaths; sem propagacao de erro bruto.
- apps/api/src/services/whatsappMetaAdapter.ts: factories explicitas synthetic-lab
  e operational reutilizam o mesmo processamento puro e o ingress read-only.
  Laboratorio mantem IDs/credenciais sinteticos e limites anteriores. Operacional
  aceita IDs/envelopes nativos representativos, descarta contacts, display phone
  e context; text/button_reply/list_reply suportados. Media, status-only e formas
  desconhecidas sao rejeitados, sem ACK silencioso ou download de midia.
- apps/api/src/services/whatsappMetaOperationalConfig.ts: sem defaults de secrets,
  politica ou autoridade. Sem fallback do transporte legado. Credenciais
  laboratoriais reconhecidas sao rejeitadas; tres secrets distintos obrigatorios.
- apps/api/src/services/whatsappMetaPostgresStore.ts: somente tabela tecnica;
  INSERT ON CONFLICT, SELECT FOR UPDATE, ordem de locks estavel e transacao
  READ COMMITTED. Digest semantico e chave HMAC escopada por WABA, phone, tenant,
  workspace e scope; mudanca do tipo para o mesmo ID gera colisao. Callback
  read-only ocorre dentro da transacao; ACK somente depois de COMMIT resolvido.
  Falha de armazenamento/commit nao gera ACK positivo. Sem outbox de dominio.
- packages/db/prisma/schema.prisma e migration
  packages/db/prisma/migrations/20261125180000_whatsapp_meta_ingress_receipt/migration.sql:
  WhatsappMetaIngressReceipt com PK tenantId/workspaceId/eventKey, digest,
  scope, receivedAt e expiresAt; checks de scope, hashes e expiracao; indice
  expiresAt. Sem FK ou mutacao de modelos de dominio. Migration NAO aplicada.
- apps/api/src/tests/whatsapp.meta-operational.test.ts: fixtures inteiramente
  ficticias; teste HTTP apenas em loopback, bloqueio de sockets externos,
  DNS/TLS/fetch. Port SQL testado com dublê transacional explicitamente identificado.
- scripts/unit-tests-manifest.txt e package.json: uma suite adicionada ao Grupo B
  e ao comando canonico correspondente, preservando ordem e demais scripts.

### Configuracao preparada, sem valores operacionais provisionados

Ativacao exige META_WHATSAPP_ENABLED exatamente true e META_WHATSAPP_MODE
exatamente operational. Ausencia/false/outros valores da flag retornam 404,
sem criar store ou tocar banco; configuracao incompleta retorna 503.
Nao foi alterado .env, Render, Cloudflare, callback, WABA ou segredo algum.

Inputs obrigatorios (nomes apenas): META_WHATSAPP_APP_SECRET,
META_WHATSAPP_VERIFY_TOKEN, META_WHATSAPP_IDENTITY_KEY,
META_WHATSAPP_BINDINGS_JSON (WABA/phone e hashes de remetentes com autoridade
explicita, sessao, tenant/workspace, scope e entitlement read-only),
META_WHATSAPP_POLICY_APPROVAL, META_WHATSAPP_EXECUTION_APPROVAL,
META_WHATSAPP_MAX_PAYLOAD_BYTES, META_WHATSAPP_MAX_EVENTS,
META_WHATSAPP_RETENTION_MS, META_WHATSAPP_REPLAY_WINDOW_MS e
META_WHATSAPP_FUTURE_SKEW_MS. Referencias de approval sao inputs obrigatorios,
nao verificacao nem concessao automatica de aprovacao humana. Nenhum access
ou sending token e usado para ingresso. Nao existe cliente de envio/Graph API.

16 KiB, 20 eventos e 14 dias aparecem somente nas fixtures como parametros de
teste, sem default operacional e sem ratificacao produtiva. Retencao precisa
cobrir replay mais clock skew. Purge tecnico explicito preparado, sem scheduler
ou execucao operacional; exclusao tempestiva em ambiente ocioso ainda precisa
mecanismo operacional autorizado. Rotacao da chave HMAC exige plano proprio
para preservar dedupe/binding durante a retencao, antes de qualquer rotacao real.

### Unica rodada executada — resultados reais

Preparacao estritamente necessaria das dependencias existentes: contracts,
db (tsup, build:dts, copia do client existente), core, providers e mcp-runner:
cinco etapas com exit 0, limite de 60 segundos cada. Sem install, generate,
rebuild de dependencias novas, conexao ou migration. O port usa SQL parametrizado,
portanto nao necessita gerar um client ORM com o novo modelo nesta etapa.
Artefatos dist sao locais/ignorados, nao mudancas de fontes ou deploy.
Comandos e saidas: [operational-dependencies.log](operational-dependencies.log).

Comando dos testes (uma unica execucao, limite 60 segundos):

```bash
timeout 60s node --import tsx --test --test-force-exit apps/api/src/tests/whatsapp.meta-operational.test.ts apps/api/src/tests/whatsapp.webhook-read-only.test.ts
```

PASS, exit 0: 43/43, zero falhas/cancelamentos/ignorados, 839.93462 ms.
19 testes novos + 24 da regressao diretamente afetada do transporte existente.
Provas: flag off/configuracao incompleta; secrets de laboratorio rejeitados;
GET sem logger/token; assinatura sobre bytes reais e whitespace; payloads
representativos e limites; binding, tenant, workspace, scope, entitlement,
sessao e replay; dedupe e concorrencia no duble SQL, store recriado, colisao
semantica/tipo, ACK bloqueado ate commit, falhas write/commit e rollback de
lote; sanitizacao; purge tecnico; disable preservando ledger; bootstrap e
migration; zero tentativas externas durante as execucoes HTTP locais.
Saida integral: [operational-tests.log](operational-tests.log).

A suite laboratorial Meta 24/24 e os probes DNS 12/12 anteriores nao foram
reexecutados ou recertificados nesta etapa. Duas outras regressoes historicas
nao foram repetidas. A regressao direta de 24 testes acima e uma nova execucao
comprovada. A nova suite contem um teste especifico que preserva a separacao
de credenciais/modos do laboratorio, sem repetir a frente encerrada.

Typecheck focal noEmit, strict e resolucao/opcoes do tsconfig.build.json
preservados, incluindo cinco raizes (rota, adapter, config, store e novo teste)
e suas dependencias: PASS, exit 0, zero diagnosticos, TypeScript 5.9.3.
Mecanismo e saida: [operational-focal-types.log](operational-focal-types.log).

```bash
timeout 60s pnpm --filter @eiah/api build
```

PASS, exit 0: typecheck completo da API (tsc -p tsconfig.build.json --noEmit)
e build tsup concluidos; bundle local 3.66 MB, sourcemap 6.89 MB, 512 ms.
Build nao inicia a aplicacao. Saida: [operational-api-build.log](operational-api-build.log).
Esta evidencia positiva atual substitui a pendencia de validar a API neste
ambiente preparado; nao apaga nem dispensa retroativamente o FAIL historico
178, nao reclassifica seus diagnosticos individualmente e nao certifica todos
os workspaces, testes excluidos pelo global ou CI futuro. Diferencia-se do
build_validate historico, que isoladamente nao comprovava build da API.

Prisma validate: PASS, exit 0; schema valido. Usadas somente URLs ficticias
locais no processo de validacao, sem conexao ou aplicacao de migration.
Comando e saida: [operational-schema.log](operational-schema.log).

### Limites da prova e impedimentos para primeira conexao real

Status: parcial quanto a prontidao operacional; codigo e validacoes locais
acima evidenciados. Nao e declarada prova PostgreSQL real: o dublê serializa
transacoes e valida SQL/parametros, rollback, ACK e classificacao, mas NAO
prova locks, unicidade, isolamento, durabilidade ou restart do PostgreSQL.
Providencia minima: autorizar banco PostgreSQL DESCARTAVEL e isolado de testes,
aplicar somente nesse banco a migration proposta e executar o mesmo contrato
com conexoes concorrentes/restart/falha de commit reais. Nenhum banco real
existente foi inspecionado ou modificado; nao foi iniciado Docker/infraestrutura.

Antes da primeira conexao: revisar/aprovar migration e persistencia real;
ratificar limites/replay/retencao e comprovar purge; revisoes Security e
Privacy/Compliance para dados pessoais reais, selecao e decisao especifica
canonica para conexao, approvals e levantamento expresso do hold F2.22.
Depois, somente com autorizacao operacional: provisionar secrets/binding,
confirmar elegibilidade do app/WABA/numero existente e compatibilidade com
nao publicar app/nao pagar/nao reclassificar; preparar URL HTTPS Cloudflare/Render,
redacao de query strings nos logs de proxy e rollback; migration/deploy ainda
com flag off, handshake/subscricao autorizados e ativacao limitada.
Se alguma condicao exigir pagamento, publicacao ou reclassificacao, interromper
para decisao humana; nenhuma dessas exigencias foi presumida resolvida.

Freeze F2.23, No-Go Ledger, security-review-blocked, provider integration blocked,
executionAuthorization: not authorized e productionAuthorization: not authorized
preservados. Sem promocao F2.19, selecao definitiva Meta ou ratificacao Bloco D.
Nenhum dado real, credencial real, chamada Meta, mensagem, agente/LLM, fila,
Run ou mutacao de dominio; sem deploy, migration real, Docker ou operacao Git.

### Checks documentais e isolamento desta etapa

Checks documentais em rodada unica: Evidence Index PASS exit 0 (8/8 testes,
indice ok); Docs Link Integrity PASS exit 0, restrito aos 29 alvos canonicos.
Comandos/saidas: [operational-docs.log](operational-docs.log).
Nao constitui verificacao de todos os links do repositorio.

Prova de isolamento PASS: 13 caminhos no delta, oito rastreados modificados e
cinco novos, nenhum em stage; branch/HEAD preservados. Diff vazio nas superficies
proibidas (workflows, release, Render, web/workers e fontes de core/contracts/
providers/mcp-runner/db). Schema e migration sao as unicas mudancas de dados.
Registros F2.24 e tres logs historicos identicos aos blobs HEAD, com SHA-256
registrados; seis logs desta rodada fisicamente preservados e ignorados.
Script de CI alterado apenas pela inclusao da suite nova; manifesto e comando
coincidem exatamente, sem exclusoes ou enfraquecimento de gates.
Resultado detalhado: [operational-isolation.log](operational-isolation.log).
A verificacao unica de whitespace do delta final, incluindo os novos arquivos,
sera anexada ao mesmo log. Nenhuma validacao reprovada foi repetida.

## Etapa 8.9.3 — Validacao PostgreSQL interrompida no preflight

Executor: Codex, sem subagentes. Fonte: autorizacao humana expressa desta
etapa para PostgreSQL descartavel sintetico, condicionada a isolamento
comprovado antes de qualquer escrita. Nao autoriza iniciar Docker ou
provisionar infraestrutura adicional automaticamente.

Preflight confirmado: branch docs/whatsapp-meta-candidate-assessment,
HEAD cecc2d8ca63fddb667f86e39eaa8066e0135ede5, stage vazio; delta anterior
preservado com oito arquivos rastreados modificados e cinco novos. Main de
referencia b1ca462ea88b7f4c4c205103791c91d1d14554b7. Resultados 8.9.2
(43/43, typecheck/build API, schema, isolamento e checks documentais) sao
historicos reutilizados, sem reexecucao ou nova certificacao nesta etapa.

### Consulta pontual dos recursos locais existentes

Reutilizados docker-compose.dev.yml (PostgreSQL local eiah-postgres,
porta 5433) e o registro historico de infraestrutura descartavel em
docs/ops/vertical-evaluation-grant.md. A existencia historica desse ambiente
nao comprova sua disponibilidade atual. Nenhum novo inventario foi criado.

A consulta inicial de sockets foi impedida pelo sandbox (Cannot open netlink
socket: Operation not permitted). A disponibilidade dos recursos conhecidos
foi entao consultada somente em leitura fora do sandbox, sem iniciar servicos:

```bash
pg_isready -h 127.0.0.1 -p 5433 -t 3
docker ps --filter name=eiah-postgres --format '{{.Names}} {{.Status}} {{.Ports}}'
ps -C postgres -o pid=,comm=
ls -d /tmp/*postgres* /tmp/*pg16* /tmp/*evaluation* /tmp/eiah* /var/run/postgresql/.s.PGSQL.*
```

Saida objetiva da consulta composta (exit 2; codigos individuais nao capturados):

```text
127.0.0.1:5433 - no response
Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?
```

A consulta nao listou processos postgres nem recursos descartaveis nos caminhos
indicados. psql e pg_isready existem localmente; binarios disponiveis nao sao
prova de instancia em execucao. Nao foi iniciado ou inicializado cluster novo.
A conclusao e limitada aos recursos locais conhecidos e caminhos consultados;
nao afirma inexistencia de qualquer PostgreSQL fora desse escopo.

### Resultado: parcial, PostgreSQL real NAO EXECUTADO

Nenhum destino seguro disponivel foi identificado. Identidade de banco,
isolamento descartavel e ausencia de dados reais NAO foram comprovados;
portanto nenhuma conexao SQL, CREATE DATABASE/SCHEMA, escrita, migration ou
consulta de dados foi realizada. Nenhuma conexao com Render ou banco
operacional foi tentada. Nenhum recurso foi criado; remocao nao se aplica.

Todos os doze criterios PostgreSQL solicitados permanecem NAO EXECUTADOS:
aplicabilidade da migration; constraints/unicidade; aceite/persistencia;
duplicidade; colisao; concorrencia independente; rollback; falha sem ACK;
durabilidade apos reabertura; isolamento tenant/workspace; ausencia de
payload/credenciais/dados pessoais persistidos; campos de expiracao.
Nao ha resultado de concorrencia/durabilidade PostgreSQL real nesta etapa.
Os testes anteriores usaram duble SQL, e nao sao promovidos a prova real.
Nao foi criado teste focal ou registro de execucao CI sem ambiente para
executa-lo. Nenhum contrato ou codigo de producao foi alterado nesta etapa.

Providencia minima: disponibilizar a instancia local de testes ja existente
e isolada, com endpoint e identidade comprovaveis, permitindo criar/remover
somente banco ou schema dedicado; alternativamente, autorizar separadamente
inicializacao de infraestrutura descartavel (Docker continua proibido nesta
autorizacao). So depois comprovar isolamento e executar a rodada PostgreSQL.
Nao foi iniciada outra investigacao ou ciclo automatico de testes/correcoes.

Os sete logs 8.9.2 e os tres logs historicos foram preservados fisicamente,
sem alteracao de conteudo. Somente este README e a entrada existente no
Evidence Index recebem o resultado real do preflight, sem nova evidencia
antecipada. Freeze F2.23, No-Go Ledger, security-review-blocked e bloqueios
de integracao/execucao/producao preservados; ativacao continua desabilitada.
Sem dados reais, credenciais Meta, chamadas externas, deployment, Docker,
P1, stage, commit, push, PR, merge, selecao definitiva Meta ou Bloco D.

## Etapa 8.9.3.2 — PostgreSQL real descartavel: 12 criterios aprovados

Fonte: autorizacao humana expressa desta etapa, limitada a um unico container
PostgreSQL sintetico; retomada apos recuperacao do WSL Ubuntu-EIAH-D.
Executor: Codex, sem subagentes. A leitura do campo Docker opcional Tmpfs
foi ajustada para index .HostConfig "Tmpfs", tolerando sua ausencia em
containers antigos. Tambem foi ajustada a composicao do registro de metadados
para o Python local. Ambos os diagnosticos anteriores ao primeiro container
foram preservados; nenhum teste PostgreSQL havia sido executado nessas falhas.

Na retomada, o log fisico comprovou que a unica rodada PostgreSQL JA havia
concluido com exit 0 e limpeza antes da interrupcao por utilizacao. Os testes
nao foram repetidos e nenhum segundo container foi criado. Consulta somente
em leitura confirmou novamente ausencia do descartavel e eiah-postgres healthy.
Nenhum SQL, credencial ou dado do eiah-postgres foi acessado.

### Isolamento comprovado antes da migration

Nome e porta livres antes da criacao. Imagem local pgvector/pgvector:pg16,
ID sha256:9b05db12a35460fff0587e009f9326e414a53e9484555547f96d214a2ba98ef7;
--pull=never, sem download/rebuild. Um unico container criado:
eiah-whatsapp-meta-validation, ID
0d328e0f8bc08a5699eee09a66edb681c8e12ddfaf458f75a5ede77fa569d630.
Label de propriedade exclusiva conferida antes da remocao.

Publicacao somente em 127.0.0.1:55434 -> 5432; restart=no; networkMode=bridge,
sem conexao a rede operacional eiah-dev. Mounts bind/volume: nenhum; PGDATA
em tmpfs exclusivo de 256 MiB, sem volumes operacionais ou compartilhados.
Limites do container: 512 MiB e uma CPU. Credencial temporaria aleatoria
passada em memoria, sem valor em arquivo de evidencia, config ou comando.

A primeira conexao confirmou current_database=eiah_whatsapp_meta_synthetic,
current_user=meta_validation, PostgreSQL 16.15, server port=5432 e ZERO tabelas
de usuario antes da migration. O teste recusa URL fora de 127.0.0.1:55434,
outro banco/usuario, ausencia de marcadores descartaveis ou banco nao vazio.
O database operacional eiah_builder/porta 5433 nao foi destino de conexao.

### Implementacao real e comando unico

Teste existente: apps/api/src/tests/whatsapp.meta-postgres.integration.test.ts.
Usa createMetaPostgresStore e purgeExpiredMetaReceipts da implementacao real,
PrismaClient e PrismaPg existentes, conexoes PostgreSQL independentes; sem
mocks, dubles SQL, global DB client, dotenv, bootstrap ou listener do webhook.
Dependencia resolvida a partir do workspace db; nao houve instalacao/rebuild.

```bash
timeout 120s node --import tsx --test apps/api/src/tests/whatsapp.meta-postgres.integration.test.ts
```

O runner forneceu somente nesse processo EIAH_META_DISPOSABLE=1,
EIAH_META_DISPOSABLE_CONTAINER_ID e EIAH_META_DISPOSABLE_POSTGRES_URL
(credencial temporaria omitida). Nao foi alterado DATABASE_URL operacional.
PASS, exit 0: 12 subtestes de criterio + um teste-pai = 13/13 reportados pelo
Node; zero falhas, cancelamentos ou ignorados, 933.961265 ms. Os 13 testes nao
significam 13 criterios. Saida integral sanitizada e provas Docker no
[postgres-validation.log](postgres-validation.log).

| Criterio | Resultado real | Evidencia objetiva |
| --- | --- | --- |
| 1. Migration | PASS | Dois statements aplicados atomicamente ao banco vazio; tabela criada com zero linhas. SHA-256 7492c4bc400eb08298cbe7b08471d92ca220c24f444f81ee801b81c61ff67f76. |
| 2. Constraints/unicidade | PASS | PostgreSQL rejeitou PK duplicada, scope invalido, hashes invalidos, expiracao nao posterior e tenant nulo; quatro constraints consultadas e somente a linha valida persistida. |
| 3. Persistencia transacional | PASS | Adaptador real retornou ACK 200 depois de commit; outra conexao confirmou uma linha; um processamento, sideEffects=0. |
| 4. Duplicidade | PASS | Mesmo evento retornou 200 com duplicates=1/accepted=0 na segunda chamada; uma linha e um processamento total. |
| 5. Colisao | PASS | Mesmo identificador com digest diferente gerou META_EVENT_COLLISION e manteve o digest original, sem linha adicional. |
| 6. Concorrencia independente | PASS | Backends 96 e 97 disputaram mesma chave: um fresh, um duplicate e um processamento. Em disputa com row lock, pg_stat_activity confirmou PID 97 em Lock bloqueado por 96; nenhum ACK antes da liberacao. |
| 7. Rollback | PASS | Excecao no callback apos inserts de lote reverteu ambas as linhas; outra conexao confirmou count=0. |
| 8. Falha sem ACK positivo | PASS | Sessao PostgreSQL real com default_transaction_read_only=on rejeitou persistencia; adaptador retornou 503, accepted=0, zero processamento e zero linhas. |
| 9. Durabilidade apos reconexao | PASS | Writer PID 99 desconectado; novo client/backend PID 100 encontrou linha commitada e classificou duplicate sem reprocessar. |
| 10. Tenant/workspace | PASS | Mesma eventKey em tres particoes tenant/workspace persistiu tres linhas independentes; retry na particao original foi duplicate. |
| 11. Dados persistidos | PASS | Inspecao da unica tabela confirmou sete colunas tecnicas e ausencia de payload, telefone, conteudo e credenciais sinteticos nas linhas; nenhum modelo de dominio criado. |
| 12. Expiracao | PASS | receivedAt preservou milissegundos; expiresAt-receivedAt igual ao parametro sintetico; purge real removeu somente uma linha expirada e preservou uma futura. |

### Tipagem e registro canonico

Tipagem focal do teste com strict, noEmit e tsconfig.build.json preservados:
PASS exit 0, zero diagnosticos. Reutilizada sem reexecucao na retomada;
comando e saida existentes em [postgres-focal-types.log](postgres-focal-types.log).
Suite registrada no manifesto canonico scripts/unit-tests-manifest.txt e
somente no trecho correspondente de test:ci-unit-suite em package.json.
Sem URL explicita, a integracao e condicional/skip; skip NAO e prova de PASS.
Imports Prisma de runtime ocorrem somente dentro do teste habilitado, sem
introduzir dependencia de banco no caminho ignorado. Nao houve CI remoto.

Reutilizados sem repeticao: 43 testes 8.9.2, typecheck/build API, Prisma
validate e historicos laboratoriais. Nenhum contrato/codigo de producao,
schema ou migration foi corrigido nesta etapa. Nao investigar P1 ou os 178
historicos. As provas reais acima substituem somente a lacuna de persistencia
PostgreSQL real, sem promover os dubles anteriores nem ratificar F2.19.

### Limpeza e preservacao

O runner confirmou nome/label/ID e removeu exclusivamente esse container
com docker rm --force --volumes usando seu ID completo. Volumes anonimos:
nenhum. PGDATA tmpfs destruido com o container. Ausencia confirmada apos a
limpeza e novamente em leitura na retomada; nao houve necessidade de repetir
remocao. Nenhuma rede, imagem ou outro recurso foi removido.

Metadados selecionados de TODOS os containers preexistentes (ID/imagem,
StartedAt, estado, restartCount/policy e redes) permaneceram iguais durante
a rodada. eiah-postgres intocado, rede eiah-dev preservada; nenhuma migration
ou SQL nele. Os sete logs 8.9.2 e tres historicos estao fisicamente preservados
com os mesmos SHA-256; falhas de preflight e resultados anteriores nao apagados.

Limites: durabilidade comprovada apos desconexao/reconexao, nao crash de
servidor, reinicio do container ou perda de energia; tmpfs e deliberadamente
descartavel. Falha de storage exercitada via sessao real read-only, sem
injetar falha de disco/commit ou derrubar servico. Retencao de 14 dias foi
parametro sintetico; scheduler/politica operacional e limites seguem pendentes.

Freeze F2.23, No-Go Ledger, security-review-blocked, provider integration
blocked, executionAuthorization: not authorized e productionAuthorization:
not authorized preservados; ativacao operacional desabilitada. Sem selecao
final Meta, Bloco D, Meta/Render/Cloudflare, dados reais, deployment ou Git
write. Validacao PostgreSQL real evidenciada no escopo dos doze criterios;
prontidao operacional permanece parcial e sujeita aos approvals anteriores.
