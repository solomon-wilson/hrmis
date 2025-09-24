import { EmployeeStatus, EmployeeStatusData, EmployeeStatusType } from './EmployeeStatus';
import { ValidationError } from '../utils/validation';

describe('EmployeeStatus Model', () => {
  const validStatusData: EmployeeStatusData = {
    current: 'ACTIVE',
    effectiveDate: new Date('2023-01-15')
  };

  describe('Constructor and Validation', () => {
    it('should create a valid active status', () => {
      const status = new EmployeeStatus(validStatusData);

      expect(status.current).toBe('ACTIVE');
      expect(status.effectiveDate).toEqual(new Date('2023-01-15'));
      expect(status.reason).toBeUndefined();
      expect(status.notes).toBeUndefined();
    });

    it('should create a valid status with reason and notes', () => {
      const statusWithDetails: EmployeeStatusData = {
        current: 'TERMINATED',
        effectiveDate: new Date('2023-06-30'),
        reason: 'Voluntary resignation',
        notes: 'Employee accepted position at another company'
      };

      const status = new EmployeeStatus(statusWithDetails);

      expect(status.current).toBe('TERMINATED');
      expect(status.reason).toBe('Voluntary resignation');
      expect(status.notes).toBe('Employee accepted position at another company');
    });

    it('should trim reason and notes', () => {
      const statusWithWhitespace: EmployeeStatusData = {
        current: 'ON_LEAVE',
        effectiveDate: new Date(),
        reason: '  Medical leave  ',
        notes: '  Doctor recommended rest  '
      };

      const status = new EmployeeStatus(statusWithWhitespace);

      expect(status.reason).toBe('Medical leave');
      expect(status.notes).toBe('Doctor recommended rest');
    });

    it('should throw ValidationError for invalid status type', () => {
      const invalidData = {
        ...validStatusData,
        current: 'INVALID_STATUS' as EmployeeStatusType
      };

      expect(() => new EmployeeStatus(invalidData)).toThrow(ValidationError);
    });

    it('should throw ValidationError for missing effective date', () => {
      const invalidData = { ...validStatusData };
      delete (invalidData as any).effectiveDate;

      expect(() => new EmployeeStatus(invalidData)).toThrow(ValidationError);
    });

    it('should throw ValidationError for invalid effective date', () => {
      const invalidData = {
        ...validStatusData,
        effectiveDate: 'invalid-date' as any
      };

      expect(() => new EmployeeStatus(invalidData)).toThrow(ValidationError);
    });

    it('should throw ValidationError for reason exceeding max length', () => {
      const longReason = 'a'.repeat(501); // Exceeds 500 character limit
      const invalidData = {
        ...validStatusData,
        current: 'TERMINATED' as EmployeeStatusType,
        reason: longReason
      };

      expect(() => new EmployeeStatus(invalidData)).toThrow(ValidationError);
    });

    it('should throw ValidationError for notes exceeding max length', () => {
      const longNotes = 'a'.repeat(1001); // Exceeds 1000 character limit
      const invalidData = {
        ...validStatusData,
        notes: longNotes
      };

      expect(() => new EmployeeStatus(invalidData)).toThrow(ValidationError);
    });
  });

  describe('Business Rule Validation', () => {
    it('should throw ValidationError for terminated status without reason', () => {
      const invalidData: EmployeeStatusData = {
        current: 'TERMINATED',
        effectiveDate: new Date()
      };

      expect(() => new EmployeeStatus(invalidData)).toThrow(ValidationError);
      expect(() => new EmployeeStatus(invalidData)).toThrow('Termination reason is required');
    });

    it('should throw ValidationError for on leave status without reason', () => {
      const invalidData: EmployeeStatusData = {
        current: 'ON_LEAVE',
        effectiveDate: new Date()
      };

      expect(() => new EmployeeStatus(invalidData)).toThrow(ValidationError);
      expect(() => new EmployeeStatus(invalidData)).toThrow('Leave reason is required');
    });

    it('should throw ValidationError for effective date in the future', () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);

      const invalidData: EmployeeStatusData = {
        current: 'ACTIVE',
        effectiveDate: futureDate
      };

      expect(() => new EmployeeStatus(invalidData)).toThrow(ValidationError);
      expect(() => new EmployeeStatus(invalidData)).toThrow('Effective date cannot be in the future');
    });

    it('should accept terminated status with reason', () => {
      const validData: EmployeeStatusData = {
        current: 'TERMINATED',
        effectiveDate: new Date(),
        reason: 'End of contract'
      };

      expect(() => new EmployeeStatus(validData)).not.toThrow();
    });

    it('should accept on leave status with reason', () => {
      const validData: EmployeeStatusData = {
        current: 'ON_LEAVE',
        effectiveDate: new Date(),
        reason: 'Parental leave'
      };

      expect(() => new EmployeeStatus(validData)).not.toThrow();
    });

    it('should accept active and inactive status without reason', () => {
      const activeData: EmployeeStatusData = {
        current: 'ACTIVE',
        effectiveDate: new Date()
      };

      const inactiveData: EmployeeStatusData = {
        current: 'INACTIVE',
        effectiveDate: new Date()
      };

      expect(() => new EmployeeStatus(activeData)).not.toThrow();
      expect(() => new EmployeeStatus(inactiveData)).not.toThrow();
    });
  });

  describe('Update Method', () => {
    it('should update status with new data', () => {
      const originalStatus = new EmployeeStatus(validStatusData);
      const updates = {
        current: 'TERMINATED' as EmployeeStatusType,
        reason: 'Layoff',
        notes: 'Position eliminated due to restructuring'
      };

      const updatedStatus = originalStatus.update(updates);

      expect(updatedStatus.current).toBe('TERMINATED');
      expect(updatedStatus.reason).toBe('Layoff');
      expect(updatedStatus.notes).toBe('Position eliminated due to restructuring');
      expect(updatedStatus.effectiveDate).toEqual(originalStatus.effectiveDate); // Should remain unchanged
    });

    it('should validate updated data', () => {
      const originalStatus = new EmployeeStatus(validStatusData);
      const invalidUpdates = {
        current: 'TERMINATED' as EmployeeStatusType
        // Missing required reason for terminated status
      };

      expect(() => originalStatus.update(invalidUpdates)).toThrow(ValidationError);
    });
  });

  describe('Status Check Methods', () => {
    it('should correctly identify active status', () => {
      const activeStatus = new EmployeeStatus({ current: 'ACTIVE', effectiveDate: new Date() });
      expect(activeStatus.isActive()).toBe(true);
      expect(activeStatus.isTerminated()).toBe(false);
      expect(activeStatus.isOnLeave()).toBe(false);
      expect(activeStatus.isInactive()).toBe(false);
    });

    it('should correctly identify terminated status', () => {
      const terminatedStatus = new EmployeeStatus({
        current: 'TERMINATED',
        effectiveDate: new Date(),
        reason: 'Resignation'
      });
      expect(terminatedStatus.isTerminated()).toBe(true);
      expect(terminatedStatus.isActive()).toBe(false);
      expect(terminatedStatus.isOnLeave()).toBe(false);
      expect(terminatedStatus.isInactive()).toBe(false);
    });

    it('should correctly identify on leave status', () => {
      const onLeaveStatus = new EmployeeStatus({
        current: 'ON_LEAVE',
        effectiveDate: new Date(),
        reason: 'Medical leave'
      });
      expect(onLeaveStatus.isOnLeave()).toBe(true);
      expect(onLeaveStatus.isActive()).toBe(false);
      expect(onLeaveStatus.isTerminated()).toBe(false);
      expect(onLeaveStatus.isInactive()).toBe(false);
    });

    it('should correctly identify inactive status', () => {
      const inactiveStatus = new EmployeeStatus({ current: 'INACTIVE', effectiveDate: new Date() });
      expect(inactiveStatus.isInactive()).toBe(true);
      expect(inactiveStatus.isActive()).toBe(false);
      expect(inactiveStatus.isTerminated()).toBe(false);
      expect(inactiveStatus.isOnLeave()).toBe(false);
    });
  });

  describe('Static Factory Methods', () => {
    it('should create active status with createActive', () => {
      const status = EmployeeStatus.createActive();
      expect(status.current).toBe('ACTIVE');
      expect(status.effectiveDate).toBeInstanceOf(Date);
      expect(status.reason).toBeUndefined();
      expect(status.notes).toBeUndefined();
    });

    it('should create active status with custom effective date', () => {
      const customDate = new Date('2023-03-15');
      const status = EmployeeStatus.createActive(customDate);
      expect(status.current).toBe('ACTIVE');
      expect(status.effectiveDate).toEqual(customDate);
    });

    it('should create terminated status with createTerminated', () => {
      const reason = 'End of probation period';
      const notes = 'Performance did not meet expectations';
      const status = EmployeeStatus.createTerminated(reason, new Date(), notes);

      expect(status.current).toBe('TERMINATED');
      expect(status.reason).toBe(reason);
      expect(status.notes).toBe(notes);
      expect(status.effectiveDate).toBeInstanceOf(Date);
    });

    it('should create on leave status with createOnLeave', () => {
      const reason = 'Maternity leave';
      const notes = 'Expected return date: 2024-01-15';
      const status = EmployeeStatus.createOnLeave(reason, new Date(), notes);

      expect(status.current).toBe('ON_LEAVE');
      expect(status.reason).toBe(reason);
      expect(status.notes).toBe(notes);
      expect(status.effectiveDate).toBeInstanceOf(Date);
    });

    it('should create inactive status with createInactive', () => {
      const reason = 'Temporary suspension';
      const status = EmployeeStatus.createInactive(reason);

      expect(status.current).toBe('INACTIVE');
      expect(status.reason).toBe(reason);
      expect(status.effectiveDate).toBeInstanceOf(Date);
    });

    it('should create inactive status without reason', () => {
      const status = EmployeeStatus.createInactive();

      expect(status.current).toBe('INACTIVE');
      expect(status.reason).toBeUndefined();
      expect(status.effectiveDate).toBeInstanceOf(Date);
    });
  });

  describe('Status Transition Validation', () => {
    it('should allow valid transitions from ACTIVE status', () => {
      const activeStatus = new EmployeeStatus({ current: 'ACTIVE', effectiveDate: new Date() });
      
      expect(activeStatus.canTransitionTo('INACTIVE')).toBe(true);
      expect(activeStatus.canTransitionTo('ON_LEAVE')).toBe(true);
      expect(activeStatus.canTransitionTo('TERMINATED')).toBe(true);
      expect(activeStatus.canTransitionTo('ACTIVE')).toBe(false); // Same status
    });

    it('should allow valid transitions from INACTIVE status', () => {
      const inactiveStatus = new EmployeeStatus({ current: 'INACTIVE', effectiveDate: new Date() });
      
      expect(inactiveStatus.canTransitionTo('ACTIVE')).toBe(true);
      expect(inactiveStatus.canTransitionTo('TERMINATED')).toBe(true);
      expect(inactiveStatus.canTransitionTo('ON_LEAVE')).toBe(false);
      expect(inactiveStatus.canTransitionTo('INACTIVE')).toBe(false); // Same status
    });

    it('should allow valid transitions from ON_LEAVE status', () => {
      const onLeaveStatus = new EmployeeStatus({ 
        current: 'ON_LEAVE', 
        effectiveDate: new Date(),
        reason: 'Medical leave'
      });
      
      expect(onLeaveStatus.canTransitionTo('ACTIVE')).toBe(true);
      expect(onLeaveStatus.canTransitionTo('INACTIVE')).toBe(true);
      expect(onLeaveStatus.canTransitionTo('TERMINATED')).toBe(true);
      expect(onLeaveStatus.canTransitionTo('ON_LEAVE')).toBe(false); // Same status
    });

    it('should not allow any transitions from TERMINATED status', () => {
      const terminatedStatus = new EmployeeStatus({ 
        current: 'TERMINATED', 
        effectiveDate: new Date(),
        reason: 'Resignation'
      });
      
      expect(terminatedStatus.canTransitionTo('ACTIVE')).toBe(false);
      expect(terminatedStatus.canTransitionTo('INACTIVE')).toBe(false);
      expect(terminatedStatus.canTransitionTo('ON_LEAVE')).toBe(false);
      expect(terminatedStatus.canTransitionTo('TERMINATED')).toBe(false);
    });

    it('should validate transition and throw error for invalid transition', () => {
      const terminatedStatus = new EmployeeStatus({ 
        current: 'TERMINATED', 
        effectiveDate: new Date(),
        reason: 'Resignation'
      });
      
      expect(() => terminatedStatus.validateTransitionTo('ACTIVE')).toThrow(ValidationError);
      expect(() => terminatedStatus.validateTransitionTo('ACTIVE')).toThrow('Invalid status transition from TERMINATED to ACTIVE');
    });

    it('should validate transition and not throw error for valid transition', () => {
      const activeStatus = new EmployeeStatus({ current: 'ACTIVE', effectiveDate: new Date() });
      
      expect(() => activeStatus.validateTransitionTo('ON_LEAVE')).not.toThrow();
    });

    it('should test static isValidTransition method', () => {
      expect(EmployeeStatus.isValidTransition('ACTIVE', 'ON_LEAVE')).toBe(true);
      expect(EmployeeStatus.isValidTransition('ACTIVE', 'TERMINATED')).toBe(true);
      expect(EmployeeStatus.isValidTransition('TERMINATED', 'ACTIVE')).toBe(false);
      expect(EmployeeStatus.isValidTransition('INACTIVE', 'ON_LEAVE')).toBe(false);
    });
  });

  describe('JSON Serialization', () => {
    it('should serialize to JSON correctly', () => {
      const statusData: EmployeeStatusData = {
        current: 'ON_LEAVE',
        effectiveDate: new Date('2023-05-01'),
        reason: 'Sick leave',
        notes: 'Doctor recommended 2 weeks rest'
      };

      const status = new EmployeeStatus(statusData);
      const json = status.toJSON();

      expect(json.current).toBe('ON_LEAVE');
      expect(json.effectiveDate).toEqual(new Date('2023-05-01'));
      expect(json.reason).toBe('Sick leave');
      expect(json.notes).toBe('Doctor recommended 2 weeks rest');
    });

    it('should round-trip through JSON correctly', () => {
      const originalData: EmployeeStatusData = {
        current: 'TERMINATED',
        effectiveDate: new Date('2023-12-31'),
        reason: 'Retirement',
        notes: 'After 30 years of service'
      };

      const originalStatus = new EmployeeStatus(originalData);
      const json = originalStatus.toJSON();
      const recreatedStatus = new EmployeeStatus(json);

      expect(recreatedStatus.current).toBe(originalStatus.current);
      expect(recreatedStatus.effectiveDate).toEqual(originalStatus.effectiveDate);
      expect(recreatedStatus.reason).toBe(originalStatus.reason);
      expect(recreatedStatus.notes).toBe(originalStatus.notes);
    });
  });
});