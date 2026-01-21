export interface CreateProjectDto {
  name: string;
  description?: string;
  workspaceId?: string;
}

export interface ChatMessageMediaDto {
  id: string;
  thumbnailUrl: string;  // Presigned URL to thumbnail (256x256)
  fullUrl: string;       // Presigned URL to original file (for lightbox)
  type: 'image' | 'video' | 'doc';
  mimeType: string;
}

export interface ChatMessageDto {
  id: string;
  projectId: string;
  buildId?: string;
  userId: string;
  type: string;
  source: string;
  content: string;
  role: 'user' | 'assistant' | 'system';
  conversationRound: number;
  messageOrder: number;
  mediaIds?: string[];
  mediaUrls?: ChatMessageMediaDto[];
  inspoId?: string;
  questionId?: string;
  parentMessageId?: string;
  isSkipped?: boolean;
  answerOptionId?: string;
  answerOptionLabel?: string;
  answerFreeText?: string;
  status: string;
  metadata?: {
    inspoThumbnail?: string;
    inspoName?: string;
    [key: string]: unknown;
  };
  createdAt: Date;
  modifiedAt: Date;
}

export interface ProjectDetailsDto {
  project: {
    id: string;
    name: string;
    workspaceId: string;
    previewUrl?: string;
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
  chatMessages?: ChatMessageDto[];
}