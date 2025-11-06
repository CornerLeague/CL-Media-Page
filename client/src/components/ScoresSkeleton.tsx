import React from 'react';
import { cn } from '@/lib/utils';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface ScoresSkeletonProps {
  /** Number of score items to show */
  count?: number;
  /** Show compact version */
  compact?: boolean;
  /** Additional CSS classes */
  className?: string;
  /** Show header skeleton */
  showHeader?: boolean;
  /** Animation type */
  animation?: 'pulse' | 'wave' | 'none';
}

export interface SkeletonItemProps {
  /** Width of the skeleton */
  width?: string | number;
  /** Height of the skeleton */
  height?: string | number;
  /** Border radius */
  rounded?: 'none' | 'sm' | 'md' | 'lg' | 'full';
  /** Additional CSS classes */
  className?: string;
  /** Animation type */
  animation?: 'pulse' | 'wave' | 'none';
}

// ============================================================================
// SKELETON ITEM COMPONENT
// ============================================================================

export const SkeletonItem: React.FC<SkeletonItemProps> = ({
  width = '100%',
  height = '1rem',
  rounded = 'md',
  className,
  animation = 'pulse',
}) => {
  const roundedClasses = {
    none: '',
    sm: 'rounded-sm',
    md: 'rounded-md',
    lg: 'rounded-lg',
    full: 'rounded-full',
  };

  const animationClasses = {
    pulse: 'animate-pulse',
    wave: 'animate-wave',
    none: '',
  };

  return (
    <div
      className={cn(
        'bg-gray-200 dark:bg-gray-700',
        roundedClasses[rounded],
        animationClasses[animation],
        className
      )}
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
      }}
    />
  );
};

// ============================================================================
// SCORE CARD SKELETON
// ============================================================================

export const ScoreCardSkeleton: React.FC<{
  compact?: boolean;
  animation?: 'pulse' | 'wave' | 'none';
}> = ({ compact = false, animation = 'pulse' }) => {
  if (compact) {
    return (
      <div className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        {/* Team names */}
        <div className="flex-1 space-y-2">
          <SkeletonItem width="60%" height="0.875rem" animation={animation} />
          <SkeletonItem width="55%" height="0.875rem" animation={animation} />
        </div>
        
        {/* Scores */}
        <div className="flex flex-col items-end space-y-2">
          <SkeletonItem width="2rem" height="1.25rem" animation={animation} />
          <SkeletonItem width="2rem" height="1.25rem" animation={animation} />
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 space-y-4">
      {/* Game status */}
      <div className="flex items-center justify-between">
        <SkeletonItem width="4rem" height="1rem" rounded="full" animation={animation} />
        <SkeletonItem width="3rem" height="0.875rem" animation={animation} />
      </div>
      
      {/* Teams and scores */}
      <div className="space-y-3">
        {/* Home team */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <SkeletonItem width="2rem" height="2rem" rounded="full" animation={animation} />
            <SkeletonItem width="6rem" height="1rem" animation={animation} />
          </div>
          <SkeletonItem width="2.5rem" height="1.5rem" animation={animation} />
        </div>
        
        {/* Away team */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <SkeletonItem width="2rem" height="2rem" rounded="full" animation={animation} />
            <SkeletonItem width="5.5rem" height="1rem" animation={animation} />
          </div>
          <SkeletonItem width="2.5rem" height="1.5rem" animation={animation} />
        </div>
      </div>
      
      {/* Game details */}
      <div className="flex items-center justify-between text-sm">
        <SkeletonItem width="4rem" height="0.875rem" animation={animation} />
        <SkeletonItem width="5rem" height="0.875rem" animation={animation} />
      </div>
    </div>
  );
};

// ============================================================================
// SCORES SKELETON COMPONENT
// ============================================================================

export const ScoresSkeleton: React.FC<ScoresSkeletonProps> = ({
  count = 3,
  compact = false,
  className,
  showHeader = true,
  animation = 'pulse',
}) => {
  return (
    <div className={cn('space-y-4', className)}>
      {/* Header skeleton */}
      {showHeader && (
        <div className="space-y-2">
          <SkeletonItem width="8rem" height="1.5rem" animation={animation} />
          <SkeletonItem width="12rem" height="0.875rem" animation={animation} />
        </div>
      )}
      
      {/* Score cards skeleton */}
      <div className={cn('space-y-3', compact && 'space-y-2')}>
        {Array.from({ length: count }).map((_, index) => (
          <ScoreCardSkeleton
            key={index}
            compact={compact}
            animation={animation}
          />
        ))}
      </div>
    </div>
  );
};

// ============================================================================
// SPORT SELECTOR SKELETON
// ============================================================================

export const SportSelectorSkeleton: React.FC<{
  animation?: 'pulse' | 'wave' | 'none';
}> = ({ animation = 'pulse' }) => {
  return (
    <div className="flex space-x-2 p-2">
      {Array.from({ length: 5 }).map((_, index) => (
        <SkeletonItem
          key={index}
          width="4rem"
          height="2rem"
          rounded="md"
          animation={animation}
        />
      ))}
    </div>
  );
};

// ============================================================================
// SUMMARY SKELETON
// ============================================================================

export const SummarySkeleton: React.FC<{
  animation?: 'pulse' | 'wave' | 'none';
}> = ({ animation = 'pulse' }) => {
  return (
    <div className="space-y-4 p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
      {/* Title */}
      <SkeletonItem width="10rem" height="1.25rem" animation={animation} />
      
      {/* Content lines */}
      <div className="space-y-2">
        <SkeletonItem width="100%" height="0.875rem" animation={animation} />
        <SkeletonItem width="95%" height="0.875rem" animation={animation} />
        <SkeletonItem width="88%" height="0.875rem" animation={animation} />
        <SkeletonItem width="92%" height="0.875rem" animation={animation} />
      </div>
      
      {/* Action button */}
      <div className="pt-2">
        <SkeletonItem width="6rem" height="2rem" rounded="md" animation={animation} />
      </div>
    </div>
  );
};

// ============================================================================
// FULL PAGE SKELETON
// ============================================================================

export const FullPageSkeleton: React.FC<{
  animation?: 'pulse' | 'wave' | 'none';
}> = ({ animation = 'pulse' }) => {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="space-y-4">
          <SkeletonItem width="15rem" height="2rem" animation={animation} />
          <SportSelectorSkeleton animation={animation} />
        </div>
        
        {/* Main content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Scores section */}
          <div className="lg:col-span-2">
            <ScoresSkeleton count={4} showHeader animation={animation} />
          </div>
          
          {/* Summary section */}
          <div>
            <SummarySkeleton animation={animation} />
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// EXPORT DEFAULT
// ============================================================================

export default ScoresSkeleton;