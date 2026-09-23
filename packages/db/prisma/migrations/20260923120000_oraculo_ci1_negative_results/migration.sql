BEGIN;
CREATE FUNCTION public.oraculo_validate_negative(t text,w text,i text,a jsonb,c jsonb,es jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public AS $$
DECLARE code text; outcome text; ev jsonb;
BEGIN
 SELECT m.code,m.outcome INTO code,outcome FROM (VALUES
('RV05','ORACULO_CONTENT_INTEGRITY_MISMATCH','DENIED'),
('RV06','ORACULO_ARTIFACT_INTEGRITY_MISMATCH','DENIED'),
('RV07','ORACULO_INSPECTION_REJECTED','DENIED'),
('RV08','ORACULO_VALIDITY_EXPIRED','DENIED'),
('RV09','ORACULO_VALIDITY_NOT_STARTED','DENIED'),
('RV10','ORACULO_TEMPORAL_POLICY_UNRESOLVED','REVIEW_REQUIRED'),
('RV11','ORACULO_STATUS_REVOKED','DENIED'),
('RV12','ORACULO_STATUS_SUSPENDED','DENIED'),
('RV13','ORACULO_STATUS_UNKNOWN','REVIEW_REQUIRED'),
('RV14','ORACULO_STATUS_STALE','REVIEW_REQUIRED'),
('RV15','ORACULO_STATUS_CONFLICT','REVIEW_REQUIRED'),
('RV16','ORACULO_SOURCE_AUTHORITY_UNRESOLVED','REVIEW_REQUIRED'),
('RV17','ORACULO_HITL_REQUIRED','REVIEW_REQUIRED'),
('RV18','ORACULO_APPROVAL_CONTEXT_MISMATCH','REVIEW_REQUIRED'),
('RV19','ORACULO_APPROVAL_EXPIRED','REVIEW_REQUIRED'),
('RV20','ORACULO_APPROVAL_REJECTED','DENIED'),
('RV22','ORACULO_VISIT_REVISION_CONFLICT','CONFLICT'),
('RV23','ORACULO_VISIT_TRANSITION_DENIED','DENIED'),
('RV24','ORACULO_EVIDENCE_REQUIRED','DENIED'),
('RV25','ORACULO_SNAPSHOT_MISMATCH','REVIEW_REQUIRED'),
('FT03_NOT_VERIFIED_MAPPING_PENDING','ORACULO_VERIFICATION_NOT_SATISFIED','DENIED'),
('FT03_TEMPORAL_MAPPING_PENDING','ORACULO_TEMPORAL_INCOHERENCE','REVIEW_REQUIRED')
 ) AS m(finding,code,outcome) WHERE m.finding=a#>>'{findings,0}';
 IF code IS NULL OR a->>'mode' IS DISTINCT FROM 'SIMULATION' OR a->'applied' IS DISTINCT FROM 'false'::jsonb
 OR a->>'disposition' IS NULL OR a->>'disposition'='ELIGIBLE_FOR_SIMULATION' OR jsonb_array_length(a->'findings') IS DISTINCT FROM 1
 OR c->>'schemaVersion' IS DISTINCT FROM 'oraculo.gate-result.v1' OR c->>'mode' IS DISTINCT FROM 'SIMULATION'
 OR c->>'tenantId' IS DISTINCT FROM t OR c->>'workspaceId' IS DISTINCT FROM w OR c->>'intentId' IS DISTINCT FROM i
 OR c->>'outcome' IS DISTINCT FROM outcome OR c->'reasonCodes' IS DISTINCT FROM jsonb_build_array(code)
 OR c ?| ARRAY['previousState','nextState','previousRevision','nextRevision']
 OR jsonb_typeof(es) IS DISTINCT FROM 'array' OR jsonb_typeof(c->'evaluationRefs') IS DISTINCT FROM 'array'
 OR jsonb_array_length(es) IS DISTINCT FROM (CASE WHEN a ? 'credentialRef' THEN 1 ELSE 0 END)
 OR jsonb_array_length(c->'evaluationRefs') IS DISTINCT FROM jsonb_array_length(es)
 OR (SELECT jsonb_agg(value ORDER BY value) FROM jsonb_array_elements(c->'evaluationRefs')) IS DISTINCT FROM
    (SELECT jsonb_agg(value->'evaluationId' ORDER BY value->'evaluationId') FROM jsonb_array_elements(es))
 THEN RAISE EXCEPTION 'INVALID_NEGATIVE_FINALIZATION'; END IF;
 FOR ev IN SELECT value FROM jsonb_array_elements(es) LOOP
  IF ev->>'schemaVersion' IS DISTINCT FROM 'oraculo.credential-evaluation.v1' OR ev->>'mode' IS DISTINCT FROM 'SIMULATION'
   OR ev->>'tenantId' IS DISTINCT FROM t OR ev->>'workspaceId' IS DISTINCT FROM w
   OR ev->'credentialRef' IS DISTINCT FROM a->'credentialRef' OR ev->'reasonCodes' IS DISTINCT FROM c->'reasonCodes'
   OR ev->>'result' IS DISTINCT FROM (CASE WHEN outcome='DENIED' THEN 'REJECTED' ELSE 'INDETERMINATE' END)
  THEN RAISE EXCEPTION 'NEGATIVE_EVALUATION_MISMATCH'; END IF;
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION public.oraculo_finish(t text,w text,tok text,i text,assessment_value jsonb,c5 jsonb,evaluations jsonb DEFAULT '[]'::jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public AS $$
DECLARE x public.oraculo_executions; n public.oraculo_intents; v public.oraculo_visits; pol text; a jsonb; ev jsonb;
BEGIN
 SELECT * INTO x FROM public.oraculo_executions WHERE backend_pid=pg_backend_pid() AND transaction_id=txid_current() AND tenant_id=t AND workspace_id=w AND intent_id=i;
 IF NOT FOUND OR x.consumed OR x.token_ref<>tok THEN RAISE EXCEPTION 'EXECUTION_CONTEXT_REQUIRED'; END IF;
 PERFORM public.oraculo_auth(t,w,tok,'execute');
 SELECT * INTO n FROM public.oraculo_intents WHERE tenant_id=t AND workspace_id=w AND intent_id=i;
 IF n.result IS NOT NULL OR n.assessment IS NOT NULL THEN RAISE EXCEPTION 'IMMUTABLE_RESULT'; END IF;
 SELECT * INTO v FROM public.oraculo_visits WHERE tenant_id=t AND workspace_id=w AND visit_id=n.payload->>'visitId';
 IF x.hd IS NOT NULL THEN
  SELECT governed_payload INTO a FROM public.approval_records WHERE tenant_id=t AND workspace_id=w AND context_hash=x.hd AND record_format='GOVERNED_V1';
 END IF;
 IF c5 IS NOT NULL AND c5->>'outcome' IS DISTINCT FROM 'APPLIED' THEN
  PERFORM public.oraculo_validate_negative(t,w,i,assessment_value,c5,evaluations);
 ELSIF c5 IS NOT NULL THEN
  IF c5->>'outcome' IS DISTINCT FROM 'APPLIED' OR c5->>'mode' IS DISTINCT FROM 'SIMULATION'
   OR c5->>'tenantId' IS DISTINCT FROM t OR c5->>'workspaceId' IS DISTINCT FROM w OR c5->>'intentId' IS DISTINCT FROM i
   OR (n.payload->>'expectedRevision')::integer IS DISTINCT FROM v.revision
   OR (c5->>'previousRevision')::integer IS DISTINCT FROM v.revision OR (c5->>'nextRevision')::integer IS DISTINCT FROM v.revision+1
   OR c5->>'previousState' IS DISTINCT FROM v.state
   OR NOT ((n.payload->>'direction'='IN' AND v.state='NOT_ENTERED' AND c5->>'nextState'='INSIDE') OR
           (n.payload->>'direction'='OUT' AND v.state='INSIDE' AND c5->>'nextState'='EXITED'))
   OR jsonb_array_length(c5->'evaluationRefs')<>3 OR jsonb_array_length(evaluations)<>3
   OR (SELECT jsonb_agg(value ORDER BY value) FROM jsonb_array_elements(c5->'evaluationRefs')) IS DISTINCT FROM
      (SELECT jsonb_agg(value->'evaluationId' ORDER BY value->'evaluationId') FROM jsonb_array_elements(evaluations))
   THEN RAISE EXCEPTION 'INVALID_FINALIZATION'; END IF;
  SELECT policy INTO pol FROM public.oraculo_scopes WHERE tenant_id=t AND workspace_id=w;
  IF pol='sim-return-hitl.v1' THEN
   SELECT governed_payload INTO a FROM public.approval_records WHERE tenant_id=t AND workspace_id=w AND context_hash=x.hd AND record_format='GOVERNED_V1';
   IF a IS NULL OR a#>>'{decision,decision}' IS DISTINCT FROM 'APPROVED' THEN RAISE EXCEPTION 'HITL_REQUIRED'; END IF;
   PERFORM public.oraculo_auth(t,w,a->>'reviewerTokenRef','approve');
  END IF;
  UPDATE public.oraculo_visits SET revision=revision+1,state=c5->>'nextState',
   snapshot=CASE WHEN n.payload->>'direction'='IN' THEN jsonb_set(snapshot,'{visit,enteredAt}',snapshot->'evaluatedAt') ELSE snapshot END
   WHERE tenant_id=t AND workspace_id=w AND visit_id=v.visit_id;
 END IF;
 IF c5 IS NULL AND jsonb_array_length(evaluations)<>0 THEN RAISE EXCEPTION 'UNMAPPED_EVALUATIONS'; END IF;
 FOR ev IN SELECT value FROM jsonb_array_elements(evaluations) LOOP
  IF ev->>'schemaVersion' IS DISTINCT FROM 'oraculo.credential-evaluation.v1' OR ev->>'tenantId' IS DISTINCT FROM t
   OR ev->>'workspaceId' IS DISTINCT FROM w OR ev->>'mode' IS DISTINCT FROM 'SIMULATION'
   OR (c5->>'outcome'='APPLIED' AND ev->>'result' IS DISTINCT FROM 'ACCEPTED_FOR_SIMULATION') THEN RAISE EXCEPTION 'EVALUATION_MISMATCH'; END IF;
  INSERT INTO public.oraculo_evaluations VALUES(t,w,ev->>'evaluationId',i,ev);
 END LOOP;
 INSERT INTO public.oraculo_audits VALUES(t,w,i,jsonb_build_object('assessment',assessment_value,'result',c5,'hd',x.hd,'actor',n.actor_ref,'snapshot',x.resolved_snapshot,'approval',a));
 UPDATE public.oraculo_intents SET result=c5,assessment=assessment_value,updated_at=clock_timestamp() WHERE tenant_id=t AND workspace_id=w AND intent_id=i;
 UPDATE public.oraculo_executions SET consumed=true WHERE backend_pid=x.backend_pid AND transaction_id=x.transaction_id AND tenant_id=t AND workspace_id=w AND intent_id=i;
END $$;

CREATE TABLE public.oraculo_negative_recoveries (
 tenant_id text NOT NULL, workspace_id text NOT NULL, intent_id text NOT NULL, payload jsonb NOT NULL,
 PRIMARY KEY(tenant_id,workspace_id,intent_id),
 FOREIGN KEY(tenant_id,workspace_id,intent_id) REFERENCES public.oraculo_intents);

CREATE FUNCTION public.oraculo_hold(t text,w text,tok text,i text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public AS $$
DECLARE actor jsonb; n public.oraculo_intents; audit jsonb;
BEGIN
 PERFORM public.oraculo_lock(t); actor:=public.oraculo_auth(t,w,tok,'execute');
 SELECT * INTO n FROM public.oraculo_intents WHERE tenant_id=t AND workspace_id=w AND intent_id=i FOR UPDATE;
 IF NOT FOUND OR n.actor_ref IS DISTINCT FROM actor THEN RAISE EXCEPTION 'SCOPE_DENIED'; END IF;
 IF n.result IS NOT NULL THEN RETURN jsonb_build_object('result',n.result); END IF;
 SELECT payload INTO audit FROM public.oraculo_audits WHERE tenant_id=t AND workspace_id=w AND intent_id=i;
 IF n.assessment IS NULL OR audit->'assessment' IS DISTINCT FROM n.assessment OR audit->'snapshot' IS NULL
 OR audit->'actor' IS DISTINCT FROM n.actor_ref OR audit->'result' IS DISTINCT FROM 'null'::jsonb
 THEN RAISE EXCEPTION 'RECOVERY_EVIDENCE_REQUIRED'; END IF;
 RETURN jsonb_build_object('assessment',n.assessment,'snapshot',audit->'snapshot');
END $$;

CREATE FUNCTION public.oraculo_resolve_hold(t text,w text,tok text,i text,c jsonb,es jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public AS $$
DECLARE held jsonb; ev jsonb;
BEGIN
 held:=public.oraculo_hold(t,w,tok,i);
 IF held ? 'result' THEN
  IF held->'result' IS DISTINCT FROM c THEN RAISE EXCEPTION 'IMMUTABLE_RESULT'; END IF;
  RETURN;
 END IF;
 PERFORM public.oraculo_validate_negative(t,w,i,held->'assessment',c,es);
 FOR ev IN SELECT value FROM jsonb_array_elements(es) LOOP
  INSERT INTO public.oraculo_evaluations VALUES(t,w,ev->>'evaluationId',i,ev);
 END LOOP;
 INSERT INTO public.oraculo_negative_recoveries VALUES(t,w,i,jsonb_build_object('assessment',held->'assessment','result',c,'actor',public.oraculo_auth(t,w,tok,'execute'),'recordedAt',clock_timestamp()));
 UPDATE public.oraculo_intents SET result=c,updated_at=clock_timestamp() WHERE tenant_id=t AND workspace_id=w AND intent_id=i AND result IS NULL;
END $$;
REVOKE ALL ON TABLE public.oraculo_negative_recoveries FROM PUBLIC;
REVOKE ALL ON FUNCTION public.oraculo_validate_negative(text,text,text,jsonb,jsonb,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.oraculo_hold(text,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.oraculo_resolve_hold(text,text,text,text,jsonb,jsonb) FROM PUBLIC;

COMMIT;
