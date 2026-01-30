import type { RunAtivoInterpreter } from "../types";
import { buildBasePayload } from "./utils";

export const interpretGeneric: RunAtivoInterpreter = (input) => {
  return buildBasePayload(input, {
    insights:
      input.insights ??
      ["Nenhum insight específico fornecido. Use o editor para adicionar anotações manuais."],
  });
};
