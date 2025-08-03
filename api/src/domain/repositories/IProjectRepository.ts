import { Project, CreateProjectRequest } from '../entities/Project';

export interface IProjectRepository {
  create(request: CreateProjectRequest): Promise<Project>;
  findById(id: string): Promise<Project | null>;
  findByWorkspaceId(workspaceId: string): Promise<Project[]>;
  checkUserAccess(userId: string, projectId: string): Promise<boolean>;
}