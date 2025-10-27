import { TimeEntryRepository } from '../../database/repositories/time-attendance/TimeEntryRepository';
import { TimeCalculationEngine } from '../../models/time-attendance/TimeCalculationEngine';
import { OvertimeCalculationService } from '../../services/time-attendance/OvertimeCalculationService';
import { PolicyRepository } from '../../database/repositories/time-attendance/PolicyRepository';

/**
 * Labor Law Compliance Test Suite
 *
 * Tests compliance with US Federal labor laws including:
 * - Fair Labor Standards Act (FLSA) overtime regulations
 * - Maximum working hours restrictions
 * - Mandatory break requirements
 * - Rest period between shifts
 * - Minor employee restrictions
 * - Record keeping requirements
 */
describe('Labor Law Compliance Tests', () => {
  let timeEntryRepo: TimeEntryRepository;
  let calculationEngine: TimeCalculationEngine;
  let overtimeService: OvertimeCalculationService;
  let policyRepo: PolicyRepository;

  beforeAll(() => {
    timeEntryRepo = new TimeEntryRepository();
    calculationEngine = new TimeCalculationEngine();
    overtimeService = new OvertimeCalculationService();
    policyRepo = new PolicyRepository();
  });

  describe('FLSA Overtime Compliance', () => {
    describe('40-Hour Weekly Overtime Threshold', () => {
      it('should correctly identify overtime after 40 hours in a workweek', async () => {
        const employeeId = 'test-employee-flsa-001';

        // Create time entries for 5 days, 9 hours each (45 hours total)
        const entries = [];
        const startDate = new Date('2024-01-01T08:00:00Z'); // Monday

        for (let day = 0; day < 5; day++) {
          const clockIn = new Date(startDate);
          clockIn.setDate(startDate.getDate() + day);

          const clockOut = new Date(clockIn);
          clockOut.setHours(clockIn.getHours() + 9); // 9 hours per day

          const entry = await timeEntryRepo.create({
            employeeId,
            clockInTime: clockIn,
            clockOutTime: clockOut,
            status: 'APPROVED',
            totalHours: 9,
            regularHours: 8,
            overtimeHours: 1
          });
          entries.push(entry);
        }

        // Calculate weekly overtime
        const weekStart = new Date('2024-01-01T00:00:00Z');
        const weekEnd = new Date('2024-01-07T23:59:59Z');

        const overtime = await overtimeService.calculateWeeklyOvertime(
          employeeId,
          weekStart,
          weekEnd
        );

        // FLSA requires overtime pay for hours over 40 in a workweek
        expect(overtime.totalHours).toBe(45);
        expect(overtime.regularHours).toBe(40);
        expect(overtime.overtimeHours).toBe(5); // 5 hours over 40
        expect(overtime.overtimeMultiplier).toBeGreaterThanOrEqual(1.5); // Time and a half

        // Cleanup
        for (const entry of entries) {
          await timeEntryRepo.delete(entry.id);
        }
      });

      it('should calculate overtime pay at 1.5x rate for hours over 40', () => {
        const regularRate = 20; // $20/hour
        const regularHours = 40;
        const overtimeHours = 10;

        const result = calculationEngine.calculateOvertimePay(
          regularRate,
          regularHours,
          overtimeHours,
          1.5 // FLSA mandated multiplier
        );

        expect(result.regularPay).toBe(800); // 40 * $20
        expect(result.overtimePay).toBe(300); // 10 * $20 * 1.5
        expect(result.totalPay).toBe(1100);
      });

      it('should not count PTO or holidays toward 40-hour threshold', async () => {
        const employeeId = 'test-employee-flsa-002';

        // 3 days worked (8 hours each) + 2 days PTO = 24 hours worked, no overtime
        const workDays = [
          { day: 0, hours: 8, type: 'WORKED' },
          { day: 1, hours: 8, type: 'WORKED' },
          { day: 2, hours: 8, type: 'PTO' },
          { day: 3, hours: 8, type: 'PTO' },
          { day: 4, hours: 8, type: 'WORKED' }
        ];

        const entries = [];
        const startDate = new Date('2024-01-08T08:00:00Z');

        for (const workDay of workDays) {
          if (workDay.type === 'WORKED') {
            const clockIn = new Date(startDate);
            clockIn.setDate(startDate.getDate() + workDay.day);

            const clockOut = new Date(clockIn);
            clockOut.setHours(clockIn.getHours() + workDay.hours);

            const entry = await timeEntryRepo.create({
              employeeId,
              clockInTime: clockIn,
              clockOutTime: clockOut,
              status: 'APPROVED',
              totalHours: workDay.hours
            });
            entries.push(entry);
          }
        }

        const weekStart = new Date('2024-01-08T00:00:00Z');
        const weekEnd = new Date('2024-01-14T23:59:59Z');

        const overtime = await overtimeService.calculateWeeklyOvertime(
          employeeId,
          weekStart,
          weekEnd
        );

        // Only worked hours count, not PTO
        expect(overtime.totalHours).toBe(24);
        expect(overtime.overtimeHours).toBe(0); // No overtime since < 40 hours worked

        // Cleanup
        for (const entry of entries) {
          await timeEntryRepo.delete(entry.id);
        }
      });
    });

    describe('Daily Overtime Thresholds (State-Specific)', () => {
      it('should identify daily overtime over 8 hours (California rule)', async () => {
        const employeeId = 'test-employee-ca-001';

        // California requires overtime after 8 hours in a day
        const clockIn = new Date('2024-01-15T08:00:00Z');
        const clockOut = new Date('2024-01-15T19:00:00Z'); // 11 hours

        const entry = await timeEntryRepo.create({
          employeeId,
          clockInTime: clockIn,
          clockOutTime: clockOut,
          status: 'APPROVED'
        });

        const calculated = calculationEngine.calculateDailyHours(
          clockIn,
          clockOut,
          [], // No breaks
          8 // California daily threshold
        );

        expect(calculated.totalHours).toBe(11);
        expect(calculated.regularHours).toBe(8);
        expect(calculated.overtimeHours).toBe(3); // 3 hours over 8

        // Cleanup
        await timeEntryRepo.delete(entry.id);
      });

      it('should calculate double-time for hours over 12 in a day (California)', () => {
        const clockIn = new Date('2024-01-15T08:00:00Z');
        const clockOut = new Date('2024-01-15T22:00:00Z'); // 14 hours

        const calculated = calculationEngine.calculateDailyHours(
          clockIn,
          clockOut,
          [],
          8, // Daily OT threshold
          12 // Double-time threshold
        );

        expect(calculated.totalHours).toBe(14);
        expect(calculated.regularHours).toBe(8);
        expect(calculated.overtimeHours).toBe(4); // Hours 9-12 (1.5x)
        expect(calculated.doubleTimeHours).toBe(2); // Hours 13-14 (2x)
      });
    });

    describe('Exempt vs Non-Exempt Classification', () => {
      it('should not calculate overtime for exempt employees', async () => {
        const exemptEmployeeId = 'test-employee-exempt-001';

        // Create policy for exempt employee
        const policy = await policyRepo.create({
          name: 'Executive Exemption',
          type: 'OVERTIME',
          rules: {
            exemptFromOvertime: true,
            minimumSalary: 684, // FLSA minimum weekly salary
            dutiesTest: 'EXECUTIVE'
          },
          effectiveDate: new Date()
        });

        // Work 60 hours in a week
        const entries = [];
        const startDate = new Date('2024-01-22T08:00:00Z');

        for (let day = 0; day < 5; day++) {
          const clockIn = new Date(startDate);
          clockIn.setDate(startDate.getDate() + day);

          const clockOut = new Date(clockIn);
          clockOut.setHours(clockIn.getHours() + 12); // 12 hours per day

          const entry = await timeEntryRepo.create({
            employeeId: exemptEmployeeId,
            clockInTime: clockIn,
            clockOutTime: clockOut,
            status: 'APPROVED',
            exemptFromOvertime: true
          });
          entries.push(entry);
        }

        const weekStart = new Date('2024-01-22T00:00:00Z');
        const weekEnd = new Date('2024-01-28T23:59:59Z');

        const overtime = await overtimeService.calculateWeeklyOvertime(
          exemptEmployeeId,
          weekStart,
          weekEnd
        );

        // Exempt employees don't get overtime
        expect(overtime.overtimeHours).toBe(0);
        expect(overtime.exemptStatus).toBe(true);

        // Cleanup
        for (const entry of entries) {
          await timeEntryRepo.delete(entry.id);
        }
        await policyRepo.delete(policy.id);
      });
    });
  });

  describe('Maximum Working Hours Compliance', () => {
    it('should flag shifts exceeding 16 consecutive hours', async () => {
      const employeeId = 'test-employee-maxhours-001';

      const clockIn = new Date('2024-02-01T08:00:00Z');
      const clockOut = new Date('2024-02-02T02:00:00Z'); // 18 hours

      const entry = await timeEntryRepo.create({
        employeeId,
        clockInTime: clockIn,
        clockOutTime: clockOut,
        status: 'PENDING_APPROVAL'
      });

      const validation = await timeEntryRepo.validateMaximumHours(entry.id);

      expect(validation.valid).toBe(false);
      expect(validation.violations).toContain('EXCESSIVE_CONSECUTIVE_HOURS');
      expect(validation.hoursWorked).toBe(18);
      expect(validation.maximumAllowed).toBe(16);
      expect(validation.requiresManagerApproval).toBe(true);

      // Cleanup
      await timeEntryRepo.delete(entry.id);
    });

    it('should enforce 80-hour maximum per 2-week period for medical residents', async () => {
      const residentId = 'test-resident-001';

      // ACGME work hour restrictions for medical residents
      const twoWeekStart = new Date('2024-02-05T00:00:00Z');
      const entries = [];

      // Create 85 hours over 2 weeks (exceeds limit)
      for (let day = 0; day < 10; day++) {
        const clockIn = new Date(twoWeekStart);
        clockIn.setDate(twoWeekStart.getDate() + day);
        clockIn.setHours(8, 0, 0, 0);

        const clockOut = new Date(clockIn);
        clockOut.setHours(clockIn.getHours() + 8.5); // 8.5 hours per day

        const entry = await timeEntryRepo.create({
          employeeId: residentId,
          clockInTime: clockIn,
          clockOutTime: clockOut,
          status: 'APPROVED',
          employeeType: 'MEDICAL_RESIDENT'
        });
        entries.push(entry);
      }

      const twoWeekEnd = new Date(twoWeekStart);
      twoWeekEnd.setDate(twoWeekStart.getDate() + 14);

      const totalHours = await timeEntryRepo.calculateTotalHours(
        residentId,
        twoWeekStart,
        twoWeekEnd
      );

      expect(totalHours).toBe(85);

      const compliance = await timeEntryRepo.checkWorkHourCompliance(
        residentId,
        twoWeekStart,
        twoWeekEnd,
        'MEDICAL_RESIDENT'
      );

      expect(compliance.compliant).toBe(false);
      expect(compliance.violation).toBe('EXCEEDS_TWO_WEEK_LIMIT');
      expect(compliance.maximumHours).toBe(80);

      // Cleanup
      for (const entry of entries) {
        await timeEntryRepo.delete(entry.id);
      }
    });

    it('should flag 7+ consecutive working days without rest', async () => {
      const employeeId = 'test-employee-consecutive-001';

      const entries = [];
      const startDate = new Date('2024-02-12T08:00:00Z');

      // Work 8 consecutive days
      for (let day = 0; day < 8; day++) {
        const clockIn = new Date(startDate);
        clockIn.setDate(startDate.getDate() + day);

        const clockOut = new Date(clockIn);
        clockOut.setHours(clockIn.getHours() + 8);

        const entry = await timeEntryRepo.create({
          employeeId,
          clockInTime: clockIn,
          clockOutTime: clockOut,
          status: 'APPROVED'
        });
        entries.push(entry);
      }

      const analysis = await timeEntryRepo.analyzeConsecutiveDays(
        employeeId,
        30 // Look back 30 days
      );

      expect(analysis.maxConsecutiveDays).toBeGreaterThanOrEqual(8);
      expect(analysis.requiresRestDay).toBe(true);
      expect(analysis.violation).toBe('CONSECUTIVE_DAYS_LIMIT');
      expect(analysis.recommendation).toContain('mandatory rest day');

      // Cleanup
      for (const entry of entries) {
        await timeEntryRepo.delete(entry.id);
      }
    });
  });

  describe('Break Requirements Compliance', () => {
    describe('Meal Break Requirements', () => {
      it('should require 30-minute meal break for shifts over 5 hours', async () => {
        const employeeId = 'test-employee-break-001';

        const clockIn = new Date('2024-02-19T08:00:00Z');
        const clockOut = new Date('2024-02-19T15:00:00Z'); // 7 hours, no break

        const entry = await timeEntryRepo.create({
          employeeId,
          clockInTime: clockIn,
          clockOutTime: clockOut,
          status: 'COMPLETED',
          breakEntries: [] // No breaks taken
        });

        const validation = await timeEntryRepo.validateBreakRequirements(entry.id);

        expect(validation.compliant).toBe(false);
        expect(validation.violations).toContain('MISSING_MEAL_BREAK');
        expect(validation.requiredBreakMinutes).toBe(30);
        expect(validation.actualBreakMinutes).toBe(0);
        expect(validation.shiftHours).toBe(7);

        // Cleanup
        await timeEntryRepo.delete(entry.id);
      });

      it('should validate meal break taken within first 5 hours of shift', async () => {
        const employeeId = 'test-employee-break-002';

        const clockIn = new Date('2024-02-19T08:00:00Z');
        const clockOut = new Date('2024-02-19T17:00:00Z'); // 9 hours

        const entry = await timeEntryRepo.create({
          employeeId,
          clockInTime: clockIn,
          clockOutTime: clockOut,
          status: 'COMPLETED'
        });

        // Break taken at hour 6 (too late)
        const breakStart = new Date('2024-02-19T14:00:00Z'); // 6 hours after start
        const breakEnd = new Date('2024-02-19T14:30:00Z');

        await timeEntryRepo.addBreak(entry.id, {
          breakType: 'LUNCH',
          startTime: breakStart,
          endTime: breakEnd,
          paid: false
        });

        const validation = await timeEntryRepo.validateBreakTiming(entry.id);

        expect(validation.compliant).toBe(false);
        expect(validation.violation).toBe('MEAL_BREAK_TOO_LATE');
        expect(validation.breakStartedAfterHours).toBe(6);
        expect(validation.maximumHours).toBe(5);

        // Cleanup
        await timeEntryRepo.delete(entry.id);
      });

      it('should allow waiver of meal break for shifts under 6 hours with employee consent', async () => {
        const employeeId = 'test-employee-break-003';

        const clockIn = new Date('2024-02-20T08:00:00Z');
        const clockOut = new Date('2024-02-20T13:30:00Z'); // 5.5 hours

        const entry = await timeEntryRepo.create({
          employeeId,
          clockInTime: clockIn,
          clockOutTime: clockOut,
          status: 'COMPLETED',
          breakEntries: [],
          mealBreakWaived: true,
          waiverConsent: true
        });

        const validation = await timeEntryRepo.validateBreakRequirements(entry.id);

        expect(validation.compliant).toBe(true);
        expect(validation.waiverApplied).toBe(true);
        expect(validation.waiverValid).toBe(true);

        // Cleanup
        await timeEntryRepo.delete(entry.id);
      });
    });

    describe('Rest Break Requirements', () => {
      it('should require 10-minute rest break per 4 hours worked', async () => {
        const employeeId = 'test-employee-rest-001';

        const clockIn = new Date('2024-02-20T08:00:00Z');
        const clockOut = new Date('2024-02-20T17:00:00Z'); // 9 hours

        const entry = await timeEntryRepo.create({
          employeeId,
          clockInTime: clockIn,
          clockOutTime: clockOut,
          status: 'COMPLETED',
          breakEntries: [
            // Only meal break, no rest breaks
            {
              breakType: 'LUNCH',
              startTime: new Date('2024-02-20T12:00:00Z'),
              endTime: new Date('2024-02-20T12:30:00Z'),
              paid: false
            }
          ]
        });

        const validation = await timeEntryRepo.validateRestBreaks(entry.id);

        expect(validation.compliant).toBe(false);
        expect(validation.requiredRestBreaks).toBe(2); // 9 hours / 4 = 2 breaks
        expect(validation.actualRestBreaks).toBe(0);
        expect(validation.missingRestBreaks).toBe(2);

        // Cleanup
        await timeEntryRepo.delete(entry.id);
      });

      it('should validate rest breaks are paid', async () => {
        const employeeId = 'test-employee-rest-002';

        const clockIn = new Date('2024-02-21T08:00:00Z');
        const clockOut = new Date('2024-02-21T16:00:00Z'); // 8 hours

        const entry = await timeEntryRepo.create({
          employeeId,
          clockInTime: clockIn,
          clockOutTime: clockOut,
          status: 'COMPLETED',
          breakEntries: [
            {
              breakType: 'SHORT_BREAK',
              startTime: new Date('2024-02-21T10:00:00Z'),
              endTime: new Date('2024-02-21T10:10:00Z'),
              paid: false // Should be paid!
            },
            {
              breakType: 'SHORT_BREAK',
              startTime: new Date('2024-02-21T14:00:00Z'),
              endTime: new Date('2024-02-21T14:10:00Z'),
              paid: true // Correct
            }
          ]
        });

        const validation = await timeEntryRepo.validateBreakPay(entry.id);

        expect(validation.compliant).toBe(false);
        expect(validation.violations).toContain('UNPAID_REST_BREAK');
        expect(validation.unpaidRestBreaks).toBe(1);

        // Cleanup
        await timeEntryRepo.delete(entry.id);
      });
    });
  });

  describe('Rest Period Between Shifts', () => {
    it('should enforce 8-hour minimum rest between shifts', async () => {
      const employeeId = 'test-employee-rest-period-001';

      // First shift
      const shift1ClockIn = new Date('2024-02-22T08:00:00Z');
      const shift1ClockOut = new Date('2024-02-22T18:00:00Z'); // Ends at 6 PM

      await timeEntryRepo.create({
        employeeId,
        clockInTime: shift1ClockIn,
        clockOutTime: shift1ClockOut,
        status: 'APPROVED'
      });

      // Second shift starting too soon (only 6 hours rest)
      const shift2ClockIn = new Date('2024-02-23T00:00:00Z'); // Starts at midnight

      const validation = await timeEntryRepo.validateRestPeriod(
        employeeId,
        shift2ClockIn
      );

      expect(validation.sufficient).toBe(false);
      expect(validation.actualRestHours).toBe(6);
      expect(validation.requiredRestHours).toBe(8);
      expect(validation.violation).toBe('INSUFFICIENT_REST_PERIOD');
    });

    it('should allow reduced rest period with employee consent and premium pay', async () => {
      const employeeId = 'test-employee-rest-period-002';

      const shift1ClockOut = new Date('2024-02-23T22:00:00Z');
      const shift2ClockIn = new Date('2024-02-24T04:00:00Z'); // 6 hours later

      await timeEntryRepo.create({
        employeeId,
        clockInTime: new Date('2024-02-23T14:00:00Z'),
        clockOutTime: shift1ClockOut,
        status: 'APPROVED'
      });

      const shift2 = await timeEntryRepo.create({
        employeeId,
        clockInTime: shift2ClockIn,
        clockOutTime: new Date('2024-02-24T12:00:00Z'),
        status: 'APPROVED',
        reducedRestPeriod: true,
        employeeConsent: true,
        premiumPayRate: 1.5 // Time and a half for reduced rest
      });

      const validation = await timeEntryRepo.validateRestPeriod(
        employeeId,
        shift2ClockIn
      );

      expect(validation.sufficient).toBe(false);
      expect(validation.waiverApplied).toBe(true);
      expect(validation.consentGiven).toBe(true);
      expect(validation.premiumPayRequired).toBe(true);
      expect(validation.premiumPayRate).toBe(1.5);
    });
  });

  describe('Minor Employee Restrictions (Under 18)', () => {
    it('should enforce 3-hour maximum on school days for minors', async () => {
      const minorEmployeeId = 'test-minor-001';

      const clockIn = new Date('2024-02-26T15:00:00Z'); // 3 PM on school day
      const clockOut = new Date('2024-02-26T19:30:00Z'); // 4.5 hours

      const entry = await timeEntryRepo.create({
        employeeId: minorEmployeeId,
        clockInTime: clockIn,
        clockOutTime: clockOut,
        status: 'PENDING_APPROVAL',
        employeeAge: 16,
        schoolDay: true
      });

      const validation = await timeEntryRepo.validateMinorRestrictions(entry.id);

      expect(validation.compliant).toBe(false);
      expect(validation.violation).toBe('SCHOOL_DAY_HOURS_EXCEEDED');
      expect(validation.hoursWorked).toBe(4.5);
      expect(validation.maximumAllowed).toBe(3);

      // Cleanup
      await timeEntryRepo.delete(entry.id);
    });

    it('should enforce 8-hour maximum on non-school days for minors', async () => {
      const minorEmployeeId = 'test-minor-002';

      const clockIn = new Date('2024-02-24T10:00:00Z'); // Saturday
      const clockOut = new Date('2024-02-24T19:30:00Z'); // 9.5 hours

      const entry = await timeEntryRepo.create({
        employeeId: minorEmployeeId,
        clockInTime: clockIn,
        clockOutTime: clockOut,
        status: 'PENDING_APPROVAL',
        employeeAge: 16,
        schoolDay: false
      });

      const validation = await timeEntryRepo.validateMinorRestrictions(entry.id);

      expect(validation.compliant).toBe(false);
      expect(validation.violation).toBe('NON_SCHOOL_DAY_HOURS_EXCEEDED');
      expect(validation.hoursWorked).toBe(9.5);
      expect(validation.maximumAllowed).toBe(8);

      // Cleanup
      await timeEntryRepo.delete(entry.id);
    });

    it('should prohibit work before 7 AM or after 7 PM for minors during school year', async () => {
      const minorEmployeeId = 'test-minor-003';

      const clockIn = new Date('2024-02-27T20:00:00Z'); // 8 PM
      const clockOut = new Date('2024-02-27T23:00:00Z'); // 11 PM

      const entry = await timeEntryRepo.create({
        employeeId: minorEmployeeId,
        clockInTime: clockIn,
        clockOutTime: clockOut,
        status: 'PENDING_APPROVAL',
        employeeAge: 15,
        schoolYear: true
      });

      const validation = await timeEntryRepo.validateMinorRestrictions(entry.id);

      expect(validation.compliant).toBe(false);
      expect(validation.violation).toBe('PROHIBITED_HOURS');
      expect(validation.clockInTime).toBe('20:00');
      expect(validation.allowedStartTime).toBe('07:00');
      expect(validation.allowedEndTime).toBe('19:00');

      // Cleanup
      await timeEntryRepo.delete(entry.id);
    });
  });

  describe('Record Keeping Requirements', () => {
    it('should maintain time records for at least 3 years (FLSA requirement)', async () => {
      const retentionPolicy = await timeEntryRepo.getRetentionPolicy();

      expect(retentionPolicy.minimumYears).toBeGreaterThanOrEqual(3);
      expect(retentionPolicy.includesPay).toBe(true);
      expect(retentionPolicy.includesHoursWorked).toBe(true);
      expect(retentionPolicy.includesDeductions).toBe(true);
    });

    it('should maintain payroll records for at least 2 years', async () => {
      const retentionPolicy = await timeEntryRepo.getPayrollRetentionPolicy();

      expect(retentionPolicy.minimumYears).toBeGreaterThanOrEqual(2);
      expect(retentionPolicy.includesWageTables).toBe(true);
      expect(retentionPolicy.includesBenefits).toBe(true);
    });

    it('should track all required FLSA data points', async () => {
      const employeeId = 'test-employee-record-001';

      const entry = await timeEntryRepo.create({
        employeeId,
        clockInTime: new Date('2024-02-28T08:00:00Z'),
        clockOutTime: new Date('2024-02-28T17:00:00Z'),
        status: 'APPROVED',
        totalHours: 9,
        regularHours: 8,
        overtimeHours: 1
      });

      const record = await timeEntryRepo.getFLSARecord(entry.id);

      // FLSA required data points
      expect(record).toHaveProperty('employeeId');
      expect(record).toHaveProperty('employeeName');
      expect(record).toHaveProperty('workweekStartDate');
      expect(record).toHaveProperty('hoursWorkedEachDay');
      expect(record).toHaveProperty('totalHoursWorkedPerWeek');
      expect(record).toHaveProperty('regularRateOfPay');
      expect(record).toHaveProperty('totalRegularEarnings');
      expect(record).toHaveProperty('totalOvertimeEarnings');
      expect(record).toHaveProperty('totalWeeklyEarnings');
      expect(record).toHaveProperty('payPeriodEndDate');

      // Cleanup
      await timeEntryRepo.delete(entry.id);
    });
  });

  describe('State-Specific Compliance', () => {
    describe('California Labor Law', () => {
      it('should enforce daily overtime after 8 hours', async () => {
        const employeeId = 'test-employee-ca-daily-001';

        const entry = await timeEntryRepo.create({
          employeeId,
          clockInTime: new Date('2024-03-01T08:00:00Z'),
          clockOutTime: new Date('2024-03-01T19:00:00Z'), // 11 hours
          status: 'APPROVED',
          state: 'CA'
        });

        const validation = await timeEntryRepo.validateStateCompliance(entry.id, 'CA');

        expect(validation.dailyOvertimeApplies).toBe(true);
        expect(validation.dailyThreshold).toBe(8);
        expect(validation.hoursWorked).toBe(11);
        expect(validation.dailyOvertimeHours).toBe(3);

        // Cleanup
        await timeEntryRepo.delete(entry.id);
      });

      it('should enforce 7th consecutive day double-time rule', async () => {
        const employeeId = 'test-employee-ca-7th-day-001';

        const entries = [];
        const startDate = new Date('2024-03-04T08:00:00Z');

        // Work 7 consecutive days
        for (let day = 0; day < 7; day++) {
          const clockIn = new Date(startDate);
          clockIn.setDate(startDate.getDate() + day);

          const clockOut = new Date(clockIn);
          clockOut.setHours(clockIn.getHours() + 8);

          const entry = await timeEntryRepo.create({
            employeeId,
            clockInTime: clockIn,
            clockOutTime: clockOut,
            status: 'APPROVED',
            state: 'CA'
          });
          entries.push(entry);
        }

        // 7th day should be double-time
        const seventhDayEntry = entries[6];
        const validation = await timeEntryRepo.validateStateCompliance(
          seventhDayEntry.id,
          'CA'
        );

        expect(validation.seventhDayRule).toBe(true);
        expect(validation.overtimeMultiplier).toBe(2.0); // Double-time
        expect(validation.consecutiveDays).toBe(7);

        // Cleanup
        for (const entry of entries) {
          await timeEntryRepo.delete(entry.id);
        }
      });
    });
  });
});
