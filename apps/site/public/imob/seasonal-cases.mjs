import { quoteStay, stayDate } from './stay-visual.mjs';
import { readSeasonalCases, updateSeasonalCases } from './site-setup-store.mjs';

export const seasonalStatus = {
  pending: 'Aguardando confirmação',
  confirmed: 'Disponibilidade confirmada',
  unavailable: 'Período indisponível',
  checkedIn: 'Check-in registrado'
};

export function seasonalRequestUrl(property, selection, published = false) {
  const url = new URL('./ia-cliente/temporada/', import.meta.url);
  url.searchParams.set('imovel', property.id);
  if (published) url.searchParams.set('origem', 'publicada');
  for (const key of ['arrival', 'departure', 'guests']) {
    if (selection?.[key]) url.searchParams.set(key, selection[key]);
  }
  return url;
}

const caseIdPattern = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/;

export async function readSeasonalCase(id) {
  if (!caseIdPattern.test(id)) return null;
  return (await readSeasonalCases())[id] ?? null;
}

export function createSeasonalCase(id, property, selection) {
  const quote = quoteStay(property, selection);
  if (!caseIdPattern.test(id) || property?.finalidade !== 'temporada' || !quote) {
    throw new Error('Confira as datas, a disponibilidade de exemplo e o limite de hóspedes deste imóvel.');
  }
  return updateSeasonalCases(cases => {
    if (cases[id]) return cases;
    return {
      ...cases,
      [id]: {
        id,
        propertyId: property.id,
        propertyTitle: property.titulo,
        arrival: selection.arrival,
        departure: selection.departure,
        guests: Number(selection.guests),
        total: quote.total,
        status: 'pending',
        history: [{ status: 'pending', at: new Date().toISOString() }]
      }
    };
  });
}

export function changeSeasonalStatus(id, status) {
  return updateSeasonalCases(cases => {
    const current = caseIdPattern.test(id) ? cases[id] : null;
    if (current?.status === status) return cases;
    const allowed = current?.status === 'pending' && ['confirmed', 'unavailable'].includes(status)
      || current?.status === 'confirmed' && status === 'checkedIn';
    if (!allowed) throw new Error('Este pedido já foi atualizado. Confira o status para continuar.');
    if (status === 'confirmed') {
      if (current.arrival < stayDate()) throw new Error('A data de entrada deste pedido já passou.');
      const overlaps = Object.values(cases).some(other =>
        other.id !== id && other.propertyId === current.propertyId &&
        ['confirmed', 'checkedIn'].includes(other.status) &&
        current.arrival < other.departure && other.arrival < current.departure
      );
      if (overlaps) throw new Error('Já há um pedido confirmado para este imóvel em parte do período.');
    }
    return {
      ...cases,
      [id]: {
        ...current,
        status,
        history: [...current.history, { status, at: new Date().toISOString() }]
      }
    };
  });
}

export function seasonalSummary(record) {
  const localDate = date => date.split('-').reverse().join('/');
  return [
    ['Protocolo', record.id],
    ['Entrada', localDate(record.arrival)],
    ['Saída', localDate(record.departure)],
    ['Hóspedes', String(record.guests)]
  ];
}
