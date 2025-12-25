import { useState, useEffect, useCallback, useRef } from 'react';
import { ApiService, type InspoItem, type JobStatus, type ChatMessageInput } from '../services/api';
import type { ClarificationQuestion, ClarificationAnswer, AnalyzePromptResponse } from '../types/clarification';
import type {
  OnboardingPhase,
  OnboardingData,
  OnboardingChatMessage,
  PersistedOnboardingState,
  SelectedInspoItem,
} from '../types/onboarding';

// Message type mapping from frontend to backend
const MESSAGE_TYPE_MAP: Record<OnboardingChatMessage['type'], string> = {
  'user': 'USER_PROMPT',
  'ai-question': 'AI_QUESTION',
  'user-answer': 'USER_ANSWER',
  'inspo-selection': 'INSPO_SELECTION',
  'system': 'SYSTEM_STATUS',
};

// Convert OnboardingChatMessage to ChatMessageInput format for backend
function convertToChatMessageInput(
  msg: OnboardingChatMessage,
  index: number,
  selectedInspoId?: string | null
): ChatMessageInput {
  const type = MESSAGE_TYPE_MAP[msg.type];
  const role: 'user' | 'assistant' | 'system' =
    msg.type === 'user' || msg.type === 'user-answer' || msg.type === 'inspo-selection' ? 'user' :
    msg.type === 'ai-question' ? 'assistant' : 'system';

  return {
    type,
    source: 'ONBOARDING',
    content: msg.content,
    role,
    messageOrder: index,
    inspoId: msg.type === 'inspo-selection' ? selectedInspoId ?? undefined : undefined,
    questionId: msg.metadata?.questionId,
    isSkipped: msg.metadata?.isSkipped,
    metadata: msg.metadata ? {
      inspoThumbnail: msg.metadata.inspoThumbnail,
      inspoName: msg.metadata.inspoName,
    } : undefined,
  };
}

const STORAGE_KEY_PREFIX = 'husky_onboarding_';
const STATE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

interface UseOnboardingReturn {
  // State
  phase: OnboardingPhase;
  data: OnboardingData | null;
  onboardingMessages: OnboardingChatMessage[];
  currentQuestion: ClarificationQuestion | null;
  isRestoredFromStorage: boolean;
  error: string | null;
  isLoading: boolean;
  buildStatus: JobStatus['status'] | null;
  buildJustCompleted: boolean;

  // Actions
  startOnboarding: (prompt: string, mediaIds: string[], analysisData?: AnalyzePromptResponse) => Promise<void>;
  handleInspoSelect: (inspoId: string, item: InspoItem) => void;
  handleInspoSkip: () => void;
  handleQuestionAnswer: (answer: ClarificationAnswer) => void;
  handleQuestionSkip: () => void;
  submitFinalPrompt: () => Promise<void>;
  cancelOnboarding: () => void;
  retryLastAction: () => Promise<void>;
  clearError: () => void;
}

export function useOnboarding(projectId: string | undefined): UseOnboardingReturn {
  const [phase, setPhase] = useState<OnboardingPhase>('NONE');
  const [data, setData] = useState<OnboardingData | null>(null);
  const [messages, setMessages] = useState<OnboardingChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRestoredFromStorage, setIsRestoredFromStorage] = useState(false);
  const [buildStatus, setBuildStatus] = useState<JobStatus['status'] | null>(null);
  const [buildJustCompleted, setBuildJustCompleted] = useState(false);

  const lastActionRef = useRef<'analyze' | 'submit' | null>(null);
  const pollCleanupRef = useRef<(() => void) | null>(null);

  const storageKey = projectId ? `${STORAGE_KEY_PREFIX}${projectId}` : null;

  // Helper to create unique message IDs
  const createMessageId = () => `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // Helper to add a message
  const addMessage = useCallback((
    type: OnboardingChatMessage['type'],
    content: string,
    metadata?: OnboardingChatMessage['metadata']
  ) => {
    const msg: OnboardingChatMessage = {
      id: createMessageId(),
      type,
      content,
      timestamp: new Date(),
      status: 'completed',
      metadata,
    };
    setMessages(prev => [...prev, msg]);
    return msg;
  }, []);

  // Persist state to localStorage
  const persistState = useCallback((
    newPhase: OnboardingPhase,
    newData: OnboardingData | null,
    newMessages: OnboardingChatMessage[]
  ) => {
    if (!storageKey || newPhase === 'NONE') {
      if (storageKey) {
        localStorage.removeItem(storageKey);
      }
      return;
    }

    const persistedState: PersistedOnboardingState = {
      phase: newPhase,
      initialPrompt: newData?.initialPrompt ?? '',
      mediaIds: newData?.mediaIds ?? [],
      analysisId: newData?.analysisId ?? '',
      showInspirationGallery: newData?.showInspirationGallery ?? false,
      selectedInspoId: newData?.selectedInspoId ?? null,
      selectedInspoItem: newData?.selectedInspoItem ?? null,
      clarificationQuestions: newData?.clarificationQuestions ?? [],
      currentQuestionIndex: newData?.currentQuestionIndex ?? 0,
      answers: newData?.answers ?? [],
      chatMessages: newMessages,
      timestamp: Date.now(),
    };

    try {
      localStorage.setItem(storageKey, JSON.stringify(persistedState));
    } catch (err) {
      console.error('Failed to persist onboarding state:', err);
    }
  }, [storageKey]);

  // Clear persisted state
  const clearPersistedState = useCallback(() => {
    if (storageKey) {
      localStorage.removeItem(storageKey);
    }
  }, [storageKey]);

  // Restore state from localStorage on mount
  useEffect(() => {
    if (!storageKey) return;

    try {
      const stored = localStorage.getItem(storageKey);
      if (!stored) return;

      const parsed: PersistedOnboardingState = JSON.parse(stored);

      // Check if state is expired
      if (Date.now() - parsed.timestamp > STATE_EXPIRY_MS) {
        localStorage.removeItem(storageKey);
        return;
      }

      // Don't restore BUILDING state - let the build complete naturally
      if (parsed.phase === 'BUILDING' || parsed.phase === 'NONE') {
        localStorage.removeItem(storageKey);
        return;
      }

      // Restore state
      setPhase(parsed.phase);
      setData({
        initialPrompt: parsed.initialPrompt,
        mediaIds: parsed.mediaIds,
        analysisId: parsed.analysisId,
        suggestedProjectName: '', // Not persisted, not needed for resume
        showInspirationGallery: parsed.showInspirationGallery,
        selectedInspoId: parsed.selectedInspoId,
        selectedInspoItem: parsed.selectedInspoItem,
        clarificationQuestions: parsed.clarificationQuestions,
        currentQuestionIndex: parsed.currentQuestionIndex,
        answers: parsed.answers,
      });

      // Restore messages with Date objects
      const restoredMessages = parsed.chatMessages.map(msg => ({
        ...msg,
        timestamp: new Date(msg.timestamp),
      }));
      setMessages(restoredMessages);
      setIsRestoredFromStorage(true);

      console.log('[useOnboarding] Restored state from localStorage:', parsed.phase);
    } catch (err) {
      console.error('Failed to restore onboarding state:', err);
      localStorage.removeItem(storageKey);
    }
  }, [storageKey]);

  // Persist state whenever it changes
  useEffect(() => {
    if (phase !== 'NONE' && data) {
      persistState(phase, data, messages);
    }
  }, [phase, data, messages, persistState]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollCleanupRef.current) {
        pollCleanupRef.current();
      }
    };
  }, []);

  // Get current question based on index
  const currentQuestion = data?.clarificationQuestions[data.currentQuestionIndex] ?? null;

  // Start the onboarding flow
  const startOnboarding = useCallback(async (
    prompt: string,
    mediaIds: string[],
    analysisData?: AnalyzePromptResponse
  ) => {
    if (!projectId) {
      setError('Project ID is required');
      return;
    }

    setIsLoading(true);
    setError(null);
    lastActionRef.current = 'analyze';

    try {
      // Add user's initial prompt to chat
      addMessage('user', prompt);

      // If analysis data is already provided (from NewProjectPage), use it
      let analysis: AnalyzePromptResponse;
      if (analysisData) {
        analysis = analysisData;
      } else {
        // Otherwise, call the analyze API
        setPhase('ANALYZING');
        addMessage('system', 'Analyzing your request...');
        analysis = await ApiService.analyzePrompt(prompt, projectId, mediaIds);
      }

      // Set up onboarding data
      const newData: OnboardingData = {
        initialPrompt: prompt,
        mediaIds,
        analysisId: analysis.analysisId,
        suggestedProjectName: analysis.suggestedProjectName ?? 'New Project',
        showInspirationGallery: analysis.showInspirationGallery ?? false,
        selectedInspoId: null,
        selectedInspoItem: null,
        clarificationQuestions: analysis.questions ?? [],
        currentQuestionIndex: 0,
        answers: [],
      };
      setData(newData);

      // Determine next phase
      if (newData.showInspirationGallery) {
        addMessage('system', 'Let me find some inspiration for you...');
        setPhase('INSPO_SELECTION');
      } else if (newData.clarificationQuestions.length > 0) {
        // Add first question to chat
        const firstQuestion = newData.clarificationQuestions[0];
        addMessage('ai-question', firstQuestion.question, { questionId: firstQuestion.id });
        setPhase('CLARIFICATION');
      } else {
        // No inspo or questions needed, submit directly
        setPhase('SUBMITTING');
        await submitWithData(newData);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to analyze prompt';
      setError(message);
      addMessage('system', `Error: ${message}`);
      setPhase('NONE');
    } finally {
      setIsLoading(false);
    }
  }, [projectId, addMessage]);

  // Handle inspiration selection
  const handleInspoSelect = useCallback((inspoId: string, item: InspoItem) => {
    if (!data) return;

    const selectedItem: SelectedInspoItem = {
      id: item.id,
      name: item.name,
      imageUrl: item.imageUrl,
    };

    // Add message with thumbnail
    addMessage('inspo-selection', `Selected: ${item.name}`, {
      inspoThumbnail: item.imageUrl,
      inspoName: item.name,
    });

    const updatedData = {
      ...data,
      selectedInspoId: inspoId,
      selectedInspoItem: selectedItem,
    };
    setData(updatedData);

    // Move to clarification or submit
    if (data.clarificationQuestions.length > 0) {
      const firstQuestion = data.clarificationQuestions[0];
      addMessage('ai-question', firstQuestion.question, { questionId: firstQuestion.id });
      setPhase('CLARIFICATION');
    } else {
      setPhase('SUBMITTING');
      submitWithData(updatedData);
    }
  }, [data, addMessage]);

  // Handle inspiration skip
  const handleInspoSkip = useCallback(() => {
    if (!data) return;

    addMessage('system', 'Skipped inspiration selection');

    // Move to clarification or submit
    if (data.clarificationQuestions.length > 0) {
      const firstQuestion = data.clarificationQuestions[0];
      addMessage('ai-question', firstQuestion.question, { questionId: firstQuestion.id });
      setPhase('CLARIFICATION');
    } else {
      setPhase('SUBMITTING');
      submitWithData(data);
    }
  }, [data, addMessage]);

  // Handle question answer
  const handleQuestionAnswer = useCallback((answer: ClarificationAnswer) => {
    if (!data) return;

    // Add user's answer to chat
    const displayAnswer = answer.freeTextAnswer || answer.selectedOptionLabel || 'Selected option';
    addMessage('user-answer', displayAnswer, { questionId: answer.questionId });

    const updatedAnswers = [...data.answers, answer];
    const nextIndex = data.currentQuestionIndex + 1;

    if (nextIndex < data.clarificationQuestions.length) {
      // More questions remaining
      const nextQuestion = data.clarificationQuestions[nextIndex];
      addMessage('ai-question', nextQuestion.question, { questionId: nextQuestion.id });

      setData({
        ...data,
        answers: updatedAnswers,
        currentQuestionIndex: nextIndex,
      });
    } else {
      // All questions answered, submit
      const updatedData = {
        ...data,
        answers: updatedAnswers,
        currentQuestionIndex: nextIndex,
      };
      setData(updatedData);
      setPhase('SUBMITTING');
      submitWithData(updatedData);
    }
  }, [data, addMessage]);

  // Handle question skip (skip current only)
  const handleQuestionSkip = useCallback(() => {
    if (!data) return;

    const currentQ = data.clarificationQuestions[data.currentQuestionIndex];

    // Add skip message to chat
    addMessage('user-answer', 'Skipped', { questionId: currentQ.id, isSkipped: true });

    const nextIndex = data.currentQuestionIndex + 1;

    if (nextIndex < data.clarificationQuestions.length) {
      // More questions remaining
      const nextQuestion = data.clarificationQuestions[nextIndex];
      addMessage('ai-question', nextQuestion.question, { questionId: nextQuestion.id });

      setData({
        ...data,
        currentQuestionIndex: nextIndex,
      });
    } else {
      // All questions done (skipped), submit
      const updatedData = {
        ...data,
        currentQuestionIndex: nextIndex,
      };
      setData(updatedData);
      setPhase('SUBMITTING');
      submitWithData(updatedData);
    }
  }, [data, addMessage]);

  // Submit the final prompt with all collected data
  const submitWithData = async (submitData: OnboardingData) => {
    if (!projectId) {
      setError('Project ID is required');
      return;
    }

    setIsLoading(true);
    setError(null);
    lastActionRef.current = 'submit';

    try {
      addMessage('system', 'Building your app...');

      // Determine if clarification was skipped entirely
      const skippedClarification = submitData.clarificationQuestions.length > 0 &&
        submitData.answers.length === 0;

      // Convert onboarding messages to backend format
      // Include all messages up to now (before the "Building..." message we just added)
      const chatMessageInputs = messages.map((msg, index) =>
        convertToChatMessageInput(msg, index, submitData.selectedInspoId)
      );

      const response = await ApiService.submitPrompt(
        submitData.initialPrompt,
        projectId,
        submitData.mediaIds.length > 0 ? submitData.mediaIds : undefined,
        submitData.answers.length > 0 ? submitData.answers : undefined,
        submitData.analysisId,
        skippedClarification,
        submitData.selectedInspoId ?? undefined,
        chatMessageInputs.length > 0 ? chatMessageInputs : undefined
      );

      setPhase('BUILDING');
      setBuildStatus('QUEUED');

      // Start polling for build status
      const cleanup = await ApiService.pollJobStatus(
        response.promptId || response.jobId,
        (status: JobStatus) => {
          setBuildStatus(status.status);

          if (status.status === 'READY') {
            addMessage('system', 'Your app is ready!');
            clearPersistedState();
            setBuildJustCompleted(true);  // Flag to prevent NewProjectStarter flash
            setPhase('NONE');
            setBuildStatus(null);

            // Dispatch event to reload preview
            setTimeout(() => {
              const cacheBustUrl = status.previewUrl?.includes('?')
                ? `${status.previewUrl}&t=${Date.now()}`
                : `${status.previewUrl}?t=${Date.now()}`;

              window.dispatchEvent(new CustomEvent('reloadPreview', {
                detail: { previewUrl: cacheBustUrl, forceReload: true }
              }));
            }, 500);
          } else if (status.status === 'FAILED') {
            const errorMsg = status.errorMessage || 'Build failed';
            addMessage('system', `Build failed: ${errorMsg}`);
            setError(errorMsg);
            clearPersistedState();
            setPhase('NONE');
            setBuildStatus(null);
          }
        },
        (pollError) => {
          addMessage('system', `Error: ${pollError.message}`);
          setError(pollError.message);
          clearPersistedState();
          setPhase('NONE');
          setBuildStatus(null);
        }
      );

      pollCleanupRef.current = cleanup;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to submit prompt';
      setError(message);
      addMessage('system', `Error: ${message}`);
      // Don't clear persisted state on submit error - allow retry
    } finally {
      setIsLoading(false);
    }
  };

  // Public submit method
  const submitFinalPrompt = useCallback(async () => {
    if (!data) {
      setError('No onboarding data available');
      return;
    }
    await submitWithData(data);
  }, [data]);

  // Cancel onboarding
  const cancelOnboarding = useCallback(() => {
    if (pollCleanupRef.current) {
      pollCleanupRef.current();
      pollCleanupRef.current = null;
    }

    addMessage('system', 'Onboarding cancelled');
    clearPersistedState();
    setPhase('NONE');
    setData(null);
    setMessages([]);
    setError(null);
    setBuildStatus(null);
  }, [addMessage, clearPersistedState]);

  // Retry last failed action
  const retryLastAction = useCallback(async () => {
    if (!data) return;

    setError(null);

    if (lastActionRef.current === 'submit') {
      setPhase('SUBMITTING');
      await submitWithData(data);
    }
    // 'analyze' retry would need the original prompt which we have in data
  }, [data]);

  // Clear error
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    phase,
    data,
    onboardingMessages: messages,
    currentQuestion,
    isRestoredFromStorage,
    error,
    isLoading,
    buildStatus,
    buildJustCompleted,
    startOnboarding,
    handleInspoSelect,
    handleInspoSkip,
    handleQuestionAnswer,
    handleQuestionSkip,
    submitFinalPrompt,
    cancelOnboarding,
    retryLastAction,
    clearError,
  };
}
