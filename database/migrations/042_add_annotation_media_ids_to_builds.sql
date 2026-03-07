-- Add annotation_media_ids to builds table
-- Tracks which media IDs are annotated screenshots (subset of media_ids)
ALTER TABLE builds ADD COLUMN IF NOT EXISTS annotation_media_ids text[] DEFAULT '{}';
