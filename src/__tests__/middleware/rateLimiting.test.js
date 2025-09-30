import { createRateLimit, createUserRateLimit, createIPRateLimit, rateLimitConfigs, clearRateLimitStore } from '../../middleware/rateLimiting';
import { RateLimitError } from '../../utils/errors';
import { logger } from '../../utils/logger';
// Mock logger
jest.mock('../../utils/logger', () => ({
    logger: {
        warn: jest.fn(),
        error: jest.fn(),
        info: jest.fn(),
        http: jest.fn(),
        debug: jest.fn()
    }
}));
describe('Rate Limiting Middleware', () => {
    let mockRequest;
    let mockResponse;
    let mockNext;
    let setHeaderSpy;
    beforeEach(() => {
        setHeaderSpy = jest.fn();
        mockRequest = {
            ip: '127.0.0.1',
            path: '/api/test',
            method: 'GET',
            headers: {
                'user-agent': 'test-agent'
            },
            connection: {
                remoteAddress: '127.0.0.1'
            }
        };
        mockResponse = {
            setHeader: setHeaderSpy,
            statusCode: 200,
            end: jest.fn(),
            on: jest.fn()
        };
        mockNext = jest.fn();
        jest.clearAllMocks();
        // Clear rate limit store between tests
        clearRateLimitStore();
    });
    describe('createRateLimit', () => {
        it('should allow requests within limit', () => {
            const config = {
                windowMs: 60000, // 1 minute
                maxRequests: 5
            };
            const middleware = createRateLimit(config);
            // Make 3 requests
            for (let i = 0; i < 3; i++) {
                middleware(mockRequest, mockResponse, mockNext);
            }
            expect(mockNext).toHaveBeenCalledTimes(3);
            expect(mockNext).toHaveBeenCalledWith(); // No error
            expect(setHeaderSpy).toHaveBeenCalledWith('X-RateLimit-Limit', 5);
            expect(setHeaderSpy).toHaveBeenCalledWith('X-RateLimit-Remaining', 2); // 5 - 3 = 2
        });
        it('should block requests exceeding limit', () => {
            const config = {
                windowMs: 60000,
                maxRequests: 2,
                message: 'Rate limit exceeded'
            };
            const middleware = createRateLimit(config);
            // Make requests up to limit
            middleware(mockRequest, mockResponse, mockNext);
            middleware(mockRequest, mockResponse, mockNext);
            // This should be blocked
            middleware(mockRequest, mockResponse, mockNext);
            expect(mockNext).toHaveBeenCalledTimes(3);
            expect(mockNext).toHaveBeenLastCalledWith(expect.any(RateLimitError));
            const error = mockNext.mock.calls[2][0];
            expect(error.message).toBe('Rate limit exceeded');
            expect(error.retryAfter).toBeGreaterThan(0);
        });
        it('should reset counter after window expires', async () => {
            const config = {
                windowMs: 100, // 100ms window
                maxRequests: 1
            };
            const middleware = createRateLimit(config);
            // First request should pass
            middleware(mockRequest, mockResponse, mockNext);
            expect(mockNext).toHaveBeenCalledWith();
            // Second request should be blocked
            middleware(mockRequest, mockResponse, mockNext);
            expect(mockNext).toHaveBeenLastCalledWith(expect.any(RateLimitError));
            // Wait for window to expire
            await new Promise(resolve => setTimeout(resolve, 150));
            // Third request should pass (new window)
            middleware(mockRequest, mockResponse, mockNext);
            expect(mockNext).toHaveBeenLastCalledWith();
        });
        it('should use custom key generator', () => {
            const config = {
                windowMs: 60000,
                maxRequests: 1,
                keyGenerator: (req) => `custom:${req.ip}`
            };
            const middleware = createRateLimit(config);
            // First request
            middleware(mockRequest, mockResponse, mockNext);
            expect(mockNext).toHaveBeenCalledWith();
            // Second request with same IP should be blocked
            middleware(mockRequest, mockResponse, mockNext);
            expect(mockNext).toHaveBeenLastCalledWith(expect.any(RateLimitError));
            // Request with different IP should pass
            mockRequest.ip = '192.168.1.1';
            middleware(mockRequest, mockResponse, mockNext);
            expect(mockNext).toHaveBeenLastCalledWith();
        });
        it('should log rate limit violations', () => {
            const config = {
                windowMs: 60000,
                maxRequests: 1
            };
            const middleware = createRateLimit(config);
            // First request passes
            middleware(mockRequest, mockResponse, mockNext);
            // Second request is blocked and logged
            middleware(mockRequest, mockResponse, mockNext);
            expect(logger.warn).toHaveBeenCalledWith('Rate limit exceeded', expect.objectContaining({
                count: 1,
                limit: 1,
                windowMs: 60000,
                ip: '127.0.0.1',
                path: '/api/test',
                method: 'GET'
            }));
        });
        it('should handle skipSuccessfulRequests option', () => {
            const config = {
                windowMs: 60000,
                maxRequests: 2,
                skipSuccessfulRequests: true
            };
            const middleware = createRateLimit(config);
            // Mock response end method
            const originalEnd = mockResponse.end;
            mockResponse.end = jest.fn().mockImplementation((chunk, encoding) => {
                // Simulate successful response
                mockResponse.statusCode = 200;
                return originalEnd?.call(mockResponse, chunk, encoding);
            });
            // Make requests
            middleware(mockRequest, mockResponse, mockNext);
            middleware(mockRequest, mockResponse, mockNext);
            // Both should pass initially
            expect(mockNext).toHaveBeenCalledTimes(2);
            expect(mockNext).toHaveBeenCalledWith();
        });
    });
    describe('createUserRateLimit', () => {
        it('should use user ID in key when available', () => {
            const config = {
                windowMs: 60000,
                maxRequests: 1
            };
            const middleware = createUserRateLimit(config);
            // Add user to request
            mockRequest.user = { id: 'user123' };
            // First request
            middleware(mockRequest, mockResponse, mockNext);
            expect(mockNext).toHaveBeenCalledWith();
            // Second request with same user should be blocked
            middleware(mockRequest, mockResponse, mockNext);
            expect(mockNext).toHaveBeenLastCalledWith(expect.any(RateLimitError));
            // Request with different user should pass
            mockRequest.user = { id: 'user456' };
            middleware(mockRequest, mockResponse, mockNext);
            expect(mockNext).toHaveBeenLastCalledWith();
        });
        it('should fall back to IP when no user', () => {
            const config = {
                windowMs: 60000,
                maxRequests: 1
            };
            const middleware = createUserRateLimit(config);
            // No user in request
            delete mockRequest.user;
            // Should work like IP-based rate limiting
            middleware(mockRequest, mockResponse, mockNext);
            expect(mockNext).toHaveBeenCalledWith();
            middleware(mockRequest, mockResponse, mockNext);
            expect(mockNext).toHaveBeenLastCalledWith(expect.any(RateLimitError));
        });
    });
    describe('createIPRateLimit', () => {
        it('should use only IP address in key', () => {
            const config = {
                windowMs: 60000,
                maxRequests: 1
            };
            const middleware = createIPRateLimit(config);
            // Add user to request (should be ignored)
            mockRequest.user = { id: 'user123' };
            // First request
            middleware(mockRequest, mockResponse, mockNext);
            expect(mockNext).toHaveBeenCalledWith();
            // Second request with same IP should be blocked (even with different user)
            mockRequest.user = { id: 'user456' };
            middleware(mockRequest, mockResponse, mockNext);
            expect(mockNext).toHaveBeenLastCalledWith(expect.any(RateLimitError));
        });
        it('should handle missing IP address', () => {
            const config = {
                windowMs: 60000,
                maxRequests: 1
            };
            const middleware = createIPRateLimit(config);
            // Remove IP from request
            mockRequest.ip = undefined;
            mockRequest.connection = undefined;
            // Should still work with 'unknown' key
            middleware(mockRequest, mockResponse, mockNext);
            expect(mockNext).toHaveBeenCalledWith();
            middleware(mockRequest, mockResponse, mockNext);
            expect(mockNext).toHaveBeenLastCalledWith(expect.any(RateLimitError));
        });
    });
    describe('Rate limit configurations', () => {
        it('should have general rate limit config', () => {
            expect(rateLimitConfigs.general).toBeDefined();
            expect(rateLimitConfigs.general.windowMs).toBe(15 * 60 * 1000);
            expect(rateLimitConfigs.general.maxRequests).toBe(100);
        });
        it('should have auth rate limit config (stricter)', () => {
            expect(rateLimitConfigs.auth).toBeDefined();
            expect(rateLimitConfigs.auth.maxRequests).toBeLessThan(rateLimitConfigs.general.maxRequests);
        });
        it('should have export rate limit config (strictest)', () => {
            expect(rateLimitConfigs.export).toBeDefined();
            expect(rateLimitConfigs.export.maxRequests).toBeLessThan(rateLimitConfigs.auth.maxRequests);
        });
    });
    describe('Error handling', () => {
        it('should include retry-after header in error', () => {
            const config = {
                windowMs: 60000,
                maxRequests: 1
            };
            const middleware = createRateLimit(config);
            // Exceed limit
            middleware(mockRequest, mockResponse, mockNext);
            middleware(mockRequest, mockResponse, mockNext);
            const error = mockNext.mock.calls[1][0];
            expect(error.retryAfter).toBeGreaterThan(0);
            expect(error.limit).toBe(1);
            expect(error.remaining).toBe(0);
        });
        it('should set appropriate rate limit headers', () => {
            const config = {
                windowMs: 60000,
                maxRequests: 5
            };
            const middleware = createRateLimit(config);
            middleware(mockRequest, mockResponse, mockNext);
            expect(setHeaderSpy).toHaveBeenCalledWith('X-RateLimit-Limit', 5);
            expect(setHeaderSpy).toHaveBeenCalledWith('X-RateLimit-Remaining', 4);
            expect(setHeaderSpy).toHaveBeenCalledWith('X-RateLimit-Reset', expect.any(Number));
        });
    });
});
