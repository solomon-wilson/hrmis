import { ReportService, ReportFilters } from './ReportService';
import { EmployeeRepository } from '../database/repositories/employee';
import { AuditLogRepository } from '../database/repositories/audit';
import { Employee } from '../models/Employee';
import { ValidationError } from '../utils/validation';
import { PermissionContext } from './EmployeeService';

// Mock the database connection
jest.mock('../database/connection', () => ({
  database: {
    getClient: jest.fn().mockResolvedValue({
      query: jest.fn(),
      release: jest.fn()
    })
  }
}));

// Mock the repositories
jest.mock('../database/repositories/employee');
jest.mock('../database/repositories/audit');

describe('ReportService', () => {
  let reportService: ReportService;
  let mockEmployeeRepository: jest.Mocked<EmployeeRepository>;
  let mockAuditLogRepository: jest.Mocked<AuditLogRepository>;

  const mockHRAdminContext: PermissionContext = {
    userId: '550e8400-e29b-41d4-a716-446655440000',
    role: 'HR_ADMIN'
  };

  const mockManagerContext: PermissionContext = {
    userId: '550e8400-e29b-41d4-a716-446655440003',
    role: 'MANAGER',
    managedEmployeeIds: ['550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440002']
  };

  const mockEmployeeContext: PermissionContext = {
    userId: '550e8400-e29b-41d4-a716-446655440004',
    role: 'EMPLOYEE'
  };

  const mockEmployee1 = Employee.fromJSON({
    id: '550e8400-e29b-41d4-a716-446655440001',
    employeeId: 'EMP001',
    personalInfo: {
      firstName: 'John',
      lastName: 'Doe',
      email: 'john.doe@company.com'
    },
    jobInfo: {
      jobTitle: 'Software Engineer',
      department: 'Engineering',
      startDate: new Date('2022-01-01'),
      employmentType: 'FULL_TIME',
      location: 'New York'
    },
    status: {
      current: 'ACTIVE',
      effectiveDate: new Date('2022-01-01')
    },
    createdAt: new Date('2022-01-01'),
    updatedAt: new Date('2022-01-01'),
    createdBy: '550e8400-e29b-41d4-a716-446655440000',
    updatedBy: '550e8400-e29b-41d4-a716-446655440000'
  });

  const mockEmployee2 = Employee.fromJSON({
    id: '550e8400-e29b-41d4-a716-446655440002',
    employeeId: 'EMP002',
    personalInfo: {
      firstName: 'Jane',
      lastName: 'Smith',
      email: 'jane.smith@company.com'
    },
    jobInfo: {
      jobTitle: 'Product Manager',
      department: 'Product',
      startDate: new Date('2021-06-01'),
      employmentType: 'FULL_TIME',
      location: 'San Francisco'
    },
    status: {
      current: 'ACTIVE',
      effectiveDate: new Date('2021-06-01')
    },
    createdAt: new Date('2021-06-01'),
    updatedAt: new Date('2021-06-01'),
    createdBy: '550e8400-e29b-41d4-a716-446655440000',
    updatedBy: '550e8400-e29b-41d4-a716-446655440000'
  });

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockEmployeeRepository = new EmployeeRepository() as jest.Mocked<EmployeeRepository>;
    mockAuditLogRepository = new AuditLogRepository() as jest.Mocked<AuditLogRepository>;
    
    reportService = new ReportService();
    (reportService as any).employeeRepository = mockEmployeeRepository;
    (reportService as any).auditLogRepository = mockAuditLogRepository;
  });

  describe('generateEmployeeRosterReport', () => {
    it('should generate employee roster report for HR admin', async () => {
      const filters: ReportFilters = {
        department: 'Engineering',
        status: 'ACTIVE'
      };

      mockEmployeeRepository.findAll.mockResolvedValue({
        data: [mockEmployee1, mockEmployee2],
        pagination: {
          page: 1,
          limit: 10000,
          total: 2,
          totalPages: 1,
          hasNext: false,
          hasPrev: false
        }
      });

      mockAuditLogRepository.logReportGeneration.mockResolvedValue({} as any);

      const result = await reportService.generateEmployeeRosterReport(filters, mockHRAdminContext);

      expect(result.employees).toHaveLength(2);
      expect(result.totalCount).toBe(2);
      expect(result.filters).toEqual(filters);
      expect(result.generatedBy).toBe(mockHRAdminContext.userId);
      expect(mockAuditLogRepository.logReportGeneration).toHaveBeenCalledWith(
        'EMPLOYEE_ROSTER',
        filters,
        2,
        mockHRAdminContext.userId,
        { action: 'report_generated' },
        expect.any(Object)
      );
    });

    it('should generate employee roster report for manager with filtered data', async () => {
      const filters: ReportFilters = {
        status: 'ACTIVE'
      };

      mockEmployeeRepository.findAll.mockResolvedValue({
        data: [mockEmployee1],
        pagination: {
          page: 1,
          limit: 10000,
          total: 1,
          totalPages: 1,
          hasNext: false,
          hasPrev: false
        }
      });

      mockAuditLogRepository.logReportGeneration.mockResolvedValue({} as any);

      const result = await reportService.generateEmployeeRosterReport(filters, mockManagerContext);

      expect(result.employees).toHaveLength(1);
      expect(result.totalCount).toBe(1);
      expect(mockEmployeeRepository.findAll).toHaveBeenCalledWith({
        filters: expect.objectContaining({
          status: 'ACTIVE',
          employee_ids: ['550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440002']
        }),
        pagination: { page: 1, limit: 10000 }
      }, expect.any(Object));
    });

    it('should throw error for insufficient permissions', async () => {
      const filters: ReportFilters = {};

      await expect(
        reportService.generateEmployeeRosterReport(filters, mockEmployeeContext)
      ).rejects.toThrow(ValidationError);
      await expect(
        reportService.generateEmployeeRosterReport(filters, mockEmployeeContext)
      ).rejects.toThrow('Insufficient permissions to generate reports');
    });

    it('should filter sensitive data for managers', async () => {
      const filters: ReportFilters = {};
      
      const employeeWithSalary = Employee.fromJSON({
        ...mockEmployee1.toJSON(),
        jobInfo: {
          ...mockEmployee1.toJSON().jobInfo,
          salary: 100000
        },
        personalInfo: {
          ...mockEmployee1.toJSON().personalInfo,
          socialSecurityNumber: '123-45-6789'
        }
      });

      mockEmployeeRepository.findAll.mockResolvedValue({
        data: [employeeWithSalary],
        pagination: {
          page: 1,
          limit: 10000,
          total: 1,
          totalPages: 1,
          hasNext: false,
          hasPrev: false
        }
      });

      mockAuditLogRepository.logReportGeneration.mockResolvedValue({} as any);

      const result = await reportService.generateEmployeeRosterReport(filters, mockManagerContext);

      expect(result.employees[0].jobInfo.salary).toBeUndefined();
      expect(result.employees[0].personalInfo.socialSecurityNumber).toBeUndefined();
    });
  });

  describe('generateDepartmentBreakdownReport', () => {
    it('should generate department breakdown report for HR admin', async () => {
      const filters: ReportFilters = {};

      // Mock the executeQuery method for department statistics

      (reportService as any).executeQuery = jest.fn().mockResolvedValue({
        rows: [
          {
            department_id: 'dept1',
            department_name: 'Engineering',
            total_employees: '5',
            active_employees: '4',
            inactive_employees: '0',
            terminated_employees: '1',
            on_leave_employees: '0',
            full_time_employees: '5',
            part_time_employees: '0',
            contract_employees: '0',
            intern_employees: '0',
            avg_years_of_service: '2.5'
          }
        ]
      });

      mockAuditLogRepository.logReportGeneration.mockResolvedValue({} as any);

      const result = await reportService.generateDepartmentBreakdownReport(filters, mockHRAdminContext);

      expect(result.departments).toHaveLength(1);
      expect(result.departments[0].departmentName).toBe('Engineering');
      expect(result.departments[0].totalEmployees).toBe(5);
      expect(result.departments[0].activeEmployees).toBe(4);
      expect(result.totalEmployees).toBe(5);
    });

    it('should throw error for insufficient permissions', async () => {
      const filters: ReportFilters = {};

      await expect(
        reportService.generateDepartmentBreakdownReport(filters, mockEmployeeContext)
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('generateWorkforceAnalytics', () => {
    it('should generate comprehensive workforce analytics for HR admin', async () => {
      const filters: ReportFilters = {};

      const mockEmployees = [
        mockEmployee1,
        mockEmployee2,
        Employee.fromJSON({
          ...mockEmployee1.toJSON(),
          id: '550e8400-e29b-41d4-a716-446655440003',
          status: { current: 'TERMINATED', effectiveDate: new Date(), reason: 'Resignation' }
        })
      ];

      mockEmployeeRepository.findAll.mockResolvedValue({
        data: mockEmployees,
        pagination: {
          page: 1,
          limit: 10000,
          total: 3,
          totalPages: 1,
          hasNext: false,
          hasPrev: false
        }
      });

      // Mock department summaries
      (reportService as any).getDepartmentSummaries = jest.fn().mockResolvedValue([
        {
          departmentId: 'dept1',
          departmentName: 'Engineering',
          totalEmployees: 2,
          activeEmployees: 1,
          inactiveEmployees: 0,
          terminatedEmployees: 1,
          onLeaveEmployees: 0,
          employmentTypeBreakdown: {
            fullTime: 2,
            partTime: 0,
            contract: 0,
            intern: 0
          },
          averageYearsOfService: 2.0
        }
      ]);

      mockAuditLogRepository.logReportGeneration.mockResolvedValue({} as any);

      const result = await reportService.generateWorkforceAnalytics(filters, mockHRAdminContext);

      expect(result.totalEmployees).toBe(3);
      expect(result.statusBreakdown.active).toBe(2);
      expect(result.statusBreakdown.terminated).toBe(1);
      expect(result.employmentTypeBreakdown.fullTime).toBe(3);
      expect(result.departmentBreakdown).toHaveLength(1);
    });

    it('should throw error for non-HR admin users', async () => {
      const filters: ReportFilters = {};

      await expect(
        reportService.generateWorkforceAnalytics(filters, mockManagerContext)
      ).rejects.toThrow(ValidationError);
      await expect(
        reportService.generateWorkforceAnalytics(filters, mockManagerContext)
      ).rejects.toThrow('Insufficient permissions to generate workforce analytics');
    });

    it('should calculate correct averages and counts', async () => {
      const filters: ReportFilters = {};

      // Create employees with different start dates
      const oldEmployee = Employee.fromJSON({
        ...mockEmployee1.toJSON(),
        jobInfo: {
          ...mockEmployee1.toJSON().jobInfo,
          startDate: new Date('2020-01-01') // 4+ years ago
        }
      });

      const newEmployee = Employee.fromJSON({
        ...mockEmployee2.toJSON(),
        jobInfo: {
          ...mockEmployee2.toJSON().jobInfo,
          startDate: new Date() // Recent hire
        }
      });

      mockEmployeeRepository.findAll.mockResolvedValue({
        data: [oldEmployee, newEmployee],
        pagination: {
          page: 1,
          limit: 10000,
          total: 2,
          totalPages: 1,
          hasNext: false,
          hasPrev: false
        }
      });

      (reportService as any).getDepartmentSummaries = jest.fn().mockResolvedValue([]);
      mockAuditLogRepository.logReportGeneration.mockResolvedValue({} as any);

      const result = await reportService.generateWorkforceAnalytics(filters, mockHRAdminContext);

      expect(result.totalEmployees).toBe(2);
      expect(result.averageYearsOfService).toBeGreaterThan(0);
      expect(result.newHiresLastMonth).toBeGreaterThanOrEqual(0);
    });
  });

  describe('convertFiltersToSearchCriteria', () => {
    it('should convert report filters to search criteria', () => {
      const filters: ReportFilters = {
        department: 'Engineering',
        status: 'ACTIVE',
        employmentType: 'FULL_TIME',
        startDateFrom: new Date('2022-01-01'),
        startDateTo: new Date('2023-01-01'),
        managerId: 'manager-id'
      };

      const result = (reportService as any).convertFiltersToSearchCriteria(filters);

      expect(result).toEqual({
        department_id: 'Engineering',
        status: 'ACTIVE',
        employment_type: 'FULL_TIME',
        start_date_from: filters.startDateFrom,
        start_date_to: filters.startDateTo,
        manager_id: 'manager-id'
      });
    });
  });

  describe('filterEmployeeDataForReport', () => {
    it('should not filter data for HR admin', () => {
      const employeeWithSensitiveData = Employee.fromJSON({
        ...mockEmployee1.toJSON(),
        jobInfo: {
          ...mockEmployee1.toJSON().jobInfo,
          salary: 100000
        },
        personalInfo: {
          ...mockEmployee1.toJSON().personalInfo,
          socialSecurityNumber: '123-45-6789'
        }
      });

      const result = (reportService as any).filterEmployeeDataForReport(
        employeeWithSensitiveData,
        mockHRAdminContext
      );

      expect(result.jobInfo.salary).toBe(100000);
      expect(result.personalInfo.socialSecurityNumber).toBe('123-45-6789');
    });

    it('should filter salary and SSN for managers', () => {
      const employeeWithSensitiveData = Employee.fromJSON({
        ...mockEmployee1.toJSON(),
        jobInfo: {
          ...mockEmployee1.toJSON().jobInfo,
          salary: 100000
        },
        personalInfo: {
          ...mockEmployee1.toJSON().personalInfo,
          socialSecurityNumber: '123-45-6789'
        }
      });

      const result = (reportService as any).filterEmployeeDataForReport(
        employeeWithSensitiveData,
        mockManagerContext
      );

      expect(result.jobInfo.salary).toBeUndefined();
      expect(result.personalInfo.socialSecurityNumber).toBeUndefined();
    });

    it('should filter most sensitive data for other roles', () => {
      const employeeWithSensitiveData = Employee.fromJSON({
        ...mockEmployee1.toJSON(),
        jobInfo: {
          ...mockEmployee1.toJSON().jobInfo,
          salary: 100000
        },
        personalInfo: {
          ...mockEmployee1.toJSON().personalInfo,
          socialSecurityNumber: '123-45-6789',
          dateOfBirth: new Date('1990-01-01'),
          phone: '+1-555-123-4567',
          address: {
            street: '123 Main St',
            city: 'Anytown',
            state: 'NY',
            zipCode: '12345',
            country: 'USA'
          },
          emergencyContact: {
            name: 'Emergency Contact',
            relationship: 'Spouse',
            phone: '+1-555-567-8901'
          }
        }
      });

      const result = (reportService as any).filterEmployeeDataForReport(
        employeeWithSensitiveData,
        mockEmployeeContext
      );

      expect(result.jobInfo.salary).toBeUndefined();
      expect(result.personalInfo.socialSecurityNumber).toBeUndefined();
      expect(result.personalInfo.dateOfBirth).toBeUndefined();
      expect(result.personalInfo.phone).toBeUndefined();
      expect(result.personalInfo.address).toBeUndefined();
      expect(result.personalInfo.emergencyContact).toBeUndefined();
    });
  });
});