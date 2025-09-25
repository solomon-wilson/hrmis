import { Request, Response, NextFunction } from 'express';
import { correlationIdMiddleware, getRequestCorrelationId } from '../../middleware/correlationId';

describe('Correlation ID Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;
  let setHeaderSpy: jest.Mock;

  beforeEach(() => {
    setHeaderSpy = jest.fn();
    
    mockRequest = {
      headers: {},
      method: 'GET',
      originalUrl: '/api/test'
    };
    
    mockResponse = {
      setHeader: setHeaderSpy
    };
    
    mockNext = jest.fn();
    
    jest.clearAllMocks();
  });

  describe('correlationIdMiddleware', () => {
    it('should generate correlation ID when not present in headers', () => {
      correlationIdMiddleware(mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(mockRequest.correlationId).toMatch(/^req_\d+_[a-z0-9]+$/);
      expect(setHeaderSpy).toHaveBeenCalledWith('x-request-id', mockRequest.correlationId);
      expect(setHeaderSpy).toHaveBeenCalledWith('x-correlation-id', mockRequest.correlationId);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should use existing x-request-id header', () => {
      mockRequest.headers = { 'x-request-id': 'existing-request-id' };
      
      correlationIdMiddleware(mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(mockRequest.correlationId).toBe('existing-request-id');
      expect(setHeaderSpy).toHaveBeenCalledWith('x-request-id', 'existing-request-id');
      expect(setHeaderSpy).toHaveBeenCalledWith('x-correlation-id', 'existing-request-id');
      expect(mockNext).toHaveBeenCalled();
    });

    it('should use existing x-correlation-id header', () => {
      mockRequest.headers = { 'x-correlation-id': 'existing-correlation-id' };
      
      correlationIdMiddleware(mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(mockRequest.correlationId).toBe('existing-correlation-id');
      expect(setHeaderSpy).toHaveBeenCalledWith('x-request-id', 'existing-correlation-id');
      expect(setHeaderSpy).toHaveBeenCalledWith('x-correlation-id', 'existing-correlation-id');
      expect(mockNext).toHaveBeenCalled();
    });

    it('should prefer x-request-id over x-correlation-id when both are present', () => {
      mockRequest.headers = { 
        'x-request-id': 'request-id',
        'x-correlation-id': 'correlation-id'
      };
      
      correlationIdMiddleware(mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(mockRequest.correlationId).toBe('request-id');
      expect(setHeaderSpy).toHaveBeenCalledWith('x-request-id', 'request-id');
      expect(setHeaderSpy).toHaveBeenCalledWith('x-correlation-id', 'request-id');
    });
  });

  describe('getRequestCorrelationId', () => {
    it('should return correlation ID from request object', () => {
      mockRequest.correlationId = 'stored-correlation-id';
      
      const correlationId = getRequestCorrelationId(mockRequest as Request);
      
      expect(correlationId).toBe('stored-correlation-id');
    });

    it('should generate correlation ID when not stored in request', () => {
      mockRequest.headers = { 'x-request-id': 'header-request-id' };
      
      const correlationId = getRequestCorrelationId(mockRequest as Request);
      
      expect(correlationId).toBe('header-request-id');
    });

    it('should generate new correlation ID when neither stored nor in headers', () => {
      const correlationId = getRequestCorrelationId(mockRequest as Request);
      
      expect(correlationId).toMatch(/^req_\d+_[a-z0-9]+$/);
    });
  });
});