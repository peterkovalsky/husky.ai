import { Workspace, CreateWorkspaceRequest } from '../entities/Workspace';

export interface IWorkspaceRepository {
  create(request: CreateWorkspaceRequest): Promise<Workspace>;
  findByUserId(userId: string): Promise<Workspace[]>;
  findById(id: string): Promise<Workspace | null>;
  checkUserAccess(userId: string, workspaceId: string): Promise<boolean>;
  addUserToWorkspace(userId: string, workspaceId: string): Promise<void>;
}