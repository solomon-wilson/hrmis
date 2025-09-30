import { EmployeeStatusHistory } from './EmployeeStatusHistory';
import { ValidationError } from '../utils/validation';
describe('EmployeeStatusHistory Model', () => {
    const employeeId = '123e4567-e89b-12d3-a456-426614174000';
    const changedBy = '123e4567-e89b-12d3-a456-426614174001';
    const effectiveDate = new Date('2023-06-15');
    const validStatusHistoryData = {
        employeeId,
        previousStatus: 'ACTIVE',
        newStatus: 'ON_LEAVE',
        effectiveDate,
        reason: 'Medical leave',
        notes: 'Doctor recommended 2 weeks rest',
        changedBy
    };
    describe('Constructor and Validation', () => {
        it('should create a valid status history with all fields', () => {
            const statusHistory = new EmployeeStatusHistory(validStatusHistoryData);
            expect(statusHistory.employeeId).toBe(employeeId);
            expect(statusHistory.previousStatus).toBe('ACTIVE');
            expect(statusHistory.newStatus).toBe('ON_LEAVE');
            expect(statusHistory.effectiveDate).toEqual(effectiveDate);
            expect(statusHistory.reason).toBe('Medical leave');
            expect(statusHistory.notes).toBe('Doctor recommended 2 weeks rest');
            expect(statusHistory.changedBy).toBe(changedBy);
            expect(statusHistory.id).toBeDefined();
            expect(statusHistory.changedAt).toBeInstanceOf(Date);
        });
        it('should create a valid status history with only required fields', () => {
            const minimalData = {
                employeeId,
                newStatus: 'ACTIVE',
                effectiveDate,
                changedBy
            };
            const statusHistory = new EmployeeStatusHistory(minimalData);
            expect(statusHistory.employeeId).toBe(employeeId);
            expect(statusHistory.previousStatus).toBeUndefined();
            expect(statusHistory.newStatus).toBe('ACTIVE');
            expect(statusHistory.effectiveDate).toEqual(effectiveDate);
            expect(statusHistory.reason).toBeUndefined();
            expect(statusHistory.notes).toBeUndefined();
            expect(statusHistory.changedBy).toBe(changedBy);
        });
        it('should generate UUID for id if not provided', () => {
            const statusHistory = new EmployeeStatusHistory(validStatusHistoryData);
            expect(statusHistory.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
        });
        it('should use provided id if given', () => {
            const customId = '123e4567-e89b-12d3-a456-426614174002';
            const dataWithId = { ...validStatusHistoryData, id: customId };
            const statusHistory = new EmployeeStatusHistory(dataWithId);
            expect(statusHistory.id).toBe(customId);
        });
        it('should trim reason and notes', () => {
            const dataWithWhitespace = {
                employeeId,
                newStatus: 'TERMINATED',
                effectiveDate,
                reason: '  End of contract  ',
                notes: '  Performance issues  ',
                changedBy
            };
            const statusHistory = new EmployeeStatusHistory(dataWithWhitespace);
            expect(statusHistory.reason).toBe('End of contract');
            expect(statusHistory.notes).toBe('Performance issues');
        });
        it('should throw ValidationError for missing required fields', () => {
            const invalidData = { employeeId, newStatus: 'ACTIVE' };
            expect(() => new EmployeeStatusHistory(invalidData)).toThrow(ValidationError);
        });
        it('should throw ValidationError for invalid employee ID format', () => {
            const invalidData = { ...validStatusHistoryData, employeeId: 'invalid-uuid' };
            expect(() => new EmployeeStatusHistory(invalidData)).toThrow(ValidationError);
        });
        it('should throw ValidationError for invalid status type', () => {
            const invalidData = {
                ...validStatusHistoryData,
                newStatus: 'INVALID_STATUS'
            };
            expect(() => new EmployeeStatusHistory(invalidData)).toThrow(ValidationError);
        });
        it('should throw ValidationError for reason exceeding max length', () => {
            const longReason = 'a'.repeat(501); // Exceeds 500 character limit
            const invalidData = {
                ...validStatusHistoryData,
                newStatus: 'TERMINATED',
                reason: longReason
            };
            expect(() => new EmployeeStatusHistory(invalidData)).toThrow(ValidationError);
        });
        it('should throw ValidationError for notes exceeding max length', () => {
            const longNotes = 'a'.repeat(1001); // Exceeds 1000 character limit
            const invalidData = {
                ...validStatusHistoryData,
                notes: longNotes
            };
            expect(() => new EmployeeStatusHistory(invalidData)).toThrow(ValidationError);
        });
    });
    describe('Business Rule Validation', () => {
        it('should throw ValidationError for terminated status without reason', () => {
            const invalidData = {
                employeeId,
                previousStatus: 'ACTIVE',
                newStatus: 'TERMINATED',
                effectiveDate,
                changedBy
            };
            expect(() => new EmployeeStatusHistory(invalidData)).toThrow(ValidationError);
            expect(() => new EmployeeStatusHistory(invalidData)).toThrow('Termination reason is required');
        });
        it('should throw ValidationError for on leave status without reason', () => {
            const invalidData = {
                employeeId,
                previousStatus: 'ACTIVE',
                newStatus: 'ON_LEAVE',
                effectiveDate,
                changedBy
            };
            expect(() => new EmployeeStatusHistory(invalidData)).toThrow(ValidationError);
            expect(() => new EmployeeStatusHistory(invalidData)).toThrow('Leave reason is required');
        });
        it('should throw ValidationError for effective date in the future', () => {
            const futureDate = new Date();
            futureDate.setFullYear(futureDate.getFullYear() + 1);
            const invalidData = {
                employeeId,
                newStatus: 'ACTIVE',
                effectiveDate: futureDate,
                changedBy
            };
            expect(() => new EmployeeStatusHistory(invalidData)).toThrow(ValidationError);
            expect(() => new EmployeeStatusHistory(invalidData)).toThrow('Effective date cannot be in the future');
        });
        it('should throw ValidationError when new status is same as previous status', () => {
            const invalidData = {
                employeeId,
                previousStatus: 'ACTIVE',
                newStatus: 'ACTIVE',
                effectiveDate,
                changedBy
            };
            expect(() => new EmployeeStatusHistory(invalidData)).toThrow(ValidationError);
            expect(() => new EmployeeStatusHistory(invalidData)).toThrow('New status must be different from previous status');
        });
        it('should accept terminated status with reason', () => {
            const validData = {
                employeeId,
                previousStatus: 'ACTIVE',
                newStatus: 'TERMINATED',
                effectiveDate,
                reason: 'End of contract',
                changedBy
            };
            expect(() => new EmployeeStatusHistory(validData)).not.toThrow();
        });
        it('should accept on leave status with reason', () => {
            const validData = {
                employeeId,
                previousStatus: 'ACTIVE',
                newStatus: 'ON_LEAVE',
                effectiveDate,
                reason: 'Parental leave',
                changedBy
            };
            expect(() => new EmployeeStatusHistory(validData)).not.toThrow();
        });
        it('should accept status change without previous status (initial status)', () => {
            const validData = {
                employeeId,
                newStatus: 'ACTIVE',
                effectiveDate,
                changedBy
            };
            expect(() => new EmployeeStatusHistory(validData)).not.toThrow();
        });
    });
    describe('Helper Methods', () => {
        it('should correctly identify status change', () => {
            const statusChange = new EmployeeStatusHistory({
                employeeId,
                previousStatus: 'ACTIVE',
                newStatus: 'ON_LEAVE',
                effectiveDate,
                reason: 'Medical leave',
                changedBy
            });
            expect(statusChange.isStatusChange()).toBe(true);
            expect(statusChange.isInitialStatus()).toBe(false);
        });
        it('should correctly identify initial status', () => {
            const initialStatus = new EmployeeStatusHistory({
                employeeId,
                newStatus: 'ACTIVE',
                effectiveDate,
                changedBy
            });
            expect(initialStatus.isInitialStatus()).toBe(true);
            expect(initialStatus.isStatusChange()).toBe(false);
        });
        it('should correctly identify termination', () => {
            const termination = new EmployeeStatusHistory({
                employeeId,
                previousStatus: 'ACTIVE',
                newStatus: 'TERMINATED',
                effectiveDate,
                reason: 'Resignation',
                changedBy
            });
            expect(termination.isTermination()).toBe(true);
            expect(termination.isLeave()).toBe(false);
            expect(termination.isActivation()).toBe(false);
            expect(termination.isDeactivation()).toBe(false);
        });
        it('should correctly identify leave', () => {
            const leave = new EmployeeStatusHistory({
                employeeId,
                previousStatus: 'ACTIVE',
                newStatus: 'ON_LEAVE',
                effectiveDate,
                reason: 'Sick leave',
                changedBy
            });
            expect(leave.isLeave()).toBe(true);
            expect(leave.isTermination()).toBe(false);
            expect(leave.isActivation()).toBe(false);
            expect(leave.isDeactivation()).toBe(false);
        });
        it('should correctly identify activation', () => {
            const activation = new EmployeeStatusHistory({
                employeeId,
                previousStatus: 'INACTIVE',
                newStatus: 'ACTIVE',
                effectiveDate,
                changedBy
            });
            expect(activation.isActivation()).toBe(true);
            expect(activation.isTermination()).toBe(false);
            expect(activation.isLeave()).toBe(false);
            expect(activation.isDeactivation()).toBe(false);
        });
        it('should correctly identify deactivation', () => {
            const deactivation = new EmployeeStatusHistory({
                employeeId,
                previousStatus: 'ACTIVE',
                newStatus: 'INACTIVE',
                effectiveDate,
                changedBy
            });
            expect(deactivation.isDeactivation()).toBe(true);
            expect(deactivation.isTermination()).toBe(false);
            expect(deactivation.isLeave()).toBe(false);
            expect(deactivation.isActivation()).toBe(false);
        });
    });
    describe('Static Factory Methods', () => {
        it('should create initial status with createInitialStatus', () => {
            const initialStatus = EmployeeStatusHistory.createInitialStatus(employeeId, 'ACTIVE', effectiveDate, changedBy);
            expect(initialStatus.employeeId).toBe(employeeId);
            expect(initialStatus.previousStatus).toBeUndefined();
            expect(initialStatus.newStatus).toBe('ACTIVE');
            expect(initialStatus.effectiveDate).toEqual(effectiveDate);
            expect(initialStatus.changedBy).toBe(changedBy);
            expect(initialStatus.isInitialStatus()).toBe(true);
        });
        it('should create status change with createStatusChange', () => {
            const statusChange = EmployeeStatusHistory.createStatusChange(employeeId, 'ACTIVE', 'ON_LEAVE', effectiveDate, changedBy, 'Medical leave', 'Doctor recommended rest');
            expect(statusChange.employeeId).toBe(employeeId);
            expect(statusChange.previousStatus).toBe('ACTIVE');
            expect(statusChange.newStatus).toBe('ON_LEAVE');
            expect(statusChange.reason).toBe('Medical leave');
            expect(statusChange.notes).toBe('Doctor recommended rest');
            expect(statusChange.isStatusChange()).toBe(true);
        });
        it('should create termination with createTermination', () => {
            const termination = EmployeeStatusHistory.createTermination(employeeId, 'ACTIVE', 'End of probation', effectiveDate, changedBy, 'Performance did not meet expectations');
            expect(termination.employeeId).toBe(employeeId);
            expect(termination.previousStatus).toBe('ACTIVE');
            expect(termination.newStatus).toBe('TERMINATED');
            expect(termination.reason).toBe('End of probation');
            expect(termination.notes).toBe('Performance did not meet expectations');
            expect(termination.isTermination()).toBe(true);
        });
        it('should create leave with createLeave', () => {
            const leave = EmployeeStatusHistory.createLeave(employeeId, 'ACTIVE', 'Maternity leave', effectiveDate, changedBy, 'Expected return date: 2024-01-15');
            expect(leave.employeeId).toBe(employeeId);
            expect(leave.previousStatus).toBe('ACTIVE');
            expect(leave.newStatus).toBe('ON_LEAVE');
            expect(leave.reason).toBe('Maternity leave');
            expect(leave.notes).toBe('Expected return date: 2024-01-15');
            expect(leave.isLeave()).toBe(true);
        });
    });
    describe('JSON Serialization', () => {
        it('should serialize to JSON correctly', () => {
            const statusHistory = new EmployeeStatusHistory(validStatusHistoryData);
            const json = statusHistory.toJSON();
            expect(json.employeeId).toBe(employeeId);
            expect(json.previousStatus).toBe('ACTIVE');
            expect(json.newStatus).toBe('ON_LEAVE');
            expect(json.effectiveDate).toEqual(effectiveDate);
            expect(json.reason).toBe('Medical leave');
            expect(json.notes).toBe('Doctor recommended 2 weeks rest');
            expect(json.changedBy).toBe(changedBy);
            expect(json.id).toBeDefined();
            expect(json.changedAt).toBeInstanceOf(Date);
        });
        it('should serialize to JSON correctly with minimal data', () => {
            const minimalData = {
                employeeId,
                newStatus: 'ACTIVE',
                effectiveDate,
                changedBy
            };
            const statusHistory = new EmployeeStatusHistory(minimalData);
            const json = statusHistory.toJSON();
            expect(json.employeeId).toBe(employeeId);
            expect(json.previousStatus).toBeUndefined();
            expect(json.newStatus).toBe('ACTIVE');
            expect(json.effectiveDate).toEqual(effectiveDate);
            expect(json.reason).toBeUndefined();
            expect(json.notes).toBeUndefined();
            expect(json.changedBy).toBe(changedBy);
        });
        it('should round-trip through JSON correctly', () => {
            const originalStatusHistory = new EmployeeStatusHistory(validStatusHistoryData);
            const json = originalStatusHistory.toJSON();
            const recreatedStatusHistory = new EmployeeStatusHistory(json);
            expect(recreatedStatusHistory.employeeId).toBe(originalStatusHistory.employeeId);
            expect(recreatedStatusHistory.previousStatus).toBe(originalStatusHistory.previousStatus);
            expect(recreatedStatusHistory.newStatus).toBe(originalStatusHistory.newStatus);
            expect(recreatedStatusHistory.effectiveDate).toEqual(originalStatusHistory.effectiveDate);
            expect(recreatedStatusHistory.reason).toBe(originalStatusHistory.reason);
            expect(recreatedStatusHistory.notes).toBe(originalStatusHistory.notes);
            expect(recreatedStatusHistory.changedBy).toBe(originalStatusHistory.changedBy);
        });
    });
});
