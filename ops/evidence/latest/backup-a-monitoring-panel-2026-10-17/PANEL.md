# BACKUP-A — painel de acompanhamento no WSL (somente consulta)

| Campo | Valor |
| --- | --- |
| Decisão vinculada | `STORAGE-02B.11-DEC-20261017-01` — `ops/evidence/latest/backup-a-scheduling-decision-2026-10-17/DECISION.md` (histórico preservado) |
| Evidências relacionadas (preservadas) | `ops/evidence/latest/backup-a-capture-timers-implementation-2026-10-17/IMPLEMENTATION.md` · `ops/evidence/latest/backup-a-first-scheduled-capture-2026-10-17/FIRST-CAPTURE.md` |
| Executor | Claude Code, por instrução do owner (sem captura, upload, AWS, commit ou push) |
| Status | `PANEL_READY_AND_VALIDATED` (parcial: não substitui verificação do S3, descriptografia nem restauração) |

## 1. Arquivos
- Painel: `~/.eiah-aws/automation/backup-a/backup-a-panel.sh` (cópia versionada: `backup-a-panel.sh` neste diretório) · atalho: `~/.local/bin/backup-a-panel` (link simbólico; `~/.local/bin` já está no PATH; nenhum arquivo de inicialização do terminal/Windows foi alterado).
- Comando curto: `backup-a-panel` · opções: `-i SEGUNDOS` (mínimo 2; padrão **5 s**), `--once` (imprime uma vez e sai). **Sair: Ctrl+C ou q.**
- Janela aberta para o owner: terminal do Windows (`cmd.exe /c start … wsl.exe -d Ubuntu -e …/backup-a-panel.sh`), distribuição `Ubuntu`. Não foi possível confirmar visualmente a janela; confirmado que o processo do painel roda em `pts/4` desde a abertura. Enquanto a janela estiver aberta o WSL tem um processo ativo: isso pode mascarar um cenário de "WSL desligado".

## 2. O que mostra (tudo consultado de novo a cada atualização)
Hora e fuso; agenda decidida (diária 08h, semanal sexta 18h); estado real dos dois timers (`enabled`, `active/sub`, `Persistent`, calendário real, último disparo, próxima execução); início, fim, resultado e código da última execução de cada serviço, ou "EM EXECUÇÃO"/"CAPTURA EM ANDAMENTO" quando houver; últimos runs com estado (CAPTURED = só local; UPLOADED_VERIFIED = enviado e verificado); pasta, nomes, tamanhos e caminhos dos `.age` do último backup com conferência de tamanho contra `receipts.tsv` (o SHA-256 NÃO é recalculado); fila em MB contra o limite de 1500 MB e aviso do código 77; espaço livre separado do sistema de arquivos da fila (WSL) e do C:; alertas; avisos permanentes "UPLOAD AO S3 MANUAL — iniciado pelo owner" e "Windows e WSL precisam estar funcionando no horário; horários perdidos não são recuperados automaticamente"; `Linger`. Consulta que falha ou dado ausente aparece como "não disponível"; nada é reaproveitado de atualização anterior.
Fontes: `systemctl --user show/is-enabled/is-system-running`, `loginctl show-user`, `STATE`/`receipts.tsv`/`alerts` do BACKUP-A, `df`, `stat`. Os limites são lidos do `backup-a.env` sem executá-lo. O painel **não** usa `backup-a.sh status` porque este executa `mkdir -p` e `chmod -R` ao iniciar; a regra de fila (soma dos runs fora de UPLOADED_VERIFIED) é a mesma, e `sample-output.txt` mostra 102 MB / 230 MB, os mesmos valores que `backup-a.sh status` reportou às 08:05 -03.

## 3. Validação (inspecionada)
- Varredura estática (`static-scan.txt`): nenhum comando de captura, login, upload, limpeza, restauração, AWS, escrita, `systemctl start/stop/enable/disable`, `loginctl enable-linger`, `chmod`, `rm`, `mv` ou `cp`; o único achado é o `>` de um `print` do `awk`.
- Execução em pseudoterminal por 12 s com SIGINT (`panel-pty-run.txt`): 3 atualizações, cursor restaurado ao sair (o código 124 do `timeout` é o do próprio `timeout`; o painel encerra com 0 pelo `trap`), nenhum processo residual.
- Instantâneos antes/depois (`state-before.txt` × `state-after.txt`, idênticos): propriedades dos timers e serviços (incluindo `LastTrigger`, `NextElapse`, `Persistent`, `InvocationID`), `Linger`, units instaladas e seus SHA-256, e toda a árvore `~/.eiah-aws/backup-a-auto` com tipo, tamanho, mtime e **ctime** de cada arquivo, mais SHA-256 de `backup-a.env`, `backup-a.sh` e `backup-a-run.sh`. Conclusão: abrir e fechar o painel não alterou timers, serviços, backups nem configuração.
- `backup-location.txt`: os 3 `.age` de `BA-AUTO-daily-20261017T110000746Z-7c3750` existem e têm tamanho igual ao do recibo (103.477.219 / 316.686 / 27.767 B).

## 4. Limites
O painel só reflete o estado do WSL; não consulta o S3 nem prova upload. O "último disparo/execução" do systemd é volátil (zera se o gerenciador de usuário reiniciar); a captura em disco continua visível pelos runs. Com `Linger=no` o gerenciador pode parar sem sessão aberta.
