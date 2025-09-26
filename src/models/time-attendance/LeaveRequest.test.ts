import { LeaveRequest, LeaveType, LeaveRequestData, LeaveTypeData } from './LeaveRequest';
import { ValidationError } from '../../utils/validation';
import { v4 as uuidv4 } from 'uuid';

describe('LeaveType', () => {
  const validLeaveTypeData: LeaveTypeData = {
    name: 'Vacation',
    code: 'VAC',
    paid: true,
    requiresApproval: true,
    maxConsecutiveDays: 10,
    advanceNoticeRequired: 7,
    allowsPartialDays: true,
    accrualBased: true,
    description: 'Annual vacation leave',
    isActive: true
  };

  describe('constructor', () => {
    it('should create a valid LeaveType instance', () => {
      const leaveType = new LeaveType(validLeaveTypeData);

      expect(leaveType.name).toBe('Vacation');
      expect(leaveType.code).toBe('VAC');
      expect(leaveType.paid).toBe(true);
      expect(leaveType.requiresApproval).toBe(true);
      expect(leaveType.maxConsecutiveDays).toBe(10);
      expect(leaveType.advanceNoticeRequired).toBe(7);
      expect(leaveType.allowsPartialDays).toBe(true);
      expect(leaveType.accrualBased).toBe(true);
      expect(leaveType.isActive).toBe(true);
      expect(leaveType.id).toBeDefined();
    });

    it('should trim and uppercase the code', () => {
      const data = { ...validLeaveTypeData, code: '  vac  ' };
      const leaveType = new LeaveType(data);
      expect(leaveType.code).toBe('VAC');
    });

    it('should throw ValidationError for invalid code format', () => {
      const data = { ...validLeaveTypeData, code: 'invalid-code!' };
      expect(() => new LeaveType(data)).toThrow(ValidationError);
    });

    it('should throw ValidationError for negative maxConsecutiveDays', () => {
      const data = { ...validLeaveTypeData, maxConsecutiveDays: -1 };
      expect(() => new LeaveType(data)).toThrow(ValidationError);
    });

    it('should throw ValidationError for negative advanceNoticeRequired', () => {
      const data = { ...validLeaveTypeData, advanceNoticeRequired: -1 };
      expect(() => new LeaveType(data)).toThrow(ValidationError);
    });
  });

  describe('validateLeaveRequest', () => {
    let leaveType: LeaveType;
    let validRequestData: LeaveRequestData;

    beforeEach(() => {
      leaveType = new LeaveType(validLeaveTypeData);
      validRequestData = {
        employeeId: uuidv4(),
        leaveTypeId: leaveType.id,
        startDate: new Date('2025-12-01'),
        endDate: new Date('2025-12-05'),
        totalDays: 5,
        totalHours: 40,
        status: 'PENDING'
      };
    });

    it('should validate a compliant leave request', () => {
      const request = new LeaveRequest(validRequestData);
      const result = leaveType.validateLeaveRequest(request);

      expect(result.isValid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should detect maximum consecutive days violation', () => {
      const requestData = { ...validRequestData, totalDays: 15 };
      const request = new LeaveRequest(requestData);
      const result = leaveType.validateLeaveRequest(request);

      expect(result.isValid).toBe(false);
      expect(result.violations).toContain('Leave request exceeds maximum consecutive days limit of 10');
    });

    it('should detect advance notice violation', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      const requestData = { 
        ...validRequestData, 
        startDate: tomorrow,
        endDate: new Date(tomorrow.getTime() + 24 * 60 * 60 * 1000)
      };
      const request = new LeaveRequest(requestData);
      const result = leaveType.validateLeaveRequest(request);

      expect(result.isValid).toBe(false);
      expect(result.violations).toContain('Leave request does not meet advance notice requirement of 7 days');
    });

    it('should detect partial day violation when not allowed', () => {
      const leaveTypeNoPartial = new LeaveType({ ...validLeaveTypeData, allowsPartialDays: false });
      const requestData = { ...validRequestData, totalHours: 4 }; // Half day
      const request = new LeaveRequest(requestData);
      const result = leaveTypeNoPartial.validateLeaveRequest(request);

      expect(result.isValid).toBe(false);
      expect(result.violations).toContain('This leave type does not allow partial day requests');
    });

    it('should detect inactive leave type', () => {
      const inactiveLeaveType = new LeaveType({ ...validLeaveTypeData, isActive: false });
      const request = new LeaveRequest(validRequestData);
      const result = inactiveLeaveType.validateLeaveRequest(request);

      expect(result.isValid).toBe(false);
      expect(result.violations).toContain('This leave type is currently inactive');
    });
  });

  describe('canBeUsedBy', () => {
    it('should return true for active accrual-based leave type with balance', () => {
      const leaveType = new LeaveType(validLeaveTypeData);
      const result = leaveType.canBeUsedBy({ accrualBalance: 10 });
      expect(result).toBe(true);
    });

    it('should return false for inactive leave type', () => {
      const leaveType = new LeaveType({ ...validLeaveTypeData, isActive: false });
      const result = leaveType.canBeUsedBy({ accrualBalance: 10 });
      expect(result).toBe(false);
    });

    it('should return false for accrual-based leave type with no balance', () => {
      const leaveType = new LeaveType(validLeaveTypeData);
      const result = leaveType.canBeUsedBy({ accrualBalance: 0 });
      expect(result).toBe(false);
    });

    it('should return true for non-accrual-based leave type', () => {
      const leaveType = new LeaveType({ ...validLeaveTypeData, accrualBased: false });
      const result = leaveType.canBeUsedBy({});
      expect(result).toBe(true);
    });
  });
});

describe('LeaveRequest', () => {
  const validRequestData: LeaveRequestData = {
    employeeId: uuidv4(),
    leaveTypeId: uuidv4(),
    startDate: new Date('2025-12-01'),
    endDate: new Date('2025-12-05'),
    totalDays: 5,
    totalHours: 40,
    reason: 'Family vacation',
    status: 'PENDING'
  };

  describe('constructor', () => {
    it('should create a valid LeaveRequest instance', () => {
      const request = new LeaveRequest(validRequestData);

      expect(request.employeeId).toBe(validRequestData.employeeId);
      expect(request.leaveTypeId).toBe(validRequestData.leaveTypeId);
      expect(request.startDate).toEqual(new Date('2025-12-01'));
      expect(request.endDate).toEqual(new Date('2025-12-05'));
      expect(request.totalDays).toBe(5);
      expect(request.totalHours).toBe(40);
      expect(request.reason).toBe('Family vacation');
      expect(request.status).toBe('PENDING');
      expect(request.id).toBeDefined();
      expect(request.submittedAt).toBeDefined();
      expect(request.attachments).toEqual([]);
    });

    it('should throw ValidationError for end date before start date', () => {
      const data = {
        ...validRequestData,
        startDate: new Date('2024-12-05'),
        endDate: new Date('2024-12-01')
      };
      expect(() => new LeaveRequest(data)).toThrow(ValidationError);
    });

    it('should throw ValidationError for past dates', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 2);
      
      const data = {
        ...validRequestData,
        startDate: yesterday,
        endDate: yesterday
      };
      expect(() => new LeaveRequest(data)).toThrow(ValidationError);
    });

    it('should throw ValidationError for zero or negative days', () => {
      const data = { ...validRequestData, totalDays: 0 };
      expect(() => new LeaveRequest(data)).toThrow(ValidationError);
    });

    it('should throw ValidationError for zero or negative hours', () => {
      const data = { ...validRequestData, totalHours: 0 };
      expect(() => new LeaveRequest(data)).toThrow(ValidationError);
    });

    it('should throw ValidationError for approved request without reviewer', () => {
      const data = { ...validRequestData, status: 'APPROVED' as const };
      expect(() => new LeaveRequest(data)).toThrow(ValidationError);
    });

    it('should throw ValidationError for denied request without review notes', () => {
      const data = {
        ...validRequestData,
        status: 'DENIED' as const,
        reviewedBy: uuidv4(),
        reviewedAt: new Date()
      };
      expect(() => new LeaveRequest(data)).toThrow(ValidationError);
    });
  });

  describe('calculateBusinessDays', () => {
    it('should calculate business days correctly excluding weekends', () => {
      // Monday to Friday (5 business days)
      const request = new LeaveRequest({
        ...validRequestData,
        startDate: new Date('2025-12-01'), // Monday
        endDate: new Date('2025-12-05')    // Friday
      });

      expect(request.calculateBusinessDays()).toBe(5);
    });

    it('should exclude weekends from business day calculation', () => {
      // Friday to Monday (2 business days: Friday and Monday)
      const request = new LeaveRequest({
        ...validRequestData,
        startDate: new Date('2025-11-28'), // Friday
        endDate: new Date('2025-12-01')    // Monday
      });

      expect(request.calculateBusinessDays()).toBe(2);
    });
  });

  describe('validateAdvanceNotice', () => {
    it('should return true when advance notice requirement is met', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 10);
      
      const request = new LeaveRequest({
        ...validRequestData,
        startDate: futureDate,
        endDate: new Date(futureDate.getTime() + 24 * 60 * 60 * 1000)
      });

      expect(request.validateAdvanceNotice(7)).toBe(true);
    });

    it('should return false when advance notice requirement is not met', () => {
      const nearFutureDate = new Date();
      nearFutureDate.setDate(nearFutureDate.getDate() + 3);
      
      const request = new LeaveRequest({
        ...validRequestData,
        startDate: nearFutureDate,
        endDate: new Date(nearFutureDate.getTime() + 24 * 60 * 60 * 1000)
      });

      expect(request.validateAdvanceNotice(7)).toBe(false);
    });
  });

  describe('checkDateConflict', () => {
    let baseRequest: LeaveRequest;
    let existingRequests: LeaveRequest[];

    beforeEach(() => {
      baseRequest = new LeaveRequest({
        ...validRequestData,
        startDate: new Date('2025-12-10'),
        endDate: new Date('2025-12-15')
      });

      existingRequests = [
        new LeaveRequest({
          ...validRequestData,
          id: uuidv4(),
          startDate: new Date('2025-12-05'),
          endDate: new Date('2025-12-08'),
          status: 'APPROVED',
          reviewedBy: uuidv4(),
          reviewedAt: new Date()
        }),
        new LeaveRequest({
          ...validRequestData,
          id: uuidv4(),
          startDate: new Date('2025-12-12'),
          endDate: new Date('2025-12-18'),
          status: 'APPROVED',
          reviewedBy: uuidv4(),
          reviewedAt: new Date()
        }),
        new LeaveRequest({
          ...validRequestData,
          id: uuidv4(),
          startDate: new Date('2025-12-20'),
          endDate: new Date('2025-12-25'),
          status: 'DENIED',
          reviewedBy: uuidv4(),
          reviewedAt: new Date(),
          reviewNotes: 'Denied for testing'
        })
      ];
    });

    it('should detect overlapping requests', () => {
      const conflicts = baseRequest.checkDateConflict(existingRequests);
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].startDate).toEqual(new Date('2025-12-12'));
      expect(conflicts[0].endDate).toEqual(new Date('2025-12-18'));
    });

    it('should not include denied or cancelled requests as conflicts', () => {
      const conflicts = baseRequest.checkDateConflict(existingRequests);
      expect(conflicts.find(r => r.id === 'existing-3')).toBeUndefined();
    });

    it('should not include the same request as a conflict', () => {
      const sameRequest = new LeaveRequest({
        ...validRequestData,
        id: baseRequest.id,
        startDate: new Date('2025-12-10'),
        endDate: new Date('2025-12-15')
      });
      
      const conflicts = sameRequest.checkDateConflict([sameRequest]);
      expect(conflicts).toHaveLength(0);
    });
  });

  describe('isInBlackoutPeriod', () => {
    let request: LeaveRequest;
    let blackoutPeriods: { startDate: Date; endDate: Date; description: string }[];

    beforeEach(() => {
      request = new LeaveRequest({
        ...validRequestData,
        startDate: new Date('2025-12-20'),
        endDate: new Date('2025-12-25')
      });

      blackoutPeriods = [
        {
          startDate: new Date('2025-12-15'),
          endDate: new Date('2025-12-22'),
          description: 'Holiday blackout period'
        },
        {
          startDate: new Date('2025-12-30'),
          endDate: new Date('2026-01-05'),
          description: 'Year-end blackout period'
        }
      ];
    });

    it('should detect blackout period conflicts', () => {
      const result = request.isInBlackoutPeriod(blackoutPeriods);
      expect(result.isBlocked).toBe(true);
      expect(result.conflictingPeriods).toHaveLength(1);
      expect(result.conflictingPeriods[0].description).toBe('Holiday blackout period');
    });

    it('should return no conflicts when request is outside blackout periods', () => {
      const nonConflictingRequest = new LeaveRequest({
        ...validRequestData,
        startDate: new Date('2025-11-01'),
        endDate: new Date('2025-11-05')
      });

      const result = nonConflictingRequest.isInBlackoutPeriod(blackoutPeriods);
      expect(result.isBlocked).toBe(false);
      expect(result.conflictingPeriods).toHaveLength(0);
    });
  });

  describe('validateMaxConsecutiveDays', () => {
    it('should return true when within limit', () => {
      const request = new LeaveRequest({ ...validRequestData, totalDays: 5 });
      expect(request.validateMaxConsecutiveDays(10)).toBe(true);
    });

    it('should return false when exceeding limit', () => {
      const request = new LeaveRequest({ ...validRequestData, totalDays: 15 });
      expect(request.validateMaxConsecutiveDays(10)).toBe(false);
    });
  });

  describe('status methods', () => {
    it('should correctly identify pending status', () => {
      const request = new LeaveRequest({ ...validRequestData, status: 'PENDING' });
      expect(request.isPending()).toBe(true);
      expect(request.isApproved()).toBe(false);
      expect(request.isDenied()).toBe(false);
      expect(request.isCancelled()).toBe(false);
    });

    it('should correctly identify approved status', () => {
      const request = new LeaveRequest({
        ...validRequestData,
        status: 'APPROVED',
        reviewedBy: uuidv4(),
        reviewedAt: new Date()
      });
      expect(request.isApproved()).toBe(true);
      expect(request.isPending()).toBe(false);
    });
  });

  describe('approve', () => {
    it('should create approved request with reviewer information', () => {
      const request = new LeaveRequest(validRequestData);
      const managerId = uuidv4();
      const approved = request.approve(managerId, 'Approved for vacation');

      expect(approved.status).toBe('APPROVED');
      expect(approved.reviewedBy).toBe(managerId);
      expect(approved.reviewNotes).toBe('Approved for vacation');
      expect(approved.reviewedAt).toBeDefined();
    });
  });

  describe('deny', () => {
    it('should create denied request with reviewer information', () => {
      const request = new LeaveRequest(validRequestData);
      const managerId = uuidv4();
      const denied = request.deny(managerId, 'Insufficient coverage');

      expect(denied.status).toBe('DENIED');
      expect(denied.reviewedBy).toBe(managerId);
      expect(denied.reviewNotes).toBe('Insufficient coverage');
      expect(denied.reviewedAt).toBeDefined();
    });
  });

  describe('cancel', () => {
    it('should cancel pending request', () => {
      const request = new LeaveRequest(validRequestData);
      const cancelled = request.cancel();

      expect(cancelled.status).toBe('CANCELLED');
    });

    it('should throw error when trying to cancel non-pending request', () => {
      const approvedRequest = new LeaveRequest({
        ...validRequestData,
        status: 'APPROVED',
        reviewedBy: uuidv4(),
        reviewedAt: new Date()
      });

      expect(() => approvedRequest.cancel()).toThrow(ValidationError);
    });
  });

  describe('createNew', () => {
    it('should create new leave request with pending status', () => {
      const employeeId = uuidv4();
      const leaveTypeId = uuidv4();
      const request = LeaveRequest.createNew(
        employeeId,
        leaveTypeId,
        new Date('2025-12-01'),
        new Date('2025-12-05'),
        5,
        40,
        'Vacation'
      );

      expect(request.status).toBe('PENDING');
      expect(request.employeeId).toBe(employeeId);
      expect(request.totalDays).toBe(5);
      expect(request.reason).toBe('Vacation');
    });
  });
});