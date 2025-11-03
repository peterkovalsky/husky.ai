-- Add Cloudflare-related columns to projects table
-- This enables website publishing functionality with Cloudflare for SaaS and R2

-- Add Cloudflare custom hostname ID
ALTER TABLE projects ADD COLUMN cloudflare_hostname_id VARCHAR(255);

-- Add Cloudflare custom hostname status
ALTER TABLE projects ADD COLUMN cloudflare_hostname_status VARCHAR(50);

-- Add comments
COMMENT ON COLUMN projects.cloudflare_hostname_id IS 'Cloudflare custom hostname ID for the published site';
COMMENT ON COLUMN projects.cloudflare_hostname_status IS 'Status of Cloudflare custom hostname SSL certificate (pending, active, etc.)';

-- Create index on cloudflare_hostname_id for faster lookups
CREATE INDEX idx_projects_cloudflare_hostname ON projects(cloudflare_hostname_id) WHERE cloudflare_hostname_id IS NOT NULL;
