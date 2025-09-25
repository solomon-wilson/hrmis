import { database } from './connection';
import { logger } from '../utils/logger';

export interface DatabaseHealthStatus {
  connected: boolean;
  responseTime: number;
  poolStats: {
    totalCount: number;
    idleCount: number;
    waitingCount: number;
  } | null;
  error?: string;
}

/**
 * Check database health and connection status
 */
export async function checkDatabaseHealth(): Promise<DatabaseHealthStatus> {
  const startTime = Date.now();
  
  try {
    if (!database.isConnected()) {
      return {
        connected: false,
        responseTime: 0,
        poolStats: null,
        error: 'Database not connected'
      };
    }

    // Test database connectivity with a simple query
    await database.query('SELECT 1 as health_check');
    
    const responseTime = Date.now() - startTime;
    const poolStats = database.getPoolStats();

    return {
      connected: true,
      responseTime,
      poolStats,
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown database error';
    
    logger.error('Database health check failed', { error: errorMessage, responseTime });
    
    return {
      connected: false,
      responseTime,
      poolStats: null,
      error: errorMessage
    };
  }
}

/**
 * Initialize database connection and run migrations if needed
 */
export async function initializeDatabase(): Promise<void> {
  try {
    logger.info('Initializing database connection...');
    
    // Connect to database
    await database.connect();
    
    // Check health
    const health = await checkDatabaseHealth();
    if (!health.connected) {
      throw new Error(`Database health check failed: ${health.error}`);
    }
    
    logger.info('Database initialized successfully', {
      responseTime: health.responseTime,
      poolStats: health.poolStats
    });
    
  } catch (error) {
    logger.error('Failed to initialize database', error);
    throw error;
  }
}