> Cópia sanitizada de `comparison_target_vs_baseline.md` (SHA-256 do original: 2b8ff84ea8b45affa262a25a1d74f8dca02b03021a9caed6caf31c12ecacff93). Texto inalterado; marcadores onde havia caminhos locais.

# Alvo (e4575b0) x baseline (88bb3a2) — testes dirigidos

| arquivo | baseline (pass/fail) | alvo (pass/fail) | testes adicionados pelo P11 | classificação |
|---|---|---|---|---|
| imob-specialist-bridge.test.ts | 25/0 | 28/0 | +3 | sem falhas |
| vertical-access-resolver.test.ts | 16/0 | 20/0 | +4 | sem falhas |
| chat-vertical-registry.test.ts | 5/0 | 5/0 | +0 | sem falhas |
| chat-vertical-imob-handoff.test.ts | 13/0 | 13/0 | +0 | sem falhas |
| vertical-access-revocation.test.ts | 5/0 | 5/0 | +0 | sem falhas |
| agents-public-view.contract.test.ts | 37/0 | 37/0 | +0 | sem falhas |
| imob-copilot-conversation.test.ts | 16/2 | 16/2 | +0 | falhas PREEXISTENTES idênticas (não são regressão) |
| imob-crm-resolver.test.ts | 39/5 | 39/5 | +0 | falhas PREEXISTENTES idênticas (não são regressão) |
| imob-owner-blocker-consult.test.ts | 2/2 | 2/2 | +0 | falhas PREEXISTENTES idênticas (não são regressão) |
| createImobStructuredForms.test.ts | 118/0 | 126/0 | +8 | sem falhas |
| chatLauncherEngine.test.ts | 112/0 | 112/0 | +0 | sem falhas |
| verticalHandoffEngine.test.ts | 30/0 | 30/0 | +0 | sem falhas |
| frontDoorAccessEngine.test.ts | 3/0 | 3/0 | +0 | sem falhas |
| frontDoorBillingEngine.test.ts | 6/0 | 6/0 | +0 | sem falhas |
| FrontDoorSessionHeader.test.tsx | 23/0 | 23/0 | +0 | sem falhas |
| verticalActivationEngine.test.ts | 15/0 | 15/0 | +0 | sem falhas |
| ImobChatWidgets.test.tsx | 16/0 | 16/0 | +0 | sem falhas |
| imobCommandCenterHelper.test.ts | 14/0 | 14/0 | +0 | sem falhas |
| marketplace.installations.activate.test.ts | 25/0 | 32/0 | +7 | sem falhas |

Total adicionado pelo P11: 22 testes (3 bridge, 4 access-resolver, 7 integração HTTP+PG, 8 Front Door web); 0 testes preexistentes removidos ou renomeados (ver logs/tests_added_by_p11.json).
Falhas preexistentes (mesmos testes no baseline e no alvo): imob-copilot-conversation 2, imob-crm-resolver 5, imob-owner-blocker-consult 2 — fora do P11.

## Typecheck (comparação por arquivo + código + mensagem, caminhos normalizados, multiconjunto)
- API: alvo 430, baseline 430, novos 0, removidos 0
- Web: alvo 62, baseline 62, novos 0, removidos 0
Não é typecheck global aprovado: são os mesmos erros preexistentes nos dois commits (API 430, web 62).
imob-copilot-conversation falhas: base=2 alvo=2 mesmos testes=SIM
imob-crm-resolver falhas: base=5 alvo=5 mesmos testes=SIM
imob-owner-blocker-consult falhas: base=2 alvo=2 mesmos testes=SIM
