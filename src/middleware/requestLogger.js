import { logger } from '../utils/logger';
import { getCorrelationId } from '../utils/errors';
export const requestLogger = (req, res, next) => {
    const startTime = Date.now();
    // Get or generate correlation ID
    const requestId = getCorrelationId(req);
    // Store correlation ID in request for later use
    req.correlationId = requestId;
    // Add correlation ID to response headers
    res.setHeader('x-request-id', requestId);
    res.setHeader('x-correlation-id', requestId);
    // Extract additional request metadata
    const requestMetadata = {
        method: req.method,
        url: req.originalUrl,
        userAgent: req.headers['user-agent'],
        ip: req.ip || req.connection.remoteAddress || 'unknown',
        requestId,
        contentLength: req.headers['content-length'],
        contentType: req.headers['content-type'],
        referer: req.headers['referer'],
        origin: req.headers['origin'],
        timestamp: new Date().toISOString()
    };
    // Log request start
    logger.http('Request started', requestMetadata);
    // Override res.end to log response
    const originalEnd = res.end;
    res.end = function (chunk, encoding) {
        const duration = Date.now() - startTime;
        // Determine log level based on status code
        const statusCode = res.statusCode;
        const logLevel = statusCode >= 500 ? 'error' :
            statusCode >= 400 ? 'warn' : 'http';
        // Log response with appropriate level
        logger[logLevel]('Request completed', {
            ...requestMetadata,
            statusCode,
            duration: `${duration}ms`,
            durationMs: duration,
            contentLength: res.getHeader('content-length'),
            userId: req.user?.id,
            success: statusCode < 400,
            responseSize: chunk ? Buffer.byteLength(chunk) : 0
        });
        // Log slow requests as warnings
        if (duration > 5000) { // 5 seconds
            logger.warn('Slow request detected', {
                ...requestMetadata,
                duration: `${duration}ms`,
                statusCode,
                threshold: '5000ms'
            });
        }
        // Call original end method
        return originalEnd.call(this, chunk, encoding);
    };
    next();
};
