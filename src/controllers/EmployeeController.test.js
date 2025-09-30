import request from 'supertest';
import { createApp } from '../app';
import { database } from '../database/connection';
import { EmployeeService } from '../services/EmployeeService';
// Mock the services and middleware
jest.mock('../services/EmployeeService');
jest.mock('../services/AuthService');
jest.mock('../database/connection');
jest.mock('../middleware/auth', () => ({
    authenticate: jest.fn((req, _res, next) => {
        // Mock successful authentication
        req.user = {
            id: 'user-123',
            email: 'test@example.com',
            roles: ['HR_ADMIN'],
            employeeId: 'emp-123',
            isActive: true
        };
        req.permissionContext = {
            userId: 'user-123',
            roles: ['HR_ADMIN'],
            employeeId: 'emp-123'
        };
        next();
    }),
    authorize: jest.fn(() => (_req, _res, next) => next()),
    canAccessEmployee: jest.fn((_req, _res, next) => next()),
    canModifyEmployee: jest.fn((_req, _res, next) => next()),
    filterEmployeeFields: jest.fn((_req, _res, next) => next())
}));
jest.mock('../middleware/validation', () => ({
    validateRequest: jest.fn(() => (_req, _res, next) => next())
}));
describe('EmployeeController Integration Tests', () => {
    let app;
    let mockEmployeeService;
    let mockAuthService;
    let mockUser;
    let mockEmployee;
    beforeAll(() => {
        app = createApp();
    });
    beforeEach(() => {
        // Reset mocks
        jest.clearAllMocks();
        // Create mock instances
        mockEmployeeService = {
            searchEmployees: jest.fn(),
            createEmployee: jest.fn(),
            getEmployee: jest.fn(),
            updateEmployee: jest.fn(),
            updateEmployeeStatus: jest.fn(),
            getEmployeeStatusHistory: jest.fn()
        };
        mockAuthService = {
            extractTokenFromHeader: jest.fn(),
            validateSession: jest.fn()
        };
        // Override the constructor to return our mock
        EmployeeService.mockImplementation(() => mockEmployeeService);
        // Mock user for authentication
        mockUser = {
            id: 'user-123',
            email: 'test@example.com',
            roles: ['HR_ADMIN'],
            employeeId: 'emp-123',
            isActive: true
        };
        // Mock employee data
        mockEmployee = {
            id: '550e8400-e29b-41d4-a716-446655440000', // Valid UUID
            employeeId: 'EMP-001',
            personalInfo: {
                firstName: 'John',
                lastName: 'Doe',
                email: 'john.doe@company.com',
                phone: '+1-555-0123'
            },
            jobInfo: {
                jobTitle: 'Software Engineer',
                department: 'Engineering',
                startDate: new Date('2023-01-15'),
                employmentType: 'FULL_TIME',
                location: 'New York'
            },
            status: {
                current: 'ACTIVE',
                effectiveDate: new Date('2023-01-15'),
                reason: 'New hire'
            },
            createdAt: new Date(),
            updatedAt: new Date(),
            createdBy: 'user-123',
            updatedBy: 'user-123',
            toJSON: jest.fn().mockReturnValue({
                id: '550e8400-e29b-41d4-a716-446655440000',
                employeeId: 'EMP-001',
                personalInfo: {
                    firstName: 'John',
                    lastName: 'Doe',
                    email: 'john.doe@company.com'
                }
            })
        };
        // Mock authentication
        mockAuthService.extractTokenFromHeader = jest.fn().mockReturnValue('valid-token');
        mockAuthService.validateSession = jest.fn().mockResolvedValue(mockUser);
        // Mock database connection
        database.connect.mockResolvedValue(undefined);
    });
    describe('GET /api/employees', () => {
        it('should return paginated employee list', async () => {
            const mockResult = {
                data: [mockEmployee],
                pagination: {
                    page: 1,
                    limit: 20,
                    total: 1,
                    totalPages: 1,
                    hasNext: false,
                    hasPrev: false
                }
            };
            mockEmployeeService.searchEmployees.mockResolvedValue(mockResult);
            const response = await request(app)
                .get('/api/employees')
                .set('Authorization', 'Bearer valid-token')
                .expect(200);
            expect(response.body).toEqual({
                data: [mockEmployee.toJSON()],
                pagination: mockResult.pagination
            });
            expect(mockEmployeeService.searchEmployees).toHaveBeenCalledWith(expect.any(Object), expect.any(Object), expect.any(Object));
        });
        it('should handle search parameters', async () => {
            const mockResult = {
                data: [],
                pagination: {
                    page: 1,
                    limit: 10,
                    total: 0,
                    totalPages: 0,
                    hasNext: false,
                    hasPrev: false
                }
            };
            mockEmployeeService.searchEmployees = jest.fn().mockResolvedValue(mockResult);
            await request(app)
                .get('/api/employees')
                .query({
                search: 'John',
                department: 'Engineering',
                status: 'ACTIVE',
                page: 1,
                limit: 10
            })
                .set('Authorization', 'Bearer valid-token')
                .expect(200);
            expect(mockEmployeeService.searchEmployees).toHaveBeenCalledWith(expect.objectContaining({
                search: 'John',
                department: 'Engineering',
                status: 'ACTIVE'
            }), expect.objectContaining({
                page: 1,
                limit: 10
            }), expect.any(Object));
        });
        it('should return 400 for invalid query parameters', async () => {
            await request(app)
                .get('/api/employees')
                .query({
                page: 0, // Invalid page number
                limit: 200 // Exceeds maximum
            })
                .set('Authorization', 'Bearer valid-token')
                .expect(400);
        });
        it('should return 401 without authentication', async () => {
            await request(app)
                .get('/api/employees')
                .expect(401);
        });
    });
    describe('POST /api/employees', () => {
        const validEmployeeData = {
            employeeId: 'EMP-002',
            personalInfo: {
                firstName: 'Jane',
                lastName: 'Smith',
                email: 'jane.smith@company.com',
                phone: '+1-555-0124'
            },
            jobInfo: {
                jobTitle: 'Product Manager',
                department: 'Product',
                startDate: '2023-02-01',
                employmentType: 'FULL_TIME',
                location: 'San Francisco'
            }
        };
        it('should create a new employee', async () => {
            mockEmployeeService.createEmployee = jest.fn().mockResolvedValue(mockEmployee);
            const response = await request(app)
                .post('/api/employees')
                .set('Authorization', 'Bearer valid-token')
                .send(validEmployeeData)
                .expect(201);
            expect(response.body).toEqual(mockEmployee.toJSON());
            expect(mockEmployeeService.createEmployee).toHaveBeenCalledWith(expect.objectContaining({
                ...validEmployeeData,
                createdBy: mockUser.id
            }), expect.any(Object));
        });
        it('should return 400 for invalid employee data', async () => {
            const invalidData = {
                ...validEmployeeData,
                personalInfo: {
                    ...validEmployeeData.personalInfo,
                    email: 'invalid-email' // Invalid email format
                }
            };
            await request(app)
                .post('/api/employees')
                .set('Authorization', 'Bearer valid-token')
                .send(invalidData)
                .expect(400);
        });
        it('should return 400 for missing required fields', async () => {
            const incompleteData = {
                employeeId: 'EMP-002'
                // Missing personalInfo and jobInfo
            };
            await request(app)
                .post('/api/employees')
                .set('Authorization', 'Bearer valid-token')
                .send(incompleteData)
                .expect(400);
        });
        it('should return 409 for duplicate employee', async () => {
            const duplicateError = new Error('Employee with this email already exists');
            mockEmployeeService.createEmployee = jest.fn().mockRejectedValue(duplicateError);
            await request(app)
                .post('/api/employees')
                .set('Authorization', 'Bearer valid-token')
                .send(validEmployeeData)
                .expect(409);
        });
    });
    describe('GET /api/employees/:id', () => {
        it('should return employee by ID', async () => {
            mockEmployeeService.getEmployee = jest.fn().mockResolvedValue(mockEmployee);
            const response = await request(app)
                .get(`/api/employees/${mockEmployee.id}`)
                .set('Authorization', 'Bearer valid-token')
                .expect(200);
            expect(response.body).toEqual(mockEmployee.toJSON());
            expect(mockEmployeeService.getEmployee).toHaveBeenCalledWith(mockEmployee.id, expect.any(Object));
        });
        it('should return 404 for non-existent employee', async () => {
            mockEmployeeService.getEmployee = jest.fn().mockResolvedValue(null);
            await request(app)
                .get('/api/employees/non-existent-id')
                .set('Authorization', 'Bearer valid-token')
                .expect(404);
        });
        it('should return 400 for invalid employee ID format', async () => {
            await request(app)
                .get('/api/employees/invalid-uuid')
                .set('Authorization', 'Bearer valid-token')
                .expect(400);
        });
    });
    describe('PUT /api/employees/:id', () => {
        const updateData = {
            personalInfo: {
                phone: '+1-555-9999'
            },
            jobInfo: {
                jobTitle: 'Senior Software Engineer'
            }
        };
        it('should update employee', async () => {
            const updatedEmployee = { ...mockEmployee, ...updateData };
            mockEmployeeService.updateEmployee = jest.fn().mockResolvedValue(updatedEmployee);
            await request(app)
                .put(`/api/employees/${mockEmployee.id}`)
                .set('Authorization', 'Bearer valid-token')
                .send(updateData)
                .expect(200);
            expect(mockEmployeeService.updateEmployee).toHaveBeenCalledWith(mockEmployee.id, expect.objectContaining({
                ...updateData,
                updatedBy: mockUser.id
            }), expect.any(Object));
        });
        it('should return 400 for invalid update data', async () => {
            const invalidUpdateData = {
                personalInfo: {
                    email: 'invalid-email'
                }
            };
            await request(app)
                .put(`/api/employees/${mockEmployee.id}`)
                .set('Authorization', 'Bearer valid-token')
                .send(invalidUpdateData)
                .expect(400);
        });
        it('should return 400 when no fields provided', async () => {
            await request(app)
                .put(`/api/employees/${mockEmployee.id}`)
                .set('Authorization', 'Bearer valid-token')
                .send({})
                .expect(400);
        });
    });
    describe('DELETE /api/employees/:id', () => {
        const terminationData = {
            reason: 'RESIGNATION',
            effectiveDate: '2023-12-31',
            notes: 'Voluntary resignation'
        };
        it('should terminate employee (soft delete)', async () => {
            const terminatedEmployee = {
                ...mockEmployee,
                status: { current: 'TERMINATED', effectiveDate: new Date(), reason: 'RESIGNATION' }
            };
            mockEmployeeService.updateEmployeeStatus = jest.fn().mockResolvedValue(terminatedEmployee);
            const response = await request(app)
                .delete(`/api/employees/${mockEmployee.id}`)
                .set('Authorization', 'Bearer valid-token')
                .send(terminationData)
                .expect(200);
            expect(response.body.message).toBe('Employee terminated successfully');
            expect(mockEmployeeService.updateEmployeeStatus).toHaveBeenCalledWith(mockEmployee.id, 'TERMINATED', expect.any(Date), terminationData.reason, terminationData.notes, expect.any(Object));
        });
        it('should return 400 for invalid termination reason', async () => {
            const invalidTerminationData = {
                reason: 'INVALID_REASON',
                effectiveDate: '2023-12-31'
            };
            await request(app)
                .delete(`/api/employees/${mockEmployee.id}`)
                .set('Authorization', 'Bearer valid-token')
                .send(invalidTerminationData)
                .expect(400);
        });
        it('should return 400 for missing termination reason', async () => {
            await request(app)
                .delete(`/api/employees/${mockEmployee.id}`)
                .set('Authorization', 'Bearer valid-token')
                .send({})
                .expect(400);
        });
    });
    describe('GET /api/employees/:id/history', () => {
        it('should return employee status history', async () => {
            const mockHistory = [
                {
                    id: 'history-1',
                    previousStatus: null,
                    newStatus: 'ACTIVE',
                    reason: 'New hire',
                    effectiveDate: '2023-01-15T00:00:00.000Z',
                    changedBy: 'user-123',
                    changedAt: '2023-01-15T09:00:00.000Z'
                }
            ];
            mockEmployeeService.getEmployeeStatusHistory = jest.fn().mockResolvedValue(mockHistory);
            const response = await request(app)
                .get(`/api/employees/${mockEmployee.id}/history`)
                .set('Authorization', 'Bearer valid-token')
                .expect(200);
            expect(response.body).toEqual({
                employeeId: mockEmployee.id,
                history: mockHistory
            });
            expect(mockEmployeeService.getEmployeeStatusHistory).toHaveBeenCalledWith(mockEmployee.id, expect.any(Object));
        });
        it('should return empty history for new employee', async () => {
            mockEmployeeService.getEmployeeStatusHistory = jest.fn().mockResolvedValue([]);
            const response = await request(app)
                .get(`/api/employees/${mockEmployee.id}/history`)
                .set('Authorization', 'Bearer valid-token')
                .expect(200);
            expect(response.body.history).toEqual([]);
        });
    });
    describe('Error Handling', () => {
        it('should handle service errors gracefully', async () => {
            mockEmployeeService.searchEmployees = jest.fn().mockRejectedValue(new Error('Database connection failed'));
            await request(app)
                .get('/api/employees')
                .set('Authorization', 'Bearer valid-token')
                .expect(500);
        });
        it('should handle authentication errors', async () => {
            mockAuthService.validateSession = jest.fn().mockRejectedValue(new Error('Invalid token'));
            await request(app)
                .get('/api/employees')
                .set('Authorization', 'Bearer invalid-token')
                .expect(401);
        });
        it('should handle permission errors', async () => {
            mockEmployeeService.getEmployee = jest.fn().mockRejectedValue(new Error('Insufficient permissions to view this employee'));
            await request(app)
                .get(`/api/employees/${mockEmployee.id}`)
                .set('Authorization', 'Bearer valid-token')
                .expect(403);
        });
    });
});
