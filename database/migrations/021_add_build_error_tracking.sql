-- Migration: Add error tracking fields for auto-fix functionality
-- Date: 2025-01-08
-- Description: Add columns to track build errors, error output, and auto-fix attempts.
--              These fields enable the auto-fix feature to store error details and
--              track whether automatic fixes were attempted and successful.

-- Add error message column to store human-readable error summary
ALTER TABLE builds ADD COLUMN error_message TEXT;

-- Add error output column to store full build stderr/stdout for debugging
ALTER TABLE builds ADD COLUMN error_output TEXT;

-- Add flag to track whether auto-fix was attempted for this build
ALTER TABLE builds ADD COLUMN auto_fix_attempted BOOLEAN DEFAULT FALSE;

-- Add flag to track whether auto-fix successfully resolved the error
ALTER TABLE builds ADD COLUMN auto_fix_successful BOOLEAN;

-- Create index for querying failed builds with auto-fix attempts
CREATE INDEX idx_builds_auto_fix ON builds(auto_fix_attempted, auto_fix_successful);

-- Add comments to document the columns
COMMENT ON COLUMN builds.error_message IS 'Human-readable error summary when build fails';
COMMENT ON COLUMN builds.error_output IS 'Full build error output (stderr/stdout) for debugging';
COMMENT ON COLUMN builds.auto_fix_attempted IS 'Whether automatic fix was attempted for this failed build';
COMMENT ON COLUMN builds.auto_fix_successful IS 'Whether auto-fix successfully resolved the build error (NULL if not attempted)';
