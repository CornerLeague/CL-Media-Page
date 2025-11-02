import { withSource } from "../logger";
import { metrics } from "../metrics";
import { 
  UserTeamScoresError, 
  DatabaseError, 
  AuthenticationError, 
  ValidationError, 
  WebSocketError,
  RateLimitError,
  ServiceUnavailableError,
  ErrorSeverity 
} from "../types/errors";

const monitoringLog = withSource("error-monitoring");

/**
 * Error monitoring configuration
 */
interface ErrorMonitoringConfig {
  // Alert thresholds
  errorRateThreshold: number; // errors per minute
  criticalErrorThreshold: number; // critical errors per hour
  
  // Time windows for analysis
  shortTermWindowMs: number; // 5 minutes
  longTermWindowMs: number; // 1 hour
  
  // Notification settings
  enableSlackAlerts: boolean;
  enableEmailAlerts: boolean;
  slackWebhookUrl?: string;
  emailRecipients: string[];
  
  // Error categorization
  criticalErrorTypes: string[];
  ignoredErrorPatterns: RegExp[];
}

const DEFAULT_CONFIG: ErrorMonitoringConfig = {
  errorRateThreshold: 10, // 10 errors per minute
  criticalErrorThreshold: 5, // 5 critical errors per hour
  shortTermWindowMs: 5 * 60 * 1000, // 5 minutes
  longTermWindowMs: 60 * 60 * 1000, // 1 hour
  enableSlackAlerts: false,
  enableEmailAlerts: false,
  emailRecipients: [],
  criticalErrorTypes: [
    'DatabaseError',
    'AuthenticationError', 
    'ServiceUnavailableError'
  ],
  ignoredErrorPatterns: [
    /health.*check/i,
    /favicon\.ico/i
  ]
};

/**
 * Error tracking metrics
 */
interface ErrorMetrics {
  timestamp: number;
  errorType: string;
  severity: ErrorSeverity;
  operation: string;
  message: string;
  context: Record<string, any>;
  stackTrace?: string;
}

/**
 * Aggregated error statistics
 */
interface ErrorStats {
  totalErrors: number;
  errorsByType: Map<string, number>;
  errorsBySeverity: Map<ErrorSeverity, number>;
  errorsByOperation: Map<string, number>;
  recentErrors: ErrorMetrics[];
  errorRate: number; // errors per minute
  criticalErrorRate: number; // critical errors per hour
}

/**
 * Alert information
 */
interface AlertInfo {
  type: 'error_rate' | 'critical_error' | 'service_degradation';
  severity: 'warning' | 'critical';
  message: string;
  details: Record<string, any>;
  timestamp: number;
}

/**
 * Error monitoring and alerting system
 */
export class ErrorMonitoring {
  private config: ErrorMonitoringConfig;
  private errorHistory: ErrorMetrics[] = [];
  private alertHistory: AlertInfo[] = [];
  private lastCleanup: number = Date.now();
  
  constructor(config: Partial<ErrorMonitoringConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    // Start cleanup interval
    setInterval(() => this.cleanup(), 10 * 60 * 1000); // Every 10 minutes
    
    monitoringLog.info({
      config: this.config
    }, 'Error monitoring system initialized');
  }

  /**
   * Track an error occurrence
   */
  trackError(error: UserTeamScoresError | Error, context: Record<string, any> = {}): void {
    try {
      // Skip ignored error patterns
      if (this.shouldIgnoreError(error)) {
        return;
      }

      const errorMetric: ErrorMetrics = {
        timestamp: Date.now(),
        errorType: error.constructor.name,
        severity: this.getErrorSeverity(error),
        operation: context.operation || 'unknown',
        message: error.message,
        context,
        stackTrace: error.stack
      };

      this.errorHistory.push(errorMetric);
      
      // Record Prometheus metrics
      const errorCode = error instanceof UserTeamScoresError ? error.code : 'UNKNOWN_ERROR';
      metrics.recordUserTeamScoresError(
        errorCode,
        errorMetric.errorType,
        errorMetric.severity,
        errorMetric.operation
      );
      
      // Update error rate metrics
      this.updateErrorRateMetrics();
      
      // Check for alert conditions
      this.checkAlertConditions();
      
      monitoringLog.debug({
        errorType: errorMetric.errorType,
        severity: errorMetric.severity,
        operation: errorMetric.operation,
        errorCode
      }, 'Error tracked');
      
    } catch (err) {
      monitoringLog.error({ err }, 'Failed to track error');
    }
  }

  /**
   * Get current error statistics
   */
  getErrorStats(): ErrorStats {
    const now = Date.now();
    const shortTermWindow = now - this.config.shortTermWindowMs;
    const longTermWindow = now - this.config.longTermWindowMs;
    
    const recentErrors = this.errorHistory.filter(e => e.timestamp >= shortTermWindow);
    const longTermErrors = this.errorHistory.filter(e => e.timestamp >= longTermWindow);
    
    const errorsByType = new Map<string, number>();
    const errorsBySeverity = new Map<ErrorSeverity, number>();
    const errorsByOperation = new Map<string, number>();
    
    for (const error of this.errorHistory) {
      // Count by type
      errorsByType.set(error.errorType, (errorsByType.get(error.errorType) || 0) + 1);
      
      // Count by severity
      errorsBySeverity.set(error.severity, (errorsBySeverity.get(error.severity) || 0) + 1);
      
      // Count by operation
      errorsByOperation.set(error.operation, (errorsByOperation.get(error.operation) || 0) + 1);
    }
    
    // Calculate error rates
    const errorRate = (recentErrors.length / this.config.shortTermWindowMs) * 60 * 1000; // per minute
    const criticalErrors = longTermErrors.filter(e => 
      e.severity === ErrorSeverity.CRITICAL || 
      this.config.criticalErrorTypes.includes(e.errorType)
    );
    const criticalErrorRate = (criticalErrors.length / this.config.longTermWindowMs) * 60 * 60 * 1000; // per hour
    
    return {
      totalErrors: this.errorHistory.length,
      errorsByType,
      errorsBySeverity,
      errorsByOperation,
      recentErrors: recentErrors.slice(-50), // Last 50 recent errors
      errorRate,
      criticalErrorRate
    };
  }

  /**
   * Get recent alerts
   */
  getRecentAlerts(limit: number = 20): AlertInfo[] {
    return this.alertHistory
      .slice(-limit)
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Update error rate metrics for Prometheus
   */
  private updateErrorRateMetrics(): void {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    
    // Group errors by type for the last minute
    const errorsByType = new Map<string, number>();
    
    this.errorHistory
      .filter(error => error.timestamp > oneMinuteAgo)
      .forEach(error => {
        const count = errorsByType.get(error.errorType) || 0;
        errorsByType.set(error.errorType, count + 1);
      });
    
    // Update Prometheus gauges
    errorsByType.forEach((count, errorType) => {
      metrics.updateErrorRate(errorType, count);
    });
  }

  /**
   * Check if error should be ignored
   */
  private shouldIgnoreError(error: Error): boolean {
    const message = error.message.toLowerCase();
    return this.config.ignoredErrorPatterns.some(pattern => pattern.test(message));
  }

  /**
   * Get error severity level
   */
  private getErrorSeverity(error: Error): ErrorSeverity {
    if (error instanceof UserTeamScoresError) {
      // UserTeamScoresError doesn't have severity property, so we determine based on type
      if (error instanceof DatabaseError || 
          error instanceof AuthenticationError || 
          error instanceof ServiceUnavailableError) {
        return ErrorSeverity.CRITICAL;
      }
      
      if (error instanceof ValidationError || 
          error instanceof WebSocketError) {
        return ErrorSeverity.MEDIUM;
      }
      
      return ErrorSeverity.HIGH;
    }
    
    // Default severity based on error type
    if (error instanceof DatabaseError || 
        error instanceof AuthenticationError || 
        error instanceof ServiceUnavailableError) {
      return ErrorSeverity.CRITICAL;
    }
    
    if (error instanceof ValidationError || 
        error instanceof WebSocketError) {
      return ErrorSeverity.MEDIUM;
    }
    
    return ErrorSeverity.HIGH;
  }

  /**
   * Check for alert conditions and trigger alerts if needed
   */
  private checkAlertConditions(): void {
    const stats = this.getErrorStats();
    
    // Check error rate threshold
    if (stats.errorRate > this.config.errorRateThreshold) {
      this.triggerAlert({
        type: 'error_rate',
        severity: 'warning',
        message: `High error rate detected: ${stats.errorRate.toFixed(2)} errors/minute`,
        details: {
          errorRate: stats.errorRate,
          threshold: this.config.errorRateThreshold,
          recentErrorTypes: Array.from(stats.errorsByType.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
        },
        timestamp: Date.now()
      });
    }
    
    // Check critical error threshold
    if (stats.criticalErrorRate > this.config.criticalErrorThreshold) {
      this.triggerAlert({
        type: 'critical_error',
        severity: 'critical',
        message: `Critical error threshold exceeded: ${stats.criticalErrorRate.toFixed(2)} critical errors/hour`,
        details: {
          criticalErrorRate: stats.criticalErrorRate,
          threshold: this.config.criticalErrorThreshold,
          criticalErrorTypes: this.config.criticalErrorTypes
        },
        timestamp: Date.now()
      });
    }
  }

  /**
   * Trigger an alert
   */
  private async triggerAlert(alert: AlertInfo): Promise<void> {
    try {
      // Prevent duplicate alerts within 5 minutes
      const recentSimilarAlert = this.alertHistory.find(a => 
        a.type === alert.type && 
        a.timestamp > Date.now() - 5 * 60 * 1000
      );
      
      if (recentSimilarAlert) {
        return;
      }
      
      this.alertHistory.push(alert);
      
      // Record alert in Prometheus metrics
      metrics.recordAlert(alert.type, alert.severity);
      
      monitoringLog.warn({
        alertType: alert.type,
        severity: alert.severity,
        message: alert.message,
        details: alert.details
      }, 'Alert triggered');
      
      // Send notifications
      await this.sendNotifications(alert);
      
    } catch (err) {
      monitoringLog.error({ err }, 'Failed to trigger alert');
    }
  }

  /**
   * Send alert notifications
   */
  private async sendNotifications(alert: AlertInfo): Promise<void> {
    const promises: Promise<void>[] = [];
    
    // Slack notification
    if (this.config.enableSlackAlerts && this.config.slackWebhookUrl) {
      promises.push(this.sendSlackNotification(alert));
    }
    
    // Email notification
    if (this.config.enableEmailAlerts && this.config.emailRecipients.length > 0) {
      promises.push(this.sendEmailNotification(alert));
    }
    
    await Promise.allSettled(promises);
  }

  /**
   * Send Slack notification
   */
  private async sendSlackNotification(alert: AlertInfo): Promise<void> {
    try {
      if (!this.config.slackWebhookUrl) return;
      
      const color = alert.severity === 'critical' ? 'danger' : 'warning';
      const emoji = alert.severity === 'critical' ? '🚨' : '⚠️';
      
      const payload = {
        text: `${emoji} Sports Center Alert`,
        attachments: [{
          color,
          title: alert.message,
          fields: [
            {
              title: 'Type',
              value: alert.type,
              short: true
            },
            {
              title: 'Severity',
              value: alert.severity,
              short: true
            },
            {
              title: 'Time',
              value: new Date(alert.timestamp).toISOString(),
              short: true
            }
          ],
          text: JSON.stringify(alert.details, null, 2)
        }]
      };
      
      const response = await fetch(this.config.slackWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        throw new Error(`Slack notification failed: ${response.statusText}`);
      }
      
      monitoringLog.info('Slack notification sent successfully');
      
    } catch (err) {
      monitoringLog.error({ err }, 'Failed to send Slack notification');
    }
  }

  /**
   * Send email notification
   */
  private async sendEmailNotification(alert: AlertInfo): Promise<void> {
    try {
      // This would integrate with your email service (SendGrid, SES, etc.)
      // For now, just log the notification
      monitoringLog.info({
        recipients: this.config.emailRecipients,
        alert
      }, 'Email notification would be sent');
      
    } catch (err) {
      monitoringLog.error({ err }, 'Failed to send email notification');
    }
  }

  /**
   * Clean up old error history and alerts
   */
  private cleanup(): void {
    const now = Date.now();
    const cutoffTime = now - (24 * 60 * 60 * 1000); // Keep 24 hours of history
    
    const initialErrorCount = this.errorHistory.length;
    const initialAlertCount = this.alertHistory.length;
    
    this.errorHistory = this.errorHistory.filter(e => e.timestamp >= cutoffTime);
    this.alertHistory = this.alertHistory.filter(a => a.timestamp >= cutoffTime);
    
    const cleanedErrors = initialErrorCount - this.errorHistory.length;
    const cleanedAlerts = initialAlertCount - this.alertHistory.length;
    
    if (cleanedErrors > 0 || cleanedAlerts > 0) {
      monitoringLog.info({
        cleanedErrors,
        cleanedAlerts,
        remainingErrors: this.errorHistory.length,
        remainingAlerts: this.alertHistory.length
      }, 'Error monitoring cleanup completed');
    }
    
    this.lastCleanup = now;
  }
}

// Global error monitoring instance
export const errorMonitoring = new ErrorMonitoring();

/**
 * Convenience function to track errors
 */
export function trackError(error: UserTeamScoresError | Error, context: Record<string, any> = {}): void {
  errorMonitoring.trackError(error, context);
}

/**
 * Get error monitoring health status
 */
export function getMonitoringHealth(): {
  isHealthy: boolean;
  stats: ErrorStats;
  recentAlerts: AlertInfo[];
  uptime: number;
} {
  const stats = errorMonitoring.getErrorStats();
  const recentAlerts = errorMonitoring.getRecentAlerts(10);
  
  // Consider system healthy if error rate is below threshold and no critical alerts in last hour
  const recentCriticalAlerts = recentAlerts.filter(a => 
    a.severity === 'critical' && 
    a.timestamp > Date.now() - 60 * 60 * 1000
  );
  
  const isHealthy = stats.errorRate <= DEFAULT_CONFIG.errorRateThreshold && 
                   recentCriticalAlerts.length === 0;
  
  return {
    isHealthy,
    stats,
    recentAlerts,
    uptime: Date.now() - errorMonitoring['lastCleanup']
  };
}