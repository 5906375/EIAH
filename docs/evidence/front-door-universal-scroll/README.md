# Rolagem universal do Front Door (`/app/chat`) — evidência local

Data: 2026-11-12. **Status: parcial.** Evidência local de uma correção ainda não publicada. Nada aqui comprova staging, produção, o typecheck geral nem a causa raiz da intermitência de uma versão anterior (ver seções 7 e 10).

## 1. Candidato avaliado

- Base: `main` em `ba79d7063c929592209320e04c26903bed255ce7` (merge da PR #532). A árvore desse merge (`20f83a269d15d27e52f7c85c047f7c0e717b3a14`) é idêntica à do commit `c5607c8d36c9ecde1f77c8fb74cc3ee9708775c6`, sobre o qual as evidências foram geradas.
- Alterações do candidato (sha256, primeiros 12 caracteres):

| Arquivo | Situação | sha256 |
|---|---|---|
| `apps/web/src/components/agents/ChatAgentLauncher.tsx` | alterado (+26/−4) | `016d4d107bef` |
| `apps/web/src/components/agents/conversationScroll.ts` | novo | `498b2643efb7` |
| `apps/web/src/components/agents/FrontDoorSessionHeader.test.tsx` | alterado (+56) | `8542c711bbfd` |
| `scripts/qa/archived-reply-scroll.mjs` | novo | `f40aba3e5386` |

- Procedência: os hashes dos três primeiros arquivos são idênticos aos registrados no campo `CODIGO_AVALIADO` dos logs dos gates e do typecheck. O script de QA não foi alterado depois do cenário G; sua identificação é cronológica, porque os logs do Chromium não registram o hash.

## 2. Problema

No Front Door centralizado, respostas do assistente anexadas à conversa fora da digitação ficavam abaixo da área visível. O caso observado foi a consulta "listar imóveis arquivados" do IMOB (PR #532): a resposta existia no histórico, mas a última coisa visível era a mensagem de handoff. Com a barra de rolagem oculta, nada indicava conteúdo abaixo. O mesmo defeito atingia mensagens de outras verticais anexadas por `setMessages` (aviso de acesso de vertical e pendente da Logística).

## 3. Causa identificada

O autoscroll do launcher só existia em `pushMessage` e na digitação progressiva do assistente (`pushAssistantMessageWithTyping`). A resposta do IMOB entra por `appendStructured` (que só faz `setMessages`) e os avisos por `setMessages` direto; nenhum desses caminhos rola. Confirmado por leitura do código e por reprodução em navegador antes da alteração (seção 5).

## 4. Correção

Só apresentação; sem regra cognitiva, sem backend, sem contratos.

- `conversationScroll.ts` (funções puras): `appendedAssistantReplyId` identifica exatamente UMA mensagem nova do assistente ao fim, com a lista anterior intacta e fora de `streaming`; ficam de fora hidratação (lista anterior vazia), troca de conversa (ids diferentes), atualização no lugar e mensagens do usuário. `replyScrollTop` leva ao fim quando a resposta cabe na área visível e ao INÍCIO dela quando é mais alta; não mexe quando o fim estava a mais de uma tela (conversa recém-hidratada).
- `ChatAgentLauncher.tsx`: um efeito aplica essas regras; a ref `readerLeftEnd` preserva a leitura manual (só roda para cima, toque e teclas de subida a ligam; voltar ao fim ou enviar mensagem a desliga). A digitação e o `followConversationEnd` permanecem como estavam.

## 5. Resultados antes/depois (Chromium, API 100% mockada)

"Legível": a resposta cabe inteira na área visível ou, se for mais alta, o seu início está visível. Medidas em px relativas à área de conversa.

### Antes — código intacto (`results/before-code-intact.json`)

| Cenário | 320 px | 390 px | 1440 px |
|---|---|---|---|
| A — lista curta (4 imóveis) | FORA da área visível (topo 434, altura 312, área 424) | FORA da área visível (topo 578, altura 219, área 568) | FORA da área visível (topo 716, altura 146, área 710) |
| B — card alto (120 imóveis) | FORA da área visível (topo 434, altura 5239, área 424) | FORA da área visível (topo 578, altura 3569, área 568) | FORA da área visível (topo 716, altura 1918, área 710) |
| D — nova mensagem retoma o acompanhamento | FORA da área visível (topo 669, altura 312, área 424) | FORA da área visível (topo 769, altura 219, área 568) | FORA da área visível (topo 716, altura 146, área 710) |
| C — leitor acima quando a resposta chega (`scrollTop` antes → depois) | 2062 → 2062 | 1255 → 1255 | 115 → 115 |

### Antes — efeito novo neutralizado (`results/before-effect-neutralized.json`)

No modo `before` o script neutraliza só o efeito novo na resposta do módulo servido pelo Vite. Foi usado para os cenários F e G, que não existiam quando o código estava intacto.

| Cenário | 320 px | 390 px | 1440 px |
|---|---|---|---|
| A — lista curta (4 imóveis) | FORA da área visível (topo 434, altura 312, área 424) | FORA da área visível (topo 578, altura 219, área 568) | FORA da área visível (topo 716, altura 146, área 710) |
| B — card alto (120 imóveis) | FORA da área visível (topo 434, altura 5239, área 424) | FORA da área visível (topo 578, altura 3569, área 568) | FORA da área visível (topo 716, altura 1918, área 710) |
| D — nova mensagem retoma o acompanhamento | FORA da área visível (topo 434, altura 312, área 424) | FORA da área visível (topo 578, altura 219, área 568) | FORA da área visível (topo 716, altura 146, área 710) |
| F — aviso de acesso da Logística (outra vertical) | FORA da área visível (topo 435, altura 173, área 424) | FORA da área visível (topo 578, altura 151, área 568) | FORA da área visível (topo 717, altura 109, área 710) |
| G — formulário do IMOB (14 campos) | FORA da área visível (topo 457, altura 1294, área 424) | FORA da área visível (topo 578, altura 1278, área 568) | FORA da área visível (topo 716, altura 1105, área 710) |
| C — leitor acima quando a resposta chega (`scrollTop` antes → depois) | 2062 → 2062 | 1255 → 1255 | 115 → 115 |

### Depois — versão final (`results/after-final.json`, última das 10 execuções)

| Cenário | 320 px | 390 px | 1440 px |
|---|---|---|---|
| A — lista curta (4 imóveis) | legível (topo 108, altura 312, área 424) | legível (topo 345, altura 219, área 568) | legível (topo 557, altura 146, área 710) |
| B — card alto (120 imóveis) | legível (topo 0, altura 5239, área 424) | legível (topo 0, altura 3569, área 568) | legível (topo 0, altura 1918, área 710) |
| D — nova mensagem retoma o acompanhamento | legível (topo 108, altura 312, área 424) | legível (topo 345, altura 219, área 568) | legível (topo 557, altura 146, área 710) |
| F — aviso de acesso da Logística (outra vertical) | legível (topo 248, altura 173, área 424) | legível (topo 413, altura 151, área 568) | legível (topo 595, altura 109, área 710) |
| G — formulário do IMOB (14 campos) | legível (topo 0, altura 1294, área 424) | legível (topo 0, altura 1278, área 568) | legível (topo 0, altura 1105, área 710) |
| C — leitor acima quando a resposta chega (`scrollTop` antes → depois) | 2062 → 2062 | 1255 → 1255 | 115 → 115 |

Cenário E (aviso de outra vertical logo após a hidratação, leitor no topo): `scrollTop` permaneceu 0 nas três larguras.

Capturas em `screenshots/`: `before-A-390`, `before-A-1440`, `before-B-320`, `before-F-390`, `before-G-320` (defeito) e `after-A-390`, `after-A-1440`, `after-B-320`, `after-F-390`, `after-G-320` (corrigido). Todas contêm apenas dados sintéticos.

## 6. Verificações

| Verificação | Resultado | Código de saída |
|---|---|---|
| Testes unitários direcionados (`FrontDoorSessionHeader.test.tsx`) | 31 executados, 31 aprovados, 0 falhas | 0 |
| Chromium final, sem instrumentação | **10/10 execuções aprovadas** (320, 390 e 1440 px) | 0 em todas |
| `check:chat-launcher-render-only` | `ok: true`, `violations: []` | 0 |
| `check:chat-runtime-entrypoint-debt` | `ok: true`, `violations: []` | 0 |
| `check:presentation-snapshot-contract` | `ok: true` | 0 |
| **Typecheck do web** | **NÃO aprovado: 64 diagnósticos**, nenhum nos arquivos alterados | **2** |

Sobre o typecheck: o total de 64 coincide com o conhecido de logs locais anteriores; não foi comparado com uma baseline limpa da `main`. Os códigos de saída de todas as execuções estão em `results/exit-codes.txt`.

## 7. Estabilidade e histórico de versões

- Versão 1 (específica do IMOB, dependente de `followConversationEnd`): falhou no cenário D em 320 px em uma execução (log não incluído neste pacote).
- Versão 2 (generalizada, ainda dependente de `followConversationEnd`), sem instrumentação: 3 execuções, 1 aprovada e 2 reprovadas em 320 px (cenários G e A; logs sanitizados em `results/intermittency-intermediate-version-run8.log` e `run9.log`). Com instrumentação (observador de mutações e registro de `scrollTo`) todas as execuções passaram (8 suítes completas e 38 repetições isoladas do cenário A); a instrumentação força layout e pode ter mascarado a corrida. Esses logs não foram incluídos.
- Versão 3 (final: ref `readerLeftEnd` e guarda geométrica de uma tela): 10 de 10 execuções aprovadas, sem instrumentação.
- **A causa raiz da intermitência da versão 2 não foi confirmada.** A hipótese de trabalho (não confirmada) é que o `onScroll` recalcula `followConversationEnd` pela distância até o fim e pode zerá-lo quando um bloco cresce depois da última rolagem, como o card de handoff ao fim da digitação. A versão final deixa de depender dele, mas isso não prova a causa.

## 8. Como reproduzir

1. Em `apps/web`: `VITE_API_URL=http://localhost:5180/api vite --host 127.0.0.1 --port 5180 --strictPort`.
2. Na raiz: `QA_MODE=after QA_OUT=<diretório> QA_BASE_URL=http://localhost:5180 node scripts/qa/archived-reply-scroll.mjs` (`QA_MODE=before` neutraliza o efeito novo).

## 9. Mocks, requisições e limitação do script

- Toda rota `/api/**` é atendida por mock local; escritas fora da lista permitida recebem 403 e reprovam o teste. As escritas toleradas são disparadas pelo próprio Front Door e respondidas pelo mock, sem chegar a servidor algum: `POST /api/chat/vertical-handoff`, `POST /api/imob/chat/resolve-turn`, `POST /api/helpdesk/telemetry`, `POST /api/imob/chat/runtime-shadow-state` e `POST /api/imob/chat/conversations` (persistência de histórico). Elas aparecem em `requests` nos JSONs.
- Requisições a hosts fora de `localhost` e `127.0.0.1` são abortadas; só as de fontes do Google são toleradas.
- **Limitação conhecida da interceptação de URLs externas:** o padrão `**/api/**` foi registrado depois do bloqueio de hosts externos e por isso tem precedência, inclusive para uma URL `/api/` de outro host. Essa URL seria respondida pelo mock (não sairia da máquina), mas não seria registrada nem reprovaria o teste como requisição externa. O app usa `VITE_API_URL` na mesma origem do Vite, e nenhuma ocorrência foi observada. O script não foi alterado para não invalidar a evidência.

## 10. Limites conhecidos e riscos remanescentes

- Typecheck do web: exit 2, 64 diagnósticos; **não aprovado** (nenhum nos arquivos alterados).
- Causa raiz da intermitência da versão 2: não confirmada (seção 7).
- **Ausência de testes Chromium específicos** de mensagens de run e do fluxo pendente da Logística. O aviso da Logística (cenário F) exercita o mesmo caminho de `setMessages`; os demais casos estão cobertos apenas pelos testes unitários da regra de detecção.
- Hidratação que acrescenta exatamente uma mensagem sobre uma lista anterior já existente conta como resposta nova (só rola se o fim estava a menos de uma tela).
- Os testes usam API simulada; não comprovam o comportamento com o backend real, em staging ou em produção. A correção só chega ao staging com um novo deploy da Web, que não foi executado.
- Os dados são exclusivamente sintéticos; nenhum tenant ou workspace real foi acessado.

## 11. Inventário e integridade

`MANIFEST.sha256` cobre os 21 arquivos do pacote auditado (formato `sha256sum`; não inclui a si mesmo nem este README) e foi verificado no destino (21/21 OK). Os dois logs de intermitência são cópias sanitizadas: o caminho absoluto local foi substituído por `<repo>/`; hashes dos originais (preservados fora do repositório) → cópias: `ea30bd6b3e895357` → `bcf8aa7845a910f7` (run8) e `f942494dc6f85a84` → `b8a092ae849134c0` (run9). Demais arquivos têm hash idêntico ao original.

Fora do escopo: backend IMOB, PostgreSQL e Render não foram alterados; nenhum deploy foi executado.
