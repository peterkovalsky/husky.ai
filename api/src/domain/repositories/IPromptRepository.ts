import { Prompt, CreatePromptRequest } from '../entities/Prompt';

export interface IPromptRepository {
  create(request: CreatePromptRequest): Promise<Prompt>;
  findById(id: string): Promise<Prompt | null>;
  findByProjectId(projectId: string): Promise<Prompt[]>;
  updateBuildId(id: string, buildId: string): Promise<void>;
  updateRawAiResponse(id: string, rawAiResponse: string): Promise<void>;
  deleteByProjectId(projectId: string): Promise<void>;
}