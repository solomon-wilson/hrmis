import { EmployeeTimeStatus } from './EmployeeTimeStatus';
describe('EmployeeTimeStatus', () => {
    const validEmployeeId = '123e4567-e89b-12d3-a456-426614174000';
    const validTimeEntryId = '456e7890-e89b-12d3-a456-426614174000';
    const validBreakEntryId = '789e0123-e89b-12d3-a456-426614174000';
    const validClockedOutData = {
        employeeId: validEmployeeId,
        currentStatus: 'CLOCKED_OUT',
        totalHoursToday: 0,
        lastUpdated: new Date()
    };
    const validClockedInData = {
        employeeId: validEmployeeId,
        currentStatus: 'CLOCKED_IN',
        activeTimeEntryId: validTimeEntryId,
        lastClockInTime: new Date(),
        totalHoursToday: 4.5,
        lastUpdated: new Date()
    };
    const validOnBreakData = {
        employeeId: validEmployeeId,
        currentStatus: 'ON_BREAK',
        activeTimeEntryId: validTimeEntryId,
        activeBreakEntryId: validBreakEntryId,
        lastClockInTime: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
        lastBreakStartTime: new Date(Date.now() - 30 * 60 * 1000), // 30 minutes ago
        totalHoursToday: 4.5,
        lastUpdated: new Date()
    };
    describe('constructor', () => {
        it('should create a valid clocked out status', () => {
            const status = new EmployeeTimeStatus(validClockedOutData);
            expect(status.id).toBeDefined();
            expect(status.employeeId).toBe(validEmployeeId);
            expect(status.currentStatus).toBe('CLOCKED_OUT');
            expect(status.activeTimeEntryId).toBeUndefined();
            expect(status.activeBreakEntryId).toBeUndefined();
            expect(status.totalHoursToday).toBe(0);
        });
        it('should create a valid clocked in status', () => {
            const status = new EmployeeTimeStatus(validClockedInData);
            expect(status.currentStatus).toBe('CLOCKED_IN');
            expect(status.activeTimeEntryId).toBe(validTimeEntryId);
            expect(status.lastClockInTime).toBeDefined();
            expect(status.totalHoursToday).toBe(4.5);
        });
        it('should create a valid on break status', () => {
            const status = new EmployeeTimeStatus(validOnBreakData);
            expect(status.currentStatus).toBe('ON_BREAK');
            expect(status.activeTimeEntryId).toBe(validTimeEntryId);
            expect(status.activeBreakEntryId).toBe(validBreakEntryId);
            expect(status.lastBreakStartTime).toBeDefined();
        });
        it('should throw error for clocked in status without active time entry', () => {
            const invalidData = {
                ...validClockedInData,
                activeTimeEntryId: undefined
            };
            expect(() => new EmployeeTimeStatus(invalidData)).toThrow('Clocked in status requires active time entry ID');
        });
        it('should throw error for on break status without active break entry', () => {
            const invalidData = {
                ...validOnBreakData,
                activeBreakEntryId: undefined
            };
            expect(() => new EmployeeTimeStatus(invalidData)).toThrow('On break status requires active break entry ID');
        });
        it('should throw error for clocked out status with active entries', () => {
            const invalidData = {
                ...validClockedOutData,
                activeTimeEntryId: validTimeEntryId
            };
            expect(() => new EmployeeTimeStatus(invalidData)).toThrow('Clocked out status cannot have active entries');
        });
        it('should throw error for break entry without active time entry', () => {
            const invalidData = {
                ...validOnBreakData,
                activeTimeEntryId: undefined
            };
            expect(() => new EmployeeTimeStatus(invalidData)).toThrow('Break entry requires active time entry');
        });
    });
    describe('status check methods', () => {
        it('should correctly identify working status', () => {
            const clockedInStatus = new EmployeeTimeStatus(validClockedInData);
            const clockedOutStatus = new EmployeeTimeStatus(validClockedOutData);
            const onBreakStatus = new EmployeeTimeStatus(validOnBreakData);
            expect(clockedInStatus.isWorking()).toBe(true);
            expect(clockedOutStatus.isWorking()).toBe(false);
            expect(onBreakStatus.isWorking()).toBe(false);
        });
        it('should correctly identify on break status', () => {
            const clockedInStatus = new EmployeeTimeStatus(validClockedInData);
            const clockedOutStatus = new EmployeeTimeStatus(validClockedOutData);
            const onBreakStatus = new EmployeeTimeStatus(validOnBreakData);
            expect(clockedInStatus.isOnBreak()).toBe(false);
            expect(clockedOutStatus.isOnBreak()).toBe(false);
            expect(onBreakStatus.isOnBreak()).toBe(true);
        });
        it('should correctly identify clocked out status', () => {
            const clockedInStatus = new EmployeeTimeStatus(validClockedInData);
            const clockedOutStatus = new EmployeeTimeStatus(validClockedOutData);
            const onBreakStatus = new EmployeeTimeStatus(validOnBreakData);
            expect(clockedInStatus.isClockedOut()).toBe(false);
            expect(clockedOutStatus.isClockedOut()).toBe(true);
            expect(onBreakStatus.isClockedOut()).toBe(false);
        });
    });
    describe('transition capability methods', () => {
        it('should correctly identify clock in capability', () => {
            const clockedOutStatus = new EmployeeTimeStatus(validClockedOutData);
            const clockedInStatus = new EmployeeTimeStatus(validClockedInData);
            const onBreakStatus = new EmployeeTimeStatus(validOnBreakData);
            expect(clockedOutStatus.canClockIn()).toBe(true);
            expect(clockedInStatus.canClockIn()).toBe(false);
            expect(onBreakStatus.canClockIn()).toBe(false);
        });
        it('should correctly identify clock out capability', () => {
            const clockedOutStatus = new EmployeeTimeStatus(validClockedOutData);
            const clockedInStatus = new EmployeeTimeStatus(validClockedInData);
            const onBreakStatus = new EmployeeTimeStatus(validOnBreakData);
            expect(clockedOutStatus.canClockOut()).toBe(false);
            expect(clockedInStatus.canClockOut()).toBe(true);
            expect(onBreakStatus.canClockOut()).toBe(false);
        });
        it('should correctly identify start break capability', () => {
            const clockedOutStatus = new EmployeeTimeStatus(validClockedOutData);
            const clockedInStatus = new EmployeeTimeStatus(validClockedInData);
            const onBreakStatus = new EmployeeTimeStatus(validOnBreakData);
            expect(clockedOutStatus.canStartBreak()).toBe(false);
            expect(clockedInStatus.canStartBreak()).toBe(true);
            expect(onBreakStatus.canStartBreak()).toBe(false);
        });
        it('should correctly identify end break capability', () => {
            const clockedOutStatus = new EmployeeTimeStatus(validClockedOutData);
            const clockedInStatus = new EmployeeTimeStatus(validClockedInData);
            const onBreakStatus = new EmployeeTimeStatus(validOnBreakData);
            expect(clockedOutStatus.canEndBreak()).toBe(false);
            expect(clockedInStatus.canEndBreak()).toBe(false);
            expect(onBreakStatus.canEndBreak()).toBe(true);
        });
    });
    describe('state transitions', () => {
        it('should clock in successfully from clocked out', () => {
            const status = new EmployeeTimeStatus(validClockedOutData);
            const newStatus = status.clockIn(validTimeEntryId);
            expect(newStatus.currentStatus).toBe('CLOCKED_IN');
            expect(newStatus.activeTimeEntryId).toBe(validTimeEntryId);
            expect(newStatus.lastClockInTime).toBeDefined();
        });
        it('should throw error when trying to clock in from clocked in', () => {
            const status = new EmployeeTimeStatus(validClockedInData);
            expect(() => status.clockIn(validTimeEntryId)).toThrow('Cannot clock in from current status');
        });
        it('should clock out successfully from clocked in', () => {
            const status = new EmployeeTimeStatus(validClockedInData);
            const newStatus = status.clockOut();
            expect(newStatus.currentStatus).toBe('CLOCKED_OUT');
            expect(newStatus.activeTimeEntryId).toBeUndefined();
            expect(newStatus.activeBreakEntryId).toBeUndefined();
            expect(newStatus.lastClockInTime).toBeUndefined();
        });
        it('should throw error when trying to clock out from clocked out', () => {
            const status = new EmployeeTimeStatus(validClockedOutData);
            expect(() => status.clockOut()).toThrow('Cannot clock out from current status');
        });
        it('should start break successfully from clocked in', () => {
            const status = new EmployeeTimeStatus(validClockedInData);
            const newStatus = status.startBreak(validBreakEntryId);
            expect(newStatus.currentStatus).toBe('ON_BREAK');
            expect(newStatus.activeBreakEntryId).toBe(validBreakEntryId);
            expect(newStatus.lastBreakStartTime).toBeDefined();
            expect(newStatus.activeTimeEntryId).toBe(validTimeEntryId); // Should retain time entry
        });
        it('should throw error when trying to start break from clocked out', () => {
            const status = new EmployeeTimeStatus(validClockedOutData);
            expect(() => status.startBreak(validBreakEntryId)).toThrow('Cannot start break from current status');
        });
        it('should end break successfully from on break', () => {
            const status = new EmployeeTimeStatus(validOnBreakData);
            const newStatus = status.endBreak();
            expect(newStatus.currentStatus).toBe('CLOCKED_IN');
            expect(newStatus.activeBreakEntryId).toBeUndefined();
            expect(newStatus.lastBreakStartTime).toBeUndefined();
            expect(newStatus.activeTimeEntryId).toBe(validTimeEntryId); // Should retain time entry
        });
        it('should throw error when trying to end break from clocked in', () => {
            const status = new EmployeeTimeStatus(validClockedInData);
            expect(() => status.endBreak()).toThrow('Cannot end break from current status');
        });
    });
    describe('validation methods', () => {
        it('should validate valid transitions', () => {
            const clockedOutStatus = new EmployeeTimeStatus(validClockedOutData);
            const clockedInStatus = new EmployeeTimeStatus(validClockedInData);
            const onBreakStatus = new EmployeeTimeStatus(validOnBreakData);
            expect(clockedOutStatus.validateTransition('CLOCKED_IN')).toBe(true);
            expect(clockedOutStatus.validateTransition('ON_BREAK')).toBe(false);
            expect(clockedInStatus.validateTransition('CLOCKED_OUT')).toBe(true);
            expect(clockedInStatus.validateTransition('ON_BREAK')).toBe(true);
            expect(clockedInStatus.validateTransition('CLOCKED_IN')).toBe(false);
            expect(onBreakStatus.validateTransition('CLOCKED_IN')).toBe(true);
            expect(onBreakStatus.validateTransition('CLOCKED_OUT')).toBe(false);
        });
        it('should return valid transitions', () => {
            const clockedOutStatus = new EmployeeTimeStatus(validClockedOutData);
            const clockedInStatus = new EmployeeTimeStatus(validClockedInData);
            const onBreakStatus = new EmployeeTimeStatus(validOnBreakData);
            expect(clockedOutStatus.getValidTransitions()).toEqual(['CLOCKED_IN']);
            expect(clockedInStatus.getValidTransitions()).toEqual(['CLOCKED_OUT', 'ON_BREAK']);
            expect(onBreakStatus.getValidTransitions()).toEqual(['CLOCKED_IN']);
        });
    });
    describe('incomplete entry detection', () => {
        it('should detect incomplete time entry for long work session', () => {
            const longWorkData = {
                ...validClockedInData,
                lastClockInTime: new Date(Date.now() - 13 * 60 * 60 * 1000) // 13 hours ago
            };
            const status = new EmployeeTimeStatus(longWorkData);
            expect(status.hasIncompleteTimeEntry()).toBe(true);
            expect(status.hasIncompleteTimeEntry(10)).toBe(true); // Custom threshold
            expect(status.hasIncompleteTimeEntry(15)).toBe(false); // Higher threshold
        });
        it('should not detect incomplete entry for normal work session', () => {
            const status = new EmployeeTimeStatus(validClockedInData);
            expect(status.hasIncompleteTimeEntry()).toBe(false);
        });
        it('should not detect incomplete entry for clocked out status', () => {
            const status = new EmployeeTimeStatus(validClockedOutData);
            expect(status.hasIncompleteTimeEntry()).toBe(false);
        });
        it('should detect long break', () => {
            const longBreakData = {
                ...validOnBreakData,
                lastBreakStartTime: new Date(Date.now() - 3 * 60 * 60 * 1000) // 3 hours ago
            };
            const status = new EmployeeTimeStatus(longBreakData);
            expect(status.hasLongBreak()).toBe(true);
            expect(status.hasLongBreak(60)).toBe(true); // Custom threshold
            expect(status.hasLongBreak(240)).toBe(false); // Higher threshold
        });
        it('should not detect long break for normal break', () => {
            const status = new EmployeeTimeStatus(validOnBreakData);
            expect(status.hasLongBreak()).toBe(false);
        });
    });
    describe('duration calculations', () => {
        it('should calculate current work duration', () => {
            const workData = {
                ...validClockedInData,
                lastClockInTime: new Date(Date.now() - 2.5 * 60 * 60 * 1000) // 2.5 hours ago
            };
            const status = new EmployeeTimeStatus(workData);
            const duration = status.getCurrentWorkDuration();
            expect(duration).toBeCloseTo(2.5, 1);
        });
        it('should return 0 work duration for clocked out status', () => {
            const status = new EmployeeTimeStatus(validClockedOutData);
            expect(status.getCurrentWorkDuration()).toBe(0);
        });
        it('should calculate current break duration', () => {
            const breakData = {
                ...validOnBreakData,
                lastBreakStartTime: new Date(Date.now() - 45 * 60 * 1000) // 45 minutes ago
            };
            const status = new EmployeeTimeStatus(breakData);
            const duration = status.getCurrentBreakDuration();
            expect(duration).toBeCloseTo(45, 1);
        });
        it('should return 0 break duration for non-break status', () => {
            const status = new EmployeeTimeStatus(validClockedInData);
            expect(status.getCurrentBreakDuration()).toBe(0);
        });
    });
    describe('anomaly detection', () => {
        it('should detect multiple issues', () => {
            const problematicData = {
                ...validClockedInData,
                lastClockInTime: new Date(Date.now() - 15 * 60 * 60 * 1000), // 15 hours ago
                totalHoursToday: 18, // Excessive hours
                lastUpdated: new Date(Date.now() - 25 * 60 * 60 * 1000) // 25 hours ago
            };
            const status = new EmployeeTimeStatus(problematicData);
            const attention = status.requiresAttention();
            expect(attention.hasIssue).toBe(true);
            expect(attention.issues).toContain('Employee has been clocked in for more than 12 hours');
            expect(attention.issues).toContain('Employee has worked more than 16 hours today');
            expect(attention.issues).toContain('Status has not been updated in over 24 hours');
        });
        it('should detect long break issue', () => {
            const longBreakData = {
                ...validOnBreakData,
                lastBreakStartTime: new Date(Date.now() - 3 * 60 * 60 * 1000) // 3 hours ago
            };
            const status = new EmployeeTimeStatus(longBreakData);
            const attention = status.requiresAttention();
            expect(attention.hasIssue).toBe(true);
            expect(attention.issues).toContain('Employee has been on break for more than 2 hours');
        });
        it('should not detect issues for normal status', () => {
            const status = new EmployeeTimeStatus(validClockedInData);
            const attention = status.requiresAttention();
            expect(attention.hasIssue).toBe(false);
            expect(attention.issues).toHaveLength(0);
        });
    });
    describe('utility methods', () => {
        it('should provide human-readable status descriptions', () => {
            const clockedOutStatus = new EmployeeTimeStatus(validClockedOutData);
            const clockedInStatus = new EmployeeTimeStatus(validClockedInData);
            const onBreakStatus = new EmployeeTimeStatus(validOnBreakData);
            expect(clockedOutStatus.getStatusDescription()).toBe('Not working');
            expect(clockedInStatus.getStatusDescription()).toContain('Working for');
            expect(onBreakStatus.getStatusDescription()).toContain('On break for');
        });
        it('should update total hours', () => {
            const status = new EmployeeTimeStatus(validClockedInData);
            const updatedStatus = status.updateTotalHours(6.5);
            expect(updatedStatus.totalHoursToday).toBe(6.5);
            expect(updatedStatus.lastUpdated.getTime()).toBeGreaterThan(status.lastUpdated.getTime());
        });
        it('should reset daily totals', () => {
            const status = new EmployeeTimeStatus({
                ...validClockedInData,
                totalHoursToday: 8.5
            });
            const resetStatus = status.resetDailyTotals();
            expect(resetStatus.totalHoursToday).toBe(0);
            expect(resetStatus.currentStatus).toBe(status.currentStatus); // Other fields unchanged
        });
        it('should force status change to clocked out', () => {
            const status = new EmployeeTimeStatus(validOnBreakData);
            const forcedStatus = status.forceStatusChange('CLOCKED_OUT');
            expect(forcedStatus.currentStatus).toBe('CLOCKED_OUT');
            expect(forcedStatus.activeTimeEntryId).toBeUndefined();
            expect(forcedStatus.activeBreakEntryId).toBeUndefined();
            expect(forcedStatus.lastClockInTime).toBeUndefined();
            expect(forcedStatus.lastBreakStartTime).toBeUndefined();
        });
        it('should force status change to clocked in', () => {
            const status = new EmployeeTimeStatus(validClockedOutData);
            const forcedStatus = status.forceStatusChange('CLOCKED_IN', validTimeEntryId);
            expect(forcedStatus.currentStatus).toBe('CLOCKED_IN');
            expect(forcedStatus.activeTimeEntryId).toBe(validTimeEntryId);
            expect(forcedStatus.lastClockInTime).toBeDefined();
        });
        it('should force status change to on break', () => {
            const status = new EmployeeTimeStatus(validClockedOutData);
            const forcedStatus = status.forceStatusChange('ON_BREAK', validTimeEntryId, validBreakEntryId);
            expect(forcedStatus.currentStatus).toBe('ON_BREAK');
            expect(forcedStatus.activeTimeEntryId).toBe(validTimeEntryId);
            expect(forcedStatus.activeBreakEntryId).toBe(validBreakEntryId);
            expect(forcedStatus.lastClockInTime).toBeDefined();
            expect(forcedStatus.lastBreakStartTime).toBeDefined();
        });
    });
    describe('static factory methods', () => {
        it('should create new employee status', () => {
            const status = EmployeeTimeStatus.createNew(validEmployeeId);
            expect(status.employeeId).toBe(validEmployeeId);
            expect(status.currentStatus).toBe('CLOCKED_OUT');
            expect(status.totalHoursToday).toBe(0);
            expect(status.lastUpdated).toBeDefined();
        });
    });
    describe('toJSON', () => {
        it('should serialize to JSON correctly', () => {
            const status = new EmployeeTimeStatus(validOnBreakData);
            const json = status.toJSON();
            expect(json.id).toBe(status.id);
            expect(json.employeeId).toBe(status.employeeId);
            expect(json.currentStatus).toBe(status.currentStatus);
            expect(json.activeTimeEntryId).toBe(status.activeTimeEntryId);
            expect(json.activeBreakEntryId).toBe(status.activeBreakEntryId);
            expect(json.totalHoursToday).toBe(status.totalHoursToday);
        });
    });
});
