// Gera as 10 vitrines de exemplo do piloto IMOB (imobiliárias fictícias, endereços exemplo-*).
// Rodar de novo regrava as mesmas páginas. Para reabrir as vagas: publish-imob-pilot.mjs --remover-exemplos.
import { pathToFileURL } from 'node:url';
import { publish } from './publish-imob-pilot.mjs';

const asset = name => '/imob/assets/' + name + '.webp';

// Nomes protegidos: a palavra que identificaria a imobiliária fica oculta ([xxxxxx]), então nenhum nome pode ser
// idêntico ao de uma empresa real. Os endereços são numerados e também não carregam a palavra oculta.
const agencies = [
  { slug: 'exemplo-01', name: 'Recanto das [xxxxxxx] Imóveis', city: 'Itapema', accent: '#087566', districts: ['Meia Praia', 'Morretes', 'Centro'] },
  { slug: 'exemplo-02', name: 'Brisa [xxxxxx] Negócios Imobiliários', city: 'Balneário Camboriú', accent: '#0f5e9c', districts: ['Pioneiros', 'Nações', 'Centro'] },
  { slug: 'exemplo-03', name: 'Horizonte [xxxx] Imóveis', city: 'Porto Belo', accent: '#1f6f8b', districts: ['Perequê', 'Centro', 'Araçá'] },
  { slug: 'exemplo-04', name: 'Vila [xxxxxxxx] Imóveis', city: 'Bombinhas', accent: '#2d6a4f', districts: ['Bombas', 'Mariscal', 'Quatro Ilhas'] },
  { slug: 'exemplo-05', name: 'Ponta do [xxxx] Casas e Apartamentos', city: 'Penha', accent: '#b4531a', districts: ['Armação', 'Centro', 'Praia Alegre'] },
  { slug: 'exemplo-06', name: 'Jardim das [xxxxxxx] Imobiliária', city: 'Camboriú', accent: '#7a3e9d', districts: ['Tabuleiro', 'Centro', 'Várzea'] },
  { slug: 'exemplo-07', name: 'Costa [xxxxxx] Imóveis', city: 'Itajaí', accent: '#9d6b0f', districts: ['Praia Brava', 'Fazenda', 'Cabeçudas'] },
  { slug: 'exemplo-08', name: 'Maré [xxxxxx] Imóveis', city: 'Garopaba', accent: '#3b5bdb', districts: ['Centro', 'Siriú', 'Ferrugem'] },
  { slug: 'exemplo-09', name: 'Raízes do [xxxxxxx] Imobiliária', city: 'Navegantes', accent: '#a0522d', districts: ['Gravatá', 'Centro', 'Meia Praia'] },
  { slug: 'exemplo-10', name: 'Ilha [xxxxxx] Imóveis', city: 'Florianópolis', accent: '#9d2a4b', districts: ['Canasvieiras', 'Ingleses', 'Campeche'] }
];

// Modelos de imóvel com as imagens ilustrativas que já fazem parte do site.
const models = [
  { finalidade: 'venda', tipo: 'Apartamento', titulo: 'Apartamento com varanda', base: 940000, area: 82, quartos: 2, suites: 1, banheiros: 2, vagas: 1, condominio: 680, iptu: 140,
    fotos: ['vitrine-apartamento', 'vitrine-alto-padrao-cozinha'], caracteristicas: ['Varanda', 'Cozinha integrada', 'Vaga coberta'], descricao: 'Sala iluminada, cozinha integrada e varanda.' },
  { finalidade: 'venda', tipo: 'Casa', titulo: 'Casa com jardim e espaço gourmet', base: 1250000, area: 160, quartos: 3, suites: 1, banheiros: 3, vagas: 2, condominio: 0, iptu: 190,
    fotos: ['vitrine-casa', 'vitrine-alto-padrao-sala', 'vitrine-alto-padrao-gourmet'], caracteristicas: ['Jardim', 'Churrasqueira', 'Garagem'], descricao: 'Casa ampla com sala aberta para o jardim e área de lazer.' },
  { finalidade: 'venda', tipo: 'Apartamento', titulo: 'Apartamento com vista para o mar', base: 1680000, area: 110, quartos: 3, suites: 2, banheiros: 3, vagas: 2, condominio: 980, iptu: 220,
    fotos: ['site-ia-vista-mar-balneario', 'vitrine-varanda', 'vitrine-alto-padrao-quarto'], caracteristicas: ['Vista para o mar', 'Varanda gourmet', 'Elevador'], descricao: 'Sala voltada ao mar, varanda ampla e suíte principal.' },
  { finalidade: 'locacao', tipo: 'Apartamento', titulo: 'Apartamento para locação', base: 2900, area: 68, quartos: 2, suites: 0, banheiros: 1, vagas: 1, condominio: 520, iptu: 95,
    fotos: ['vitrine-locacao', 'vitrine-locacao-cozinha', 'vitrine-locacao-quarto'], caracteristicas: ['Vaga', 'Boa iluminação', 'Elevador'], descricao: 'Dois quartos, luz natural e uma vaga de garagem.' },
  { finalidade: 'locacao', tipo: 'Studio', titulo: 'Studio mobiliado', base: 1900, area: 33, quartos: 1, suites: 0, banheiros: 1, vagas: 0, condominio: null, iptu: null,
    fotos: ['vitrine-studio'], caracteristicas: ['Mobiliado', 'Cozinha integrada'], descricao: 'Studio funcional, pronto para morar.' },
  { finalidade: 'locacao', tipo: 'Casa', titulo: 'Casa de alto padrão para locação', base: 14500, area: 280, quartos: 4, suites: 3, banheiros: 5, vagas: 4, condominio: 1200, iptu: 650,
    fotos: ['vitrine-alto-padrao-sala', 'vitrine-alto-padrao-quarto', 'vitrine-alto-padrao-cozinha', 'vitrine-alto-padrao-gourmet'], caracteristicas: ['Piscina', 'Espaço gourmet', 'Lareira'], descricao: 'Sala com pé-direito alto, cozinha com ilha e área gourmet com piscina.' },
  { finalidade: 'temporada', tipo: 'Apartamento', titulo: 'Apartamento de temporada', base: 560, area: 74, quartos: 2, suites: 1, banheiros: 2, vagas: 1, condominio: 0, iptu: 0,
    stay: { maxGuests: 4, cleaning: 180, blocked: [] }, fotos: ['vitrine-temporada', 'vitrine-varanda'], caracteristicas: ['Mobiliado', 'Sacada', 'Vista para o mar'], descricao: 'Apartamento mobiliado, com sacada, para uma estadia em família.' }
];

function generator(seed) {
  let state = seed * 2654435761 % 4294967296;
  return () => { state = (state + 0x6d2b79f5) | 0; let t = Math.imul(state ^ (state >>> 15), 1 | state); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const round = (value, step) => Math.round(value / step) * step;

/** Rascunho fictício de cada imobiliária: 3 ou 4 imóveis escolhidos e ajustados de forma estável. */
export function exampleDraft(agency, index) {
  const random = generator(index + 11);
  const count = 3 + (index % 2);
  const chosen = [...models].map(model => ({ model, order: random() })).sort((a, b) => a.order - b.order).slice(0, count).map(item => item.model);
  const properties = chosen.map(model => {
    const factor = 0.8 + random() * 0.5;
    const step = model.finalidade === 'venda' ? 5000 : 50;
    const { base, fotos, ...rest } = model;
    return {
      ...rest,
      titulo: model.titulo,
      bairro: agency.districts[Math.floor(random() * agency.districts.length)],
      cidade: agency.city,
      preco: round(base * factor, step),
      fotos: fotos.map(asset),
      origem: 'example'
    };
  });
  return {
    brand: {
      name: agency.name,
      introduction: 'Vitrine de exemplo em ' + agency.city + '. Veja como o seu site pode ficar com a sua marca, os seus imóveis e as suas fotos.',
      accent: agency.accent,
      footerAddress: 'Endereço fictício, apenas para exemplo'
    },
    properties
  };
}

export const exampleSites = agencies.map((agency, index) => ({ slug: agency.slug, draft: exampleDraft(agency, index) }));

export function publishExampleSites({ root } = {}) {
  return exampleSites.map(({ slug, draft }) => publish(slug, draft, { root, example: true }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const results = publishExampleSites();
    console.log(results.length + ' vitrines de exemplo prontas para deploy:');
    for (const result of results) console.log('  ' + result.url);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
