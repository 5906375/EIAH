// Fixture sanitizada — contrato de locação residencial para testes.
// TODOS os dados pessoais (CPF, RG, CNH, telefone, e-mail, assinatura)
// foram removidos ou substituídos por dados fictícios.
// Não commitar PII real neste arquivo. Ver spec §13.1.

export const LEASE_CONTRACT_GINA_101_SANITIZED_TEXT = `
CONTRATO DE LOCAÇÃO RESIDENCIAL

Tipo: locação residencial
Finalidade: residencial

IMÓVEL
Imóvel: apartamento 101
Cidade: Balneário Camboriú/SC
Logradouro: Rua das Flores, nº 200, apartamento 101
CEP: 88330-000

PARTES
Locador: Nome Fictício do Locador (nenhum dado pessoal real)
Locatário: Nome Fictício do Locatário (nenhum dado pessoal real)

VALORES
Aluguel: R$ 1.800,00
Condomínio: R$ 200,00
Caução: R$ 1.800,00
Caução em 2 parcelas: R$ 900,00 + R$ 900,00
Vencimento da segunda parcela da caução: 09/07/2026

VIGÊNCIA
Prazo: 08/06/2026 a 08/06/2027

REAJUSTE E PENALIDADES
Reajuste: IGP-M anual
Multa por atraso: 10%
Juros de mora: 1% ao mês
Tolerância: 6 dias úteis

CLÁUSULAS
1. O imóvel destina-se exclusivamente ao uso residencial.
2. É vedada a sublocação sem autorização expressa do locador.
3. O locatário se responsabiliza pela conservação do imóvel.
4. Em caso de rescisão antecipada, aplica-se multa proporcional.
5. Foro: Comarca de Balneário Camboriú/SC.

[Nenhuma assinatura, reconhecimento de firma ou biometria real neste documento de teste]
`.trim();

// Campos esperados após extração — usados como baseline nos testes.
export const LEASE_CONTRACT_GINA_101_EXPECTED = {
  monthlyRentCents: 180000,
  condoFeeCents: 20000,
  depositCents: 180000,
  depositInstallmentCents: 90000,
  startDate: "2026-06-08",
  endDate: "2027-06-08",
  lateFeePercent: 10,
  monthlyInterestPercent: 1,
  gracePeriodBusinessDays: 6,
  city: "Balneário Camboriú",
  state: "SC",
  adjustmentIndex: "IGP-M anual",
  contractPurpose: "residencial",
} as const;

// Texto com PII sintética para testar o masker.
// Todos os dados abaixo são fictícios — CPF inválido (dígitos verificadores errados),
// RG inválido, e-mail fictício, telefone fictício.
export const SYNTHETIC_PII_TEXT = `
Nome: João da Silva Fictício
CPF: 123.456.789-09
RG: 12.345.678-9
CNH: 12345678901
Telefone: (47) 99999-0000
E-mail: joao.ficticio@exemplo.com.br
Telefone alternativo: +55 47 98888-1111
`.trim();

export const SYNTHETIC_PII_EXPECTED_MASKED = {
  cpf: "***.***.***-**",
  email: "***@***.***",
  phone: "***MASKED***",
  rg: "RG: ***MASKED***",
  cnh: "CNH: ***MASKED***",
} as const;
