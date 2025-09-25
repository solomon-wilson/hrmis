import dotenv from 'dotenv';
import { createApp } from './app';
import { logger } from './utils/logger';
import { database } from './database/connection';

// Load environment variables
dotenv.config();

const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

async function startServer() {
  try {
    // Test database connection
    logger.info('Testing database connection...');
    await database.testConnection();
    logger.info('Database connection successful');

    // Create Express app
    const app = createApp();

    // Start server
    const server = app.listen(PORT, () => {
      logger.info(`Employee Management API server started`, {
        port: PORT,
        environment: NODE_ENV,
        timestamp: new Date().toISOString()
      });
    });

    // Graceful shutdown handling
    const gracefulShutdown = (signal: string) => {
      logger.info(`Received ${signal}, starting graceful shutdown...`);
      
      server.close(async () => {
        logger.info('HTTP server closed');
        
        try {
          await database.close();
          logger.info('Database connections closed');
          process.exit(0);
        } catch (error) {
          logger.error('Error during database shutdown:', error);
          process.exit(1);
        }
      });

      // Force shutdown after 30 seconds
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 30000);
    };

    // Handle shutdown signals
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      process.exit(1);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
      process.exit(1);
    });

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startServer();