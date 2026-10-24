# BACKUP-A — padronização da apresentação temporal (UTC + Brasília) — 2026-10-17

| Campo | Valor |
| --- | --- |
| Decisão vinculada | `STORAGE-02B.11-DEC-20261017-01` — `ops/evidence/latest/backup-a-scheduling-decision-2026-10-17/DECISION.md` (histórico preservado) |
| Evidências relacionadas (preservadas, não reescritas) | `ops/evidence/latest/backup-a-capture-timers-implementation-2026-10-17/IMPLEMENTATION.md` · `ops/evidence/latest/backup-a-first-scheduled-capture-2026-10-17/FIRST-CAPTURE.md` · `ops/evidence/latest/backup-a-monitoring-panel-2026-10-17/PANEL.md` · `ops/evidence/latest/backup-a-upload-run-7c3750-2026-10-17/UPLOAD.md` |
| Executor | Claude Code, por instrução do owner (sem captura, upload, AWS, alteração de relógio/timers, commit ou push) |
| Registro | 2026-10-17T12:59Z = 2026-10-17T09:59-03:00 (America/Sao_Paulo) |
| Status | `TIME_STANDARD_APPLIED_AND_VALIDATED` (parcial: sincronização externa do relógio NÃO comprovada) |

## 1. Padrão aplicado ao painel
`backup-a-panel` (a mesma entrada de comando) passa a mostrar cada evento como **ISO-8601 com offset explícito, em Brasília (`America/Sao_Paulo`) e em UTC**, p. ex. `2026-10-17T08:00:00-03:00 (Brasília, America/Sao_Paulo) | 2026-10-17T11:00:00Z (UTC)`. As quatro categorias ficam distintas: **AGENDADO** (calendário real do timer e "próximo agendado"), **INÍCIO REAL** e **TÉRMINO REAL** (serviço e `run.json`/`uploaded.tsv`), **disparo real** do timer e **CONSULTA** (momento da tela, no topo e no rodapé). O texto original do systemd é mostrado ao lado (`[systemd: …]`) e o id do run (que contém UTC) nunca é alterado.
**Conversão por ferramenta de fuso, nunca por subtração:** `date -d` com `TZ=America/Sao_Paulo`/`TZ=UTC` sobre tzdata `2025b-0ubuntu0.20.04.1`; o timestamp do id do run é só fatiado como texto e convertido pela mesma ferramenta. Versão anterior do painel preservada em `~/.eiah-aws/automation/backup-a/backup-a-panel.sh.pre-timefmt-20261017`; a cópia da v1 em `ops/evidence/latest/backup-a-monitoring-panel-2026-10-17/` não foi tocada (a janela do painel aberta antes continua na v1 até ser reaberta com `backup-a-panel`).

## 2. Validação (`time-validation.txt`)
- **Equivalência exigida:** `2026-10-17T11:00:00Z = 2026-10-17T08:00:00-03:00` — epoch 1792234800 nos dois lados (GNU date + tzdata) e `getTime()` igual no Node/ICU 77.1 (tzdata 2025b), que mostra `08:00:00 GMT-03:00`. Python do sistema (3.8) não tem `zoneinfo`; não foi usado.
- **Regra do fuso:** `/etc/localtime` → `America/Sao_Paulo`; offset `-0300` em 2026-01-15, 2026-07-15 e 2026-12-17 (sem horário de verão no tzdata).
- **Cruzamento independente:** os 7 pares Brasília|UTC exibidos pelo painel (`pairs.txt`) foram conferidos com Intl (mesmo instante e offset correto): 7 OK, 0 falha.
- **Timers preservados:** `state-before.txt` = `state-after.txt` (idênticos): diária `*-*-* 08:00:00 America/Sao_Paulo`, semanal `Fri *-*-* 18:00:00 America/Sao_Paulo`, `Persistent=no`, mesmos disparos/`InvocationID`, units instaladas e árvore do BACKUP-A (tamanho, mtime, ctime), `Linger`, SHA-256 de `backup-a.env`/scripts. A varredura estática (`static-scan.txt`) não achou operação de escrita, AWS, `timedatectl set-*`, `hwclock` ou `date -s`; execução em pseudoterminal com SIGINT: 3 atualizações.
- Amostra real do painel: `panel-sample-output.txt`.

## 3. Sincronização do relógio (`clock-sync.txt`; somente leitura)
- WSL: `timedatectl` → `System clock synchronized: yes`, `NTP service: inactive`; `systemd-timesyncd`, `chrony`, `ntp` inativos. A flag `yes` é do kernel e não identifica a fonte.
- Windows: serviço **Windows Time (w32time) PARADO** (código 1077); configuração `Type=NTP`, `NtpServer=time.windows.com,0x9`; fuso `E. South America Standard Time`. `w32tm /query /status` falha ("serviço não foi iniciado").
- Diferença Windows × WSL em 3 amostras: 0,074–0,081 s (ida e volta ≈ 0,21 s) ⇒ os dois relógios são consistentes entre si.
- **Limitações:** a fonte do relógio do WSL é inferida (host Windows), não provada; não há sincronização externa ativa verificável agora (w32time parado), então a exatidão frente a UTC real não está comprovada; **converter fuso não comprova sincronização**. Nada foi alterado no relógio, no w32time ou em serviços.

## 4. Regra para novas evidências
Registrar sempre o instante em UTC (`…Z`) e a representação em Brasília (`…-03:00`, `America/Sao_Paulo`), indicando se é horário agendado, início real, término ou consulta. Timestamps originais (ids de run, chaves S3, recibos, logs em UTC, journal local) não são reescritos; evidências históricas permanecem como foram registradas.
