import request from 'supertest';
import express from 'express';
import { performanceMonitoring, apiUsageTracking, concurrencyMonitoring, errorRateMonitoring, getPerformanceStats, resetPerformanceCounters } from '../../middleware/performanceMonitoring';
import { metricsCollector } from '../../utils/metrics';
describe('Performance Monitoring Middleware', () => {
    let app;
    beforeEach(() => {
        app = express();
        resetPerformanceCounters();
        metricsCollector.metrics = [];
    });
    describe('Performance Monitoring', () => {
        beforeEach(() => {
            app.use(performanceMonitoring);
            app.get('/test', (req, res) => {
                setTimeout(() => res.json({ message: 'test' }), 100);
            });
        });
        it('should track request performance', async () => {
            const response = await request(app)
                .get('/test')
                .expect(200);
            expect(response.headers['x-request-id']).toBeDefined();
            const metrics = metricsCollector.getMetrics('http_request');
            expect(metrics.length).toBeGreaterThan(0);
            const metric = metrics[0];
            expect(metric.value).toBeGreaterThan(90); // Should be around 100ms
            expect(metric.tags?.method).toBe('GET');
            expect(metric.tags?.status_code).toBe('200');
        });
        it('should track request and response sizes', async () => {
            app.post('/test-post', express.json(), (req, res) => {
                res.json({ received: req.body });
            });
            await request(app)
                .post('/test-post')
                .send({ data: 'test data' })
                .expect(200);
            const metrics = metricsCollector.getMetrics('http_request');
            expect(metrics.length).toBeGreaterThan(0);
        });
    });
    describe('API Usage Tracking', () => {
        beforeEach(() => {
            app.use(apiUsageTracking);
            app.get('/api/test', (req, res) => res.json({ message: 'test' }));
        });
        it('should track API endpoint usage', async () => {
            await request(app)
                .get('/api/test')
                .expect(200);
            const metrics = metricsCollector.getMetrics('api_endpoint_usage');
            expect(metrics.length).toBeGreaterThan(0);
            const metric = metrics[0];
            expect(metric.value).toBe(1);
            expect(metric.tags?.method).toBe('GET');
            expect(metric.tags?.endpoint).toBe('/api/test');
        });
    });
    describe('Concurrency Monitoring', () => {
        beforeEach(() => {
            app.use(concurrencyMonitoring);
            app.get('/slow', (req, res) => {
                setTimeout(() => res.json({ message: 'slow' }), 200);
            });
        });
        it('should track concurrent requests', async () => {
            // Start multiple concurrent requests
            const promises = [
                request(app).get('/slow'),
                request(app).get('/slow'),
                request(app).get('/slow')
            ];
            await Promise.all(promises);
            const metrics = metricsCollector.getMetrics('concurrent_requests');
            expect(metrics.length).toBeGreaterThan(0);
            // Should have recorded different concurrency levels
            const maxConcurrency = Math.max(...metrics.map(m => m.value));
            expect(maxConcurrency).toBeGreaterThan(0);
        });
    });
    describe('Error Rate Monitoring', () => {
        beforeEach(() => {
            app.use(errorRateMonitoring);
            app.get('/success', (req, res) => res.json({ message: 'success' }));
            app.get('/error', (req, res) => res.status(500).json({ error: 'server error' }));
            app.get('/not-found', (req, res) => res.status(404).json({ error: 'not found' }));
        });
        it('should track successful responses', async () => {
            await request(app)
                .get('/success')
                .expect(200);
            const successMetrics = metricsCollector.getMetrics('http_response_status');
            expect(successMetrics.length).toBeGreaterThan(0);
            const metric = successMetrics[0];
            expect(metric.tags?.status_code).toBe('200');
            expect(metric.tags?.error_type).toBe('success');
            expect(metric.tags?.is_error).toBe('false');
        });
        it('should track client errors', async () => {
            await request(app)
                .get('/not-found')
                .expect(404);
            const errorMetrics = metricsCollector.getMetrics('http_errors');
            expect(errorMetrics.length).toBeGreaterThan(0);
            const metric = errorMetrics[0];
            expect(metric.tags?.status_code).toBe('404');
            expect(metric.tags?.error_type).toBe('client_error');
        });
        it('should track server errors', async () => {
            await request(app)
                .get('/error')
                .expect(500);
            const errorMetrics = metricsCollector.getMetrics('http_errors');
            expect(errorMetrics.length).toBeGreaterThan(0);
            const metric = errorMetrics[0];
            expect(metric.tags?.status_code).toBe('500');
            expect(metric.tags?.error_type).toBe('server_error');
        });
    });
    describe('Performance Stats', () => {
        beforeEach(() => {
            app.use(performanceMonitoring);
            app.use(concurrencyMonitoring);
            app.get('/test', (req, res) => res.json({ message: 'test' }));
        });
        it('should provide performance statistics', async () => {
            await request(app)
                .get('/test')
                .expect(200);
            const stats = getPerformanceStats();
            expect(stats).toHaveProperty('activeRequests');
            expect(stats).toHaveProperty('maxConcurrentRequests');
            expect(stats).toHaveProperty('httpRequests');
            expect(stats).toHaveProperty('timestamp');
            expect(typeof stats.activeRequests).toBe('number');
            expect(typeof stats.maxConcurrentRequests).toBe('number');
        });
    });
});
