import { monthlyTotal, propertyPriceText } from './property-context.mjs';
import { money, quoteStay } from './stay-visual.mjs';
import { normalizeReply } from './request-chat-questions.mjs';
import { isKnownAmount } from './rental-costs.mjs';

const facts = [
  [/\b(metragem|area|metros|m2|tamanho)\b|m²/, item => 'A área é de ' + item.area + ' m².'],
  [/\b(tipo de imovel|e (?:um |uma )?(apartamento|casa|studio|kitnet|terreno))\b/, item => 'O tipo informado na ficha é ' + item.tipo.toLowerCase() + '.'],
  [/\b(finalidade|venda ou (?:aluguel|locacao|temporada)|aluguel ou venda)\b/, item =>
    'O anúncio é de ' + { venda: 'venda', locacao: 'locação residencial', temporada: 'temporada' }[item.finalidade] + '.'],
  [/\b(quartos?|dormitorios?)\b/, item => item.quartos === 1 ? 'O imóvel tem 1 quarto.' : 'O imóvel tem ' + item.quartos + ' quartos.'],
  [/\bsuites?\b/, item => item.suites ? 'O imóvel tem ' + item.suites + (item.suites === 1 ? ' suíte.' : ' suítes.') : 'A ficha indica que o imóvel não tem suíte.'],
  [/\bbanheiros?\b/, item => 'O imóvel tem ' + item.banheiros + (item.banheiros === 1 ? ' banheiro.' : ' banheiros.')],
  [/\b(vagas?|garagem|estacionamento)\b/, item => item.vagas ? 'O imóvel tem ' + item.vagas + (item.vagas === 1 ? ' vaga.' : ' vagas.') : 'A ficha indica que o imóvel não tem vaga.'],
  // Valor não informado devolve null: a resposta vira "precisa ser confirmado pela equipe", nunca R$ 0.
  [/\bcondominio\b/, item => isKnownAmount(item.condominio) ? 'O condomínio anunciado é de ' + money(item.condominio) + ' por mês.' : null],
  [/\biptu\b/, item => isKnownAmount(item.iptu) ? 'O IPTU informado é de ' + money(item.iptu) + ' por mês.' : null],
  [/\b(cidade|bairro|localizacao|onde fica)\b/, item => 'O imóvel fica em ' + item.bairro + ', ' + item.cidade + '.'],
  [/\b(hospedes|capacidade|quantas pessoas)\b/, item => item.stay ? 'O anúncio indica capacidade para até ' + item.stay.maxGuests + ' hóspedes.' : null],
  [/\b(limpeza)\b/, item => item.stay ? 'A taxa de limpeza anunciada é de ' + money(item.stay.cleaning) + '.' : null],
  [/\b(fotos?|imagens?|galeria)\b/, item => item.fotos?.length ? 'As fotos disponíveis estão na ficha do imóvel aqui no chat. Toque em uma para ampliar.' : null],
  [/\b(descricao|caracteristicas|diferenciais)\b/, item => item.descricao]
];
const specificAmounts = /\b(condominio|iptu|limpeza|total|encargos)\b/;
const priceWords = /\b(preco|valor|quanto custa|quanto sai|quanto e|quanto fica)\b/;
const teamCheck = /\b(disponivel|disponibilidade|pet|pets|animais|cachorro|gato|proposta|financiamento|desconto|endereco|rua|numero do predio|visita|visitar)\b/;
const amenities = /\b(varanda|sacada|jardim|churrasqueira|elevador|cozinha|iluminacao|mobiliad[oa]|mobilia|vista para o mar|vaga coberta|piscina)\b/g;
const variants = { mobiliado: /\b(mobiliad[oa]|mobilia)\b/, mobiliada: /\b(mobiliad[oa]|mobilia)\b/, mobilia: /\b(mobiliad[oa]|mobilia)\b/ };

export function isTeamContactRequest(message) {
  const text = normalizeReply(message);
  const contactChannel = /\b(whats(?:app)?|telefone|e-mail|email|numero de contato|contato da imobiliaria|falar comigo)\b/;
  const team = /\b(equipe|atendimento|imobiliaria|corretor(?:a)?|consultor(?:a)?|atendente|alguem|pessoa)\b/;
  const contactAction = /\b(falo|falar|converso|conversar|ligo|ligar|contato|atendimento humano|ser atendid[oa])\b/;
  return contactChannel.test(text) || (team.test(text) && contactAction.test(text)) ||
    /\b(me liguem|me ligar|me chama no|entrar em contato|pedir retorno)\b/.test(text);
}

function listedAmenity(property, term) {
  const matches = value => variants[term]?.test(normalizeReply(value)) ?? normalizeReply(value).includes(term);
  const sentence = property.descricao?.match(/[^.!?]+[.!?]?/g)?.find(matches);
  if (sentence) return 'A descrição diz “' + sentence.trim().replace(/[.!?]$/, '') + '”.';
  const feature = property.caracteristicas?.find(matches);
  return feature ? 'A ficha lista ' + feature.toLowerCase() + ' entre as características.' : null;
}

export function propertyChatReply(property, message, selection) {
  const text = normalizeReply(message);
  const inquiry = message.includes('?') || /\b(qual|quais|quant[oa]s?|onde|tem|aceita|fica|saber|informe|informa|informe-me|mostra|manda|envi[ae])\b/.test(text);
  const firstContact = !inquiry && /\b(quero|gostaria|procuro|tenho interesse|pretendo)\b/.test(text);
  if (firstContact) return 'Anotei sua mensagem sobre este imóvel. Você já pode revisar o pedido para a equipe da imobiliária.';

  const answers = [];
  let pending = teamCheck.test(text);
  const asksPrice = priceWords.test(text) && (!specificAmounts.test(text) || /\b(preco|valor)\s+e\b/.test(text));
  if (asksPrice || (property.stay && /\bdiaria\b/.test(text))) {
    answers.push('O valor anunciado é de ' + propertyPriceText(property) + '.');
  }
  const asksTotal = /\b(total|encargos|inclui|inclus[oa]s?|com condominio)\b/.test(text);
  if (asksTotal && property.finalidade === 'locacao') {
    const total = monthlyTotal(property);
    if (total === null) pending = true;
    else answers.push('O total mensal estimado com condomínio e IPTU é de ' + money(total) + '.');
  }
  if (/\b(total|quanto fica)\b.*\b(periodo|estadia|noites|dias)\b/.test(text) && property.stay) {
    const quote = quoteStay(property, selection);
    if (quote) answers.push('A estimativa do período selecionado é de ' + money(quote.total) + ', incluindo limpeza.');
    else pending = true;
  }
  for (const [pattern, answer] of facts) {
    if (!pattern.test(text)) continue;
    const value = answer(property);
    if (value) answers.push(value);
    else pending = true;
  }
  for (const [, amenity] of text.matchAll(amenities)) {
    const value = listedAmenity(property, amenity);
    if (value && !answers.includes(value)) answers.push(value);
    if (!value) pending = true;
  }
  if (!answers.length && !pending && !inquiry) {
    return 'Recebi sua mensagem. Pode continuar por aqui ou revisar o pedido para a equipe da imobiliária.';
  }
  if (!answers.length || pending) {
    const missing = answers.length
      ? 'O restante precisa ser confirmado pela equipe da imobiliária.'
      : 'Essa informação não está no anúncio. Sua mensagem pode seguir com o pedido para a equipe conferir.';
    if (!answers.length) return missing;
    answers.push(missing);
  }
  return 'Claro! Essa informação está no anúncio. ' + answers.join(' ');
}
