-- Migration: Add user_prompt and user_id columns to builds table and migrate from prompts table
-- This consolidates prompts and builds into a single table (builds as source of truth)

-- Step 1: Add user_prompt column to builds (nullable initially for backfill)
ALTER TABLE builds ADD COLUMN IF NOT EXISTS user_prompt TEXT;

-- Step 2: Add user_id column to builds (nullable initially for backfill)
ALTER TABLE builds ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Step 3: Create index for querying builds by project and creation time
CREATE INDEX IF NOT EXISTS idx_builds_project_created ON builds(project_id, created_at DESC);

-- Step 4: Create index for querying builds by user
CREATE INDEX IF NOT EXISTS idx_builds_user_id ON builds(user_id);

-- Step 5: Backfill user_prompt from prompts table
UPDATE builds b
SET user_prompt = p.prompt
FROM prompts p
WHERE p.build_id = b.id
  AND b.user_prompt IS NULL;

-- Step 6: For any builds without a linked prompt, set a default message
UPDATE builds
SET user_prompt = '[No prompt recorded]'
WHERE user_prompt IS NULL;

-- Step 7: Backfill user_id from project's workspace owner
UPDATE builds b
SET user_id = (
  SELECT uw.user_id
  FROM projects p
  JOIN user_workspaces uw ON uw.workspace_id = p.workspace_id
  WHERE p.id = b.project_id
  AND uw.role = 'owner'
  LIMIT 1
)
WHERE b.user_id IS NULL;

-- Step 8: Add NOT NULL constraints now that all rows have values
ALTER TABLE builds ALTER COLUMN user_prompt SET NOT NULL;
ALTER TABLE builds ALTER COLUMN user_id SET NOT NULL;

-- Step 9: Make ai_logs.project_id nullable (for pre-project AI calls like prompt analysis)
ALTER TABLE ai_logs ALTER COLUMN project_id DROP NOT NULL;

-- Step 10: Drop the prompts table (no longer needed)
DROP TABLE IF EXISTS prompts;
