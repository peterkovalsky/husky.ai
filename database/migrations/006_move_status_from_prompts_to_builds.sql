-- Move status field from prompts table to builds table
-- This migration transfers the status tracking from prompts to builds table

-- Add status column to builds table
ALTER TABLE builds ADD COLUMN status VARCHAR(50) NOT NULL DEFAULT 'QUEUED';

-- Add check constraint to ensure valid status values  
ALTER TABLE builds 
ADD CONSTRAINT builds_status_check 
CHECK (status IN ('QUEUED', 'PROCESSING', 'BUILDING', 'READY', 'FAILED'));

-- Add index for performance on status filtering
CREATE INDEX idx_builds_status ON builds(status);

-- Migrate existing status data from prompts to builds
-- For each prompt, find the corresponding build and copy the status
UPDATE builds 
SET status = (
    SELECT p.status 
    FROM prompts p 
    WHERE p.project_id = builds.project_id 
    ORDER BY p.created_at DESC 
    LIMIT 1
)
WHERE EXISTS (
    SELECT 1 FROM prompts p 
    WHERE p.project_id = builds.project_id
);

-- Remove status column from prompts table (no longer needed)
-- First, drop the index on prompts.status
DROP INDEX IF EXISTS idx_prompts_status;

-- Drop the status column
ALTER TABLE prompts DROP COLUMN status;

-- Add foreign key relationship between prompts and builds
-- This creates a 1:1 relationship where each prompt corresponds to one build
ALTER TABLE prompts ADD COLUMN build_id UUID REFERENCES builds(id) ON DELETE SET NULL;

-- Create index for the new foreign key
CREATE INDEX idx_prompts_build_id ON prompts(build_id);

-- Update RLS policies for builds table to include status-based filtering if needed
-- Users can view builds in their projects
DROP POLICY IF EXISTS "Users can view builds in their projects" ON builds;
CREATE POLICY "Users can view builds in their projects" ON builds
    FOR SELECT USING (
        project_id IN (
            SELECT p.id FROM projects p
            JOIN user_workspaces uw ON p.workspace_id = uw.workspace_id
            WHERE uw.user_id = auth.uid()
        )
    );

-- Users can update builds in their projects (for status updates)
CREATE POLICY "Users can update builds in their projects" ON builds
    FOR UPDATE USING (
        project_id IN (
            SELECT p.id FROM projects p
            JOIN user_workspaces uw ON p.workspace_id = uw.workspace_id
            WHERE uw.user_id = auth.uid()
        )
    );

-- Update prompts RLS policies to remove status-related constraints
-- (keeping existing policies but they no longer need to handle status)

-- Add comment to explain the new structure
COMMENT ON COLUMN builds.status IS 'Build status: QUEUED, PROCESSING, BUILDING, READY, FAILED';
COMMENT ON COLUMN prompts.build_id IS 'Foreign key to the build that was created from this prompt';