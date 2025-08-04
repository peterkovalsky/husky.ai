-- Migration to move preview_url from previews table to projects table
-- This migration will delete the previews table and add preview_url column to projects

-- Add preview_url column to projects table
ALTER TABLE projects ADD COLUMN preview_url TEXT;

-- Copy the first preview URL for each project (if exists)
UPDATE projects 
SET preview_url = (
    SELECT preview_url 
    FROM previews 
    WHERE previews.project_id = projects.id 
    ORDER BY previews.created_at ASC 
    LIMIT 1
);

-- Drop the previews table and related policies/indexes
DROP POLICY IF EXISTS "Users can view previews in their projects" ON previews;
DROP POLICY IF EXISTS "Users can insert previews in their projects" ON previews;
DROP TRIGGER IF EXISTS update_previews_modified_at ON previews;
DROP INDEX IF EXISTS idx_previews_project_id;
DROP INDEX IF EXISTS idx_previews_prompt_id;
DROP TABLE IF EXISTS previews;

-- Create index for the new preview_url column (for performance if needed)
CREATE INDEX idx_projects_preview_url ON projects(preview_url) WHERE preview_url IS NOT NULL;