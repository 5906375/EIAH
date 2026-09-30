-- P1 prototype protection. Owners/superusers can still change DDL; this is not independent attestation.
BEGIN;
CREATE FUNCTION public.p1_reject_transition_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'p1_transition_append_only' USING ERRCODE = '55000';
END $$;
CREATE TRIGGER p1_transition_append_only
BEFORE UPDATE OR DELETE ON public.run_state_transitions
FOR EACH ROW EXECUTE FUNCTION public.p1_reject_transition_mutation();
CREATE TRIGGER p1_transition_no_truncate
BEFORE TRUNCATE ON public.run_state_transitions
FOR EACH STATEMENT EXECUTE FUNCTION public.p1_reject_transition_mutation();

CREATE FUNCTION public.p1_protect_publish_intent() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RAISE EXCEPTION 'p1_publish_intent_immutable' USING ERRCODE = '55000';
  END IF;
  IF ROW(NEW.id,NEW.command_id,NEW.run_id,NEW.tenant_id,NEW.workspace_id,NEW.destination,NEW.payload_ref,NEW.payload,NEW.created_at)
     IS DISTINCT FROM ROW(OLD.id,OLD.command_id,OLD.run_id,OLD.tenant_id,OLD.workspace_id,OLD.destination,OLD.payload_ref,OLD.payload,OLD.created_at)
     OR NEW.attempts < OLD.attempts OR (OLD.state = 'published' AND
       ROW(NEW.state,NEW.published_at) IS DISTINCT FROM ROW(OLD.state,OLD.published_at)) THEN
    RAISE EXCEPTION 'p1_publish_intent_immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER p1_publish_intent_immutable
BEFORE UPDATE OR DELETE ON public.run_publish_outbox
FOR EACH ROW EXECUTE FUNCTION public.p1_protect_publish_intent();
CREATE TRIGGER p1_publish_intent_no_truncate
BEFORE TRUNCATE ON public.run_publish_outbox
FOR EACH STATEMENT EXECUTE FUNCTION public.p1_protect_publish_intent();
ALTER TABLE public.run_publish_outbox ADD CONSTRAINT p1_publish_marker_check CHECK (
  (state = 'pending' AND published_at IS NULL) OR (state = 'published' AND published_at IS NOT NULL)
);
COMMIT;
