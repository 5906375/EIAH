-- CI1 additive storage and controlled operations. No runtime grants by default.
-- Applied only to the dedicated synthetic database by validateOraculoS1Integrated.ts.
ALTER TABLE public.approval_records ADD COLUMN record_format text NOT NULL DEFAULT 'LEGACY',
  ADD COLUMN context_hash text, ADD COLUMN governed_payload jsonb;
ALTER TABLE public.approval_records ADD CONSTRAINT approval_format_check CHECK (
  (record_format = 'LEGACY' AND context_hash IS NULL AND governed_payload IS NULL) OR
  (record_format = 'GOVERNED_V1' AND context_hash IS NOT NULL AND governed_payload IS NOT NULL));
CREATE UNIQUE INDEX approval_governed_context_unique ON public.approval_records(tenant_id,workspace_id,context_hash)
  WHERE record_format = 'GOVERNED_V1';

CREATE TABLE public.oraculo_fences (id text PRIMARY KEY, enabled boolean NOT NULL DEFAULT true);
INSERT INTO public.oraculo_fences(id) VALUES ('global');
CREATE TABLE public.oraculo_authorities (
 tenant_id text NOT NULL, workspace_id text NOT NULL, token_ref text NOT NULL,
 actor_ref jsonb NOT NULL, active boolean NOT NULL, expires_at timestamptz NOT NULL,
 capabilities text[] NOT NULL, PRIMARY KEY(tenant_id,workspace_id,token_ref));
CREATE TABLE public.oraculo_scopes (
 tenant_id text NOT NULL, workspace_id text NOT NULL, enabled boolean NOT NULL,
 installed boolean NOT NULL, policy text NOT NULL CHECK(policy IN ('sim-return-basic.v1','sim-return-hitl.v1')),
 PRIMARY KEY(tenant_id,workspace_id));
CREATE TABLE public.oraculo_visits (
 tenant_id text NOT NULL, workspace_id text NOT NULL, visit_id text NOT NULL,
 revision integer NOT NULL CHECK(revision>=0), state text NOT NULL CHECK(state IN ('NOT_ENTERED','INSIDE','EXITED')),
 snapshot jsonb NOT NULL, PRIMARY KEY(tenant_id,workspace_id,visit_id));
CREATE TABLE public.oraculo_observations (
 tenant_id text NOT NULL, workspace_id text NOT NULL, observation_id text NOT NULL,
 payload jsonb NOT NULL, PRIMARY KEY(tenant_id,workspace_id,observation_id));
CREATE TABLE public.oraculo_intents (
 tenant_id text NOT NULL, workspace_id text NOT NULL, intent_id text NOT NULL,
 hi text NOT NULL, actor_ref jsonb NOT NULL, payload jsonb NOT NULL,
 accepted_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 result jsonb, assessment jsonb, PRIMARY KEY(tenant_id,workspace_id,intent_id));
CREATE TABLE public.oraculo_contexts (
 tenant_id text NOT NULL, workspace_id text NOT NULL, hd text NOT NULL, payload jsonb NOT NULL,
 PRIMARY KEY(tenant_id,workspace_id,hd));
CREATE TABLE public.oraculo_executions (
 backend_pid integer NOT NULL, transaction_id bigint NOT NULL,
 tenant_id text NOT NULL, workspace_id text NOT NULL, intent_id text NOT NULL,
 token_ref text NOT NULL, hd text, consumed boolean NOT NULL DEFAULT false,
 PRIMARY KEY(backend_pid,transaction_id,tenant_id,workspace_id,intent_id));
CREATE TABLE public.oraculo_audits (
 tenant_id text NOT NULL, workspace_id text NOT NULL, intent_id text NOT NULL,
 payload jsonb NOT NULL, PRIMARY KEY(tenant_id,workspace_id,intent_id),
 FOREIGN KEY(tenant_id,workspace_id,intent_id) REFERENCES public.oraculo_intents);

CREATE FUNCTION public.oraculo_lock(t text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM 1 FROM public.oraculo_fences WHERE id='global' FOR SHARE;
 PERFORM 1 FROM public.oraculo_fences WHERE id='tenant:'||t FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'SCOPE_DENIED'; END IF;
END $$;

CREATE FUNCTION public.oraculo_auth(t text,w text,tok text,cap text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public AS $$
DECLARE a public.oraculo_authorities;
BEGIN
 SELECT * INTO a FROM public.oraculo_authorities WHERE tenant_id=t AND workspace_id=w AND token_ref=tok;
 IF a.token_ref IS NULL OR NOT a.active OR a.expires_at<=clock_timestamp() OR NOT cap=ANY(a.capabilities)
 OR NOT EXISTS(SELECT 1 FROM public.oraculo_fences WHERE id='global' AND enabled)
 OR NOT EXISTS(SELECT 1 FROM public.oraculo_scopes WHERE tenant_id=t AND workspace_id=w AND enabled AND installed)
 THEN RAISE EXCEPTION 'AUTHORITY_DENIED'; END IF;
 RETURN a.actor_ref;
END $$;

-- Only the synthetic authority writer receives these capabilities.
CREATE FUNCTION public.oraculo_write_scope(t text,w text,onoff boolean,inst boolean,pol text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM 1 FROM public.oraculo_fences WHERE id='global' FOR SHARE;
 INSERT INTO public.oraculo_fences(id) VALUES('tenant:'||t) ON CONFLICT DO NOTHING;
 PERFORM public.oraculo_lock(t);
 INSERT INTO public.oraculo_scopes VALUES(t,w,onoff,inst,pol)
 ON CONFLICT(tenant_id,workspace_id) DO UPDATE SET enabled=onoff,installed=inst,policy=pol;
END $$;
CREATE FUNCTION public.oraculo_write_authority(t text,w text,tok text,actor jsonb,onoff boolean,expiry timestamptz,caps text[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM public.oraculo_lock(t);
 INSERT INTO public.oraculo_authorities VALUES(t,w,tok,actor,onoff,expiry,caps)
 ON CONFLICT(tenant_id,workspace_id,token_ref) DO UPDATE SET actor_ref=actor,active=onoff,expires_at=expiry,capabilities=caps;
END $$;
CREATE FUNCTION public.oraculo_write_global(onoff boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public AS $$ BEGIN
 PERFORM 1 FROM public.oraculo_fences WHERE id='global' FOR UPDATE;
 UPDATE public.oraculo_fences SET enabled=onoff WHERE id='global';
END $$;

CREATE FUNCTION public.oraculo_write_snapshot(t text,w text,s jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public AS $$
DECLARE o jsonb; old jsonb; v public.oraculo_visits;
BEGIN
 PERFORM public.oraculo_lock(t);
 IF s->>'mode' IS DISTINCT FROM 'SIMULATION' OR s->>'tenantId' IS DISTINCT FROM t OR s->>'workspaceId' IS DISTINCT FROM w
 OR s#>>'{visit,tenantId}' IS DISTINCT FROM t OR s#>>'{visit,workspaceId}' IS DISTINCT FROM w
 OR s ? 'approval' OR s ? 'approvalContext' THEN RAISE EXCEPTION 'INVALID_SNAPSHOT'; END IF;
 SELECT * INTO v FROM public.oraculo_visits WHERE tenant_id=t AND workspace_id=w AND visit_id=s#>>'{visit,visitId}' FOR UPDATE;
 IF FOUND AND (v.revision<>(s#>>'{visit,revision}')::integer OR v.state<>s#>>'{visit,state}') THEN
 RAISE EXCEPTION 'SNAPSHOT_CANNOT_TRANSITION'; END IF;
 IF (SELECT count(*) FROM jsonb_array_elements(s->'observations')) <>
 (SELECT count(DISTINCT value->>'observationId') FROM jsonb_array_elements(s->'observations')) THEN RAISE EXCEPTION 'DUPLICATE_OBSERVATION'; END IF;
 FOR o IN SELECT value FROM jsonb_array_elements(s->'observations') LOOP
  IF o->>'tenantId' IS DISTINCT FROM t OR o->>'workspaceId' IS DISTINCT FROM w THEN RAISE EXCEPTION 'SCOPE_DENIED'; END IF;
  SELECT payload INTO old FROM public.oraculo_observations WHERE tenant_id=t AND workspace_id=w AND observation_id=o->>'observationId';
  IF FOUND AND old<>o THEN RAISE EXCEPTION 'IMMUTABLE_OBSERVATION'; END IF;
  INSERT INTO public.oraculo_observations VALUES(t,w,o->>'observationId',o) ON CONFLICT DO NOTHING;
 END LOOP;
 INSERT INTO public.oraculo_visits VALUES(t,w,s#>>'{visit,visitId}',(s#>>'{visit,revision}')::integer,s#>>'{visit,state}',s)
 ON CONFLICT(tenant_id,workspace_id,visit_id) DO UPDATE SET snapshot=s;
END $$;

CREATE FUNCTION public.oraculo_admit(t text,w text,tok text,p jsonb,h text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public AS $$
DECLARE actor jsonb; old public.oraculo_intents;
BEGIN
 PERFORM public.oraculo_lock(t); actor:=public.oraculo_auth(t,w,tok,'execute');
 IF p->>'tenantId' IS DISTINCT FROM t OR p->>'workspaceId' IS DISTINCT FROM w OR p->>'mode' IS DISTINCT FROM 'SIMULATION'
 OR p->'actorRef' IS DISTINCT FROM actor OR h!~'^sha256:[0-9a-f]{64}$' THEN RAISE EXCEPTION 'SCOPE_DENIED'; END IF;
 SELECT * INTO old FROM public.oraculo_intents WHERE tenant_id=t AND workspace_id=w AND intent_id=p->>'intentId' FOR UPDATE;
 IF FOUND THEN
  IF old.hi<>h OR old.actor_ref<>actor THEN RAISE EXCEPTION 'INTENT_PAYLOAD_CONFLICT'; END IF;
  RETURN;
 END IF;
 INSERT INTO public.oraculo_intents(tenant_id,workspace_id,intent_id,hi,actor_ref,payload) VALUES(t,w,p->>'intentId',h,actor,p);
END $$;

CREATE FUNCTION public.oraculo_begin(t text,w text,tok text,i text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public AS $$
DECLARE a jsonb; n public.oraculo_intents; v public.oraculo_visits; pol text; cap text;
BEGIN
 PERFORM public.oraculo_lock(t);
 cap:=CASE WHEN session_user='oraculo_ci1_approver' THEN 'approve' ELSE 'execute' END;
 a:=public.oraculo_auth(t,w,tok,cap);
 SELECT * INTO n FROM public.oraculo_intents WHERE tenant_id=t AND workspace_id=w AND intent_id=i FOR UPDATE;
 IF NOT FOUND OR (cap='execute' AND n.actor_ref<>a) THEN RAISE EXCEPTION 'SCOPE_DENIED'; END IF;
 SELECT * INTO v FROM public.oraculo_visits WHERE tenant_id=t AND workspace_id=w AND visit_id=n.payload->>'visitId' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'VISIT_UNRESOLVED'; END IF;
 SELECT policy INTO pol FROM public.oraculo_scopes WHERE tenant_id=t AND workspace_id=w;
 IF cap='execute' THEN
  INSERT INTO public.oraculo_executions VALUES(pg_backend_pid(),txid_current(),t,w,i,tok,NULL,false);
 END IF;
 RETURN jsonb_build_object('intent',n.payload,'result',n.result,'assessment',n.assessment,'actor',a,
  'snapshot',v.snapshot||jsonb_build_object('intent',n.payload,'policy',pol,'visit',v.snapshot->'visit'||jsonb_build_object('revision',v.revision,'state',v.state)));
END $$;

CREATE FUNCTION public.oraculo_context(t text,w text,tok text,i text,h text,e jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public AS $$
DECLARE n public.oraculo_intents; old jsonb; a public.approval_records; reviewer jsonb;
BEGIN
 PERFORM public.oraculo_lock(t);
 PERFORM public.oraculo_auth(t,w,tok,CASE WHEN session_user='oraculo_ci1_approver' THEN 'approve' ELSE 'execute' END);
 SELECT * INTO n FROM public.oraculo_intents WHERE tenant_id=t AND workspace_id=w AND intent_id=i FOR UPDATE;
 IF NOT FOUND OR e->>'tenantId' IS DISTINCT FROM t OR e->>'workspaceId' IS DISTINCT FROM w OR e->'requesterBinding' IS DISTINCT FROM n.actor_ref
 OR e#>>'{visitRef,id}' IS DISTINCT FROM n.payload->>'visitId' OR h!~'^sha256:[0-9a-f]{64}$' THEN RAISE EXCEPTION 'CONTEXT_MISMATCH'; END IF;
 SELECT payload INTO old FROM public.oraculo_contexts WHERE tenant_id=t AND workspace_id=w AND hd=h;
 IF FOUND AND old<>e THEN RAISE EXCEPTION 'IMMUTABLE_CONTEXT'; END IF;
 INSERT INTO public.oraculo_contexts VALUES(t,w,h,e) ON CONFLICT DO NOTHING;
 UPDATE public.oraculo_executions SET hd=h WHERE backend_pid=pg_backend_pid() AND transaction_id=txid_current() AND tenant_id=t AND workspace_id=w AND intent_id=i AND NOT consumed;
 SELECT * INTO a FROM public.approval_records WHERE tenant_id=t AND workspace_id=w AND context_hash=h AND record_format='GOVERNED_V1';
 IF NOT FOUND THEN RETURN NULL; END IF;
 -- The token reference recorded by the trusted producer is revalidated at execution.
 reviewer:=public.oraculo_auth(t,w,a.governed_payload->>'reviewerTokenRef','approve');
 IF reviewer->>'id' IS DISTINCT FROM a.decided_by_user_id THEN RAISE EXCEPTION 'REVIEWER_CHANGED'; END IF;
 RETURN a.governed_payload->'decision';
END $$;

CREATE FUNCTION public.oraculo_approve(t text,w text,tok text,h text,a jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public AS $$
DECLARE actor jsonb; e jsonb;
BEGIN
 PERFORM public.oraculo_lock(t); actor:=public.oraculo_auth(t,w,tok,'approve');
 SELECT payload INTO e FROM public.oraculo_contexts WHERE tenant_id=t AND workspace_id=w AND hd=h;
 IF NOT FOUND OR a->>'tenantId' IS DISTINCT FROM t OR a->>'workspaceId' IS DISTINCT FROM w
 OR a->>'decidedByUserId' IS DISTINCT FROM actor->>'id' OR a#>>'{subject,inputHash}' IS DISTINCT FROM h
 OR a#>>'{subject,action}' IS DISTINCT FROM e->>'action' OR a#>>'{subject,resourceId}' IS DISTINCT FROM e#>>'{visitRef,id}'
 OR a#>>'{subject,caseId}' IS DISTINCT FROM e#>>'{caseRef,id}' OR a->>'decision' NOT IN ('APPROVED','REJECTED') THEN RAISE EXCEPTION 'APPROVAL_MISMATCH'; END IF;
 INSERT INTO public.approval_records(id,tenant_id,workspace_id,decided_by_user_id,decision,record_format,context_hash,governed_payload)
 VALUES(a->>'authorityDecisionId',t,w,actor->>'id',(CASE WHEN a->>'decision'='APPROVED' THEN 'APPROVED' ELSE 'REJECTED' END)::public."ApprovalDecision",
 'GOVERNED_V1',h,jsonb_build_object('reviewerTokenRef',tok,'decision',a));
END $$;

CREATE FUNCTION public.oraculo_finish(t text,w text,tok text,i text,assessment_value jsonb,c5 jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public AS $$
DECLARE x public.oraculo_executions; n public.oraculo_intents; v public.oraculo_visits; pol text; a jsonb;
BEGIN
 SELECT * INTO x FROM public.oraculo_executions WHERE backend_pid=pg_backend_pid() AND transaction_id=txid_current() AND tenant_id=t AND workspace_id=w AND intent_id=i;
 IF NOT FOUND OR x.consumed OR x.token_ref<>tok THEN RAISE EXCEPTION 'EXECUTION_CONTEXT_REQUIRED'; END IF;
 PERFORM public.oraculo_auth(t,w,tok,'execute');
 SELECT * INTO n FROM public.oraculo_intents WHERE tenant_id=t AND workspace_id=w AND intent_id=i;
 IF n.result IS NOT NULL OR n.assessment IS NOT NULL THEN RAISE EXCEPTION 'IMMUTABLE_RESULT'; END IF;
 SELECT * INTO v FROM public.oraculo_visits WHERE tenant_id=t AND workspace_id=w AND visit_id=n.payload->>'visitId';
 IF c5 IS NOT NULL THEN
  IF c5->>'outcome' IS DISTINCT FROM 'APPLIED' OR c5->>'mode' IS DISTINCT FROM 'SIMULATION'
   OR c5->>'tenantId' IS DISTINCT FROM t OR c5->>'workspaceId' IS DISTINCT FROM w OR c5->>'intentId' IS DISTINCT FROM i
   OR (n.payload->>'expectedRevision')::integer IS DISTINCT FROM v.revision
   OR (c5->>'previousRevision')::integer IS DISTINCT FROM v.revision OR (c5->>'nextRevision')::integer IS DISTINCT FROM v.revision+1
   OR c5->>'previousState' IS DISTINCT FROM v.state
   OR NOT ((n.payload->>'direction'='IN' AND v.state='NOT_ENTERED' AND c5->>'nextState'='INSIDE') OR
           (n.payload->>'direction'='OUT' AND v.state='INSIDE' AND c5->>'nextState'='EXITED'))
   OR jsonb_array_length(c5->'evaluationRefs')<>1 OR c5#>>'{evaluationRefs,0}' IS DISTINCT FROM i
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
 INSERT INTO public.oraculo_audits VALUES(t,w,i,jsonb_build_object('assessment',assessment_value,'result',c5,'hd',x.hd,'actor',n.actor_ref));
 UPDATE public.oraculo_intents SET result=c5,assessment=assessment_value,updated_at=clock_timestamp() WHERE tenant_id=t AND workspace_id=w AND intent_id=i;
 UPDATE public.oraculo_executions SET consumed=true WHERE backend_pid=x.backend_pid AND transaction_id=x.transaction_id AND tenant_id=t AND workspace_id=w AND intent_id=i;
END $$;

CREATE FUNCTION public.oraculo_read(t text,w text,tok text,i text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public AS $$
DECLARE actor jsonb; n public.oraculo_intents;
BEGIN
 PERFORM public.oraculo_lock(t); actor:=public.oraculo_auth(t,w,tok,'read');
 SELECT * INTO n FROM public.oraculo_intents WHERE tenant_id=t AND workspace_id=w AND intent_id=i;
 IF NOT FOUND OR n.actor_ref<>actor THEN RAISE EXCEPTION 'SCOPE_DENIED'; END IF;
 RETURN jsonb_strip_nulls(jsonb_build_object('schemaVersion','oraculo.gate-intent-tracking.v1','mode','SIMULATION','intentId',i,
  'state',CASE WHEN n.result IS NOT NULL THEN 'FINAL' WHEN n.assessment IS NOT NULL THEN 'PROCESSING' ELSE 'ACCEPTED' END,
  'acceptedAt',to_char(n.accepted_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'updatedAt',to_char(n.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'result',n.result));
END $$;

-- Default function EXECUTE is intentionally removed. Grants belong to a dedicated provisioner.
DO $$ DECLARE r record; BEGIN
 FOR r IN SELECT oid::regprocedure AS name FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'oraculo_%'
 LOOP EXECUTE 'REVOKE ALL ON FUNCTION '||r.name||' FROM PUBLIC'; END LOOP;
END $$;
REVOKE ALL ON public.oraculo_fences,public.oraculo_authorities,public.oraculo_scopes,public.oraculo_visits,
 public.oraculo_observations,public.oraculo_intents,public.oraculo_contexts,public.oraculo_executions,public.oraculo_audits FROM PUBLIC;
