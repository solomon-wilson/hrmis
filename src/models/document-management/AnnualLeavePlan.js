import Joi from 'joi';
import { v4 as uuidv4 } from 'uuid';
import { validateAndThrow, ValidationError, uuidSchema } from '../../utils/validation';
export class AnnualLeavePlan {
    constructor(data) {
        this.validate(data);
        this.id = data.id || uuidv4();
        this.employeeId = data.employeeId;
        this.year = data.year;
        this.totalEntitlement = data.totalEntitlement;
        this.carriedOver = data.carriedOver;
        this.plannedLeaves = data.plannedLeaves.map(leave => ({
            ...leave,
            startDate: new Date(leave.startDate),
            endDate: new Date(leave.endDate)
        }));
        this.status = data.status;
        this.submittedAt = data.submittedAt;
        this.managerApprovedAt = data.managerApprovedAt;
        this.managerApprovedBy = data.managerApprovedBy;
        this.hrApprovedAt = data.hrApprovedAt;
        this.hrApprovedBy = data.hrApprovedBy;
        this.rejectionReason = data.rejectionReason?.trim();
        this.createdAt = data.createdAt || new Date();
        this.updatedAt = data.updatedAt || new Date();
        this.validateBusinessRules();
    }
    validate(data) {
        const plannedLeaveSchema = Joi.object({
            startDate: Joi.date().required(),
            endDate: Joi.date().required(),
            days: Joi.number().min(0.5).max(365).required(),
            description: Joi.string().max(500).optional(),
            type: Joi.string().valid('ANNUAL', 'PERSONAL', 'SICK', 'EMERGENCY').required()
        });
        const schema = Joi.object({
            id: uuidSchema.optional(),
            employeeId: uuidSchema,
            year: Joi.number().integer().min(2000).max(2099).required(),
            totalEntitlement: Joi.number().min(0).max(100).required(),
            carriedOver: Joi.number().min(0).max(50).required(),
            plannedLeaves: Joi.array().items(plannedLeaveSchema).required(),
            status: Joi.string().valid('DRAFT', 'SUBMITTED', 'MANAGER_APPROVED', 'HR_APPROVED', 'REJECTED').required(),
            submittedAt: Joi.date().optional(),
            managerApprovedAt: Joi.date().optional(),
            managerApprovedBy: uuidSchema.optional(),
            hrApprovedAt: Joi.date().optional(),
            hrApprovedBy: uuidSchema.optional(),
            rejectionReason: Joi.string().max(1000).optional(),
            createdAt: Joi.date().optional(),
            updatedAt: Joi.date().optional()
        });
        validateAndThrow(schema, data);
    }
    validateBusinessRules() {
        // Validate year is current or future
        const currentYear = new Date().getFullYear();
        if (this.year < currentYear) {
            throw new ValidationError('Cannot create leave plans for past years', []);
        }
        // Validate total planned days don't exceed entitlement + carried over
        const totalPlannedDays = this.getTotalPlannedDays();
        const totalAvailable = this.totalEntitlement + this.carriedOver;
        if (totalPlannedDays > totalAvailable) {
            throw new ValidationError(`Total planned days (${totalPlannedDays}) exceed available entitlement (${totalAvailable})`, []);
        }
        // Validate planned leave dates
        this.plannedLeaves.forEach((leave, index) => {
            if (leave.endDate < leave.startDate) {
                throw new ValidationError(`Leave ${index + 1}: End date must be after or equal to start date`, []);
            }
            // Validate leave is within the plan year
            const leaveYear = leave.startDate.getFullYear();
            if (leaveYear !== this.year) {
                throw new ValidationError(`Leave ${index + 1}: Leave dates must be within plan year ${this.year}`, []);
            }
            // Validate calculated days match the period
            const calculatedDays = this.calculateWorkingDays(leave.startDate, leave.endDate);
            if (Math.abs(leave.days - calculatedDays) > 0.1) {
                throw new ValidationError(`Leave ${index + 1}: Declared days (${leave.days}) don't match calculated days (${calculatedDays})`, []);
            }
        });
        // Check for overlapping leave periods
        this.validateNoOverlappingLeaves();
        // Validate status-specific requirements
        this.validateStatusConsistency();
    }
    validateNoOverlappingLeaves() {
        const sortedLeaves = [...this.plannedLeaves].sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
        for (let i = 0; i < sortedLeaves.length - 1; i++) {
            const current = sortedLeaves[i];
            const next = sortedLeaves[i + 1];
            if (current.endDate >= next.startDate) {
                throw new ValidationError(`Overlapping leave periods detected: ${current.startDate.toDateString()} - ${current.endDate.toDateString()} and ${next.startDate.toDateString()} - ${next.endDate.toDateString()}`, []);
            }
        }
    }
    validateStatusConsistency() {
        switch (this.status) {
            case 'SUBMITTED':
                if (!this.submittedAt) {
                    throw new ValidationError('Submitted plans must have submittedAt date', []);
                }
                break;
            case 'MANAGER_APPROVED':
                if (!this.managerApprovedAt || !this.managerApprovedBy) {
                    throw new ValidationError('Manager approved plans must have approval date and approver', []);
                }
                break;
            case 'HR_APPROVED':
                if (!this.hrApprovedAt || !this.hrApprovedBy) {
                    throw new ValidationError('HR approved plans must have approval date and approver', []);
                }
                if (!this.managerApprovedAt || !this.managerApprovedBy) {
                    throw new ValidationError('HR approved plans must also have manager approval', []);
                }
                break;
            case 'REJECTED':
                if (!this.rejectionReason) {
                    throw new ValidationError('Rejected plans must have a rejection reason', []);
                }
                break;
        }
    }
    calculateWorkingDays(startDate, endDate) {
        // Simple implementation - could be enhanced to exclude holidays
        let days = 0;
        const current = new Date(startDate);
        // Include both start and end date in the calculation
        while (current <= endDate) {
            const dayOfWeek = current.getDay();
            if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Exclude weekends
                days++;
            }
            current.setDate(current.getDate() + 1);
        }
        return days;
    }
    submit() {
        if (this.status !== 'DRAFT') {
            throw new ValidationError('Only draft plans can be submitted', []);
        }
        if (this.plannedLeaves.length === 0) {
            throw new ValidationError('Cannot submit plan with no planned leaves', []);
        }
        return new AnnualLeavePlan({
            ...this.toJSON(),
            status: 'SUBMITTED',
            submittedAt: new Date(),
            updatedAt: new Date()
        });
    }
    approveByManager(managerId) {
        if (this.status !== 'SUBMITTED') {
            throw new ValidationError('Only submitted plans can be approved by manager', []);
        }
        return new AnnualLeavePlan({
            ...this.toJSON(),
            status: 'MANAGER_APPROVED',
            managerApprovedAt: new Date(),
            managerApprovedBy: managerId,
            updatedAt: new Date()
        });
    }
    approveByHR(hrId) {
        if (this.status !== 'MANAGER_APPROVED') {
            throw new ValidationError('Only manager-approved plans can be approved by HR', []);
        }
        return new AnnualLeavePlan({
            ...this.toJSON(),
            status: 'HR_APPROVED',
            hrApprovedAt: new Date(),
            hrApprovedBy: hrId,
            updatedAt: new Date()
        });
    }
    reject(reason) {
        if (this.status === 'REJECTED') {
            throw new ValidationError('Plan is already rejected', []);
        }
        if (this.status === 'HR_APPROVED') {
            throw new ValidationError('Cannot reject HR approved plans', []);
        }
        return new AnnualLeavePlan({
            ...this.toJSON(),
            status: 'REJECTED',
            rejectionReason: reason.trim(),
            updatedAt: new Date()
        });
    }
    addPlannedLeave(leave) {
        if (!this.canBeModified()) {
            throw new ValidationError('Cannot modify plan in current status', []);
        }
        const newLeaves = [...this.plannedLeaves, leave];
        return new AnnualLeavePlan({
            ...this.toJSON(),
            plannedLeaves: newLeaves,
            updatedAt: new Date()
        });
    }
    updatePlannedLeave(index, updates) {
        if (!this.canBeModified()) {
            throw new ValidationError('Cannot modify plan in current status', []);
        }
        if (index < 0 || index >= this.plannedLeaves.length) {
            throw new ValidationError('Invalid leave index', []);
        }
        const newLeaves = [...this.plannedLeaves];
        newLeaves[index] = { ...newLeaves[index], ...updates };
        return new AnnualLeavePlan({
            ...this.toJSON(),
            plannedLeaves: newLeaves,
            updatedAt: new Date()
        });
    }
    removePlannedLeave(index) {
        if (!this.canBeModified()) {
            throw new ValidationError('Cannot modify plan in current status', []);
        }
        if (index < 0 || index >= this.plannedLeaves.length) {
            throw new ValidationError('Invalid leave index', []);
        }
        const newLeaves = this.plannedLeaves.filter((_, i) => i !== index);
        return new AnnualLeavePlan({
            ...this.toJSON(),
            plannedLeaves: newLeaves,
            updatedAt: new Date()
        });
    }
    getTotalPlannedDays() {
        return this.plannedLeaves.reduce((total, leave) => total + leave.days, 0);
    }
    getRemainingDays() {
        return this.totalEntitlement + this.carriedOver - this.getTotalPlannedDays();
    }
    getPlannedLeavesByType(type) {
        return this.plannedLeaves.filter(leave => leave.type === type);
    }
    getTotalDaysByType(type) {
        return this.getPlannedLeavesByType(type).reduce((total, leave) => total + leave.days, 0);
    }
    canBeModified() {
        return this.status === 'DRAFT' || this.status === 'REJECTED';
    }
    isApproved() {
        return this.status === 'HR_APPROVED';
    }
    isPending() {
        return this.status === 'SUBMITTED' || this.status === 'MANAGER_APPROVED';
    }
    getLeaveConflicts(startDate, endDate) {
        return this.plannedLeaves.filter(leave => {
            return (startDate <= leave.endDate && endDate >= leave.startDate);
        });
    }
    hasConflictsWith(startDate, endDate) {
        return this.getLeaveConflicts(startDate, endDate).length > 0;
    }
    toJSON() {
        return {
            id: this.id,
            employeeId: this.employeeId,
            year: this.year,
            totalEntitlement: this.totalEntitlement,
            carriedOver: this.carriedOver,
            plannedLeaves: this.plannedLeaves.map(leave => ({
                ...leave,
                startDate: leave.startDate,
                endDate: leave.endDate
            })),
            status: this.status,
            submittedAt: this.submittedAt,
            managerApprovedAt: this.managerApprovedAt,
            managerApprovedBy: this.managerApprovedBy,
            hrApprovedAt: this.hrApprovedAt,
            hrApprovedBy: this.hrApprovedBy,
            rejectionReason: this.rejectionReason,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt
        };
    }
    // Static methods
    static createNew(data) {
        return new AnnualLeavePlan({
            ...data,
            status: 'DRAFT',
            createdAt: new Date(),
            updatedAt: new Date()
        });
    }
    static fromJSON(data) {
        return new AnnualLeavePlan(data);
    }
    static createForEmployee(employeeId, year, totalEntitlement, carriedOver = 0) {
        return AnnualLeavePlan.createNew({
            employeeId,
            year,
            totalEntitlement,
            carriedOver,
            plannedLeaves: []
        });
    }
}
