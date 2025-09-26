import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';
import { createApp } from '../../app';
import { Application } from 'express';
import { runMigrations } from '../../database/migrations/migrationRunner';
import { logger } from '../../utils/logger';

export interface TestContext {
  app: Application;
  dbContainer: StartedPostgreSqlContainer;
  dbPool: Pool;
  cleanup: () => Promise<void>;
}

export const setupTestEnvironment = async (): Promise<TestContext> => {
  // Start PostgreSQL container
  const dbContainer = await new PostgreSqlContainer('postgres:15')
    .withDatabase('employee_management_test')
    .withUsername('test_user')
    .withPassword('test_password')
    .withExposedPorts(5432)
    .start();

  // Create database connection
  const dbPool = new Pool({
    host: dbContainer.getHost(),
    port: dbContainer.getMappedPort(5432),
    database: dbContainer.getDatabase(),
    user: dbContainer.getUsername(),
    password: dbContainer.getPassword(),
  });

  // Set environment variables for the test
  process.env.DATABASE_URL = `postgresql://${dbContainer.getUsername()}:${dbContainer.getPassword()}@${dbContainer.getHost()}:${dbContainer.getMappedPort(5432)}/${dbContainer.getDatabase()}`;
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key-for-testing-only';

  // Run migrations
  try {
    await runMigrations(dbPool);
    logger.info('Test database migrations completed successfully');
  } catch (error) {
    logger.error('Failed to run test database migrations:', error);
    throw error;
  }

  // Create Express app
  const app = createApp();

  const cleanup = async () => {
    try {
      await dbPool.end();
      await dbContainer.stop();
    } catch (error) {
      logger.error('Error during test cleanup:', error);
    }
  };

  return {
    app,
    dbContainer,
    dbPool,
    cleanup
  };
};

export const createTestUser = async (dbPool: Pool, userData: {
  email: string;
  password: string;
  role: string;
  employeeId?: string;
}) => {
  const bcrypt = require('bcryptjs');
  const hashedPassword = await bcrypt.hash(userData.password, 10);
  
  const result = await dbPool.query(
    `INSERT INTO users (id, email, password_hash, role, employee_id, created_at, updated_at) 
     VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW(), NOW()) 
     RETURNING id, email, role, employee_id`,
    [userData.email, hashedPassword, userData.role, userData.employeeId]
  );
  
  return result.rows[0];
};

export const createTestEmployee = async (dbPool: Pool, employeeData: any) => {
  const result = await dbPool.query(
    `INSERT INTO employees (
      id, employee_id, first_name, last_name, email, phone, 
      job_title, department, manager_id, start_date, employment_type,
      status, created_at, updated_at, created_by, updated_by
    ) VALUES (
      gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW(), $12, $12
    ) RETURNING *`,
    [
      employeeData.employee_id,
      employeeData.first_name,
      employeeData.last_name,
      employeeData.email,
      employeeData.phone,
      employeeData.job_title,
      employeeData.department,
      employeeData.manager_id,
      employeeData.start_date,
      employeeData.employment_type,
      employeeData.status || 'ACTIVE',
      employeeData.created_by || 'test-user'
    ]
  );
  
  return result.rows[0];
};

export const authenticateUser = async (app: Application, email: string, password: string) => {
  const request = require('supertest');
  const response = await request(app)
    .post('/api/auth/login')
    .send({ email, password });
  
  return response.body.token;
};