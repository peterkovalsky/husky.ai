export interface Workspace {
  id: string;
  name: string;
  createdAt: Date;
  modifiedAt: Date;
}

export interface CreateWorkspaceRequest {
  name: string;
}