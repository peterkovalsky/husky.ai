-- Add soft delete support to medias table
-- Migration: 014_add_deleted_at_to_medias.sql

-- Add deleted_at column for soft delete
ALTER TABLE medias ADD COLUMN deleted_at TIMESTAMP WITH TIME ZONE;

-- Create index for deleted_at queries (only index non-null values)
CREATE INDEX idx_medias_deleted_at ON medias(deleted_at) WHERE deleted_at IS NOT NULL;

-- Update RLS policy to exclude soft-deleted records
DROP POLICY IF EXISTS "Users can view their own medias" ON medias;
CREATE POLICY "Users can view their own medias" ON medias
    FOR SELECT
    USING (user_id = auth.uid() AND deleted_at IS NULL);
