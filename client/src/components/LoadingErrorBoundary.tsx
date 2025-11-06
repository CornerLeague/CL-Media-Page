import React from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { LoadingCard } from '@/components/ui/loading-states';
import { ErrorCard, ConnectionError } from '@/components/ui/error-states';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface LoadingState {
  isLoading: boolean;
  loadingMessage?: string;
}

export interface ErrorState {
  hasError: boolean;
  error?: Error | string;
  errorCode?: string;
  retryable?: boolean;
}

export interface ConnectionState {
  isConnected: boolean;
  isConnecting: boolean;
  connectionState: 'connecting' | 'connected' | 'disconnected' | 'error';
  lastError?: string;
  reconnectAttempts?: number;
  maxReconnectAttempts?: number;
}

export interface LoadingErrorBoundaryProps {
  loading?: LoadingState;
  error?: ErrorState;
  connection?: ConnectionState;
  onRetry?: () => void;
  onReconnect?: () => void;
  children: React.ReactNode;
  fallbackComponent?: React.ComponentType<{
    loading?: LoadingState;
    error?: ErrorState;
    connection?: ConnectionState;
    onRetry?: () => void;
    onReconnect?: () => void;
  }>;
}

// ============================================================================
// LOADING COMPONENTS
// ============================================================================

export const LoadingSkeleton: React.FC<{ 
  lines?: number; 
  showHeader?: boolean;
  className?: string;
}> = ({ lines = 3, showHeader = true, className = "" }) => (
  <LoadingCard
    title={showHeader ? "Loading..." : undefined}
    description={`Loading ${lines} items...`}
    showSpinner={true}
    className={className}
  />
);

export const ConnectionStatusIndicator: React.FC<{
  connection: ConnectionState;
  onReconnect?: () => void;
  showDetails?: boolean;
}> = ({ connection, onReconnect, showDetails = false }) => {
  const getStatusColor = () => {
    switch (connection.connectionState) {
      case 'connected':
        return 'text-green-600 dark:text-green-400';
      case 'connecting':
        return 'text-yellow-600 dark:text-yellow-400';
      case 'error':
        return 'text-red-600 dark:text-red-400';
      default:
        return 'text-gray-600 dark:text-gray-400';
    }
  };

  const getStatusIcon = () => {
    switch (connection.connectionState) {
      case 'connected':
        return <Wifi className="w-4 h-4" />;
      case 'connecting':
        return <RefreshCw className="w-4 h-4 animate-spin" />;
      default:
        return <WifiOff className="w-4 h-4" />;
    }
  };

  return (
    <div className="flex items-center gap-2">
      <div className={`flex items-center gap-1 ${getStatusColor()}`}>
        {getStatusIcon()}
        <span className="text-sm font-medium">
          {connection.connectionState === 'connected' && 'Connected'}
          {connection.connectionState === 'connecting' && 'Connecting...'}
          {connection.connectionState === 'disconnected' && 'Disconnected'}
          {connection.connectionState === 'error' && 'Connection Error'}
        </span>
      </div>
      
      {showDetails && connection.reconnectAttempts !== undefined && connection.maxReconnectAttempts && (
        <span className="text-xs text-muted-foreground">
          ({connection.reconnectAttempts}/{connection.maxReconnectAttempts})
        </span>
      )}
      
      {onReconnect && !connection.isConnected && !connection.isConnecting && (
        <Button
          size="sm"
          variant="outline"
          onClick={onReconnect}
          className="h-6 px-2 text-xs"
        >
          Retry
        </Button>
      )}
    </div>
  );
};

// ============================================================================
// ERROR COMPONENTS
// ============================================================================

export const ErrorDisplay: React.FC<{
  error: ErrorState;
  onRetry?: () => void;
  className?: string;
}> = ({ error, onRetry, className = "" }) => {
  const errorMessage = typeof error.error === 'string' 
    ? error.error 
    : error.error?.message || 'An unexpected error occurred';

  return (
    <ErrorCard
      title="Error"
      message={errorMessage}
      variant="destructive"
      showIcon={true}
      onRetry={onRetry && error.retryable !== false ? onRetry : undefined}
      retryLabel="Try Again"
      className={className}
    />
  );
};

// ============================================================================
// MAIN BOUNDARY COMPONENT
// ============================================================================

export const LoadingErrorBoundary: React.FC<LoadingErrorBoundaryProps> = ({
  loading,
  error,
  connection,
  onRetry,
  onReconnect,
  children,
  fallbackComponent: FallbackComponent,
}) => {
  // Show custom fallback if provided
  if (FallbackComponent) {
    return (
      <FallbackComponent
        loading={loading}
        error={error}
        connection={connection}
        onRetry={onRetry}
        onReconnect={onReconnect}
      />
    );
  }

  // Show error state
  if (error?.hasError) {
    return (
      <ErrorDisplay
        error={error}
        onRetry={onRetry}
        className="m-4"
      />
    );
  }

  // Show loading state
  if (loading?.isLoading) {
    return (
      <div className="space-y-4 m-4">
        {connection && (
          <ConnectionStatusIndicator
            connection={connection}
            onReconnect={onReconnect}
            showDetails
          />
        )}
        <LoadingSkeleton />
        {loading.loadingMessage && (
          <p className="text-sm text-muted-foreground text-center">
            {loading.loadingMessage}
          </p>
        )}
      </div>
    );
  }

  // Show connection status if provided
  return (
    <div>
      {connection && (
        <div className="mb-4">
          <ConnectionStatusIndicator
            connection={connection}
            onReconnect={onReconnect}
            showDetails
          />
        </div>
      )}
      {children}
    </div>
  );
};

export default LoadingErrorBoundary;