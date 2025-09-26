// Export all modules for easy access
export * from './models';
export * from './services';
export * from './controllers';
export { database } from './database';
export * from './middleware';
export { logger, ValidationError } from './utils';
export { createApp } from './app';

// Start server if this file is run directly
if (require.main === module) {
  require('./server');
}