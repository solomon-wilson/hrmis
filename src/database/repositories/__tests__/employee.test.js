import { EmployeeRepository } from '../employee';
import { setupTestDatabase, teardownTestDatabase, cleanupTestData, createTestUser, createTestDepartment } from './setup';
describe('EmployeeRepository', () => {
    let repository;
    let testUser;
    let testDepartment;
    beforeAll(async () => {
        await setupTestDatabase();
        repository = new EmployeeRepository();
        testUser = await createTestUser();
        testDepartment = await createTestDepartment();
    });
    afterAll(async () => {
        await teardownTestDatabase();
    });
    beforeEach(async () => {
        await cleanupTestData();
    });
    describe('create', () => {
        it('should create a new employee successfully', async () => {
            const employeeData = {
                employee_id: 'EMP001',
                first_name: 'John',
                last_name: 'Doe',
                email: 'john.doe@company.com',
                phone: '555-0123',
                job_title: 'Software Engineer',
                department_id: testDepartment.id,
                start_date: new Date('2024-01-01'),
                employment_type: 'FULL_TIME',
                location: 'New York',
                created_by: testUser.id
            };
            const employee = await repository.create(employeeData);
            expect(employee).toBeDefined();
            expect(employee.employeeId).toBe('EMP001');
            expect(employee.personalInfo.firstName).toBe('John');
            expect(employee.personalInfo.lastName).toBe('Doe');
            expect(employee.personalInfo.email).toBe('john.doe@company.com');
            expect(employee.jobInfo.jobTitle).toBe('Software Engineer');
            expect(employee.status.current).toBe('ACTIVE');
        });
        it('should throw error for duplicate employee ID', async () => {
            const employeeData = {
                employee_id: 'EMP001',
                first_name: 'John',
                last_name: 'Doe',
                email: 'john.doe@company.com',
                job_title: 'Software Engineer',
                start_date: new Date('2024-01-01'),
                employment_type: 'FULL_TIME',
                location: 'New York',
                created_by: testUser.id
            };
            await repository.create(employeeData);
            const duplicateData = {
                ...employeeData,
                email: 'john.doe2@company.com'
            };
            await expect(repository.create(duplicateData)).rejects.toThrow();
        });
        it('should throw error for duplicate email', async () => {
            const employeeData = {
                employee_id: 'EMP001',
                first_name: 'John',
                last_name: 'Doe',
                email: 'john.doe@company.com',
                job_title: 'Software Engineer',
                start_date: new Date('2024-01-01'),
                employment_type: 'FULL_TIME',
                location: 'New York',
                created_by: testUser.id
            };
            await repository.create(employeeData);
            const duplicateData = {
                ...employeeData,
                employee_id: 'EMP002'
            };
            await expect(repository.create(duplicateData)).rejects.toThrow();
        });
    });
    describe('findById', () => {
        it('should find employee by ID', async () => {
            const employeeData = {
                employee_id: 'EMP001',
                first_name: 'John',
                last_name: 'Doe',
                email: 'john.doe@company.com',
                job_title: 'Software Engineer',
                start_date: new Date('2024-01-01'),
                employment_type: 'FULL_TIME',
                location: 'New York',
                created_by: testUser.id
            };
            const createdEmployee = await repository.create(employeeData);
            const foundEmployee = await repository.findById(createdEmployee.id);
            expect(foundEmployee).toBeDefined();
            expect(foundEmployee.id).toBe(createdEmployee.id);
            expect(foundEmployee.employeeId).toBe('EMP001');
        });
        it('should return null for non-existent ID', async () => {
            const foundEmployee = await repository.findById('00000000-0000-0000-0000-000000000000');
            expect(foundEmployee).toBeNull();
        });
    });
    describe('findByEmployeeId', () => {
        it('should find employee by employee ID', async () => {
            const employeeData = {
                employee_id: 'EMP001',
                first_name: 'John',
                last_name: 'Doe',
                email: 'john.doe@company.com',
                job_title: 'Software Engineer',
                start_date: new Date('2024-01-01'),
                employment_type: 'FULL_TIME',
                location: 'New York',
                created_by: testUser.id
            };
            await repository.create(employeeData);
            const foundEmployee = await repository.findByEmployeeId('EMP001');
            expect(foundEmployee).toBeDefined();
            expect(foundEmployee.employeeId).toBe('EMP001');
        });
        it('should return null for non-existent employee ID', async () => {
            const foundEmployee = await repository.findByEmployeeId('NONEXISTENT');
            expect(foundEmployee).toBeNull();
        });
    });
    describe('findByEmail', () => {
        it('should find employee by email', async () => {
            const employeeData = {
                employee_id: 'EMP001',
                first_name: 'John',
                last_name: 'Doe',
                email: 'john.doe@company.com',
                job_title: 'Software Engineer',
                start_date: new Date('2024-01-01'),
                employment_type: 'FULL_TIME',
                location: 'New York',
                created_by: testUser.id
            };
            await repository.create(employeeData);
            const foundEmployee = await repository.findByEmail('john.doe@company.com');
            expect(foundEmployee).toBeDefined();
            expect(foundEmployee.personalInfo.email).toBe('john.doe@company.com');
        });
        it('should return null for non-existent email', async () => {
            const foundEmployee = await repository.findByEmail('nonexistent@company.com');
            expect(foundEmployee).toBeNull();
        });
    });
    describe('update', () => {
        it('should update employee successfully', async () => {
            const employeeData = {
                employee_id: 'EMP001',
                first_name: 'John',
                last_name: 'Doe',
                email: 'john.doe@company.com',
                job_title: 'Software Engineer',
                start_date: new Date('2024-01-01'),
                employment_type: 'FULL_TIME',
                location: 'New York',
                created_by: testUser.id
            };
            const createdEmployee = await repository.create(employeeData);
            const updateData = {
                job_title: 'Senior Software Engineer',
                location: 'San Francisco',
                updated_by: testUser.id
            };
            const updatedEmployee = await repository.update(createdEmployee.id, updateData);
            expect(updatedEmployee).toBeDefined();
            expect(updatedEmployee.jobInfo.jobTitle).toBe('Senior Software Engineer');
            expect(updatedEmployee.jobInfo.location).toBe('San Francisco');
        });
        it('should return null for non-existent employee', async () => {
            const updateData = {
                job_title: 'Senior Software Engineer',
                updated_by: testUser.id
            };
            const updatedEmployee = await repository.update('00000000-0000-0000-0000-000000000000', updateData);
            expect(updatedEmployee).toBeNull();
        });
    });
    describe('updateStatus', () => {
        it('should update employee status successfully', async () => {
            const employeeData = {
                employee_id: 'EMP001',
                first_name: 'John',
                last_name: 'Doe',
                email: 'john.doe@company.com',
                job_title: 'Software Engineer',
                start_date: new Date('2024-01-01'),
                employment_type: 'FULL_TIME',
                location: 'New York',
                created_by: testUser.id
            };
            const createdEmployee = await repository.create(employeeData);
            const updatedEmployee = await repository.updateStatus(createdEmployee.id, 'ON_LEAVE', new Date(), 'Medical leave', 'Approved by HR', testUser.id);
            expect(updatedEmployee).toBeDefined();
            expect(updatedEmployee.status.current).toBe('ON_LEAVE');
            expect(updatedEmployee.status.reason).toBe('Medical leave');
            expect(updatedEmployee.status.notes).toBe('Approved by HR');
        });
    });
    describe('findAll', () => {
        beforeEach(async () => {
            // Create test employees
            const employees = [
                {
                    employee_id: 'EMP001',
                    first_name: 'John',
                    last_name: 'Doe',
                    email: 'john.doe@company.com',
                    job_title: 'Software Engineer',
                    employment_type: 'FULL_TIME',
                    start_date: new Date('2024-01-01'),
                    location: 'New York',
                    created_by: testUser.id
                },
                {
                    employee_id: 'EMP002',
                    first_name: 'Jane',
                    last_name: 'Smith',
                    email: 'jane.smith@company.com',
                    job_title: 'Product Manager',
                    employment_type: 'FULL_TIME',
                    start_date: new Date('2024-02-01'),
                    location: 'San Francisco',
                    created_by: testUser.id
                }
            ];
            for (const emp of employees) {
                await repository.create(emp);
            }
        });
        it('should return paginated results', async () => {
            const result = await repository.findAll({
                pagination: { page: 1, limit: 1 }
            });
            expect(result.data).toHaveLength(1);
            expect(result.pagination.total).toBe(2);
            expect(result.pagination.totalPages).toBe(2);
            expect(result.pagination.hasNext).toBe(true);
            expect(result.pagination.hasPrev).toBe(false);
        });
        it('should filter by employment type', async () => {
            const result = await repository.findAll({
                filters: { employment_type: 'FULL_TIME' }
            });
            expect(result.data).toHaveLength(2);
            result.data.forEach(emp => {
                expect(emp.jobInfo.employmentType).toBe('FULL_TIME');
            });
        });
        it('should search by name', async () => {
            const result = await repository.findAll({
                filters: { search: 'John' }
            });
            expect(result.data).toHaveLength(1);
            expect(result.data[0].personalInfo.firstName).toBe('John');
        });
    });
    describe('searchEmployees', () => {
        beforeEach(async () => {
            const employeeData = {
                employee_id: 'EMP001',
                first_name: 'John',
                last_name: 'Doe',
                email: 'john.doe@company.com',
                job_title: 'Software Engineer',
                start_date: new Date('2024-01-01'),
                employment_type: 'FULL_TIME',
                location: 'New York',
                created_by: testUser.id
            };
            await repository.create(employeeData);
        });
        it('should search employees by name', async () => {
            const result = await repository.searchEmployees('John');
            expect(result.data).toHaveLength(1);
            expect(result.data[0].personalInfo.firstName).toBe('John');
        });
        it('should search employees by email', async () => {
            const result = await repository.searchEmployees('john.doe@company.com');
            expect(result.data).toHaveLength(1);
            expect(result.data[0].personalInfo.email).toBe('john.doe@company.com');
        });
        it('should search employees by employee ID', async () => {
            const result = await repository.searchEmployees('EMP001');
            expect(result.data).toHaveLength(1);
            expect(result.data[0].employeeId).toBe('EMP001');
        });
    });
    describe('exists', () => {
        it('should return true for existing employee', async () => {
            const employeeData = {
                employee_id: 'EMP001',
                first_name: 'John',
                last_name: 'Doe',
                email: 'john.doe@company.com',
                job_title: 'Software Engineer',
                start_date: new Date('2024-01-01'),
                employment_type: 'FULL_TIME',
                location: 'New York',
                created_by: testUser.id
            };
            const createdEmployee = await repository.create(employeeData);
            const exists = await repository.exists(createdEmployee.id);
            expect(exists).toBe(true);
        });
        it('should return false for non-existent employee', async () => {
            const exists = await repository.exists('00000000-0000-0000-0000-000000000000');
            expect(exists).toBe(false);
        });
    });
});
