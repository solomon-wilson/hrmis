import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { database } from '../../database/connection';
import { migrationRunner } from '../../database/migrations';
import { logger } from '../../utils/logger';
// Global test container instance
let postgresContainer;
/**
 * Integration test setup and teardown
 */
export const IntegrationTestSetup = {
    /**
     * Set up test environment
     */
    setupTestEnvironment: async () => {
        try {
            // Start PostgreSQL container
            postgresContainer = await new PostgreSqlContainer('postgres:15-alpine')
                .withDatabase('employee_management_test')
                .withUsername('postgres')
                .withPassword('test_password')
                .start();
            // Configure database connection for tests
            process.env.DB_HOST = postgresContainer.getHost();
            process.env.DB_PORT = postgresContainer.getFirstMappedPort().toString();
            process.env.DB_NAME = postgresContainer.getDatabase();
            process.env.DB_USER = postgresContainer.getUsername();
            process.env.DB_PASSWORD = postgresContainer.getPassword();
            process.env.DB_SSL = 'false';
            logger.info('Test container started', {
                host: postgresContainer.getHost(),
                port: postgresContainer.getFirstMappedPort(),
                database: postgresContainer.getDatabase()
            });
        }
        catch (error) {
            logger.error('Failed to start test container', error);
            throw new Error('Test container not started');
        }
    },
    /**
     * Tear down test environment
     */
    teardownTestEnvironment: async () => {
        try {
            await database.disconnect();
            if (postgresContainer) {
                await postgresContainer.stop();
            }
        }
        catch (error) {
            logger.error('Failed to teardown test environment', error);
        }
    },
    /**
     * Get test database connection info
     */
    getTestDatabaseInfo: () => {
        if (!postgresContainer) {
            throw new Error('Test container not started');
        }
        return {
            host: postgresContainer.getHost(),
            port: postgresContainer.getFirstMappedPort(),
            database: postgresContainer.getDatabase(),
            username: postgresContainer.getUsername(),
            password: postgresContainer.getPassword()
        };
    },
    /**
     * Seed test data
     */
    seedTestData: async () => {
        try {
            // Run migrations first
            await migrationRunner.runMigrations();
            // Insert test data
            // This is a simplified version - you can expand based on your needs
            await database.query(`
        INSERT INTO roles (id, name, description, created_at, updated_at) 
        VALUES 
          ('550e8400-e29b-41d4-a716-446655440001', 'HR_ADMIN', 'HR Administrator', NOW(), NOW()),
          ('550e8400-e29b-41d4-a716-446655440002', 'MANAGER', 'Manager', NOW(), NOW()),
          ('550e8400-e29b-41d4-a716-446655440003', 'EMPLOYEE', 'Employee', NOW(), NOW())
        ON CONFLICT (name) DO NOTHING
      `);
            logger.info('Test data seeded successfully');
        }
        catch (error) {
            logger.error('Failed to seed test data', error);
            throw error;
        }
    },
    /**
     * Clean database for test isolation
     */
    cleanDatabase: async () => {
        try {
            // Clean tables in reverse order due to foreign key constraints
            const tables = [
                'employee_status_history',
                'employees',
                'user_roles',
                'users',
                'departments',
                'roles',
                'audit_logs'
            ];
            for (const table of tables) {
                await database.query(`TRUNCATE TABLE ${table} RESTART IDENTITY CASCADE`);
            }
            logger.debug('Database cleaned for test isolation');
        }
        catch (error) {
            logger.error('Failed to clean database', error);
            throw error;
        }
    }
};
/**
 * Clean up test environment
 */
export const cleanupTestEnvironment = async () => {
    await IntegrationTestSetup.teardownTestEnvironment();
};
// Global setup and teardown for Jest
export default async () => {
    await IntegrationTestSetup.setupTestEnvironment();
};
// Export for Jest global teardown
export { cleanupTestEnvironment as teardown };
