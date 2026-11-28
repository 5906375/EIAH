# EIAH site · release v6.2 com extensões diretas — 2026-09-14

## Estrutura de publicação
- `/` — landing EIAH atualizada.
- `/vertical-logistica/` — extensão específica por URL direta; não listada na landing e marcada `noindex,nofollow`. O conteúdo permanece alinhado ao status PRE-DUIMP SHADOW.
- `/sessoes-governadas/` — extensão específica por URL direta; não listada na landing e marcada `noindex,nofollow`.
- `/levoutec/` — extensão específica por URL direta; não listada na landing e marcada `noindex,nofollow`.
- `/imobiliarias/` — modelo de site de imobiliária (compra, venda, locação e temporada) para apresentar a imobiliárias e corretores: busca em linguagem natural interpretada no próprio navegador, filtros, custo mensal somado, simulador de financiamento, comparação, favoritos, anúncio para proprietários e espaços para fotos, vídeo e depoimentos. Imóveis e marca fictícios (bloco CONFIG/IMOVEIS no script); endereço público só com bairro e cidade; formulários com envio desativado e aviso na tela. Por URL direta, não listada na landing e marcada `noindex,nofollow`.
- `/revisores/` — cadastro de interesse para revisores de UI e UX: formulário estático que prepara uma mensagem no aplicativo de e-mail do participante (nada é enviado ou guardado pelo site). Por URL direta, não listada na landing e marcada `noindex,nofollow`. Aviso de privacidade ainda em versão para revisão.
- `/amanha-legal/proposta/` — proposta da Fase 1 para o Amanhã Legal (personalização + mensalidade, cronograma e de acordo), com a marca do Amanhã Legal à frente e a EIAH como base. Contém valores: acesso só por link, não listada na landing e marcada `noindex,nofollow`. Editável na tela com `?editar=1` (baixa o HTML atualizado).
- `/amanha-legal/` — apresentação do fluxo atendimento, minuta, revisão humana e versão aprovada, com demonstração interativa em dados fictícios (sem IA, nada enviado nem guardado). Sem valores e sem link para a proposta. Marca do Amanhã Legal à frente e EIAH como base discreta. Acesso só por link, não listada na landing e marcada `noindex,nofollow`. Logo oficial pendente (campo `data-logo`).
- `/ia-na-pratica-juridica/` — IA na Prática Jurídica (página neutra, sem marca EIAH), em abas: Roteiro & Palestra (4 blocos em slides, notas do apresentador, cronômetro, setas do teclado), Votação ao Vivo (sala com código e QR code; a plateia vota pelo celular em `?sala=CÓDIGO`), Simulador de IA & Risco, Comparativo, Calculadora de ROI, Guia e Autodiagnóstico. Por URL direta, não listada na landing e marcada `noindex,nofollow`.

## Worker do site (a partir da votação ao vivo)
- `wrangler.jsonc` passa a ter `main: ./src/worker.js`. Os arquivos de `public/` continuam servidos como estáticos; o Worker só roda quando nenhum arquivo corresponde ao endereço e hoje atende apenas `/api/votacao/…`.
- Votos ficam no Durable Object `SalaVotacao` (armazenamento SQLite, uma instância por sala). São anônimos — o "eleitor" é um identificador aleatório do aparelho — e cada sala apaga tudo 24 horas depois de criada (alarme do Durable Object). Limite de 2.000 participantes por sala; só quem criou a sala (chave do apresentador) troca a pergunta, encerra ou zera votos.
- Primeiro deploy: `npx wrangler deploy` aplica a migração `v1` (`new_sqlite_classes`). Rollback: voltar o `wrangler.jsonc` e remover `src/` — o site volta a ser só estático.

## O que continua público na landing
- A vertical **Logística & Comex · Pré-DUIMP** continua apresentada no conjunto de verticais com status **SHADOW** e permanece disponível no simulador institucional.
- O que deixa de existir é o **link público para a página-filha `/vertical-logistica/`** no menu/card da landing.

## Boundaries
- A landing não executa ações externas.
- Pré-DUIMP permanece SHADOW, sem transmissão ao Siscomex/Portal Único.
- Sessões Governadas V7.2 funciona localmente no navegador, sem persistência em servidor ou conectores externos configurados.
- `noindex,nofollow` reduz indexação em buscadores, mas não substitui autenticação ou controle de acesso.

## Publicação
Faça backup da raiz atual e envie esta árvore preservando os diretórios.

## Piloto IMOB de vitrines gratuitas

O cadastro é enviado pelo interessado à caixa `contato@eiah.ia.br`. A equipe da EIAH confirma as vagas e recebe dos selecionados o arquivo exportado em **Baixar rascunho para publicação**. Revise os anúncios e os contatos públicos com a imobiliária antes de publicar.

Na raiz do repositório, gere a vitrine com o endereço aprovado.

```bash
node apps/site/scripts/publish-imob-pilot.mjs horizonte /caminho/vitrine-imob.json
pnpm dlx wrangler@4.165.0 deploy --dry-run --config apps/site/wrangler.jsonc
```

O comando escreve a página em `apps/site/public/imob/horizonte/index.html`. Revise e inclua a página na versão do site a publicar. Depois do deploy do Worker `eiah-site`, a vitrine fica disponível em `https://eiah.ia.br/imob/horizonte/`. Use o mesmo endereço ao atualizar a página da imobiliária. O Wrangler confere o teto de dez vitrines no conjunto de arquivos do deploy.

### Vitrines de exemplo e lista de espera

Enquanto o produto não está pronto, as 10 vagas do piloto são ocupadas por **vitrines de exemplo**: imobiliárias fictícias em `https://eiah.ia.br/imob/exemplo-*/`, com aviso visível de exemplo, sem contatos e fora dos buscadores (`noindex`). Como as vagas estão cheias, a tela **Criar meu site** mostra "As vagas do piloto estão fechadas por enquanto" e troca o cadastro pela **lista de espera**, que chega à caixa `contato@eiah.ia.br` com o assunto "Lista de espera do piloto de vitrines gratuitas IMOB".

```bash
# regravar as 10 vitrines de exemplo (idempotente)
node apps/site/scripts/publish-imob-example-sites.mjs

# reabrir as vagas: remove as pastas exemplo-* e atualiza apps/site/public/imob/piloto-vagas.json
node apps/site/scripts/publish-imob-pilot.mjs --remover-exemplos
pnpm dlx wrangler@4.165.0 deploy --config apps/site/wrangler.jsonc
```

Depois de reabrir, avise por e-mail quem está na lista de espera. O endereço de uma vitrine de exemplo sempre começa com `exemplo-`, e esse prefixo é recusado para vitrines de clientes.
