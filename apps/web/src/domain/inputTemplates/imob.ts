import type { DataInputTemplate } from "./types";

export const IMOB_DATA_INPUT_TEMPLATES: DataInputTemplate[] = [
  {
    id: "imob.locacao_contrato_v2",
    vertical: "imob",
    code: "LOCACAO",
    title: "Template de dados para contrato de locacao",
    sections: [
      {
        label: "Parte A",
        fields: [
          "Papel (Locador | Proprietario | Vendedor)",
          "Nome completo",
          "CPF/CNPJ",
          "Telefone",
          "E-mail",
        ],
      },
      {
        label: "Parte B",
        fields: [
          "Papel (Locatario | Comprador | Inquilino)",
          "Nome completo",
          "CPF",
          "Telefone",
          "E-mail",
        ],
      },
      {
        label: "Imovel",
        fields: [
          "Endereco completo",
          "Tipo (Residencial | Comercial)",
          "Matricula (se houver)",
        ],
      },
      {
        label: "Condicoes",
        fields: [
          "Prazo (meses)",
          "Valor aluguel (R$)",
          "Dia de vencimento",
          "Garantia (Caucao | Fiador | Seguro fianca)",
        ],
      },
    ],
  },
  {
    id: "imob.locacao_contrato",
    vertical: "imob",
    code: "LOCACAO",
    title: "Template de dados (locacao)",
    sections: [
      { label: "Locador", fields: ["Nome completo", "CPF/CNPJ", "Telefone", "E-mail"] },
      { label: "Locatario", fields: ["Nome completo", "CPF", "Telefone", "E-mail"] },
      { label: "Imovel", fields: ["Endereco completo", "Tipo", "Matricula (se houver)"] },
      { label: "Condicoes", fields: ["Prazo (meses)", "Valor aluguel", "Vencimento", "Garantia"] },
    ],
  },
  {
    id: "imob.venda_contrato",
    vertical: "imob",
    code: "VENDA",
    title: "Template de dados (venda)",
    sections: [
      { label: "Vendedor", fields: ["Nome completo", "CPF/CNPJ", "Telefone", "E-mail"] },
      { label: "Comprador", fields: ["Nome completo", "CPF/CNPJ", "Telefone", "E-mail"] },
      { label: "Imovel", fields: ["Endereco completo", "Tipo", "Matricula"] },
      { label: "Condicoes", fields: ["Valor de venda", "Sinal", "Forma de pagamento", "Data prevista de escritura"] },
    ],
  },
  {
    id: "imob.proprietario_cadastro",
    vertical: "imob",
    code: "PROPRIETARIO",
    title: "Template de dados (proprietario)",
    sections: [
      { label: "Proprietario", fields: ["Nome completo", "CPF/CNPJ", "Estado civil", "Telefone", "E-mail"] },
      { label: "Endereco do proprietario", fields: ["Rua", "Numero", "Bairro", "Cidade", "UF", "CEP"] },
      { label: "Documentos", fields: ["RG/IE (se aplicavel)", "Comprovante de endereco", "Dados bancarios"] },
    ],
  },
  {
    id: "imob.locador_cadastro",
    vertical: "imob",
    code: "LOCADOR",
    title: "Template de dados (locador)",
    sections: [
      { label: "Locador", fields: ["Nome completo", "CPF/CNPJ", "Telefone", "E-mail"] },
      { label: "Dados de cobranca", fields: ["Banco", "Agencia", "Conta", "Chave PIX"] },
      { label: "Preferencias", fields: ["Dia de vencimento", "Tipo de garantia aceita", "Prazo minimo"] },
    ],
  },
  {
    id: "imob.locatario_cadastro",
    vertical: "imob",
    code: "LOCATARIO",
    title: "Template de dados (locatario)",
    sections: [
      { label: "Locatario", fields: ["Nome completo", "CPF", "Telefone", "E-mail"] },
      { label: "Renda e ocupacao", fields: ["Profissao", "Renda mensal", "Empresa", "Tempo de trabalho"] },
      { label: "Garantia", fields: ["Fiador", "Seguro fianca", "Titulo de capitalizacao", "Caucao"] },
    ],
  },
  {
    id: "imob.comprador_cadastro",
    vertical: "imob",
    code: "COMPRADOR",
    title: "Template de dados (comprador)",
    sections: [
      { label: "Comprador", fields: ["Nome completo", "CPF/CNPJ", "Telefone", "E-mail"] },
      { label: "Perfil de compra", fields: ["Faixa de valor", "Finalidade (moradia/investimento)", "Regiao de interesse"] },
      { label: "Capacidade financeira", fields: ["Forma de pagamento", "Entrada disponivel", "Aprovacao de credito"] },
    ],
  },
];
