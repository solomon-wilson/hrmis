import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { employeeRoutes } from './routes/employeeRoutes';
import { managerRoutes } from './routes/managerRoutes';
import { employeeSelfServiceRoutes } from './routes/employeeSelfServiceRoutes';
import { monitoringRoutes } from './routes/monitoringRoutes';
import { documentManagementRoutes } from './routes/document-management';
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import { correlationIdMiddleware } from './middleware/correlationId';
import { performanceMonitoring, apiUsageTracking, concurrencyMonitoring, errorRateMonitoring } from './middleware/performanceMonitoring';
import { errorTrackingMiddleware } from './utils/errorTracking';
import { applySecurity, securityHeaders, requestSizeLimit, requestTimeout } from './middleware/security';
import { sanitizeInput, validateContentType } from './middleware/inputValidation';
import { generalRateLimit } from './middleware/rateLimiting';
import { performHealthCheck, performLivenessCheck, performReadinessCheck } from './services/healthService';
export const createApp = () => {
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
    // Performance monitoring middleware
    app.use(performanceMonitoring);
    app.use(concurrencyMonitoring);
    app.use(errorRateMonitoring);
    app.use(apiUsageTracking);
    // Request logging
    app.use(requestLogger);
    // Health check endpoints
    app.get('/health', async (_req, res) => {
        try {
            const healthStatus = await performHealthCheck();
            const statusCode = healthStatus.status === 'healthy' ? 200 :
                healthStatus.status === 'degraded' ? 200 : 503;
            res.status(statusCode).json(healthStatus);
        }
        catch (error) {
            res.status(503).json({
                status: 'unhealthy',
                timestamp: new Date().toISOString(),
                error: 'Health check failed'
            });
        }
    });
    // Liveness probe endpoint (simple check)
    app.get('/health/live', (_req, res) => {
        const livenessStatus = performLivenessCheck();
        res.status(livenessStatus.status === 'alive' ? 200 : 503).json(livenessStatus);
    });
    // Readiness probe endpoint (checks dependencies)
    app.get('/health/ready', async (_req, res) => {
        try {
            const readinessStatus = await performReadinessCheck();
            const statusCode = readinessStatus.status === 'ready' ? 200 : 503;
            res.status(statusCode).json(readinessStatus);
        }
        catch (error) {
            res.status(503).json({
                status: 'not_ready',
                timestamp: new Date().toISOString(),
                error: 'Readiness check failed'
            });
        }
    });
    // API routes
    app.use('/api/employees', employeeRoutes);
    app.use('/api/employees', employeeSelfServiceRoutes); // Self-service routes under /api/employees/me
    app.use('/api/managers', managerRoutes);
    app.use('/api/monitoring', monitoringRoutes);
    app.use('/api/document-management', documentManagementRoutes);
    // 404 handler
    app.use('*', (req, res) => {
        res.status(404).json({
            error: {
                code: 'NOT_FOUND',
                message: `Route ${req.method} ${req.originalUrl} not found`
            }
        });
    });
    // Error tracking middleware (before error handler)
    app.use(errorTrackingMiddleware);
    // Global error handler
    app.use(errorHandler);
    return app;
};
