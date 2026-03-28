-- Add template column to projects table
-- Supports multiple project templates (React SPA, Astro static site, etc.)
ALTER TABLE projects ADD COLUMN template TEXT NOT NULL DEFAULT 'react18-ts';
