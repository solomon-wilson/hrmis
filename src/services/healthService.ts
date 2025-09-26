import { checkDatabaseHealth, DatabaseHealthStatus } from '../database/health';
import { logger } from '../utils/logger';

export interface RedisHealthStatus {
  connected: boolean;
  responseTime: number;
  error?: string;
}

export interface SystemHealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  uptime: number;
  environment: string;
  services: {
    database: DatabaseHealthStatus;
    redis: RedisHealthStatus;
    memory: {
      used: number;
      total: number;
      percentage: number;
    };
    cpu: {
      usage: number;
    };
  };
}

/**
 * Check Redis health and connection status
 */
export async function checkRedisHealth(): Promise<RedisHealthStatus> {
  const startTime = Date.now();
  
  try {
    // Import Redis connection dynamically to avoid circular dependencies
    const { redisConnection } = await import('../database/redis');
    
    // Test Redis connectivity with a ping
    await redisConnection.ping();
    
    const responseTime = Date.now() - startTime;
    
    return {
      connected: true,
      responseTime
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown Redis error';
    
    logger.error('Redis health check failed', { error: errorMessage, responseTime });
    
    return {
      connected: false,
      responseTime,
      error: errorMessage
    };
  }
}

/**
 * Get memory usage statistics
 */
function getMemoryStats() {
  const memUsage = process.memoryUsage();
  const totalMemory = memUsage.heapTotal + memUsage.external;
  const usedMemory = memUsage.heapUsed;
  
  return {
    used: Math.round(usedMemory / 1024 / 1024), // MB
    total: Math.round(totalMemory / 1024 / 1024), // MB
    percentage: Math.round((usedMemory / totalMemory) * 100)
  };
}

/**
 * Get CPU usage (simplified - returns 0 as Node.js doesn't have built-in CPU monitoring)
 */
function getCpuStats() {
  // In a real implementation, you might use a library like 'pidusage' or 'os-utils'
  // For now, we'll return a placeholder
  return {
    usage: 0 // Percentage
  };
}

/**
 * Perform comprehensive system health check
 */
export async function performHealthCheck(): Promise<SystemHealthStatus> {
  const startTime = Date.now();
  
  try {
    // Check all services in parallel
    const [databaseHealth, redisHealth] = await Promise.all([
      checkDatabaseHealth(),
      checkRedisHealth()
    ]);
    
    // Determine overall system status
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    
    if (!databaseHealth.connected) {
      status = 'unhealthy';
    } else if (!redisHealth.connected) {
      status = 'degraded'; // Redis is not critical for basic functionality
    }
    
    // Get system metrics
    const memoryStats = getMemoryStats();
    const cpuStats = getCpuStats();
    
    // Log health check performance
    const totalTime = Date.now() - startTime;
    logger.debug('Health check completed', {
      status,
      totalTime,
      databaseResponseTime: databaseHealth.responseTime,
      redisResponseTime: redisHealth.responseTime
    });
    
    return {
      status,
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      uptime: Math.floor(process.uptime()),
      environment: process.env.NODE_ENV || 'development',
      services: {
        database: databaseHealth,
        redis: redisHealth,
        memory: memoryStats,
        cpu: cpuStats
      }
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown health check error';
    
    logger.error('Health check failed', { error: errorMessage });
    
    return {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      uptime: Math.floor(process.uptime()),
      environment: process.env.NODE_ENV || 'development',
      services: {
        database: { connected: false, responseTime: 0, poolStats: null, error: errorMessage },
        redis: { connected: false, responseTime: 0, error: errorMessage },
        memory: getMemoryStats(),
        cpu: getCpuStats()
      }
    };
  }
}

/**
 * Simple health check for basic liveness probe
 */
export function performLivenessCheck() {
  return {
    status: 'alive',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime())
  };
}

/**
 * Readiness check - ensures all critical services are available
 */
export async function performReadinessCheck() {
  try {
    const databaseHealth = await checkDatabaseHealth();
    
    if (!databaseHealth.connected) {
      return {
        status: 'not_ready',
        timestamp: new Date().toISOString(),
        reason: 'Database not available'
      };
    }
    
    return {
      status: 'ready',
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown readiness check error';
    
    return {
      status: 'not_ready',
      timestamp: new Date().toISOString(),
      reason: errorMessage
    };
  }
}