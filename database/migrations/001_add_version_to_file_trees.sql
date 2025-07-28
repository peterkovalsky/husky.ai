-- Add version column to file_trees table
ALTER TABLE file_trees ADD COLUMN version INTEGER NOT NULL DEFAULT 1;

-- Create index for version lookups
CREATE INDEX idx_file_trees_project_version ON file_trees(project_id, version);

-- Update RLS policy to include version in file trees access
DROP POLICY IF EXISTS "Users can view file trees in their projects" ON file_trees;
CREATE POLICY "Users can view file trees in their projects" ON file_trees
    FOR SELECT USING (
        project_id IN (
            SELECT p.id FROM projects p
            JOIN user_workspaces uw ON p.workspace_id = uw.workspace_id
            WHERE uw.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can insert file trees in their projects" ON file_trees;
CREATE POLICY "Users can insert file trees in their projects" ON file_trees
    FOR INSERT WITH CHECK (
        project_id IN (
            SELECT p.id FROM projects p
            JOIN user_workspaces uw ON p.workspace_id = uw.workspace_id
            WHERE uw.user_id = auth.uid()
        )
    );