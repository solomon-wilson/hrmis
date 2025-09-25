import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { ValidationError } from '../utils/validation';

export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: any;
    timestamp: string;
    requestId?: string;
  };
}

export const errorHandler = (
  error: any,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  // Generate request ID for tracking
  const requestId = req.headers['x-request-id'] as string || 
                   req.headers['x-correlation-id'] as string ||
                   `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // Log the error with context
  logger.error('Request error occurred', {
    error: error.message,
    stack: error.stack,
    requestId,
    method: req.method,
    url: req.originalUrl,
    userAgent: req.headers['user-agent'],
    userId: req.user?.id,
    ip: req.ip
  });

  // Handle validation errors
  if (error instanceof ValidationError) {
    const response: ErrorResponse = {
      error: {
        code: 'VALIDATION_ERROR',
        message: error.message,
        details: error.details,
        timestamp: new Date().toISOString(),
        requestId
      }
    };
    res.status(400).json(response);
    return;
  }

  // Handle JWT errors
  if (error.name === 'JsonWebTokenError') {
    const response: ErrorResponse = {
      error: {
        code: 'INVALID_TOKEN',
        message: 'Invalid authentication token',
        timestamp: new Date().toISOString(),
        requestId
      }
    };
    res.status(401).json(response);
    return;
  }

  if (error.name === 'TokenExpiredError') {
    const response: ErrorResponse = {
      error: {
        code: 'TOKEN_EXPIRED',
        message: 'Authentication token has expired',
        timestamp: new Date().toISOString(),
        requestId
      }
    };
    res.status(401).json(response);
    return;
  }

  // Handle database errors
  if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
    const response: ErrorResponse = {
      error: {
        code: 'DATABASE_UNAVAILABLE',
        message: 'Database service is currently unavailable',
        timestamp: new Date().toISOString(),
        requestId
      }
    };
    res.status(503).json(response);
    return;
  }

  // Handle PostgreSQL errors
  if (error.code === '23505') { // Unique constraint violation
    const response: ErrorResponse = {
      error: {
        code: 'DUPLICATE_ENTRY',
        message: 'A record with this information already exists',
        timestamp: new Date().toISOString(),
        requestId
      }
    };
    res.status(409).json(response);
    return;
  }

  if (error.code === '23503') { // Foreign key constraint violation
    const response: ErrorResponse = {
      error: {
        code: 'REFERENCE_ERROR',
        message: 'Referenced record does not exist',
        timestamp: new Date().toISOString(),
        requestId
      }
    };
    res.status(400).json(response);
    return;
  }

  // Handle request timeout
  if (error.code === 'ETIMEDOUT') {
    const response: ErrorResponse = {
      error: {
        code: 'REQUEST_TIMEOUT',
        message: 'Request timed out',
        timestamp: new Date().toISOString(),
        requestId
      }
    };
    res.status(408).json(response);
    return;
  }

  // Handle request size errors
  if (error.type === 'entity.too.large') {
    const response: ErrorResponse = {
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: 'Request payload is too large',
        timestamp: new Date().toISOString(),
        requestId
      }
    };
    res.status(413).json(response);
    return;
  }

  // Handle malformed JSON
  if (error.type === 'entity.parse.failed') {
    const response: ErrorResponse = {
      error: {
        code: 'INVALID_JSON',
        message: 'Invalid JSON in request body',
        timestamp: new Date().toISOString(),
        requestId
      }
    };
    res.status(400).json(response);
    return;
  }

  // Handle rate limiting errors (if using express-rate-limit)
  if (error.status === 429) {
    const response: ErrorResponse = {
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests, please try again later',
        timestamp: new Date().toISOString(),
        requestId
      }
    };
    res.status(429).json(response);
    return;
  }

  // Default server error
  const response: ErrorResponse = {
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: process.env.NODE_ENV === 'production' 
        ? 'An unexpected error occurred' 
        : error.message,
      timestamp: new Date().toISOString(),
      requestId
    }
  };

  // Include stack trace in development
  if (process.env.NODE_ENV === 'development') {
    response.error.details = {
      stack: error.stack,
      name: error.name
    };
  }

  res.status(500).json(response);
};