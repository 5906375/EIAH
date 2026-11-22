// Cada assunto alimenta o texto e a narração. Atualize aqui ao mudar o fluxo da demo.
export const demoGuideTopics = [
  {
    id: 'demos',
    title: 'Escolher uma demonstração',
    description: 'As duas prévias do IMOB usam dados fictícios e funcionam sem IA.',
    steps: [
      'Abra Operação EIAH para explorar os imóveis e acompanhar pedidos de temporada na visão da equipe.',
      'Abra Site com IA do Cliente para explorar os imóveis ou personalizar a vitrine com uma marca de exemplo.'
    ],
    link: ['Ver as duas prévias', './']
  },
  {
    id: 'vitrine',
    title: 'Buscar e comparar imóveis',
    description: 'A vitrine reúne imóveis de exemplo para compra, aluguel anual e temporada.',
    steps: [
      'Escolha a finalidade. Digite o que procura na busca ou filtre por bairro, tipo, quartos e valor.',
      'Use o coração para favoritar ou marque Comparar nos imóveis que quer ver lado a lado.',
      'Abra Ver detalhes para consultar a ficha e a galeria. Em Solicitar demonstração com este imóvel, a ficha já aparece ao lado do convite.'
    ],
    link: ['Ir à vitrine de imóveis', './ia-cliente/#vitrine']
  },
  {
    id: 'inicio-vitrine',
    title: 'Começar pela vitrine',
    description: 'A página inicial reúne três caminhos para explorar a demonstração.',
    steps: [
      'Use Solicitar demonstração com IA para dizer o que gostaria de testar.',
      'Use Explorar imóveis para navegar pela vitrine e aplicar filtros.',
      'Use Quero anunciar um imóvel para incluir esse objetivo no seu pedido de demonstração.'
    ],
    link: ['Ir à vitrine', './ia-cliente/#vitrine']
  },
  {
    id: 'venda',
    title: 'Imóveis à venda',
    description: 'Nesta lista, o valor anunciado corresponde ao preço de compra do imóvel.',
    steps: [
      'Filtre por cidade, bairro, quartos ou valor até encontrar as opções que interessam.',
      'Em Ver detalhes, confira as fotos, o preço e, quando informado, o condomínio.',
      'Marque Comparar para ver os imóveis lado a lado. Você também pode usar um imóvel de exemplo na demonstração que solicitar.'
    ],
    link: ['Abrir a lista de imóveis à venda', './ia-cliente/?finalidade=venda#imoveis']
  },
  {
    id: 'locacao',
    title: 'Imóveis para alugar',
    description: 'A categoria Aluguel anual mostra opções de locação mensal. Quando há valores informados, a ficha estima o total com condomínio e IPTU.',
    steps: [
      'Filtre por bairro, número de quartos e valor. Compare o aluguel anunciado com a estimativa mensal de encargos.',
      'Abra os detalhes e veja as fotos. Para conhecer o atendimento com IA, solicite uma demonstração usando o imóvel de exemplo.'
    ],
    link: ['Abrir a lista de imóveis para alugar', './ia-cliente/?finalidade=locacao#imoveis']
  },
  {
    id: 'temporada-vitrine',
    title: 'Imóveis para temporada',
    description: 'Nesta lista, o valor é por diária. Ao consultar as datas, a estimativa soma as noites e a taxa de limpeza.',
    steps: [
      'Informe entrada, saída e número de hóspedes ou clique em Usar datas de exemplo.',
      'Veja as opções que atendem à consulta e abra os detalhes para conferir a capacidade e o valor estimado.',
      'Na Prévia 02, use Pedir datas para enviar o período à fila de demonstração.'
    ],
    link: ['Abrir a consulta de temporada', './ia-cliente/?finalidade=temporada#imoveis']
  },
  {
    id: 'conversa',
    title: 'Solicitar uma demonstração com IA',
    description: 'Esta prévia funciona sem IA. A equipe da EIAH pode apresentar o atendimento com a IA da EIAH ou com a sua própria IA.',
    steps: [
      'Abra Solicitar demonstração com IA e conte o que gostaria de testar.',
      'Se quiser, deixe um contato de retorno e escolha qual opção de IA deseja conhecer.',
      'Confira a mensagem no resumo. Você pode enviar por WhatsApp, por e-mail ou copiar o texto.'
    ],
    link: ['Solicitar demonstração com IA', './operacao-eiah/?objetivo=novo#jornada']
  },
  {
    id: 'anuncio',
    title: 'Pedir ajuda para anunciar um imóvel',
    description: 'Você pode solicitar uma demonstração focada no atendimento a proprietários.',
    steps: [
      'Abra Quero anunciar um imóvel. Essa escolha acompanha a mensagem.',
      'Se quiser, descreva como você recebe anúncios de venda, aluguel ou temporada.',
      'Confira a mensagem e escolha um canal para falar com a equipe EIAH.'
    ],
    link: ['Conhecer o atendimento a proprietários', './operacao-eiah/?objetivo=cadastrar#jornada']
  },
  {
    id: 'revisar',
    title: 'Conferir a mensagem de interesse',
    description: 'O resumo reúne sua preferência de IA, o cenário de interesse e os dados de contato que você escolheu informar.',
    steps: [
      'Abra Ver a mensagem para conferir o que vai ser enviado.',
      'Envie a mensagem pelo WhatsApp ou pelo seu aplicativo de e-mail.',
      'Use Copiar mensagem se preferir guardar o texto ou enviá-lo por outro canal.'
    ],
    link: ['Solicitar demonstração com IA', './operacao-eiah/?objetivo=novo#jornada']
  },
  {
    id: 'temporada',
    title: 'Consultar datas e pedir uma estadia',
    description: 'A vitrine calcula uma estimativa fictícia com diárias e taxa de limpeza. A equipe confirma as datas em uma etapa própria da demo.',
    steps: [
      'Na vitrine do Site com IA do Cliente, escolha Temporada e preencha entrada, saída e número de hóspedes. Para praticar, use Usar datas de exemplo.',
      'Clique em Pedir datas na ficha de um imóvel. Confira os dados e envie o pedido à equipe.',
      'Guarde o link do protocolo e reabra-o neste navegador para acompanhar o status.'
    ],
    link: ['Consultar imóveis de temporada', './ia-cliente/?finalidade=temporada#imoveis']
  },
  {
    id: 'equipe',
    title: 'Acompanhar atendimentos na fila',
    description: 'A visão da equipe acompanha pedidos de temporada de teste e exibe o histórico de simulações já salvas na aba.',
    steps: [
      'Crie um pedido de datas pela vitrine de temporada e abra a visão da equipe para procurar o protocolo.',
      'Em Histórico da simulação anterior, confira os pedidos de teste que já estavam salvos nesta aba.'
    ],
    link: ['Abrir visão da equipe', './operacao-eiah/equipe/']
  },
  {
    id: 'fila',
    title: 'Entender a visão da equipe',
    description: 'Esta página reúne pedidos de temporada e o histórico das simulações anteriores.',
    steps: [
      'Em Pedidos de temporada, procure pelo protocolo gerado na vitrine. Essa fila é compartilhada entre abas do mesmo navegador.',
      'Em Histórico da simulação anterior, veja os pedidos de teste que já estavam salvos nesta aba.'
    ],
    link: ['Abrir a visão da equipe', './operacao-eiah/equipe/']
  },
  {
    id: 'checkin',
    title: 'Confirmar datas e simular o check-in',
    description: 'Em Pedidos de temporada, a equipe recebe o protocolo gerado na vitrine. A demo compartilha essa fila entre abas do mesmo navegador.',
    steps: [
      'Abra a visão da equipe pela vitrine de temporada e encontre o protocolo do hóspede.',
      'Confira o imóvel e as datas. Clique em Confirmar disponibilidade ou em Marcar como indisponível. A demo impede duas confirmações para o mesmo imóvel em datas sobrepostas.',
      'Depois da confirmação, clique em Registrar check-in simulado. O status e o histórico ficam no mesmo pedido. Volte ao link do hóspede para ver o resultado.'
    ],
    link: ['Abrir fila de temporada', './operacao-eiah/equipe/#temporada']
  },
  {
    id: 'marca',
    title: 'Mudar a marca e a apresentação',
    description: 'Na prévia personalizável, você pode substituir o nome, a cor principal, o logo e o texto de apresentação.',
    steps: [
      'Em Marca, preencha o nome e escolha a cor. Envie um logo do computador, use as iniciais ou gere um prompt para criar a imagem com uma das ferramentas indicadas.',
      'Em Apresentação, escreva a introdução do site. Confira a prévia e clique em Aplicar à prévia 02.'
    ],
    link: ['Abrir o editor', './ia-cliente/personalizar/']
  },
  {
    id: 'site-cliente',
    title: 'Explorar o site da imobiliária',
    description: 'A Prévia 02 combina a vitrine editável e a jornada de temporada com uma marca de exemplo.',
    steps: [
      'Explore a vitrine e solicite uma demonstração para conhecer o atendimento com a sua própria IA.',
      'Em Personalizar meu site, altere a marca, os anúncios e os contatos para conferir como apareceriam na demo.',
      'Use Criar meu site para revisar sua vitrine e se cadastrar no piloto de publicação gratuita.'
    ],
    link: ['Abrir a Prévia 02', './ia-cliente/']
  },
  {
    id: 'logo',
    title: 'Escolher o logo da vitrine',
    description: 'A marca pode usar uma imagem enviada do computador, as iniciais ou um logo criado a partir de um prompt.',
    steps: [
      'Em Marca, abra Enviar do computador e escolha uma imagem ou use as iniciais.',
      'Para criar um logo, escolha Criar com um prompt, descreva a ideia e use o texto gerado em uma das ferramentas indicadas. Depois envie a imagem pelo editor.'
    ],
    link: ['Abrir o editor de marca', './ia-cliente/personalizar/']
  },
  {
    id: 'apresentacao',
    title: 'Editar a apresentação do site',
    description: 'O texto de apresentação aparece na abertura da vitrine personalizável.',
    steps: [
      'Abra Apresentação e escreva uma introdução curta para a imobiliária.',
      'Confira o resultado na Prévia da marca e clique em Aplicar à prévia 02 para salvar junto com a identidade da imobiliária.'
    ],
    link: ['Abrir o editor', './ia-cliente/personalizar/']
  },
  {
    id: 'imoveis',
    title: 'Editar imóveis e fotos',
    description: 'Você pode testar uma ficha com valores, características e fotos próprias ou de exemplo.',
    steps: [
      'Em Imóveis, escolha um anúncio de exemplo ou comece um novo. Preencha finalidade, localização, valor e descrição.',
      'Inclua fotos para a galeria. Se for temporada, indique a capacidade e a taxa de limpeza.',
      'Salve a ficha e confira o anúncio na vitrine da demo.'
    ],
    link: ['Abrir o editor de imóveis', './ia-cliente/personalizar/']
  },
  {
    id: 'rodape',
    title: 'Atualizar os contatos do rodapé',
    description: 'O rodapé mostra os dados públicos que você escolher, como responsável, CRECI, telefone, WhatsApp e e-mail.',
    steps: [
      'Abra Contatos, preencha apenas o que quer mostrar e clique em Salvar dados do rodapé.',
      'Abra a vitrine para conferir. Se já houver uma publicação simulada, reimporte a personalização em Criar meu site e publique outra versão.'
    ],
    link: ['Abrir Contatos', './ia-cliente/personalizar/#editorContact']
  },
  {
    id: 'contato',
    title: 'Conferir os contatos da imobiliária',
    description: 'O rodapé apresenta os dados profissionais e os canais de atendimento configurados para esta vitrine.',
    steps: [
      'Procure o responsável, o endereço e os canais de contato preenchidos.',
      'Na vitrine personalizável, abra Contatos no editor para escolher o que será exibido.'
    ],
    link: ['Abrir os contatos no editor', './ia-cliente/personalizar/#editorContact']
  },
  {
    id: 'voz',
    title: 'Personalizar as mensagens de voz',
    description: 'O editor aceita uma gravação curta para cada assistente da vitrine personalizável.',
    steps: [
      'Em Mensagens de voz dos assistentes, escolha Recepção, Imóvel ou Revisão.',
      'Grave sua voz ou selecione um arquivo de áudio. Ouça a amostra e clique em Aplicar áudio à etapa.',
      'Abra a etapa correspondente na vitrine para conferir. A gravação fica neste navegador.'
    ],
    link: ['Ir às mensagens de voz', './ia-cliente/personalizar/#voiceEditorTitle']
  },
  {
    id: 'publicar',
    title: 'Preparar a publicação gratuita da vitrine',
    description: 'O piloto oferece publicação e hospedagem gratuitas para até dez vitrines, após confirmação da equipe EIAH.',
    steps: [
      'Salve seu perfil e envie o cadastro para o piloto usando seu contato profissional.',
      'Importe a personalização e atualize a prévia local para revisar a marca, os anúncios e os contatos.',
      'Depois da confirmação da vaga, baixe o rascunho e envie à equipe EIAH para publicar.'
    ],
    link: ['Abrir Criar meu site', './ia-cliente/criar-site/']
  },
  {
    id: 'perfil',
    title: 'Salvar o perfil da demonstração',
    description: 'O perfil identifica a imobiliária para preparar o rascunho da vitrine.',
    steps: [
      'Preencha o nome, a imobiliária e o e-mail profissional. Use dados de exemplo para testar a prévia local.',
      'Clique em Salvar perfil para importar a personalização. Use Enviar cadastro para o piloto para compartilhar seu contato com a EIAH.'
    ],
    link: ['Abrir o perfil na demo', './ia-cliente/criar-site/#perfil']
  },
  {
    id: 'rascunho',
    title: 'Importar a personalização para o rascunho',
    description: 'O rascunho reúne as alterações que foram salvas no editor deste navegador.',
    steps: [
      'Clique em Importar personalização da demo depois de salvar o perfil.',
      'Para ajustar a marca, os imóveis ou o rodapé, use o editor. Volte e importe novamente para incluir as mudanças.'
    ],
    link: ['Abrir a preparação da vitrine', './ia-cliente/criar-site/#perfil']
  },
  {
    id: 'publicada',
    title: 'Conferir a vitrine publicada na demo',
    description: 'Esta página mostra a versão da marca, dos imóveis e do rodapé que você publicou neste navegador.',
    steps: [
      'Confira o nome, as informações do rodapé e as fichas dos imóveis que editou.',
      'Em um imóvel de temporada, use Pedir datas para testar o envio à visão da equipe.',
      'Depois de editar a vitrine, volte a Criar meu site, importe a personalização e publique outra versão.'
    ],
    link: ['Abrir a vitrine da demo', './ia-cliente/criar-site/vitrine/']
  },
  {
    id: 'pedido-datas',
    title: 'Enviar as datas à equipe',
    description: 'O formulário registra o imóvel, a entrada, a saída e o número de hóspedes no mesmo pedido de temporada.',
    steps: [
      'Confira as datas e a quantidade de hóspedes preenchidas.',
      'Clique em Enviar pedido à equipe e guarde o protocolo para acompanhar o andamento.'
    ],
    link: ['Consultar um imóvel de temporada', './ia-cliente/?finalidade=temporada#imoveis']
  },
  {
    id: 'acompanhar',
    title: 'Acompanhar o protocolo de temporada',
    description: 'O protocolo identifica o mesmo pedido na vitrine e na fila da equipe.',
    steps: [
      'No mesmo navegador, reabra o link do pedido para consultar as datas e o status.',
      'Depois da resposta da equipe, o protocolo mostra Disponibilidade confirmada ou Período indisponível. Após o teste de chegada, mostra Check-in registrado.'
    ],
    link: ['Abrir a fila de temporada', './operacao-eiah/equipe/#temporada']
  },
  {
    id: 'especialistas',
    title: 'Solicitar demo de um especialista',
    description: 'Recepção, Imóvel e Revisão acompanham a jornada. J_360, FinNexus e Radar Social são especialistas contratáveis.',
    steps: [
      'Em Agentes EIAH, navegue pelos cartões e abra os exemplos de uso para conhecer os especialistas.',
      'Clique em Solicitar Demo no cartão do especialista que você quer conhecer.',
      'Conte o que gostaria de testar e escolha como enviar sua solicitação.'
    ],
    link: ['Ir aos especialistas da demo', './ia-cliente/criar-site/#especialistas']
  }
];

export const demoGuidePages = {
  '': ['demos', 'conversa', 'site-cliente', 'temporada', 'publicar'],
  'operacao-eiah': ['inicio-vitrine', 'conversa', 'anuncio', 'vitrine', 'venda', 'locacao', 'temporada-vitrine', 'revisar', 'equipe', 'contato'],
  'operacao-eiah/equipe': ['checkin', 'fila', 'equipe', 'temporada'],
  'ia-cliente': ['vitrine', 'inicio-vitrine', 'venda', 'locacao', 'temporada-vitrine', 'temporada', 'conversa', 'revisar', 'anuncio', 'marca', 'contato'],
  'ia-cliente/personalizar': ['marca', 'logo', 'apresentacao', 'imoveis', 'rodape', 'voz', 'publicar', 'site-cliente'],
  'ia-cliente/criar-site': ['publicar', 'perfil', 'rascunho', 'rodape', 'especialistas'],
  'ia-cliente/criar-site/vitrine': ['publicada', 'contato', 'rodape', 'temporada'],
  'ia-cliente/temporada': ['temporada', 'pedido-datas', 'acompanhar', 'checkin']
};

export function demoGuideNarration(topic) {
  return [topic.title + '.', topic.description, ...topic.steps.map((step, index) =>
    'Passo ' + (index + 1) + '. ' + step)].join(' ');
}
