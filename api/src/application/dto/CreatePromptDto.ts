export interface CreatePromptDto {
  prompt: string;
  projectId?: string;
}

export interface CreatePromptResponseDto {
  promptId: string;
  jobId: string; // for backward compatibility
  status: string;
  projectId: string;
  timestamp: Date;
}