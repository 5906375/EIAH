import { applyBrand } from './client-brand.mjs';
import { appendPropertyGallery } from './property-gallery.mjs';
import { money } from './stay-visual.mjs';
import { readSetup } from './site-setup-store.mjs';
import { seasonalRequestUrl } from './seasonal-cases.mjs';

function renderProperty(property) {
  const card = document.createElement('article');
  card.className = 'setup-option';
  const title = document.createElement('h3');
  title.textContent = property.titulo;
  const location = document.createElement('p');
  location.textContent = [property.bairro, property.cidade].join(' · ');
  const value = document.createElement('p');
  const units = { temporada: ' por diária', locacao: ' por mês', venda: '' };
  value.textContent = money(property.preco) + units[property.finalidade];
  const description = document.createElement('p');
  description.textContent = property.descricao;
  card.append(title, location, value, description);
  appendPropertyGallery(card, property, new URL('./', import.meta.url), 0);
  if (property.finalidade === 'temporada' && property.stay) {
    const request = document.createElement('a');
    request.className = 'btn btn-ghost';
    request.href = seasonalRequestUrl(property, null, true);
    request.textContent = 'Pedir datas';
    card.append(request);
  }
  return card;
}

const status = document.getElementById('published-status');
try {
  const { published } = await readSetup();
  if (published) {
    document.getElementById('published-site').hidden = false;
    document.getElementById('published-footer').hidden = false;
    applyBrand(document.body, published.brand, { preview: true });
    document.title = published.brand.name + ' · Publicação simulada';
    document.getElementById('published-homes').replaceChildren(...published.properties.map(renderProperty));
    document.getElementById('no-properties').hidden = published.properties.length > 0;
    status.textContent = 'Versão ' + published.revision + ' da vitrine · disponível neste navegador.';
  } else {
    status.textContent = 'Publique uma versão na demonstração para ver a sua vitrine aqui.';
  }
} catch {
  status.textContent = 'O navegador não conseguiu abrir a versão publicada na demonstração.';
}
