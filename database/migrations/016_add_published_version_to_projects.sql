-- Add published_version column to projects table
-- This tracks which version is currently published

-- Add published_version column
ALTER TABLE projects ADD COLUMN published_version INTEGER;

-- Add comment
COMMENT ON COLUMN projects.published_version IS 'The version number that is currently published. NULL indicates no version is published.';

-- Create index for faster queries on published_version
CREATE INDEX idx_projects_published_version ON projects(published_version) WHERE published_version IS NOT NULL;
