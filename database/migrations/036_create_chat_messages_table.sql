-- Migration: Create chat_messages table for comprehensive conversation history
-- This table stores ALL conversation data: prompts, AI questions, user answers, inspo selections, etc.

-- Use VARCHAR for type and source (not ENUM) for extensibility
-- Known types: USER_PROMPT, AI_QUESTION, USER_ANSWER, INSPO_SELECTION, SYSTEM_STATUS, SYSTEM_ERROR, BUILD_RESULT
-- Future types can be added without database migration

-- Main chat messages table
CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Core references
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  build_id UUID REFERENCES builds(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Message content (VARCHAR for extensibility - no ALTER TYPE needed for new types)
  type VARCHAR(50) NOT NULL,
  source VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
  content TEXT NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),

  -- Sequencing
  conversation_round INTEGER NOT NULL DEFAULT 1,
  message_order INTEGER NOT NULL,

  -- Media references
  media_ids UUID[],
  inspo_id UUID REFERENCES inspo(id) ON DELETE SET NULL,

  -- Q&A tracking
  question_id VARCHAR(255),
  parent_message_id UUID REFERENCES chat_messages(id),
  is_skipped BOOLEAN DEFAULT FALSE,
  answer_option_id VARCHAR(255),
  answer_option_label VARCHAR(500),
  answer_free_text TEXT,

  -- Status
  status VARCHAR(50) DEFAULT 'completed',

  -- Flexible metadata (thumbnails, etc.)
  metadata JSONB,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  modified_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add comments
COMMENT ON TABLE chat_messages IS 'Stores all conversation messages: prompts, AI questions, user answers, inspo selections, system messages';
COMMENT ON COLUMN chat_messages.type IS 'Message type: USER_PROMPT, AI_QUESTION, USER_ANSWER, INSPO_SELECTION, SYSTEM_STATUS, SYSTEM_ERROR, BUILD_RESULT';
COMMENT ON COLUMN chat_messages.source IS 'Message source: ONBOARDING, ITERATION, SYSTEM';
COMMENT ON COLUMN chat_messages.conversation_round IS 'Build iteration number (1 for first build, 2 for second, etc.)';
COMMENT ON COLUMN chat_messages.message_order IS 'Order within the conversation round';
COMMENT ON COLUMN chat_messages.metadata IS 'Flexible JSON data: inspoThumbnail, inspoName, etc.';

-- Indexes for performance
CREATE INDEX idx_chat_messages_project ON chat_messages(project_id);
CREATE INDEX idx_chat_messages_project_order ON chat_messages(project_id, conversation_round, message_order);
CREATE INDEX idx_chat_messages_build ON chat_messages(build_id);
CREATE INDEX idx_chat_messages_user ON chat_messages(user_id);
CREATE INDEX idx_chat_messages_parent ON chat_messages(parent_message_id);

-- RLS
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view messages in their projects" ON chat_messages
  FOR SELECT TO authenticated
  USING (
    project_id IN (
      SELECT p.id FROM projects p
      JOIN user_workspaces uw ON p.workspace_id = uw.workspace_id
      WHERE uw.user_id = auth.uid()
    )
  );

CREATE POLICY "Users insert messages" ON chat_messages
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users update their messages" ON chat_messages
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

-- BACKFILL: Create USER_PROMPT messages for existing builds
-- This ensures existing projects have their prompt history preserved
INSERT INTO chat_messages (
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
  b.project_id,
  b.id AS build_id,
  b.user_id,
  'USER_PROMPT',
  CASE WHEN b.version = 1 THEN 'ONBOARDING' ELSE 'ITERATION' END,
  b.user_prompt,
  'user',
  b.version,
  0,
  b.media_ids,
  b.inspo_id,
  'completed',
  b.created_at,
  b.created_at
FROM builds b
WHERE b.user_prompt IS NOT NULL
  AND b.status IN ('READY', 'FAILED', 'BUILDING', 'PROCESSING', 'QUEUED');
