import { SupabaseClient } from '@supabase/supabase-js';
import { IPromptRepository } from '../../domain/repositories/IPromptRepository';
import { Prompt, CreatePromptRequest } from '../../domain/entities/Prompt';
import { SupabaseClientFactory } from '../../shared/database/SupabaseClientFactory';

export class SupabasePromptRepository implements IPromptRepository {
  private supabase: SupabaseClient;

  constructor() {
    this.supabase = SupabaseClientFactory.getClient();
  }

  async create(request: CreatePromptRequest): Promise<Prompt> {
    const { data, error } = await this.supabase
      .from('prompts')
      .insert({
        prompt: request.prompt,
        project_id: request.projectId,
        user_id: request.userId
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

  async updateBuildId(id: string, buildId: string): Promise<void> {
    const { error } = await this.supabase
      .from('prompts')
      .update({ build_id: buildId })
      .eq('id', id);

    if (error) throw error;
  }

  async updateRawAiResponse(id: string, rawAiResponse: string): Promise<void> {
    const { error } = await this.supabase
      .from('prompts')
      .update({ raw_ai_response: rawAiResponse })
      .eq('id', id);

    if (error) throw error;
  }

  async updateMetrics(id: string, inputTokens: number, outputTokens: number, durationMs: number): Promise<void> {
    const { error } = await this.supabase
      .from('prompts')
      .update({
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        duration_ms: durationMs
      })
      .eq('id', id);

    if (error) throw error;
  }

  async updateModelAndCost(id: string, model: string, costUsd: number): Promise<void> {
    const { error } = await this.supabase
      .from('prompts')
      .update({
        model: model,
        cost_usd: costUsd
      })
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
      projectId: data.project_id,
      userId: data.user_id,
      buildId: data.build_id,
      rawAiResponse: data.raw_ai_response,
      inputTokens: data.input_tokens,
      outputTokens: data.output_tokens,
      durationMs: data.duration_ms,
      model: data.model,
      costUsd: data.cost_usd ? parseFloat(data.cost_usd) : undefined,
      createdAt: new Date(data.created_at),
      modifiedAt: new Date(data.modified_at)
    };
  }
}