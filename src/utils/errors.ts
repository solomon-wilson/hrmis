import { Request } from 'express';

// Base error interface
export interface BaseError extends Error {
  code: string;
  statusCode: number;
  details?: any;
  isOperational?: boolean;
}

// Custom error classes
export class AppError extends Error implements BaseError {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: any;
  public readonly isOperational: boolean;

  constructor(
    message: string,
    code: string,
    statusCode: number,
    details?: any,
    isOperational: boolean = true
  ) {
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
  constructor(message: string, details?: any) {
    super(message, 'VALIDATION_ERROR', 400, details);
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication failed') {
    super(message, 'AUTHENTICATION_ERROR', 401);
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Insufficient permissions') {
    super(message, 'AUTHORIZATION_ERROR', 403);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string = 'Resource') {
    super(`${resource} not found`, 'NOT_FOUND', 404);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 'CONFLICT', 409, details);
  }
}

export class RateLimitError extends AppError {
  constructor(message: string = 'Rate limit exceeded') {
    super(message, 'RATE_LIMIT_EXCEEDED', 429);
  }
}

export class DatabaseError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 'DATABASE_ERROR', 500, details);
  }
}

export class ExternalServiceError extends AppError {
  constructor(service: string, message?: string) {
    super(
      message || `External service ${service} is unavailable`,
      'EXTERNAL_SERVICE_ERROR',
      503
    );
  }
}

// Error response interface
export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: any;
    timestamp: string;
    requestId: string;
    path?: string;
  };
}

// Correlation ID utilities
export function generateCorrelationId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function getCorrelationId(req: Request): string {
  return (
    req.headers['x-request-id'] as string ||
    req.headers['x-correlation-id'] as string ||
    generateCorrelationId()
  );
}

// Error context interface
export interface ErrorContext {
  requestId: string;
  method: string;
  url: string;
  userAgent?: string;
  userId?: string;
  ip: string;
  timestamp: string;
}

// Create error context from request
export function createErrorContext(req: Request, requestId: string): ErrorContext {
  return {
    requestId,
    method: req.method,
    url: req.originalUrl,
    userAgent: req.headers['user-agent'],
    userId: (req as any).user?.id,
    ip: req.ip || req.connection?.remoteAddress || 'unknown',
    timestamp: new Date().toISOString()
  };
}

// Database error mapping
export function mapDatabaseError(error: any): AppError {
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
export function mapJWTError(error: any): AppError {
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