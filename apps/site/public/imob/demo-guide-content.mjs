// Cada assunto alimenta o texto e a narração. Atualize aqui ao mudar o fluxo da demo.
export const demoGuideTopics = [
  {
    id: 'demos',
    title: 'Escolher uma demonstração',
    description: 'As duas prévias do IMOB usam dados fictícios. Você pode explorar como hóspede ou interessado e depois assumir o papel da equipe.',
    steps: [
      'Abra Operação EIAH para simular um atendimento e consultar a visão da equipe.',
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
      'Abra Ver detalhes para consultar a ficha e a galeria. Em Conversar sobre este imóvel, o atendimento já abre com o imóvel selecionado.'
    ],
    link: ['Ir à vitrine de imóveis', './ia-cliente/#vitrine']
  },
  {
    id: 'inicio-vitrine',
    title: 'Começar pela vitrine',
    description: 'A página inicial reúne três caminhos para explorar a demonstração.',
    steps: [
      'Use Iniciar atendimento para contar se quer comprar, alugar ou tirar uma dúvida.',
      'Use Explorar imóveis para navegar pela vitrine e aplicar filtros.',
      'Use Anunciar meu imóvel para preparar um pedido de anúncio com dados fictícios.'
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
      'Marque Comparar para ver os imóveis lado a lado ou converse sobre um deles para simular o atendimento de compra.'
    ],
    link: ['Abrir a lista de imóveis à venda', './ia-cliente/?finalidade=venda#imoveis']
  },
  {
    id: 'locacao',
    title: 'Imóveis para alugar',
    description: 'A categoria Aluguel anual mostra opções de locação mensal. Quando há valores informados, a ficha estima o total com condomínio e IPTU.',
    steps: [
      'Filtre por bairro, número de quartos e valor. Compare o aluguel anunciado com a estimativa mensal de encargos.',
      'Abra os detalhes, veja as fotos e converse sobre o imóvel para informar seu prazo de mudança ou tirar dúvidas sobre os custos.'
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
    title: 'Conversar por texto ou áudio',
    description: 'Os assistentes da demo orientam as etapas de recepção, imóvel e revisão.',
    steps: [
      'Clique em Iniciar atendimento e conte o que precisa. Você pode escrever ou gravar até trinta segundos por mensagem.',
      'Escolha o objetivo e responda às perguntas. Use a opção de ouvir a pergunta se quiser acompanhar por áudio.',
      'Confira o resumo na revisão. Confirme a proposta para guardar o rascunho e clique em Salvar pedido. Na Operação EIAH, você pode abrir a visão da equipe pela confirmação do pedido.'
    ],
    link: ['Abrir Operação EIAH', './operacao-eiah/#inicio']
  },
  {
    id: 'anuncio',
    title: 'Pedir ajuda para anunciar um imóvel',
    description: 'O atendimento reúne as informações iniciais e aponta o que a equipe precisaria conferir com o proprietário.',
    steps: [
      'Abra Anunciar meu imóvel e indique se é para venda, locação residencial ou temporada.',
      'Inclua as características, o valor pretendido, a disponibilidade e se já tem fotos.',
      'Revise e salve o pedido na demo para praticar o encaminhamento.'
    ],
    link: ['Ir ao atendimento', './operacao-eiah/#inicio']
  },
  {
    id: 'revisar',
    title: 'Revisar e salvar o pedido',
    description: 'A revisão reúne as respostas, os dados do imóvel, as gravações e a próxima ação sugerida.',
    steps: [
      'Leia o resumo e corrija o que precisar nesta etapa do atendimento.',
      'Clique em Confirmar proposta. Depois, clique em Salvar pedido para concluir o teste.',
      'Use Copiar resumo se quiser guardar o texto. Na Operação EIAH, o pedido salvo aparece na fila desta aba.'
    ],
    link: ['Abrir Operação EIAH', './operacao-eiah/#inicio']
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
    description: 'A visão da equipe mostra o resumo, o imóvel e os áudios dos atendimentos salvos na Operação EIAH.',
    steps: [
      'Envie um pedido pela Operação EIAH e escolha Ver pedido na visão da equipe.',
      'Na seção Outros pedidos de atendimento, confira o objetivo, o resumo e as gravações. Para esse fluxo, mantenha a mesma aba.'
    ],
    link: ['Abrir visão da equipe', './operacao-eiah/equipe/']
  },
  {
    id: 'fila',
    title: 'Entender a visão da equipe',
    description: 'Esta página reúne pedidos de temporada e outros atendimentos de demonstração.',
    steps: [
      'Em Pedidos de temporada, procure pelo protocolo gerado na vitrine. Essa fila é compartilhada entre abas do mesmo navegador.',
      'Em Outros pedidos de atendimento, veja os pedidos que você salvou na Operação EIAH nesta mesma aba.'
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
    description: 'A Prévia 02 combina a vitrine editável, o atendimento e a jornada de temporada com uma marca de exemplo.',
    steps: [
      'Abra a vitrine para testar como um interessado vê os imóveis e faz um pedido.',
      'Em Personalizar meu site, altere a marca, os anúncios e os contatos para conferir como apareceriam na demo.',
      'Use Criar meu site para guardar uma versão publicada neste navegador.'
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
    title: 'Montar e publicar a vitrine na demo',
    description: 'A publicação simulada guarda uma versão dos imóveis editados, da marca e do rodapé no navegador.',
    steps: [
      'Em Criar meu site, use dados de exemplo e salve o perfil de demonstração.',
      'Clique em Importar personalização da demo. Depois use Simular pagamento e Publicar na demonstração.',
      'Abra Ver vitrine publicada na demo para conferir. Para aplicar edições novas, importe e publique novamente.'
    ],
    link: ['Abrir Criar meu site', './ia-cliente/criar-site/']
  },
  {
    id: 'perfil',
    title: 'Salvar o perfil da demonstração',
    description: 'O perfil identifica a imobiliária para preparar o rascunho da vitrine.',
    steps: [
      'Clique em Usar dados de exemplo ou preencha o nome, a imobiliária e o e-mail profissional com dados fictícios.',
      'Clique em Salvar perfil de demonstração para liberar a importação da personalização.'
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
    title: 'Conhecer e ativar especialistas',
    description: 'Na demo, J_360 apresenta o apoio jurídico, FinNexus o apoio financeiro e Radar Social a escuta de mercado.',
    steps: [
      'Em Especialistas EIAH, leia os cartões para conhecer o papel de cada agente.',
      'Depois de publicar a vitrine na demo, revise o escopo de um especialista. Confirme a contratação simulada e clique em Ativar.',
      'Confira o estado Ativo na demonstração. Esse teste serve para praticar o fluxo de contratação.'
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
