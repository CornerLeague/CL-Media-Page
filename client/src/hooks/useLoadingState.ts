import { useState, useCallback, useRef, useEffect } from 'react';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface LoadingState {
  /** Whether the operation is currently loading */
  isLoading: boolean;
  /** Progress percentage (0-100) */
  progress?: number;
  /** Current loading message */
  message?: string;
  /** Error if operation failed */
  error?: Error | null;
  /** Operation start time */
  startTime?: number;
  /** Estimated completion time */
  estimatedCompletion?: number;
}

export interface LoadingOperation {
  /** Unique identifier for the operation */
  id: string;
  /** Loading state */
  state: LoadingState;
  /** Operation type */
  type?: string;
  /** Priority level */
  priority?: 'low' | 'medium' | 'high';
}

export interface LoadingConfig {
  /** Default loading message */
  defaultMessage?: string;
  /** Minimum loading time to prevent flashing */
  minLoadingTime?: number;
  /** Maximum loading time before timeout */
  maxLoadingTime?: number;
  /** Auto-clear completed operations after delay */
  autoClearDelay?: number;
  /** Show progress by default */
  showProgress?: boolean;
}

export interface UseLoadingStateOptions extends LoadingConfig {
  /** Initial loading state */
  initialLoading?: boolean;
  /** Operation type for categorization */
  operationType?: string;
  /** Enable automatic progress estimation */
  enableProgressEstimation?: boolean;
}

export interface UseLoadingStateReturn {
  /** Current loading state */
  isLoading: boolean;
  /** Current progress (0-100) */
  progress?: number;
  /** Current loading message */
  message?: string;
  /** Current error */
  error?: Error | null;
  /** All active operations */
  operations: LoadingOperation[];
  /** Start a loading operation */
  startLoading: (id?: string, message?: string, options?: Partial<LoadingOperation>) => string;
  /** Stop a loading operation */
  stopLoading: (id?: string) => void;
  /** Update progress for an operation */
  updateProgress: (progress: number, id?: string, message?: string) => void;
  /** Set error for an operation */
  setError: (error: Error, id?: string) => void;
  /** Clear all operations */
  clearAll: () => void;
  /** Get operation by ID */
  getOperation: (id: string) => LoadingOperation | undefined;
  /** Check if specific operation is loading */
  isOperationLoading: (id: string) => boolean;
  /** Get loading message for display */
  getDisplayMessage: () => string;
  /** Get overall progress */
  getOverallProgress: () => number | undefined;
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

const DEFAULT_CONFIG: LoadingConfig = {
  defaultMessage: 'Loading...',
  minLoadingTime: 300,
  maxLoadingTime: 30000,
  autoClearDelay: 1000,
  showProgress: false,
};

const DEFAULT_MESSAGES = {
  loading: 'Loading...',
  fetching: 'Fetching data...',
  saving: 'Saving...',
  deleting: 'Deleting...',
  updating: 'Updating...',
  uploading: 'Uploading...',
  processing: 'Processing...',
  connecting: 'Connecting...',
  authenticating: 'Authenticating...',
  refreshing: 'Refreshing...',
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

const generateId = (): string => {
  return `loading_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

const getDefaultMessage = (type?: string): string => {
  if (!type) return DEFAULT_MESSAGES.loading;
  return DEFAULT_MESSAGES[type as keyof typeof DEFAULT_MESSAGES] || DEFAULT_MESSAGES.loading;
};

const estimateProgress = (startTime: number, estimatedDuration: number): number => {
  const elapsed = Date.now() - startTime;
  const progress = Math.min((elapsed / estimatedDuration) * 100, 95);
  return Math.round(progress);
};

// ============================================================================
// MAIN HOOK
// ============================================================================

export const useLoadingState = (options: UseLoadingStateOptions = {}): UseLoadingStateReturn => {
  const config = { ...DEFAULT_CONFIG, ...options };
  const [operations, setOperations] = useState<LoadingOperation[]>([]);
  const timersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const progressTimersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      timersRef.current.forEach(timer => clearTimeout(timer));
      progressTimersRef.current.forEach(timer => clearTimeout(timer));
    };
  }, []);

  // Auto-clear completed operations
  useEffect(() => {
    operations.forEach(operation => {
      if (!operation.state.isLoading && !operation.state.error && config.autoClearDelay) {
        const existingTimer = timersRef.current.get(operation.id);
        if (!existingTimer) {
          const timer = setTimeout(() => {
            setOperations(prev => prev.filter(op => op.id !== operation.id));
            timersRef.current.delete(operation.id);
          }, config.autoClearDelay);
          timersRef.current.set(operation.id, timer);
        }
      }
    });
  }, [operations, config.autoClearDelay]);

  const startLoading = useCallback((
    id?: string,
    message?: string,
    operationOptions: Partial<LoadingOperation> = {}
  ): string => {
    const operationId = id || generateId();
    const operationType = operationOptions.type || options.operationType;
    const loadingMessage = message || getDefaultMessage(operationType) || config.defaultMessage;

    // Clear any existing timer for this operation
    const existingTimer = timersRef.current.get(operationId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      timersRef.current.delete(operationId);
    }

    const newOperation: LoadingOperation = {
      id: operationId,
      type: operationType,
      priority: 'medium',
      ...operationOptions,
      state: {
        isLoading: true,
        message: loadingMessage,
        startTime: Date.now(),
        progress: options.enableProgressEstimation ? 0 : undefined,
        error: null,
      },
    };

    setOperations(prev => {
      const filtered = prev.filter(op => op.id !== operationId);
      return [...filtered, newOperation];
    });

    // Set up automatic progress estimation if enabled
    if (options.enableProgressEstimation) {
      const progressTimer = setInterval(() => {
        setOperations(prev => prev.map(op => {
          if (op.id === operationId && op.state.isLoading && op.state.startTime) {
            const estimatedDuration = 5000; // 5 seconds default
            const progress = estimateProgress(op.state.startTime, estimatedDuration);
            return {
              ...op,
              state: {
                ...op.state,
                progress,
              },
            };
          }
          return op;
        }));
      }, 100);

      progressTimersRef.current.set(operationId, progressTimer);
    }

    // Set up maximum loading time timeout
    if (config.maxLoadingTime) {
      const timeoutTimer = setTimeout(() => {
        setOperations(prev => prev.map(op => {
          if (op.id === operationId && op.state.isLoading) {
            return {
              ...op,
              state: {
                ...op.state,
                isLoading: false,
                error: new Error('Operation timed out'),
              },
            };
          }
          return op;
        }));
      }, config.maxLoadingTime);

      timersRef.current.set(`${operationId}_timeout`, timeoutTimer);
    }

    return operationId;
  }, [config, options]);

  const stopLoading = useCallback((id?: string) => {
    if (!id) {
      // Stop the most recent operation
      const lastOperation = operations.find(op => op.state.isLoading);
      if (lastOperation) {
        id = lastOperation.id;
      } else {
        return;
      }
    }

    // Clear timers
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }

    const timeoutTimer = timersRef.current.get(`${id}_timeout`);
    if (timeoutTimer) {
      clearTimeout(timeoutTimer);
      timersRef.current.delete(`${id}_timeout`);
    }

    const progressTimer = progressTimersRef.current.get(id);
    if (progressTimer) {
      clearInterval(progressTimer);
      progressTimersRef.current.delete(id);
    }

    setOperations(prev => prev.map(op => {
      if (op.id === id) {
        return {
          ...op,
          state: {
            ...op.state,
            isLoading: false,
            progress: 100,
          },
        };
      }
      return op;
    }));
  }, [operations]);

  const updateProgress = useCallback((progress: number, id?: string, message?: string) => {
    const targetId = id || operations.find(op => op.state.isLoading)?.id;
    if (!targetId) return;

    setOperations(prev => prev.map(op => {
      if (op.id === targetId) {
        return {
          ...op,
          state: {
            ...op.state,
            progress: Math.min(Math.max(progress, 0), 100),
            message: message || op.state.message,
          },
        };
      }
      return op;
    }));
  }, [operations]);

  const setError = useCallback((error: Error, id?: string) => {
    const targetId = id || operations.find(op => op.state.isLoading)?.id;
    if (!targetId) return;

    // Clear timers
    const timer = timersRef.current.get(targetId);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(targetId);
    }

    const progressTimer = progressTimersRef.current.get(targetId);
    if (progressTimer) {
      clearInterval(progressTimer);
      progressTimersRef.current.delete(targetId);
    }

    setOperations(prev => prev.map(op => {
      if (op.id === targetId) {
        return {
          ...op,
          state: {
            ...op.state,
            isLoading: false,
            error,
          },
        };
      }
      return op;
    }));
  }, [operations]);

  const clearAll = useCallback(() => {
    // Clear all timers
    timersRef.current.forEach(timer => clearTimeout(timer));
    progressTimersRef.current.forEach(timer => clearTimeout(timer));
    timersRef.current.clear();
    progressTimersRef.current.clear();

    setOperations([]);
  }, []);

  const getOperation = useCallback((id: string): LoadingOperation | undefined => {
    return operations.find(op => op.id === id);
  }, [operations]);

  const isOperationLoading = useCallback((id: string): boolean => {
    const operation = operations.find(op => op.id === id);
    return operation?.state.isLoading || false;
  }, [operations]);

  const getDisplayMessage = useCallback((): string => {
    const loadingOp = operations.find(op => op.state.isLoading);
    return loadingOp?.state.message || config.defaultMessage || DEFAULT_MESSAGES.loading;
  }, [operations, config.defaultMessage]);

  const getOverallProgress = useCallback((): number | undefined => {
    const loadingOps = operations.filter(op => op.state.isLoading && op.state.progress !== undefined);
    if (loadingOps.length === 0) return undefined;

    const totalProgress = loadingOps.reduce((sum, op) => sum + (op.state.progress || 0), 0);
    return Math.round(totalProgress / loadingOps.length);
  }, [operations]);

  // Computed values
  const isLoading = operations.some(op => op.state.isLoading);
  const currentError = operations.find(op => op.state.error)?.state.error;
  const currentProgress = getOverallProgress();
  const currentMessage = getDisplayMessage();

  return {
    isLoading,
    progress: currentProgress,
    message: currentMessage,
    error: currentError,
    operations,
    startLoading,
    stopLoading,
    updateProgress,
    setError,
    clearAll,
    getOperation,
    isOperationLoading,
    getDisplayMessage,
    getOverallProgress,
  };
};

// ============================================================================
// SIMPLE LOADING HOOK
// ============================================================================

export const useSimpleLoading = (initialLoading = false) => {
  const [isLoading, setIsLoading] = useState(initialLoading);
  const [error, setError] = useState<Error | null>(null);

  const startLoading = useCallback(() => {
    setIsLoading(true);
    setError(null);
  }, []);

  const stopLoading = useCallback(() => {
    setIsLoading(false);
  }, []);

  const setLoadingError = useCallback((error: Error) => {
    setError(error);
    setIsLoading(false);
  }, []);

  const reset = useCallback(() => {
    setIsLoading(false);
    setError(null);
  }, []);

  return {
    isLoading,
    error,
    startLoading,
    stopLoading,
    setError: setLoadingError,
    reset,
  };
};

// ============================================================================
// EXPORT DEFAULT
// ============================================================================

export default useLoadingState;