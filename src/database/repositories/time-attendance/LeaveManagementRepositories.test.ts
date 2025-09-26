import { LeaveRequestRepository } from './LeaveRequestRepository';
import { LeaveBalanceRepository } from './LeaveBalanceRepository';
import { PolicyRepository } from './PolicyRepository';
import { LeaveRequest } from '../../../models/time-attendance/LeaveRequest';
import { LeaveBalance } from '../../../models/time-attendance/LeaveBalance';
import { LeavePolicy } from '../../../models/time-attendance/Policy';
import { supabase } from '../../supabase';

// Mock the Supabase client
jest.mock('../../supabase');

describe('LeaveRequestRepository', () => {
  let repository: LeaveRequestRepository;
  let mockClient: any;

  beforeEach(() => {
    repository = new LeaveRequestRepository();

    mockClient = {
      from: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      lte: jest.fn().mockReturnThis(),
      lt: jest.fn().mockReturnThis(),
      neq: jest.fn().mockReturnThis(),
      or: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      range: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      single: jest.fn(),
      maybeSingle: jest.fn(),
      rpc: jest.fn()
    };

    (supabase.getClient as jest.Mock).mockReturnValue(mockClient);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a new leave request successfully', async () => {
      const leaveRequestData = {
        employeeId: 'emp-123',
        leaveTypeId: 'VACATION',
        startDate: new Date('2024-06-01'),
        endDate: new Date('2024-06-05'),
        totalDays: 5,
        reason: 'Family vacation'
      };

      const mockResult = {
        id: 'req-123',
        employee_id: 'emp-123',
        leave_type_id: 'VACATION',
        start_date: '2024-06-01',
        end_date: '2024-06-05',
        total_days: 5,
        reason: 'Family vacation',
        status: 'PENDING',
        created_at: '2024-01-15T09:00:00Z',
        updated_at: '2024-01-15T09:00:00Z'
      };

      // Mock conflict check returning no conflicts
      jest.spyOn(repository, 'checkLeaveConflicts').mockResolvedValue([]);
      mockClient.single.mockResolvedValue({ data: mockResult, error: null });

      const result = await repository.create(leaveRequestData);

      expect(result).toBeInstanceOf(LeaveRequest);
      expect(result.employeeId).toBe('emp-123');
      expect(result.status).toBe('PENDING');
      expect(mockClient.from).toHaveBeenCalledWith('leave_requests');
    });

    it('should throw error when conflicts are detected', async () => {
      const leaveRequestData = {
        employeeId: 'emp-123',
        leaveTypeId: 'VACATION',
        startDate: new Date('2024-06-01'),
        endDate: new Date('2024-06-05'),
        totalDays: 5
      };

      const conflicts = [{
        requestId: 'new',
        conflictingRequestId: 'existing-123',
        conflictType: 'OVERLAP' as const,
        conflictDescription: 'Date range overlaps'
      }];

      jest.spyOn(repository, 'checkLeaveConflicts').mockResolvedValue(conflicts);

      await expect(repository.create(leaveRequestData)).rejects.toThrow('Leave request conflicts detected');
    });
  });

  describe('processApproval', () => {
    it('should approve leave request successfully', async () => {
      const mockRequest = new LeaveRequest({
        id: 'req-123',
        employeeId: 'emp-123',
        leaveTypeId: 'VACATION',
        startDate: new Date('2024-06-01'),
        endDate: new Date('2024-06-05'),
        totalDays: 5,
        status: 'PENDING'
      });

      jest.spyOn(repository, 'findById').mockResolvedValue(mockRequest);
      jest.spyOn(repository, 'update').mockResolvedValue(new LeaveRequest({
        ...mockRequest,
        status: 'APPROVED',
        approvedBy: 'manager-123'
      } as any));

      const approval = {
        requestId: 'req-123',
        action: 'APPROVE' as const,
        approvedBy: 'manager-123',
        comments: 'Approved for vacation'
      };

      const result = await repository.processApproval(approval);

      expect(result?.status).toBe('APPROVED');
      expect(result?.approvedBy).toBe('manager-123');
    });

    it('should reject leave request successfully', async () => {
      const mockRequest = new LeaveRequest({
        id: 'req-123',
        employeeId: 'emp-123',
        leaveTypeId: 'VACATION',
        startDate: new Date('2024-06-01'),
        endDate: new Date('2024-06-05'),
        totalDays: 5,
        status: 'PENDING'
      });

      jest.spyOn(repository, 'findById').mockResolvedValue(mockRequest);
      jest.spyOn(repository, 'update').mockResolvedValue(new LeaveRequest({
        ...mockRequest,
        status: 'REJECTED',
        rejectionReason: 'Insufficient coverage'
      } as any));

      const approval = {
        requestId: 'req-123',
        action: 'REJECT' as const,
        approvedBy: 'manager-123',
        comments: 'Insufficient coverage'
      };

      const result = await repository.processApproval(approval);

      expect(result?.status).toBe('REJECTED');
    });

    it('should throw error when request is not pending', async () => {
      const mockRequest = new LeaveRequest({
        id: 'req-123',
        employeeId: 'emp-123',
        leaveTypeId: 'VACATION',
        startDate: new Date('2024-06-01'),
        endDate: new Date('2024-06-05'),
        totalDays: 5,
        status: 'APPROVED'
      });

      jest.spyOn(repository, 'findById').mockResolvedValue(mockRequest);

      const approval = {
        requestId: 'req-123',
        action: 'APPROVE' as const,
        approvedBy: 'manager-123'
      };

      await expect(repository.processApproval(approval)).rejects.toThrow('Leave request is not pending approval');
    });
  });

  describe('checkLeaveConflicts', () => {
    it('should detect overlapping dates', async () => {
      const conflictingRequests = [{
        id: 'existing-123',
        start_date: '2024-06-03',
        end_date: '2024-06-07',
        status: 'APPROVED'
      }];

      mockClient.or.mockResolvedValue({ data: conflictingRequests, error: null });

      const conflicts = await repository.checkLeaveConflicts(
        'emp-123',
        new Date('2024-06-01'),
        new Date('2024-06-05')
      );

      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].conflictType).toBe('OVERLAP');
    });

    it('should detect same dates', async () => {
      const conflictingRequests = [{
        id: 'existing-123',
        start_date: '2024-06-01',
        end_date: '2024-06-05',
        status: 'PENDING'
      }];

      mockClient.or.mockResolvedValue({ data: conflictingRequests, error: null });

      const conflicts = await repository.checkLeaveConflicts(
        'emp-123',
        new Date('2024-06-01'),
        new Date('2024-06-05')
      );

      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].conflictType).toBe('SAME_DATES');
    });
  });

  describe('cancelRequest', () => {
    it('should cancel pending request successfully', async () => {
      const mockRequest = new LeaveRequest({
        id: 'req-123',
        employeeId: 'emp-123',
        leaveTypeId: 'VACATION',
        startDate: new Date('2024-12-01'), // Future date
        endDate: new Date('2024-12-05'),
        totalDays: 5,
        status: 'PENDING'
      });

      jest.spyOn(repository, 'findById').mockResolvedValue(mockRequest);
      jest.spyOn(repository, 'update').mockResolvedValue(new LeaveRequest({
        ...mockRequest,
        status: 'CANCELLED'
      } as any));

      const result = await repository.cancelRequest('req-123', 'Change of plans');

      expect(result?.status).toBe('CANCELLED');
    });

    it('should throw error when trying to cancel past request', async () => {
      const mockRequest = new LeaveRequest({
        id: 'req-123',
        employeeId: 'emp-123',
        leaveTypeId: 'VACATION',
        startDate: new Date('2024-01-01'), // Past date
        endDate: new Date('2024-01-05'),
        totalDays: 5,
        status: 'APPROVED'
      });

      jest.spyOn(repository, 'findById').mockResolvedValue(mockRequest);

      await expect(repository.cancelRequest('req-123')).rejects.toThrow('Cannot cancel leave request that has already started');
    });
  });
});

describe('LeaveBalanceRepository', () => {
  let repository: LeaveBalanceRepository;
  let mockClient: any;

  beforeEach(() => {
    repository = new LeaveBalanceRepository();
    mockClient = {
      from: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      gt: jest.fn().mockReturnThis(),
      lte: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      range: jest.fn().mockReturnThis(),
      single: jest.fn(),
      rpc: jest.fn()
    };

    (supabase.getClient as jest.Mock).mockReturnValue(mockClient);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a new leave balance successfully', async () => {
      const balanceData = {
        employeeId: 'emp-123',
        leaveTypeId: 'VACATION',
        year: 2024,
        totalEntitlement: 20,
        carryOverDays: 5
      };

      const mockResult = {
        id: 'balance-123',
        employee_id: 'emp-123',
        leave_type_id: 'VACATION',
        year: 2024,
        total_entitlement: 20,
        used_days: 0,
        pending_days: 0,
        available_days: 25,
        carry_over_days: 5,
        manual_adjustment: 0,
        created_at: '2024-01-15T09:00:00Z',
        updated_at: '2024-01-15T09:00:00Z'
      };

      jest.spyOn(repository, 'findByEmployeeLeaveTypeYear').mockResolvedValue(null);
      jest.spyOn(repository, 'createAccrualTransaction').mockResolvedValue({} as any);
      mockClient.single.mockResolvedValue({ data: mockResult, error: null });

      const result = await repository.create(balanceData);

      expect(result).toBeInstanceOf(LeaveBalance);
      expect(result.totalEntitlement).toBe(20);
      expect(result.availableDays).toBe(25);
    });

    it('should throw error when balance already exists', async () => {
      const balanceData = {
        employeeId: 'emp-123',
        leaveTypeId: 'VACATION',
        year: 2024,
        totalEntitlement: 20
      };

      const existingBalance = new LeaveBalance({
        id: 'existing-123',
        employeeId: 'emp-123',
        leaveTypeId: 'VACATION',
        year: 2024,
        totalEntitlement: 15,
        usedDays: 0,
        pendingDays: 0,
        availableDays: 15,
        carryOverDays: 0,
        manualAdjustment: 0
      });

      jest.spyOn(repository, 'findByEmployeeLeaveTypeYear').mockResolvedValue(existingBalance);

      await expect(repository.create(balanceData)).rejects.toThrow('Leave balance already exists');
    });
  });

  describe('processLeaveUsage', () => {
    it('should process leave usage successfully', async () => {
      const mockBalance = new LeaveBalance({
        id: 'balance-123',
        employeeId: 'emp-123',
        leaveTypeId: 'VACATION',
        year: 2024,
        totalEntitlement: 20,
        usedDays: 5,
        pendingDays: 0,
        availableDays: 15,
        carryOverDays: 0,
        manualAdjustment: 0
      });

      jest.spyOn(repository, 'findByEmployeeLeaveTypeYear').mockResolvedValue(mockBalance);
      jest.spyOn(repository, 'createAccrualTransaction').mockResolvedValue({} as any);
      jest.spyOn(repository, 'update').mockResolvedValue(mockBalance);

      await repository.processLeaveUsage('emp-123', 'VACATION', 3, 'req-123');

      expect(repository.createAccrualTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          transactionType: 'USAGE',
          amount: -3
        }),
        undefined
      );
    });

    it('should throw error when insufficient balance', async () => {
      const mockBalance = new LeaveBalance({
        id: 'balance-123',
        employeeId: 'emp-123',
        leaveTypeId: 'VACATION',
        year: 2024,
        totalEntitlement: 20,
        usedDays: 18,
        pendingDays: 0,
        availableDays: 2,
        carryOverDays: 0,
        manualAdjustment: 0
      });

      jest.spyOn(repository, 'findByEmployeeLeaveTypeYear').mockResolvedValue(mockBalance);

      await expect(repository.processLeaveUsage('emp-123', 'VACATION', 5, 'req-123'))
        .rejects.toThrow('Insufficient leave balance');
    });
  });

  describe('processLeaveAccrual', () => {
    it('should process accrual for existing balance', async () => {
      const mockBalance = new LeaveBalance({
        id: 'balance-123',
        employeeId: 'emp-123',
        leaveTypeId: 'VACATION',
        year: 2024,
        totalEntitlement: 20,
        usedDays: 0,
        pendingDays: 0,
        availableDays: 20,
        carryOverDays: 0,
        manualAdjustment: 0
      });

      jest.spyOn(repository, 'findByEmployeeLeaveTypeYear').mockResolvedValue(mockBalance);
      jest.spyOn(repository, 'createAccrualTransaction').mockResolvedValue({} as any);
      jest.spyOn(repository, 'update').mockResolvedValue(mockBalance);

      await repository.processLeaveAccrual('emp-123', 'VACATION', 1.67, 'Monthly accrual');

      expect(repository.createAccrualTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          transactionType: 'ACCRUAL',
          amount: 1.67
        }),
        undefined
      );
    });

    it('should create new balance when none exists', async () => {
      jest.spyOn(repository, 'findByEmployeeLeaveTypeYear').mockResolvedValue(null);
      jest.spyOn(repository, 'create').mockResolvedValue({} as any);

      await repository.processLeaveAccrual('emp-123', 'VACATION', 20, 'Annual entitlement');

      expect(repository.create).toHaveBeenCalledWith({
        employeeId: 'emp-123',
        leaveTypeId: 'VACATION',
        year: new Date().getFullYear(),
        totalEntitlement: 20
      }, undefined);
    });
  });

  describe('recalculateBalance', () => {
    it('should recalculate balance based on transactions', async () => {
      const mockBalance = new LeaveBalance({
        id: 'balance-123',
        employeeId: 'emp-123',
        leaveTypeId: 'VACATION',
        year: 2024,
        totalEntitlement: 20,
        usedDays: 5,
        pendingDays: 2,
        availableDays: 13,
        carryOverDays: 0,
        manualAdjustment: 0
      });

      const mockTransactions = [
        { transactionType: 'ACCRUAL', amount: 20 },
        { transactionType: 'USAGE', amount: -5 },
        { transactionType: 'ADJUSTMENT', amount: 1 }
      ];

      jest.spyOn(repository, 'findById').mockResolvedValue(mockBalance);
      jest.spyOn(repository, 'getAccrualTransactions').mockResolvedValue(mockTransactions as any);
      jest.spyOn(repository, 'update').mockResolvedValue(mockBalance);

      const result = await repository.recalculateBalance('balance-123');

      expect(result.totalEntitlement).toBe(20);
      expect(result.usedDays).toBe(5);
      expect(result.availableDays).toBe(14); // 20 + 0 - 5 + 1 - 2 (pending)
    });
  });
});

describe('PolicyRepository', () => {
  let repository: PolicyRepository;
  let mockClient: any;

  beforeEach(() => {
    repository = new PolicyRepository();
    mockClient = {
      from: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      contains: jest.fn().mockReturnThis(),
      lte: jest.fn().mockReturnThis(),
      lt: jest.fn().mockReturnThis(),
      or: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      range: jest.fn().mockReturnThis(),
      single: jest.fn()
    };

    (supabase.getClient as jest.Mock).mockReturnValue(mockClient);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a leave policy successfully', async () => {
      const policyData = {
        name: 'Annual Leave Policy',
        description: 'Standard annual leave policy',
        leaveTypeId: 'VACATION',
        isActive: true,
        applicableGroups: ['FULL_TIME'],
        eligibilityRules: [],
        accrualRules: [],
        usageRules: [],
        effectiveDate: new Date('2024-01-01')
      };

      const mockResult = {
        id: 'policy-123',
        name: 'Annual Leave Policy',
        description: 'Standard annual leave policy',
        policy_type: 'LEAVE',
        leave_type_id: 'VACATION',
        is_active: true,
        applicable_groups: '["FULL_TIME"]',
        eligibility_rules: '[]',
        accrual_rules: '[]',
        usage_rules: '[]',
        effective_date: '2024-01-01',
        expiry_date: null,
        created_at: '2024-01-15T09:00:00Z',
        updated_at: '2024-01-15T09:00:00Z'
      };

      jest.spyOn(repository, 'checkPolicyConflicts').mockResolvedValue([]);
      mockClient.single.mockResolvedValue({ data: mockResult, error: null });

      const result = await repository.create(policyData);

      expect(result).toBeInstanceOf(LeavePolicy);
      expect(result.name).toBe('Annual Leave Policy');
      expect(result.isActive).toBe(true);
    });

    it('should throw error when conflicts are detected', async () => {
      const policyData = {
        name: 'Conflicting Policy',
        description: 'This policy conflicts',
        leaveTypeId: 'VACATION',
        isActive: true,
        applicableGroups: ['FULL_TIME'],
        eligibilityRules: [],
        effectiveDate: new Date('2024-01-01')
      };

      const conflicts = [{
        policy1Id: 'new',
        policy2Id: 'existing-123',
        conflictType: 'SAME_LEAVE_TYPE' as const,
        description: 'Overlapping groups'
      }];

      jest.spyOn(repository, 'checkPolicyConflicts').mockResolvedValue(conflicts);

      await expect(repository.create(policyData)).rejects.toThrow('Policy conflicts detected');
    });
  });

  describe('activatePolicy', () => {
    it('should activate policy successfully', async () => {
      const mockPolicy = new LeavePolicy({
        id: 'policy-123',
        name: 'Test Policy',
        description: 'Test Description',
        leaveTypeId: 'VACATION',
        isActive: false,
        applicableGroups: ['FULL_TIME'],
        eligibilityRules: [],
        accrualRules: [],
        usageRules: []
      });

      jest.spyOn(repository, 'update').mockResolvedValue(new LeavePolicy({
        ...mockPolicy,
        isActive: true
      } as any));

      const result = await repository.activatePolicy('policy-123');

      expect(result?.isActive).toBe(true);
    });
  });

  describe('clonePolicy', () => {
    it('should clone policy with modifications', async () => {
      const originalPolicy = new LeavePolicy({
        id: 'original-123',
        name: 'Original Policy',
        description: 'Original Description',
        leaveTypeId: 'VACATION',
        isActive: true,
        applicableGroups: ['FULL_TIME'],
        eligibilityRules: [],
        accrualRules: [],
        usageRules: []
      });

      jest.spyOn(repository, 'findById').mockResolvedValue(originalPolicy);
      jest.spyOn(repository, 'create').mockResolvedValue(new LeavePolicy({
        ...originalPolicy,
        id: 'clone-123',
        name: 'Cloned Policy',
        isActive: false
      } as any));

      const modifications = {
        name: 'Cloned Policy'
      };

      const result = await repository.clonePolicy('original-123', modifications);

      expect(result.name).toBe('Cloned Policy');
      expect(result.isActive).toBe(false);
    });
  });
});