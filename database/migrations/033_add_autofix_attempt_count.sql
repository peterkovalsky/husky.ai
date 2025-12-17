-- Add auto_fix_attempt_count to track number of auto-fix attempts
ALTER TABLE builds ADD COLUMN auto_fix_attempt_count INTEGER DEFAULT 0;

-- Update index to include attempt count for analytics queries
DROP INDEX IF EXISTS idx_builds_auto_fix;
CREATE INDEX idx_builds_auto_fix ON builds(auto_fix_attempted, auto_fix_successful, auto_fix_attempt_count);
