// Reporter NDJSON mínimo para node:test: serializa apenas test:start, test:pass,
// test:fail e test:summary. Não executa testes, não supervisiona processos e não
// interpreta resultados; a interpretação é de unitSuiteNodeEvents.ts.
//
// Uso:  UNIT_SUITE_EVENTS_FILE=<arquivo> node --test --test-reporter=<este arquivo> ...
// O arquivo é criado com flag "wx" (recusa arquivo existente, evitando artefato
// velho) e escrito de forma síncrona, para não depender do flush do stream do
// reporter. Sem a variável de ambiente o reporter lança erro (fail-closed).
// Nenhuma saída é emitida no stdout do runner.
import fs from "node:fs";

/** @typedef {import("./unitSuiteNodeEvents").UnitSuiteEventRecord} UnitSuiteEventRecord */

export const EVENTS_FILE_ENV = "UNIT_SUITE_EVENTS_FILE";

const RESULT_EVENTS = new Set(["test:start", "test:pass", "test:fail"]);

const count = (value) => (typeof value === "number" ? value : null);

/**
 * Converte um evento do Node em registro NDJSON, ou null quando o evento não é um dos quatro
 * necessários. Valores inesperados são gravados como null/inválidos, nunca corrigidos: o adaptador
 * rejeita o registro e a execução reprova.
 * @param {{ type?: unknown, data?: any }} event
 * @param {number} seq
 * @returns {UnitSuiteEventRecord | null}
 */
export function serializeEvent(event, seq) {
  const type = event?.type;
  const data = event?.data ?? {};
  if (RESULT_EVENTS.has(type)) {
    const detailsType = data.details?.type;
    const failureType = data.details?.error?.failureType;
    return {
      v: 1,
      kind: "event",
      seq,
      ev: type,
      file: typeof data.file === "string" ? data.file : null,
      name: typeof data.name === "string" ? data.name : null,
      nesting: typeof data.nesting === "number" ? data.nesting : null,
      skip: Boolean(data.skip),
      todo: Boolean(data.todo),
      detailsType: detailsType === "test" || detailsType === "suite" ? detailsType : null,
      failureType: typeof failureType === "string" ? failureType : null,
    };
  }
  if (type === "test:summary") {
    const counts = data.counts ?? {};
    return {
      v: 1,
      kind: "event",
      seq,
      ev: "test:summary",
      file: typeof data.file === "string" ? data.file : null,
      success: typeof data.success === "boolean" ? data.success : null,
      counts: {
        tests: count(counts.tests),
        passed: count(counts.passed),
        failed: count(counts.failed),
        cancelled: count(counts.cancelled),
        skipped: count(counts.skipped),
        todo: count(counts.todo),
      },
    };
  }
  return null;
}

export default async function* unitSuiteReporter(source) {
  const target = process.env[EVENTS_FILE_ENV];
  if (typeof target !== "string" || target === "") {
    throw new Error(`${EVENTS_FILE_ENV} must be set to the NDJSON output path`);
  }
  const fd = fs.openSync(target, "wx");
  let seq = 0;
  let events = 0;
  const write = (record) => fs.writeSync(fd, `${JSON.stringify(record)}\n`);
  try {
    seq += 1;
    write({ v: 1, kind: "header", seq, node: process.version });
    for await (const event of source) {
      const record = serializeEvent(event, seq + 1);
      if (record === null) continue;
      seq += 1;
      events += 1;
      write(record);
    }
    seq += 1;
    write({ v: 1, kind: "end", seq, events });
  } finally {
    fs.closeSync(fd);
  }
}
