import { PolicyEngine } from './PolicyEngine';
import { OvertimeCalculationService } from './OvertimeCalculationService';
import { NotificationService, NotificationType } from './NotificationService';
import { PolicyRepository } from '../../database/repositories/time-attendance/PolicyRepository';
import { LeavePolicy, OvertimePolicy, EmployeeGroupData } from '../../models/time-attendance/Policy';
import { LeaveRequest } from '../../models/time-attendance/LeaveRequest';
import { TimeEntry } from '../../models/time-attendance/TimeEntry';
import { AppError } from '../../utils/errors';

// Mock repositories
jest.mock('../../database/repositories/time-attendance/PolicyRepository');

describe('Policy Services - Task 7', () => {
  let policyRepository: jest.Mocked<PolicyRepository>;
  let policyEngine: PolicyEngine;
  let overtimeService: OvertimeCalculationService;
  let notificationService: NotificationService;

  const mockEmployeeData: EmployeeGroupData = {
    employeeId: 'emp-123',
    departmentId: 'dept-123',
    employmentType: 'FULL_TIME',
    jobTitle: 'Software Engineer',
    startDate: new Date('2020-01-01'),
    tenureDays: 1800
  };

  beforeEach(() => {
    policyRepository = new PolicyRepository() as jest.Mocked<PolicyRepository>;
    policyEngine = new PolicyEngine(policyRepository);
    overtimeService = new OvertimeCalculationService(policyRepository);
    notificationService = new NotificationService();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================================
  // Task 7.1: PolicyEngine Tests
  // ============================================================================

  describe('PolicyEngine - validateLeaveRequest', () => {
    it('should validate leave request successfully', async () => {
      const mockPolicy: any = {
        id: 'policy-123',
        name: 'Standard Leave Policy',
        leaveTypeId: 'leave-type-123',
        eligibilityRules: [],
        accrualRules: [],
        usageRules: [],
        isApplicableToEmployee: jest.fn().mockReturnValue({
          isApplicable: true,
          isEligible: true,
          reasons: []
        }),
        getUsageRestrictions: jest.fn().mockReturnValue({
          maxConsecutiveDays: 10,
          advanceNoticeDays: 5
        })
      };

      policyRepository.findByLeaveType.mockResolvedValue([mockPolicy]);

      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 10);

      const result = await policyEngine.validateLeaveRequest({
        employeeId: 'emp-123',
        leaveTypeId: 'leave-type-123',
        startDate: futureDate,
        endDate: new Date(futureDate.getTime() + 3 * 24 * 60 * 60 * 1000),
        totalDays: 3,
        employeeData: mockEmployeeData
      });

      expect(result.isValid).toBe(true);
      expect(result.violations).toHaveLength(0);
      expect(result.appliedPolicy).toBeDefined();
    });

    it('should detect policy violations for excessive days', async () => {
      const mockPolicy: any = {
        id: 'policy-123',
        name: 'Standard Leave Policy',
        isApplicableToEmployee: jest.fn().mockReturnValue({
          isApplicable: true,
          isEligible: true,
          reasons: []
        }),
        getUsageRestrictions: jest.fn().mockReturnValue({
          maxConsecutiveDays: 5
        })
      };

      policyRepository.findByLeaveType.mockResolvedValue([mockPolicy]);

      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 10);

      const result = await policyEngine.validateLeaveRequest({
        employeeId: 'emp-123',
        leaveTypeId: 'leave-type-123',
        startDate: futureDate,
        endDate: new Date(futureDate.getTime() + 9 * 24 * 60 * 60 * 1000),
        totalDays: 10,
        employeeData: mockEmployeeData
      });

      expect(result.isValid).toBe(false);
      expect(result.violations).toContain(
        'Request exceeds maximum consecutive days limit of 5 days'
      );
    });

    it('should detect advance notice violations', async () => {
      const mockPolicy: any = {
        id: 'policy-123',
        name: 'Standard Leave Policy',
        isApplicableToEmployee: jest.fn().mockReturnValue({
          isApplicable: true,
          isEligible: true,
          reasons: []
        }),
        getUsageRestrictions: jest.fn().mockReturnValue({
          advanceNoticeDays: 10
        })
      };

      policyRepository.findByLeaveType.mockResolvedValue([mockPolicy]);

      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 5); // Only 5 days notice

      const result = await policyEngine.validateLeaveRequest({
        employeeId: 'emp-123',
        leaveTypeId: 'leave-type-123',
        startDate: futureDate,
        endDate: new Date(futureDate.getTime() + 2 * 24 * 60 * 60 * 1000),
        totalDays: 2,
        employeeData: mockEmployeeData
      });

      expect(result.isValid).toBe(false);
      expect(result.violations.some(v => v.includes('advance notice'))).toBe(true);
    });
  });

  describe('PolicyEngine - checkEmployeeEligibility', () => {
    it('should identify eligible policies for employee', async () => {
      const mockPolicy1: any = {
        id: 'policy-1',
        name: 'Policy 1',
        isApplicableToEmployee: jest.fn().mockReturnValue({
          isApplicable: true,
          isEligible: true,
          reasons: []
        }),
        getApplicableAccrualRate: jest.fn().mockReturnValue(1.5)
      };

      const mockPolicy2: any = {
        id: 'policy-2',
        name: 'Policy 2',
        isApplicableToEmployee: jest.fn().mockReturnValue({
          isApplicable: true,
          isEligible: true,
          reasons: []
        }),
        getApplicableAccrualRate: jest.fn().mockReturnValue(2.0)
      };

      policyRepository.findByLeaveType.mockResolvedValue([mockPolicy1, mockPolicy2]);

      const result = await policyEngine.checkEmployeeEligibility(
        mockEmployeeData,
        'leave-type-123'
      );

      expect(result.isEligible).toBe(true);
      expect(result.eligiblePolicies).toHaveLength(2);
      expect(result.recommendedPolicy?.id).toBe('policy-2'); // Higher accrual rate
    });

    it('should identify ineligible policies with reasons', async () => {
      const mockPolicy: any = {
        id: 'policy-1',
        name: 'Policy 1',
        isApplicableToEmployee: jest.fn().mockReturnValue({
          isApplicable: true,
          isEligible: false,
          reasons: ['Employee does not meet tenure requirement']
        })
      };

      policyRepository.findActiveLeavePolicies.mockResolvedValue([mockPolicy]);

      const result = await policyEngine.checkEmployeeEligibility(mockEmployeeData);

      expect(result.isEligible).toBe(false);
      expect(result.ineligiblePolicies).toHaveLength(1);
      expect(result.ineligiblePolicies[0].reasons).toContain(
        'Employee does not meet tenure requirement'
      );
    });
  });

  describe('PolicyEngine - checkTenureRequirement', () => {
    it('should correctly calculate tenure and check requirements', () => {
      const startDate = new Date('2020-01-01');
      const requiredDays = 365;

      const result = policyEngine.checkTenureRequirement(startDate, requiredDays);

      expect(result.meetsRequirement).toBe(true);
      expect(result.currentTenureDays).toBeGreaterThan(requiredDays);
      expect(result.daysRemaining).toBe(0);
    });

    it('should identify when tenure requirement is not met', () => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 100); // 100 days ago
      const requiredDays = 365;

      const result = policyEngine.checkTenureRequirement(startDate, requiredDays);

      expect(result.meetsRequirement).toBe(false);
      expect(result.daysRemaining).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // Task 7.2: OvertimeCalculationService Tests
  // ============================================================================

  describe('OvertimeCalculationService - detectDailyOvertime', () => {
    it('should detect daily overtime correctly', async () => {
      const mockPolicy: any = {
        id: 'ot-policy-123',
        dailyOvertimeThreshold: 8,
        weeklyOvertimeThreshold: 40,
        overtimeMultiplier: 1.5,
        doubleTimeThreshold: 12,
        doubleTimeMultiplier: 2.0,
        isEffective: jest.fn().mockReturnValue(true),
        checkGroupApplicability: jest.fn().mockReturnValue(true),
        isApplicableToEmployee: jest.fn().mockReturnValue({
          isApplicable: true,
          reasons: []
        })
      };

      policyRepository.findActiveOvertimePolicies.mockResolvedValue([mockPolicy]);

      const result = await overtimeService.detectDailyOvertime({
        employeeId: 'emp-123',
        employeeData: mockEmployeeData,
        dailyHours: 10,
        weeklyHours: 40,
        date: new Date()
      });

      expect(result.hasOvertime).toBe(true);
      expect(result.overtimeHours).toBe(2);
      expect(result.threshold).toBe(8);
    });

    it('should detect double-time when threshold exceeded', async () => {
      const mockPolicy: any = {
        id: 'ot-policy-123',
        dailyOvertimeThreshold: 8,
        doubleTimeThreshold: 12,
        doubleTimeMultiplier: 2.0,
        isEffective: jest.fn().mockReturnValue(true),
        checkGroupApplicability: jest.fn().mockReturnValue(true),
        isApplicableToEmployee: jest.fn().mockReturnValue({
          isApplicable: true,
          reasons: []
        })
      };

      policyRepository.findActiveOvertimePolicies.mockResolvedValue([mockPolicy]);

      const result = await overtimeService.detectDailyOvertime({
        employeeId: 'emp-123',
        employeeData: mockEmployeeData,
        dailyHours: 14,
        weeklyHours: 50,
        date: new Date()
      });

      expect(result.hasDoubleTime).toBe(true);
      expect(result.doubleTimeHours).toBe(2); // 14 - 12
    });
  });

  describe('OvertimeCalculationService - calculateOvertime', () => {
    it('should calculate overtime with correct multipliers', async () => {
      const mockPolicy: any = {
        id: 'ot-policy-123',
        dailyOvertimeThreshold: 8,
        weeklyOvertimeThreshold: 40,
        overtimeMultiplier: 1.5,
        doubleTimeThreshold: undefined,
        isEffective: jest.fn().mockReturnValue(true),
        checkGroupApplicability: jest.fn().mockReturnValue(true),
        isApplicableToEmployee: jest.fn().mockReturnValue({
          isApplicable: true,
          reasons: []
        }),
        calculateOvertimeHours: jest.fn().mockReturnValue({
          regularHours: 8,
          overtimeHours: 2,
          doubleTimeHours: 0
        })
      };

      policyRepository.findActiveOvertimePolicies.mockResolvedValue([mockPolicy]);

      const result = await overtimeService.calculateOvertime({
        employeeId: 'emp-123',
        employeeData: mockEmployeeData,
        dailyHours: 10,
        weeklyHours: 42,
        date: new Date()
      });

      expect(result.regularHours).toBe(8);
      expect(result.overtimeHours).toBe(2);
      expect(result.overtimeMultiplier).toBe(1.5);
      expect(result.breakdown).toHaveLength(2); // Regular + Overtime
    });
  });

  describe('OvertimeCalculationService - calculateOvertimePay', () => {
    it('should calculate overtime pay correctly', () => {
      const calculation = {
        regularHours: 8,
        overtimeHours: 2,
        doubleTimeHours: 1,
        totalHours: 11,
        overtimeMultiplier: 1.5,
        doubleTimeMultiplier: 2.0,
        appliedPolicy: {} as any,
        breakdown: [
          { type: 'REGULAR' as const, hours: 8, rate: 1.0 },
          { type: 'OVERTIME' as const, hours: 2, rate: 1.5 },
          { type: 'DOUBLE_TIME' as const, hours: 1, rate: 2.0 }
        ]
      };

      const result = overtimeService.calculateOvertimePay(25, calculation);

      expect(result.regularPay).toBe(200); // 8 * 25
      expect(result.overtimePay).toBe(75); // 2 * 25 * 1.5
      expect(result.doubleTimePay).toBe(50); // 1 * 25 * 2.0
      expect(result.totalPay).toBe(325);
    });
  });

  // ============================================================================
  // Task 7.3: NotificationService Tests
  // ============================================================================

  describe('NotificationService - Leave Request Notifications', () => {
    it('should notify employee of leave request submission', async () => {
      const leaveRequest: any = {
        id: 'req-123',
        employeeId: 'emp-123',
        leaveTypeId: 'leave-type-123',
        startDate: new Date('2025-06-01'),
        endDate: new Date('2025-06-05'),
        totalDays: 5,
        status: 'PENDING'
      };

      const employee = {
        recipientId: 'emp-123',
        recipientType: 'EMPLOYEE' as const,
        email: 'employee@example.com'
      };

      const result = await notificationService.notifyLeaveRequestSubmitted(
        leaveRequest,
        employee
      );

      expect(result.success).toBe(true);
      expect(result.recipientId).toBe('emp-123');
      expect(result.channels.length).toBeGreaterThan(0);
    });

    it('should notify employee of leave request approval', async () => {
      const leaveRequest: any = {
        id: 'req-123',
        employeeId: 'emp-123',
        startDate: new Date('2025-06-01'),
        endDate: new Date('2025-06-05'),
        totalDays: 5,
        status: 'APPROVED',
        reviewedBy: 'manager-123',
        reviewedAt: new Date()
      };

      const employee = {
        recipientId: 'emp-123',
        recipientType: 'EMPLOYEE' as const,
        email: 'employee@example.com'
      };

      const result = await notificationService.notifyLeaveRequestApproved(
        leaveRequest,
        employee,
        'John Manager'
      );

      expect(result.success).toBe(true);
      expect(result.channels.some(c => c.channel === 'EMAIL')).toBe(true);
    });

    it('should notify employee of leave request rejection', async () => {
      const leaveRequest: any = {
        id: 'req-123',
        employeeId: 'emp-123',
        totalDays: 5,
        reviewedBy: 'manager-123',
        reviewNotes: 'Staffing needs'
      };

      const employee = {
        recipientId: 'emp-123',
        recipientType: 'EMPLOYEE' as const,
        email: 'employee@example.com'
      };

      const result = await notificationService.notifyLeaveRequestRejected(
        leaveRequest,
        employee,
        'John Manager',
        'Staffing needs'
      );

      expect(result.success).toBe(true);
    });
  });

  describe('NotificationService - Manager Notifications', () => {
    it('should notify manager of pending leave approval', async () => {
      const leaveRequest: any = {
        id: 'req-123',
        employeeId: 'emp-123',
        leaveTypeId: 'leave-type-123',
        startDate: new Date('2025-06-01'),
        endDate: new Date('2025-06-05'),
        totalDays: 5,
        reason: 'Vacation'
      };

      const manager = {
        recipientId: 'manager-123',
        recipientType: 'MANAGER' as const,
        email: 'manager@example.com'
      };

      const result = await notificationService.notifyPendingLeaveApproval(
        leaveRequest,
        manager,
        'Jane Employee'
      );

      expect(result.success).toBe(true);
      expect(result.recipientId).toBe('manager-123');
    });

    it('should send pending approvals summary to manager', async () => {
      const pendingRequests: any[] = [
        { id: 'req-1', employeeId: 'emp-1', totalDays: 3 },
        { id: 'req-2', employeeId: 'emp-2', totalDays: 5 }
      ];

      const manager = {
        recipientId: 'manager-123',
        recipientType: 'MANAGER' as const,
        email: 'manager@example.com'
      };

      const result = await notificationService.sendPendingApprovalsSummary(
        manager,
        pendingRequests
      );

      expect(result.success).toBe(true);
    });

    it('should notify manager of team leave conflict', async () => {
      const conflictingRequests = [
        {
          employee: 'Employee A',
          request: {
            id: 'req-1',
            startDate: new Date('2025-06-01'),
            endDate: new Date('2025-06-05')
          } as any
        },
        {
          employee: 'Employee B',
          request: {
            id: 'req-2',
            startDate: new Date('2025-06-03'),
            endDate: new Date('2025-06-07')
          } as any
        }
      ];

      const manager = {
        recipientId: 'manager-123',
        recipientType: 'MANAGER' as const
      };

      const result = await notificationService.notifyTeamLeaveConflict(
        manager,
        conflictingRequests
      );

      expect(result.success).toBe(true);
    });
  });

  describe('NotificationService - Policy Violation Notifications', () => {
    it('should notify employee of policy violation', async () => {
      const employee = {
        recipientId: 'emp-123',
        recipientType: 'EMPLOYEE' as const
      };

      const result = await notificationService.notifyPolicyViolation(
        employee,
        'Advance Notice Violation',
        'Leave request submitted without required 5 days advance notice',
        'Submit leave requests at least 5 days in advance'
      );

      expect(result.success).toBe(true);
    });

    it('should notify employee of low leave balance', async () => {
      const employee = {
        recipientId: 'emp-123',
        recipientType: 'EMPLOYEE' as const
      };

      const result = await notificationService.notifyLowLeaveBalance(
        employee,
        'Annual Leave',
        2
      );

      expect(result.success).toBe(true);
    });

    it('should notify employee of overtime threshold', async () => {
      const employee = {
        recipientId: 'emp-123',
        recipientType: 'EMPLOYEE' as const
      };

      const result = await notificationService.notifyOvertimeThresholdReached(
        employee,
        45,
        40
      );

      expect(result.success).toBe(true);
    });
  });

  describe('NotificationService - Bulk Notifications', () => {
    it('should send notifications to multiple recipients', async () => {
      const recipients = [
        { recipientId: 'emp-1', recipientType: 'EMPLOYEE' as const },
        { recipientId: 'emp-2', recipientType: 'EMPLOYEE' as const },
        { recipientId: 'manager-1', recipientType: 'MANAGER' as const }
      ];

      const payload = {
        type: NotificationType.POLICY_WARNING,
        title: 'System Maintenance',
        message: 'Time tracking system will be down for maintenance',
        priority: 'MEDIUM' as const
      };

      const result = await notificationService.notifyMultipleRecipients(
        recipients,
        payload
      );

      expect(result.totalRecipients).toBe(3);
      expect(result.successCount).toBe(3);
      expect(result.failureCount).toBe(0);
    });
  });
});
