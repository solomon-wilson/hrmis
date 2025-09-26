import { PoolClient } from 'pg';
import { database } from '../connection';
import { logger } from '../../utils/logger';

export interface Migration {
  id: string;
  name: string;
  up: (client: PoolClient) => Promise<void>;
  down: (client: PoolClient) => Promise<void>;
}

class MigrationRunner {
  constructor() {
    // Migration scripts are loaded dynamically
  }

  /**
   * Initialize the migrations table
   */
  private async initializeMigrationsTable(client: PoolClient): Promise<void> {
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS migrations (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `;

    await client.query(createTableQuery);
    logger.info('Migrations table initialized');
  }

  /**
   * Get executed migrations from database
   */
  private async getExecutedMigrations(client: PoolClient): Promise<string[]> {
    const result = await client.query('SELECT id FROM migrations ORDER BY executed_at');
    return result.rows.map((row: any) => row.id);
  }

  /**
   * Record migration execution
   */
  private async recordMigration(client: PoolClient, migration: Migration): Promise<void> {
    await client.query(
      'INSERT INTO migrations (id, name) VALUES ($1, $2)',
      [migration.id, migration.name]
    );
  }

  /**
   * Remove migration record
   */
  private async removeMigrationRecord(client: PoolClient, migrationId: string): Promise<void> {
    await client.query('DELETE FROM migrations WHERE id = $1', [migrationId]);
  }

  /**
   * Load all migration files
   */
  private async loadMigrations(): Promise<Migration[]> {
    const migrations: Migration[] = [];
    
    // Import all migration modules
    const { createUsersTable } = await import('./scripts/001_create_users_table');
    const { createRolesTable } = await import('./scripts/002_create_roles_table');
    const { createUserRolesTable } = await import('./scripts/003_create_user_roles_table');
    const { createDepartmentsTable } = await import('./scripts/004_create_departments_table');
    const { createEmployeesTable } = await import('./scripts/005_create_employees_table');
    const { createEmployeeStatusHistoryTable } = await import('./scripts/006_create_employee_status_history_table');
    const { createAuditLogsTable } = await import('./scripts/007_create_audit_logs_table');
    
    // Time and Attendance migrations
    const createTimeEntriesTable = await import('./scripts/008_create_time_entries_table');
    const createLeaveTypesTable = await import('./scripts/009_create_leave_types_table');
    const createLeaveRequestsTable = await import('./scripts/010_create_leave_requests_table');
    const createLeaveBalancesTable = await import('./scripts/011_create_leave_balances_table');
    const createPoliciesTable = await import('./scripts/012_create_policies_table');

    migrations.push(
      createUsersTable,
      createRolesTable,
      createUserRolesTable,
      createDepartmentsTable,
      createEmployeesTable,
      createEmployeeStatusHistoryTable,
      createAuditLogsTable,
      {
        id: '008',
        name: 'create_time_entries_table',
        up: createTimeEntriesTable.up,
        down: createTimeEntriesTable.down
      },
      {
        id: '009',
        name: 'create_leave_types_table',
        up: createLeaveTypesTable.up,
        down: createLeaveTypesTable.down
      },
      {
        id: '010',
        name: 'create_leave_requests_table',
        up: createLeaveRequestsTable.up,
        down: createLeaveRequestsTable.down
      },
      {
        id: '011',
        name: 'create_leave_balances_table',
        up: createLeaveBalancesTable.up,
        down: createLeaveBalancesTable.down
      },
      {
        id: '012',
        name: 'create_policies_table',
        up: createPoliciesTable.up,
        down: createPoliciesTable.down
      }
    );

    return migrations.sort((a, b) => a.id.localeCompare(b.id));
  }

  /**
   * Run pending migrations
   */
  public async runMigrations(): Promise<void> {
    const client = await database.getClient();
    
    try {
      await this.initializeMigrationsTable(client);
      
      const migrations = await this.loadMigrations();
      const executedMigrations = await this.getExecutedMigrations(client);
      
      const pendingMigrations = migrations.filter(
        migration => !executedMigrations.includes(migration.id)
      );

      if (pendingMigrations.length === 0) {
        logger.info('No pending migrations');
        return;
      }

      logger.info(`Running ${pendingMigrations.length} pending migrations`);

      for (const migration of pendingMigrations) {
        logger.info(`Running migration: ${migration.id} - ${migration.name}`);
        
        await database.transaction(async (transactionClient) => {
          await migration.up(transactionClient);
          await this.recordMigration(transactionClient, migration);
        });

        logger.info(`Completed migration: ${migration.id}`);
      }

      logger.info('All migrations completed successfully');
    } catch (error) {
      logger.error('Migration failed', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Rollback the last migration
   */
  public async rollbackLastMigration(): Promise<void> {
    const client = await database.getClient();
    
    try {
      await this.initializeMigrationsTable(client);
      
      const executedMigrations = await this.getExecutedMigrations(client);
      
      if (executedMigrations.length === 0) {
        logger.info('No migrations to rollback');
        return;
      }

      const lastMigrationId = executedMigrations[executedMigrations.length - 1];
      const migrations = await this.loadMigrations();
      const migrationToRollback = migrations.find(m => m.id === lastMigrationId);

      if (!migrationToRollback) {
        throw new Error(`Migration ${lastMigrationId} not found`);
      }

      logger.info(`Rolling back migration: ${migrationToRollback.id} - ${migrationToRollback.name}`);

      await database.transaction(async (transactionClient) => {
        await migrationToRollback.down(transactionClient);
        await this.removeMigrationRecord(transactionClient, migrationToRollback.id);
      });

      logger.info(`Rollback completed: ${migrationToRollback.id}`);
    } catch (error) {
      logger.error('Rollback failed', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get migration status
   */
  public async getMigrationStatus(): Promise<{ executed: string[]; pending: string[] }> {
    const client = await database.getClient();
    
    try {
      await this.initializeMigrationsTable(client);
      
      const migrations = await this.loadMigrations();
      const executedMigrations = await this.getExecutedMigrations(client);
      
      const allMigrationIds = migrations.map(m => m.id);
      const pendingMigrations = allMigrationIds.filter(
        id => !executedMigrations.includes(id)
      );

      return {
        executed: executedMigrations,
        pending: pendingMigrations,
      };
    } finally {
      client.release();
    }
  }
}

export const migrationRunner = new MigrationRunner();