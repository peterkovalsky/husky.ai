-- Create ai_logs table to track all AI service executions
-- This provides a comprehensive audit trail of all AI calls including tokens, cost, and full prompts/responses

CREATE TABLE ai_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider VARCHAR(50) NOT NULL,
    model VARCHAR(100) NOT NULL,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    cost_usd DECIMAL(10, 6) NOT NULL DEFAULT 0,
    duration_ms INTEGER NOT NULL DEFAULT 0,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    build_id UUID REFERENCES builds(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    prompt TEXT NOT NULL,
    system_prompt TEXT NOT NULL,
    ai_response TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    modified_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add comments to explain the columns
COMMENT ON TABLE ai_logs IS 'Comprehensive audit log of all AI service executions including prompts, responses, and costs';
COMMENT ON COLUMN ai_logs.provider IS 'AI provider name (e.g., anthropic, openai)';
COMMENT ON COLUMN ai_logs.model IS 'Specific model used (e.g., claude-sonnet-4-5-20250929, gpt-5.1)';
COMMENT ON COLUMN ai_logs.input_tokens IS 'Number of input/prompt tokens consumed';
COMMENT ON COLUMN ai_logs.output_tokens IS 'Number of output/completion tokens generated';
COMMENT ON COLUMN ai_logs.cost_usd IS 'Calculated cost in USD based on provider pricing';
COMMENT ON COLUMN ai_logs.duration_ms IS 'Total execution time in milliseconds';
COMMENT ON COLUMN ai_logs.project_id IS 'Associated project ID';
COMMENT ON COLUMN ai_logs.build_id IS 'Associated build ID (null for non-build AI calls)';
COMMENT ON COLUMN ai_logs.user_id IS 'User who initiated the AI request';
COMMENT ON COLUMN ai_logs.prompt IS 'User prompt sent to AI';
COMMENT ON COLUMN ai_logs.system_prompt IS 'System prompt/instructions sent to AI';
COMMENT ON COLUMN ai_logs.ai_response IS 'Full AI response text';

-- Add indexes for common query patterns
CREATE INDEX idx_ai_logs_project_id ON ai_logs(project_id);
CREATE INDEX idx_ai_logs_build_id ON ai_logs(build_id);
CREATE INDEX idx_ai_logs_user_id ON ai_logs(user_id);
CREATE INDEX idx_ai_logs_created_at ON ai_logs(created_at DESC);
CREATE INDEX idx_ai_logs_provider ON ai_logs(provider);
CREATE INDEX idx_ai_logs_model ON ai_logs(model);

-- Add trigger to automatically update modified_at
CREATE TRIGGER update_ai_logs_modified_at
    BEFORE UPDATE ON ai_logs
    FOR EACH ROW
    EXECUTE FUNCTION update_modified_at();
