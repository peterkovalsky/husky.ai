import { Project, CreateProjectRequest } from '../entities/Project';

export interface IProjectRepository {
  create(request: CreateProjectRequest): Promise<Project>;
  findById(id: string): Promise<Project | null>;
  findByIdForOperations(id: string): Promise<Project | null>;
  findByWorkspaceId(workspaceId: string): Promise<Project[]>;
  checkUserAccess(userId: string, projectId: string): Promise<boolean>;
  updatePreviewUrl(projectId: string, previewUrl: string): Promise<void>;
  updateCurrentVersion(projectId: string, version: number): Promise<void>;
  updateStatus(projectId: string, status: string): Promise<void>;
  deleteById(projectId: string): Promise<void>;
}