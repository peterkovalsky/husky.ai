import { SupabaseClient } from '@supabase/supabase-js';
import { IAILogRepository } from '../../domain/repositories/IAILogRepository';
import { AILog, CreateAILogRequest } from '../../domain/entities/AILog';
import { SupabaseClientFactory } from '../../shared/database/SupabaseClientFactory';

export class SupabaseAILogRepository implements IAILogRepository {
  private supabase: SupabaseClient;

  constructor() {
    this.supabase = SupabaseClientFactory.getClient();
  }

  async create(request: CreateAILogRequest): Promise<AILog> {
    // Convert empty strings to null for UUID fields (empty string is invalid UUID)
    const projectId = request.projectId && request.projectId.trim() !== '' ? request.projectId : null;
    const buildId = request.buildId && request.buildId.trim() !== '' ? request.buildId : null;
    const userId = request.userId && request.userId.trim() !== '' ? request.userId : null;

    if (!userId) {
      throw new Error('userId is required for AI log creation');
    }

    const { data, error } = await this.supabase
      .from('ai_logs')
      .insert({
        provider: request.provider,
        model: request.model,
        input_tokens: request.inputTokens,
        output_tokens: request.outputTokens,
        cost_usd: request.costUsd,
        duration_ms: request.durationMs,
        project_id: projectId,
        build_id: buildId,
        user_id: userId,
        prompt: request.prompt,
        system_prompt: request.systemPrompt,
        ai_response: request.aiResponse
      })
      .select()
      .single();

    if (error) throw error;

    return this.mapToEntity(data);
  }

  async findById(id: string): Promise<AILog | null> {
    const { data, error } = await this.supabase
      .from('ai_logs')
      .select('*')
      .eq('id', id)
      .single();

    if (error && error.code !== 'PGRST116') throw error;

    return data ? this.mapToEntity(data) : null;
  }

  async findByProjectId(projectId: string): Promise<AILog[]> {
    const { data, error } = await this.supabase
      .from('ai_logs')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return (data || []).map(this.mapToEntity);
  }

  async findByBuildId(buildId: string): Promise<AILog[]> {
    const { data, error } = await this.supabase
      .from('ai_logs')
      .select('*')
      .eq('build_id', buildId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return (data || []).map(this.mapToEntity);
  }

  async findByUserId(userId: string): Promise<AILog[]> {
    const { data, error } = await this.supabase
      .from('ai_logs')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return (data || []).map(this.mapToEntity);
  }

  private mapToEntity(data: any): AILog {
    return {
      id: data.id,
      provider: data.provider,
      model: data.model,
      inputTokens: data.input_tokens,
      outputTokens: data.output_tokens,
      costUsd: parseFloat(data.cost_usd),
      durationMs: data.duration_ms,
      projectId: data.project_id,
      buildId: data.build_id,
      userId: data.user_id,
      prompt: data.prompt,
      systemPrompt: data.system_prompt,
      aiResponse: data.ai_response,
      createdAt: new Date(data.created_at),
      modifiedAt: new Date(data.modified_at)
    };
  }
}
