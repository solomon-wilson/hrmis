# Employee Management System - Deployment Guide

This guide covers the deployment process for the Employee Management System across different environments.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Environment Configuration](#environment-configuration)
- [Local Development](#local-development)
- [Docker Deployment](#docker-deployment)
- [Kubernetes Deployment](#kubernetes-deployment)
- [Health Checks](#health-checks)
- [Monitoring](#monitoring)
- [Troubleshooting](#troubleshooting)

## Prerequisites

### Required Software

- **Node.js** (v18 or higher)
- **npm** (v9 or higher)
- **Docker** (v20 or higher)
- **Docker Compose** (v2 or higher)
- **PostgreSQL** (v15 or higher)
- **Redis** (v7 or higher)

### Optional (for Kubernetes deployment)

- **kubectl** (v1.25 or higher)
- **Helm** (v3.10 or higher)

## Environment Configuration

The application supports three environments:

- **Development**: Local development with debug features
- **Staging**: Pre-production testing environment
- **Production**: Live production environment

### Environment Files

Environment-specific configurations are stored in the `config/` directory:

- `config/development.env` - Development settings
- `config/staging.env` - Staging settings
- `config/production.env` - Production settings

### Required Environment Variables

```bash
# Server Configuration
NODE_ENV=production
PORT=3000

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=employee_management
DB_USER=postgres
DB_PASSWORD=your_password
DB_SSL=true

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password

# JWT Configuration
JWT_SECRET=your_jwt_secret
JWT_EXPIRES_IN=4h
JWT_REFRESH_SECRET=your_refresh_secret
JWT_REFRESH_EXPIRES_IN=1d

# Encryption Configuration
ENCRYPTION_KEY=your_32_character_encryption_key

# Logging Configuration
LOG_LEVEL=info
LOG_FILE=logs/app.log

# CORS Configuration
CORS_ORIGIN=https://your-frontend-domain.com
```

## Local Development

### Quick Start

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd employee-management-system
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment**
   ```bash
   cp .env.example .env
   # Edit .env with your local configuration
   ```

4. **Start local services**
   ```bash
   # Start PostgreSQL and Redis (using Docker)
   docker-compose up -d postgres redis
   ```

5. **Run database migrations**
   ```bash
   npm run migrate
   ```

6. **Seed database (optional)**
   ```bash
   npm run seed
   ```

7. **Start development server**
   ```bash
   npm run dev
   ```

The application will be available at `http://localhost:3000`

### Development Scripts

```bash
# Development server with hot reload
npm run dev

# Run tests
npm test
npm run test:watch
npm run test:coverage

# Linting
npm run lint
npm run lint:fix

# Database operations
npm run migrate
npm run migrate:rollback
npm run migrate:status
npm run seed
npm run seed:clear

# Build for production
npm run build
```

## Docker Deployment

### Using Deployment Scripts

The easiest way to deploy is using the provided deployment scripts:

#### Linux/macOS
```bash
# Development deployment
./scripts/deploy.sh -e development

# Staging deployment
./scripts/deploy.sh -e staging

# Production deployment
./scripts/deploy.sh -e production

# Build only (no deployment)
./scripts/deploy.sh --build-only

# Skip tests
./scripts/deploy.sh -e production --skip-tests
```

#### Windows
```cmd
REM Development deployment
scripts\deploy.bat -e development

REM Staging deployment
scripts\deploy.bat -e staging

REM Production deployment
scripts\deploy.bat -e production
```

### Manual Docker Deployment

#### Development
```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f app

# Stop services
docker-compose down
```

#### Staging
```bash
# Deploy to staging
docker-compose -f docker-compose.yml -f docker-compose.staging.yml up -d

# View logs
docker-compose -f docker-compose.yml -f docker-compose.staging.yml logs -f
```

#### Production
```bash
# Deploy to production
docker-compose -f docker-compose.yml -f docker-compose.production.yml up -d

# View logs
docker-compose -f docker-compose.yml -f docker-compose.production.yml logs -f
```

### Docker Commands

```bash
# Build application image
docker build -t employee-management:latest .

# Run database migrations
docker-compose exec app npm run migrate

# Seed database
docker-compose exec app npm run seed

# Access application container
docker-compose exec app sh

# View application logs
docker-compose logs -f app

# Restart application
docker-compose restart app

# Scale application (production)
docker-compose up -d --scale app=3
```

## Kubernetes Deployment

### Prerequisites

1. **Kubernetes cluster** (v1.25+)
2. **kubectl** configured to access your cluster
3. **NGINX Ingress Controller** installed
4. **cert-manager** installed (for SSL certificates)

### Deployment Steps

1. **Create namespace**
   ```bash
   kubectl apply -f k8s/namespace.yaml
   ```

2. **Deploy configuration and secrets**
   ```bash
   # Update secrets with your actual values
   kubectl apply -f k8s/secret.yaml
   kubectl apply -f k8s/configmap.yaml
   ```

3. **Deploy database and Redis** (if not using external services)
   ```bash
   # Deploy PostgreSQL
   helm install postgresql bitnami/postgresql \
     --namespace employee-management \
     --set auth.postgresPassword=your_password \
     --set auth.database=employee_management

   # Deploy Redis
   helm install redis bitnami/redis \
     --namespace employee-management \
     --set auth.password=your_redis_password
   ```

4. **Build and push application image**
   ```bash
   # Build image
   docker build -t your-registry/employee-management:v1.0.0 .

   # Push to registry
   docker push your-registry/employee-management:v1.0.0

   # Update deployment.yaml with your image
   ```

5. **Deploy application**
   ```bash
   kubectl apply -f k8s/deployment.yaml
   kubectl apply -f k8s/service.yaml
   kubectl apply -f k8s/ingress.yaml
   ```

6. **Run database migrations**
   ```bash
   kubectl exec -it deployment/employee-management-app -n employee-management -- npm run migrate
   ```

### Kubernetes Commands

```bash
# Check deployment status
kubectl get pods -n employee-management
kubectl get services -n employee-management
kubectl get ingress -n employee-management

# View logs
kubectl logs -f deployment/employee-management-app -n employee-management

# Scale deployment
kubectl scale deployment employee-management-app --replicas=5 -n employee-management

# Update deployment
kubectl set image deployment/employee-management-app employee-management=your-registry/employee-management:v1.1.0 -n employee-management

# Port forward for testing
kubectl port-forward service/employee-management-service 3000:80 -n employee-management
```

## Health Checks

The application provides multiple health check endpoints:

### Endpoints

- **`GET /health`** - Comprehensive health check with service status
- **`GET /health/live`** - Liveness probe (basic application status)
- **`GET /health/ready`** - Readiness probe (checks dependencies)

### Health Check Response

```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "version": "1.0.0",
  "uptime": 3600,
  "environment": "production",
  "services": {
    "database": {
      "connected": true,
      "responseTime": 15
    },
    "redis": {
      "connected": true,
      "responseTime": 5
    },
    "memory": {
      "used": 134217728,
      "total": 268435456,
      "percentage": 50
    },
    "cpu": {
      "usage": 25.5
    }
  }
}
```

### Status Codes

- **200** - Healthy/Ready
- **503** - Unhealthy/Not Ready

## Monitoring

### Application Metrics

The application exposes metrics for monitoring:

- **Response times** - API endpoint performance
- **Error rates** - Application error tracking
- **Database performance** - Query execution times
- **Memory usage** - Application memory consumption
- **CPU usage** - Application CPU utilization

### Log Aggregation

Logs are structured in JSON format and include:

- **Correlation IDs** - Request tracing
- **User context** - User identification
- **Performance metrics** - Response times
- **Error details** - Stack traces and context

### Recommended Monitoring Stack

- **Prometheus** - Metrics collection
- **Grafana** - Metrics visualization
- **ELK Stack** - Log aggregation and analysis
- **Jaeger** - Distributed tracing

## Troubleshooting

### Common Issues

#### Database Connection Issues

```bash
# Check database connectivity
docker-compose exec app npm run migrate:status

# View database logs
docker-compose logs postgres

# Connect to database directly
docker-compose exec postgres psql -U postgres -d employee_management
```

#### Redis Connection Issues

```bash
# Check Redis connectivity
docker-compose exec redis redis-cli ping

# View Redis logs
docker-compose logs redis
```

#### Application Not Starting

```bash
# Check application logs
docker-compose logs app

# Check environment variables
docker-compose exec app env | grep -E "(DB_|REDIS_|JWT_)"

# Verify configuration
docker-compose exec app node -e "console.log(require('./dist/config').default)"
```

#### Performance Issues

```bash
# Check resource usage
docker stats

# Monitor database queries
docker-compose exec postgres psql -U postgres -d employee_management -c "SELECT * FROM pg_stat_activity;"

# Check application metrics
curl http://localhost:3000/health
```

### Debug Mode

Enable debug mode for detailed logging:

```bash
# Set environment variable
export DEBUG=true
export LOG_LEVEL=debug

# Or in Docker Compose
docker-compose exec app sh -c "DEBUG=true LOG_LEVEL=debug npm start"
```

### Log Analysis

```bash
# View recent logs
docker-compose logs --tail=100 app

# Follow logs in real-time
docker-compose logs -f app

# Filter logs by level
docker-compose logs app | grep ERROR

# Search logs for specific patterns
docker-compose logs app | grep "correlation_id"
```

### Database Debugging

```bash
# Check migration status
npm run migrate:status

# View database schema
docker-compose exec postgres psql -U postgres -d employee_management -c "\dt"

# Check table contents
docker-compose exec postgres psql -U postgres -d employee_management -c "SELECT COUNT(*) FROM employees;"

# Analyze query performance
docker-compose exec postgres psql -U postgres -d employee_management -c "EXPLAIN ANALYZE SELECT * FROM employees LIMIT 10;"
```

## Security Considerations

### Production Deployment

1. **Use strong passwords** for all services
2. **Enable SSL/TLS** for all connections
3. **Configure firewall rules** to restrict access
4. **Use secrets management** for sensitive data
5. **Enable audit logging** for compliance
6. **Regular security updates** for all components
7. **Monitor for security vulnerabilities**

### Environment Variables

Never commit sensitive environment variables to version control. Use:

- **Docker secrets** for Docker Swarm
- **Kubernetes secrets** for Kubernetes
- **AWS Secrets Manager** for AWS deployments
- **Azure Key Vault** for Azure deployments
- **HashiCorp Vault** for on-premises deployments

## Support

For deployment issues or questions:

1. Check the [troubleshooting section](#troubleshooting)
2. Review application logs
3. Consult the API documentation
4. Contact the development team