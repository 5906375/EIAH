# WhatsApp Meta — Security, Privacy and Operational Design

## 1. Natureza e baseline

- Data da deliberacao: 2026-11-24.
- Baseline Git: 4090e466.
- Branch: docs/whatsapp-meta-candidate-assessment.
- Modalidade: design-only / non-execution.
- Status: proposta/parcial documental.
- securityReview: security-review-blocked.
- reviewStatus: incomplete.
- providerFinalSelection: not authorized.
- providerIntegration: blocked.
- implementationAuthorized: false.

Este documento consolida as analises preliminares
de seguranca, privacidade, retencao, observabilidade,
rollback e incident response da candidata Meta.

Nao substitui instrumentos canonicos, nao encerra
automaticamente gaps e nao autoriza implementacao,
provider real, producao ou configuracao externa.

## 2. Referencias canonicas

- [F2.16 Pre-Provider Gap Register](whatsapp-read-only-adapter-pre-provider-gap-register.md)
- [F2.18 Threat Model](whatsapp-provider-integration-threat-model-abuse-case-register.md)
- [F2.19 Security Review](whatsapp-provider-integration-security-review-checklist-approval-gate.md)
- [Candidate Intake Meta](whatsapp-provider-meta-candidate-intake-assessment.md)
- [Candidate Evidence Mapping](whatsapp-provider-meta-candidate-evidence-mapping.md)
- [F5.0 Final Selection Charter](whatsapp-provider-final-selection-formal-phase-opening-final-selection-only-charter.md)

Os instrumentos canonicos permanecem inalterados.

## 3. Objetivo funcional

Primeiro abrir a porta de comunicacao com o WhatsApp
de maneira segura e governada.

Depois, em etapa separada, decidir quem recebe,
interpreta e encaminha os eventos dentro da EIAH.

Escopo futuro pretendido:

- Numero empresarial Meta existente.
- Inbound read-only.
- Autenticidade e integridade.
- Normalizacao deterministica.
- Channel Binding governado.
- Tenant, workspace, scope e entitlement.
- Idempotencia duravel.
- Evidencias sanitizadas.
- Nenhuma mutacao de negocio.

Fora do escopo:

- Coordinator, Radar e MarketScan.
- Interpretacao semantica.
- Chamadas a LLM.
- Respostas automaticas.
- Envio de mensagens.
- Lead actions.
- Acoes criticas.
- Treinamento de modelos.

## 4. Autoridade humana

Designacao preliminar expressamente ratificada
na conversa de governanca de 2026-11-24.

| Funcao | Responsavel humano |
| --- | --- |
| Founder / Executive Sponsor | Carlos Alberto Merlo |
| Intake Owner | Carlos Alberto Merlo |
| Product/Platform owner | Carlos Alberto Merlo |
| Backend/API owner | Carlos Alberto Merlo |
| Security owner | Carlos Alberto Merlo |
| Platform governance owner | Carlos Alberto Merlo |
| DocOps owner | Carlos Alberto Merlo |

assignmentStatus: preliminary-ratified.

A acumulacao de funcoes nao comprova independencia
entre revisores ou segregacao de responsabilidades.

Permanecem pendentes:

- Validacao de segregacao de funcoes.
- Independencia de revisao quando exigida.
- Responsaveis adicionais exigidos por instrumentos canonicos.
- Privacy owner e eventual encarregado de dados.
- Escalations externas e janela de suporte.
- Aprovacoes tecnicas e sign-offs formais.

ChatGPT, Codex e Claude Code possuem funcao auxiliar.
Nao substituem autoridade humana.

A ratificacao registrada na conversa nao constitui
assinatura digital.

## 5. Arquitetura proposta

Meta WhatsApp Cloud API
-> Cloudflare
-> Render EIAH API
-> Meta native adapter
-> Channel Binding
-> Tenant/workspace/scope/entitlement
-> Idempotencia duravel
-> Contrato WhatsApp read-only
-> Evidencia sanitizada e ACK.

Endpoint candidato:

- https://api-staging.eiah.ia.br/api/webhooks/meta/whatsapp
- GET para handshake.
- POST para ingresso.
- Estado inicial: disabled.

Dominio, DNS e rota ainda nao configurados.

Contrato interno existente a preservar:

- POST /api/webhooks/whatsapp/inbound.
- whatsapp.adapter.event.v1.
- whatsapp.read_only.bundle_export.v1.
- channel.whatsapp.inbound.read_only.

PostgreSQL e candidato a autoridade persistente
de idempotencia. Redis e candidato a camada auxiliar.

A escolha depende da compatibilidade com os contratos
e mecanismos de persistencia existentes.

Nao autoriza migrations ou novos storages.

Vercel permanece excluido do fluxo pretendido.
Nao autoriza alteracao do webhook atualmente configurado.

## 6. Deltas de seguranca

### SEC-META-01 — Autenticidade, handshake e ACK

Proposta:

- Handshake GET com verificacao do modo e Verify Token.
- Challenge devolvido somente mediante verificacao valida.
- POST com limite de tamanho anterior ao parsing confiavel.
- HMAC-SHA256 sobre os bytes originais do payload.
- Validacao de X-Hub-Signature-256.
- Comparacao resistente a timing attacks.
- Nenhum fallback sintetico em superficie publica.
- ACK HTTP 200 somente apos aceite duravel ou descarte
  explicitamente autorizado.
- Duplicidade legitima nao implica novo processamento.

A resposta externa nao substitui a decisao interna.

### SEC-META-02 — Timestamp e reentrega

Preservar separadamente timestamp do evento e horario
de recebimento.

Nao inventar headers temporais ausentes no protocolo.

Considerar reentregas legitimas sem enfraquecer
a protecao contra replay.

Janela efetiva da Meta, skew permitido e comportamento
apos expiracao ainda exigem validacao especifica.

### SEC-META-03 — Idempotencia duravel

Avaliar persistencia transacional reutilizando
infraestrutura existente.

A chave deve distinguir provider, canal, tipo e
identidade do evento, conforme contrato a aprovar.

Tratar concorrencia, restart, colisoes e lotes com
falhas parciais sem reprocessar eventos ja aceitos.

Persistencia indisponivel impede ACK de aceite.

Redis nao deve ser autoridade exclusiva sem garantias
de durabilidade comprovadas.

### SEC-META-04 — Transporte sem cognicao

O adapter e deterministico.

Nenhuma interpretacao de intencao, chamada a LLM,
ativacao de agente ou execucao de negocio.

Conteudo de mensagem nao constitui autorizacao
para lead.create, lead.discard ou acao critica.

### SEC-META-05 — Secret boundary

Separar App Secret, Verify Token, Access Token
e eventual chave interna de pseudonimizacao.

Access Token nao deve ser disponibilizado ao runtime
de ingresso passivo sem necessidade comprovada.

Segredos fora do repositorio, logs e evidencias.

Segregacao por ambiente, rotacao, revogacao,
redaction e ownership obrigatorios.

Nenhuma credencial provisionada nesta etapa.

### SEC-META-06 — Channel Binding e identidade

Validar WABA e Phone Number ID conforme binding
previamente autorizado.

Tenant, workspace, scope e entitlement devem ser
resolvidos deterministicamente e em fail-closed.

Considerar BSUID e outros identificadores suportados
pelo protocolo, sem depender exclusivamente do telefone.

Nao inferir contexto empresarial do texto da mensagem.

### SEC-META-07 — Security Contact

Fontes publicas reportadas na pesquisa preliminar:

- https://bugbounty.meta.com/
- https://www.whatsapp.com/security/advisories
- https://developers.facebook.com/support/
- https://metastatus.com/whatsapp-business-api

Contato publico reportado: bugbounty@meta.com.

Bug Bounty nao equivale a SLA, suporte contratado
ou canal de incident response da conta EIAH.

Escopo, elegibilidade e escalation especifica pendentes.

Nenhum chamado ou teste realizado.

### SEC-META-08 — Rollback e contencao

Disable especifico do ingresso.

Contencao na borda, configuracao Meta e rollback
de versao ou credencial quando aplicavel.

Nao interromper automaticamente todo o ecossistema.

Nao restaurar automaticamente webhook Vercel.

Retomada condicionada a evidencia e decisao humana.

## 7. Deltas de privacidade

### PRIV-META-01 — Agentes de tratamento

Distinguir tratamento institucional proprio
de futura operacao SaaS multi-tenant.

EIAH pode atuar como controladora ou operadora
conforme a finalidade e instrucoes efetivas.

Classificacao da Meta e demais provedores depende
dos contratos e atividades efetivamente realizadas.

Nenhuma classificacao contratual definitiva.

### PRIV-META-02 — Data map e minimizacao

| Dado | Tratamento proposto |
| --- | --- |
| WABA ID | Binding restrito |
| Phone Number ID | Binding restrito |
| Message ID | Idempotencia pseudonimizada |
| Timestamp | Controle temporal restrito |
| Telefone do remetente | Processamento transitorio |
| BSUID | Processamento transitorio |
| Nome do contato | Descartar |
| Texto da mensagem | Descartar nesta fase |
| Audio, imagem e video | Nao baixar |
| Localizacao | Descartar |
| Documentos anexados | Nao baixar |
| Payload bruto | Nao persistir |
| Assinatura HMAC | Verificacao transitoria |
| Credenciais | Secret boundary |
| Tenant/workspace ID | Isolamento e auditoria restrita |

Inventario preliminar, sujeito a validacao do schema.

### PRIV-META-03 — Bloqueio da camada cognitiva

Nenhum encaminhamento de conteudo para LLM,
treinamento, Coordinator ou outros agentes.

Nenhum compartilhamento adicional sem finalidade,
base legal e autorizacao especificas.

### PRIV-META-04 — Transferencia internacional

Considerar LGPD e Resolucao CD/ANPD 19/2024.

Validar entidades contratantes, regioes, subprocessadores,
DPA e mecanismo aplicavel a cada transferencia.

Render staging anteriormente identificado nos EUA,
conforme levantamento historico.

O aditivo publico WhatsApp nao regulariza
automaticamente toda a cadeia de fornecedores.

Certificacoes de seguranca nao substituem
mecanismo juridico de transferencia.

Contratos efetivamente aceitos ainda nao inspecionados.

### PRIV-META-05 — Retencao e descarte

Proposta submetida pela autoridade humana para
avaliacao documental em 2026-11-24.

| Categoria | Retencao proposta |
| --- | --- |
| Payload bruto | Sem persistencia |
| Conteudo de mensagens | Sem persistencia |
| Midias e anexos | Nao baixar nem persistir |
| Idempotencia pseudonimizada | 14 dias |
| Logs tecnicos sanitizados | 30 dias |
| Evidencias operacionais minimas | 90 dias |
| Registro de incidentes aplicavel | Minimo de 5 anos |

O registro de incidentes observa a Resolucao
CD/ANPD 15/2024, art. 10, contado da data do registro,
ressalvadas obrigacoes que exijam prazo superior.

Os prazos 14/30/90 sao propostas internas.

Requisitos futuros:

- TTL deterministico.
- Marco inicial de retencao documentado.
- Descarte verificavel.
- Segregacao de registros legais.
- Legal hold justificado e autorizado.
- Backup lifecycle compativel com descarte.
- Nao aceitar automaticamente evento antigo
  desconhecido apos expiracao da idempotencia.

Nenhum TTL configurado ou descarte testado.

### PRIV-META-06 — Pseudonimizacao

Avaliar HMAC com chave interna segregada.

Nao reutilizar App Secret como chave de pseudonimizacao.

Pseudonimizacao nao equivale a anonimizacao.

Controle de acesso, finalidade e retencao obrigatorios.

### PRIV-META-07 — Direitos dos titulares

Definir procedimento para direitos do art. 18 da LGPD.

Reutilizar mecanismos existentes quando compativeis.

Canal de atendimento, responsavel pela privacidade
e eventual encarregado ainda pendentes.

### PRIV-META-08 — Comunicacao de incidentes

Aplicar LGPD e Resolucao CD/ANPD 15/2024.

Avaliar risco ou dano relevante e obrigatoriedade
de comunicacao a ANPD e titulares.

Observar prazo geral de tres dias uteis e as regras
aplicaveis de contagem, excecoes e responsabilidades.

Nenhum agente autorizado a comunicar autonomamente.

### PRIV-META-09 — Registro de tratamento

Documentar finalidade, categorias de dados, bases legais,
destinatarios, transferencias, retencao e controles.

Bases legais devem ser determinadas por operacao.

Consentimento nao presumido pelo envio de mensagem.

Legitimo interesse nao autoriza genericamente
tratamento de dados sensiveis.

### PRIV-META-10 — Impacto e risco residual

Avaliar necessidade de RIPD e documentar riscos.

Nao declarar conformidade LGPD integral sem
validacao contratual, juridica e operacional.

## 8. Deltas operacionais

### OPS-META-01 — Observabilidade integrada

Reutilizar mecanismos existentes da EIAH,
mediante compatibilidade comprovada.

Sem novo dashboard ou fornecedor obrigatorio.

### OPS-META-02 — Disable e rollback especificos

- Disable logico do ingresso.
- Contencao especifica da rota na borda.
- Suspensao administrativa Meta quando autorizada.
- Revogacao ou rotacao de segredo.
- Rollback de versao compativel quando necessario.

As opcoes nao constituem sequencia obrigatoria.

Nao retornar automaticamente a Vercel.

### OPS-META-03 — Catalogo de metricas

Nomes candidatos sujeitos a convencoes existentes:

- webhook_requests_total
- webhook_accepted_total
- webhook_ack_duration_ms
- webhook_http_errors_total
- signature_invalid_total
- replay_detected_total
- duplicate_events_total
- payload_rejected_total
- rate_limit_exceeded_total
- binding_denied_total
- entitlement_denied_total
- mutation_blocked_total
- critical_action_blocked_total
- idempotency_store_errors_total
- event_identity_collision_total
- retention_disposal_errors_total
- pii_leakage_total
- secret_exposure_total
- provider_ingress_enabled
- observability_health

Labels sem telefone, BSUID, texto, credenciais
ou identificadores pessoais indevidos.

### OPS-META-04 — SLOs e invariantes

Metas internas preliminares:

- Disponibilidade: 99,9%.
- ACK p95: ate 1 segundo.
- ACK p99: ate 3 segundos.
- Reprocessamento indevido: zero.
- Perda apos aceite duravel: zero.

Invariantes de seguranca:

- PII leakage: zero.
- Secret exposure: zero.
- Cross-tenant violation: zero.
- Unauthorized entitlement bypass: zero.
- sideEffects violation: zero.
- mutationExternalSideEffect: zero.
- criticalActionExecution: zero.
- Unauthorized providerExternalCall: zero.

Metas propostas, nao medicoes ou SLA contratado.

### OPS-META-05 — Severidades e thresholds

SEV-1: violacao de invariantes, exposicao de dados
ou credenciais, mutacao indevida ou replay aceito.

SEV-2: falha de persistencia, colisao de identidade,
perda de observabilidade essencial ou binding inconsistente.

SEV-3: indisponibilidade temporaria, latencia
ou degradacao operacional.

Classificacao preliminar sujeita a impacto e abrangencia.

Assinaturas invalidas ou duplicidades legitimas
isoladas nao devem causar disable global.

Thresholds quantitativos adicionais pendentes
de validacao e baseline operacional.

### OPS-META-06 — Incident response

Detectar, classificar, conter, preservar evidencia,
avaliar obrigacoes juridicas, remediar, validar
e obter autorizacao humana para retomada.

Nenhum incidente operacional observado nesta etapa.

### OPS-META-07 — Owners e escalation

| Atividade | Funcao |
| --- | --- |
| Contencao | Security |
| Diagnostico | Backend/API |
| Invariantes | Platform governance |
| Evidencias | DocOps |
| Impacto | Product/Platform |
| Retomada | Founder / Executive Sponsor |

Responsavel preliminar: Carlos Alberto Merlo.

Preservar escalations canonicas F2.16 e F2.19.

Janela de suporte, substituicao e escalations
independentes ainda pendentes.

Nao declarar cobertura 24/7.

### OPS-META-08 — DoD futuro de retomada

1. Causa identificada ou risco residual aceito
   dentro dos limites de seguranca aplicaveis.
2. Credenciais comprometidas tratadas.
3. Assinatura e replay validados.
4. Binding e entitlement validados.
5. Persistencia consistente.
6. Observabilidade essencial restabelecida.
7. Ausencia de exposicao indevida verificada.
8. Obrigacoes de comunicacao avaliadas.
9. Evidence record sanitizado produzido.
10. Autorizacao humana especifica.

Nenhum item foi executado nesta etapa.

Checklist nao aplicavel a operacao atual.

### OPS-META-09 — Evidencias e retencao

Aplicar PRIV-META-05.

Registros legais de incidentes separados
do descarte ordinario das evidencias.

Evidencia fisica nao pode ser fabricada ou antecipada.

### OPS-META-10 — Fail-closed

Comportamento externo candidato:

| Condicao | Tratamento proposto |
| --- | --- |
| Evento valido e autorizado | ACK 200 apos aceite duravel |
| Duplicidade legitima comprovada | ACK 200 sem reprocessamento |
| Assinatura invalida | 401 |
| Binding ou entitlement negado | 403 |
| Payload malformado | 400 |
| Payload oversized | 413 |
| Colisao de identidade | Bloquear; 409 candidato |
| Persistencia indisponivel | 503 |
| Secret indisponivel | 503 |

Codigos HTTP externos exigem compatibilidade
com a politica de reentrega Meta.

Eventos agrupados exigem politica explicita
para falhas parciais e reentregas.

ReasonCodes canonicos internos permanecem preservados.

## 9. Crosswalk F2.16

| Gap | Cobertura nesta proposta | Estado |
| --- | --- | --- |
| WA-PROV-GAP-001 | Candidata Meta documentada | Open |
| WA-PROV-GAP-002 | SEC-META-05 | Open |
| WA-PROV-GAP-003 | SEC-META-01, SEC-META-06 | Open |
| WA-PROV-GAP-004 | SEC-META-08, OPS-META-02 | Open |
| WA-PROV-GAP-005 | OPS-META-01, 03, 04, 05 | Open |
| WA-PROV-GAP-006 | PRIV-META-01 a 10 | Open |
| WA-PROV-GAP-007 | SEC-META-01 a 08 | Open |
| WA-PROV-GAP-008 | Decision record futuro | Open |
| WA-PROV-GAP-009 | Owners preliminares | Open |
| WA-PROV-GAP-010 | Compatibilidade contratual futura | Open |
| WA-PROV-GAP-011 | Dry-run futuro separado | Open |
| WA-PROV-GAP-012 | OPS-META-10 | Open |
| WA-PROV-GAP-013 | Dashboard adiado | Advisory |
| WA-PROV-GAP-014 | OPS-META-06 e 07 | Advisory |

Gaps blocking: 8.
Gaps required: 4.
Gaps advisory: 2.
Gaps formalmente encerrados: 0.

## 10. Fronteira F2.19 e F5.0

Os 17 controles do Security Review Checklist
permanecem sujeitos a evidencias e aprovacoes.

Nenhuma aprovacao tecnica foi concedida.

Mesmo approved-for-next-design-review-only
nao autoriza integracao ou producao.

Promotion Decision Record especifico permanece
pendente de preparacao e aprovacao em etapa separada.

Nao substituir selecao governada por decisao
implicita de arquitetura.

## 11. Referencias juridicas e contratuais

Referencias publicas reportadas nas analises:

- https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm
- https://www.gov.br/anpd/pt-br/acesso-a-informacao/institucional/atos-normativos/regulamentacoes_anpd/resolucao-cd-anpd-no-19-de-23-de-agosto-de-2024
- Resolucao CD/ANPD 15/2024.
- https://www.whatsapp.com/legal/business-data-processing-terms
- https://www.whatsapp.com/legal/DTA
- https://render.com/dpa
- https://www.cloudflare.com/pt-br/cloudflare-customer-scc/
- https://upstash.com/docs/common/help/compliance

Referencias nao constituem aceite contratual
ou prova de conformidade operacional da conta EIAH.

## 12. Limitacoes e nao-autorizacao

Todos os 28 deltas sao propostas analiticas,
nao reasonCodes canonicos novos.

Nao foram realizados testes com provider real,
consultas autenticadas, configuracao de DNS,
provisionamento de segredos, deploy ou migrations.

Nao foram verificados contratos efetivamente aceitos,
todas as regioes de processamento, comportamento
de backups ou eficacia do descarte.

A compatibilidade da persistencia tecnica com
a fronteira read-only precisa ser aprovada.

O descarte de conteudo limita a fase inicial
a demonstracao de ingresso governado.
Uso futuro do conteudo exige escopo separado.

providerFinalSelection: not authorized.
providerIntegration: blocked.
securityReview: security-review-blocked.
implementationAuthorized: false.

Docker nao integra esta execucao documental.
Vercel excluido da arquitetura pretendida.

## 13. Resultado

- SEC-META: 8 deltas.
- PRIV-META: 10 deltas.
- OPS-META: 10 deltas.
- Owners obrigatorios: 5/5 preliminarmente ratificados.
- Mappings formalmente aceitos: 0/25.
- Controles F2.19 formalmente aprovados: 0/17.
- Gaps F2.16 formalmente encerrados: 0/14.

Status: proposed-design-only.

Materializacao documental nao implica autorizacao
de provider real, producao ou mutacao de negocio.
