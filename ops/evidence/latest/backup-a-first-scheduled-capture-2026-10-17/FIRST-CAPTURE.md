# Primeira captura diária agendada do BACKUP-A — 2026-10-17

| Campo | Valor |
| --- | --- |
| Decisão vinculada | `STORAGE-02B.11-DEC-20261017-01` — `ops/evidence/latest/backup-a-scheduling-decision-2026-10-17/DECISION.md` (histórico preservado) |
| Implementação vinculada | `ops/evidence/latest/backup-a-capture-timers-implementation-2026-10-17/IMPLEMENTATION.md` (histórico preservado; lá a primeira captura constava como "não evidenciada") |
| Executor do registro | Claude Code, por instrução do owner; nenhuma captura, upload, commit ou push foi feito para produzir este registro |
| Status | **CAPTURA DIÁRIA VALIDADA** · captura semanal: instalada, **primeiro disparo pendente** (sex 2026-10-23 18:00 -03) |

## 1. Disparo real pelo systemd (inspecionado)
- `backup-a-capture-daily.timer` foi ativado às 07:50:42 -03, antes do horário; disparou às **08:00:00 -03** (`LastTriggerUSec`), `Result=success`.
- `backup-a-capture@daily.service` (`TriggeredBy` o timer): início 08:00:00, fim 08:00:52 -03, `ExecMainStatus=0`, `Result=success`, 31,7 s de CPU. O journal do usuário registra `Starting` → `Succeeded` → `Finished`. Ninguém o disparou manualmente. Arquivos: `journal-first-scheduled-capture.txt`, `systemd-state.txt`.
- As duas únicas ocorrências de "aws" no journal/log são o texto da descrição da unit ("sem AWS"); nenhum comando AWS, upload ou prune aparece.

## 2. Run e recibos
Run `BA-AUTO-daily-20261017T110000746Z-7c3750`: `STATE=CAPTURED`, `kind=daily`, `run.json`: captured=2, failed=0, skipped=1, inconsistent=0. `run-verification.txt` confere o SHA-256 e o tamanho de cada `.age` em disco com `receipts.tsv` — os três **batem** — e confirma 2 destinatários age X25519 em cada cabeçalho.

| Objeto | Plaintext | `.age` (bytes) | SHA-256 do ciphertext |
| --- | ---: | ---: | --- |
| BA-02 worktrees-state | 103451673 | 103477219 | `<SHA256_MASKED_08>` |
| BA-06 github-metadata (13 entradas, com detalhe dos rulesets) | 316324 | 316686 | `<SHA256_MASKED_09>` |
| BA-07 manifests | 27469 | 27767 | `<SHA256_MASKED_10>` |

BA-01 (git-core) foi ignorado: fingerprint inalterado desde o último envio verificado (`SKIP`).

## 3. Por que "capturados=2" com três objetos novos
No script (`cmd_capture` de `backup-a.sh`), o contador `captured` só é incrementado dentro do laço sobre os objetos de dados da captura diária (`BA-01`, `BA-02`, `BA-06`): BA-01 foi `skip` (não conta como capturado, entra em `ignorados=1`), BA-02 e BA-06 foram capturados e verificados (fonte inalterada antes/depois) ⇒ `capturados=2`. O BA-07 (manifestos) não é um objeto de fonte: é gerado **depois** do laço por `mk_manifests`, apenas se `captured > 0`, para descrever o próprio run; por isso é gravado e recebe recibo, mas não entra na contagem. Total de objetos novos = 2 capturados + 1 manifesto = 3.

## 4. Ausência de upload
O run não possui `api/`, `state/` nem `uploaded.tsv` (nenhuma tentativa, recibo ou PutObject); a unit só executa `backup-a-run.sh capture daily`. Alertas locais: 0. A cópia dos recibos de captura está em `run-receipts/` (`receipts.tsv`, `run.json`, `run-log.txt`).

## 5. Fila e próximas execuções (registrado às 08:05 -03)
Fila não enviada **102 MB** de 1500 MB (limite `BA_QUEUE_MAX_MB`; a captura para com código 77 ao atingi-lo); arquivo verificado local 230 MB de 4000 MB; C: 12.223 MB livres (piso 3000 MB). O run `…7c3750` está em `CAPTURED`, aguardando upload manual do owner. Próximas: diário dom 2026-10-18 08:00:00 -03; **semanal sex 2026-10-23 18:00:00 -03** (nunca disparou; `LastTriggerUSec` vazio).

## 6. Limites desta evidência
Prova a captura local cifrada e a integridade local dos três `.age`. Não comprova upload ao S3, descriptografia, restauração, o disparo semanal, a captura com WSL desligado nem `Linger` (estava `no`).
