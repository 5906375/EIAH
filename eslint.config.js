// EIAH_BUILDER/eslint.config.js
// ------------------------------------------------------
// ESLint v9+ Flat Config com TypeScript + Rule local
// ------------------------------------------------------

import js from "@eslint/js";
import * as tseslint from "@typescript-eslint/utils";
import path from "path";
import { fileURLToPath } from "url";
import noGlobalPrisma from "./.eslint-rules/no-global-prisma.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default [
    js.configs.recommended,
    {
        files: ["**/*.ts", "**/*.tsx"],
        ignores: ["dist", "node_modules"],
        languageOptions: {
            parser: (await import("@typescript-eslint/parser")).default,
            parserOptions: {
                project: path.resolve(__dirname, "tsconfig.base.json"),
                sourceType: "module",
            },
        },
        plugins: {
            "@typescript-eslint": (await import("@typescript-eslint/eslint-plugin")).default,
            "local-rules": {
                rules: {
                    "no-global-prisma": noGlobalPrisma,
                },
            },
        },
        rules: {
            "local-rules/no-global-prisma": "error",
            "@typescript-eslint/no-explicit-any": "off",
            "@typescript-eslint/no-unused-vars": [
                "warn",
                { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
            ],
            "no-console": "off",
            "no-var": "error",
            "prefer-const": "error",
        },
    },
];
