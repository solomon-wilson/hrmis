import { Pool } from 'pg';
import { logger } from '../../utils/logger';
import fs from 'fs';
import path from 'path';

export const runMigrations = async (pool: Pool): Promise<void> => {
  try {
    // Create migrations table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) NOT NULL UNIQUE,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Get list of migration files
    const migrationsDir = path.join(__dirname, 'scripts');
    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql') || file.endsWith('.ts'))
      .sort();

    // Get already executed migrations
    const executedResult = await pool.query('SELECT filename FROM migrations');
    const executedMigrations = new Set(executedResult.rows.map(row => row.filename));

    // Execute pending migrations
    for (const file of migrationFiles) {
      if (!executedMigrations.has(file)) {
        logger.info(`Executing migration: ${file}`);
        
        if (file.endsWith('.sql')) {
          const migrationSQL = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
          await pool.query(migrationSQL);
        } else if (file.endsWith('.ts')) {
          // For TypeScript migration files, we'll need to import and execute them
          const migrationModule = await import(path.join(migrationsDir, file));
          if (migrationModule.up) {
            await migrationModule.up(pool);
          }
        }

        // Record migration as executed
        await pool.query('INSERT INTO migrations (filename) VALUES ($1)', [file]);
        logger.info(`Migration completed: ${file}`);
      }
    }

    logger.info('All migrations completed successfully');
  } catch (error) {
    logger.error('Migration failed:', error);
    throw error;
  }
};