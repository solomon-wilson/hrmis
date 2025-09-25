import { Request, Response, NextFunction } from 'express';
import { RateLimitError } from '../utils/errors';
import { logger } from '../utils/logger';

// In-memory store for rate limiting (in production, use Redis)
interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

const store: RateLimitStore = {};

// Rate limit configuration
export interface RateLimitConfig {
  windowMs: number;     // Time window in milliseconds
  maxRequests: number;  // Maximum requests per window
  message?: string;     // Custom error message
  skipSuccessfulRequests?: boolean; // Don't count successful requests
  skipFailedRequests?: boolean;     // Don't count failed requests
  keyGenerator?: (req: Request) => string; // Custom key generator
}

// Default configurations for different endpoints
export const rateLimitConfigs = {
  // General API rate limit
  general: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 100,
    message: 'Too many requests from this IP, please try again later'
  },

  // Authentication endpoints (stricter)
  auth: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 5,
    message: 'Too many authentication attempts, please try again later'
  },

  // Employee creation (moderate)
  createEmployee: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 10,
    message: 'Too many employee creation requests, please slow down'
  },

  // Search endpoints (lenient)
  search: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 30,
    message: 'Too many search requests, please slow down'
  },

  // Export endpoints (strict)
  export: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 3,
    message: 'Too many export requests, please wait before trying again'
  }
};

// Rate limiting middleware factory
export function createRateLimit(config: RateLimitConfig) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = config.keyGenerator ? config.keyGenerator(req) : getDefaultKey(req);
    const now = Date.now();
    const windowStart = now - config.windowMs;

    // Clean up old entries
    cleanupStore(windowStart);

    // Get or create entry for this key
    let entry = store[key];
    if (!entry || entry.resetTime <= now) {
      entry = {
        count: 0,
        resetTime: now + config.windowMs
      };
      store[key] = entry;
    }

    // Check if limit exceeded
    if (entry.count >= config.maxRequests) {
      const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
      
      // Log rate limit violation
      logger.warn('Rate limit exceeded', {
        key,
        count: entry.count,
        limit: config.maxRequests,
        windowMs: config.windowMs,
        retryAfter,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        path: req.path,
        method: req.method
      });

      const error = new RateLimitError(config.message || 'Rate limit exceeded');
      (error as any).retryAfter = retryAfter;
      (error as any).limit = config.maxRequests;
      (error as any).remaining = 0;
      
      return next(error);
    }

    // Increment counter
    entry.count++;

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', config.maxRequests);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, config.maxRequests - entry.count));
    res.setHeader('X-RateLimit-Reset', Math.ceil(entry.resetTime / 1000));

    // Handle response to potentially decrement counter for failed requests
    if (config.skipSuccessfulRequests || config.skipFailedRequests) {
      const originalEnd = res.end;
      res.end = function(chunk?: any, encoding?: any) {
        const shouldSkip = 
          (config.skipSuccessfulRequests && res.statusCode < 400) ||
          (config.skipFailedRequests && res.statusCode >= 400);
        
        if (shouldSkip && entry.count > 0) {
          entry.count--;
        }
        
        return originalEnd.call(this, chunk, encoding);
      };
    }

    next();
  };
}

// Default key generator (IP + User ID if available)
function getDefaultKey(req: Request): string {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  const userId = (req as any).user?.id;
  return userId ? `${ip}:${userId}` : ip;
}

// Cleanup old entries from store
function cleanupStore(cutoff: number): void {
  for (const [key, entry] of Object.entries(store)) {
    if (entry.resetTime <= cutoff) {
      delete store[key];
    }
  }
}

// User-specific rate limiting (stricter for authenticated users)
export function createUserRateLimit(config: RateLimitConfig) {
  return createRateLimit({
    ...config,
    keyGenerator: (req: Request) => {
      const userId = (req as any).user?.id;
      if (!userId) {
        return getDefaultKey(req);
      }
      return `user:${userId}`;
    }
  });
}

// IP-based rate limiting
export function createIPRateLimit(config: RateLimitConfig) {
  return createRateLimit({
    ...config,
    keyGenerator: (req: Request) => {
      return req.ip || req.connection?.remoteAddress || 'unknown';
    }
  });
}

// Endpoint-specific rate limiting
export function createEndpointRateLimit(endpoint: string, config: RateLimitConfig) {
  return createRateLimit({
    ...config,
    keyGenerator: (req: Request) => {
      const baseKey = getDefaultKey(req);
      return `${baseKey}:${endpoint}`;
    }
  });
}

// Clear store function for testing
export function clearRateLimitStore(): void {
  for (const key in store) {
    delete store[key];
  }
}

// Rate limit middleware instances
export const generalRateLimit = createRateLimit(rateLimitConfigs.general);
export const authRateLimit = createRateLimit(rateLimitConfigs.auth);
export const createEmployeeRateLimit = createRateLimit(rateLimitConfigs.createEmployee);
export const searchRateLimit = createRateLimit(rateLimitConfigs.search);
export const exportRateLimit = createRateLimit(rateLimitConfigs.export);