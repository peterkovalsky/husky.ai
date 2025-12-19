export interface ClarificationOption {
  id: string;        // "opt1", "opt2", "opt3"
  label: string;     // "Bright & Playful"
  description?: string; // "Vibrant colors, fun feel"
}

export interface ClarificationQuestion {
  id: string;        // "q1", "q2", "q3"
  question: string;  // "What color mood fits your app?"
  options: ClarificationOption[];
}

export interface ClarificationAnswer {
  questionId: string;
  questionText?: string; // The question that was asked
  selectedOptionId?: string;
  selectedOptionLabel?: string; // The label of selected option (e.g., "Dark & Modern")
  selectedOptionDescription?: string; // Description (e.g., "Dark theme, sleek look")
  freeTextAnswer?: string;
}

export interface AnalyzePromptRequestDto {
  prompt: string;
  projectId?: string;  // Optional for new project flow
  mediaIds?: string[];
}

export interface AnalyzePromptResponseDto {
  needsClarification: boolean;
  questions?: ClarificationQuestion[];
  analysisId: string;
  suggestedProjectName?: string;  // AI-generated project name for new projects
  showInspirationGallery?: boolean; // True if the prompt is for a website/landing page
}
