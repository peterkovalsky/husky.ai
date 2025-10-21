import { Prompt, CreatePromptRequest } from '../entities/Prompt';

export interface IPromptRepository {
  create(request: CreatePromptRequest): Promise<Prompt>;
  findById(id: string): Promise<Prompt | null>;
  findByProjectId(projectId: string): Promise<Prompt[]>;
  updateBuildId(id: string, buildId: string): Promise<void>;
  updateRawAiResponse(id: string, rawAiResponse: string): Promise<void>;
  updateMetrics(id: string, inputTokens: number, outputTokens: number, durationMs: number): Promise<void>;
  updateModelAndCost(id: string, model: string, costUsd: number): Promise<void>;
  deleteByProjectId(projectId: string): Promise<void>;
}