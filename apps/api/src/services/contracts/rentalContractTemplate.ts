/**
 * Minuta de contrato de locação a partir dos cadastros do IMOB (proprietário,
 * imóvel e locação). Texto determinístico — nenhuma IA redige cláusulas.
 * É uma MINUTA: sai marcada para revisão antes da assinatura.
 */

export type RentalChargePayer = "inquilino" | "proprietario" | "dispensado" | "nao_existe" | "desconhecido";
export type RentalGuaranteeType = "caucao" | "fiador" | "seguro_fianca" | "titulo_capitalizacao" | "nenhuma" | "desconhecido";

export type RentalContractTerms = {
  landlordName: string;
  landlordDocument: string;
  tenantName: string;
  tenantDocument: string;
  propertyAddress: string;
  purpose: "residencial" | "comercial";
  registryNumber?: string | null;
  startDate: string; // AAAA-MM-DD
  durationMonths: number;
  rentCents: number;
  dueDay: number;
  adjustmentIndex?: string | null; // "IPCA", "IGP-M", "INPC" ou null = sem reajuste
  adjustmentMonth?: number | null;
  guaranteeType: RentalGuaranteeType;
  guaranteeAmountCents?: number | null;
  guarantorName?: string | null;
  iptu: RentalChargePayer;
  condominio: RentalChargePayer;
  condominioAmountCents?: number | null;
  forumCity: string;
  extraClause?: string | null;
};

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export function formatBrl(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatBrDate(iso: string) {
  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${year}`;
}

export function formatTaxDocument(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 11) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  if (digits.length === 14) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
  return value;
}

/** Data final = início + prazo em meses − 1 dia. */
export function computeEndDate(startDate: string, durationMonths: number) {
  const [year, month, day] = startDate.split("-").map(Number);
  const end = new Date(Date.UTC(year, month - 1 + durationMonths, day));
  end.setUTCDate(end.getUTCDate() - 1);
  return end.toISOString().slice(0, 10);
}

/** Meses inteiros entre duas datas (para preencher o prazo a partir da locação cadastrada). */
export function monthsBetween(startDate: string, endDate: string) {
  const [sy, sm, sd] = startDate.split("-").map(Number);
  const [ey, em, ed] = endDate.split("-").map(Number);
  // O contrato termina na véspera do aniversário: conta-se até o dia seguinte ao fim.
  const after = new Date(Date.UTC(ey, em - 1, ed + 1));
  let months = (after.getUTCFullYear() - sy) * 12 + (after.getUTCMonth() + 1 - sm);
  if (after.getUTCDate() < sd) months -= 1;
  return Math.max(1, months);
}

function payerText(payer: RentalChargePayer, item: string) {
  switch (payer) {
    case "inquilino":
      return `O ${item} será pago pelo LOCATÁRIO.`;
    case "proprietario":
      return `O ${item} será pago pelo LOCADOR.`;
    case "dispensado":
      return `O ${item} está dispensado, conforme acordo entre as partes.`;
    case "nao_existe":
      return `Não há ${item} incidente sobre o imóvel.`;
    default:
      return `A responsabilidade pelo ${item} será definida entre as partes (a preencher).`;
  }
}

function guaranteeText(terms: RentalContractTerms) {
  const amount = terms.guaranteeAmountCents ? ` no valor de ${formatBrl(terms.guaranteeAmountCents)}` : "";
  switch (terms.guaranteeType) {
    case "caucao":
      return `Em garantia das obrigações deste contrato, o LOCATÁRIO presta caução em dinheiro${amount}, limitada a três meses de aluguel (art. 38, § 2º, da Lei 8.245/91), a ser devolvida ao final da locação, corrigida, deduzidos eventuais débitos.`;
    case "fiador":
      return `Em garantia das obrigações deste contrato, assina como FIADOR(A) ${terms.guarantorName?.trim() || "(nome a preencher)"}, que responde solidariamente com o LOCATÁRIO até a efetiva devolução do imóvel.`;
    case "seguro_fianca":
      return `As obrigações deste contrato são garantidas por seguro-fiança locatício${amount}, contratado pelo LOCATÁRIO e mantido vigente durante toda a locação.`;
    case "titulo_capitalizacao":
      return `As obrigações deste contrato são garantidas por título de capitalização${amount}, vinculado à presente locação.`;
    case "nenhuma":
      return "A presente locação é celebrada sem garantia, podendo o LOCADOR exigir o pagamento antecipado do aluguel nos termos do art. 42 da Lei 8.245/91.";
    default:
      return "A modalidade de garantia será definida entre as partes (a preencher).";
  }
}

export function buildRentalContractText(terms: RentalContractTerms) {
  const endDate = computeEndDate(terms.startDate, terms.durationMonths);
  const purposeLabel = terms.purpose === "comercial" ? "NÃO RESIDENCIAL (COMERCIAL)" : "RESIDENCIAL";
  const adjustment = terms.adjustmentIndex
    ? `O aluguel será reajustado a cada 12 (doze) meses pela variação acumulada do ${terms.adjustmentIndex}${terms.adjustmentMonth ? `, no mês de ${MONTHS[terms.adjustmentMonth - 1]}` : ""}, ou pelo índice que vier a substituí-lo.`
    : "O aluguel não terá reajuste durante o prazo deste contrato, salvo novo acordo escrito entre as partes.";
  const condominioValue = terms.condominio === "inquilino" && terms.condominioAmountCents
    ? ` A taxa condominial ordinária de referência é de ${formatBrl(terms.condominioAmountCents)} por mês.`
    : "";

  const clauses: Array<[string, string]> = [
    [
      "DO OBJETO",
      `O LOCADOR dá em locação ao LOCATÁRIO o imóvel situado em ${terms.propertyAddress}${terms.registryNumber?.trim() ? `, matrícula nº ${terms.registryNumber.trim()}` : ""}, para fins exclusivamente ${terms.purpose === "comercial" ? "não residenciais (comerciais)" : "residenciais"}, vedada a alteração da destinação sem consentimento escrito do LOCADOR.`,
    ],
    [
      "DO PRAZO",
      `A locação terá prazo de ${terms.durationMonths} ${terms.durationMonths === 1 ? "mês" : "meses"}, com início em ${formatBrDate(terms.startDate)} e término em ${formatBrDate(endDate)}, data em que o LOCATÁRIO restituirá o imóvel livre e desocupado, salvo prorrogação nos termos da lei.`,
    ],
    [
      "DO ALUGUEL",
      `O aluguel mensal é de ${formatBrl(terms.rentCents)}, com vencimento todo dia ${terms.dueDay} de cada mês. O atraso sujeitará o LOCATÁRIO a multa de 10% (dez por cento) sobre o valor devido, juros de 1% (um por cento) ao mês e correção monetária.`,
    ],
    ["DO REAJUSTE", adjustment],
    [
      "DOS ENCARGOS",
      `${payerText(terms.iptu, "IPTU")} ${payerText(terms.condominio, "condomínio")}${condominioValue} Consumo de água, energia e gás é de responsabilidade do LOCATÁRIO durante a locação.`,
    ],
    ["DA GARANTIA", guaranteeText(terms)],
    [
      "DA CONSERVAÇÃO E BENFEITORIAS",
      "O LOCATÁRIO recebe o imóvel no estado descrito no laudo de vistoria e se obriga a conservá-lo e devolvê-lo nas mesmas condições, ressalvado o desgaste natural do uso. Benfeitorias dependem de autorização prévia e escrita do LOCADOR.",
    ],
    [
      "DA RESCISÃO",
      "A devolução antecipada do imóvel pelo LOCATÁRIO sujeita-o a multa equivalente a 3 (três) aluguéis, proporcional ao período restante do contrato (art. 4º da Lei 8.245/91). A infração de qualquer cláusula autoriza a rescisão, observada a legislação aplicável.",
    ],
    [
      "DA PROTEÇÃO DE DADOS",
      "As partes autorizam o tratamento dos dados pessoais constantes deste contrato exclusivamente para sua execução, nos termos da Lei 13.709/2018 (LGPD).",
    ],
    ...(terms.extraClause?.trim() ? [["DISPOSIÇÕES ESPECIAIS", terms.extraClause.trim()] as [string, string]] : []),
    ["DO FORO", `Fica eleito o foro da comarca de ${terms.forumCity} para dirimir as questões oriundas deste contrato.`],
  ];

  const lines = [
    "MINUTA — revisar antes de assinar",
    "",
    `CONTRATO DE LOCAÇÃO ${purposeLabel}`,
    "",
    `LOCADOR: ${terms.landlordName}, inscrito(a) no ${terms.landlordDocument.replace(/\D/g, "").length === 14 ? "CNPJ" : "CPF"} sob o nº ${formatTaxDocument(terms.landlordDocument)}.`,
    `LOCATÁRIO: ${terms.tenantName}, inscrito(a) no ${terms.tenantDocument.replace(/\D/g, "").length === 14 ? "CNPJ" : "CPF"} sob o nº ${formatTaxDocument(terms.tenantDocument)}.`,
    "",
    "As partes acima identificadas celebram o presente contrato de locação, regido pela Lei 8.245/91, mediante as cláusulas seguintes:",
    "",
    ...clauses.flatMap(([title, text], index) => [`CLÁUSULA ${index + 1}ª — ${title}`, text, ""]),
    `${terms.forumCity}, ____ de ______________ de ______.`,
    "",
    "",
    "______________________________",
    `LOCADOR: ${terms.landlordName}`,
    "",
    "______________________________",
    `LOCATÁRIO: ${terms.tenantName}`,
    ...(terms.guaranteeType === "fiador"
      ? ["", "______________________________", `FIADOR(A): ${terms.guarantorName?.trim() || "(nome a preencher)"}`]
      : []),
    "",
    "Testemunhas:",
    "1. ______________________________",
    "2. ______________________________",
  ];

  return { text: lines.join("\n"), endDate };
}
