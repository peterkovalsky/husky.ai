import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { IPromptRepository } from '../../domain/repositories/IPromptRepository';
import { Prompt, CreatePromptRequest, PromptStatus } from '../../domain/entities/Prompt';

export class SupabasePromptRepository implements IPromptRepository {
  private supabase: SupabaseClient;

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase configuration');
    }

    this.supabase = createClient(supabaseUrl, supabaseServiceKey);
  }

  async create(request: CreatePromptRequest): Promise<Prompt> {
    const { data, error } = await this.supabase
      .from('prompts')
      .insert({
        prompt: request.prompt,
        project_id: request.projectId,
        user_id: request.userId,
        status: 'QUEUED'
      })
      .select()
      .single();

    if (error) throw error;
    
    return this.mapToEntity(data);
  }

  async findById(id: string): Promise<Prompt | null> {
    const { data, error } = await this.supabase
      .from('prompts')
      .select('*')
      .eq('id', id)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    
    return data ? this.mapToEntity(data) : null;
  }

  async findByProjectId(projectId: string): Promise<Prompt[]> {
    const { data, error } = await this.supabase
      .from('prompts')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    
    return (data || []).map(this.mapToEntity);
  }

  async updateStatus(id: string, status: PromptStatus): Promise<void> {
    const { error } = await this.supabase
      .from('prompts')
      .update({ status })
      .eq('id', id);

    if (error) throw error;
  }

  async deleteByProjectId(projectId: string): Promise<void> {
    const { error } = await this.supabase
      .from('prompts')
      .delete()
      .eq('project_id', projectId);

    if (error) throw error;
  }

  private mapToEntity(data: any): Prompt {
    return {
      id: data.id,
      prompt: data.prompt,
      status: data.status,
      projectId: data.project_id,
      userId: data.user_id,
      createdAt: new Date(data.created_at),
      modifiedAt: new Date(data.modified_at)
    };
  }
}