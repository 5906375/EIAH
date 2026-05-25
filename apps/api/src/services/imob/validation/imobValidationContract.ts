import type { ImobValidationResult, ImobValidationScope } from "./imobValidationTypes";

export const IMOB_VALIDATION_ENGINE_CONTRACT_ID = "imob.validation.engine.v1";

export type ImobValidationInput = {
  rawInput: string;
  scope?: ImobValidationScope;
};

export type ImobValidationEngine = (input: ImobValidationInput) => ImobValidationResult;
