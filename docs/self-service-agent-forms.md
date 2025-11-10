# Self-Service Agent Forms

Guia rápido sobre como os formulários self-service foram montados e como estender novos agentes.

---

## Visao Geral
- **Objetivo:** permitir que usuarios finais disparem agentes especializados sem depender do painel interno.
- **Fluxo:** usuario preenche o formulario -> front monta payload canonico -> `POST /api/runs` -> feedback na tela -> historico no Mission Control.
- **Publico:** times internos ou clientes que precisam de respostas recorrentes (marketing, jornada 360, risco etc.).

---

## Estrutura de Codigo
```
apps/web/src/pages/self-service/
  ├─ index.tsx                  # catalogo com todos os agentes
  ├─ router.tsx                 # resolve slug -> componente
  ├─ generic.tsx                # formulario generico baseado em config
  ├─ mkt.tsx                    # formulario customizado
  ├─ j360.tsx                   # formulario customizado
  ├─ config.ts                  # definicao de campos e prompt
  └─ components/
       ├─ AgentFormShell.tsx
       ├─ EstimateBadge.tsx
       ├─ RunStatusCard.tsx
       └─ SelfServiceNav.tsx
```

### AgentFormShell
Responsavel por:
- buscar metadados do agente (`apiListAgents`);
- calcular estimativa com `apiEstimateCost`;
- enviar `POST /api/runs`;
- exibir status (executando, erro, sucesso) e o ultimo retorno.

### Configuracoes
`config.ts` descreve agentes genericos com lista de campos e funcao `buildPrompt`. Se precisar de experiencia personalizada, marque `kind: "custom"` e implemente um componente dedicado (caso MKT e J_360).

---

## Como adicionar um agente
1. **Config:** inclua um item em `config.ts` com `slug`, `agentId`, `label`, `title`, `description`, campos e `buildPrompt`.
2. **Custom UI (opcional):** se o agente precisar de interacoes especiais (chips, multiselect), crie um arquivo novo em `self-service/` e mantenha `kind: "custom"`.
3. O roteador (`router.tsx`) ja detecta pelo slug e renderiza o formulario apropriado.
4. Teste executando o formulario e validando o run salvo em `/app/runs`.

---

## Exemplo de payload
```json
{
  "agent": "MKT",
  "prompt": "Voce e o MKT GPS. ...",
  "metadata": {
    "mode": "self-service",
    "form": { "goal": "...", "channels": ["Redes sociais"] },
    "rawPayload": { ... }
  }
}
```

Resposta `201` retorna o registro criado em `runs`, consumido pelo `RunStatusCard`.

---

## Segurança
- Requer `Authorization: Bearer {token}` e `x-project-id` (ja aplicado no helper `http`).
- Considere rate limiting ou recaptcha para portais publicos.
- Quando houver efeitos externos (mint, assinatura, disparo de e-mail), recolha aceite explicito.

---

## Catalogo atual
- **Custom:** MKT, J_360.
- **Genericos:** Flow Orchestrator, Risk Analyzer, On-chain Monitor, I_BC, Diarias, NFT_PY, ImageNFTDiarias, DeFi_1, Pitch, EIAH Core.

---

## Proximos passos sugeridos
1. Adicionar validacoes especificas (mascara de moeda, selects reutilizaveis).
2. Registrar `userId` ou `source` em `metadata` para auditoria.
3. Criar testes E2E rapidos verificando se cada slug gera prompt nao vazio.
4. Opcional: renderizar preview do resultado assim que o run terminar.
