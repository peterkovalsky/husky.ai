import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { IPreviewRepository } from '../../domain/repositories/IPreviewRepository';
import { Preview, CreatePreviewRequest } from '../../domain/entities/Preview';

export class SupabasePreviewRepository implements IPreviewRepository {
  private supabase: SupabaseClient;

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase configuration');
    }

    this.supabase = createClient(supabaseUrl, supabaseServiceKey);
  }

  async create(request: CreatePreviewRequest): Promise<Preview> {
    const { data, error } = await this.supabase
      .from('previews')
      .insert({
        preview_url: request.previewUrl,
        project_id: request.projectId,
        prompt_id: request.promptId
      })
      .select()
      .single();

    if (error) throw error;
    
    return this.mapToEntity(data);
  }

  async findByProjectId(projectId: string): Promise<Preview[]> {
    const { data, error } = await this.supabase
      .from('previews')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    
    return (data || []).map(this.mapToEntity);
  }

  async findByPromptId(promptId: string): Promise<Preview | null> {
    const { data, error } = await this.supabase
      .from('previews')
      .select('*')
      .eq('prompt_id', promptId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    
    return data ? this.mapToEntity(data) : null;
  }

  private mapToEntity(data: any): Preview {
    return {
      id: data.id,
      previewUrl: data.preview_url,
      projectId: data.project_id,
      promptId: data.prompt_id,
      createdAt: new Date(data.created_at),
      modifiedAt: new Date(data.modified_at)
    };
  }
}