const day = 86400000;
const start = new Date();
const today = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());

export function stayDate(offset = 0) {
  return new Date(today + offset * day).toISOString().slice(0, 10);
}

export function stayNights(arrival, departure) {
  return (Date.parse(departure) - Date.parse(arrival)) / day;
}

export function validStay({ arrival, departure, guests }) {
  const nights = stayNights(arrival, departure);
  return arrival >= stayDate() && Number.isInteger(nights) && nights > 0 && nights <= 30 &&
    Number.isInteger(Number(guests)) && guests >= 1 && guests <= 12;
}

export function quoteStay(property, selection) {
  if (!property?.stay || !validStay(selection)) return null;
  const { arrival, departure, guests } = selection;
  const { maxGuests, cleaning, blocked } = property.stay;
  if (guests > maxGuests || blocked.some(offset => arrival <= stayDate(offset) && stayDate(offset) < departure)) return null;
  const nights = stayNights(arrival, departure);
  return { nights, lodging: nights * property.preco, cleaning, total: nights * property.preco + cleaning };
}

export const money = value => value.toLocaleString('pt-BR', {
  style: 'currency', currency: 'BRL', maximumFractionDigits: value % 1 ? 2 : 0
});
