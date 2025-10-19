import { SupabaseClient } from '@supabase/supabase-js';
import { IBuildRepository } from '../../domain/repositories/IBuildRepository';
import { Build, CreateBuildRequest, BuildMetrics, BuildStatus } from '../../domain/entities/Build';
import { SupabaseClientFactory } from '../../shared/database/SupabaseClientFactory';

export class SupabaseBuildRepository implements IBuildRepository {
  private supabase: SupabaseClient;

  constructor() {
    this.supabase = SupabaseClientFactory.getClient();
  }

  async create(request: CreateBuildRequest): Promise<Build> {
    // Initially set version to 0, will be updated when build reaches READY status
    console.log(`[SupabaseBuildRepository] Creating build with mediaIds:`, request.mediaIds);
    const { data, error } = await this.supabase
      .from('builds')
      .insert({
        file_tree: request.fileTree,
        project_id: request.projectId,
        version: 0,
        status: request.status || 'QUEUED',
        metrics: request.metrics || {},
        input_tokens: request.inputTokens,
        output_tokens: request.outputTokens,
        media_ids: request.mediaIds || []
      })
      .select()
      .single();

    if (error) {
      console.error(`[SupabaseBuildRepository] Error creating build:`, error);
      throw error;
    }

    console.log(`[SupabaseBuildRepository] Build created successfully, returned data.media_ids:`, data.media_ids);
    return this.mapToEntity(data);
  }

  async findById(id: string): Promise<Build | null> {
    const { data, error } = await this.supabase
      .from('builds')
      .select('*')
      .eq('id', id)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    
    return data ? this.mapToEntity(data) : null;
  }

  async findByProjectId(projectId: string): Promise<Build[]> {
    const { data, error } = await this.supabase
      .from('builds')
      .select('*')
      .eq('project_id', projectId)
      .order('version', { ascending: false });

    if (error) throw error;
    
    return (data || []).map(this.mapToEntity);
  }

  async findLatestByProjectId(projectId: string): Promise<Build | null> {
    const { data, error } = await this.supabase
      .from('builds')
      .select('*')
      .eq('project_id', projectId)
      .order('version', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    
    return data ? this.mapToEntity(data) : null;
  }

  async findLatestSuccessfulByProjectId(projectId: string): Promise<Build | null> {
    const { data, error } = await this.supabase
      .from('builds')
      .select('*')
      .eq('project_id', projectId)
      .eq('status', 'READY')
      .order('version', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    
    return data ? this.mapToEntity(data) : null;
  }

  async findByProjectAndVersion(projectId: string, version: number): Promise<Build | null> {
    const { data, error } = await this.supabase
      .from('builds')
      .select('*')
      .eq('project_id', projectId)
      .eq('version', version)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    
    return data ? this.mapToEntity(data) : null;
  }

  async getNextVersionForProject(projectId: string): Promise<number> {
    // Only consider READY builds when determining next version
    // Failed/in-progress builds have version 0 and should be ignored
    const { data, error } = await this.supabase
      .from('builds')
      .select('version')
      .eq('project_id', projectId)
      .eq('status', 'READY')
      .order('version', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data ? data.version + 1 : 1;
  }

  async updateMetrics(id: string, metrics: BuildMetrics): Promise<void> {
    const { error } = await this.supabase
      .from('builds')
      .update({ metrics })
      .eq('id', id);

    if (error) throw error;
  }

  async updateStatus(id: string, status: BuildStatus): Promise<void> {
    const { error } = await this.supabase
      .from('builds')
      .update({ status })
      .eq('id', id);

    if (error) throw error;
  }

  async updateVersion(id: string, version: number): Promise<void> {
    const { error } = await this.supabase
      .from('builds')
      .update({ version })
      .eq('id', id);

    if (error) throw error;
  }

  async updateFileTree(id: string, fileTree: Record<string, string>): Promise<void> {
    const { error } = await this.supabase
      .from('builds')
      .update({ file_tree: fileTree })
      .eq('id', id);

    if (error) throw error;
  }

  async updateTokens(id: string, inputTokens: number, outputTokens: number): Promise<void> {
    const { error } = await this.supabase
      .from('builds')
      .update({
        input_tokens: inputTokens,
        output_tokens: outputTokens
      })
      .eq('id', id);

    if (error) throw error;
  }

  async updateMediaIds(id: string, mediaIds: string[]): Promise<void> {
    const { error } = await this.supabase
      .from('builds')
      .update({ media_ids: mediaIds })
      .eq('id', id);

    if (error) throw error;
  }

  async deleteByProjectId(projectId: string): Promise<void> {
    const { error } = await this.supabase
      .from('builds')
      .delete()
      .eq('project_id', projectId);

    if (error) throw error;
  }

  private mapToEntity(data: any): Build {
    return {
      id: data.id,
      fileTree: data.file_tree,
      projectId: data.project_id,
      version: data.version,
      status: data.status,
      metrics: data.metrics || {},
      inputTokens: data.input_tokens,
      outputTokens: data.output_tokens,
      mediaIds: data.media_ids || [],
      createdAt: new Date(data.created_at),
      modifiedAt: new Date(data.modified_at)
    };
  }
}