import { logger } from '../utils/logger';
import { recordDatabaseQuery, PerformanceTimer } from '../utils/metrics';
// Enhanced database client with monitoring
export class MonitoredDatabaseClient {
    constructor(client, correlationId) {
        this.client = client;
        this.correlationId = correlationId;
    }
    /**
     * Execute a query with performance monitoring
     */
    async query(text, params) {
        const timer = new PerformanceTimer('database_query');
        const startTime = Date.now();
        const queryType = this.getQueryType(text);
        // Log query start (only in debug mode for security)
        if (process.env.NODE_ENV === 'development') {
            logger.debug('Database query started', {
                query: text,
                params: params?.length || 0,
                queryType,
                correlationId: this.correlationId
            });
        }
        try {
            const result = await this.client.query(text, params);
            const duration = Date.now() - startTime;
            // Record successful query metrics
            recordDatabaseQuery(text, queryType, duration, true, {
                rowsAffected: result.rowCount || 0
            });
            // Log slow queries
            if (duration > 1000) {
                logger.warn('Slow database query detected', {
                    duration,
                    queryType,
                    rowsAffected: result.rowCount,
                    correlationId: this.correlationId,
                    query: process.env.NODE_ENV === 'development' ? text : '[REDACTED]'
                });
            }
            timer.end(true, {
                query_type: queryType,
                rows_affected: (result.rowCount || 0).toString()
            });
            return result;
        }
        catch (error) {
            const duration = Date.now() - startTime;
            const errorCode = error instanceof Error ? error.name : 'UnknownError';
            // Record failed query metrics
            recordDatabaseQuery(text, queryType, duration, false, {
                errorCode
            });
            // Log database errors
            logger.error('Database query failed', {
                error: error instanceof Error ? error.message : 'Unknown error',
                errorCode,
                duration,
                queryType,
                correlationId: this.correlationId,
                query: process.env.NODE_ENV === 'development' ? text : '[REDACTED]'
            });
            timer.end(false, {
                query_type: queryType,
                error: errorCode
            });
            throw error;
        }
    }
    /**
     * Begin a transaction with monitoring
     */
    async begin() {
        const timer = new PerformanceTimer('database_transaction_begin');
        try {
            await this.client.query('BEGIN');
            timer.end(true);
            logger.debug('Database transaction started', {
                correlationId: this.correlationId
            });
        }
        catch (error) {
            timer.end(false);
            logger.error('Failed to start database transaction', {
                error: error instanceof Error ? error.message : 'Unknown error',
                correlationId: this.correlationId
            });
            throw error;
        }
    }
    /**
     * Commit a transaction with monitoring
     */
    async commit() {
        const timer = new PerformanceTimer('database_transaction_commit');
        try {
            await this.client.query('COMMIT');
            timer.end(true);
            logger.debug('Database transaction committed', {
                correlationId: this.correlationId
            });
        }
        catch (error) {
            timer.end(false);
            logger.error('Failed to commit database transaction', {
                error: error instanceof Error ? error.message : 'Unknown error',
                correlationId: this.correlationId
            });
            throw error;
        }
    }
    /**
     * Rollback a transaction with monitoring
     */
    async rollback() {
        const timer = new PerformanceTimer('database_transaction_rollback');
        try {
            await this.client.query('ROLLBACK');
            timer.end(true);
            logger.debug('Database transaction rolled back', {
                correlationId: this.correlationId
            });
        }
        catch (error) {
            timer.end(false);
            logger.error('Failed to rollback database transaction', {
                error: error instanceof Error ? error.message : 'Unknown error',
                correlationId: this.correlationId
            });
            throw error;
        }
    }
    /**
     * Release the client back to the pool
     */
    release() {
        this.client.release();
    }
    /**
     * Determine query type from SQL text
     */
    getQueryType(query) {
        const trimmed = query.trim().toUpperCase();
        if (trimmed.startsWith('SELECT'))
            return 'SELECT';
        if (trimmed.startsWith('INSERT'))
            return 'INSERT';
        if (trimmed.startsWith('UPDATE'))
            return 'UPDATE';
        if (trimmed.startsWith('DELETE'))
            return 'DELETE';
        return 'OTHER';
    }
}
// Enhanced database pool with monitoring
export class MonitoredDatabasePool {
    constructor(pool) {
        this.pool = pool;
        this.setupPoolMonitoring();
    }
    /**
     * Get a monitored client from the pool
     */
    async getClient(correlationId) {
        const timer = new PerformanceTimer('database_connection_acquire');
        try {
            const client = await this.pool.connect();
            timer.end(true);
            logger.debug('Database client acquired', {
                correlationId,
                poolStats: this.getPoolStats()
            });
            return new MonitoredDatabaseClient(client, correlationId);
        }
        catch (error) {
            timer.end(false);
            logger.error('Failed to acquire database client', {
                error: error instanceof Error ? error.message : 'Unknown error',
                correlationId,
                poolStats: this.getPoolStats()
            });
            throw error;
        }
    }
    /**
     * Execute a query directly on the pool with monitoring
     */
    async query(text, params, correlationId) {
        const client = await this.getClient(correlationId);
        try {
            return await client.query(text, params);
        }
        finally {
            client.release();
        }
    }
    /**
     * Get pool statistics
     */
    getPoolStats() {
        return {
            total: this.pool.totalCount,
            idle: this.pool.idleCount,
            waiting: this.pool.waitingCount
        };
    }
    /**
     * Setup pool event monitoring
     */
    setupPoolMonitoring() {
        // Monitor pool events
        this.pool.on('connect', (_client) => {
            logger.debug('Database pool client connected', {
                poolStats: this.getPoolStats()
            });
        });
        this.pool.on('acquire', (_client) => {
            logger.debug('Database pool client acquired', {
                poolStats: this.getPoolStats()
            });
        });
        this.pool.on('remove', (_client) => {
            logger.debug('Database pool client removed', {
                poolStats: this.getPoolStats()
            });
        });
        this.pool.on('error', (error, _client) => {
            logger.error('Database pool error', {
                error: error.message,
                poolStats: this.getPoolStats()
            });
        });
        // Log pool statistics periodically
        setInterval(() => {
            const stats = this.getPoolStats();
            logger.info('Database pool statistics', {
                poolStats: stats,
                timestamp: new Date().toISOString()
            });
            // Alert on pool exhaustion
            if (stats.waiting > 5) {
                logger.warn('Database pool under pressure', {
                    poolStats: stats,
                    message: 'High number of waiting connections detected'
                });
            }
        }, 60000); // Every minute
    }
    /**
     * Close the pool
     */
    async end() {
        await this.pool.end();
        logger.info('Database pool closed');
    }
}
// Middleware to add correlation ID to database operations
export function withDatabaseCorrelationId(fn) {
    return async function (...args) {
        // Try to get correlation ID from various sources
        const correlationId = this.correlationId ||
            args[0]?.correlationId ||
            process.env.CORRELATION_ID;
        // Store correlation ID for database operations
        const originalEnv = process.env.CORRELATION_ID;
        if (correlationId) {
            process.env.CORRELATION_ID = correlationId;
        }
        try {
            return await fn.apply(this, args);
        }
        finally {
            // Restore original correlation ID
            if (originalEnv !== undefined) {
                process.env.CORRELATION_ID = originalEnv;
            }
            else {
                delete process.env.CORRELATION_ID;
            }
        }
    };
}
