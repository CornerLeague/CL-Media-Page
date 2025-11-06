import { ErrorState } from '@/components/ErrorDisplay';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface ErrorLog {
  id: string;
  timestamp: Date;
  error: Error;
  errorInfo?: any;
  userAgent: string;
  url: string;
  userId?: string;
  sessionId: string;
  context?: Record<string, any>;
}

export interface RecoveryStrategy {
  name: string;
  canHandle: (error: Error) => boolean;
  recover: (error: Error, context?: any) => Promise<boolean>;
  priority: number;
}

// ============================================================================
// ERROR LOGGING
// ============================================================================

class ErrorLogger {
  private logs: ErrorLog[] = [];
  private maxLogs = 100;
  private sessionId: string;

  constructor() {
    this.sessionId = this.generateSessionId();
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateErrorId(): string {
    return `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  log(error: Error, errorInfo?: any, context?: Record<string, any>): string {
    const errorId = this.generateErrorId();
    
    const errorLog: ErrorLog = {
      id: errorId,
      timestamp: new Date(),
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      } as Error,
      errorInfo,
      userAgent: navigator.userAgent,
      url: window.location.href,
      sessionId: this.sessionId,
      context,
    };

    this.logs.push(errorLog);

    // Keep only the most recent logs
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    // Log to console in development
    if (import.meta.env.DEV) {
      console.group(`🚨 Error Logged: ${errorId}`);
      console.error('Error:', error);
      if (errorInfo) console.log('Error Info:', errorInfo);
      if (context) console.log('Context:', context);
      console.groupEnd();
    }

    // Send to external service in production
    if (import.meta.env.PROD) {
      this.sendToExternalService(errorLog).catch(console.error);
    }

    return errorId;
  }

  private async sendToExternalService(errorLog: ErrorLog): Promise<void> {
    try {
      // In a real application, you would send this to your error tracking service
      // like Sentry, LogRocket, Bugsnag, etc.
      
      // For now, we'll just store it in localStorage as a fallback
      const existingLogs = JSON.parse(localStorage.getItem('error_logs') || '[]');
      existingLogs.push(errorLog);
      
      // Keep only the last 50 logs in localStorage
      const recentLogs = existingLogs.slice(-50);
      localStorage.setItem('error_logs', JSON.stringify(recentLogs));
      
    } catch (storageError) {
      console.error('Failed to store error log:', storageError);
    }
  }

  getLogs(): ErrorLog[] {
    return [...this.logs];
  }

  getLogById(id: string): ErrorLog | undefined {
    return this.logs.find(log => log.id === id);
  }

  clearLogs(): void {
    this.logs = [];
    localStorage.removeItem('error_logs');
  }
}

// ============================================================================
// RECOVERY STRATEGIES
// ============================================================================

const recoveryStrategies: RecoveryStrategy[] = [
  // Network/Connection Recovery
  {
    name: 'network-retry',
    priority: 1,
    canHandle: (error: Error) => {
      const message = error.message.toLowerCase();
      return message.includes('network') || 
             message.includes('fetch') || 
             message.includes('connection') ||
             error.name === 'NetworkError';
    },
    recover: async (error: Error, context?: any) => {
      // Wait a bit before retrying
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Check if we're back online
      if (!navigator.onLine) {
        return false;
      }
      
      // If there's a retry function in context, use it
      if (context?.retry && typeof context.retry === 'function') {
        try {
          await context.retry();
          return true;
        } catch (retryError) {
          return false;
        }
      }
      
      return false;
    }
  },

  // Chunk Loading Recovery (for code splitting issues)
  {
    name: 'chunk-reload',
    priority: 2,
    canHandle: (error: Error) => {
      return error.name === 'ChunkLoadError' || 
             error.message.includes('Loading chunk');
    },
    recover: async () => {
      // For chunk loading errors, the best recovery is to reload the page
      window.location.reload();
      return true;
    }
  },

  // API Error Recovery
  {
    name: 'api-retry',
    priority: 3,
    canHandle: (error: Error) => {
      const message = error.message.toLowerCase();
      return message.includes('api') || 
             message.includes('server') ||
             message.includes('500') ||
             message.includes('502') ||
             message.includes('503') ||
             message.includes('504');
    },
    recover: async (error: Error, context?: any) => {
      // Exponential backoff retry
      const maxRetries = 3;
      const baseDelay = 1000;
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        await new Promise(resolve => 
          setTimeout(resolve, baseDelay * Math.pow(2, attempt - 1))
        );
        
        if (context?.retry && typeof context.retry === 'function') {
          try {
            await context.retry();
            return true;
          } catch (retryError) {
            if (attempt === maxRetries) {
              return false;
            }
          }
        }
      }
      
      return false;
    }
  },

  // Generic Recovery (last resort)
  {
    name: 'generic-recovery',
    priority: 10,
    canHandle: () => true,
    recover: async (error: Error, context?: any) => {
      // Try to clear any cached data that might be causing issues
      try {
        // Clear query cache if available
        if (context?.queryClient) {
          context.queryClient.clear();
        }
        
        // Clear localStorage items that might be corrupted
        const keysToCheck = ['sport-preferences', 'user-settings', 'cached-scores'];
        keysToCheck.forEach(key => {
          try {
            const item = localStorage.getItem(key);
            if (item) {
              JSON.parse(item); // Test if it's valid JSON
            }
          } catch {
            localStorage.removeItem(key);
          }
        });
        
        return true;
      } catch {
        return false;
      }
    }
  }
];

// ============================================================================
// ERROR RECOVERY MANAGER
// ============================================================================

class ErrorRecoveryManager {
  private logger: ErrorLogger;
  private strategies: RecoveryStrategy[];

  constructor() {
    this.logger = new ErrorLogger();
    this.strategies = [...recoveryStrategies].sort((a, b) => a.priority - b.priority);
  }

  async handleError(
    error: Error, 
    errorInfo?: any, 
    context?: Record<string, any>
  ): Promise<{ errorId: string; recovered: boolean; strategy?: string }> {
    
    // Log the error first
    const errorId = this.logger.log(error, errorInfo, context);
    
    // Try recovery strategies
    for (const strategy of this.strategies) {
      if (strategy.canHandle(error)) {
        try {
          const recovered = await strategy.recover(error, context);
          if (recovered) {
            console.log(`✅ Error recovered using strategy: ${strategy.name}`);
            return { errorId, recovered: true, strategy: strategy.name };
          }
        } catch (recoveryError) {
          console.error(`❌ Recovery strategy ${strategy.name} failed:`, recoveryError);
        }
      }
    }
    
    return { errorId, recovered: false };
  }

  getErrorState(error: Error): ErrorState {
    const message = error.message.toLowerCase();
    
    let type: ErrorState['type'] = 'unknown';
    if (message.includes('network') || message.includes('fetch') || message.includes('connection')) {
      type = 'connection';
    } else if (message.includes('api') || message.includes('server')) {
      type = 'api';
    } else if (message.includes('parse') || message.includes('json')) {
      type = 'parsing';
    }
    
    const isRetryable = type === 'connection' || type === 'api';
    
    return {
      type,
      message: error.message,
      isRetryable,
      retryCount: 0,
      lastRetryAt: null
    };
  }

  getLogs(): ErrorLog[] {
    return this.logger.getLogs();
  }

  getLogById(id: string): ErrorLog | undefined {
    return this.logger.getLogById(id);
  }

  clearLogs(): void {
    this.logger.clearLogs();
  }

  addRecoveryStrategy(strategy: RecoveryStrategy): void {
    this.strategies.push(strategy);
    this.strategies.sort((a, b) => a.priority - b.priority);
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

// Singleton instance
export const errorRecoveryManager = new ErrorRecoveryManager();

// Convenience function for logging errors
export const logError = async (
  error: Error, 
  errorInfo?: any, 
  context?: Record<string, any>
): Promise<string> => {
  try {
    const result = await errorRecoveryManager.handleError(error, errorInfo, context);
    return result.errorId;
  } catch {
    return `fallback_${Date.now()}`;
  }
};

// Convenience function for handling errors with recovery
export const handleErrorWithRecovery = async (
  error: Error,
  errorInfo?: any,
  context?: Record<string, any>
): Promise<{ errorId: string; recovered: boolean; strategy?: string }> => {
  return errorRecoveryManager.handleError(error, errorInfo, context);
};

// Export the manager for advanced usage
export { ErrorRecoveryManager };