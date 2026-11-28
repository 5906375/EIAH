BEGIN;
CREATE OR REPLACE FUNCTION public.oraculo_context(t text,w text,tok text,i text,h text,e jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public AS $$
DECLARE n public.oraculo_intents; old jsonb; a public.approval_records; reviewer jsonb; requester jsonb;
BEGIN
 PERFORM public.oraculo_lock(t);
 requester:=public.oraculo_auth(t,w,tok,CASE WHEN session_user='oraculo_ci1_approver' THEN 'approve' ELSE 'execute' END);
 SELECT * INTO n FROM public.oraculo_intents WHERE tenant_id=t AND workspace_id=w AND intent_id=i FOR UPDATE;
 IF NOT FOUND OR e->>'tenantId' IS DISTINCT FROM t OR e->>'workspaceId' IS DISTINCT FROM w OR e->'requesterBinding' IS DISTINCT FROM n.actor_ref
 OR e#>>'{visitRef,id}' IS DISTINCT FROM n.payload->>'visitId' OR h!~'^sha256:[0-9a-f]{64}$' THEN RAISE EXCEPTION 'CONTEXT_MISMATCH'; END IF;
 IF session_user<>'oraculo_ci1_approver' THEN
  IF requester IS DISTINCT FROM n.actor_ref OR NOT EXISTS(
   SELECT 1 FROM public.oraculo_executions WHERE backend_pid=pg_backend_pid() AND transaction_id=txid_current()
    AND tenant_id=t AND workspace_id=w AND intent_id=i AND token_ref=tok AND NOT consumed
  ) THEN RAISE EXCEPTION 'EXECUTION_CONTEXT_REQUIRED'; END IF;
 END IF;
 SELECT payload INTO old FROM public.oraculo_contexts WHERE tenant_id=t AND workspace_id=w AND hd=h;
 IF FOUND AND old<>e THEN RAISE EXCEPTION 'IMMUTABLE_CONTEXT'; END IF;
 INSERT INTO public.oraculo_contexts VALUES(t,w,h,e) ON CONFLICT DO NOTHING;
 UPDATE public.oraculo_executions SET hd=h WHERE backend_pid=pg_backend_pid() AND transaction_id=txid_current() AND tenant_id=t AND workspace_id=w AND intent_id=i AND NOT consumed;
 SELECT * INTO a FROM public.approval_records WHERE tenant_id=t AND workspace_id=w AND context_hash=h AND record_format='GOVERNED_V1';
 IF NOT FOUND THEN RETURN NULL; END IF;
 -- The token reference recorded by the trusted producer is revalidated at execution.
 reviewer:=public.oraculo_auth(t,w,a.governed_payload->>'reviewerTokenRef','approve');
 IF reviewer IS DISTINCT FROM a.governed_payload->'reviewerBinding' THEN RAISE EXCEPTION 'REVIEWER_CHANGED'; END IF;
 RETURN a.governed_payload->'decision';
END $$;

COMMIT;
