import { logger } from '../utils/logger';
import { recordHttpRequest, PerformanceTimer, metricsCollector } from '../utils/metrics';
import { getCorrelationId } from '../utils/errors';
/**
 * Performance monitoring middleware for HTTP requests
 */
export const performanceMonitoring = (req, res, next) => {
    const startTime = Date.now();
    const correlationId = getCorrelationId(req);
    // Store timing information
    req.startTime = startTime;
    req.performanceTimer = new PerformanceTimer(`http_${req.method}_${req.route?.path || req.path}`);
    // Calculate request size
    req.requestSize = req.headers['content-length'] ?
        parseInt(req.headers['content-length'], 10) : 0;
    // Track response size
    let responseSize = 0;
    const originalWrite = res.write;
    const originalEnd = res.end;
    // Override write to track response size
    res.write = function (chunk, encoding, callback) {
        if (chunk) {
            responseSize += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk);
        }
        return originalWrite.call(this, chunk, encoding, callback);
    };
    // Override end to capture final metrics
    res.end = function (chunk, encoding, callback) {
        if (chunk) {
            responseSize += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk);
        }
        const duration = Date.now() - startTime;
        const statusCode = res.statusCode;
        const success = statusCode < 400;
        // Record HTTP request metrics
        recordHttpRequest(req.method, req.route?.path || req.path, statusCode, duration, correlationId, {
            requestSize: req.requestSize,
            responseSize,
            userAgent: req.headers['user-agent'],
            errorCode: !success ? `HTTP_${statusCode}` : undefined
        });
        // End performance timer
        if (req.performanceTimer) {
            req.performanceTimer.end(success, {
                method: req.method,
                path: req.route?.path || req.path,
                status_code: statusCode.toString()
            });
        }
        // Log performance warnings for slow requests
        if (duration > 5000) {
            logger.warn('Slow HTTP request detected', {
                method: req.method,
                path: req.originalUrl,
                duration,
                statusCode,
                correlationId,
                userAgent: req.headers['user-agent'],
                requestSize: req.requestSize,
                responseSize
            });
        }
        // Log memory usage for large requests/responses
        const totalSize = (req.requestSize || 0) + responseSize;
        if (totalSize > 10 * 1024 * 1024) { // 10MB
            logger.warn('Large HTTP request/response detected', {
                method: req.method,
                path: req.originalUrl,
                requestSize: req.requestSize,
                responseSize,
                totalSize,
                correlationId
            });
        }
        return originalEnd.call(this, chunk, encoding, callback);
    };
    next();
};
/**
 * Middleware to track API endpoint usage
 */
export const apiUsageTracking = (req, res, next) => {
    const endpoint = `${req.method} ${req.route?.path || req.path}`;
    const correlationId = getCorrelationId(req);
    // Record API usage metric
    metricsCollector.recordMetric({
        name: 'api_endpoint_usage',
        value: 1,
        unit: 'count',
        timestamp: new Date(),
        tags: {
            method: req.method,
            endpoint: req.route?.path || req.path,
            user_agent: req.headers['user-agent'] || 'unknown',
            correlation_id: correlationId
        }
    });
    // Track user-specific usage if authenticated
    const userId = req.user?.id;
    if (userId) {
        metricsCollector.recordMetric({
            name: 'user_api_usage',
            value: 1,
            unit: 'count',
            timestamp: new Date(),
            tags: {
                user_id: userId,
                endpoint,
                method: req.method
            }
        });
    }
    next();
};
/**
 * Middleware to monitor concurrent requests
 */
let activeRequests = 0;
let maxConcurrentRequests = 0;
export const concurrencyMonitoring = (req, res, next) => {
    activeRequests++;
    // Update max concurrent requests
    if (activeRequests > maxConcurrentRequests) {
        maxConcurrentRequests = activeRequests;
    }
    // Record concurrent requests metric
    metricsCollector.recordMetric({
        name: 'concurrent_requests',
        value: activeRequests,
        unit: 'count',
        timestamp: new Date(),
        tags: {
            max_concurrent: maxConcurrentRequests.toString()
        }
    });
    // Log high concurrency warnings
    if (activeRequests > 100) {
        logger.warn('High concurrent request load detected', {
            activeRequests,
            maxConcurrentRequests,
            timestamp: new Date().toISOString()
        });
    }
    // Decrement counter when request completes
    res.on('finish', () => {
        activeRequests--;
    });
    res.on('close', () => {
        activeRequests--;
    });
    next();
};
/**
 * Middleware to track error rates
 */
export const errorRateMonitoring = (req, res, next) => {
    const originalEnd = res.end;
    res.end = function (chunk, encoding, callback) {
        const statusCode = res.statusCode;
        const isError = statusCode >= 400;
        const errorType = statusCode >= 500 ? 'server_error' :
            statusCode >= 400 ? 'client_error' : 'success';
        // Record error rate metrics
        metricsCollector.recordMetric({
            name: 'http_response_status',
            value: 1,
            unit: 'count',
            timestamp: new Date(),
            tags: {
                status_code: statusCode.toString(),
                error_type: errorType,
                method: req.method,
                path: req.route?.path || req.path,
                is_error: isError.toString()
            }
        });
        // Record specific error metrics
        if (isError) {
            metricsCollector.recordMetric({
                name: 'http_errors',
                value: 1,
                unit: 'count',
                timestamp: new Date(),
                tags: {
                    status_code: statusCode.toString(),
                    error_type: errorType,
                    method: req.method,
                    path: req.route?.path || req.path
                }
            });
        }
        return originalEnd.call(this, chunk, encoding, callback);
    };
    next();
};
/**
 * Get current performance statistics
 */
export const getPerformanceStats = () => {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    return {
        activeRequests,
        maxConcurrentRequests,
        httpRequests: metricsCollector.getAggregatedMetrics('http_request', oneHourAgo),
        databaseQueries: metricsCollector.getAggregatedMetrics('database_query', oneHourAgo),
        errors: metricsCollector.getAggregatedMetrics('http_errors', oneHourAgo),
        timestamp: now.toISOString()
    };
};
/**
 * Reset performance counters (useful for testing)
 */
export const resetPerformanceCounters = () => {
    activeRequests = 0;
    maxConcurrentRequests = 0;
};
