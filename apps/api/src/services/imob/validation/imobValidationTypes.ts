export type ImobValidationScope =
  | "generic"
  | "property.create"
  | "owner.create"
  | "lead.qualify"
  | "documents.review";

export type ImobValidationReasonCode =
  | "TEXT_NORMALIZED"
  | "NAME_NORMALIZED"
  | "PHONE_FORMAT_NORMALIZED"
  | "EMAIL_FORMAT_SUSPECT"
  | "INVALID_EMAIL_FORMAT"
  | "DOCUMENT_FORMAT_SUSPECT"
  | "INVALID_DOCUMENT_FORMAT"
  | "ADDRESS_NORMALIZED"
  | "ADDRESS_INCOMPLETE"
  | "ADDRESS_REQUIRES_CONFIRMATION"
  | "MISSING_REQUIRED_FIELD"
  | "VALIDATION_REQUIRES_HUMAN_CONFIRMATION";

export type ImobValidationWarning = {
  reasonCode: ImobValidationReasonCode;
  message: string;
};

export type ImobValidationBlocker = {
  reasonCode: ImobValidationReasonCode;
  field: string;
  message: string;
};

export type ImobValidationPendingField = {
  field: string;
  prompt: string;
};

export type ImobNormalizedDocument = {
  type: "cpf" | "cnpj" | "rg" | "unknown";
  rawValue: string;
  maskedValue: string;
  digits: string;
  isFormatValid: boolean;
};

export type ImobNormalizedAddress = {
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: "BR";
  confidence: "high" | "medium" | "low";
};

export type ImobValidationResult = {
  ok: boolean;
  rawInput: string;
  normalized: {
    text?: string;
    name?: string;
    email?: string;
    phone?: string;
    document?: ImobNormalizedDocument;
    address?: ImobNormalizedAddress;
  };
  warnings: ImobValidationWarning[];
  blockers: ImobValidationBlocker[];
  pendingFields: ImobValidationPendingField[];
};
