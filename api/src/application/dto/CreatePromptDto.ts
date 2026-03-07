import { ClarificationAnswer } from './AnalyzePromptDto';
import { ChatMessageMetadata } from '../../domain/entities/ChatMessage';

// Input format for chat messages from frontend
export interface ChatMessageInput {
  type: string;
  source?: string;
  content: string;
  role: 'user' | 'assistant' | 'system';
  messageOrder: number;
  mediaIds?: string[];
  inspoId?: string;
  questionId?: string;
  parentMessageId?: string;
  isSkipped?: boolean;
  answerOptionId?: string;
  answerOptionLabel?: string;
  answerFreeText?: string;
  metadata?: ChatMessageMetadata;
}

export interface CreatePromptDto {
  prompt: string;
  projectId?: string;
  mediaIds?: string[];
  annotationMediaIds?: string[];
  // Clarification fields (optional)
  clarificationAnswers?: ClarificationAnswer[];
  analysisId?: string;
  skippedClarification?: boolean;
  // Inspiration selection (optional)
  inspoId?: string;
  // Chat messages for onboarding conversation history (optional)
  chatMessages?: ChatMessageInput[];
}

export interface CreatePromptResponseDto {
  promptId?: string;
  jobId?: string; // for backward compatibility
  status: string;
  projectId: string;
  timestamp?: Date;
  // Insufficient credits response
  insufficientCredits?: boolean;
  creditsRemaining?: number;
  message?: string;
}