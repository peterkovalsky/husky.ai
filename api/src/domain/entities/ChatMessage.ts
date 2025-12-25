// Known message types - can add new ones without DB migration
export const ChatMessageType = {
  USER_PROMPT: 'USER_PROMPT',
  AI_QUESTION: 'AI_QUESTION',
  USER_ANSWER: 'USER_ANSWER',
  INSPO_SELECTION: 'INSPO_SELECTION',
  SYSTEM_STATUS: 'SYSTEM_STATUS',
  SYSTEM_ERROR: 'SYSTEM_ERROR',
  BUILD_RESULT: 'BUILD_RESULT',
} as const;
export type ChatMessageType = typeof ChatMessageType[keyof typeof ChatMessageType];

// Known sources - can add new ones without DB migration
export const ChatMessageSource = {
  ONBOARDING: 'ONBOARDING',
  ITERATION: 'ITERATION',
  SYSTEM: 'SYSTEM',
} as const;
export type ChatMessageSource = typeof ChatMessageSource[keyof typeof ChatMessageSource];

export type ChatMessageRole = 'user' | 'assistant' | 'system';

export interface ChatMessageMetadata {
  inspoThumbnail?: string;
  inspoName?: string;
  [key: string]: unknown;
}

export interface ChatMessage {
  id: string;
  projectId: string;
  buildId?: string;
  userId: string;
  type: string; // ChatMessageType but extensible
  source: string; // ChatMessageSource but extensible
  content: string;
  role: ChatMessageRole;
  conversationRound: number;
  messageOrder: number;
  mediaIds?: string[];
  inspoId?: string;
  questionId?: string;
  parentMessageId?: string;
  isSkipped?: boolean;
  answerOptionId?: string;
  answerOptionLabel?: string;
  answerFreeText?: string;
  status: string;
  metadata?: ChatMessageMetadata;
  createdAt: Date;
  modifiedAt: Date;
}

export interface CreateChatMessageRequest {
  projectId: string;
  buildId?: string;
  userId: string;
  type: string;
  source?: string;
  content: string;
  role: ChatMessageRole;
  conversationRound: number;
  messageOrder: number;
  mediaIds?: string[];
  inspoId?: string;
  questionId?: string;
  parentMessageId?: string;
  isSkipped?: boolean;
  answerOptionId?: string;
  answerOptionLabel?: string;
  answerFreeText?: string;
  status?: string;
  metadata?: ChatMessageMetadata;
}
