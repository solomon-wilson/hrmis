import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  const startTime = Date.now();
  
  // Generate request ID if not present
  const requestId = req.headers['x-request-id'] as string || 
                   req.headers['x-correlation-id'] as string ||
                   `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // Add request ID to headers for response
  res.setHeader('x-request-id', requestId);

  // Log request start
  logger.http('Request started', {
    method: req.method,
    url: req.originalUrl,
    userAgent: req.headers['user-agent'],
    ip: req.ip,
    requestId,
    contentLength: req.headers['content-length'],
    contentType: req.headers['content-type']
  });

  // Override res.end to log response
  const originalEnd = res.end;
  res.end = function(chunk?: any, encoding?: any) {
    const duration = Date.now() - startTime;
    
    // Log response
    logger.http('Request completed', {
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      requestId,
      contentLength: res.getHeader('content-length'),
      userId: req.user?.id
    });

    // Call original end method
    return originalEnd.call(this, chunk, encoding);
  };

  next();
};