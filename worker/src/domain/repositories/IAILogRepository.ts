import { AILog, CreateAILogRequest } from '../entities/AILog';

export interface IAILogRepository {
  create(request: CreateAILogRequest): Promise<AILog>;
  findById(id: string): Promise<AILog | null>;
  findByProjectId(projectId: string): Promise<AILog[]>;
  findByBuildId(buildId: string): Promise<AILog[]>;
  findByUserId(userId: string): Promise<AILog[]>;
}
