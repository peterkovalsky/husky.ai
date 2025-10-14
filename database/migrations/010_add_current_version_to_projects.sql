-- Add current_version column to projects table
-- This tracks the latest successful build version for each project
-- Used in the new single working directory structure (/apps/projects/{projectId}/web/)

-- Add current_version column
ALTER TABLE projects ADD COLUMN current_version INTEGER DEFAULT 0;

-- Add comment to explain the column
COMMENT ON COLUMN projects.current_version IS 'The version number of the latest successful build. 0 indicates no successful builds yet.';

-- Create index for faster queries on current_version
CREATE INDEX idx_projects_current_version ON projects(current_version);
