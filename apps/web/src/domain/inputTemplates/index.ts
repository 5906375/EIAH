import { IMOB_DATA_INPUT_TEMPLATES } from "./imob";
import { SHARED_DATA_INPUT_TEMPLATES } from "./shared";
import type { DataInputTemplate, TemplateVertical } from "./types";

const DATA_INPUT_TEMPLATES: DataInputTemplate[] = [
  ...IMOB_DATA_INPUT_TEMPLATES,
  ...SHARED_DATA_INPUT_TEMPLATES,
];

export { IMOB_DATA_INPUT_TEMPLATES, SHARED_DATA_INPUT_TEMPLATES };
export type { DataInputTemplate, DataInputTemplateSection, TemplateVertical } from "./types";

export function listDataInputTemplates(vertical?: TemplateVertical) {
  if (!vertical) return DATA_INPUT_TEMPLATES;
  return DATA_INPUT_TEMPLATES.filter((item) => item.vertical === vertical);
}

export function getDataInputTemplate(templateId: string) {
  return DATA_INPUT_TEMPLATES.find((item) => item.id === templateId) ?? null;
}

export function formatDataInputTemplate(template: DataInputTemplate) {
  const lines = [
    `TEMPLATE DE DADOS (${template.code})`,
    ...template.sections.map((section) => `${section.label}: ${section.fields.map((field) => `[${field}]`).join(" | ")}`),
  ];
  return lines.join("\n");
}
