import Ajv from "ajv";
import { ToolContract } from "../types/ToolContract.js";

const ajv = new Ajv({ allErrors: true, strict: true });

export function validateInput(contract: ToolContract, payload: any): void {
    const validate = ajv.compile(contract.inputSchema);
    if (!validate(payload)) {
        throw new Error(`Invalid payload: ${ajv.errorsText(validate.errors)}`);
    }
}
