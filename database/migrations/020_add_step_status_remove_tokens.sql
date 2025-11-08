-- Migration: Add step_status column and remove token tracking columns
-- Date: 2025-01-08
-- Description: Refactor builds table to support step-based build process tracking.
--              Remove input_tokens and output_tokens (already tracked in prompts table).

-- Add step_status column to track current build step
ALTER TABLE builds ADD COLUMN step_status TEXT;

-- Create index for step_status queries (useful for monitoring and debugging)
CREATE INDEX idx_builds_step_status ON builds(step_status);

-- Remove token columns (already tracked in prompts table)
ALTER TABLE builds DROP COLUMN IF EXISTS input_tokens;
ALTER TABLE builds DROP COLUMN IF EXISTS output_tokens;

-- Add comment to document step_status values
COMMENT ON COLUMN builds.step_status IS 'Current build step: INITIALIZING, GENERATING_CODE, PREPARING_FILES, BUILDING_PREVIEW, UPLOADING_PREVIEW, BUILDING_PRODUCTION, UPLOADING_PRODUCTION, FINALIZING, COMPLETED, FAILED';
