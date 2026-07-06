# White-Label Runtime Gap (F-10 / P4)

## Objetivo

Formalizar, de modo conservador, o que existe hoje de branding, tenancy e billing na EIAH e o que ainda falta para declarar um white-label runtime governado.

## Estado Atual

No estado inspecionado em `2026-07-02`, o repositório evidencia capacidades parciais que ajudam o tema, mas nao fecham o runtime white-label:

- isolamento de `tenantId` e `workspaceId` no backend;
- gating fail-closed por entitlement para superficies como IMOB;
- branding de sessao consumido pela web;
- contratos e fluxos de billing que aceitam `branding` em `PlanSpec`;
- documentacao de stack de dominio e de politica operacional por tenant/workspace.

Conclusao conservadora:

- existe base multi-tenant/workspace real;
- existe apresentacao de branding por sessao;
- existe vocabulario de white-label em billing/produto;
- nao existe runtime white-label governado e verificavel de ponta a ponta.

## O Que Existe Hoje

### 1. Isolamento tenant/workspace

- `apps/api/src/middlewares/enforceTenant.ts` resolve token, injeta `tenantId` e `workspaceId`, cria prisma scoped e falha fechado sem bearer/token valido.
- `docs/operations/eiah-access-matrix.md` define separacao formal por tenant/workspace e reforca que o enforcement real deve permanecer no backend.

### 2. Branding de sessao

- `apps/api/src/routes/session.ts` retorna `branding.brandName`, `branding.logoUrl`, `branding.primaryColor` e `branding.workspaceLabel`.
- `apps/web/src/state/sessionStore.ts` persiste esses campos no estado/local storage.
- `apps/web/src/App.tsx` consome o branding para nome, logo e cor primaria da shell.
- `apps/web/src/pages/app/marketplace/imob.tsx` explicita esse consumo como `White-label ativo: {brandName} • {workspaceLabel}`.

Leitura correta desse estado:

- isso e branding de sessao derivado de tenant/workspace;
- isso nao prova resolucao runtime por parceiro nem governanca white-label completa.

### 3. Entitlement fail-closed

- `apps/api/src/services/imob/imobAccessGate.ts` aplica gate fail-closed com `tenantId`, `workspaceId`, `reasonCode`, `traceId` e CTA governado.
- `apps/api/src/services/experienceResolver.ts` resolve experiencia por papel e `activeDomain`, mas nao por parceiro.

### 4. Billing e contratos relacionados

- `packages/core/src/actions/billing.ts` registra `billing.create_white_label_plan`.
- `packages/contracts/src/types.ts` define `PlanBrandingSchema` com `brand_name`, `logo_url`, `primary_color` e `email_from`.
- `apps/web/src/pages/self-service/fin-nexus.tsx` monta `PlanSpec.branding` para criacao/simulacao de plano.
- `docs/operations/eiah-billing-operational-policy.md` formaliza custo e governanca por tenant/workspace.

Leitura correta desse estado:

- existe white-label billing vocabulary e contrato de branding para plano;
- isso nao equivale a runtime white-label governado por parceiro.

### 5. Dominio e stack

- `docs/adr/ADR-001-domain-runtime-stack.md` evidencia a stack oficial `Cloudflare + Vercel + Render`.
- nao foi encontrada prova de partner routing ou domain routing por parceiro dentro do runtime aplicacional.

## O Que Nao Existe Hoje

Nao foram encontrados artefatos suficientes para declarar fechado qualquer dos itens abaixo:

- `partnerId` ou identificador equivalente resolvido em runtime;
- mapeamento verificavel `host/domain -> partner -> tenant/workspace`;
- partner routing ou domain routing com check de nao-regressao;
- entitlement fail-closed especifico por parceiro;
- segregacao de billing/accounting por parceiro;
- politica de masking/branding controlada por escopo de parceiro;
- trilha auditavel especifica para decisoes de branding/routing white-label;
- teste ou gate de CI declarando compatibilidade/runtime white-label.

## Evidencia Real vs Proposta

### Evidenciado hoje

- tenancy/workspace scoping;
- branding de sessao;
- IMOB entitlement fail-closed;
- billing spec com campos de branding;
- documentacao operacional de dominio e billing.

### Parcial

- experiencia visual tenant-aware com copy de "white-label ativo";
- flows de billing que aceitam branding no plano;
- base de isolamento que pode sustentar white-label no futuro.

### Proposta

- runtime white-label completo, governado e auditavel;
- roteamento por parceiro/dominio;
- segregacao economica por parceiro;
- CI de nao-regressao especifico para white-label runtime.

## Requisitos Minimos Para Declarar White-Label Runtime Governado

O gap F-10/P4 so pode ser fechado quando houver, no minimo:

1. `partnerId` ou equivalente resolvido em runtime.
2. domain routing ou partner routing verificavel.
3. isolamento tenant/workspace preservado e testado sob contexto de parceiro.
4. entitlement fail-closed por parceiro/produto/superficie.
5. billing/accounting segregado por parceiro.
6. masking/branding controlado por escopo.
7. trilha auditavel, receipt ou ledger quando aplicavel.
8. testes/checks de nao-regressao.
9. evidencia indexavel apontando para arquivos reais.

## Definition of Done Futuro

Para fechar F-10/P4, o repositorio precisara demonstrar ao menos:

- contrato runtime do parceiro publicado;
- resolucao de parceiro a partir de host, dominio, claim ou contexto equivalente;
- endpoint/runtime de branding por parceiro com fallback governado;
- enforcement fail-closed para mismatch de parceiro/tenant/workspace;
- segregacao financeira e contabil por parceiro;
- cobertura de testes para caminhos valido, ausente, mismatch e stale config;
- gate de CI para drift entre matriz/documentacao e artefatos reais;
- evidencias operacionais indexadas.

## Gates Necessarios

Quando o trabalho de runtime existir de fato, os gates minimos esperados sao:

- check de existencia e consistencia da matriz/contrato white-label;
- teste de resolucao `domain -> partner -> tenant/workspace`;
- teste fail-closed para parceiro ausente ou mismatch;
- teste de segregacao de billing/accounting por parceiro;
- check de integridade documental/evidence index.

## Riscos Atuais

- o termo "white-label" aparece em UI e billing antes de existir runtime governado equivalente;
- branding de sessao pode ser interpretado incorretamente como capacidade white-label completa;
- ausencia de `partnerId` em runtime impede declarar segregacao comercial/auditavel por parceiro;
- dominio oficial evidenciado nao prova roteamento multi-parceiro.

## Status

- documentacao do gap: `evidenciado`
- capacidades runtime relacionadas, mas incompletas: `parcial`
- white-label runtime governado completo: `proposta`

