import Joi from 'joi';
import { v4 as uuidv4 } from 'uuid';
import {
  validateAndThrow,
  ValidationError,
  uuidSchema
} from '../../utils/validation';

export interface EmployeeTimeStatusData {
  id?: string;
  employeeId: string;
  currentStatus: 'CLOCKED_OUT' | 'CLOCKED_IN' | 'ON_BREAK';
  activeTimeEntryId?: string;
  activeBreakEntryId?: string;
  lastClockInTime?: Date;
  lastBreakStartTime?: Date;
  totalHoursToday: number;
  lastUpdated: Date;
}

export class EmployeeTimeStatus {
  public id: string;
  public employeeId: string;
  public currentStatus: 'CLOCKED_OUT' | 'CLOCKED_IN' | 'ON_BREAK';
  public activeTimeEntryId?: string;
  public activeBreakEntryId?: string;
  public lastClockInTime?: Date;
  public lastBreakStartTime?: Date;
  public totalHoursToday: number;
  public lastUpdated: Date;

  constructor(data: EmployeeTimeStatusData) {
    this.validate(data);

    this.id = data.id || uuidv4();
    this.employeeId = data.employeeId;
    this.currentStatus = data.currentStatus;
    this.activeTimeEntryId = data.activeTimeEntryId;
    this.activeBreakEntryId = data.activeBreakEntryId;
    this.lastClockInTime = data.lastClockInTime;
    this.lastBreakStartTime = data.lastBreakStartTime;
    this.totalHoursToday = data.totalHoursToday;
    this.lastUpdated = data.lastUpdated;

    this.validateBusinessRules();
  }

  private validate(data: EmployeeTimeStatusData): void {
    const schema = Joi.object({
      id: uuidSchema.optional(),
      employeeId: uuidSchema,
      currentStatus: Joi.string().valid('CLOCKED_OUT', 'CLOCKED_IN', 'ON_BREAK').required(),
      activeTimeEntryId: uuidSchema.optional(),
      activeBreakEntryId: uuidSchema.optional(),
      lastClockInTime: Joi.date().optional(),
      lastBreakStartTime: Joi.date().optional(),
      totalHoursToday: Joi.number().min(0).required(),
      lastUpdated: Joi.date().required()
    });

    validateAndThrow<EmployeeTimeStatusData>(schema, data);
  }

  private validateBusinessRules(): void {
    if (this.currentStatus === 'CLOCKED_IN' && !this.activeTimeEntryId) {
      throw new ValidationError('Clocked in status requires active time entry ID', []);
    }

    if (this.currentStatus === 'ON_BREAK' && !this.activeBreakEntryId) {
      throw new ValidationError('On break status requires active break entry ID', []);
    }

    if (this.currentStatus === 'CLOCKED_OUT' && (this.activeTimeEntryId || this.activeBreakEntryId)) {
      throw new ValidationError('Clocked out status cannot have active entries', []);
    }

    if (this.activeBreakEntryId && !this.activeTimeEntryId) {
      throw new ValidationError('Break entry requires active time entry', []);
    }
  }

  public isWorking(): boolean {
    return this.currentStatus === 'CLOCKED_IN';
  }

  public isOnBreak(): boolean {
    return this.currentStatus === 'ON_BREAK';
  }

  public isClockedOut(): boolean {
    return this.currentStatus === 'CLOCKED_OUT';
  }

  public canClockIn(): boolean {
    return this.currentStatus === 'CLOCKED_OUT';
  }

  public canClockOut(): boolean {
    return this.currentStatus === 'CLOCKED_IN';
  }

  public canStartBreak(): boolean {
    return this.currentStatus === 'CLOCKED_IN';
  }

  public canEndBreak(): boolean {
    return this.currentStatus === 'ON_BREAK';
  }

  public clockIn(timeEntryId: string): EmployeeTimeStatus {
    if (!this.canClockIn()) {
      throw new ValidationError('Cannot clock in from current status', []);
    }

    return new EmployeeTimeStatus({
      ...this.toJSON(),
      currentStatus: 'CLOCKED_IN',
      activeTimeEntryId: timeEntryId,
      lastClockInTime: new Date(),
      lastUpdated: new Date()
    });
  }

  public clockOut(): EmployeeTimeStatus {
    if (!this.canClockOut()) {
      throw new ValidationError('Cannot clock out from current status', []);
    }

    return new EmployeeTimeStatus({
      ...this.toJSON(),
      currentStatus: 'CLOCKED_OUT',
      activeTimeEntryId: undefined,
      activeBreakEntryId: undefined,
      lastClockInTime: undefined,
      lastBreakStartTime: undefined,
      lastUpdated: new Date()
    });
  }

  public startBreak(breakEntryId: string): EmployeeTimeStatus {
    if (!this.canStartBreak()) {
      throw new ValidationError('Cannot start break from current status', []);
    }

    return new EmployeeTimeStatus({
      ...this.toJSON(),
      currentStatus: 'ON_BREAK',
      activeBreakEntryId: breakEntryId,
      lastBreakStartTime: new Date(),
      lastUpdated: new Date()
    });
  }

  public endBreak(): EmployeeTimeStatus {
    if (!this.canEndBreak()) {
      throw new ValidationError('Cannot end break from current status', []);
    }

    return new EmployeeTimeStatus({
      ...this.toJSON(),
      currentStatus: 'CLOCKED_IN',
      activeBreakEntryId: undefined,
      lastBreakStartTime: undefined,
      lastUpdated: new Date()
    });
  }

  public updateTotalHours(hours: number): EmployeeTimeStatus {
    return new EmployeeTimeStatus({
      ...this.toJSON(),
      totalHoursToday: hours,
      lastUpdated: new Date()
    });
  }

  /**
   * Validate if the current status allows a specific transition
   */
  public validateTransition(targetStatus: 'CLOCKED_OUT' | 'CLOCKED_IN' | 'ON_BREAK'): boolean {
    const validTransitions = {
      'CLOCKED_OUT': ['CLOCKED_IN'],
      'CLOCKED_IN': ['CLOCKED_OUT', 'ON_BREAK'],
      'ON_BREAK': ['CLOCKED_IN']
    };

    return validTransitions[this.currentStatus].includes(targetStatus);
  }

  /**
   * Get all valid next states from current status
   */
  public getValidTransitions(): string[] {
    const validTransitions = {
      'CLOCKED_OUT': ['CLOCKED_IN'],
      'CLOCKED_IN': ['CLOCKED_OUT', 'ON_BREAK'],
      'ON_BREAK': ['CLOCKED_IN']
    };

    return validTransitions[this.currentStatus];
  }

  /**
   * Check if the employee has been clocked in for too long (potential incomplete entry)
   */
  public hasIncompleteTimeEntry(maxHoursWithoutBreak: number = 12): boolean {
    if (this.currentStatus !== 'CLOCKED_IN' || !this.lastClockInTime) {
      return false;
    }

    const hoursWorked = (new Date().getTime() - this.lastClockInTime.getTime()) / (1000 * 60 * 60);
    return hoursWorked > maxHoursWithoutBreak;
  }

  /**
   * Check if the employee has been on break for too long
   */
  public hasLongBreak(maxBreakMinutes: number = 120): boolean {
    if (this.currentStatus !== 'ON_BREAK' || !this.lastBreakStartTime) {
      return false;
    }

    const breakMinutes = (new Date().getTime() - this.lastBreakStartTime.getTime()) / (1000 * 60);
    return breakMinutes > maxBreakMinutes;
  }

  /**
   * Get the duration of current work session in hours
   */
  public getCurrentWorkDuration(): number {
    if (this.currentStatus === 'CLOCKED_OUT' || !this.lastClockInTime) {
      return 0;
    }

    const workMinutes = (new Date().getTime() - this.lastClockInTime.getTime()) / (1000 * 60);
    return Math.round((workMinutes / 60) * 100) / 100;
  }

  /**
   * Get the duration of current break in minutes
   */
  public getCurrentBreakDuration(): number {
    if (this.currentStatus !== 'ON_BREAK' || !this.lastBreakStartTime) {
      return 0;
    }

    const breakMinutes = (new Date().getTime() - this.lastBreakStartTime.getTime()) / (1000 * 60);
    return Math.round(breakMinutes);
  }

  /**
   * Check if status requires immediate attention (anomaly detection)
   */
  public requiresAttention(): {
    hasIssue: boolean;
    issues: string[];
  } {
    const issues: string[] = [];

    // Check for incomplete time entries
    if (this.hasIncompleteTimeEntry()) {
      issues.push('Employee has been clocked in for more than 12 hours');
    }

    // Check for long breaks
    if (this.hasLongBreak()) {
      issues.push('Employee has been on break for more than 2 hours');
    }

    // Check for excessive daily hours
    if (this.totalHoursToday > 16) {
      issues.push('Employee has worked more than 16 hours today');
    }

    // Check for stale status (not updated recently)
    const hoursSinceUpdate = (new Date().getTime() - this.lastUpdated.getTime()) / (1000 * 60 * 60);
    if (hoursSinceUpdate > 24) {
      issues.push('Status has not been updated in over 24 hours');
    }

    return {
      hasIssue: issues.length > 0,
      issues
    };
  }

  /**
   * Get a human-readable status description
   */
  public getStatusDescription(): string {
    switch (this.currentStatus) {
      case 'CLOCKED_OUT':
        return 'Not working';
      case 'CLOCKED_IN':
        const workDuration = this.getCurrentWorkDuration();
        return `Working for ${workDuration} hours`;
      case 'ON_BREAK':
        const breakDuration = this.getCurrentBreakDuration();
        return `On break for ${breakDuration} minutes`;
      default:
        return 'Unknown status';
    }
  }

  /**
   * Reset daily totals (typically called at start of new day)
   */
  public resetDailyTotals(): EmployeeTimeStatus {
    return new EmployeeTimeStatus({
      ...this.toJSON(),
      totalHoursToday: 0,
      lastUpdated: new Date()
    });
  }

  /**
   * Force status change (for administrative corrections)
   */
  public forceStatusChange(
    newStatus: 'CLOCKED_OUT' | 'CLOCKED_IN' | 'ON_BREAK',
    activeTimeEntryId?: string,
    activeBreakEntryId?: string
  ): EmployeeTimeStatus {
    const updateData: Partial<EmployeeTimeStatusData> = {
      currentStatus: newStatus,
      lastUpdated: new Date()
    };

    // Clear all active entries first
    updateData.activeTimeEntryId = undefined;
    updateData.activeBreakEntryId = undefined;
    updateData.lastClockInTime = undefined;
    updateData.lastBreakStartTime = undefined;

    // Set appropriate fields based on new status
    switch (newStatus) {
      case 'CLOCKED_IN':
        updateData.activeTimeEntryId = activeTimeEntryId;
        updateData.lastClockInTime = new Date();
        break;
      case 'ON_BREAK':
        updateData.activeTimeEntryId = activeTimeEntryId;
        updateData.activeBreakEntryId = activeBreakEntryId;
        updateData.lastClockInTime = new Date();
        updateData.lastBreakStartTime = new Date();
        break;
      case 'CLOCKED_OUT':
        // All fields already cleared above
        break;
    }

    return new EmployeeTimeStatus({
      ...this.toJSON(),
      ...updateData
    });
  }

  public toJSON(): EmployeeTimeStatusData {
    return {
      id: this.id,
      employeeId: this.employeeId,
      currentStatus: this.currentStatus,
      activeTimeEntryId: this.activeTimeEntryId,
      activeBreakEntryId: this.activeBreakEntryId,
      lastClockInTime: this.lastClockInTime,
      lastBreakStartTime: this.lastBreakStartTime,
      totalHoursToday: this.totalHoursToday,
      lastUpdated: this.lastUpdated
    };
  }

  public static createNew(employeeId: string): EmployeeTimeStatus {
    return new EmployeeTimeStatus({
      employeeId,
      currentStatus: 'CLOCKED_OUT',
      totalHoursToday: 0,
      lastUpdated: new Date()
    });
  }
}