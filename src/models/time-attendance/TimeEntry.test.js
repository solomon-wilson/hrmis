import { TimeEntry, BreakEntry } from './TimeEntry';
import { ValidationError } from '../../utils/validation';
describe('BreakEntry', () => {
    const validBreakData = {
        timeEntryId: '123e4567-e89b-12d3-a456-426614174000',
        breakType: 'SHORT_BREAK',
        startTime: new Date('2024-01-15T10:00:00Z'),
        endTime: new Date('2024-01-15T10:15:00Z'),
        paid: true
    };
    describe('constructor', () => {
        it('should create a valid break entry', () => {
            const breakEntry = new BreakEntry(validBreakData);
            expect(breakEntry.id).toBeDefined();
            expect(breakEntry.timeEntryId).toBe(validBreakData.timeEntryId);
            expect(breakEntry.breakType).toBe(validBreakData.breakType);
            expect(breakEntry.startTime).toEqual(validBreakData.startTime);
            expect(breakEntry.endTime).toEqual(validBreakData.endTime);
            expect(breakEntry.paid).toBe(validBreakData.paid);
        });
        it('should generate UUID if id is not provided', () => {
            const breakEntry = new BreakEntry(validBreakData);
            expect(breakEntry.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
        });
        it('should throw error for invalid break type', () => {
            const invalidData = { ...validBreakData, breakType: 'INVALID' };
            expect(() => new BreakEntry(invalidData)).toThrow(ValidationError);
        });
        it('should throw error when end time is before start time', () => {
            const invalidData = {
                ...validBreakData,
                startTime: new Date('2024-01-15T10:15:00Z'),
                endTime: new Date('2024-01-15T10:00:00Z')
            };
            expect(() => new BreakEntry(invalidData)).toThrow('Break end time must be after start time');
        });
        it('should throw error when end time is in the future', () => {
            const futureTime = new Date(Date.now() + 60000); // 1 minute in future
            const invalidData = {
                ...validBreakData,
                endTime: futureTime
            };
            expect(() => new BreakEntry(invalidData)).toThrow('Break end time cannot be in the future');
        });
        it('should throw error when break exceeds maximum duration', () => {
            const invalidData = {
                ...validBreakData,
                breakType: 'SHORT_BREAK',
                startTime: new Date('2024-01-15T10:00:00Z'),
                endTime: new Date('2024-01-15T10:45:00Z') // 45 minutes, exceeds 30 min limit
            };
            expect(() => new BreakEntry(invalidData)).toThrow('SHORT_BREAK break cannot exceed 30 minutes');
        });
    });
    describe('calculateDuration', () => {
        it('should calculate duration correctly', () => {
            const breakEntry = new BreakEntry(validBreakData);
            expect(breakEntry.calculateDuration()).toBe(15); // 15 minutes
        });
        it('should return 0 for active breaks', () => {
            const activeBreakData = { ...validBreakData, endTime: undefined };
            const breakEntry = new BreakEntry(activeBreakData);
            expect(breakEntry.calculateDuration()).toBe(0);
        });
    });
    describe('isActive', () => {
        it('should return true for active breaks', () => {
            const activeBreakData = { ...validBreakData, endTime: undefined };
            const breakEntry = new BreakEntry(activeBreakData);
            expect(breakEntry.isActive()).toBe(true);
        });
        it('should return false for completed breaks', () => {
            const breakEntry = new BreakEntry(validBreakData);
            expect(breakEntry.isActive()).toBe(false);
        });
    });
    describe('endBreak', () => {
        it('should end an active break', () => {
            const activeBreakData = { ...validBreakData, endTime: undefined };
            const breakEntry = new BreakEntry(activeBreakData);
            const endTime = new Date('2024-01-15T10:20:00Z');
            const endedBreak = breakEntry.endBreak(endTime);
            expect(endedBreak.endTime).toEqual(endTime);
            expect(endedBreak.isActive()).toBe(false);
        });
        it('should throw error when trying to end already ended break', () => {
            const breakEntry = new BreakEntry(validBreakData);
            expect(() => breakEntry.endBreak()).toThrow('Break is already ended');
        });
    });
    describe('getDurationInHours', () => {
        it('should return duration in hours', () => {
            const breakEntry = new BreakEntry(validBreakData);
            expect(breakEntry.getDurationInHours()).toBe(0.25); // 15 minutes = 0.25 hours
        });
    });
    describe('isLongBreak', () => {
        it('should return true for breaks longer than 30 minutes', () => {
            const longBreakData = {
                ...validBreakData,
                breakType: 'LUNCH',
                endTime: new Date('2024-01-15T10:45:00Z') // 45 minutes
            };
            const breakEntry = new BreakEntry(longBreakData);
            expect(breakEntry.isLongBreak()).toBe(true);
        });
        it('should return false for breaks 30 minutes or less', () => {
            const breakEntry = new BreakEntry(validBreakData); // 15 minutes
            expect(breakEntry.isLongBreak()).toBe(false);
        });
    });
});
describe('TimeEntry', () => {
    const validTimeEntryData = {
        employeeId: '123e4567-e89b-12d3-a456-426614174000',
        clockInTime: new Date('2024-01-15T09:00:00Z'),
        clockOutTime: new Date('2024-01-15T17:00:00Z'),
        status: 'COMPLETED',
        manualEntry: false,
        breakEntries: []
    };
    const validLocation = {
        latitude: 40.7128,
        longitude: -74.0060,
        accuracy: 10
    };
    describe('constructor', () => {
        it('should create a valid time entry', () => {
            const timeEntry = new TimeEntry(validTimeEntryData);
            expect(timeEntry.id).toBeDefined();
            expect(timeEntry.employeeId).toBe(validTimeEntryData.employeeId);
            expect(timeEntry.clockInTime).toEqual(validTimeEntryData.clockInTime);
            expect(timeEntry.clockOutTime).toEqual(validTimeEntryData.clockOutTime);
            expect(timeEntry.status).toBe(validTimeEntryData.status);
            expect(timeEntry.manualEntry).toBe(validTimeEntryData.manualEntry);
            expect(timeEntry.breakEntries).toEqual([]);
        });
        it('should throw error when clock out time is before clock in time', () => {
            const invalidData = {
                ...validTimeEntryData,
                clockInTime: new Date('2024-01-15T17:00:00Z'),
                clockOutTime: new Date('2024-01-15T09:00:00Z')
            };
            expect(() => new TimeEntry(invalidData)).toThrow('Clock out time must be after clock in time');
        });
        it('should throw error when clock in time is in the future', () => {
            const futureTime = new Date(Date.now() + 60000);
            const invalidData = { ...validTimeEntryData, clockInTime: futureTime };
            expect(() => new TimeEntry(invalidData)).toThrow('Clock in time cannot be in the future');
        });
        it('should throw error when clock out time is in the future', () => {
            const futureTime = new Date(Date.now() + 60000);
            const invalidData = { ...validTimeEntryData, clockOutTime: futureTime };
            expect(() => new TimeEntry(invalidData)).toThrow('Clock out time cannot be in the future');
        });
        it('should throw error for manual entry without notes', () => {
            const invalidData = { ...validTimeEntryData, manualEntry: true };
            expect(() => new TimeEntry(invalidData)).toThrow('Manual entries require notes explaining the reason');
        });
        it('should throw error for completed entry without clock out time', () => {
            const invalidData = {
                ...validTimeEntryData,
                clockOutTime: undefined,
                status: 'COMPLETED'
            };
            expect(() => new TimeEntry(invalidData)).toThrow('Completed entries must have clock out time');
        });
        it('should throw error for active entry with clock out time', () => {
            const invalidData = {
                ...validTimeEntryData,
                status: 'ACTIVE'
            };
            expect(() => new TimeEntry(invalidData)).toThrow('Active entries cannot have clock out time');
        });
        it('should throw error when time entry exceeds 24 hours', () => {
            const invalidData = {
                ...validTimeEntryData,
                clockInTime: new Date('2024-01-15T09:00:00Z'),
                clockOutTime: new Date('2024-01-16T10:00:00Z') // 25 hours
            };
            expect(() => new TimeEntry(invalidData)).toThrow('Time entry cannot exceed 24 hours');
        });
    });
    describe('break validation', () => {
        it('should throw error when break starts before clock in', () => {
            const breakData = {
                timeEntryId: '123e4567-e89b-12d3-a456-426614174000',
                breakType: 'SHORT_BREAK',
                startTime: new Date('2024-01-15T08:30:00Z'), // Before clock in
                endTime: new Date('2024-01-15T08:45:00Z'),
                paid: true
            };
            const invalidData = {
                ...validTimeEntryData,
                breakEntries: [breakData]
            };
            expect(() => new TimeEntry(invalidData)).toThrow('Break cannot start before clock in time');
        });
        it('should throw error when break ends after clock out', () => {
            const breakData = {
                timeEntryId: '123e4567-e89b-12d3-a456-426614174000',
                breakType: 'SHORT_BREAK',
                startTime: new Date('2024-01-15T16:45:00Z'),
                endTime: new Date('2024-01-15T17:15:00Z'), // After clock out
                paid: true
            };
            const invalidData = {
                ...validTimeEntryData,
                breakEntries: [breakData]
            };
            expect(() => new TimeEntry(invalidData)).toThrow('Break cannot end after clock out time');
        });
        it('should throw error for overlapping breaks', () => {
            const break1 = {
                timeEntryId: '123e4567-e89b-12d3-a456-426614174000',
                breakType: 'SHORT_BREAK',
                startTime: new Date('2024-01-15T10:00:00Z'),
                endTime: new Date('2024-01-15T10:15:00Z'),
                paid: true
            };
            const break2 = {
                timeEntryId: '123e4567-e89b-12d3-a456-426614174000',
                breakType: 'SHORT_BREAK',
                startTime: new Date('2024-01-15T10:10:00Z'), // Overlaps with break1
                endTime: new Date('2024-01-15T10:25:00Z'),
                paid: true
            };
            const invalidData = {
                ...validTimeEntryData,
                breakEntries: [break1, break2]
            };
            expect(() => new TimeEntry(invalidData)).toThrow('Break periods cannot overlap');
        });
    });
    describe('calculateTotalHours', () => {
        it('should calculate total hours correctly', () => {
            const timeEntry = new TimeEntry(validTimeEntryData);
            expect(timeEntry.calculateTotalHours()).toBe(8); // 8 hours
        });
        it('should return 0 for active entries without clock out', () => {
            const activeData = {
                ...validTimeEntryData,
                clockOutTime: undefined,
                status: 'ACTIVE'
            };
            const timeEntry = new TimeEntry(activeData);
            expect(timeEntry.calculateTotalHours()).toBe(0);
        });
        it('should deduct unpaid break time', () => {
            const breakData = {
                timeEntryId: '123e4567-e89b-12d3-a456-426614174000',
                breakType: 'LUNCH',
                startTime: new Date('2024-01-15T12:00:00Z'),
                endTime: new Date('2024-01-15T13:00:00Z'), // 1 hour unpaid lunch
                paid: false
            };
            const dataWithBreak = {
                ...validTimeEntryData,
                breakEntries: [breakData]
            };
            const timeEntry = new TimeEntry(dataWithBreak);
            expect(timeEntry.calculateTotalHours()).toBe(7); // 8 hours - 1 hour unpaid break
        });
    });
    describe('status methods', () => {
        it('should correctly identify active entries', () => {
            const activeData = {
                ...validTimeEntryData,
                clockOutTime: undefined,
                status: 'ACTIVE'
            };
            const timeEntry = new TimeEntry(activeData);
            expect(timeEntry.isActive()).toBe(true);
            expect(timeEntry.isCompleted()).toBe(false);
        });
        it('should correctly identify completed entries', () => {
            const timeEntry = new TimeEntry(validTimeEntryData);
            expect(timeEntry.isActive()).toBe(false);
            expect(timeEntry.isCompleted()).toBe(true);
        });
    });
    describe('break management', () => {
        it('should add break correctly', () => {
            const activeData = {
                ...validTimeEntryData,
                clockOutTime: undefined,
                status: 'ACTIVE'
            };
            const timeEntry = new TimeEntry(activeData);
            const breakData = {
                breakType: 'SHORT_BREAK',
                startTime: new Date('2024-01-15T10:00:00Z'),
                paid: true
            };
            const addedBreak = timeEntry.addBreak(breakData);
            expect(addedBreak.breakType).toBe('SHORT_BREAK');
            expect(timeEntry.breakEntries).toHaveLength(1);
            expect(timeEntry.hasActiveBreak()).toBe(true);
        });
        it('should end break correctly', () => {
            const breakData = {
                timeEntryId: '123e4567-e89b-12d3-a456-426614174000',
                breakType: 'SHORT_BREAK',
                startTime: new Date('2024-01-15T10:00:00Z'),
                paid: true
            };
            const activeData = {
                ...validTimeEntryData,
                clockOutTime: undefined,
                status: 'ACTIVE',
                breakEntries: [breakData]
            };
            const timeEntry = new TimeEntry(activeData);
            const activeBreak = timeEntry.getActiveBreak();
            expect(activeBreak).toBeDefined();
            const endTime = new Date('2024-01-15T10:15:00Z');
            const endedBreak = timeEntry.endBreak(activeBreak.id, endTime);
            expect(endedBreak.endTime).toEqual(endTime);
            expect(timeEntry.hasActiveBreak()).toBe(false);
        });
        it('should calculate break times correctly', () => {
            const paidBreak = {
                timeEntryId: '123e4567-e89b-12d3-a456-426614174000',
                breakType: 'SHORT_BREAK',
                startTime: new Date('2024-01-15T10:00:00Z'),
                endTime: new Date('2024-01-15T10:15:00Z'),
                paid: true
            };
            const unpaidBreak = {
                timeEntryId: '123e4567-e89b-12d3-a456-426614174000',
                breakType: 'LUNCH',
                startTime: new Date('2024-01-15T12:00:00Z'),
                endTime: new Date('2024-01-15T13:00:00Z'),
                paid: false
            };
            const dataWithBreaks = {
                ...validTimeEntryData,
                breakEntries: [paidBreak, unpaidBreak]
            };
            const timeEntry = new TimeEntry(dataWithBreaks);
            expect(timeEntry.getTotalBreakTime()).toBe(75); // 15 + 60 minutes
            expect(timeEntry.getPaidBreakTime()).toBe(15); // 15 minutes
            expect(timeEntry.getUnpaidBreakTime()).toBe(60); // 60 minutes
        });
    });
    describe('clock out', () => {
        it('should clock out successfully', () => {
            const activeData = {
                ...validTimeEntryData,
                clockOutTime: undefined,
                status: 'ACTIVE'
            };
            const timeEntry = new TimeEntry(activeData);
            const clockOutTime = new Date('2024-01-15T17:00:00Z');
            const clockedOutEntry = timeEntry.clockOut(clockOutTime);
            expect(clockedOutEntry.clockOutTime).toEqual(clockOutTime);
            expect(clockedOutEntry.status).toBe('COMPLETED');
            expect(clockedOutEntry.totalHours).toBe(8);
        });
        it('should throw error when already clocked out', () => {
            const timeEntry = new TimeEntry(validTimeEntryData);
            expect(() => timeEntry.clockOut()).toThrow('Employee is already clocked out');
        });
        it('should throw error when trying to clock out while on break', () => {
            const breakData = {
                timeEntryId: '123e4567-e89b-12d3-a456-426614174000',
                breakType: 'SHORT_BREAK',
                startTime: new Date('2024-01-15T10:00:00Z'),
                paid: true
            };
            const activeData = {
                ...validTimeEntryData,
                clockOutTime: undefined,
                status: 'ACTIVE',
                breakEntries: [breakData]
            };
            const timeEntry = new TimeEntry(activeData);
            expect(() => timeEntry.clockOut()).toThrow('Cannot clock out while on break');
        });
    });
    describe('approval workflow', () => {
        it('should identify entries requiring approval', () => {
            const manualEntryData = {
                ...validTimeEntryData,
                manualEntry: true,
                status: 'PENDING_APPROVAL',
                notes: 'Forgot to clock in'
            };
            const timeEntry = new TimeEntry(manualEntryData);
            expect(timeEntry.requiresApproval()).toBe(true);
        });
        it('should approve entry successfully', () => {
            const manualEntryData = {
                ...validTimeEntryData,
                manualEntry: true,
                status: 'PENDING_APPROVAL',
                notes: 'Forgot to clock in'
            };
            const timeEntry = new TimeEntry(manualEntryData);
            const approverId = '456e7890-e89b-12d3-a456-426614174000';
            const approvalTime = new Date();
            const approvedEntry = timeEntry.approve(approverId, approvalTime);
            expect(approvedEntry.status).toBe('COMPLETED');
            expect(approvedEntry.approvedBy).toBe(approverId);
            expect(approvedEntry.approvedAt).toEqual(approvalTime);
        });
        it('should throw error when trying to approve entry that does not require approval', () => {
            const timeEntry = new TimeEntry(validTimeEntryData);
            expect(() => timeEntry.approve('123')).toThrow('Time entry does not require approval');
        });
    });
    describe('static factory methods', () => {
        it('should create clock in entry', () => {
            const employeeId = '123e4567-e89b-12d3-a456-426614174000';
            const timeEntry = TimeEntry.createClockIn(employeeId, validLocation);
            expect(timeEntry.employeeId).toBe(employeeId);
            expect(timeEntry.location).toEqual(validLocation);
            expect(timeEntry.status).toBe('ACTIVE');
            expect(timeEntry.manualEntry).toBe(false);
            expect(timeEntry.clockOutTime).toBeUndefined();
        });
        it('should create manual entry', () => {
            const employeeId = '123e4567-e89b-12d3-a456-426614174000';
            const clockInTime = new Date('2024-01-15T09:00:00Z');
            const clockOutTime = new Date('2024-01-15T17:00:00Z');
            const notes = 'Forgot to clock in';
            const timeEntry = TimeEntry.createManualEntry(employeeId, clockInTime, clockOutTime, notes, validLocation);
            expect(timeEntry.employeeId).toBe(employeeId);
            expect(timeEntry.clockInTime).toEqual(clockInTime);
            expect(timeEntry.clockOutTime).toEqual(clockOutTime);
            expect(timeEntry.notes).toBe(notes);
            expect(timeEntry.location).toEqual(validLocation);
            expect(timeEntry.status).toBe('PENDING_APPROVAL');
            expect(timeEntry.manualEntry).toBe(true);
        });
    });
});
