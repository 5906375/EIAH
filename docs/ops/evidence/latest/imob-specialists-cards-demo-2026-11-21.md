# IMOB — Cartões dos especialistas na demonstração

- Base `899528d7bf92b373553f52d6adf2f1d9917b469b` (PR #543).
- Ambiente: prévia HTTP local no Chromium. Os testes da jornada usaram um registro de demonstração separado, apenas na cópia da prévia.

| Verificação executada | Resultado observado |
| --- | --- |
| Visitante sem vitrine publicada | Os cartões do J_360 e do FinNexus aparecem. O botão de revisão permanece indisponível nessa etapa e a página explica como liberar a contratação simulada. |
| Carregamento dos retratos | Os dois WebP de 384 × 384 foram decodificados no navegador e exibidos quadrados em uma janela de desktop. |
| Revisão e ativação na demonstração | Depois de publicar, a revisão do J_360 exibiu o acesso previsto, a contratação exigiu confirmação e a ativação registrou o estado simulado. Também foi aberto o escopo do FinNexus e verificada a passagem de contratado a ativo com um registro de demonstração anterior. |
| Validações locais | `node --check`, `git diff --cached --check` e `wrangler deploy --dry-run --config apps/site/wrangler.jsonc`. O Wrangler reconheceu 92 arquivos estáticos. |

## Inclusão do Radar Social

- O módulo da página foi executado em Node com DOM e armazenamento simulados. O teste confirmou os três cartões, o escopo do Radar, o bloqueio antes da publicação e a sequência de revisão, contratação e ativação simuladas. A releitura do registro preservou a ativação anterior do J_360.
- O retrato do Radar foi validado como WebP de 384 × 384. O Wrangler 4.165.0 reconheceu os 93 arquivos estáticos no modo `--dry-run`. O Chromium local foi bloqueado por uma restrição a sockets Unix, portanto a validação visual do terceiro cartão no navegador ficou pendente.

Escopo: apresentação e simulação dos especialistas no navegador. A verificação não envolve execução de agentes, cobrança ou publicação no domínio público.
