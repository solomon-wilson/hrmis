import * as fs from 'fs';
import { ExportService } from './ExportService';
import { AuditLogRepository } from '../database/repositories/audit';
import { Employee } from '../models/Employee';
import { ValidationError } from '../utils/validation';
import { PermissionContext } from './EmployeeService';
import { 
  EmployeeRosterReport, 
  DepartmentBreakdownReport, 
  WorkforceAnalytics,
  ExportOptions 
} from './ReportService';

// Mock fs module
jest.mock('fs');
jest.mock('csv-writer');
jest.mock('pdfkit');

// Mock the audit repository
jest.mock('../database/repositories/audit');

describe('ExportService', () => {
  let exportService: ExportService;
  let mockAuditLogRepository: jest.Mocked<AuditLogRepository>;
  let mockFs: jest.Mocked<typeof fs>;

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
      email: 'john.doe@company.com',
      phone: '+1-555-123-4567'
    },
    jobInfo: {
      jobTitle: 'Software Engineer',
      department: 'Engineering',
      startDate: new Date('2022-01-01'),
      employmentType: 'FULL_TIME',
      location: 'New York',
      salary: 100000
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

  const mockEmployeeRosterReport: EmployeeRosterReport = {
    employees: [mockEmployee1, mockEmployee2],
    totalCount: 2,
    filters: { status: 'ACTIVE' },
    generatedAt: new Date(),
    generatedBy: mockHRAdminContext.userId
  };

  const mockDepartmentBreakdownReport: DepartmentBreakdownReport = {
    departments: [
      {
        departmentId: 'dept1',
        departmentName: 'Engineering',
        totalEmployees: 5,
        activeEmployees: 4,
        inactiveEmployees: 0,
        terminatedEmployees: 1,
        onLeaveEmployees: 0,
        employmentTypeBreakdown: {
          fullTime: 5,
          partTime: 0,
          contract: 0,
          intern: 0
        },
        averageYearsOfService: 2.5
      }
    ],
    totalEmployees: 5,
    filters: {},
    generatedAt: new Date(),
    generatedBy: mockHRAdminContext.userId
  };

  const mockWorkforceAnalytics: WorkforceAnalytics = {
    totalEmployees: 10,
    statusBreakdown: {
      active: 8,
      inactive: 1,
      terminated: 1,
      onLeave: 0
    },
    employmentTypeBreakdown: {
      fullTime: 8,
      partTime: 1,
      contract: 1,
      intern: 0
    },
    departmentBreakdown: [
      {
        departmentId: 'dept1',
        departmentName: 'Engineering',
        totalEmployees: 5,
        activeEmployees: 4,
        inactiveEmployees: 0,
        terminatedEmployees: 1,
        onLeaveEmployees: 0,
        employmentTypeBreakdown: {
          fullTime: 5,
          partTime: 0,
          contract: 0,
          intern: 0
        },
        averageYearsOfService: 2.5
      }
    ],
    averageYearsOfService: 3.2,
    newHiresLastMonth: 2,
    terminationsLastMonth: 1,
    generatedAt: new Date(),
    generatedBy: mockHRAdminContext.userId
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockFs = fs as jest.Mocked<typeof fs>;
    mockAuditLogRepository = new AuditLogRepository() as jest.Mocked<AuditLogRepository>;
    
    // Mock fs methods
    mockFs.existsSync.mockReturnValue(true);
    mockFs.mkdirSync.mockReturnValue(undefined);
    mockFs.createWriteStream.mockReturnValue({
      on: jest.fn(),
      write: jest.fn(),
      end: jest.fn()
    } as any);
    
    exportService = new ExportService();
    (exportService as any).auditLogRepository = mockAuditLogRepository;
  });

  describe('exportEmployeeRoster', () => {
    const csvOptions: ExportOptions = { format: 'CSV' };
    const pdfOptions: ExportOptions = { format: 'PDF' };

    it('should export employee roster to CSV for HR admin', async () => {
      // Mock CSV writer
      const mockCsvWriter = {
        writeRecords: jest.fn().mockResolvedValue(undefined)
      };
      
      const { createObjectCsvWriter } = require('csv-writer');
      createObjectCsvWriter.mockReturnValue(mockCsvWriter);

      mockAuditLogRepository.logDataExport.mockResolvedValue({} as any);

      const result = await exportService.exportEmployeeRoster(
        mockEmployeeRosterReport,
        csvOptions,
        mockHRAdminContext
      );

      expect(result.format).toBe('CSV');
      expect(result.recordCount).toBe(2);
      expect(result.generatedBy).toBe(mockHRAdminContext.userId);
      expect(mockCsvWriter.writeRecords).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            'Employee ID': 'EMP001',
            'First Name': 'John',
            'Last Name': 'Doe'
          })
        ])
      );
      expect(mockAuditLogRepository.logDataExport).toHaveBeenCalledWith(
        'EMPLOYEE_ROSTER',
        expect.objectContaining({ format: 'CSV', recordCount: 2 }),
        mockHRAdminContext.userId,
        expect.objectContaining({ action: 'csv_export' })
      );
    });

    it('should export employee roster to PDF for HR admin', async () => {
      // Mock PDF document
      const mockPDFDoc = {
        fontSize: jest.fn().mockReturnThis(),
        text: jest.fn().mockReturnThis(),
        moveDown: jest.fn().mockReturnThis(),
        pipe: jest.fn(),
        end: jest.fn()
      };

      const PDFDocument = require('pdfkit');
      PDFDocument.mockImplementation(() => mockPDFDoc);

      // Mock stream events
      const mockStream = {
        on: jest.fn((event, callback) => {
          if (event === 'finish') {
            setTimeout(callback, 0); // Simulate async completion
          }
        })
      };
      mockFs.createWriteStream.mockReturnValue(mockStream as any);

      mockAuditLogRepository.logDataExport.mockResolvedValue({} as any);

      const result = await exportService.exportEmployeeRoster(
        mockEmployeeRosterReport,
        pdfOptions,
        mockHRAdminContext
      );

      expect(result.format).toBe('PDF');
      expect(result.recordCount).toBe(2);
      expect(mockPDFDoc.text).toHaveBeenCalledWith(
        expect.stringContaining('Employee Roster'),
        expect.any(Object)
      );
    });

    it('should filter sensitive data for managers in CSV export', async () => {
      const mockCsvWriter = {
        writeRecords: jest.fn().mockResolvedValue(undefined)
      };
      
      const { createObjectCsvWriter } = require('csv-writer');
      createObjectCsvWriter.mockReturnValue(mockCsvWriter);

      mockAuditLogRepository.logDataExport.mockResolvedValue({} as any);

      await exportService.exportEmployeeRoster(
        mockEmployeeRosterReport,
        csvOptions,
        mockManagerContext
      );

      const writtenRecords = mockCsvWriter.writeRecords.mock.calls[0][0];
      expect(writtenRecords[0]).not.toHaveProperty('Salary');
      expect(writtenRecords[0]).toHaveProperty('Employee ID');
      expect(writtenRecords[0]).toHaveProperty('First Name');
    });

    it('should apply field filtering when includeFields is specified', async () => {
      const mockCsvWriter = {
        writeRecords: jest.fn().mockResolvedValue(undefined)
      };
      
      const { createObjectCsvWriter } = require('csv-writer');
      createObjectCsvWriter.mockReturnValue(mockCsvWriter);

      mockAuditLogRepository.logDataExport.mockResolvedValue({} as any);

      const filteredOptions: ExportOptions = {
        format: 'CSV',
        includeFields: ['Employee ID', 'First Name', 'Last Name']
      };

      await exportService.exportEmployeeRoster(
        mockEmployeeRosterReport,
        filteredOptions,
        mockHRAdminContext
      );

      const writtenRecords = mockCsvWriter.writeRecords.mock.calls[0][0];
      expect(Object.keys(writtenRecords[0])).toEqual(['Employee ID', 'First Name', 'Last Name']);
    });

    it('should apply field filtering when excludeFields is specified', async () => {
      const mockCsvWriter = {
        writeRecords: jest.fn().mockResolvedValue(undefined)
      };
      
      const { createObjectCsvWriter } = require('csv-writer');
      createObjectCsvWriter.mockReturnValue(mockCsvWriter);

      mockAuditLogRepository.logDataExport.mockResolvedValue({} as any);

      const filteredOptions: ExportOptions = {
        format: 'CSV',
        excludeFields: ['Email', 'Phone']
      };

      await exportService.exportEmployeeRoster(
        mockEmployeeRosterReport,
        filteredOptions,
        mockHRAdminContext
      );

      const writtenRecords = mockCsvWriter.writeRecords.mock.calls[0][0];
      expect(writtenRecords[0]).not.toHaveProperty('Email');
      expect(writtenRecords[0]).not.toHaveProperty('Phone');
      expect(writtenRecords[0]).toHaveProperty('Employee ID');
    });

    it('should throw error for insufficient permissions', async () => {
      await expect(
        exportService.exportEmployeeRoster(mockEmployeeRosterReport, csvOptions, mockEmployeeContext)
      ).rejects.toThrow(ValidationError);
      await expect(
        exportService.exportEmployeeRoster(mockEmployeeRosterReport, csvOptions, mockEmployeeContext)
      ).rejects.toThrow('Insufficient permissions to export employee data');
    });

    it('should throw error for unsupported format', async () => {
      const invalidOptions: ExportOptions = { format: 'XML' as any };

      await expect(
        exportService.exportEmployeeRoster(mockEmployeeRosterReport, invalidOptions, mockHRAdminContext)
      ).rejects.toThrow(ValidationError);
      await expect(
        exportService.exportEmployeeRoster(mockEmployeeRosterReport, invalidOptions, mockHRAdminContext)
      ).rejects.toThrow('Unsupported export format');
    });
  });

  describe('exportDepartmentBreakdown', () => {
    const csvOptions: ExportOptions = { format: 'CSV' };

    it('should export department breakdown to CSV', async () => {
      const mockCsvWriter = {
        writeRecords: jest.fn().mockResolvedValue(undefined)
      };
      
      const { createObjectCsvWriter } = require('csv-writer');
      createObjectCsvWriter.mockReturnValue(mockCsvWriter);

      mockAuditLogRepository.logDataExport.mockResolvedValue({} as any);

      const result = await exportService.exportDepartmentBreakdown(
        mockDepartmentBreakdownReport,
        csvOptions,
        mockHRAdminContext
      );

      expect(result.format).toBe('CSV');
      expect(result.recordCount).toBe(1);
      expect(mockCsvWriter.writeRecords).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            'Department': 'Engineering',
            'Total Employees': 5,
            'Active': 4
          })
        ])
      );
    });

    it('should throw error for insufficient permissions', async () => {
      await expect(
        exportService.exportDepartmentBreakdown(mockDepartmentBreakdownReport, csvOptions, mockEmployeeContext)
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('exportWorkforceAnalytics', () => {
    const csvOptions: ExportOptions = { format: 'CSV' };

    it('should export workforce analytics to CSV for HR admin', async () => {
      const mockCsvWriter = {
        writeRecords: jest.fn().mockResolvedValue(undefined)
      };
      
      const { createObjectCsvWriter } = require('csv-writer');
      createObjectCsvWriter.mockReturnValue(mockCsvWriter);

      mockAuditLogRepository.logDataExport.mockResolvedValue({} as any);

      const result = await exportService.exportWorkforceAnalytics(
        mockWorkforceAnalytics,
        csvOptions,
        mockHRAdminContext
      );

      expect(result.format).toBe('CSV');
      expect(result.recordCount).toBe(1);
      expect(mockCsvWriter.writeRecords).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            'Total Employees': 10,
            'Active Employees': 8,
            'Average Years of Service': 3.2
          })
        ])
      );
    });

    it('should throw error for non-HR admin users', async () => {
      await expect(
        exportService.exportWorkforceAnalytics(mockWorkforceAnalytics, csvOptions, mockManagerContext)
      ).rejects.toThrow(ValidationError);
      await expect(
        exportService.exportWorkforceAnalytics(mockWorkforceAnalytics, csvOptions, mockManagerContext)
      ).rejects.toThrow('Insufficient permissions to export workforce analytics');
    });
  });

  describe('prepareEmployeeRosterForCSV', () => {
    it('should include salary for HR admin', () => {
      const result = (exportService as any).prepareEmployeeRosterForCSV(
        [mockEmployee1],
        mockHRAdminContext,
        { format: 'CSV' }
      );

      expect(result[0]).toHaveProperty('Salary', 100000);
      expect(result[0]).toHaveProperty('Phone', '+1-555-123-4567');
    });

    it('should exclude salary for managers', () => {
      const result = (exportService as any).prepareEmployeeRosterForCSV(
        [mockEmployee1],
        mockManagerContext,
        { format: 'CSV' }
      );

      expect(result[0]).not.toHaveProperty('Salary');
      expect(result[0]).toHaveProperty('Employee ID', 'EMP001');
    });
  });

  describe('applyFieldFiltering', () => {
    const sampleData = {
      'Field1': 'value1',
      'Field2': 'value2',
      'Field3': 'value3'
    };

    it('should include only specified fields when includeFields is provided', () => {
      const options: ExportOptions = {
        format: 'CSV',
        includeFields: ['Field1', 'Field3']
      };

      const result = (exportService as any).applyFieldFiltering(sampleData, options);

      expect(result).toEqual({
        'Field1': 'value1',
        'Field3': 'value3'
      });
    });

    it('should exclude specified fields when excludeFields is provided', () => {
      const options: ExportOptions = {
        format: 'CSV',
        excludeFields: ['Field2']
      };

      const result = (exportService as any).applyFieldFiltering(sampleData, options);

      expect(result).toEqual({
        'Field1': 'value1',
        'Field3': 'value3'
      });
    });

    it('should return original data when no filtering is specified', () => {
      const options: ExportOptions = { format: 'CSV' };

      const result = (exportService as any).applyFieldFiltering(sampleData, options);

      expect(result).toEqual(sampleData);
    });
  });

  describe('cleanupOldExports', () => {
    it('should delete files older than specified age', async () => {
      const oldDate = new Date(Date.now() - (25 * 60 * 60 * 1000)); // 25 hours ago
      const newDate = new Date(Date.now() - (1 * 60 * 60 * 1000)); // 1 hour ago

      mockFs.readdirSync.mockReturnValue(['old-file.csv', 'new-file.csv'] as any);
      mockFs.statSync
        .mockReturnValueOnce({ mtime: oldDate } as any)
        .mockReturnValueOnce({ mtime: newDate } as any);
      mockFs.unlinkSync.mockReturnValue(undefined);

      const deletedCount = await exportService.cleanupOldExports(24);

      expect(deletedCount).toBe(1);
      expect(mockFs.unlinkSync).toHaveBeenCalledWith(
        expect.stringContaining('old-file.csv')
      );
      expect(mockFs.unlinkSync).not.toHaveBeenCalledWith(
        expect.stringContaining('new-file.csv')
      );
    });

    it('should not delete any files when all are recent', async () => {
      const recentDate = new Date(Date.now() - (1 * 60 * 60 * 1000)); // 1 hour ago

      mockFs.readdirSync.mockReturnValue(['recent-file.csv'] as any);
      mockFs.statSync.mockReturnValue({ mtime: recentDate } as any);

      const deletedCount = await exportService.cleanupOldExports(24);

      expect(deletedCount).toBe(0);
      expect(mockFs.unlinkSync).not.toHaveBeenCalled();
    });
  });
});