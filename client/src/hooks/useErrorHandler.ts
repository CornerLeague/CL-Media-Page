import { useState, useCallback, useRef, useEffect } from 'react';
import { errorRecoveryManager, handleErrorWithRecovery, logError } from '@/utils/errorRecovery';
import { getSafeHref, getSafeUserAgent, isBrowser } from '@/utils/env';
import { ErrorState } from '@/components/ErrorDisplay';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface UseErrorHandlerOptions {
  onError?: (error: Error, errorId: string) => void;
  onRecovery?: (errorId: string, strategy: string) => void;
  autoRetry?: boolean;
  maxRetries?: number;
  retryDelay?: number;
  context?: Record<string, any>;
}

interface ErrorHandlerState {
  error: Error | null;
  errorId: string | null;
  errorState: ErrorState | null;
  isRetrying: boolean;
  retryCount: number;
  lastRetryAt: Date | null;
  hasRecovered: boolean;
}

interface ErrorHandlerActions {
  handleError: (error: Error, context?: Record<string, any>) => Promise<string>;
  retry: () => Promise<boolean>;
  clearError: () => void;
  reportError: (error?: Error) => void;
}

interface UseErrorHandlerReturn extends ErrorHandlerState, ErrorHandlerActions {
  setRetryFunction: (retryFn: (() => Promise<void>) | null) => void;
}

// ============================================================================
// HOOK IMPLEMENTATION
// ============================================================================

export const useErrorHandler = (options: UseErrorHandlerOptions = {}): UseErrorHandlerReturn => {
  const {
    onError,
    onRecovery,
    autoRetry = false,
    maxRetries = 3,
    retryDelay = 1000,
    context: defaultContext = {}
  } = options;

  // State
  const [state, setState] = useState<ErrorHandlerState>({
    error: null,
    errorId: null,
    errorState: null,
    isRetrying: false,
    retryCount: 0,
    lastRetryAt: null,
    hasRecovered: false,
  });

  // Refs for stable references
  const retryTimeoutRef = useRef<NodeJS.Timeout>();
  const retryFunctionRef = useRef<(() => Promise<void>) | null>(null);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, []);

  // Handle error function
  const handleError = useCallback(async (
    error: Error, 
    context: Record<string, any> = {}
  ): Promise<string> => {
    const mergedContext = { ...defaultContext, ...context };
    
    try {
      // Attempt recovery
      const result = await handleErrorWithRecovery(error, null, mergedContext);
      
      // Create error state
      const errorState = errorRecoveryManager.getErrorState(error);
      
      // Update state
      setState(prev => ({
        ...prev,
        error,
        errorId: result.errorId,
        errorState: {
          ...errorState,
          retryCount: prev.retryCount,
          lastRetryAt: prev.lastRetryAt,
        },
        hasRecovered: result.recovered,
        isRetrying: false,
      }));

      // Call onError callback
      if (onError) {
        onError(error, result.errorId);
      }

      // Call onRecovery callback if recovered
      if (result.recovered && result.strategy && onRecovery) {
        onRecovery(result.errorId, result.strategy);
      }

      // Auto-retry if enabled and not recovered
      if (autoRetry && !result.recovered && errorState.isRetryable) {
        scheduleRetry();
      }

      return result.errorId;
    } catch (handlingError) {
      // Fallback error handling
      const fallbackId = await logError(error, null, mergedContext);
      
      setState(prev => ({
        ...prev,
        error,
        errorId: fallbackId,
        errorState: {
          type: 'unknown',
          message: error.message,
          isRetryable: false,
          retryCount: prev.retryCount,
          lastRetryAt: prev.lastRetryAt,
        },
        hasRecovered: false,
        isRetrying: false,
      }));

      if (onError) {
        onError(error, fallbackId);
      }

      return fallbackId;
    }
  }, [defaultContext, onError, onRecovery, autoRetry]);

  // Schedule retry function
  const scheduleRetry = useCallback(() => {
    if (state.retryCount >= maxRetries) {
      return;
    }

    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
    }

    retryTimeoutRef.current = setTimeout(() => {
      retry();
    }, retryDelay * Math.pow(2, state.retryCount)); // Exponential backoff
  }, [state.retryCount, maxRetries, retryDelay]);

  // Retry function
  const retry = useCallback(async (): Promise<boolean> => {
    if (!state.error || !state.errorState?.isRetryable || state.isRetrying) {
      return false;
    }

    if (state.retryCount >= maxRetries) {
      return false;
    }

    setState(prev => ({
      ...prev,
      isRetrying: true,
      retryCount: prev.retryCount + 1,
      lastRetryAt: new Date(),
    }));

    try {
      // If there's a custom retry function, use it
      if (retryFunctionRef.current) {
        await retryFunctionRef.current();
        
        // Success - clear error
        setState(prev => ({
          ...prev,
          error: null,
          errorId: null,
          errorState: null,
          isRetrying: false,
          hasRecovered: true,
        }));

        return true;
      }

      // Otherwise, try recovery again
      const result = await handleErrorWithRecovery(
        state.error, 
        null, 
        { ...defaultContext, retry: retryFunctionRef.current }
      );

      setState(prev => ({
        ...prev,
        isRetrying: false,
        hasRecovered: result.recovered,
      }));

      if (result.recovered) {
        // Clear error on successful recovery
        setState(prev => ({
          ...prev,
          error: null,
          errorId: null,
          errorState: null,
        }));

        if (result.strategy && onRecovery && state.errorId) {
          onRecovery(state.errorId, result.strategy);
        }
      } else if (autoRetry && state.retryCount < maxRetries) {
        // Schedule another retry
        scheduleRetry();
      }

      return result.recovered;
    } catch (retryError) {
      setState(prev => ({
        ...prev,
        isRetrying: false,
      }));

      // Log the retry error
      await logError(retryError as Error, null, { 
        ...defaultContext, 
        originalError: state.error,
        retryAttempt: state.retryCount 
      });

      return false;
    }
  }, [state.error, state.errorState, state.isRetrying, state.retryCount, state.errorId, maxRetries, defaultContext, onRecovery, autoRetry, scheduleRetry]);

  // Clear error function
  const clearError = useCallback(() => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
    }

    setState({
      error: null,
      errorId: null,
      errorState: null,
      isRetrying: false,
      retryCount: 0,
      lastRetryAt: null,
      hasRecovered: false,
    });
  }, []);

  // Report error function
  const reportError = useCallback((error?: Error) => {
    const errorToReport = error || state.error;
    if (!errorToReport) return;

    // In a real application, this would open a bug report form
    // or send the error to a reporting service
    const errorDetails = {
      error: errorToReport.message,
      stack: errorToReport.stack,
      errorId: state.errorId,
      timestamp: new Date().toISOString(),
      url: getSafeHref(),
      userAgent: getSafeUserAgent(),
    };

    // For now, copy to clipboard and show alert
    const reportText = `Error Report:\n${JSON.stringify(errorDetails, null, 2)}`;
    
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(reportText).then(() => {
        if (isBrowser) {
          alert('Error details copied to clipboard. Please paste this in your bug report.');
        }
      }).catch(() => {
        console.log('Error Report:', reportText);
        if (isBrowser) {
          alert('Error details logged to console. Please copy from there.');
        }
      });
    } else {
      console.log('Error Report:', reportText);
      if (isBrowser) {
        alert('Error details logged to console. Please copy from there.');
      }
    }
  }, [state.error, state.errorId]);

  // Set retry function (for external retry logic)
  const setRetryFunction = useCallback((retryFn: (() => Promise<void>) | null) => {
    retryFunctionRef.current = retryFn;
  }, []);

  return {
    // State
    ...state,
    
    // Actions
    handleError,
    retry,
    clearError,
    reportError,
    setRetryFunction,
  };
};

// ============================================================================
// SPECIALIZED HOOKS
// ============================================================================

// Hook for API errors specifically
export const useAPIErrorHandler = (options: UseErrorHandlerOptions = {}) => {
  return useErrorHandler({
    ...options,
    autoRetry: options.autoRetry ?? true,
    maxRetries: options.maxRetries ?? 3,
    context: {
      ...options.context,
      errorType: 'api',
    },
  });
};

// Hook for network errors specifically
export const useNetworkErrorHandler = (options: UseErrorHandlerOptions = {}) => {
  return useErrorHandler({
    ...options,
    autoRetry: options.autoRetry ?? true,
    maxRetries: options.maxRetries ?? 5,
    retryDelay: options.retryDelay ?? 2000,
    context: {
      ...options.context,
      errorType: 'network',
    },
  });
};

// Hook for form errors
export const useFormErrorHandler = (options: UseErrorHandlerOptions = {}) => {
  return useErrorHandler({
    ...options,
    autoRetry: false, // Don't auto-retry form errors
    context: {
      ...options.context,
      errorType: 'form',
    },
  });
};