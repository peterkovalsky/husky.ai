-- ============================================
-- Migration: Add COMPLETED Status
-- Description: Adds COMPLETED status to builds table for fully finished builds
--              READY = preview is live and ready for users
--              COMPLETED = all production builds finished
-- Author: Claude Code
-- Date: 2025-11-17
-- ============================================

-- Step 1: Drop the existing check constraint
ALTER TABLE builds DROP CONSTRAINT IF EXISTS builds_status_check;

-- Step 2: Add updated check constraint with COMPLETED
ALTER TABLE builds
ADD CONSTRAINT builds_status_check
CHECK (status IN ('QUEUED', 'PROCESSING_PROMPT', 'PROCESSING', 'BUILDING', 'READY', 'COMPLETED', 'FAILED'));

-- Step 3: Update comment to reflect new status
COMMENT ON COLUMN builds.status IS 'Build status: QUEUED, PROCESSING_PROMPT, PROCESSING, BUILDING, READY, COMPLETED, FAILED';
