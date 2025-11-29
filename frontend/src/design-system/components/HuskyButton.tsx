import { Button } from '@heroui/react';
import type { ButtonProps } from '@heroui/react';
import { forwardRef } from 'react';

export interface HuskyButtonProps extends Omit<ButtonProps, 'color' | 'variant'> {
  /** Button variant style */
  variant?: 'primary' | 'secondary';
}

/**
 * HuskyButton - Husky AI branded buttons with solid colors
 *
 * - Primary: Solid purple background, white text
 * - Secondary: White background with border, dark text
 *
 * @example
 * ```tsx
 * <HuskyButton>Build with AI</HuskyButton>
 * <HuskyButton variant="secondary">Cancel</HuskyButton>
 * ```
 */
export const HuskyButton = forwardRef<HTMLButtonElement, HuskyButtonProps>(
  ({ variant = 'primary', className = '', children, ...props }, ref) => {
    const baseClasses = 'font-medium transition-all duration-200 rounded-xl';

    const variantClasses = {
      primary: 'btn-primary',
      secondary: 'btn-secondary',
    };

    return (
      <Button
        ref={ref}
        className={`${baseClasses} ${variantClasses[variant]} ${className}`}
        {...props}
      >
        {children}
      </Button>
    );
  }
);

HuskyButton.displayName = 'HuskyButton';

export default HuskyButton;
