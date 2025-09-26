import { supabase } from '../database/supabase';
import { logger } from '../utils/logger';

export interface SupabaseHealthStatus {
  connected: boolean;
  responseTime: number;
  error?: string;
  authReachable?: boolean;
}

export interface SystemHealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  uptime: number;
  environment: string;
  services: {
    supabase: SupabaseHealthStatus;
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
 * Check Supabase health and connection status
 */
export async function checkSupabaseHealth(): Promise<SupabaseHealthStatus> {
  const startTime = Date.now();

  try {
    // Test Supabase database connectivity
    const client = supabase.getClient();
    const { data, error } = await client
      .from('departments')
      .select('count', { count: 'exact', head: true });

    if (error && error.code !== 'PGRST116') { // PGRST116 = table doesn't exist
      throw error;
    }

    // Test auth service
    let authReachable = false;
    try {
      await client.auth.getSession();
      authReachable = true;
    } catch (authError) {
      logger.warn('Supabase auth service not reachable', authError);
    }

    const responseTime = Date.now() - startTime;

    return {
      connected: true,
      responseTime,
      authReachable
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown Supabase error';

    logger.error('Supabase health check failed', { error: errorMessage, responseTime });

    return {
      connected: false,
      responseTime,
      error: errorMessage,
      authReachable: false
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
    // Check Supabase connectivity
    const supabaseHealth = await checkSupabaseHealth();

    // Determine overall system status
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    if (!supabaseHealth.connected) {
      status = 'unhealthy';
    } else if (!supabaseHealth.authReachable) {
      status = 'degraded'; // Auth not critical for some functionality
    }

    // Get system metrics
    const memoryStats = getMemoryStats();
    const cpuStats = getCpuStats();

    // Log health check performance
    const totalTime = Date.now() - startTime;
    logger.debug('Health check completed', {
      status,
      totalTime,
      supabaseResponseTime: supabaseHealth.responseTime
    });

    return {
      status,
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      uptime: Math.floor(process.uptime()),
      environment: process.env.NODE_ENV || 'development',
      services: {
        supabase: supabaseHealth,
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
        supabase: { connected: false, responseTime: 0, error: errorMessage, authReachable: false },
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
    const supabaseHealth = await checkSupabaseHealth();

    if (!supabaseHealth.connected) {
      return {
        status: 'not_ready',
        timestamp: new Date().toISOString(),
        reason: 'Supabase not available'
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