-- Add inspo_id column to builds table to reference inspiration used
ALTER TABLE builds
ADD COLUMN inspo_id UUID REFERENCES inspo(id) ON DELETE SET NULL;

-- Add comment for documentation
COMMENT ON COLUMN builds.inspo_id IS 'Reference to inspiration image used for this build (optional)';

-- Create index for efficient lookups
CREATE INDEX idx_builds_inspo_id ON builds(inspo_id);
