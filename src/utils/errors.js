// Custom error classes
export class AppError extends Error {
    constructor(message, code, statusCode, details, isOperational = true) {
        super(message);
        this.name = this.constructor.name;
        this.code = code;
        this.statusCode = statusCode;
        this.details = details;
        this.isOperational = isOperational;
        Error.captureStackTrace(this, this.constructor);
    }
}
// Specific error types
export class ValidationError extends AppError {
    constructor(message, details) {
        super(message, 'VALIDATION_ERROR', 400, details);
    }
}
export class AuthenticationError extends AppError {
    constructor(message = 'Authentication failed') {
        super(message, 'AUTHENTICATION_ERROR', 401);
    }
}
export class AuthorizationError extends AppError {
    constructor(message = 'Insufficient permissions') {
        super(message, 'AUTHORIZATION_ERROR', 403);
    }
}
export class NotFoundError extends AppError {
    constructor(resource = 'Resource') {
        super(`${resource} not found`, 'NOT_FOUND', 404);
    }
}
export class ConflictError extends AppError {
    constructor(message, details) {
        super(message, 'CONFLICT', 409, details);
    }
}
export class RateLimitError extends AppError {
    constructor(message = 'Rate limit exceeded') {
        super(message, 'RATE_LIMIT_EXCEEDED', 429);
    }
}
export class DatabaseError extends AppError {
    constructor(message, details) {
        super(message, 'DATABASE_ERROR', 500, details);
    }
}
export class ExternalServiceError extends AppError {
    constructor(service, message) {
        super(message || `External service ${service} is unavailable`, 'EXTERNAL_SERVICE_ERROR', 503);
    }
}
// Document/file specific errors
export class FileUploadError extends AppError {
    constructor(message, details, statusCode = 400) {
        super(message, 'FILE_UPLOAD_ERROR', statusCode, details);
    }
}
export class StorageQuotaExceededError extends AppError {
    constructor(quotaBytes, currentUsageBytes, attemptedBytes) {
        super('Storage quota exceeded', 'STORAGE_QUOTA_EXCEEDED', 413, { quotaBytes, currentUsageBytes, attemptedBytes });
    }
}
// Correlation ID utilities
export function generateCorrelationId() {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
export function getCorrelationId(req) {
    return (req.headers['x-request-id'] ||
        req.headers['x-correlation-id'] ||
        generateCorrelationId());
}
// Create error context from request
export function createErrorContext(req, requestId) {
    return {
        requestId,
        method: req.method,
        url: req.originalUrl,
        userAgent: req.headers['user-agent'],
        userId: req.user?.id,
        ip: req.ip || req.connection?.remoteAddress || 'unknown',
        timestamp: new Date().toISOString()
    };
}
// Database error mapping
export function mapDatabaseError(error) {
    switch (error.code) {
        case '23505': // Unique constraint violation
            return new ConflictError('A record with this information already exists', {
                constraint: error.constraint,
                detail: error.detail
            });
        case '23503': // Foreign key constraint violation
            return new ValidationError('Referenced record does not exist', {
                constraint: error.constraint,
                detail: error.detail
            });
        case '23502': // Not null constraint violation
            return new ValidationError('Required field is missing', {
                column: error.column,
                table: error.table
            });
        case '23514': // Check constraint violation
            return new ValidationError('Invalid data format', {
                constraint: error.constraint,
                detail: error.detail
            });
        case 'ECONNREFUSED':
        case 'ENOTFOUND':
        case 'ETIMEDOUT':
            return new DatabaseError('Database connection failed', {
                code: error.code,
                errno: error.errno
            });
        default:
            return new DatabaseError('Database operation failed', {
                code: error.code,
                message: error.message
            });
    }
}
// JWT error mapping
export function mapJWTError(error) {
    switch (error.name) {
        case 'JsonWebTokenError':
            return new AuthenticationError('Invalid authentication token');
        case 'TokenExpiredError':
            return new AuthenticationError('Authentication token has expired');
        case 'NotBeforeError':
            return new AuthenticationError('Token not active yet');
        default:
            return new AuthenticationError('Token validation failed');
    }
}
// Multer error mapping
export function mapMulterError(error) {
    if (!error || !error.code)
        return null;
    // Multer error codes: https://github.com/expressjs/multer#error-handling
    switch (error.code) {
        case 'LIMIT_FILE_SIZE':
            return new FileUploadError('Uploaded file is too large', { limit: error.limit }, 413);
        case 'LIMIT_FILE_COUNT':
            return new FileUploadError('Too many files uploaded', { limit: error.limit }, 400);
        case 'LIMIT_UNEXPECTED_FILE':
            return new FileUploadError('Unexpected file field', { field: error.field }, 400);
        default:
            return new FileUploadError('File upload failed', { code: error.code, message: error.message }, 400);
    }
}
