import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";

export async function resolve(specifier, context, defaultResolve) {
  try {
    return await defaultResolve(specifier, context, defaultResolve);
  } catch (error) {
    const isRelative =
      specifier.startsWith("./")
      || specifier.startsWith("../")
      || specifier.startsWith("/");
    const hasExplicitExtension = /\.[a-z0-9]+$/i.test(specifier);
    if (!isRelative || hasExplicitExtension || error?.code !== "ERR_MODULE_NOT_FOUND") {
      throw error;
    }

    for (const candidate of [
      `${specifier}.js`,
      `${specifier}.mjs`,
      `${specifier}.ts`,
      `${specifier}/index.js`,
      `${specifier}/index.mjs`,
      `${specifier}/index.ts`,
    ]) {
      try {
        return await defaultResolve(candidate, context, defaultResolve);
      } catch (candidateError) {
        if (candidateError?.code !== "ERR_MODULE_NOT_FOUND") {
          throw candidateError;
        }
      }
    }

    throw error;
  }
}

export async function load(url, context, defaultLoad) {
  if (url.endsWith(".ts")) {
    const source = await readFile(new URL(url), "utf8");
    return {
      format: "module",
      shortCircuit: true,
      source: stripTypeScriptTypes(source, {
        mode: "strip",
        sourceUrl: url,
      }),
    };
  }

  return defaultLoad(url, context, defaultLoad);
}
