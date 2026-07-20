# Existing Structure Preflight

## Objetivo

Antes de propor, criar ou alterar contrato, runtime, resolver, surface, telemetria ou trilha de auditoria, o autor deve comprovar se o repositorio ja possui estrutura reutilizavel. O preflight evita contratos paralelos, duplicacao de fontes de verdade e logica cognitiva na UI.

## Fontes minimas

Consultar, conforme o escopo:

- `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`, `AGENTS.md` e `docs/architecture/agent-chat-runtime.md`;
- `contracts/`, schemas, baselines, exemplos e policies de versionamento;
- contratos e tipos do agente, `chatLauncherEngine`, resolvers verticais e presentation snapshots;
- `packages/core`, Policy Engine, reason codes e tipos de resultado de governanca;
- Receipt Canon, ledger, run bundle, approval/HITL e proof adapters;
- rotas, services, Prisma models, eventos e infraestrutura de telemetria existentes;
- testes, package scripts, gates de CI, Evidence Index e evidencias fisicas;
- rotas e superficies atuais, incluindo deep links, threads, entity refs e persistencia.

O inventario deve usar busca por simbolo e por conceito. Ausencia por nome nao prova ausencia funcional.

## Matriz de decisao

| Decisao | Quando usar | Evidencia exigida |
| --- | --- | --- |
| Reutilizar | A estrutura existente ja atende ao contrato e aos invariantes. | Simbolo, arquivo, testes e limites conhecidos. |
| Estender | O contrato e canonico e aceita evolucao aditiva compativel. | Impacto, versionamento, baseline e consumidores. |
| Adaptar | A estrutura e valida, mas precisa de adapter entre ownership boundaries. | Origem, destino, transformacao e fail-closed. |
| Substituir com justificativa | A estrutura existente e incompatível, insegura ou obsoleta. | Gap comprovado, migracao, rollback e deprecacao. |
| Nao aplicavel | Nao existe estrutura relevante no recorte. | Buscas realizadas e paths inspecionados. |

## Bloqueios P0

E bloqueio P0 criar contrato, runtime, ledger, receipt, policy result, reason-code registry, thread model ou malha de chat paralela sem inventario de reuso aprovado. Tambem e P0 usar URL, `activeDomain` ou estado visual como autorizacao.

`ChatAgentLauncher` permanece `render-only`: agente define, engine executa e launcher renderiza. Telemetria no launcher pode apenas transportar sinais observacionais ja resolvidos pelo engine ou pela rota.

Auditoria critica deve reutilizar Receipt Canon, ledger, bundle e reason codes canonicos quando aplicavel. Telemetria de produto nao substitui receipt, ledger ou audit trail de execucao critica.

## Caso 7 canonico

**Caso 7 - continuidade multi-vertical na mesma thread:** usuario inicia com intencao IMOB de inventario, recebe resposta da vertical, depois pede analise juridica relacionada ao mesmo imovel/`entityRef`. O engine deve trocar para LEGAL com governanca reavaliada, preservar contexto, nao resetar a conversa e bloquear fail-closed se faltar tenant/workspace/entitlement/policy.

## DoD para autorizar PR funcional

- inventario preenchido com decisao por candidato existente;
- owner do comportamento e contrato do agente identificados;
- impacto em contratos, versionamento, consumers e gates definido;
- tenant/workspace/scope/entitlement/RBAC/policy/HITL avaliados;
- thread, contexto e `entityRef` preservados quando aplicavel;
- fallback, limite de clarificacao e reason codes definidos;
- plano de testes unitarios, integracao e E2E, incluindo Caso 7;
- migracao e rollback descritos para estruturas substituidas;
- confirmacao de ausencia de regra cognitiva no launcher;
- evidencia prevista separada de evidencia ja gerada.

Enquanto esse DoD nao estiver satisfeito, PR 1+ da frente de orquestracao permanecem bloqueados.
