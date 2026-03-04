import fs from "node:fs";
import path from "node:path";

export type CheckResult = {
  ok: boolean;
  check: string;
  message: string;
  evidence?: string;
  details?: Record<string, unknown>;
};

export function fail(check: string, message: string, evidence?: string, details?: Record<string, unknown>): never {
  const out: CheckResult = { ok: false, check, message, evidence, details };
  console.error(JSON.stringify(out, null, 2));
  process.exit(1);
}

export function pass(check: string, message: string, evidence?: string, details?: Record<string, unknown>): void {
  const out: CheckResult = { ok: true, check, message, evidence, details };
  console.log(JSON.stringify(out, null, 2));
}

export function mustFile(file: string): string {
  const abs = path.resolve(file);
  if (!fs.existsSync(abs)) {
    throw new Error(`missing evidence file: ${file}`);
  }
  return fs.readFileSync(abs, "utf8");
}

export function hasAll(content: string, required: string[]): string[] {
  return required.filter((item) => !content.toLowerCase().includes(item.toLowerCase()));
}

export function parseIsoDate(content: string): Date | null {
  const match = content.match(/\b(20\d{2}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}(?::\d{2})?)Z?)?/);
  if (!match) return null;
  const raw = match[2] ? `${match[1]}T${match[2].length === 5 ? `${match[2]}:00` : match[2]}Z` : `${match[1]}T00:00:00Z`;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export function ageDays(date: Date): number {
  return (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
}
