import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { employeeRoutes } from './routes/employeeRoutes';
import { managerRoutes } from './routes/managerRoutes';
import { employeeSelfServiceRoutes } from './routes/employeeSelfServiceRoutes';
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import { correlationIdMiddleware } from './middleware/correlationId';
import { applySecurity, securityHeaders, requestSizeLimit, requestTimeout } from './middleware/security';
import { sanitizeInput, validateContentType } from './middleware/inputValidation';
import { generalRateLimit } from './middleware/rateLimiting';

export const createApp = (): express.Application => {
  const app = express();

  // Correlation ID tracking (should be first)
  app.use(correlationIdMiddleware);

  // Security headers and protection
  app.use(securityHeaders);
  app.use(requestSizeLimit(10 * 1024 * 1024)); // 10MB limit
  app.use(requestTimeout(30000)); // 30 second timeout

  // Enhanced security middleware (SQL injection, XSS, etc.)
  app.use(...applySecurity);

  // Rate limiting
  app.use(generalRateLimit);

  // Security middleware (keeping helmet for additional protection)
  app.use(helmet({
    contentSecurityPolicy: false, // We set our own CSP
    frameguard: false, // We set our own X-Frame-Options
    xssFilter: false // We set our own X-XSS-Protection
  }));
  
  // CORS configuration
  app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-request-id', 'x-correlation-id']
  }));

  // Content type validation
  app.use(validateContentType(['application/json', 'multipart/form-data']));

  // Body parsing middleware
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Input sanitization
  app.use(sanitizeInput);

  // Request logging
  app.use(requestLogger);

  // Health check endpoint
  app.get('/health', (_req, res) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0'
    });
  });

  // API routes
  app.use('/api/employees', employeeRoutes);
  app.use('/api/employees', employeeSelfServiceRoutes); // Self-service routes under /api/employees/me
  app.use('/api/managers', managerRoutes);

  // 404 handler
  app.use('*', (req, res) => {
    res.status(404).json({
      error: {
        code: 'NOT_FOUND',
        message: `Route ${req.method} ${req.originalUrl} not found`
      }
    });
  });

  // Global error handler
  app.use(errorHandler);

  return app;
};