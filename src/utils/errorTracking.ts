import { logger } from './logger';
import { metricsCollector } from './metrics';
import { BaseError } from './errors';

// Error tracking interfaces
export interface ErrorEvent {
  id: string;
  timestamp: Date;
  error: {
    name: string;
    message: string;
    stack?: string;
    code?: string;
  };
  context: {
    correlationId?: string;
    userId?: string;
    method?: string;
    path?: string;
    userAgent?: string;
    ip?: string;
    environment: string;
  };
  severity: 'low' | 'medium' | 'high' | 'critical';
  fingerprint: string;
  count: number;
}

export interface AlertRule {
  name: string;
  condition: (events: ErrorEvent[]) => boolean;
  severity: 'warning' | 'critical';
  cooldown: number; // Minutes
  enabled: boolean;
}

// Error tracking and alerting system
class ErrorTracker {
  private errorEvents: Map<string, ErrorEvent> = new Map();
  private alertRules: AlertRule[] = [];
  private lastAlerts: Map<string, Date> = new Map();
  private readonly maxEvents = 10000;

  constructor() {
    this.setupDefaultAlertRules();
    this.startPeriodicCleanup();
  }

  /**
   * Track an error event
   */
  trackError(
    error: Error | BaseError,
    context: Partial<ErrorEvent['context']> = {}
  ): void {
    const errorEvent = this.createErrorEvent(error, context);
    const fingerprint = this.generateFingerprint(error, context);
    
    // Check if we've seen this error before
    const existingEvent = this.errorEvents.get(fingerprint);
    if (existingEvent) {
      existingEvent.count++;
      existingEvent.timestamp = new Date();
    } else {
      errorEvent.fingerprint = fingerprint;
      this.errorEvents.set(fingerprint, errorEvent);
    }

    // Record error metrics
    metricsCollector.recordMetric({
      name: 'error_tracked',
      value: 1,
      unit: 'count',
      timestamp: new Date(),
      tags: {
        error_name: error.name,
        error_code: (error as BaseError).code || 'unknown',
        severity: errorEvent.severity,
        environment: context.environment || process.env.NODE_ENV || 'development'
      }
    });

    // Log the error
    logger.error('Error tracked', {
      errorId: errorEvent.id,
      fingerprint,
      count: existingEvent ? existingEvent.count : 1,
      severity: errorEvent.severity,
      error: {
        name: error.name,
        message: error.message,
        code: (error as BaseError).code
      },
      context: errorEvent.context
    });

    // Check alert rules
    this.checkAlertRules();
  }

  /**
   * Get error statistics
   */
  getErrorStats(timeRange?: { start: Date; end: Date }) {
    const events = Array.from(this.errorEvents.values());
    const filteredEvents = timeRange 
      ? events.filter(e => e.timestamp >= timeRange.start && e.timestamp <= timeRange.end)
      : events;

    const totalErrors = filteredEvents.reduce((sum, event) => sum + event.count, 0);
    const uniqueErrors = filteredEvents.length;
    
    // Group by severity
    const bySeverity = filteredEvents.reduce((acc, event) => {
      acc[event.severity] = (acc[event.severity] || 0) + event.count;
      return acc;
    }, {} as Record<string, number>);

    // Group by error type
    const byType = filteredEvents.reduce((acc, event) => {
      const type = event.error.name;
      acc[type] = (acc[type] || 0) + event.count;
      return acc;
    }, {} as Record<string, number>);

    // Top errors by frequency
    const topErrors = filteredEvents
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map(event => ({
        fingerprint: event.fingerprint,
        message: event.error.message,
        count: event.count,
        severity: event.severity,
        lastSeen: event.timestamp
      }));

    return {
      totalErrors,
      uniqueErrors,
      bySeverity,
      byType,
      topErrors,
      timeRange: timeRange || { start: new Date(0), end: new Date() }
    };
  }

  /**
   * Add custom alert rule
   */
  addAlertRule(rule: AlertRule): void {
    this.alertRules.push(rule);
    logger.info('Alert rule added', { ruleName: rule.name });
  }

  /**
   * Remove alert rule
   */
  removeAlertRule(ruleName: string): void {
    const index = this.alertRules.findIndex(rule => rule.name === ruleName);
    if (index !== -1) {
      this.alertRules.splice(index, 1);
      logger.info('Alert rule removed', { ruleName });
    }
  }

  /**
   * Get all alert rules
   */
  getAlertRules(): AlertRule[] {
    return [...this.alertRules];
  }

  /**
   * Create error event from error and context
   */
  private createErrorEvent(
    error: Error | BaseError,
    context: Partial<ErrorEvent['context']>
  ): ErrorEvent {
    const severity = this.determineSeverity(error, context);
    
    return {
      id: this.generateErrorId(),
      timestamp: new Date(),
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
        code: (error as BaseError).code
      },
      context: {
        environment: process.env.NODE_ENV || 'development',
        ...context
      },
      severity,
      fingerprint: '',
      count: 1
    };
  }

  /**
   * Generate unique fingerprint for error deduplication
   */
  private generateFingerprint(
    error: Error | BaseError,
    context: Partial<ErrorEvent['context']>
  ): string {
    const components = [
      error.name,
      error.message,
      (error as BaseError).code || '',
      context.path || '',
      context.method || ''
    ];
    
    return Buffer.from(components.join('|')).toString('base64');
  }

  /**
   * Generate unique error ID
   */
  private generateErrorId(): string {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Determine error severity
   */
  private determineSeverity(
    error: Error | BaseError,
    context: Partial<ErrorEvent['context']>
  ): ErrorEvent['severity'] {
    // Critical errors
    if (error.name === 'DatabaseError' || 
        error.message.includes('ECONNREFUSED') ||
        error.message.includes('out of memory')) {
      return 'critical';
    }

    // High severity errors
    if ((error as BaseError).statusCode >= 500 ||
        error.name === 'ExternalServiceError') {
      return 'high';
    }

    // Medium severity errors
    if ((error as BaseError).statusCode >= 400 ||
        error.name === 'ValidationError') {
      return 'medium';
    }

    // Default to low severity
    return 'low';
  }

  /**
   * Setup default alert rules
   */
  private setupDefaultAlertRules(): void {
    // High error rate alert
    this.alertRules.push({
      name: 'high_error_rate',
      condition: (events) => {
        const last5Minutes = new Date(Date.now() - 5 * 60 * 1000);
        const recentErrors = events.filter(e => e.timestamp >= last5Minutes);
        const totalErrors = recentErrors.reduce((sum, e) => sum + e.count, 0);
        return totalErrors > 50; // More than 50 errors in 5 minutes
      },
      severity: 'warning',
      cooldown: 15,
      enabled: true
    });

    // Critical error alert
    this.alertRules.push({
      name: 'critical_error',
      condition: (events) => {
        const last1Minute = new Date(Date.now() - 60 * 1000);
        const criticalErrors = events.filter(e => 
          e.severity === 'critical' && e.timestamp >= last1Minute
        );
        return criticalErrors.length > 0;
      },
      severity: 'critical',
      cooldown: 5,
      enabled: true
    });

    // Database error spike alert
    this.alertRules.push({
      name: 'database_error_spike',
      condition: (events) => {
        const last10Minutes = new Date(Date.now() - 10 * 60 * 1000);
        const dbErrors = events.filter(e => 
          e.error.name === 'DatabaseError' && e.timestamp >= last10Minutes
        );
        const totalDbErrors = dbErrors.reduce((sum, e) => sum + e.count, 0);
        return totalDbErrors > 10; // More than 10 DB errors in 10 minutes
      },
      severity: 'critical',
      cooldown: 10,
      enabled: true
    });

    // Authentication failure spike alert
    this.alertRules.push({
      name: 'auth_failure_spike',
      condition: (events) => {
        const last5Minutes = new Date(Date.now() - 5 * 60 * 1000);
        const authErrors = events.filter(e => 
          e.error.name === 'AuthenticationError' && e.timestamp >= last5Minutes
        );
        const totalAuthErrors = authErrors.reduce((sum, e) => sum + e.count, 0);
        return totalAuthErrors > 20; // More than 20 auth failures in 5 minutes
      },
      severity: 'warning',
      cooldown: 10,
      enabled: true
    });
  }

  /**
   * Check all alert rules and trigger alerts if needed
   */
  private checkAlertRules(): void {
    const events = Array.from(this.errorEvents.values());
    
    for (const rule of this.alertRules) {
      if (!rule.enabled) continue;
      
      // Check cooldown
      const lastAlert = this.lastAlerts.get(rule.name);
      if (lastAlert) {
        const cooldownExpired = Date.now() - lastAlert.getTime() > rule.cooldown * 60 * 1000;
        if (!cooldownExpired) continue;
      }
      
      // Check condition
      if (rule.condition(events)) {
        this.triggerAlert(rule, events);
        this.lastAlerts.set(rule.name, new Date());
      }
    }
  }

  /**
   * Trigger an alert
   */
  private triggerAlert(rule: AlertRule, events: ErrorEvent[]): void {
    const alertData = {
      ruleName: rule.name,
      severity: rule.severity,
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      errorStats: this.getErrorStats({
        start: new Date(Date.now() - 60 * 60 * 1000), // Last hour
        end: new Date()
      })
    };

    // Log the alert
    logger.error('Alert triggered', alertData);

    // Record alert metric
    metricsCollector.recordMetric({
      name: 'alert_triggered',
      value: 1,
      unit: 'count',
      timestamp: new Date(),
      tags: {
        rule_name: rule.name,
        severity: rule.severity,
        environment: alertData.environment
      }
    });

    // TODO: Send alert to external systems
    // - Email notifications
    // - Slack/Teams webhooks
    // - PagerDuty
    // - SMS alerts
    this.sendAlert(alertData);
  }

  /**
   * Send alert to external systems (placeholder)
   */
  private sendAlert(alertData: any): void {
    // Placeholder for external alert integrations
    logger.info('Alert would be sent to external systems', alertData);
    
    // Example webhook call (commented out)
    /*
    if (process.env.ALERT_WEBHOOK_URL) {
      fetch(process.env.ALERT_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(alertData)
      }).catch(error => {
        logger.error('Failed to send webhook alert', { error: error.message });
      });
    }
    */
  }

  /**
   * Periodic cleanup of old error events
   */
  private startPeriodicCleanup(): void {
    setInterval(() => {
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
      let removedCount = 0;
      
      for (const [fingerprint, event] of this.errorEvents.entries()) {
        if (event.timestamp < cutoff) {
          this.errorEvents.delete(fingerprint);
          removedCount++;
        }
      }
      
      if (removedCount > 0) {
        logger.debug('Cleaned up old error events', { removedCount });
      }
      
      // Also clean up old alerts
      const alertCutoff = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
      for (const [ruleName, lastAlert] of this.lastAlerts.entries()) {
        if (lastAlert < alertCutoff) {
          this.lastAlerts.delete(ruleName);
        }
      }
    }, 60 * 60 * 1000); // Run every hour
  }
}

// Global error tracker instance
export const errorTracker = new ErrorTracker();

// Helper function to track errors from middleware
export const trackError = (
  error: Error | BaseError,
  context?: Partial<ErrorEvent['context']>
): void => {
  errorTracker.trackError(error, context);
};

// Express middleware for automatic error tracking
export const errorTrackingMiddleware = (
  error: any,
  req: any,
  res: any,
  next: any
): void => {
  const context = {
    correlationId: req.correlationId,
    userId: req.user?.id,
    method: req.method,
    path: req.originalUrl,
    userAgent: req.headers['user-agent'],
    ip: req.ip || req.connection?.remoteAddress
  };
  
  errorTracker.trackError(error, context);
  next(error);
};