# EIAH Outputs Matrix v1

## 1. Definição de Saída do EIAH

No EIAH, "saída" é a superfície governada entregue ao usuário, operador ou auditor depois que um agente, vertical ou camada core resolve um contexto. Nem toda saída é prova auditável. Nem toda prova auditável é uma boa saída de produto.

Princípio canônico:

- agente define;
- engine executa;
- launcher renderiza.

Logo:

- `Conversational Output` nasce no contrato/runtime do agente;
- `Operational Output` nasce na resolução governada do caso/operação;
- `Audit Output` depende de `receipt`, `bundle`, `ledger` e/ou `verifyUrl`;
- dashboard não deve ser vendido como saída de chat;
- draft contratual não deve ser tratado como fechamento de negócio.

## 2. Tipos oficiais de saída

| Tipo | Definição curta | Observação canônica |
| --- | --- | --- |
| Conversational Output | resposta visível do chat com texto, card, CTA, quick reply ou form | depende do engine; launcher só renderiza |
| Operational Output | estado operacional do caso, próxima ação, checklist, bloqueio, surface de aprovação | pode existir sem prova final |
| Executive Output | resumo executivo para decisão humana | não substitui trilha auditável |
| Dashboard Output | visão REST/dashboard/workbench fora do chat | não confundir com KPI perguntável no chat |
| Document Output | draft, checklist, intake export, HTML/PDF/Word | pode ser parcial sem ledger |
| Legal Output | parecer, matriz de risco, referências legais | hoje vem de especialista/contexto |
| Marketing Output | campanha, timeline, copy, assets planejados | hoje vem de especialista/contexto |
| Financial Output | invoice, settlement, reconciliação, disputas | forte no Core Billing/Economy |
| Audit Output | receipt, bundle, verifyUrl, trilha de proof | precisa surface canônica |
| Export Output | artefato baixável ou imprimível | não implica prova forte por si só |
| Next Action Output | próxima ação canônica do caso | existe, mas ainda com risco de drift textual |
| Closing Output | pacote apresentável de fechamento do negócio | gap atual; não está fechado |

## 3. Regra: output operacional ≠ prova auditável

Uma saída operacional só pode ser promovida a "fechada" quando:

- resolve um caso real de uso com superfície consistente;
- não depende de heurística solta no frontend;
- carrega as evidências exigidas pela criticidade;
- possui testes e/ou evidência indexável compatíveis com o risco;
- não confunde draft, resumo bonito ou dashboard com recibo verificável.

Exemplos:

- `presentation.card` de `property.market_scan` é saída operacional e conversacional válida.
- `proof.verifyUrl` e `bundlePath` são saídas auditáveis.
- `Command Center` é `Dashboard Output`, não `Conversational Output`.
- draft de contrato de locação é `Document Output`; não é `Closing Output`.

## 4. Matriz consolidada de saídas

| Nome da saída | Tipo | Origem | Operação relacionada | Usuário-alvo | Conteúdo | Formato | receipt/bundle/ledger/verifyUrl | Status | Risco | Evidência existente | Evidência faltante | Menor patch seguro |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| IMOB cards/CTAs canônicos | Conversational Output | vertical IMOB + engine CRM | captação, cadastro, qualificação, proposta, visita | corretor/operador | texto, card, CTA, quick replies, form | payload chat | parcial; prova pode vir em `presentation.proof` | parcial avançado | drift entre surfaces legadas e canônicas | `imob-lead-continuity-p0-2026-05-23.md`, `imob-market-scan-batch-guard-2026-07-08.md`, `chatProof.test.ts` | validação end-to-end mais ampla por operação | continuar migração para `presentation` canônica e eliminar residual legado |
| Market Scan Card | Conversational Output | vertical IMOB | `property.market_scan` | corretor/comercial | CTA `Fazer varredura de mercado`, recomendação e próximos movimentos | card + CTA | pode carregar proof quando houver run | evidenciado | regressão de surface entre resolver e engine | `imob-market-scan-p0-no-id-leak-policy-judge.md`, `imob-market-scan-p1-source-data-quality-gate.md` | evidência consolidada com contract test completo | manter card canônico preservado no engine |
| NextAction canônica | Next Action Output | vertical IMOB + orquestrador | funil IMOB, lead, documentos, proposta, comissão | corretor/gestor | ação principal única, label, route/owner implícito | payload canônico + dashboard | não intrínseco | parcial avançado | parte do texto ainda vive em compat layers/hardcodes fora do resolver canônico | `imob-lead-continuity-p0-2026-05-23.md`, `imobNextActionResolver.ts` | prova consolidada de eliminação do drift | mover textos residuais para o resolver/contrato canônico |
| Command Center IMOB | Dashboard Output | vertical IMOB + REST | funil, bloqueios, custo, priorização | gestor/operador | KPIs, filas, heatmap, casos, comprovantes | dashboard web | receipt/bundle separados do dossiê | evidenciado | confundir dashboard com chat KPI | `realestate-command-center-smoke-2026-03-09.md`, `imob-pr-144-147-operational-history.md` | smoke recente pós-2026-07 | revalidar smoke sem mexer no chat |
| KPIs de funil/ranking/custo | Dashboard Output | vertical IMOB + REST | command center e superfícies operacionais | gestor | agregados de saúde operacional | REST + dashboard | sem guarantee de proof no chat | parcial avançado | ainda não perguntáveis no chat | `realestate-command-center-smoke-2026-03-09.md`, superfícies A1/A3/A8 | surface conversacional governada para consulta desses KPIs | expor consulta via engine, não pelo launcher |
| Checklist documental IMOB | Operational Output / Document Output | vertical IMOB + knowledge/intake | `documents.collect`, readiness contratual | corretor/documentação | pendências, checklist por fase, itens faltantes | card, checklist, knowledge entry | normalmente sem ledger final | parcial avançado | raso em alguns cenários; handoff legal não fecha sozinho | `imob-knowledge-engine-integration-2026-07-02.md`, `imob-document-checklist.e2e.test.ts`, `imobCaseContextBuilder.test.ts` | evidência mais profunda por fase de venda/compra | enriquecer checklist governado por fase/risco |
| Intake/anexo documental IMOB | Document Output / Operational Output | vertical IMOB | intake documental no chat | corretor/operacional | draft, máscara PII, classificação, export e atualização de caso | chat + HTML/PDF/Word | parcial; export existe, fechamento forte não | parcial avançado | escopo automático estreito; intake atual é centrado em locação | `docs/ops/evidence/latest/imob-chat-document-intake/phase-2-worker-e2e.md` e fases seguintes | prova de cobertura mais ampla além de locação | ampliar escopo por contrato suportado sem confundir com fechamento |
| Draft/preview de contrato IMOB | Document Output | serviço de contratos + intake IMOB | `contract.prepare` | corretor/jurídico de apoio | preview, hash, legal review básico, cláusulas | text/HTML/draft | sem closing receipt completo | parcial | risco de promover compra/venda automática sem base | `contractGenerator.ts`, `imob-contract-draft-service.test.ts` | evidência de fluxo assistido para compra/venda sem intake automático | manter locação como intake automático suportado; tratar compra/venda como expansão separada |
| Legal Review / J_360 | Legal Output / Executive Output | especialista `J_360` | revisão contratual, parecer, leitura de risco | jurídico/gestor | parecer estruturado, matriz de risco, sumário, referências | structured payload + HTML/PDF | pode ter recipe/report, não prova vertical autônoma | parcial avançado | promover especialista para vertical LEGAL autônoma | `j360-legal-interpreter.test.ts`, `j360LegalReportRenderer.ts` | evidência operacional de vertical LEGAL fim a fim | manter como especialista/contexto até baseline vertical real |
| Handoff IMOB → LEGAL | Operational Output | bridge/contexto IMOB | documentos, contrato, proposta | corretor + apoio jurídico | pack textual de handoff, blocker, boundary de ownership | payload textual | sem execução funcional ponta a ponta | parcial | handoff majoritariamente simbólico/textual | `imobSpecialistBridge.ts`, `imob-document-handoff.e2e.test.ts`, `imob-proposal-handoff.e2e.test.ts` | prova de runtime funcional com retorno estruturado do specialist | formalizar contrato de handoff funcional por agent runtime |
| MKT Campaign Report | Marketing Output / Executive Output | especialista `MKT` | campanha, calendário, anúncio/copy | marketing/founder/comercial | plano de campanha, timeline, channels, assets, copy guidance | structured payload + report | sem trilha de vertical autônoma | parcial avançado | confundir output de especialista com vertical MKT pronta | `run-worker-mkt-output.test.ts`, `mktCampaignInterpreter.ts` | evidência operacional de execução contínua em vertical própria | manter como especialista/output e endurecer bundle/export |
| Invoice / Settlement | Financial Output / Audit Output | Core Billing/Economy | cobrança, release, settlement, disputa | financeiro/ops | payment intent, invoice, settlement receipt, disputas, reconciliação | REST + JSON + ledger-linked outputs | forte presença de receipt/ledger/provider trail | evidenciado | matriz por ambiente/provider ainda precisa vigilância recorrente | `settlement-provider-e2e-2026-05-14.json`, `realestate-commission-settlement-e2e-2026-05-14.json`, `billing.reputation.disputes.contract.test.ts` | evidência narrativa consolidada cross-vertical | consolidar docs de consumo por operação |
| Operation Bundle por operação | Audit Output / Export Output | Core + verticais | runs críticos | auditor/ops | bundle de execução, receipt path e verify URL quando houver | bundle/receipt/export | existente, mas não uniforme por operação | parcial | declarar bundle completo sem prova por operação | `imob-artifact-capabilities-governance-2026-07-02.md`, `imob-chat-f4-audit-export-smoke-2026-06-11.json` | matriz por operação com prova de completude | padronizar bundle mínimo por operação crítica |
| Closing Output IMOB | Closing Output | deveria compor IMOB + Billing + Audit + Contract | fechamento de negócio | corretor/gestor/cliente interno | resumo apresentável do negócio, timeline, partes, comissão, recibos, ledger, verifyUrl | PDF/HTML/resumo final | ausente como pacote canônico completo | ausente/parcial | gap funcional N-08 | diagnóstico atual e superfícies parciais de contrato/settlement/proof | toda a prova do pacote de fechamento | definir contrato de closing bundle antes de implementar |
| Logistics Output | Conversational/Operational/Document | vertical Logística | não comprovada | n/a | n/a | n/a | n/a | proposta | vertical sem runtime real encontrado | roadmap/taxonomia pública | tudo | criar baseline mínimo antes de qualquer claim |

## 5. Saídas IMOB

### 5.1 Conversacionais e operacionais

- `cards/ctas`: existem e já passam por surface canônica no engine, mas ainda convivem com resíduos legados.
- `market_scan card`: evidenciado e governado.
- `nextAction`: existe como decisão canônica, porém ainda há texto residual em compat layers e operacionais legados.
- `checklist documental`: existe, porém ainda é mais forte em locação/documentos do que em fechamento completo.

### 5.2 Dashboard e prova

- `Command Center`: evidenciado como dashboard operacional com REST real.
- `KPIs`: existem em superfícies de dashboard, não como pergunta conversacional governada.
- `proof surface`: `receiptPath`, `bundlePath` e `verifyUrl` já aparecem no payload IMOB quando aplicável.
- `operation bundle`: ainda não está fechado de modo homogêneo por operação.

### 5.3 Documento, contrato e fechamento

- `intake documental`: existe no chat, com PII masking, export e atualização de caso.
- `contrato`: a camada de contrato suporta `locacao`, `compra_venda`, `administracao` e `temporada`, mas o intake automático evidenciado hoje está centrado em locação.
- `closing output`: não existe como artefato automático completo de fechamento do negócio.

## 6. Saídas Legal/J_360

- `J_360` produz `Legal Output` e `Executive Output` reais:
  - parecer estruturado;
  - matriz de risco;
  - referências jurídicas;
  - HTML/PDF renderizados.
- Isso ainda não prova uma vertical `LEGAL` autônoma.
- `handoff` vindo de IMOB para jurídico continua majoritariamente textual/simbólico.

## 7. Saídas Marketing/MKT

- `MKT` produz `Marketing Output` real:
  - briefing normalizado;
  - timeline/cadência;
  - channels;
  - assets;
  - copy/compliance guidance.
- O output é forte como especialista/reporting.
- Ainda não há prova suficiente para classificar `Marketing` como vertical autônoma operacional.

## 8. Saídas Finance/Billing/Economy

- `invoice`, `payment intent`, `settlement`, `dispute`, `reputation`, `reconciliation summary` existem no Core.
- `settlement` e `receipt -> ledger -> provider` já têm evidência forte.
- A vertical `Finance` ainda não deve ser promovida como experiência operacional equivalente a `IMOB`; o que está maduro é a camada Core/Economy.

## 9. Saídas auditáveis: receipt, bundle, timeline, ledger, verifyUrl

Saídas auditáveis já encontradas no repositório:

- `receiptPath`
- `bundlePath`
- `verifyUrl`
- `ledger` / `txId`
- timelines e relatórios do `Guardian`

Guardrail canônico:

- relatório bonito sem `receipt/bundle/ledger/verifyUrl` não é prova forte;
- prova parcial de run não equivale a `Closing Output`;
- `verifyUrl` hoje é majoritariamente derivado de `/api/ledger/{txId}`.

## 10. Gaps N-07 / N-08

### N-07 — PII masking desalinhado

Gap confirmado:

- `apps/api/src/orchestrator/llmExecutor.ts` usa masking genérico por regex para chamadas LLM;
- `apps/api/src/services/imob/intake/imobContractPiiMasker.ts` usa masking específico do intake contratual;
- isso indica risco de desalinhamento entre o masker especializado de contrato e o sanitizador genérico de LLM.

Status:

- `N-07 = parcial`

Risco:

- o texto mascarado do intake e o texto sanitizado antes de LLM podem divergir em granularidade, labels e cobertura.

### N-08 — ausência de Closing Output IMOB

Gap confirmado:

- não existe hoje artefato automático único de fechamento do negócio IMOB com:
  - resumo apresentável;
  - timeline;
  - partes;
  - comissão;
  - receipts;
  - ledger;
  - verifyUrl.

Status:

- `N-08 = aberto`

## 11. DoD para promover uma saída para “fechada”

Uma saída só pode ir para `fechada/evidenciada` quando:

- possui contrato/surface canônica clara;
- não depende de regra cognitiva no `ChatAgentLauncher`;
- tem testes ou check real compatíveis com o risco;
- tem evidência indexável de execução real;
- separa claramente:
  - resposta conversacional;
  - estado operacional;
  - prova auditável;
- não promove especialista para vertical sem baseline;
- não chama de fechamento o que ainda é só draft, dashboard ou checklist.

## 12. Próximos patches seguros

- Formalizar um contrato canônico de `Closing Output` IMOB antes de qualquer implementação visual.
- Reduzir drift textual de `NextAction` migrando mensagens residuais para o resolvedor canônico.
- Unificar a política de masking entre `imobContractPiiMasker` e `llmExecutor`.
- Expor KPI conversacional só via engine e contrato, sem reaproveitar o dashboard como se fosse chat.
- Fortalecer `Operation Bundle` por operação crítica com critério mínimo verificável.
- Evoluir handoff funcional de specialists sem deslocar ownership do caso para fora do IMOB.
