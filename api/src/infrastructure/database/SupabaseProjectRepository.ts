import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { IProjectRepository } from '../../domain/repositories/IProjectRepository';
import { Project, CreateProjectRequest } from '../../domain/entities/Project';

export class SupabaseProjectRepository implements IProjectRepository {
  private supabase: SupabaseClient;

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase configuration');
    }

    this.supabase = createClient(supabaseUrl, supabaseServiceKey);
  }

  async create(request: CreateProjectRequest): Promise<Project> {
    const insertData = {
      name: request.name,
      description: request.description,
      workspace_id: request.workspaceId
    };

    const { data, error } = await this.supabase
      .from('projects')
      .insert(insertData)
      .select()
      .single();

    if (error) throw error;
    
    return this.mapToEntity(data);
  }

  async findById(id: string): Promise<Project | null> {
    const { data, error } = await this.supabase
      .from('projects')
      .select('*')
      .eq('id', id)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    
    return data ? this.mapToEntity(data) : null;
  }

  async findByWorkspaceId(workspaceId: string): Promise<Project[]> {
    const { data, error } = await this.supabase
      .from('projects')
      .select('*')
      .eq('workspace_id', workspaceId);

    if (error) throw error;
    
    return (data || []).map(this.mapToEntity);
  }

  async checkUserAccess(userId: string, projectId: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from('projects')
      .select('workspace_id')
      .eq('id', projectId)
      .single();

    if (error) return false;

    // Check if user has access to the workspace
    const { data: userWorkspace, error: uwError } = await this.supabase
      .from('user_workspaces')
      .select('id')
      .eq('user_id', userId)
      .eq('workspace_id', data.workspace_id)
      .single();

    if (uwError && uwError.code !== 'PGRST116') return false;
    return !!userWorkspace;
  }

  async updatePreviewUrl(projectId: string, previewUrl: string): Promise<void> {
    const { error } = await this.supabase
      .from('projects')
      .update({ preview_url: previewUrl })
      .eq('id', projectId);

    if (error) throw error;
  }

  private mapToEntity(data: any): Project {
    return {
      id: data.id,
      name: data.name,
      description: data.description,
      previewUrl: data.preview_url,
      workspaceId: data.workspace_id,
      createdAt: new Date(data.created_at),
      modifiedAt: new Date(data.modified_at)
    };
  }
}