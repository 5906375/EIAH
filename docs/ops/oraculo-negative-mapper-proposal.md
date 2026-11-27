# Oráculo SC — mapper de negativas, matriz ratificada na sessão

**Atualização:** ratificação recebida; implementação local candidata em andamento. Ver [origem e limites](oraculo-negative-ratification.md). A seção abaixo preserva a proposta do commit d1f1024, anterior à ratificação; não descreve o estado atual do catálogo.

23/09/2026. Status proposta. Nenhum código ativado; executor CI1 permanece conservador. Owner: Carlos Alberto Merlo, conforme responsabilidade declarada na conversa. Aprovação humana de ativação ainda não registrada. Fonte canônica: packages/core/src/reasons/reasonCatalog.ts, entradas proposed.

## Decisão concreta pendente

Ratificar esta matriz para o escopo SIMULATION de Oráculo SC, incluindo os dois refinamentos FT03 abaixo, antes de conectar o mapper ao executor. A etapa de ativação deve ocorrer em PR dedicado com aprovação autenticada e sincronização de canon/documentação/validadores, conforme docs/ops/reason-codes-catalog.md. Este documento e seus testes não substituem essa ratificação.

1. RV01–RV28 preservam os significados documentais aprovados, com fronteiras explícitas de requisição, acompanhamento e C5.
2. ORACULO_VERIFICATION_NOT_SATISFIED é DENIED por verificação não satisfeita, sem afirmar revogação. ORACULO_TEMPORAL_INCOHERENCE é REVIEW_REQUIRED por incoerência temporal, sem afirmar expiração. São refinamentos propostos, não decisões já aprovadas.
3. Negativas finais só serão construídas a partir da avaliação imutável persistida; replay recupera o mesmo resultado. Não reavaliar materiais novos para preencher um resultado antigo. RV21 não substitui C5 anterior; RV26 nunca é C5 FAILED; RV27 exige prova de ausência de efeito. A migração dos holds existentes precisa de operação controlada, idempotente e auditada própria, ainda não implementada.

## Matriz

| Finding | Token proposto | Destino | Resultado candidato |
| --- | --- | --- | --- |
| RV01 | ORACULO_INPUT_INVALID | REQUEST_ERROR | Sem C5 |
| RV02 | ORACULO_SCOPE_DENIED | REQUEST_ERROR | Sem C5 |
| RV03 | ORACULO_EXTERNAL_EFFECT_BLOCKED | REQUEST_ERROR | Sem C5 |
| RV04 | ORACULO_VISIT_NOT_RESOLVED | REQUEST_ERROR | Sem C5 |
| RV05 | ORACULO_CONTENT_INTEGRITY_MISMATCH | C5 | DENIED |
| RV06 | ORACULO_ARTIFACT_INTEGRITY_MISMATCH | C5 | DENIED |
| RV07 | ORACULO_INSPECTION_REJECTED | C5 | DENIED |
| RV08 | ORACULO_VALIDITY_EXPIRED | C5 | DENIED |
| RV09 | ORACULO_VALIDITY_NOT_STARTED | C5 | DENIED |
| RV10 | ORACULO_TEMPORAL_POLICY_UNRESOLVED | C5 | REVIEW_REQUIRED |
| RV11 | ORACULO_STATUS_REVOKED | C5 | DENIED |
| RV12 | ORACULO_STATUS_SUSPENDED | C5 | DENIED |
| RV13 | ORACULO_STATUS_UNKNOWN | C5 | REVIEW_REQUIRED |
| RV14 | ORACULO_STATUS_STALE | C5 | REVIEW_REQUIRED |
| RV15 | ORACULO_STATUS_CONFLICT | C5 | REVIEW_REQUIRED |
| RV16 | ORACULO_SOURCE_AUTHORITY_UNRESOLVED | C5 | REVIEW_REQUIRED |
| RV17 | ORACULO_HITL_REQUIRED | C5 | REVIEW_REQUIRED |
| RV18 | ORACULO_APPROVAL_CONTEXT_MISMATCH | C5 | REVIEW_REQUIRED |
| RV19 | ORACULO_APPROVAL_EXPIRED | C5 | REVIEW_REQUIRED |
| RV20 | ORACULO_APPROVAL_REJECTED | C5 | DENIED |
| RV21 | ORACULO_INTENT_PAYLOAD_CONFLICT | REQUEST_ERROR | Sem C5 |
| RV22 | ORACULO_VISIT_REVISION_CONFLICT | C5 | CONFLICT |
| RV23 | ORACULO_VISIT_TRANSITION_DENIED | C5 | DENIED |
| RV24 | ORACULO_EVIDENCE_REQUIRED | C5 | DENIED |
| RV25 | ORACULO_SNAPSHOT_MISMATCH | C5 | REVIEW_REQUIRED |
| RV26 | ORACULO_COMMIT_OUTCOME_UNKNOWN | TRACKING | Sem C5 |
| RV27 | ORACULO_COMMIT_FAILED_NO_EFFECT | C5 | FAILED |
| RV28 | ORACULO_EXECUTION_AUTHORITY_LOST | REQUEST_ERROR | Sem C5 |
| FT03_NOT_VERIFIED_MAPPING_PENDING | ORACULO_VERIFICATION_NOT_SATISFIED | C5 | DENIED |
| FT03_TEMPORAL_MAPPING_PENDING | ORACULO_TEMPORAL_INCOHERENCE | C5 | REVIEW_REQUIRED |

REQUEST_ERROR significa não fabricar C5 para falha de admissão/autorização/resolução; o transporte deverá manter acesso fail-closed e não revelar existência de recurso de outro escopo. RV04 continua candidato de erro de resolução; validar esse destino na ratificação. RV28 depois de admissão bloqueia execução e deixa reconciliação/resultado depender de leitura ainda autorizada, sem registrar negação de credencial por perda de sessão.

REVIEW_REQUIRED agrupa indeterminação/revisão no C5 candidato; não converte C3 INDETERMINATE em aprovação. C3 negativos exigirão mapeamento por credencial, sem atribuir falha agregada a credenciais que não foram avaliadas. O módulo de proposta apenas descreve candidatos: não emite C3/C5, não entra no executor e recusa promoção automática se o canon mudar de status.

## Critérios para ativação posterior

- Registrar a ratificação humana e o PR dedicado, mantendo owner/approver/evidenceRef verificáveis.
- Aplicar mapeamento apenas aos casos autorizados, sem fallback para token semanticamente aproximado.
- Persistir C5 negativo atomicamente com avaliação/auditoria; testar replay de DENIED/REVIEW_REQUIRED/CONFLICT e não sobrescrita.
- Testar migração idempotente de holds históricos sem nova avaliação nem novo efeito; recusar casos de causa não mapeada.
- Manter autenticação, revogação e commit incerto fora da classificação indevida de falha de domínio.

Não fecha G3/G5, não autoriza operação real e não ativa integrações externas.
