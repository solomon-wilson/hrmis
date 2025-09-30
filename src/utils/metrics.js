import { logger } from './logger';
// Metrics collector class
class MetricsCollector {
    constructor() {
        this.metrics = [];
        this.maxMetrics = 10000; // Keep last 10k metrics in memory
        this.flushInterval = 60000; // Flush every minute
        // Start periodic metrics collection
        this.startSystemMetricsCollection();
        this.startMetricsFlush();
    }
    /**
     * Record a generic metric
     */
    recordMetric(metric) {
        this.metrics.push(metric);
        this.trimMetrics();
        // Log metric for immediate visibility
        logger.debug('Metric recorded', {
            metric: {
                name: metric.name,
                value: metric.value,
                unit: metric.unit,
                tags: metric.tags
            }
        });
    }
    /**
     * Record HTTP request performance metric
     */
    recordHttpMetric(metric) {
        this.recordMetric(metric);
        // Log HTTP metrics with appropriate level based on performance
        const logLevel = metric.duration > 5000 ? 'warn' :
            metric.duration > 1000 ? 'info' : 'debug';
        logger[logLevel]('HTTP request metric', {
            http: {
                method: metric.method,
                path: metric.path,
                statusCode: metric.statusCode,
                duration: metric.duration,
                success: metric.success,
                correlationId: metric.correlationId,
                requestSize: metric.requestSize,
                responseSize: metric.responseSize
            }
        });
    }
    /**
     * Record database query performance metric
     */
    recordDatabaseMetric(metric) {
        this.recordMetric(metric);
        // Log slow queries as warnings
        const logLevel = metric.duration > 1000 ? 'warn' : 'debug';
        logger[logLevel]('Database query metric', {
            database: {
                operation: metric.operation,
                queryType: metric.queryType,
                duration: metric.duration,
                success: metric.success,
                rowsAffected: metric.rowsAffected,
                connectionPoolStats: metric.connectionPoolStats,
                errorCode: metric.errorCode,
                // Only log query in debug mode for security
                query: process.env.NODE_ENV === 'development' ? metric.query : '[REDACTED]'
            }
        });
    }
    /**
     * Record system performance metric
     */
    recordSystemMetric(metric) {
        this.recordMetric(metric);
        // Log system metrics
        logger.debug('System metric', {
            system: {
                cpu: metric.cpu,
                memory: metric.memory,
                eventLoop: metric.eventLoop
            }
        });
    }
    /**
     * Get metrics by name and time range
     */
    getMetrics(name, since) {
        let filtered = this.metrics;
        if (name) {
            filtered = filtered.filter(m => m.name === name);
        }
        if (since) {
            filtered = filtered.filter(m => m.timestamp >= since);
        }
        return filtered;
    }
    /**
     * Get aggregated metrics
     */
    getAggregatedMetrics(name, since) {
        const metrics = this.getMetrics(name, since);
        if (metrics.length === 0) {
            return { count: 0, avg: 0, min: 0, max: 0, sum: 0 };
        }
        const values = metrics.map(m => m.value);
        const sum = values.reduce((a, b) => a + b, 0);
        return {
            count: metrics.length,
            avg: sum / metrics.length,
            min: Math.min(...values),
            max: Math.max(...values),
            sum
        };
    }
    /**
     * Start collecting system metrics periodically
     */
    startSystemMetricsCollection() {
        const collectSystemMetrics = () => {
            try {
                const memUsage = process.memoryUsage();
                const cpuUsage = process.cpuUsage();
                // Calculate event loop delay
                const start = process.hrtime.bigint();
                setImmediate(() => {
                    const delay = Number(process.hrtime.bigint() - start) / 1000000; // Convert to ms
                    const systemMetric = {
                        name: 'system_performance',
                        value: delay,
                        unit: 'ms',
                        timestamp: new Date(),
                        cpu: {
                            usage: (cpuUsage.user + cpuUsage.system) / 1000000, // Convert to ms
                            loadAverage: process.platform !== 'win32' ? require('os').loadavg() : [0, 0, 0]
                        },
                        memory: {
                            used: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
                            total: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
                            percentage: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100),
                            heapUsed: memUsage.heapUsed,
                            heapTotal: memUsage.heapTotal
                        },
                        eventLoop: {
                            delay
                        }
                    };
                    this.recordSystemMetric(systemMetric);
                });
            }
            catch (error) {
                logger.error('Failed to collect system metrics', { error });
            }
        };
        // Collect system metrics every 30 seconds
        setInterval(collectSystemMetrics, 30000);
        // Collect initial metrics
        collectSystemMetrics();
    }
    /**
     * Start periodic metrics flush
     */
    startMetricsFlush() {
        setInterval(() => {
            this.flushMetrics();
        }, this.flushInterval);
    }
    /**
     * Flush metrics to external systems (placeholder for future implementation)
     */
    flushMetrics() {
        const metricsCount = this.metrics.length;
        if (metricsCount === 0)
            return;
        // Log metrics summary
        logger.info('Metrics flush', {
            metricsCount,
            oldestMetric: this.metrics[0]?.timestamp,
            newestMetric: this.metrics[metricsCount - 1]?.timestamp
        });
        // TODO: Send metrics to external monitoring systems
        // - Prometheus
        // - DataDog
        // - CloudWatch
        // - Grafana
        // For now, just log aggregated data
        this.logAggregatedMetrics();
    }
    /**
     * Log aggregated metrics for monitoring
     */
    logAggregatedMetrics() {
        const since = new Date(Date.now() - this.flushInterval);
        // HTTP request metrics
        const httpMetrics = this.getAggregatedMetrics('http_request', since);
        if (httpMetrics.count > 0) {
            logger.info('HTTP metrics summary', {
                period: `${this.flushInterval / 1000}s`,
                requests: httpMetrics.count,
                avgResponseTime: Math.round(httpMetrics.avg),
                maxResponseTime: Math.round(httpMetrics.max),
                minResponseTime: Math.round(httpMetrics.min)
            });
        }
        // Database query metrics
        const dbMetrics = this.getAggregatedMetrics('database_query', since);
        if (dbMetrics.count > 0) {
            logger.info('Database metrics summary', {
                period: `${this.flushInterval / 1000}s`,
                queries: dbMetrics.count,
                avgQueryTime: Math.round(dbMetrics.avg),
                maxQueryTime: Math.round(dbMetrics.max),
                minQueryTime: Math.round(dbMetrics.min)
            });
        }
    }
    /**
     * Trim metrics to prevent memory leaks
     */
    trimMetrics() {
        if (this.metrics.length > this.maxMetrics) {
            this.metrics = this.metrics.slice(-this.maxMetrics);
        }
    }
}
// Global metrics collector instance
export const metricsCollector = new MetricsCollector();
// Helper functions for common metric recording
export const recordHttpRequest = (method, path, statusCode, duration, correlationId, options) => {
    const metric = {
        name: 'http_request',
        value: duration,
        unit: 'ms',
        timestamp: new Date(),
        duration,
        operation: `${method} ${path}`,
        success: statusCode < 400,
        method,
        path,
        statusCode,
        correlationId,
        errorCode: options?.errorCode,
        requestSize: options?.requestSize,
        responseSize: options?.responseSize,
        userAgent: options?.userAgent,
        tags: {
            method,
            status_code: statusCode.toString(),
            success: (statusCode < 400).toString()
        }
    };
    metricsCollector.recordHttpMetric(metric);
};
export const recordDatabaseQuery = (query, queryType, duration, success, options) => {
    const metric = {
        name: 'database_query',
        value: duration,
        unit: 'ms',
        timestamp: new Date(),
        duration,
        operation: queryType,
        success,
        query,
        queryType,
        rowsAffected: options?.rowsAffected,
        errorCode: options?.errorCode,
        connectionPoolStats: options?.connectionPoolStats,
        tags: {
            query_type: queryType,
            success: success.toString()
        }
    };
    metricsCollector.recordDatabaseMetric(metric);
};
// Performance timing utilities
export class PerformanceTimer {
    constructor(name) {
        this.name = name;
        this.startTime = process.hrtime();
    }
    end(success = true, tags) {
        const [seconds, nanoseconds] = process.hrtime(this.startTime);
        const duration = seconds * 1000 + nanoseconds / 1000000; // Convert to milliseconds
        metricsCollector.recordMetric({
            name: this.name,
            value: duration,
            unit: 'ms',
            timestamp: new Date(),
            tags: {
                ...tags,
                success: success.toString()
            }
        });
        return duration;
    }
}
// Decorator for automatic performance monitoring
export function monitored(metricName) {
    return function (target, propertyName, descriptor) {
        const method = descriptor.value;
        const name = metricName || `${target.constructor.name}.${propertyName}`;
        descriptor.value = async function (...args) {
            const timer = new PerformanceTimer(name);
            try {
                const result = await method.apply(this, args);
                timer.end(true);
                return result;
            }
            catch (error) {
                timer.end(false, { error: error instanceof Error ? error.name : 'Unknown' });
                throw error;
            }
        };
        return descriptor;
    };
}
