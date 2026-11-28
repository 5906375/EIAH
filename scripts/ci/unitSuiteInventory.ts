// Parser puro do manifesto da suíte unitária (scripts/unit-tests-manifest.txt).
//
// Recebe o conteúdo textual; não lê disco, não consulta processo, rede ou env.
// A varredura da árvore, a comparação com o script do CI e a ordem de
// execução ficam fora deste módulo.
//
// Compatibilidade com scripts/checkOrphanTests.ts: o gate de órfãos reconhece
// referências pelo padrão [a-zA-Z0-9_./-]+\.test\.tsx? e a varredura aceita
// *.test.ts e *.test.tsx. O conjunto de caracteres e as extensões abaixo são
// os mesmos, para que uma entrada aprovada aqui seja também reconhecível lá.

export const UNIT_SUITE_INVENTORY_VERSION = "unit-suite-inventory.v1";

export const UNIT_SUITE_TEST_EXTENSIONS = [".test.ts", ".test.tsx"] as const;

export type InventoryIssueCode =
  | "INVENTORY_CONTENT_NOT_STRING"
  | "INVENTORY_EMPTY"
  | "INVENTORY_MULTIPLE_OR_SPACED_ENTRY"
  | "INVENTORY_ABSOLUTE_PATH"
  | "INVENTORY_INVALID_CHARACTERS"
  | "INVENTORY_PATH_TRAVERSAL"
  | "INVENTORY_INVALID_EXTENSION"
  | "INVENTORY_DUPLICATE_ENTRY";

export type InventoryIssue = Readonly<{
  code: InventoryIssueCode;
  /** Linha 1-based no manifesto; 0 quando o problema é do conteúdo inteiro. */
  line: number;
  entry: string;
  detail?: string;
}>;

export type InventoryEntry = Readonly<{
  line: number;
  /** Texto da linha após trim, como escrito no manifesto. */
  raw: string;
  /** Caminho normalizado (separador "/", sem segmentos "." nem barras repetidas). */
  file: string;
}>;

export type InventoryParseResult =
  | Readonly<{
      ok: true;
      version: typeof UNIT_SUITE_INVENTORY_VERSION;
      /** Caminhos normalizados em ordem determinística (comparação por unidade de código). */
      files: readonly string[];
      /** Entradas na ordem em que aparecem no manifesto. */
      entries: readonly InventoryEntry[];
    }>
  | Readonly<{
      ok: false;
      version: typeof UNIT_SUITE_INVENTORY_VERSION;
      issues: readonly InventoryIssue[];
    }>;

const ALLOWED_CHARACTERS = /^[A-Za-z0-9_./-]+$/;
const WINDOWS_DRIVE = /^[A-Za-z]:/;

function compareCodeUnits(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function normalizeSegments(entry: string): string {
  const kept: string[] = [];
  for (const segment of entry.split("/")) {
    if (segment === "" || segment === ".") continue;
    kept.push(segment);
  }
  return kept.join("/");
}

function hasAllowedExtension(file: string): boolean {
  const base = file.slice(file.lastIndexOf("/") + 1);
  return UNIT_SUITE_TEST_EXTENSIONS.some((extension) => base.length > extension.length && base.endsWith(extension));
}

export function parseUnitSuiteManifest(content: string): InventoryParseResult {
  if (typeof content !== "string") {
    return {
      ok: false,
      version: UNIT_SUITE_INVENTORY_VERSION,
      issues: [{ code: "INVENTORY_CONTENT_NOT_STRING", line: 0, entry: "" }],
    };
  }

  const issues: InventoryIssue[] = [];
  const entries: InventoryEntry[] = [];
  const firstLineByFile = new Map<string, number>();

  const lines = content.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = index + 1;
    const raw = lines[index].trim();
    if (raw === "" || raw.startsWith("#")) continue;

    if (/\s/.test(raw)) {
      issues.push({ code: "INVENTORY_MULTIPLE_OR_SPACED_ENTRY", line, entry: raw });
      continue;
    }
    if (raw.startsWith("/") || WINDOWS_DRIVE.test(raw)) {
      issues.push({ code: "INVENTORY_ABSOLUTE_PATH", line, entry: raw });
      continue;
    }
    if (!ALLOWED_CHARACTERS.test(raw)) {
      issues.push({ code: "INVENTORY_INVALID_CHARACTERS", line, entry: raw });
      continue;
    }
    if (raw.split("/").includes("..")) {
      issues.push({ code: "INVENTORY_PATH_TRAVERSAL", line, entry: raw });
      continue;
    }

    const file = normalizeSegments(raw);
    if (!hasAllowedExtension(file)) {
      issues.push({
        code: "INVENTORY_INVALID_EXTENSION",
        line,
        entry: raw,
        detail: `allowed: ${UNIT_SUITE_TEST_EXTENSIONS.join(", ")}`,
      });
      continue;
    }

    const firstLine = firstLineByFile.get(file);
    if (firstLine !== undefined) {
      issues.push({ code: "INVENTORY_DUPLICATE_ENTRY", line, entry: raw, detail: `first at line ${firstLine}: ${file}` });
      continue;
    }
    firstLineByFile.set(file, line);
    entries.push({ line, raw, file });
  }

  if (issues.length === 0 && entries.length === 0) {
    issues.push({ code: "INVENTORY_EMPTY", line: 0, entry: "" });
  }
  if (issues.length > 0) {
    return { ok: false, version: UNIT_SUITE_INVENTORY_VERSION, issues };
  }

  return {
    ok: true,
    version: UNIT_SUITE_INVENTORY_VERSION,
    files: entries.map((entry) => entry.file).sort(compareCodeUnits),
    entries,
  };
}
