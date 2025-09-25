#!/usr/bin/env ts-node

import dotenv from 'dotenv';
import { database, migrationRunner } from '../database';
import { logger } from '../utils/logger';

// Load environment variables
dotenv.config();

async function runMigrations() {
  try {
    logger.info('Starting database migration...');
    
    // Connect to database
    await database.connect();
    
    // Run migrations
    await migrationRunner.runMigrations();
    
    logger.info('Database migration completed successfully');
    process.exit(0);
  } catch (error) {
    logger.error('Database migration failed', error);
    process.exit(1);
  } finally {
    await database.disconnect();
  }
}

async function rollbackMigration() {
  try {
    logger.info('Starting migration rollback...');
    
    // Connect to database
    await database.connect();
    
    // Rollback last migration
    await migrationRunner.rollbackLastMigration();
    
    logger.info('Migration rollback completed successfully');
    process.exit(0);
  } catch (error) {
    logger.error('Migration rollback failed', error);
    process.exit(1);
  } finally {
    await database.disconnect();
  }
}

async function showMigrationStatus() {
  try {
    logger.info('Checking migration status...');
    
    // Connect to database
    await database.connect();
    
    // Get migration status
    const status = await migrationRunner.getMigrationStatus();
    
    console.log('\n=== Migration Status ===');
    console.log(`Executed migrations: ${status.executed.length}`);
    status.executed.forEach(id => console.log(`  ✓ ${id}`));
    
    console.log(`\nPending migrations: ${status.pending.length}`);
    status.pending.forEach(id => console.log(`  ○ ${id}`));
    
    process.exit(0);
  } catch (error) {
    logger.error('Failed to get migration status', error);
    process.exit(1);
  } finally {
    await database.disconnect();
  }
}

// Parse command line arguments
const command = process.argv[2];

switch (command) {
  case 'up':
  case 'migrate':
    runMigrations();
    break;
  case 'down':
  case 'rollback':
    rollbackMigration();
    break;
  case 'status':
    showMigrationStatus();
    break;
  default:
    console.log('Usage: ts-node src/scripts/migrate.ts [up|down|status]');
    console.log('  up/migrate - Run pending migrations');
    console.log('  down/rollback - Rollback last migration');
    console.log('  status - Show migration status');
    process.exit(1);
}