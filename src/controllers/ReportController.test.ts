import request from 'supertest';
import express from 'express';
import { ReportController } from './ReportController';
import { ReportService } from '../services/ReportService';
import { ValidationError } from '../utils/validation';
import { authenticate } from '../middleware/auth';

// Mock the services
jest.mock('../services/ReportService');
jest.mock('../middleware/auth');

describe('ReportController', () => {
  let app: express.Application;
  let reportController: ReportController;
  let mockReportService: jest.Mocked<ReportService>;

  const mockUser = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    email: 'admin@company.com',
    role: 'HR_ADMIN'
  };

  const mockPermissionContext = {
    userId: mockUser.id,
    role: 'HR_ADMIN' as const,
    managedEmployeeIds: []
  };

  const mockEmployeeRosterReport = {
    employees: [],
    totalCount: 0,
    filters: {},
    generatedAt: new Date(),
    generatedBy: mockUser.id
  };

  const mockDepartmentBreakdownReport = {
    departments: [],
    totalEmployees: 0,
    filters: {},
    generatedAt: new Date(),
    generatedBy: mockUser.id
  };

  const mockWorkforceAnalytics = {
    totalEmployees: 10,
    statusBreakdown: { active: 8, inactive: 1, terminated: 1, onLeave: 0 },
    employmentTypeBreakdown: { fullTime: 8, partTime: 1, contract: 1, intern: 0 },
    departmentBreakdown: [],
    averageYearsOfService: 3.2,
    newHiresLastMonth: 2,
    terminationsLastMonth: 1,
    generatedAt: new Date(),
    generatedBy: mockUser.id
  };

  const mockExportResult = {
    fileName: 'test-export.csv',
    filePath: '/exports/test-export.csv',
    format: 'CSV' as const,
    recordCount: 5,
    generatedAt: new Date(),
    generatedBy: mockUser.id
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock auth middleware
    (authenticate as jest.Mock).mockImplementation((req: any, _res: any, next: any) => {
      req.user = mockUser;
      next();
    });

    // Setup mocks
    mockReportService = new ReportService() as jest.Mocked<ReportService>;

    // Create controller and app
    reportController = new ReportController();
    (reportController as any).reportService = mockReportService;

    app = express();
    app.use(express.json());
    app.use(authenticate);

    // Setup routes
    app.get('/reports/employees', (req, res) => reportController.generateEmployeeRoster(req as any, res));
    app.get('/reports/departments', (req, res) => reportController.generateDepartmentBreakdown(req as any, res));
    app.get('/reports/analytics', (req, res) => reportController.generateWorkforceAnalytics(req as any, res));
    app.post('/reports/employees/export', (req, res) => reportController.exportEmployeeRoster(req as any, res));
    app.post('/reports/departments/export', (req, res) => reportController.exportDepartmentBreakdown(req as any, res));
    app.post('/reports/analytics/export', (req, res) => reportController.exportWorkforceAnalytics(req as any, res));
    app.get('/reports/download/:fileName', (req, res) => reportController.downloadExport(req, res));
  });

  describe('GET /reports/employees', () => {
    it('should generate employee roster report successfully', async () => {
      mockReportService.generateEmployeeRosterReport.mockResolvedValue(mockEmployeeRosterReport);

      const response = await request(app)
        .get('/reports/employees')
        .query({ status: 'ACTIVE', department: 'Engineering' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        employees: mockEmployeeRosterReport.employees,
        totalCount: mockEmployeeRosterReport.totalCount,
        filters: mockEmployeeRosterReport.filters,
        generatedBy: mockEmployeeRosterReport.generatedBy
      });
      expect(mockReportService.generateEmployeeRosterReport).toHaveBeenCalledWith(
        { status: 'ACTIVE', department: 'Engineering' },
        mockPermissionContext
      );
    });

    it('should handle validation errors', async () => {
      mockReportService.generateEmployeeRosterReport.mockRejectedValue(
        new ValidationError('Invalid filter', [])
      );

      const response = await request(app)
        .get('/reports/employees');

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should handle internal server errors', async () => {
      mockReportService.generateEmployeeRosterReport.mockRejectedValue(
        new Error('Database connection failed')
      );

      const response = await request(app)
        .get('/reports/employees');

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INTERNAL_SERVER_ERROR');
    });
  });

  describe('GET /reports/departments', () => {
    it('should generate department breakdown report successfully', async () => {
      mockReportService.generateDepartmentBreakdownReport.mockResolvedValue(mockDepartmentBreakdownReport);

      const response = await request(app)
        .get('/reports/departments')
        .query({ status: 'ACTIVE' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        departments: mockDepartmentBreakdownReport.departments,
        totalEmployees: mockDepartmentBreakdownReport.totalEmployees,
        filters: mockDepartmentBreakdownReport.filters,
        generatedBy: mockDepartmentBreakdownReport.generatedBy
      });
    });
  });

  describe('GET /reports/analytics', () => {
    it('should generate workforce analytics successfully', async () => {
      mockReportService.generateWorkforceAnalytics.mockResolvedValue(mockWorkforceAnalytics);

      const response = await request(app)
        .get('/reports/analytics');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        totalEmployees: mockWorkforceAnalytics.totalEmployees,
        statusBreakdown: mockWorkforceAnalytics.statusBreakdown,
        employmentTypeBreakdown: mockWorkforceAnalytics.employmentTypeBreakdown,
        averageYearsOfService: mockWorkforceAnalytics.averageYearsOfService,
        generatedBy: mockWorkforceAnalytics.generatedBy
      });
    });
  });

  describe('POST /reports/employees/export', () => {
    it('should export employee roster to CSV successfully', async () => {
      mockReportService.exportEmployeeRoster.mockResolvedValue(mockExportResult);

      const response = await request(app)
        .post('/reports/employees/export')
        .send({
          format: 'CSV',
          includeFields: ['Employee ID', 'First Name', 'Last Name']
        })
        .query({ status: 'ACTIVE' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        fileName: mockExportResult.fileName,
        format: mockExportResult.format,
        recordCount: mockExportResult.recordCount,
        generatedBy: mockExportResult.generatedBy
      });
      expect(mockReportService.exportEmployeeRoster).toHaveBeenCalledWith(
        { status: 'ACTIVE' },
        {
          format: 'CSV',
          includeFields: ['Employee ID', 'First Name', 'Last Name']
        },
        mockPermissionContext
      );
    });

    it('should export employee roster to PDF successfully', async () => {
      const pdfExportResult = { ...mockExportResult, format: 'PDF' as const, fileName: 'test-export.pdf' };
      mockReportService.exportEmployeeRoster.mockResolvedValue(pdfExportResult);

      const response = await request(app)
        .post('/reports/employees/export')
        .send({ format: 'PDF' });

      expect(response.status).toBe(200);
      expect(response.body.data.format).toBe('PDF');
    });

    it('should handle invalid export format', async () => {
      const response = await request(app)
        .post('/reports/employees/export')
        .send({ format: 'XML' });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toContain('Invalid export format');
    });

    it('should apply field filtering correctly', async () => {
      mockReportService.exportEmployeeRoster.mockResolvedValue(mockExportResult);

      const response = await request(app)
        .post('/reports/employees/export')
        .send({
          format: 'CSV',
          excludeFields: ['Salary', 'SSN']
        });

      expect(response.status).toBe(200);
      expect(mockReportService.exportEmployeeRoster).toHaveBeenCalledWith(
        {},
        {
          format: 'CSV',
          excludeFields: ['Salary', 'SSN']
        },
        expect.objectContaining({
          userId: mockPermissionContext.userId,
          role: mockPermissionContext.role
        })
      );
    });
  });

  describe('POST /reports/departments/export', () => {
    it('should export department breakdown successfully', async () => {
      mockReportService.exportDepartmentBreakdown.mockResolvedValue(mockExportResult);

      const response = await request(app)
        .post('/reports/departments/export')
        .send({ format: 'CSV' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        fileName: mockExportResult.fileName,
        format: mockExportResult.format,
        recordCount: mockExportResult.recordCount,
        generatedBy: mockExportResult.generatedBy
      });
    });
  });

  describe('POST /reports/analytics/export', () => {
    it('should export workforce analytics successfully', async () => {
      mockReportService.exportWorkforceAnalytics.mockResolvedValue(mockExportResult);

      const response = await request(app)
        .post('/reports/analytics/export')
        .send({ format: 'PDF' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        fileName: mockExportResult.fileName,
        format: mockExportResult.format,
        recordCount: mockExportResult.recordCount,
        generatedBy: mockExportResult.generatedBy
      });
    });
  });

  describe('GET /reports/download/:fileName', () => {
    it('should reject invalid file names', async () => {
      const response = await request(app)
        .get('/reports/download/..%2F..%2F..%2Fetc%2Fpasswd');

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_FILE_NAME');
    });

    it('should return 404 for non-existent file', async () => {
      const response = await request(app)
        .get('/reports/download/non-existent.csv');

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('FILE_NOT_FOUND');
    });
  });

  describe('parseReportFilters', () => {
    it('should parse all filter types correctly', () => {
      const query = {
        department: 'Engineering',
        status: 'ACTIVE',
        employmentType: 'FULL_TIME',
        startDateFrom: '2022-01-01',
        startDateTo: '2023-01-01',
        managerId: '550e8400-e29b-41d4-a716-446655440001'
      };

      const filters = (reportController as any).parseReportFilters(query);

      expect(filters).toEqual({
        department: 'Engineering',
        status: 'ACTIVE',
        employmentType: 'FULL_TIME',
        startDateFrom: new Date('2022-01-01'),
        startDateTo: new Date('2023-01-01'),
        managerId: '550e8400-e29b-41d4-a716-446655440001'
      });
    });

    it('should handle empty query parameters', () => {
      const filters = (reportController as any).parseReportFilters({});
      expect(filters).toEqual({});
    });
  });

  describe('parseExportOptions', () => {
    it('should parse export options correctly', () => {
      const body = {
        format: 'PDF',
        includeFields: ['Field1', 'Field2'],
        excludeFields: ['Field3'],
        fileName: 'custom-export.pdf'
      };

      const options = (reportController as any).parseExportOptions(body);

      expect(options).toEqual({
        format: 'PDF',
        includeFields: ['Field1', 'Field2'],
        excludeFields: ['Field3'],
        fileName: 'custom-export.pdf'
      });
    });

    it('should default to CSV format', () => {
      const options = (reportController as any).parseExportOptions({});
      expect(options.format).toBe('CSV');
    });

    it('should throw error for invalid format', () => {
      expect(() => {
        (reportController as any).parseExportOptions({ format: 'INVALID' });
      }).toThrow(ValidationError);
    });
  });
});