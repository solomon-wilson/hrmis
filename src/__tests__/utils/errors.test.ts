import { Request } from 'express';
import {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  DatabaseError,
  ExternalServiceError,
  generateCorrelationId,
  getCorrelationId,
  createErrorContext,
  mapDatabaseError,
  mapJWTError
} from '../../utils/errors';

describe('Error Utilities', () => {
  describe('AppError', () => {
    it('should create AppError with all properties', () => {
      const error = new AppError('Test message', 'TEST_CODE', 400, { field: 'test' });
      
      expect(error.message).toBe('Test message');
      expect(error.code).toBe('TEST_CODE');
      expect(error.statusCode).toBe(400);
      expect(error.details).toEqual({ field: 'test' });
      expect(error.isOperational).toBe(true);
      expect(error.name).toBe('AppError');
    });

    it('should set isOperational to false when specified', () => {
      const error = new AppError('Test message', 'TEST_CODE', 500, undefined, false);
      
      expect(error.isOperational).toBe(false);
    });
  });

  describe('Specific Error Types', () => {
    it('should create ValidationError correctly', () => {
      const error = new ValidationError('Invalid input', { field: 'email' });
      
      expect(error.message).toBe('Invalid input');
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.statusCode).toBe(400);
      expect(error.details).toEqual({ field: 'email' });
    });

    it('should create AuthenticationError correctly', () => {
      const error = new AuthenticationError('Custom auth message');
      
      expect(error.message).toBe('Custom auth message');
      expect(error.code).toBe('AUTHENTICATION_ERROR');
      expect(error.statusCode).toBe(401);
    });

    it('should create AuthenticationError with default message', () => {
      const error = new AuthenticationError();
      
      expect(error.message).toBe('Authentication failed');
    });

    it('should create AuthorizationError correctly', () => {
      const error = new AuthorizationError('Custom auth message');
      
      expect(error.message).toBe('Custom auth message');
      expect(error.code).toBe('AUTHORIZATION_ERROR');
      expect(error.statusCode).toBe(403);
    });

    it('should create NotFoundError correctly', () => {
      const error = new NotFoundError('Employee');
      
      expect(error.message).toBe('Employee not found');
      expect(error.code).toBe('NOT_FOUND');
      expect(error.statusCode).toBe(404);
    });

    it('should create ConflictError correctly', () => {
      const error = new ConflictError('Duplicate entry', { field: 'email' });
      
      expect(error.message).toBe('Duplicate entry');
      expect(error.code).toBe('CONFLICT');
      expect(error.statusCode).toBe(409);
      expect(error.details).toEqual({ field: 'email' });
    });

    it('should create DatabaseError correctly', () => {
      const error = new DatabaseError('DB connection failed', { errno: -61 });
      
      expect(error.message).toBe('DB connection failed');
      expect(error.code).toBe('DATABASE_ERROR');
      expect(error.statusCode).toBe(500);
      expect(error.details).toEqual({ errno: -61 });
    });

    it('should create ExternalServiceError correctly', () => {
      const error = new ExternalServiceError('PaymentService', 'Service timeout');
      
      expect(error.message).toBe('Service timeout');
      expect(error.code).toBe('EXTERNAL_SERVICE_ERROR');
      expect(error.statusCode).toBe(503);
    });

    it('should create ExternalServiceError with default message', () => {
      const error = new ExternalServiceError('PaymentService');
      
      expect(error.message).toBe('External service PaymentService is unavailable');
    });
  });

  describe('Correlation ID utilities', () => {
    it('should generate correlation ID with correct format', () => {
      const correlationId = generateCorrelationId();
      
      expect(correlationId).toMatch(/^req_\d+_[a-z0-9]+$/);
    });

    it('should generate unique correlation IDs', () => {
      const id1 = generateCorrelationId();
      const id2 = generateCorrelationId();
      
      expect(id1).not.toBe(id2);
    });

    it('should get correlation ID from x-request-id header', () => {
      const mockRequest = {
        headers: { 'x-request-id': 'test-request-id' }
      } as Partial<Request> as Request;
      
      const correlationId = getCorrelationId(mockRequest);
      
      expect(correlationId).toBe('test-request-id');
    });

    it('should get correlation ID from x-correlation-id header', () => {
      const mockRequest = {
        headers: { 'x-correlation-id': 'test-correlation-id' }
      } as Partial<Request> as Request;
      
      const correlationId = getCorrelationId(mockRequest);
      
      expect(correlationId).toBe('test-correlation-id');
    });

    it('should prefer x-request-id over x-correlation-id', () => {
      const mockRequest = {
        headers: { 
          'x-request-id': 'request-id',
          'x-correlation-id': 'correlation-id'
        }
      } as Partial<Request> as Request;
      
      const correlationId = getCorrelationId(mockRequest);
      
      expect(correlationId).toBe('request-id');
    });

    it('should generate correlation ID when headers are missing', () => {
      const mockRequest = {
        headers: {}
      } as Partial<Request> as Request;
      
      const correlationId = getCorrelationId(mockRequest);
      
      expect(correlationId).toMatch(/^req_\d+_[a-z0-9]+$/);
    });
  });

  describe('createErrorContext', () => {
    it('should create error context with all fields', () => {
      const mockRequest = {
        method: 'POST',
        originalUrl: '/api/employees',
        headers: {
          'user-agent': 'test-agent'
        },
        ip: '192.168.1.1',
        user: { id: 'user123' }
      } as any;
      
      const context = createErrorContext(mockRequest, 'test-request-id');
      
      expect(context).toEqual({
        requestId: 'test-request-id',
        method: 'POST',
        url: '/api/employees',
        userAgent: 'test-agent',
        userId: 'user123',
        ip: '192.168.1.1',
        timestamp: expect.any(String)
      });
    });

    it('should handle missing optional fields', () => {
      const mockRequest = {
        method: 'GET',
        originalUrl: '/api/test',
        headers: {},
        connection: { remoteAddress: '127.0.0.1' }
      } as any;
      
      const context = createErrorContext(mockRequest, 'test-id');
      
      expect(context).toEqual({
        requestId: 'test-id',
        method: 'GET',
        url: '/api/test',
        userAgent: undefined,
        userId: undefined,
        ip: '127.0.0.1',
        timestamp: expect.any(String)
      });
    });

    it('should use "unknown" for IP when not available', () => {
      const mockRequest = {
        method: 'GET',
        originalUrl: '/api/test',
        headers: {}
      } as any;
      
      const context = createErrorContext(mockRequest, 'test-id');
      
      expect(context.ip).toBe('unknown');
    });
  });

  describe('mapDatabaseError', () => {
    it('should map unique constraint violation (23505)', () => {
      const dbError = {
        code: '23505',
        constraint: 'employees_email_key',
        detail: 'Key (email)=(test@example.com) already exists.'
      };
      
      const mappedError = mapDatabaseError(dbError);
      
      expect(mappedError).toBeInstanceOf(ConflictError);
      expect(mappedError.message).toBe('A record with this information already exists');
      expect(mappedError.details).toEqual({
        constraint: 'employees_email_key',
        detail: 'Key (email)=(test@example.com) already exists.'
      });
    });

    it('should map foreign key constraint violation (23503)', () => {
      const dbError = {
        code: '23503',
        constraint: 'employees_manager_id_fkey',
        detail: 'Key (manager_id)=(123) is not present in table "employees".'
      };
      
      const mappedError = mapDatabaseError(dbError);
      
      expect(mappedError).toBeInstanceOf(ValidationError);
      expect(mappedError.message).toBe('Referenced record does not exist');
    });

    it('should map not null constraint violation (23502)', () => {
      const dbError = {
        code: '23502',
        column: 'email',
        table: 'employees'
      };
      
      const mappedError = mapDatabaseError(dbError);
      
      expect(mappedError).toBeInstanceOf(ValidationError);
      expect(mappedError.message).toBe('Required field is missing');
      expect(mappedError.details).toEqual({
        column: 'email',
        table: 'employees'
      });
    });

    it('should map check constraint violation (23514)', () => {
      const dbError = {
        code: '23514',
        constraint: 'employees_status_check',
        detail: 'Failing row contains invalid status.'
      };
      
      const mappedError = mapDatabaseError(dbError);
      
      expect(mappedError).toBeInstanceOf(ValidationError);
      expect(mappedError.message).toBe('Invalid data format');
    });

    it('should map connection errors', () => {
      const dbError = {
        code: 'ECONNREFUSED',
        errno: -61
      };
      
      const mappedError = mapDatabaseError(dbError);
      
      expect(mappedError).toBeInstanceOf(DatabaseError);
      expect(mappedError.message).toBe('Database connection failed');
      expect(mappedError.details).toEqual({
        code: 'ECONNREFUSED',
        errno: -61
      });
    });

    it('should map unknown database errors', () => {
      const dbError = {
        code: 'UNKNOWN_ERROR',
        message: 'Unknown database error'
      };
      
      const mappedError = mapDatabaseError(dbError);
      
      expect(mappedError).toBeInstanceOf(DatabaseError);
      expect(mappedError.message).toBe('Database operation failed');
      expect(mappedError.details).toEqual({
        code: 'UNKNOWN_ERROR',
        message: 'Unknown database error'
      });
    });
  });

  describe('mapJWTError', () => {
    it('should map JsonWebTokenError', () => {
      const jwtError = {
        name: 'JsonWebTokenError',
        message: 'invalid token'
      };
      
      const mappedError = mapJWTError(jwtError);
      
      expect(mappedError).toBeInstanceOf(AuthenticationError);
      expect(mappedError.message).toBe('Invalid authentication token');
    });

    it('should map TokenExpiredError', () => {
      const jwtError = {
        name: 'TokenExpiredError',
        message: 'jwt expired'
      };
      
      const mappedError = mapJWTError(jwtError);
      
      expect(mappedError).toBeInstanceOf(AuthenticationError);
      expect(mappedError.message).toBe('Authentication token has expired');
    });

    it('should map NotBeforeError', () => {
      const jwtError = {
        name: 'NotBeforeError',
        message: 'jwt not active'
      };
      
      const mappedError = mapJWTError(jwtError);
      
      expect(mappedError).toBeInstanceOf(AuthenticationError);
      expect(mappedError.message).toBe('Token not active yet');
    });

    it('should map unknown JWT errors', () => {
      const jwtError = {
        name: 'UnknownJWTError',
        message: 'unknown jwt error'
      };
      
      const mappedError = mapJWTError(jwtError);
      
      expect(mappedError).toBeInstanceOf(AuthenticationError);
      expect(mappedError.message).toBe('Token validation failed');
    });
  });
});