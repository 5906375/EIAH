export const properties = [
  {
    id: 'v-01', finalidade: 'venda', tipo: 'Apartamento', bairro: 'Centro', cidade: 'Balneário Camboriú',
    titulo: 'Apartamento com varanda no Centro', preco: 940000, condominio: 680, iptu: 140,
    area: 82, quartos: 2, suites: 1, banheiros: 2, vagas: 1,
    fotos: [new URL('./assets/vitrine-apartamento.webp', import.meta.url).href], destaque: true,
    descricao: 'Sala iluminada, cozinha integrada e varanda. Exemplo de imóvel próximo a serviços do bairro.',
    caracteristicas: ['Varanda', 'Cozinha integrada', 'Vaga coberta']
  },
  {
    id: 'v-02', finalidade: 'venda', tipo: 'Casa', bairro: 'Morretes', cidade: 'Itapema',
    titulo: 'Casa com jardim em Morretes', preco: 860000, condominio: 0, iptu: 120,
    area: 115, quartos: 3, suites: 1, banheiros: 2, vagas: 2,
    fotos: [new URL('./assets/vitrine-casa.webp', import.meta.url).href],
    descricao: 'Casa térrea com espaço externo, garagem e sala aberta para o jardim.',
    caracteristicas: ['Jardim', 'Garagem', 'Churrasqueira']
  },
  {
    id: 'v-03', finalidade: 'venda', tipo: 'Apartamento', bairro: 'Praia Brava', cidade: 'Itajaí',
    titulo: 'Apartamento com vista na Praia Brava', preco: 1380000, condominio: 820, iptu: 180,
    area: 96, quartos: 3, suites: 1, banheiros: 2, vagas: 2,
    fotos: [new URL('./assets/vitrine-varanda.webp', import.meta.url).href],
    descricao: 'Varanda ampla voltada ao litoral e sala para dois ambientes.',
    caracteristicas: ['Vista para o mar', 'Varanda', 'Elevador']
  },
  {
    id: 'l-01', finalidade: 'locacao', tipo: 'Apartamento', bairro: 'Centro', cidade: 'Balneário Camboriú',
    titulo: 'Apartamento para locação no Centro', preco: 2750, condominio: 480, iptu: 95,
    area: 67, quartos: 2, suites: 0, banheiros: 1, vagas: 1,
    fotos: [
      new URL('./assets/vitrine-locacao.webp', import.meta.url).href,
      new URL('./assets/vitrine-locacao-cozinha.webp', import.meta.url).href,
      new URL('./assets/vitrine-locacao-quarto.webp', import.meta.url).href
    ], destaque: true,
    descricao: 'Dois quartos, luz natural e uma vaga. Imóvel de exemplo sem mobília, com imagens ilustrativas.',
    caracteristicas: ['Vaga', 'Boa iluminação', 'Elevador']
  },
  {
    id: 'l-02', finalidade: 'locacao', tipo: 'Studio', bairro: 'Nações', cidade: 'Balneário Camboriú',
    titulo: 'Studio mobiliado no bairro das Nações', preco: 1800, condominio: 320, iptu: 55,
    area: 33, quartos: 1, suites: 0, banheiros: 1, vagas: 0,
    fotos: [new URL('./assets/vitrine-studio.webp', import.meta.url).href],
    descricao: 'Studio mobiliado e funcional com cozinha integrada.',
    caracteristicas: ['Mobiliado', 'Cozinha integrada']
  },
  {
    id: 't-01', finalidade: 'temporada', tipo: 'Apartamento', bairro: 'Meia Praia', cidade: 'Itapema',
    titulo: 'Apartamento de temporada em Meia Praia', preco: 560, condominio: 0, iptu: 0,
    unidadePreco: 'diária', area: 74, quartos: 2, suites: 1, banheiros: 2, vagas: 1,
    stay: { maxGuests: 4, cleaning: 180, blocked: [2, 3, 4] },
    fotos: [new URL('./assets/vitrine-temporada.webp', import.meta.url).href],
    descricao: 'Apartamento mobiliado com sacada e espaço para uma estadia em família.',
    caracteristicas: ['Mobiliado', 'Sacada', 'Vista para o mar']
  }
];
