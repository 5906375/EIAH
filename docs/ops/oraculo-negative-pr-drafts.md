**Atualização 24/09/2026:** sequência baseada em main, sem dependência do PR #446. Ver relatório de separação em ops/evidence/latest/oraculo-main-separation-2026-09-24.md. As minutas abaixo são o conteúdo proposto, não comprovante de publicação.

# Minutas locais de PR — não publicadas

## PR dedicado 1: Ratificar códigos de resultado negativo do Oráculo SC para SIMULATION

Os 28 candidatos RV e dois refinamentos FT03 ainda não tinham promoção canônica. Esta alteração candidata registra a ratificação recebida na sessão, owner/approver Carlos Alberto Merlo e os 30 tokens ativos exclusivamente na proposta local de simulação. A origem da aprovação deve ser conferida no PR; o arquivo de contexto não é assinatura digital. Nenhuma ativação operacional ou fechamento de G3/G5.

Validação: testes do catálogo e checker canônico passam no conjunto local; os testes do preview da matriz correspondem aos 30 tokens. Publicação, revisão e merge pendentes. Primeiro revisar este PR; implementação depende dele.

## PR 2: Persistir negativas e recuperar holds sem reavaliar material

Uma avaliação negativa antes permanecia em PROCESSING sem C5. Com a matriz ratificada, DENIED, REVIEW_REQUIRED e CONFLICT chegam a FINAL sem modificar a visita. C3 é gravado somente para a credencial explicitamente atribuída. A recuperação explícita usa avaliação/snapshot auditados, preserva o registro original e acrescenta auditoria própria; repetição e concorrência preservam o mesmo resultado.

Validação local: 79 testes puros/contratuais e 44 integrados, dois typechecks, catálogo e Prisma. Testes incluem rollback, perda de resposta após COMMIT, adulteração, autoridade revogada e concordância SQL/mapper de todos os findings finalizáveis. Não prova runtime real, cadeia histórica completa, instalação compartilhada ou deploy. RV27 sem prova de ausência de efeito permanece bloqueado.
