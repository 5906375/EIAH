# Implementação da decisão `STORAGE-02B.11-DEC-20261017-01` — timers de captura do BACKUP-A

| Campo | Valor |
| --- | --- |
| Decisão vinculada | `ops/evidence/latest/backup-a-scheduling-decision-2026-10-17/DECISION.md` (registro histórico preservado, não alterado; SHA-256 no `MANIFEST.sha256` do diretório da decisão) |
| Executor | Claude Code, por instrução do owner |
| Instalação | 2026-10-17 07:50 -03 (America/Sao_Paulo), `systemd 245`, `systemd --user` ativo |
| Status | `TIMERS_INSTALLED_AND_VERIFIED` · primeira captura agendada: **NÃO EVIDENCIADA** no momento deste registro |

## 1. Escopo aplicado
Somente dois timers de captura e o serviço de captura, em `~/.config/systemd/user/` (idênticos a `units/`, conferidos com `cmp`):

| Unit | Calendário | Persistent | Próxima execução (verificada) |
| --- | --- | --- | --- |
| `backup-a-capture-daily.timer` → `backup-a-capture@daily.service` | `*-*-* 08:00:00 America/Sao_Paulo` | `false` | Sáb 2026-10-17 08:00 -03 (11:00 UTC) |
| `backup-a-capture-weekly.timer` → `backup-a-capture@weekly.service` | `Fri *-*-* 18:00:00 America/Sao_Paulo` | `false` | Sex 2026-10-23 18:00 -03 (21:00 UTC) |

Ambos `enabled` e `active (waiting)`. `AccuracySec=1s`, sem `RandomizedDelaySec`. Nenhum serviço foi disparado manualmente. Adaptações em relação às units v2 (preservadas, não instaladas): horários da decisão, fuso explícito, `Persistent=false`, instalador `install-capture-timers.sh` (v3) que instala somente esses 3 arquivos, valida estrutura (um único `Exec*`, sem `OnSuccess/OnFailure/Requires/After`, `Unit=` fixa, `Persistent=false`, fuso explícito, calendário válido) e recusa se houver upload/audit/check instalados.

## 2. Confirmação de que a captura não dispara upload nem limpeza
Inspecionado em `backup-a-run.sh` e `backup-a.sh`: o serviço executa `backup-a-run.sh capture <kind>` → `backup-a.sh capture --kind <kind>`. Funções com chamada AWS (`sts_ok`, `verify_object`, `upload_run`, `cmd_audit`, `cmd_reconcile`, `cmd_prune_local`) não são alcançadas por `cmd_capture`, `preflight`, `mk_*`, `finish` nem pelo wrapper; a captura usa apenas `gh` (leitura do GitHub) para o BA-06. Criptografia age (2 destinatários, SHA-256 dos destinatários conferido no preflight), bloqueios (lock, preflight, rejeição de snapshot inconsistente) e limites (fila 1500 MB, piso 3000 MB, arquivo 4000 MB) permanecem inalterados: `backup-a.sh` e `backup-a.env` não foram modificados. Não há timer de upload, audit, check nem prune; sem crontab; `systemctl --user list-unit-files 'backup-a*'` lista apenas as 3 units acima. Ambiente do serviço testado em unit transitória sem executar a captura (PATH, `gh` autenticado, `age`, SHA dos destinatários).

## 3. Distinção de evidências
- **Instalados e verificados** (inspecionado): `verification-installed-timers.txt` (enabled/active, calendários normalizados, `Persistent=no`, próximas execuções, `ExecStart` instalado, ausência de outros timers/cron, status da fila 2 MB).
- **Primeira captura agendada executada:** não evidenciada aqui. Timer ativo não prova captura; a prova será um novo run em `~/.eiah-aws/backup-a-auto/queue/` com log do run. Registrar em evidência futura.
- **Não comprovado:** execução de captura sob o serviço systemd (ambiente do serviço só foi sondado), `Linger=no` (gerenciador pode parar sem sessão), WSL ligado nos horários, descriptografia dos 4 objetos de 2026-10-16, cobertura dos dados operacionais dos clientes, BACKUP-B.

## 4. Riscos
Fila de 1500 MB ⇒ captura para com código 77 (ver `OPERACAO.md`); alertas só locais; sem Object Lock; upload depende de `aws login` humano; execução perdida por WSL desligado não é recuperada (`Persistent=false`, por decisão).

## 5. Operação
Comandos de status/fila, upload manual e desativação: `OPERACAO.md`.
