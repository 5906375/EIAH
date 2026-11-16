# EIAH Imóveis — demonstração e operação piloto

## Rotas e identidade

- `/imobiliarias/`: demonstração comercial EIAH, com dados fictícios e contatos desativados.
- `/imobiliaria-piloto/`: EIAH Imóveis, logo oficial EIAH, responsável Carlos A. Merlo, CRECI-SC 66990F; contato de atendimento Lene, WhatsApp +55 47 99994-1470.
- `/imobiliaria-piloto/autorizar/`: formulário para preparar o termo de autorização de divulgação.

A configuração pública está em `public/imobiliaria-piloto/config.js`. CNPJ, e-mail e endereço comercial não foram fornecidos e não são inventados. Nome do responsável e UF fornecidos pelo usuário: Carlos A. Merlo, SC. A abreviação foi preservada conforme informada. CRECI informado pelo usuário; não houve validação do registro no conselho.

A pasta `public/` já é servida pelo Worker `eiah-site`. Estas rotas não alteram landing, Worker nem configuração Cloudflare. Código no repositório não comprova publicação.

## Autorização de divulgação

O visitante escolhe o vínculo (proprietário, coproprietário, corretor, gestor ou representante), informa titulares e imóvel, preço, prazo, canais e restrições. Representantes e coproprietários devem descrever a origem dos poderes. Corretores informam CRECI/UF. Nenhum canal ou declaração vem pré-marcado.

O termo identifica a versão, o horário de geração, os limites de uso do material, localização pública restrita ao bairro/cidade e contato para retirada. Não estabelece exclusividade ou comissão. Preço de temporada é por diária; locação é aluguel mensal base.

A geração é local. Não há upload, POST, banco, protocolo de recebimento, assinatura verificada, registro de caso IMOB nem publicação automática. Os campos não são salvos no armazenamento do navegador. O visitante pode baixar texto ou imprimir/salvar PDF, assinar e encaminhar o documento à Lene pelo canal combinado. O termo v2 identifica Carlos A. Merlo como responsável e Lene como contato de atendimento. O link do WhatsApp contém somente mensagem genérica, sem dados do formulário; o arquivo deve ser anexado pelo visitante. Alterar um campo invalida a prévia anterior.

Antes de publicar um anúncio: conferir documento assinado, identificação das partes, poderes, anuência de outros titulares quando aplicável, direitos sobre materiais, condições, preço, canais e vigência. Rever juridicamente o modelo para o uso pretendido. Não tratar simples marcação de checkbox como comprovação de assinatura ou de poderes.

Referências consultadas em 16/11/2026:

- [Lei 6.530/1978, texto atualizado na Câmara](https://www2.camara.leg.br/legin/fed/lei/1970-1979/lei-6530-12-maio-1978-365766-normaatualizada-pl.html), especialmente art. 20, III e IV.
- [Direitos dos titulares — ANPD](https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados/direito-dos-titulares).

## Carteira e continuidade

A lista `IMOVEIS` da piloto está vazia. Os exemplos continuam somente na demonstração. Insira ofertas reais após conferir a autorização; não publique dados pessoais, endereço completo ou documentação do proprietário.

Próxima integração: recebimento público autenticado/protegido contra abuso, vínculo server-side à empresa/workspace e imóvel, validação, deduplicação e confirmação da gravação nos serviços IMOB existentes. Também definir retenção e acesso aos registros recebidos. Não colocar credenciais ou identificadores que concedam acesso no site.

A busca atual é interpretação local, sem chamada a modelo generativo. Não há gestão completa de temporada, sincronização de carteira ou tokenização. `noindex,nofollow` não é controle de acesso.

## Validação realizada nesta unidade

- Sintaxe JavaScript de config, módulos e script inline.
- Exercícios de geração do termo: canais, representação, CRECI, datas, preço e declarações; rejeição de entradas inválidas.
- Navegador: identidade e logo visíveis, formulário, campos condicionais de gestor, geração com dados fictícios e invalidação da prévia após edição.
- Check documental canônico e `git diff --check`.

Não realizados: assinatura efetiva, transmissão ao WhatsApp, recebimento no IMOB, validação do CRECI, revisão jurídica, testes em dispositivo móvel real e deploy Cloudflare.

## Manutenção e publicação

A cópia preserva a demonstração. Reconciliar melhorias comuns entre as rotas; favoritos da piloto usam namespace próprio. Publicar pelo fluxo Cloudflare existente após revisão, conferir as rotas e preservar rollback. Não habilitar anúncios a partir de autorizações vencidas ou não conferidas.
