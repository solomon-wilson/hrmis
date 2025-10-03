import { LeaveRequest } from '../../models/time-attendance/LeaveRequest';
import { TimeEntry } from '../../models/time-attendance/TimeEntry';

// Task 7.3: Notification Service interfaces
export interface NotificationRecipient {
  recipientId: string;
  recipientType: 'EMPLOYEE' | 'MANAGER' | 'HR' | 'ADMIN';
  email?: string;
  notificationPreferences?: {
    email: boolean;
    sms: boolean;
    push: boolean;
    inApp: boolean;
  };
}

export interface NotificationPayload {
  id?: string;
  type: NotificationType;
  title: string;
  message: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  data?: Record<string, any>;
  actionUrl?: string;
  expiresAt?: Date;
}

export enum NotificationType {
  // Leave request notifications
  LEAVE_REQUEST_SUBMITTED = 'LEAVE_REQUEST_SUBMITTED',
  LEAVE_REQUEST_APPROVED = 'LEAVE_REQUEST_APPROVED',
  LEAVE_REQUEST_REJECTED = 'LEAVE_REQUEST_REJECTED',
  LEAVE_REQUEST_CANCELLED = 'LEAVE_REQUEST_CANCELLED',
  LEAVE_REQUEST_MODIFIED = 'LEAVE_REQUEST_MODIFIED',

  // Manager notifications
  PENDING_LEAVE_APPROVAL = 'PENDING_LEAVE_APPROVAL',
  TEAM_LEAVE_CONFLICT = 'TEAM_LEAVE_CONFLICT',

  // Policy notifications
  POLICY_VIOLATION = 'POLICY_VIOLATION',
  POLICY_WARNING = 'POLICY_WARNING',
  LEAVE_BALANCE_LOW = 'LEAVE_BALANCE_LOW',

  // Time tracking notifications
  INCOMPLETE_TIME_ENTRY = 'INCOMPLETE_TIME_ENTRY',
  OVERTIME_THRESHOLD_REACHED = 'OVERTIME_THRESHOLD_REACHED',
  TIME_ENTRY_CORRECTION_NEEDED = 'TIME_ENTRY_CORRECTION_NEEDED',

  // Reminder notifications
  LEAVE_REQUEST_REMINDER = 'LEAVE_REQUEST_REMINDER',
  APPROVAL_PENDING_REMINDER = 'APPROVAL_PENDING_REMINDER'
}

export interface NotificationResult {
  notificationId: string;
  sentAt: Date;
  recipientId: string;
  channels: {
    channel: 'EMAIL' | 'SMS' | 'PUSH' | 'IN_APP';
    sent: boolean;
    error?: string;
  }[];
  success: boolean;
}

export interface BulkNotificationResult {
  totalRecipients: number;
  successCount: number;
  failureCount: number;
  results: NotificationResult[];
}

/**
 * NotificationService - Task 7.3
 * Handles notification delivery for leave requests, approvals, and policy violations
 */
export class NotificationService {
  // ============================================================================
  // Task 7.3: Leave Request Status Change Notifications
  // ============================================================================

  /**
   * Notify employee of leave request submission
   */
  async notifyLeaveRequestSubmitted(
    leaveRequest: LeaveRequest,
    employee: NotificationRecipient,
    userContext?: string
  ): Promise<NotificationResult> {
    const notification: NotificationPayload = {
      type: NotificationType.LEAVE_REQUEST_SUBMITTED,
      title: 'Leave Request Submitted',
      message: `Your leave request for ${leaveRequest.totalDays} days starting ${leaveRequest.startDate.toLocaleDateString()} has been submitted for approval.`,
      priority: 'MEDIUM',
      data: {
        requestId: leaveRequest.id,
        startDate: leaveRequest.startDate,
        endDate: leaveRequest.endDate,
        totalDays: leaveRequest.totalDays
      },
      actionUrl: `/leave/requests/${leaveRequest.id}`
    };

    return this.sendNotification(employee, notification, userContext);
  }

  /**
   * Notify employee of leave request approval
   */
  async notifyLeaveRequestApproved(
    leaveRequest: LeaveRequest,
    employee: NotificationRecipient,
    approverName: string,
    userContext?: string
  ): Promise<NotificationResult> {
    const notification: NotificationPayload = {
      type: NotificationType.LEAVE_REQUEST_APPROVED,
      title: 'Leave Request Approved',
      message: `Your leave request for ${leaveRequest.totalDays} days starting ${leaveRequest.startDate.toLocaleDateString()} has been approved by ${approverName}.`,
      priority: 'HIGH',
      data: {
        requestId: leaveRequest.id,
        approvedBy: leaveRequest.reviewedBy,
        approvedAt: leaveRequest.reviewedAt,
        startDate: leaveRequest.startDate,
        endDate: leaveRequest.endDate
      },
      actionUrl: `/leave/requests/${leaveRequest.id}`
    };

    return this.sendNotification(employee, notification, userContext);
  }

  /**
   * Notify employee of leave request rejection
   */
  async notifyLeaveRequestRejected(
    leaveRequest: LeaveRequest,
    employee: NotificationRecipient,
    approverName: string,
    rejectionReason: string,
    userContext?: string
  ): Promise<NotificationResult> {
    const notification: NotificationPayload = {
      type: NotificationType.LEAVE_REQUEST_REJECTED,
      title: 'Leave Request Rejected',
      message: `Your leave request for ${leaveRequest.totalDays} days has been rejected by ${approverName}. Reason: ${rejectionReason}`,
      priority: 'HIGH',
      data: {
        requestId: leaveRequest.id,
        rejectedBy: leaveRequest.reviewedBy,
        rejectionReason: leaveRequest.reviewNotes,
        startDate: leaveRequest.startDate,
        endDate: leaveRequest.endDate
      },
      actionUrl: `/leave/requests/${leaveRequest.id}`
    };

    return this.sendNotification(employee, notification, userContext);
  }

  /**
   * Notify employee and manager of leave cancellation
   */
  async notifyLeaveRequestCancelled(
    leaveRequest: LeaveRequest,
    employee: NotificationRecipient,
    manager: NotificationRecipient,
    cancellationReason: string,
    userContext?: string
  ): Promise<BulkNotificationResult> {
    const employeeNotification: NotificationPayload = {
      type: NotificationType.LEAVE_REQUEST_CANCELLED,
      title: 'Leave Request Cancelled',
      message: `Your leave request for ${leaveRequest.totalDays} days starting ${leaveRequest.startDate.toLocaleDateString()} has been cancelled. Reason: ${cancellationReason}`,
      priority: 'MEDIUM',
      data: {
        requestId: leaveRequest.id,
        cancellationReason
      }
    };

    const managerNotification: NotificationPayload = {
      type: NotificationType.LEAVE_REQUEST_CANCELLED,
      title: 'Leave Request Cancelled',
      message: `${employee.recipientId}'s leave request for ${leaveRequest.totalDays} days has been cancelled. Reason: ${cancellationReason}`,
      priority: 'LOW',
      data: {
        requestId: leaveRequest.id,
        employeeId: employee.recipientId,
        cancellationReason
      }
    };

    return this.sendBulkNotifications(
      [employee, manager],
      [employeeNotification, managerNotification],
      userContext
    );
  }

  // ============================================================================
  // Task 7.3: Manager Notification System for Pending Approvals
  // ============================================================================

  /**
   * Notify manager of pending leave approval
   */
  async notifyPendingLeaveApproval(
    leaveRequest: LeaveRequest,
    manager: NotificationRecipient,
    employeeName: string,
    userContext?: string
  ): Promise<NotificationResult> {
    const notification: NotificationPayload = {
      type: NotificationType.PENDING_LEAVE_APPROVAL,
      title: 'New Leave Request Pending Approval',
      message: `${employeeName} has requested leave for ${leaveRequest.totalDays} days from ${leaveRequest.startDate.toLocaleDateString()} to ${leaveRequest.endDate.toLocaleDateString()}. Please review and approve.`,
      priority: 'HIGH',
      data: {
        requestId: leaveRequest.id,
        employeeId: leaveRequest.employeeId,
        employeeName,
        startDate: leaveRequest.startDate,
        endDate: leaveRequest.endDate,
        totalDays: leaveRequest.totalDays,
        reason: leaveRequest.reason
      },
      actionUrl: `/manager/approvals/${leaveRequest.id}`
    };

    return this.sendNotification(manager, notification, userContext);
  }

  /**
   * Send daily summary of pending approvals to managers
   */
  async sendPendingApprovalsSummary(
    manager: NotificationRecipient,
    pendingRequests: LeaveRequest[],
    userContext?: string
  ): Promise<NotificationResult> {
    const notification: NotificationPayload = {
      type: NotificationType.APPROVAL_PENDING_REMINDER,
      title: `${pendingRequests.length} Leave Requests Pending Your Approval`,
      message: `You have ${pendingRequests.length} leave request(s) waiting for your review. Please review and approve/reject them.`,
      priority: 'MEDIUM',
      data: {
        pendingCount: pendingRequests.length,
        requests: pendingRequests.map(req => ({
          id: req.id,
          employeeId: req.employeeId,
          startDate: req.startDate,
          totalDays: req.totalDays
        }))
      },
      actionUrl: '/manager/pending-approvals'
    };

    return this.sendNotification(manager, notification, userContext);
  }

  /**
   * Notify manager of team leave conflict
   */
  async notifyTeamLeaveConflict(
    manager: NotificationRecipient,
    conflictingRequests: Array<{
      employee: string;
      request: LeaveRequest;
    }>,
    userContext?: string
  ): Promise<NotificationResult> {
    const employeeNames = conflictingRequests.map(c => c.employee).join(', ');

    const notification: NotificationPayload = {
      type: NotificationType.TEAM_LEAVE_CONFLICT,
      title: 'Team Leave Scheduling Conflict',
      message: `Multiple team members (${employeeNames}) have overlapping leave requests. Please review for coverage implications.`,
      priority: 'HIGH',
      data: {
        conflictingRequests: conflictingRequests.map(c => ({
          employeeName: c.employee,
          requestId: c.request.id,
          startDate: c.request.startDate,
          endDate: c.request.endDate
        }))
      },
      actionUrl: '/manager/team-calendar'
    };

    return this.sendNotification(manager, notification, userContext);
  }

  // ============================================================================
  // Task 7.3: Employee Notification System for Policy Violations and Reminders
  // ============================================================================

  /**
   * Notify employee of policy violation
   */
  async notifyPolicyViolation(
    employee: NotificationRecipient,
    violationType: string,
    violationDetails: string,
    recommendedAction: string,
    userContext?: string
  ): Promise<NotificationResult> {
    const notification: NotificationPayload = {
      type: NotificationType.POLICY_VIOLATION,
      title: 'Leave Policy Violation Detected',
      message: `${violationType}: ${violationDetails}. Recommended action: ${recommendedAction}`,
      priority: 'URGENT',
      data: {
        violationType,
        violationDetails,
        recommendedAction
      },
      actionUrl: '/leave/policy-guidelines'
    };

    return this.sendNotification(employee, notification, userContext);
  }

  /**
   * Notify employee of policy warning
   */
  async notifyPolicyWarning(
    employee: NotificationRecipient,
    warningType: string,
    warningMessage: string,
    userContext?: string
  ): Promise<NotificationResult> {
    const notification: NotificationPayload = {
      type: NotificationType.POLICY_WARNING,
      title: 'Leave Policy Warning',
      message: `${warningType}: ${warningMessage}`,
      priority: 'MEDIUM',
      data: {
        warningType,
        warningMessage
      }
    };

    return this.sendNotification(employee, notification, userContext);
  }

  /**
   * Notify employee of low leave balance
   */
  async notifyLowLeaveBalance(
    employee: NotificationRecipient,
    leaveType: string,
    remainingDays: number,
    userContext?: string
  ): Promise<NotificationResult> {
    const notification: NotificationPayload = {
      type: NotificationType.LEAVE_BALANCE_LOW,
      title: 'Low Leave Balance Alert',
      message: `Your ${leaveType} balance is running low. You have ${remainingDays} days remaining.`,
      priority: 'LOW',
      data: {
        leaveType,
        remainingDays
      },
      actionUrl: '/leave/balance'
    };

    return this.sendNotification(employee, notification, userContext);
  }

  /**
   * Send leave request reminder to employee
   */
  async sendLeaveRequestReminder(
    employee: NotificationRecipient,
    upcomingLeave: LeaveRequest,
    daysUntilLeave: number,
    userContext?: string
  ): Promise<NotificationResult> {
    const notification: NotificationPayload = {
      type: NotificationType.LEAVE_REQUEST_REMINDER,
      title: 'Upcoming Leave Reminder',
      message: `Reminder: Your approved leave starts in ${daysUntilLeave} days (${upcomingLeave.startDate.toLocaleDateString()}).`,
      priority: 'LOW',
      data: {
        requestId: upcomingLeave.id,
        startDate: upcomingLeave.startDate,
        endDate: upcomingLeave.endDate,
        totalDays: upcomingLeave.totalDays,
        daysUntilLeave
      },
      actionUrl: `/leave/requests/${upcomingLeave.id}`
    };

    return this.sendNotification(employee, notification, userContext);
  }

  /**
   * Notify employee of incomplete time entry
   */
  async notifyIncompleteTimeEntry(
    employee: NotificationRecipient,
    incompleteEntry: TimeEntry,
    userContext?: string
  ): Promise<NotificationResult> {
    const notification: NotificationPayload = {
      type: NotificationType.INCOMPLETE_TIME_ENTRY,
      title: 'Incomplete Time Entry',
      message: `You have an incomplete time entry from ${incompleteEntry.clockInTime.toLocaleDateString()}. Please clock out or submit a correction.`,
      priority: 'HIGH',
      data: {
        entryId: incompleteEntry.id,
        clockInTime: incompleteEntry.clockInTime,
        employeeId: incompleteEntry.employeeId
      },
      actionUrl: `/time/entries/${incompleteEntry.id}`
    };

    return this.sendNotification(employee, notification, userContext);
  }

  /**
   * Notify employee of overtime threshold reached
   */
  async notifyOvertimeThresholdReached(
    employee: NotificationRecipient,
    overtimeHours: number,
    threshold: number,
    userContext?: string
  ): Promise<NotificationResult> {
    const notification: NotificationPayload = {
      type: NotificationType.OVERTIME_THRESHOLD_REACHED,
      title: 'Overtime Threshold Reached',
      message: `You have reached ${overtimeHours} overtime hours (threshold: ${threshold} hours). Please be aware of overtime policy limits.`,
      priority: 'MEDIUM',
      data: {
        overtimeHours,
        threshold
      },
      actionUrl: '/time/summary'
    };

    return this.sendNotification(employee, notification, userContext);
  }

  // ============================================================================
  // Core Notification Methods
  // ============================================================================

  /**
   * Send notification to single recipient
   */
  private async sendNotification(
    recipient: NotificationRecipient,
    payload: NotificationPayload,
    userContext?: string
  ): Promise<NotificationResult> {
    // Generate notification ID
    const notificationId = `notif-${Date.now()}-${recipient.recipientId}`;
    const sentAt = new Date();

    // Determine which channels to use based on preferences
    const channels: NotificationResult['channels'] = [];

    const preferences = recipient.notificationPreferences || {
      email: true,
      sms: false,
      push: true,
      inApp: true
    };

    // Simulate sending to different channels
    if (preferences.email && recipient.email) {
      channels.push({
        channel: 'EMAIL',
        sent: true // In production, would actually send email
      });
    }

    if (preferences.inApp) {
      channels.push({
        channel: 'IN_APP',
        sent: true // In production, would store in notification center
      });
    }

    if (preferences.push) {
      channels.push({
        channel: 'PUSH',
        sent: true // In production, would send push notification
      });
    }

    // Log notification (placeholder for actual implementation)
    console.log(`[Notification] ${payload.type} sent to ${recipient.recipientId}: ${payload.title}`);

    return {
      notificationId,
      sentAt,
      recipientId: recipient.recipientId,
      channels,
      success: channels.length > 0 && channels.every(c => c.sent)
    };
  }

  /**
   * Send bulk notifications to multiple recipients
   */
  private async sendBulkNotifications(
    recipients: NotificationRecipient[],
    payloads: NotificationPayload[],
    userContext?: string
  ): Promise<BulkNotificationResult> {
    const results: NotificationResult[] = [];

    for (let i = 0; i < recipients.length; i++) {
      const recipient = recipients[i];
      const payload = payloads[i] || payloads[0]; // Use first payload if not enough

      try {
        const result = await this.sendNotification(recipient, payload, userContext);
        results.push(result);
      } catch (error) {
        results.push({
          notificationId: `error-${Date.now()}-${recipient.recipientId}`,
          sentAt: new Date(),
          recipientId: recipient.recipientId,
          channels: [{
            channel: 'EMAIL',
            sent: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          }],
          success: false
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;

    return {
      totalRecipients: recipients.length,
      successCount,
      failureCount,
      results
    };
  }

  /**
   * Send notification to multiple recipients with same payload
   */
  async notifyMultipleRecipients(
    recipients: NotificationRecipient[],
    payload: NotificationPayload,
    userContext?: string
  ): Promise<BulkNotificationResult> {
    return this.sendBulkNotifications(
      recipients,
      recipients.map(() => payload),
      userContext
    );
  }
}
