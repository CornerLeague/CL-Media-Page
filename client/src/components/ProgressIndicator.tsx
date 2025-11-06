import React from 'react';
import { cn } from '@/lib/utils';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface ProgressIndicatorProps {
  /** Progress value (0-100) */
  value?: number;
  /** Size of the indicator */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Variant style */
  variant?: 'linear' | 'circular' | 'dots' | 'spinner';
  /** Color theme */
  color?: 'primary' | 'secondary' | 'success' | 'warning' | 'error';
  /** Show percentage text */
  showValue?: boolean;
  /** Custom label */
  label?: string;
  /** Additional CSS classes */
  className?: string;
  /** Indeterminate progress */
  indeterminate?: boolean;
  /** Animation speed */
  speed?: 'slow' | 'normal' | 'fast';
}

export interface LoadingSpinnerProps {
  /** Size of the spinner */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Color theme */
  color?: 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'white' | 'gray';
  /** Additional CSS classes */
  className?: string;
  /** Custom label */
  label?: string;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

const getSizeClasses = (size: 'sm' | 'md' | 'lg' | 'xl', variant: string) => {
  const sizeMap = {
    linear: {
      sm: 'h-1',
      md: 'h-2',
      lg: 'h-3',
      xl: 'h-4',
    },
    circular: {
      sm: 'w-4 h-4',
      md: 'w-6 h-6',
      lg: 'w-8 h-8',
      xl: 'w-12 h-12',
    },
    spinner: {
      sm: 'w-4 h-4',
      md: 'w-6 h-6',
      lg: 'w-8 h-8',
      xl: 'w-12 h-12',
    },
    dots: {
      sm: 'space-x-1',
      md: 'space-x-2',
      lg: 'space-x-3',
      xl: 'space-x-4',
    },
  };

  return sizeMap[variant as keyof typeof sizeMap]?.[size] || sizeMap.circular[size];
};

const getColorClasses = (color: string, variant: string) => {
  const colorMap = {
    primary: {
      bg: 'bg-blue-500',
      border: 'border-blue-500',
      text: 'text-blue-500',
      fill: 'fill-blue-500',
    },
    secondary: {
      bg: 'bg-gray-500',
      border: 'border-gray-500',
      text: 'text-gray-500',
      fill: 'fill-gray-500',
    },
    success: {
      bg: 'bg-green-500',
      border: 'border-green-500',
      text: 'text-green-500',
      fill: 'fill-green-500',
    },
    warning: {
      bg: 'bg-yellow-500',
      border: 'border-yellow-500',
      text: 'text-yellow-500',
      fill: 'fill-yellow-500',
    },
    error: {
      bg: 'bg-red-500',
      border: 'border-red-500',
      text: 'text-red-500',
      fill: 'fill-red-500',
    },
    white: {
      bg: 'bg-white',
      border: 'border-white',
      text: 'text-white',
      fill: 'fill-white',
    },
    gray: {
      bg: 'bg-gray-400',
      border: 'border-gray-400',
      text: 'text-gray-400',
      fill: 'fill-gray-400',
    },
  };

  return colorMap[color as keyof typeof colorMap] || colorMap.primary;
};

const getSpeedClasses = (speed: 'slow' | 'normal' | 'fast') => {
  const speedMap = {
    slow: 'duration-1000',
    normal: 'duration-500',
    fast: 'duration-300',
  };
  return speedMap[speed];
};

// ============================================================================
// LINEAR PROGRESS COMPONENT
// ============================================================================

const LinearProgress: React.FC<ProgressIndicatorProps> = ({
  value = 0,
  size = 'md',
  color = 'primary',
  showValue = false,
  label,
  className,
  indeterminate = false,
  speed = 'normal',
}) => {
  const colorClasses = getColorClasses(color, 'linear');
  const sizeClass = getSizeClasses(size, 'linear');
  const speedClass = getSpeedClasses(speed);

  return (
    <div className={cn('w-full', className)}>
      {(label || showValue) && (
        <div className="flex justify-between items-center mb-2">
          {label && <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</span>}
          {showValue && !indeterminate && (
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{Math.round(value)}%</span>
          )}
        </div>
      )}
      
      <div className={cn('w-full bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden', sizeClass)}>
        <div
          className={cn(
            'h-full transition-all ease-out',
            colorClasses.bg,
            speedClass,
            indeterminate && 'animate-pulse'
          )}
          style={{
            width: indeterminate ? '100%' : `${Math.min(Math.max(value, 0), 100)}%`,
            transform: indeterminate ? 'translateX(-100%)' : 'none',
            animation: indeterminate ? 'progress-indeterminate 2s infinite linear' : 'none',
          }}
        />
      </div>
    </div>
  );
};

// ============================================================================
// CIRCULAR PROGRESS COMPONENT
// ============================================================================

const CircularProgress: React.FC<ProgressIndicatorProps> = ({
  value = 0,
  size = 'md',
  color = 'primary',
  showValue = false,
  className,
  indeterminate = false,
}) => {
  const colorClasses = getColorClasses(color, 'circular');
  const sizeClass = getSizeClasses(size, 'circular');
  
  const radius = 16;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = indeterminate ? 0 : circumference - (value / 100) * circumference;

  return (
    <div className={cn('relative inline-flex items-center justify-center', sizeClass, className)}>
      <svg
        className={cn('transform -rotate-90', indeterminate && 'animate-spin')}
        width="100%"
        height="100%"
        viewBox="0 0 36 36"
      >
        {/* Background circle */}
        <circle
          cx="18"
          cy="18"
          r={radius}
          fill="none"
          className="stroke-gray-200 dark:stroke-gray-700"
          strokeWidth="2"
        />
        
        {/* Progress circle */}
        <circle
          cx="18"
          cy="18"
          r={radius}
          fill="none"
          className={cn('transition-all duration-300 ease-out', colorClasses.text.replace('text-', 'stroke-'))}
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          style={{
            strokeDasharray: indeterminate ? `${circumference * 0.25} ${circumference}` : circumference,
          }}
        />
      </svg>
      
      {/* Value text */}
      {showValue && !indeterminate && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={cn('text-xs font-semibold', colorClasses.text)}>
            {Math.round(value)}%
          </span>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// DOTS PROGRESS COMPONENT
// ============================================================================

const DotsProgress: React.FC<ProgressIndicatorProps> = ({
  size = 'md',
  color = 'primary',
  className,
}) => {
  const colorClasses = getColorClasses(color, 'dots');
  const sizeClass = getSizeClasses(size, 'dots');
  
  const dotSizes = {
    sm: 'w-1 h-1',
    md: 'w-2 h-2',
    lg: 'w-3 h-3',
    xl: 'w-4 h-4',
  };

  return (
    <div className={cn('flex items-center', sizeClass, className)}>
      {[0, 1, 2].map((index) => (
        <div
          key={index}
          className={cn(
            'rounded-full animate-pulse',
            dotSizes[size],
            colorClasses.bg
          )}
          style={{
            animationDelay: `${index * 0.2}s`,
            animationDuration: '1s',
          }}
        />
      ))}
    </div>
  );
};

// ============================================================================
// SPINNER COMPONENT
// ============================================================================

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'md',
  color = 'primary',
  className,
  label,
}) => {
  const colorClasses = getColorClasses(color, 'spinner');
  const sizeClass = getSizeClasses(size, 'spinner');

  return (
    <div className={cn('flex flex-col items-center space-y-2', className)}>
      <div className={cn('animate-spin', sizeClass)}>
        <svg
          className="w-full h-full"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className={colorClasses.fill}
            fillRule="evenodd"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      </div>
      
      {label && (
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {label}
        </span>
      )}
    </div>
  );
};

// ============================================================================
// MAIN PROGRESS INDICATOR COMPONENT
// ============================================================================

export const ProgressIndicator: React.FC<ProgressIndicatorProps> = (props) => {
  const { variant = 'linear' } = props;

  switch (variant) {
    case 'circular':
      return <CircularProgress {...props} />;
    case 'dots':
      return <DotsProgress {...props} />;
    case 'spinner':
      return <LoadingSpinner {...props} />;
    case 'linear':
    default:
      return <LinearProgress {...props} />;
  }
};

// ============================================================================
// LOADING OVERLAY COMPONENT
// ============================================================================

export const LoadingOverlay: React.FC<{
  isVisible: boolean;
  message?: string;
  progress?: number;
  variant?: 'spinner' | 'linear' | 'circular';
  backdrop?: boolean;
  className?: string;
}> = ({
  isVisible,
  message = 'Loading...',
  progress,
  variant = 'spinner',
  backdrop = true,
  className,
}) => {
  if (!isVisible) return null;

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 flex items-center justify-center',
        backdrop && 'bg-black bg-opacity-50',
        className
      )}
    >
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-lg max-w-sm w-full mx-4">
        <div className="flex flex-col items-center space-y-4">
          <ProgressIndicator
            variant={variant}
            value={progress}
            indeterminate={progress === undefined}
            size="lg"
            showValue={progress !== undefined}
          />
          
          <p className="text-center text-gray-700 dark:text-gray-300 font-medium">
            {message}
          </p>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// EXPORT DEFAULT
// ============================================================================

export default ProgressIndicator;