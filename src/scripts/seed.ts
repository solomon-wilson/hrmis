#!/usr/bin/env ts-node

import { database } from '../database/connection';
import { logger } from '../utils/logger';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

interface SeedUser {
  id: string;
  username: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: string;
}

interface SeedDepartment {
  id: string;
  name: string;
  description: string;
}

interface SeedEmployee {
  id: string;
  employeeId: string;
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  jobTitle: string;
  departmentId: string;
  managerId?: string;
  startDate: string;
  employmentType: string;
  status: string;
}

/**
 * Seed departments data
 */
async function seedDepartments(): Promise<SeedDepartment[]> {
  logger.info('Seeding departments...');
  
  const departments: SeedDepartment[] = [
    {
      id: uuidv4(),
      name: 'Human Resources',
      description: 'Manages employee relations, recruitment, and HR policies'
    },
    {
      id: uuidv4(),
      name: 'Engineering',
      description: 'Software development and technical operations'
    },
    {
      id: uuidv4(),
      name: 'Marketing',
      description: 'Brand management, advertising, and market research'
    },
    {
      id: uuidv4(),
      name: 'Sales',
      description: 'Customer acquisition and revenue generation'
    },
    {
      id: uuidv4(),
      name: 'Finance',
      description: 'Financial planning, accounting, and budget management'
    }
  ];

  for (const dept of departments) {
    await database.query(
      `INSERT INTO departments (id, name, description, created_at, updated_at) 
       VALUES ($1, $2, $3, NOW(), NOW()) 
       ON CONFLICT (name) DO NOTHING`,
      [dept.id, dept.name, dept.description]
    );
  }

  logger.info(`Seeded ${departments.length} departments`);
  return departments;
}

/**
 * Seed roles data
 */
async function seedRoles(): Promise<void> {
  logger.info('Seeding roles...');
  
  const roles = [
    { name: 'HR_ADMIN', description: 'Full access to all employee data and operations' },
    { name: 'MANAGER', description: 'Access to direct reports and limited employee data' },
    { name: 'EMPLOYEE', description: 'Access to own profile with limited edit permissions' },
    { name: 'VIEWER', description: 'Read-only access to permitted employee information' }
  ];

  for (const role of roles) {
    await database.query(
      `INSERT INTO roles (id, name, description, created_at, updated_at) 
       VALUES ($1, $2, $3, NOW(), NOW()) 
       ON CONFLICT (name) DO NOTHING`,
      [uuidv4(), role.name, role.description]
    );
  }

  logger.info(`Seeded ${roles.length} roles`);
}

/**
 * Seed users data
 */
async function seedUsers(_departments: SeedDepartment[]): Promise<SeedUser[]> {
  logger.info('Seeding users...');
  
  const defaultPassword = await bcrypt.hash('password123', 10);
  
  const users: SeedUser[] = [
    {
      id: uuidv4(),
      username: 'admin',
      email: 'admin@company.com',
      password: defaultPassword,
      firstName: 'System',
      lastName: 'Administrator',
      role: 'HR_ADMIN'
    },
    {
      id: uuidv4(),
      username: 'hr.manager',
      email: 'hr.manager@company.com',
      password: defaultPassword,
      firstName: 'Sarah',
      lastName: 'Johnson',
      role: 'HR_ADMIN'
    },
    {
      id: uuidv4(),
      username: 'eng.manager',
      email: 'eng.manager@company.com',
      password: defaultPassword,
      firstName: 'Michael',
      lastName: 'Chen',
      role: 'MANAGER'
    },
    {
      id: uuidv4(),
      username: 'sales.manager',
      email: 'sales.manager@company.com',
      password: defaultPassword,
      firstName: 'Jennifer',
      lastName: 'Davis',
      role: 'MANAGER'
    },
    {
      id: uuidv4(),
      username: 'john.doe',
      email: 'john.doe@company.com',
      password: defaultPassword,
      firstName: 'John',
      lastName: 'Doe',
      role: 'EMPLOYEE'
    },
    {
      id: uuidv4(),
      username: 'jane.smith',
      email: 'jane.smith@company.com',
      password: defaultPassword,
      firstName: 'Jane',
      lastName: 'Smith',
      role: 'EMPLOYEE'
    }
  ];

  for (const user of users) {
    await database.query(
      `INSERT INTO users (id, username, email, password_hash, first_name, last_name, created_at, updated_at) 
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW()) 
       ON CONFLICT (email) DO NOTHING`,
      [user.id, user.username, user.email, user.password, user.firstName, user.lastName]
    );

    // Assign role to user
    const roleResult = await database.query('SELECT id FROM roles WHERE name = $1', [user.role]);
    if (roleResult.rows.length > 0) {
      await database.query(
        `INSERT INTO user_roles (id, user_id, role_id, created_at) 
         VALUES ($1, $2, $3, NOW()) 
         ON CONFLICT (user_id, role_id) DO NOTHING`,
        [uuidv4(), user.id, roleResult.rows[0].id]
      );
    }
  }

  logger.info(`Seeded ${users.length} users`);
  return users;
}

/**
 * Seed employees data
 */
async function seedEmployees(users: SeedUser[], departments: SeedDepartment[]): Promise<void> {
  logger.info('Seeding employees...');
  
  const hrDept = departments.find(d => d.name === 'Human Resources')!;
  const engDept = departments.find(d => d.name === 'Engineering')!;
  const salesDept = departments.find(d => d.name === 'Sales')!;
  
  const employees: SeedEmployee[] = [
    {
      id: uuidv4(),
      employeeId: 'EMP001',
      userId: users.find(u => u.username === 'hr.manager')!.id,
      firstName: 'Sarah',
      lastName: 'Johnson',
      email: 'hr.manager@company.com',
      phone: '+1-555-0101',
      jobTitle: 'HR Manager',
      departmentId: hrDept.id,
      startDate: '2022-01-15',
      employmentType: 'FULL_TIME',
      status: 'ACTIVE'
    },
    {
      id: uuidv4(),
      employeeId: 'EMP002',
      userId: users.find(u => u.username === 'eng.manager')!.id,
      firstName: 'Michael',
      lastName: 'Chen',
      email: 'eng.manager@company.com',
      phone: '+1-555-0102',
      jobTitle: 'Engineering Manager',
      departmentId: engDept.id,
      startDate: '2021-03-01',
      employmentType: 'FULL_TIME',
      status: 'ACTIVE'
    },
    {
      id: uuidv4(),
      employeeId: 'EMP003',
      userId: users.find(u => u.username === 'sales.manager')!.id,
      firstName: 'Jennifer',
      lastName: 'Davis',
      email: 'sales.manager@company.com',
      phone: '+1-555-0103',
      jobTitle: 'Sales Manager',
      departmentId: salesDept.id,
      startDate: '2021-06-01',
      employmentType: 'FULL_TIME',
      status: 'ACTIVE'
    },
    {
      id: uuidv4(),
      employeeId: 'EMP004',
      userId: users.find(u => u.username === 'john.doe')!.id,
      firstName: 'John',
      lastName: 'Doe',
      email: 'john.doe@company.com',
      phone: '+1-555-0104',
      jobTitle: 'Senior Software Engineer',
      departmentId: engDept.id,
      managerId: users.find(u => u.username === 'eng.manager')!.id,
      startDate: '2022-08-15',
      employmentType: 'FULL_TIME',
      status: 'ACTIVE'
    },
    {
      id: uuidv4(),
      employeeId: 'EMP005',
      userId: users.find(u => u.username === 'jane.smith')!.id,
      firstName: 'Jane',
      lastName: 'Smith',
      email: 'jane.smith@company.com',
      phone: '+1-555-0105',
      jobTitle: 'Sales Representative',
      departmentId: salesDept.id,
      managerId: users.find(u => u.username === 'sales.manager')!.id,
      startDate: '2023-02-01',
      employmentType: 'FULL_TIME',
      status: 'ACTIVE'
    }
  ];

  for (const emp of employees) {
    await database.query(
      `INSERT INTO employees (
        id, employee_id, user_id, first_name, last_name, email, phone,
        job_title, department_id, manager_id, start_date, employment_type,
        status, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW()) 
      ON CONFLICT (employee_id) DO NOTHING`,
      [
        emp.id, emp.employeeId, emp.userId, emp.firstName, emp.lastName,
        emp.email, emp.phone, emp.jobTitle, emp.departmentId, emp.managerId,
        emp.startDate, emp.employmentType, emp.status
      ]
    );

    // Add initial status history
    await database.query(
      `INSERT INTO employee_status_history (
        id, employee_id, status, effective_date, reason, created_by, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
      ON CONFLICT DO NOTHING`,
      [
        uuidv4(), emp.id, emp.status, emp.startDate, 
        'Initial employment status', emp.userId
      ]
    );
  }

  logger.info(`Seeded ${employees.length} employees`);
}

/**
 * Main seed function
 */
async function runSeed(): Promise<void> {
  try {
    logger.info('Starting database seeding...');
    
    await database.connect();
    
    // Seed in order due to dependencies
    await seedRoles();
    const departments = await seedDepartments();
    const users = await seedUsers(departments);
    await seedEmployees(users, departments);

    // Seed document management sample data (if tables exist)
    try {
      const { rows } = await database.query(`
        SELECT to_regclass('public.staff_documents') as has_docs,
               to_regclass('public.annual_leave_plans') as has_leave
      `);
      const hasDocs = !!rows[0].has_docs;
      const hasLeave = !!rows[0].has_leave;

      if (hasDocs) {
        logger.info('Seeding sample staff documents...');
        // Attach a sample metadata-only row (file paths are placeholders for dev)
        await database.query(
          `INSERT INTO staff_documents (
             id, employee_id, category, title, description, file_name, file_path,
             file_size, mime_type, status, uploaded_by, metadata, created_at, updated_at
           ) VALUES (
             gen_random_uuid(),
             (SELECT id FROM employees LIMIT 1),
             'EMPLOYMENT_CONTRACT',
             'Employment Contract',
             'Seeded sample document',
             'contract.pdf',
             'employees/sample/contract.pdf',
             1024,
             'application/pdf',
             'PENDING',
             (SELECT id FROM users WHERE email = 'admin@company.com' LIMIT 1),
             '{"seed": true}',
             NOW(), NOW()
           ) ON CONFLICT DO NOTHING`
        );
      }

      if (hasLeave) {
        logger.info('Seeding sample annual leave plan...');
        await database.query(
          `INSERT INTO annual_leave_plans (
             id, employee_id, year, total_entitlement, carried_over, planned_leaves,
             status, created_at, updated_at
           ) VALUES (
             gen_random_uuid(),
             (SELECT id FROM employees LIMIT 1),
             EXTRACT(YEAR FROM NOW())::int,
             30,
             0,
             '[{"startDate":"2025-06-10","endDate":"2025-06-15","type":"ANNUAL","days":5}]',
             'DRAFT',
             NOW(), NOW()
           ) ON CONFLICT DO NOTHING`
        );
      }
    } catch (e) {
      logger.warn('Skipping document/leave seed (tables may not exist yet)', e);
    }
    
    logger.info('Database seeding completed successfully');
  } catch (error) {
    logger.error('Database seeding failed:', error);
    throw error;
  } finally {
    await database.disconnect();
  }
}

/**
 * Clear all seed data
 */
async function clearSeedData(): Promise<void> {
  try {
    logger.info('Clearing seed data...');
    
    await database.connect();
    
    // Clear in reverse order due to foreign key constraints
    await database.query('DELETE FROM employee_status_history WHERE reason = $1', ['Initial employment status']);
    await database.query('DELETE FROM employees WHERE employee_id LIKE $1', ['EMP%']);
    await database.query('DELETE FROM user_roles WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)', ['%@company.com']);
    await database.query('DELETE FROM users WHERE email LIKE $1', ['%@company.com']);
    await database.query('DELETE FROM departments WHERE name IN ($1, $2, $3, $4, $5)', 
      ['Human Resources', 'Engineering', 'Marketing', 'Sales', 'Finance']);
    await database.query('DELETE FROM roles WHERE name IN ($1, $2, $3, $4)', 
      ['HR_ADMIN', 'MANAGER', 'EMPLOYEE', 'VIEWER']);
    
    logger.info('Seed data cleared successfully');
  } catch (error) {
    logger.error('Failed to clear seed data:', error);
    throw error;
  } finally {
    await database.disconnect();
  }
}

// CLI handling
if (require.main === module) {
  const command = process.argv[2];
  
  switch (command) {
    case 'run':
      runSeed().catch(error => {
        console.error('Seed failed:', error);
        process.exit(1);
      });
      break;
    case 'clear':
      clearSeedData().catch(error => {
        console.error('Clear seed data failed:', error);
        process.exit(1);
      });
      break;
    default:
      console.log('Usage: ts-node seed.ts [run|clear]');
      process.exit(1);
  }
}

export { runSeed, clearSeedData };