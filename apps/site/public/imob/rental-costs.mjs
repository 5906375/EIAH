// Encargos de locação sem inventar valores: "não informado" nunca vira R$ 0.
// Funções puras, sem DOM. Modelo alinhado à spec do importador de locações (desconhecido = null, origem por campo).

export const CHARGES = Object.freeze([
  Object.freeze({ key: 'condominio', label: 'Condomínio', name: 'condomínio' }),
  Object.freeze({ key: 'iptu', label: 'IPTU', name: 'IPTU' }),
]);

export const originLabels = Object.freeze({
  informed_by_manager: 'informado pela imobiliária',
  example: 'valor de exemplo',
  unknown: 'não informado',
});

/** Um valor só é "informado" quando é um número finito não negativo. Zero informado é diferente de ausente. */
export const isKnownAmount = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;

export function chargeStatus(property, key) {
  const amount = property?.[key];
  if (!isKnownAmount(amount)) return { key, known: false, amount: null, origin: 'unknown' };
  return {
    key,
    known: true,
    amount,
    origin: property.origem === 'informed_by_manager' ? 'informed_by_manager' : 'example',
  };
}

/**
 * Custos mensais de um imóvel. `total` só existe quando aluguel, condomínio e IPTU são conhecidos;
 * se faltar algum, `total` é null e `missing` diz quais. O IPTU entra arredondado, como antes.
 */
export function rentalCosts(property) {
  const charges = CHARGES.map(charge => ({ ...charge, ...chargeStatus(property, charge.key) }));
  const missing = charges.filter(charge => !charge.known);
  const complete = missing.length === 0 && isKnownAmount(property?.preco);
  const total = complete
    ? charges.reduce((sum, charge) => sum + (charge.key === 'iptu' ? Math.round(charge.amount) : charge.amount), property.preco)
    : null;
  return { rent: property?.preco ?? null, charges, missing, complete, total };
}

/** "condomínio e IPTU", "IPTU" ou "" quando nada falta. */
export const missingChargeNames = costs => costs.missing.map(charge => charge.name).join(' e ');

/** Aviso para o visitante: "Condomínio e IPTU não informados". */
export function unknownChargesNotice(costs) {
  const names = missingChargeNames(costs);
  if (!names) return '';
  return names[0].toUpperCase() + names.slice(1) + (costs.missing.length > 1 ? ' não informados' : ' não informado');
}
