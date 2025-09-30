import { logger } from '../utils/logger';
import { ValidationError } from '../utils/validation';
import { AppError, getCorrelationId, createErrorContext, mapDatabaseError, mapJWTError, mapMulterError } from '../utils/errors';
// Enhanced error handler with comprehensive error mapping and correlation tracking
export const errorHandler = (error, req, res, _next) => {
    // Get or generate correlation ID
    const requestId = getCorrelationId(req);
    // Create error context for logging
    const errorContext = createErrorContext(req, requestId);
    // Determine if this is an operational error
    const isOperational = error.isOperational !== undefined ? error.isOperational : true;
    // Log the error with full context
    logger.error('Request error occurred', {
        error: {
            name: error.name,
            message: error.message,
            code: error.code,
            stack: error.stack,
            isOperational
        },
        context: errorContext,
        details: error.details
    });
    // Handle AppError instances (our custom errors)
    if (error instanceof AppError) {
        const response = {
            error: {
                code: error.code,
                message: error.message,
                details: error.details,
                timestamp: new Date().toISOString(),
                requestId,
                path: req.originalUrl
            }
        };
        // Include stack trace in development for operational errors
        if (process.env.NODE_ENV === 'development' && error.isOperational) {
            response.error.details = {
                ...response.error.details,
                stack: error.stack
            };
        }
        res.status(error.statusCode).json(response);
        return;
    }
    // Handle legacy ValidationError from utils/validation
    if (error instanceof ValidationError) {
        const response = {
            error: {
                code: 'VALIDATION_ERROR',
                message: error.message,
                details: error.details,
                timestamp: new Date().toISOString(),
                requestId,
                path: req.originalUrl
            }
        };
        res.status(400).json(response);
        return;
    }
    // Handle Multer/file upload errors
    const mappedMulter = mapMulterError(error);
    if (mappedMulter) {
        const response = {
            error: {
                code: mappedMulter.code,
                message: mappedMulter.message,
                details: mappedMulter.details,
                timestamp: new Date().toISOString(),
                requestId,
                path: req.originalUrl
            }
        };
        res.status(mappedMulter.statusCode).json(response);
        return;
    }
    // Handle JWT errors
    if (error.name && ['JsonWebTokenError', 'TokenExpiredError', 'NotBeforeError'].includes(error.name)) {
        const mappedError = mapJWTError(error);
        const response = {
            error: {
                code: mappedError.code,
                message: mappedError.message,
                timestamp: new Date().toISOString(),
                requestId,
                path: req.originalUrl
            }
        };
        res.status(mappedError.statusCode).json(response);
        return;
    }
    // Handle database errors
    if (error.code && (error.code.startsWith('23') || ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT'].includes(error.code))) {
        const mappedError = mapDatabaseError(error);
        const response = {
            error: {
                code: mappedError.code,
                message: mappedError.message,
                details: mappedError.details,
                timestamp: new Date().toISOString(),
                requestId,
                path: req.originalUrl
            }
        };
        res.status(mappedError.statusCode).json(response);
        return;
    }
    // Handle Express built-in errors
    if (error.type === 'entity.too.large') {
        const response = {
            error: {
                code: 'PAYLOAD_TOO_LARGE',
                message: 'Request payload exceeds size limit',
                details: { limit: error.limit, length: error.length },
                timestamp: new Date().toISOString(),
                requestId,
                path: req.originalUrl
            }
        };
        res.status(413).json(response);
        return;
    }
    if (error.type === 'entity.parse.failed') {
        const response = {
            error: {
                code: 'INVALID_JSON',
                message: 'Invalid JSON in request body',
                details: { body: error.body },
                timestamp: new Date().toISOString(),
                requestId,
                path: req.originalUrl
            }
        };
        res.status(400).json(response);
        return;
    }
    // Handle rate limiting errors
    if (error.status === 429 || error.statusCode === 429) {
        const response = {
            error: {
                code: 'RATE_LIMIT_EXCEEDED',
                message: 'Too many requests, please try again later',
                details: {
                    retryAfter: error.retryAfter,
                    limit: error.limit,
                    remaining: error.remaining
                },
                timestamp: new Date().toISOString(),
                requestId,
                path: req.originalUrl
            }
        };
        res.status(429).json(response);
        return;
    }
    // Handle HTTP errors with status codes
    if (error.status || error.statusCode) {
        const statusCode = error.status || error.statusCode;
        const response = {
            error: {
                code: error.code || `HTTP_${statusCode}`,
                message: error.message || `HTTP ${statusCode} Error`,
                timestamp: new Date().toISOString(),
                requestId,
                path: req.originalUrl
            }
        };
        if (process.env.NODE_ENV === 'development') {
            response.error.details = {
                stack: error.stack,
                name: error.name
            };
        }
        res.status(statusCode).json(response);
        return;
    }
    // Log non-operational errors with higher severity
    if (!isOperational) {
        logger.error('Non-operational error occurred - requires investigation', {
            error: {
                name: error.name,
                message: error.message,
                stack: error.stack
            },
            context: errorContext
        });
    }
    // Default server error for unhandled cases
    const response = {
        error: {
            code: 'INTERNAL_SERVER_ERROR',
            message: process.env.NODE_ENV === 'production'
                ? 'An unexpected error occurred. Please try again later.'
                : error.message || 'Internal server error',
            timestamp: new Date().toISOString(),
            requestId,
            path: req.originalUrl
        }
    };
    // Include additional debug information in development
    if (process.env.NODE_ENV === 'development') {
        response.error.details = {
            stack: error.stack,
            name: error.name,
            type: typeof error,
            properties: Object.getOwnPropertyNames(error)
        };
    }
    res.status(500).json(response);
};
