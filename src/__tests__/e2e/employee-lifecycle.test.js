import request from 'supertest';
import { setupTestEnvironment, createTestUser, createTestEmployee, authenticateUser } from './setup';
describe('Employee Lifecycle E2E Tests', () => {
    let testContext;
    let hrAdminToken;
    let managerToken;
    let employeeToken;
    let testEmployeeId;
    beforeAll(async () => {
        testContext = await setupTestEnvironment();
        // Create test users
        const hrAdmin = await createTestUser(testContext.dbPool, {
            email: 'hr.admin@company.com',
            password: 'password123',
            role: 'HR_ADMIN'
        });
        const manager = await createTestUser(testContext.dbPool, {
            email: 'manager@company.com',
            password: 'password123',
            role: 'MANAGER',
            employeeId: 'MGR001'
        });
        const employee = await createTestUser(testContext.dbPool, {
            email: 'employee@company.com',
            password: 'password123',
            role: 'EMPLOYEE',
            employeeId: 'EMP001'
        });
        // Authenticate users
        hrAdminToken = await authenticateUser(testContext.app, 'hr.admin@company.com', 'password123');
        managerToken = await authenticateUser(testContext.app, 'manager@company.com', 'password123');
        employeeToken = await authenticateUser(testContext.app, 'employee@company.com', 'password123');
    }, 30000);
    afterAll(async () => {
        await testContext.cleanup();
    }, 10000);
    describe('Complete Employee Lifecycle', () => {
        test('HR Admin can create a new employee', async () => {
            const newEmployee = {
                firstName: 'John',
                lastName: 'Doe',
                email: 'john.doe@company.com',
                phone: '+1-555-0123',
                jobTitle: 'Software Engineer',
                department: 'Engineering',
                startDate: '2024-01-15',
                employmentType: 'FULL_TIME'
            };
            const response = await request(testContext.app)
                .post('/api/employees')
                .set('Authorization', `Bearer ${hrAdminToken}`)
                .send(newEmployee)
                .expect(201);
            expect(response.body).toMatchObject({
                firstName: newEmployee.firstName,
                lastName: newEmployee.lastName,
                email: newEmployee.email,
                status: 'ACTIVE'
            });
            testEmployeeId = response.body.id;
        });
        test('HR Admin can retrieve employee details', async () => {
            const response = await request(testContext.app)
                .get(`/api/employees/${testEmployeeId}`)
                .set('Authorization', `Bearer ${hrAdminToken}`)
                .expect(200);
            expect(response.body).toMatchObject({
                id: testEmployeeId,
                firstName: 'John',
                lastName: 'Doe',
                email: 'john.doe@company.com'
            });
        });
        test('HR Admin can update employee information', async () => {
            const updates = {
                phone: '+1-555-9999',
                jobTitle: 'Senior Software Engineer'
            };
            const response = await request(testContext.app)
                .put(`/api/employees/${testEmployeeId}`)
                .set('Authorization', `Bearer ${hrAdminToken}`)
                .send(updates)
                .expect(200);
            expect(response.body).toMatchObject(updates);
        });
        test('HR Admin can change employee status to ON_LEAVE', async () => {
            const statusUpdate = {
                status: 'ON_LEAVE',
                effectiveDate: '2024-02-01',
                reason: 'Medical leave',
                notes: 'Approved medical leave for 30 days'
            };
            const response = await request(testContext.app)
                .put(`/api/employees/${testEmployeeId}/status`)
                .set('Authorization', `Bearer ${hrAdminToken}`)
                .send(statusUpdate)
                .expect(200);
            expect(response.body.status).toBe('ON_LEAVE');
        });
        test('HR Admin can view employee status history', async () => {
            const response = await request(testContext.app)
                .get(`/api/employees/${testEmployeeId}/history`)
                .set('Authorization', `Bearer ${hrAdminToken}`)
                .expect(200);
            expect(response.body).toHaveLength(2); // ACTIVE -> ON_LEAVE
            expect(response.body[0].status).toBe('ON_LEAVE');
            expect(response.body[1].status).toBe('ACTIVE');
        });
        test('HR Admin can terminate employee', async () => {
            const terminationUpdate = {
                status: 'TERMINATED',
                effectiveDate: '2024-03-01',
                reason: 'Voluntary resignation',
                notes: 'Employee submitted resignation letter'
            };
            const response = await request(testContext.app)
                .put(`/api/employees/${testEmployeeId}/status`)
                .set('Authorization', `Bearer ${hrAdminToken}`)
                .send(terminationUpdate)
                .expect(200);
            expect(response.body.status).toBe('TERMINATED');
        });
        test('Terminated employee cannot be updated', async () => {
            const updates = {
                phone: '+1-555-8888'
            };
            await request(testContext.app)
                .put(`/api/employees/${testEmployeeId}`)
                .set('Authorization', `Bearer ${hrAdminToken}`)
                .send(updates)
                .expect(400);
        });
    });
    describ;
    e('Cross-Role Access Control', () => {
        let managerEmployeeId;
        let regularEmployeeId;
        beforeAll(async () => {
            // Create manager employee record
            const managerEmployee = await createTestEmployee(testContext.dbPool, {
                employee_id: 'MGR001',
                first_name: 'Manager',
                last_name: 'Smith',
                email: 'manager@company.com',
                job_title: 'Engineering Manager',
                department: 'Engineering',
                start_date: '2023-01-01',
                employment_type: 'FULL_TIME',
                created_by: 'system'
            });
            managerEmployeeId = managerEmployee.id;
            // Create regular employee under manager
            const regularEmployee = await createTestEmployee(testContext.dbPool, {
                employee_id: 'EMP001',
                first_name: 'Employee',
                last_name: 'Johnson',
                email: 'employee@company.com',
                job_title: 'Software Developer',
                department: 'Engineering',
                manager_id: managerEmployeeId,
                start_date: '2023-06-01',
                employment_type: 'FULL_TIME',
                created_by: 'system'
            });
            regularEmployeeId = regularEmployee.id;
        });
        test('Manager can view their direct reports', async () => {
            const response = await request(testContext.app)
                .get(`/api/managers/${managerEmployeeId}/reports`)
                .set('Authorization', `Bearer ${managerToken}`)
                .expect(200);
            expect(response.body).toHaveLength(1);
            expect(response.body[0].id).toBe(regularEmployeeId);
        });
        test('Manager can view direct report details', async () => {
            const response = await request(testContext.app)
                .get(`/api/employees/${regularEmployeeId}`)
                .set('Authorization', `Bearer ${managerToken}`)
                .expect(200);
            expect(response.body.id).toBe(regularEmployeeId);
            expect(response.body.firstName).toBe('Employee');
        });
        test('Manager cannot view non-direct report details', async () => {
            await request(testContext.app)
                .get(`/api/employees/${testEmployeeId}`)
                .set('Authorization', `Bearer ${managerToken}`)
                .expect(403);
        });
        test('Employee can view their own profile', async () => {
            const response = await request(testContext.app)
                .get(`/api/employees/self`)
                .set('Authorization', `Bearer ${employeeToken}`)
                .expect(200);
            expect(response.body.id).toBe(regularEmployeeId);
        });
        test('Employee can update their own editable fields', async () => {
            const updates = {
                phone: '+1-555-7777'
            };
            const response = await request(testContext.app)
                .put('/api/employees/self')
                .set('Authorization', `Bearer ${employeeToken}`)
                .send(updates)
                .expect(200);
            expect(response.body.phone).toBe(updates.phone);
        });
        test('Employee cannot update restricted fields', async () => {
            const updates = {
                jobTitle: 'Senior Developer',
                salary: 100000
            };
            await request(testContext.app)
                .put('/api/employees/self')
                .set('Authorization', `Bearer ${employeeToken}`)
                .send(updates)
                .expect(400);
        });
        test('Employee cannot view other employees', async () => {
            await request(testContext.app)
                .get(`/api/employees/${testEmployeeId}`)
                .set('Authorization', `Bearer ${employeeToken}`)
                .expect(403);
        });
    });
    describe('Search and Filtering', () => {
        beforeAll(async () => {
            // Create multiple test employees for search testing
            const employees = [
                {
                    employee_id: 'ENG001',
                    first_name: 'Alice',
                    last_name: 'Engineer',
                    email: 'alice@company.com',
                    job_title: 'Software Engineer',
                    department: 'Engineering',
                    employment_type: 'FULL_TIME',
                    status: 'ACTIVE'
                },
                {
                    employee_id: 'ENG002',
                    first_name: 'Bob',
                    last_name: 'Developer',
                    email: 'bob@company.com',
                    job_title: 'Frontend Developer',
                    department: 'Engineering',
                    employment_type: 'PART_TIME',
                    status: 'ACTIVE'
                },
                {
                    employee_id: 'SAL001',
                    first_name: 'Carol',
                    last_name: 'Sales',
                    email: 'carol@company.com',
                    job_title: 'Sales Representative',
                    department: 'Sales',
                    employment_type: 'FULL_TIME',
                    status: 'ON_LEAVE'
                }
            ];
            for (const emp of employees) {
                await createTestEmployee(testContext.dbPool, {
                    ...emp,
                    start_date: '2023-01-01',
                    created_by: 'system'
                });
            }
        });
        test('HR Admin can search employees by name', async () => {
            const response = await request(testContext.app)
                .get('/api/employees?search=Alice')
                .set('Authorization', `Bearer ${hrAdminToken}`)
                .expect(200);
            expect(response.body.data).toHaveLength(1);
            expect(response.body.data[0].firstName).toBe('Alice');
        });
        test('HR Admin can filter employees by department', async () => {
            const response = await request(testContext.app)
                .get('/api/employees?department=Engineering')
                .set('Authorization', `Bearer ${hrAdminToken}`)
                .expect(200);
            expect(response.body.data.length).toBeGreaterThanOrEqual(2);
            response.body.data.forEach((emp) => {
                expect(emp.department).toBe('Engineering');
            });
        });
        test('HR Admin can filter employees by status', async () => {
            const response = await request(testContext.app)
                .get('/api/employees?status=ON_LEAVE')
                .set('Authorization', `Bearer ${hrAdminToken}`)
                .expect(200);
            expect(response.body.data.length).toBeGreaterThanOrEqual(1);
            response.body.data.forEach((emp) => {
                expect(emp.status).toBe('ON_LEAVE');
            });
        });
        test('HR Admin can filter employees by employment type', async () => {
            const response = await request(testContext.app)
                .get('/api/employees?employmentType=PART_TIME')
                .set('Authorization', `Bearer ${hrAdminToken}`)
                .expect(200);
            expect(response.body.data.length).toBeGreaterThanOrEqual(1);
            response.body.data.forEach((emp) => {
                expect(emp.employmentType).toBe('PART_TIME');
            });
        });
        test('Search results are paginated', async () => {
            const response = await request(testContext.app)
                .get('/api/employees?page=1&limit=2')
                .set('Authorization', `Bearer ${hrAdminToken}`)
                .expect(200);
            expect(response.body.data).toHaveLength(2);
            expect(response.body.pagination).toMatchObject({
                page: 1,
                limit: 2,
                total: expect.any(Number),
                totalPages: expect.any(Number)
            });
        });
        test('No results found returns appropriate message', async () => {
            const response = await request(testContext.app)
                .get('/api/employees?search=NonExistentEmployee')
                .set('Authorization', `Bearer ${hrAdminToken}`)
                .expect(200);
            expect(response.body.data).toHaveLength(0);
            expect(response.body.message).toContain('no results found');
        });
    });
    describe('Performance and Concurrent Operations', () => {
        test('System handles concurrent employee creation', async () => {
            const concurrentRequests = Array.from({ length: 5 }, (_, i) => {
                const employee = {
                    firstName: `Concurrent${i}`,
                    lastName: 'Employee',
                    email: `concurrent${i}@company.com`,
                    jobTitle: 'Test Engineer',
                    department: 'Engineering',
                    startDate: '2024-01-01',
                    employmentType: 'FULL_TIME'
                };
                return request(testContext.app)
                    .post('/api/employees')
                    .set('Authorization', `Bearer ${hrAdminToken}`)
                    .send(employee);
            });
            const responses = await Promise.all(concurrentRequests);
            responses.forEach(response => {
                expect(response.status).toBe(201);
                expect(response.body.id).toBeDefined();
            });
            // Verify all employees were created with unique IDs
            const employeeIds = responses.map(r => r.body.id);
            const uniqueIds = new Set(employeeIds);
            expect(uniqueIds.size).toBe(5);
        });
        test('System handles concurrent status updates', async () => {
            // Create a test employee first
            const employee = await request(testContext.app)
                .post('/api/employees')
                .set('Authorization', `Bearer ${hrAdminToken}`)
                .send({
                firstName: 'Status',
                lastName: 'Test',
                email: 'status.test@company.com',
                jobTitle: 'Test Engineer',
                department: 'Engineering',
                startDate: '2024-01-01',
                employmentType: 'FULL_TIME'
            });
            const employeeId = employee.body.id;
            // Try concurrent status updates (should handle race conditions)
            const statusUpdates = [
                {
                    status: 'ON_LEAVE',
                    effectiveDate: '2024-02-01',
                    reason: 'Vacation'
                },
                {
                    status: 'ACTIVE',
                    effectiveDate: '2024-02-02',
                    reason: 'Return from leave'
                }
            ];
            const concurrentRequests = statusUpdates.map(update => request(testContext.app)
                .put(`/api/employees/${employeeId}/status`)
                .set('Authorization', `Bearer ${hrAdminToken}`)
                .send(update));
            const responses = await Promise.allSettled(concurrentRequests);
            // At least one should succeed
            const successfulResponses = responses.filter(r => r.status === 'fulfilled' && r.value.status === 200);
            expect(successfulResponses.length).toBeGreaterThanOrEqual(1);
        });
        test('Large employee list loads within acceptable time', async () => {
            const startTime = Date.now();
            const response = await request(testContext.app)
                .get('/api/employees?limit=100')
                .set('Authorization', `Bearer ${hrAdminToken}`)
                .expect(200);
            const endTime = Date.now();
            const responseTime = endTime - startTime;
            expect(responseTime).toBeLessThan(2000); // Should respond within 2 seconds
            expect(response.body.data).toBeDefined();
        });
    });
});
