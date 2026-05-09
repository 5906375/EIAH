import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./scripts/extensionless-esm-loader.mjs", pathToFileURL("./"));
