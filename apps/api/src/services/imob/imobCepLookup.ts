export type ImobCepLookupResult = {
  cep: string;
  city: string;
  state: string;
  neighborhood: string | null;
  street: string | null;
  address: string | null;
};

function normalizeCepDigits(value: string) {
  return value.replace(/\D/g, "").slice(0, 8);
}

function formatCep(value: string) {
  const digits = normalizeCepDigits(value);
  if (digits.length !== 8) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

function buildAddress(street: string | null, neighborhood: string | null) {
  if (street && neighborhood) return `${street} - ${neighborhood}`;
  if (street) return street;
  if (neighborhood) return neighborhood;
  return null;
}

export async function lookupImobCep(rawCep: string): Promise<ImobCepLookupResult | null> {
  const cep = normalizeCepDigits(rawCep);
  if (cep.length !== 8) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) return null;

    const payload = (await response.json()) as Record<string, unknown>;
    if (payload?.erro === true) return null;

    const city = typeof payload.localidade === "string" ? payload.localidade.trim() : "";
    const state = typeof payload.uf === "string" ? payload.uf.trim() : "";
    if (!city || !state) return null;

    const street = typeof payload.logradouro === "string" && payload.logradouro.trim().length > 0
      ? payload.logradouro.trim()
      : null;
    const neighborhood = typeof payload.bairro === "string" && payload.bairro.trim().length > 0
      ? payload.bairro.trim()
      : null;

    return {
      cep: formatCep(cep),
      city,
      state,
      neighborhood,
      street,
      address: buildAddress(street, neighborhood),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
