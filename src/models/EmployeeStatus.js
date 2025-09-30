import Joi from 'joi';
import { validateAndThrow, ValidationError, optionalStringSchema, dateSchema, employeeStatusTypeSchema } from '../utils/validation';
export class EmployeeStatus {
    constructor(data) {
        this.validate(data);
        this.current = data.current;
        this.effectiveDate = data.effectiveDate;
        this.reason = data.reason ? data.reason.trim() : undefined;
        this.notes = data.notes ? data.notes.trim() : undefined;
        // Additional business rule validations
        this.validateBusinessRules();
    }
    validate(data) {
        const schema = Joi.object({
            current: employeeStatusTypeSchema,
            effectiveDate: dateSchema,
            reason: optionalStringSchema.max(500),
            notes: optionalStringSchema.max(1000)
        });
        validateAndThrow(schema, data);
    }
    validateBusinessRules() {
        // Validate that terminated status requires a reason
        if (this.current === 'TERMINATED' && !this.reason) {
            throw new ValidationError('Termination reason is required', []);
        }
        // Validate that on leave status requires a reason
        if (this.current === 'ON_LEAVE' && !this.reason) {
            throw new ValidationError('Leave reason is required', []);
        }
        // Validate effective date is not in the future
        if (this.effectiveDate > new Date()) {
            throw new ValidationError('Effective date cannot be in the future', []);
        }
    }
    update(updates) {
        const updatedData = { ...this.toJSON(), ...updates };
        return new EmployeeStatus(updatedData);
    }
    toJSON() {
        const result = {
            current: this.current,
            effectiveDate: this.effectiveDate
        };
        if (this.reason !== undefined) {
            result.reason = this.reason;
        }
        if (this.notes !== undefined) {
            result.notes = this.notes;
        }
        return result;
    }
    isActive() {
        return this.current === 'ACTIVE';
    }
    isTerminated() {
        return this.current === 'TERMINATED';
    }
    isOnLeave() {
        return this.current === 'ON_LEAVE';
    }
    isInactive() {
        return this.current === 'INACTIVE';
    }
    // Status transition validation
    canTransitionTo(newStatus) {
        return EmployeeStatus.isValidTransition(this.current, newStatus);
    }
    static isValidTransition(fromStatus, toStatus) {
        // Define valid status transitions
        const validTransitions = {
            'ACTIVE': ['INACTIVE', 'ON_LEAVE', 'TERMINATED'],
            'INACTIVE': ['ACTIVE', 'TERMINATED'],
            'ON_LEAVE': ['ACTIVE', 'INACTIVE', 'TERMINATED'],
            'TERMINATED': [] // No transitions allowed from terminated status
        };
        return validTransitions[fromStatus].includes(toStatus);
    }
    validateTransitionTo(newStatus) {
        if (!this.canTransitionTo(newStatus)) {
            throw new ValidationError(`Invalid status transition from ${this.current} to ${newStatus}`, []);
        }
    }
    // Static factory methods for common status changes
    static createActive(effectiveDate = new Date()) {
        return new EmployeeStatus({
            current: 'ACTIVE',
            effectiveDate
        });
    }
    static createTerminated(reason, effectiveDate = new Date(), notes) {
        const data = {
            current: 'TERMINATED',
            effectiveDate,
            reason
        };
        if (notes !== undefined) {
            data.notes = notes;
        }
        return new EmployeeStatus(data);
    }
    static createOnLeave(reason, effectiveDate = new Date(), notes) {
        const data = {
            current: 'ON_LEAVE',
            effectiveDate,
            reason
        };
        if (notes !== undefined) {
            data.notes = notes;
        }
        return new EmployeeStatus(data);
    }
    static createInactive(reason, effectiveDate = new Date(), notes) {
        const data = {
            current: 'INACTIVE',
            effectiveDate
        };
        if (reason !== undefined) {
            data.reason = reason;
        }
        if (notes !== undefined) {
            data.notes = notes;
        }
        return new EmployeeStatus(data);
    }
}
