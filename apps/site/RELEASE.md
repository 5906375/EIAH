# EIAH site · release v6.2 com extensões diretas — 2026-09-14

## Estrutura de publicação
- `/` — landing EIAH atualizada.
- `/vertical-logistica/` — extensão específica por URL direta; não listada na landing e marcada `noindex,nofollow`. O conteúdo permanece alinhado ao status PRE-DUIMP SHADOW.
- `/sessoes-governadas/` — extensão específica por URL direta; não listada na landing e marcada `noindex,nofollow`.
- `/levoutec/` — extensão específica por URL direta; não listada na landing e marcada `noindex,nofollow`.
- `/imobiliarias/` — modelo de site de imobiliária (compra, venda, locação e temporada) para apresentar a imobiliárias e corretores: busca em linguagem natural interpretada no próprio navegador, filtros, custo mensal somado, simulador de financiamento, comparação, favoritos, anúncio para proprietários e espaços para fotos, vídeo e depoimentos. Imóveis e marca fictícios (bloco CONFIG/IMOVEIS no script); endereço público só com bairro e cidade; formulários com envio desativado e aviso na tela. Por URL direta, não listada na landing e marcada `noindex,nofollow`.

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
