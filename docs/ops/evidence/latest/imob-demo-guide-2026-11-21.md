# Guia da demo IMOB

Base `e63a22facebf8e5f77bc6397d93644ecd4ef6188` do piloto de temporada. As verificações de interface usaram a prévia local em Chromium.

| Verificação | Resultado observado |
| --- | --- |
| Ajuda contextual | Na vitrine de temporada, o guia abriu o assunto de datas e estadia. Na equipe, abriu a orientação de confirmação e check-in. |
| Catálogo e atalhos | Todos os recursos exibiu orientações de atendimento, fila, editor, rodapé, voz e especialistas. O atalho de check-in levou à fila de temporada. |
| Reprodução de áudio | A síntese do navegador retornou indisponível durante o teste inicial. Os áudios empacotados tocaram na prévia. Foi possível usar Parar áudio e fechar o guia com Escape, que devolveu o foco ao botão do guia. |
| Cobertura e integridade | Foram conferidos 13 assuntos, suas descrições, passos e destinos, e a inclusão do guia nas oito páginas da demo. O comando `node scripts/generateImobDemoGuideAudio.mjs --check` confirmou a correspondência do texto com as 13 narrações. |
| Pacote | `node --check` nos módulos alterados e `wrangler deploy --dry-run --config apps/site/wrangler.jsonc` passaram. O Wrangler reconheceu 115 arquivos estáticos. |

O catálogo em `apps/site/public/imob/demo-guide-content.mjs` fornece o texto da interface e a origem das narrações. Após editar um assunto, regenere as faixas com `node scripts/generateImobDemoGuideAudio.mjs /caminho/espeak-ng.js` e valide com `--check`. O gerador documenta a versão do eSpeak NG usada. A prévia distribui somente o áudio gerado. A verificação é do guia instrucional da demo.

## Ajuda de cada seção

- Em Chromium, ao alternar entre venda, aluguel anual e temporada na mesma página, o botão Como funciona? dos resultados abriu a orientação correspondente e reproduziu o áudio em cada modo.
- A abertura direta também foi verificada na Vitrine de imóveis, na fila de temporada, em Contatos e rodapé e em Especialistas EIAH. Escape devolveu o foco ao botão de origem.
- A checagem dos arquivos confirmou 44 atalhos nas oito páginas, 28 assuntos com destinos válidos e as 28 narrações atualizadas. A conferência de sintaxe e o dry-run do Wrangler passaram. O Wrangler reconheceu 130 arquivos estáticos.

## Voz compartilhada com os assistentes

- A leitura em **Como funciona?** usa a mesma síntese e a preferência de voz da etapa de atendimento. Nas demais páginas, usa a preferência de Recepção quando disponível e segue a seleção padrão de voz em português do navegador.
- Um teste em Node com a síntese do navegador simulada confirmou a mesma voz escolhida nas perguntas e no guia para Recepção, Imóvel e Revisão. Também conferiu a leitura padrão em pt-BR, a interrupção e a oferta manual da gravação quando a síntese falha ou está indisponível.
- Na etapa Imóvel da prévia local em Chromium, a síntese nativa ficou indisponível. O guia exibiu o texto e ofereceu a gravação alternativa. A reprodução começou após clicar na alternativa. Parar áudio interrompeu a reprodução e Escape devolveu o foco a **Como funciona?**.
- A checagem de sintaxe, a conferência das 28 narrações alternativas e o dry-run do Wrangler passaram.

## Conversa de anúncio por finalidade

- Na Prévia 01 em Chromium, as opções Venda, Locação residencial e Temporada geraram confirmações próprias e abriram as perguntas sobre preço de venda, aluguel mensal e data para receber hóspedes. Editar a última resposta permitiu trocar de finalidade e receber a pergunta correspondente.
- O anúncio de temporada chegou à Revisão com data de disponibilidade de 15/12/2026 e diária de R$ 350. Na Prévia 02, “venda ou temporada” manteve a escolha aberta e “quero anunciar para aluguel de temporada” abriu a pergunta de disponibilidade.
- O teste em Node conferiu as modalidades, a equivalência das respostas por texto, a ausência de seleção para respostas ambíguas, a validação de datas e as perguntas dos demais objetivos. A sintaxe e o dry-run do Wrangler passaram.

## Ícone de leitura das perguntas

- Nas duas prévias em Chromium, o botão de leitura exibe 🎧 em uma área de 44 × 44 px e mantém o nome acessível “Ouvir pergunta”. A conferência incluiu a pergunta ativa e o histórico do anúncio de temporada na Prévia 01, além da abertura da Recepção na Prévia 02.
- Com a síntese simulada em Node, o ícone retornou após parar, concluir ou falhar. Os botões “Ouvir resposta” e “Ouvir passo a passo” mantiveram seus rótulos. A sintaxe e o dry-run do Wrangler passaram.

## Ícone de leitura no guia

- Os botões de **Ouvir passo a passo** exibiram 🎧 com nome acessível e área de 44 × 44 px no catálogo, em **Como funciona?**, e nos guias da Operação EIAH e do Site com IA do Cliente em Chromium.
- Com a síntese indisponível no Chromium local, o botão voltou ao ícone e ofereceu a gravação alternativa. O teste em Node também conferiu os estados de leitura, interrupção e conclusão. A sintaxe e o dry-run do Wrangler passaram.

## Convite para demonstração com IA

- As duas vitrines substituíram o chat simulado por um convite que explica que a prévia funciona sem IA. O formulário segue o padrão de resumo, pré-visualização e envio manual da [Vertical Legal](https://eiah.ia.br/legal/#responder).
- Em Chromium, a Prévia 01 abriu o convite pelo imóvel V-01 com ficha, galeria e identificação na mensagem. Com três de cinco campos preenchidos, a mesma mensagem foi preparada para WhatsApp e e-mail, e a cópia foi confirmada na interface. Nenhuma mensagem externa foi enviada.
- Na Prévia 02, o convite apresentou a origem correta. O acesso pelo botão de anúncio acrescentou o contexto de proprietário e retornou à vitrine. O botão de temporada abriu o pedido de datas. Nas duas prévias, o compositor do chat ficou fora da página.
- A sintaxe dos módulos, a correspondência das 28 narrações com o texto do guia e o dry-run do Wrangler passaram.
