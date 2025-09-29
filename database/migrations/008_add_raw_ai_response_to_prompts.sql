-- Add raw_ai_response column to prompts table
-- This will store the complete unprocessed response from the AI service

-- Add the raw_ai_response column
ALTER TABLE prompts ADD COLUMN raw_ai_response TEXT;

-- Add index for potential full-text search capabilities on AI responses
CREATE INDEX idx_prompts_raw_ai_response ON prompts USING GIN (to_tsvector('english', raw_ai_response));

-- Add comment to explain the column purpose
COMMENT ON COLUMN prompts.raw_ai_response IS 'Complete unprocessed response from AI service before parsing into file structure';