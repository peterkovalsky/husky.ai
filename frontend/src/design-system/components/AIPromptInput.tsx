import { Textarea } from '@heroui/react';
import type { TextAreaProps } from '@heroui/react';
import { forwardRef } from 'react';
import type { ReactNode } from 'react';

export interface AIPromptInputProps extends Omit<TextAreaProps, 'classNames'> {
  /** Left side action button (like Canva's + button) */
  startContent?: ReactNode;
  /** Right side action buttons (like mic, send) */
  endContent?: ReactNode;
  /** Bottom action chips (like Design, Image, Doc categories) */
  bottomContent?: ReactNode;
  /** Show animated gradient border on focus */
  gradientBorder?: boolean;
}

/**
 * AIPromptInput - Large AI prompt input field
 *
 * Inspired by Canva's main AI input with the animated gradient border,
 * action buttons, and category chips.
 *
 * @example
 * ```tsx
 * <AIPromptInput
 *   placeholder="Describe your idea, and I'll bring it to life"
 *   startContent={<PlusButton />}
 *   endContent={<SendButton />}
 *   bottomContent={
 *     <div className="flex gap-2">
 *       <CategoryChip icon={<DesignIcon />}>Design</CategoryChip>
 *       <CategoryChip icon={<ImageIcon />}>Image</CategoryChip>
 *     </div>
 *   }
 * />
 * ```
 */
export const AIPromptInput = forwardRef<HTMLTextAreaElement, AIPromptInputProps>(
  (
    {
      startContent,
      endContent,
      bottomContent,
      gradientBorder = true,
      placeholder = "Describe your idea, and I'll bring it to life",
      className = '',
      ...props
    },
    ref
  ) => {
    const wrapperClasses = gradientBorder ? 'gradient-border-animated' : '';

    return (
      <div className={`${wrapperClasses} ${className}`}>
        <div className="bg-white dark:bg-zinc-900 rounded-[1.15rem] p-4">
          {/* Main input area */}
          <div className="flex items-start gap-3">
            {startContent && (
              <div className="flex-shrink-0 pt-1">{startContent}</div>
            )}

            <Textarea
              ref={ref}
              placeholder={placeholder}
              minRows={1}
              maxRows={6}
              classNames={{
                base: 'flex-1',
                inputWrapper: [
                  'bg-transparent',
                  'shadow-none',
                  'border-none',
                  'hover:bg-transparent',
                  'group-data-[focus=true]:bg-transparent',
                  'p-0',
                ].join(' '),
                input: [
                  'text-base',
                  'text-zinc-700 dark:text-zinc-200',
                  'placeholder:text-zinc-400',
                  'resize-none',
                ].join(' '),
              }}
              {...props}
            />

            {endContent && (
              <div className="flex items-center gap-2 flex-shrink-0 pt-1">
                {endContent}
              </div>
            )}
          </div>

          {/* Bottom category chips */}
          {bottomContent && (
            <div className="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
              {bottomContent}
            </div>
          )}
        </div>
      </div>
    );
  }
);

AIPromptInput.displayName = 'AIPromptInput';

export default AIPromptInput;
