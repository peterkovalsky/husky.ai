-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Workspaces table
CREATE TABLE workspaces (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    modified_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User-Workspace relationship (each user belongs to workspaces)
CREATE TABLE user_workspaces (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, workspace_id)
);

-- Projects table
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    modified_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Prompts table (replaces current in-memory job storage)
CREATE TABLE prompts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    prompt TEXT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'QUEUED', -- QUEUED, PROCESSING, BUILDING, READY, FAILED
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    modified_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- File trees table
CREATE TABLE file_trees (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    file_tree JSONB NOT NULL,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    modified_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Previews table
CREATE TABLE previews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    preview_url TEXT NOT NULL,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    prompt_id UUID REFERENCES prompts(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    modified_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX idx_user_workspaces_user_id ON user_workspaces(user_id);
CREATE INDEX idx_user_workspaces_workspace_id ON user_workspaces(workspace_id);
CREATE INDEX idx_projects_workspace_id ON projects(workspace_id);
CREATE INDEX idx_prompts_project_id ON prompts(project_id);
CREATE INDEX idx_prompts_user_id ON prompts(user_id);
CREATE INDEX idx_prompts_status ON prompts(status);
CREATE INDEX idx_file_trees_project_id ON file_trees(project_id);
CREATE INDEX idx_previews_project_id ON previews(project_id);
CREATE INDEX idx_previews_prompt_id ON previews(prompt_id);

-- Enable Row Level Security
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE file_trees ENABLE ROW LEVEL SECURITY;
ALTER TABLE previews ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Users can only see workspaces they belong to
CREATE POLICY "Users can view their workspaces" ON workspaces
    FOR SELECT USING (
        id IN (
            SELECT workspace_id FROM user_workspaces 
            WHERE user_id = auth.uid()
        )
    );

-- Users can only see their workspace relationships
CREATE POLICY "Users can view their workspace memberships" ON user_workspaces
    FOR SELECT USING (user_id = auth.uid());

-- Users can only see projects in their workspaces
CREATE POLICY "Users can view projects in their workspaces" ON projects
    FOR SELECT USING (
        workspace_id IN (
            SELECT workspace_id FROM user_workspaces 
            WHERE user_id = auth.uid()
        )
    );

-- Users can only see prompts in their projects
CREATE POLICY "Users can view prompts in their projects" ON prompts
    FOR SELECT USING (
        project_id IN (
            SELECT p.id FROM projects p
            JOIN user_workspaces uw ON p.workspace_id = uw.workspace_id
            WHERE uw.user_id = auth.uid()
        )
    );

-- Users can only see file trees in their projects
CREATE POLICY "Users can view file trees in their projects" ON file_trees
    FOR SELECT USING (
        project_id IN (
            SELECT p.id FROM projects p
            JOIN user_workspaces uw ON p.workspace_id = uw.workspace_id
            WHERE uw.user_id = auth.uid()
        )
    );

-- Users can only see previews in their projects
CREATE POLICY "Users can view previews in their projects" ON previews
    FOR SELECT USING (
        project_id IN (
            SELECT p.id FROM projects p
            JOIN user_workspaces uw ON p.workspace_id = uw.workspace_id
            WHERE uw.user_id = auth.uid()
        )
    );

-- Insert/Update/Delete policies (users can modify data in their workspaces)
CREATE POLICY "Users can insert into their workspaces" ON workspaces
    FOR INSERT WITH CHECK (
        id IN (
            SELECT workspace_id FROM user_workspaces 
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert workspace memberships" ON user_workspaces
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can insert projects in their workspaces" ON projects
    FOR INSERT WITH CHECK (
        workspace_id IN (
            SELECT workspace_id FROM user_workspaces 
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert prompts in their projects" ON prompts
    FOR INSERT WITH CHECK (
        user_id = auth.uid() AND
        project_id IN (
            SELECT p.id FROM projects p
            JOIN user_workspaces uw ON p.workspace_id = uw.workspace_id
            WHERE uw.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert file trees in their projects" ON file_trees
    FOR INSERT WITH CHECK (
        project_id IN (
            SELECT p.id FROM projects p
            JOIN user_workspaces uw ON p.workspace_id = uw.workspace_id
            WHERE uw.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert previews in their projects" ON previews
    FOR INSERT WITH CHECK (
        project_id IN (
            SELECT p.id FROM projects p
            JOIN user_workspaces uw ON p.workspace_id = uw.workspace_id
            WHERE uw.user_id = auth.uid()
        )
    );

-- Update policies
CREATE POLICY "Users can update prompts in their projects" ON prompts
    FOR UPDATE USING (
        project_id IN (
            SELECT p.id FROM projects p
            JOIN user_workspaces uw ON p.workspace_id = uw.workspace_id
            WHERE uw.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update projects in their workspaces" ON projects
    FOR UPDATE USING (
        workspace_id IN (
            SELECT workspace_id FROM user_workspaces 
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update their workspaces" ON workspaces
    FOR UPDATE USING (
        id IN (
            SELECT workspace_id FROM user_workspaces 
            WHERE user_id = auth.uid()
        )
    );

-- Function to automatically update modified_at timestamp
CREATE OR REPLACE FUNCTION update_modified_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.modified_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for modified_at updates
CREATE TRIGGER update_workspaces_modified_at
    BEFORE UPDATE ON workspaces
    FOR EACH ROW
    EXECUTE FUNCTION update_modified_at();

CREATE TRIGGER update_projects_modified_at
    BEFORE UPDATE ON projects
    FOR EACH ROW
    EXECUTE FUNCTION update_modified_at();

CREATE TRIGGER update_prompts_modified_at
    BEFORE UPDATE ON prompts
    FOR EACH ROW
    EXECUTE FUNCTION update_modified_at();

CREATE TRIGGER update_file_trees_modified_at
    BEFORE UPDATE ON file_trees
    FOR EACH ROW
    EXECUTE FUNCTION update_modified_at();

CREATE TRIGGER update_previews_modified_at
    BEFORE UPDATE ON previews
    FOR EACH ROW
    EXECUTE FUNCTION update_modified_at();