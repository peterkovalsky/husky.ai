-- Expand project status to include build lifecycle values
-- NEW: newly created project, no builds yet
-- FAILED: contains only failed builds
-- ACTIVE: at least one successful build (shown on dashboard)
-- DELETING: being deleted

-- Drop existing constraint
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_status_check;

-- Change default from ACTIVE to NEW for new projects
ALTER TABLE projects ALTER COLUMN status SET DEFAULT 'NEW';

-- Add new constraint with expanded values
ALTER TABLE projects ADD CONSTRAINT projects_status_check
  CHECK (status IN ('NEW', 'FAILED', 'ACTIVE', 'DELETING'));

-- Backfill: ACTIVE projects with successful builds stay ACTIVE (no change needed)

-- Backfill: Convert ACTIVE projects with only failed builds to FAILED
UPDATE projects p
SET status = 'FAILED'
WHERE p.status = 'ACTIVE'
AND EXISTS (
  SELECT 1 FROM builds b
  WHERE b.project_id = p.id
  AND b.status = 'FAILED'
)
AND NOT EXISTS (
  SELECT 1 FROM builds b
  WHERE b.project_id = p.id
  AND b.status = 'COMPLETED'
);

-- Backfill: Convert ACTIVE projects with no builds to NEW
UPDATE projects p
SET status = 'NEW'
WHERE p.status = 'ACTIVE'
AND NOT EXISTS (
  SELECT 1 FROM builds b
  WHERE b.project_id = p.id
);

-- Update RLS policy to allow users to see all their non-DELETING projects
-- (Dashboard filtering will be done in application layer)
DROP POLICY IF EXISTS "Users can view active projects in their workspaces" ON projects;

CREATE POLICY "Users can view non-deleted projects in their workspaces" ON projects
    FOR SELECT USING (
        status != 'DELETING' AND
        workspace_id IN (
            SELECT workspace_id FROM user_workspaces
            WHERE user_id = auth.uid()
        )
    );

-- Add partial index for cleanup queries (NEW/FAILED projects by created_at)
CREATE INDEX IF NOT EXISTS idx_projects_status_created
ON projects(status, created_at)
WHERE status IN ('NEW', 'FAILED');
