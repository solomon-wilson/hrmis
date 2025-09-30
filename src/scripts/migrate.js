#!/usr/bin/env ts-node
import dotenv from 'dotenv';
import { supabase } from '../database/supabase';
import { logger } from '../utils/logger';
// Load environment variables
dotenv.config();
async function runMigrations() {
    try {
        logger.info('Connecting to Supabase...');
        await supabase.connect();
        logger.info('Supabase connection OK.');
        logger.info('Note: Apply schema changes via Supabase SQL (CLI or Dashboard).');
        logger.info('For local setup, run: supabase db push (if using local dev), or run the SQL in supabase.com project.');
        process.exit(0);
    }
    catch (error) {
        logger.error('Database migration failed', error);
        process.exit(1);
    }
    finally {
        await supabase.disconnect();
    }
}
async function rollbackMigration() {
    try {
        logger.info('Rollback is managed in Supabase via SQL migrations/history.');
        await supabase.connect();
        logger.info('Connected to Supabase; please run rollback SQL via Dashboard/CLI.');
        process.exit(0);
    }
    catch (error) {
        logger.error('Migration rollback failed', error);
        process.exit(1);
    }
    finally {
        await supabase.disconnect();
    }
}
async function showMigrationStatus() {
    try {
        logger.info('Checking Supabase availability...');
        await supabase.connect();
        console.log('\nSupabase is reachable.');
        console.log('Migration status should be checked via Supabase migration history (CLI or Dashboard).');
        process.exit(0);
    }
    catch (error) {
        logger.error('Failed to get migration status', error);
        process.exit(1);
    }
    finally {
        await supabase.disconnect();
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
