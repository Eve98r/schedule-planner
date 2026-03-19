-- Audit log table for tracking admin actions
CREATE TABLE IF NOT EXISTS audit_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_type text, -- 'user', 'shift_claim', 'bonus_shift', 'default_schedule'
  target_id text,   -- ID of the affected resource
  details jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- Index for querying by actor and time
CREATE INDEX idx_audit_log_actor ON audit_log(actor_id);
CREATE INDEX idx_audit_log_created ON audit_log(created_at DESC);

-- RLS: only admins can read audit logs, nobody can modify via client
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read audit logs"
  ON audit_log FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- No INSERT/UPDATE/DELETE policies for clients — writes happen only via Edge Functions
