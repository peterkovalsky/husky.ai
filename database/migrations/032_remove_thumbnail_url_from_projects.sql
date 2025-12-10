-- Migration: Remove thumbnail_url column from projects table
-- Thumbnail URLs are now constructed on-the-fly from projectId and currentVersion:
-- S3 key: {projectId}/thumbnails/v{currentVersion}.png
-- This avoids storing redundant data and ensures thumbnails always match the current version

-- Drop the thumbnail_url column from projects table
ALTER TABLE projects DROP COLUMN IF EXISTS thumbnail_url;
