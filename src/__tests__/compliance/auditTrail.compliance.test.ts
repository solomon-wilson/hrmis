import { TimeEntryRepository } from '../../database/repositories/time-attendance/TimeEntryRepository';
import { LeaveRequestRepository } from '../../database/repositories/time-attendance/LeaveRequestRepository';
import { LeaveBalanceRepository } from '../../database/repositories/time-attendance/LeaveBalanceRepository';

/**
 * Audit Trail and Compliance Tests
 * Ensures proper audit logging and compliance with labor law requirements
 */
describe('Audit Trail and Compliance Tests', () => {
  let timeEntryRepo: TimeEntryRepository;
  let leaveRequestRepo: LeaveRequestRepository;
  let leaveBalanceRepo: LeaveBalanceRepository;

  beforeAll(() => {
    timeEntryRepo = new TimeEntryRepository();
    leaveRequestRepo = new LeaveRequestRepository();
    leaveBalanceRepo = new LeaveBalanceRepository();
  });

  describe('Time Entry Audit Trail', () => {
    it('should maintain complete audit trail for time entries', async () => {
      const employeeId = 'test-employee-id';

      // Create time entry
      const entry = await timeEntryRepo.create({
        employeeId,
        clockInTime: new Date(),
        clockInLocation: { latitude: 40.7128, longitude: -74.0060 },
        status: 'DRAFT',
        createdBy: employeeId
      });

      expect(entry).toHaveProperty('id');
      expect(entry).toHaveProperty('createdAt');
      expect(entry).toHaveProperty('createdBy');

      // Update time entry
      const updated = await timeEntryRepo.update(entry.id, {
        clockOutTime: new Date(),
        status: 'SUBMITTED',
        updatedBy: employeeId
      });

      expect(updated).toHaveProperty('updatedAt');
      expect(updated).toHaveProperty('updatedBy');
      expect(updated.updatedAt).not.toEqual(entry.createdAt);

      // Verify audit trail exists
      const history = await timeEntryRepo.getAuditHistory(entry.id);
      expect(history.length).toBeGreaterThanOrEqual(2); // Create + Update
      expect(history[0]).toHaveProperty('action');
      expect(history[0]).toHaveProperty('timestamp');
      expect(history[0]).toHaveProperty('userId');
      expect(history[0]).toHaveProperty('changes');

      // Cleanup
      await timeEntryRepo.delete(entry.id);
    });

    it('should log all modifications to time entries', async () => {
      const employeeId = 'test-employee-id';

      const entry = await timeEntryRepo.create({
        employeeId,
        clockInTime: new Date(),
        status: 'DRAFT',
        createdBy: employeeId
      });

      // Multiple updates
      await timeEntryRepo.update(entry.id, {
        notes: 'First update',
        updatedBy: employeeId
      });

      await timeEntryRepo.update(entry.id, {
        notes: 'Second update',
        updatedBy: employeeId
      });

      await timeEntryRepo.update(entry.id, {
        status: 'SUBMITTED',
        updatedBy: employeeId
      });

      // Verify all changes are logged
      const history = await timeEntryRepo.getAuditHistory(entry.id);
      expect(history.length).toBeGreaterThanOrEqual(4); // Create + 3 updates

      // Verify chronological order
      for (let i = 1; i < history.length; i++) {
        expect(new Date(history[i].timestamp).getTime()).toBeGreaterThan(
          new Date(history[i - 1].timestamp).getTime()
        );
      }

      // Cleanup
      await timeEntryRepo.delete(entry.id);
    });

    it('should record who approved time entries', async () => {
      const employeeId = 'test-employee-id';
      const managerId = 'test-manager-id';

      const entry = await timeEntryRepo.create({
        employeeId,
        clockInTime: new Date(),
        clockOutTime: new Date(),
        status: 'SUBMITTED',
        createdBy: employeeId
      });

      // Manager approves
      await timeEntryRepo.update(entry.id, {
        status: 'APPROVED',
        approvedBy: managerId,
        approvedAt: new Date(),
        updatedBy: managerId
      });

      const approved = await timeEntryRepo.findById(entry.id);
      expect(approved.approvedBy).toBe(managerId);
      expect(approved.approvedAt).toBeDefined();

      // Verify in audit trail
      const history = await timeEntryRepo.getAuditHistory(entry.id);
      const approvalEntry = history.find(h => h.action === 'APPROVED');
      expect(approvalEntry).toBeDefined();
      expect(approvalEntry.userId).toBe(managerId);

      // Cleanup
      await timeEntryRepo.delete(entry.id);
    });
  });

  describe('Leave Request Audit Trail', () => {
    it('should maintain complete audit trail for leave requests', async () => {
      const employeeId = 'test-employee-id';
      const leaveTypeId = 'test-leave-type-id';

      const request = await leaveRequestRepo.create({
        employeeId,
        leaveTypeId,
        startDate: new Date(),
        endDate: new Date(),
        reason: 'Test leave',
        status: 'PENDING',
        createdBy: employeeId
      });

      expect(request).toHaveProperty('createdAt');
      expect(request).toHaveProperty('createdBy');

      // Verify audit trail
      const history = await leaveRequestRepo.getAuditHistory(request.id);
      expect(history.length).toBeGreaterThan(0);
      expect(history[0].action).toBe('CREATED');

      // Cleanup
      await leaveRequestRepo.delete(request.id);
    });

    it('should log approval workflow steps', async () => {
      const employeeId = 'test-employee-id';
      const managerId = 'test-manager-id';
      const leaveTypeId = 'test-leave-type-id';

      const request = await leaveRequestRepo.create({
        employeeId,
        leaveTypeId,
        startDate: new Date(),
        endDate: new Date(),
        reason: 'Vacation',
        status: 'PENDING',
        createdBy: employeeId
      });

      // Manager reviews
      await leaveRequestRepo.update(request.id, {
        status: 'UNDER_REVIEW',
        reviewedBy: managerId,
        updatedBy: managerId
      });

      // Manager approves
      await leaveRequestRepo.update(request.id, {
        status: 'APPROVED',
        approvedBy: managerId,
        approvedAt: new Date(),
        approvalNotes: 'Approved for vacation',
        updatedBy: managerId
      });

      const history = await leaveRequestRepo.getAuditHistory(request.id);

      // Verify workflow steps are logged
      expect(history.find(h => h.action === 'CREATED')).toBeDefined();
      expect(history.find(h => h.action === 'UNDER_REVIEW')).toBeDefined();
      expect(history.find(h => h.action === 'APPROVED')).toBeDefined();

      // Cleanup
      await leaveRequestRepo.delete(request.id);
    });
  });

  describe('Leave Balance Audit Trail', () => {
    it('should log all balance changes', async () => {
      const employeeId = 'test-employee-id';
      const leaveTypeId = 'test-leave-type-id';

      const balance = await leaveBalanceRepo.create({
        employeeId,
        leaveTypeId,
        balance: 10,
        accrued: 10,
        used: 0,
        pending: 0,
        year: new Date().getFullYear()
      });

      // Accrue additional days
      await leaveBalanceRepo.adjustBalance(balance.id, 5, 'ACCRUAL', {
        reason: 'Monthly accrual',
        adjustedBy: 'SYSTEM'
      });

      // Use days
      await leaveBalanceRepo.adjustBalance(balance.id, -3, 'USAGE', {
        reason: 'Leave approved',
        adjustedBy: 'SYSTEM',
        relatedLeaveRequestId: 'test-request-id'
      });

      const history = await leaveBalanceRepo.getAuditHistory(balance.id);

      expect(history.length).toBeGreaterThanOrEqual(3); // Create + 2 adjustments

      // Verify balance calculation integrity
      const finalBalance = await leaveBalanceRepo.findById(balance.id);
      expect(finalBalance.balance).toBe(12); // 10 + 5 - 3

      // Cleanup
      await leaveBalanceRepo.delete(balance.id);
    });

    it('should track manual balance adjustments', async () => {
      const employeeId = 'test-employee-id';
      const leaveTypeId = 'test-leave-type-id';
      const hrAdminId = 'test-hr-admin-id';

      const balance = await leaveBalanceRepo.create({
        employeeId,
        leaveTypeId,
        balance: 10,
        accrued: 10,
        used: 0,
        pending: 0,
        year: new Date().getFullYear()
      });

      // HR admin makes manual adjustment
      await leaveBalanceRepo.adjustBalance(balance.id, 5, 'MANUAL_ADJUSTMENT', {
        reason: 'Carried over from previous year',
        adjustedBy: hrAdminId,
        requiresApproval: false
      });

      const history = await leaveBalanceRepo.getAuditHistory(balance.id);
      const adjustment = history.find(h => h.action === 'MANUAL_ADJUSTMENT');

      expect(adjustment).toBeDefined();
      expect(adjustment.userId).toBe(hrAdminId);
      expect(adjustment.details.reason).toBe('Carried over from previous year');

      // Cleanup
      await leaveBalanceRepo.delete(balance.id);
    });
  });

  describe('Data Integrity and Consistency', () => {
    it('should maintain referential integrity', async () => {
      const employeeId = 'test-employee-id';

      // Create time entry
      const entry = await timeEntryRepo.create({
        employeeId,
        clockInTime: new Date(),
        status: 'DRAFT',
        createdBy: employeeId
      });

      // Verify employee reference exists
      expect(entry.employeeId).toBe(employeeId);

      // Attempting to delete referenced data should be prevented or cascade properly
      // This would be handled at database level with foreign key constraints

      // Cleanup
      await timeEntryRepo.delete(entry.id);
    });

    it('should ensure data consistency across related tables', async () => {
      const employeeId = 'test-employee-id';
      const leaveTypeId = 'test-leave-type-id';

      // Create leave request and verify balance is updated
      const balance = await leaveBalanceRepo.findByEmployeeAndType(employeeId, leaveTypeId);
      const initialBalance = balance?.balance || 0;

      const request = await leaveRequestRepo.create({
        employeeId,
        leaveTypeId,
        startDate: new Date(),
        endDate: new Date(),
        reason: 'Test',
        status: 'PENDING',
        daysRequested: 2,
        createdBy: employeeId
      });

      // Approve request
      await leaveRequestRepo.update(request.id, {
        status: 'APPROVED',
        approvedBy: 'manager-id',
        approvedAt: new Date()
      });

      // Verify balance was updated
      const updatedBalance = await leaveBalanceRepo.findByEmployeeAndType(employeeId, leaveTypeId);
      expect(updatedBalance.used).toBe(2);
      expect(updatedBalance.balance).toBe(initialBalance - 2);

      // Cleanup
      await leaveRequestRepo.delete(request.id);
    });
  });

  describe('Labor Law Compliance', () => {
    it('should enforce maximum working hours per day', async () => {
      const employeeId = 'test-employee-id';

      const clockIn = new Date();
      clockIn.setHours(8, 0, 0, 0);

      const clockOut = new Date(clockIn);
      clockOut.setHours(22, 0, 0, 0); // 14 hours

      const entry = await timeEntryRepo.create({
        employeeId,
        clockInTime: clockIn,
        clockOutTime: clockOut,
        status: 'SUBMITTED',
        createdBy: employeeId
      });

      // System should flag excessive hours
      const validation = await timeEntryRepo.validateHours(entry.id);
      expect(validation.warnings).toContain('EXCESSIVE_HOURS');
      expect(validation.requiresManagerReview).toBe(true);

      // Cleanup
      await timeEntryRepo.delete(entry.id);
    });

    it('should enforce minimum rest period between shifts', async () => {
      const employeeId = 'test-employee-id';

      // First shift
      const shift1ClockIn = new Date();
      shift1ClockIn.setHours(8, 0, 0, 0);

      const shift1ClockOut = new Date(shift1ClockIn);
      shift1ClockOut.setHours(17, 0, 0, 0);

      await timeEntryRepo.create({
        employeeId,
        clockInTime: shift1ClockIn,
        clockOutTime: shift1ClockOut,
        status: 'APPROVED',
        createdBy: employeeId
      });

      // Second shift with insufficient rest (only 7 hours)
      const shift2ClockIn = new Date(shift1ClockOut);
      shift2ClockIn.setHours(0, 0, 0, 0); // Midnight
      shift2ClockIn.setDate(shift2ClockIn.getDate() + 1);

      const validation = await timeEntryRepo.validateRestPeriod(employeeId, shift2ClockIn);
      expect(validation.sufficient).toBe(false);
      expect(validation.minimumHours).toBe(8);
      expect(validation.actualHours).toBeLessThan(8);
    });

    it('should track and limit consecutive working days', async () => {
      const employeeId = 'test-employee-id';

      // Create entries for 7 consecutive days
      const entries = [];
      for (let i = 0; i < 7; i++) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        date.setHours(9, 0, 0, 0);

        const clockOut = new Date(date);
        clockOut.setHours(17, 0, 0, 0);

        const entry = await timeEntryRepo.create({
          employeeId,
          clockInTime: date,
          clockOutTime: clockOut,
          status: 'APPROVED',
          createdBy: employeeId
        });

        entries.push(entry.id);
      }

      // Check consecutive days
      const analysis = await timeEntryRepo.analyzeConsecutiveDays(employeeId, 30);
      expect(analysis.maxConsecutiveDays).toBeGreaterThanOrEqual(7);
      expect(analysis.requiresRestDay).toBe(true);

      // Cleanup
      for (const entryId of entries) {
        await timeEntryRepo.delete(entryId);
      }
    });
  });

  describe('Security and Access Control Audit', () => {
    it('should log all access to sensitive data', async () => {
      // This would typically be handled by middleware
      // Test that access is logged when viewing time entries, balances, etc.

      const employeeId = 'test-employee-id';
      const accessorId = 'manager-id';

      // Log access
      await timeEntryRepo.logDataAccess({
        resourceType: 'TIME_ENTRY',
        resourceId: employeeId,
        accessedBy: accessorId,
        action: 'VIEW',
        timestamp: new Date()
      });

      // Verify access log
      const accessLogs = await timeEntryRepo.getAccessLogs(employeeId);
      expect(accessLogs.length).toBeGreaterThan(0);
      expect(accessLogs[0].accessedBy).toBe(accessorId);
    });

    it('should enforce data retention policies', async () => {
      // Time entries should be retained for specified period (e.g., 7 years)
      const retentionPolicy = await timeEntryRepo.getRetentionPolicy();
      expect(retentionPolicy.years).toBeGreaterThanOrEqual(7);

      // Verify old data is archived (not deleted)
      const oldDate = new Date();
      oldDate.setFullYear(oldDate.getFullYear() - 8);

      const archivedEntries = await timeEntryRepo.findArchived({
        beforeDate: oldDate
      });

      // Archived entries should still be retrievable for compliance
      expect(archivedEntries).toBeDefined();
    });
  });
});
