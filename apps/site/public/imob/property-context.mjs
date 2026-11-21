import { appendPropertyGallery, releasePropertyGallery } from './property-gallery.mjs';
import { storefrontProperties } from './client-properties.mjs';
import { money, quoteStay } from './stay-visual.mjs';

export const propertyGoals = { venda: 'comprar', locacao: 'alugar', temporada: 'temporada' };
const purposes = { venda: 'Venda', locacao: 'Locação residencial', temporada: 'Temporada' };

export const findProperty = id => storefrontProperties.find(property => property.id === id);
export const monthlyTotal = property => property.finalidade === 'locacao'
  ? property.preco + property.condominio + Math.round(property.iptu) : null;
export const propertyPriceText = property => money(property.preco) +
  (property.finalidade === 'venda' ? '' : ' por ' + (property.unidadePreco || 'mês'));

export function renderPropertyContext(container, property, selection) {
  const sameProperty = container.dataset.propertyId === property?.id;
  const expanded = sameProperty && container.querySelector('details')?.open;
  const galleryOffset = releasePropertyGallery(container);
  container.hidden = !property;
  container.replaceChildren();
  if (!property) return;
  container.dataset.propertyId = property.id;
  container.classList.add('property-context');

  const header = document.createElement('div');
  const caption = document.createElement('p');
  caption.className = 'property-context-caption';
  caption.textContent = 'Imóvel de referência · ' + property.id.toUpperCase();
  const title = document.createElement('h3');
  title.textContent = property.titulo;
  const summary = document.createElement('p');
  summary.textContent = [purposes[property.finalidade], property.bairro + ', ' + property.cidade, propertyPriceText(property)].join(' · ');
  header.append(caption, title, summary);
  container.append(header);

  appendPropertyGallery(container, property, import.meta.url, sameProperty ? galleryOffset : 0);

  const details = document.createElement('details');
  details.open = Boolean(expanded);
  const label = document.createElement('summary');
  label.textContent = 'Ver ficha do imóvel';
  const description = document.createElement('p');
  description.textContent = property.descricao;
  const facts = [
    ['Tipo', property.tipo],
    ['Área', property.area + ' m²'],
    ['Quartos', property.quartos],
    ['Suítes', property.suites],
    ['Banheiros', property.banheiros],
    ['Vagas', property.vagas],
    ['Condomínio', property.condominio ? money(property.condominio) + ' / mês' : 'R$ 0'],
    ['IPTU', property.iptu ? money(property.iptu) + ' / mês' : 'R$ 0'],
    ['Características', property.caracteristicas?.join(' · ')]
  ];
  const monthly = monthlyTotal(property);
  if (monthly !== null) facts.push(['Total mensal estimado', money(monthly)]);
  if (property.stay) {
    facts.push(['Capacidade', property.stay.maxGuests + ' hóspedes'], ['Limpeza', money(property.stay.cleaning)]);
    const quote = selection && quoteStay(property, selection);
    if (quote) facts.push(['Estimativa do período', money(quote.total) + ' por ' + quote.nights + ' noites']);
  }
  const list = document.createElement('dl');
  for (const [name, value] of facts) {
    if (value === undefined || value === '') continue;
    const fact = document.createElement('div');
    const term = document.createElement('dt');
    const definition = document.createElement('dd');
    term.textContent = name;
    definition.textContent = value;
    fact.append(term, definition);
    list.append(fact);
  }
  details.append(label, description, list);
  container.append(details);
}
