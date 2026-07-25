# Neon Preview Branch Create — observabilidade sanitizada

Data: 2026-07-24  
Artifact ID: `NEON-PREVIEW-BRANCH-CREATE-OBSERVABILITY-2026-07-24`  
Status: `parcial`

## Escopo executado

Baseline local:

- branch Git: `feat/neon-preview-branches`;
- HEAD inicial: `80705d7b312e234f6220265af11bf7b416551ede`;
- worktree inicial: limpo;
- workflow: `.github/workflows/neon-preview-create.yml`.

O step `create_branch` passou a usar `fetch` nativo do Node para:

1. consultar a branch por nome exato;
2. reutilizá-la quando existente;
3. resolver o parent configurado;
4. executar um único `POST` de criação quando a branch estiver ausente;
5. recuperar a connection URI somente após sucesso;
6. preservar os outputs `created` e `db_url` usados pelo restante do workflow.

Não houve alteração em naming, project ID, parent branch, database, role,
secrets, variables, migrations, schema diff policy ou enforcement final.

## Diagnóstico persistido

Quando `blockingCondition=neon_branch_create_failed`, o artifact
`preview-evidence.json` passa a registrar somente:

- `httpStatus`;
- `statusText`;
- `code`;
- `safeMessage`;
- `branchName`;
- `parentBranch`;
- `projectId`.

`safeMessage` é reduzida a uma linha e truncada em 320 caracteres. API key,
Authorization, bearer token, `DATABASE_URL`, senha, connection string e URLs
`postgres://` ou `postgresql://` são excluídos ou mascarados antes do output.
O builder do artifact reaplica sanitização como segunda camada.

## Validações executadas

### Sintaxe do workflow

O YAML foi carregado localmente e os três heredocs Node foram extraídos e
validados com `node --check`.

Resultado:

```text
yaml: ok
inline_node_blocks_checked: 3
```

### Falha HTTP 412 simulada

O step de criação foi executado com `fetch` local mockado, sem rede e com:

- `status=412`;
- `statusText=Precondition Failed`;
- `body.code=precondition_failed`;
- `body.message` contendo URI PostgreSQL, bearer token e texto acima do
  limite.

Resultado:

```text
mock_http_412: ok
sanitization: ok
safe_message_max: 320
```

O builder do artifact foi executado separadamente com os mesmos campos
simulados.

Resultado:

```text
artifact_http_412: ok
artifact_sanitization: ok
```

O caminho de criação bem-sucedida também foi executado com `fetch` mockado.
O harness exigiu nome `preview/pr-389`, parent resolvido `br-parent`, somente
um `POST`, `suspend_timeout_seconds=300` e os outputs `created`, `branch_id` e
`db_url`.

Resultado:

```text
mock_create_success: ok
preserved_outputs: ok
post_count: 1
```

### Gates locais

```text
git diff --check
pass

pnpm check:evidence-index
ok: true

pnpm check:docs-link-integrity
ok: true

pnpm test:neon-preview-schema
tests: 1
pass: 1
fail: 0
```

O masking nos arquivos alterados não encontrou valor compatível com bearer
token, secret atribuído ou connection string credenciada.

## Limitações

- O workflow alterado não foi enviado ao GitHub.
- Nenhuma chamada real à Neon foi feita nesta sessão.
- Nenhum artifact remoto novo foi produzido.
- O `body.code` e o `body.message` reais da falha persistente do PR `#389`
  somente poderão ser confirmados após autorização de push e nova execução
  remota.

Por essas limitações, a implementação permanece `parcial`; esta evidência
prova somente estrutura, sanitização e gates locais.

## Leitura e governança

`CODEX.md` e `CLAUDE.md` foram lidos integralmente antes do preflight. A
cadeia adicional exigida por ambos também foi lida antes da alteração:
`IA_EIAH.md`, roadmap canônico, `AGENTS.md`,
`docs/architecture/agent-chat-runtime.md` e `docs/EVIDENCE_INDEX.md`.

`ChatAgentLauncher`, runtime, `tenantGuard` e `package.json` permaneceram
intocados.
