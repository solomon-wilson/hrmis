import request from 'supertest';
import { createApp } from '../../app';
import { database } from '../../database';
import { metricsCollector } from '../../utils/metrics';
import { errorTracker } from '../../utils/errorTracking';
import { ValidationError } from '../../utils/errors';

describe('MonitoringController', () => {
  let app: any;
  let authToken: string;

  beforeAll(async () => {
    app = createApp();
    await database.connect();
    
    // Create a test HR admin user and get auth token
    // This would typically involve creating a user and logging in
    // For testing purposes, we'll mock the auth token
    authToken = 'mock-hr-admin-token';
  });

  afterAll(async () => {
    await database.disconnect();
  });

  beforeEach(() => {
    // Clear metrics and errors before each test
    (metricsCollector as any).metrics = [];
    (errorTracker as any).errorEvents.clear();
  });

  describe('GET /api/monitoring/metrics', () => {
    beforeEach(() => {
      // Add some test metrics
      metricsCollector.recordMetric({
        name: 'http_request',
        value: 150,
        unit: 'ms',
        timestamp: new Date(),
        tags: { method: 'GET', status_code: '200' }
      });
      
      metricsCollector.recordMetric({
        name: 'database_query',
        value: 50,
        unit: 'ms',
        timestamp: new Date(),
        tags: { query_type: 'SELECT' }
      });
    });

    it('should return comprehensive metrics for HR admin', async () => {
      const response = await request(app)
        .get('/api/monitoring/metrics')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('health');
      expect(response.body).toHaveProperty('performance');
      expect(response.body).toHaveProperty('errors');
      expect(response.body).toHaveProperty('metrics');
      
      expect(response.body.metrics).toHaveProperty('http');
      expect(response.body.metrics).toHaveProperty('database');
      expect(response.body.metrics).toHaveProperty('system');
    });

    it('should filter metrics by time range', async () => {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      
      const response = await request(app)
        .get('/api/monitoring/metrics')
        .query({
          start: oneHourAgo.toISOString(),
          end: new Date().toISOString()
        })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.timeRange).toHaveProperty('start');
      expect(response.body.timeRange).toHaveProperty('end');
    });

    it('should reject unauthorized access', async () => {
      await request(app)
        .get('/api/monitoring/metrics')
        .expect(401);
    });
  });

  describe('GET /api/monitoring/errors', () => {
    beforeEach(() => {
      // Add some test errors
      errorTracker.trackError(new ValidationError('Test validation error'), {
        correlationId: 'test-123',
        method: 'POST',
        path: '/api/test'
      });
      
      errorTracker.trackError(new Error('Test generic error'), {
        correlationId: 'test-456',
        method: 'GET',
        path: '/api/other'
      });
    });

    it('should return error tracking information', async () => {
      const response = await request(app)
        .get('/api/monitoring/errors')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('errorStats');
      expect(response.body).toHaveProperty('alertRules');
      
      expect(response.body.errorStats.totalErrors).toBeGreaterThan(0);
      expect(response.body.errorStats.uniqueErrors).toBeGreaterThan(0);
      expect(response.body.alertRules).toBeInstanceOf(Array);
    });

    it('should include error breakdown by severity and type', async () => {
      const response = await request(app)
        .get('/api/monitoring/errors')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.errorStats).toHaveProperty('bySeverity');
      expect(response.body.errorStats).toHaveProperty('byType');
      expect(response.body.errorStats).toHaveProperty('topErrors');
    });
  });

  describe('GET /api/monitoring/performance', () => {
    it('should return performance statistics', async () => {
      const response = await request(app)
        .get('/api/monitoring/performance')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('current');
      expect(response.body).toHaveProperty('aggregated');
      expect(response.body).toHaveProperty('slowOperations');
      
      expect(response.body.current).toHaveProperty('activeRequests');
      expect(response.body.current).toHaveProperty('maxConcurrentRequests');
      
      expect(response.body.aggregated).toHaveProperty('http');
      expect(response.body.aggregated).toHaveProperty('database');
      
      expect(response.body.slowOperations).toHaveProperty('httpRequests');
      expect(response.body.slowOperations).toHaveProperty('databaseQueries');
    });
  });

  describe('GET /api/monitoring/health', () => {
    it('should return system health status', async () => {
      const response = await request(app)
        .get('/api/monitoring/health')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('services');
      expect(response.body).toHaveProperty('performance');
      
      expect(['healthy', 'degraded', 'unhealthy']).toContain(response.body.status);
      
      expect(response.body.services).toHaveProperty('database');
      expect(response.body.services).toHaveProperty('redis');
      expect(response.body.services).toHaveProperty('memory');
    });

    it('should allow manager access to health endpoint', async () => {
      const managerToken = 'mock-manager-token';
      
      await request(app)
        .get('/api/monitoring/health')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
    });
  });

  describe('GET /api/monitoring/prometheus', () => {
    beforeEach(() => {
      // Add metrics for Prometheus export
      metricsCollector.recordMetric({
        name: 'http_request',
        value: 200,
        unit: 'ms',
        timestamp: new Date()
      });
      
      metricsCollector.recordMetric({
        name: 'database_query',
        value: 75,
        unit: 'ms',
        timestamp: new Date()
      });
    });

    it('should export metrics in Prometheus format', async () => {
      const response = await request(app)
        .get('/api/monitoring/prometheus')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.headers['content-type']).toContain('text/plain');
      expect(response.text).toContain('# HELP');
      expect(response.text).toContain('# TYPE');
      expect(response.text).toContain('http_requests_total');
      expect(response.text).toContain('database_queries_total');
    });
  });

  describe('Query Parameter Validation', () => {
    it('should validate time range parameters', async () => {
      await request(app)
        .get('/api/monitoring/metrics')
        .query({ start: 'invalid-date' })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);
    });

    it('should validate range parameter', async () => {
      await request(app)
        .get('/api/monitoring/metrics')
        .query({ range: 'invalid-range' })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);
    });

    it('should accept valid time range', async () => {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      
      await request(app)
        .get('/api/monitoring/metrics')
        .query({
          start: oneHourAgo.toISOString(),
          end: new Date().toISOString()
        })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
    });

    it('should accept valid range parameter', async () => {
      await request(app)
        .get('/api/monitoring/metrics')
        .query({ range: 3600 }) // 1 hour in seconds
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
    });
  });
});