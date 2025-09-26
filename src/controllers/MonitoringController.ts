import { Request, Response } from 'express';
import { logger } from '../utils/logger';
import { metricsCollector } from '../utils/metrics';
import { errorTracker } from '../utils/errorTracking';
import { getPerformanceStats } from '../middleware/performanceMonitoring';
import { performHealthCheck } from '../services/healthService';
import { getCorrelationId } from '../utils/errors';

/**
 * Controller for monitoring and metrics endpoints
 */
export class MonitoringController {
  /**
   * Get comprehensive system metrics
   */
  static async getMetrics(req: Request, res: Response): Promise<void> {
    const correlationId = getCorrelationId(req);
    
    try {
      const timeRange = MonitoringController.parseTimeRange(req.query);
      const performanceStats = getPerformanceStats();
      const errorStats = errorTracker.getErrorStats(timeRange);
      const healthStatus = await performHealthCheck();
      
      // Get aggregated metrics
      const httpMetrics = metricsCollector.getAggregatedMetrics('http_request', timeRange?.start);
      const dbMetrics = metricsCollector.getAggregatedMetrics('database_query', timeRange?.start);
      const systemMetrics = metricsCollector.getAggregatedMetrics('system_performance', timeRange?.start);
      
      const response = {
        timestamp: new Date().toISOString(),
        timeRange,
        health: healthStatus,
        performance: performanceStats,
        errors: errorStats,
        metrics: {
          http: httpMetrics,
          database: dbMetrics,
          system: systemMetrics
        },
        correlationId
      };
      
      logger.info('Metrics retrieved', {
        correlationId,
        timeRange,
        requestedBy: (req as any).user?.id
      });
      
      res.json(response);
    } catch (error) {
      logger.error('Failed to retrieve metrics', {
        error: error instanceof Error ? error.message : 'Unknown error',
        correlationId
      });
      
      res.status(500).json({
        error: {
          code: 'METRICS_RETRIEVAL_FAILED',
          message: 'Failed to retrieve system metrics',
          timestamp: new Date().toISOString(),
          requestId: correlationId
        }
      });
    }
  }

  /**
   * Get error tracking information
   */
  static async getErrors(req: Request, res: Response): Promise<void> {
    const correlationId = getCorrelationId(req);
    
    try {
      const timeRange = MonitoringController.parseTimeRange(req.query);
      const errorStats = errorTracker.getErrorStats(timeRange);
      const alertRules = errorTracker.getAlertRules();
      
      const response = {
        timestamp: new Date().toISOString(),
        timeRange,
        errorStats,
        alertRules: alertRules.map(rule => ({
          name: rule.name,
          severity: rule.severity,
          enabled: rule.enabled,
          cooldown: rule.cooldown
        })),
        correlationId
      };
      
      logger.info('Error tracking data retrieved', {
        correlationId,
        timeRange,
        totalErrors: errorStats.totalErrors,
        uniqueErrors: errorStats.uniqueErrors,
        requestedBy: (req as any).user?.id
      });
      
      res.json(response);
    } catch (error) {
      logger.error('Failed to retrieve error tracking data', {
        error: error instanceof Error ? error.message : 'Unknown error',
        correlationId
      });
      
      res.status(500).json({
        error: {
          code: 'ERROR_TRACKING_RETRIEVAL_FAILED',
          message: 'Failed to retrieve error tracking data',
          timestamp: new Date().toISOString(),
          requestId: correlationId
        }
      });
    }
  }

  /**
   * Get performance statistics
   */
  static async getPerformance(req: Request, res: Response): Promise<void> {
    const correlationId = getCorrelationId(req);
    
    try {
      const timeRange = MonitoringController.parseTimeRange(req.query);
      const performanceStats = getPerformanceStats();
      
      // Get detailed performance metrics
      const httpMetrics = metricsCollector.getAggregatedMetrics('http_request', timeRange?.start);
      const dbMetrics = metricsCollector.getAggregatedMetrics('database_query', timeRange?.start);
      
      // Get slow operations
      const slowHttpRequests = metricsCollector.getMetrics('http_request', timeRange?.start)
        .filter(m => m.value > 1000) // Slower than 1 second
        .sort((a, b) => b.value - a.value)
        .slice(0, 10);
        
      const slowDbQueries = metricsCollector.getMetrics('database_query', timeRange?.start)
        .filter(m => m.value > 500) // Slower than 500ms
        .sort((a, b) => b.value - a.value)
        .slice(0, 10);
      
      const response = {
        timestamp: new Date().toISOString(),
        timeRange,
        current: performanceStats,
        aggregated: {
          http: httpMetrics,
          database: dbMetrics
        },
        slowOperations: {
          httpRequests: slowHttpRequests.map(m => ({
            timestamp: m.timestamp,
            duration: m.value,
            tags: m.tags
          })),
          databaseQueries: slowDbQueries.map(m => ({
            timestamp: m.timestamp,
            duration: m.value,
            tags: m.tags
          }))
        },
        correlationId
      };
      
      logger.info('Performance data retrieved', {
        correlationId,
        timeRange,
        slowHttpRequests: slowHttpRequests.length,
        slowDbQueries: slowDbQueries.length,
        requestedBy: (req as any).user?.id
      });
      
      res.json(response);
    } catch (error) {
      logger.error('Failed to retrieve performance data', {
        error: error instanceof Error ? error.message : 'Unknown error',
        correlationId
      });
      
      res.status(500).json({
        error: {
          code: 'PERFORMANCE_RETRIEVAL_FAILED',
          message: 'Failed to retrieve performance data',
          timestamp: new Date().toISOString(),
          requestId: correlationId
        }
      });
    }
  }

  /**
   * Get system health status
   */
  static async getHealth(req: Request, res: Response): Promise<void> {
    const correlationId = getCorrelationId(req);
    
    try {
      const healthStatus = await performHealthCheck();
      const performanceStats = getPerformanceStats();
      
      const response = {
        ...healthStatus,
        performance: {
          activeRequests: performanceStats.activeRequests,
          maxConcurrentRequests: performanceStats.maxConcurrentRequests
        },
        correlationId
      };
      
      const statusCode = healthStatus.status === 'healthy' ? 200 : 
                        healthStatus.status === 'degraded' ? 200 : 503;
      
      logger.info('Health status retrieved', {
        correlationId,
        status: healthStatus.status,
        requestedBy: (req as any).user?.id
      });
      
      res.status(statusCode).json(response);
    } catch (error) {
      logger.error('Failed to retrieve health status', {
        error: error instanceof Error ? error.message : 'Unknown error',
        correlationId
      });
      
      res.status(503).json({
        error: {
          code: 'HEALTH_CHECK_FAILED',
          message: 'Failed to retrieve health status',
          timestamp: new Date().toISOString(),
          requestId: correlationId
        }
      });
    }
  }

  /**
   * Export metrics in Prometheus format
   */
  static async getPrometheusMetrics(req: Request, res: Response): Promise<void> {
    const correlationId = getCorrelationId(req);
    
    try {
      const timeRange = MonitoringController.parseTimeRange(req.query);
      const httpMetrics = metricsCollector.getAggregatedMetrics('http_request', timeRange?.start);
      const dbMetrics = metricsCollector.getAggregatedMetrics('database_query', timeRange?.start);
      const errorStats = errorTracker.getErrorStats(timeRange);
      const performanceStats = getPerformanceStats();
      
      // Generate Prometheus format metrics
      const prometheusMetrics = [
        `# HELP http_requests_total Total number of HTTP requests`,
        `# TYPE http_requests_total counter`,
        `http_requests_total ${httpMetrics.count}`,
        '',
        `# HELP http_request_duration_seconds HTTP request duration in seconds`,
        `# TYPE http_request_duration_seconds histogram`,
        `http_request_duration_seconds_sum ${httpMetrics.sum / 1000}`,
        `http_request_duration_seconds_count ${httpMetrics.count}`,
        '',
        `# HELP database_queries_total Total number of database queries`,
        `# TYPE database_queries_total counter`,
        `database_queries_total ${dbMetrics.count}`,
        '',
        `# HELP database_query_duration_seconds Database query duration in seconds`,
        `# TYPE database_query_duration_seconds histogram`,
        `database_query_duration_seconds_sum ${dbMetrics.sum / 1000}`,
        `database_query_duration_seconds_count ${dbMetrics.count}`,
        '',
        `# HELP errors_total Total number of errors`,
        `# TYPE errors_total counter`,
        `errors_total ${errorStats.totalErrors}`,
        '',
        `# HELP concurrent_requests Current number of concurrent requests`,
        `# TYPE concurrent_requests gauge`,
        `concurrent_requests ${performanceStats.activeRequests}`,
        ''
      ].join('\n');
      
      logger.debug('Prometheus metrics exported', {
        correlationId,
        metricsSize: prometheusMetrics.length,
        requestedBy: (req as any).user?.id
      });
      
      res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
      res.send(prometheusMetrics);
    } catch (error) {
      logger.error('Failed to export Prometheus metrics', {
        error: error instanceof Error ? error.message : 'Unknown error',
        correlationId
      });
      
      res.status(500).send('# Error exporting metrics\n');
    }
  }

  /**
   * Parse time range from query parameters
   */
  private static parseTimeRange(query: any): { start: Date; end: Date } | undefined {
    const { start, end, range } = query;
    
    if (range) {
      const now = new Date();
      const rangeMs = parseInt(range) * 1000; // Assume range is in seconds
      return {
        start: new Date(now.getTime() - rangeMs),
        end: now
      };
    }
    
    if (start || end) {
      return {
        start: start ? new Date(start) : new Date(0),
        end: end ? new Date(end) : new Date()
      };
    }
    
    return undefined;
  }
}