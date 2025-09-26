import { Pool, PoolClient, PoolConfig } from 'pg';
import { logger } from '../utils/logger';
import { MonitoredDatabasePool } from '../middleware/databaseMonitoring';

interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl: boolean;
  max?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
}

class DatabaseConnection {
  private pool: Pool | null = null;
  private monitoredPool: MonitoredDatabasePool | null = null;
  private config: DatabaseConfig;

  constructor() {
    this.config = {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'employee_management',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'password',
      ssl: process.env.DB_SSL === 'true',
      max: 20, // Maximum number of clients in the pool
      idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
      connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection could not be established
    };
  }

  /**
   * Initialize the database connection pool
   */
  public async connect(): Promise<void> {
    try {
      const poolConfig: PoolConfig = {
        host: this.config.host,
        port: this.config.port,
        database: this.config.database,
        user: this.config.user,
        password: this.config.password,
        ssl: this.config.ssl,
        max: this.config.max,
        idleTimeoutMillis: this.config.idleTimeoutMillis,
        connectionTimeoutMillis: this.config.connectionTimeoutMillis,
      };

      this.pool = new Pool(poolConfig);
      this.monitoredPool = new MonitoredDatabasePool(this.pool);

      // Test the connection
      const client = await this.pool.connect();
      await client.query('SELECT NOW()');
      client.release();

      logger.info('Database connection established successfully', {
        host: this.config.host,
        port: this.config.port,
        database: this.config.database,
      });

      // Handle pool errors
      this.pool.on('error', (err) => {
        logger.error('Unexpected error on idle client', err);
      });

    } catch (error) {
      logger.error('Failed to connect to database', error);
      throw new Error(`Database connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get a client from the connection pool
   */
  public async getClient(): Promise<PoolClient> {
    if (!this.pool) {
      throw new Error('Database not connected. Call connect() first.');
    }

    try {
      return await this.pool.connect();
    } catch (error) {
      logger.error('Failed to get database client', error);
      throw new Error(`Failed to get database client: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get a monitored client from the connection pool
   */
  public async getMonitoredClient(correlationId?: string) {
    if (!this.monitoredPool) {
      throw new Error('Database not connected. Call connect() first.');
    }

    return await this.monitoredPool.getClient(correlationId);
  }

  /**
   * Execute a query with automatic client management
   */
  public async query(text: string, params?: any[]): Promise<any> {
    if (!this.pool) {
      throw new Error('Database not connected. Call connect() first.');
    }

    const start = Date.now();
    try {
      const result = await this.pool.query(text, params);
      const duration = Date.now() - start;
      
      logger.debug('Executed query', {
        query: text,
        duration: `${duration}ms`,
        rows: result.rowCount,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - start;
      logger.error('Query execution failed', {
        query: text,
        duration: `${duration}ms`,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Execute a monitored query with automatic client management
   */
  public async monitoredQuery(text: string, params?: any[], correlationId?: string): Promise<any> {
    if (!this.monitoredPool) {
      throw new Error('Database not connected. Call connect() first.');
    }

    return await this.monitoredPool.query(text, params, correlationId);
  }

  /**
   * Execute a transaction
   */
  public async transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.getClient();
    
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Transaction rolled back', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Close the database connection pool
   */
  public async disconnect(): Promise<void> {
    if (this.monitoredPool) {
      await this.monitoredPool.end();
      this.monitoredPool = null;
    }
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      logger.info('Database connection closed');
    }
  }

  /**
   * Check if the database is connected
   */
  public isConnected(): boolean {
    return this.pool !== null;
  }

  /**
   * Get pool statistics
   */
  public getPoolStats() {
    if (!this.pool) {
      return null;
    }

    return {
      totalCount: this.pool.totalCount,
      idleCount: this.pool.idleCount,
      waitingCount: this.pool.waitingCount,
    };
  }

  /**
   * Get monitored pool statistics
   */
  public getMonitoredPoolStats() {
    if (!this.monitoredPool) {
      return null;
    }

    return this.monitoredPool.getPoolStats();
  }
}

// Create a singleton instance
export const database = new DatabaseConnection();

// Export types
export type { DatabaseConfig, PoolClient };