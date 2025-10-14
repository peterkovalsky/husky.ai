export type ProjectStatus = 'ACTIVE' | 'DELETING';

export interface Project {
  id: string;
  name: string;
  description?: string;
  previewUrl?: string;
  workspaceId: string;
  status: ProjectStatus;
  currentVersion: number;
  createdAt: Date;
  modifiedAt: Date;
}

export interface CreateProjectRequest {
  name: string;
  description?: string;
  workspaceId: string;
}