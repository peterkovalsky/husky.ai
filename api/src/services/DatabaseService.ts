import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface Workspace {
  id: string;
  name: string;
  created_at: string;
  modified_at: string;
}

export interface Project {
  id: string;
  name: string;
  workspace_id: string;
  created_at: string;
  modified_at: string;
}

export interface Prompt {
  id: string;
  prompt: string;
  status: 'QUEUED' | 'PROCESSING' | 'BUILDING' | 'READY' | 'FAILED';
  project_id: string;
  user_id: string;
  created_at: string;
  modified_at: string;
}

export interface BuildMetrics {
  ai_generation_time_ms?: number;
  dependency_install_time_ms?: number;
  build_time_ms?: number;
  s3_upload_time_ms?: number;
  total_time_ms?: number;
}

export interface Build {
  id: string;
  file_tree: any;
  project_id: string;
  version: number;
  metrics: BuildMetrics;
  created_at: string;
  modified_at: string;
}

export interface Preview {
  id: string;
  preview_url: string;
  project_id: string;
  prompt_id?: string;
  created_at: string;
  modified_at: string;
}

export class DatabaseService {
  private supabase: SupabaseClient;

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    console.log('DatabaseService init - URL present:', !!supabaseUrl, 'Key present:', !!supabaseServiceKey);

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Missing Supabase environment variables');
      throw new Error('Missing Supabase configuration');
    }

    this.supabase = createClient(supabaseUrl, supabaseServiceKey);
    console.log('DatabaseService initialized successfully');
  }

  // Workspace operations
  async createWorkspace(name: string): Promise<Workspace> {
    const { data, error } = await this.supabase
      .from('workspaces')
      .insert({ name })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async getWorkspacesByUserId(userId: string): Promise<Workspace[]> {
    // First get workspace IDs for the user
    const { data: userWorkspaces, error: uwError } = await this.supabase
      .from('user_workspaces')
      .select('workspace_id')
      .eq('user_id', userId);

    if (uwError) throw uwError;

    if (!userWorkspaces || userWorkspaces.length === 0) {
      return [];
    }

    // Then get the workspace details
    const workspaceIds = userWorkspaces.map(uw => uw.workspace_id);
    const { data, error } = await this.supabase
      .from('workspaces')
      .select('*')
      .in('id', workspaceIds);

    if (error) throw error;
    return data || [];
  }

  // User-Workspace relationship operations
  async addUserToWorkspace(userId: string, workspaceId: string): Promise<void> {
    const { error } = await this.supabase
      .from('user_workspaces')
      .insert({ user_id: userId, workspace_id: workspaceId });

    if (error) throw error;
  }

  async checkUserWorkspaceAccess(userId: string, workspaceId: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from('user_workspaces')
      .select('id')
      .eq('user_id', userId)
      .eq('workspace_id', workspaceId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return !!data;
  }

  // Project operations
  async createProject(name: string, workspaceId: string): Promise<Project> {
    const { data, error } = await this.supabase
      .from('projects')
      .insert({ name, workspace_id: workspaceId })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async getProjectsByWorkspaceId(workspaceId: string): Promise<Project[]> {
    const { data, error } = await this.supabase
      .from('projects')
      .select('*')
      .eq('workspace_id', workspaceId);

    if (error) throw error;
    return data || [];
  }

  async getProjectById(projectId: string): Promise<Project | null> {
    const { data, error } = await this.supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data || null;
  }

  async checkUserProjectAccess(userId: string, projectId: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from('projects')
      .select('workspace_id')
      .eq('id', projectId)
      .single();

    if (error) return false;

    return await this.checkUserWorkspaceAccess(userId, data.workspace_id);
  }

  // Prompt operations
  async createPrompt(prompt: string, projectId: string, userId: string): Promise<Prompt> {
    const { data, error } = await this.supabase
      .from('prompts')
      .insert({
        prompt,
        project_id: projectId,
        user_id: userId,
        status: 'QUEUED'
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async getPromptById(promptId: string): Promise<Prompt | null> {
    const { data, error } = await this.supabase
      .from('prompts')
      .select('*')
      .eq('id', promptId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data || null;
  }

  async updatePromptStatus(promptId: string, status: Prompt['status']): Promise<void> {
    const { error } = await this.supabase
      .from('prompts')
      .update({ status })
      .eq('id', promptId);

    if (error) throw error;
  }

  async getPromptsByProjectId(projectId: string): Promise<Prompt[]> {
    const { data, error } = await this.supabase
      .from('prompts')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data || [];
  }

  // Build operations (formerly file tree operations)
  async saveBuild(fileTree: any, projectId: string, metrics: BuildMetrics = {}): Promise<Build> {
    // Get the next version number for this project
    const nextVersion = await this.getNextVersionForProject(projectId);
    
    const { data, error } = await this.supabase
      .from('builds')
      .insert({
        file_tree: fileTree,
        project_id: projectId,
        version: nextVersion,
        metrics
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async updateBuildMetrics(buildId: string, metrics: BuildMetrics): Promise<void> {
    const { error } = await this.supabase
      .from('builds')
      .update({ metrics })
      .eq('id', buildId);

    if (error) throw error;
  }

  async getNextVersionForProject(projectId: string): Promise<number> {
    const { data, error } = await this.supabase
      .from('builds')
      .select('version')
      .eq('project_id', projectId)
      .order('version', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data ? data.version + 1 : 1;
  }

  async getLatestBuildByProjectId(projectId: string): Promise<Build | null> {
    const { data, error } = await this.supabase
      .from('builds')
      .select('*')
      .eq('project_id', projectId)
      .order('version', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data || null;
  }

  async getBuildByProjectAndVersion(projectId: string, version: number): Promise<Build | null> {
    const { data, error } = await this.supabase
      .from('builds')
      .select('*')
      .eq('project_id', projectId)
      .eq('version', version)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data || null;
  }

  async getBuildsByProjectId(projectId: string): Promise<Build[]> {
    const { data, error } = await this.supabase
      .from('builds')
      .select('*')
      .eq('project_id', projectId)
      .order('version', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  // Legacy methods for backward compatibility
  async saveFileTree(fileTree: any, projectId: string): Promise<Build> {
    return this.saveBuild(fileTree, projectId);
  }

  async getLatestFileTreeByProjectId(projectId: string): Promise<Build | null> {
    return this.getLatestBuildByProjectId(projectId);
  }

  async getFileTreeByProjectAndVersion(projectId: string, version: number): Promise<Build | null> {
    return this.getBuildByProjectAndVersion(projectId, version);
  }

  // Preview operations
  async createPreview(previewUrl: string, projectId: string, promptId?: string): Promise<Preview> {
    const { data, error } = await this.supabase
      .from('previews')
      .insert({
        preview_url: previewUrl,
        project_id: projectId,
        prompt_id: promptId
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async getPreviewsByProjectId(projectId: string): Promise<Preview[]> {
    const { data, error } = await this.supabase
      .from('previews')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  async getPreviewByPromptId(promptId: string): Promise<Preview | null> {
    const { data, error } = await this.supabase
      .from('previews')
      .select('*')
      .eq('prompt_id', promptId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data || null;
  }

  // Setup operations for new users
  async setupDefaultUserData(userId: string, displayName?: string): Promise<{ workspace: Workspace; project: Project }> {
    try {
      console.log(`Setting up default user data for user: ${userId}`);
      
      // Create default workspace
      console.log('Creating workspace...');
      const workspace = await this.createWorkspace('Personal');
      console.log(`Workspace created: ${workspace.id}`);
      
      // Add user to workspace
      console.log('Adding user to workspace...');
      await this.addUserToWorkspace(userId, workspace.id);
      console.log('User added to workspace');
      
      // Create default project
      console.log('Creating default project...');
      const project = await this.createProject('My Project', workspace.id);
      console.log(`Project created: ${project.id}`);
      
      return { workspace, project };
    } catch (error) {
      console.error('Error setting up default user data:', error);
      throw error;
    }
  }
}