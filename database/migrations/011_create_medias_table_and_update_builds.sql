-- Create medias table for storing uploaded images and other media files
-- Media files are stored independently and referenced by builds via media_ids array

-- Create medias table
CREATE TABLE medias (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL CHECK (type IN ('image', 'video', 'doc')),
    mime_type VARCHAR(100) NOT NULL,
    s3_key VARCHAR(500) NOT NULL,
    s3_bucket VARCHAR(200) NOT NULL,
    file_size INTEGER NOT NULL,
    width INTEGER,
    height INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    modified_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX idx_medias_user_id ON medias(user_id);
CREATE INDEX idx_medias_created_at ON medias(created_at DESC);

-- Add RLS policies
ALTER TABLE medias ENABLE ROW LEVEL SECURITY;

-- Users can insert their own medias
CREATE POLICY "Users can insert their own medias" ON medias
    FOR INSERT WITH CHECK (user_id = auth.uid());

-- Users can view their own medias
CREATE POLICY "Users can view their own medias" ON medias
    FOR SELECT USING (user_id = auth.uid());

-- Users can delete their own medias
CREATE POLICY "Users can delete their own medias" ON medias
    FOR DELETE USING (user_id = auth.uid());

-- Update builds table to add media_ids array
ALTER TABLE builds ADD COLUMN media_ids UUID[] DEFAULT '{}';

-- Add index for media_ids array queries
CREATE INDEX idx_builds_media_ids ON builds USING GIN(media_ids);

-- Add comments
COMMENT ON TABLE medias IS 'Stores uploaded media files (images, videos, documents) referenced by builds';
COMMENT ON COLUMN medias.type IS 'Type of media: image, video, or doc';
COMMENT ON COLUMN medias.mime_type IS 'MIME type of the file (e.g., image/jpeg, image/png)';
COMMENT ON COLUMN medias.s3_key IS 'S3 object key path';
COMMENT ON COLUMN medias.s3_bucket IS 'S3 bucket name where the file is stored';
COMMENT ON COLUMN medias.file_size IS 'File size in bytes';
COMMENT ON COLUMN medias.width IS 'Image width in pixels (nullable, only for images)';
COMMENT ON COLUMN medias.height IS 'Image height in pixels (nullable, only for images)';
COMMENT ON COLUMN builds.media_ids IS 'Array of media IDs associated with this build';
