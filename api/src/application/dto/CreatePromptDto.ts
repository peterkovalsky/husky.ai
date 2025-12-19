import { ClarificationAnswer } from './AnalyzePromptDto';

export interface CreatePromptDto {
  prompt: string;
  projectId?: string;
  mediaIds?: string[];
  // Clarification fields (optional)
  clarificationAnswers?: ClarificationAnswer[];
  analysisId?: string;
  skippedClarification?: boolean;
  // Inspiration selection (optional)
  inspoId?: string;
}

export interface CreatePromptResponseDto {
  promptId: string;
  jobId: string; // for backward compatibility
  status: string;
  projectId: string;
  timestamp: Date;
}