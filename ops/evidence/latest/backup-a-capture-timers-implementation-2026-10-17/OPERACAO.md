# BACKUP-A — operação dos timers de captura (comandos reais)

Preparação comum: `export BA_CONF=~/.eiah-aws/automation/backup-a/backup-a.env; B=~/.eiah-aws/automation/backup-a/backup-a.sh`

## Consultar status, agenda, fila e alertas
```
$B status                                              # espaço, fila não enviada (máx 1500 MB), arquivo verificado local (máx 4000 MB), runs e estados
systemctl --user list-timers 'backup-a-*' --no-pager   # próximas execuções
systemctl --user list-units 'backup-a-capture@*' --all --no-pager
ls -t ~/.eiah-aws/backup-a-auto/logs | head            # um log por run (BA-AUTO-daily|weekly-…)
tail -n 20 ~/.eiah-aws/backup-a-auto/alerts/alerts.log # alertas locais de falha
ls ~/.eiah-aws/backup-a-auto/alerts/ACTIVE-* 2>/dev/null   # alerta ativo por comando (removido no próximo sucesso)
```
Uma captura que realmente rodou aparece como novo diretório em `~/.eiah-aws/backup-a-auto/queue/` com `STATE` = `CAPTURED` (ou `NOOP` se nada mudou), e linhas `captura concluída` no log do run. O estado do timer sozinho NÃO prova captura.

## Limites que o owner deve acompanhar (sem upload automático e sem prune-local)
- **A captura termina com código 77 quando a fila não enviada atinge 1500 MB** (`BA_QUEUE_MAX_MB`); também com 77 se o espaço livre menos a estimativa ficar abaixo de 3000 MB, ou se o arquivo local de runs verificados atingir 4000 MB (`BA_ARCHIVE_MAX_MB`; nada é apagado automaticamente).
- Pior caso estimado: ~230 MB por captura em que tudo mudou ⇒ a fila de 1500 MB enche em cerca de 6 dias sem upload. Acompanhe `$B status` e envie antes.
- O código 77 só gera registro em `alerts.log`/`ACTIVE-capture-*` (alertas locais); não há notificação ativa. O alerta de RPO (`check`) NÃO está agendado.

## Upload manual (exclusivamente manual; acompanhado pelo owner)
```
# 1) login humano no perfil isolado (ver ~/.eiah-aws/automation/backup-a/activation/FIRST-UPLOAD-CHECKLIST-v2.md §B) e conferir identidades Writer/Restore
$B status                                              # escolher o RUNID em CAPTURED
$B upload --plan --run <RUNID>                         # sem AWS
$B upload --run <RUNID> --full-verify; echo EXIT=$?    # PutObject condicional + verificação por download completo
$B audit
```
Sem `--run` (ou `--all`) o `upload` recusa (código 78). Saídas: 75 sessão AWS; 76 PutObject ambíguo (rodar `$B reconcile`, nunca reenviar); 3 conflito/checksum; 77 espaço.

## Desativar os dois timers
```
systemctl --user disable --now backup-a-capture-daily.timer backup-a-capture-weekly.timer
# ou, removendo também as units (apenas se idênticas às da v3):
~/.eiah-aws/automation/backup-a/activation/v3/install-capture-timers.sh --remove
systemctl --user list-timers 'backup-a-*' --no-pager   # deve listar 0 timers
```
Reativar: `~/.eiah-aws/automation/backup-a/activation/v3/install-capture-timers.sh --apply`.

## Condições para os timers dispararem
- O WSL precisa estar ligado e o gerenciador `systemd --user` ativo no horário. `Persistent=false`: horário perdido não é recuperado.
- `Linger=no` no momento da instalação: o gerenciador de usuário pode parar quando a última sessão do WSL terminar. Habilitar linger (`loginctl enable-linger <WSL_USER>`) não foi aplicado nesta tarefa; é decisão do owner.
