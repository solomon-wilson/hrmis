import { createClient, RedisClientType } from 'redis';
import { logger } from '../utils/logger';

class RedisConnection {
  private client: RedisClientType | null = null;
  private isConnected = false;

  constructor() {
    // Redis configuration from environment variables
    const redisUrl = process.env.REDIS_URL || 
      `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`;
    
    this.client = createClient({
      url: redisUrl,
      password: process.env.REDIS_PASSWORD || undefined,
      socket: {
        connectTimeout: 5000
      }
    });

    // Error handling
    this.client.on('error', (error) => {
      logger.error('Redis connection error:', error);
      this.isConnected = false;
    });

    this.client.on('connect', () => {
      logger.info('Redis connected');
      this.isConnected = true;
    });

    this.client.on('disconnect', () => {
      logger.warn('Redis disconnected');
      this.isConnected = false;
    });
  }

  /**
   * Connect to Redis
   */
  public async connect(): Promise<void> {
    if (!this.client) {
      throw new Error('Redis client not initialized');
    }

    try {
      await this.client.connect();
      this.isConnected = true;
      logger.info('Redis connection established');
    } catch (error) {
      logger.error('Failed to connect to Redis:', error);
      this.isConnected = false;
      throw error;
    }
  }

  /**
   * Disconnect from Redis
   */
  public async disconnect(): Promise<void> {
    if (this.client && this.isConnected) {
      try {
        await this.client.disconnect();
        this.isConnected = false;
        logger.info('Redis connection closed');
      } catch (error) {
        logger.error('Error disconnecting from Redis:', error);
      }
    }
  }

  /**
   * Get Redis client instance
   */
  public getClient(): RedisClientType {
    if (!this.client) {
      throw new Error('Redis client not initialized');
    }
    return this.client;
  }

  /**
   * Check if Redis is connected
   */
  public isRedisConnected(): boolean {
    return this.isConnected && this.client?.isReady === true;
  }

  /**
   * Ping Redis to test connectivity
   */
  public async ping(): Promise<string> {
    if (!this.client || !this.isConnected) {
      throw new Error('Redis not connected');
    }
    return await this.client.ping();
  }
}

// Create singleton instance
const redisConnection = new RedisConnection();

// Export both the connection instance and client for backward compatibility
export { redisConnection };
export const redisClient = redisConnection.getClient();