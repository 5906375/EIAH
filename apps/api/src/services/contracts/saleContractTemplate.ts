import { formatBrl, formatTaxDocument } from "./rentalContractTemplate";

/**
 * Minuta de promessa de compra e venda a partir dos cadastros do IMOB
 * (proprietário = vendedor, imóvel) e dos dados do comprador informados no
 * formulário. Texto determinístico — nenhuma IA redige cláusulas.
 * É uma MINUTA: sai marcada para revisão antes da assinatura.
 */

export type SalePaymentMethod = "a_vista" | "financiamento" | "parcelado";
export type SalePossession = "assinatura" | "escritura" | "quitacao";

export type SaleContractTerms = {
  sellerName: string;
  sellerDocument: string;
  buyerName: string;
  buyerDocument: string;
  propertyAddress: string;
  registryNumber?: string | null;
  priceCents: number;
  downPaymentCents?: number | null;
  paymentMethod: SalePaymentMethod;
  balanceTerms?: string | null;
  deedDeadlineDays: number;
  possession: SalePossession;
  commissionPercent?: number | null;
  forumCity: string;
  extraClause?: string | null;
};

const PAYMENT_TEXT: Record<SalePaymentMethod, string> = {
  a_vista: "à vista, na data da assinatura da escritura pública",
  financiamento: "por meio de financiamento imobiliário obtido pelo COMPRADOR, cuja aprovação é condição para a conclusão do negócio",
  parcelado: "em parcelas diretamente ao VENDEDOR",
};

const POSSESSION_TEXT: Record<SalePossession, string> = {
  assinatura: "na data de assinatura deste instrumento",
  escritura: "na data da assinatura da escritura pública definitiva",
  quitacao: "após a quitação integral do preço",
};

function documentKind(value: string) {
  return value.replace(/\D/g, "").length === 14 ? "CNPJ" : "CPF";
}

export function buildSaleContractText(terms: SaleContractTerms) {
  const balanceCents = terms.priceCents - (terms.downPaymentCents ?? 0);
  const payment = [
    `O preço certo e ajustado da venda é de ${formatBrl(terms.priceCents)}.`,
    terms.downPaymentCents
      ? `Na assinatura deste instrumento, o COMPRADOR paga ao VENDEDOR, a título de sinal e princípio de pagamento, ${formatBrl(terms.downPaymentCents)}, que valerá como arras confirmatórias (arts. 417 a 420 do Código Civil). O saldo de ${formatBrl(balanceCents)} será pago ${PAYMENT_TEXT[terms.paymentMethod]}.`
      : `O preço será pago ${PAYMENT_TEXT[terms.paymentMethod]}.`,
    terms.balanceTerms?.trim() ? `Condições do saldo: ${terms.balanceTerms.trim()}` : null,
  ].filter(Boolean).join(" ");

  const clauses: Array<[string, string]> = [
    [
      "DO OBJETO",
      `O VENDEDOR, legítimo proprietário, promete vender ao COMPRADOR, e este promete comprar, o imóvel situado em ${terms.propertyAddress}${terms.registryNumber?.trim() ? `, objeto da matrícula nº ${terms.registryNumber.trim()}` : ""}, com todas as suas benfeitorias, no estado em que se encontra.`,
    ],
    ["DO PREÇO E DA FORMA DE PAGAMENTO", payment],
    [
      "DA ESCRITURA",
      `A escritura pública definitiva será outorgada em até ${terms.deedDeadlineDays} dias contados desta data, ou da liberação do financiamento, se for o caso. As despesas de escritura, ITBI e registro correm por conta do COMPRADOR.`,
    ],
    ["DA POSSE", `A posse do imóvel será transmitida ao COMPRADOR ${POSSESSION_TEXT[terms.possession]}.`],
    [
      "DOS DÉBITOS E TRIBUTOS",
      "Tributos, taxas condominiais e contas de consumo vencidos até a data da transmissão da posse são de responsabilidade do VENDEDOR; os posteriores, do COMPRADOR.",
    ],
    [
      "DAS DECLARAÇÕES DO VENDEDOR",
      "O VENDEDOR declara que o imóvel está livre e desembaraçado de ônus reais, dívidas, ações reais ou pessoais reipersecutórias, e se obriga a apresentar as certidões necessárias à lavratura da escritura.",
    ],
    [
      "DA IRRETRATABILIDADE E DO INADIMPLEMENTO",
      `Este compromisso é celebrado em caráter irrevogável e irretratável, obrigando herdeiros e sucessores. O inadimplemento de qualquer das partes autoriza a outra a exigir o cumprimento ou a resolução do contrato, com perdas e danos${terms.downPaymentCents ? ", observado o regime das arras" : ""}.`,
    ],
    ...(terms.commissionPercent
      ? [["DA CORRETAGEM", `A comissão de corretagem de ${terms.commissionPercent.toLocaleString("pt-BR")}% sobre o preço é devida pelo VENDEDOR à imobiliária intermediadora, na conclusão do negócio.`] as [string, string]]
      : []),
    [
      "DA PROTEÇÃO DE DADOS",
      "As partes autorizam o tratamento dos dados pessoais constantes deste instrumento exclusivamente para sua execução, nos termos da Lei 13.709/2018 (LGPD).",
    ],
    ...(terms.extraClause?.trim() ? [["DISPOSIÇÕES ESPECIAIS", terms.extraClause.trim()] as [string, string]] : []),
    ["DO FORO", `Fica eleito o foro da comarca de ${terms.forumCity} para dirimir as questões oriundas deste instrumento.`],
  ];

  const lines = [
    "MINUTA — revisar antes de assinar",
    "",
    "INSTRUMENTO PARTICULAR DE PROMESSA DE COMPRA E VENDA DE IMÓVEL",
    "",
    `VENDEDOR: ${terms.sellerName}, inscrito(a) no ${documentKind(terms.sellerDocument)} sob o nº ${formatTaxDocument(terms.sellerDocument)}.`,
    `COMPRADOR: ${terms.buyerName}, inscrito(a) no ${documentKind(terms.buyerDocument)} sob o nº ${formatTaxDocument(terms.buyerDocument)}.`,
    "",
    "As partes acima identificadas celebram o presente instrumento, mediante as cláusulas seguintes:",
    "",
    ...clauses.flatMap(([title, text], index) => [`CLÁUSULA ${index + 1}ª — ${title}`, text, ""]),
    `${terms.forumCity}, ____ de ______________ de ______.`,
    "",
    "",
    "______________________________",
    `VENDEDOR: ${terms.sellerName}`,
    "",
    "______________________________",
    `COMPRADOR: ${terms.buyerName}`,
    "",
    "Testemunhas:",
    "1. ______________________________",
    "2. ______________________________",
  ];
  return { text: lines.join("\n"), balanceCents };
}
