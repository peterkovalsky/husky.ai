-- Add custom domain support to projects table
-- This enables users to publish their sites to their own custom domains

-- Add custom domain field
ALTER TABLE projects ADD COLUMN custom_domain VARCHAR(255);

-- Add Cloudflare custom hostname ID for the custom domain
ALTER TABLE projects ADD COLUMN custom_domain_cloudflare_id VARCHAR(255);

-- Add custom domain status
ALTER TABLE projects ADD COLUMN custom_domain_status VARCHAR(50) DEFAULT 'NONE';

-- Add custom domain error message
ALTER TABLE projects ADD COLUMN custom_domain_error TEXT;

-- Add custom domain verified timestamp
ALTER TABLE projects ADD COLUMN custom_domain_verified_at TIMESTAMP WITH TIME ZONE;

-- Add comments
COMMENT ON COLUMN projects.custom_domain IS 'User''s custom domain (e.g., www.example.com)';
COMMENT ON COLUMN projects.custom_domain_cloudflare_id IS 'Cloudflare custom hostname ID for the custom domain';
COMMENT ON COLUMN projects.custom_domain_status IS 'Status of custom domain: NONE, PENDING_DNS, PENDING_SSL, ACTIVE, FAILED';
COMMENT ON COLUMN projects.custom_domain_error IS 'Error message if custom domain setup failed';
COMMENT ON COLUMN projects.custom_domain_verified_at IS 'Timestamp when custom domain DNS was last verified';

-- Create index on custom_domain for faster lookups and uniqueness checks
CREATE INDEX idx_projects_custom_domain ON projects(custom_domain) WHERE custom_domain IS NOT NULL;

-- Create index on custom_domain_cloudflare_id
CREATE INDEX idx_projects_custom_domain_cloudflare_id ON projects(custom_domain_cloudflare_id) WHERE custom_domain_cloudflare_id IS NOT NULL;
