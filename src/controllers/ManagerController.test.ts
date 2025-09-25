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
  getDirectReports: jest.fn()
} as any;

const mockAuthService = authService as jest.Mocked<typeof authService>;

describe('ManagerController Integration Tests', () => {
  let app: any;
  let mockUser: User;
  let mockManager: Employee;
  let mockDirectReports: Employee[];

  beforeAll(() => {
    app = createApp();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock user
    mockUser = {
      id: 'user-123',
      email: 'manager@company.com',
      roles: ['MANAGER'] as UserRole[],
      employeeId: 'manager-123',
      isActive: true
    } as User;

    // Mock manager employee
    mockManager = Employee.createNew({
      employeeId: 'MGR001',
      personalInfo: {
        firstName: 'John',
        lastName: 'Manager',
        email: 'manager@company.com'
      },
      jobInfo: {
        jobTitle: 'Engineering Manager',
        department: 'Engineering',
        startDate: new Date('2020-01-01'),
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

    // Mock direct reports
    mockDirectReports = [
      Employee.createNew({
        employeeId: 'EMP001',
        personalInfo: {
          firstName: 'Alice',
          lastName: 'Developer',
          email: 'alice@company.com'
        },
        jobInfo: {
          jobTitle: 'Senior Developer',
          department: 'Engineering',
          managerId: mockManager.id,
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
      }),
      Employee.createNew({
        employeeId: 'EMP002',
        personalInfo: {
          firstName: 'Bob',
          lastName: 'Developer',
          email: 'bob@company.com'
        },
        jobInfo: {
          jobTitle: 'Junior Developer',
          department: 'Engineering',
          managerId: mockManager.id,
          startDate: new Date('2022-01-01'),
          employmentType: 'FULL_TIME',
          location: 'New York'
        },
        status: {
          current: 'ACTIVE',
          effectiveDate: new Date()
        },
        createdBy: '123e4567-e89b-12d3-a456-426614174000',
        updatedBy: '123e4567-e89b-12d3-a456-426614174000'
      })
    ];

    // Setup mocks
    MockedEmployeeService.mockImplementation(() => mockEmployeeService);
    mockAuthService.extractTokenFromHeader.mockReturnValue('valid-token');
    mockAuthService.validateSession.mockResolvedValue(mockUser);
  });

  describe('GET /api/managers/:id/reports', () => {
    it('should return direct reports for a manager', async () => {
      // Arrange
      mockEmployeeService.getDirectReports.mockResolvedValue(mockDirectReports);

      // Act
      const response = await request(app)
        .get(`/api/managers/${mockManager.id}/reports`)
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      // Assert
      expect(response.body).toEqual({
        managerId: mockManager.id,
        directReports: mockDirectReports.map(emp => emp.toJSON())
      });

      expect(mockEmployeeService.getDirectReports).toHaveBeenCalledWith(
        mockManager.id,
        expect.objectContaining({
          userId: mockUser.id,
          role: 'MANAGER'
        })
      );
    });

    it('should return 400 for invalid manager ID format', async () => {
      // Act
      const response = await request(app)
        .get('/api/managers/invalid-id/reports')
        .set('Authorization', 'Bearer valid-token')
        .expect(400);

      // Assert
      expect(response.body.error.code).toBe('INVALID_MANAGER_ID');
      expect(mockEmployeeService.getDirectReports).not.toHaveBeenCalled();
    });

    it('should return 401 when no authentication token provided', async () => {
      // Act
      const response = await request(app)
        .get(`/api/managers/${mockManager.id}/reports`)
        .expect(401);

      // Assert
      expect(response.body.error.code).toBe('MISSING_TOKEN');
      expect(mockEmployeeService.getDirectReports).not.toHaveBeenCalled();
    });

    it('should return 403 when user lacks permission to view reports', async () => {
      // Arrange
      mockEmployeeService.getDirectReports.mockRejectedValue(
        new Error('Insufficient permissions to view direct reports')
      );

      // Act
      const response = await request(app)
        .get(`/api/managers/${mockManager.id}/reports`)
        .set('Authorization', 'Bearer valid-token')
        .expect(403);

      // Assert
      expect(response.body.error.code).toBe('ACCESS_DENIED');
    });

    it('should return 404 when manager not found', async () => {
      // Arrange
      mockEmployeeService.getDirectReports.mockRejectedValue(
        new Error('Manager not found')
      );

      // Act
      const response = await request(app)
        .get(`/api/managers/${mockManager.id}/reports`)
        .set('Authorization', 'Bearer valid-token')
        .expect(404);

      // Assert
      expect(response.body.error.code).toBe('NOT_FOUND');
    });

    it('should return empty array when manager has no direct reports', async () => {
      // Arrange
      mockEmployeeService.getDirectReports.mockResolvedValue([]);

      // Act
      const response = await request(app)
        .get(`/api/managers/${mockManager.id}/reports`)
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      // Assert
      expect(response.body).toEqual({
        managerId: mockManager.id,
        directReports: []
      });
    });

    it('should handle HR_ADMIN accessing any manager reports', async () => {
      // Arrange
      const hrUser = {
        ...mockUser,
        roles: ['HR_ADMIN'] as UserRole[]
      };
      mockAuthService.validateSession.mockResolvedValue(hrUser);
      mockEmployeeService.getDirectReports.mockResolvedValue(mockDirectReports);

      // Act
      const response = await request(app)
        .get(`/api/managers/${mockManager.id}/reports`)
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      // Assert
      expect(response.body.directReports).toHaveLength(2);
      expect(mockEmployeeService.getDirectReports).toHaveBeenCalledWith(
        mockManager.id,
        expect.objectContaining({
          userId: hrUser.id,
          role: 'HR_ADMIN'
        })
      );
    });

    it('should handle service errors gracefully', async () => {
      // Arrange
      mockEmployeeService.getDirectReports.mockRejectedValue(
        new Error('Database connection failed')
      );

      // Act
      const response = await request(app)
        .get(`/api/managers/${mockManager.id}/reports`)
        .set('Authorization', 'Bearer valid-token')
        .expect(500);

      // Assert
      expect(response.body.error.code).toBe('INTERNAL_SERVER_ERROR');
    });
  });

  describe('Manager Access Scenarios', () => {
    it('should allow manager to view their own direct reports', async () => {
      // Arrange
      const managerUser = {
        ...mockUser,
        employeeId: mockManager.id
      };
      mockAuthService.validateSession.mockResolvedValue(managerUser);
      mockEmployeeService.getDirectReports.mockResolvedValue(mockDirectReports);

      // Act
      const response = await request(app)
        .get(`/api/managers/${mockManager.id}/reports`)
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      // Assert
      expect(response.body.directReports).toHaveLength(2);
    });

    it('should prevent manager from viewing other managers reports', async () => {
      // Arrange
      const otherManagerId = 'other-manager-123';
      mockEmployeeService.getDirectReports.mockRejectedValue(
        new Error('Insufficient permissions to view direct reports')
      );

      // Act
      const response = await request(app)
        .get(`/api/managers/${otherManagerId}/reports`)
        .set('Authorization', 'Bearer valid-token')
        .expect(403);

      // Assert
      expect(response.body.error.code).toBe('ACCESS_DENIED');
    });

    it('should prevent non-manager employees from accessing manager endpoints', async () => {
      // Arrange
      const employeeUser = {
        ...mockUser,
        roles: ['EMPLOYEE'] as UserRole[]
      };
      mockAuthService.validateSession.mockResolvedValue(employeeUser);

      // Act
      const response = await request(app)
        .get(`/api/managers/${mockManager.id}/reports`)
        .set('Authorization', 'Bearer valid-token')
        .expect(403);

      // Assert
      expect(response.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');
    });
  });
});