# promptReceitaMktLegal

## Objetivo

Este prompt usa [propostaLegal.md](/home/jusall/projects/EIAH_BUILDER/propostaLegal.md) como base para criar uma **recipe do agente MKT** no self-service `Briefing de Campanha`, com foco em:

- divulgar a futura `Vertical Legal` da EIAH;
- identificar, atrair e qualificar **escritórios de advocacia especializados** nas áreas jurídicas priorizadas;
- organizar um plano de campanha multicanal para captação de parceiros, early adopters e escritórios-piloto.

---

## Prompt mestre para criar a recipe

```text
Crie uma Tenant Recipe para o agente MKT, no formato estruturado de recipe homologável da EIAH, usando como base a proposta consolidada em propostaLegal.md.

Contexto:
A EIAH vai estruturar a Vertical Legal sobre o runtime já existente de Tenant Recipes, Recipe_Orchestrator, J_360, Guardian, HTML/PDF export, receiptCanon, bundle e ledger. Não estamos criando um runtime novo. O objetivo desta recipe é apoiar a divulgação comercial da Vertical Legal e a prospecção de escritórios de advocacia especializados nas áreas jurídicas priorizadas para o rollout.

Objetivo da campanha:
Montar um plano de campanha multicanal para divulgar a Vertical Legal da EIAH e buscar escritórios de advocacia especializados nas áreas que serão implementadas progressivamente, com foco inicial em:
- trabalhista
- contratual
- LGPD / privacidade

Expansão posterior:
- societário
- tributário
- compliance
- imobiliário jurídico
- consumidor
- propriedade intelectual
- regulatório
- ambiental / ESG
- penal empresarial
- previdenciário
- internacional
- licitações e contratos públicos

Público-alvo principal:
- sócios de escritórios boutique
- escritórios full service com prática empresarial
- bancas trabalhistas e consultivas
- escritórios especializados em LGPD/compliance
- escritórios que possam atuar como parceiros de implantação, canal comercial ou early adopters da Vertical Legal

Resultados esperados da campanha:
- posicionamento claro da Vertical Legal
- narrativa comercial por área prioritária
- segmentação dos perfis de escritório mais aderentes
- proposta de canais de aquisição e relacionamento
- plano de outreach / prospecção
- cronograma de campanha
- métricas de sucesso
- critérios para classificar escritório como lead quente, parceiro potencial ou piloto elegível

Requisitos da saída da recipe:
1. A recipe deve ser criada para o agente MKT.
2. A saída deve assumir o formato estruturado já usado pela EIAH:
   - title
   - summary
   - tags
   - goal
   - expectedOutcome
   - goCondition
   - blockCondition
   - steps[]
3. A recipe não deve prometer lançamento técnico da vertical, e sim campanha de divulgação e prospecção.
4. A recipe deve respeitar a arquitetura agent-driven e não inventar lógica nova de launcher.
5. A recipe deve considerar que a Vertical Legal ainda está em rollout incremental.
6. A recipe deve tratar a campanha como comercial/estratégica, não como parecer jurídico.
7. A recipe deve gerar steps práticos, claros e acionáveis, para o MKT organizar:
   - posicionamento
   - ICP / segmentação
   - canais
   - mensagem
   - cronograma
   - abordagem outbound
   - critérios de qualificação
   - KPIs

Formato obrigatório da resposta:

Agente:
MKT

Título:
[fornecer]

Resumo:
[fornecer]

Tags:
[fornecer]

Objetivo final:
[fornecer]

Resultado prático esperado:
[fornecer]

Etapas:
1. [nome da etapa]
   - objetivo
   - checks obrigatórios
   - evidências esperadas
   - bloqueia avanço: sim/não
2. [repetir]

Condição de GO:
[fornecer]

Condição de bloqueio:
[fornecer]

Tom desejado:
- executivo
- claro
- orientado a campanha B2B
- sem jargão técnico excessivo
- sem prometer capabilities ainda não homologadas
```

---

## Versão pronta para colar no composer de recipe

### Agente

```text
MKT
```

### Título

```text
Campanha de Divulgação e Prospecção — Vertical Legal EIAH
```

### Resumo

```text
Planeja uma campanha multicanal para divulgar a Vertical Legal da EIAH e atrair escritórios de advocacia especializados nas áreas priorizadas do rollout, com foco em posicionamento, segmentação, canais, outreach, qualificação de leads e definição de próximos passos comerciais.
```

### Tags

```text
mkt
vertical-legal
campanha
outbound-b2b
escritorios-advocacia
trabalhista
contratual
lgpd
parcerias
go-to-market
```

### Objetivo final

```text
Organizar uma campanha de marketing e prospecção B2B para divulgar a Vertical Legal da EIAH e identificar escritórios de advocacia especializados com maior aderência para parceria, piloto, canal comercial ou adoção inicial da solução.
```

### Resultado prático esperado

```text
A recipe deve entregar um plano de campanha multicanal com posicionamento, ICP, segmentação por especialidade jurídica, canais prioritários, narrativa comercial, plano de abordagem outbound, cronograma, métricas e critérios objetivos para qualificar escritórios como leads prioritários, parceiros potenciais ou candidatos a piloto.
```

### Etapa 1

#### Nome

```text
Posicionamento da Vertical Legal
```

#### Objetivo

```text
Definir a narrativa central da Vertical Legal da EIAH, deixando claro o problema que ela resolve, para quem ela faz sentido e qual é o diferencial frente a soluções genéricas.
```

#### Checks obrigatórios

```text
proposta de valor clara
mensagem central da campanha
diferencial competitivo compreensível
limites atuais do produto explicitados
áreas jurídicas prioritárias destacadas
```

#### Evidências esperadas

```text
resumo de posicionamento
mensagem principal
lista das áreas prioritárias do rollout
```

#### Bloqueia avanço

```text
sim
```

### Etapa 2

#### Nome

```text
ICP e segmentação de escritórios
```

#### Objetivo

```text
Definir quais tipos de escritório devem ser priorizados na campanha, separando perfis com maior aderência para piloto, parceria estratégica, distribuição ou adoção inicial.
```

#### Checks obrigatórios

```text
ICP principal definido
segmentação por porte e especialidade
segmentação por maturidade digital
priorização de trabalhista, contratual e LGPD
critérios para diferenciar lead frio, morno e quente
```

#### Evidências esperadas

```text
perfil ideal de escritório
segmentos prioritários
lista de especialidades jurídicas-alvo
```

#### Bloqueia avanço

```text
sim
```

### Etapa 3

#### Nome

```text
Canais e estratégia multicanal
```

#### Objetivo

```text
Definir os canais mais adequados para alcançar escritórios de advocacia especializados, combinando awareness, relacionamento e prospecção ativa.
```

#### Checks obrigatórios

```text
canais orgânicos definidos
canais outbound definidos
presença em LinkedIn considerada
email outreach considerado
eventos, comunidades ou associações avaliados
priorização por custo e velocidade de teste
```

#### Evidências esperadas

```text
lista de canais prioritários
justificativa dos canais
ordem de execução recomendada
```

#### Bloqueia avanço

```text
sim
```

### Etapa 4

#### Nome

```text
Mensagem, oferta e abordagem comercial
```

#### Objetivo

```text
Definir a mensagem comercial, a promessa permitida, a oferta inicial e o modelo de abordagem para contato com escritórios, sem overpromise e sem afirmar capacidades ainda não homologadas.
```

#### Checks obrigatórios

```text
mensagem comercial principal definida
oferta inicial clara
CTA coerente com estágio do produto
sem promessa de feature não homologada
abordagem por especialidade jurídica considerada
```

#### Evidências esperadas

```text
mensagem principal
CTA principal
modelo de primeiro contato
ângulos por especialidade
```

#### Bloqueia avanço

```text
sim
```

### Etapa 5

#### Nome

```text
Plano de outreach, cronograma e KPIs
```

#### Objetivo

```text
Transformar a estratégia em plano operacional com cadência, prioridades, métricas e critérios de qualificação de escritórios para campanha, parceria ou piloto.
```

#### Checks obrigatórios

```text
cronograma definido
cadência de outreach definida
KPIs principais definidos
critérios de qualificação definidos
critérios de piloto definidos
próximos passos comerciais definidos
```

#### Evidências esperadas

```text
cronograma de campanha
cadência de contato
KPIs de aquisição e conversão
critérios de qualificação e piloto
```

#### Bloqueia avanço

```text
sim
```

### Condição de GO

```text
o posicionamento da Vertical Legal está claro
os perfis de escritório prioritários estão definidos
os canais de aquisição e outreach foram priorizados
a mensagem comercial não promete capacidades ainda não homologadas
há cronograma, KPIs e critérios de qualificação suficientes para iniciar a campanha
```

### Condição de bloqueio

```text
não há clareza sobre o público-alvo prioritário
as áreas jurídicas prioritárias do rollout não estão definidas
a campanha depende de capabilities ainda não homologadas
não há diferenciação clara entre lead, parceiro e piloto
não há canais, cronograma ou métricas mínimas para execução
```

---

## Uso recomendado

Use esta recipe no self-service `MKT > Briefing de Campanha` para gerar:

- plano multicanal;
- narrativa por segmento jurídico;
- ICP de escritórios;
- plano de outreach;
- cronograma;
- KPIs;
- próximos passos comerciais para a Vertical Legal.

Ela deve servir como base inicial para campanhas focadas em:

- escritórios trabalhistas;
- escritórios contratuais empresariais;
- bancas com prática em LGPD/compliance;
- depois, expansão para as demais áreas previstas em [propostaLegal.md](/home/jusall/projects/EIAH_BUILDER/propostaLegal.md).
