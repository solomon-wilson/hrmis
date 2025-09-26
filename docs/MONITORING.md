# Monitoring and Logging Infrastructure

This document describes the comprehensive monitoring and logging infrastructure implemented for the Employee Management System.

## Overview

The monitoring infrastructure provides:
- **Structured Logging** with correlation IDs for request tracing
- **Performance Monitoring** for HTTP requests and database queries
- **Metrics Collection** with aggregation and export capabilities
- **Error Tracking** with alerting and deduplication
- **Health Checks** for system components
- **Monitoring Dashboard** with REST API endpoints

## Components

### 1. Structured Logging (`src/utils/logger.ts`)

Enhanced Winston-based logging with:
- **Correlation ID tracking** for request tracing
- **Environment-specific formatting** (JSON for production, human-readable for development)
- **Multiple transports** (console, file, error file)
- **Structured metadata** support

#### Usage
```typescript
import { logger } from '../utils/logger';

logger.info('User action performed', {
  userId: '123',
  action: 'login',
  correlationId: 'req_123_abc',
  metadata: { ip: '192.168.1.1' }
});
```

#### Configuration
- `LOG_LEVEL`: Set logging level (debug, info, warn, error)
- `LOG_FILE`: Path to general log file
- `ERROR_LOG_FILE`: Path to error-only log file

### 2. Metrics Collection (`src/utils/metrics.ts`)

Comprehensive metrics collection system with:
- **Performance timers** for operation measurement
- **HTTP request metrics** (duration, status codes, sizes)
- **Database query metrics** (execution time, query types)
- **System metrics** (CPU, memory, event loop delay)
- **Aggregation functions** (count, avg, min, max, sum)

#### Key Classes
- `MetricsCollector`: Central metrics collection and storage
- `PerformanceTimer`: High-precision timing utility
- `@monitored`: Decorator for automatic method monitoring

#### Usage
```typescript
import { recordHttpRequest, PerformanceTimer, monitored } from '../utils/metrics';

// Manual timing
const timer = new PerformanceTimer('operation_name');
// ... perform operation
const duration = timer.end(true);

// Automatic monitoring with decorator
class MyService {
  @monitored('user_creation')
  async createUser(userData: any) {
    // Method automatically timed and recorded
  }
}
```

### 3. Database Performance Monitoring (`src/middleware/databaseMonitoring.ts`)

Enhanced database client with:
- **Query performance tracking** with automatic slow query detection
- **Connection pool monitoring** with statistics
- **Transaction monitoring** (begin, commit, rollback)
- **Correlation ID propagation** through database operations

#### Key Classes
- `MonitoredDatabaseClient`: Wrapper for PostgreSQL client with monitoring
- `MonitoredDatabasePool`: Enhanced connection pool with metrics

#### Usage
```typescript
import { database } from '../database';

// Get monitored client
const client = await database.getMonitoredClient(correlationId);
try {
  const result = await client.query('SELECT * FROM employees WHERE id = $1', [id]);
  // Query automatically monitored and logged
} finally {
  client.release();
}
```

### 4. HTTP Performance Monitoring (`src/middleware/performanceMonitoring.ts`)

Express middleware for HTTP request monitoring:
- **Request/response timing** with automatic slow request detection
- **Concurrent request tracking** with overload detection
- **API usage statistics** by endpoint and user
- **Error rate monitoring** by status code categories

#### Middleware Components
- `performanceMonitoring`: Core request timing and size tracking
- `apiUsageTracking`: Endpoint usage statistics
- `concurrencyMonitoring`: Concurrent request counting
- `errorRateMonitoring`: HTTP error categorization

### 5. Error Tracking and Alerting (`src/utils/errorTracking.ts`)

Intelligent error tracking system with:
- **Error deduplication** using fingerprinting
- **Severity classification** (low, medium, high, critical)
- **Alert rules** with configurable conditions and cooldowns
- **Error statistics** with time-based filtering

#### Key Features
- **Default Alert Rules**:
  - High error rate (>50 errors in 5 minutes)
  - Critical errors (any critical error in 1 minute)
  - Database error spikes (>10 DB errors in 10 minutes)
  - Authentication failure spikes (>20 auth failures in 5 minutes)

#### Usage
```typescript
import { trackError, errorTracker } from '../utils/errorTracking';

// Track an error
trackError(error, {
  correlationId: 'req_123',
  userId: 'user_456',
  method: 'POST',
  path: '/api/employees'
});

// Get error statistics
const stats = errorTracker.getErrorStats({
  start: new Date(Date.now() - 60 * 60 * 1000), // Last hour
  end: new Date()
});
```

### 6. Monitoring Dashboard (`src/controllers/MonitoringController.ts`)

REST API endpoints for monitoring data:

#### Endpoints
- `GET /api/monitoring/metrics` - Comprehensive system metrics
- `GET /api/monitoring/errors` - Error tracking information
- `GET /api/monitoring/performance` - Performance statistics
- `GET /api/monitoring/health` - System health status
- `GET /api/monitoring/prometheus` - Prometheus-format metrics export

#### Query Parameters
- `start`, `end`: ISO date strings for time range filtering
- `range`: Time range in seconds (alternative to start/end)

#### Access Control
- **HR_ADMIN**: Full access to all monitoring endpoints
- **MANAGER**: Limited access to health endpoint only

## Integration

### Application Setup

The monitoring infrastructure is integrated into the main application:

```typescript
// src/app.ts
import { 
  performanceMonitoring, 
  apiUsageTracking, 
  concurrencyMonitoring, 
  errorRateMonitoring 
} from './middleware/performanceMonitoring';
import { errorTrackingMiddleware } from './utils/errorTracking';

// Apply monitoring middleware
app.use(performanceMonitoring);
app.use(concurrencyMonitoring);
app.use(errorRateMonitoring);
app.use(apiUsageTracking);

// Error tracking (before error handler)
app.use(errorTrackingMiddleware);

// Monitoring routes
app.use('/api/monitoring', monitoringRoutes);
```

### Database Integration

Enhanced database connection with monitoring:

```typescript
// Using monitored database operations
const result = await database.monitoredQuery(
  'SELECT * FROM employees WHERE department = $1',
  [department],
  correlationId
);
```

## Metrics and Alerts

### Key Metrics Tracked

1. **HTTP Metrics**
   - Request duration (ms)
   - Request/response sizes (bytes)
   - Status code distribution
   - Concurrent request count

2. **Database Metrics**
   - Query execution time (ms)
   - Query type distribution (SELECT, INSERT, UPDATE, DELETE)
   - Connection pool statistics
   - Slow query detection (>1000ms)

3. **System Metrics**
   - Memory usage (heap used/total)
   - CPU usage
   - Event loop delay
   - Process uptime

4. **Error Metrics**
   - Error count by type and severity
   - Error rate trends
   - Top errors by frequency
   - Alert trigger counts

### Alert Conditions

Default alerts are configured for:
- **High Error Rate**: >50 errors in 5 minutes
- **Critical Errors**: Any critical error occurrence
- **Database Issues**: >10 database errors in 10 minutes
- **Authentication Problems**: >20 auth failures in 5 minutes

### Custom Alerts

Add custom alert rules:

```typescript
errorTracker.addAlertRule({
  name: 'custom_performance_alert',
  condition: (events) => {
    // Custom logic to determine if alert should trigger
    return someCondition;
  },
  severity: 'warning',
  cooldown: 15, // minutes
  enabled: true
});
```

## Prometheus Integration

Export metrics in Prometheus format:

```bash
curl -H "Authorization: Bearer <token>" \
  http://localhost:3000/api/monitoring/prometheus
```

Example output:
```
# HELP http_requests_total Total number of HTTP requests
# TYPE http_requests_total counter
http_requests_total 1234

# HELP http_request_duration_seconds HTTP request duration in seconds
# TYPE http_request_duration_seconds histogram
http_request_duration_seconds_sum 45.67
http_request_duration_seconds_count 1234
```

## Performance Considerations

### Memory Management
- Metrics are automatically trimmed to prevent memory leaks (max 10,000 metrics)
- Old error events are cleaned up after 24 hours
- Alert cooldowns prevent spam

### Performance Impact
- Monitoring overhead is minimal (<1ms per request)
- Database monitoring uses connection pooling efficiently
- Metrics collection is asynchronous where possible

### Storage
- Metrics are stored in-memory for real-time access
- Consider external storage (Redis, InfluxDB) for production scale
- Log files should be rotated to prevent disk space issues

## Environment Configuration

### Development
```env
NODE_ENV=development
LOG_LEVEL=debug
LOG_FILE=logs/app.log
ERROR_LOG_FILE=logs/error.log
```

### Production
```env
NODE_ENV=production
LOG_LEVEL=info
LOG_FILE=/var/log/employee-management/app.log
ERROR_LOG_FILE=/var/log/employee-management/error.log
```

## Monitoring Best Practices

1. **Correlation IDs**: Always include correlation IDs for request tracing
2. **Structured Logging**: Use structured log messages with metadata
3. **Alert Tuning**: Adjust alert thresholds based on actual usage patterns
4. **Regular Review**: Review metrics and alerts regularly for optimization
5. **Security**: Ensure monitoring endpoints are properly secured
6. **Performance**: Monitor the monitoring system itself for performance impact

## Troubleshooting

### High Memory Usage
- Check metrics collection limits
- Verify old data cleanup is working
- Consider external metrics storage

### Missing Metrics
- Verify middleware is properly configured
- Check correlation ID propagation
- Ensure database monitoring is enabled

### Alert Fatigue
- Adjust alert thresholds
- Implement alert cooldowns
- Group related alerts

### Performance Issues
- Review slow query logs
- Check concurrent request limits
- Monitor system resource usage

## Future Enhancements

Potential improvements:
- **External Metrics Storage**: Integration with InfluxDB or Prometheus
- **Real-time Dashboards**: Grafana integration
- **Advanced Alerting**: Integration with PagerDuty, Slack
- **Distributed Tracing**: OpenTelemetry integration
- **Custom Metrics**: Business-specific KPI tracking