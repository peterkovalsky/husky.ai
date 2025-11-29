export interface SkeletonLoaderProps {
  /** Width of the skeleton */
  width?: string | number;
  /** Height of the skeleton */
  height?: string | number;
  /** Border radius */
  rounded?: 'none' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
  /** Additional class names */
  className?: string;
}

/**
 * SkeletonLoader - Shimmer loading placeholder
 *
 * Displays a loading placeholder with a shimmer animation.
 * Use while content is loading.
 *
 * @example
 * ```tsx
 * <SkeletonLoader width={200} height={20} />
 * <SkeletonLoader width="100%" height={100} rounded="xl" />
 * ```
 */
export function SkeletonLoader({
  width = '100%',
  height = 20,
  rounded = 'md',
  className = '',
}: SkeletonLoaderProps) {
  const roundedClasses = {
    none: 'rounded-none',
    sm: 'rounded-sm',
    md: 'rounded-md',
    lg: 'rounded-lg',
    xl: 'rounded-xl',
    '2xl': 'rounded-2xl',
    full: 'rounded-full',
  };

  const style = {
    width: typeof width === 'number' ? `${width}px` : width,
    height: typeof height === 'number' ? `${height}px` : height,
  };

  return (
    <div
      className={`skeleton ${roundedClasses[rounded]} ${className}`}
      style={style}
    />
  );
}

export interface SkeletonCardProps {
  /** Number of text lines to show */
  lines?: number;
  /** Show avatar placeholder */
  showAvatar?: boolean;
  /** Additional class names */
  className?: string;
}

/**
 * SkeletonCard - Pre-composed skeleton for card content
 *
 * @example
 * ```tsx
 * <SkeletonCard lines={3} showAvatar />
 * ```
 */
export function SkeletonCard({
  lines = 3,
  showAvatar = false,
  className = '',
}: SkeletonCardProps) {
  return (
    <div className={`card-husky space-y-4 ${className}`}>
      {showAvatar && (
        <div className="flex items-center gap-3">
          <SkeletonLoader width={40} height={40} rounded="full" />
          <div className="flex-1 space-y-2">
            <SkeletonLoader width="60%" height={14} />
            <SkeletonLoader width="40%" height={12} />
          </div>
        </div>
      )}
      <div className="space-y-2">
        {Array.from({ length: lines }).map((_, i) => (
          <SkeletonLoader
            key={i}
            width={i === lines - 1 ? '70%' : '100%'}
            height={14}
          />
        ))}
      </div>
    </div>
  );
}

export default SkeletonLoader;
