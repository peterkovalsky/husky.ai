export interface Preview {
  id: string;
  previewUrl: string;
  projectId: string;
  promptId?: string;
  createdAt: Date;
  modifiedAt: Date;
}

export interface CreatePreviewRequest {
  previewUrl: string;
  projectId: string;
  promptId?: string;
}