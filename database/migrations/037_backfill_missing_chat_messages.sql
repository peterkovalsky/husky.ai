-- Migration: Backfill missing USER_PROMPT messages in chat_messages table
-- This script is RE-RUNNABLE (idempotent) - safe to run multiple times
--
-- Purpose: Ensure every build has a corresponding USER_PROMPT in chat_messages
-- so that ChatWidget can display complete conversation history.

-- Backfill builds that don't have a USER_PROMPT message in chat_messages
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
    WHEN b.status = 'READY' THEN 'completed'
    WHEN b.status = 'FAILED' THEN 'failed'
    ELSE 'processing'
  END as status,
  b.created_at,
  b.created_at as modified_at
FROM builds b
WHERE
  -- Only include builds with a user prompt
  b.user_prompt IS NOT NULL
  AND b.user_prompt != ''
  -- Exclude builds that already have a USER_PROMPT message
  AND NOT EXISTS (
    SELECT 1
    FROM chat_messages cm
    WHERE cm.build_id = b.id
    AND cm.type = 'USER_PROMPT'
  );

-- Log how many records were inserted
DO $$
DECLARE
  inserted_count INTEGER;
BEGIN
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RAISE NOTICE 'Backfilled % missing USER_PROMPT messages', inserted_count;
END $$;
