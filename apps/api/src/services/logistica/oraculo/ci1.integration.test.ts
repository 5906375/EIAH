import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { Client } from "../../../../../../packages/db/src/oraculo/connection.js";
import { admitCi1, approveCi1, executeCi1, readCi1, inCi1Transaction, Ci1ReconciliationRequired, type Ci1Connection } from "./transactionExecutor.js";
import { evaluateS1, type S1Snapshot } from "./evaluation.js";

const config = JSON.parse(process.env.CI1_TEST_CONFIG ?? "null");
assert(config && config.host === "127.0.0.1" && config.database === "oraculo_ci1_synthetic" && /^[a-f0-9-]{36}$/.test(config.runId), "Use the dedicated CI1 harness");
const { runId, ...connection } = config;
async function client(role: string) {
  const db = new Client({ ...connection, user: role === "postgres" ? role : `oraculo_ci1_${role}` });
  await db.connect();
  const rows = (await db.query("SELECT run_id FROM public.oraculo_ci1_marker")).rows;
  assert.deepEqual(rows, [{ run_id: runId }]);
  return db;
}
async function scenario(hitl = false) {
  const dbs: Client[] = [];
  const open = async (role: string) => { const db = await client(role); dbs.push(db); return db; };
  const executor = await open("executor"), writer = await open("writer"), approver = await open("approver"), reader = await open("reader"), admin = await open("postgres");
  const s: S1Snapshot = JSON.parse(readFileSync(new URL("../../../../fixtures/oraculo/s1/pure-v2/cases.json", import.meta.url),"utf8"));
  const tenantId = `sim-${randomUUID()}`;
  for (const scoped of [s,s.intent,s.visit,...s.credentials,...s.observations,...s.origins]) scoped.tenantId = tenantId;
  // Tenant is part of H1; recompute after isolating each case.
  const { hashContent } = await import("./canonicalization.js");
  for (let i=0;i<s.credentials.length;i++) {
    s.credentials[i].contentHash = hashContent(s.credentials[i]);
    s.intent.credentialRefs[i].contentHash = s.credentials[i].contentHash;
    s.observations[i].credentialRef.contentHash = s.credentials[i].contentHash;
  }
  if (hitl) { s.policy="sim-return-hitl.v1"; for(const o of s.observations) o.freshnessPolicyRef.policyId=s.policy; }
  const who = { tenantId, workspaceId: s.workspaceId, tokenRef: "requester-token" };
  const review = { ...who, tokenRef: "reviewer-token" };
  const save = () => writer.query("SELECT public.oraculo_write_snapshot($1,$2,$3::jsonb)",[tenantId,s.workspaceId,JSON.stringify(s)]);
  const authority = (token: string, actor: string, active=true, expires=new Date(Date.now()+60_000), caps=["execute","read"]) =>
    writer.query("SELECT public.oraculo_write_authority($1,$2,$3,$4::jsonb,$5,$6,$7::text[])",[tenantId,s.workspaceId,token,JSON.stringify({id:actor,revision:1}),active,expires,caps]);
  await writer.query("SELECT public.oraculo_write_scope($1,$2,true,true,$3)",[tenantId,s.workspaceId,s.policy]);
  await authority(who.tokenRef,s.intent.actorRef.id);
  await authority(review.tokenRef,"synthetic-reviewer",true,undefined,["approve"]);
  await save();
  return { s,who,review,executor,writer,approver,reader,admin,open,save,authority,
    async close() { await Promise.all(dbs.map(d=>d.end())); },
    admit() { return admitCi1(executor,who,s.intent); },
    execute() { return executeCi1(executor,who,s.intent.intentId); },
    approve(decision:"APPROVED"|"REJECTED"="APPROVED",validUntil="2026-09-16T12:05:00.000Z") { return approveCi1(approver,review,s.intent.intentId,decision,validUntil); },
    async stored() { return (await admin.query("SELECT i.result,i.assessment,v.revision,v.state,(SELECT count(*)::int FROM public.oraculo_audits a WHERE a.tenant_id=i.tenant_id) AS audits FROM public.oraculo_intents i JOIN public.oraculo_visits v USING(tenant_id,workspace_id) WHERE i.tenant_id=$1 AND i.intent_id=$2",[tenantId,s.intent.intentId])).rows[0]; },
  };
}
async function using(hitl: boolean, fn: (s: Awaited<ReturnType<typeof scenario>>)=>Promise<void>) {
  const s=await scenario(hitl); try { await fn(s); } finally { await s.close(); }
}

test("CI1 basic: durable C5, atomic revision/audit and immutable replay",()=>using(false,async x=>{
  await x.admit(); const a=await x.execute(); assert.equal(a.state,"FINAL"); assert.equal(a.result?.outcome,"APPLIED");
  await x.admit(); const b=await x.execute(); assert.deepEqual(b,a);
  const stored=await x.stored(); assert.equal(stored.revision,2); assert.equal(stored.audits,1);
  assert.deepEqual(await readCi1(x.reader,x.who,x.s.intent.intentId),a);
}));
test("CI1 HITL: persisted current review unlocks only integrated simulation",()=>using(true,async x=>{
  assert.equal(evaluateS1(x.s).disposition,"REVIEW_REQUIRED");
  await x.admit(); const a=await x.approve(); assert.equal(a.decidedByUserId,"synthetic-reviewer");
  assert.equal((await x.execute()).result?.outcome,"APPLIED");
}));
test("CI1 no A1: durable hold without inventing a final reasonCode",()=>using(true,async x=>{
  await x.admit(); const result=await x.execute(); assert.equal(result.state,"PROCESSING"); assert.equal(result.result,undefined);
  assert.deepEqual((await x.stored()).assessment.findings,["RV17"]);
  await x.approve(); assert.deepEqual(await x.execute(),result); // not a hidden retry of a held decision
  x.s.intent.intentId="next-intent"; x.s.intent.previousIntentRef="sim-intent";
  await x.admit(); assert.equal((await x.execute()).result?.outcome,"APPLIED");
}));
test("CI1 rejection persists and does not become a later approval",()=>using(true,async x=>{
  await x.admit(); await x.approve("REJECTED"); await x.execute();
  assert.deepEqual((await x.stored()).assessment.findings,["RV20"]);
  await assert.rejects(x.approve(),/duplicate key/); assert.equal((await x.stored()).revision,1);
}));
test("CI1 later observations require new review before expiry is considered",()=>using(true,async x=>{
  await x.admit(); await x.approve("APPROVED","2026-09-16T12:00:01.000Z");
  x.s.evaluatedAt="2026-09-16T12:00:02.000Z";
  for(const o of x.s.origins)o.observedAt=x.s.evaluatedAt;
  for(const o of x.s.observations){o.observationId+="-later";o.observedAt=x.s.evaluatedAt;}
  await x.save(); await x.execute(); assert.equal((await x.stored()).revision,1);
  // Changed observations require new review before an old expiry can even be considered.
  assert.deepEqual((await x.stored()).assessment.findings,["RV17"]);
}));
test("CI1 material replacement cannot reuse a persisted A1",()=>using(true,async x=>{
  await x.admit(); await x.approve(); x.s.observations[0].observationId+="-new";
  await x.save(); await x.execute(); assert.deepEqual((await x.stored()).assessment.findings,["RV17"]);
  assert.equal((await x.stored()).revision,1);
}));
test("CI1 revoked reviewer blocks execution",()=>using(true,async x=>{
  await x.admit(); await x.approve(); await x.authority(x.review.tokenRef,"synthetic-reviewer",false,undefined,["approve"]);
  await assert.rejects(x.execute(),/AUTHORITY_DENIED/); assert.equal((await x.stored()).revision,1);
}));
test("CI1 session expiry uses real time despite historical valid fixture",()=>using(false,async x=>{
  await x.admit(); await x.authority(x.who.tokenRef,x.s.intent.actorRef.id,true,new Date(0));
  await assert.rejects(x.execute(),/AUTHORITY_DENIED/); assert.equal((await x.stored()).revision,1);
}));
test("CI1 spoofed actor and cross-tenant scope are rejected",()=>using(false,async x=>{
  const bad=structuredClone(x.s.intent); bad.actorRef.id="forged";
  await assert.rejects(admitCi1(x.executor,x.who,bad),/SCOPE_DENIED/);
  await assert.rejects(admitCi1(x.executor,{...x.who,tenantId:"unknown"},x.s.intent),/SCOPE_DENIED/);
  await x.admit(); await x.execute();
  await x.authority("other","other");
  await assert.rejects(readCi1(x.reader,{...x.who,tokenRef:"other"},x.s.intent.intentId),/SCOPE_DENIED/);
}));
test("CI1 HI conflict cannot overwrite original result",()=>using(false,async x=>{
  await x.admit(); const original=await x.execute(); x.s.intent.direction="OUT";
  await assert.rejects(x.admit(),/INTENT_PAYLOAD_CONFLICT/);
  assert.deepEqual(await readCi1(x.reader,x.who,x.s.intent.intentId),original);
}));
test("CI1 negative evaluation is durable and cannot be retried into success",()=>using(false,async x=>{
  x.s.origins[0].status="REVOKED";await x.save();await x.admit();const first=await x.execute();
  assert.deepEqual((await x.stored()).assessment.findings,["RV11"]);
  x.s.origins[0].status="ACTIVE";await x.save();assert.deepEqual(await x.execute(),first);
  assert.equal((await x.stored()).revision,1);
}));
test("CI1 database observation identity is immutable and scoped",()=>using(false,async x=>{
  x.s.observations[0].declaredStatus="REVOKED";await assert.rejects(x.save(),/IMMUTABLE_OBSERVATION/);
  x.s.observations[0].declaredStatus="ACTIVE";
  x.s.observations[1].observationId=x.s.observations[0].observationId;await assert.rejects(x.save(),/DUPLICATE_OBSERVATION/);
}));
test("CI1 least privilege: no direct DML, DDL, helper, approval or owner escalation",()=>using(false,async x=>{
  for(const sql of ["UPDATE public.oraculo_visits SET revision=99","DELETE FROM public.approval_records","CREATE TABLE public.bypass(id int)","SET ROLE oraculo_ci1_owner","SELECT public.oraculo_write_global(false)","SELECT public.oraculo_lock('x')","SELECT public.oraculo_approve('x','x','x','x','{}'::jsonb)"])
    await assert.rejects(x.executor.query(sql),/permission denied/);
  await assert.rejects(x.approver.query("SELECT public.oraculo_finish('x','x','x','x','{}'::jsonb,NULL)"),/permission denied/);
}));
test("CI1 finishing requires same transaction and connection; pool reuse is inert",()=>using(false,async x=>{
  await x.admit();const values=[x.who.tenantId,x.who.workspaceId,x.who.tokenRef,x.s.intent.intentId];
  const finish=(db:Client)=>db.query("SELECT public.oraculo_finish($1,$2,$3,$4,'{}'::jsonb,NULL)",values);
  await assert.rejects(finish(x.executor),/EXECUTION_CONTEXT_REQUIRED/);
  await x.executor.query("BEGIN");await x.executor.query("SELECT public.oraculo_begin($1,$2,$3,$4)",values);
  const other=await x.open("executor");await assert.rejects(finish(other),/EXECUTION_CONTEXT_REQUIRED/);
  await x.executor.query("COMMIT");await assert.rejects(finish(x.executor),/EXECUTION_CONTEXT_REQUIRED/);
  assert.equal((await x.stored()).revision,1);
}));
test("CI1 two intentions at one revision yield one effect",()=>using(false,async x=>{
  await x.admit();const other=await x.open("executor");const i={...x.s.intent,intentId:"competitor"};await admitCi1(other,x.who,i);
  const values=await Promise.all([x.execute(),executeCi1(other,x.who,i.intentId)]);
  assert.equal(values.filter(v=>v.state==="FINAL").length,1);
  assert.equal((await x.stored()).revision,2);
  const held=(await x.admin.query("SELECT assessment FROM public.oraculo_intents WHERE tenant_id=$1 AND result IS NULL",[x.who.tenantId])).rows;
  assert.deepEqual(held[0].assessment.findings,["RV22"]);
}));
test("CI1 failure after visit update rolls back visit, C5, audit and assessment",()=>using(false,async x=>{
  await x.admit();
  await x.admin.query(`CREATE FUNCTION public.ci1_fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'INJECTED_AUDIT_FAILURE'; END $$;
    CREATE TRIGGER ci1_fail_audit BEFORE INSERT ON public.oraculo_audits FOR EACH ROW EXECUTE FUNCTION public.ci1_fail_audit()`);
  try {
    await assert.rejects(x.execute(),/INJECTED_AUDIT_FAILURE/);const stored=await x.stored();
    assert.equal(stored.revision,1);assert.equal(stored.result,null);assert.equal(stored.assessment,null);assert.equal(stored.audits,0);
  } finally { await x.admin.query("DROP TRIGGER ci1_fail_audit ON public.oraculo_audits; DROP FUNCTION public.ci1_fail_audit()"); }
  assert.equal((await x.execute()).state,"FINAL");
}));
test("CI1 lost COMMIT response reconciles on a separate connection without reapplying",()=>using(false,async x=>{
  await x.admit();
  const lost:Ci1Connection={async query(sql,values){const result=await x.executor.query(sql,values);if(sql==="COMMIT")throw new Error("lost response");return result;}};
  await assert.rejects(executeCi1(lost,x.who,x.s.intent.intentId),Ci1ReconciliationRequired);
  const recovered=await readCi1(x.reader,x.who,x.s.intent.intentId);assert.equal(recovered.state,"FINAL");
  assert.deepEqual(await x.execute(),recovered);assert.equal((await x.stored()).revision,2);assert.equal((await x.stored()).audits,1);
}));
async function blocked(admin:Client,pid:number) {
  for(let i=0;i<100;i++) { if((await admin.query("SELECT cardinality(pg_blocking_pids($1)) AS n",[pid])).rows[0].n>0)return;await new Promise(r=>setTimeout(r,20)); }
  assert.fail("Expected real lock contention");
}
test("CI1 revocation writer waits for the protected executor transaction",()=>using(false,async x=>{
  await x.admit();await x.executor.query("BEGIN");
  await x.executor.query("SELECT public.oraculo_begin($1,$2,$3,$4)",[x.who.tenantId,x.who.workspaceId,x.who.tokenRef,x.s.intent.intentId]);
  const pid=(await x.writer.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
  const revoking=x.authority(x.who.tokenRef,x.s.intent.actorRef.id,false);
  await blocked(x.admin,pid);await x.executor.query("COMMIT");await revoking;
  await assert.rejects(x.execute(),/AUTHORITY_DENIED/);assert.equal((await x.stored()).revision,1);
}));
test("CI1 global change precedes blocked executor and is reread after lock",()=>using(false,async x=>{
  await x.admit();await x.writer.query("BEGIN");await x.writer.query("SELECT public.oraculo_write_global(false)");
  const pid=(await x.executor.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
  const executing=assert.rejects(x.execute(),/AUTHORITY_DENIED/);
  await blocked(x.admin,pid);await x.writer.query("COMMIT");await executing;
  await x.writer.query("SELECT public.oraculo_write_global(true)");assert.equal((await x.stored()).revision,1);
}));
test("CI1 legacy A1 is never selected and its data remains intact",()=>using(true,async x=>{
  await x.admit();await x.execute();assert.deepEqual((await x.stored()).assessment.findings,["RV17"]);
  const legacy=(await x.admin.query("SELECT record_format,context_hash,governed_payload FROM public.approval_records WHERE id='legacy'")).rows[0];
  assert.deepEqual(legacy,{record_format:"LEGACY",context_hash:null,governed_payload:null});
}));

test("CI1 invalid A1 validity window cannot authorize",()=>using(true,async x=>{
  await x.admit();await x.approve("APPROVED","2026-09-16T12:06:00.000Z");await x.execute();
  assert.deepEqual((await x.stored()).assessment.findings,["RV19"]);assert.equal((await x.stored()).revision,1);
}));
test("CI1 E1 declared-set order is stable in persisted context",()=>using(true,async x=>{
  await x.admit();await x.approve();x.s.observations.reverse();await x.save();
  assert.equal((await x.execute()).state,"FINAL");
}));
test("CI1 committed assessment preserves exact resolved materials after snapshot replacement",()=>using(false,async x=>{
  await x.admit();await x.execute();
  const audit=(await x.admin.query("SELECT payload FROM public.oraculo_audits WHERE tenant_id=$1",[x.who.tenantId])).rows[0].payload;
  assert.equal(audit.snapshot.visit.revision,1);assert.equal(audit.snapshot.visit.state,"NOT_ENTERED");
  x.s.visit.revision=2;x.s.visit.state="INSIDE";x.s.visit.enteredAt=x.s.evaluatedAt;x.s.origins[0].status="REVOKED";
  await x.save();const after=(await x.admin.query("SELECT payload FROM public.oraculo_audits WHERE tenant_id=$1",[x.who.tenantId])).rows[0].payload;
  assert.deepEqual(after,audit);
}));
test("CI1 OUT commits only matching proof after persisted IN",()=>using(false,async x=>{
  await x.admit();await x.execute();
  x.s.visit.state="INSIDE";x.s.visit.revision=2;x.s.visit.enteredAt=x.s.evaluatedAt;
  x.s.evaluatedAt="2026-09-16T12:15:00.000Z";x.s.intent.receivedAt=x.s.evaluatedAt;
  x.s.intent.intentId="out";x.s.intent.direction="OUT";x.s.intent.expectedRevision=2;
  for(const o of x.s.origins)o.observedAt=x.s.evaluatedAt;
  for(const o of x.s.observations){o.observationId+="-out";o.observedAt=x.s.evaluatedAt;}
  const {hashArtifact}=await import("./canonicalization.js");const content="synthetic return proof";const contentHash=hashArtifact(Buffer.from(content));
  x.s.returnProof={tenantId:x.who.tenantId,workspaceId:x.who.workspaceId,operationId:x.s.visit.operationId,visitId:x.s.visit.visitId,
    containerRef:x.s.visit.containerRef,locationRef:x.s.visit.locationRef,occurredAt:"2026-09-16T12:10:00.000Z",recordedAt:x.s.evaluatedAt,
    attesterRef:{kind:"SOURCE",id:"sim-return-source",revision:1},artifactId:"proof-out",contentHash,content};
  x.s.intent.evidenceRefs=[{schemaVersion:"artifact-ref.v1",artifactType:"evidence",artifactId:"proof-out",contentHash}];
  await x.save();await x.admit();const result=await x.execute();assert.equal(result.result?.nextState,"EXITED");assert.equal(result.result?.nextRevision,3);
}));
for(const table of ["oraculo_intents","oraculo_executions"])test(`CI1 failure in ${table} after audit insertion rolls back every write`,()=>using(false,async x=>{
  await x.admit();
  const predicate=table==="oraculo_intents"?"NEW.result IS NOT NULL":"NEW.consumed";
  await x.admin.query(`CREATE FUNCTION public.ci1_fail_late() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF ${predicate} THEN RAISE EXCEPTION 'INJECTED_LATE_FAILURE'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER ci1_fail_late BEFORE UPDATE ON public.${table} FOR EACH ROW EXECUTE FUNCTION public.ci1_fail_late()`);
  try {await assert.rejects(x.execute(),/INJECTED_LATE_FAILURE/);const row=await x.stored();assert.equal(row.result,null);assert.equal(row.assessment,null);assert.equal(row.audits,0);assert.equal(row.revision,1);}
  finally {await x.admin.query(`DROP TRIGGER ci1_fail_late ON public.${table}; DROP FUNCTION public.ci1_fail_late()`);}
}));
test("CI1 null capabilities cannot become authority through SQL null semantics",()=>using(false,async x=>{
  await assert.rejects(x.writer.query("SELECT public.oraculo_write_authority($1,$2,$3,$4::jsonb,true,clock_timestamp()+interval '1 minute',ARRAY[NULL]::text[])",
    [x.who.tenantId,x.who.workspaceId,"bad",JSON.stringify(x.s.intent.actorRef)]),/check constraint/);
}));
test("CI1 reviewer identity revision change invalidates persisted authority",()=>using(true,async x=>{
  await x.admit();await x.approve();
  await x.writer.query("SELECT public.oraculo_write_authority($1,$2,$3,$4::jsonb,true,clock_timestamp()+interval '1 minute',ARRAY['approve'])",
    [x.who.tenantId,x.who.workspaceId,x.review.tokenRef,JSON.stringify({id:"synthetic-reviewer",revision:2})]);
  await assert.rejects(x.execute(),/REVIEWER_CHANGED/);assert.equal((await x.stored()).revision,1);
}));
test("CI1 disabled installation fails closed before execution",()=>using(false,async x=>{
  await x.admit();await x.writer.query("SELECT public.oraculo_write_scope($1,$2,true,false,$3)",[x.who.tenantId,x.who.workspaceId,x.s.policy]);
  await assert.rejects(x.execute(),/AUTHORITY_DENIED/);assert.equal((await x.stored()).revision,1);
}));

test("CI1 every C5 evaluationRef resolves to a complete immutable C3",()=>using(true,async x=>{
  await x.admit();await x.approve();const result=await x.execute();
  const {oraculoCredentialEvaluationV1Schema}=await import("@eiah/contracts");
  const evaluations=(await x.admin.query("SELECT payload FROM public.oraculo_evaluations WHERE tenant_id=$1",[x.who.tenantId])).rows.map(r=>oraculoCredentialEvaluationV1Schema.parse(r.payload));
  assert.equal(evaluations.length,3);
  assert.deepEqual(evaluations.map(e=>e.evaluationId).sort(),result.result!.evaluationRefs.slice().sort());
  assert(evaluations.every(e=>e.authorityRefs?.length===1 && e.result==="ACCEPTED_FOR_SIMULATION"));
  await assert.rejects(x.executor.query("DELETE FROM public.oraculo_evaluations"),/permission denied/);
}));
test("CI1 C3 insert failure rolls back the simulated visit effect",()=>using(false,async x=>{
  await x.admit();
  await x.admin.query(`CREATE FUNCTION public.ci1_fail_c3() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'INJECTED_C3_FAILURE'; END $$;
    CREATE TRIGGER ci1_fail_c3 BEFORE INSERT ON public.oraculo_evaluations FOR EACH ROW EXECUTE FUNCTION public.ci1_fail_c3()`);
  try {await assert.rejects(x.execute(),/INJECTED_C3_FAILURE/);const row=await x.stored();assert.equal(row.revision,1);assert.equal(row.result,null);assert.equal(row.audits,0);
    assert.equal((await x.admin.query("SELECT count(*)::int AS n FROM public.oraculo_evaluations WHERE tenant_id=$1",[x.who.tenantId])).rows[0].n,0);}
  finally {await x.admin.query("DROP TRIGGER ci1_fail_c3 ON public.oraculo_evaluations; DROP FUNCTION public.ci1_fail_c3()");}
}));

test("CI1 E1 access requires this requester and an active execution context",()=>using(true,async x=>{
  await x.admit();const {buildS1ApprovalContext}=await import("./evaluation.js");
  const {hashApprovalContext}=await import("./canonicalization.js");const e=buildS1ApprovalContext(x.s);
  const args=[x.who.tenantId,x.who.workspaceId,x.who.tokenRef,x.s.intent.intentId,hashApprovalContext(e),JSON.stringify(e)];
  await assert.rejects(x.executor.query("SELECT public.oraculo_context($1,$2,$3,$4,$5,$6::jsonb)",args),/EXECUTION_CONTEXT_REQUIRED/);
  await x.authority("other","other");args[2]="other";
  await assert.rejects(x.executor.query("SELECT public.oraculo_context($1,$2,$3,$4,$5,$6::jsonb)",args),/EXECUTION_CONTEXT_REQUIRED/);
  await x.approve();assert.equal((await x.execute()).state,"FINAL");
}));
