import { PolicyRepository } from '../../database/repositories/time-attendance/PolicyRepository';
import { OvertimePolicy, EmployeeGroupData } from '../../models/time-attendance/Policy';
import { TimeEntry } from '../../models/time-attendance/TimeEntry';
import { AppError } from '../../utils/errors';

// Task 7.2: Overtime Calculation interfaces
export interface OvertimeCalculationInput {
  employeeId: string;
  employeeData: EmployeeGroupData;
  dailyHours: number;
  weeklyHours: number;
  date: Date;
}

export interface OvertimeCalculationResult {
  regularHours: number;
  overtimeHours: number;
  doubleTimeHours: number;
  totalHours: number;
  overtimeMultiplier: number;
  doubleTimeMultiplier?: number;
  appliedPolicy: OvertimePolicy;
  breakdown: {
    type: 'REGULAR' | 'OVERTIME' | 'DOUBLE_TIME';
    hours: number;
    rate: number;
  }[];
}

export interface WeeklyOvertimeDetection {
  employeeId: string;
  weekStart: Date;
  weekEnd: Date;
  totalHours: number;
  regularHours: number;
  overtimeHours: number;
  doubleTimeHours: number;
  dailyBreakdown: Array<{
    date: Date;
    hours: number;
    overtimeHours: number;
    doubleTimeHours: number;
  }>;
}

export interface OvertimePolicyEnforcement {
  policyId: string;
  policyName: string;
  isEnforced: boolean;
  violations: string[];
  warnings: string[];
}

/**
 * OvertimeCalculationService - Task 7.2
 * Handles overtime detection, calculation, and policy enforcement
 */
export class OvertimeCalculationService {
  constructor(private policyRepository: PolicyRepository) {}

  // ============================================================================
  // Task 7.2: Overtime Detection for Daily and Weekly Thresholds
  // ============================================================================

  /**
   * Detect daily overtime based on hours worked
   */
  async detectDailyOvertime(
    input: OvertimeCalculationInput,
    userContext?: string
  ): Promise<{
    hasOvertime: boolean;
    overtimeHours: number;
    hasDoubleTime: boolean;
    doubleTimeHours: number;
    threshold: number;
  }> {
    const policy = await this.getApplicableOvertimePolicy(
      input.employeeData,
      userContext
    );

    if (!policy) {
      return {
        hasOvertime: false,
        overtimeHours: 0,
        hasDoubleTime: false,
        doubleTimeHours: 0,
        threshold: 0
      };
    }

    const hasOvertime = input.dailyHours > policy.dailyOvertimeThreshold;
    const overtimeHours = hasOvertime
      ? input.dailyHours - policy.dailyOvertimeThreshold
      : 0;

    let hasDoubleTime = false;
    let doubleTimeHours = 0;

    if (policy.doubleTimeThreshold && input.dailyHours > policy.doubleTimeThreshold) {
      hasDoubleTime = true;
      doubleTimeHours = input.dailyHours - policy.doubleTimeThreshold;
    }

    return {
      hasOvertime,
      overtimeHours,
      hasDoubleTime,
      doubleTimeHours,
      threshold: policy.dailyOvertimeThreshold
    };
  }

  /**
   * Detect weekly overtime based on total hours worked
   */
  async detectWeeklyOvertime(
    employeeData: EmployeeGroupData,
    weeklyHours: number,
    weekStart: Date,
    weekEnd: Date,
    userContext?: string
  ): Promise<WeeklyOvertimeDetection> {
    const policy = await this.getApplicableOvertimePolicy(employeeData, userContext);

    if (!policy) {
      return {
        employeeId: employeeData.employeeId,
        weekStart,
        weekEnd,
        totalHours: weeklyHours,
        regularHours: weeklyHours,
        overtimeHours: 0,
        doubleTimeHours: 0,
        dailyBreakdown: []
      };
    }

    const regularHours = Math.min(weeklyHours, policy.weeklyOvertimeThreshold);
    const overtimeHours = Math.max(0, weeklyHours - policy.weeklyOvertimeThreshold);

    return {
      employeeId: employeeData.employeeId,
      weekStart,
      weekEnd,
      totalHours: weeklyHours,
      regularHours,
      overtimeHours,
      doubleTimeHours: 0, // Weekly double time would be policy-specific
      dailyBreakdown: [] // Would be populated from daily records
    };
  }

  /**
   * Detect overtime from time entries
   */
  async detectOvertimeFromEntries(
    employeeData: EmployeeGroupData,
    timeEntries: TimeEntry[],
    userContext?: string
  ): Promise<{
    totalHours: number;
    regularHours: number;
    overtimeHours: number;
    doubleTimeHours: number;
    entriesWithOvertime: Array<{
      entryId: string;
      date: Date;
      hours: number;
      overtimeHours: number;
      doubleTimeHours: number;
    }>;
  }> {
    const policy = await this.getApplicableOvertimePolicy(employeeData, userContext);

    let totalHours = 0;
    let totalRegular = 0;
    let totalOvertime = 0;
    let totalDoubleTime = 0;

    const entriesWithOvertime: Array<{
      entryId: string;
      date: Date;
      hours: number;
      overtimeHours: number;
      doubleTimeHours: number;
    }> = [];

    for (const entry of timeEntries) {
      const hours = entry.totalHours;
      totalHours += hours;

      if (!policy) {
        totalRegular += hours;
        entriesWithOvertime.push({
          entryId: entry.id,
          date: entry.clockInTime,
          hours,
          overtimeHours: 0,
          doubleTimeHours: 0
        });
        continue;
      }

      const result = policy.calculateOvertimeHours(hours, hours); // Simplified
      totalRegular += result.regularHours;
      totalOvertime += result.overtimeHours;
      totalDoubleTime += result.doubleTimeHours;

      entriesWithOvertime.push({
        entryId: entry.id,
        date: entry.clockInTime,
        hours,
        overtimeHours: result.overtimeHours,
        doubleTimeHours: result.doubleTimeHours
      });
    }

    return {
      totalHours,
      regularHours: totalRegular,
      overtimeHours: totalOvertime,
      doubleTimeHours: totalDoubleTime,
      entriesWithOvertime
    };
  }

  // ============================================================================
  // Task 7.2: Overtime Calculation Methods with Policy-Based Multipliers
  // ============================================================================

  /**
   * Calculate overtime with policy-based multipliers
   */
  async calculateOvertime(
    input: OvertimeCalculationInput,
    userContext?: string
  ): Promise<OvertimeCalculationResult> {
    const policy = await this.getApplicableOvertimePolicy(
      input.employeeData,
      userContext
    );

    if (!policy) {
      throw new AppError(
        'No applicable overtime policy found',
        'NO_OVERTIME_POLICY',
        404,
        { employeeId: input.employeeId }
      );
    }

    // Calculate overtime hours
    const hoursBreakdown = policy.calculateOvertimeHours(
      input.dailyHours,
      input.weeklyHours
    );

    // Build breakdown with multipliers
    const breakdown: OvertimeCalculationResult['breakdown'] = [];

    if (hoursBreakdown.regularHours > 0) {
      breakdown.push({
        type: 'REGULAR',
        hours: hoursBreakdown.regularHours,
        rate: 1.0
      });
    }

    if (hoursBreakdown.overtimeHours > 0) {
      breakdown.push({
        type: 'OVERTIME',
        hours: hoursBreakdown.overtimeHours,
        rate: policy.overtimeMultiplier
      });
    }

    if (hoursBreakdown.doubleTimeHours > 0 && policy.doubleTimeMultiplier) {
      breakdown.push({
        type: 'DOUBLE_TIME',
        hours: hoursBreakdown.doubleTimeHours,
        rate: policy.doubleTimeMultiplier
      });
    }

    return {
      regularHours: hoursBreakdown.regularHours,
      overtimeHours: hoursBreakdown.overtimeHours,
      doubleTimeHours: hoursBreakdown.doubleTimeHours,
      totalHours: input.dailyHours,
      overtimeMultiplier: policy.overtimeMultiplier,
      doubleTimeMultiplier: policy.doubleTimeMultiplier,
      appliedPolicy: policy,
      breakdown
    };
  }

  /**
   * Calculate overtime pay (simplified)
   */
  calculateOvertimePay(
    regularRate: number,
    calculation: OvertimeCalculationResult
  ): {
    regularPay: number;
    overtimePay: number;
    doubleTimePay: number;
    totalPay: number;
    breakdown: Array<{
      type: string;
      hours: number;
      rate: number;
      pay: number;
    }>;
  } {
    const breakdown = calculation.breakdown.map(item => ({
      type: item.type,
      hours: item.hours,
      rate: regularRate * item.rate,
      pay: item.hours * regularRate * item.rate
    }));

    const regularPay = calculation.regularHours * regularRate;
    const overtimePay = calculation.overtimeHours * regularRate * calculation.overtimeMultiplier;
    const doubleTimePay = calculation.doubleTimeHours * regularRate * (calculation.doubleTimeMultiplier || 2.0);

    return {
      regularPay,
      overtimePay,
      doubleTimePay,
      totalPay: regularPay + overtimePay + doubleTimePay,
      breakdown
    };
  }

  // ============================================================================
  // Task 7.2: Double-Time Calculation for Extended Overtime
  // ============================================================================

  /**
   * Calculate double-time hours for extended overtime
   */
  async calculateDoubleTime(
    dailyHours: number,
    employeeData: EmployeeGroupData,
    userContext?: string
  ): Promise<{
    hasDoubleTime: boolean;
    doubleTimeHours: number;
    threshold?: number;
    multiplier?: number;
  }> {
    const policy = await this.getApplicableOvertimePolicy(employeeData, userContext);

    if (!policy || !policy.doubleTimeThreshold) {
      return {
        hasDoubleTime: false,
        doubleTimeHours: 0
      };
    }

    const hasDoubleTime = dailyHours > policy.doubleTimeThreshold;
    const doubleTimeHours = hasDoubleTime
      ? dailyHours - policy.doubleTimeThreshold
      : 0;

    return {
      hasDoubleTime,
      doubleTimeHours,
      threshold: policy.doubleTimeThreshold,
      multiplier: policy.doubleTimeMultiplier
    };
  }

  /**
   * Check if extended overtime threshold is reached
   */
  async checkExtendedOvertimeThreshold(
    dailyHours: number,
    employeeData: EmployeeGroupData,
    userContext?: string
  ): Promise<{
    thresholdReached: boolean;
    hoursOverThreshold: number;
    thresholdValue?: number;
    warningMessage?: string;
  }> {
    const doubleTime = await this.calculateDoubleTime(
      dailyHours,
      employeeData,
      userContext
    );

    if (!doubleTime.hasDoubleTime) {
      return {
        thresholdReached: false,
        hoursOverThreshold: 0
      };
    }

    return {
      thresholdReached: true,
      hoursOverThreshold: doubleTime.doubleTimeHours,
      thresholdValue: doubleTime.threshold,
      warningMessage: `Employee has worked ${doubleTime.doubleTimeHours} hours beyond double-time threshold of ${doubleTime.threshold} hours`
    };
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Get applicable overtime policy for employee
   */
  private async getApplicableOvertimePolicy(
    employeeData: EmployeeGroupData,
    userContext?: string
  ): Promise<OvertimePolicy | null> {
    const policies = await this.policyRepository.findActiveOvertimePolicies(userContext);

    for (const policy of policies) {
      const applicability = policy.isApplicableToEmployee(employeeData);
      if (applicability.isApplicable) {
        return policy;
      }
    }

    return null;
  }

  /**
   * Enforce overtime policy compliance
   */
  async enforceOvertimePolicy(
    employeeData: EmployeeGroupData,
    dailyHours: number,
    weeklyHours: number,
    userContext?: string
  ): Promise<OvertimePolicyEnforcement> {
    const policy = await this.getApplicableOvertimePolicy(employeeData, userContext);

    if (!policy) {
      return {
        policyId: 'none',
        policyName: 'No Policy',
        isEnforced: false,
        violations: [],
        warnings: ['No overtime policy applies to this employee']
      };
    }

    const violations: string[] = [];
    const warnings: string[] = [];

    // Check daily threshold
    if (dailyHours > policy.dailyOvertimeThreshold) {
      warnings.push(
        `Daily overtime threshold exceeded: ${dailyHours} hours (threshold: ${policy.dailyOvertimeThreshold})`
      );
    }

    // Check weekly threshold
    if (weeklyHours > policy.weeklyOvertimeThreshold) {
      warnings.push(
        `Weekly overtime threshold exceeded: ${weeklyHours} hours (threshold: ${policy.weeklyOvertimeThreshold})`
      );
    }

    // Check double-time threshold
    if (policy.doubleTimeThreshold && dailyHours > policy.doubleTimeThreshold) {
      warnings.push(
        `Double-time threshold reached: ${dailyHours} hours (threshold: ${policy.doubleTimeThreshold})`
      );
    }

    return {
      policyId: policy.id,
      policyName: policy.name,
      isEnforced: true,
      violations,
      warnings
    };
  }

  /**
   * Get overtime summary for pay period
   */
  async getOvertimeSummary(
    employeeData: EmployeeGroupData,
    timeEntries: TimeEntry[],
    userContext?: string
  ): Promise<{
    totalRegularHours: number;
    totalOvertimeHours: number;
    totalDoubleTimeHours: number;
    averageHoursPerDay: number;
    daysWithOvertime: number;
    daysWithDoubleTime: number;
    estimatedOvertimePay?: number;
  }> {
    const detection = await this.detectOvertimeFromEntries(
      employeeData,
      timeEntries,
      userContext
    );

    const daysWithOvertime = detection.entriesWithOvertime.filter(
      e => e.overtimeHours > 0
    ).length;

    const daysWithDoubleTime = detection.entriesWithOvertime.filter(
      e => e.doubleTimeHours > 0
    ).length;

    const averageHoursPerDay = timeEntries.length > 0
      ? detection.totalHours / timeEntries.length
      : 0;

    return {
      totalRegularHours: detection.regularHours,
      totalOvertimeHours: detection.overtimeHours,
      totalDoubleTimeHours: detection.doubleTimeHours,
      averageHoursPerDay,
      daysWithOvertime,
      daysWithDoubleTime
    };
  }
}
