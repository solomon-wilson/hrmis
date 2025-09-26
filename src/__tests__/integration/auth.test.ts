import request from 'supertest';
import { Pool } from 'pg';
import { IntegrationTestSetup } from './setup';
import { createApp } from '../../app';
import { Express } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

describe('Authentication Flow Integration Tests', () => {
  let app: Express;
  let dbPool: Pool;

  beforeAll(async () => {
    await IntegrationTestSetup.setupTestEnvironment();
    dbPool = IntegrationTestSetup.getTestDatabase();
    app = createApp();
  });

  afterAll(async () => {
    await IntegrationTestSetup.teardownTestEnvironment();
  });

  beforeEach(async () => {
    await IntegrationTestSetup.cleanDatabase();
    await IntegrationTestSetup.seedTestData();
  });

  describe('User Registration and Login', () => {
    test('should register new user successfully', async () => {
      const userData = {
        email: 'newuser@company.com',
        password: 'SecurePassword123!',
        role: 'EMPLOYEE'
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      expect(response.body).toMatchObject({
        user: {
          email: userData.email,
          role: userData.role
        },
        token: expect.any(String)
      });

      // Verify user was created in database
      const dbResult = await dbPool.query('SELECT * FROM users WHERE email = $1', [userData.email]);
      expect(dbResult.rows).toHaveLength(1);
      expect(dbResult.rows[0].email).toBe(userData.email);
    });

    test('should prevent duplicate user registration', async () => {
      const userData = {
        email: 'duplicate@company.com',
        password: 'SecurePassword123!',
        role: 'EMPLOYEE'
      };

      // First registration should succeed
      await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      // Second registration should fail
      await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(409);
    });

    test('should login with valid credentials', async () => {
      // Create user directly in database
      const hashedPassword = await bcrypt.hash('password123', 10);
      await dbPool.query(
        'INSERT INTO users (id, email, password_hash, role, created_at, updated_at) VALUES (gen_random_uuid(), $1, $2, $3, NOW(), NOW())',
        ['login@company.com', hashedPassword, 'EMPLOYEE']
      );

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'login@company.com',
          password: 'password123'
        })
        .expect(200);

      expect(response.body).toMatchObject({
        user: {
          email: 'login@company.com',
          role: 'EMPLOYEE'
        },
        token: expect.any(String),
        refreshToken: expect.any(String)
      });

      // Verify token is valid
      const decoded = jwt.verify(response.body.token, process.env.JWT_SECRET!) as any;
      expect(decoded.email).toBe('login@company.com');
    });

    test('should reject invalid credentials', async () => {
      // Create user with different password
      const hashedPassword = await bcrypt.hash('correctpassword', 10);
      await dbPool.query(
        'INSERT INTO users (id, email, password_hash, role, created_at, updated_at) VALUES (gen_random_uuid(), $1, $2, $3, NOW(), NOW())',
        ['invalid@company.com', hashedPassword, 'EMPLOYEE']
      );

      await request(app)
        .post('/api/auth/login')
        .send({
          email: 'invalid@company.com',
          password: 'wrongpassword'
        })
        .expect(401);
    });

    test('should reject login for non-existent user', async () => {
      await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@company.com',
          password: 'password123'
        })
        .expect(401);
    });
  });

  describe('Token Management', () => {
    let userToken: string;
    let refreshToken: string;
    let userId: string;

    beforeEach(async () => {
      // Create and login user
      const hashedPassword = await bcrypt.hash('password123', 10);
      const userResult = await dbPool.query(
        'INSERT INTO users (id, email, password_hash, role, created_at, updated_at) VALUES (gen_random_uuid(), $1, $2, $3, NOW(), NOW()) RETURNING id',
        ['token@company.com', hashedPassword, 'EMPLOYEE']
      );
      userId = userResult.rows[0].id;

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'token@company.com',
          password: 'password123'
        });

      userToken = loginResponse.body.token;
      refreshToken = loginResponse.body.refreshToken;
    });

    test('should access protected route with valid token', async () => {
      const response = await request(app)
        .get('/api/employees/self')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(response.body).toBeDefined();
    });

    test('should reject access with invalid token', async () => {
      await request(app)
        .get('/api/employees/self')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });

    test('should reject access with expired token', async () => {
      // Create an expired token
      const expiredToken = jwt.sign(
        { userId, email: 'token@company.com', role: 'EMPLOYEE' },
        process.env.JWT_SECRET!,
        { expiresIn: '-1h' } // Expired 1 hour ago
      );

      await request(app)
        .get('/api/employees/self')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);
    });

    test('should refresh token with valid refresh token', async () => {
      const response = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken })
        .expect(200);

      expect(response.body).toMatchObject({
        token: expect.any(String),
        refreshToken: expect.any(String)
      });

      // New token should be different from old one
      expect(response.body.token).not.toBe(userToken);

      // New token should work for protected routes
      await request(app)
        .get('/api/employees/self')
        .set('Authorization', `Bearer ${response.body.token}`)
        .expect(200);
    });

    test('should reject refresh with invalid refresh token', async () => {
      await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: 'invalid-refresh-token' })
        .expect(401);
    });

    test('should logout and invalidate tokens', async () => {
      // Logout
      await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ refreshToken })
        .expect(200);

      // Token should no longer work
      await request(app)
        .get('/api/employees/self')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(401);

      // Refresh token should no longer work
      await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken })
        .expect(401);
    });
  });

  describe('Role-Based Access Control', () => {
    let hrAdminToken: string;
    let managerToken: string;
    let employeeToken: string;
    let viewerToken: string;

    beforeEach(async () => {
      // Create users with different roles
      const users = [
        { email: 'hr@company.com', role: 'HR_ADMIN' },
        { email: 'manager@company.com', role: 'MANAGER' },
        { email: 'employee@company.com', role: 'EMPLOYEE' },
        { email: 'viewer@company.com', role: 'VIEWER' }
      ];

      const tokens = [];
      for (const user of users) {
        const hashedPassword = await bcrypt.hash('password123', 10);
        await dbPool.query(
          'INSERT INTO users (id, email, password_hash, role, created_at, updated_at) VALUES (gen_random_uuid(), $1, $2, $3, NOW(), NOW())',
          [user.email, hashedPassword, user.role]
        );

        const loginResponse = await request(app)
          .post('/api/auth/login')
          .send({
            email: user.email,
            password: 'password123'
          });

        tokens.push(loginResponse.body.token);
      }

      [hrAdminToken, managerToken, employeeToken, viewerToken] = tokens;
    });

    test('HR_ADMIN should have full access to employee operations', async () => {
      // Create employee
      await request(app)
        .post('/api/employees')
        .set('Authorization', `Bearer ${hrAdminToken}`)
        .send({
          firstName: 'Test',
          lastName: 'Employee',
          email: 'test@company.com',
          jobTitle: 'Engineer',
          department: 'Engineering',
          startDate: '2024-01-01',
          employmentType: 'FULL_TIME'
        })
        .expect(201);

      // List employees
      await request(app)
        .get('/api/employees')
        .set('Authorization', `Bearer ${hrAdminToken}`)
        .expect(200);

      // Generate reports
      await request(app)
        .get('/api/reports/employees')
        .set('Authorization', `Bearer ${hrAdminToken}`)
        .expect(200);
    });

    test('MANAGER should have limited access to employee operations', async () => {
      // Cannot create employees
      await request(app)
        .post('/api/employees')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          firstName: 'Test',
          lastName: 'Employee',
          email: 'test@company.com',
          jobTitle: 'Engineer',
          department: 'Engineering',
          startDate: '2024-01-01',
          employmentType: 'FULL_TIME'
        })
        .expect(403);

      // Can view limited employee list (only direct reports)
      await request(app)
        .get('/api/employees')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);

      // Cannot generate full reports
      await request(app)
        .get('/api/reports/employees')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(403);
    });

    test('EMPLOYEE should only access own profile', async () => {
      // Cannot create employees
      await request(app)
        .post('/api/employees')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({
          firstName: 'Test',
          lastName: 'Employee',
          email: 'test@company.com',
          jobTitle: 'Engineer',
          department: 'Engineering',
          startDate: '2024-01-01',
          employmentType: 'FULL_TIME'
        })
        .expect(403);

      // Cannot list all employees
      await request(app)
        .get('/api/employees')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);

      // Can access own profile
      await request(app)
        .get('/api/employees/self')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
    });

    test('VIEWER should have read-only access', async () => {
      // Cannot create employees
      await request(app)
        .post('/api/employees')
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({
          firstName: 'Test',
          lastName: 'Employee',
          email: 'test@company.com',
          jobTitle: 'Engineer',
          department: 'Engineering',
          startDate: '2024-01-01',
          employmentType: 'FULL_TIME'
        })
        .expect(403);

      // Can view employee list (read-only)
      await request(app)
        .get('/api/employees')
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(200);

      // Cannot generate reports
      await request(app)
        .get('/api/reports/employees')
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(403);
    });
  });

  describe('Session Management', () => {
    test('should handle multiple concurrent sessions', async () => {
      // Create user
      const hashedPassword = await bcrypt.hash('password123', 10);
      await dbPool.query(
        'INSERT INTO users (id, email, password_hash, role, created_at, updated_at) VALUES (gen_random_uuid(), $1, $2, $3, NOW(), NOW())',
        ['multi@company.com', hashedPassword, 'EMPLOYEE']
      );

      // Login from multiple "devices"
      const session1 = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'multi@company.com',
          password: 'password123'
        })
        .expect(200);

      const session2 = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'multi@company.com',
          password: 'password123'
        })
        .expect(200);

      // Both sessions should work independently
      await request(app)
        .get('/api/employees/self')
        .set('Authorization', `Bearer ${session1.body.token}`)
        .expect(200);

      await request(app)
        .get('/api/employees/self')
        .set('Authorization', `Bearer ${session2.body.token}`)
        .expect(200);

      // Logout one session shouldn't affect the other
      await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${session1.body.token}`)
        .send({ refreshToken: session1.body.refreshToken })
        .expect(200);

      // Session 1 should be invalid
      await request(app)
        .get('/api/employees/self')
        .set('Authorization', `Bearer ${session1.body.token}`)
        .expect(401);

      // Session 2 should still work
      await request(app)
        .get('/api/employees/self')
        .set('Authorization', `Bearer ${session2.body.token}`)
        .expect(200);
    });

    test('should handle session timeout gracefully', async () => {
      // Create user
      const hashedPassword = await bcrypt.hash('password123', 10);
      const userResult = await dbPool.query(
        'INSERT INTO users (id, email, password_hash, role, created_at, updated_at) VALUES (gen_random_uuid(), $1, $2, $3, NOW(), NOW()) RETURNING id',
        ['timeout@company.com', hashedPassword, 'EMPLOYEE']
      );

      // Create a token with very short expiration
      const shortLivedToken = jwt.sign(
        { userId: userResult.rows[0].id, email: 'timeout@company.com', role: 'EMPLOYEE' },
        process.env.JWT_SECRET!,
        { expiresIn: '1ms' } // Expires immediately
      );

      // Wait a bit to ensure expiration
      await new Promise(resolve => setTimeout(resolve, 10));

      // Token should be expired
      const response = await request(app)
        .get('/api/employees/self')
        .set('Authorization', `Bearer ${shortLivedToken}`)
        .expect(401);

      expect(response.body.error.code).toBe('TOKEN_EXPIRED');
    });
  });

  describe('Security Features', () => {
    test('should rate limit login attempts', async () => {
      const userData = {
        email: 'ratelimit@company.com',
        password: 'wrongpassword'
      };

      // Make multiple failed login attempts
      const attempts = Array.from({ length: 6 }, () =>
        request(app)
          .post('/api/auth/login')
          .send(userData)
      );

      const responses = await Promise.all(attempts);

      // First 5 should return 401 (unauthorized)
      responses.slice(0, 5).forEach(response => {
        expect(response.status).toBe(401);
      });

      // 6th should return 429 (rate limited)
      expect(responses[5].status).toBe(429);
    });

    test('should sanitize sensitive data in responses', async () => {
      // Create user
      const hashedPassword = await bcrypt.hash('password123', 10);
      await dbPool.query(
        'INSERT INTO users (id, email, password_hash, role, created_at, updated_at) VALUES (gen_random_uuid(), $1, $2, $3, NOW(), NOW())',
        ['sanitize@company.com', hashedPassword, 'EMPLOYEE']
      );

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'sanitize@company.com',
          password: 'password123'
        })
        .expect(200);

      // Response should not contain password hash
      expect(response.body.user.password_hash).toBeUndefined();
      expect(response.body.user.passwordHash).toBeUndefined();
      
      // Should contain safe user data
      expect(response.body.user.email).toBe('sanitize@company.com');
      expect(response.body.user.role).toBe('EMPLOYEE');
    });

    test('should validate JWT token structure', async () => {
      // Test with malformed tokens
      const malformedTokens = [
        'not.a.token',
        'Bearer invalid',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid.signature',
        ''
      ];

      for (const token of malformedTokens) {
        await request(app)
          .get('/api/employees/self')
          .set('Authorization', `Bearer ${token}`)
          .expect(401);
      }
    });
  });
});