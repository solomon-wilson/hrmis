import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Export all modules for easy access
export * from './models';
export * from './services';
export * from './controllers';
export * from './database';

// Main application entry point (to be implemented in later tasks)
console.log('Employee Management System - Core interfaces and structure initialized');