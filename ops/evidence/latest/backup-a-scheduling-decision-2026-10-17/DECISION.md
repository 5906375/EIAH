# Decisão do owner — agendamento do BACKUP-A (2026-10-17)

| Campo | Valor |
| --- | --- |
| Identificador | `STORAGE-02B.11-DEC-20261017-01` (atribuído por Claude Code a partir da série `STORAGE-02B`; o owner não informou número — corrigir aqui se houver outro) |
| Autor da decisão | Owner (proprietário da EIAH) |
| Executor do registro | Claude Code (somente documentação) |
| Data / fuso | 2026-10-17 · America/Sao_Paulo (o WSL está em America/Sao_Paulo, -03) |
| Status | `DECISION_RECORDED_IMPLEMENTATION_PENDING` |

## 1. Classificação em três camadas

| Camada | Estado | Base |
| --- | --- | --- |
| 1. DECISÃO | **AUTORIZADA pelo owner** | Instrução do owner de 2026-10-17 (§2). |
| 2. IMPLEMENTAÇÃO | **PENDENTE de aplicação no WSL** | Inspecionado em 2026-10-17 07:30 -03: nenhum timer de usuário (`systemctl --user list-timers --all` = 0), `~/.config/systemd/user` inexistente, sem crontab. Nenhuma unit foi instalada nem alterada nesta tarefa. |
| 3. VERIFICAÇÃO OPERACIONAL | **PENDENTE de evidência dos timers instalados** | Não existe execução agendada a comprovar. O agendamento **não** está ativo. |

## 2. Configuração autorizada (decisão do owner)

- Captura diária automática: todos os dias às 08h (America/Sao_Paulo).
- Captura semanal automática: sextas-feiras às 18h (America/Sao_Paulo).
- Upload ao S3: exclusivamente manual, iniciado e acompanhado pelo owner, sem horário predefinido.
- Alertas inicialmente em logs locais.
- Sem exclusão automática e sem `prune-local`.
- Sem alterações em IAM, buckets, policies, Render ou autenticação não interativa.
- BACKUP-B e bucket por cliente permanecem pendentes de levantamento e decisão.

## 3. Distância entre o material já preparado e a decisão (inspecionado; nada alterado)

As units de `~/.eiah-aws/automation/backup-a/activation/v2/` foram preparadas ANTES desta decisão e **não a refletem**:

| Item | Preparado (v2, não instalado) | Decisão | Ajuste necessário na implementação |
| --- | --- | --- | --- |
| Captura diária | 02:30 | 08:00 | alterar `OnCalendar` |
| Captura semanal | domingo 03:30 | sexta 18:00 | alterar `OnCalendar` |
| Upload | `backup-a-upload.timer` 05:00 diário | somente manual | **não instalar** esse timer |
| Audit semanal/mensal e check diário | timers presentes | não autorizados pela decisão | não instalar, ou pedir decisão explícita do owner |
| `install-timers.sh --apply` | instala os 6 timers | — | instalar somente os 2 timers de captura |
| Alerta | `BA_ALERT_CMD` indefinido (alertas só em `alerts.log`) | logs locais | compatível |

Consequências operacionais a considerar (riscos, não decisões):
- Com upload manual e sem `prune-local`, a captura recusa (código 77) quando a fila não enviada atinge `BA_QUEUE_MAX_MB` (1500 MB) ou o arquivo verificado local atinge `BA_ARCHIVE_MAX_MB` (4000 MB). As capturas diárias de ~230 MB (pior caso, tudo mudou) enchem a fila em cerca de 6 dias sem upload.
- O WSL precisa estar ligado às 08h e às 18h de sexta; `Persistent=true` recupera execuções perdidas ao religar.
- O alerta de RPO (>36 h) só existe no subcomando `check`, cujo timer não foi autorizado.

## 4. Fatos INSPECIONADOS por Claude Code nesta tarefa

Recibos em `~/.eiah-aws/evidence/backupA-resume-20261016/first-uploads/` (lidos e conferidos entre si: `uploaded.tsv`, `receipts.tsv`, `api/*.put.json`, `api/*.get.json`, `state/*`):

| Run | Objeto | Bytes | SHA-256 do ciphertext | VersionId | Verificação registrada |
| --- | --- | ---: | --- | --- | --- |
| `BA-AUTO-daily-20261016T204552349Z-65d1b9` | BA-06 github-metadata | 316691 | `<SHA256_MASKED_14>` | `<S3_VERSION_ID>` | download-completo |
| `BA-AUTO-daily-20261016T204552349Z-65d1b9` | BA-07 manifests | 26836 | `<SHA256_MASKED_15>` | `<S3_VERSION_ID>` | download-completo |
| `BA-AUTO-daily-20261016T180030637Z-6e1982` | BA-01 git-core | 135959242 | `<SHA256_MASKED_16>` | `<S3_VERSION_ID>` | download-completo |
| `BA-AUTO-daily-20261016T180030637Z-6e1982` | BA-02 worktrees-state | 103380515 | `<SHA256_MASKED_17>` | `<S3_VERSION_ID>` | download-completo |

Conferências locais (todas OK): o SHA-256 e os bytes de `uploaded.tsv` coincidem com `age_sha256`/`age_bytes` de `receipts.tsv`; o checksum SHA-256 (Base64) do `put.json` coincide com o do `get.json`; `VersionId` do Put = do Get = de `uploaded.tsv`; `ContentLength` do `get.json` = bytes; existem `put-attempt`, `put-ok` e `verified` para os 4 objetos e nenhum `put-conflict`; cabeçalho age com 2 destinatários nos 4 recibos; `backup-a.sh status` (2026-10-17 07:30 -03) mostra os dois runs em `UPLOADED_VERIFIED` e fila de 2 MB. SHA-256 dos recibos: `uploaded.tsv` 65d1b9 = `<SHA256_MASKED_18>`; `uploaded.tsv` 6e1982 = `<SHA256_MASKED_19>`; `receipts.tsv` 65d1b9 = `<SHA256_MASKED_20>`; `receipts.tsv` 6e1982 = `<SHA256_MASKED_21>`. Os scripts de `SCRIPTS.sha256` não divergem do estado atual.

Limite: nesta tarefa o S3 **não** foi consultado de novo; a verificação por download completo é a registrada nos recibos da execução de 2026-10-16 (e um `audit` por HeadObject OK nessa data).

## 5. RELATOS (não verificados por Claude Code nesta tarefa)

- "Status anterior UPLOADED_AND_VERIFIED" e "quatro objetos novos enviados e verificados" — relato do operador; coerente com os recibos inspecionados (§4), mas a releitura do S3 não foi refeita aqui.
- "BA-07 anterior recuperado no iPhone" — relato do owner, registrado em `~/.eiah-aws/evidence/storage-02b8-r1-validated-20261016/R1-VALIDATED.md` como declaração do owner; o Claude Code não recalculou o hash. Escopo: apenas o BA-07 do G3/G5 (VersionId `<S3_VERSION_ID>`), não os quatro objetos novos.

## 6. NÃO comprovado / pendente

- Descriptografia dos quatro objetos novos (BA-01, BA-02, BA-06, BA-07 dos runs acima): pendente; só a integridade do ciphertext foi verificada.
- Cobertura dos dados operacionais dos clientes: não comprovada. O BACKUP-A cobre as fontes de `~/.eiah-aws/automation/backup-a/sources.json` (repositório principal e worktrees, projetos fora de git, evidências do home, backups históricos, metadados do GitHub); não inclui bancos de dados nem dados de clientes.
- BACKUP-B e bucket por cliente: pendentes de levantamento e decisão.
- Sem Object Lock/retenção imutável; autenticação do upload depende de `aws login` humano; restauração real de objetos do BACKUP-A além do BA-07 não executada.

## 7. Escopo desta tarefa

Apenas documentação: nenhum timer instalado, nenhuma captura, nenhum upload, nenhuma chamada AWS, nenhum commit/push; nenhuma evidência anterior foi alterada ou substituída (os registros `storage-02b*` e `backupA-resume-20261016` permanecem como estavam).
