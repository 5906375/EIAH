# eiah-imob-chat-onboarding-plan

Status: proposto  
Prioridade: P1 de UX operacional / onboarding  
Data de referência: 2026-05-27  
Escopo: fazer o `EIAH` explicar de forma canônica e operacional como usar o chat IMOB, preservando arquitetura `agent-driven`, `launcher render-only` e sem criar heurística nova na UI.

---

## 1. Objetivo

Permitir que o usuário pergunte ao `EIAH` como usar o chat IMOB e receba uma resposta curta, prática e acionável.

A resposta ideal deve:

- explicar o que o chat IMOB faz;
- dizer como começar;
- mostrar exemplos reais de mensagens válidas;
- orientar o próximo passo sem exigir que o usuário descubra a navegação sozinho.

---

## 2. Perguntas canônicas

O runtime do `EIAH` deve reconhecer pelo menos estas perguntas:

- `Como usar o chat IMOB?`
- `Como começo no IMOB?`
- `O que eu posso fazer no chat IMOB?`
- `Como captar um imóvel no chat IMOB?`
- `Como continuar um caso imobiliário no chat IMOB?`
- `Como gerar proposta, contrato ou follow-up no IMOB?`
- `Quando o IMOB mostra o próximo passo sozinho?`

Perguntas derivadas aceitáveis:

- `Como funciona o IMOB no EIAH?`
- `Como usar o IMOB para captação?`
- `Como usar o IMOB para proposta?`
- `Como consultar um caso no IMOB?`

---

## 3. Formato da resposta do EIAH

O `EIAH` deve responder em formato operacional curto:

1. `o que o chat IMOB faz`
2. `como começar`
3. `exemplos de mensagens`
4. `qual é o comportamento esperado do chat`
5. `atalho opcional para abrir o IMOB`

Estrutura esperada:

- bloco 1:
  - o IMOB conduz captação, proprietário, documentos, visitas, follow-up, proposta e contrato
- bloco 2:
  - dizer ao usuário para começar com objetivo em linguagem natural
- bloco 3:
  - mostrar 4 a 6 prompts reais
- bloco 4:
  - explicar que o chat tenta devolver o próximo passo dominante
- bloco 5:
  - se apropriado, oferecer:
    - abrir o Chat IMOB
    - ou começar já com uma mensagem pronta

Tom esperado:

- direto
- pouco burocrático
- orientado a negócio
- sem explicação longa de arquitetura

---

## 4. Exemplos de prompts para o usuário

Exemplos canônicos que o `EIAH` pode sugerir:

- `quero captar um apartamento de 2 quartos em Itajaí para locação`
- `cadastrar proprietário do imóvel da Rua 700`
- `mostrar bloqueios do caso`
- `qual o próximo passo desse caso?`
- `preparar proposta deste caso`
- `acompanhar resposta da proposta`
- `preparar contrato deste caso`
- `consultar caso do lead Maria`

Exemplos por etapa:

### Captação

- `fazer varredura de mercado em Itajaí para apartamentos de 2 quartos para locação`
- `cadastrar um imóvel para locação em Balneário Camboriú`

### Proprietário

- `cadastrar proprietário deste imóvel`
- `documento do proprietário João Silva 12345678900`

### Documentos

- `revisar documentos deste caso`
- `o que falta para seguir com o contrato?`

### Visita e follow-up

- `agendar visita para sexta à tarde`
- `registrar resultado da visita`
- `retomar follow-up deste caso`

### Proposta e contrato

- `preparar proposta deste caso`
- `responder contraproposta deste caso`
- `encaminhar proposta aceita para contrato`

---

## 5. Estratégia de implementação

### Camada 1 — base canônica

Adicionar entradas novas em:

- `apps/api/src/services/eiahHelpKnowledge.ts`

Conteúdo mínimo:

- `Como usar o chat IMOB?`
- `Como começar uma captação no IMOB?`
- `Como continuar um caso imobiliário no chat IMOB?`
- `Quais mensagens eu posso usar no IMOB?`

### Camada 2 — contrato do EIAH

Fazer o `EIAH` reconhecer a intenção de onboarding IMOB como uma intenção própria de ajuda operacional.

Resultado esperado:

- o `EIAH` responde sem depender de copy estática do frontend;
- a resposta pode oferecer handoff ou link para abrir o IMOB;
- a resposta continua auditável e coerente com o help canônico.

### Camada 3 — handoff opcional

Quando houver contexto suficiente, o `EIAH` pode concluir com um atalho:

- `Abrir Chat IMOB`
- ou uma sugestão de mensagem inicial pronta

Exemplo:

- `Se quiser, já comece com: "quero captar um imóvel para locação em Itajaí".`

---

## 6. Critério de saída

Considerar a implementação pronta quando:

- o `EIAH` responder corretamente a perguntas de onboarding IMOB;
- a resposta explicar uso prático, não só descrição do produto;
- o usuário receber exemplos reais de prompts;
- o fluxo não depender de nova lógica no `ChatAgentLauncher`;
- o `EIAH` conseguir orientar o usuário para continuar um negócio imobiliário com próximo passo claro.

---

## 7. Fora de escopo

- redesenho visual do launcher
- tutorial em múltiplas telas
- automação visual nova na UI
- mudança de responsividade
- alterar o ownership do `IMOB_Orchestrator`
