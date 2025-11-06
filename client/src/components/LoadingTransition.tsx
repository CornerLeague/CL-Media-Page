import React, { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { LoadingSpinner, ProgressIndicator } from './ProgressIndicator';
import { ScoresSkeleton } from './ScoresSkeleton';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface LoadingTransitionProps {
  /** Whether content is loading */
  isLoading: boolean;
  /** Children to render when not loading */
  children: React.ReactNode;
  /** Loading component to show */
  loadingComponent?: React.ReactNode;
  /** Transition type */
  transition?: 'fade' | 'slide' | 'scale' | 'skeleton';
  /** Transition duration in milliseconds */
  duration?: number;
  /** Minimum loading time to prevent flashing */
  minLoadingTime?: number;
  /** Additional CSS classes */
  className?: string;
  /** Loading message */
  message?: string;
  /** Show progress if available */
  progress?: number;
  /** Delay before showing loading state */
  delay?: number;
}

export interface FadeTransitionProps {
  /** Whether to show content */
  show: boolean;
  /** Children to render */
  children: React.ReactNode;
  /** Transition duration */
  duration?: number;
  /** Additional CSS classes */
  className?: string;
}

export interface SkeletonTransitionProps {
  /** Whether content is loading */
  isLoading: boolean;
  /** Children to render when loaded */
  children: React.ReactNode;
  /** Skeleton component */
  skeleton?: React.ReactNode;
  /** Number of skeleton items */
  skeletonCount?: number;
  /** Skeleton variant */
  skeletonVariant?: 'scores' | 'cards' | 'list' | 'custom';
  /** Additional CSS classes */
  className?: string;
}

// ============================================================================
// FADE TRANSITION COMPONENT
// ============================================================================

export const FadeTransition: React.FC<FadeTransitionProps> = ({
  show,
  children,
  duration = 300,
  className,
}) => {
  const [shouldRender, setShouldRender] = useState(show);
  const [isVisible, setIsVisible] = useState(show);

  useEffect(() => {
    if (show) {
      setShouldRender(true);
      // Small delay to ensure DOM is ready
      const timer = setTimeout(() => setIsVisible(true), 10);
      return () => clearTimeout(timer);
    } else {
      setIsVisible(false);
      const timer = setTimeout(() => setShouldRender(false), duration);
      return () => clearTimeout(timer);
    }
  }, [show, duration]);

  if (!shouldRender) return null;

  return (
    <div
      className={cn(
        'transition-opacity ease-in-out',
        isVisible ? 'opacity-100' : 'opacity-0',
        className
      )}
      style={{ transitionDuration: `${duration}ms` }}
    >
      {children}
    </div>
  );
};

// ============================================================================
// SLIDE TRANSITION COMPONENT
// ============================================================================

export const SlideTransition: React.FC<FadeTransitionProps> = ({
  show,
  children,
  duration = 300,
  className,
}) => {
  const [shouldRender, setShouldRender] = useState(show);
  const [isVisible, setIsVisible] = useState(show);

  useEffect(() => {
    if (show) {
      setShouldRender(true);
      const timer = setTimeout(() => setIsVisible(true), 10);
      return () => clearTimeout(timer);
    } else {
      setIsVisible(false);
      const timer = setTimeout(() => setShouldRender(false), duration);
      return () => clearTimeout(timer);
    }
  }, [show, duration]);

  if (!shouldRender) return null;

  return (
    <div
      className={cn(
        'transition-all ease-in-out transform',
        isVisible 
          ? 'translate-y-0 opacity-100' 
          : 'translate-y-4 opacity-0',
        className
      )}
      style={{ transitionDuration: `${duration}ms` }}
    >
      {children}
    </div>
  );
};

// ============================================================================
// SCALE TRANSITION COMPONENT
// ============================================================================

export const ScaleTransition: React.FC<FadeTransitionProps> = ({
  show,
  children,
  duration = 300,
  className,
}) => {
  const [shouldRender, setShouldRender] = useState(show);
  const [isVisible, setIsVisible] = useState(show);

  useEffect(() => {
    if (show) {
      setShouldRender(true);
      const timer = setTimeout(() => setIsVisible(true), 10);
      return () => clearTimeout(timer);
    } else {
      setIsVisible(false);
      const timer = setTimeout(() => setShouldRender(false), duration);
      return () => clearTimeout(timer);
    }
  }, [show, duration]);

  if (!shouldRender) return null;

  return (
    <div
      className={cn(
        'transition-all ease-in-out transform origin-center',
        isVisible 
          ? 'scale-100 opacity-100' 
          : 'scale-95 opacity-0',
        className
      )}
      style={{ transitionDuration: `${duration}ms` }}
    >
      {children}
    </div>
  );
};

// ============================================================================
// SKELETON TRANSITION COMPONENT
// ============================================================================

export const SkeletonTransition: React.FC<SkeletonTransitionProps> = ({
  isLoading,
  children,
  skeleton,
  skeletonCount = 3,
  skeletonVariant = 'scores',
  className,
}) => {
  const getDefaultSkeleton = () => {
    switch (skeletonVariant) {
      case 'scores':
        return <ScoresSkeleton count={skeletonCount} />;
      case 'cards':
        return <ScoresSkeleton count={skeletonCount} compact />;
      case 'list':
        return (
          <div className="space-y-2">
            {Array.from({ length: skeletonCount }).map((_, index) => (
              <div key={index} className="flex items-center space-x-3 p-3">
                <div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-3/4 animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        );
      default:
        return skeleton;
    }
  };

  return (
    <div className={className}>
      <FadeTransition show={isLoading}>
        {skeleton || getDefaultSkeleton()}
      </FadeTransition>
      
      <FadeTransition show={!isLoading}>
        {children}
      </FadeTransition>
    </div>
  );
};

// ============================================================================
// MAIN LOADING TRANSITION COMPONENT
// ============================================================================

export const LoadingTransition: React.FC<LoadingTransitionProps> = ({
  isLoading,
  children,
  loadingComponent,
  transition = 'fade',
  duration = 300,
  minLoadingTime = 500,
  className,
  message = 'Loading...',
  progress,
  delay = 200,
}) => {
  const [showLoading, setShowLoading] = useState(false);
  const [isMinTimeElapsed, setIsMinTimeElapsed] = useState(false);
  const loadingStartTime = useRef<number | null>(null);
  const delayTimer = useRef<NodeJS.Timeout | null>(null);
  const minTimeTimer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isLoading) {
      // Start delay timer
      delayTimer.current = setTimeout(() => {
        setShowLoading(true);
        loadingStartTime.current = Date.now();
        setIsMinTimeElapsed(false);
        
        // Start minimum time timer
        minTimeTimer.current = setTimeout(() => {
          setIsMinTimeElapsed(true);
        }, minLoadingTime);
      }, delay);
    } else {
      // Clear delay timer if loading stops before delay
      if (delayTimer.current) {
        clearTimeout(delayTimer.current);
        delayTimer.current = null;
      }

      // If loading was shown, wait for minimum time
      if (showLoading && !isMinTimeElapsed && loadingStartTime.current) {
        const elapsed = Date.now() - loadingStartTime.current;
        const remaining = Math.max(0, minLoadingTime - elapsed);
        
        setTimeout(() => {
          setShowLoading(false);
          setIsMinTimeElapsed(false);
        }, remaining);
      } else {
        setShowLoading(false);
        setIsMinTimeElapsed(false);
      }
    }

    return () => {
      if (delayTimer.current) {
        clearTimeout(delayTimer.current);
      }
      if (minTimeTimer.current) {
        clearTimeout(minTimeTimer.current);
      }
    };
  }, [isLoading, delay, minLoadingTime, showLoading, isMinTimeElapsed]);

  const defaultLoadingComponent = (
    <div className="flex flex-col items-center justify-center py-8 space-y-4">
      <LoadingSpinner size="lg" />
      <p className="text-gray-600 dark:text-gray-400">{message}</p>
      {progress !== undefined && (
        <ProgressIndicator
          variant="linear"
          value={progress}
          showValue
          className="w-48"
        />
      )}
    </div>
  );

  const renderTransition = (show: boolean, content: React.ReactNode) => {
    switch (transition) {
      case 'slide':
        return (
          <SlideTransition show={show} duration={duration}>
            {content}
          </SlideTransition>
        );
      case 'scale':
        return (
          <ScaleTransition show={show} duration={duration}>
            {content}
          </ScaleTransition>
        );
      case 'skeleton':
        return (
          <SkeletonTransition isLoading={show} className={className}>
            {content}
          </SkeletonTransition>
        );
      case 'fade':
      default:
        return (
          <FadeTransition show={show} duration={duration}>
            {content}
          </FadeTransition>
        );
    }
  };

  return (
    <div className={cn('relative', className)}>
      {renderTransition(showLoading, loadingComponent || defaultLoadingComponent)}
      {renderTransition(!showLoading, children)}
    </div>
  );
};

// ============================================================================
// LOADING STATE WRAPPER
// ============================================================================

export const LoadingStateWrapper: React.FC<{
  isLoading: boolean;
  error?: Error | null;
  children: React.ReactNode;
  loadingComponent?: React.ReactNode;
  errorComponent?: React.ReactNode;
  emptyComponent?: React.ReactNode;
  isEmpty?: boolean;
  className?: string;
}> = ({
  isLoading,
  error,
  children,
  loadingComponent,
  errorComponent,
  emptyComponent,
  isEmpty = false,
  className,
}) => {
  if (error) {
    return (
      <div className={className}>
        {errorComponent || (
          <div className="flex flex-col items-center justify-center py-8 space-y-4">
            <div className="text-red-500 text-lg">⚠️</div>
            <p className="text-red-600 dark:text-red-400">
              {error.message || 'An error occurred'}
            </p>
          </div>
        )}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className={className}>
        {loadingComponent || (
          <div className="flex items-center justify-center py-8">
            <LoadingSpinner size="lg" />
          </div>
        )}
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className={className}>
        {emptyComponent || (
          <div className="flex flex-col items-center justify-center py-8 space-y-4">
            <div className="text-gray-400 text-lg">📭</div>
            <p className="text-gray-600 dark:text-gray-400">No data available</p>
          </div>
        )}
      </div>
    );
  }

  return <div className={className}>{children}</div>;
};

// ============================================================================
// EXPORT DEFAULT
// ============================================================================

export default LoadingTransition;