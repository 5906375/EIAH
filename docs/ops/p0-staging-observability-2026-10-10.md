# Observabilidade do staging após o P0 — flags do intake e filas Redis

- **Identificador:** `EIAH-P0-STAGING-OBSERVABILITY-20261010`
- **Classificação:** parcial
- **Ambiente:** Render staging, serviço `eiah-api-staging`
- **Deploy de referência:** `321f8a8212f9ea61129d6e480a8f5077f9c31bfd` (P0, PR #501)
- **Data do registro:** 2026-10-10
- **Relacionado a:** `docs/ops/p0-g4-redis-imob-decision-2026-10-10.md` (G4 = parcial)

> Registro de observação operacional. Os comandos e as saídas abaixo são transcrições relatadas
> pelo operador na conversa de trabalho, não evidências independentes de execução. Nenhum artefato
> bruto foi versionado, e este documento não entra em `docs/EVIDENCE_INDEX.md`.

## 1. Origem dos resultados

| Item | Registro |
|---|---|
| Onde os comandos rodaram | Shell do Render do serviço `eiah-api-staging`, no diretório `/app/apps/api` (relatado) |
| Como os resultados chegaram aqui | Transcrição dos comandos e das saídas apresentada pelo operador na conversa |
| Responsável | Operador humano do staging |
| Horário UTC das leituras | Não registrado |
| Artefato bruto versionado | Nenhum |

### 1.1 Comandos executados

Nos dois casos: transcrição literal disponível na conversa; execução relatada pelo operador. Os
comandos usam o cliente `ioredis` da aplicação, com a conexão de `process.env.REDIS_URL`, e só fazem
leitura (`connect`, `scan`, `get`, `llen`, `zcard`, `disconnect`). Não contêm credenciais.

**P0-A — Inventário das flags do intake IMOB**

```bash
node -e 'const R=require("ioredis");const r=new R(process.env.REDIS_URL,{lazyConnect:true,enableOfflineQueue:false,maxRetriesPerRequest:1,connectTimeout:3000});(async()=>{await r.connect();let cursor="0",n=0,enabled=0,disabled=0,other=0;do{const x=await r.scan(cursor,"MATCH","killswitch:capability:imob.contract.intake:*","COUNT",100);cursor=x[0];for(const k of x[1]){n++;const v=await r.get(k);if(v==="enabled")enabled++;else if(v==="disabled")disabled++;else other++;}}while(cursor!=="0");console.log(JSON.stringify({database:0,flagsFound:n,enabled,disabled,other}));})().catch(e=>{console.error("Erro:",e.message);process.exitCode=1}).finally(()=>r.disconnect())'
```

Saída relatada:

```json
{"database":0,"flagsFound":0,"enabled":0,"disabled":0,"other":0}
```

**P0-B — Contadores das filas BullMQ**

```bash
node -e 'const R=require("ioredis");const r=new R(process.env.REDIS_URL,{lazyConnect:true,enableOfflineQueue:false,maxRetriesPerRequest:1,connectTimeout:3000});(async()=>{await r.connect();for(const q of ["runs","imob-run-completed"]){const p="bull:"+q;const a=await Promise.all([r.llen(p+":wait"),r.llen(p+":active"),r.zcard(p+":delayed"),r.zcard(p+":failed"),r.zcard(p+":completed"),r.zcard(p+":prioritized")]);console.log(JSON.stringify({queue:q,counts:Object.fromEntries(["waiting","active","delayed","failed","completed","prioritized"].map((k,i)=>[k,a[i]]))}));}})().catch(e=>{console.error("Erro:",e.message);process.exitCode=1}).finally(()=>r.disconnect())'
```

Saídas relatadas:

```json
{"queue":"runs","counts":{"waiting":0,"active":0,"delayed":0,"failed":0,"completed":0,"prioritized":0}}
{"queue":"imob-run-completed","counts":{"waiting":0,"active":0,"delayed":0,"failed":0,"completed":0,"prioritized":0}}
```

Nenhum comando de escrita, consumo ou alteração de estado foi relatado.

## 2. Conexão usada

| Item | Valor | Origem |
|---|---|---|
| Variável Redis presente no Environment do serviço | Somente `REDIS_URL` | Relato operacional: confirmação do operador no Render |
| Variável usada pelos comandos | `REDIS_URL` | Transcrição dos comandos (§1.1) |
| Database | 0 | Relato operacional sobre a `REDIS_URL` |

O campo `"database":0` na saída do P0-A é um valor fixo do script. Não foi lido da conexão e não
prova o database usado. O database efetivo é o do caminho da `REDIS_URL`, que o `ioredis`
interpreta.

Cada componente escolhe a conexão por uma precedência própria (fatos de código):

| Componente | Ordem de precedência | Código |
|---|---|---|
| Kill switch do intake | `KILL_SWITCH_REDIS_URL`, `REDIS_URL`, `ACTION_QUEUE_REDIS_URL` | `packages/core/src/security/killSwitch.ts:24-26` |
| Fila `imob-run-completed` | `RUN_ATIVO_UNIVERSAL_REDIS_URL`, `ACTION_QUEUE_REDIS_URL`, `RUN_QUEUE_REDIS_URL`, `BULLMQ_REDIS_URL`, `QUEUE_REDIS_URL`, `REDIS_URL` | `packages/core/src/queue/connection.ts:37-47` |
| Fila `runs` | `RUN_QUEUE_REDIS_URL`, `REDIS_URL`, `BULLMQ_REDIS_URL`, `QUEUE_REDIS_URL` | `packages/core/src/queue/runQueue.ts:70-73` |

Se o relato de que só `REDIS_URL` está presente estiver correto, os três componentes usam a mesma
conexão que os comandos usaram. Essa conclusão depende do relato operacional; não foi demonstrada
independentemente.

## 3. P0-A — Flags do intake (`imob.contract.intake`)

Chave: `killswitch:capability:imob.contract.intake:<tenantId>:<workspaceId>`, com cada parte
codificada por `encodeURIComponent` (`killSwitch.ts:81-89`).

**Método:** `SCAN` com `MATCH killswitch:capability:imob.contract.intake:*` e `COUNT 100`, até o
cursor voltar a `0`. Para cada chave encontrada seria feito um `GET`. Como nenhuma chave foi
encontrada, nenhum `GET` foi executado.

| Métrica | Valor relatado |
|---|---|
| `flagsFound` | 0 |
| `enabled` | 0 |
| `disabled` | 0 |
| `other` | 0 |

Interpretação, sujeita à §2: só o valor `enabled` libera o intake. Chave ausente bloqueia
(fail-closed; `killSwitch.ts:95-107`; `defaultEnabled: false` em
`apps/api/src/services/imob/imobAgentContract.ts:43-55`). Com zero chaves no padrão, nenhum escopo
tenant/workspace estava liberado no instante da leitura, desde que a conexão usada seja a conexão
efetiva do kill switch.

Limitações:

- Sem correlação direta com a lista de pares tenant/workspace IMOB: a varredura conta chaves pelo
  padrão e não cruza com os escopos instalados.
- Uma contagem zero num Redis ou database que não seja o do kill switch não prova bloqueio.

## 4. P0-B — Filas BullMQ

Prefixo padrão `bull`, sem prefixo customizado. Nomes: `runs` (`QueueName.RUNS`, que pode ser
sobrescrito por `RUN_QUEUE_NAME`) e `imob-run-completed` (fixo,
`apps/api/src/queues/imobRunCompletedQueue.ts:20`).

| Estado consultado | Comando | `runs` | `imob-run-completed` |
|---|---|---|---|
| waiting | `LLEN …:wait` | 0 | 0 |
| active | `LLEN …:active` | 0 | 0 |
| delayed | `ZCARD …:delayed` | 0 | 0 |
| failed | `ZCARD …:failed` | 0 | 0 |
| completed | `ZCARD …:completed` | 0 | 0 |
| prioritized | `ZCARD …:prioritized` | 0 | 0 |

Valores relatados, válidos só para o instante da leitura.

Conclusão, limitada aos seis estados consultados: no instante da leitura, as duas filas não tinham
jobs em `waiting`, `active`, `delayed`, `failed`, `completed` nem `prioritized` na conexão usada.

Ressalvas:

- `LLEN` e `ZCARD` retornam `0` também para chave inexistente. As saídas zeradas não distinguem
  "fila existente e vazia" de "chaves ausentes nesse Redis ou database". Para `imob-run-completed`,
  uma leitura anterior relatada (`EXISTS bull:imob-run-completed:meta = 1`) indica que a fila existe
  nessa conexão. Para `runs`, a existência das chaves não foi verificada.
- O nome efetivo de `runs` só é `runs` se `RUN_QUEUE_NAME` não estiver definido, o que não foi
  confirmado.
- Não se conclui nada sobre estados não consultados nem sobre processamento antes ou depois da
  leitura.

## 5. Limitações gerais

- Leituras pontuais, sem horário UTC nem artefato bruto versionado.
- Sem correlação direta com tenant/workspace no P0-A.
- P0-B limitado a seis estados; nome de `runs` dependente de `RUN_QUEUE_NAME`; zeros compatíveis com
  chaves ausentes.
- O database 0 depende de relato operacional (§2).
- Não é possível comprovar processamento histórico por estas leituras.

## 6. Relação com o G4

O G4 continua parcial. Estas leituras não reconstroem as observações históricas L1 e L2 nem
demonstram que foram feitas na mesma conexão.

## 7. Separação entre evidência e relato

| Informação | Situação |
|---|---|
| Regras de precedência, formato das chaves, nomes das filas, semântica fail-closed | Evidenciado (código versionado) |
| Somente `REDIS_URL` presente e database 0 | Relato operacional |
| Comandos literais do P0-A e do P0-B | Transcrição disponível na conversa; execução relatada pelo operador |
| Saídas do P0-A e do P0-B | Transcrição relatada, sem artefato |
| Existência das chaves de `runs` e valor de `RUN_QUEUE_NAME` | Não verificados |
| Horário UTC | Não registrado |

## 8. Encaminhamento

- Próximas leituras: registrar horário UTC e responsável, ler o database diretamente da conexão em
  vez de fixá-lo no script, verificar a existência das chaves (por exemplo, `EXISTS bull:<fila>:meta`)
  e, se possível, salvar a saída sanitizada em `ops/evidence/latest/`. Só então avaliar uma entrada no
  Evidence Index (`IA_EIAH.md` §13).
- Manter o consumidor de runs desligado e o intake fail-closed até decisão específica.
