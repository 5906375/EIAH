// Regras do rascunho da vitrine (vitrine-imob.json), compartilhadas pelo gerador de páginas e pelo navegador.
// Funções puras, sem DOM e sem rede. Mensagens em português, todas de uma vez.

export const purposes = Object.freeze(['venda', 'locacao', 'temporada']);
export const maxProperties = 50;
export const maxPhotos = 20;
export const textLimits = Object.freeze({ titulo: 100, tipo: 40, cidade: 60, bairro: 60, descricao: 800 });

const isAmount = value => value === undefined || value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0);
const isOptionalText = (value, max) => value === undefined || value === null || (typeof value === 'string' && value.length <= max);

/** Confere o rascunho inteiro e lista todos os problemas de uma vez, em português, antes de gravar ou publicar qualquer coisa. */
export function validateDraft(draft) {
  const { brand, properties } = draft ?? {};
  if (!brand || typeof brand !== 'object' || Array.isArray(brand) || !Array.isArray(properties)) {
    throw new Error('Exporte um rascunho válido pelo editor IMOB.');
  }
  const problems = [];
  if (typeof brand.name !== 'string' || !brand.name.trim()) problems.push('Informe o nome da imobiliária.');
  else if (brand.name.length > 80) problems.push('O nome da imobiliária passa de 80 caracteres.');
  if (!isOptionalText(brand.introduction, 500)) problems.push('A apresentação deve ser um texto de até 500 caracteres.');
  if (properties.length > maxProperties) problems.push('O rascunho tem ' + properties.length + ' imóveis; o limite é ' + maxProperties + '.');
  properties.slice(0, maxProperties).forEach((property, index) => {
    const label = 'Imóvel ' + (index + 1) + ': ';
    if (!property || typeof property !== 'object' || Array.isArray(property)) {
      problems.push(label + 'dados inválidos.');
      return;
    }
    if (typeof property.titulo !== 'string' || !property.titulo.trim()) problems.push(label + 'informe o título.');
    if (!purposes.includes(property.finalidade)) problems.push(label + 'a finalidade deve ser venda, locação ou temporada.');
    if (typeof property.preco !== 'number' || !Number.isFinite(property.preco) || property.preco < 0) problems.push(label + 'o preço é inválido.');
    for (const [field, max] of Object.entries(textLimits)) {
      if (!isOptionalText(property[field], max)) problems.push(label + 'o campo ' + field + ' deve ser um texto de até ' + max + ' caracteres.');
    }
    for (const field of ['area', 'quartos', 'suites', 'banheiros', 'vagas', 'condominio', 'iptu']) {
      if (!isAmount(property[field])) problems.push(label + 'o campo ' + field + ' deve ser um número maior ou igual a zero.');
    }
    if (property.caracteristicas !== undefined && !(Array.isArray(property.caracteristicas) && property.caracteristicas.every(item => typeof item === 'string'))) {
      problems.push(label + 'as características devem ser uma lista de textos.');
    }
    if (property.fotos !== undefined && !(Array.isArray(property.fotos) && property.fotos.length <= maxPhotos)) {
      problems.push(label + 'as fotos devem ser uma lista de até ' + maxPhotos + '.');
    }
    if (property.stay !== undefined && (!property.stay || !isAmount(property.stay.maxGuests) || !isAmount(property.stay.cleaning))) {
      problems.push(label + 'os dados de temporada são inválidos.');
    }
  });
  if (problems.length) throw new Error('Corrija o rascunho antes de publicar:\n- ' + problems.join('\n- '));
}
