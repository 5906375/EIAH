// Diagnóstico (só leitura): quais recursos ativos o import deixa abertos? Não substitui limpeza; encerra o processo ao final.
const target = process.argv[2]!;
const mod = await import(target);
await new Promise((r) => setTimeout(r, 3000));
const info = (process as any).getActiveResourcesInfo() as string[];
const counts: Record<string, number> = {};
for (const k of info) counts[k] = (counts[k] ?? 0) + 1;
const handles = (process as any)._getActiveHandles?.() ?? [];
const sockets = handles.filter((h: any) => h?.constructor?.name === "Socket").map((h: any) => `${h.remoteAddress ?? "?"}:${h.remotePort ?? "?"}`);
console.log(JSON.stringify({ target: target.replace(process.cwd(), "."), exports: Object.keys(mod).length, resources: counts, sockets }));
process.exit(0);
