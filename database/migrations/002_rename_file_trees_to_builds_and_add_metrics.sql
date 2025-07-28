-- Rename file_trees table to builds and add metrics column
-- This migration renames the file_trees table to builds and adds a metrics column

-- First, rename the table
ALTER TABLE file_trees RENAME TO builds;

-- Add metrics column to store build performance data
ALTER TABLE builds ADD COLUMN metrics JSONB DEFAULT '{}'::jsonb;

-- Update indexes to use new table name
DROP INDEX IF EXISTS idx_file_trees_project_id;
DROP INDEX IF EXISTS idx_file_trees_project_version;
CREATE INDEX idx_builds_project_id ON builds(project_id);
CREATE INDEX idx_builds_project_version ON builds(project_id, version);

-- Update RLS policies for the renamed table
DROP POLICY IF EXISTS "Users can view file trees in their projects" ON builds;
CREATE POLICY "Users can view builds in their projects" ON builds
    FOR SELECT USING (
        project_id IN (
            SELECT p.id FROM projects p
            JOIN user_workspaces uw ON p.workspace_id = uw.workspace_id
            WHERE uw.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can insert file trees in their projects" ON builds;
CREATE POLICY "Users can insert builds in their projects" ON builds
    FOR INSERT WITH CHECK (
        project_id IN (
            SELECT p.id FROM projects p
            JOIN user_workspaces uw ON p.workspace_id = uw.workspace_id
            WHERE uw.user_id = auth.uid()
        )
    );

-- Update trigger for modified_at updates
DROP TRIGGER IF EXISTS update_file_trees_modified_at ON builds;
CREATE TRIGGER update_builds_modified_at
    BEFORE UPDATE ON builds
    FOR EACH ROW
    EXECUTE FUNCTION update_modified_at();

-- Add comment to explain the metrics structure
COMMENT ON COLUMN builds.metrics IS 'JSON object containing build performance metrics: ai_generation_time_ms, dependency_install_time_ms, build_time_ms, s3_upload_time_ms, total_time_ms';