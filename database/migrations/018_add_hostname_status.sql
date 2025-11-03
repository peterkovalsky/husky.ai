-- Migration: Add hostname provisioning status tracking
-- This enables pre-provisioning SSL/custom hostnames at project creation
-- Status flow: NONE -> PROVISIONING -> READY (or FAILED)

-- Create enum type for hostname provisioning status
CREATE TYPE hostname_status AS ENUM ('NONE', 'PROVISIONING', 'READY', 'FAILED');

-- Add hostname status fields to projects table
ALTER TABLE projects
  ADD COLUMN hostname_status hostname_status DEFAULT 'NONE' NOT NULL,
  ADD COLUMN hostname_error TEXT;

-- Add index for efficient status filtering
CREATE INDEX idx_projects_hostname_status
  ON projects(hostname_status);

-- Update existing projects with NONE status (default already set by column definition)
-- No additional UPDATE needed since DEFAULT 'NONE' is applied

COMMENT ON COLUMN projects.hostname_status IS 'Status of Cloudflare custom hostname provisioning (NONE, PROVISIONING, READY, FAILED)';
COMMENT ON COLUMN projects.hostname_error IS 'Error message if hostname provisioning failed';
