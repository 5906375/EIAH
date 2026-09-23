import { execFileSync, spawnSync } from "node:child_process";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { Client } from "../../../packages/db/src/oraculo/connection.js";

const root = fileURLToPath(new URL("../../../", import.meta.url));
for (const key of ["DATABASE_URL", "SHADOW_DATABASE_URL", "PGHOST", "PGPORT", "PGDATABASE", "PGUSER", "PGPASSWORD", "CI1_TEST_CONFIG"]) {
  if (process.env[key]) throw new Error(`Refusing inherited connection setting: ${key}`);
}
const docker = (...args: string[]) => execFileSync("docker", args, { encoding: "utf8", timeout: 30_000 }).trim();
const image = JSON.parse(docker("image", "inspect", "postgres:16"))[0];
if (!/^sha256:[a-f0-9]{64}$/.test(image.Id)) throw new Error("Invalid local image identity");
const runId = randomUUID();
const name = `oraculo-ci1-${runId}`;
const password = randomBytes(24).toString("hex");
const roles = ["oraculo_ci1_executor", "oraculo_ci1_approver", "oraculo_ci1_writer", "oraculo_ci1_reader"];
let container = "";
let admin: Client | undefined;
const report: Record<string, unknown> = { runId, executedAt: new Date().toISOString(), imageId: image.Id, imageDigests: image.RepoDigests, baseline: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim() };
const evidence = resolve(root, "ops/evidence/latest/oraculo-ci1-validation", runId);
try {
  container = execFileSync("docker", ["run", "--detach", "--pull=never", "--name", name,
    "--label", `eiah.oraculo.ci1=${runId}`, "--publish", "127.0.0.1::5432",
    "--tmpfs", "/var/lib/postgresql/data:rw", "--env", "POSTGRES_PASSWORD",
    "--env", "POSTGRES_DB=oraculo_ci1_synthetic", image.Id],
    { encoding: "utf8", timeout: 30_000, env: { PATH: process.env.PATH, HOME: process.env.HOME, POSTGRES_PASSWORD: password } }).trim();
  const meta = JSON.parse(docker("inspect", container))[0];
  if (meta.Config.Labels["eiah.oraculo.ci1"] !== runId || meta.Mounts.some((m: any) => m.Type !== "tmpfs")) throw new Error("Container isolation mismatch");
  const binding = meta.NetworkSettings.Ports["5432/tcp"][0];
  if (binding.HostIp !== "127.0.0.1") throw new Error("Non-loopback binding");
  const config = { host: "127.0.0.1", port: Number(binding.HostPort), database: "oraculo_ci1_synthetic", password, connectionTimeoutMillis: 2000 };
  for (let attempt = 0; attempt < 60; attempt++) {
    const candidate = new Client({ ...config, user: "postgres" });
    try { await candidate.connect(); admin = candidate; break; }
    catch { await candidate.end().catch(() => {}); await new Promise(r => setTimeout(r, 250)); }
  }
  if (!admin) throw new Error("Dedicated database did not start");
  const version = (await admin.query("SHOW server_version_num")).rows[0].server_version_num;
  if (Number(version) < 160000 || Number(version) >= 170000) throw new Error("PostgreSQL 16 required");
  report.serverVersionNum = version;
  // Fresh instance only: no application tables, no reused owners or runtime accounts.
  if ((await admin.query("SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='public'")).rows[0].n !== 0) throw new Error("Database is not empty");
  await admin.query("REVOKE CREATE ON SCHEMA public FROM PUBLIC; REVOKE ALL ON DATABASE oraculo_ci1_synthetic FROM PUBLIC");
  await admin.query("CREATE ROLE oraculo_ci1_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS");
  for (const role of roles) {
    // Both identifiers and password are generated locally, never sourced from caller input.
    await admin.query(`CREATE ROLE ${role} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`);
    await admin.query(`GRANT CONNECT ON DATABASE oraculo_ci1_synthetic TO ${role}; GRANT USAGE ON SCHEMA public TO ${role}`);
  }
  await admin.query("GRANT USAGE,CREATE ON SCHEMA public TO oraculo_ci1_owner; SET ROLE oraculo_ci1_owner");
  await admin.query("CREATE TABLE public.oraculo_ci1_marker(run_id text PRIMARY KEY)");
  await admin.query("INSERT INTO public.oraculo_ci1_marker VALUES($1)", [runId]);
  for (const role of roles) await admin.query(`GRANT SELECT ON public.oraculo_ci1_marker TO ${role}`);
  // Minimal legacy fixture mirrors ApprovalRecord, not the entire operational database.
  await admin.query(`CREATE TYPE public."ApprovalDecision" AS ENUM ('APPROVED','REJECTED');
    CREATE TABLE public.approval_records(id text PRIMARY KEY,run_id text,tenant_id text NOT NULL,workspace_id text NOT NULL,
    decided_by_user_id text,created_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,decision public."ApprovalDecision" NOT NULL);
    INSERT INTO public.approval_records VALUES('legacy',NULL,'legacy','legacy','legacy',CURRENT_TIMESTAMP,'APPROVED')`);
  const migration = "packages/db/prisma/migrations/20260922170000_oraculo_s1_persistence/migration.sql";
  await admin.query(readFileSync(resolve(root, migration), "utf8"));
  const grants: Record<string, string[]> = {
    oraculo_ci1_executor: ["oraculo_admit", "oraculo_begin", "oraculo_context", "oraculo_finish", "oraculo_read"],
    oraculo_ci1_approver: ["oraculo_begin", "oraculo_context", "oraculo_approve"],
    oraculo_ci1_writer: ["oraculo_write_scope", "oraculo_write_authority", "oraculo_write_global", "oraculo_write_snapshot"],
    oraculo_ci1_reader: ["oraculo_read"],
  };
  const procedures = (await admin.query("SELECT proname,oid::regprocedure::text AS signature FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'oraculo_%'")).rows;
  for (const [role, names] of Object.entries(grants)) for (const name of names) {
    const proc = procedures.find(p => p.proname === name);
    if (!proc) throw new Error(`Missing procedure ${name}`);
    await admin.query(`GRANT EXECUTE ON FUNCTION ${proc.signature} TO ${role}`);
  }
  await admin.query("RESET ROLE");
  report.roles = (await admin.query("SELECT rolname,rolsuper,rolcreaterole,rolcreatedb,rolinherit,rolbypassrls FROM pg_roles WHERE rolname LIKE 'oraculo_ci1_%' ORDER BY rolname")).rows;
  report.grants = grants;
  const child = spawnSync(process.execPath, ["--import", "tsx", "--test", "apps/api/src/services/logistica/oraculo/ci1.integration.test.ts"], {
    cwd: root, encoding: "utf8", timeout: 120_000,
    env: { PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: "test", TSX_TSCONFIG_PATH: "tsconfig.base.json",
      CI1_TEST_CONFIG: JSON.stringify({ ...config, runId }) },
  });
  report.command = "node --import tsx --test apps/api/src/services/logistica/oraculo/ci1.integration.test.ts";
  report.exitCode = child.status; report.stdout = child.stdout; report.stderr = child.stderr;
  console.log(child.stdout); if (child.stderr) console.error(child.stderr);
  report.legacyPreserved = (await admin.query("SELECT record_format,context_hash,governed_payload FROM public.approval_records WHERE id='legacy'")).rows[0];
  report.noRoleMemberships = (await admin.query("SELECT count(*)::int AS n FROM pg_auth_members m JOIN pg_roles r ON m.member=r.oid WHERE r.rolname LIKE 'oraculo_ci1_%'")).rows[0].n === 0;
  const files = [migration,"apps/api/src/services/logistica/oraculo/transactionExecutor.ts","apps/api/src/services/logistica/oraculo/evaluation.ts","apps/api/src/services/logistica/oraculo/ci1.integration.test.ts","apps/api/scripts/validateOraculoS1Integrated.ts","packages/db/src/oraculo/connection.ts","packages/db/prisma/schema.prisma","apps/api/src/services/logistica/oraculo/canonicalization.ts","packages/contracts/src/oraculo.ts","packages/contracts/src/governance.ts","packages/db/prisma.oraculo-ci1.config.ts","tsconfig.oraculo-ci1.json","package.json"];
  report.fileHashes = Object.fromEntries(files.map(p => [p,createHash("sha256").update(readFileSync(resolve(root,p))).digest("hex")]));
  if (child.status !== 0) process.exitCode = 1;
} catch (error) {
  report.failure = error instanceof Error ? error.message : String(error);
  process.exitCode = 1; console.error(report.failure);
} finally {
  await admin?.end().catch(() => {});
  if (container) {
    const meta = JSON.parse(docker("inspect", container))[0];
    if (meta.Id !== container || meta.Config.Labels["eiah.oraculo.ci1"] !== runId || meta.Name !== `/${name}`) throw new Error("Refusing cleanup: identity mismatch");
    docker("rm", "--force", container); report.cleanedUp = true;
  }
  mkdirSync(evidence, { recursive: true });
  writeFileSync(resolve(evidence,"results.json"), JSON.stringify(report,null,2)+"\n");
  console.log(`Evidence: ${evidence}`);
}
