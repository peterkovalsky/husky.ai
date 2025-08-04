-- Add status column to projects table
ALTER TABLE projects 
ADD COLUMN status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE';

-- Add index for performance on status filtering
CREATE INDEX idx_projects_status ON projects(status);

-- Add check constraint to ensure valid status values
ALTER TABLE projects 
ADD CONSTRAINT projects_status_check 
CHECK (status IN ('ACTIVE', 'DELETING'));

-- Update RLS policies to exclude DELETING projects from normal queries
-- Update the existing policy for viewing projects
DROP POLICY IF EXISTS "Users can view projects in their workspaces" ON projects;

CREATE POLICY "Users can view active projects in their workspaces" ON projects
    FOR SELECT USING (
        status = 'ACTIVE' AND
        workspace_id IN (
            SELECT workspace_id FROM user_workspaces 
            WHERE user_id = auth.uid()
        )
    );

-- Add separate policy for accessing projects during deletion (for API operations)
CREATE POLICY "Users can access their projects for operations" ON projects
    FOR ALL USING (
        workspace_id IN (
            SELECT workspace_id FROM user_workspaces 
            WHERE user_id = auth.uid()
        )
    );