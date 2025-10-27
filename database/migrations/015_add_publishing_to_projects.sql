-- Add publishing-related columns to projects table
-- This enables website publishing functionality with CloudFront and Route53

-- Add subdomain column with unique constraint
ALTER TABLE projects ADD COLUMN subdomain VARCHAR(255) UNIQUE;

-- Add published_status column with enum type
DO $$ BEGIN
  CREATE TYPE publishing_status AS ENUM ('UNPUBLISHED', 'PUBLISHING', 'PUBLISHED', 'FAILED', 'UNPUBLISHING');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE projects ADD COLUMN published_status publishing_status DEFAULT 'UNPUBLISHED' NOT NULL;

-- Add published_at timestamp
ALTER TABLE projects ADD COLUMN published_at TIMESTAMP WITH TIME ZONE;

-- Add CloudFront-related fields
ALTER TABLE projects ADD COLUMN cloudfront_distribution_id VARCHAR(255);
ALTER TABLE projects ADD COLUMN cloudfront_domain VARCHAR(255);

-- Add publishing error field for debugging
ALTER TABLE projects ADD COLUMN publishing_error TEXT;

-- Add comments
COMMENT ON COLUMN projects.subdomain IS 'Unique subdomain for published site (e.g., happy-cloud-42)';
COMMENT ON COLUMN projects.published_status IS 'Current publishing status of the project';
COMMENT ON COLUMN projects.published_at IS 'Timestamp when the project was last published';
COMMENT ON COLUMN projects.cloudfront_distribution_id IS 'AWS CloudFront distribution ID for the published site';
COMMENT ON COLUMN projects.cloudfront_domain IS 'CloudFront domain name (*.cloudfront.net)';
COMMENT ON COLUMN projects.publishing_error IS 'Error message from last failed publish attempt';

-- Create index on subdomain for faster lookups
CREATE INDEX idx_projects_subdomain ON projects(subdomain) WHERE subdomain IS NOT NULL;

-- Create index on published_status for filtering
CREATE INDEX idx_projects_published_status ON projects(published_status);
