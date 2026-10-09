-- Custom SQL migration file, put your code below! --
-- The consent ledger is append-only. UPDATE and DELETE are rejected unless the
-- current transaction sets nod.allow_erasure = 'on', which only the
-- "delete my account" flow does (UK GDPR right to erasure).
CREATE OR REPLACE FUNCTION nod_approvals_append_only() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('nod.allow_erasure', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'approvals ledger is append-only (% blocked)', TG_OP;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER approvals_append_only
  BEFORE UPDATE OR DELETE ON approvals
  FOR EACH ROW EXECUTE FUNCTION nod_approvals_append_only();
