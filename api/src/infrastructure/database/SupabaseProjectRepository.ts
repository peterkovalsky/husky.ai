import { SupabaseClient } from '@supabase/supabase-js';
import { IProjectRepository } from '../../domain/repositories/IProjectRepository';
import { Project, CreateProjectRequest } from '../../domain/entities/Project';
import { SupabaseClientFactory } from '../../shared/database/SupabaseClientFactory';

export class SupabaseProjectRepository implements IProjectRepository {
  private supabase: SupabaseClient;

  constructor() {
    this.supabase = SupabaseClientFactory.getClient();
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
      .eq('workspace_id', workspaceId)
      .neq('status', 'DELETING');

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

  async updateCurrentVersion(projectId: string, version: number): Promise<void> {
    const { error } = await this.supabase
      .from('projects')
      .update({ current_version: version })
      .eq('id', projectId);

    if (error) throw error;
  }

  async findByIdForOperations(id: string): Promise<Project | null> {
    const { data, error } = await this.supabase
      .from('projects')
      .select('*')
      .eq('id', id)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    
    return data ? this.mapToEntity(data) : null;
  }

  async updateStatus(projectId: string, status: string): Promise<void> {
    const { error } = await this.supabase
      .from('projects')
      .update({ status })
      .eq('id', projectId);

    if (error) throw error;
  }

  async deleteById(projectId: string): Promise<void> {
    const { error } = await this.supabase
      .from('projects')
      .delete()
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
      status: data.status || 'ACTIVE',
      currentVersion: data.current_version || 0,
      createdAt: new Date(data.created_at),
      modifiedAt: new Date(data.modified_at)
    };
  }
}