-- Migration: Consolidate status and step_status fields
-- Date: 2025-01-18
-- Description: Merge step_status into status field for simplified status tracking.
--              The status field will store detailed step values (11 states) in the database,
--              and the API will map these to high-level frontend statuses (6 states).
--              This removes redundancy and provides better internal tracking while
--              maintaining frontend compatibility through the status mapping layer.

-- Step 1: Update existing records FIRST (before adding constraint)
-- Map old high-level statuses to equivalent step statuses
UPDATE builds SET status = 'INITIALIZING' WHERE status = 'QUEUED';
UPDATE builds SET status = 'COMPLETED' WHERE status = 'READY';
UPDATE builds SET status = 'GENERATING_CODE' WHERE status = 'PROCESSING';
UPDATE builds SET status = 'BUILDING_PREVIEW' WHERE status = 'BUILDING';
-- FAILED can remain as-is

-- Step 2: Drop the step_status column and its index
DROP INDEX IF EXISTS idx_builds_step_status;
ALTER TABLE builds DROP COLUMN IF EXISTS step_status;

-- Step 3: Drop the old status constraint
ALTER TABLE builds DROP CONSTRAINT IF EXISTS builds_status_check;

-- Step 4: Add new constraint with all step status values
ALTER TABLE builds
ADD CONSTRAINT builds_status_check
CHECK (status IN (
  'INITIALIZING',
  'PROCESSING_PROMPT',
  'GENERATING_CODE',
  'PREPARING_FILES',
  'BUILDING_PREVIEW',
  'UPLOADING_PREVIEW',
  'BUILDING_PRODUCTION',
  'UPLOADING_PRODUCTION',
  'FINALIZING',
  'COMPLETED',
  'FAILED'
));

-- Step 5: Update column comment to reflect new values
COMMENT ON COLUMN builds.status IS 'Detailed build step status: INITIALIZING, PROCESSING_PROMPT, GENERATING_CODE, PREPARING_FILES, BUILDING_PREVIEW, UPLOADING_PREVIEW, BUILDING_PRODUCTION, UPLOADING_PRODUCTION, FINALIZING, COMPLETED, FAILED. API maps these to high-level statuses for frontend (QUEUED, PROCESSING, BUILDING, READY, COMPLETED, FAILED).';
