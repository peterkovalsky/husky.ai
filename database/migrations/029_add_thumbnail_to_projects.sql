-- Add thumbnail_url column to projects table for storing screenshot thumbnails
ALTER TABLE projects ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;

-- Add comment for documentation
COMMENT ON COLUMN projects.thumbnail_url IS 'URL to the project thumbnail screenshot stored in S3';
