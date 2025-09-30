import { getCorrelationId } from '../utils/errors';
/**
 * Middleware to ensure every request has a correlation ID for tracking
 * This should be one of the first middleware in the chain
 */
export const correlationIdMiddleware = (req, res, next) => {
    // Get or generate correlation ID
    const correlationId = getCorrelationId(req);
    // Store in request object for easy access
    req.correlationId = correlationId;
    // Add to response headers for client tracking
    res.setHeader('x-request-id', correlationId);
    res.setHeader('x-correlation-id', correlationId);
    next();
};
/**
 * Helper function to get correlation ID from request
 * Can be used in services and other parts of the application
 */
export const getRequestCorrelationId = (req) => {
    return req.correlationId || getCorrelationId(req);
};
