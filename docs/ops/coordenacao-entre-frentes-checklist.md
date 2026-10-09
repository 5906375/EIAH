# Checklist — coordenação entre frentes (antes de alterar)

Procedimento curto para pessoas e assistentes de coding que trabalham no repositório ao mesmo tempo. O objetivo é
evitar retrabalho: consultar o que as outras frentes estão fazendo **antes** de editar e deixar a consulta registrada no PR.

> Este documento **não cria regras novas** e não substitui nenhum arquivo normativo. Ele apenas organiza a consulta.
> Em caso de conflito prevalece a ordem do `CLAUDE.md`: roadmap, `AGENTS.md`, `docs/architecture/agent-chat-runtime.md`,
> `docs/EVIDENCE_INDEX.md` e `IA_EIAH.md`. Não é evidência de execução e não entra no Evidence Index.

## 0. O que continua valendo (não repetir aqui)

| Assunto | Onde está |
| --- | --- |
| Leitura obrigatória antes de editar | `IA_EIAH.md` §2 |
| Sequência para mudanças no chat; nada de lógica nova no `ChatAgentLauncher` | `IA_EIAH.md` §7 |
| Frentes do IMOB e seus checklists | `IA_EIAH.md` §9 |
| Evidence Index só com evidência real | `IA_EIAH.md` §13 e §17 |
| Formato da resposta final e critério de status | `IA_EIAH.md` §16 e §17 |

## 1. Consulta antes de editar (somente leitura)

Faça na ordem. Nada abaixo altera o repositório.

1. **Atualizar a referência:** `git fetch origin` e anotar o commit da `main` consultado (`git rev-parse --short origin/main`).
2. **O que entrou recentemente:** `git log --format='%h %ad %an | %s' --date=short origin/main -15`.
3. **Quem mais está trabalhando agora:**
   - PRs abertos: `gh pr list --state open --limit 30` (ou a aba *Pull requests*);
   - branches com atividade recente: `git branch -r --sort=-committerdate | head -20`.
4. **Os arquivos que vou tocar mudaram há pouco?**
   `git log --oneline --since=14.days origin/main -- <caminho>` para cada pasta ou arquivo planejado.
5. **Sobreposição com a minha base:** `git diff --name-only <minha-base>..origin/main` e cruzar com a lista de arquivos que pretendo alterar.
6. **Conflito:** `git merge-tree --write-tree origin/main HEAD` (git 2.38 ou superior). Saída com `CONFLICT` significa que é preciso combinar antes.
7. **O que já existe continua ligado?** Se a mudança é perto de algo entregue antes, conferir que as ligações
   (rotas montadas, funções chamadas, imports) ainda estão na `main`, com `git grep -n <nome> origin/main -- <pasta>`.
8. **Já existe algo parecido?** Procurar contratos, serviços e documentos com o mesmo assunto antes de criar outro.

## 2. Zonas

Mapa observado em **2026-10-09**, a partir do histórico do git. Serve de orientação, não de dono oficial.

| Zona | Exemplos | Regra |
| --- | --- | --- |
| **Isolada** | pasta de uma extensão ou documento novo; `apps/site/public/<extensao>/` | Pode seguir, desde que a consulta da seção 1 não mostre sobreposição. |
| **Compartilhada** | `ChatAgentLauncher.tsx`, `chatLauncherEngine.ts`, `verticalActivationEngine.ts`, `verticalHandoffEngine.ts`, `services/chat/verticalRegistryComposition.ts`, `pages/app/imob/chat.tsx`, `pages/app/marketplace/imob.tsx`, `App.tsx`, `pages/access.tsx`; e `routes/session.ts` (1 commit recente, do #495) | Cada arquivo da lista, exceto o `session.ts`, teve de 3 a 9 commits em 30 dias, em PRs diferentes (seção 6). Combinar antes (seção 3). |
| **Infra e manifestos** | `package.json`, `scripts/unit-tests-manifest.txt`, `pnpm-lock.yaml`, `.github/workflows/ci.yml`, `Dockerfile.prod`, `tsup.config.ts`, `wrangler.jsonc` | Mudanças pequenas e rebase frequente; conferir o diff da `main` logo antes de abrir o PR. |
| **Governança** | `CLAUDE.md`, `AGENTS.md`, `IA_EIAH.md`, `docs/EVIDENCE_INDEX.md`, ADRs, ruleset | Não alterar sem decisão explícita do administrador único (ADR-008). Em dúvida, parar e perguntar. |
| **Landing** | `apps/site/public/index.html` | Alterar só por pedido explícito. As extensões não dependem dela. |

## 3. Decisão: seguir, combinar ou parar

| Resultado da consulta | Ação |
| --- | --- |
| Só zona isolada, sem conflito e sem mudanças recentes nos mesmos arquivos | **Seguir.** |
| Toca zona compartilhada ou de infra com mudança de outra frente nos últimos 14 dias | **Combinar antes:** comentar no PR ou issue da outra frente e esperar a resposta. Se não houver como combinar, reduzir o escopo para a zona isolada. |
| Toca governança | **Parar** e pedir decisão. |
| Já existe PR aberto com o mesmo objetivo | **Não duplicar:** contribuir nele ou combinar a divisão. |

## 4. Ao trabalhar

- **Um assunto por PR.** Não misturar site, produto e governança no mesmo PR. Documento e código de frentes diferentes vão em PRs diferentes.
- **Branch própria.** Não empurrar para a branch de outra pessoa nem reescrever o histórico dela; usar *merge*, não *rebase* ou *force push*, em branch alheia.
- **Sem atalhos de CI:** não pular, desativar ou isolar testes para ficar verde; não criar commit vazio nem fechar e reabrir o PR para reexecutar.
- **Falha de CI que já ocorre em outros PRs** (por exemplo, evidência semanal vencida): confirmar na `main`, comentar uma vez no PR e não corrigir dentro de um PR que não é dela.
- **Validar antes de empurrar:** testes da área, tipos e, se houver documentação, `pnpm check:docs-link-integrity`.

## 5. Bloco para a descrição do PR

Copiar e preencher. Deixa as outras frentes enxergarem o que foi consultado.

```markdown
## Consulta de coordenação
- `main` consultada: `<commit>` em `<data>`
- PRs abertos que tocam os mesmos arquivos: nenhum | #<n> (<como foi combinado>)
- Simulação de merge com a `main`: limpa | conflito em <arquivos> (<como foi resolvido>)
- Zonas tocadas: isolada | compartilhada (<arquivos>) | infra | governança
- O que deliberadamente **não** foi alterado: <lista curta>
```

## 6. Quadro das frentes (registrado em 2026-10-09)

Fotografia do que se via no GitHub nesta data. **Se tiver mais de 14 dias, refazer a consulta da seção 1 em vez de confiar nesta tabela.**

| Assunto | PRs | Observação |
| --- | --- | --- |
| Liberação de verticais pela EIAH (ADR-011), billing e acesso pelo front door | #480 a #486 | Mesclados. Código em `verticalAccessApproval`, `frontDoorBilling`, `frontDoorAccess` e nos engines do front door. |
| Contrato de acesso a verticais e diagnóstico *shadow* do IMOB | #495 | Mesclado. Função pura `verticalAccessResolver`, só observação; o uso da ADR-011 segue em `resolveVerticalUsage`. |
| Continuidade da conversa do IMOB no front door e sincronização da sessão | #496 | Mesclado. Mexe em `ChatAgentLauncher`, `chat.tsx` e `sessionContextSync`. |
| Governança fail-closed e evidência de staging HIGH | #494 e commits anteriores | Mesclado. |
| Build e runtime de produção; adaptador S3 | #488, #490 a #493 | Mesclados. |
| Extensões do site (`/revisores/`, `/amanha-legal/proposta/`, `/ia-na-pratica-juridica/`) e Worker da votação | #487 | Aberto. Só `apps/site/`. |
| Renovação semanal da evidência do APE | #489 | Aberto (PR automático). |
| Frentes antigas, em rascunho | #424, #434, #435, #441, #442, #446 | Sem atividade recente; confirmar antes de reaproveitar. |

## 7. Manutenção deste documento

Mudanças neste arquivo seguem o mesmo procedimento: uma consulta da seção 1 e um PR próprio. A seção 6 é a única que
envelhece; atualize a data ao revisar ou apague as linhas que já não valem.
