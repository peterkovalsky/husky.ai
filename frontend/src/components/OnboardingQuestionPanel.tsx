import { useState, useRef, useEffect } from 'react';
import { RadioGroup, Radio, Input, Button, Progress } from '@heroui/react';
import { ArrowRight, SkipForward, X } from 'lucide-react';
import type { ClarificationQuestion, ClarificationAnswer } from '../types/clarification';

interface OnboardingQuestionPanelProps {
  question: ClarificationQuestion;
  questionNumber: number;
  totalQuestions: number;
  onAnswer: (answer: ClarificationAnswer) => void;
  onSkip: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export default function OnboardingQuestionPanel({
  question,
  questionNumber,
  totalQuestions,
  onAnswer,
  onSkip,
  onCancel,
  isLoading = false,
}: OnboardingQuestionPanelProps) {
  const [selection, setSelection] = useState<string>('');
  const [freeText, setFreeText] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);

  const progress = (questionNumber / totalQuestions) * 100;

  // Focus input when question changes
  useEffect(() => {
    setSelection('');
    setFreeText('');
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, [question.id]);

  const buildAnswer = (optionId?: string, text?: string): ClarificationAnswer => {
    if (text) {
      return {
        questionId: question.id,
        questionText: question.question,
        freeTextAnswer: text,
      };
    } else if (optionId) {
      const selectedOption = question.options.find(opt => opt.id === optionId);
      return {
        questionId: question.id,
        questionText: question.question,
        selectedOptionId: optionId,
        selectedOptionLabel: selectedOption?.label,
        selectedOptionDescription: selectedOption?.description,
      };
    }
    return {
      questionId: question.id,
      questionText: question.question,
    };
  };

  const handleOptionSelect = (value: string) => {
    setSelection(value);
    setFreeText('');

    // Auto-advance after selection with a slight delay
    setTimeout(() => {
      onAnswer(buildAnswer(value));
    }, 200);
  };

  const handleFreeTextChange = (value: string) => {
    setFreeText(value);
    if (value) {
      setSelection('');
    }
  };

  const handleFreeTextKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && freeText.trim()) {
      e.preventDefault();
      onAnswer(buildAnswer(undefined, freeText.trim()));
    }
  };

  const handleFreeTextSubmit = () => {
    if (freeText.trim()) {
      onAnswer(buildAnswer(undefined, freeText.trim()));
    }
  };

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header with cancel button */}
      <div className="flex items-center justify-between p-4 border-b border-divider">
        <span className="text-sm text-default-500">
          Question {questionNumber} of {totalQuestions}
        </span>
        <Button
          variant="light"
          size="sm"
          isIconOnly
          onPress={onCancel}
          title="Cancel onboarding"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Progress bar */}
      <div className="px-6 pt-6">
        <Progress
          value={progress}
          size="sm"
          color="primary"
          aria-label="Question progress"
          classNames={{
            track: "h-1",
          }}
        />
      </div>

      {/* Question content */}
      <div className="flex-1 overflow-y-auto px-6 py-8">
        <div className="max-w-lg mx-auto">
          {/* Question */}
          <h3 className="text-2xl font-medium text-foreground mb-8 text-center">
            {question.question}
          </h3>

          {/* Options as large buttons */}
          <RadioGroup
            value={selection}
            onValueChange={handleOptionSelect}
            className="gap-3"
            isDisabled={isLoading}
          >
            {question.options.map((option) => (
              <Radio
                key={option.id}
                value={option.id}
                classNames={{
                  base: `
                    w-full max-w-none m-0 p-4
                    border-2 border-default-200 rounded-xl
                    cursor-pointer
                    hover:border-primary hover:bg-primary-50/50
                    data-[selected=true]:border-primary data-[selected=true]:bg-primary-50
                    transition-all duration-150
                  `,
                  wrapper: 'hidden',
                  labelWrapper: 'w-full m-0',
                  label: 'w-full',
                }}
              >
                <div className="flex items-center justify-between w-full">
                  <div>
                    <div className="font-medium text-foreground">{option.label}</div>
                    {option.description && (
                      <div className="text-sm text-default-500 mt-0.5">{option.description}</div>
                    )}
                  </div>
                  <ArrowRight className="h-4 w-4 text-default-400" />
                </div>
              </Radio>
            ))}
          </RadioGroup>

          {/* Free text input */}
          <div className="mt-4">
            <Input
              ref={inputRef}
              placeholder="Or type your own answer..."
              value={freeText}
              onChange={(e) => handleFreeTextChange(e.target.value)}
              onKeyDown={handleFreeTextKeyDown}
              variant="bordered"
              size="lg"
              isDisabled={isLoading}
              classNames={{
                input: 'text-base',
                inputWrapper: 'h-14'
              }}
              endContent={
                freeText.trim() ? (
                  <Button
                    isIconOnly
                    size="sm"
                    variant="flat"
                    color="primary"
                    onPress={handleFreeTextSubmit}
                    isDisabled={isLoading}
                  >
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                ) : null
              }
            />
            <p className="text-xs text-default-400 mt-2 text-center">
              Press Enter to continue
            </p>
          </div>
        </div>
      </div>

      {/* Footer with Skip button */}
      <div className="p-4 border-t border-divider">
        <div className="max-w-lg mx-auto flex justify-end">
          <Button
            variant="flat"
            onPress={onSkip}
            isDisabled={isLoading}
            startContent={<SkipForward className="h-4 w-4" />}
          >
            Skip this question
          </Button>
        </div>
      </div>
    </div>
  );
}
