-- ============================================
-- Migration: Remove PROCESSING_PROMPT Status
-- Description: Removes PROCESSING_PROMPT status from builds table (no longer needed)
-- Author: Claude Code
-- Date: 2025-11-17
-- ============================================

-- Step 1: Drop the existing check constraint
ALTER TABLE builds DROP CONSTRAINT IF EXISTS builds_status_check;

-- Step 2: Add updated check constraint without PROCESSING_PROMPT
ALTER TABLE builds
ADD CONSTRAINT builds_status_check
CHECK (status IN ('QUEUED', 'PROCESSING', 'BUILDING', 'READY', 'COMPLETED', 'FAILED'));

-- Step 3: Update comment to reflect new status
COMMENT ON COLUMN builds.status IS 'Build status: QUEUED, PROCESSING, BUILDING, READY, COMPLETED, FAILED';
