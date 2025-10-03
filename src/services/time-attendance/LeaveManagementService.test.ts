import { LeaveManagementService, SubmitLeaveRequestInput, ApproveLeaveRequestInput, RejectLeaveRequestInput, BalanceAdjustmentInput, AccrualProcessingInput } from './LeaveManagementService';
import { LeaveRequestRepository } from '../../database/repositories/time-attendance/LeaveRequestRepository';
import { LeaveBalanceRepository } from '../../database/repositories/time-attendance/LeaveBalanceRepository';
import { LeaveRequest } from '../../models/time-attendance/LeaveRequest';
import { LeaveBalance } from '../../models/time-attendance/LeaveBalance';
import { AppError } from '../../utils/errors';

// Mock repositories
jest.mock('../../database/repositories/time-attendance/LeaveRequestRepository');
jest.mock('../../database/repositories/time-attendance/LeaveBalanceRepository');

describe('LeaveManagementService', () => {
  let service: LeaveManagementService;
  let leaveRequestRepository: jest.Mocked<LeaveRequestRepository>;
  let leaveBalanceRepository: jest.Mocked<LeaveBalanceRepository>;

  beforeEach(() => {
    leaveRequestRepository = new LeaveRequestRepository() as jest.Mocked<LeaveRequestRepository>;
    leaveBalanceRepository = new LeaveBalanceRepository() as jest.Mocked<LeaveBalanceRepository>;
    service = new LeaveManagementService(leaveRequestRepository, leaveBalanceRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================================
  // Task 6.1: Leave Request Submission Tests
  // ============================================================================

  describe('submitLeaveRequest', () => {
    it('should submit leave request successfully with valid input', async () => {
      // Use future date to avoid past date validation
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 30);
      const endDate = new Date(futureDate);
      endDate.setDate(endDate.getDate() + 4);

      const input: SubmitLeaveRequestInput = {
        employeeId: 'emp-123',
        leaveTypeId: 'leave-type-123',
        startDate: futureDate,
        endDate: endDate,
        totalDays: 5,
        reason: 'Vacation'
      };

      const mockBalance = {
        id: 'balance-123',
        employeeId: 'emp-123',
        leaveTypeId: 'leave-type-123',
        year: 2025,
        totalEntitlement: 20,
        usedDays: 5,
        pendingDays: 0,
        availableDays: 15,
        carryOverDays: 0,
        manualAdjustment: 0,
        calculateProjectedBalance: jest.fn().mockReturnValue(15)
      };

      const mockLeaveRequest = {
        id: 'request-123',
        employeeId: 'emp-123',
        leaveTypeId: 'leave-type-123',
        startDate: futureDate,
        endDate: endDate,
        totalDays: 5,
        status: 'PENDING'
      };

      leaveRequestRepository.checkLeaveConflicts.mockResolvedValue([]);
      leaveBalanceRepository.findByEmployeeLeaveTypeYear.mockResolvedValue(mockBalance as any);
      leaveRequestRepository.create.mockResolvedValue(mockLeaveRequest as any);
      leaveBalanceRepository.update.mockResolvedValue(mockBalance as any);

      const result = await service.submitLeaveRequest(input, 'user-context');

      expect(result).toEqual(mockLeaveRequest);
      expect(leaveRequestRepository.checkLeaveConflicts).toHaveBeenCalledWith(
        'emp-123',
        input.startDate,
        input.endDate,
        undefined,
        'user-context'
      );
      expect(leaveRequestRepository.create).toHaveBeenCalled();
      expect(leaveBalanceRepository.update).toHaveBeenCalled();
    });

    it('should throw error for invalid date range', async () => {
      const input: SubmitLeaveRequestInput = {
        employeeId: 'emp-123',
        leaveTypeId: 'leave-type-123',
        startDate: new Date('2025-06-05'),
        endDate: new Date('2025-06-01'), // End before start
        totalDays: 5
      };

      await expect(service.submitLeaveRequest(input)).rejects.toThrow(AppError);
      await expect(service.submitLeaveRequest(input)).rejects.toThrow('Invalid date range');
    });

    it('should throw error when insufficient balance', async () => {
      const input: SubmitLeaveRequestInput = {
        employeeId: 'emp-123',
        leaveTypeId: 'leave-type-123',
        startDate: new Date('2025-06-01'),
        endDate: new Date('2025-06-10'),
        totalDays: 10
      };

      const mockBalance = {
        id: 'balance-123',
        employeeId: 'emp-123',
        leaveTypeId: 'leave-type-123',
        year: 2025,
        totalEntitlement: 20,
        usedDays: 15,
        pendingDays: 0,
        availableDays: 5, // Only 5 days available
        carryOverDays: 0,
        manualAdjustment: 0
      };

      leaveRequestRepository.checkLeaveConflicts.mockResolvedValue([]);
      leaveBalanceRepository.findByEmployeeLeaveTypeYear.mockResolvedValue(mockBalance as any);

      await expect(service.submitLeaveRequest(input)).rejects.toThrow(AppError);
      await expect(service.submitLeaveRequest(input)).rejects.toThrow('Leave request is not eligible');
    });

    it('should throw error when leave conflicts exist', async () => {
      const input: SubmitLeaveRequestInput = {
        employeeId: 'emp-123',
        leaveTypeId: 'leave-type-123',
        startDate: new Date('2025-06-01'),
        endDate: new Date('2025-06-05'),
        totalDays: 5
      };

      const conflicts = [
        {
          requestId: 'new',
          conflictingRequestId: 'existing-123',
          conflictType: 'OVERLAP' as const,
          conflictDescription: 'Date range overlaps with existing request'
        }
      ];

      leaveRequestRepository.checkLeaveConflicts.mockResolvedValue(conflicts);

      await expect(service.submitLeaveRequest(input)).rejects.toThrow(AppError);
      await expect(service.submitLeaveRequest(input)).rejects.toThrow('Leave request is not eligible');
    });
  });

  describe('checkLeaveEligibility', () => {
    it('should return eligible when all conditions met', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 30);
      const endDate = new Date(futureDate);
      endDate.setDate(endDate.getDate() + 4);

      const mockBalance = {
        id: 'balance-123',
        employeeId: 'emp-123',
        leaveTypeId: 'leave-type-123',
        year: futureDate.getFullYear(),
        availableDays: 15,
        usedDays: 5,
        pendingDays: 0
      };

      leaveRequestRepository.checkLeaveConflicts.mockResolvedValue([]);
      leaveBalanceRepository.findByEmployeeLeaveTypeYear.mockResolvedValue(mockBalance as any);

      const result = await service.checkLeaveEligibility(
        'emp-123',
        'leave-type-123',
        futureDate,
        endDate,
        5
      );

      expect(result.isEligible).toBe(true);
      expect(result.reasons).toHaveLength(0);
      expect(result.balance).toEqual({
        available: 15,
        requested: 5,
        remaining: 10
      });
    });

    it('should return not eligible when balance not found', async () => {
      leaveRequestRepository.checkLeaveConflicts.mockResolvedValue([]);
      leaveBalanceRepository.findByEmployeeLeaveTypeYear.mockResolvedValue(null);

      const result = await service.checkLeaveEligibility(
        'emp-123',
        'leave-type-123',
        new Date('2025-06-01'),
        new Date('2025-06-05'),
        5
      );

      expect(result.isEligible).toBe(false);
      expect(result.reasons).toContain('No leave balance found for this leave type');
    });
  });

  describe('routeLeaveRequest', () => {
    it('should route to manager for requests up to 5 days', async () => {
      const mockRequest = {
        id: 'request-123',
        employeeId: 'emp-123',
        leaveTypeId: 'leave-type-123',
        totalDays: 3,
        status: 'PENDING'
      };

      leaveRequestRepository.findById.mockResolvedValue(mockRequest as any);

      const result = await service.routeLeaveRequest('request-123');

      expect(result.routedTo).toEqual(['MANAGER']);
      expect(result.routingLevel).toBe('MANAGER');
      expect(result.requiresMultipleApprovals).toBe(false);
    });

    it('should route to manager and HR for 6-10 days', async () => {
      const mockRequest = {
        id: 'request-123',
        employeeId: 'emp-123',
        leaveTypeId: 'leave-type-123',
        totalDays: 8,
        status: 'PENDING'
      };

      leaveRequestRepository.findById.mockResolvedValue(mockRequest as any);

      const result = await service.routeLeaveRequest('request-123');

      expect(result.routedTo).toEqual(['MANAGER', 'HR']);
      expect(result.routingLevel).toBe('HR');
      expect(result.requiresMultipleApprovals).toBe(true);
    });

    it('should route to manager, HR, and director for > 10 days', async () => {
      const mockRequest = {
        id: 'request-123',
        employeeId: 'emp-123',
        leaveTypeId: 'leave-type-123',
        totalDays: 15,
        status: 'PENDING'
      };

      leaveRequestRepository.findById.mockResolvedValue(mockRequest as any);

      const result = await service.routeLeaveRequest('request-123');

      expect(result.routedTo).toEqual(['MANAGER', 'HR', 'DIRECTOR']);
      expect(result.routingLevel).toBe('DIRECTOR');
      expect(result.requiresMultipleApprovals).toBe(true);
    });
  });

  // ============================================================================
  // Task 6.2: Approval Workflow Tests
  // ============================================================================

  describe('approveLeaveRequest', () => {
    it('should approve leave request successfully', async () => {
      const mockRequest = {
        id: 'request-123',
        employeeId: 'emp-123',
        leaveTypeId: 'leave-type-123',
        totalDays: 5,
        status: 'PENDING',
        startDate: new Date('2025-06-01'),
        endDate: new Date('2025-06-05')
      };

      const mockUpdatedRequest = {
        ...mockRequest,
        status: 'APPROVED',
        approvedBy: 'manager-123',
        approvedAt: new Date()
      };

      const mockBalance = {
        id: 'balance-123',
        employeeId: 'emp-123',
        leaveTypeId: 'leave-type-123',
        year: 2025,
        usedDays: 5,
        pendingDays: 5,
        availableDays: 10
      };

      leaveRequestRepository.findById.mockResolvedValue(mockRequest as any);
      leaveRequestRepository.update.mockResolvedValue(mockUpdatedRequest as any);
      leaveBalanceRepository.findByEmployeeLeaveTypeYear.mockResolvedValue(mockBalance as any);
      leaveBalanceRepository.update.mockResolvedValue(mockBalance as any);
      leaveBalanceRepository.processLeaveUsage.mockResolvedValue();

      const input: ApproveLeaveRequestInput = {
        requestId: 'request-123',
        approverId: 'manager-123',
        comments: 'Approved for vacation'
      };

      const result = await service.approveLeaveRequest(input);

      expect(result.status).toBe('APPROVED');
      expect(result.approvedBy).toBe('manager-123');
      expect(leaveRequestRepository.update).toHaveBeenCalledWith(
        'request-123',
        expect.objectContaining({
          status: 'APPROVED',
          approvedBy: 'manager-123'
        }),
        undefined
      );
    });

    it('should handle partial approval', async () => {
      const mockRequest = {
        id: 'request-123',
        employeeId: 'emp-123',
        leaveTypeId: 'leave-type-123',
        totalDays: 10,
        status: 'PENDING',
        startDate: new Date('2025-06-01'),
        endDate: new Date('2025-06-10')
      };

      const mockUpdatedRequest = {
        ...mockRequest,
        status: 'APPROVED'
      };

      const mockBalance = {
        id: 'balance-123',
        employeeId: 'emp-123',
        leaveTypeId: 'leave-type-123',
        year: 2025,
        pendingDays: 10
      };

      leaveRequestRepository.findById.mockResolvedValue(mockRequest as any);
      leaveRequestRepository.update.mockResolvedValue(mockUpdatedRequest as any);
      leaveBalanceRepository.findByEmployeeLeaveTypeYear.mockResolvedValue(mockBalance as any);
      leaveBalanceRepository.update.mockResolvedValue(mockBalance as any);
      leaveBalanceRepository.processLeaveUsage.mockResolvedValue();

      const input: ApproveLeaveRequestInput = {
        requestId: 'request-123',
        approverId: 'manager-123',
        isPartialApproval: true,
        modifiedEndDate: new Date('2025-06-07'),
        modifiedTotalDays: 7,
        comments: 'Approved for 7 days only'
      };

      const result = await service.approveLeaveRequest(input);

      expect(result.status).toBe('PARTIALLY_APPROVED');
    });

    it('should throw error when request not found', async () => {
      leaveRequestRepository.findById.mockResolvedValue(null);

      const input: ApproveLeaveRequestInput = {
        requestId: 'nonexistent',
        approverId: 'manager-123'
      };

      await expect(service.approveLeaveRequest(input)).rejects.toThrow(AppError);
      await expect(service.approveLeaveRequest(input)).rejects.toThrow('Leave request not found');
    });

    it('should throw error when request not pending', async () => {
      const mockRequest = {
        id: 'request-123',
        status: 'APPROVED'
      };

      leaveRequestRepository.findById.mockResolvedValue(mockRequest as any);

      const input: ApproveLeaveRequestInput = {
        requestId: 'request-123',
        approverId: 'manager-123'
      };

      await expect(service.approveLeaveRequest(input)).rejects.toThrow(AppError);
      await expect(service.approveLeaveRequest(input)).rejects.toThrow('Leave request is not pending approval');
    });
  });

  describe('rejectLeaveRequest', () => {
    it('should reject leave request successfully', async () => {
      const mockRequest = {
        id: 'request-123',
        employeeId: 'emp-123',
        leaveTypeId: 'leave-type-123',
        totalDays: 5,
        status: 'PENDING'
      };

      const mockUpdatedRequest = {
        ...mockRequest,
        status: 'REJECTED',
        approvedBy: 'manager-123',
        rejectionReason: 'Staffing shortage'
      };

      const mockBalance = {
        id: 'balance-123',
        employeeId: 'emp-123',
        leaveTypeId: 'leave-type-123',
        pendingDays: 5
      };

      leaveRequestRepository.findById.mockResolvedValue(mockRequest as any);
      leaveRequestRepository.update.mockResolvedValue(mockUpdatedRequest as any);
      leaveBalanceRepository.findByEmployeeLeaveTypeYear.mockResolvedValue(mockBalance as any);
      leaveBalanceRepository.update.mockResolvedValue(mockBalance as any);

      const input: RejectLeaveRequestInput = {
        requestId: 'request-123',
        approverId: 'manager-123',
        rejectionReason: 'Staffing shortage'
      };

      const result = await service.rejectLeaveRequest(input);

      expect(result.status).toBe('REJECTED');
      expect(result.approvedBy).toBe('manager-123');
      expect(leaveRequestRepository.update).toHaveBeenCalledWith(
        'request-123',
        expect.objectContaining({
          status: 'REJECTED',
          rejectionReason: 'Staffing shortage'
        }),
        undefined
      );
    });

    it('should include alternative dates in rejection', async () => {
      const mockRequest = {
        id: 'request-123',
        employeeId: 'emp-123',
        leaveTypeId: 'leave-type-123',
        totalDays: 5,
        status: 'PENDING'
      };

      const mockUpdatedRequest = {
        ...mockRequest,
        status: 'REJECTED'
      };

      const mockBalance = {
        id: 'balance-123',
        pendingDays: 5
      };

      leaveRequestRepository.findById.mockResolvedValue(mockRequest as any);
      leaveRequestRepository.update.mockResolvedValue(mockUpdatedRequest as any);
      leaveBalanceRepository.findByEmployeeLeaveTypeYear.mockResolvedValue(mockBalance as any);
      leaveBalanceRepository.update.mockResolvedValue(mockBalance as any);

      const input: RejectLeaveRequestInput = {
        requestId: 'request-123',
        approverId: 'manager-123',
        rejectionReason: 'Staffing shortage',
        suggestAlternativeDates: {
          startDate: new Date('2025-07-01'),
          endDate: new Date('2025-07-05')
        }
      };

      await service.rejectLeaveRequest(input);

      expect(leaveRequestRepository.update).toHaveBeenCalledWith(
        'request-123',
        expect.objectContaining({
          managerNotes: expect.stringContaining('Suggested alternative dates')
        }),
        undefined
      );
    });
  });

  // ============================================================================
  // Task 6.3: Balance Management Tests
  // ============================================================================

  describe('getLeaveBalance', () => {
    it('should return leave balance with calculations', async () => {
      const mockBalance = {
        id: 'balance-123',
        employeeId: 'emp-123',
        leaveTypeId: 'leave-type-123',
        year: 2025,
        totalEntitlement: 20,
        usedDays: 5,
        pendingDays: 2,
        availableDays: 13,
        carryOverDays: 0,
        calculateProjectedBalance: jest.fn().mockReturnValue(18)
      };

      leaveBalanceRepository.findByEmployeeLeaveTypeYear.mockResolvedValue(mockBalance as any);

      const result = await service.getLeaveBalance('emp-123', 'leave-type-123', 2025);

      expect(result).toEqual({
        employeeId: 'emp-123',
        leaveTypeId: 'leave-type-123',
        availableDays: 13,
        usedDays: 5,
        pendingDays: 2,
        totalEntitlement: 20,
        carryOverDays: 0,
        projectedEndOfYearBalance: 18
      });
    });

    it('should throw error when balance not found', async () => {
      leaveBalanceRepository.findByEmployeeLeaveTypeYear.mockResolvedValue(null);

      await expect(service.getLeaveBalance('emp-123', 'leave-type-123')).rejects.toThrow(AppError);
      await expect(service.getLeaveBalance('emp-123', 'leave-type-123')).rejects.toThrow('Leave balance not found');
    });
  });

  describe('processAutomaticAccrual', () => {
    it('should process accrual for eligible balances', async () => {
      const mockBalance1 = {
        id: 'balance-1',
        employeeId: 'emp-1',
        leaveTypeId: 'leave-type-1',
        year: 2025,
        currentBalance: 10,
        accrualRate: 1.25,
        isAccrualDue: jest.fn().mockReturnValue(true)
      };

      const mockBalance2 = {
        id: 'balance-2',
        employeeId: 'emp-2',
        leaveTypeId: 'leave-type-1',
        year: 2025,
        currentBalance: 8,
        accrualRate: 1.5,
        isAccrualDue: jest.fn().mockReturnValue(true)
      };

      leaveBalanceRepository.findAll.mockResolvedValue({
        data: [mockBalance1, mockBalance2] as any,
        pagination: { page: 1, limit: 25, total: 2, totalPages: 1 }
      });

      leaveBalanceRepository.processLeaveAccrual.mockResolvedValue();

      const input: AccrualProcessingInput = {
        processDate: new Date('2025-06-01')
      };

      const result = await service.processAutomaticAccrual(input);

      expect(result.processedCount).toBe(2);
      expect(result.failedCount).toBe(0);
      expect(result.totalAccruedDays).toBe(2.75); // 1.25 + 1.5
      expect(result.processedEmployees).toHaveLength(2);
      expect(leaveBalanceRepository.processLeaveAccrual).toHaveBeenCalledTimes(2);
    });

    it('should skip balances not due for accrual', async () => {
      const mockBalance = {
        id: 'balance-1',
        employeeId: 'emp-1',
        leaveTypeId: 'leave-type-1',
        year: 2025,
        currentBalance: 10,
        accrualRate: 1.25,
        isAccrualDue: jest.fn().mockReturnValue(false)
      };

      leaveBalanceRepository.findAll.mockResolvedValue({
        data: [mockBalance] as any,
        pagination: { page: 1, limit: 25, total: 1, totalPages: 1 }
      });

      const input: AccrualProcessingInput = {
        processDate: new Date('2025-06-01')
      };

      const result = await service.processAutomaticAccrual(input);

      expect(result.processedCount).toBe(0);
      expect(leaveBalanceRepository.processLeaveAccrual).not.toHaveBeenCalled();
    });

    it('should handle dry run mode', async () => {
      const mockBalance = {
        id: 'balance-1',
        employeeId: 'emp-1',
        leaveTypeId: 'leave-type-1',
        year: 2025,
        currentBalance: 10,
        accrualRate: 1.25,
        isAccrualDue: jest.fn().mockReturnValue(true)
      };

      leaveBalanceRepository.findAll.mockResolvedValue({
        data: [mockBalance] as any,
        pagination: { page: 1, limit: 25, total: 1, totalPages: 1 }
      });

      const input: AccrualProcessingInput = {
        dryRun: true
      };

      const result = await service.processAutomaticAccrual(input);

      expect(result.processedCount).toBe(1);
      expect(leaveBalanceRepository.processLeaveAccrual).not.toHaveBeenCalled();
    });

    it('should handle accrual processing errors', async () => {
      const mockBalance = {
        id: 'balance-1',
        employeeId: 'emp-1',
        leaveTypeId: 'leave-type-1',
        year: 2025,
        currentBalance: 10,
        accrualRate: 1.25,
        isAccrualDue: jest.fn().mockReturnValue(true)
      };

      leaveBalanceRepository.findAll.mockResolvedValue({
        data: [mockBalance] as any,
        pagination: { page: 1, limit: 25, total: 1, totalPages: 1 }
      });

      leaveBalanceRepository.processLeaveAccrual.mockRejectedValue(new Error('Database error'));

      const input: AccrualProcessingInput = {};

      const result = await service.processAutomaticAccrual(input);

      expect(result.failedCount).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].error).toBe('Database error');
    });
  });

  describe('adjustLeaveBalance', () => {
    it('should apply manual balance adjustment', async () => {
      const mockBalance = {
        id: 'balance-123',
        employeeId: 'emp-123',
        leaveTypeId: 'leave-type-123',
        year: 2025,
        currentBalance: 10,
        manualAdjustment: 0
      };

      const mockUpdatedBalance = {
        ...mockBalance,
        manualAdjustment: 5
      };

      leaveBalanceRepository.findByEmployeeLeaveTypeYear.mockResolvedValue(mockBalance as any);
      leaveBalanceRepository.createAccrualTransaction.mockResolvedValue({} as any);
      leaveBalanceRepository.update.mockResolvedValue(mockUpdatedBalance as any);

      const input: BalanceAdjustmentInput = {
        employeeId: 'emp-123',
        leaveTypeId: 'leave-type-123',
        adjustmentAmount: 5,
        reason: 'Bonus leave granted',
        adjustedBy: 'hr-123'
      };

      const result = await service.adjustLeaveBalance(input);

      expect(result.manualAdjustment).toBe(5);
      expect(leaveBalanceRepository.createAccrualTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          transactionType: 'ADJUSTMENT',
          amount: 5,
          description: expect.stringContaining('Bonus leave granted')
        }),
        undefined
      );
    });

    it('should throw error when balance not found', async () => {
      leaveBalanceRepository.findByEmployeeLeaveTypeYear.mockResolvedValue(null);

      const input: BalanceAdjustmentInput = {
        employeeId: 'emp-123',
        leaveTypeId: 'leave-type-123',
        adjustmentAmount: 5,
        reason: 'Bonus leave',
        adjustedBy: 'hr-123'
      };

      await expect(service.adjustLeaveBalance(input)).rejects.toThrow(AppError);
      await expect(service.adjustLeaveBalance(input)).rejects.toThrow('Leave balance not found');
    });
  });

  describe('cancelLeaveRequest', () => {
    it('should cancel pending leave request', async () => {
      const mockRequest = {
        id: 'request-123',
        employeeId: 'emp-123',
        leaveTypeId: 'leave-type-123',
        totalDays: 5,
        status: 'PENDING',
        startDate: new Date('2025-06-01')
      };

      const mockBalance = {
        id: 'balance-123',
        employeeId: 'emp-123',
        leaveTypeId: 'leave-type-123',
        year: 2025,
        pendingDays: 5
      };

      leaveRequestRepository.findById.mockResolvedValue(mockRequest as any);
      leaveBalanceRepository.findByEmployeeLeaveTypeYear.mockResolvedValue(mockBalance as any);
      leaveBalanceRepository.update.mockResolvedValue(mockBalance as any);
      leaveRequestRepository.cancelRequest.mockResolvedValue(mockRequest as any);

      const result = await service.cancelLeaveRequest('request-123', 'Personal reasons');

      expect(leaveBalanceRepository.update).toHaveBeenCalledWith(
        'balance-123',
        expect.objectContaining({
          pendingDays: 0
        }),
        undefined
      );
      expect(leaveRequestRepository.cancelRequest).toHaveBeenCalledWith(
        'request-123',
        'Personal reasons',
        undefined
      );
    });

    it('should restore balance when cancelling approved request', async () => {
      const mockRequest = {
        id: 'request-123',
        employeeId: 'emp-123',
        leaveTypeId: 'leave-type-123',
        totalDays: 5,
        status: 'APPROVED',
        startDate: new Date('2025-06-01')
      };

      const mockBalance = {
        id: 'balance-123',
        employeeId: 'emp-123',
        leaveTypeId: 'leave-type-123',
        year: 2025,
        usedDays: 10
      };

      leaveRequestRepository.findById.mockResolvedValue(mockRequest as any);
      leaveBalanceRepository.findByEmployeeLeaveTypeYear.mockResolvedValue(mockBalance as any);
      leaveBalanceRepository.update.mockResolvedValue(mockBalance as any);
      leaveBalanceRepository.createAccrualTransaction.mockResolvedValue({} as any);
      leaveRequestRepository.cancelRequest.mockResolvedValue(mockRequest as any);

      await service.cancelLeaveRequest('request-123', 'Emergency cancellation');

      expect(leaveBalanceRepository.update).toHaveBeenCalledWith(
        'balance-123',
        expect.objectContaining({
          usedDays: 5 // 10 - 5 restored
        }),
        undefined
      );

      expect(leaveBalanceRepository.createAccrualTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          transactionType: 'ADJUSTMENT',
          amount: 5,
          description: expect.stringContaining('Leave cancellation reversal')
        }),
        undefined
      );
    });

    it('should throw error for invalid status', async () => {
      const mockRequest = {
        id: 'request-123',
        status: 'REJECTED'
      };

      leaveRequestRepository.findById.mockResolvedValue(mockRequest as any);

      await expect(service.cancelLeaveRequest('request-123', 'Reason')).rejects.toThrow(AppError);
      await expect(service.cancelLeaveRequest('request-123', 'Reason')).rejects.toThrow('Cannot cancel request with current status');
    });
  });

  describe('getPendingLeaveRequests', () => {
    it('should return pending leave requests for employee', async () => {
      const mockRequests = [
        { id: 'req-1', employeeId: 'emp-123', status: 'PENDING' },
        { id: 'req-2', employeeId: 'emp-123', status: 'PENDING' }
      ];

      leaveRequestRepository.findAll.mockResolvedValue({
        data: mockRequests as any,
        pagination: { page: 1, limit: 25, total: 2, totalPages: 1 }
      });

      const result = await service.getPendingLeaveRequests('emp-123');

      expect(result).toHaveLength(2);
      expect(leaveRequestRepository.findAll).toHaveBeenCalledWith(
        {
          filters: {
            employeeId: 'emp-123',
            status: 'PENDING'
          },
          sort: { field: 'created_at', direction: 'ASC' }
        },
        undefined
      );
    });
  });
});
