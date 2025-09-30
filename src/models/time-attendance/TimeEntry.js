import Joi from 'joi';
import { v4 as uuidv4 } from 'uuid';
import { validateAndThrow, ValidationError, uuidSchema } from '../../utils/validation';
export class BreakEntry {
    constructor(data) {
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
    validate(data) {
        const schema = Joi.object({
            id: uuidSchema.optional(),
            timeEntryId: uuidSchema,
            breakType: Joi.string().valid('LUNCH', 'SHORT_BREAK', 'PERSONAL').required(),
            startTime: Joi.date().required(),
            endTime: Joi.date().optional(),
            duration: Joi.number().min(0).optional(),
            paid: Joi.boolean().required()
        });
        validateAndThrow(schema, data);
    }
    validateBusinessRules() {
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
            'LUNCH': 120, // 2 hours
            'PERSONAL': 60 // 1 hour
        };
        const calculatedDuration = this.calculateDuration();
        if (calculatedDuration > maxDurations[this.breakType]) {
            throw new ValidationError(`${this.breakType} break cannot exceed ${maxDurations[this.breakType]} minutes`, []);
        }
    }
    validateBreakTypeRules() {
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
    calculateDuration() {
        if (!this.endTime) {
            return 0;
        }
        return Math.round((this.endTime.getTime() - this.startTime.getTime()) / (1000 * 60));
    }
    isActive() {
        return !this.endTime;
    }
    endBreak(endTime = new Date()) {
        if (this.endTime) {
            throw new ValidationError('Break is already ended', []);
        }
        return new BreakEntry({
            ...this.toJSON(),
            endTime
        });
    }
    getDurationInHours() {
        return Math.round((this.calculateDuration() / 60) * 100) / 100;
    }
    isLongBreak() {
        const duration = this.calculateDuration();
        return duration > 30; // More than 30 minutes
    }
    toJSON() {
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
    constructor(data) {
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
    validate(data) {
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
        validateAndThrow(schema, data);
    }
    validateBusinessRules() {
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
    validateBreakSequences() {
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
            if (currentBreak.endTime > nextBreak.startTime) {
                throw new ValidationError('Break periods cannot overlap', []);
            }
        }
    }
    calculateTotalHours() {
        if (!this.clockOutTime) {
            return 0;
        }
        const totalMinutes = (this.clockOutTime.getTime() - this.clockInTime.getTime()) / (1000 * 60);
        const breakMinutes = this.breakEntries
            .filter(entry => !entry.paid)
            .reduce((total, entry) => total + entry.calculateDuration(), 0);
        return Math.round(((totalMinutes - breakMinutes) / 60) * 100) / 100;
    }
    isActive() {
        return this.status === 'ACTIVE' && !this.clockOutTime;
    }
    isCompleted() {
        return this.status === 'COMPLETED' && !!this.clockOutTime;
    }
    hasActiveBreak() {
        return this.breakEntries.some(entry => entry.isActive());
    }
    getActiveBreak() {
        return this.breakEntries.find(entry => entry.isActive());
    }
    getTotalBreakTime() {
        return this.breakEntries.reduce((total, entry) => total + entry.calculateDuration(), 0);
    }
    getPaidBreakTime() {
        return this.breakEntries
            .filter(entry => entry.paid)
            .reduce((total, entry) => total + entry.calculateDuration(), 0);
    }
    getUnpaidBreakTime() {
        return this.breakEntries
            .filter(entry => !entry.paid)
            .reduce((total, entry) => total + entry.calculateDuration(), 0);
    }
    addBreak(breakData) {
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
    endBreak(breakId, endTime = new Date()) {
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
    clockOut(clockOutTime = new Date()) {
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
            status: 'COMPLETED',
            updatedAt: new Date()
        };
        const newTimeEntry = new TimeEntry(updatedData);
        newTimeEntry.totalHours = newTimeEntry.calculateTotalHours();
        return newTimeEntry;
    }
    requiresApproval() {
        return this.manualEntry && this.status === 'PENDING_APPROVAL';
    }
    approve(approverId, approvalTime = new Date()) {
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
    toJSON() {
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
    static createClockIn(employeeId, location) {
        return new TimeEntry({
            employeeId,
            clockInTime: new Date(),
            location,
            status: 'ACTIVE',
            manualEntry: false,
            breakEntries: []
        });
    }
    static createManualEntry(employeeId, clockInTime, clockOutTime, notes, location) {
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
