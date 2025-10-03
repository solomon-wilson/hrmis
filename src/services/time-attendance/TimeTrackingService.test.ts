import { TimeTrackingService, ClockInInput, ClockOutInput, StartBreakInput, EndBreakInput } from './TimeTrackingService';
import { TimeEntryRepository } from '../../database/repositories/time-attendance/TimeEntryRepository';
import { BreakEntryRepository } from '../../database/repositories/time-attendance/BreakEntryRepository';
import { TimeEntry } from '../../models/time-attendance/TimeEntry';
import { EmployeeTimeStatus } from '../../models/time-attendance/EmployeeTimeStatus';
import { ValidationError } from '../../utils/validation';
import { AppError } from '../../utils/errorHandling';

// Mock the repositories
jest.mock('../../database/repositories/time-attendance/TimeEntryRepository');
jest.mock('../../database/repositories/time-attendance/BreakEntryRepository');

describe('TimeTrackingService', () => {
  let service: TimeTrackingService;
  let mockTimeEntryRepo: jest.Mocked<TimeEntryRepository>;
  let mockBreakEntryRepo: jest.Mocked<BreakEntryRepository>;

  beforeEach(() => {
    mockTimeEntryRepo = new TimeEntryRepository() as jest.Mocked<TimeEntryRepository>;
    mockBreakEntryRepo = new BreakEntryRepository() as jest.Mocked<BreakEntryRepository>;

    service = new TimeTrackingService(mockTimeEntryRepo, mockBreakEntryRepo, {
      allowFutureClockIn: false,
      requireLocation: false,
      maxDailyHours: 16,
      overtimeThreshold: 8,
      doubleTimeThreshold: 12,
      autoClockOutAfterHours: 24
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('clockIn', () => {
    const mockEmployeeId = 'emp-123';
    const mockClockInTime = new Date('2024-01-15T09:00:00Z');

    it('should successfully clock in an employee', async () => {
      const input: ClockInInput = {
        employeeId: mockEmployeeId,
        clockInTime: mockClockInTime,
        location: { latitude: 40.7128, longitude: -74.0060 }
      };

      const mockTimeEntry: TimeEntry = {
        id: 'entry-123',
        employeeId: mockEmployeeId,
        clockInTime: mockClockInTime,
        status: 'ACTIVE',
        manualEntry: false,
        breakEntries: [],
        location: input.location,
        createdAt: new Date(),
        updatedAt: new Date()
      } as TimeEntry;

      const mockStatus: EmployeeTimeStatus = {
        id: 'status-123',
        employeeId: mockEmployeeId,
        currentStatus: 'CLOCKED_OUT',
        totalHoursToday: 0,
        lastUpdated: new Date()
      } as EmployeeTimeStatus;

      mockTimeEntryRepo.findIncompleteTimeEntries.mockResolvedValue([]);
      mockTimeEntryRepo.getEmployeeTimeStatus.mockResolvedValue(mockStatus);
      mockTimeEntryRepo.findAll.mockResolvedValue({
        data: [],
        pagination: { page: 1, limit: 10, total: 0, totalPages: 0 }
      });
      mockTimeEntryRepo.create.mockResolvedValue(mockTimeEntry);

      const result = await service.clockIn(input);

      expect(result).toEqual(mockTimeEntry);
      expect(mockTimeEntryRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          employeeId: mockEmployeeId,
          clockInTime: mockClockInTime,
          location: input.location,
          status: 'ACTIVE',
          manualEntry: false
        }),
        undefined
      );
    });

    it('should reject future clock in time when not allowed', async () => {
      const futureTime = new Date(Date.now() + 3600000); // 1 hour in future
      const input: ClockInInput = {
        employeeId: mockEmployeeId,
        clockInTime: futureTime
      };

      await expect(service.clockIn(input)).rejects.toThrow(ValidationError);
      await expect(service.clockIn(input)).rejects.toThrow('Clock in time cannot be in the future');
    });

    it('should require location when configured', async () => {
      const serviceWithLocationRequired = new TimeTrackingService(
        mockTimeEntryRepo,
        mockBreakEntryRepo,
        { requireLocation: true }
      );

      const input: ClockInInput = {
        employeeId: mockEmployeeId,
        clockInTime: mockClockInTime
      };

      await expect(serviceWithLocationRequired.clockIn(input)).rejects.toThrow(ValidationError);
      await expect(serviceWithLocationRequired.clockIn(input)).rejects.toThrow('Location is required');
    });

    it('should reject duplicate clock in', async () => {
      const input: ClockInInput = {
        employeeId: mockEmployeeId,
        clockInTime: mockClockInTime
      };

      const existingEntry: TimeEntry = {
        id: 'existing-123',
        employeeId: mockEmployeeId,
        clockInTime: mockClockInTime,
        status: 'ACTIVE',
        manualEntry: false,
        breakEntries: [],
        createdAt: new Date(),
        updatedAt: new Date()
      } as TimeEntry;

      mockTimeEntryRepo.findIncompleteTimeEntries.mockResolvedValue([]);
      mockTimeEntryRepo.getEmployeeTimeStatus.mockResolvedValue({
        id: 'status-123',
        employeeId: mockEmployeeId,
        currentStatus: 'CLOCKED_OUT',
        totalHoursToday: 0,
        lastUpdated: new Date()
      } as EmployeeTimeStatus);
      mockTimeEntryRepo.findAll.mockResolvedValue({
        data: [existingEntry],
        pagination: { page: 1, limit: 10, total: 1, totalPages: 1 }
      });

      await expect(service.clockIn(input)).rejects.toThrow(AppError);
      await expect(service.clockIn(input)).rejects.toThrow('Employee already has an active clock-in');
    });

    it('should reject clock in with incomplete entries', async () => {
      const input: ClockInInput = {
        employeeId: mockEmployeeId,
        clockInTime: mockClockInTime
      };

      mockTimeEntryRepo.findIncompleteTimeEntries.mockResolvedValue([
        {
          id: 'incomplete-123',
          employeeId: mockEmployeeId,
          clockInTime: new Date('2024-01-14T09:00:00Z'),
          daysSinceClockIn: 1
        }
      ]);

      await expect(service.clockIn(input)).rejects.toThrow(AppError);
      await expect(service.clockIn(input)).rejects.toThrow('Cannot clock in with incomplete time entries');
    });

    it('should reject clock in when employee is already clocked in', async () => {
      const input: ClockInInput = {
        employeeId: mockEmployeeId,
        clockInTime: mockClockInTime
      };

      mockTimeEntryRepo.findIncompleteTimeEntries.mockResolvedValue([]);
      mockTimeEntryRepo.getEmployeeTimeStatus.mockResolvedValue({
        id: 'status-123',
        employeeId: mockEmployeeId,
        currentStatus: 'CLOCKED_IN',
        activeTimeEntryId: 'entry-123',
        totalHoursToday: 2,
        lastUpdated: new Date()
      } as EmployeeTimeStatus);

      await expect(service.clockIn(input)).rejects.toThrow(AppError);
      await expect(service.clockIn(input)).rejects.toThrow('Cannot clock in. Current status: CLOCKED_IN');
    });
  });

  describe('clockOut', () => {
    const mockEmployeeId = 'emp-123';
    const mockClockInTime = new Date('2024-01-15T09:00:00Z');
    const mockClockOutTime = new Date('2024-01-15T17:00:00Z');
    const mockTimeEntryId = 'entry-123';

    it('should successfully clock out an employee', async () => {
      const input: ClockOutInput = {
        employeeId: mockEmployeeId,
        clockOutTime: mockClockOutTime
      };

      const mockTimeEntry: TimeEntry = {
        id: mockTimeEntryId,
        employeeId: mockEmployeeId,
        clockInTime: mockClockInTime,
        status: 'ACTIVE',
        manualEntry: false,
        breakEntries: [],
        createdAt: new Date(),
        updatedAt: new Date()
      } as TimeEntry;

      const mockUpdatedEntry: TimeEntry = {
        ...mockTimeEntry,
        clockOutTime: mockClockOutTime,
        totalHours: 8,
        regularHours: 8,
        overtimeHours: 0,
        status: 'COMPLETED'
      } as TimeEntry;

      mockTimeEntryRepo.getEmployeeTimeStatus.mockResolvedValue({
        id: 'status-123',
        employeeId: mockEmployeeId,
        currentStatus: 'CLOCKED_IN',
        activeTimeEntryId: mockTimeEntryId,
        totalHoursToday: 0,
        lastUpdated: new Date()
      } as EmployeeTimeStatus);
      mockTimeEntryRepo.findById.mockResolvedValue(mockTimeEntry);
      mockBreakEntryRepo.findByTimeEntryId.mockResolvedValue([]);
      mockTimeEntryRepo.update.mockResolvedValue(mockUpdatedEntry);

      const result = await service.clockOut(input);

      expect(result).toEqual(mockUpdatedEntry);
      expect(mockTimeEntryRepo.update).toHaveBeenCalledWith(
        mockTimeEntryId,
        expect.objectContaining({
          clockOutTime: mockClockOutTime,
          status: 'COMPLETED'
        }),
        undefined
      );
    });

    it('should reject future clock out time', async () => {
      const futureTime = new Date(Date.now() + 3600000);
      const input: ClockOutInput = {
        employeeId: mockEmployeeId,
        clockOutTime: futureTime
      };

      await expect(service.clockOut(input)).rejects.toThrow(ValidationError);
      await expect(service.clockOut(input)).rejects.toThrow('Clock out time cannot be in the future');
    });

    it('should reject clock out when employee is not clocked in', async () => {
      const input: ClockOutInput = {
        employeeId: mockEmployeeId,
        clockOutTime: mockClockOutTime
      };

      mockTimeEntryRepo.getEmployeeTimeStatus.mockResolvedValue({
        id: 'status-123',
        employeeId: mockEmployeeId,
        currentStatus: 'CLOCKED_OUT',
        totalHoursToday: 0,
        lastUpdated: new Date()
      } as EmployeeTimeStatus);

      await expect(service.clockOut(input)).rejects.toThrow(AppError);
      await expect(service.clockOut(input)).rejects.toThrow('Employee is not clocked in');
    });

    it('should reject clock out when employee is on break', async () => {
      const input: ClockOutInput = {
        employeeId: mockEmployeeId,
        clockOutTime: mockClockOutTime
      };

      mockTimeEntryRepo.getEmployeeTimeStatus.mockResolvedValue({
        id: 'status-123',
        employeeId: mockEmployeeId,
        currentStatus: 'ON_BREAK',
        activeTimeEntryId: mockTimeEntryId,
        activeBreakEntryId: 'break-123',
        totalHoursToday: 4,
        lastUpdated: new Date()
      } as EmployeeTimeStatus);

      await expect(service.clockOut(input)).rejects.toThrow(AppError);
      await expect(service.clockOut(input)).rejects.toThrow('Cannot clock out while on break');
    });

    it('should reject clock out before clock in', async () => {
      const earlyClockOut = new Date('2024-01-15T08:00:00Z');
      const input: ClockOutInput = {
        employeeId: mockEmployeeId,
        clockOutTime: earlyClockOut
      };

      const mockTimeEntry: TimeEntry = {
        id: mockTimeEntryId,
        employeeId: mockEmployeeId,
        clockInTime: mockClockInTime,
        status: 'ACTIVE',
        manualEntry: false,
        breakEntries: [],
        createdAt: new Date(),
        updatedAt: new Date()
      } as TimeEntry;

      mockTimeEntryRepo.getEmployeeTimeStatus.mockResolvedValue({
        id: 'status-123',
        employeeId: mockEmployeeId,
        currentStatus: 'CLOCKED_IN',
        activeTimeEntryId: mockTimeEntryId,
        totalHoursToday: 0,
        lastUpdated: new Date()
      } as EmployeeTimeStatus);
      mockTimeEntryRepo.findById.mockResolvedValue(mockTimeEntry);

      await expect(service.clockOut(input)).rejects.toThrow(ValidationError);
      await expect(service.clockOut(input)).rejects.toThrow('Clock out time must be after clock in time');
    });

    it('should calculate overtime correctly', async () => {
      const lateClockOut = new Date('2024-01-15T19:00:00Z'); // 10 hours total
      const input: ClockOutInput = {
        employeeId: mockEmployeeId,
        clockOutTime: lateClockOut
      };

      const mockTimeEntry: TimeEntry = {
        id: mockTimeEntryId,
        employeeId: mockEmployeeId,
        clockInTime: mockClockInTime,
        status: 'ACTIVE',
        manualEntry: false,
        breakEntries: [],
        createdAt: new Date(),
        updatedAt: new Date()
      } as TimeEntry;

      mockTimeEntryRepo.getEmployeeTimeStatus.mockResolvedValue({
        id: 'status-123',
        employeeId: mockEmployeeId,
        currentStatus: 'CLOCKED_IN',
        activeTimeEntryId: mockTimeEntryId,
        totalHoursToday: 0,
        lastUpdated: new Date()
      } as EmployeeTimeStatus);
      mockTimeEntryRepo.findById.mockResolvedValue(mockTimeEntry);
      mockBreakEntryRepo.findByTimeEntryId.mockResolvedValue([]);
      mockTimeEntryRepo.update.mockResolvedValue({
        ...mockTimeEntry,
        clockOutTime: lateClockOut,
        totalHours: 10,
        regularHours: 8,
        overtimeHours: 2,
        status: 'COMPLETED'
      } as TimeEntry);

      const result = await service.clockOut(input);

      expect(mockTimeEntryRepo.update).toHaveBeenCalledWith(
        mockTimeEntryId,
        expect.objectContaining({
          totalHours: 10,
          regularHours: 8,
          overtimeHours: 2
        }),
        undefined
      );
    });

    it('should reject exceeding max daily hours', async () => {
      const extremeClockOut = new Date('2024-01-16T02:00:00Z'); // 17 hours total
      const input: ClockOutInput = {
        employeeId: mockEmployeeId,
        clockOutTime: extremeClockOut
      };

      const mockTimeEntry: TimeEntry = {
        id: mockTimeEntryId,
        employeeId: mockEmployeeId,
        clockInTime: mockClockInTime,
        status: 'ACTIVE',
        manualEntry: false,
        breakEntries: [],
        createdAt: new Date(),
        updatedAt: new Date()
      } as TimeEntry;

      mockTimeEntryRepo.getEmployeeTimeStatus.mockResolvedValue({
        id: 'status-123',
        employeeId: mockEmployeeId,
        currentStatus: 'CLOCKED_IN',
        activeTimeEntryId: mockTimeEntryId,
        totalHoursToday: 0,
        lastUpdated: new Date()
      } as EmployeeTimeStatus);
      mockTimeEntryRepo.findById.mockResolvedValue(mockTimeEntry);
      mockBreakEntryRepo.findByTimeEntryId.mockResolvedValue([]);

      await expect(service.clockOut(input)).rejects.toThrow(ValidationError);
      await expect(service.clockOut(input)).rejects.toThrow('exceeds maximum daily hours');
    });
  });

  describe('startBreak', () => {
    const mockEmployeeId = 'emp-123';
    const mockTimeEntryId = 'entry-123';
    const mockClockInTime = new Date('2024-01-15T09:00:00Z');
    const mockBreakStartTime = new Date('2024-01-15T12:00:00Z');

    it('should successfully start a lunch break', async () => {
      const input: StartBreakInput = {
        employeeId: mockEmployeeId,
        breakType: 'LUNCH',
        startTime: mockBreakStartTime
      };

      const mockTimeEntry: TimeEntry = {
        id: mockTimeEntryId,
        employeeId: mockEmployeeId,
        clockInTime: mockClockInTime,
        status: 'ACTIVE',
        manualEntry: false,
        breakEntries: [],
        createdAt: new Date(),
        updatedAt: new Date()
      } as TimeEntry;

      const mockBreakEntry = {
        id: 'break-123',
        timeEntryId: mockTimeEntryId,
        breakType: 'LUNCH' as const,
        startTime: mockBreakStartTime,
        paid: false
      };

      mockTimeEntryRepo.getEmployeeTimeStatus.mockResolvedValue({
        id: 'status-123',
        employeeId: mockEmployeeId,
        currentStatus: 'CLOCKED_IN',
        activeTimeEntryId: mockTimeEntryId,
        totalHoursToday: 3,
        lastUpdated: new Date()
      } as EmployeeTimeStatus);
      mockTimeEntryRepo.findById.mockResolvedValue(mockTimeEntry);
      mockBreakEntryRepo.create.mockResolvedValue(mockBreakEntry as any);

      const result = await service.startBreak(input);

      expect(result.breakType).toBe('LUNCH');
      expect(result.paid).toBe(false); // Lunch is unpaid by default
      expect(mockBreakEntryRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          timeEntryId: mockTimeEntryId,
          breakType: 'LUNCH',
          startTime: mockBreakStartTime,
          paid: false
        }),
        undefined
      );
    });

    it('should successfully start a paid short break', async () => {
      const input: StartBreakInput = {
        employeeId: mockEmployeeId,
        breakType: 'SHORT_BREAK',
        startTime: mockBreakStartTime
      };

      const mockTimeEntry: TimeEntry = {
        id: mockTimeEntryId,
        employeeId: mockEmployeeId,
        clockInTime: mockClockInTime,
        status: 'ACTIVE',
        manualEntry: false,
        breakEntries: [],
        createdAt: new Date(),
        updatedAt: new Date()
      } as TimeEntry;

      const mockBreakEntry = {
        id: 'break-123',
        timeEntryId: mockTimeEntryId,
        breakType: 'SHORT_BREAK' as const,
        startTime: mockBreakStartTime,
        paid: true
      };

      mockTimeEntryRepo.getEmployeeTimeStatus.mockResolvedValue({
        id: 'status-123',
        employeeId: mockEmployeeId,
        currentStatus: 'CLOCKED_IN',
        activeTimeEntryId: mockTimeEntryId,
        totalHoursToday: 3,
        lastUpdated: new Date()
      } as EmployeeTimeStatus);
      mockTimeEntryRepo.findById.mockResolvedValue(mockTimeEntry);
      mockBreakEntryRepo.create.mockResolvedValue(mockBreakEntry as any);

      const result = await service.startBreak(input);

      expect(result.paid).toBe(true); // Short breaks are paid by default
    });

    it('should reject future break start time', async () => {
      const futureTime = new Date(Date.now() + 3600000);
      const input: StartBreakInput = {
        employeeId: mockEmployeeId,
        breakType: 'LUNCH',
        startTime: futureTime
      };

      await expect(service.startBreak(input)).rejects.toThrow(ValidationError);
      await expect(service.startBreak(input)).rejects.toThrow('Break start time cannot be in the future');
    });

    it('should reject starting break when not clocked in', async () => {
      const input: StartBreakInput = {
        employeeId: mockEmployeeId,
        breakType: 'LUNCH',
        startTime: mockBreakStartTime
      };

      mockTimeEntryRepo.getEmployeeTimeStatus.mockResolvedValue({
        id: 'status-123',
        employeeId: mockEmployeeId,
        currentStatus: 'CLOCKED_OUT',
        totalHoursToday: 0,
        lastUpdated: new Date()
      } as EmployeeTimeStatus);

      await expect(service.startBreak(input)).rejects.toThrow(AppError);
      await expect(service.startBreak(input)).rejects.toThrow('Cannot start break. Current status: CLOCKED_OUT');
    });

    it('should reject break start before clock in', async () => {
      const earlyBreak = new Date('2024-01-15T08:00:00Z');
      const input: StartBreakInput = {
        employeeId: mockEmployeeId,
        breakType: 'LUNCH',
        startTime: earlyBreak
      };

      const mockTimeEntry: TimeEntry = {
        id: mockTimeEntryId,
        employeeId: mockEmployeeId,
        clockInTime: mockClockInTime,
        status: 'ACTIVE',
        manualEntry: false,
        breakEntries: [],
        createdAt: new Date(),
        updatedAt: new Date()
      } as TimeEntry;

      mockTimeEntryRepo.getEmployeeTimeStatus.mockResolvedValue({
        id: 'status-123',
        employeeId: mockEmployeeId,
        currentStatus: 'CLOCKED_IN',
        activeTimeEntryId: mockTimeEntryId,
        totalHoursToday: 0,
        lastUpdated: new Date()
      } as EmployeeTimeStatus);
      mockTimeEntryRepo.findById.mockResolvedValue(mockTimeEntry);

      await expect(service.startBreak(input)).rejects.toThrow(ValidationError);
      await expect(service.startBreak(input)).rejects.toThrow('Break start time must be after clock in time');
    });
  });

  describe('endBreak', () => {
    const mockEmployeeId = 'emp-123';
    const mockTimeEntryId = 'entry-123';
    const mockBreakId = 'break-123';
    const mockBreakStartTime = new Date('2024-01-15T12:00:00Z');
    const mockBreakEndTime = new Date('2024-01-15T12:30:00Z');

    it('should successfully end a break', async () => {
      const input: EndBreakInput = {
        employeeId: mockEmployeeId,
        endTime: mockBreakEndTime
      };

      const mockBreakEntry = {
        id: mockBreakId,
        timeEntryId: mockTimeEntryId,
        breakType: 'LUNCH' as const,
        startTime: mockBreakStartTime,
        paid: false
      };

      const mockUpdatedBreak = {
        ...mockBreakEntry,
        endTime: mockBreakEndTime,
        duration: 30
      };

      mockTimeEntryRepo.getEmployeeTimeStatus.mockResolvedValue({
        id: 'status-123',
        employeeId: mockEmployeeId,
        currentStatus: 'ON_BREAK',
        activeTimeEntryId: mockTimeEntryId,
        activeBreakEntryId: mockBreakId,
        totalHoursToday: 3,
        lastUpdated: new Date()
      } as EmployeeTimeStatus);
      mockBreakEntryRepo.findById.mockResolvedValue(mockBreakEntry as any);
      mockBreakEntryRepo.update.mockResolvedValue(mockUpdatedBreak as any);

      const result = await service.endBreak(input);

      expect(result.duration).toBe(30);
      expect(mockBreakEntryRepo.update).toHaveBeenCalledWith(
        mockBreakId,
        expect.objectContaining({
          endTime: mockBreakEndTime,
          duration: 30
        }),
        undefined
      );
    });

    it('should reject future break end time', async () => {
      const futureTime = new Date(Date.now() + 3600000);
      const input: EndBreakInput = {
        employeeId: mockEmployeeId,
        endTime: futureTime
      };

      await expect(service.endBreak(input)).rejects.toThrow(ValidationError);
      await expect(service.endBreak(input)).rejects.toThrow('Break end time cannot be in the future');
    });

    it('should reject ending break when not on break', async () => {
      const input: EndBreakInput = {
        employeeId: mockEmployeeId,
        endTime: mockBreakEndTime
      };

      mockTimeEntryRepo.getEmployeeTimeStatus.mockResolvedValue({
        id: 'status-123',
        employeeId: mockEmployeeId,
        currentStatus: 'CLOCKED_IN',
        activeTimeEntryId: mockTimeEntryId,
        totalHoursToday: 3,
        lastUpdated: new Date()
      } as EmployeeTimeStatus);

      await expect(service.endBreak(input)).rejects.toThrow(AppError);
      await expect(service.endBreak(input)).rejects.toThrow('Cannot end break. Current status: CLOCKED_IN');
    });

    it('should reject break end before break start', async () => {
      const earlyEnd = new Date('2024-01-15T11:00:00Z');
      const input: EndBreakInput = {
        employeeId: mockEmployeeId,
        endTime: earlyEnd
      };

      const mockBreakEntry = {
        id: mockBreakId,
        timeEntryId: mockTimeEntryId,
        breakType: 'LUNCH' as const,
        startTime: mockBreakStartTime,
        paid: false
      };

      mockTimeEntryRepo.getEmployeeTimeStatus.mockResolvedValue({
        id: 'status-123',
        employeeId: mockEmployeeId,
        currentStatus: 'ON_BREAK',
        activeTimeEntryId: mockTimeEntryId,
        activeBreakEntryId: mockBreakId,
        totalHoursToday: 3,
        lastUpdated: new Date()
      } as EmployeeTimeStatus);
      mockBreakEntryRepo.findById.mockResolvedValue(mockBreakEntry as any);

      await expect(service.endBreak(input)).rejects.toThrow(ValidationError);
      await expect(service.endBreak(input)).rejects.toThrow('Break end time must be after start time');
    });
  });

  describe('getCurrentStatus', () => {
    it('should return current employee time status', async () => {
      const mockEmployeeId = 'emp-123';
      const mockStatus: EmployeeTimeStatus = {
        id: 'status-123',
        employeeId: mockEmployeeId,
        currentStatus: 'CLOCKED_IN',
        activeTimeEntryId: 'entry-123',
        totalHoursToday: 5.5,
        lastUpdated: new Date()
      } as EmployeeTimeStatus;

      mockTimeEntryRepo.getEmployeeTimeStatus.mockResolvedValue(mockStatus);

      const result = await service.getCurrentStatus(mockEmployeeId);

      expect(result).toEqual(mockStatus);
      expect(result.currentStatus).toBe('CLOCKED_IN');
      expect(result.totalHoursToday).toBe(5.5);
    });
  });

  describe('autoClockOutStaleEntries', () => {
    it('should auto clock out entries exceeding max hours', async () => {
      const oldClockInTime = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25 hours ago

      const staleEntry: TimeEntry = {
        id: 'stale-123',
        employeeId: 'emp-123',
        clockInTime: oldClockInTime,
        status: 'ACTIVE',
        manualEntry: false,
        breakEntries: [],
        createdAt: oldClockInTime,
        updatedAt: oldClockInTime
      } as TimeEntry;

      mockTimeEntryRepo.findAll.mockResolvedValue({
        data: [staleEntry],
        pagination: { page: 1, limit: 10, total: 1, totalPages: 1 }
      });

      mockTimeEntryRepo.getEmployeeTimeStatus.mockResolvedValue({
        id: 'status-123',
        employeeId: 'emp-123',
        currentStatus: 'CLOCKED_IN',
        activeTimeEntryId: 'stale-123',
        totalHoursToday: 24,
        lastUpdated: new Date()
      } as EmployeeTimeStatus);

      mockTimeEntryRepo.findById.mockResolvedValue(staleEntry);
      mockBreakEntryRepo.findByTimeEntryId.mockResolvedValue([]);
      mockTimeEntryRepo.update.mockResolvedValue({
        ...staleEntry,
        clockOutTime: new Date(oldClockInTime.getTime() + 24 * 60 * 60 * 1000),
        status: 'COMPLETED',
        totalHours: 24,
        regularHours: 8,
        overtimeHours: 16
      } as TimeEntry);

      const results = await service.autoClockOutStaleEntries();

      expect(results).toHaveLength(1);
      expect(results[0].status).toBe('COMPLETED');
    });

    it('should skip entries within the threshold', async () => {
      const recentClockInTime = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago

      const recentEntry: TimeEntry = {
        id: 'recent-123',
        employeeId: 'emp-123',
        clockInTime: recentClockInTime,
        status: 'ACTIVE',
        manualEntry: false,
        breakEntries: [],
        createdAt: recentClockInTime,
        updatedAt: recentClockInTime
      } as TimeEntry;

      mockTimeEntryRepo.findAll.mockResolvedValue({
        data: [recentEntry],
        pagination: { page: 1, limit: 10, total: 1, totalPages: 1 }
      });

      const results = await service.autoClockOutStaleEntries();

      expect(results).toHaveLength(0);
      expect(mockTimeEntryRepo.update).not.toHaveBeenCalled();
    });
  });

  describe('submitManualEntry', () => {
    const mockEmployeeId = 'emp-123';
    const mockSubmittedBy = 'manager-456';
    const mockClockInTime = new Date('2024-01-15T09:00:00Z');
    const mockClockOutTime = new Date('2024-01-15T17:00:00Z');

    it('should successfully submit manual entry requiring approval', async () => {
      const input = {
        employeeId: mockEmployeeId,
        clockInTime: mockClockInTime,
        clockOutTime: mockClockOutTime,
        reason: 'Forgot to clock in',
        submittedBy: mockSubmittedBy
      };

      const mockTimeEntry = {
        id: 'entry-123',
        employeeId: mockEmployeeId,
        clockInTime: mockClockInTime,
        clockOutTime: mockClockOutTime,
        status: 'PENDING_APPROVAL' as const,
        manualEntry: true,
        breakEntries: [],
        createdAt: new Date(),
        updatedAt: new Date()
      } as TimeEntry;

      mockTimeEntryRepo.findAll.mockResolvedValue({
        data: [],
        pagination: { page: 1, limit: 10, total: 0, totalPages: 0 }
      });
      mockTimeEntryRepo.create.mockResolvedValue(mockTimeEntry);

      const result = await service.submitManualEntry(input);

      expect(result.status).toBe('PENDING_APPROVAL');
      expect(result.manualEntry).toBe(true);
      expect(mockTimeEntryRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          employeeId: mockEmployeeId,
          clockInTime: mockClockInTime,
          clockOutTime: mockClockOutTime,
          status: 'PENDING_APPROVAL',
          manualEntry: true
        }),
        undefined
      );
    });

    it('should auto-approve manual entry when approval not required', async () => {
      const serviceNoApproval = new TimeTrackingService(
        mockTimeEntryRepo,
        mockBreakEntryRepo,
        { requireApprovalForManualEntry: false }
      );

      const input = {
        employeeId: mockEmployeeId,
        clockInTime: mockClockInTime,
        clockOutTime: mockClockOutTime,
        reason: 'Forgot to clock in',
        submittedBy: mockSubmittedBy
      };

      const mockTimeEntry = {
        id: 'entry-123',
        employeeId: mockEmployeeId,
        clockInTime: mockClockInTime,
        clockOutTime: mockClockOutTime,
        status: 'COMPLETED' as const,
        manualEntry: true,
        breakEntries: [],
        createdAt: new Date(),
        updatedAt: new Date()
      } as TimeEntry;

      mockTimeEntryRepo.findAll.mockResolvedValue({
        data: [],
        pagination: { page: 1, limit: 10, total: 0, totalPages: 0 }
      });
      mockTimeEntryRepo.create.mockResolvedValue(mockTimeEntry);
      mockTimeEntryRepo.update.mockResolvedValue({
        ...mockTimeEntry,
        totalHours: 8,
        regularHours: 8,
        overtimeHours: 0
      } as TimeEntry);

      const result = await serviceNoApproval.submitManualEntry(input);

      expect(mockTimeEntryRepo.update).toHaveBeenCalledWith(
        'entry-123',
        expect.objectContaining({
          totalHours: expect.any(Number),
          regularHours: expect.any(Number),
          overtimeHours: expect.any(Number)
        }),
        undefined
      );
    });

    it('should reject manual entry with clock out before clock in', async () => {
      const input = {
        employeeId: mockEmployeeId,
        clockInTime: mockClockOutTime,
        clockOutTime: mockClockInTime,
        reason: 'Test',
        submittedBy: mockSubmittedBy
      };

      await expect(service.submitManualEntry(input)).rejects.toThrow(ValidationError);
      await expect(service.submitManualEntry(input)).rejects.toThrow('Clock out time must be after clock in time');
    });

    it('should reject manual entry too far in the past', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 31); // 31 days ago (past maxPastDaysForManualEntry)

      const input = {
        employeeId: mockEmployeeId,
        clockInTime: oldDate,
        clockOutTime: new Date(oldDate.getTime() + 8 * 60 * 60 * 1000),
        reason: 'Test',
        submittedBy: mockSubmittedBy
      };

      await expect(service.submitManualEntry(input)).rejects.toThrow(ValidationError);
      await expect(service.submitManualEntry(input)).rejects.toThrow('more than 30 days in the past');
    });

    it('should reject overlapping manual entries', async () => {
      const input = {
        employeeId: mockEmployeeId,
        clockInTime: mockClockInTime,
        clockOutTime: mockClockOutTime,
        reason: 'Test',
        submittedBy: mockSubmittedBy
      };

      const existingEntry = {
        id: 'existing-123',
        employeeId: mockEmployeeId,
        clockInTime: new Date('2024-01-15T08:00:00Z'),
        clockOutTime: new Date('2024-01-15T16:00:00Z'),
        status: 'COMPLETED' as const,
        manualEntry: false,
        breakEntries: [],
        createdAt: new Date(),
        updatedAt: new Date()
      } as TimeEntry;

      mockTimeEntryRepo.findAll.mockResolvedValue({
        data: [existingEntry],
        pagination: { page: 1, limit: 10, total: 1, totalPages: 1 }
      });

      await expect(service.submitManualEntry(input)).rejects.toThrow(AppError);
      await expect(service.submitManualEntry(input)).rejects.toThrow('overlaps with existing entry');
    });
  });

  describe('submitTimeEntryCorrection', () => {
    const mockEmployeeId = 'emp-123';
    const mockTimeEntryId = 'entry-123';
    const mockClockInTime = new Date('2024-01-15T09:00:00Z');
    const mockClockOutTime = new Date('2024-01-15T17:00:00Z');

    it('should successfully submit correction requiring approval', async () => {
      const existingEntry = {
        id: mockTimeEntryId,
        employeeId: mockEmployeeId,
        clockInTime: mockClockInTime,
        clockOutTime: mockClockOutTime,
        status: 'COMPLETED' as const,
        manualEntry: false,
        breakEntries: [],
        createdAt: new Date(),
        updatedAt: new Date()
      } as TimeEntry;

      const newClockInTime = new Date('2024-01-15T08:30:00Z');

      const input = {
        timeEntryId: mockTimeEntryId,
        clockInTime: newClockInTime,
        reason: 'Incorrect clock in time',
        requestedBy: mockEmployeeId
      };

      mockTimeEntryRepo.findById.mockResolvedValue(existingEntry);
      mockTimeEntryRepo.findAll.mockResolvedValue({
        data: [],
        pagination: { page: 1, limit: 10, total: 0, totalPages: 0 }
      });
      mockTimeEntryRepo.update.mockResolvedValue({
        ...existingEntry,
        clockInTime: newClockInTime,
        status: 'PENDING_APPROVAL'
      } as TimeEntry);

      const result = await service.submitTimeEntryCorrection(input);

      expect(result.status).toBe('PENDING_APPROVAL');
      expect(mockTimeEntryRepo.update).toHaveBeenCalledWith(
        mockTimeEntryId,
        expect.objectContaining({
          clockInTime: newClockInTime,
          status: 'PENDING_APPROVAL'
        }),
        undefined
      );
    });

    it('should reject correction for another employee', async () => {
      const existingEntry = {
        id: mockTimeEntryId,
        employeeId: 'other-employee',
        clockInTime: mockClockInTime,
        clockOutTime: mockClockOutTime,
        status: 'COMPLETED' as const,
        manualEntry: false,
        breakEntries: [],
        createdAt: new Date(),
        updatedAt: new Date()
      } as TimeEntry;

      const input = {
        timeEntryId: mockTimeEntryId,
        clockInTime: new Date('2024-01-15T08:30:00Z'),
        reason: 'Test',
        requestedBy: mockEmployeeId
      };

      mockTimeEntryRepo.findById.mockResolvedValue(existingEntry);

      await expect(service.submitTimeEntryCorrection(input)).rejects.toThrow(AppError);
      await expect(service.submitTimeEntryCorrection(input)).rejects.toThrow('Cannot correct time entries for other employees');
    });

    it('should reject correction for pending entry', async () => {
      const existingEntry = {
        id: mockTimeEntryId,
        employeeId: mockEmployeeId,
        clockInTime: mockClockInTime,
        clockOutTime: mockClockOutTime,
        status: 'PENDING_APPROVAL' as const,
        manualEntry: false,
        breakEntries: [],
        createdAt: new Date(),
        updatedAt: new Date()
      } as TimeEntry;

      const input = {
        timeEntryId: mockTimeEntryId,
        clockInTime: new Date('2024-01-15T08:30:00Z'),
        reason: 'Test',
        requestedBy: mockEmployeeId
      };

      mockTimeEntryRepo.findById.mockResolvedValue(existingEntry);

      await expect(service.submitTimeEntryCorrection(input)).rejects.toThrow(AppError);
      await expect(service.submitTimeEntryCorrection(input)).rejects.toThrow('Cannot correct entry that is pending approval');
    });
  });

  describe('approveTimeEntry', () => {
    const mockTimeEntryId = 'entry-123';
    const mockApproverId = 'manager-456';

    it('should approve pending time entry', async () => {
      const pendingEntry = {
        id: mockTimeEntryId,
        employeeId: 'emp-123',
        clockInTime: new Date('2024-01-15T09:00:00Z'),
        clockOutTime: new Date('2024-01-15T17:00:00Z'),
        status: 'PENDING_APPROVAL' as const,
        manualEntry: true,
        breakEntries: [],
        createdAt: new Date(),
        updatedAt: new Date()
      } as TimeEntry;

      const approvedEntry = {
        ...pendingEntry,
        status: 'COMPLETED' as const,
        approvedBy: mockApproverId,
        approvedAt: new Date(),
        totalHours: 8,
        regularHours: 8,
        overtimeHours: 0
      } as TimeEntry;

      mockTimeEntryRepo.findById.mockResolvedValue(pendingEntry);
      mockTimeEntryRepo.update.mockResolvedValue(approvedEntry);

      const result = await service.approveTimeEntry({
        timeEntryId: mockTimeEntryId,
        approvedBy: mockApproverId
      });

      expect(result.status).toBe('COMPLETED');
      expect(result.approvedBy).toBe(mockApproverId);
      expect(mockTimeEntryRepo.update).toHaveBeenCalledWith(
        mockTimeEntryId,
        expect.objectContaining({
          status: 'COMPLETED',
          approvedBy: mockApproverId
        }),
        undefined
      );
    });

    it('should reject approval for non-pending entry', async () => {
      const completedEntry = {
        id: mockTimeEntryId,
        employeeId: 'emp-123',
        clockInTime: new Date(),
        status: 'COMPLETED' as const,
        manualEntry: true,
        breakEntries: [],
        createdAt: new Date(),
        updatedAt: new Date()
      } as TimeEntry;

      mockTimeEntryRepo.findById.mockResolvedValue(completedEntry);

      await expect(service.approveTimeEntry({
        timeEntryId: mockTimeEntryId,
        approvedBy: mockApproverId
      })).rejects.toThrow(AppError);
      await expect(service.approveTimeEntry({
        timeEntryId: mockTimeEntryId,
        approvedBy: mockApproverId
      })).rejects.toThrow('Time entry is not pending approval');
    });
  });

  describe('rejectTimeEntry', () => {
    const mockTimeEntryId = 'entry-123';
    const mockRejectedBy = 'manager-456';

    it('should delete rejected manual entry', async () => {
      const pendingEntry = {
        id: mockTimeEntryId,
        employeeId: 'emp-123',
        clockInTime: new Date(),
        clockOutTime: new Date(),
        status: 'PENDING_APPROVAL' as const,
        manualEntry: true,
        breakEntries: [],
        createdAt: new Date(),
        updatedAt: new Date()
      } as TimeEntry;

      mockTimeEntryRepo.findById.mockResolvedValue(pendingEntry);
      mockTimeEntryRepo.delete.mockResolvedValue(true);

      await service.rejectTimeEntry({
        timeEntryId: mockTimeEntryId,
        rejectedBy: mockRejectedBy,
        reason: 'Insufficient justification'
      });

      expect(mockTimeEntryRepo.delete).toHaveBeenCalledWith(mockTimeEntryId, undefined);
    });

    it('should revert rejected correction', async () => {
      const pendingCorrection = {
        id: mockTimeEntryId,
        employeeId: 'emp-123',
        clockInTime: new Date(),
        clockOutTime: new Date(),
        status: 'PENDING_APPROVAL' as const,
        manualEntry: false, // This is a correction
        breakEntries: [],
        createdAt: new Date(),
        updatedAt: new Date()
      } as TimeEntry;

      mockTimeEntryRepo.findById.mockResolvedValue(pendingCorrection);
      mockTimeEntryRepo.update.mockResolvedValue({
        ...pendingCorrection,
        status: 'COMPLETED'
      } as TimeEntry);

      await service.rejectTimeEntry({
        timeEntryId: mockTimeEntryId,
        rejectedBy: mockRejectedBy,
        reason: 'Correction not justified'
      });

      expect(mockTimeEntryRepo.update).toHaveBeenCalledWith(
        mockTimeEntryId,
        expect.objectContaining({
          status: 'COMPLETED'
        }),
        undefined
      );
    });
  });

  describe('getPendingApprovals', () => {
    it('should return all pending approvals', async () => {
      const pendingEntries = [
        {
          id: 'entry-1',
          employeeId: 'emp-123',
          clockInTime: new Date(),
          status: 'PENDING_APPROVAL' as const,
          manualEntry: true,
          breakEntries: [],
          createdAt: new Date(),
          updatedAt: new Date()
        } as TimeEntry,
        {
          id: 'entry-2',
          employeeId: 'emp-456',
          clockInTime: new Date(),
          status: 'PENDING_APPROVAL' as const,
          manualEntry: true,
          breakEntries: [],
          createdAt: new Date(),
          updatedAt: new Date()
        } as TimeEntry
      ];

      mockTimeEntryRepo.findAll.mockResolvedValue({
        data: pendingEntries,
        pagination: { page: 1, limit: 10, total: 2, totalPages: 1 }
      });

      const result = await service.getPendingApprovals();

      expect(result).toHaveLength(2);
      expect(result[0].status).toBe('PENDING_APPROVAL');
      expect(result[1].status).toBe('PENDING_APPROVAL');
    });
  });
});
