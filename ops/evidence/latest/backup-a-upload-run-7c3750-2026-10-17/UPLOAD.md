# Upload manual supervisionado do run `BA-AUTO-daily-20261017T110000746Z-7c3750` — 2026-10-17

| Campo | Valor |
| --- | --- |
| Autorização | Instrução do owner de 2026-10-17: envio manual e verificação deste run apenas (não autoriza agendar uploads) |
| Evidências vinculadas (preservadas) | `ops/evidence/latest/backup-a-first-scheduled-capture-2026-10-17/FIRST-CAPTURE.md` (captura do run) · `ops/evidence/latest/backup-a-scheduling-decision-2026-10-17/DECISION.md` (decisão `STORAGE-02B.11-DEC-20261017-01`, upload manual) |
| Executor | Claude Code (comando `backup-a.sh upload --run <RUN> --full-verify`; roles Writer e Restore; login humano feito pelo owner) |
| Execução | 2026-10-17 09:52:25–09:52:42 -03 (12:52 UTC), exit 0 |
| Estado final do run | **UPLOADED_VERIFIED** (3/3 objetos) |

## 1. Preflight (`preflight-and-identities.txt`)
Run em `CAPTURED`, sem `state/` nem `uploaded.tsv`; SHA-256 e tamanho dos 3 `.age` iguais a `receipts.tsv`; sessões iniciais expiradas, renovadas pelo owner; identidades conferidas: `user/<IAM_PROFILE_OPERATOR>`, `assumed-role/<IAM_ROLE_WRITER_NAME>`, `assumed-role/<IAM_ROLE_RESTORE_NAME>`; as 3 chaves de destino não existiam (HeadObject 404, 0 objetos sob o prefixo).

## 2. Resultado por objeto (bucket `<S3_BUCKET>`, `<AWS_REGION>`)
Chave = `<S3_PREFIX>/auto/daily/BA-AUTO-daily-20261017T110000746Z-7c3750/` + nome.

| Objeto | Nome na chave | Bytes | SHA-256 do ciphertext | VersionId |
| --- | --- | ---: | --- | --- |
| BA-02 | `BA-AUTO-daily-20261017T110000746Z-7c3750--BA-02-worktrees-state.tar.gz.age` | 103477219 | `<SHA256_MASKED_08>` | `<S3_VERSION_ID>` |
| BA-06 | `BA-AUTO-daily-20261017T110000746Z-7c3750--BA-06-github-metadata.tar.gz.age` | 316686 | `<SHA256_MASKED_09>` | `<S3_VERSION_ID>` |
| BA-07 | `BA-AUTO-daily-20261017T110000746Z-7c3750--BA-07-manifests.tar.gz.age` | 27767 | `<SHA256_MASKED_10>` | `<S3_VERSION_ID>` |

## 3. Verificação (inspecionada nos recibos de `receipts/`)
- PutObject condicional (`--if-none-match '*'`, `--checksum-algorithm SHA256`, `AWS_MAX_ATTEMPTS=1`): exatamente 1 PutObject por objeto; sem `put-conflict` (nenhum 412) e sem tentativa ambígua; nenhum objeto sobrescrito.
- `uploaded.tsv`: `verify_modo = download-completo` nos 3. A role Restore baixou cada objeto inteiro; o uploader comparou o SHA-256 do arquivo baixado com o recibo e conferiu `ContentLength`, `VersionId` e o checksum SHA-256 (Base64) do GET contra o do PUT. Os `get.json` e `put.json` coincidem em VersionId e checksum; ContentLength = bytes.
- `state/*.verified` existe para os 3 e o run só foi marcado `UPLOADED_VERIFIED` depois deles.
- `audit` (HeadObject) logo depois: 7 objetos OK (`audit-after-upload.log`), incluindo os 3 novos. Nenhum resíduo `BA-AUTO*` em `/dev/shm`.

## 4. Fila e armazenamento local após o envio (`backup-a.sh status`, 09:52 -03)
Fila não enviada: **2 MB** de 1500 MB. Arquivo verificado mantido localmente: **330 MB** de 4000 MB (inclui este run, ~100 MB; nada foi apagado). C: 14.105 MB livres.

## 5. O que isto NÃO prova
Prova a integridade do **ciphertext** no S3 (bytes, SHA-256, VersionId), não a recuperação do conteúdo: nenhuma descriptografia ou restauração foi feita. Não houve nova captura, `prune-local`, exclusão local/remota, instalação de timers nem mudança em IAM, bucket, policies, Render ou autenticação. O upload permanece exclusivamente manual.
