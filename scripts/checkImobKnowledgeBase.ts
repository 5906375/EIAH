import { buildImobKnowledgeBaseShadowSnapshot, ImobKnowledgeBaseLoaderError, loadImobKnowledgeBase } from "../apps/api/src/services/imob/imobKnowledgeBaseLoader.ts";

const CHECK = "check:imob-knowledge-base";
try {
  const result = loadImobKnowledgeBase();
  const shadow = buildImobKnowledgeBaseShadowSnapshot(result);
  console.log(
    JSON.stringify(
      {
        ok: true,
        check: CHECK,
        kbRoot: shadow.audit.manifestPath.replace(/\/manifest\.v1\.json$/, ""),
        manifest: shadow.audit.manifestPath,
        entryCount: shadow.entryCount,
        categories: shadow.categories,
        filesValidated: shadow.audit.filesValidated,
        schemas: [shadow.audit.entrySchemaPath, shadow.audit.manifestSchemaPath],
      },
      null,
      2,
    ),
  );
} catch (error) {
  if (error instanceof ImobKnowledgeBaseLoaderError) {
    console.error(
      JSON.stringify(
        {
          ok: false,
          check: CHECK,
          message: error.code,
          details: error.details ?? null,
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }
  throw error;
}
