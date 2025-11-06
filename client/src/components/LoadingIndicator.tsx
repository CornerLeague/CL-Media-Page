import React from 'react';
import { cn } from '@/lib/utils';
import { ProgressIndicator, LoadingSpinner, LoadingOverlay } from '@/components/ProgressIndicator';

export interface LoadingIndicatorProps {
  /** Optional operation name (e.g., 'initial', 'refresh', 'sport-change', 'connecting') */
  operation?: string | null;
  /** Message to display under the indicator */
  message?: string;
  /** Progress percentage (0-100) for determinate variants */
  progress?: number;
  /** Visual variant */
  variant?: 'spinner' | 'linear' | 'circular';
  /** Whether to render as an overlay */
  overlay?: boolean;
  /** Additional container classes */
  className?: string;
  /** Size for spinner/circular variants */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Accessible label for screen readers */
  ariaLabel?: string;
}

/**
 * Unified LoadingIndicator for showing progress and messages.
 * Wraps existing ProgressIndicator/LoadingSpinner to keep styling consistent.
 */
export const LoadingIndicator: React.FC<LoadingIndicatorProps> = ({
  operation = null,
  message = 'Loading...',
  progress,
  variant = 'spinner',
  overlay = false,
  className,
  size = 'md',
  ariaLabel,
}) => {
  const label = ariaLabel || (operation ? `${operation} in progress` : 'Loading');

  if (overlay) {
    return (
      <LoadingOverlay
        isVisible={true}
        message={message}
        className={className}
      />
    );
  }

  return (
    <div
      className={cn('flex items-center gap-3', className)}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={label}
    >
      {variant === 'spinner' && (
        <LoadingSpinner size={size} />
      )}
      {variant === 'circular' && (
        <ProgressIndicator variant="circular" value={progress} indeterminate={progress === undefined} />
      )}
      {variant === 'linear' && (
        <div className="flex-1">
          <ProgressIndicator variant="linear" value={progress} indeterminate={progress === undefined} />
        </div>
      )}
      {message && (
        <span className="text-sm text-muted-foreground">{message}</span>
      )}
    </div>
  );
};

export default LoadingIndicator;