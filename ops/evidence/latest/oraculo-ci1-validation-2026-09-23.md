# Oráculo CI1 — evidência local sintética

Data documental: 23/09/2026. Agente Codex, sem subagentes. Autorização na conversa: seguir com CI1 e validação local isolada; versionamento local após revisão. G3/G5 continuam abertos. Status do protocolo positivo sintético: evidenciado; contrato integrado completo: parcial.

Baseline: 7cf108b0d68383d2d50cc0beb31f6fac6f03eae9, branch work/oraculo-ci1-isolated. Trabalho S1/início CI1 preservado previamente por 2b1cdf4. A main mudou durante a continuidade; este trabalho foi reaplicado em worktree isolada sem alterar a main. Nenhum push, merge em main ou deploy realizado.

## Execuções

- 73 testes puros/contratuais e regressões selecionadas PRE_DUIMP: passaram.
- 31 testes integrados: passaram em PostgreSQL 160011.
- Dois typechecks sem emissão: contratos e CI1, passaram.
- git diff --check e git diff --cached --check: passaram.
- Prisma validate e generate executados com prisma.oraculo-ci1.config.ts: schema válido e client v7.2.0 gerado localmente. Esses comandos não acessaram banco existente.

Comandos, saídas e hashes: [checagens finais](oraculo-ci1-validation/final-checks.json). Execução integrada final: [resultados e isolamento](oraculo-ci1-validation/0217ce05-30ae-47db-854e-f716e5549a6e/results.json). Rodadas anteriores de 20 e 29 testes no mesmo diretório são históricas, anteriores ao diff final.

Imagem local: sha256:05c1acb89ae44b0bc936fdad9c7bcf32a2300ef1dbab9407bb6dd12eaee1c8c3. Imagem resolvida por identidade, sem pull. Contêiner exclusivo, porta efêmera loopback, tmpfs, marcador de execução, quatro logins restritos e owner NOLOGIN. Sem heranças entre papéis de runtime. Contêiner final removido após conferência de identidade; sem volumes existentes. Credenciais sintéticas efêmeras não constam da evidência.

## O que foi demonstrado

Persistência da intenção/HI, E1 normalizado, A1 genérico persistido separado, revisão de visita, C5 positivo e auditoria com materiais resolvidos. Resultado e efeito simulados são indivisíveis. Barreiras global/tenant com revalidação sob READ COMMITTED; contexto ligado a conexão/transação; bloqueio de DML/DDL/helper/escalada de role; revogação/revisor/instalação; concorrência de intenções; provas IN/OUT; falhas depois de writes indispensáveis; recuperação por outra conexão após resposta de COMMIT perdida. ApprovalRecord legado permanece LEGACY e inelegível.

O teste de resposta perdida injeta erro no client após um commit real; não simula partição física de rede, crash/restart do servidor ou perda de disco. A execução usou baseline mínimo do ApprovalRecord para aplicar a migration nova, não toda a cadeia de migrations de um ambiente existente.

## Limites materiais

Negativas/revisão/conflitos são avaliações duráveis imutáveis, com tracking PROCESSING e sem C5, enquanto o mapper de reasonCodes não estiver ratificado. Isso não implementa o contrato completo de C5 negativo nem significa worker ativo. Mesma intenção não é reavaliada silenciosamente; nova avaliação exige nova intenção. Nenhum código ORACULO_* foi ativado no canon.

Executor e autenticador sintético são confiáveis dentro do limite FC01/IT. Não há prova de correção contra executor comprometido. Rotas legadas, autenticação real, escritores operacionais/externos, integração física, runtime de produção, retenção/limpeza e rollout não foram integrados. CI completo e migrations no banco existente não executados. G3/G5 não encerrados.

Ver [runbook e limites](../../../docs/ops/oraculo-ci1.md). Funções/repositório/recuperação foram mantidos num módulo coeso transactionExecutor.ts, com interfaces de conexão explícitas, em vez de fragmentar módulos vazios. Rotinas de armazenamento são SQL controlado; não há acesso ORM de runtime novo nem alegação de proteção de SQL raw pelo tenantGuard.

## Gate documental remanescente

Os dois testes unitários de checkEvidenceIndex passaram. O checker global falhou com uma referência ausente: `packages/core/node_modules/@eiah`, em narrativa histórica F1.6b, linha 396 do índice. A mesma referência está no HEAD-base; a pasta de dependência não existe nesta worktree. Não foi criado diretório fictício, alterado checker ou reescrito histórico para obter verde. [Saída real](oraculo-ci1-validation/index-check.json). Não houve execução comparativa do checker numa árvore-base limpa; a origem histórica da referência foi verificada por git show HEAD.

Esse gate continua falhando; o commit local não equivale a aprovação para merge. As referências novas de CI1 existem e os hashes do código validado foram reconferidos.
