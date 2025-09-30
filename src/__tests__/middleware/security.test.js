import { securityHeaders, requestSizeLimit, requestTimeout, sqlInjectionProtection, xssProtection, pathTraversalProtection, httpMethodValidation, userAgentValidation } from '../../middleware/security';
import { ValidationError } from '../../utils/errors';
describe('Security Middleware', () => {
    let mockRequest;
    let mockResponse;
    let mockNext;
    let setHeaderSpy;
    let onSpy;
    beforeEach(() => {
        setHeaderSpy = jest.fn();
        onSpy = jest.fn();
        mockRequest = {
            secure: false,
            headers: {},
            path: '/api/test',
            method: 'GET',
            query: {},
            body: {}
        };
        mockResponse = {
            setHeader: setHeaderSpy,
            on: onSpy
        };
        mockNext = jest.fn();
        jest.clearAllMocks();
    });
    describe('securityHeaders', () => {
        it('should set all security headers', () => {
            securityHeaders(mockRequest, mockResponse, mockNext);
            expect(setHeaderSpy).toHaveBeenCalledWith('Content-Security-Policy', expect.stringContaining("default-src 'self'"));
            expect(setHeaderSpy).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
            expect(setHeaderSpy).toHaveBeenCalledWith('X-Frame-Options', 'DENY');
            expect(setHeaderSpy).toHaveBeenCalledWith('X-XSS-Protection', '1; mode=block');
            expect(setHeaderSpy).toHaveBeenCalledWith('Referrer-Policy', 'strict-origin-when-cross-origin');
            expect(setHeaderSpy).toHaveBeenCalledWith('Permissions-Policy', expect.stringContaining('camera=()'));
            expect(mockNext).toHaveBeenCalled();
        });
        it('should set HSTS header for HTTPS requests', () => {
            mockRequest.secure = true;
            securityHeaders(mockRequest, mockResponse, mockNext);
            expect(setHeaderSpy).toHaveBeenCalledWith('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
        });
        it('should set HSTS header for forwarded HTTPS requests', () => {
            mockRequest.headers = { 'x-forwarded-proto': 'https' };
            securityHeaders(mockRequest, mockResponse, mockNext);
            expect(setHeaderSpy).toHaveBeenCalledWith('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
        });
        it('should not set HSTS header for HTTP requests', () => {
            securityHeaders(mockRequest, mockResponse, mockNext);
            expect(setHeaderSpy).not.toHaveBeenCalledWith('Strict-Transport-Security', expect.anything());
        });
    });
    describe('requestSizeLimit', () => {
        it('should allow requests within size limit', () => {
            mockRequest.headers = { 'content-length': '1000' };
            const middleware = requestSizeLimit(2000);
            middleware(mockRequest, mockResponse, mockNext);
            expect(mockNext).toHaveBeenCalledWith();
        });
        it('should block requests exceeding size limit', () => {
            mockRequest.headers = { 'content-length': '3000' };
            const middleware = requestSizeLimit(2000);
            middleware(mockRequest, mockResponse, mockNext);
            expect(mockNext).toHaveBeenCalledWith(expect.any(ValidationError));
            const error = mockNext.mock.calls[0][0];
            expect(error.message).toBe('Request payload too large');
        });
        it('should allow requests without content-length header', () => {
            const middleware = requestSizeLimit(2000);
            middleware(mockRequest, mockResponse, mockNext);
            expect(mockNext).toHaveBeenCalledWith();
        });
    });
    describe('requestTimeout', () => {
        beforeEach(() => {
            jest.useFakeTimers();
        });
        afterEach(() => {
            jest.useRealTimers();
        });
        it('should set timeout for requests', () => {
            const middleware = requestTimeout(5000);
            middleware(mockRequest, mockResponse, mockNext);
            expect(onSpy).toHaveBeenCalledWith('finish', expect.any(Function));
            expect(onSpy).toHaveBeenCalledWith('close', expect.any(Function));
            expect(mockNext).toHaveBeenCalledWith();
        });
        it('should trigger timeout error when request takes too long', () => {
            const middleware = requestTimeout(1000);
            middleware(mockRequest, mockResponse, mockNext);
            // Fast-forward time
            jest.advanceTimersByTime(1500);
            expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({
                message: 'Request timeout',
                code: 'REQUEST_TIMEOUT',
                statusCode: 408
            }));
        });
    });
    describe('sqlInjectionProtection', () => {
        it('should allow safe queries', () => {
            mockRequest.query = { search: 'john doe', department: 'engineering' };
            mockRequest.body = { name: 'John', email: 'john@example.com' };
            sqlInjectionProtection(mockRequest, mockResponse, mockNext);
            expect(mockNext).toHaveBeenCalledWith();
        });
        it('should block SQL injection in query parameters', () => {
            mockRequest.query = { search: "'; DROP TABLE users; --" };
            sqlInjectionProtection(mockRequest, mockResponse, mockNext);
            expect(mockNext).toHaveBeenCalledWith(expect.any(ValidationError));
            const error = mockNext.mock.calls[0][0];
            expect(error.message).toContain('Potentially malicious input detected in query parameters');
        });
        it('should block SQL injection in request body', () => {
            mockRequest.body = {
                name: 'John',
                comment: "test' OR '1'='1"
            };
            sqlInjectionProtection(mockRequest, mockResponse, mockNext);
            expect(mockNext).toHaveBeenCalledWith(expect.any(ValidationError));
            const error = mockNext.mock.calls[0][0];
            expect(error.message).toContain('Potentially malicious input detected in request body');
        });
        it('should detect various SQL injection patterns', () => {
            const maliciousInputs = [
                'SELECT * FROM users',
                'INSERT INTO table',
                'UPDATE users SET',
                'DELETE FROM users',
                'DROP TABLE users',
                'UNION SELECT',
                '-- comment',
                '/* comment */',
                "' OR 1=1 --"
            ];
            maliciousInputs.forEach(input => {
                mockRequest.body = { data: input };
                mockNext.mockClear();
                sqlInjectionProtection(mockRequest, mockResponse, mockNext);
                expect(mockNext).toHaveBeenCalledWith(expect.any(ValidationError));
            });
        });
        it('should handle nested objects and arrays', () => {
            mockRequest.body = {
                user: {
                    profile: {
                        bio: "'; DROP TABLE users; --"
                    }
                },
                tags: ["normal", "'; DELETE FROM tags; --"]
            };
            sqlInjectionProtection(mockRequest, mockResponse, mockNext);
            expect(mockNext).toHaveBeenCalledWith(expect.any(ValidationError));
        });
    });
    describe('xssProtection', () => {
        it('should allow safe content', () => {
            mockRequest.query = { search: 'john doe' };
            mockRequest.body = { content: 'This is safe content' };
            xssProtection(mockRequest, mockResponse, mockNext);
            expect(mockNext).toHaveBeenCalledWith();
        });
        it('should block XSS in query parameters', () => {
            mockRequest.query = { search: '<script>alert("xss")</script>' };
            xssProtection(mockRequest, mockResponse, mockNext);
            expect(mockNext).toHaveBeenCalledWith(expect.any(ValidationError));
            const error = mockNext.mock.calls[0][0];
            expect(error.message).toContain('Potentially malicious script detected in query parameters');
        });
        it('should block XSS in request body', () => {
            mockRequest.body = {
                content: '<iframe src="javascript:alert(1)"></iframe>'
            };
            xssProtection(mockRequest, mockResponse, mockNext);
            expect(mockNext).toHaveBeenCalledWith(expect.any(ValidationError));
        });
        it('should detect various XSS patterns', () => {
            const maliciousInputs = [
                '<script>alert("xss")</script>',
                '<iframe src="javascript:alert(1)"></iframe>',
                'javascript:alert(1)',
                '<img onerror="alert(1)" src="x">',
                '<div onclick="alert(1)">click</div>'
            ];
            maliciousInputs.forEach(input => {
                mockRequest.body = { content: input };
                mockNext.mockClear();
                xssProtection(mockRequest, mockResponse, mockNext);
                expect(mockNext).toHaveBeenCalledWith(expect.any(ValidationError));
            });
        });
    });
    describe('pathTraversalProtection', () => {
        it('should allow safe paths', () => {
            mockRequest.path = '/api/users/123';
            mockRequest.query = { file: 'document.pdf' };
            pathTraversalProtection(mockRequest, mockResponse, mockNext);
            expect(mockNext).toHaveBeenCalledWith();
        });
        it('should block path traversal in URL path', () => {
            mockRequest.path = '/api/files/../../../etc/passwd';
            pathTraversalProtection(mockRequest, mockResponse, mockNext);
            expect(mockNext).toHaveBeenCalledWith(expect.any(ValidationError));
            const error = mockNext.mock.calls[0][0];
            expect(error.message).toBe('Path traversal attempt detected');
        });
        it('should block path traversal in query parameters', () => {
            mockRequest.query = { file: '../../../etc/passwd' };
            pathTraversalProtection(mockRequest, mockResponse, mockNext);
            expect(mockNext).toHaveBeenCalledWith(expect.any(ValidationError));
        });
        it('should detect various path traversal patterns', () => {
            const maliciousInputs = [
                '../../../etc/passwd',
                '..\\..\\..\\windows\\system32',
                '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd',
                '%2e%2e%5c%2e%2e%5c%2e%2e%5cwindows%5csystem32'
            ];
            maliciousInputs.forEach(input => {
                mockRequest.query = { file: input };
                mockNext.mockClear();
                pathTraversalProtection(mockRequest, mockResponse, mockNext);
                expect(mockNext).toHaveBeenCalledWith(expect.any(ValidationError));
            });
        });
    });
    describe('httpMethodValidation', () => {
        it('should allow valid HTTP methods', () => {
            const allowedMethods = ['GET', 'POST', 'PUT', 'DELETE'];
            const middleware = httpMethodValidation(allowedMethods);
            allowedMethods.forEach(method => {
                mockRequest.method = method;
                mockNext.mockClear();
                middleware(mockRequest, mockResponse, mockNext);
                expect(mockNext).toHaveBeenCalledWith();
            });
        });
        it('should block invalid HTTP methods', () => {
            mockRequest.method = 'TRACE';
            const middleware = httpMethodValidation(['GET', 'POST']);
            middleware(mockRequest, mockResponse, mockNext);
            expect(mockNext).toHaveBeenCalledWith(expect.any(ValidationError));
            const error = mockNext.mock.calls[0][0];
            expect(error.message).toBe('HTTP method TRACE not allowed');
            expect(error.statusCode).toBe(405);
        });
    });
    describe('userAgentValidation', () => {
        it('should allow valid user agents', () => {
            mockRequest.headers = { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' };
            userAgentValidation(mockRequest, mockResponse, mockNext);
            expect(mockNext).toHaveBeenCalledWith();
        });
        it('should block requests without user agent', () => {
            mockRequest.headers = {};
            userAgentValidation(mockRequest, mockResponse, mockNext);
            expect(mockNext).toHaveBeenCalledWith(expect.any(ValidationError));
            const error = mockNext.mock.calls[0][0];
            expect(error.message).toBe('User agent header is required');
        });
        it('should block malicious user agents', () => {
            const maliciousUserAgents = [
                'sqlmap/1.0',
                'Nikto/2.1.6',
                'Nessus SOAP',
                'Burp Suite',
                'Nmap Scripting Engine'
            ];
            maliciousUserAgents.forEach(userAgent => {
                mockRequest.headers = { 'user-agent': userAgent };
                mockNext.mockClear();
                userAgentValidation(mockRequest, mockResponse, mockNext);
                expect(mockNext).toHaveBeenCalledWith(expect.any(ValidationError));
                const error = mockNext.mock.calls[0][0];
                expect(error.message).toBe('Blocked user agent detected');
            });
        });
    });
});
