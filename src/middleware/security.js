import { ValidationError } from '../utils/errors';
// Security headers middleware
export const securityHeaders = (req, res, next) => {
    // Content Security Policy
    res.setHeader('Content-Security-Policy', [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https:",
        "font-src 'self'",
        "connect-src 'self'",
        "frame-ancestors 'none'"
    ].join('; '));
    // Prevent MIME type sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Prevent clickjacking
    res.setHeader('X-Frame-Options', 'DENY');
    // XSS Protection
    res.setHeader('X-XSS-Protection', '1; mode=block');
    // Referrer Policy
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    // Permissions Policy
    res.setHeader('Permissions-Policy', [
        'camera=()',
        'microphone=()',
        'geolocation=()',
        'payment=()'
    ].join(', '));
    // Strict Transport Security (HTTPS only)
    if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    }
    next();
};
// Request size limiting middleware
export const requestSizeLimit = (maxSize = 10 * 1024 * 1024) => {
    return (req, _res, next) => {
        const contentLength = req.headers['content-length'];
        if (contentLength && parseInt(contentLength) > maxSize) {
            const error = new ValidationError('Request payload too large', {
                maxSize: `${maxSize} bytes`,
                received: `${contentLength} bytes`
            });
            return next(error);
        }
        next();
    };
};
// Request timeout middleware
export const requestTimeout = (timeoutMs = 30000) => {
    return (_req, res, next) => {
        const timeout = setTimeout(() => {
            if (!res.headersSent) {
                const error = new Error('Request timeout');
                error.code = 'REQUEST_TIMEOUT';
                error.statusCode = 408;
                next(error);
            }
        }, timeoutMs);
        // Clear timeout when response finishes
        res.on('finish', () => {
            clearTimeout(timeout);
        });
        res.on('close', () => {
            clearTimeout(timeout);
        });
        next();
    };
};
// SQL injection prevention middleware
export const sqlInjectionProtection = (req, _res, next) => {
    const sqlInjectionPatterns = [
        /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION|SCRIPT)\b)/i,
        /(;|\-\-|\#|\/\*|\*\/)/,
        /(\b(OR|AND)\b.*=.*)/i,
        /'.*(\bOR\b|\bAND\b).*'/i
    ];
    const checkForSQLInjection = (value) => {
        if (typeof value === 'string') {
            return sqlInjectionPatterns.some(pattern => pattern.test(value));
        }
        if (Array.isArray(value)) {
            return value.some(checkForSQLInjection);
        }
        if (value && typeof value === 'object') {
            return Object.values(value).some(checkForSQLInjection);
        }
        return false;
    };
    // Check query parameters
    if (req.query && checkForSQLInjection(req.query)) {
        const error = new ValidationError('Potentially malicious input detected in query parameters', { source: 'query' });
        return next(error);
    }
    // Check request body
    if (req.body && checkForSQLInjection(req.body)) {
        const error = new ValidationError('Potentially malicious input detected in request body', { source: 'body' });
        return next(error);
    }
    next();
};
// XSS protection middleware
export const xssProtection = (req, _res, next) => {
    const xssPatterns = [
        /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
        /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
        /javascript:/gi,
        /on\w+\s*=/gi,
        /<img[^>]+src[\\s]*=[\\s]*["\']javascript:/gi
    ];
    const checkForXSS = (value) => {
        if (typeof value === 'string') {
            return xssPatterns.some(pattern => pattern.test(value));
        }
        if (Array.isArray(value)) {
            return value.some(checkForXSS);
        }
        if (value && typeof value === 'object') {
            return Object.values(value).some(checkForXSS);
        }
        return false;
    };
    // Check query parameters
    if (req.query && checkForXSS(req.query)) {
        const error = new ValidationError('Potentially malicious script detected in query parameters', { source: 'query' });
        return next(error);
    }
    // Check request body
    if (req.body && checkForXSS(req.body)) {
        const error = new ValidationError('Potentially malicious script detected in request body', { source: 'body' });
        return next(error);
    }
    next();
};
// Path traversal protection middleware
export const pathTraversalProtection = (req, _res, next) => {
    const pathTraversalPatterns = [
        /\.\./,
        /\.\\/,
        /\.\//,
        /%2e%2e/i,
        /%2f/i,
        /%5c/i
    ];
    const checkForPathTraversal = (value) => {
        if (typeof value === 'string') {
            return pathTraversalPatterns.some(pattern => pattern.test(value));
        }
        if (Array.isArray(value)) {
            return value.some(checkForPathTraversal);
        }
        if (value && typeof value === 'object') {
            return Object.values(value).some(checkForPathTraversal);
        }
        return false;
    };
    // Check URL path
    if (checkForPathTraversal(req.path)) {
        const error = new ValidationError('Path traversal attempt detected', { path: req.path });
        return next(error);
    }
    // Check query parameters
    if (req.query && checkForPathTraversal(req.query)) {
        const error = new ValidationError('Path traversal attempt detected in query parameters', { source: 'query' });
        return next(error);
    }
    next();
};
// HTTP method validation middleware
export const httpMethodValidation = (allowedMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']) => {
    return (req, _res, next) => {
        if (!allowedMethods.includes(req.method)) {
            const error = new ValidationError(`HTTP method ${req.method} not allowed`, {
                method: req.method,
                allowed: allowedMethods
            });
            error.statusCode = 405;
            return next(error);
        }
        next();
    };
};
// User agent validation middleware (basic bot detection)
export const userAgentValidation = (req, _res, next) => {
    const userAgent = req.headers['user-agent'];
    // Block requests without user agent (potential bots)
    if (!userAgent) {
        const error = new ValidationError('User agent header is required', { userAgent: null });
        return next(error);
    }
    // Block known malicious user agents
    const maliciousPatterns = [
        /sqlmap/i,
        /nikto/i,
        /nessus/i,
        /burp/i,
        /nmap/i,
        /masscan/i
    ];
    if (maliciousPatterns.some(pattern => pattern.test(userAgent))) {
        const error = new ValidationError('Blocked user agent detected', { userAgent });
        return next(error);
    }
    next();
};
// Combined security middleware
export const applySecurity = [
    securityHeaders,
    requestSizeLimit(),
    requestTimeout(),
    sqlInjectionProtection,
    xssProtection,
    pathTraversalProtection,
    httpMethodValidation(),
    userAgentValidation
];
