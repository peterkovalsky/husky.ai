import { useState, useRef, useEffect } from 'react';
import { RadioGroup, Radio, Input, Button, Progress } from '@heroui/react';
import { ArrowRight, Sparkles } from 'lucide-react';
import type { ClarificationQuestion, ClarificationAnswer } from '../types/clarification';

interface ClarificationPanelProps {
  questions: ClarificationQuestion[];
  onSubmit: (answers: ClarificationAnswer[]) => void;
  onSurpriseMe: () => void;
  onCancel: () => void;
  isSubmitting: boolean;
  prompt: string;
}

export default function ClarificationPanel({
  questions,
  onSubmit,
  onSurpriseMe,
  onCancel,
  isSubmitting,
}: ClarificationPanelProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [freeTexts, setFreeTexts] = useState<Record<string, string>>({});
  const [slideDirection, setSlideDirection] = useState<'left' | 'right'>('left');
  const [isAnimating, setIsAnimating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const currentQuestion = questions[currentStep];
  const isLastStep = currentStep === questions.length - 1;
  const progress = ((currentStep + 1) / questions.length) * 100;

  // Focus input when step changes
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, [currentStep]);

  const buildAnswers = (): ClarificationAnswer[] => {
    return questions.map(q => {
      const selectedOptionId = selections[q.id];
      const freeText = freeTexts[q.id]?.trim();

      if (freeText) {
        return {
          questionId: q.id,
          questionText: q.question,
          freeTextAnswer: freeText
        };
      } else if (selectedOptionId) {
        const selectedOption = q.options.find(opt => opt.id === selectedOptionId);
        return {
          questionId: q.id,
          questionText: q.question,
          selectedOptionId,
          selectedOptionLabel: selectedOption?.label,
          selectedOptionDescription: selectedOption?.description
        };
      } else {
        return {
          questionId: q.id,
          questionText: q.question
        };
      }
    }).filter(a => a.selectedOptionId || a.freeTextAnswer);
  };

  const goToNextStep = () => {
    if (isLastStep) {
      onSubmit(buildAnswers());
    } else {
      setSlideDirection('left');
      setIsAnimating(true);
      setTimeout(() => {
        setCurrentStep(prev => prev + 1);
        setIsAnimating(false);
      }, 150);
    }
  };

  const goToPreviousStep = () => {
    if (currentStep > 0) {
      setSlideDirection('right');
      setIsAnimating(true);
      setTimeout(() => {
        setCurrentStep(prev => prev - 1);
        setIsAnimating(false);
      }, 150);
    } else {
      onCancel();
    }
  };

  const handleOptionSelect = (value: string) => {
    setSelections(prev => ({ ...prev, [currentQuestion.id]: value }));
    setFreeTexts(prev => ({ ...prev, [currentQuestion.id]: '' }));

    // Auto-advance after selection with a slight delay
    setTimeout(() => {
      goToNextStep();
    }, 200);
  };

  const handleFreeTextChange = (value: string) => {
    setFreeTexts(prev => ({ ...prev, [currentQuestion.id]: value }));
    if (value) {
      setSelections(prev => ({ ...prev, [currentQuestion.id]: '' }));
    }
  };

  const handleFreeTextKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && freeTexts[currentQuestion.id]?.trim()) {
      e.preventDefault();
      goToNextStep();
    }
  };

  const handleGenerate = () => {
    onSubmit(buildAnswers());
  };

  // Get slide animation classes
  const getSlideClasses = () => {
    if (isAnimating) {
      return slideDirection === 'left'
        ? 'opacity-0 -translate-x-8'
        : 'opacity-0 translate-x-8';
    }
    return 'opacity-100 translate-x-0';
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Progress bar */}
      <div className="mb-8">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm text-default-500">
            Question {currentStep + 1} of {questions.length}
          </span>
          <span className="text-sm text-default-500">
            {Math.round(progress)}%
          </span>
        </div>
        <Progress
          value={progress}
          size="sm"
          color="primary"
          aria-label="Question progress"
        />
      </div>

      {/* Question content with slide animation */}
      <div
        className={`transition-all duration-150 ease-out ${getSlideClasses()}`}
      >
        {/* Question */}
        <h3 className="text-2xl font-medium text-foreground mb-8 text-center">
          {currentQuestion.question}
        </h3>

        {/* Options as large buttons */}
        <RadioGroup
          value={selections[currentQuestion.id] || ''}
          onValueChange={handleOptionSelect}
          className="gap-3"
        >
          {currentQuestion.options.map((option) => (
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
            value={freeTexts[currentQuestion.id] || ''}
            onChange={(e) => handleFreeTextChange(e.target.value)}
            onKeyDown={handleFreeTextKeyDown}
            variant="bordered"
            size="lg"
            classNames={{
              input: 'text-base',
              inputWrapper: 'h-14'
            }}
            endContent={
              freeTexts[currentQuestion.id]?.trim() ? (
                <Button
                  isIconOnly
                  size="sm"
                  variant="flat"
                  color="primary"
                  onPress={goToNextStep}
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

      {/* Navigation */}
      <div className="flex justify-between items-center mt-10 pt-6 border-t border-divider">
        <Button
          variant="light"
          onPress={goToPreviousStep}
          isDisabled={isSubmitting}
        >
          {currentStep === 0 ? 'Cancel' : 'Back'}
        </Button>

        <div className="flex gap-3">
          <Button
            variant="flat"
            onPress={onSurpriseMe}
            isDisabled={isSubmitting}
            startContent={<Sparkles className="h-4 w-4" />}
          >
            Surprise Me
          </Button>
          <Button
            color="primary"
            onPress={handleGenerate}
            isLoading={isSubmitting}
          >
            Generate
          </Button>
        </div>
      </div>
    </div>
  );
}
