import { Chip } from '@heroui/react';
import type { ChipProps } from '@heroui/react';
import { forwardRef } from 'react';

export type JobStatus = 'queued' | 'processing' | 'building' | 'ready' | 'failed';

export interface StatusBadgeProps extends Omit<ChipProps, 'color' | 'variant'> {
  /** Job status */
  status: JobStatus;
  /** Show gradient background instead of solid */
  gradient?: boolean;
  /** Show pulsing animation for active states */
  animated?: boolean;
}

const statusConfig: Record<JobStatus, {
  label: string;
  bgClass: string;
  textClass: string;
  gradientClass: string;
}> = {
  queued: {
    label: 'Queued',
    bgClass: 'bg-amber-100',
    textClass: 'text-amber-700',
    gradientClass: 'status-queued',
  },
  processing: {
    label: 'Processing',
    bgClass: 'bg-blue-100',
    textClass: 'text-blue-700',
    gradientClass: 'status-processing',
  },
  building: {
    label: 'Building',
    bgClass: 'bg-husky-100',
    textClass: 'text-husky-700',
    gradientClass: 'status-building',
  },
  ready: {
    label: 'Ready',
    bgClass: 'bg-green-100',
    textClass: 'text-green-700',
    gradientClass: 'status-ready',
  },
  failed: {
    label: 'Failed',
    bgClass: 'bg-red-100',
    textClass: 'text-red-700',
    gradientClass: 'status-failed',
  },
};

/**
 * StatusBadge - Job status indicator
 *
 * Displays job status with appropriate colors and optional animations.
 * Can use solid colors or gradients.
 *
 * @example
 * ```tsx
 * <StatusBadge status="processing" />
 * <StatusBadge status="building" gradient animated />
 * <StatusBadge status="ready" />
 * ```
 */
export const StatusBadge = forwardRef<HTMLDivElement, StatusBadgeProps>(
  ({ status, gradient = false, animated = false, className = '', ...props }, ref) => {
    const config = statusConfig[status];
    const isActive = status === 'processing' || status === 'building';
    const showAnimation = animated && isActive;

    if (gradient) {
      return (
        <div
          ref={ref}
          className={`
            inline-flex items-center gap-1.5 px-3 py-1
            ${config.gradientClass}
            text-white text-sm font-medium
            rounded-full
            ${showAnimation ? 'animate-pulse-husky' : ''}
            ${className}
          `}
          {...(props as React.HTMLAttributes<HTMLDivElement>)}
        >
          {showAnimation && (
            <span className="w-2 h-2 rounded-full bg-white/80 animate-pulse" />
          )}
          {config.label}
        </div>
      );
    }

    return (
      <Chip
        ref={ref}
        size="sm"
        className={`
          ${config.bgClass} ${config.textClass}
          ${showAnimation ? 'animate-pulse' : ''}
          ${className}
        `}
        {...props}
      >
        <span className="flex items-center gap-1.5">
          {showAnimation && (
            <span className={`w-1.5 h-1.5 rounded-full ${config.textClass.replace('text-', 'bg-')} animate-pulse`} />
          )}
          {config.label}
        </span>
      </Chip>
    );
  }
);

StatusBadge.displayName = 'StatusBadge';

export default StatusBadge;
