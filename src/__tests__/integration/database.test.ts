import { Pool } from 'pg';
import { IntegrationTestSetup } from './setup';
import { EmployeeRepository } from '../../database/repositories/EmployeeRepository';
import { AuditLogRepository } from '../../database/repositories/AuditLogRepository';
import { Employee } from '../../models/Employee';

describe('Database Integration Tests', () => {
  let dbPool: Pool;
  let employeeRepo: EmployeeRepository;
  let auditRepo: AuditLogRepository;

  beforeAll(async () => {
    await IntegrationTestSetup.setupTestEnvironment();
    dbPool = IntegrationTestSetup.getTestDatabase();
    employeeRepo = new EmployeeRepository(dbPool);
    auditRepo = new AuditLogRepository(dbPool);
  });

  afterAll(async () => {
    await IntegrationTestSetup.teardownTestEnvironment();
  });

  beforeEach(async () => {
    await IntegrationTestSetup.cleanDatabase();
    await IntegrationTestSetup.seedTestData();
  });

  describe('Employee Repository Integration', () => {
    test('should create employee with all relationships', async () => {
      const employeeData = {
        employeeId: 'TEST001',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@test.com',
        phone: '+1-555-0123',
        jobTitle: 'Software Engineer',
        department: 'Engineering',
        startDate: new Date('2024-01-01'),
        employmentType: 'FULL_TIME' as const,
        status: 'ACTIVE' as const,
        createdBy: 'test-user'
      };

      const employee = await employeeRepo.create(employeeData);

      expect(employee).toMatchObject({
        employeeId: 'TEST001',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@test.com',
        status: 'ACTIVE'
      });
      expect(employee.id).toBeDefined();
      expect(employee.createdAt).toBeInstanceOf(Date);
    });

    test('should enforce unique email constraint', async () => {
      const employeeData = {
        employeeId: 'TEST001',
        firstName: 'John',
        lastName: 'Doe',
        email: 'duplicate@test.com',
        jobTitle: 'Software Engineer',
        department: 'Engineering',
        startDate: new Date('2024-01-01'),
        employmentType: 'FULL_TIME' as const,
        status: 'ACTIVE' as const,
        createdBy: 'test-user'
      };

      await employeeRepo.create(employeeData);

      // Try to create another employee with same email
      const duplicateData = { ...employeeData, employeeId: 'TEST002' };
      
      await expect(employeeRepo.create(duplicateData)).rejects.toThrow();
    });

    test('should update employee and maintain audit trail', async () => {
      const employee = await employeeRepo.create({
        employeeId: 'TEST001',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@test.com',
        jobTitle: 'Software Engineer',
        department: 'Engineering',
        startDate: new Date('2024-01-01'),
        employmentType: 'FULL_TIME' as const,
        status: 'ACTIVE' as const,
        createdBy: 'test-user'
      });

      const updates = {
        jobTitle: 'Senior Software Engineer',
        phone: '+1-555-9999'
      };

      const updatedEmployee = await employeeRepo.update(employee.id, updates, 'test-user');

      expect(updatedEmployee.jobTitle).toBe('Senior Software Engineer');
      expect(updatedEmployee.phone).toBe('+1-555-9999');
      expect(updatedEmployee.updatedAt).not.toEqual(employee.updatedAt);
    });

    test('should handle complex search queries with filters', async () => {
      // Create test employees
      const employees = [
        {
          employeeId: 'ENG001',
          firstName: 'Alice',
          lastName: 'Engineer',
          email: 'alice@test.com',
          jobTitle: 'Software Engineer',
          department: 'Engineering',
          startDate: new Date('2023-01-01'),
          employmentType: 'FULL_TIME' as const,
          status: 'ACTIVE' as const,
          createdBy: 'test-user'
        },
        {
          employeeId: 'ENG002',
          firstName: 'Bob',
          lastName: 'Developer',
          email: 'bob@test.com',
          jobTitle: 'Frontend Developer',
          department: 'Engineering',
          startDate: new Date('2023-06-01'),
          employmentType: 'PART_TIME' as const,
          status: 'ON_LEAVE' as const,
          createdBy: 'test-user'
        },
        {
          employeeId: 'SAL001',
          firstName: 'Carol',
          lastName: 'Sales',
          email: 'carol@test.com',
          jobTitle: 'Sales Rep',
          department: 'Sales',
          startDate: new Date('2023-03-01'),
          employmentType: 'FULL_TIME' as const,
          status: 'ACTIVE' as const,
          createdBy: 'test-user'
        }
      ];

      for (const emp of employees) {
        await employeeRepo.create(emp);
      }

      // Test search by name
      const searchResults = await employeeRepo.search({
        search: 'Alice',
        page: 1,
        limit: 10
      });

      expect(searchResults.data).toHaveLength(1);
      expect(searchResults.data[0].firstName).toBe('Alice');

      // Test filter by department
      const deptResults = await employeeRepo.search({
        department: 'Engineering',
        page: 1,
        limit: 10
      });

      expect(deptResults.data).toHaveLength(2);
      deptResults.data.forEach(emp => {
        expect(emp.department).toBe('Engineering');
      });

      // Test filter by status
      const statusResults = await employeeRepo.search({
        status: 'ON_LEAVE',
        page: 1,
        limit: 10
      });

      expect(statusResults.data).toHaveLength(1);
      expect(statusResults.data[0].status).toBe('ON_LEAVE');
    });

    test('should handle pagination correctly', async () => {
      // Create multiple employees
      for (let i = 1; i <= 15; i++) {
        await employeeRepo.create({
          employeeId: `TEST${i.toString().padStart(3, '0')}`,
          firstName: `Employee${i}`,
          lastName: 'Test',
          email: `employee${i}@test.com`,
          jobTitle: 'Test Engineer',
          department: 'Engineering',
          startDate: new Date('2024-01-01'),
          employmentType: 'FULL_TIME' as const,
          status: 'ACTIVE' as const,
          createdBy: 'test-user'
        });
      }

      // Test first page
      const page1 = await employeeRepo.search({
        page: 1,
        limit: 5
      });

      expect(page1.data).toHaveLength(5);
      expect(page1.pagination.page).toBe(1);
      expect(page1.pagination.limit).toBe(5);
      expect(page1.pagination.total).toBe(15);
      expect(page1.pagination.totalPages).toBe(3);

      // Test second page
      const page2 = await employeeRepo.search({
        page: 2,
        limit: 5
      });

      expect(page2.data).toHaveLength(5);
      expect(page2.pagination.page).toBe(2);

      // Ensure different results
      const page1Ids = page1.data.map(emp => emp.id);
      const page2Ids = page2.data.map(emp => emp.id);
      expect(page1Ids).not.toEqual(page2Ids);
    });

    test('should handle manager-employee relationships', async () => {
      // Create manager
      const manager = await employeeRepo.create({
        employeeId: 'MGR001',
        firstName: 'Manager',
        lastName: 'Smith',
        email: 'manager@test.com',
        jobTitle: 'Engineering Manager',
        department: 'Engineering',
        startDate: new Date('2023-01-01'),
        employmentType: 'FULL_TIME' as const,
        status: 'ACTIVE' as const,
        createdBy: 'test-user'
      });

      // Create employee under manager
      const employee = await employeeRepo.create({
        employeeId: 'EMP001',
        firstName: 'Employee',
        lastName: 'Johnson',
        email: 'employee@test.com',
        jobTitle: 'Software Developer',
        department: 'Engineering',
        managerId: manager.id,
        startDate: new Date('2023-06-01'),
        employmentType: 'FULL_TIME' as const,
        status: 'ACTIVE' as const,
        createdBy: 'test-user'
      });

      // Test getting direct reports
      const directReports = await employeeRepo.getDirectReports(manager.id);
      
      expect(directReports).toHaveLength(1);
      expect(directReports[0].id).toBe(employee.id);
      expect(directReports[0].managerId).toBe(manager.id);
    });
  });

  describe('Audit Log Repository Integration', () => {
    test('should create audit log entries', async () => {
      const auditData = {
        entityType: 'EMPLOYEE',
        entityId: 'test-employee-id',
        action: 'CREATE' as const,
        changes: {
          firstName: { old: null, new: 'John' },
          lastName: { old: null, new: 'Doe' }
        },
        performedBy: 'test-user',
        ipAddress: '127.0.0.1'
      };

      const auditLog = await auditRepo.create(auditData);

      expect(auditLog).toMatchObject({
        entityType: 'EMPLOYEE',
        entityId: 'test-employee-id',
        action: 'CREATE',
        performedBy: 'test-user'
      });
      expect(auditLog.id).toBeDefined();
      expect(auditLog.performedAt).toBeInstanceOf(Date);
    });

    test('should retrieve audit history for entity', async () => {
      const entityId = 'test-employee-id';

      // Create multiple audit entries
      const auditEntries = [
        {
          entityType: 'EMPLOYEE',
          entityId,
          action: 'CREATE' as const,
          changes: { firstName: { old: null, new: 'John' } },
          performedBy: 'user1'
        },
        {
          entityType: 'EMPLOYEE',
          entityId,
          action: 'UPDATE' as const,
          changes: { jobTitle: { old: 'Developer', new: 'Senior Developer' } },
          performedBy: 'user2'
        },
        {
          entityType: 'EMPLOYEE',
          entityId,
          action: 'STATUS_CHANGE' as const,
          changes: { status: { old: 'ACTIVE', new: 'ON_LEAVE' } },
          performedBy: 'user1'
        }
      ];

      for (const entry of auditEntries) {
        await auditRepo.create(entry);
      }

      const history = await auditRepo.getEntityHistory(entityId);

      expect(history).toHaveLength(3);
      expect(history[0].action).toBe('STATUS_CHANGE'); // Most recent first
      expect(history[1].action).toBe('UPDATE');
      expect(history[2].action).toBe('CREATE');
    });

    test('should handle complex change tracking', async () => {
      const complexChanges = {
        personalInfo: {
          old: { firstName: 'John', lastName: 'Doe', phone: null },
          new: { firstName: 'John', lastName: 'Smith', phone: '+1-555-0123' }
        },
        jobInfo: {
          old: { jobTitle: 'Developer', department: 'Engineering', salary: 75000 },
          new: { jobTitle: 'Senior Developer', department: 'Engineering', salary: 85000 }
        }
      };

      const auditLog = await auditRepo.create({
        entityType: 'EMPLOYEE',
        entityId: 'complex-test-id',
        action: 'UPDATE',
        changes: complexChanges,
        performedBy: 'test-user'
      });

      expect(auditLog.changes).toEqual(complexChanges);
    });
  });

  describe('Database Transaction Handling', () => {
    test('should rollback transaction on error', async () => {
      const client = await dbPool.connect();
      
      try {
        await client.query('BEGIN');
        
        // Create an employee
        await client.query(
          `INSERT INTO employees (id, employee_id, first_name, last_name, email, job_title, department, start_date, employment_type, status, created_at, updated_at, created_by, updated_by)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW(), $10, $10)`,
          ['TRANS001', 'Transaction', 'Test', 'trans@test.com', 'Test Engineer', 'Engineering', '2024-01-01', 'FULL_TIME', 'ACTIVE', 'test-user']
        );
        
        // Intentionally cause an error (duplicate email)
        await client.query(
          `INSERT INTO employees (id, employee_id, first_name, last_name, email, job_title, department, start_date, employment_type, status, created_at, updated_at, created_by, updated_by)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW(), $10, $10)`,
          ['TRANS002', 'Transaction2', 'Test', 'trans@test.com', 'Test Engineer', 'Engineering', '2024-01-01', 'FULL_TIME', 'ACTIVE', 'test-user']
        );
        
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
      } finally {
        client.release();
      }

      // Verify no employees were created
      const result = await dbPool.query('SELECT * FROM employees WHERE email = $1', ['trans@test.com']);
      expect(result.rows).toHaveLength(0);
    });

    test('should handle concurrent operations correctly', async () => {
      // Create a test employee first
      const employee = await employeeRepo.create({
        employeeId: 'CONCURRENT001',
        firstName: 'Concurrent',
        lastName: 'Test',
        email: 'concurrent@test.com',
        jobTitle: 'Test Engineer',
        department: 'Engineering',
        startDate: new Date('2024-01-01'),
        employmentType: 'FULL_TIME' as const,
        status: 'ACTIVE' as const,
        createdBy: 'test-user'
      });

      // Simulate concurrent updates
      const updates1 = { phone: '+1-555-1111' };
      const updates2 = { jobTitle: 'Senior Test Engineer' };

      const [result1, result2] = await Promise.allSettled([
        employeeRepo.update(employee.id, updates1, 'user1'),
        employeeRepo.update(employee.id, updates2, 'user2')
      ]);

      // Both operations should succeed (last write wins)
      expect(result1.status).toBe('fulfilled');
      expect(result2.status).toBe('fulfilled');

      // Verify final state
      const finalEmployee = await employeeRepo.findById(employee.id);
      expect(finalEmployee).toBeDefined();
    });
  });
});