# Código de Conduta para Uso de IA — EIAH

Versão documental: v1
Data de referência: 2026-07-30
Status normativo: Proposta

## 1. Propósito

Este código define responsabilidades mínimas para pessoas e agentes que desenvolvem, administram, revisam ou operam IA no EIAH. Deve ser lido com `docs/governance/ai-usage-policy.md`.

Sua existência não declara conformidade nem certificação ISO/IEC 42001 e não transforma controles parciais ou propostos em capacidades operacionais.

## 2. Deveres comuns

Todos os participantes devem:

- atuar somente dentro de finalidade, papel, tenant, workspace, scope e autorização válidos;
- proteger PII, credenciais, segredos e dados comerciais;
- comunicar limitações, incerteza, conflito de fontes e ausência de evidência;
- preservar reason codes, proveniência e trilha auditável;
- impedir discriminação, manipulação, fraude, assédio e uso ilegal;
- oferecer revisão ou contestação humana quando houver impacto material;
- reportar incidentes e não ocultar falhas para manter gate verde;
- distinguir capacidade evidenciada, parcial e proposta.

## 3. Operadores

Operadores devem:

- confirmar ambiente, tenant/workspace, finalidade e janela operacional antes de iniciar automação;
- seguir runbooks e limites de policy aplicáveis;
- não inserir PII ou segredo em prompt, log, receipt ou evidência sem necessidade e autorização;
- monitorar efeitos, duplicidade, bloqueios e sinais de incidente;
- interromper a operação quando um guard obrigatório estiver ausente ou inconsistente;
- escalar para administrador ou revisor humano em vez de contornar bloqueio;
- não presumir auto-rollback: o controle está proposto e não implementado.

Operadores não podem promover experimento, policy, agente ou vertical usando somente resultado aparente do modelo ou métrica não medida.

## 4. Administradores

Administradores devem:

- aplicar menor privilégio a roles, scopes, entitlements e ferramentas;
- manter separação entre tenants e workspaces;
- versionar policies e contratos e preservar critérios fail-closed;
- definir owners, approvers e canais de incidente;
- revisar acessos e revogar permissões obsoletas;
- evitar fallback permissivo em conexão, autorização ou policy;
- não anunciar handler, rollback, integração ou proteção que não exista no runtime;
- manter propostas claramente marcadas até implementação, teste e evidência.

## 5. Revisores humanos

Revisores devem:

- avaliar finalidade, risco, dados, policy, Trust Score, reason code, evidência e efeitos esperados;
- verificar se a aprovação está dentro do próprio tenant/workspace e prazo;
- rejeitar decisão sem contexto suficiente ou com conflito não resolvido;
- conferir semanticamente citações `arquivo:linha`; o gate do Evidence Index valida path, não fidelidade;
- tratar telemetria hardcoded como dado inválido para recorrência;
- documentar decisão, justificativa, condições e eventual expiração;
- evitar conflito de interesse e, quando a régua exigir, não revisar a própria mudança;
- exigir nova revisão após mudança material de escopo, modelo, dado, policy ou risco.

Aprovação humana deve ser explícita. Ausência de resposta, merge automatizado ou gate estrutural verde não equivale a approval.

## 6. Agentes e automações

Agentes devem:

- obedecer ao contrato do agente, à policy e aos limites de ferramenta;
- falhar fechado quando faltar identidade, tenant, workspace, scope, entitlement, policy ou aprovação obrigatória;
- pedir clarificação quando a ambiguidade alterar risco ou autoridade;
- não inventar permissão, owner, aprovação, evidência, fonte, receipt ou resultado de execução;
- não ampliar o escopo da solicitação nem executar ação externa material sem autoridade;
- aplicar masking conforme a policy antes de enviar dados ao modelo ou persistir conteúdo;
- preservar reason codes governados ao atravessar fronteiras;
- não tratar código `proposed` como `active`;
- entregar ao humano a decisão quando o contrato ou o risco assim exigir;
- informar quando uma capacidade, inclusive rollback, for somente proposta.

Limites absolutos de autonomia:

- não conceder acesso ou alterar RBAC por inferência;
- não aprovar a própria ação;
- não publicar, contratar, pagar, assinar, comunicar externamente ou produzir efeito crítico fora de fluxo explicitamente autorizado;
- não desativar gate, masking, SCL, ledger ou receipt para concluir uma tarefa;
- não substituir julgamento profissional humano em decisão jurídica, financeira, de segurança ou com impacto material.

## 7. Desenvolvimento e assistentes de coding

Quem altera o repositório deve:

- seguir `CODEX.md`, `CLAUDE.md`, `AGENTS.md`, `IA_EIAH.md` e o roadmap canônico;
- preservar fonte única, contratos versionados e arquitetura agent-driven;
- editar somente o escopo autorizado e não misturar worktree de terceiros;
- usar fonte TypeScript versionada nos checks críticos;
- executar gates proporcionais ao risco e relatar os não executados;
- não atualizar o Evidence Index com promessa ou arquivo inexistente;
- corrigir causa raiz em vez de silenciar detector;
- parar sem push quando essa for a instrução.

## 8. Condutas proibidas

É proibido:

- usar IA para fraude, perseguição, discriminação ou acesso indevido;
- expor PII, segredo, credencial ou URL sensível sem necessidade;
- criar evidência fictícia ou reclassificar proposta como implementação;
- contornar tenant/workspace, RBAC, entitlement, policy, approval ou Trust Score obrigatório;
- atribuir decisão humana a agente;
- usar receipt, SCL ou ledger como substituto de autorização;
- prometer auto-rollback sem handler implementado;
- declarar conformidade ou certificação ISO/IEC 42001 com base nestes documentos.

## 9. Incidentes, contestação e consequências

Qualquer participante deve reportar desvio ao owner humano aplicável e preservar evidência mascarada. A resposta deve priorizar contenção, proteção das pessoas afetadas, investigação, correção de causa raiz e revalidação.

Violações podem resultar em bloqueio da automação, revogação de acesso, revisão obrigatória, reversão manual quando disponível e ação corretiva organizacional. Este documento não cria mecanismo automático de sanção ou rollback.

## 10. Revisão e adoção

O ciclo de melhoria segue Plan-Do-Check-Act:

1. planejar finalidade, risco, papéis e controles;
2. executar dentro do escopo;
3. verificar logs, evidência, incidentes e impacto;
4. agir sobre gaps e revalidar.

Este código permanece **Proposta** até adoção humana explícita. Sua criação é artefato documental, não evidência de cumprimento recorrente.
