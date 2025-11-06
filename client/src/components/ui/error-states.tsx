import React from 'react';
import { AlertCircle, RefreshCw, Wifi, WifiOff, AlertTriangle, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface ErrorCardProps {
  title?: string;
  message: string;
  variant?: 'default' | 'destructive' | 'warning';
  showIcon?: boolean;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

export const ErrorCard: React.FC<ErrorCardProps> = ({
  title = 'Something went wrong',
  message,
  variant = 'default',
  showIcon = true,
  onRetry,
  retryLabel = 'Try again',
  className
}) => {
  const getIcon = () => {
    switch (variant) {
      case 'destructive':
        return <XCircle className="h-5 w-5" />;
      case 'warning':
        return <AlertTriangle className="h-5 w-5" />;
      default:
        return <AlertCircle className="h-5 w-5" />;
    }
  };

  const getVariantStyles = () => {
    switch (variant) {
      case 'destructive':
        return 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20';
      case 'warning':
        return 'border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-900/20';
      default:
        return 'border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900/20';
    }
  };

  const getTextStyles = () => {
    switch (variant) {
      case 'destructive':
        return 'text-red-800 dark:text-red-200';
      case 'warning':
        return 'text-yellow-800 dark:text-yellow-200';
      default:
        return 'text-gray-800 dark:text-gray-200';
    }
  };

  return (
    <div className={cn(
      'flex flex-col items-center justify-center p-8 space-y-4 rounded-lg border',
      getVariantStyles(),
      className
    )}>
      {showIcon && (
        <div className={cn('flex items-center justify-center', getTextStyles())}>
          {getIcon()}
        </div>
      )}
      <div className="text-center space-y-2">
        <h3 className={cn('text-lg font-medium', getTextStyles())}>{title}</h3>
        <p className={cn('text-sm max-w-sm', getTextStyles(), 'opacity-80')}>
          {message}
        </p>
      </div>
      {onRetry && (
        <Button
          onClick={onRetry}
          variant={variant === 'destructive' ? 'destructive' : 'default'}
          size="sm"
          className="mt-4"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          {retryLabel}
        </Button>
      )}
    </div>
  );
};

interface ConnectionErrorProps {
  isOnline?: boolean;
  onRetry?: () => void;
  className?: string;
}

export const ConnectionError: React.FC<ConnectionErrorProps> = ({
  isOnline = true,
  onRetry,
  className
}) => {
  const Icon = isOnline ? Wifi : WifiOff;
  const title = isOnline ? 'Connection Error' : 'You\'re Offline';
  const message = isOnline 
    ? 'Unable to connect to our servers. Please check your connection and try again.'
    : 'Please check your internet connection and try again.';

  return (
    <div className={cn(
      'flex flex-col items-center justify-center p-8 space-y-4 rounded-lg border border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-900/20',
      className
    )}>
      <div className="flex items-center justify-center text-yellow-600 dark:text-yellow-400">
        <Icon className="h-8 w-8" />
      </div>
      <div className="text-center space-y-2">
        <h3 className="text-lg font-medium text-yellow-800 dark:text-yellow-200">{title}</h3>
        <p className="text-sm text-yellow-600 dark:text-yellow-400 opacity-80 max-w-sm">
          {message}
        </p>
      </div>
      {onRetry && (
        <Button
          onClick={onRetry}
          variant="default"
          size="sm"
          className="mt-4"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Try again
        </Button>
      )}
    </div>
  );
};

interface InlineErrorProps {
  message: string;
  variant?: 'default' | 'destructive';
  onRetry?: () => void;
  className?: string;
}

export const InlineError: React.FC<InlineErrorProps> = ({
  message,
  variant = 'default',
  onRetry,
  className
}) => {
  return (
    <Alert variant={variant} className={cn('my-4', className)}>
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>Error</AlertTitle>
      <AlertDescription className="flex items-center justify-between">
        <span>{message}</span>
        {onRetry && (
          <Button
            onClick={onRetry}
            variant="ghost"
            size="sm"
            className="ml-4 h-auto p-1"
          >
            <RefreshCw className="h-3 w-3" />
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
};

interface SportErrorProps {
  sportName?: string;
  errorType?: 'load' | 'connection' | 'data';
  onRetry?: () => void;
  onChangeSport?: () => void;
  className?: string;
}

export const SportError: React.FC<SportErrorProps> = ({
  sportName,
  errorType = 'load',
  onRetry,
  onChangeSport,
  className
}) => {
  const getErrorMessage = () => {
    switch (errorType) {
      case 'connection':
        return `Unable to load live ${sportName || 'sports'} data. Check your connection and try again.`;
      case 'data':
        return `No ${sportName || 'sports'} data available at the moment. Please try again later.`;
      default:
        return `Failed to load ${sportName || 'sports'} information. Please try again.`;
    }
  };

  return (
    <div className={cn(
      'flex flex-col items-center justify-center p-6 space-y-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800',
      className
    )}>
      <AlertCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
      <div className="text-center space-y-2">
        <h3 className="text-lg font-medium text-red-800 dark:text-red-200">
          {sportName ? `${sportName} Error` : 'Sports Data Error'}
        </h3>
        <p className="text-sm text-red-600 dark:text-red-400 max-w-sm">
          {getErrorMessage()}
        </p>
      </div>
      <div className="flex gap-2">
        {onRetry && (
          <Button
            onClick={onRetry}
            variant="outline"
            size="sm"
            className="border-red-300 text-red-700 hover:bg-red-100 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-900/40"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        )}
        {onChangeSport && (
          <Button
            onClick={onChangeSport}
            variant="outline"
            size="sm"
            className="border-red-300 text-red-700 hover:bg-red-100 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-900/40"
          >
            Change Sport
          </Button>
        )}
      </div>
    </div>
  );
};