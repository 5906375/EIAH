# EIAH Site v6.2 — Production Deploy Evidence — 2026-09-14

## Escopo

Registro pós-deploy da landing institucional EIAH v6.2 no Cloudflare Worker `eiah-site`.

Este artefato documenta a promoção já executada e validada em produção.
Não altera runtime, configuração de aplicação ou política operacional.

## Fonte versionada

- Repositório: `5906375/EIAH`
- PR: `#443`
- Branch de origem: `feat/version-eiah-site`
- Commit mergeado em `main`: `d4ac1f9001ad91ddfc1ba28d1143e1747196fd2d`
- Diretório publicado: `apps/site/public`
- Configuração versionada: `apps/site/wrangler.jsonc`

## Validação pré-deploy

Dry-run executado a partir do commit mergeado em `main`:

- Wrangler: `4.131.2`
- Assets reconhecidos: `19`
- Bindings: `0`
- Resultado: `--dry-run: exiting now`

## Baseline Cloudflare anterior

- Worker: `eiah-site`
- Deployment anterior preservado para rollback:
  `619359f3-3b67-409c-a44c-7943a0892507`

## Deployment promovido

- Novo deployment:
  `bba59b54-9e1c-4024-94ec-694c98675c5b`
- Assets reconhecidos: `19`
- Assets novos ou modificados enviados: `16`
- Custom Domain: `eiah.ia.br`
- Custom Domain: `www.eiah.ia.br`
- Workers.dev: `eiah-site.mmerlon-adv.workers.dev`

## Migração de `/levoutec/`

Antes do cutover havia um Worker separado:

- Worker: `eiah-levoutec`
- Versão preservada:
  `e23ae759-d06b-4cfb-8070-80c2347f9dcf`
- Route anterior:
  `www.eiah.ia.br/levoutec/*`

Antes da migração:

- `https://www.eiah.ia.br/levoutec/` retornava HTTP `200` via `eiah-levoutec`;
- `https://eiah.ia.br/levoutec/` retornava HTTP `404`.

A comparação entre o HTML servido pelo Worker antigo e
`apps/site/public/levoutec/index.html` identificou somente uma diferença:

`<meta name="robots" content="noindex,nofollow">`

A versão versionada em `main` foi adotada como canônica.

Após validar `/levoutec/` no `eiah-site`, a Route
`www.eiah.ia.br/levoutec/*` foi removida do Worker `eiah-levoutec`.

O Worker e sua versão foram preservados; somente a Route foi removida.

## Integridade do artefato Levoutec

SHA-256 canônico:

`e4a1f9d0fb13c0607b8fa740503ad43e9aed3efbb9e2e424f3e860c3e20f07bf`

Após o cutover, o mesmo hash foi obtido para:

- conteúdo servido em `https://eiah.ia.br/levoutec/`;
- conteúdo servido em `https://www.eiah.ia.br/levoutec/`;
- `apps/site/public/levoutec/index.html`.

Resultado:

`MATCH`

## Smoke pós-deploy

Resultados observados:

| Endpoint | Resultado |
| --- | --- |
| `https://eiah.ia.br/` | HTTP 200 |
| `https://www.eiah.ia.br/` | HTTP 200 |
| `https://eiah.ia.br/vertical-logistica/` | HTTP 200 |
| `https://eiah.ia.br/sessoes-governadas/` | HTTP 200 |
| `https://eiah.ia.br/levoutec/` | HTTP 200 |
| `https://www.eiah.ia.br/levoutec/` | HTTP 200 |
| `https://eiah.ia.br/EIAH_Geral.mp4` | HTTP 200 |
| `https://eiah.ia.br/oraculo-sc/` | HTTP 404 |

O `404` de `/oraculo-sc/` é esperado nesta release.

## Política de indexação das extensões

Foi confirmado em produção:

- `/levoutec/` → `noindex,nofollow`;
- `/vertical-logistica/` → `noindex,nofollow`;
- `/sessoes-governadas/` → `noindex,nofollow`.

## Autoridade final de roteamento

Após o cutover, `eiah-site` tornou-se a autoridade única para os Custom Domains:

- `eiah.ia.br`;
- `www.eiah.ia.br`.

As extensões versionadas sob `apps/site/public` passam a ser servidas pelo mesmo Worker.

## Rollback

Rollback preservado do `eiah-site`:

`619359f3-3b67-409c-a44c-7943a0892507`

Comando de contingência:

```bash
pnpm dlx wrangler rollback \
  619359f3-3b67-409c-a44c-7943a0892507 \
  --name eiah-site \
  --message "rollback landing v6.2"
```

O Worker `eiah-levoutec` permanece existente com a versão:

`e23ae759-d06b-4cfb-8070-80c2347f9dcf`

Nenhum rollback foi executado durante a promoção.

## Débitos operacionais fora do escopo

A publicação da landing não resolve nem mascara os seguintes débitos operacionais preexistentes:

- `P1ReconciliationRecurring`;
- evidência E2E HIGH vencida;
- backup/restore drill vencido;
- runbook drill vencido;
- ausência dos secrets de staging necessários ao workflow E2E HIGH.

Esses itens permanecem em fluxo operacional separado.

## Resultado

`GO`

A landing institucional EIAH v6.2 foi promovida, validada em produção e reconciliada com o artefato versionado em `main`, com rollback preservado e sem coexistência final de duas autoridades sobre `/levoutec/`.
