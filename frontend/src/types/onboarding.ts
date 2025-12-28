import type { ClarificationQuestion, ClarificationAnswer } from './clarification';

/**
 * Onboarding phases for the project setup flow
 */
export type OnboardingPhase =
  | 'NONE'              // Normal preview mode (no onboarding active)
  | 'ANALYZING'         // Calling analyzePrompt API
  | 'INSPO_SELECTION'   // Showing InspirationGallery
  | 'CLARIFICATION'     // Showing questions one at a time
  | 'SUBMITTING'        // Submitting final prompt
  | 'BUILDING';         // Build in progress

/**
 * Selected inspiration item data
 */
export interface SelectedInspoItem {
  id: string;
  name: string;
  imageUrl: string;
}

/**
 * Core onboarding data tracked during the flow
 */
export interface OnboardingData {
  initialPrompt: string;
  mediaIds: string[];
  analysisId: string;
  suggestedProjectName: string;
  showInspirationGallery: boolean;
  selectedInspoId: string | null;
  selectedInspoItem: SelectedInspoItem | null;
  clarificationQuestions: ClarificationQuestion[];
  currentQuestionIndex: number;
  answers: ClarificationAnswer[];
}

/**
 * Router state passed from NewProjectPage to ProjectPage
 */
export interface ProjectPageLocationState {
  initialPrompt?: string;
  mediaIds?: string[];
  startOnboarding?: boolean;
}

/**
 * Chat message metadata for onboarding-specific messages
 */
export interface OnboardingMessageMetadata {
  inspoThumbnail?: string;   // URL for inspo thumbnail
  inspoName?: string;        // Name of selected inspiration
  questionId?: string;       // For tracking which question this relates to
  isSkipped?: boolean;       // If user skipped this question
}

/**
 * Extended chat message type for onboarding
 */
export type OnboardingMessageType =
  | 'user'           // User's prompt or answer
  | 'system'         // System status message
  | 'ai-question'    // AI asking a clarification question
  | 'user-answer'    // User's answer to a question
  | 'inspo-selection'; // User's inspiration selection with thumbnail

/**
 * Onboarding chat message structure
 */
export interface OnboardingChatMessage {
  id: string;
  type: OnboardingMessageType;
  content: string;
  timestamp: Date;
  status?: 'sending' | 'processing' | 'completed' | 'failed';
  metadata?: OnboardingMessageMetadata;
}

/**
 * Persisted onboarding state for localStorage
 */
export interface PersistedOnboardingState {
  phase: OnboardingPhase;
  initialPrompt: string;
  mediaIds: string[];
  analysisId: string;
  showInspirationGallery: boolean;
  selectedInspoId: string | null;
  selectedInspoItem: SelectedInspoItem | null;
  clarificationQuestions: ClarificationQuestion[];
  currentQuestionIndex: number;
  answers: ClarificationAnswer[];
  chatMessages: OnboardingChatMessage[];
  timestamp: number; // For detecting stale state
}
