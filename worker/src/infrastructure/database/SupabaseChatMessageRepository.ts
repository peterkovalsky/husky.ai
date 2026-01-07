import { SupabaseClient } from '@supabase/supabase-js';
import { IChatMessageRepository } from '../../domain/repositories/IChatMessageRepository';
import { ChatMessage, CreateChatMessageRequest } from '../../domain/entities/ChatMessage';
import { SupabaseClientFactory } from '../../shared/database/SupabaseClientFactory';

export class SupabaseChatMessageRepository implements IChatMessageRepository {
  private supabase: SupabaseClient;

  constructor() {
    this.supabase = SupabaseClientFactory.getClient();
  }

  async create(request: CreateChatMessageRequest): Promise<ChatMessage> {
    const { data, error } = await this.supabase
      .from('chat_messages')
      .insert(this.mapToRow(request))
      .select()
      .single();

    if (error) throw error;

    return this.mapToEntity(data);
  }

  async createMany(requests: CreateChatMessageRequest[]): Promise<ChatMessage[]> {
    if (requests.length === 0) return [];

    const rows = requests.map(r => this.mapToRow(r));

    const { data, error } = await this.supabase
      .from('chat_messages')
      .insert(rows)
      .select();

    if (error) throw error;

    return (data || []).map(this.mapToEntity);
  }

  async findById(id: string): Promise<ChatMessage | null> {
    const { data, error } = await this.supabase
      .from('chat_messages')
      .select('*')
      .eq('id', id)
      .single();

    if (error && error.code !== 'PGRST116') throw error;

    return data ? this.mapToEntity(data) : null;
  }

  async findByProjectId(projectId: string): Promise<ChatMessage[]> {
    const { data, error } = await this.supabase
      .from('chat_messages')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true })
      .order('message_order', { ascending: true });

    if (error) throw error;

    return (data || []).map(this.mapToEntity);
  }

  async findByBuildId(buildId: string): Promise<ChatMessage[]> {
    const { data, error } = await this.supabase
      .from('chat_messages')
      .select('*')
      .eq('build_id', buildId)
      .order('message_order', { ascending: true });

    if (error) throw error;

    return (data || []).map(this.mapToEntity);
  }

  private mapToRow(request: CreateChatMessageRequest): Record<string, unknown> {
    return {
      project_id: request.projectId,
      build_id: request.buildId || null,
      user_id: request.userId,
      type: request.type,
      source: request.source || 'SYSTEM',
      content: request.content,
      role: request.role,
      conversation_round: request.conversationRound,
      message_order: request.messageOrder,
      media_ids: request.mediaIds || null,
      inspo_id: request.inspoId || null,
      question_id: request.questionId || null,
      parent_message_id: request.parentMessageId || null,
      is_skipped: request.isSkipped || false,
      answer_option_id: request.answerOptionId || null,
      answer_option_label: request.answerOptionLabel || null,
      answer_free_text: request.answerFreeText || null,
      status: request.status || 'completed',
      metadata: request.metadata ? JSON.stringify(request.metadata) : null,
    };
  }

  private mapToEntity(data: Record<string, unknown>): ChatMessage {
    return {
      id: data.id as string,
      projectId: data.project_id as string,
      buildId: data.build_id as string | undefined,
      userId: data.user_id as string,
      type: data.type as string,
      source: data.source as string,
      content: data.content as string,
      role: data.role as 'user' | 'assistant' | 'system',
      conversationRound: data.conversation_round as number,
      messageOrder: data.message_order as number,
      mediaIds: data.media_ids as string[] | undefined,
      inspoId: data.inspo_id as string | undefined,
      questionId: data.question_id as string | undefined,
      parentMessageId: data.parent_message_id as string | undefined,
      isSkipped: data.is_skipped as boolean | undefined,
      answerOptionId: data.answer_option_id as string | undefined,
      answerOptionLabel: data.answer_option_label as string | undefined,
      answerFreeText: data.answer_free_text as string | undefined,
      status: data.status as string,
      metadata: data.metadata ? (typeof data.metadata === 'string' ? JSON.parse(data.metadata) : data.metadata) : undefined,
      createdAt: new Date(data.created_at as string),
      modifiedAt: new Date(data.modified_at as string),
    };
  }
}
