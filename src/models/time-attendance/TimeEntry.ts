import Joi from 'joi';
import { v4 as uuidv4 } from 'uuid';
import {
  validateAndThrow,
  ValidationError,
  uuidSchema
} from '../../utils/validation';

export interface GeoLocation {
  latitude: number;
  longitude: number;
  accuracy?: number;
}

export interface BreakEntryData {
  id?: string;
  timeEntryId: string;
  breakType: 'LUNCH' | 'SHORT_BREAK' | 'PERSONAL';
  startTime: Date;
  endTime?: Date;
  duration?: number; // in minutes
  paid: boolean;
}

export interface TimeEntryData {
  id?: string;
  employeeId: string;
  clockInTime: Date;
  clockOutTime?: Date;
  breakEntries?: BreakEntryData[];
  totalHours?: number;
  regularHours?: number;
  overtimeHours?: number;
  location?: GeoLocation;
  status: 'ACTIVE' | 'COMPLETED' | 'PENDING_APPROVAL';
  manualEntry: boolean;
  approvedBy?: string;
  approvedAt?: Date;
  notes?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export class BreakEntry {
  public id: string;
  public timeEntryId: string;
  public breakType: 'LUNCH' | 'SHORT_BREAK' | 'PERSONAL';
  public startTime: Date;
  public endTime?: Date;
  public duration?: number;
  public paid: boolean;

  constructor(data: BreakEntryData) {
    this.validate(data);

    this.id = data.id || uuidv4();
    this.timeEntryId = data.timeEntryId;
    this.breakType = data.breakType;
    this.startTime = data.startTime;
    this.endTime = data.endTime;
    this.duration = data.duration;
    this.paid = data.paid;

    this.validateBusinessRules();
  }

  private validate(data: BreakEntryData): void {
    const schema = Joi.object({
      id: uuidSchema.optional(),
      timeEntryId: uuidSchema,
      breakType: Joi.string().valid('LUNCH', 'SHORT_BREAK', 'PERSONAL').required(),
      startTime: Joi.date().required(),
      endTime: Joi.date().optional(),
      duration: Joi.number().min(0).optional(),
      paid: Joi.boolean().required()
    });

    validateAndThrow<BreakEntryData>(schema, data);
  }

  private validateBusinessRules(): void {
    // Basic time validation
    if (this.endTime && this.startTime >= this.endTime) {
      throw new ValidationError('Break end time must be after start time', []);
    }

    // Duration validation
    if (this.duration && this.duration < 0) {
      throw new ValidationError('Break duration cannot be negative', []);
    }

    // Break type specific validation
    this.validateBreakTypeRules();

    // No future times validation
    if (this.endTime && this.endTime > new Date()) {
      throw new ValidationError('Break end time cannot be in the future', []);
    }

    // Maximum break duration validation
    const maxDurations = {
      'SHORT_BREAK': 30, // 30 minutes
      'LUNCH': 120,      // 2 hours
      'PERSONAL': 60     // 1 hour
    };

    const calculatedDuration = this.calculateDuration();
    if (calculatedDuration > maxDurations[this.breakType]) {
      throw new ValidationError(`${this.breakType} break cannot exceed ${maxDurations[this.breakType]} minutes`, []);
    }
  }

  private validateBreakTypeRules(): void {
    // Lunch breaks are typically unpaid
    if (this.breakType === 'LUNCH' && this.paid) {
      // This is a warning case, but we'll allow it for flexibility
      // In a real system, this might be configurable per company policy
    }

    // Short breaks are typically paid
    if (this.breakType === 'SHORT_BREAK' && !this.paid) {
      // This is also configurable, so we'll allow it
    }

    // Personal breaks are typically unpaid
    if (this.breakType === 'PERSONAL' && this.paid) {
      // Allow but could be flagged for review
    }
  }

  public calculateDuration(): number {
    if (!this.endTime) {
      return 0;
    }
    return Math.round((this.endTime.getTime() - this.startTime.getTime()) / (1000 * 60));
  }

  public isActive(): boolean {
    return !this.endTime;
  }

  public endBreak(endTime: Date = new Date()): BreakEntry {
    if (this.endTime) {
      throw new ValidationError('Break is already ended', []);
    }

    return new BreakEntry({
      ...this.toJSON(),
      endTime
    });
  }

  public getDurationInHours(): number {
    return Math.round((this.calculateDuration() / 60) * 100) / 100;
  }

  public isLongBreak(): boolean {
    const duration = this.calculateDuration();
    return duration > 30; // More than 30 minutes
  }

  public toJSON(): BreakEntryData {
    return {
      id: this.id,
      timeEntryId: this.timeEntryId,
      breakType: this.breakType,
      startTime: this.startTime,
      endTime: this.endTime,
      duration: this.duration || this.calculateDuration(),
      paid: this.paid
    };
  }
}

export class TimeEntry {
  public id: string;
  public employeeId: string;
  public clockInTime: Date;
  public clockOutTime?: Date;
  public breakEntries: BreakEntry[];
  public totalHours?: number;
  public regularHours?: number;
  public overtimeHours?: number;
  public location?: GeoLocation;
  public status: 'ACTIVE' | 'COMPLETED' | 'PENDING_APPROVAL';
  public manualEntry: boolean;
  public approvedBy?: string;
  public approvedAt?: Date;
  public notes?: string;
  public createdAt: Date;
  public updatedAt: Date;

  constructor(data: TimeEntryData) {
    this.validate(data);

    this.id = data.id || uuidv4();
    this.employeeId = data.employeeId;
    this.clockInTime = data.clockInTime;
    this.clockOutTime = data.clockOutTime;
    this.breakEntries = (data.breakEntries || []).map(entry => new BreakEntry(entry));
    this.totalHours = data.totalHours;
    this.regularHours = data.regularHours;
    this.overtimeHours = data.overtimeHours;
    this.location = data.location;
    this.status = data.status;
    this.manualEntry = data.manualEntry;
    this.approvedBy = data.approvedBy;
    this.approvedAt = data.approvedAt;
    this.notes = data.notes;
    this.createdAt = data.createdAt || new Date();
    this.updatedAt = data.updatedAt || new Date();

    this.validateBusinessRules();
  }

  private validate(data: TimeEntryData): void {
    const schema = Joi.object({
      id: uuidSchema.optional(),
      employeeId: uuidSchema,
      clockInTime: Joi.date().required(),
      clockOutTime: Joi.date().optional(),
      breakEntries: Joi.array().items(Joi.object()).optional(),
      totalHours: Joi.number().min(0).optional(),
      regularHours: Joi.number().min(0).optional(),
      overtimeHours: Joi.number().min(0).optional(),
      location: Joi.object({
        latitude: Joi.number().required(),
        longitude: Joi.number().required(),
        accuracy: Joi.number().optional()
      }).optional(),
      status: Joi.string().valid('ACTIVE', 'COMPLETED', 'PENDING_APPROVAL').required(),
      manualEntry: Joi.boolean().required(),
      approvedBy: uuidSchema.optional(),
      approvedAt: Joi.date().optional(),
      notes: Joi.string().optional(),
      createdAt: Joi.date().optional(),
      updatedAt: Joi.date().optional()
    });

    validateAndThrow<TimeEntryData>(schema, data);
  }

  private validateBusinessRules(): void {
    // No future times validation (check this first)
    if (this.clockInTime > new Date()) {
      throw new ValidationError('Clock in time cannot be in the future', []);
    }

    if (this.clockOutTime && this.clockOutTime > new Date()) {
      throw new ValidationError('Clock out time cannot be in the future', []);
    }

    // Basic time validation
    if (this.clockOutTime && this.clockInTime >= this.clockOutTime) {
      throw new ValidationError('Clock out time must be after clock in time', []);
    }

    // Valid sequence validation - ensure breaks are within time entry bounds
    this.validateBreakSequences();

    // Manual entry validation
    if (this.manualEntry && !this.notes) {
      throw new ValidationError('Manual entries require notes explaining the reason', []);
    }

    // Status validation
    if (this.status === 'PENDING_APPROVAL' && !this.manualEntry) {
      throw new ValidationError('Only manual entries can have pending approval status', []);
    }

    if (this.status === 'COMPLETED' && !this.clockOutTime) {
      throw new ValidationError('Completed entries must have clock out time', []);
    }

    if (this.status === 'ACTIVE' && this.clockOutTime) {
      throw new ValidationError('Active entries cannot have clock out time', []);
    }

    // Approval validation
    if (this.approvedBy && !this.approvedAt) {
      throw new ValidationError('Approved entries must have approval timestamp', []);
    }

    if (this.approvedAt && !this.approvedBy) {
      throw new ValidationError('Approval timestamp requires approver ID', []);
    }

    // Maximum hours validation (24 hours per day)
    if (this.clockOutTime) {
      const totalMinutes = (this.clockOutTime.getTime() - this.clockInTime.getTime()) / (1000 * 60);
      if (totalMinutes > 24 * 60) {
        throw new ValidationError('Time entry cannot exceed 24 hours', []);
      }
    }
  }

  private validateBreakSequences(): void {
    for (const breakEntry of this.breakEntries) {
      // Break must start after clock in
      if (breakEntry.startTime < this.clockInTime) {
        throw new ValidationError('Break cannot start before clock in time', []);
      }

      // Break must end before clock out (if clocked out)
      if (this.clockOutTime && breakEntry.endTime && breakEntry.endTime > this.clockOutTime) {
        throw new ValidationError('Break cannot end after clock out time', []);
      }

      // Break start time cannot be in the future
      if (breakEntry.startTime > new Date()) {
        throw new ValidationError('Break start time cannot be in the future', []);
      }
    }

    // Check for overlapping breaks
    const sortedBreaks = this.breakEntries
      .filter(entry => entry.endTime)
      .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

    for (let i = 0; i < sortedBreaks.length - 1; i++) {
      const currentBreak = sortedBreaks[i];
      const nextBreak = sortedBreaks[i + 1];
      
      if (currentBreak.endTime! > nextBreak.startTime) {
        throw new ValidationError('Break periods cannot overlap', []);
      }
    }
  }

  public calculateTotalHours(): number {
    if (!this.clockOutTime) {
      return 0;
    }

    const totalMinutes = (this.clockOutTime.getTime() - this.clockInTime.getTime()) / (1000 * 60);
    const breakMinutes = this.breakEntries
      .filter(entry => !entry.paid)
      .reduce((total, entry) => total + entry.calculateDuration(), 0);

    return Math.round(((totalMinutes - breakMinutes) / 60) * 100) / 100;
  }

  public isActive(): boolean {
    return this.status === 'ACTIVE' && !this.clockOutTime;
  }

  public isCompleted(): boolean {
    return this.status === 'COMPLETED' && !!this.clockOutTime;
  }

  public hasActiveBreak(): boolean {
    return this.breakEntries.some(entry => entry.isActive());
  }

  public getActiveBreak(): BreakEntry | undefined {
    return this.breakEntries.find(entry => entry.isActive());
  }

  public getTotalBreakTime(): number {
    return this.breakEntries.reduce((total, entry) => total + entry.calculateDuration(), 0);
  }

  public getPaidBreakTime(): number {
    return this.breakEntries
      .filter(entry => entry.paid)
      .reduce((total, entry) => total + entry.calculateDuration(), 0);
  }

  public getUnpaidBreakTime(): number {
    return this.breakEntries
      .filter(entry => !entry.paid)
      .reduce((total, entry) => total + entry.calculateDuration(), 0);
  }

  public addBreak(breakData: Omit<BreakEntryData, 'id' | 'timeEntryId'>): BreakEntry {
    const breakEntry = new BreakEntry({
      ...breakData,
      timeEntryId: this.id
    });

    // Validate that adding this break doesn't violate business rules
    const tempBreakEntries = [...this.breakEntries, breakEntry];
    // Create temporary time entry to validate business rules
    new TimeEntry({
      ...this.toJSON(),
      breakEntries: tempBreakEntries.map(entry => entry.toJSON())
    });

    this.breakEntries.push(breakEntry);
    this.updatedAt = new Date();
    
    return breakEntry;
  }

  public endBreak(breakId: string, endTime: Date = new Date()): BreakEntry {
    const breakEntry = this.breakEntries.find(entry => entry.id === breakId);
    if (!breakEntry) {
      throw new ValidationError('Break entry not found', []);
    }

    if (breakEntry.endTime) {
      throw new ValidationError('Break is already ended', []);
    }

    // Create updated break entry
    const updatedBreakEntry = new BreakEntry({
      ...breakEntry.toJSON(),
      endTime
    });

    // Replace the break entry
    const breakIndex = this.breakEntries.findIndex(entry => entry.id === breakId);
    this.breakEntries[breakIndex] = updatedBreakEntry;
    this.updatedAt = new Date();

    return updatedBreakEntry;
  }

  public clockOut(clockOutTime: Date = new Date()): TimeEntry {
    if (this.clockOutTime) {
      throw new ValidationError('Employee is already clocked out', []);
    }

    if (this.hasActiveBreak()) {
      throw new ValidationError('Cannot clock out while on break', []);
    }

    // Create new time entry with clock out time to calculate total hours
    const updatedData = {
      ...this.toJSON(),
      clockOutTime,
      status: 'COMPLETED' as const,
      updatedAt: new Date()
    };

    const newTimeEntry = new TimeEntry(updatedData);
    newTimeEntry.totalHours = newTimeEntry.calculateTotalHours();
    
    return newTimeEntry;
  }

  public requiresApproval(): boolean {
    return this.manualEntry && this.status === 'PENDING_APPROVAL';
  }

  public approve(approverId: string, approvalTime: Date = new Date()): TimeEntry {
    if (!this.requiresApproval()) {
      throw new ValidationError('Time entry does not require approval', []);
    }

    return new TimeEntry({
      ...this.toJSON(),
      status: 'COMPLETED',
      approvedBy: approverId,
      approvedAt: approvalTime,
      updatedAt: new Date()
    });
  }

  public toJSON(): TimeEntryData {
    return {
      id: this.id,
      employeeId: this.employeeId,
      clockInTime: this.clockInTime,
      clockOutTime: this.clockOutTime,
      breakEntries: this.breakEntries.map(entry => entry.toJSON()),
      totalHours: this.totalHours || this.calculateTotalHours(),
      regularHours: this.regularHours,
      overtimeHours: this.overtimeHours,
      location: this.location,
      status: this.status,
      manualEntry: this.manualEntry,
      approvedBy: this.approvedBy,
      approvedAt: this.approvedAt,
      notes: this.notes,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }

  public static createClockIn(employeeId: string, location?: GeoLocation): TimeEntry {
    return new TimeEntry({
      employeeId,
      clockInTime: new Date(),
      location,
      status: 'ACTIVE',
      manualEntry: false,
      breakEntries: []
    });
  }

  public static createManualEntry(
    employeeId: string,
    clockInTime: Date,
    clockOutTime: Date,
    notes: string,
    location?: GeoLocation
  ): TimeEntry {
    return new TimeEntry({
      employeeId,
      clockInTime,
      clockOutTime,
      location,
      status: 'PENDING_APPROVAL',
      manualEntry: true,
      notes,
      breakEntries: []
    });
  }
}