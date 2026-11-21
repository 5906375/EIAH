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
  '': ['demos', 'vitrine', 'conversa', 'temporada', 'publicar'],
  'operacao-eiah': ['conversa', 'anuncio', 'vitrine', 'equipe'],
  'operacao-eiah/equipe': ['checkin', 'equipe', 'temporada'],
  'ia-cliente': ['vitrine', 'temporada', 'conversa', 'anuncio', 'marca'],
  'ia-cliente/personalizar': ['marca', 'imoveis', 'rodape', 'voz', 'publicar'],
  'ia-cliente/criar-site': ['publicar', 'rodape', 'especialistas'],
  'ia-cliente/criar-site/vitrine': ['vitrine', 'publicar', 'rodape', 'temporada'],
  'ia-cliente/temporada': ['temporada', 'checkin']
};

export function demoGuideNarration(topic) {
  return [topic.title + '.', topic.description, ...topic.steps.map((step, index) =>
    'Passo ' + (index + 1) + '. ' + step)].join(' ');
}
