import request from 'supertest';
import { createApp } from '../app';
import { EmployeeService } from '../services/EmployeeService';
import { Employee } from '../models/Employee';
import { authService } from '../services/AuthService';
import { User, UserRole } from '../models/User';

// Mock the services
jest.mock('../services/EmployeeService');
jest.mock('../services/AuthService');
jest.mock('../database/connection');

const MockedEmployeeService = EmployeeService as jest.MockedClass<typeof EmployeeService>;
const mockEmployeeService = {
  getEmployee: jest.fn(),
  updateEmployee: jest.fn()
} as any;

const mockAuthService = authService as jest.Mocked<typeof authService>;

describe('EmployeeSelfServiceController Integration Tests', () => {
  let app: any;
  let mockUser: User;
  let mockEmployee: Employee;

  beforeAll(() => {
    app = createApp();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock user
    mockUser = {
      id: 'user-123',
      email: 'employee@company.com',
      roles: ['EMPLOYEE'] as UserRole[],
      employeeId: 'emp-123',
      isActive: true
    } as User;

    // Mock employee
    mockEmployee = Employee.createNew({
      employeeId: 'EMP001',
      personalInfo: {
        firstName: 'John',
        lastName: 'Doe',
        email: 'employee@company.com',
        phone: '+1-555-0123',
        address: {
          street: '123 Main St',
          city: 'New York',
          state: 'NY',
          zipCode: '10001',
          country: 'USA'
        },
        emergencyContact: {
          name: 'Jane Doe',
          relationship: 'Spouse',
          phone: '+1-555-0124'
        }
      },
      jobInfo: {
        jobTitle: 'Software Developer',
        department: 'Engineering',
        startDate: new Date('2021-01-01'),
        employmentType: 'FULL_TIME',
        location: 'New York'
      },
      status: {
        current: 'ACTIVE',
        effectiveDate: new Date()
      },
      createdBy: '123e4567-e89b-12d3-a456-426614174000',
      updatedBy: '123e4567-e89b-12d3-a456-426614174000'
    });

    // Setup mocks
    MockedEmployeeService.mockImplementation(() => mockEmployeeService);
    mockAuthService.extractTokenFromHeader.mockReturnValue('valid-token');
    mockAuthService.validateSession.mockResolvedValue(mockUser);
  });

  describe('GET /api/employees/me', () => {
    it('should return current user employee profile', async () => {
      // Arrange
      mockEmployeeService.getEmployee.mockResolvedValue(mockEmployee);

      // Act
      const response = await request(app)
        .get('/api/employees/me')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      // Assert
      expect(response.body).toEqual(mockEmployee.toJSON());
      expect(mockEmployeeService.getEmployee).toHaveBeenCalledWith(
        mockUser.employeeId,
        expect.objectContaining({
          userId: mockUser.id,
          role: 'EMPLOYEE'
        })
      );
    });

    it('should return 400 when user has no employee record', async () => {
      // Arrange
      const userWithoutEmployee = { ...mockUser, employeeId: undefined };
      mockAuthService.validateSession.mockResolvedValue(userWithoutEmployee);

      // Act
      const response = await request(app)
        .get('/api/employees/me')
        .set('Authorization', 'Bearer valid-token')
        .expect(400);

      // Assert
      expect(response.body.error.code).toBe('NO_EMPLOYEE_RECORD');
      expect(mockEmployeeService.getEmployee).not.toHaveBeenCalled();
    });

    it('should return 404 when employee profile not found', async () => {
      // Arrange
      mockEmployeeService.getEmployee.mockResolvedValue(null);

      // Act
      const response = await request(app)
        .get('/api/employees/me')
        .set('Authorization', 'Bearer valid-token')
        .expect(404);

      // Assert
      expect(response.body.error.code).toBe('EMPLOYEE_NOT_FOUND');
    });

    it('should return 401 when no authentication token provided', async () => {
      // Act
      const response = await request(app)
        .get('/api/employees/me')
        .expect(401);

      // Assert
      expect(response.body.error.code).toBe('MISSING_TOKEN');
      expect(mockEmployeeService.getEmployee).not.toHaveBeenCalled();
    });
  });

  describe('PUT /api/employees/me', () => {
    it('should update employee profile with allowed fields', async () => {
      // Arrange
      const updateData = {
        personalInfo: {
          phone: '+1-555-9999',
          address: {
            street: '456 Oak Ave',
            city: 'Boston',
            state: 'MA',
            zipCode: '02101',
            country: 'USA'
          },
          emergencyContact: {
            name: 'John Smith',
            relationship: 'Brother',
            phone: '+1-555-8888'
          }
        }
      };

      const updatedEmployee = Employee.createNew({
        ...mockEmployee.toJSON(),
        personalInfo: {
          ...mockEmployee.personalInfo,
          ...updateData.personalInfo
        }
      });

      mockEmployeeService.getEmployee.mockResolvedValue(mockEmployee);
      mockEmployeeService.updateEmployee.mockResolvedValue(updatedEmployee);

      // Act
      const response = await request(app)
        .put('/api/employees/me')
        .set('Authorization', 'Bearer valid-token')
        .send(updateData)
        .expect(200);

      // Assert
      expect(response.body.personalInfo.phone).toBe(updateData.personalInfo.phone);
      expect(response.body.personalInfo.address.street).toBe(updateData.personalInfo.address.street);
      expect(mockEmployeeService.updateEmployee).toHaveBeenCalledWith(
        mockUser.employeeId,
        expect.objectContaining({
          personalInfo: updateData.personalInfo,
          updatedBy: mockUser.id
        }),
        expect.objectContaining({
          userId: mockUser.id,
          role: 'EMPLOYEE'
        })
      );
    });

    it('should return 400 for invalid update data', async () => {
      // Arrange
      const invalidData = {
        personalInfo: {
          phone: 'invalid-phone-format'
        }
      };

      // Act
      const response = await request(app)
        .put('/api/employees/me')
        .set('Authorization', 'Bearer valid-token')
        .send(invalidData)
        .expect(400);

      // Assert
      expect(response.body.error.code).toBe('INVALID_REQUEST_DATA');
      expect(mockEmployeeService.updateEmployee).not.toHaveBeenCalled();
    });

    it('should return 400 when no fields provided', async () => {
      // Act
      const response = await request(app)
        .put('/api/employees/me')
        .set('Authorization', 'Bearer valid-token')
        .send({})
        .expect(400);

      // Assert
      expect(response.body.error.code).toBe('INVALID_REQUEST_DATA');
      expect(mockEmployeeService.updateEmployee).not.toHaveBeenCalled();
    });

    it('should return 400 when user has no employee record', async () => {
      // Arrange
      const userWithoutEmployee = { ...mockUser, employeeId: undefined };
      mockAuthService.validateSession.mockResolvedValue(userWithoutEmployee);

      // Act
      const response = await request(app)
        .put('/api/employees/me')
        .set('Authorization', 'Bearer valid-token')
        .send({ personalInfo: { phone: '+1-555-9999' } })
        .expect(400);

      // Assert
      expect(response.body.error.code).toBe('NO_EMPLOYEE_RECORD');
      expect(mockEmployeeService.updateEmployee).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/employees/me/change-requests', () => {
    it('should submit change request for restricted fields', async () => {
      // Arrange
      const changeRequestData = {
        requestType: 'PERSONAL_INFO',
        requestedChanges: {
          firstName: 'Jane',
          email: 'jane.doe@company.com'
        },
        reason: 'Legal name change after marriage'
      };

      mockEmployeeService.getEmployee.mockResolvedValue(mockEmployee);

      // Act
      const response = await request(app)
        .post('/api/employees/me/change-requests')
        .set('Authorization', 'Bearer valid-token')
        .send(changeRequestData)
        .expect(201);

      // Assert
      expect(response.body.message).toBe('Change request submitted successfully');
      expect(response.body.changeRequest).toMatchObject({
        requestType: changeRequestData.requestType,
        status: 'PENDING',
        reason: changeRequestData.reason
      });
      expect(response.body.changeRequest.id).toBeDefined();
    });

    it('should submit job info change request', async () => {
      // Arrange
      const changeRequestData = {
        requestType: 'JOB_INFO',
        requestedChanges: {
          jobTitle: 'Senior Software Developer',
          department: 'Product Engineering'
        },
        reason: 'Promotion and department transfer'
      };

      mockEmployeeService.getEmployee.mockResolvedValue(mockEmployee);

      // Act
      const response = await request(app)
        .post('/api/employees/me/change-requests')
        .set('Authorization', 'Bearer valid-token')
        .send(changeRequestData)
        .expect(201);

      // Assert
      expect(response.body.changeRequest.requestType).toBe('JOB_INFO');
      expect(response.body.changeRequest.status).toBe('PENDING');
    });

    it('should return 400 for invalid change request data', async () => {
      // Arrange
      const invalidData = {
        requestType: 'INVALID_TYPE',
        requestedChanges: {},
        reason: 'Too short'
      };

      // Act
      const response = await request(app)
        .post('/api/employees/me/change-requests')
        .set('Authorization', 'Bearer valid-token')
        .send(invalidData)
        .expect(400);

      // Assert
      expect(response.body.error.code).toBe('INVALID_CHANGE_REQUEST');
    });

    it('should return 400 when reason is too short', async () => {
      // Arrange
      const invalidData = {
        requestType: 'PERSONAL_INFO',
        requestedChanges: { firstName: 'Jane' },
        reason: 'Short'
      };

      // Act
      const response = await request(app)
        .post('/api/employees/me/change-requests')
        .set('Authorization', 'Bearer valid-token')
        .send(invalidData)
        .expect(400);

      // Assert
      expect(response.body.error.code).toBe('INVALID_CHANGE_REQUEST');
    });

    it('should return 404 when employee profile not found', async () => {
      // Arrange
      const changeRequestData = {
        requestType: 'PERSONAL_INFO',
        requestedChanges: { firstName: 'Jane' },
        reason: 'Legal name change after marriage'
      };

      mockEmployeeService.getEmployee.mockResolvedValue(null);

      // Act
      const response = await request(app)
        .post('/api/employees/me/change-requests')
        .set('Authorization', 'Bearer valid-token')
        .send(changeRequestData)
        .expect(404);

      // Assert
      expect(response.body.error.code).toBe('EMPLOYEE_NOT_FOUND');
    });
  });

  describe('GET /api/employees/me/change-requests', () => {
    it('should return empty array when no change requests exist', async () => {
      // Act
      const response = await request(app)
        .get('/api/employees/me/change-requests')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      // Assert
      expect(response.body.changeRequests).toEqual([]);
    });

    it('should return user change requests sorted by date', async () => {
      // Arrange - First submit some change requests
      const changeRequestData1 = {
        requestType: 'PERSONAL_INFO',
        requestedChanges: { firstName: 'Jane' },
        reason: 'Legal name change after marriage'
      };

      const changeRequestData2 = {
        requestType: 'JOB_INFO',
        requestedChanges: { jobTitle: 'Senior Developer' },
        reason: 'Promotion request'
      };

      mockEmployeeService.getEmployee.mockResolvedValue(mockEmployee);

      // Submit first request
      await request(app)
        .post('/api/employees/me/change-requests')
        .set('Authorization', 'Bearer valid-token')
        .send(changeRequestData1);

      // Submit second request
      await request(app)
        .post('/api/employees/me/change-requests')
        .set('Authorization', 'Bearer valid-token')
        .send(changeRequestData2);

      // Act - Get all requests
      const response = await request(app)
        .get('/api/employees/me/change-requests')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      // Assert
      expect(response.body.changeRequests).toHaveLength(2);
      expect(response.body.changeRequests[0].requestType).toBe('JOB_INFO'); // Most recent first
      expect(response.body.changeRequests[1].requestType).toBe('PERSONAL_INFO');
    });

    it('should return 400 when user has no employee record', async () => {
      // Arrange
      const userWithoutEmployee = { ...mockUser, employeeId: undefined };
      mockAuthService.validateSession.mockResolvedValue(userWithoutEmployee);

      // Act
      const response = await request(app)
        .get('/api/employees/me/change-requests')
        .set('Authorization', 'Bearer valid-token')
        .expect(400);

      // Assert
      expect(response.body.error.code).toBe('NO_EMPLOYEE_RECORD');
    });
  });

  describe('GET /api/employees/me/change-requests/:requestId', () => {
    it('should return specific change request details', async () => {
      // Arrange - First submit a change request
      const changeRequestData = {
        requestType: 'PERSONAL_INFO',
        requestedChanges: { firstName: 'Jane' },
        reason: 'Legal name change after marriage'
      };

      mockEmployeeService.getEmployee.mockResolvedValue(mockEmployee);

      const submitResponse = await request(app)
        .post('/api/employees/me/change-requests')
        .set('Authorization', 'Bearer valid-token')
        .send(changeRequestData);

      const requestId = submitResponse.body.changeRequest.id;

      // Act
      const response = await request(app)
        .get(`/api/employees/me/change-requests/${requestId}`)
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      // Assert
      expect(response.body.id).toBe(requestId);
      expect(response.body.requestType).toBe('PERSONAL_INFO');
      expect(response.body.requestedChanges.firstName).toBe('Jane');
      expect(response.body.status).toBe('PENDING');
    });

    it('should return 400 for invalid request ID format', async () => {
      // Act
      const response = await request(app)
        .get('/api/employees/me/change-requests/invalid-id')
        .set('Authorization', 'Bearer valid-token')
        .expect(400);

      // Assert
      expect(response.body.error.code).toBe('INVALID_REQUEST_ID');
    });

    it('should return 404 for non-existent change request', async () => {
      // Act
      const response = await request(app)
        .get('/api/employees/me/change-requests/cr_1234567890_abcdefghi')
        .set('Authorization', 'Bearer valid-token')
        .expect(404);

      // Assert
      expect(response.body.error.code).toBe('CHANGE_REQUEST_NOT_FOUND');
    });

    it('should return 400 when user has no employee record', async () => {
      // Arrange
      const userWithoutEmployee = { ...mockUser, employeeId: undefined };
      mockAuthService.validateSession.mockResolvedValue(userWithoutEmployee);

      // Act
      const response = await request(app)
        .get('/api/employees/me/change-requests/cr_1234567890_abcdefghi')
        .set('Authorization', 'Bearer valid-token')
        .expect(400);

      // Assert
      expect(response.body.error.code).toBe('NO_EMPLOYEE_RECORD');
    });
  });

  describe('Employee Access Scenarios', () => {
    it('should prevent non-employee users from accessing self-service endpoints', async () => {
      // Arrange
      const viewerUser = {
        ...mockUser,
        roles: ['VIEWER'] as UserRole[]
      };
      mockAuthService.validateSession.mockResolvedValue(viewerUser);

      // Act
      const response = await request(app)
        .get('/api/employees/me')
        .set('Authorization', 'Bearer valid-token')
        .expect(403);

      // Assert
      expect(response.body.error.code).toBe('INSUFFICIENT_ROLE');
    });

    it('should allow managers to access self-service endpoints', async () => {
      // Arrange
      const managerUser = {
        ...mockUser,
        roles: ['MANAGER', 'EMPLOYEE'] as UserRole[]
      };
      mockAuthService.validateSession.mockResolvedValue(managerUser);
      mockEmployeeService.getEmployee.mockResolvedValue(mockEmployee);

      // Act
      const response = await request(app)
        .get('/api/employees/me')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      // Assert
      expect(response.body).toEqual(mockEmployee.toJSON());
    });

    it('should allow HR_ADMIN to access self-service endpoints', async () => {
      // Arrange
      const hrUser = {
        ...mockUser,
        roles: ['HR_ADMIN', 'EMPLOYEE'] as UserRole[]
      };
      mockAuthService.validateSession.mockResolvedValue(hrUser);
      mockEmployeeService.getEmployee.mockResolvedValue(mockEmployee);

      // Act
      const response = await request(app)
        .get('/api/employees/me')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      // Assert
      expect(response.body).toEqual(mockEmployee.toJSON());
    });
  });
});