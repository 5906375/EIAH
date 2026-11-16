# Demonstração e imobiliária piloto

## Rotas

- `/imobiliarias/`: demonstração comercial EIAH com dados fictícios e contatos desativados.
- `/imobiliaria-piloto/`: cópia de preparação, ainda com imóveis ilustrativos, sem cliente real definido.

A pasta `public/` já é servida pelo Worker `eiah-site`. Estas rotas não alteram a landing nem exigem outro Worker. A presença no repositório não comprova publicação.

## Preparação para operação real

1. Informar nome, logo, CRECI, CNPJ, contatos e endereço comercial autorizados.
2. Editar `public/imobiliaria-piloto/config.js` e substituir a lista `IMOVEIS` no HTML por anúncios autorizados, com fotos e valores conferidos.
3. Conferir endereço público restrito a bairro/cidade e remover a identificação de prévia somente após revisão dos dados.
4. Habilitar os contatos somente com número e e-mail reais validados. Formulários continuam demonstrativos mesmo com `contactsEnabled: true`.
5. Implementar e validar separadamente o recebimento público: vínculo server-side à empresa/workspace e imóvel, validação, proteção contra abuso, deduplicação, criação de interessado/caso nos serviços IMOB existentes e confirmação baseada na gravação real.
6. Conferir desktop/celular, busca, filtros, comparação, favoritos, simulação e contato. Publicar pelo procedimento Cloudflare existente e conferir as duas rotas após deploy.

Não há integração ao Front Door/IMOB, sincronização de carteira, reservas de temporada nem tokenização nesta entrega. Busca é interpretação local; não é chamada a modelo generativo. Simulação não é proposta de crédito. `noindex,nofollow` não é controle de acesso. Não colocar credenciais ou IDs que concedam acesso nos arquivos públicos.

## Manutenção

A cópia piloto preserva o HTML original. Mudanças comuns futuras devem ser reconciliadas entre as duas rotas; a configuração pública da piloto fica separada. Favoritos da piloto usam namespace próprio no navegador.
