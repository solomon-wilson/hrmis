import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { employeeRoutes } from './routes/employeeRoutes';
import { managerRoutes } from './routes/managerRoutes';
import { employeeSelfServiceRoutes } from './routes/employeeSelfServiceRoutes';
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';

export const createApp = (): express.Application => {
  const app = express();

  // Security middleware
  app.use(helmet());
  
  // CORS configuration
  app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  }));

  // Body parsing middleware
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

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