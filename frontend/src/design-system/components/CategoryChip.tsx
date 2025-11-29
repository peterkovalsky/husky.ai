import { forwardRef } from 'react';
import type { ReactNode } from 'react';

export interface CategoryChipProps {
  /** Chip label */
  children: ReactNode;
  /** Icon to display before the label */
  icon?: ReactNode;
  /** Whether the chip is in active/selected state */
  active?: boolean;
  /** Use gradient style instead of outlined */
  gradient?: boolean;
  /** Click handler */
  onClick?: () => void;
  /** Additional class names */
  className?: string;
  /** Disabled state */
  disabled?: boolean;
}

/**
 * CategoryChip - Pill-shaped category button
 *
 * Inspired by Canva's category pills (Design, Image, Doc, Code, Video).
 * Perfect for filters, tags, and category selection.
 *
 * @example
 * ```tsx
 * <CategoryChip icon={<DesignIcon />}>Design</CategoryChip>
 * <CategoryChip active>Image</CategoryChip>
 * <CategoryChip gradient>Code</CategoryChip>
 * ```
 */
export const CategoryChip = forwardRef<HTMLButtonElement, CategoryChipProps>(
  (
    {
      children,
      icon,
      active = false,
      gradient = false,
      onClick,
      className = '',
      disabled = false,
    },
    ref
  ) => {
    if (gradient) {
      return (
        <button
          ref={ref}
          type="button"
          onClick={onClick}
          disabled={disabled}
          className={`
            chip-category-gradient
            ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
            ${className}
          `}
        >
          {icon && <span className="flex-shrink-0">{icon}</span>}
          <span>{children}</span>
        </button>
      );
    }

    return (
      <button
        ref={ref}
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={`
          chip-category
          ${active ? 'active' : ''}
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
          ${className}
        `}
      >
        {icon && <span className="flex-shrink-0">{icon}</span>}
        <span>{children}</span>
      </button>
    );
  }
);

CategoryChip.displayName = 'CategoryChip';

export default CategoryChip;
