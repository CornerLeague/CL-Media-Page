import React from 'react';
import { RefreshCw, Loader2, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'pulse' | 'activity';
  className?: string;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'md',
  variant = 'default',
  className
}) => {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-6 w-6',
    lg: 'h-8 w-8'
  };

  const Icon = variant === 'activity' ? Activity : variant === 'pulse' ? RefreshCw : Loader2;

  return (
    <Icon
      className={cn(
        'animate-spin text-muted-foreground',
        sizeClasses[size],
        className
      )}
    />
  );
};

interface LoadingCardProps {
  title?: string;
  description?: string;
  showSpinner?: boolean;
  className?: string;
}

export const LoadingCard: React.FC<LoadingCardProps> = ({
  title = 'Loading...',
  description,
  showSpinner = true,
  className
}) => {
  return (
    <div className={cn(
      'flex flex-col items-center justify-center p-8 space-y-4 bg-card rounded-lg border',
      className
    )}>
      {showSpinner && <LoadingSpinner size="lg" />}
      <div className="text-center space-y-2">
        <h3 className="text-lg font-medium text-foreground">{title}</h3>
        {description && (
          <p className="text-sm text-muted-foreground max-w-sm">{description}</p>
        )}
      </div>
    </div>
  );
};

interface LoadingOverlayProps {
  isVisible: boolean;
  message?: string;
  className?: string;
}

export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({
  isVisible,
  message = 'Loading...',
  className
}) => {
  if (!isVisible) return null;

  return (
    <div className={cn(
      'absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50',
      className
    )}>
      <div className="flex flex-col items-center space-y-3">
        <LoadingSpinner size="lg" />
        <p className="text-sm font-medium text-foreground">{message}</p>
      </div>
    </div>
  );
};

interface SkeletonListProps {
  count?: number;
  itemHeight?: string;
  showAvatar?: boolean;
  className?: string;
}

export const SkeletonList: React.FC<SkeletonListProps> = ({
  count = 3,
  itemHeight = 'h-16',
  showAvatar = false,
  className
}) => {
  return (
    <div className={cn('space-y-3', className)}>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className={cn('flex items-center space-x-3', itemHeight)}>
          {showAvatar && <Skeleton className="h-10 w-10 rounded-full" />}
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
};

interface SportTransitionLoadingProps {
  sportName?: string;
  className?: string;
}

export const SportTransitionLoading: React.FC<SportTransitionLoadingProps> = ({
  sportName,
  className
}) => {
  return (
    <div className={cn(
      'flex items-center justify-center p-6 space-x-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800',
      className
    )}>
      <LoadingSpinner variant="activity" className="text-blue-600 dark:text-blue-400" />
      <div className="text-center">
        <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
          Switching to {sportName || 'new sport'}...
        </p>
        <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
          Loading latest scores and updates
        </p>
      </div>
    </div>
  );
};