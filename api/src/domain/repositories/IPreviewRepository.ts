import { Preview, CreatePreviewRequest } from '../entities/Preview';

export interface IPreviewRepository {
  create(request: CreatePreviewRequest): Promise<Preview>;
  findByProjectId(projectId: string): Promise<Preview[]>;
  findByPromptId(promptId: string): Promise<Preview | null>;
}