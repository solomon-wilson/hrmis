import {
  LeavePolicy,
  OvertimePolicy,
  EligibilityRule,
  AccrualRule,
  UsageRule,
  LeavePolicyData,
  OvertimePolicyData,
  EligibilityRuleData,
  AccrualRuleData,
  UsageRuleData,
  EmployeeGroupData
} from './Policy';
import { PolicyApplicationEngine } from './PolicyApplicationEngine';
import { ValidationError } from '../../utils/validation';

describe('EligibilityRule', () => {
  const validRuleData: EligibilityRuleData = {
    ruleType: 'TENURE',
    operator: 'GREATER_THAN',
    value: 90,
    description: 'Must have 90+ days tenure'
  };

  describe('constructor', () => {
    it('should create a valid eligibility rule', () => {
      const rule = new EligibilityRule(validRuleData);
      expect(rule.ruleType).toBe('TENURE');
      expect(rule.operator).toBe('GREATER_THAN');
      expect(rule.value).toBe(90);
    });

    it('should throw validation error for invalid rule type', () => {
      const invalidData = { ...validRuleData, ruleType: 'INVALID' as any };
      expect(() => new EligibilityRule(invalidData)).toThrow(ValidationError);
    });
  });

  describe('checkEligibility', () => {
    it('should return true for tenure greater than threshold', () => {
      const rule = new EligibilityRule(validRuleData);
      const employeeData: EmployeeGroupData = {
        id: '1',
        name: 'John Doe',
        department: 'Engineering',
        position: 'Developer',
        hireDate: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000), // 100 days ago
        employmentType: 'FULL_TIME',
        groups: ['ENGINEERING']
      };
      expect(rule.checkEligibility(employeeData)).toBe(true);
    });

    it('should return false for tenure less than threshold', () => {
      const rule = new EligibilityRule(validRuleData);
      const employeeData: EmployeeGroupData = {
        id: '1',
        name: 'John Doe',
        department: 'Engineering',
        position: 'Developer',
        hireDate: new Date(Date.now() - 80 * 24 * 60 * 60 * 1000), // 80 days ago
        employmentType: 'FULL_TIME',
        groups: ['ENGINEERING']
      };
      expect(rule.checkEligibility(employeeData)).toBe(false);
    });
  });
});

describe('LeavePolicy', () => {
  const validPolicyData: LeavePolicyData = {
    id: 'policy-1',
    name: 'Annual Leave Policy',
    description: 'Standard annual leave policy',
    leaveTypeId: 'VACATION',
    isActive: true,
    applicableGroups: ['FULL_TIME'],
    eligibilityRules: [],
    accrualRules: [],
    usageRules: []
  };

  const employeeData: EmployeeGroupData = {
    id: '1',
    name: 'John Doe',
    department: 'Engineering',
    position: 'Developer',
    hireDate: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000), // 1 year ago
    employmentType: 'FULL_TIME',
    groups: ['FULL_TIME', 'ENGINEERING']
  };

  describe('checkGroupApplicability', () => {
    it('should return true when employee group matches policy groups', () => {
      const policy = new LeavePolicy(validPolicyData);
      expect(policy.checkGroupApplicability(employeeData)).toBe(true);
    });

    it('should return false when employee group does not match policy groups', () => {
      const policyData = { ...validPolicyData, applicableGroups: ['PART_TIME'] };
      const policy = new LeavePolicy(policyData);
      expect(policy.checkGroupApplicability(employeeData)).toBe(false);
    });

    it('should return true when policy has no group restrictions', () => {
      const policyData = { ...validPolicyData, applicableGroups: [] };
      const policy = new LeavePolicy(policyData);
      expect(policy.checkGroupApplicability(employeeData)).toBe(true);
    });
  });

  describe('isApplicableToEmployee', () => {
    it('should return applicable and eligible for matching employee', () => {
      const policy = new LeavePolicy(validPolicyData);
      const result = policy.isApplicableToEmployee(employeeData);

      expect(result.isApplicable).toBe(true);
      expect(result.isEligible).toBe(true);
      expect(result.reasons).toEqual([]);
    });

    it('should return not applicable for non-matching group', () => {
      const policyData = { ...validPolicyData, applicableGroups: ['PART_TIME'] };
      const policy = new LeavePolicy(policyData);
      const result = policy.isApplicableToEmployee(employeeData);

      expect(result.isApplicable).toBe(false);
      expect(result.isEligible).toBe(false);
      expect(result.reasons).toContain('Employee group does not match policy requirements');
    });

    it('should return applicable but not eligible when eligibility rules fail', () => {
      const eligibilityRule: EligibilityRuleData = {
        ruleType: 'TENURE',
        operator: 'GREATER_THAN',
        value: 730, // 2 years
        description: 'Must have 2+ years tenure'
      };
      const policyData = { ...validPolicyData, eligibilityRules: [eligibilityRule] };
      const policy = new LeavePolicy(policyData);
      const result = policy.isApplicableToEmployee(employeeData);

      expect(result.isApplicable).toBe(true);
      expect(result.isEligible).toBe(false);
      expect(result.reasons).toContain('Must have 2+ years tenure');
    });
  });

  describe('getApplicableAccrualRate', () => {
    it('should return first matching accrual rate', () => {
      const accrualRule: AccrualRuleData = {
        frequency: 'MONTHLY',
        amount: 2.0,
        maxBalance: 30,
        carryoverLimit: 5,
        conditions: []
      };
      const policyData = { ...validPolicyData, accrualRules: [accrualRule] };
      const policy = new LeavePolicy(policyData);

      const rate = policy.getApplicableAccrualRate(employeeData);
      expect(rate?.amount).toBe(2.0);
      expect(rate?.frequency).toBe('MONTHLY');
    });

    it('should return null when no accrual rules exist', () => {
      const policy = new LeavePolicy(validPolicyData);
      const rate = policy.getApplicableAccrualRate(employeeData);
      expect(rate).toBeNull();
    });
  });
});

describe('PolicyApplicationEngine', () => {
  const createPolicy = (id: string, leaveTypeId: string, groups: string[] = []): LeavePolicy => {
    return new LeavePolicy({
      id,
      name: `Policy ${id}`,
      description: `Test policy ${id}`,
      leaveTypeId,
      isActive: true,
      applicableGroups: groups,
      eligibilityRules: [],
      accrualRules: [],
      usageRules: []
    });
  };

  const employeeData: EmployeeGroupData = {
    id: '1',
    name: 'John Doe',
    department: 'Engineering',
    position: 'Developer',
    hireDate: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
    employmentType: 'FULL_TIME',
    groups: ['FULL_TIME', 'ENGINEERING']
  };

  describe('findApplicableLeavePolicies', () => {
    it('should find applicable policies for employee', () => {
      const policies = [
        createPolicy('1', 'VACATION', ['FULL_TIME']),
        createPolicy('2', 'SICK', ['FULL_TIME']),
        createPolicy('3', 'VACATION', ['PART_TIME'])
      ];

      const result = PolicyApplicationEngine.findApplicableLeavePolicies(policies, employeeData);

      expect(result.applicable).toHaveLength(2);
      expect(result.applicable.map(p => p.id)).toEqual(['1', '2']);
      expect(result.ineligible).toHaveLength(0);
    });

    it('should filter by leave type when specified', () => {
      const policies = [
        createPolicy('1', 'VACATION', ['FULL_TIME']),
        createPolicy('2', 'SICK', ['FULL_TIME'])
      ];

      const result = PolicyApplicationEngine.findApplicableLeavePolicies(policies, employeeData, 'VACATION');

      expect(result.applicable).toHaveLength(1);
      expect(result.applicable[0].id).toBe('1');
    });
  });

  describe('findBestLeavePolicyMatch', () => {
    it('should return most specific policy', () => {
      const policies = [
        createPolicy('1', 'VACATION', []), // Less specific
        createPolicy('2', 'VACATION', ['FULL_TIME', 'ENGINEERING']) // More specific
      ];

      const result = PolicyApplicationEngine.findBestLeavePolicyMatch(policies, employeeData, 'VACATION');

      expect(result?.id).toBe('2');
    });

    it('should return null when no policies match', () => {
      const policies = [createPolicy('1', 'VACATION', ['PART_TIME'])];

      const result = PolicyApplicationEngine.findBestLeavePolicyMatch(policies, employeeData, 'VACATION');

      expect(result).toBeNull();
    });
  });

  describe('validatePolicyUsage', () => {
    it('should validate successful policy usage', () => {
      const policy = createPolicy('1', 'VACATION', ['FULL_TIME']);

      const result = PolicyApplicationEngine.validatePolicyUsage(policy, employeeData, 5);

      expect(result.isValid).toBe(true);
      expect(result.violations).toEqual([]);
      expect(result.warnings).toEqual([]);
    });

    it('should detect violations for non-applicable policy', () => {
      const policy = createPolicy('1', 'VACATION', ['PART_TIME']);

      const result = PolicyApplicationEngine.validatePolicyUsage(policy, employeeData, 5);

      expect(result.isValid).toBe(false);
      expect(result.violations).toContain('Employee group does not match policy requirements');
    });
  });

  describe('validatePolicyConfiguration', () => {
    it('should detect policy conflicts', () => {
      const policies = [
        createPolicy('1', 'VACATION', ['FULL_TIME']),
        createPolicy('2', 'VACATION', ['FULL_TIME']) // Conflict
      ];
      const employeeGroups = [employeeData];

      const result = PolicyApplicationEngine.validatePolicyConfiguration(policies, employeeGroups);

      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].reason).toContain('overlapping groups');
    });

    it('should identify coverage gaps', () => {
      const policies = [createPolicy('1', 'VACATION', ['FULL_TIME'])]; // Missing SICK
      const employeeGroups = [employeeData];

      const result = PolicyApplicationEngine.validatePolicyConfiguration(policies, employeeGroups);

      expect(result.gaps).toHaveLength(1);
      expect(result.gaps[0].uncoveredLeaveTypes).toContain('SICK');
      expect(result.gaps[0].uncoveredLeaveTypes).toContain('PERSONAL');
    });
  });
});
 