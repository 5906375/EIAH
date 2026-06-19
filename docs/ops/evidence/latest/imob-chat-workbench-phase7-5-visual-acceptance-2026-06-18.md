# IMOB Chat Workbench — Fase 7.5 Visual Acceptance

Data: 2026-06-18  
Status da frente: PILOTO CONTROLADO  
Escopo: aceite visual final do Workbench IMOB contra o mock de referência, com ajustes cosméticos render-only

## Objetivo

Registrar o aceite visual final do shell IMOB após a rodada de polimento da Fase 7.5, confirmando que a interface está suficientemente próxima do mock de referência para operação em `PILOTO CONTROLADO`.

Escopo efetivamente validado:

- shell visual em 3 colunas preservado;
- sidebar IMOB visualmente mais coesa com o header e o painel direito;
- chat central preservado;
- quick actions mantidas próximas ao input;
- painel direito mantido em modo render-only;
- CTAs e condições de renderização preservados;
- nenhum dado do mock promovido a fonte real;
- ausência de PII na renderização observada.

## Limitação operacional vigente

O host continua sem browser/headless browser instalado nesta data.

Status da limitação:

- já documentada na Fase 7.4.1;
- permanece válida nesta rodada;
- esta evidência usa renderização sanitizada nova dos componentes reais.

## Ajustes cosméticos aplicados

Arquivos revisados:

- `apps/web/src/features/imob/ImobWorkbenchShell.tsx`
- `apps/web/src/features/imob/ImobWorkbenchContextPanel.tsx`
- `apps/web/src/pages/app/imob/chat.tsx`

Ajustes realizados:

- barra superior do shell com gradiente, badge auxiliar `UI shell` e hierarquia mais próxima do mock;
- moldura principal com contraste e profundidade mais consistentes entre sidebar, centro e painel direito;
- header do painel contextual com tom visual alinhado ao shell;
- seção `Referências seguras` com destaque cromático discreto e chips mais legíveis;
- seção `Navegação` com fundo mais consistente com o painel;
- bloco de quick actions com tratamento visual mais próximo do mock e microcopy mais explícita sobre ser render-only;
- header central e cards laterais com bordas/tons mais uniformes.

Nenhum ajuste desta fase alterou:

- contratos;
- payloads;
- regras de CTA;
- rotas;
- parâmetros;
- lógica de negócio.

## Validação por renderização sanitizada

Comando executado:

```bash
TSX_TSCONFIG_PATH=apps/web/tsconfig.json node --import tsx -e "..."
```

### Shell do Workbench

Trecho observado:

```html
<p>IMOB Conversation Workbench</p>
<p>Shell dedicado ao intake documental em piloto controlado.</p>
<span>UI shell</span>
<span>Piloto controlado</span>
<aside>Sidebar IMOB</aside>
<header>Header central</header>
<section>Chat central</section>
<div>Quick actions proximas ao input</div>
<section>Painel direito</section>
<span>Painel contextual IMOB</span>
```

Leitura:

- a hierarquia visual do topo ficou mais próxima do mock;
- o shell continua com separação clara entre navegação lateral, conversa central e contexto à direita;
- a experiência mobile preserva acesso ao painel contextual via toggle já existente.

### Painel contextual

Trecho observado:

```html
<p>Contexto IMOB</p>
<p>Resumo operacional do intake ativo no chat.</p>
<span>Piloto controlado</span>
<span>thread thread-intak…7890</span>
<a href="/app/imob/dashboard?caseId=case-1234567890&amp;threadId=thread-intake-1234567890">Abrir contexto no Command Center</a>
<a href="/app/imob/dashboard?tab=funil&amp;caseId=case-1234567890&amp;status=pending_confirmation">Abrir Funil deste caso</a>
<a href="/app/runs?domain=imob&amp;runId=run-1234567890">Abrir execução no RunArchive</a>
```

Leitura:

- o painel direito permanece render-only;
- o conteúdo continua payload-driven;
- CTAs existentes foram preservados;
- não há nova rota, novo parâmetro ou dado fictício introduzido.

## Verificação de integridade visual e de dados

Confirmações desta rodada:

- o mock continuou sendo apenas referência visual;
- contagens da sidebar seguem vindas de estado real do chat;
- quick actions seguem reutilizando ações já existentes;
- referências continuam mascaradas;
- não apareceu CPF, e-mail, nome real, matrícula real ou documento sintético como dado operacional.

## Testes focados

Comando:

```bash
TSX_TSCONFIG_PATH=apps/web/tsconfig.json node --import tsx --test \
  apps/web/src/features/imob/imobWorkbenchContext.test.ts \
  apps/web/src/features/imob/imobWorkbenchContextPanel.test.tsx \
  apps/web/src/features/imob/imobContractIntakeDraftCard.test.tsx \
  apps/web/src/features/imob/imobContractIntakeResultCard.test.tsx \
  apps/web/src/features/imob/imobContractIntakeApiClient.test.ts
```

Resultado observado:

- `5/5` arquivos de teste passaram;
- cards de intake preservados;
- API client de export preservado;
- shell/painel preservados;
- ausência de PII preservada.

## Gate documental

Comando esperado após indexação:

```bash
pnpm check:evidence-index
```

## Aceite desta fase

Conclusão registrada:

- o visual do Workbench IMOB está suficientemente próximo do mock para `PILOTO CONTROLADO`;
- a rodada exigiu apenas ajustes cosméticos render-only;
- funcionalidades existentes foram preservadas;
- nenhum bloqueio arquitetural ou de segurança foi relaxado.

## Invariantes preservadas

- `ChatAgentLauncher` não foi alterado
- `worker` não foi alterado
- `backend export` não foi alterado
- endpoints de `upload/confirm/export` não foram alterados
- nenhuma rota de Dossiê foi criada
- nenhum destino/parâmetro foi inventado
- nenhum `stage/status/journeyType` novo foi criado
- nenhum dado do mock foi hardcoded como dado real
- PII não aparece
- status permanece `PILOTO CONTROLADO`
