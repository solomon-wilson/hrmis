import { 
  metricsCollector, 
  recordHttpRequest, 
  recordDatabaseQuery, 
  PerformanceTimer 
} from '../../utils/metrics';

describe('Metrics System', () => {
  beforeEach(() => {
    // Clear metrics before each test
    (metricsCollector as any).metrics = [];
  });

  describe('PerformanceTimer', () => {
    it('should measure execution time', async () => {
      const timer = new PerformanceTimer('test_operation');
      
      // Simulate some work
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const duration = timer.end(true);
      
      expect(duration).toBeGreaterThan(90);
      expect(duration).toBeLessThan(150);
    });

    it('should record metrics with tags', () => {
      const timer = new PerformanceTimer('test_operation');
      
      timer.end(true, { operation: 'test', success: 'true' });
      
      const metrics = metricsCollector.getMetrics('test_operation');
      expect(metrics).toHaveLength(1);
      expect(metrics[0].tags).toEqual({
        operation: 'test',
        success: 'true'
      });
    });
  });

  describe('HTTP Request Metrics', () => {
    it('should record HTTP request metrics', () => {
      recordHttpRequest('GET', '/api/employees', 200, 150, 'test-correlation-id', {
        requestSize: 1024,
        responseSize: 2048,
        userAgent: 'test-agent'
      });

      const metrics = metricsCollector.getMetrics('http_request');
      expect(metrics).toHaveLength(1);
      
      const metric = metrics[0];
      expect(metric.value).toBe(150);
      expect(metric.unit).toBe('ms');
      expect(metric.tags).toEqual({
        method: 'GET',
        status_code: '200',
        success: 'true'
      });
    });

    it('should mark failed requests correctly', () => {
      recordHttpRequest('POST', '/api/employees', 500, 200, 'test-correlation-id', {
        errorCode: 'INTERNAL_SERVER_ERROR'
      });

      const metrics = metricsCollector.getMetrics('http_request');
      expect(metrics).toHaveLength(1);
      
      const metric = metrics[0];
      expect(metric.tags?.success).toBe('false');
    });
  });

  describe('Database Query Metrics', () => {
    it('should record database query metrics', () => {
      recordDatabaseQuery(
        'SELECT * FROM employees WHERE id = $1',
        'SELECT',
        50,
        true,
        {
          rowsAffected: 1,
          connectionPoolStats: { total: 10, idle: 5, waiting: 0 }
        }
      );

      const metrics = metricsCollector.getMetrics('database_query');
      expect(metrics).toHaveLength(1);
      
      const metric = metrics[0];
      expect(metric.value).toBe(50);
      expect(metric.tags).toEqual({
        query_type: 'SELECT',
        success: 'true'
      });
    });

    it('should record failed query metrics', () => {
      recordDatabaseQuery(
        'INSERT INTO employees VALUES ($1, $2)',
        'INSERT',
        100,
        false,
        {
          errorCode: 'UNIQUE_VIOLATION'
        }
      );

      const metrics = metricsCollector.getMetrics('database_query');
      expect(metrics).toHaveLength(1);
      
      const metric = metrics[0];
      expect(metric.tags?.success).toBe('false');
    });
  });

  describe('Metrics Aggregation', () => {
    beforeEach(() => {
      // Add some test metrics
      metricsCollector.recordMetric({
        name: 'test_metric',
        value: 100,
        unit: 'ms',
        timestamp: new Date()
      });
      
      metricsCollector.recordMetric({
        name: 'test_metric',
        value: 200,
        unit: 'ms',
        timestamp: new Date()
      });
      
      metricsCollector.recordMetric({
        name: 'test_metric',
        value: 150,
        unit: 'ms',
        timestamp: new Date()
      });
    });

    it('should calculate aggregated metrics correctly', () => {
      const aggregated = metricsCollector.getAggregatedMetrics('test_metric');
      
      expect(aggregated.count).toBe(3);
      expect(aggregated.sum).toBe(450);
      expect(aggregated.avg).toBe(150);
      expect(aggregated.min).toBe(100);
      expect(aggregated.max).toBe(200);
    });

    it('should filter metrics by time range', () => {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const aggregated = metricsCollector.getAggregatedMetrics('test_metric', oneHourAgo);
      
      expect(aggregated.count).toBe(3); // All metrics are recent
    });

    it('should return empty aggregation for non-existent metrics', () => {
      const aggregated = metricsCollector.getAggregatedMetrics('non_existent');
      
      expect(aggregated.count).toBe(0);
      expect(aggregated.avg).toBe(0);
      expect(aggregated.sum).toBe(0);
    });
  });
});