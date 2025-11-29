import { Card } from '@heroui/react';
import type { CardProps } from '@heroui/react';
import { forwardRef } from 'react';
import type { ReactNode } from 'react';

export interface GlassCardProps extends Omit<CardProps, 'shadow'> {
  /** Card glass intensity */
  intensity?: 'light' | 'medium' | 'heavy';
  /** Enable hover animation */
  hoverable?: boolean;
  /** Enable gradient border on hover */
  gradientBorder?: boolean;
  /** Card content */
  children: ReactNode;
}

/**
 * GlassCard - Glassmorphism card component
 *
 * Features frosted glass effect with optional gradient borders,
 * inspired by Canva's modern UI design.
 *
 * @example
 * ```tsx
 * <GlassCard>
 *   <CardBody>Content here</CardBody>
 * </GlassCard>
 *
 * <GlassCard hoverable gradientBorder>
 *   <CardBody>Interactive card</CardBody>
 * </GlassCard>
 * ```
 */
export const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(
  (
    {
      intensity = 'medium',
      hoverable = false,
      gradientBorder = false,
      className = '',
      children,
      ...props
    },
    ref
  ) => {
    const intensityClasses = {
      light: 'glass-light',
      medium: 'glass',
      heavy: 'backdrop-blur-xl bg-white/80 dark:bg-zinc-900/80',
    };

    const hoverClasses = hoverable
      ? 'transition-all duration-200 hover:-translate-y-1 hover:shadow-husky-lg cursor-pointer'
      : '';

    const borderClasses = gradientBorder ? 'gradient-border-animated' : '';

    return (
      <Card
        ref={ref}
        className={`
          ${intensityClasses[intensity]}
          ${hoverClasses}
          ${borderClasses}
          rounded-2xl
          ${className}
        `}
        shadow="none"
        {...props}
      >
        {children}
      </Card>
    );
  }
);

GlassCard.displayName = 'GlassCard';

export default GlassCard;
