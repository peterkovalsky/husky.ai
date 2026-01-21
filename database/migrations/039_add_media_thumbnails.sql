-- Migration: Add thumbnail fields to medias table
-- Purpose: Store thumbnail S3 information for efficient chat display

-- Add thumbnail S3 key and bucket columns
ALTER TABLE medias ADD COLUMN IF NOT EXISTS thumbnail_s3_key VARCHAR(500);
ALTER TABLE medias ADD COLUMN IF NOT EXISTS thumbnail_s3_bucket VARCHAR(200);

-- Add comments for documentation
COMMENT ON COLUMN medias.thumbnail_s3_key IS 'S3 key for the generated thumbnail (256x256)';
COMMENT ON COLUMN medias.thumbnail_s3_bucket IS 'S3 bucket containing the thumbnail';
