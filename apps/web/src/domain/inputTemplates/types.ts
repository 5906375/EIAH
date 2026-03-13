export type TemplateVertical = "imob" | "shared";

export type DataInputTemplateSection = {
  label: string;
  fields: string[];
};

export type DataInputTemplate = {
  id: string;
  vertical: TemplateVertical;
  code: string;
  title: string;
  sections: DataInputTemplateSection[];
};
