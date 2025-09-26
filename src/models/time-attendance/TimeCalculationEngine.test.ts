import { TimeCalculationEngine, OvertimeRules, PayPeriod } from './TimeCalculationEngine';
import { TimeEntry, BreakEntry, TimeEntryData, BreakEntryData } from './TimeEntry';

describe('TimeCalculationEngine', () => {
  let engine: TimeCalculationEngine;

  beforeEach(() => {
    engine = new TimeCalculationEngine();
  });

  const createTimeEntry = (
    clockInTime: Date,
    clockOutTime: Date,
    breakEntries: BreakEntryData[] = []
  ): TimeEntry => {
    const timeEntryData: TimeEntryData = {
      employeeId: '123e4567-e89b-12d3-a456-426614174000',
      clockInTime,
      clockOutTime,
      status: 'COMPLETED',
      manualEntry: false,
      breakEntries
    };
    return new TimeEntry(timeEntryData);
  };

  describe('constructor', () => {
    it('should use default overtime rules when none provided', () => {
      const rules = engine.getOvertimeRules();
      expect(rules.dailyOvertimeThreshold).toBe(8);
      expect(rules.weeklyOvertimeThreshold).toBe(40);
      expect(rules.overtimeMultiplier).toBe(1.5);
    });

    it('should merge custom overtime rules with defaults', () => {
      const customRules: Partial<OvertimeRules> = {
        dailyOvertimeThreshold: 10,
        overtimeMultiplier: 2.0
      };
      const customEngine = new TimeCalculationEngine(customRules);
      const rules = customEngine.getOvertimeRules();
      
      expect(rules.dailyOvertimeThreshold).toBe(10);
      expect(rules.weeklyOvertimeThreshold).toBe(40); // default
      expect(rules.overtimeMultiplier).toBe(2.0);
    });
  });

  describe('calculateTimeEntryHours', () => {
    it('should return zero hours for active time entry without clock out', () => {
      const activeEntry = new TimeEntry({
        employeeId: '123e4567-e89b-12d3-a456-426614174000',
        clockInTime: new Date('2024-01-15T09:00:00Z'),
        status: 'ACTIVE',
        manualEntry: false,
        breakEntries: []
      });

      const result = engine.calculateTimeEntryHours(activeEntry);
      expect(result.totalHours).toBe(0);
      expect(result.regularHours).toBe(0);
      expect(result.overtimeHours).toBe(0);
    });

    it('should calculate regular hours correctly for 8-hour day', () => {
      const timeEntry = createTimeEntry(
        new Date('2024-01-15T09:00:00Z'),
        new Date('2024-01-15T17:00:00Z')
      );

      const result = engine.calculateTimeEntryHours(timeEntry);
      expect(result.totalHours).toBe(8);
      expect(result.regularHours).toBe(8);
      expect(result.overtimeHours).toBe(0);
      expect(result.doubleTimeHours).toBe(0);
    });

    it('should calculate overtime hours for 10-hour day', () => {
      const timeEntry = createTimeEntry(
        new Date('2024-01-15T09:00:00Z'),
        new Date('2024-01-15T19:00:00Z')
      );

      const result = engine.calculateTimeEntryHours(timeEntry);
      expect(result.totalHours).toBe(10);
      expect(result.regularHours).toBe(8);
      expect(result.overtimeHours).toBe(2);
      expect(result.doubleTimeHours).toBe(0);
    });

    it('should calculate double time hours for 14-hour day', () => {
      const timeEntry = createTimeEntry(
        new Date('2024-01-15T09:00:00Z'),
        new Date('2024-01-15T23:00:00Z')
      );

      const result = engine.calculateTimeEntryHours(timeEntry);
      expect(result.totalHours).toBe(14);
      expect(result.regularHours).toBe(8);
      expect(result.overtimeHours).toBe(4); // 8-12 hours
      expect(result.doubleTimeHours).toBe(2); // 12-14 hours
    });

    it('should deduct unpaid break time from total hours', () => {
      const unpaidLunchBreak: BreakEntryData = {
        timeEntryId: '123e4567-e89b-12d3-a456-426614174000',
        breakType: 'LUNCH',
        startTime: new Date('2024-01-15T12:00:00Z'),
        endTime: new Date('2024-01-15T13:00:00Z'),
        paid: false
      };

      const timeEntry = createTimeEntry(
        new Date('2024-01-15T09:00:00Z'),
        new Date('2024-01-15T18:00:00Z'), // 9 hours total
        [unpaidLunchBreak]
      );

      const result = engine.calculateTimeEntryHours(timeEntry);
      expect(result.totalHours).toBe(8); // 9 hours - 1 hour unpaid lunch
      expect(result.regularHours).toBe(8);
      expect(result.overtimeHours).toBe(0);
      expect(result.unpaidBreakTime).toBe(60); // 60 minutes
    });

    it('should not deduct paid break time from total hours', () => {
      const paidBreak: BreakEntryData = {
        timeEntryId: '123e4567-e89b-12d3-a456-426614174000',
        breakType: 'SHORT_BREAK',
        startTime: new Date('2024-01-15T10:00:00Z'),
        endTime: new Date('2024-01-15T10:15:00Z'),
        paid: true
      };

      const timeEntry = createTimeEntry(
        new Date('2024-01-15T09:00:00Z'),
        new Date('2024-01-15T17:00:00Z'), // 8 hours total
        [paidBreak]
      );

      const result = engine.calculateTimeEntryHours(timeEntry);
      expect(result.totalHours).toBe(8); // Paid break doesn't reduce worked hours
      expect(result.regularHours).toBe(8);
      expect(result.paidBreakTime).toBe(15); // 15 minutes
      expect(result.unpaidBreakTime).toBe(0);
    });
  });

  describe('calculateDailyHours', () => {
    it('should calculate daily totals for multiple time entries', () => {
      const entry1 = createTimeEntry(
        new Date('2024-01-15T09:00:00Z'),
        new Date('2024-01-15T13:00:00Z')
      );

      const entry2 = createTimeEntry(
        new Date('2024-01-15T14:00:00Z'),
        new Date('2024-01-15T18:00:00Z')
      );

      const timeEntries = [entry1, entry2];
      const date = new Date('2024-01-15');

      const result = engine.calculateDailyHours(timeEntries, date);
      expect(result.totalHours).toBe(8); // 4 + 4 hours
      expect(result.regularHours).toBe(8);
      expect(result.overtimeHours).toBe(0);
      expect(result.timeEntries).toHaveLength(2);
    });

    it('should apply daily overtime rules to combined entries', () => {
      const entry1 = createTimeEntry(
        new Date('2024-01-15T09:00:00Z'),
        new Date('2024-01-15T14:00:00Z') // 5 hours
      );

      const entry2 = createTimeEntry(
        new Date('2024-01-15T15:00:00Z'),
        new Date('2024-01-15T21:00:00Z') // 6 hours
      );

      const timeEntries = [entry1, entry2];
      const date = new Date('2024-01-15');

      const result = engine.calculateDailyHours(timeEntries, date);
      expect(result.totalHours).toBe(11); // 5 + 6 hours
      expect(result.regularHours).toBe(8);
      expect(result.overtimeHours).toBe(3); // 11 - 8 hours
    });

    it('should filter entries for the correct date', () => {
      const entry1 = createTimeEntry(
        new Date('2024-01-15T09:00:00Z'),
        new Date('2024-01-15T17:00:00Z')
      );

      const entry2 = createTimeEntry(
        new Date('2024-01-16T09:00:00Z'), // Different day
        new Date('2024-01-16T17:00:00Z')
      );

      const timeEntries = [entry1, entry2];
      const date = new Date('2024-01-15');

      const result = engine.calculateDailyHours(timeEntries, date);
      expect(result.totalHours).toBe(8); // Only entry1
      expect(result.timeEntries).toHaveLength(1);
    });
  });

  describe('calculateWeeklyHours', () => {
    it('should calculate weekly totals for multiple days', () => {
      const mondayEntry = createTimeEntry(
        new Date('2024-01-15T09:00:00Z'), // Monday
        new Date('2024-01-15T17:00:00Z')
      );

      const tuesdayEntry = createTimeEntry(
        new Date('2024-01-16T09:00:00Z'), // Tuesday
        new Date('2024-01-16T17:00:00Z')
      );

      const timeEntries = [mondayEntry, tuesdayEntry];
      const weekStart = new Date('2024-01-14'); // Sunday

      const result = engine.calculateWeeklyHours(timeEntries, weekStart);
      expect(result.totalHours).toBe(16); // 8 + 8 hours
      expect(result.totalRegularHours).toBe(16);
      expect(result.totalOvertimeHours).toBe(0);
      expect(result.dailyCalculations).toHaveLength(7); // 7 days in week
    });

    it('should apply weekly overtime rules when exceeding 40 hours', () => {
      const timeEntries = [];
      
      // Create 5 days of 8.5-hour entries (42.5 total hours)
      // This will give us 42.5 regular hours, which exceeds the 40-hour weekly threshold
      for (let i = 0; i < 5; i++) {
        const date = new Date('2024-01-15');
        date.setDate(date.getDate() + i);
        
        const clockIn = new Date(date);
        clockIn.setHours(9, 0, 0, 0);
        
        const clockOut = new Date(date);
        clockOut.setHours(17, 30, 0, 0); // 8.5 hours (no daily overtime)
        
        timeEntries.push(createTimeEntry(clockIn, clockOut));
      }

      const weekStart = new Date('2024-01-14'); // Sunday
      const result = engine.calculateWeeklyHours(timeEntries, weekStart);
      
      expect(result.totalHours).toBe(42.5);
      expect(result.totalRegularHours).toBe(40); // Weekly threshold
      expect(result.totalOvertimeHours).toBe(2.5); // 2.5 hours converted from regular to overtime
    });
  });

  describe('calculatePayPeriodHours', () => {
    it('should calculate pay period totals for biweekly period', () => {
      const payPeriod: PayPeriod = {
        startDate: new Date('2024-01-14'), // Sunday
        endDate: new Date('2024-01-27'), // Saturday (2 weeks)
        type: 'BIWEEKLY'
      };

      const timeEntries = [];
      
      // Create entries for 10 weekdays (2 weeks, 5 days each)
      let daysAdded = 0;
      let currentDay = 0;
      
      while (daysAdded < 10) {
        const date = new Date('2024-01-15'); // Start on Monday
        date.setDate(date.getDate() + currentDay);
        
        // Skip weekends
        if (date.getDay() !== 0 && date.getDay() !== 6) {
          const clockIn = new Date(date);
          clockIn.setHours(9, 0, 0, 0);
          
          const clockOut = new Date(date);
          clockOut.setHours(17, 0, 0, 0); // 8 hours
          
          timeEntries.push(createTimeEntry(clockIn, clockOut));
          daysAdded++;
        }
        currentDay++;
      }

      const result = engine.calculatePayPeriodHours(timeEntries, payPeriod);
      expect(result).toHaveLength(2); // 2 weeks
      
      const totalHours = result.reduce((sum, week) => sum + week.totalHours, 0);
      expect(totalHours).toBe(80); // 10 days * 8 hours
    });
  });

  describe('calculateBreakDeductions', () => {
    it('should calculate break time deductions correctly', () => {
      const paidBreak = new BreakEntry({
        timeEntryId: '123e4567-e89b-12d3-a456-426614174000',
        breakType: 'SHORT_BREAK',
        startTime: new Date('2024-01-15T10:00:00Z'),
        endTime: new Date('2024-01-15T10:15:00Z'),
        paid: true
      });

      const unpaidBreak = new BreakEntry({
        timeEntryId: '123e4567-e89b-12d3-a456-426614174000',
        breakType: 'LUNCH',
        startTime: new Date('2024-01-15T12:00:00Z'),
        endTime: new Date('2024-01-15T13:00:00Z'),
        paid: false
      });

      const result = engine.calculateBreakDeductions([paidBreak, unpaidBreak]);
      expect(result.totalBreakTime).toBe(75); // 15 + 60 minutes
      expect(result.paidBreakTime).toBe(15);
      expect(result.unpaidBreakTime).toBe(60);
      expect(result.deductibleTime).toBe(60); // Only unpaid breaks are deducted
    });
  });

  describe('detectOvertime', () => {
    it('should detect daily overtime', () => {
      const timeEntry = createTimeEntry(
        new Date('2024-01-15T09:00:00Z'),
        new Date('2024-01-15T19:00:00Z') // 10 hours
      );

      const result = engine.detectOvertime([timeEntry], new Date('2024-01-15'));
      expect(result.hasDailyOvertime).toBe(true);
      expect(result.dailyHours).toBe(10);
      expect(result.overtimeHours).toBe(2);
    });

    it('should detect weekly overtime', () => {
      const timeEntries = [];
      
      // Create 5 days of 9-hour entries (45 total hours)
      for (let i = 0; i < 5; i++) {
        const date = new Date('2024-01-15');
        date.setDate(date.getDate() + i);
        
        const clockIn = new Date(date);
        clockIn.setHours(9, 0, 0, 0);
        
        const clockOut = new Date(date);
        clockOut.setHours(18, 0, 0, 0); // 9 hours
        
        timeEntries.push(createTimeEntry(clockIn, clockOut));
      }

      const result = engine.detectOvertime(timeEntries, new Date('2024-01-15'));
      expect(result.hasWeeklyOvertime).toBe(true);
      expect(result.weeklyHours).toBe(45);
    });
  });

  describe('calculateBreakImpact', () => {
    it('should calculate break impact on work time', () => {
      const unpaidLunchBreak: BreakEntryData = {
        timeEntryId: '123e4567-e89b-12d3-a456-426614174000',
        breakType: 'LUNCH',
        startTime: new Date('2024-01-15T12:00:00Z'),
        endTime: new Date('2024-01-15T13:00:00Z'),
        paid: false
      };

      const paidBreak: BreakEntryData = {
        timeEntryId: '123e4567-e89b-12d3-a456-426614174000',
        breakType: 'SHORT_BREAK',
        startTime: new Date('2024-01-15T10:00:00Z'),
        endTime: new Date('2024-01-15T10:15:00Z'),
        paid: true
      };

      const timeEntry = createTimeEntry(
        new Date('2024-01-15T09:00:00Z'),
        new Date('2024-01-15T18:00:00Z'), // 9 hours total
        [unpaidLunchBreak, paidBreak]
      );

      const result = engine.calculateBreakImpact(timeEntry);
      expect(result.totalWorkTime).toBe(9); // Total time at work
      expect(result.paidWorkTime).toBe(8); // 9 hours - 1 hour unpaid lunch
      expect(result.breakAdjustment).toBe(1); // 1 hour deducted
    });
  });

  describe('updateOvertimeRules', () => {
    it('should update overtime rules', () => {
      const newRules: Partial<OvertimeRules> = {
        dailyOvertimeThreshold: 10,
        overtimeMultiplier: 2.0
      };

      engine.updateOvertimeRules(newRules);
      const rules = engine.getOvertimeRules();
      
      expect(rules.dailyOvertimeThreshold).toBe(10);
      expect(rules.overtimeMultiplier).toBe(2.0);
      expect(rules.weeklyOvertimeThreshold).toBe(40); // Should remain unchanged
    });
  });

  describe('edge cases', () => {
    it('should handle entries spanning midnight', () => {
      const timeEntry = createTimeEntry(
        new Date('2024-01-15T23:00:00Z'),
        new Date('2024-01-16T07:00:00Z') // 8 hours spanning midnight
      );

      const result = engine.calculateTimeEntryHours(timeEntry);
      expect(result.totalHours).toBe(8);
      expect(result.regularHours).toBe(8);
    });

    it('should handle very short time entries', () => {
      const timeEntry = createTimeEntry(
        new Date('2024-01-15T09:00:00Z'),
        new Date('2024-01-15T09:15:00Z') // 15 minutes
      );

      const result = engine.calculateTimeEntryHours(timeEntry);
      expect(result.totalHours).toBe(0.25); // 15 minutes = 0.25 hours
      expect(result.regularHours).toBe(0.25);
    });

    it('should handle custom overtime rules with no double time', () => {
      const customRules: Partial<OvertimeRules> = {
        dailyOvertimeThreshold: 8,
        weeklyOvertimeThreshold: 40,
        overtimeMultiplier: 1.5,
        doubleTimeThreshold: undefined // No double time threshold
      };

      const customEngine = new TimeCalculationEngine(customRules);
      const timeEntry = createTimeEntry(
        new Date('2024-01-15T09:00:00Z'),
        new Date('2024-01-15T23:00:00Z') // 14 hours
      );

      const result = customEngine.calculateTimeEntryHours(timeEntry);
      expect(result.totalHours).toBe(14);
      expect(result.regularHours).toBe(8);
      expect(result.overtimeHours).toBe(6); // All overtime, no double time
      expect(result.doubleTimeHours).toBe(0);
    });
  });
});