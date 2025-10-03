import { LeaveRequestRepository, LeaveRequestCreateInput, LeaveRequestUpdateInput, LeaveConflict } from '../../database/repositories/time-attendance/LeaveRequestRepository';
import { LeaveBalanceRepository, BalanceSummary } from '../../database/repositories/time-attendance/LeaveBalanceRepository';
import { LeaveRequest } from '../../models/time-attendance/LeaveRequest';
import { LeaveBalance } from '../../models/time-attendance/LeaveBalance';
import { AppError } from '../../utils/errors';

// Task 6.1: Leave request submission interfaces
export interface SubmitLeaveRequestInput {
  employeeId: string;
  leaveTypeId: string;
  startDate: Date;
  endDate: Date;
  totalDays: number;
  reason?: string;
  notes?: string;
}

export interface LeaveEligibilityCheck {
  isEligible: boolean;
  reasons: string[];
  conflictingRequests: LeaveConflict[];
  balance?: {
    available: number;
    requested: number;
    remaining: number;
  };
}

export interface LeaveRequestRouting {
  requestId: string;
  routedTo: string[];
  routingLevel: 'MANAGER' | 'HR' | 'DIRECTOR';
  requiresMultipleApprovals: boolean;
}

// Task 6.2: Approval workflow interfaces
export interface ApproveLeaveRequestInput {
  requestId: string;
  approverId: string;
  comments?: string;
  isPartialApproval?: boolean;
  modifiedEndDate?: Date;
  modifiedTotalDays?: number;
}

export interface RejectLeaveRequestInput {
  requestId: string;
  approverId: string;
  rejectionReason: string;
  suggestAlternativeDates?: {
    startDate: Date;
    endDate: Date;
  };
}

export interface ApprovalStatusUpdate {
  requestId: string;
  status: 'APPROVED' | 'REJECTED' | 'PARTIALLY_APPROVED';
  approvedBy: string;
  approvalDate: Date;
  notificationsSent: string[];
}

// Task 6.3: Balance management interfaces
export interface LeaveBalanceInfo {
  employeeId: string;
  leaveTypeId: string;
  availableDays: number;
  usedDays: number;
  pendingDays: number;
  totalEntitlement: number;
  carryOverDays: number;
  projectedEndOfYearBalance: number;
}

export interface AccrualProcessingInput {
  employeeId?: string; // If not provided, process all employees
  leaveTypeId?: string; // If not provided, process all leave types
  processDate?: Date;
  dryRun?: boolean; // If true, don't save changes
}

export interface AccrualProcessingResult {
  processedCount: number;
  failedCount: number;
  totalAccruedDays: number;
  processedEmployees: {
    employeeId: string;
    leaveTypeId: string;
    accruedDays: number;
    newBalance: number;
  }[];
  errors: {
    employeeId: string;
    leaveTypeId: string;
    error: string;
  }[];
}

export interface BalanceAdjustmentInput {
  employeeId: string;
  leaveTypeId: string;
  adjustmentAmount: number;
  reason: string;
  adjustedBy: string;
  requiresApproval?: boolean;
}

export class LeaveManagementService {
  constructor(
    private leaveRequestRepository: LeaveRequestRepository,
    private leaveBalanceRepository: LeaveBalanceRepository
  ) {}

  // ============================================================================
  // Task 6.1: Leave Request Submission and Eligibility
  // ============================================================================

  /**
   * Submit a new leave request with validation and conflict checking
   */
  async submitLeaveRequest(
    input: SubmitLeaveRequestInput,
    userContext?: string
  ): Promise<LeaveRequest> {
    // Validate dates
    if (input.startDate >= input.endDate) {
      throw new AppError(
        'Invalid date range',
        'INVALID_DATE_RANGE',
        400,
        { startDate: input.startDate, endDate: input.endDate }
      );
    }

    // Check eligibility
    const eligibility = await this.checkLeaveEligibility(
      input.employeeId,
      input.leaveTypeId,
      input.startDate,
      input.endDate,
      input.totalDays,
      userContext
    );

    if (!eligibility.isEligible) {
      throw new AppError(
        'Leave request is not eligible',
        'LEAVE_NOT_ELIGIBLE',
        400,
        { reasons: eligibility.reasons, conflicts: eligibility.conflictingRequests }
      );
    }

    // Create leave request
    const createInput: LeaveRequestCreateInput = {
      employeeId: input.employeeId,
      leaveTypeId: input.leaveTypeId,
      startDate: input.startDate,
      endDate: input.endDate,
      totalDays: input.totalDays,
      reason: input.reason,
      notes: input.notes
    };

    const leaveRequest = await this.leaveRequestRepository.create(createInput, userContext);

    // Update pending days in balance
    await this.updatePendingBalance(
      input.employeeId,
      input.leaveTypeId,
      input.totalDays,
      'ADD',
      userContext
    );

    return leaveRequest;
  }

  /**
   * Check leave eligibility with policy enforcement
   */
  async checkLeaveEligibility(
    employeeId: string,
    leaveTypeId: string,
    startDate: Date,
    endDate: Date,
    requestedDays: number,
    userContext?: string
  ): Promise<LeaveEligibilityCheck> {
    const reasons: string[] = [];

    // Check for date conflicts
    const conflicts = await this.leaveRequestRepository.checkLeaveConflicts(
      employeeId,
      startDate,
      endDate,
      undefined,
      userContext
    );

    if (conflicts.length > 0) {
      conflicts.forEach(conflict => {
        reasons.push(conflict.conflictDescription);
      });
    }

    // Check balance availability
    const currentYear = startDate.getFullYear();
    const balance = await this.leaveBalanceRepository.findByEmployeeLeaveTypeYear(
      employeeId,
      leaveTypeId,
      currentYear,
      userContext
    );

    let balanceInfo: LeaveEligibilityCheck['balance'];

    if (balance) {
      const available = balance.availableDays;

      if (available < requestedDays) {
        reasons.push(`Insufficient leave balance. Available: ${available} days, Requested: ${requestedDays} days`);
      }

      balanceInfo = {
        available,
        requested: requestedDays,
        remaining: available - requestedDays
      };
    } else {
      reasons.push('No leave balance found for this leave type');
    }

    // Check if start date is in the past
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (startDate < today) {
      reasons.push('Leave start date cannot be in the past');
    }

    return {
      isEligible: reasons.length === 0,
      reasons,
      conflictingRequests: conflicts,
      balance: balanceInfo
    };
  }

  /**
   * Route leave request to appropriate approvers
   */
  async routeLeaveRequest(
    requestId: string,
    userContext?: string
  ): Promise<LeaveRequestRouting> {
    const request = await this.leaveRequestRepository.findById(requestId, userContext);

    if (!request) {
      throw new AppError(
        'Leave request not found',
        'LEAVE_REQUEST_NOT_FOUND',
        404,
        { requestId }
      );
    }

    // Simplified routing logic - in production would check org hierarchy
    const routedTo: string[] = [];
    let routingLevel: 'MANAGER' | 'HR' | 'DIRECTOR' = 'MANAGER';
    let requiresMultipleApprovals = false;

    // Route to manager for requests up to 5 days
    if (request.totalDays <= 5) {
      routedTo.push('MANAGER');
      routingLevel = 'MANAGER';
    } else if (request.totalDays <= 10) {
      // Route to manager and HR for 6-10 days
      routedTo.push('MANAGER', 'HR');
      routingLevel = 'HR';
      requiresMultipleApprovals = true;
    } else {
      // Route to manager, HR, and director for > 10 days
      routedTo.push('MANAGER', 'HR', 'DIRECTOR');
      routingLevel = 'DIRECTOR';
      requiresMultipleApprovals = true;
    }

    return {
      requestId,
      routedTo,
      routingLevel,
      requiresMultipleApprovals
    };
  }

  // ============================================================================
  // Task 6.2: Leave Approval Workflow
  // ============================================================================

  /**
   * Approve leave request
   */
  async approveLeaveRequest(
    input: ApproveLeaveRequestInput,
    userContext?: string
  ): Promise<ApprovalStatusUpdate> {
    const request = await this.leaveRequestRepository.findById(input.requestId, userContext);

    if (!request) {
      throw new AppError(
        'Leave request not found',
        'LEAVE_REQUEST_NOT_FOUND',
        404,
        { requestId: input.requestId }
      );
    }

    if (request.status !== 'PENDING') {
      throw new AppError(
        'Leave request is not pending approval',
        'INVALID_REQUEST_STATUS',
        400,
        { currentStatus: request.status }
      );
    }

    // Handle partial approval
    let updateData: LeaveRequestUpdateInput;
    let status: 'APPROVED' | 'PARTIALLY_APPROVED' = 'APPROVED';

    if (input.isPartialApproval && input.modifiedEndDate && input.modifiedTotalDays) {
      status = 'PARTIALLY_APPROVED';
      updateData = {
        status: 'APPROVED', // Store as approved but with modified dates
        approvedBy: input.approverId,
        approvedAt: new Date(),
        managerNotes: `Partially approved. ${input.comments || ''}`
      };
    } else {
      updateData = {
        status: 'APPROVED',
        approvedBy: input.approverId,
        approvedAt: new Date(),
        managerNotes: input.comments
      };
    }

    const updatedRequest = await this.leaveRequestRepository.update(
      input.requestId,
      updateData,
      userContext
    );

    if (!updatedRequest) {
      throw new AppError(
        'Failed to update leave request',
        'UPDATE_FAILED',
        500,
        { requestId: input.requestId }
      );
    }

    // Update balance - move from pending to used
    await this.updatePendingBalance(
      request.employeeId,
      request.leaveTypeId,
      request.totalDays,
      'REMOVE',
      userContext
    );

    await this.processLeaveUsage(
      request.employeeId,
      request.leaveTypeId,
      request.totalDays,
      input.requestId,
      userContext
    );

    // Send notifications (placeholder)
    const notificationsSent = await this.sendApprovalNotifications(
      updatedRequest,
      'APPROVED',
      userContext
    );

    return {
      requestId: input.requestId,
      status,
      approvedBy: input.approverId,
      approvalDate: new Date(),
      notificationsSent
    };
  }

  /**
   * Reject leave request
   */
  async rejectLeaveRequest(
    input: RejectLeaveRequestInput,
    userContext?: string
  ): Promise<ApprovalStatusUpdate> {
    const request = await this.leaveRequestRepository.findById(input.requestId, userContext);

    if (!request) {
      throw new AppError(
        'Leave request not found',
        'LEAVE_REQUEST_NOT_FOUND',
        404,
        { requestId: input.requestId }
      );
    }

    if (request.status !== 'PENDING') {
      throw new AppError(
        'Leave request is not pending approval',
        'INVALID_REQUEST_STATUS',
        400,
        { currentStatus: request.status }
      );
    }

    let managerNotes = input.rejectionReason;

    if (input.suggestAlternativeDates) {
      managerNotes += `\n\nSuggested alternative dates: ${input.suggestAlternativeDates.startDate.toISOString().split('T')[0]} to ${input.suggestAlternativeDates.endDate.toISOString().split('T')[0]}`;
    }

    const updateData: LeaveRequestUpdateInput = {
      status: 'REJECTED',
      approvedBy: input.approverId,
      approvedAt: new Date(),
      rejectionReason: input.rejectionReason,
      managerNotes
    };

    const updatedRequest = await this.leaveRequestRepository.update(
      input.requestId,
      updateData,
      userContext
    );

    if (!updatedRequest) {
      throw new AppError(
        'Failed to update leave request',
        'UPDATE_FAILED',
        500,
        { requestId: input.requestId }
      );
    }

    // Remove from pending balance
    await this.updatePendingBalance(
      request.employeeId,
      request.leaveTypeId,
      request.totalDays,
      'REMOVE',
      userContext
    );

    // Send notifications (placeholder)
    const notificationsSent = await this.sendApprovalNotifications(
      updatedRequest,
      'REJECTED',
      userContext
    );

    return {
      requestId: input.requestId,
      status: 'REJECTED',
      approvedBy: input.approverId,
      approvalDate: new Date(),
      notificationsSent
    };
  }

  /**
   * Send approval/rejection notifications
   * Placeholder for notification system integration
   */
  private async sendApprovalNotifications(
    request: LeaveRequest,
    action: 'APPROVED' | 'REJECTED',
    userContext?: string
  ): Promise<string[]> {
    // In production, this would integrate with notification service
    // For now, return list of notification recipients

    const recipients: string[] = [];

    // Notify employee
    recipients.push(request.employeeId);

    // Notify approver
    if (request.reviewedBy) {
      recipients.push(request.reviewedBy);
    }

    // Log notification event
    console.log(`Leave request ${request.id} ${action.toLowerCase()} - notifications sent to:`, recipients);

    return recipients;
  }

  // ============================================================================
  // Task 6.3: Leave Balance Management
  // ============================================================================

  /**
   * Get leave balance with real-time calculations
   */
  async getLeaveBalance(
    employeeId: string,
    leaveTypeId: string,
    year: number = new Date().getFullYear(),
    userContext?: string
  ): Promise<LeaveBalanceInfo> {
    const balance = await this.leaveBalanceRepository.findByEmployeeLeaveTypeYear(
      employeeId,
      leaveTypeId,
      year,
      userContext
    );

    if (!balance) {
      throw new AppError(
        'Leave balance not found',
        'BALANCE_NOT_FOUND',
        404,
        { employeeId, leaveTypeId, year }
      );
    }

    // Calculate projected end-of-year balance
    const endOfYear = new Date(year, 11, 31);
    const projectedBalance = balance.calculateProjectedBalance(endOfYear);

    return {
      employeeId: balance.employeeId,
      leaveTypeId: balance.leaveTypeId,
      availableDays: balance.availableDays,
      usedDays: balance.usedDays,
      pendingDays: balance.pendingDays,
      totalEntitlement: balance.totalEntitlement,
      carryOverDays: balance.carryOverDays,
      projectedEndOfYearBalance: projectedBalance
    };
  }

  /**
   * Get all leave balances for employee
   */
  async getEmployeeBalanceSummary(
    employeeId: string,
    year: number = new Date().getFullYear(),
    userContext?: string
  ): Promise<BalanceSummary> {
    return this.leaveBalanceRepository.getEmployeeBalanceSummary(
      employeeId,
      year,
      userContext
    );
  }

  /**
   * Process automatic accrual for employees
   */
  async processAutomaticAccrual(
    input: AccrualProcessingInput,
    userContext?: string
  ): Promise<AccrualProcessingResult> {
    const processDate = input.processDate || new Date();
    const result: AccrualProcessingResult = {
      processedCount: 0,
      failedCount: 0,
      totalAccruedDays: 0,
      processedEmployees: [],
      errors: []
    };

    try {
      // Get all balances to process
      const filters: any = {};

      if (input.employeeId) {
        filters.employeeId = input.employeeId;
      }

      if (input.leaveTypeId) {
        filters.leaveTypeId = input.leaveTypeId;
      }

      const balancesResult = await this.leaveBalanceRepository.findAll(
        { filters },
        userContext
      );

      const balances = balancesResult.data;

      // Process each balance
      for (const balance of balances) {
        try {
          // Check if accrual is due
          if (!balance.isAccrualDue(processDate)) {
            continue; // Skip if not due
          }

          const accrualAmount = balance.accrualRate;

          if (!input.dryRun) {
            // Apply accrual
            await this.leaveBalanceRepository.processLeaveAccrual(
              balance.employeeId,
              balance.leaveTypeId,
              accrualAmount,
              `Automatic accrual for ${processDate.toISOString().split('T')[0]}`,
              balance.year,
              userContext
            );
          }

          result.processedCount++;
          result.totalAccruedDays += accrualAmount;
          result.processedEmployees.push({
            employeeId: balance.employeeId,
            leaveTypeId: balance.leaveTypeId,
            accruedDays: accrualAmount,
            newBalance: balance.currentBalance + accrualAmount
          });

        } catch (error) {
          result.failedCount++;
          result.errors.push({
            employeeId: balance.employeeId,
            leaveTypeId: balance.leaveTypeId,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

    } catch (error) {
      throw new AppError(
        'Accrual processing failed',
        'ACCRUAL_PROCESSING_FAILED',
        500,
        { error: error instanceof Error ? error.message : 'Unknown error' }
      );
    }

    return result;
  }

  /**
   * Apply manual balance adjustment with audit logging
   */
  async adjustLeaveBalance(
    input: BalanceAdjustmentInput,
    userContext?: string
  ): Promise<LeaveBalance> {
    const currentYear = new Date().getFullYear();
    const balance = await this.leaveBalanceRepository.findByEmployeeLeaveTypeYear(
      input.employeeId,
      input.leaveTypeId,
      currentYear,
      userContext
    );

    if (!balance) {
      throw new AppError(
        'Leave balance not found',
        'BALANCE_NOT_FOUND',
        404,
        { employeeId: input.employeeId, leaveTypeId: input.leaveTypeId }
      );
    }

    // Create adjustment transaction with audit trail
    await this.leaveBalanceRepository.createAccrualTransaction(
      {
        leaveBalanceId: balance.id,
        transactionType: 'ADJUSTMENT',
        amount: input.adjustmentAmount,
        description: `Manual adjustment by ${input.adjustedBy}: ${input.reason}`,
        processedDate: new Date()
      },
      userContext
    );

    // Update balance
    const updatedBalance = await this.leaveBalanceRepository.update(
      balance.id,
      {
        manualAdjustment: (balance.manualAdjustment || 0) + input.adjustmentAmount,
        adjustmentReason: input.reason,
        lastCalculationDate: new Date()
      },
      userContext
    );

    if (!updatedBalance) {
      throw new AppError(
        'Failed to update balance',
        'UPDATE_FAILED',
        500,
        { balanceId: balance.id }
      );
    }

    return updatedBalance;
  }

  /**
   * Process leave usage (deduct from balance)
   */
  private async processLeaveUsage(
    employeeId: string,
    leaveTypeId: string,
    days: number,
    requestId: string,
    userContext?: string
  ): Promise<void> {
    const currentYear = new Date().getFullYear();

    await this.leaveBalanceRepository.processLeaveUsage(
      employeeId,
      leaveTypeId,
      days,
      requestId,
      currentYear,
      userContext
    );
  }

  /**
   * Update pending balance (add or remove pending days)
   */
  private async updatePendingBalance(
    employeeId: string,
    leaveTypeId: string,
    days: number,
    action: 'ADD' | 'REMOVE',
    userContext?: string
  ): Promise<void> {
    const currentYear = new Date().getFullYear();
    const balance = await this.leaveBalanceRepository.findByEmployeeLeaveTypeYear(
      employeeId,
      leaveTypeId,
      currentYear,
      userContext
    );

    if (!balance) {
      throw new AppError(
        'Leave balance not found',
        'BALANCE_NOT_FOUND',
        404,
        { employeeId, leaveTypeId }
      );
    }

    const newPendingDays = action === 'ADD'
      ? balance.pendingDays + days
      : Math.max(0, balance.pendingDays - days);

    await this.leaveBalanceRepository.update(
      balance.id,
      {
        pendingDays: newPendingDays,
        lastCalculationDate: new Date()
      },
      userContext
    );
  }

  /**
   * Get pending leave requests for employee
   */
  async getPendingLeaveRequests(
    employeeId: string,
    userContext?: string
  ): Promise<LeaveRequest[]> {
    const result = await this.leaveRequestRepository.findAll(
      {
        filters: {
          employeeId,
          status: 'PENDING'
        },
        sort: { field: 'created_at', direction: 'ASC' }
      },
      userContext
    );

    return result.data;
  }

  /**
   * Get leave requests for manager approval
   */
  async getPendingApprovalsForManager(
    managerId: string,
    userContext?: string
  ): Promise<LeaveRequest[]> {
    return this.leaveRequestRepository.findPendingForManager(
      managerId,
      userContext
    );
  }

  /**
   * Cancel leave request
   */
  async cancelLeaveRequest(
    requestId: string,
    reason: string,
    userContext?: string
  ): Promise<LeaveRequest> {
    const request = await this.leaveRequestRepository.findById(requestId, userContext);

    if (!request) {
      throw new AppError(
        'Leave request not found',
        'LEAVE_REQUEST_NOT_FOUND',
        404,
        { requestId }
      );
    }

    // Only allow cancellation of pending or approved requests
    if (!['PENDING', 'APPROVED'].includes(request.status)) {
      throw new AppError(
        'Cannot cancel request with current status',
        'INVALID_CANCELLATION',
        400,
        { currentStatus: request.status }
      );
    }

    // If approved, need to restore balance
    if (request.status === 'APPROVED') {
      // Restore used days back to available
      const currentYear = request.startDate.getFullYear();
      const balance = await this.leaveBalanceRepository.findByEmployeeLeaveTypeYear(
        request.employeeId,
        request.leaveTypeId,
        currentYear,
        userContext
      );

      if (balance) {
        await this.leaveBalanceRepository.update(
          balance.id,
          {
            usedDays: Math.max(0, balance.usedDays - request.totalDays),
            lastCalculationDate: new Date()
          },
          userContext
        );

        // Create reversal transaction
        await this.leaveBalanceRepository.createAccrualTransaction(
          {
            leaveBalanceId: balance.id,
            transactionType: 'ADJUSTMENT',
            amount: request.totalDays,
            description: `Leave cancellation reversal: ${reason}`,
            referenceId: requestId,
            processedDate: new Date()
          },
          userContext
        );
      }
    } else if (request.status === 'PENDING') {
      // Remove from pending balance
      await this.updatePendingBalance(
        request.employeeId,
        request.leaveTypeId,
        request.totalDays,
        'REMOVE',
        userContext
      );
    }

    return this.leaveRequestRepository.cancelRequest(requestId, reason, userContext);
  }
}
