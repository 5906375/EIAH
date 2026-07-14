# F1.6k — Dedicated Playwright Runtime Base Image Selection

## Status

proposta/parcial

## Objetivo

Escolher a base runtime canônica para o runner dedicado do smoke mobile F1 após a F1.6j provar que `node:22-bookworm` consegue provisionar Chromium, mas ainda falha no launch por dependência nativa ausente (`libnspr4.so`).

## Fontes lidas

- `CODEX.md`
- `IA_EIAH.md`
- `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`
- `AGENTS.md`
- `docs/architecture/agent-chat-runtime.md`
- `docs/EVIDENCE_INDEX.md`
- `ops/evidence/latest/f1-06i-chromium-provisioning-strategy-2026-07-14.md`
- `ops/evidence/latest/f1-06j-controlled-chromium-provisioning-execution-2026-07-14.md`

## Inventario Docker local consultado

Comando:
```bash
docker image ls
```

Resultado relevante:
- `node:22-bookworm`
- `node:20-bookworm`
- nenhuma imagem Playwright oficial presente localmente
- nenhuma imagem dedicada de browser smoke presente localmente

## Evidencia tecnica herdada

| Etapa | Ambiente | Resultado | Implicacao para F1.6k |
| --- | --- | --- | --- |
| F1.6g | host local | `ENV_SANDBOX_BLOCKED` | host nao serve como baseline canônico |
| F1.6h | `eiah-web` | `CHROMIUM_BINARY_MISSING` | `eiah-web` nao deve virar runner de browser |
| F1.6j | runner dedicado `node:22-bookworm` | Chromium provisionado, mas launch falha por `libnspr4.so` ausente | `node:22-bookworm` puro nao e base suficiente |

## Opcoes comparadas

### 1. Imagem oficial Playwright compativel

Descricao:
- usar, em etapa futura aprovada, uma imagem oficial Playwright compativel com a versao do projeto (`playwrightVersion=1.61.1`) como base do runner dedicado.

Pros:
- maior chance de conter dependencias nativas do Chromium ja resolvidas;
- menor drift entre browser, sistema e Playwright;
- melhor isolamento em relacao ao `eiah-web`;
- melhor candidata futura para smoke manual repetivel;
- reduz necessidade de documentar lista propria de libs do sistema.

Contras:
- nao existe localmente hoje;
- exigiria `docker pull` ou outra forma de obtencao aprovada;
- ainda nao foi validada com o smoke deste repo.

Leitura conservadora:
- e a melhor candidata canônica;
- permanece `proposta` ate existir aprovacao para obtencao e prova real de execucao.

### 2. `node:22-bookworm` + dependencias nativas declaradas

Descricao:
- manter a base `node:22-bookworm` e complementar manualmente bibliotecas de sistema exigidas pelo Chromium.

Pros:
- reaproveita imagem local existente;
- preserva alinhamento de major Node com a baseline recente do repo;
- pode ser suficiente com lista correta de dependencias.

Contras:
- F1.6j ja provou que a imagem base pura e insuficiente;
- exigiria `apt-get`/instalacao de libs ou manutencao equivalente;
- aumenta drift operacional e custo de manutencao;
- cria uma superficie extra de documentacao/patching sem provar ainda completude das libs.

Leitura conservadora:
- viavel tecnicamente, mas nao canônico neste momento;
- deve ser tratada como fallback de engenharia, nao como primeira escolha.

### 3. Dockerfile dedicado futuro

Descricao:
- criar futuramente um Dockerfile do runner de smoke, com Node + Playwright + dependencias nativas declaradas.

Pros:
- maxima reprodutibilidade se aprovado;
- controla explicitamente versoes, libs e cache;
- bom candidato futuro para integracao controlada fora do `eiah-web`.

Contras:
- fora do escopo atual;
- exigiria `docker build`;
- introduz manutencao de imagem propria;
- aumenta superficie do repo antes de validar a escolha minima da base.

Leitura conservadora:
- opcao estrutural boa para depois;
- nao e o menor passo canônico hoje.

### 4. Manter bloqueado ate runner aprovado

Descricao:
- nao escolher base executavel ainda e manter o fluxo bloqueado.

Pros:
- zero mudanca operacional;
- risco minimo imediato.

Contras:
- nao resolve a decisao arquitetural;
- deixa a F1 sem baseline de browser runner recomendada;
- perde o aprendizado real acumulado em F1.6g/F1.6h/F1.6j.

Leitura conservadora:
- aceitavel apenas como estado operacional temporario;
- inferior a uma recomendacao documental clara.

## Decisao recomendada

Base runtime canônica recomendada para proxima validacao controlada:

**imagem oficial Playwright compativel com `playwright@1.61.1`, em runner dedicado e separado do `eiah-web`.**

Justificativa:
- F1.6j eliminou a hipotese de que bastaria `node:22-bookworm` + provisioning de browser;
- o bloqueio real restante agora esta nas dependencias nativas do SO, nao no script, nem na rota, nem no cache de browser;
- a imagem oficial Playwright reduz a superficie de drift exatamente nesse ponto;
- a opcao preserva a disciplina ja estabelecida em F1.6i/F1.6j: runner dedicado, repo read-only, sem contaminar o `eiah-web`, sem CI por enquanto.

## O que fica explicitamente nao decidido

- o tag exato da imagem oficial Playwright;
- qualquer `docker pull`;
- qualquer validacao executavel com imagem externa;
- qualquer promocao para CI;
- qualquer Dockerfile proprio do repo;
- qualquer instalacao manual de libs do Chromium em `node:22-bookworm`.

## Regra operacional derivada

Se houver aprovacao posterior para a proxima microfase:
- priorizar imagem oficial Playwright compativel;
- manter repo montado read-only;
- manter cache/browser isolado;
- manter `runnerImport="formal_dependency:playwright"` e `fallbackUsed=false`;
- nao reutilizar `eiah-web` como runner;
- nao promover para CI antes de prova verde manual real.

## Arquivos alterados

- `docs/EVIDENCE_INDEX.md`
- `ops/evidence/latest/f1-06k-dedicated-playwright-runtime-base-image-selection-2026-07-14.md`

## Prova de nao escopo

Confirmado:
- sem alteracao em `ChatAgentLauncher`
- sem alteracao em runtime
- sem alteracao em engine
- sem alteracao em `apps/**`
- sem alteracao em `packages/**`
- sem alteracao em workflows/CI
- sem alteracao em `release.yml`
- sem `apt-get`
- sem `playwright install-deps`
- sem `docker build`
- sem `docker push`
- sem `docker pull`
- sem `publish`
- sem `secrets`
- sem `tags/releases`
- sem avancar F2/F3

## Status final

proposta/parcial
