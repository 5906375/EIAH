# F1.6a — pnpm Store Alignment Preflight

## Resumo
- Objetivo: auditar o bloqueio de `pnpm store` que impediu a F1.6 de formalizar `playwright` no workspace root.
- Escopo: diagnóstico/preflight somente leitura + comandos de auditoria locais.
- Status: parcial/evidenciado
- Não instala Playwright.
- Não altera package/lock/scripts/workflows.
- Não declara F1.6 concluída.

## Contexto F1.4-F1.6
- F1.4: criou `scripts/smoke-f1-4-front-door-mobile.mjs` com fallback para `~/.npm/_npx`.
- F1.5: provou reprodutibilidade local do smoke, mas sem dependência formal no grafo do repositório.
- F1.6: tentou formalizar `playwright` no workspace root e falhou antes de qualquer alteração persistida.
- Bloqueio observado:
  - `pnpm add -Dw playwright --ignore-scripts` falhou com `ERR_PNPM_UNEXPECTED_STORE`.
  - `node_modules/.modules.yaml` registra `storeDir: /app/.pnpm-store/v10`.
  - o `pnpm` atual quer usar `/home/jusall/.pnpm-store/v10`.
  - tentativa com `--store-dir /app/.pnpm-store/v10` falhou com `EACCES`.
  - tentativa `lockfile-only` anterior também encontrou risco de rede/registry (`EAI_AGAIN`).

## Arquivos lidos
- `CODEX.md`
- `IA_EIAH.md`
- `AGENTS.md`
- `docs/architecture/agent-chat-runtime.md`
- `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`
- `docs/EVIDENCE_INDEX.md`
- `ops/evidence/latest/f1-04-front-door-mobile-recurring-smoke-minimal-implementation-2026-07-14.md`
- `ops/evidence/latest/f1-05-front-door-mobile-smoke-reproducibility-ci-readiness-2026-07-14.md`
- `scripts/smoke-f1-4-front-door-mobile.mjs`
- `package.json`
- `pnpm-lock.yaml`
- `node_modules/.modules.yaml`
- `.github/workflows/ci.yml`

## Auditoria pnpm store

| Item | Resultado | Implicação |
|---|---|---|
| `node_modules/.modules.yaml storeDir` | `/app/.pnpm-store/v10` | O workspace atual foi materializado contra um store fora do `$HOME`. |
| `pnpm store path` | `/home/jusall/.pnpm-store/v10` | O `pnpm` atual resolve por padrão para outro store. |
| `pnpm config get store-dir` | `/home/jusall/.pnpm-store` | A configuração ativa diverge do `node_modules` existente. |
| `pnpm config list` | `store-dir=/home/jusall/.pnpm-store`, `registry=https://registry.npmjs.org/`, `pnpm=10.12.4` | O cliente atual está alinhado com home store, não com `/app`. |
| `/app` writable | `app_not_writable` | Não é seguro depender do store legado em `/app` neste ambiente. |
| `/app/.pnpm-store/v10` writable | `app_store_not_writable` | Reaproveitar o store legado exige permissões que o ambiente atual não concede. |
| `~/.pnpm-store/v10` writable | `home_store_not_writable` no sandbox atual | Mesmo o store do `$HOME` aparece sem escrita dentro desta sessão sandbox; retomada da F1.6 exigirá execução fora do sandbox ou ambiente com escrita efetiva. |
| `.npmrc/.pnpmrc` no repo | inexistentes | Não há config local no repo impondo `storeDir`; a divergência vem do ambiente/workspace materializado. |
| referências a store no repo | CI usa `pnpm config set store-dir ~/.pnpm-store`; scripts dev usam `/pnpm/store`; `apps/web` e `apps/cli` Dockerfiles usam `PNPM_STORE_DIR=/app/.pnpm-store` | Há múltiplos contextos válidos por ambiente, mas o workspace local atual ficou preso ao contexto `/app`, diferente do CI. |
| registry/network | risco confirmado por observação anterior `EAI_AGAIN registry.npmjs.org` na tentativa `pnpm install --lockfile-only --ignore-scripts` | Mesmo com o `storeDir` resolvido, a retomada da F1.6 ainda depende de registry acessível ou cache/metadados já presentes. |

## Diagnóstico
- Causa provável:
  - o `node_modules` atual foi gerado/relinkado em um contexto anterior que usava `storeDir=/app/.pnpm-store/v10`;
  - o `pnpm` ativo nesta sessão está configurado para `store-dir=/home/jusall/.pnpm-store`;
  - essa divergência aciona `ERR_PNPM_UNEXPECTED_STORE` antes mesmo da resolução normal da nova dependência.
- Por que F1.6 não deve continuar sem resolver isso:
  - qualquer `pnpm add` ou `pnpm install` pode falhar, relinkar parcialmente ou deixar `package.json`/`pnpm-lock.yaml` fora de sincronia com `node_modules`.
- Por que `--force` não deve ser usado sem plano:
  - ele mascara a divergência estrutural;
  - pode disparar relink amplo do workspace sem controle de impacto;
  - não elimina o risco secundário de registry/rede.
- Por que `lockfile-only` não fecha F1.6:
  - F1.6 exige prova real de `import("playwright")` pelo grafo formal do repositório;
  - atualizar só `package.json`/`pnpm-lock.yaml` sem materializar o módulo em `node_modules` não permite executar o smoke normalizado.

## Opções de desbloqueio

| Opção | Comando futuro | Prós | Contras | Recomendação |
|---|---|---|---|---|
| Alinhar o `pnpm` ao store existente | `pnpm config set store-dir /app/.pnpm-store --global` seguido de `pnpm add -Dw playwright --ignore-scripts` | Menor mudança conceitual se `/app` fosse o store válido real | Neste ambiente `/app` não é gravável; depende de permissão externa e contraria o padrão atual do CI | Não recomendada |
| Configurar store acessível sob home e relink controlado | `pnpm config set store-dir ~/.pnpm-store --global` seguido de `pnpm install --ignore-scripts` e depois `pnpm add -Dw playwright --ignore-scripts` | Alinha host local ao padrão já documentado no CI; remove dependência de `/app` | Exige relink/reinstalação controlada do workspace; ainda depende de registry acessível | Recomendada |
| Reinstalação controlada completa do workspace | `pnpm install --ignore-scripts` em ambiente com `store-dir=~/.pnpm-store` e rede funcional | Resolve de vez o drift entre `node_modules/.modules.yaml` e config ativa | Maior custo operacional; pode tocar todo o workspace | Recomendada se o relink simples falhar |
| Aguardar rede/registry estável | repetir depois `pnpm install --ignore-scripts` / `pnpm add -Dw playwright --ignore-scripts` | Evita diagnosticar falsos negativos de metadata | Não resolve sozinho a divergência de `storeDir` | Necessária como pré-condição complementar |

## Recomendação para retomar F1.6
- Comando recomendado:
  - `pnpm config set store-dir ~/.pnpm-store --global`
  - `pnpm install --ignore-scripts`
  - `pnpm add -Dw playwright --ignore-scripts`
- Pré-condições:
  - executar fora do sandbox restrito atual ou em sessão com escrita efetiva em `~/.pnpm-store`;
  - registry acessível sem `EAI_AGAIN`;
  - aceitar relink controlado do workspace.
- Arquivos que podem mudar:
  - `pnpm-lock.yaml`
  - `package.json`
  - `node_modules/.modules.yaml`
  - `node_modules/**` por relink controlado
- Arquivos que devem continuar bloqueados:
  - `scripts/**` até a dependência formal existir
  - `.github/workflows/**`
  - `apps/**`
  - `packages/**`
  - `ChatAgentLauncher`, runtime, engine, APIs, contracts
- Gates antes de aceitar:
  - `git status --short` limpo antes do relink
  - `import("playwright")` resolvendo pelo grafo formal
  - smoke F1.4 rodando sem fallback `_npx`
  - `pnpm check:evidence-index`
  - `pnpm check:docs-link-integrity`
  - `pnpm check:w4-non-regression`

## Prova de isolamento
- Sem alteração em `package.json`.
- Sem alteração em `pnpm-lock.yaml`.
- Sem alteração em `scripts`.
- Sem alteração em `workflows`.
- Sem alteração em `apps/packages`.
- Sem alteração em `ChatAgentLauncher/runtime/engine`.
- Sem instalação executada.

## Checks executados
- `git status --short`
- `git branch --show-current`
- `pnpm store path`
- `pnpm config get store-dir`
- `pnpm config list`
- `sed -n '1540,1565p' node_modules/.modules.yaml`
- `ls -ld /app /app/.pnpm-store /app/.pnpm-store/v10 2>/dev/null || true`
- `ls -ld ~/.pnpm-store ~/.pnpm-store/v10 2>/dev/null || true`
- `test -w /app && echo app_writable || echo app_not_writable`
- `test -w /app/.pnpm-store/v10 && echo app_store_writable || echo app_store_not_writable`
- `test -w ~/.pnpm-store/v10 && echo home_store_writable || echo home_store_not_writable`
- `find . -maxdepth 3 \( -name '.npmrc' -o -name '.pnpmrc' \) -print`
- `rg -n "store-dir|pnpm-store|node-linker|virtual-store-dir" .npmrc .pnpmrc . --hidden -g '!node_modules' -g '!dist' -g '!build' | sed -n '1,120p'`
- `node -v`
- `pnpm -v`
- `corepack --version || true`
- `git diff --check`
- `git diff -- package.json pnpm-lock.yaml scripts .github/workflows apps packages`

## Conclusão
- Status final: parcial/evidenciado
- Próxima ação recomendada:
  - retomar a F1.6 somente com relink controlado do workspace para `~/.pnpm-store` e registry estável;
  - não insistir em `/app/.pnpm-store` no host atual.
- Não declara F1.6 concluída.
