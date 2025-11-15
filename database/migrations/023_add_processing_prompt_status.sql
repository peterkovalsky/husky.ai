-- ============================================
-- Migration: Add PROCESSING_PROMPT Status
-- Description: Adds PROCESSING_PROMPT status to builds table for image processing step
-- Author: Claude Code
-- Date: 2025-11-14
-- ============================================

-- Step 1: Drop the existing check constraint
ALTER TABLE builds DROP CONSTRAINT IF EXISTS builds_status_check;

-- Step 2: Add updated check constraint with PROCESSING_PROMPT
ALTER TABLE builds
ADD CONSTRAINT builds_status_check
CHECK (status IN ('QUEUED', 'PROCESSING_PROMPT', 'PROCESSING', 'BUILDING', 'READY', 'FAILED'));

-- Step 3: Update comment to reflect new status
COMMENT ON COLUMN builds.status IS 'Build status: QUEUED, PROCESSING_PROMPT, PROCESSING, BUILDING, READY, FAILED';
