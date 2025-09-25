// Export all modules for easy access
export * from './models';
export * from './services';
export * from './controllers';
export * from './database';
export * from './middleware';
export * from './utils';
export * from './app';

// Start server if this file is run directly
if (require.main === module) {
  require('./server');
}