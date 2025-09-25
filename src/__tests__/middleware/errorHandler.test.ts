import { Request, Response, NextFunction } from 'express';
import { errorHandler } from '../../middleware/errorHandler';
import { logger } from '../../utils/logger';
import {
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError
} from '../../utils/errors';

// Mock logger
jest.mock('../../utils/logger', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    http: jest.fn(),
    debug: jest.fn()
  }
}));

describe('Error Handler Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;
  let jsonSpy: jest.Mock;
  let statusSpy: jest.Mock;

  beforeEach(() => {
    jsonSpy = jest.fn();
    statusSpy = jest.fn().mockReturnValue({ json: jsonSpy });
    
    mockRequest = {
      method: 'GET',
      originalUrl: '/api/test',
      headers: {
        'user-agent': 'test-agent',
        'x-request-id': 'test-request-id'
      },
      ip: '127.0.0.1'
    };
    
    mockResponse = {
      status: statusSpy,
      json: jsonSpy
    };
    
    mockNext = jest.fn();
    
    // Clear all mocks
    jest.clearAllMocks();
  });

  describe('AppError handling', () => {
    it('should handle ValidationError correctly', () => {
      const error = new ValidationError('Invalid input', { field: 'email' });
      
      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(statusSpy).toHaveBeenCalledWith(400);
      expect(jsonSpy).toHaveBeenCalledWith({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input',
          details: { field: 'email' },
          timestamp: expect.any(String),
          requestId: 'test-request-id',
          path: '/api/test'
        }
      });
      expect(logger.error).toHaveBeenCalled();
    });

    it('should handle AuthenticationError correctly', () => {
      const error = new AuthenticationError('Invalid token');
      
      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(statusSpy).toHaveBeenCalledWith(401);
      expect(jsonSpy).toHaveBeenCalledWith({
        error: {
          code: 'AUTHENTICATION_ERROR',
          message: 'Invalid token',
          timestamp: expect.any(String),
          requestId: 'test-request-id',
          path: '/api/test'
        }
      });
    });

    it('should handle AuthorizationError correctly', () => {
      const error = new AuthorizationError('Access denied');
      
      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(statusSpy).toHaveBeenCalledWith(403);
      expect(jsonSpy).toHaveBeenCalledWith({
        error: {
          code: 'AUTHORIZATION_ERROR',
          message: 'Access denied',
          timestamp: expect.any(String),
          requestId: 'test-request-id',
          path: '/api/test'
        }
      });
    });

    it('should handle NotFoundError correctly', () => {
      const error = new NotFoundError('Employee');
      
      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(statusSpy).toHaveBeenCalledWith(404);
      expect(jsonSpy).toHaveBeenCalledWith({
        error: {
          code: 'NOT_FOUND',
          message: 'Employee not found',
          timestamp: expect.any(String),
          requestId: 'test-request-id',
          path: '/api/test'
        }
      });
    });

    it('should handle ConflictError correctly', () => {
      const error = new ConflictError('Email already exists', { email: 'test@example.com' });
      
      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(statusSpy).toHaveBeenCalledWith(409);
      expect(jsonSpy).toHaveBeenCalledWith({
        error: {
          code: 'CONFLICT',
          message: 'Email already exists',
          details: { email: 'test@example.com' },
          timestamp: expect.any(String),
          requestId: 'test-request-id',
          path: '/api/test'
        }
      });
    });
  });

  describe('JWT error handling', () => {
    it('should handle JsonWebTokenError', () => {
      const error = new Error('invalid token');
      error.name = 'JsonWebTokenError';
      
      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(statusSpy).toHaveBeenCalledWith(401);
      expect(jsonSpy).toHaveBeenCalledWith({
        error: {
          code: 'AUTHENTICATION_ERROR',
          message: 'Invalid authentication token',
          timestamp: expect.any(String),
          requestId: 'test-request-id',
          path: '/api/test'
        }
      });
    });

    it('should handle TokenExpiredError', () => {
      const error = new Error('jwt expired');
      error.name = 'TokenExpiredError';
      
      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(statusSpy).toHaveBeenCalledWith(401);
      expect(jsonSpy).toHaveBeenCalledWith({
        error: {
          code: 'AUTHENTICATION_ERROR',
          message: 'Authentication token has expired',
          timestamp: expect.any(String),
          requestId: 'test-request-id',
          path: '/api/test'
        }
      });
    });
  });

  describe('Database error handling', () => {
    it('should handle unique constraint violation (23505)', () => {
      const error = {
        code: '23505',
        constraint: 'employees_email_key',
        detail: 'Key (email)=(test@example.com) already exists.'
      };
      
      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(statusSpy).toHaveBeenCalledWith(409);
      expect(jsonSpy).toHaveBeenCalledWith({
        error: {
          code: 'CONFLICT',
          message: 'A record with this information already exists',
          details: {
            constraint: 'employees_email_key',
            detail: 'Key (email)=(test@example.com) already exists.'
          },
          timestamp: expect.any(String),
          requestId: 'test-request-id',
          path: '/api/test'
        }
      });
    });

    it('should handle foreign key constraint violation (23503)', () => {
      const error = {
        code: '23503',
        constraint: 'employees_manager_id_fkey',
        detail: 'Key (manager_id)=(123) is not present in table "employees".'
      };
      
      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(statusSpy).toHaveBeenCalledWith(400);
      expect(jsonSpy).toHaveBeenCalledWith({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Referenced record does not exist',
          details: {
            constraint: 'employees_manager_id_fkey',
            detail: 'Key (manager_id)=(123) is not present in table "employees".'
          },
          timestamp: expect.any(String),
          requestId: 'test-request-id',
          path: '/api/test'
        }
      });
    });

    it('should handle database connection errors', () => {
      const error = {
        code: 'ECONNREFUSED',
        errno: -61,
        message: 'connect ECONNREFUSED 127.0.0.1:5432'
      };
      
      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(statusSpy).toHaveBeenCalledWith(500);
      expect(jsonSpy).toHaveBeenCalledWith({
        error: {
          code: 'DATABASE_ERROR',
          message: 'Database connection failed',
          details: {
            code: 'ECONNREFUSED',
            errno: -61
          },
          timestamp: expect.any(String),
          requestId: 'test-request-id',
          path: '/api/test'
        }
      });
    });
  });

  describe('Express built-in error handling', () => {
    it('should handle payload too large error', () => {
      const error = {
        type: 'entity.too.large',
        limit: 1048576,
        length: 2097152
      };
      
      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(statusSpy).toHaveBeenCalledWith(413);
      expect(jsonSpy).toHaveBeenCalledWith({
        error: {
          code: 'PAYLOAD_TOO_LARGE',
          message: 'Request payload exceeds size limit',
          details: { limit: 1048576, length: 2097152 },
          timestamp: expect.any(String),
          requestId: 'test-request-id',
          path: '/api/test'
        }
      });
    });

    it('should handle invalid JSON error', () => {
      const error = {
        type: 'entity.parse.failed',
        body: '{"invalid": json}'
      };
      
      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(statusSpy).toHaveBeenCalledWith(400);
      expect(jsonSpy).toHaveBeenCalledWith({
        error: {
          code: 'INVALID_JSON',
          message: 'Invalid JSON in request body',
          details: { body: '{"invalid": json}' },
          timestamp: expect.any(String),
          requestId: 'test-request-id',
          path: '/api/test'
        }
      });
    });
  });

  describe('Rate limiting error handling', () => {
    it('should handle rate limit exceeded error', () => {
      const error = {
        status: 429,
        retryAfter: 60,
        limit: 100,
        remaining: 0
      };
      
      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(statusSpy).toHaveBeenCalledWith(429);
      expect(jsonSpy).toHaveBeenCalledWith({
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests, please try again later',
          details: {
            retryAfter: 60,
            limit: 100,
            remaining: 0
          },
          timestamp: expect.any(String),
          requestId: 'test-request-id',
          path: '/api/test'
        }
      });
    });
  });

  describe('Generic error handling', () => {
    it('should handle unknown errors with default response', () => {
      const error = new Error('Unknown error');
      
      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(statusSpy).toHaveBeenCalledWith(500);
      expect(jsonSpy).toHaveBeenCalledWith({
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Unknown error',
          timestamp: expect.any(String),
          requestId: 'test-request-id',
          path: '/api/test'
        }
      });
    });

    it('should mask error messages in production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      
      const error = new Error('Sensitive error details');
      
      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(statusSpy).toHaveBeenCalledWith(500);
      expect(jsonSpy).toHaveBeenCalledWith({
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An unexpected error occurred. Please try again later.',
          timestamp: expect.any(String),
          requestId: 'test-request-id',
          path: '/api/test'
        }
      });
      
      process.env.NODE_ENV = originalEnv;
    });

    it('should include debug information in development', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      
      const error = new Error('Debug error');
      error.stack = 'Error stack trace';
      
      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(statusSpy).toHaveBeenCalledWith(500);
      expect(jsonSpy).toHaveBeenCalledWith({
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Debug error',
          timestamp: expect.any(String),
          requestId: 'test-request-id',
          path: '/api/test',
          details: {
            stack: 'Error stack trace',
            name: 'Error',
            type: 'object',
            properties: expect.any(Array)
          }
        }
      });
      
      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('Correlation ID handling', () => {
    it('should generate correlation ID when not present in headers', () => {
      mockRequest.headers = {};
      
      const error = new ValidationError('Test error');
      
      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            requestId: expect.stringMatching(/^req_\d+_[a-z0-9]+$/)
          })
        })
      );
    });

    it('should use existing correlation ID from x-correlation-id header', () => {
      mockRequest.headers = { 'x-correlation-id': 'existing-correlation-id' };
      
      const error = new ValidationError('Test error');
      
      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            requestId: 'existing-correlation-id'
          })
        })
      );
    });
  });

  describe('Logging behavior', () => {
    it('should log operational errors with appropriate context', () => {
      const error = new ValidationError('Test validation error');
      
      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(logger.error).toHaveBeenCalledWith('Request error occurred', {
        error: {
          name: 'ValidationError',
          message: 'Test validation error',
          code: 'VALIDATION_ERROR',
          stack: expect.any(String),
          isOperational: true
        },
        context: {
          requestId: 'test-request-id',
          method: 'GET',
          url: '/api/test',
          userAgent: 'test-agent',
          userId: undefined,
          ip: '127.0.0.1',
          timestamp: expect.any(String)
        },
        details: undefined
      });
    });

    it('should log non-operational errors with higher severity', () => {
      const error = new Error('System error') as any;
      error.isOperational = false;
      
      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(logger.error).toHaveBeenCalledTimes(2); // Once for the error, once for non-operational
      expect(logger.error).toHaveBeenCalledWith('Non-operational error occurred - requires investigation', {
        error: {
          name: 'Error',
          message: 'System error',
          stack: expect.any(String)
        },
        context: expect.any(Object)
      });
    });
  });
});