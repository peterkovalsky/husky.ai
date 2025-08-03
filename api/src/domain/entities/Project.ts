export interface Project {
  id: string;
  name: string;
  description?: string;
  workspaceId: string;
  createdAt: Date;
  modifiedAt: Date;
}

export interface CreateProjectRequest {
  name: string;
  description?: string;
  workspaceId: string;
  userId: string;
}