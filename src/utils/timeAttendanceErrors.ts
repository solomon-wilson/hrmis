import { AppError } from './errors';

/**
 * Time Tracking Error Classes
 */

export class ClockStateError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 400, 'CLOCK_STATE_ERROR', details);
    this.name = 'ClockStateError';
  }
}

export class DuplicateClockInError extends ClockStateError {
  constructor(lastClockInTime: Date, activeEntryId: string) {
    super('Already clocked in. Please clock out first.', {
      lastClockInTime,
      activeEntryId,
      suggestion: 'Clock out before attempting to clock in again'
    });
    this.name = 'DuplicateClockInError';
  }
}

export class NotClockedInError extends ClockStateError {
  constructor() {
    super('Not currently clocked in. Please clock in first.', {
      suggestion: 'You must clock in before performing this operation'
    });
    this.name = 'NotClockedInError';
  }
}

export class InvalidTimeSequenceError extends ClockStateError {
  constructor(operation: string, reason: string) {
    super(`Invalid time sequence for ${operation}: ${reason}`, {
      operation,
      reason,
      suggestion: 'Please check the time sequence and try again'
    });
    this.name = 'InvalidTimeSequenceError';
  }
}

export class FutureTimeError extends ClockStateError {
  constructor(attemptedTime: Date) {
    super('Cannot clock in/out with future time', {
      attemptedTime,
      currentTime: new Date(),
      suggestion: 'Time entries must be in the past or present'
    });
    this.name = 'FutureTimeError';
  }
}

export class GeolocationError extends AppError {
  constructor(message: string, required: boolean = false) {
    super(message, required ? 403 : 400, 'GEOLOCATION_ERROR', {
      required,
      suggestion: required
        ? 'Location tracking is required for time clock operations at this organization'
        : 'Please enable location services or contact your administrator'
    });
    this.name = 'GeolocationError';
  }
}

export class BreakStateError extends ClockStateError {
  constructor(message: string, currentState: string) {
    super(message, {
      currentState,
      suggestion: 'Please check your current break status'
    });
    this.name = 'BreakStateError';
  }
}

export class ExcessiveHoursError extends AppError {
  constructor(hours: number, limit: number, period: string) {
    super(`Excessive hours detected: ${hours} hours in ${period}`, {
      hours,
      limit,
      period,
      suggestion: 'Please verify the time entry. Contact your manager if this is accurate.'
    });
    this.name = 'ExcessiveHoursError';
  }
}

/**
 * Leave Management Error Classes
 */

export class LeaveBalanceError extends AppError {
  constructor(
    message: string,
    availableBalance: number,
    requestedDays: number,
    leaveType: string
  ) {
    super(message, 400, 'INSUFFICIENT_LEAVE_BALANCE', {
      availableBalance,
      requestedDays,
      leaveType,
      shortage: requestedDays - availableBalance,
      suggestion: `You need ${requestedDays - availableBalance} more ${leaveType} days`
    });
    this.name = 'LeaveBalanceError';
  }
}

export class LeaveConflictError extends AppError {
  constructor(
    conflictingRequests: Array<{ id: string; startDate: Date; endDate: Date; status: string }>,
    requestedStartDate: Date,
    requestedEndDate: Date
  ) {
    super('Leave request conflicts with existing request(s)', {
      conflicts: conflictingRequests,
      requestedPeriod: { startDate: requestedStartDate, endDate: requestedEndDate },
      suggestion: 'Please cancel or modify the conflicting leave request(s) first'
    });
    this.name = 'LeaveConflictError';
    this.statusCode = 409; // Conflict
    this.code = 'LEAVE_CONFLICT';
  }
}

export class BlackoutPeriodError extends AppError {
  constructor(
    requestedDates: { startDate: Date; endDate: Date },
    blackoutPeriods: Array<{ startDate: Date; endDate: Date; reason: string }>
  ) {
    super('Leave request falls within a blackout period', {
      requestedDates,
      blackoutPeriods,
      suggestion: 'Please select dates outside the blackout period(s)'
    });
    this.name = 'BlackoutPeriodError';
    this.statusCode = 403;
    this.code = 'BLACKOUT_PERIOD';
  }
}

export class AdvanceNoticeError extends AppError {
  constructor(
    requiredNoticeDays: number,
    actualNoticeDays: number,
    leaveType: string
  ) {
    super(`Insufficient advance notice for ${leaveType}`, {
      requiredNoticeDays,
      actualNoticeDays,
      shortfall: requiredNoticeDays - actualNoticeDays,
      suggestion: `${leaveType} requires ${requiredNoticeDays} days advance notice. Please submit ${requiredNoticeDays - actualNoticeDays} days earlier.`
    });
    this.name = 'AdvanceNoticeError';
    this.statusCode = 400;
    this.code = 'INSUFFICIENT_ADVANCE_NOTICE';
  }
}

export class MaxConsecutiveDaysError extends AppError {
  constructor(maxDays: number, requestedDays: number, leaveType: string) {
    super(`Exceeds maximum consecutive days for ${leaveType}`, {
      maxDays,
      requestedDays,
      excess: requestedDays - maxDays,
      suggestion: `Maximum consecutive ${leaveType} days is ${maxDays}. Please split your request or contact HR.`
    });
    this.name = 'MaxConsecutiveDaysError';
    this.statusCode = 400;
    this.code = 'MAX_CONSECUTIVE_DAYS_EXCEEDED';
  }
}

export class TeamCoverageError extends AppError {
  constructor(
    requestedDates: { startDate: Date; endDate: Date },
    conflictingTeamMembers: Array<{ name: string; dates: { startDate: Date; endDate: Date } }>,
    minimumCoverage: number
  ) {
    super('Insufficient team coverage for requested dates', {
      requestedDates,
      conflictingTeamMembers,
      minimumCoverage,
      suggestion: 'Please coordinate with your team or contact your manager for alternative dates'
    });
    this.name = 'TeamCoverageError';
    this.statusCode = 409;
    this.code = 'INSUFFICIENT_TEAM_COVERAGE';
  }
}

export class ProbationPeriodError extends AppError {
  constructor(hireDate: Date, probationEndDate: Date) {
    super('Cannot request leave during probation period', {
      hireDate,
      probationEndDate,
      daysRemaining: Math.ceil((probationEndDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
      suggestion: `You can request leave after ${probationEndDate.toLocaleDateString()}`
    });
    this.name = 'ProbationPeriodError';
    this.statusCode = 403;
    this.code = 'PROBATION_PERIOD_RESTRICTION';
  }
}

/**
 * Policy Violation Error Classes
 */

export class PolicyViolationError extends AppError {
  constructor(
    policyName: string,
    violatedRule: string,
    details?: any
  ) {
    super(`Policy violation: ${policyName} - ${violatedRule}`, {
      policyName,
      violatedRule,
      ...details,
      suggestion: 'Please review the policy requirements or contact HR for assistance'
    });
    this.name = 'PolicyViolationError';
    this.statusCode = 403;
    this.code = 'POLICY_VIOLATION';
  }
}

export class OvertimePolicyError extends PolicyViolationError {
  constructor(
    actualHours: number,
    threshold: number,
    requiresApproval: boolean
  ) {
    super(
      'Overtime Policy',
      `Hours exceed ${threshold}h threshold`,
      {
        actualHours,
        threshold,
        overtime: actualHours - threshold,
        requiresApproval,
        suggestion: requiresApproval
          ? 'Overtime requires pre-approval from your manager'
          : 'Please verify the hours worked'
      }
    );
  }
}

/**
 * Approval Workflow Error Classes
 */

export class ApprovalWorkflowError extends AppError {
  constructor(message: string, currentStatus: string, attemptedAction: string) {
    super(message, 400, 'APPROVAL_WORKFLOW_ERROR', {
      currentStatus,
      attemptedAction,
      suggestion: 'This action cannot be performed in the current state'
    });
    this.name = 'ApprovalWorkflowError';
  }
}

export class AlreadyProcessedError extends ApprovalWorkflowError {
  constructor(resourceType: string, resourceId: string, currentStatus: string) {
    super(
      `This ${resourceType} has already been processed`,
      currentStatus,
      'modify'
    );
    this.details = {
      ...this.details,
      resourceType,
      resourceId,
      suggestion: `This ${resourceType} is ${currentStatus} and cannot be modified`
    };
  }
}

/**
 * Error response formatter
 */
export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: any;
    suggestion?: string;
    timestamp: string;
  };
}

export const formatErrorResponse = (error: Error): ErrorResponse => {
  if (error instanceof AppError) {
    return {
      success: false,
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
        suggestion: error.details?.suggestion,
        timestamp: new Date().toISOString()
      }
    };
  }

  // Generic error
  return {
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: error.message || 'An unexpected error occurred',
      timestamp: new Date().toISOString()
    }
  };
};

/**
 * Validation error aggregator
 */
export class ValidationErrorAggregator {
  private errors: Array<{ field: string; message: string; code: string }> = [];

  addError(field: string, message: string, code: string = 'VALIDATION_ERROR'): void {
    this.errors.push({ field, message, code });
  }

  hasErrors(): boolean {
    return this.errors.length > 0;
  }

  throwIfErrors(): void {
    if (this.hasErrors()) {
      throw new AppError('Validation failed', 400, 'VALIDATION_ERROR', {
        errors: this.errors,
        count: this.errors.length
      });
    }
  }

  getErrors(): Array<{ field: string; message: string; code: string }> {
    return this.errors;
  }
}

/**
 * Error suggestion generator
 */
export const generateErrorSuggestion = (error: AppError): string => {
  switch (error.code) {
    case 'CLOCK_STATE_ERROR':
      return 'Please check your current clock status and try again';
    case 'INSUFFICIENT_LEAVE_BALANCE':
      return 'Consider requesting fewer days or contact HR to review your balance';
    case 'LEAVE_CONFLICT':
      return 'Cancel or modify conflicting leave requests before submitting a new one';
    case 'BLACKOUT_PERIOD':
      return 'Choose alternative dates outside the restricted period';
    case 'INSUFFICIENT_ADVANCE_NOTICE':
      return 'Submit leave requests earlier to meet advance notice requirements';
    case 'POLICY_VIOLATION':
      return 'Review the policy requirements or contact your manager for guidance';
    default:
      return 'Please contact support if the problem persists';
  }
};
