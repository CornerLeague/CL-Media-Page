import React, { useState, useCallback } from 'react';
import { AlertTriangle, RefreshCw, RotateCcw, Bug, Wifi, WifiOff, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface ErrorState {
  type: 'connection' | 'api' | 'parsing' | 'unknown' | 'boundary';
  message: string;
  isRetryable: boolean;
  retryCount: number;
  lastRetryAt: Date | null;
}

interface ErrorInfo {
  componentStack?: string;
}

interface ErrorDisplayProps {
  error: Error;
  errorInfo?: ErrorInfo | null;
  errorId?: string | null;
  onRetry?: () => void;
  onReload?: () => void;
  onReport?: (error: Error, errorId?: string) => void;
  variant?: 'inline' | 'card' | 'boundary' | 'toast';
  className?: string;
  showDetails?: boolean;
  retryable?: boolean;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

const getErrorType = (error: Error): ErrorState['type'] => {
  const message = error.message.toLowerCase();
  
  if (message.includes('network') || message.includes('fetch') || message.includes('connection')) {
    return 'connection';
  }
  if (message.includes('api') || message.includes('server') || message.includes('response')) {
    return 'api';
  }
  if (message.includes('parse') || message.includes('json') || message.includes('syntax')) {
    return 'parsing';
  }
  if (error.name === 'ChunkLoadError' || message.includes('loading chunk')) {
    return 'connection';
  }
  
  return 'unknown';
};

const getErrorIcon = (type: ErrorState['type']) => {
  switch (type) {
    case 'connection':
      return WifiOff;
    case 'api':
      return AlertCircle;
    case 'parsing':
      return Bug;
    case 'boundary':
      return AlertTriangle;
    default:
      return AlertTriangle;
  }
};

const getErrorTitle = (type: ErrorState['type']) => {
  switch (type) {
    case 'connection':
      return 'Connection Error';
    case 'api':
      return 'Server Error';
    case 'parsing':
      return 'Data Error';
    case 'boundary':
      return 'Application Error';
    default:
      return 'Unexpected Error';
  }
};

const getErrorMessage = (error: Error, type: ErrorState['type']) => {
  switch (type) {
    case 'connection':
      return 'Unable to connect to the server. Please check your internet connection and try again.';
    case 'api':
      return 'The server encountered an error. Please try again in a moment.';
    case 'parsing':
      return 'There was an issue processing the data. Please refresh the page.';
    case 'boundary':
      return 'Something went wrong with this component. You can try refreshing the page or report this issue.';
    default:
      return error.message || 'An unexpected error occurred. Please try again.';
  }
};

const isRetryable = (type: ErrorState['type']) => {
  return type === 'connection' || type === 'api';
};

// ============================================================================
// ERROR DISPLAY COMPONENT
// ============================================================================

export const ErrorDisplay: React.FC<ErrorDisplayProps> = ({
  error,
  errorInfo,
  errorId,
  onRetry,
  onReload,
  onReport,
  variant = 'card',
  className,
  showDetails = false,
  retryable,
}) => {
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  const errorType = getErrorType(error);
  const ErrorIcon = getErrorIcon(errorType);
  const title = getErrorTitle(errorType);
  const message = getErrorMessage(error, errorType);
  const canRetry = retryable ?? (isRetryable(errorType) && onRetry);

  const handleRetry = useCallback(async () => {
    if (!onRetry || isRetrying) return;
    
    setIsRetrying(true);
    try {
      await onRetry();
    } finally {
      setIsRetrying(false);
    }
  }, [onRetry, isRetrying]);

  const handleReport = useCallback(() => {
    if (onReport) {
      onReport(error, errorId || undefined);
    }
  }, [onReport, error, errorId]);

  const getVariantStyles = () => {
    switch (variant) {
      case 'inline':
        return 'border-0 bg-transparent p-0';
      case 'toast':
        return 'border border-destructive/20 bg-destructive/5';
      case 'boundary':
        return 'border border-destructive/20 bg-background min-h-[200px] flex flex-col justify-center';
      default:
        return 'border border-destructive/20 bg-destructive/5';
    }
  };

  return (
    <Alert className={cn(getVariantStyles(), className)}>
      <ErrorIcon className="h-4 w-4" />
      <AlertTitle className="flex items-center justify-between">
        <span>{title}</span>
        {errorType && (
          <Badge variant="outline" className="text-xs">
            {errorType}
          </Badge>
        )}
      </AlertTitle>
      
      <AlertDescription className="space-y-4">
        <p className="text-sm">{message}</p>
        
        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2">
          {canRetry && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleRetry}
              disabled={isRetrying}
              className="h-8"
            >
              <RefreshCw className={cn("h-3 w-3 mr-1", isRetrying && "animate-spin")} />
              {isRetrying ? 'Retrying...' : 'Try Again'}
            </Button>
          )}
          
          {onReload && (
            <Button
              variant="outline"
              size="sm"
              onClick={onReload}
              className="h-8"
            >
              <RotateCcw className="h-3 w-3 mr-1" />
              Reload Page
            </Button>
          )}
          
          {onReport && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReport}
              className="h-8"
            >
              <Bug className="h-3 w-3 mr-1" />
              Report Issue
            </Button>
          )}
        </div>

        {/* Error Details (Collapsible) */}
        {(showDetails || errorInfo || errorId) && (
          <Collapsible open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="h-6 p-0 text-xs">
                {isDetailsOpen ? 'Hide' : 'Show'} Details
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-2">
              {errorId && (
                <div className="text-xs text-muted-foreground">
                  <strong>Error ID:</strong> {errorId}
                </div>
              )}
              
              <div className="text-xs text-muted-foreground">
                <strong>Error:</strong> {error.name}: {error.message}
              </div>
              
              {error.stack && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                    Stack Trace
                  </summary>
                  <pre className="mt-2 whitespace-pre-wrap bg-muted p-2 rounded text-xs overflow-auto max-h-32">
                    {error.stack}
                  </pre>
                </details>
              )}
              
              {errorInfo?.componentStack && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                    Component Stack
                  </summary>
                  <pre className="mt-2 whitespace-pre-wrap bg-muted p-2 rounded text-xs overflow-auto max-h-32">
                    {errorInfo.componentStack}
                  </pre>
                </details>
              )}
            </CollapsibleContent>
          </Collapsible>
        )}
      </AlertDescription>
    </Alert>
  );
};

// ============================================================================
// SPECIALIZED ERROR COMPONENTS
// ============================================================================

export const ConnectionError: React.FC<Omit<ErrorDisplayProps, 'error'> & { message?: string }> = ({
  message = 'Connection failed',
  ...props
}) => (
  <ErrorDisplay
    error={new Error(message)}
    variant="inline"
    {...props}
  />
);

export const APIError: React.FC<Omit<ErrorDisplayProps, 'error'> & { message?: string; status?: number }> = ({
  message = 'API request failed',
  status,
  ...props
}) => (
  <ErrorDisplay
    error={new Error(status ? `${message} (${status})` : message)}
    variant="inline"
    {...props}
  />
);

export const ParsingError: React.FC<Omit<ErrorDisplayProps, 'error'> & { message?: string }> = ({
  message = 'Data parsing failed',
  ...props
}) => (
  <ErrorDisplay
    error={new Error(message)}
    variant="inline"
    {...props}
  />
);