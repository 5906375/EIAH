import type { Clause } from "./types";

export const CLAUSE_PROPERTY_OBJECT: Clause = {
  id: "property_object",
  title: "Objeto da locacao",
  category: "property",
  legalBase: ["Lei 8.245/91 art 22"],
  template:
    "O LOCADOR da em locacao ao LOCATARIO o imovel situado em {{property_address}}, destinado ao uso {{property_type}}.",
  variables: ["property_address", "property_type"],
};

export const CLAUSE_RENT_PAYMENT: Clause = {
  id: "rent_payment",
  title: "Pagamento do aluguel",
  category: "payment",
  template:
    "O aluguel mensal sera de R$ {{rent_value}}, com vencimento em {{due_date}}.",
  variables: ["rent_value", "due_date"],
};

export const CLAUSE_GUARANTOR: Clause = {
  id: "guarantor",
  title: "Garantia com fiador",
  category: "guarantee",
  template:
    "O presente contrato possui como fiador {{guarantor_name}}, que assume responsabilidade solidaria pelas obrigacoes do locatario.",
  variables: ["guarantor_name"],
  condition: {
    field: "guarantee_type",
    value: "Fiador",
  },
};

export const CLAUSE_TERMINATION_DEFAULT: Clause = {
  id: "termination_default",
  title: "Rescisao por inadimplemento",
  category: "termination",
  template:
    "O inadimplemento contratual podera ensejar rescisao, observados os prazos de notificacao e a legislacao aplicavel.",
};

export const CLAUSE_LGPD: Clause = {
  id: "lgpd",
  title: "Protecao de dados",
  category: "data_protection",
  template:
    "As partes autorizam o tratamento de dados pessoais conforme a Lei Geral de Protecao de Dados (Lei 13.709/2018).",
};

export const CLAUSE_LIBRARY: Record<string, Clause> = {
  property_object: CLAUSE_PROPERTY_OBJECT,
  rent_payment: CLAUSE_RENT_PAYMENT,
  guarantor: CLAUSE_GUARANTOR,
  termination_default: CLAUSE_TERMINATION_DEFAULT,
  lgpd: CLAUSE_LGPD,
};
