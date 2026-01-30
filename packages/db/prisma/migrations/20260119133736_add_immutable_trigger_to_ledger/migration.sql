-- This is an empty migration.
-- Append-only guardrail ledger: block UPDATE/DELETE at database level.
CREATE OR REPLACE FUNCTION guardrail_ledger_append_only()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'guardrail_ledger is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS guardrail_ledger_append_only ON "guardrail_ledger";
CREATE TRIGGER guardrail_ledger_append_only
BEFORE UPDATE OR DELETE ON "guardrail_ledger"
FOR EACH ROW EXECUTE FUNCTION guardrail_ledger_append_only();
