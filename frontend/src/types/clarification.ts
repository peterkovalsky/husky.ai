export interface ClarificationOption {
  id: string;
  label: string;
  description?: string;
}

export interface ClarificationQuestion {
  id: string;
  question: string;
  options: ClarificationOption[];
}

export interface ClarificationAnswer {
  questionId: string;
  questionText?: string;
  selectedOptionId?: string;
  selectedOptionLabel?: string;
  selectedOptionDescription?: string;
  freeTextAnswer?: string;
}

export interface AnalyzePromptResponse {
  needsClarification: boolean;
  questions?: ClarificationQuestion[];
  analysisId: string;
  suggestedProjectName?: string;
  showInspirationGallery?: boolean;
  suggestedTemplate?: string;
}
