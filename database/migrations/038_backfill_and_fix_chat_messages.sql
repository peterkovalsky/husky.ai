-- Migration: Backfill missing USER_PROMPT messages and fix status values
-- This script is RE-RUNNABLE (idempotent) - safe to run multiple times
--
-- Purpose:
-- 1. Ensure every build has a corresponding USER_PROMPT in chat_messages
-- 2. Fix status values to match actual build status (completed/failed/processing)

-- Step 1: Backfill builds that don't have a USER_PROMPT message in chat_messages
INSERT INTO chat_messages (
  id,
  project_id,
  build_id,
  user_id,
  type,
  source,
  content,
  role,
  conversation_round,
  message_order,
  media_ids,
  inspo_id,
  status,
  created_at,
  modified_at
)
SELECT
  gen_random_uuid() as id,
  b.project_id,
  b.id as build_id,
  b.user_id,
  'USER_PROMPT' as type,
  CASE
    WHEN b.version <= 1 THEN 'ONBOARDING'
    ELSE 'ITERATION'
  END as source,
  b.user_prompt as content,
  'user' as role,
  b.version as conversation_round,
  0 as message_order,
  b.media_ids,
  b.inspo_id,
  CASE
    WHEN b.status = 'COMPLETED' THEN 'completed'
    WHEN b.status = 'FAILED' THEN 'failed'
    ELSE 'processing'
  END as status,
  b.created_at,
  b.created_at as modified_at
FROM builds b
WHERE
  b.user_prompt IS NOT NULL
  AND b.user_prompt != ''
  AND NOT EXISTS (
    SELECT 1
    FROM chat_messages cm
    WHERE cm.build_id = b.id
    AND cm.type = 'USER_PROMPT'
  );

-- Step 2: Fix status values for existing chat_messages that don't match build status
UPDATE chat_messages cm
SET
  status = CASE
    WHEN b.status = 'COMPLETED' THEN 'completed'
    WHEN b.status = 'FAILED' THEN 'failed'
    ELSE 'processing'
  END,
  modified_at = NOW()
FROM builds b
WHERE cm.build_id = b.id
AND cm.type = 'USER_PROMPT'
AND (
  (b.status = 'COMPLETED' AND cm.status != 'completed')
  OR
  (b.status = 'FAILED' AND cm.status != 'failed')
  OR
  (b.status NOT IN ('COMPLETED', 'FAILED') AND cm.status NOT IN ('processing'))
);
