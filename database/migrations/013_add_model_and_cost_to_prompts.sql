-- Add model name and cost tracking to prompts table
-- This will track which AI model was used and the calculated cost for each request

-- Add model column to store the model ID used (e.g., claude-sonnet-4-5-20250929)
ALTER TABLE prompts ADD COLUMN model VARCHAR(100);

-- Add cost column to store the calculated cost in USD
-- Using DECIMAL(10, 6) to store costs with precision (e.g., $0.001234)
ALTER TABLE prompts ADD COLUMN cost_usd DECIMAL(10, 6);

-- Add comments to explain the columns
COMMENT ON COLUMN prompts.model IS 'AI model ID used for this prompt (e.g., claude-sonnet-4-5-20250929, claude-haiku-4-5-20251001)';
COMMENT ON COLUMN prompts.cost_usd IS 'Calculated cost in USD based on input/output tokens and model pricing';

-- Add index for cost analysis queries
CREATE INDEX idx_prompts_model ON prompts(model);
CREATE INDEX idx_prompts_cost_usd ON prompts(cost_usd);
