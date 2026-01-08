import { ChatMessage, CreateChatMessageRequest } from '../entities/ChatMessage';

export interface IChatMessageRepository {
  create(request: CreateChatMessageRequest): Promise<ChatMessage>;
  createMany(requests: CreateChatMessageRequest[]): Promise<ChatMessage[]>;
  findById(id: string): Promise<ChatMessage | null>;
  findByProjectId(projectId: string): Promise<ChatMessage[]>;
  findByBuildId(buildId: string): Promise<ChatMessage[]>;
}
