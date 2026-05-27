# eiah-imob-chat-onboarding-plan (v8-Hardened)

Status: proposta operacional  
Prioridade: P1 de UX operacional / alinhamento de contexto  
Data de referência: 2026-05-27  
Escopo: formalizar no `EIAH` a capacidade nativa de onboarding operacional e descoberta de uso do Chat IMOB, preservando arquitetura `agent-driven`, `launcher render-only`, governança `fail-closed` e acoplamento ao runtime real de capabilities, contracts e policies.

---

## 1. Objetivo

Permitir que o usuário pergunte ao `EIAH` como usar o chat IMOB e receba uma resposta:

- curta;
- operacional;
- auditável;
- coerente com as capacidades reais do runtime;
- sem sugerir ações que o sistema não possa executar.

O onboarding deve deixar de ser “página de ajuda” e passar a ser capacidade reflexiva dos próprios agentes, com o `EIAH` como front door e o IMOB como domínio operacional resolvido em backend.

---

## 2. Invariantes

### 2.1 Zero Hardcoded Copy no frontend

O frontend não pode conter texto solto, prompt inventado ou decisão local sobre como usar o IMOB.

Regra:

- conteúdo canônico fica no backend;
- prompts sugeridos vêm do resolver;
- prompts só aparecem se a capability correspondente estiver ativa e permitida.

### 2.2 Launcher Render-Only

O `ChatAgentLauncher` não decide se um prompt é válido.

Regra:

- launcher apenas renderiza:
  - `summary`
  - `startingInstruction`
  - `suggestedPrompts`
  - `systemBehaviorNote`
  - `handoffShortcut`

### 2.3 Escopo de skills blindado

Os prompts exibidos ao usuário devem espelhar estritamente as capacidades reais do runtime.

Regra:

- nenhum prompt pode apontar para capability inexistente;
- nenhum prompt pode sobreviver a kill-switch ativo;
- nenhuma ação sensível pode aparecer sem gate de policy/HITL.

---

## 3. Princípio arquitetural

Fluxo recomendado:

`Usuário -> EIAH -> intentRouter -> imobOnboardingResolver -> capabilityRegistry + contracts + entitlement/policy gates -> onboarding response contract -> launcher`

Regra:

- quem reconhece a pergunta inicial é o `EIAH`;
- quem resolve o conteúdo IMOB é o `imobOnboardingResolver`;
- quem renderiza é o launcher.

O `IMOB_Orchestrator` não deve virar front door do onboarding. Ele continua sendo owner da execução operacional do caso.

---

## 4. Intenções canônicas

```ts
export enum ImobOnboardingIntent {
  GENERAL_HELP = "imob.intent.help.general",
  CAPTURE_HELP = "imob.intent.help.capture",
  DOCUMENT_HELP = "imob.intent.help.document",
  TRANSACTION_HELP = "imob.intent.help.transaction",
  NEXT_ACTION_QUERY = "imob.intent.help.next_action",
}
```

Perguntas-alvo:

- `Como usar o chat IMOB?`
- `Como começo no IMOB?`
- `O que posso fazer no chat IMOB?`
- `Como captar um imóvel no chat IMOB?`
- `Como continuar um caso imobiliário no chat IMOB?`
- `Como gerar proposta, contrato ou follow-up no IMOB?`
- `Quando o IMOB mostra o próximo passo sozinho?`

---

## 5. Contrato de resposta

Arquivo sugerido:

- `apps/api/src/services/eiah/contracts/imobOnboardingResponse.v1.ts`

```ts
export type ImobOnboardingResponse = {
  intent: ImobOnboardingIntent;
  summary: string;
  startingInstruction: string;
  suggestedPrompts: {
    label: string;
    prompt: string;
    targetAgent: string;
    capabilityId: string;
    requiredAutonomyLevel: number;
    riskTier: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    requiresHumanApproval: boolean;
    executable: boolean;
  }[];
  systemBehaviorNote: string;
  handoffShortcut?: {
    actionLabel: string;
    preloadedMessage: string;
    route: "/app/imob/chat" | string;
    allowed: boolean;
    reasonCode?: string;
  };
  governance: {
    registryVersion: string;
    agentContractVersion: string;
    entitlementChecked: boolean;
    killSwitchAware: boolean;
  };
};
```

---

## 6. Requisitos funcionais

O onboarding deve:

- responder a perguntas de uso do IMOB;
- explicar o que o chat IMOB faz;
- mostrar como começar;
- sugerir prompts reais e executáveis;
- esconder prompts indisponíveis por capability/policy/kill-switch;
- oferecer handoff opcional apenas quando permitido;
- manter resposta curta e diretiva.

---

## 7. Requisitos não funcionais

Obrigatórios para prompts acionáveis:

- `tenantId`;
- `workspaceId`;
- entitlement IMOB válido para handoff;
- contract version conhecida;
- capability registry version conhecida;
- kill-switch state conhecido.

Regra:

- onboarding pode explicar mesmo sem entitlement;
- handoff acionável só aparece quando permitido.

---

## 8. Ordem de execução

### PR-IMOB-ONB-0 — Onboarding Resolver Core

Objetivo:

- criar resolver centralizado de onboarding IMOB.

Arquivo:

- `apps/api/src/services/imob/orchestrator/imobOnboardingResolver.ts`

Responsabilidades:

- receber `ImobOnboardingIntent`;
- consultar `imobCapabilityRegistry`;
- consultar contracts/profile cards;
- aplicar gates de entitlement/policy/kill-switch;
- montar `ImobOnboardingResponse`.

### PR-IMOB-ONB-1 — Prompt Matrix Alignment

Objetivo:

- homologar a matriz de prompts sugeridos.

Cada prompt deve carregar:

- `capabilityId`;
- `targetAgent`;
- `riskTier`;
- `requiresHumanApproval`;
- `executable`.

Matriz inicial homologada:

- Captação  
  Prompt: `Quero captar um apartamento de 2 quartos em Itajaí para locação`  
  Agente: `IMOB_PropertyAgent`

- Proprietário  
  Prompt: `Cadastrar proprietário do imóvel da Rua 700`  
  Agente: `IMOB_OwnerAgent`

- Deduplicidade  
  Prompt: `Checar duplicidade do lead Maria`  
  Agente: `IMOB_DedupeAgent`

- Documentos  
  Prompt: `O que falta para liberar o contrato deste caso?`  
  Agente: `IMOB_DocumentAgent`

- Visitas  
  Prompt: `Agendar visita para sexta-feira à tarde`  
  Agente: `IMOB_VisitAgent`

- Transação  
  Prompt: `Preparar proposta comercial para este caso`  
  Agente: `IMOB_Orchestrator`

### PR-IMOB-ONB-2 — Renderização segura

Objetivo:

- adaptar o consumo do payload estruturado sem nova heurística na UI.

Regra:

- o frontend só renderiza os campos do contrato;
- clique em prompt sugerido apenas preenche/envia a mensagem.

---

## 9. Formato da resposta do EIAH

Estrutura esperada:

1. o que o chat IMOB faz
2. como começar
3. prompts recomendados
4. comportamento esperado do runtime
5. handoff opcional

Exemplo recomendado:

`O Chat IMOB conduz a esteira imobiliária: captação, proprietário, documentos, visitas, proposta e contrato.`

`Para começar, escreva o objetivo do negócio em linguagem natural.`

`Prompts recomendados:`

- `quero captar um apartamento de 2 quartos em Itajaí para locação`
- `cadastrar documento do proprietário João Silva`
- `verificar o que falta para seguir com o contrato`
- `agendar visita com o lead Maria para sexta-feira à tarde`
- `preparar proposta comercial deste caso`

`Comportamento esperado: o IMOB devolve o resultado, mostra o que falta e indica o próximo passo dominante.`

`Próximo passo: abrir Chat IMOB com uma mensagem inicial.`

---

## 10. Regras de governança

### 10.1 Anti-drift

- `onboardingDrift = 0`
- nenhum prompt pode apontar para capability inexistente
- nenhum prompt pode vazar capability desativada

### 10.2 Entitlement

- nenhum `handoffShortcut` aparece sem entitlement válido;
- onboarding explicativo pode existir sem entitlement;
- onboarding acionável não.

### 10.3 HITL

Ações `HIGH` e `CRITICAL`:

- ou aparecem com aviso explícito de aprovação humana;
- ou são omitidas do onboarding público.

### 10.4 Render-only

- nenhuma tag HTML;
- nenhuma lógica visual embutida no payload;
- nenhum fallback heurístico no launcher.

---

## 11. Gates de CI

Obrigatórios:

- `pnpm test:imob-onboarding`
- `check:imob-onboarding-drift`
- `check:imob-onboarding-render-only`
- `check:imob-onboarding-entitlement`
- `check:imob-onboarding-autonomy-mapping`

Métricas:

- `onboardingDrift = 0`
- `invalidAutonomyMapping = 0`
- `renderLogicLeaked = 0`
- `invalidHandoffShortcut = 0`
- `disabledCapabilityPromptLeak = 0`
- `missingEntitlementGuard = 0`
- `nonExecutableSuggestedPrompt = 0`

---

## 12. Evidências requeridas

- `docs/plans/eiah-imob-chat-onboarding-plan-v8-hardened.md`
- `apps/api/src/services/eiah/contracts/imobOnboardingResponse.v1.ts`
- `ops/evidence/latest/imob-onboarding-capability-registry-smoke.md`
- `ops/evidence/latest/imob-onboarding-drift-gate-report.json`
- `ops/evidence/latest/imob-onboarding-render-only-report.md`
- `ops/evidence/latest/imob-onboarding-entitlement-gate-report.md`

---

## 13. Critério de saída

Considerar pronto quando:

- o `EIAH` responde onboarding IMOB a partir de capabilities reais;
- nenhum prompt sugerido aponta para agent/capability inexistente;
- nenhum prompt aparece sob kill-switch;
- nenhum handoff aparece sem entitlement;
- ações sensíveis respeitam HITL;
- launcher permanece render-only;
- resposta é curta, operacional e diretiva;
- evidência está indexada.

---

## 14. Integração com hardening atual

Conectar explicitamente ao `PR-FIX-IMOB-CONTINUITY-5`.

Regra:

- todo prompt sugerido no onboarding deve ser validado pela mesma verdade operacional que governa o próximo passo dominante do fluxo real.

Objetivo:

- onboarding e execução não podem contar histórias diferentes.

---

## 15. Próximos passos imediatos

1. rebaseline do nome para `v8-Hardened`
2. criar `ImobOnboardingIntent`
3. criar `ImobOnboardingResponse v1`
4. implementar `imobOnboardingResolver`
5. ligar resolver ao `EIAH`
6. adicionar gating de entitlement/policy/kill-switch
7. criar testes e gates de drift
8. indexar evidência
9. liberar em modo shadow antes de rollout amplo
