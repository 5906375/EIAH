import type { DataInputTemplate } from "./types";

export const SHARED_DATA_INPUT_TEMPLATES: DataInputTemplate[] = [
  {
    id: "shared.pessoa_basico",
    vertical: "shared",
    code: "PESSOA",
    title: "Template de dados (pessoa)",
    sections: [
      { label: "Identificacao", fields: ["Nome completo", "Documento", "Telefone", "E-mail"] },
      { label: "Endereco", fields: ["Rua", "Numero", "Bairro", "Cidade", "UF", "CEP"] },
    ],
  },
  {
    id: "shared.empresa_basico",
    vertical: "shared",
    code: "EMPRESA",
    title: "Template de dados (empresa)",
    sections: [
      { label: "Empresa", fields: ["Razao social", "Nome fantasia", "CNPJ", "Contato principal"] },
      { label: "Endereco comercial", fields: ["Rua", "Numero", "Bairro", "Cidade", "UF", "CEP"] },
      { label: "Compliance", fields: ["Inscricao estadual/municipal", "Representante legal", "Documentacao"] },
    ],
  },
];
