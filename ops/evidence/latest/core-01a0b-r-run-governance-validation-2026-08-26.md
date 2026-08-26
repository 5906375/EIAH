# CORE-01A0b-R — Run Governance Validation (T2/T3), 2026-08-26

## Árvore validada

| Campo | Valor |
| --- | --- |
| commit | `37c162a3a0a673487eaaee1bfc4386b5afd0d713` |
| tree | `03b6dab0d52d754d2522b9e10939f6b6b8476bfb` |
| branch | `docs/structural-gate-boundary-sha` |
| worktree antes da execução | limpo |
| worktree depois da execução | limpo |

## Resultado dos 4 gates canônicos autorizados (T2)

Ordem executada, nenhuma falha, nenhum interrompido.

| # | Comando | Exit code | Contagem observada |
| --- | --- | --- | --- |
| 1 | `pnpm test:run-governance-metadata` | 0 | 31/31 pass + 17/17 pass (duas invocações encadeadas) |
| 2 | `pnpm test:run-governance-policy:integration` | 0 | 2/2 pass + 5/5 pass (duas invocações encadeadas) |
| 3 | `pnpm check:reason-code-canon` | 0 | `{"ok":true,"catalogSize":76,"enforcement":"informational-until-ruleset-ratification"}` |
| 4 | `pnpm check:orphan-tests` | 0 | `orphanCount:93, blockingOrphanCount:0` |

**T2: PASS**

## Campos operacionais

```
dependenciesReinstalled: false
lockfileCorrespondence: lockfile_unmodified_vs_head_only
  (pnpm-lock.yaml sem modificação no git status vs. HEAD; correspondência
   completa com node_modules não foi objetivamente verificada — instalar
   dependências estava fora de escopo em T2)
```

## Artefatos — raw externo vs. publicável masked

O diretório externo de captura `/home/jusall/validation-core-01a0b-r-t2-20260826-3YW5m7` (fora do repositório, não versionado) contém os logs **raw** originais, produzidos pela execução real dos gates em T2, sem qualquer alteração.

As cópias abaixo, publicadas neste repositório em `ops/evidence/latest/`, são derivadas desses raw logs. Os logs 01 e 02 foram **masked** antes da publicação (decisão humana explícita de 2026-08-26); os logs 03 e 04 foram copiados **sem alteração**, após confirmação da ausência de padrões sensíveis. O manifest foi copiado sem alteração.

| Artefato publicado | Origem | Masked? | rawLogSha256 (fonte externa) | maskedLogSha256 (artefato publicado) |
| --- | --- | --- | --- | --- |
| `core-01a0b-r-t2-2026-08-26-01-test_run-governance-metadata.log.txt` | `01-test_run-governance-metadata.log` | sim | `d7e0d08c6002da47f987eade6b431a01d17e34c777d01a45372f38bb15cb6b9c` | `a7bd0cef1dd364fc66f4056ce0835601e66fdcc4e6d84f3bc3acdfaacf81251e` |
| `core-01a0b-r-t2-2026-08-26-02-test_run-governance-policy_integration.log.txt` | `02-test_run-governance-policy_integration.log` | sim | `e9294a03d65fc436265b579ab902ddc52cf5936c8d4dac269a3adc5ae8255f3d` | `96a003027b374a35f27fa828973154bb129b279093adec87b02eb75e5d0cc39c` |
| `core-01a0b-r-t2-2026-08-26-03-check_reason-code-canon.log.txt` | `03-check_reason-code-canon.log` | não (ausência de padrão sensível confirmada) | `99da8cb2a012d2184cf617fdfb84ddce0a439929fbe7ffef81f6ecfd203d46b5` | `99da8cb2a012d2184cf617fdfb84ddce0a439929fbe7ffef81f6ecfd203d46b5` (idêntico ao raw) |
| `core-01a0b-r-t2-2026-08-26-04-check_orphan-tests.log.txt` | `04-check_orphan-tests.log` | não (ausência de padrão sensível confirmada) | `d8d7af53bd2db62a8320be7182bfd0cfee6b8b6beb0e9de9c8189b1462aacabb` | `d8d7af53bd2db62a8320be7182bfd0cfee6b8b6beb0e9de9c8189b1462aacabb` (idêntico ao raw) |
| `core-01a0b-r-t2-2026-08-26-manifest.json` | `manifest.json` (T2) | não | `ea06e1766e9dbae02084f58f5760ee428a7beeeb2dd9999d1cedecb294df2e51` | `ea06e1766e9dbae02084f58f5760ee428a7beeeb2dd9999d1cedecb294df2e51` (idêntico ao raw) |

Nota: os quatro logs foram publicados com sufixo `.txt` (em vez de `.log`) porque `.gitignore:17` ignora `*.log` em todo o repositório; a extensão foi ajustada apenas para tornar os arquivos rastreáveis pelo git — conteúdo e hashes acima são do arquivo efetivamente publicado, idênticos antes e depois da renomeação.

## Regras de masking aplicadas (logs 01 e 02, publicáveis apenas)

Masking determinístico, aplicado exclusivamente às cópias publicáveis; os raw logs externos permanecem intocados. Mapeamento original→token não foi persistido nem impresso em nenhum artefato ou relatório.

1. `DATABASE_URL=<qualquer valor>` → `DATABASE_URL=[REDACTED_TEST_DATABASE_URL]`.
2. Valor associado a `"tenantId":"<valor>"` → token sequencial `TENANT_NNN`, mesmo mapeamento reutilizado entre os dois logs para o mesmo valor original.
3. Valor associado a `"workspaceId":"<valor>"` → token sequencial `WORKSPACE_NNN`, mesmo mapeamento reutilizado entre os dois logs para o mesmo valor original.
4. Menções textuais isoladas às palavras `tenantId`/`workspaceId` sem valor associado não foram alteradas (nenhuma ocorrência desse tipo foi identificada nos dois logs).

### Contagem de substituições por categoria

| Categoria | Ocorrências substituídas | Valores únicos mapeados |
| --- | --- | --- |
| `DATABASE_URL` | 2 | — (regra fixa, sem tokenização sequencial) |
| `tenantId` | 19 | 3 |
| `workspaceId` | 19 | 3 |

Contagem de linhas preservada em todos os quatro logs (raw = masked/copiado em número de linhas). Nomes de campo e estrutura restante preservados.

## Escopo não coberto (fora desta evidência)

- Build global, suíte de testes global, lint, typecheck, migrations manuais: fora do escopo de T2, não executados.
- Correspondência completa lockfile ↔ `node_modules`: não verificada objetivamente (instalar dependências estava fora de escopo).
- Critérios-pai de `CORE-01A0b`, `CORE-01A0` e `PRE_DUIMP`: não avaliados nesta evidência.

## Status

```
CORE-01A0b-R: EVIDENCIADO — condicionado à aprovação do gate check:evidence-index.
CORE-01A0b: PARCIAL — critérios-pai ainda não avaliados.
CORE-01A0: PARCIAL.
PRE_DUIMP: BLOQUEADO — aguardando somente avaliação objetiva dos critérios-pai.
```
