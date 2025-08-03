export interface CreateProjectDto {
  name: string;
  description?: string;
  workspaceId?: string;
}

export interface ProjectDetailsDto {
  project: {
    id: string;
    name: string;
    workspaceId: string;
    createdAt: Date;
    modifiedAt: Date;
  };
  workspace: {
    id: string;
    name: string;
  } | null;
  stats: {
    totalPrompts: number;
    totalBuilds: number;
    totalPreviews: number;
    currentVersion: number;
  };
  recentPrompts: Array<{
    id: string;
    prompt: string;
    status: string;
    createdAt: Date;
    modifiedAt: Date;
  }>;
  builds: Array<{
    id: string;
    version: number;
    createdAt: Date;
    metrics: any;
  }>;
  previews: Array<{
    id: string;
    previewUrl: string;
    createdAt: Date;
    promptId?: string;
  }>;
}