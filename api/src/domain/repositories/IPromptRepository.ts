import { Prompt, CreatePromptRequest, PromptStatus } from '../entities/Prompt';

export interface IPromptRepository {
  create(request: CreatePromptRequest): Promise<Prompt>;
  findById(id: string): Promise<Prompt | null>;
  findByProjectId(projectId: string): Promise<Prompt[]>;
  updateStatus(id: string, status: PromptStatus): Promise<void>;
  deleteByProjectId(projectId: string): Promise<void>;
}