import type { ReactNode } from 'react';

export interface HeroBackgroundProps {
  /** Content to render inside the hero section */
  children: ReactNode;
  /** Background variant */
  variant?: 'gradient' | 'subtle' | 'pattern';
  /** Additional class names */
  className?: string;
}

/**
 * HeroBackground - Gradient hero section background
 *
 * Inspired by Canva's purple-pink-cyan gradient backgrounds.
 * Perfect for hero sections, headers, and featured areas.
 *
 * @example
 * ```tsx
 * <HeroBackground variant="gradient">
 *   <h1>Welcome to Husky AI</h1>
 * </HeroBackground>
 *
 * <HeroBackground variant="subtle">
 *   <div>Subtle background content</div>
 * </HeroBackground>
 * ```
 */
export function HeroBackground({
  children,
  variant = 'gradient',
  className = '',
}: HeroBackgroundProps) {
  const variantClasses = {
    gradient: 'gradient-hero',
    subtle: 'gradient-hero-subtle',
    pattern: 'hero-pattern',
  };

  return (
    <div
      className={`
        ${variantClasses[variant]}
        relative overflow-hidden
        ${className}
      `}
    >
      {/* Decorative elements */}
      {variant === 'gradient' && (
        <>
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-white/20 rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-cyan-300/20 rounded-full blur-3xl" />
        </>
      )}

      {/* Content */}
      <div className="relative z-10">{children}</div>
    </div>
  );
}

export default HeroBackground;
