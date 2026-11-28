# ADR-002 — Banco de dados: Postgres self-managed sobre Neon gerenciado

| Campo | Valor |
| --- | --- |
| Versão | 1.1 |
| Data | 2026-07-25 |
| Revisão | 1.1 — adiciona §4 Estimativa de custo (classificação `estimativa`) |
| Status normativo | `Proposta` — fase `shadow` (proposta conceitual) |
| Trilha comercial | N/A — artefato interno de infraestrutura de plataforma (não é deliverable cliente da Seção 8.1) |
| Depende de | `docs/adr/ADR-001-domain-runtime-stack.md`, `PARECER_TECNICO_DOMAIN_DNS_EIAH_v2_pos_F2_25.md` |
| Substitui | Modelo Neon Preview Branch por PR (reclassificado como não adotado) |
| Driver declarado | Custo + recusa de banco administrado por terceiro |

> **Disclaimer de status.** Este ADR está em fase `shadow`. Nenhum comando, endpoint ou nome de workflow abaixo é contrato de API vigente — todos são **ilustrativos**, para servir de checklist de processo. Promoção de qualquer item para `Implementado` exige evidência de execução real indexada em `docs/EVIDENCE_INDEX.md`. Os valores da §4 são `estimativa` com premissas explícitas — não são fato.

---

## 1. Contexto

O fluxo atual de PR/CI usa Neon Preview Branch (`PR → Neon API → preview/pr-NNN → migrations/tests/schema diff`). Esse modelo depende de a Neon gerenciar a infraestrutura do banco, criar branches e controlar compute — inclusive o comportamento de `suspend interval` que produz o erro `412` observado em CI.

A decisão de origem foi explicitada pelo responsável: **sair da Neon por custo e por não aceitar banco administrado por terceiro.**

Consequência imediata desse driver: as opções gerenciadas alternativas (AWS RDS, Aurora, Cloud SQL) **não atendem** o segundo motivo — todas são administradas por terceiro. Portanto ficam descartadas por critério, não por preferência.

## 2. Decisão

1. **Desacoplar duas decisões que estavam coladas:**
   - **Decisão A (banco no CI/PR):** substituir Neon Preview Branch por Postgres efêmero em container no GitHub Actions. Isto é correção do padrão de CI, não "migração de provider". Aplica-se agora.
   - **Decisão B (banco de staging/produção):** Postgres **self-hosted operado internamente**, coerente com o driver declarado.
2. **Escalonar o investimento de confiabilidade** junto com os gates de rollout, em vez de pagar tudo antecipadamente (anti-padrão de custo) ou tratá-lo como checkbox (anti-padrão de governança).
3. **Manter produção bloqueada** pela cadeia do parecer: F2.24 → charter → PR F0.58 → activation gate F0.43 → evidência indexada.

## 3. Opções consideradas

| Opção | Atende "custo"? | Atende "não-terceiro"? | Decisão |
| --- | --- | --- | --- |
| **A. Manter Neon** (só em prod, CI efêmero) | Parcial — reduz custo de CI, mantém fatura de prod | Não | Descartada — falha no driver principal |
| **B. Gerenciado não-Neon** (RDS/Aurora/Cloud SQL) | Depende do volume | **Não** — administrado por terceiro | Descartada por critério |
| **C. Postgres self-hosted operado internamente** | Sim no estágio atual; economia encolhe conforme sobe exigência de confiabilidade | **Sim** | **Adotada** |

Nota de honestidade sobre a Opção C: o ganho de custo é real **agora** (volume baixo, pré-produção). Ele não é permanente — conforme a exigência de confiabilidade sobe (HA, PITR, restore drills), parte da economia é reinvestida em operação. A decisão de custo está sendo tomada de olhos abertos: troca-se fatura previsível por tempo de operação + risco de perda de dado gerenciável por disciplina.

## 4. Estimativa de custo (classificação: `estimativa`)

> **Aviso de classificação.** Todos os números desta seção são `estimativa`, não observação. Dependem do `assumptionRegister` abaixo. A variável de maior impacto — staging **always-on** vs **scale-to-zero** — **não foi fixada** pelo responsável; por isso ambos os cenários estão modelados. Recalcular ao confirmar.

### 4.1 assumptionRegister

| Premissa | Valor assumido | Estado |
| --- | --- | --- |
| Estágio | `shadow`/staging pré-produção, volume baixo, sem tenant real | assumido |
| Storage | **5 GB** (ordem de grandeza pré-produção) | **a confirmar** — parametrizado |
| Padrão de uso | **não fixado** → dois cenários (dorme / always-on) | **a confirmar** |
| Tamanho de compute | baseline **1 CU** (1 vCPU / 4 GB) | assumido |
| Compute ativo (cenário dorme) | ~60 CU-horas/mês (~2 h/dia de CI + smoke + navegação) | assumido |
| Preços Neon | Launch $0,106/CU-hora; storage $0,35/GB-mês; branch extra ~$1,50/branch-mês | verificado em pricing público 2026-07-25 |
| VPS (banco próprio) | 2 vCPU / 4 GB → faixa representativa $6–24/mês | assumido |
| Backup (banco próprio) | object storage/backup box ~$2–5/mês | assumido |
| Tempo de operação | não monetizado na fatura; registrado como custo em horas, fora do $ | premissa |
| Câmbio e impostos | não incluídos | fora de escopo |

### 4.2 Cálculo por cenário

**Cenário A — Neon Launch, scale-to-zero (staging dorme)**
- Compute: 60 CU-h × $0,106 ≈ $6,4
- Storage: 5 GB × $0,35 = $1,75
- Branches extras (~2): ~$3,0 (opcional)
- **Total ≈ $8–11/mês**

**Cenário B — Neon Launch, always-on (staging não dorme)**
- Compute: 1 CU × 730 h × $0,106 ≈ $77,4
- Storage: $1,75
- **Total ≈ $79/mês**

**Cenário C — Postgres próprio (self-hosted), staging**
- VPS 2 vCPU / 4 GB: ~$12/mês (ponto médio da faixa)
- Backup: ~$3/mês
- **Total direto ≈ $15/mês fixo**, always-on incluído (VPS não cobra por atividade)
- Ops: +N horas/mês (setup inicial maior; recorrente: patching, monitoramento, restore drill) — **não monetizado**

### 4.3 Leitura

| Comparação | Resultado |
| --- | --- |
| Se staging **dorme** | Neon ($8–11) ≈ próprio ($15). Empate técnico; Neon levemente menor, mas o próprio entrega always-on pelo mesmo dinheiro |
| Se staging **always-on** | Neon (~$79) ≫ próprio (~$15). Próprio ganha claramente — **este é o ponto de crossover** |

Conclusão da estimativa: **a variável decisiva é always-on vs dorme.** No estágio atual, se o staging puder dormir, custo não diferencia as opções — o que sustenta a Decisão B continua sendo o driver "não-terceiro", não o dólar. O ganho de custo do banco próprio só se materializa no cenário always-on (produção), reforçando o faseamento da §6.

### 4.4 Rastreabilidade (§8.4)

Se algum destes números virar load-bearing (entrar em proposta comercial ou decisão de orçamento), congelar snapshot das páginas de pricing citadas com `evidenceRef{ artifactId, location, hash }` antes de referenciá-lo — preço de terceiro muda e a estimativa perde rastreabilidade após mutação da fonte. Enquanto `shadow`, permanece `estimativa` com este `assumptionRegister`.

## 5. Consequências

**O que se ganha:** controle total sobre residência do dado, acesso, rede, upgrade, migrations e custo direto; independência de `NEON_API_KEY`, `NEON_PROJECT_ID`, `NEON_PREVIEW_PARENT_BRANCH` e dos workflows de preview.

**O que se assume:** instalação, patching, backup, restore, firewall, TLS de rede, monitoramento, gestão de credenciais e — quando produção existir — alta disponibilidade. Essas responsabilidades passam a ser gates do projeto, não tarefas de bastidor.

## 6. Faseamento e gates

### Fase A — CI/PR sem Neon (aplicar agora, baixo risco)

Container `postgres:16` efêmero por job. Sem branch de banco: banco descartável por execução.

```text
# ILUSTRATIVO — fase shadow
Pull Request
  → GitHub Actions
  → service container postgres:16
  → DATABASE_URL temporária (nunca staging/prod)
  → migrations → tests → schema diff
  → artifact sanitizado
  → check bloqueante (fail-closed em migration/test/schema)
  → container destruído
```

Workflows Neon marcados `deprecated`/experimental — **não** removidos ainda, e retirados do conjunto de required checks.

### Fase B — Staging self-hosted (após pré-condições da Seção 7)

Single-node é aceitável em `shadow`/staging pré-produção; HA não é exigida ainda. O gate de confiabilidade sobe por etapa:

| Etapa de rollout | Confiabilidade mínima exigida |
| --- | --- |
| dev + CI | container efêmero; nenhum dado persistente sensível |
| staging (`shadow`/`pilot`) | volume persistente + backup diário + **restore testado ao menos uma vez** |
| produção (`small`+) | PITR + HA + restore drill periódico + monitoramento — **gate bloqueante** |

### Gate bloqueante de produção

Nenhum dado de tenant real entra em produção sem: PITR configurado, restore testado com evidência datada, HA definida e `DATABASE_URL_PRODUCTION` isolada de qualquer caminho de CI. Este é o ponto onde a economia de custo é parcialmente reinvestida — e não é negociável, porque o dado é a camada que sustenta o isolamento multi-tenant e o compromisso LGPD do projeto.

## 7. Pré-condições e sequenciamento (bloqueiam a Fase B)

1. **Fechar o incidente `tenantGuard` (P0, `pass 1 / fail 3`).** Isolamento multi-tenant é enforçado na camada de dado. Provisionar staging self-hosted com o guard inverificado é sequência perigosa: um furo de isolamento num store novo é pior que num maduro. `tenantGuard` verde é pré-condição de provisionamento.
2. **Resolver o drift de stack de compute (P0 próprio).** `ADR-001` declara a stack oficial como **Cloudflare + Vercel + Render**; a conversa de origem assume **AWS ALB/ACM/ECS/Fargate**. Divergência docs/contrato/runtime é incidente P0 (Seção 6 das instruções). Este ADR **não** decide compute e **não** deve embutir AWS — a questão AWS↔Render é resolvida em emenda ao ADR-001, separada do PR de banco.

## 8. Riscos e mitigação

| Risco | Prioridade | Mitigação |
| --- | --- | --- |
| CI tocar banco real | P0 | Service container; secrets de staging/prod ausentes do job |
| `DATABASE_URL` vazar em log/artifact | P0 | Masking + grep de secret + artifacts sanitizados |
| Perda de dado (self-hosted) | P0 na prod | Backup diário + PITR + restore testado como gate |
| Perder schema gate ao sair da Neon | P1 | Reimplementar schema diff sobre o Postgres container |
| Economia de custo interpretada como permanente | P1 | §3 + §4: economia só se materializa em always-on; encolhe com exigência de confiabilidade |
| Produção confundida com staging | P0 | `PRODUCTION_NOT_AUTHORIZED=true` mantido; ambientes segregados |
| Drift docs/runtime | P0 | `check:evidence-index` + `check:docs-link-integrity` |

## 9. Evidências requeridas e DoD

**DoD Fase A (CI):** workflow `postgres:16` efêmero existe; migrations/tests/schema diff rodam; fail-closed em falha; artifact sanitizado gerado; nenhum secret em log; `check:evidence-index` e `check:docs-link-integrity` passam; masking passa; workflows Neon fora dos required checks.

**DoD Fase B (staging):** Postgres staging provisionado; firewall/rede definidos; `DATABASE_URL_STAGING` como secret; backup diário documentado; **restore testado com evidência datada**; `/health` retorna `database=connected`; smoke tests passam; evidência indexada.

**DoD produção:** cadeia do parecer intacta — F2.24 approve-to-open-next-phase-only → charter → PR F0.58 → activation gate F0.43 → evidência indexada → rollback de staging testado. Go-live sem essa cadeia viola o freeze.

## 10. Plano de PRs (pequenos, não um só)

| PR | Título (ilustrativo) | Entrega | Não tocar |
| --- | --- | --- | --- |
| 1 | `docs(db): adopt self-managed Postgres over Neon` | este ADR + evidência local do plano + `EVIDENCE_INDEX.md` | workflows, runtime, tenantGuard, migrations, secrets |
| 2 | `feat(db-ci): add ephemeral Postgres preview CI` | `.github/workflows/postgres-preview-ci.yml` + artifact sanitizado | workflows Neon |
| 3 | `chore(neon): mark preview workflows deprecated` | remoção dos required checks + docs | histórico (não deletar) |
| 4 | `docs(db): self-managed Postgres staging runbook` | runbook backup/restore/firewall + template de evidência | produção |

## 11. Rollback da decisão

Se a operação self-hosted se mostrar inviável (indisponibilidade recorrente, custo de ops acima do previsto, restore não confiável), a reversão é: reativar Neon apenas como provider de produção mantendo o CI efêmero da Fase A, e reabrir a Decisão B com o custo de ops medido como novo dado. A Fase A não regride nesse cenário — ela é benéfica independentemente do provider de produção.

## 12. Estado de implementação (verificado em 2026-09-26)

Esta seção registra, com evidência real coletada nesta data, o que está de fato implementado, distinguindo teste local, mudança em CI e operação em produção — sem alterar o `Status normativo` do cabeçalho, que permanece `Proposta` (`shadow`) porque a Fase B/produção, parte central desta decisão, continua não implementada.

### 12.1 Fase A (CI/PR sem Neon) — confirmada em CI real

- Nenhum workflow sob `.github/workflows/*.yml` referencia Neon (`grep -rln "neon" .github/workflows/*.yml`, sem resultado). A ausência da palavra, isolada, não basta como prova; por isso segue a evidência funcional.
- `.github/workflows/db-preview-postgres.yml` implementa o padrão da Fase A: container de serviço `pgvector/pgvector:pg16` (variante com extensão vetorial sobre PG16 — não o tag literal `postgres:16` do texto ilustrativo da seção 6, mas mesma major version e mesmo padrão de container efêmero por job), executa `prisma generate`, `migrate:deploy`, `migrate status`, um teste de schema governado, um check de drift Prisma (`migrate diff`), grava evidência sanitizada (`db-preview-evidence.json`, com senha fixa `ci-only-password`, nunca `DATABASE_URL_STAGING`/`PRODUCTION`) e falha fechado (`Enforce database preview result` sai com código 1 se `status !== "success"`).
- O job `DbPreviewPostgresValidate` é required context no ruleset `main-protection-hard-gates` (confirmado ao vivo em 2026-09-26 — ver `ADR-007` §23 e `ADR-009` §2.1).
- `pnpm check:evidence-index` e `pnpm check:docs-link-integrity` passam hoje (exit 0, executados nesta sessão).
- **Conclusão:** Fase A está implementada e enforced em CI real, na extensão comprovada pelos pontos acima — não apenas pela ausência de "Neon" nos workflows.

### 12.2 Pré-condição `tenantGuard` (§7, item 1) — confirmada localmente; sem cobertura de CI

- Comando reproduzido nesta sessão: `node --import tsx --test packages/db/src/middleware/tenantGuard.test.ts` → `29/29` testes passando (era `pass 1 / fail 3` na época original deste ADR).
- Busca dirigida por cobertura em CI: `grep -rn "tenantGuard" .github/workflows/*.yml` e `grep -rn "tenantGuard" package.json packages/db/package.json` — zero ocorrências.
- Verificação de descoberta indireta: `packages/db/package.json` define `"test": "node --test --import tsx \"src/**/*.test.ts\""`, um glob que incluiria `tenantGuard.test.ts` automaticamente — mas nenhum workflow invoca esse script (`pnpm --filter @repo/db test` não aparece em nenhum `.github/workflows/*.yml`); o `"test"` da raiz roda só `@eiah/core`, não `@repo/db`.
- **Conclusão:** o guard está corrigido e verificado, mas exclusivamente por invocação manual — nenhum alvo de CI, direto ou por descoberta automática, o executa hoje.

### 12.3 Fase B / produção — continua não implementada

- Issue [`#456`](https://github.com/5906375/EIAH/issues/456) ("staging inexistente: `e2e-high-staging.yml` falha 15/15 execuções; `deploy.yml` é scaffold sem implementação real") confirmada `OPEN` ao vivo em 2026-09-26.
- Nenhuma evidência de Postgres self-hosted em staging/produção, backup diário, restore testado, PITR ou HA foi localizada nesta sessão.
- Da seção 7, item 1 (`tenantGuard`) está tecnicamente corrigido mas sem CI (§12.2); item 2 (drift de stack de compute AWS×Render, `ADR-001`) não foi reexaminado nesta rodada.
- **Conclusão:** Fase B/produção permanece não implementada, exatamente como nos critérios originais desta ADR.

---

**Status normativo desta revisão:** `Proposta` (`shadow`). Fontes: `PARECER_TECNICO_DOMAIN_DNS_EIAH_v2_pos_F2_25.md`, `ADR-001-domain-runtime-stack.md`, pricing público Neon (verificado 2026-07-25), contexto operacional das conversas sobre Neon/Postgres e driver declarado (custo + não-terceiro). Estado de implementação por fase verificado em 2026-09-26: ver seção 12 — Fase A implementada e enforced em CI; pré-condição `tenantGuard` corrigida só localmente; Fase B/produção não implementada.
