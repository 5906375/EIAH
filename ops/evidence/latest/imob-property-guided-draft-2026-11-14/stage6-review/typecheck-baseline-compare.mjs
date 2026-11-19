// Compara os diagnósticos do tsconfig INTEGRAL entre a árvore atual e um HEAD virtual (git show), com o MESMO compilador e as MESMAS opções.
// Sem checkout, stash ou escrita na worktree: o HEAD é servido por um host de leitura. Arquivos novos (não rastreados) não existem no HEAD:
// ficam fora do programa de baseline e seus diagnósticos aparecem como "novos arquivos". Uso (na raiz do repositório):
//   node <este arquivo> <nome> <caminho-do-tsconfig> [saida.json]
import ts from "typescript";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
const [, , name, configArg, outArg] = process.argv;
const root = process.cwd();
const rel = (file) => path.relative(root, file).split(path.sep).join("/");
const git = (...args) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 1 << 28 }).split("\n").filter(Boolean);
const headTree = new Set(git("ls-tree", "-r", "--name-only", "HEAD"));
const changed = new Set(git("diff", "--name-only", "HEAD").filter((file) => headTree.has(file)));
const untracked = new Set(git("ls-files", "--others", "--exclude-standard"));
const configPath = path.resolve(configArg);
const parsed = ts.getParsedCommandLineOfConfigFile(configPath, {}, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: (d) => { throw new Error(ts.flattenDiagnosticMessageText(d.messageText, "\n")); } });
const options = { ...parsed.options, noEmit: true };
const headCache = new Map();
const fromHead = (file) => { if (!headCache.has(file)) headCache.set(file, execFileSync("git", ["show", `HEAD:${file}`], { encoding: "utf8", maxBuffer: 1 << 28 })); return headCache.get(file); };
const isNewFile = (file) => { const r = rel(file); return !r.startsWith("..") && !headTree.has(r) && [...untracked].some((u) => u === r || r.startsWith(u.endsWith("/") ? u : `${u}/`)); };
function run(baseline) {
  const host = ts.createCompilerHost(options);
  if (baseline) {
    const read = host.readFile.bind(host), exists = host.fileExists.bind(host);
    host.readFile = (file) => { const r = rel(file); if (!r.startsWith("..") && !r.includes("node_modules/") && changed.has(r)) return fromHead(r); return isNewFile(file) ? undefined : read(file); };
    host.fileExists = (file) => (isNewFile(file) ? false : exists(file));
  }
  const rootNames = baseline ? parsed.fileNames.filter((file) => !isNewFile(file)) : parsed.fileNames;
  const program = ts.createProgram({ rootNames, options, host, projectReferences: parsed.projectReferences });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  return { files: rootNames.length, diagnostics: diagnostics.map((d) => ({ file: d.file ? rel(d.file.fileName) : null, code: d.code, line: d.file && d.start !== undefined ? d.file.getLineAndCharacterOfPosition(d.start).line + 1 : null,
    message: ts.flattenDiagnosticMessageText(d.messageText, "\n").split("\n")[0] })) };
}
const t0 = Date.now();
const base = run(true), cur = run(false);
// Chave sem linha (deslocamentos não contam); multiconjunto para repetições da mesma mensagem no mesmo arquivo.
// O TypeScript imprime membros de uniões/objetos em ordem que varia entre programas (ordem de criação dos tipos). A chave compara o MULTICONJUNTO de
// tokens da mensagem (aproximação deliberada: dois diagnósticos de mesmo arquivo/código com os mesmos tokens em outra ordem contam como o mesmo).
// Números ficam de fora: tipos truncados imprimem "... N more ..." e N muda quando um tipo importado ganha um campo (efeito de import, não erro novo).
const canon = (message) => (message.match(/"[^"]*"|[A-Za-z_$][\w$]*/g) ?? []).sort().join(" ");
const key = (d) => JSON.stringify([d.file, d.code, canon(d.message)]);
const count = (list) => list.reduce((m, d) => m.set(key(d), (m.get(key(d)) ?? 0) + 1), new Map());
const bc = count(base.diagnostics), cc = count(cur.diagnostics);
const introduced = [], resolved = [], present = [];
for (const [k, n] of cc) { const b = bc.get(k) ?? 0; const d = JSON.parse(k); if (n > b) introduced.push({ file: d[0], code: d[1], message: d[2], extra: n - b }); if (Math.min(n, b) > 0) present.push({ file: d[0], code: d[1], message: d[2], count: Math.min(n, b) }); }
for (const [k, n] of bc) { const c = cc.get(k) ?? 0; if (n > c) { const d = JSON.parse(k); resolved.push({ file: d[0], code: d[1], message: d[2], fewer: n - c }); } }
const newFiles = new Set(parsed.fileNames.filter(isNewFile).map(rel));
const result = { project: name, config: rel(configPath), typescript: ts.version, headCommit: git("rev-parse", "HEAD")[0],
  baselineFiles: base.files, currentFiles: cur.files, newFilesInCurrentProgram: [...newFiles].length,
  baselineDiagnostics: base.diagnostics.length, currentDiagnostics: cur.diagnostics.length,
  presentInBaseline: present.reduce((s, d) => s + d.count, 0), introduced: introduced.reduce((s, d) => s + d.extra, 0), resolved: resolved.reduce((s, d) => s + d.fewer, 0),
  introducedInNewFiles: introduced.filter((d) => d.file && newFiles.has(d.file)).reduce((s, d) => s + d.extra, 0),
  introducedList: introduced.map((d) => ({ ...d, message: d.message.slice(0, 400) })), resolvedList: resolved.map((d) => ({ ...d, message: d.message.slice(0, 400) })), seconds: Math.round((Date.now() - t0) / 1000),
  currentByFile: Object.fromEntries([...cur.diagnostics.reduce((m, d) => m.set(d.file, (m.get(d.file) ?? 0) + 1), new Map())].sort((a, b) => b[1] - a[1])) };
if (outArg) writeFileSync(outArg, JSON.stringify(result, null, 2) + "\n");
const { introducedList, resolvedList, currentByFile, ...summary } = result;
console.log(JSON.stringify(summary));
process.exitCode = result.introduced ? 1 : 0;
