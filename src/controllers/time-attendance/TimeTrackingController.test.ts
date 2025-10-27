import { Request, Response, NextFunction } from 'express';
import { TimeTrackingController } from './TimeTrackingController';
import { TimeTrackingService } from '../../services/time-attendance/TimeTrackingService';
import { TimeEntry } from '../../models/time-attendance/TimeEntry';

// Mock the service
jest.mock('../../services/time-attendance/TimeTrackingService');

describe('TimeTrackingController', () => {
  let controller: TimeTrackingController;
  let mockService: jest.Mocked<TimeTrackingService>;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockService = new TimeTrackingService(null as any, null as any) as jest.Mocked<TimeTrackingService>;
    controller = new TimeTrackingController(mockService);

    mockRequest = {
      body: {},
      params: {},
      query: {}
    };

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    mockNext = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('clockIn', () => {
    it('should successfully clock in an employee', async () => {
      const employeeId = '123e4567-e89b-12d3-a456-426614174000';
      const mockTimeEntry: any = {
        id: '123',
        employeeId,
        clockInTime: new Date('2024-01-15T09:00:00Z'),
        clockOutTime: null,
        totalHours: null
      };

      mockRequest.body = {
        employeeId,
        clockInTime: '2024-01-15T09:00:00Z'
      };

      mockService.clockIn = jest.fn().mockResolvedValue(mockTimeEntry);

      await controller.clockIn(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockService.clockIn).toHaveBeenCalledWith({
        employeeId,
        clockInTime: new Date('2024-01-15T09:00:00Z'),
        location: undefined,
        notes: undefined
      });

      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        message: 'Successfully clocked in',
        data: {
          timeEntry: mockTimeEntry,
          clockInTime: mockTimeEntry.clockInTime
        }
      });
    });

    it('should handle clock in with location', async () => {
      const employeeId = '123e4567-e89b-12d3-a456-426614174000';
      const location = { latitude: 40.7128, longitude: -74.0060, accuracy: 10 };

      mockRequest.body = {
        employeeId,
        location
      };

      const mockTimeEntry: any = {
        id: '123',
        employeeId,
        clockInTime: new Date(),
        location
      };

      mockService.clockIn = jest.fn().mockResolvedValue(mockTimeEntry);

      await controller.clockIn(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockService.clockIn).toHaveBeenCalledWith(
        expect.objectContaining({
          employeeId,
          location
        })
      );
    });

    it('should handle errors and call next', async () => {
      const error = new Error('Clock in failed');
      mockRequest.body = { employeeId: 'invalid' };

      mockService.clockIn = jest.fn().mockRejectedValue(error);

      await controller.clockIn(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  describe('clockOut', () => {
    it('should successfully clock out an employee', async () => {
      const employeeId = '123e4567-e89b-12d3-a456-426614174000';
      const mockTimeEntry: any = {
        id: '123',
        employeeId,
        clockInTime: new Date('2024-01-15T09:00:00Z'),
        clockOutTime: new Date('2024-01-15T17:00:00Z'),
        totalHours: 8,
        regularHours: 8,
        overtimeHours: 0
      };

      mockRequest.body = {
        employeeId,
        clockOutTime: '2024-01-15T17:00:00Z'
      };

      mockService.clockOut = jest.fn().mockResolvedValue(mockTimeEntry);

      await controller.clockOut(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockService.clockOut).toHaveBeenCalled();
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Successfully clocked out'
        })
      );
    });
  });

  describe('startBreak', () => {
    it('should successfully start a break', async () => {
      const employeeId = '123e4567-e89b-12d3-a456-426614174000';
      const mockBreakEntry: any = {
        id: '456',
        timeEntryId: '123',
        breakType: 'LUNCH',
        startTime: new Date(),
        endTime: null,
        paid: false
      };

      mockRequest.body = {
        employeeId,
        breakType: 'LUNCH',
        paid: false
      };

      mockService.startBreak = jest.fn().mockResolvedValue(mockBreakEntry);

      await controller.startBreak(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockService.startBreak).toHaveBeenCalled();
      expect(mockResponse.status).toHaveBeenCalledWith(201);
    });

    it('should validate break type', async () => {
      mockRequest.body = {
        employeeId: '123e4567-e89b-12d3-a456-426614174000',
        breakType: 'INVALID_TYPE'
      };

      await controller.startBreak(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('endBreak', () => {
    it('should successfully end a break', async () => {
      const employeeId = '123e4567-e89b-12d3-a456-426614174000';
      const mockBreakEntry: any = {
        id: '456',
        timeEntryId: '123',
        breakType: 'LUNCH',
        startTime: new Date('2024-01-15T12:00:00Z'),
        endTime: new Date('2024-01-15T12:30:00Z'),
        durationMinutes: 30,
        paid: false
      };

      mockRequest.body = { employeeId };

      mockService.endBreak = jest.fn().mockResolvedValue(mockBreakEntry);

      await controller.endBreak(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockService.endBreak).toHaveBeenCalled();
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            duration: 30
          })
        })
      );
    });
  });

  describe('getCurrentStatus', () => {
    it('should get current employee status', async () => {
      const employeeId = '123e4567-e89b-12d3-a456-426614174000';
      const mockStatus = {
        employeeId,
        currentStatus: 'CLOCKED_IN' as const,
        activeTimeEntryId: '123',
        lastClockInTime: new Date()
      };

      mockRequest.params = { employeeId };

      mockService.getCurrentStatus = jest.fn().mockResolvedValue(mockStatus);

      await controller.getCurrentStatus(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockService.getCurrentStatus).toHaveBeenCalledWith(employeeId);
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: mockStatus
      });
    });

    it('should handle missing employee ID', async () => {
      mockRequest.params = {};

      await controller.getCurrentStatus(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('getTimeEntries', () => {
    it('should get time entries with pagination', async () => {
      const mockEntries = [
        { id: '1', employeeId: 'emp1' },
        { id: '2', employeeId: 'emp1' },
        { id: '3', employeeId: 'emp1' }
      ];

      mockRequest.query = {
        employeeId: 'emp1',
        page: '1',
        limit: '10'
      };

      mockService.getTimeEntries = jest.fn().mockResolvedValue(mockEntries);

      await controller.getTimeEntries(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockService.getTimeEntries).toHaveBeenCalled();
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            entries: mockEntries,
            pagination: expect.any(Object)
          })
        })
      );
    });
  });

  describe('submitManualEntry', () => {
    it('should submit manual time entry', async () => {
      const mockEntry: any = {
        id: '123',
        employeeId: 'emp1',
        clockInTime: new Date('2024-01-15T09:00:00Z'),
        clockOutTime: new Date('2024-01-15T17:00:00Z'),
        status: 'SUBMITTED'
      };

      mockRequest.body = {
        employeeId: 'emp1',
        clockInTime: '2024-01-15T09:00:00Z',
        clockOutTime: '2024-01-15T17:00:00Z',
        reason: 'Forgot to clock in',
        submittedBy: 'manager1'
      };

      mockService.submitManualEntry = jest.fn().mockResolvedValue(mockEntry);

      await controller.submitManualEntry(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockService.submitManualEntry).toHaveBeenCalled();
      expect(mockResponse.status).toHaveBeenCalledWith(201);
    });
  });

  describe('getEmployeeDashboard', () => {
    it('should get employee dashboard data', async () => {
      const employeeId = '123e4567-e89b-12d3-a456-426614174000';
      const mockDashboard = {
        employeeId,
        currentStatus: 'CLOCKED_OUT' as const,
        totalHoursToday: 8,
        regularHoursToday: 8,
        overtimeHoursToday: 0,
        todayEntries: [],
        incompleteEntries: [],
        anomalies: [],
        lastUpdated: new Date()
      };

      mockRequest.params = { employeeId };

      mockService.getEmployeeDashboard = jest.fn().mockResolvedValue(mockDashboard);

      await controller.getEmployeeDashboard(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockService.getEmployeeDashboard).toHaveBeenCalledWith(employeeId);
      expect(mockResponse.status).toHaveBeenCalledWith(200);
    });
  });

  describe('getPayPeriodData', () => {
    it('should get pay period data with provided dates', async () => {
      const employeeId = '123e4567-e89b-12d3-a456-426614174000';

      mockRequest.params = { employeeId };
      mockRequest.query = {
        startDate: '2024-01-01T00:00:00Z',
        endDate: '2024-01-14T23:59:59Z'
      };

      mockService.getTimeEntries = jest.fn().mockResolvedValue([]);
      mockService.calculatePayPeriodSummary = jest.fn().mockResolvedValue({
        totalHours: 80,
        regularHours: 80,
        overtimeHours: 0
      });

      await controller.getPayPeriodData(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockService.getTimeEntries).toHaveBeenCalled();
      expect(mockService.calculatePayPeriodSummary).toHaveBeenCalled();
      expect(mockResponse.status).toHaveBeenCalledWith(200);
    });

    it('should calculate current pay period if dates not provided', async () => {
      const employeeId = '123e4567-e89b-12d3-a456-426614174000';

      mockRequest.params = { employeeId };
      mockRequest.query = {};

      mockService.getTimeEntries = jest.fn().mockResolvedValue([]);
      mockService.calculatePayPeriodSummary = jest.fn().mockResolvedValue({
        totalHours: 80,
        regularHours: 80,
        overtimeHours: 0
      });

      await controller.getPayPeriodData(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockService.getTimeEntries).toHaveBeenCalled();
    });
  });
});
