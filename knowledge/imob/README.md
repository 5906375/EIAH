# IMOB Knowledge Base v1

## Objetivo

Esta pasta define a fundacao documental governada da `IMOB Knowledge Base v1`.

Escopo desta primeira versao:

- manifesto versionado;
- schemas locais;
- entries seed pequenas e conservadoras;
- validacao por check deterministico;
- nenhuma integracao runtime automatica.

## Regras obrigatorias

- esta KB e `data/schema/check only`;
- nenhum item daqui pode ser consumido automaticamente pelo chat nesta etapa;
- integracao futura deve acontecer pelo `engine`, nunca diretamente pelo `ChatAgentLauncher`;
- todo item deve declarar `source`, `lastUpdated`, `riskLevel`, `requiresHumanReview`, `allowedScopes` e `disallowedUses`;
- itens sobre negociacao, contrato, preco, avaliacao, documentacao sensivel ou decisao sensivel exigem revisao humana;
- nenhum item desta base autoriza decisao automatica de preco, contrato, aprovacao ou recomendacao juridica final.

## Estrutura

```text
knowledge/imob/
  README.md
  manifest.v1.json
  schema/
    imob-knowledge-entry.v1.schema.json
    imob-knowledge-manifest.v1.schema.json
  categories/
    playbooks/
    checklists/
    templates/
    policies/
    glossary/
```

## Categorias iniciais

- `playbooks`
- `checklists`
- `templates`
- `policies`
- `glossary`

## Anti-escopo desta versao

- sem busca vetorial;
- sem indexacao runtime;
- sem ingestao automatica;
- sem alteracao do `engine`;
- sem alteracao do `ChatAgentLauncher`;
- sem UX nova;
- sem billing, Redis, Agent Protocol ou white-label runtime.

