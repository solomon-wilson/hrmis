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

export interface ManualTimeEntryInput {
  employeeId: string;
  clockInTime: Date;
  clockOutTime: Date;
  breakEntries?: BreakEntryData[];
  reason: string;
  submittedBy: string; // Employee or manager ID who is submitting
  notes?: string;
}

export interface TimeEntryCorrectionInput {
  timeEntryId: string;
  clockInTime?: Date;
  clockOutTime?: Date;
  breakEntries?: BreakEntryData[];
  reason: string;
  requestedBy: string; // Employee ID requesting correction
  notes?: string;
}

export interface ApproveTimeEntryInput {
  timeEntryId: string;
  approvedBy: string; // Manager ID
  notes?: string;
}

export interface RejectTimeEntryInput {
  timeEntryId: string;
  rejectedBy: string; // Manager ID
  reason: string;
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
  requireApprovalForManualEntry: boolean;
  requireApprovalForCorrection: boolean;
  maxPastDaysForManualEntry: number;
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
      requireApprovalForManualEntry: true,
      requireApprovalForCorrection: true,
      maxPastDaysForManualEntry: 30,
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

  /**
   * Submit a manual time entry (for missed clock-in/out)
   * Requires approval if configured
   */
  async submitManualEntry(input: ManualTimeEntryInput, userContext?: string): Promise<TimeEntry> {
    // Validate times
    this.validateManualEntryTimes(input.clockInTime, input.clockOutTime);

    // Validate not too far in the past
    this.validateEntryNotTooOld(input.clockInTime);

    // Check for overlapping entries
    await this.checkForOverlappingEntries(
      input.employeeId,
      input.clockInTime,
      input.clockOutTime,
      userContext
    );

    // Calculate hours
    const breakEntries = input.breakEntries || [];
    const entryForCalculation = {
      clockInTime: input.clockInTime,
      clockOutTime: input.clockOutTime,
      breakEntries: breakEntries.map(b => ({
        ...b,
        duration: b.duration || 0
      })),
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

    // Determine status based on configuration
    const status = this.config.requireApprovalForManualEntry ? 'PENDING_APPROVAL' : 'COMPLETED';

    // Create time entry
    const timeEntryData: TimeEntryCreateInput = {
      employeeId: input.employeeId,
      clockInTime: input.clockInTime,
      clockOutTime: input.clockOutTime,
      breakEntries: input.breakEntries,
      status,
      manualEntry: true,
      notes: `Manual entry - Reason: ${input.reason}${input.notes ? '\n' + input.notes : ''}\nSubmitted by: ${input.submittedBy}`
    };

    const timeEntry = await this.timeEntryRepository.create(timeEntryData, userContext);

    // Update with calculated hours if not requiring approval
    if (!this.config.requireApprovalForManualEntry) {
      return await this.timeEntryRepository.update(
        timeEntry.id,
        {
          totalHours: calculations.totalHours,
          regularHours: calculations.regularHours,
          overtimeHours: calculations.overtimeHours
        },
        userContext
      );
    }

    return timeEntry;
  }

  /**
   * Submit a correction request for an existing time entry
   * Requires approval if configured
   */
  async submitTimeEntryCorrection(
    input: TimeEntryCorrectionInput,
    userContext?: string
  ): Promise<TimeEntry> {
    // Get existing time entry
    const existingEntry = await this.timeEntryRepository.findById(input.timeEntryId, userContext);

    if (!existingEntry) {
      throw new AppError('Time entry not found', 'TIME_ENTRY_NOT_FOUND', 404);
    }

    // Validate employee can only correct their own entries
    if (existingEntry.employeeId !== input.requestedBy) {
      throw new AppError(
        'Cannot correct time entries for other employees',
        'UNAUTHORIZED_CORRECTION',
        403
      );
    }

    // Validate entry is not already pending approval
    if (existingEntry.status === 'PENDING_APPROVAL') {
      throw new AppError(
        'Cannot correct entry that is pending approval',
        'ENTRY_PENDING_APPROVAL',
        409
      );
    }

    const newClockInTime = input.clockInTime || existingEntry.clockInTime;
    const newClockOutTime = input.clockOutTime || existingEntry.clockOutTime;

    // Validate times if changed
    if (input.clockInTime || input.clockOutTime) {
      this.validateManualEntryTimes(newClockInTime, newClockOutTime!);
    }

    // Check for overlapping entries (excluding current entry)
    await this.checkForOverlappingEntries(
      existingEntry.employeeId,
      newClockInTime,
      newClockOutTime!,
      userContext,
      input.timeEntryId
    );

    // If approval is required, create a copy with PENDING_APPROVAL status
    if (this.config.requireApprovalForCorrection) {
      // Store original values in notes for reference
      const correctionNotes = `
CORRECTION REQUEST
Original: ${existingEntry.clockInTime.toISOString()} - ${existingEntry.clockOutTime?.toISOString() || 'N/A'}
Requested: ${newClockInTime.toISOString()} - ${newClockOutTime?.toISOString() || 'N/A'}
Reason: ${input.reason}
${input.notes ? 'Additional notes: ' + input.notes : ''}
Requested by: ${input.requestedBy}
      `.trim();

      return await this.timeEntryRepository.update(
        input.timeEntryId,
        {
          clockInTime: newClockInTime,
          clockOutTime: newClockOutTime,
          status: 'PENDING_APPROVAL',
          notes: `${existingEntry.notes || ''}\n\n${correctionNotes}`
        },
        userContext
      );
    }

    // If no approval required, apply correction immediately
    const breakEntries = input.breakEntries || existingEntry.breakEntries || [];
    const entryForCalculation = {
      clockInTime: newClockInTime,
      clockOutTime: newClockOutTime,
      breakEntries,
      getTotalBreakTime: function() {
        return breakEntries.reduce((sum: number, b) => sum + (b.duration || 0), 0);
      },
      getUnpaidBreakTime: function() {
        return breakEntries.filter(b => !b.paid).reduce((sum: number, b) => sum + (b.duration || 0), 0);
      },
      getPaidBreakTime: function() {
        return breakEntries.filter(b => b.paid).reduce((sum: number, b) => sum + (b.duration || 0), 0);
      }
    } as TimeEntry;

    const calculations = this.calculationEngine.calculateTimeEntryHours(entryForCalculation);

    return await this.timeEntryRepository.update(
      input.timeEntryId,
      {
        clockInTime: newClockInTime,
        clockOutTime: newClockOutTime,
        totalHours: calculations.totalHours,
        regularHours: calculations.regularHours,
        overtimeHours: calculations.overtimeHours,
        status: 'COMPLETED',
        notes: `${existingEntry.notes || ''}\n\nCorrected - Reason: ${input.reason}\nBy: ${input.requestedBy}`
      },
      userContext
    );
  }

  /**
   * Approve a pending time entry or correction
   */
  async approveTimeEntry(input: ApproveTimeEntryInput, userContext?: string): Promise<TimeEntry> {
    const timeEntry = await this.timeEntryRepository.findById(input.timeEntryId, userContext);

    if (!timeEntry) {
      throw new AppError('Time entry not found', 'TIME_ENTRY_NOT_FOUND', 404);
    }

    if (timeEntry.status !== 'PENDING_APPROVAL') {
      throw new AppError(
        'Time entry is not pending approval',
        'NOT_PENDING_APPROVAL',
        409
      );
    }

    // Calculate hours for the approved entry
    if (timeEntry.clockOutTime) {
      const breakEntries = timeEntry.breakEntries || [];
      const entryForCalculation = {
        ...timeEntry,
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

      return await this.timeEntryRepository.update(
        input.timeEntryId,
        {
          status: 'COMPLETED',
          approvedBy: input.approvedBy,
          approvedAt: new Date(),
          totalHours: calculations.totalHours,
          regularHours: calculations.regularHours,
          overtimeHours: calculations.overtimeHours,
          notes: `${timeEntry.notes || ''}\n\nApproved by: ${input.approvedBy}${input.notes ? '\nApproval notes: ' + input.notes : ''}`
        },
        userContext
      );
    }

    return await this.timeEntryRepository.update(
      input.timeEntryId,
      {
        status: 'COMPLETED',
        approvedBy: input.approvedBy,
        approvedAt: new Date(),
        notes: `${timeEntry.notes || ''}\n\nApproved by: ${input.approvedBy}${input.notes ? '\nApproval notes: ' + input.notes : ''}`
      },
      userContext
    );
  }

  /**
   * Reject a pending time entry or correction
   */
  async rejectTimeEntry(input: RejectTimeEntryInput, userContext?: string): Promise<void> {
    const timeEntry = await this.timeEntryRepository.findById(input.timeEntryId, userContext);

    if (!timeEntry) {
      throw new AppError('Time entry not found', 'TIME_ENTRY_NOT_FOUND', 404);
    }

    if (timeEntry.status !== 'PENDING_APPROVAL') {
      throw new AppError(
        'Time entry is not pending approval',
        'NOT_PENDING_APPROVAL',
        409
      );
    }

    // For manual entries, delete them when rejected
    if (timeEntry.manualEntry) {
      await this.timeEntryRepository.delete(input.timeEntryId, userContext);
      return;
    }

    // For corrections, revert to the original state (marked in notes)
    // In a real system, you might store the original values separately
    await this.timeEntryRepository.update(
      input.timeEntryId,
      {
        status: 'COMPLETED',
        notes: `${timeEntry.notes || ''}\n\nCorrection REJECTED by: ${input.rejectedBy}\nReason: ${input.reason}${input.notes ? '\nAdditional notes: ' + input.notes : ''}`
      },
      userContext
    );
  }

  /**
   * Get all pending time entries requiring approval
   */
  async getPendingApprovals(
    managerId?: string,
    userContext?: string
  ): Promise<TimeEntry[]> {
    const result = await this.timeEntryRepository.findAll(
      {
        filters: { status: 'PENDING_APPROVAL' }
      },
      userContext
    );

    // In a real system, you would filter by manager's team
    // For now, return all pending entries
    return result.data;
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

  private validateManualEntryTimes(clockInTime: Date, clockOutTime: Date): void {
    // Validate clock out is after clock in
    if (clockOutTime <= clockInTime) {
      throw new ValidationError('Clock out time must be after clock in time', [
        { field: 'clockOutTime', message: 'Must be after clock in time' }
      ]);
    }

    // Validate not in the future
    const now = new Date();
    if (clockInTime > now) {
      throw new ValidationError('Clock in time cannot be in the future', [
        { field: 'clockInTime', message: 'Cannot be in the future' }
      ]);
    }

    if (clockOutTime > now) {
      throw new ValidationError('Clock out time cannot be in the future', [
        { field: 'clockOutTime', message: 'Cannot be in the future' }
      ]);
    }
  }

  private validateEntryNotTooOld(clockInTime: Date): void {
    const maxPastDays = this.config.maxPastDaysForManualEntry;
    const oldestAllowedDate = new Date();
    oldestAllowedDate.setDate(oldestAllowedDate.getDate() - maxPastDays);

    if (clockInTime < oldestAllowedDate) {
      throw new ValidationError(
        `Cannot create manual entry more than ${maxPastDays} days in the past`,
        [{ field: 'clockInTime', message: `Must be within last ${maxPastDays} days` }]
      );
    }
  }

  private async checkForOverlappingEntries(
    employeeId: string,
    startTime: Date,
    endTime: Date,
    userContext?: string,
    excludeEntryId?: string
  ): Promise<void> {
    const startOfDay = new Date(startTime);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(endTime);
    endOfDay.setHours(23, 59, 59, 999);

    const existingEntries = await this.timeEntryRepository.findAll(
      {
        filters: {
          employeeId,
          dateRange: { start: startOfDay, end: endOfDay }
        }
      },
      userContext
    );

    // Check for overlaps
    for (const entry of existingEntries.data) {
      // Skip the entry being corrected
      if (excludeEntryId && entry.id === excludeEntryId) {
        continue;
      }

      if (!entry.clockOutTime) {
        // Active entry exists
        throw new AppError(
          'Cannot create entry overlapping with an active clock-in',
          'OVERLAPPING_ENTRY',
          409,
          { existingEntry: entry }
        );
      }

      // Check if times overlap
      const entryStart = entry.clockInTime.getTime();
      const entryEnd = entry.clockOutTime.getTime();
      const newStart = startTime.getTime();
      const newEnd = endTime.getTime();

      const overlaps = (newStart < entryEnd && newEnd > entryStart);

      if (overlaps) {
        throw new AppError(
          'Time entry overlaps with existing entry',
          'OVERLAPPING_ENTRY',
          409,
          {
            existingEntry: {
              id: entry.id,
              clockInTime: entry.clockInTime,
              clockOutTime: entry.clockOutTime
            }
          }
        );
      }
    }
  }
}
