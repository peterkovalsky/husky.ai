import { SupabaseClient } from '@supabase/supabase-js';
import { IWorkspaceRepository } from '../../domain/repositories/IWorkspaceRepository';
import { Workspace, CreateWorkspaceRequest } from '../../domain/entities/Workspace';
import { SupabaseClientFactory } from '../../shared/database/SupabaseClientFactory';

export class SupabaseWorkspaceRepository implements IWorkspaceRepository {
  private supabase: SupabaseClient;

  constructor() {
    this.supabase = SupabaseClientFactory.getClient();
  }

  async create(request: CreateWorkspaceRequest): Promise<Workspace> {
    const { data, error } = await this.supabase
      .from('workspaces')
      .insert({ name: request.name })
      .select()
      .single();

    if (error) throw error;
    
    return this.mapToEntity(data);
  }

  async findByUserId(userId: string): Promise<Workspace[]> {
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
    
    return (data || []).map(this.mapToEntity);
  }

  async findById(id: string): Promise<Workspace | null> {
    const { data, error } = await this.supabase
      .from('workspaces')
      .select('*')
      .eq('id', id)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    
    return data ? this.mapToEntity(data) : null;
  }

  async checkUserAccess(userId: string, workspaceId: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from('user_workspaces')
      .select('id')
      .eq('user_id', userId)
      .eq('workspace_id', workspaceId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return !!data;
  }

  async addUserToWorkspace(userId: string, workspaceId: string): Promise<void> {
    const { error } = await this.supabase
      .from('user_workspaces')
      .insert({ user_id: userId, workspace_id: workspaceId });

    if (error) throw error;
  }

  private mapToEntity(data: any): Workspace {
    return {
      id: data.id,
      name: data.name,
      createdAt: new Date(data.created_at),
      modifiedAt: new Date(data.modified_at)
    };
  }
}