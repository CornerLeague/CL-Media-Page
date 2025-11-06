import React from 'react';
import { LoadingCard, LoadingOverlay, SportTransitionLoading } from './loading-states';
import { ErrorCard, ConnectionError, SportError } from './error-states';
import { cn } from '@/lib/utils';

interface StateManagerProps {
  isLoading?: boolean;
  isTransitioning?: boolean;
  error?: Error | string | null;
  isEmpty?: boolean;
  emptyMessage?: string;
  emptyTitle?: string;
  loadingMessage?: string;
  sportName?: string;
  onRetry?: () => void;
  onChangeSport?: () => void;
  overlay?: boolean;
  className?: string;
  children: React.ReactNode;
}

export const StateManager: React.FC<StateManagerProps> = ({
  isLoading = false,
  isTransitioning = false,
  error,
  isEmpty = false,
  emptyMessage = 'No data available',
  emptyTitle = 'Nothing to show',
  loadingMessage = 'Loading...',
  sportName,
  onRetry,
  onChangeSport,
  overlay = false,
  className,
  children
}) => {
  // Handle error states
  if (error) {
    const errorMessage = typeof error === 'string' ? error : error.message;
    
    // Check for specific error types
    if (errorMessage.toLowerCase().includes('network') || 
        errorMessage.toLowerCase().includes('connection') ||
        errorMessage.toLowerCase().includes('fetch')) {
      return (
        <div className={className}>
          <ConnectionError onRetry={onRetry} />
        </div>
      );
    }

    // Sport-specific errors
    if (sportName) {
      const errorType = errorMessage.toLowerCase().includes('data') ? 'data' : 'load';
      return (
        <div className={className}>
          <SportError
            sportName={sportName}
            errorType={errorType}
            onRetry={onRetry}
            onChangeSport={onChangeSport}
          />
        </div>
      );
    }

    // Generic error
    return (
      <div className={className}>
        <ErrorCard
          message={errorMessage}
          onRetry={onRetry}
        />
      </div>
    );
  }

  // Handle loading states
  if (isLoading || isTransitioning) {
    if (isTransitioning && sportName) {
      return (
        <div className={className}>
          <SportTransitionLoading sportName={sportName} />
        </div>
      );
    }

    if (overlay) {
      return (
        <div className={cn('relative', className)}>
          {children}
          <LoadingOverlay isVisible={true} message={loadingMessage} />
        </div>
      );
    }

    return (
      <div className={className}>
        <LoadingCard title={loadingMessage} />
      </div>
    );
  }

  // Handle empty states
  if (isEmpty) {
    return (
      <div className={className}>
        <div className="flex flex-col items-center justify-center p-8 space-y-4 bg-muted/50 rounded-lg border border-dashed">
          <div className="text-center space-y-2">
            <h3 className="text-lg font-medium text-muted-foreground">{emptyTitle}</h3>
            <p className="text-sm text-muted-foreground/80 max-w-sm">{emptyMessage}</p>
          </div>
          {onRetry && (
            <button
              onClick={onRetry}
              className="text-sm text-primary hover:text-primary/80 underline"
            >
              Refresh
            </button>
          )}
        </div>
      </div>
    );
  }

  // Render children when everything is loaded successfully
  return <div className={className}>{children}</div>;
};

// Convenience hook for common state patterns
export const useStateManager = (
  isLoading: boolean,
  error: Error | string | null,
  data: any,
  options?: {
    emptyCheck?: (data: any) => boolean;
    sportName?: string;
  }
) => {
  const isEmpty = options?.emptyCheck 
    ? options.emptyCheck(data)
    : !data || (Array.isArray(data) && data.length === 0);

  return {
    isLoading,
    error,
    isEmpty: !isLoading && !error && isEmpty,
    sportName: options?.sportName
  };
};