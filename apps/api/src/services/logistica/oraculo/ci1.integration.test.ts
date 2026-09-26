import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { Client } from "../../../../../../packages/db/src/oraculo/connection.js";
import { recoverCi1Negative, admitCi1, approveCi1, executeCi1, readCi1, inCi1Transaction, Ci1ReconciliationRequired, type Ci1Connection } from "./transactionExecutor.js";
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
test("CI1 no A1: final review requirement never retries into approval",()=>using(true,async x=>{
  await x.admit(); const result=await x.execute(); assert.equal(result.state,"FINAL"); assert.equal(result.result?.outcome,"REVIEW_REQUIRED");
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
  assert.equal(values.filter(v=>v.result?.outcome==="APPLIED").length,1);
  assert.equal(values.filter(v=>v.result?.outcome==="CONFLICT").length,1);
  assert.equal((await x.stored()).revision,2);
  const held=(await x.admin.query("SELECT assessment FROM public.oraculo_intents WHERE tenant_id=$1 AND result->>'outcome'='CONFLICT'",[x.who.tenantId])).rows;
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


async function legacyHold(x: Awaited<ReturnType<typeof scenario>>, finding = "RV11") {
  if(finding === "RV11") x.s.origins[0].status="REVOKED";
  await x.admit();
  const assessment = { mode: "SIMULATION", disposition: "DENIED", applied: false, findings: [finding] };
  const audit = { assessment, result: null, hd: null, actor: x.s.intent.actorRef, snapshot: x.s, approval: null };
  await x.admin.query("UPDATE public.oraculo_intents SET assessment=$4::jsonb WHERE tenant_id=$1 AND workspace_id=$2 AND intent_id=$3", [x.who.tenantId,x.who.workspaceId,x.s.intent.intentId,JSON.stringify(assessment)]);
  await x.admin.query("INSERT INTO public.oraculo_audits VALUES($1,$2,$3,$4::jsonb)", [x.who.tenantId,x.who.workspaceId,x.s.intent.intentId,JSON.stringify(audit)]);
  return structuredClone(audit);
}
test("CI1 negative C3 attributes only the failed credential and final result is immutable",()=>using(false,async x=>{
  x.s.origins[0].status="REVOKED";await x.save();await x.admit();const first=await x.execute();
  assert.equal(first.result?.outcome,"DENIED");assert.deepEqual(first.result.reasonCodes,["ORACULO_STATUS_REVOKED"]);
  assert.equal(first.result.evaluationRefs.length,1);assert.equal(first.result.nextRevision,undefined);
  const ev=(await x.admin.query("SELECT payload FROM public.oraculo_evaluations WHERE tenant_id=$1",[x.who.tenantId])).rows;
  assert.equal(ev.length,1);assert.equal(ev[0].payload.credentialRef.credentialId,x.s.origins[0].credentialId);assert.equal(ev[0].payload.result,"REJECTED");
  assert.equal((await x.stored()).revision,1);assert.equal((await x.stored()).audits,1);
  x.s.origins[0].status="ACTIVE";await x.save();assert.deepEqual(await x.execute(),first);
}));
test("CI1 negative SQL rejects transitions and divergent reasonCodes",()=>using(true,async x=>{
  await x.admit();
  for(const tamper of ["transition","reason"]){
    const db:Ci1Connection={async query(sql,values){
      if(sql.includes("oraculo_finish")){
        const v=[...values!];const c=JSON.parse(v[5]);if(tamper==="transition")c.nextRevision=99;else c.reasonCodes=["ORACULO_STATUS_REVOKED"];v[5]=JSON.stringify(c);return x.executor.query(sql,v);
      }return x.executor.query(sql,values);
    }};
    await assert.rejects(executeCi1(db,x.who,x.s.intent.intentId),/INVALID_NEGATIVE_FINALIZATION/);
    assert.equal((await x.stored()).result,null);assert.equal((await x.stored()).audits,0);
  }
}));
test("CI1 legacy recovery uses immutable history, never current snapshot, and preserves original audit",()=>using(false,async x=>{
  const original=await legacyHold(x);x.s.origins[0].status="ACTIVE";x.s.evaluatedAt="2026-09-17T12:00:00.000Z";await x.save();
  const first=await recoverCi1Negative(x.executor,x.who,x.s.intent.intentId);
  assert.equal(first.result?.outcome,"DENIED");assert.deepEqual(first.result.reasonCodes,["ORACULO_STATUS_REVOKED"]);
  assert.deepEqual(first.result.evaluationRefs,[]); // old aggregate assessment has no per-credential attribution
  assert.deepEqual(await recoverCi1Negative(x.executor,x.who,x.s.intent.intentId),first);
  assert.deepEqual((await x.admin.query("SELECT payload FROM public.oraculo_audits WHERE tenant_id=$1",[x.who.tenantId])).rows[0].payload,original);
  assert.equal((await x.admin.query("SELECT count(*)::int AS n FROM public.oraculo_negative_recoveries WHERE tenant_id=$1",[x.who.tenantId])).rows[0].n,1);
  assert.equal((await x.stored()).revision,1);
}));
test("CI1 legacy recovery refuses unknown causes, uncertain commit, and unproven no-effect",async()=>{
  for(const finding of ["future-code","RV26","RV27","RV28"]){await using(false,async x=>{
    await legacyHold(x,finding);await assert.rejects(recoverCi1Negative(x.executor,x.who,x.s.intent.intentId),/NEGATIVE_MAPPING_UNAVAILABLE/);
    assert.equal((await x.stored()).result,null);assert.equal((await x.stored()).revision,1);
  });}
});
test("CI1 recovery requires matching audit and fails closed for unavailable authority",()=>using(false,async x=>{
  await legacyHold(x);await x.authority(x.who.tokenRef,x.s.intent.actorRef.id,false);
  await assert.rejects(recoverCi1Negative(x.executor,x.who,x.s.intent.intentId),/AUTHORITY_DENIED/);
  await x.authority(x.who.tokenRef,x.s.intent.actorRef.id);await x.admin.query("UPDATE public.oraculo_audits SET payload=payload-'assessment' WHERE tenant_id=$1",[x.who.tenantId]);
  await assert.rejects(recoverCi1Negative(x.executor,x.who,x.s.intent.intentId),/RECOVERY_EVIDENCE_REQUIRED/);
  assert.equal((await x.stored()).result,null);
}));
test("CI1 simultaneous hold recovery records exactly one immutable result",()=>using(false,async x=>{
  await legacyHold(x);const other=await x.open("executor");
  const [a,b]=await Promise.all([recoverCi1Negative(x.executor,x.who,x.s.intent.intentId),recoverCi1Negative(other,x.who,x.s.intent.intentId)]);
  assert.deepEqual(a,b);assert.equal((await x.stored()).revision,1);
  assert.equal((await x.admin.query("SELECT count(*)::int AS n FROM public.oraculo_negative_recoveries WHERE tenant_id=$1",[x.who.tenantId])).rows[0].n,1);
}));
test("CI1 recovery audit failure rolls back C5 and preserves legacy assessment",()=>using(false,async x=>{
  const original=await legacyHold(x);
  await x.admin.query("CREATE FUNCTION public.ci1_fail_recovery() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'INJECTED_RECOVERY_FAILURE'; END $$; CREATE TRIGGER ci1_fail_recovery BEFORE INSERT ON public.oraculo_negative_recoveries FOR EACH ROW EXECUTE FUNCTION public.ci1_fail_recovery()");
  try{await assert.rejects(recoverCi1Negative(x.executor,x.who,x.s.intent.intentId),/INJECTED_RECOVERY_FAILURE/);assert.equal((await x.stored()).result,null);assert.deepEqual((await x.stored()).assessment,original.assessment);}
  finally{await x.admin.query("DROP TRIGGER ci1_fail_recovery ON public.oraculo_negative_recoveries; DROP FUNCTION public.ci1_fail_recovery()");}
}));
test("CI1 lost negative recovery COMMIT response reconciles by authorized read",()=>using(false,async x=>{
  await legacyHold(x);
  const lost:Ci1Connection={async query(sql,values){const result=await x.executor.query(sql,values);if(sql==="COMMIT")throw new Error("lost response");return result;}};
  await assert.rejects(recoverCi1Negative(lost,x.who,x.s.intent.intentId),Ci1ReconciliationRequired);
  const recovered=await readCi1(x.reader,x.who,x.s.intent.intentId);assert.equal(recovered.result?.outcome,"DENIED");
  assert.deepEqual(await recoverCi1Negative(x.executor,x.who,x.s.intent.intentId),recovered);
}));
test("CI1 recovery rejects another requester and grants no direct recovery DML",()=>using(false,async x=>{
  await legacyHold(x);await x.authority("other","other");
  await assert.rejects(recoverCi1Negative(x.executor,{...x.who,tokenRef:"other"},x.s.intent.intentId),/SCOPE_DENIED/);
  await assert.rejects(recoverCi1Negative(x.executor,{...x.who,tenantId:"other"},x.s.intent.intentId),/SCOPE_DENIED/);
  await assert.rejects(x.executor.query("DELETE FROM public.oraculo_negative_recoveries"),/permission denied/);
  await assert.rejects(x.reader.query("SELECT public.oraculo_hold($1,$2,$3,$4)",[x.who.tenantId,x.who.workspaceId,x.who.tokenRef,x.s.intent.intentId]),/permission denied/);
}));

test("CI1 persisted human rejection remains linked in negative audit",()=>using(true,async x=>{
 await x.admit();const decision=await x.approve("REJECTED");const result=await x.execute();assert.equal(result.result?.outcome,"DENIED");
 const audit=(await x.admin.query("SELECT payload FROM public.oraculo_audits WHERE tenant_id=$1",[x.who.tenantId])).rows[0].payload;
 assert.equal(audit.approval.decision.authorityDecisionId,decision.authorityDecisionId);assert.equal(audit.approval.decision.decision,"REJECTED");
}));
test("CI1 negative C3 insert fault rolls back assessment result and audit",()=>using(false,async x=>{
 x.s.origins[0].status="REVOKED";await x.save();await x.admit();
 await x.admin.query("CREATE FUNCTION public.ci1_fail_negative() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'NEGATIVE_C3_FAULT'; END $$; CREATE TRIGGER ci1_fail_negative BEFORE INSERT ON public.oraculo_evaluations FOR EACH ROW EXECUTE FUNCTION public.ci1_fail_negative()");
 try{await assert.rejects(x.execute(),/NEGATIVE_C3_FAULT/);const stored=await x.stored();assert.equal(stored.result,null);assert.equal(stored.assessment,null);assert.equal(stored.revision,1);assert.equal(stored.audits,0);}
 finally{await x.admin.query("DROP TRIGGER ci1_fail_negative ON public.oraculo_evaluations; DROP FUNCTION public.ci1_fail_negative()");}
}));
test("CI1 SQL and canonical mapper agree on every finalizable ratified finding",async()=>{
 const { S1_NEGATIVE_MAPPING_PROPOSALS }=await import("./negativeMappingProposal.js");
 for(const mapping of S1_NEGATIVE_MAPPING_PROPOSALS){
  if(mapping.target!=="C5"||mapping.requiresNoEffectProof)continue;
  await using(false,async x=>{
   await legacyHold(x,mapping.finding);const result=await recoverCi1Negative(x.executor,x.who,x.s.intent.intentId);
   assert.equal(result.result?.outcome,mapping.outcome);assert.deepEqual(result.result.reasonCodes,[mapping.candidateCode]);assert.equal((await x.stored()).revision,1);
  });
 }
});
