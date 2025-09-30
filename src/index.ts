// Export all modules for easy access
import dotenv from 'dotenv';
export * from './models';
export * from './services';
export * from './controllers';
export { database } from './database';
export * from './middleware';
export { logger, ValidationError } from './utils';
export { createApp } from './app';


// Load variables from .env.local file
dotenv.config({ path: '.env.local' });

// Start server if this file is run directly
if (require.main === module) {
  require('./server');
}