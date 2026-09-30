# P1 — protótipo de persistência transacional

Status: parcial; não conectado a escritores de produção. ADR-009 permanece Proposta.

## Entrega

- Adaptador Prisma injetado `persistP1RunTransition`, reutilizando o contrato puro existente.
- Lock da run e conferência de tenant/workspace reais antes das escritas.
- Verificação da cadeia incluída, sequência esperada e estado atual; evento inicial ausente bloqueia.
- Atualização da run, inserção do evento e payload durável da outbox na mesma transação.
- Digest calculado sobre campos do comando e JSON efetivo; retry idêntico retorna recibo histórico.
- Timestamps UTC com precisão de milissegundos. `declared_at` é declaração; `recorded_at` não é hora de commit.
- Migração adicional protege transições contra UPDATE/DELETE/TRUNCATE e identidade/payload da outbox contra mutação. Marcadores de tentativas/publicação têm atualização limitada.
- Nove testes em PostgreSQL dedicado, sem fallback para a URL operacional.

## Execução local

Na raiz do repositório, após aplicar o patch:

```bash
bash scripts/testP1RunTransitionPersistence.sh
```

O runner usa a imagem local `pgvector/pgvector:pg16`, cria um contêiner novo com porta apenas em 127.0.0.1, aplica as migrações, executa typecheck focado e testes e remove contêiner/volume ao terminar. Usa o cliente Prisma gerado já existente para os modelos de tenant/workspace/run e SQL parametrizado para as tabelas novas. Não importa o singleton de banco em runtime.

O resultado fica em `/tmp/eiah-p1-transition-evidence.XXXXXX/`: log, hashes dos arquivos e JSON com código de saída e limpeza. Resultados devem ser inspecionados e preservados antes de qualquer registro no Evidence Index. A preparação do runner não comprova execução dos testes.

## Limites

- As fixtures criam run e evento inicial na mesma transação; o criador real ainda não foi adaptado.
- Escritas diretas em Run continuam possíveis. Triggers de imutabilidade não obrigam cada escritor a gerar evento; cobertura deve ser implementada e testada depois.
- A estrutura SQL não impede por si só toda lacuna ou contradição de sequência na inserção. O adaptador verifica a cadeia incluída antes de acrescentar uma transição.
- Proprietários/superusuários podem alterar DDL/desabilitar triggers. Não há atestação independente, watermark ou prova de completude.
- A API do adaptador é interna e requer chamador já autorizado; conferir escopo não substitui autorização do tenant.
- Outbox persistida não comprova entrega nem execução única. Despachante, deduplicação durável do consumidor e falha entre publicação e ack seguem pendentes.
- O recibo `publishIntent` descreve a intenção original; não informa o estado atual de entrega nem deve disparar publicação diretamente.
- Leitura completa da cadeia por run neste protótipo deve ser avaliada quanto a volume antes da integração.

`historyVerification` e `stateAtCutoffVerification` permanecem `not_demonstrated`; elegibilidade operacional bloqueada. Nenhuma promoção de CI, operações reais ou retorno P1/P2.
