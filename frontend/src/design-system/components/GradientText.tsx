import type { ReactNode, ElementType } from 'react';

export interface GradientTextProps {
  /** Text content */
  children: ReactNode;
  /** Gradient variant */
  variant?: 'husky' | 'hero' | 'cyan';
  /** HTML element to render as */
  as?: ElementType;
  /** Additional class names */
  className?: string;
}

/**
 * GradientText - Text with gradient fill
 *
 * Renders text with a beautiful gradient background.
 * Perfect for headings and emphasis.
 *
 * @example
 * ```tsx
 * <GradientText as="h1" className="text-5xl font-bold">
 *   Welcome to Husky AI
 * </GradientText>
 *
 * <GradientText variant="cyan">
 *   Create beautiful apps
 * </GradientText>
 * ```
 */
export function GradientText({
  children,
  variant = 'husky',
  as: Component = 'span',
  className = '',
}: GradientTextProps) {
  const variantClasses = {
    husky: 'text-gradient',
    hero: 'text-gradient-hero',
    cyan: 'bg-gradient-to-r from-cyan-500 to-cyan-400 bg-clip-text text-transparent',
  };

  return (
    <Component className={`${variantClasses[variant]} ${className}`}>
      {children}
    </Component>
  );
}

export default GradientText;
