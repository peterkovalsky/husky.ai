import { ChatMessage, CreateChatMessageRequest } from '../entities/ChatMessage';

export interface PaginatedChatMessages {
  messages: ChatMessage[];
  hasMore: boolean;
}

export interface IChatMessageRepository {
  create(request: CreateChatMessageRequest): Promise<ChatMessage>;
  createMany(requests: CreateChatMessageRequest[]): Promise<ChatMessage[]>;
  findById(id: string): Promise<ChatMessage | null>;
  findByProjectId(projectId: string): Promise<ChatMessage[]>;
  findByProjectIdPaginated(projectId: string, options: {
    limit: number;
    before?: string;
  }): Promise<PaginatedChatMessages>;
  findByBuildId(buildId: string): Promise<ChatMessage[]>;
}
