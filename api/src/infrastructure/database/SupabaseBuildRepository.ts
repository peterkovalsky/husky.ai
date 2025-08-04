import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { IBuildRepository } from '../../domain/repositories/IBuildRepository';
import { Build, CreateBuildRequest, BuildMetrics } from '../../domain/entities/Build';

export class SupabaseBuildRepository implements IBuildRepository {
  private supabase: SupabaseClient;

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase configuration');
    }

    this.supabase = createClient(supabaseUrl, supabaseServiceKey);
  }

  async create(request: CreateBuildRequest): Promise<Build> {
    // Get the next version number for this project
    const nextVersion = await this.getNextVersionForProject(request.projectId);
    
    const { data, error } = await this.supabase
      .from('builds')
      .insert({
        file_tree: request.fileTree,
        project_id: request.projectId,
        version: nextVersion,
        metrics: request.metrics || {}
      })
      .select()
      .single();

    if (error) throw error;
    
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

  async updateMetrics(id: string, metrics: BuildMetrics): Promise<void> {
    const { error } = await this.supabase
      .from('builds')
      .update({ metrics })
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
      metrics: data.metrics || {},
      createdAt: new Date(data.created_at),
      modifiedAt: new Date(data.modified_at)
    };
  }
}