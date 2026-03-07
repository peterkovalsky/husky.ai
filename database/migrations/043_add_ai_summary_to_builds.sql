-- Add ai_summary column to builds table for storing AI-generated summaries
ALTER TABLE builds ADD COLUMN IF NOT EXISTS ai_summary TEXT;

-- Add comment for documentation
COMMENT ON COLUMN builds.ai_summary IS 'AI-generated plain-English summary of what was changed in this build';
