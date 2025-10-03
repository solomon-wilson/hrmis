import { TimeEntryRepository, TimeEntryCreateInput } from '../../database/repositories/time-attendance/TimeEntryRepository';
import { BreakEntryRepository, BreakEntryCreateInput, BreakEntryUpdateInput } from '../../database/repositories/time-attendance/BreakEntryRepository';
import { TimeEntry, BreakEntry, GeoLocation, BreakEntryData } from '../../models/time-attendance/TimeEntry';
import { EmployeeTimeStatus } from '../../models/time-attendance/EmployeeTimeStatus';
import { TimeCalculationEngine } from '../../models/time-attendance/TimeCalculationEngine';
import { ValidationError } from '../../utils/validation';
import { AppError } from '../../utils/errors';

export interface ClockInInput {
  employeeId: string;
  clockInTime?: Date;
  location?: GeoLocation;
  notes?: string;
}

export interface ClockOutInput {
  employeeId: string;
  clockOutTime?: Date;
  location?: GeoLocation;
  notes?: string;
}

export interface StartBreakInput {
  employeeId: string;
  breakType: 'LUNCH' | 'SHORT_BREAK' | 'PERSONAL';
  startTime?: Date;
  paid?: boolean;
  notes?: string;
}

export interface EndBreakInput {
  employeeId: string;
  endTime?: Date;
  notes?: string;
}

export interface TimeTrackingConfig {
  allowFutureClockIn: boolean;
  maxClockInDistance?: number; // meters
  requireLocation: boolean;
  maxDailyHours: number;
  overtimeThreshold: number;
  doubleTimeThreshold: number;
  autoClockOutAfterHours: number;
}

export class TimeTrackingService {
  private timeEntryRepository: TimeEntryRepository;
  private breakEntryRepository: BreakEntryRepository;
  private calculationEngine: TimeCalculationEngine;
  private config: TimeTrackingConfig;

  constructor(
    timeEntryRepository?: TimeEntryRepository,
    breakEntryRepository?: BreakEntryRepository,
    config?: Partial<TimeTrackingConfig>
  ) {
    this.timeEntryRepository = timeEntryRepository || new TimeEntryRepository();
    this.breakEntryRepository = breakEntryRepository || new BreakEntryRepository();
    this.calculationEngine = new TimeCalculationEngine();
    this.config = {
      allowFutureClockIn: false,
      requireLocation: false,
      maxDailyHours: 16,
      overtimeThreshold: 8,
      doubleTimeThreshold: 12,
      autoClockOutAfterHours: 24,
      ...config
    };
  }

  /**
   * Clock in an employee
   * Validates duplicate prevention, location, and business rules
   */
  async clockIn(input: ClockInInput, userContext?: string): Promise<TimeEntry> {
    const clockInTime = input.clockInTime || new Date();

    // Validate clock in time
    this.validateClockInTime(clockInTime);

    // Validate location if required
    if (this.config.requireLocation && !input.location) {
      throw new ValidationError('Location is required for clock in', [
        { field: 'location', message: 'Location is required' }
      ]);
    }

    // Check for duplicate clock in
    await this.checkDuplicateClockIn(input.employeeId, clockInTime, userContext);

    // Check for incomplete time entries
    const allIncompleteEntries = await this.timeEntryRepository.findIncompleteEntries(
      userContext
    );

    const employeeIncompleteEntries = allIncompleteEntries.filter(
      entry => entry.employeeId === input.employeeId
    );

    if (employeeIncompleteEntries.length > 0) {
      throw new AppError(
        'Cannot clock in with incomplete time entries',
        'INCOMPLETE_ENTRIES',
        409,
        { incompleteEntries: employeeIncompleteEntries }
      );
    }

    // Get current employee status
    const currentStatus = await this.getCurrentStatus(input.employeeId, userContext);

    if (currentStatus.currentStatus !== 'CLOCKED_OUT') {
      throw new AppError(
        `Cannot clock in. Current status: ${currentStatus.currentStatus}`,
        'INVALID_STATUS',
        409,
        { currentStatus: currentStatus.currentStatus }
      );
    }

    // Create time entry
    const timeEntryData: TimeEntryCreateInput = {
      employeeId: input.employeeId,
      clockInTime,
      location: input.location,
      status: 'ACTIVE',
      manualEntry: false,
      notes: input.notes
    };

    const timeEntry = await this.timeEntryRepository.create(timeEntryData, userContext);

    // Update employee status
    await this.updateEmployeeStatus(
      input.employeeId,
      'CLOCKED_IN',
      timeEntry.id,
      clockInTime,
      userContext
    );

    return timeEntry;
  }

  /**
   * Clock out an employee
   * Calculates hours and validates business rules
   */
  async clockOut(input: ClockOutInput, userContext?: string): Promise<TimeEntry> {
    const clockOutTime = input.clockOutTime || new Date();

    // Validate clock out time
    if (clockOutTime > new Date()) {
      throw new ValidationError('Clock out time cannot be in the future', [
        { field: 'clockOutTime', message: 'Cannot be in the future' }
      ]);
    }

    // Get current employee status
    const currentStatus = await this.getCurrentStatus(input.employeeId, userContext);

    if (currentStatus.currentStatus === 'CLOCKED_OUT') {
      throw new AppError(
        'Employee is not clocked in',
        'NOT_CLOCKED_IN',
        409,
        { currentStatus: currentStatus.currentStatus }
      );
    }

    if (currentStatus.currentStatus === 'ON_BREAK') {
      throw new AppError(
        'Cannot clock out while on break. End break first.',
        'ON_BREAK',
        409,
        { currentStatus: currentStatus.currentStatus }
      );
    }

    if (!currentStatus.activeTimeEntryId) {
      throw new AppError('No active time entry found', 'NO_ACTIVE_ENTRY', 404);
    }

    // Get active time entry
    const timeEntry = await this.timeEntryRepository.findById(
      currentStatus.activeTimeEntryId,
      userContext
    );

    if (!timeEntry) {
      throw new AppError('Active time entry not found', 'TIME_ENTRY_NOT_FOUND', 404);
    }

    // Validate clock out time is after clock in
    if (clockOutTime <= timeEntry.clockInTime) {
      throw new ValidationError('Clock out time must be after clock in time', [
        { field: 'clockOutTime', message: 'Must be after clock in time' }
      ]);
    }

    // Calculate hours
    const breakEntries = await this.breakEntryRepository.findByTimeEntry(
      timeEntry.id,
      userContext
    );

    // Build time entry data for calculation (without using constructor to avoid validation)
    const entryForCalculation = {
      ...timeEntry,
      clockOutTime,
      breakEntries,
      // Methods needed by calculation engine
      getTotalBreakTime: function() {
        return breakEntries.reduce((sum, b) => sum + (b.duration || 0), 0);
      },
      getUnpaidBreakTime: function() {
        return breakEntries.filter(b => !b.paid).reduce((sum, b) => sum + (b.duration || 0), 0);
      },
      getPaidBreakTime: function() {
        return breakEntries.filter(b => b.paid).reduce((sum, b) => sum + (b.duration || 0), 0);
      }
    } as TimeEntry;

    const calculations = this.calculationEngine.calculateTimeEntryHours(entryForCalculation);

    // Validate max daily hours
    if (calculations.totalHours > this.config.maxDailyHours) {
      throw new ValidationError(
        `Total hours (${calculations.totalHours}) exceeds maximum daily hours (${this.config.maxDailyHours})`,
        [{ field: 'hours', message: 'Exceeds maximum daily hours' }]
      );
    }

    // Update time entry
    const updatedEntry = await this.timeEntryRepository.update(
      timeEntry.id,
      {
        clockOutTime,
        totalHours: calculations.totalHours,
        regularHours: calculations.regularHours,
        overtimeHours: calculations.overtimeHours,
        status: 'COMPLETED',
        notes: input.notes ? `${timeEntry.notes || ''}\n${input.notes}` : timeEntry.notes
      },
      userContext
    );

    // Update employee status
    await this.updateEmployeeStatus(
      input.employeeId,
      'CLOCKED_OUT',
      undefined,
      undefined,
      userContext
    );

    return updatedEntry;
  }

  /**
   * Start a break for an employee
   */
  async startBreak(input: StartBreakInput, userContext?: string): Promise<BreakEntry> {
    const startTime = input.startTime || new Date();

    // Validate start time
    if (startTime > new Date()) {
      throw new ValidationError('Break start time cannot be in the future', [
        { field: 'startTime', message: 'Cannot be in the future' }
      ]);
    }

    // Get current employee status
    const currentStatus = await this.getCurrentStatus(input.employeeId, userContext);

    if (currentStatus.currentStatus !== 'CLOCKED_IN') {
      throw new AppError(
        `Cannot start break. Current status: ${currentStatus.currentStatus}`,
        'INVALID_STATUS',
        409,
        { currentStatus: currentStatus.currentStatus }
      );
    }

    if (!currentStatus.activeTimeEntryId) {
      throw new AppError('No active time entry found', 'NO_ACTIVE_ENTRY', 404);
    }

    // Get active time entry
    const timeEntry = await this.timeEntryRepository.findById(
      currentStatus.activeTimeEntryId,
      userContext
    );

    if (!timeEntry) {
      throw new AppError('Active time entry not found', 'TIME_ENTRY_NOT_FOUND', 404);
    }

    // Validate break start time is after clock in
    if (startTime <= timeEntry.clockInTime) {
      throw new ValidationError('Break start time must be after clock in time', [
        { field: 'startTime', message: 'Must be after clock in time' }
      ]);
    }

    // Determine if break is paid based on type and policy
    const paid = input.paid !== undefined ? input.paid : this.isBreakPaid(input.breakType);

    // Create break entry
    const breakEntryInput: BreakEntryCreateInput = {
      timeEntryId: timeEntry.id,
      breakType: input.breakType,
      startTime,
      paid
    };

    const breakEntry = await this.breakEntryRepository.create(
      breakEntryInput,
      userContext
    );

    // Update employee status
    await this.updateEmployeeStatus(
      input.employeeId,
      'ON_BREAK',
      timeEntry.id,
      undefined,
      userContext,
      breakEntry.id
    );

    return breakEntry;
  }

  /**
   * End a break for an employee
   */
  async endBreak(input: EndBreakInput, userContext?: string): Promise<BreakEntry> {
    const endTime = input.endTime || new Date();

    // Validate end time
    if (endTime > new Date()) {
      throw new ValidationError('Break end time cannot be in the future', [
        { field: 'endTime', message: 'Cannot be in the future' }
      ]);
    }

    // Get current employee status
    const currentStatus = await this.getCurrentStatus(input.employeeId, userContext);

    if (currentStatus.currentStatus !== 'ON_BREAK') {
      throw new AppError(
        `Cannot end break. Current status: ${currentStatus.currentStatus}`,
        'INVALID_STATUS',
        409,
        { currentStatus: currentStatus.currentStatus }
      );
    }

    if (!currentStatus.activeBreakEntryId) {
      throw new AppError('No active break entry found', 'NO_ACTIVE_BREAK', 404);
    }

    // Get active break entry
    const breakEntry = await this.breakEntryRepository.findById(
      currentStatus.activeBreakEntryId,
      userContext
    );

    if (!breakEntry) {
      throw new AppError('Active break entry not found', 'BREAK_ENTRY_NOT_FOUND', 404);
    }

    // Validate end time is after start time
    if (endTime <= breakEntry.startTime) {
      throw new ValidationError('Break end time must be after start time', [
        { field: 'endTime', message: 'Must be after start time' }
      ]);
    }

    // Calculate duration
    const duration = Math.round((endTime.getTime() - breakEntry.startTime.getTime()) / (1000 * 60));

    // Update break entry
    const breakUpdateInput: BreakEntryUpdateInput = {
      endTime,
      duration
    };

    const updatedBreak = await this.breakEntryRepository.update(
      breakEntry.id,
      breakUpdateInput,
      userContext
    );

    // Update employee status back to clocked in
    await this.updateEmployeeStatus(
      input.employeeId,
      'CLOCKED_IN',
      currentStatus.activeTimeEntryId,
      undefined,
      userContext
    );

    return updatedBreak;
  }

  /**
   * Get current time status for an employee
   */
  async getCurrentStatus(employeeId: string, userContext?: string): Promise<EmployeeTimeStatus> {
    return await this.timeEntryRepository.getEmployeeTimeStatus(employeeId, userContext);
  }

  /**
   * Detect and auto-clock-out employees who have exceeded max hours
   */
  async autoClockOutStaleEntries(userContext?: string): Promise<TimeEntry[]> {
    const incompleteEntries = await this.timeEntryRepository.findAll(
      {
        filters: { status: 'ACTIVE' }
      },
      userContext
    );

    const autoClockOuts: TimeEntry[] = [];
    const now = new Date();
    const maxHoursMs = this.config.autoClockOutAfterHours * 60 * 60 * 1000;

    for (const entry of incompleteEntries.data) {
      const timeSinceClockIn = now.getTime() - entry.clockInTime.getTime();

      if (timeSinceClockIn > maxHoursMs) {
        // Auto clock out at the threshold time
        const autoClockOutTime = new Date(entry.clockInTime.getTime() + maxHoursMs);

        try {
          const clockedOut = await this.clockOut(
            {
              employeeId: entry.employeeId,
              clockOutTime: autoClockOutTime,
              notes: `Auto-clocked out after ${this.config.autoClockOutAfterHours} hours`
            },
            userContext
          );
          autoClockOuts.push(clockedOut);
        } catch (error) {
          // Log error but continue processing other entries
          console.error(`Failed to auto-clock-out entry ${entry.id}:`, error);
        }
      }
    }

    return autoClockOuts;
  }

  // Private helper methods

  private validateClockInTime(clockInTime: Date): void {
    if (!this.config.allowFutureClockIn && clockInTime > new Date()) {
      throw new ValidationError('Clock in time cannot be in the future', [
        { field: 'clockInTime', message: 'Cannot be in the future' }
      ]);
    }
  }

  private async checkDuplicateClockIn(
    employeeId: string,
    clockInTime: Date,
    userContext?: string
  ): Promise<void> {
    // Check for existing active entries on the same day
    const startOfDay = new Date(clockInTime);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(clockInTime);
    endOfDay.setHours(23, 59, 59, 999);

    const existingEntries = await this.timeEntryRepository.findAll(
      {
        filters: {
          employeeId,
          status: 'ACTIVE',
          dateRange: { start: startOfDay, end: endOfDay }
        }
      },
      userContext
    );

    if (existingEntries.data.length > 0) {
      throw new AppError(
        'Employee already has an active clock-in for today',
        'DUPLICATE_CLOCK_IN',
        409,
        { existingEntry: existingEntries.data[0] }
      );
    }
  }

  private async updateEmployeeStatus(
    employeeId: string,
    status: 'CLOCKED_OUT' | 'CLOCKED_IN' | 'ON_BREAK',
    activeTimeEntryId?: string,
    lastClockInTime?: Date,
    userContext?: string,
    activeBreakEntryId?: string
  ): Promise<void> {
    // This would update the employee_time_status table
    // For now, we'll rely on the repository's getEmployeeTimeStatus method
    // which derives status from active entries

    // In a full implementation, you would:
    // await this.employeeTimeStatusRepository.upsert({
    //   employeeId,
    //   currentStatus: status,
    //   activeTimeEntryId,
    //   activeBreakEntryId,
    //   lastClockInTime,
    //   lastUpdated: new Date()
    // }, userContext);
  }

  private isBreakPaid(breakType: 'LUNCH' | 'SHORT_BREAK' | 'PERSONAL'): boolean {
    // Default break payment policy
    switch (breakType) {
      case 'SHORT_BREAK':
        return true; // Short breaks are typically paid
      case 'LUNCH':
        return false; // Lunch breaks are typically unpaid
      case 'PERSONAL':
        return false; // Personal breaks are typically unpaid
      default:
        return false;
    }
  }
}
