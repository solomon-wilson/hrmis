import { supabase } from './supabase';
import { logger } from '../utils/logger';
/**
 * Check database health and connection status
 */
export async function checkDatabaseHealth() {
    const startTime = Date.now();
    try {
        // Ensure Supabase client is connected
        await supabase.connect();
        // Lightweight head count query
        const { error } = await supabase
            .getClient()
            .from('employees')
            .select('count', { count: 'exact', head: true });
        if (error && error.code !== 'PGRST116') {
            throw error;
        }
        const responseTime = Date.now() - startTime;
        return {
            connected: true,
            responseTime,
            poolStats: null,
        };
    }
    catch (error) {
        const responseTime = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : 'Unknown database error';
        logger.error('Supabase health check failed', { error: errorMessage, responseTime });
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
export async function initializeDatabase() {
    try {
        logger.info('Initializing Supabase connection...');
        // Connect to Supabase
        await supabase.connect();
        // Check health
        const health = await checkDatabaseHealth();
        if (!health.connected) {
            throw new Error(`Database health check failed: ${health.error}`);
        }
        logger.info('Database initialized successfully', {
            responseTime: health.responseTime
        });
    }
    catch (error) {
        logger.error('Failed to initialize database', error);
        throw error;
    }
}
