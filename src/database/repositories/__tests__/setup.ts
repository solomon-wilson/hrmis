import { database } from '../../connection';
import { migrationRunner } from '../../migrations';

// Test database configuration
const TEST_DB_CONFIG = {
  host: process.env.TEST_DB_HOST || 'localhost',
  port: parseInt(process.env.TEST_DB_PORT || '5432'),
  database: process.env.TEST_DB_NAME || 'employee_management_test',
  user: process.env.TEST_DB_USER || 'postgres',
  password: process.env.TEST_DB_PASSWORD || 'password',
};

export async function setupTestDatabase(): Promise<void> {
  // Override database config for tests
  process.env.DB_HOST = TEST_DB_CONFIG.host;
  process.env.DB_PORT = TEST_DB_CONFIG.port.toString();
  process.env.DB_NAME = TEST_DB_CONFIG.database;
  process.env.DB_USER = TEST_DB_CONFIG.user;
  process.env.DB_PASSWORD = TEST_DB_CONFIG.password;
  process.env.DB_SSL = 'false';

  // Connect to test database
  await database.connect();
  
  // Run migrations
  await migrationRunner.runMigrations();
}

export async function teardownTestDatabase(): Promise<void> {
  await database.disconnect();
}

export async function cleanupTestData(): Promise<void> {
  // Clean up test data in reverse order of dependencies
  await database.query('DELETE FROM audit_logs');
  await database.query('DELETE FROM employee_status_history');
  await database.query('DELETE FROM employees');
  await database.query('DELETE FROM user_roles');
  await database.query('DELETE FROM users WHERE email LIKE \'%@test.com\'');
  await database.query('DELETE FROM departments WHERE name LIKE \'Test%\'');
}

// Test data factories
export const createTestUser = async () => {
  const result = await database.query(`
    INSERT INTO users (username, email, password_hash, first_name, last_name)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
  `, ['testuser', 'test@test.com', 'hashedpassword', 'Test', 'User']);
  
  return result.rows[0];
};

export const createTestDepartment = async () => {
  const result = await database.query(`
    INSERT INTO departments (name, description, location)
    VALUES ($1, $2, $3)
    RETURNING *
  `, ['Test Department', 'Test Department Description', 'Test Location']);
  
  return result.rows[0];
};