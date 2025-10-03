import { PolicyRepository } from '../../database/repositories/time-attendance/PolicyRepository';
import { LeavePolicy, EmployeeGroupData } from '../../models/time-attendance/Policy';
import { LeaveRequest } from '../../models/time-attendance/LeaveRequest';
import { AppError } from '../../utils/errors';

// Task 7.1: Policy Engine interfaces
export interface PolicyValidationResult {
  isValid: boolean;
  violations: string[];
  appliedPolicy?: LeavePolicy;
  recommendations?: string[];
}

export interface EmployeeEligibilityResult {
  isEligible: boolean;
  eligiblePolicies: LeavePolicy[];
  ineligiblePolicies: Array<{
    policy: LeavePolicy;
    reasons: string[];
  }>;
  recommendedPolicy?: LeavePolicy;
}

export interface PolicyRuleApplicationResult {
  policyId: string;
  policyName: string;
  rules: {
    ruleType: string;
    ruleValue: any;
    applied: boolean;
    result: string;
  }[];
  overallResult: 'PASS' | 'FAIL' | 'WARNING';
}

export interface LeaveRequestValidationInput {
  employeeId: string;
  leaveTypeId: string;
  startDate: Date;
  endDate: Date;
  totalDays: number;
  employeeData: EmployeeGroupData;
}

/**
 * PolicyEngine Service - Task 7.1
 * Handles leave policy enforcement, eligibility checking, and rule application
 */
export class PolicyEngine {
  constructor(private policyRepository: PolicyRepository) {}

  // ============================================================================
  // Task 7.1: Policy Validation Methods for Leave Requests
  // ============================================================================

  /**
   * Validate leave request against applicable policies
   */
  async validateLeaveRequest(
    input: LeaveRequestValidationInput,
    userContext?: string
  ): Promise<PolicyValidationResult> {
    const violations: string[] = [];
    const recommendations: string[] = [];

    // Find applicable policies for the leave type
    const policies = await this.policyRepository.findByLeaveType(
      input.leaveTypeId,
      userContext
    );

    if (policies.length === 0) {
      return {
        isValid: false,
        violations: ['No active policy found for this leave type'],
        recommendations: ['Contact HR to establish a leave policy for this leave type']
      };
    }

    // Find the policy that applies to this employee
    let applicablePolicy: LeavePolicy | undefined;

    for (const policy of policies) {
      const applicability = policy.isApplicableToEmployee(input.employeeData);

      if (applicability.isApplicable && applicability.isEligible) {
        applicablePolicy = policy;
        break;
      } else if (applicability.isApplicable && !applicability.isEligible) {
        violations.push(...applicability.reasons);
      }
    }

    if (!applicablePolicy) {
      return {
        isValid: false,
        violations: violations.length > 0
          ? violations
          : ['No applicable policy found for this employee'],
        recommendations: [
          'Verify employee eligibility criteria',
          'Check employment status and tenure requirements'
        ]
      };
    }

    // Validate usage rules
    const usageRestrictions = applicablePolicy.getUsageRestrictions();

    // Check max consecutive days
    if (usageRestrictions.maxConsecutiveDays && input.totalDays > usageRestrictions.maxConsecutiveDays) {
      violations.push(
        `Request exceeds maximum consecutive days limit of ${usageRestrictions.maxConsecutiveDays} days`
      );
      recommendations.push(
        `Consider splitting the request into multiple periods of ${usageRestrictions.maxConsecutiveDays} days or less`
      );
    }

    // Check advance notice requirement
    if (usageRestrictions.advanceNoticeDays) {
      const today = new Date();
      const daysDifference = Math.ceil((input.startDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

      if (daysDifference < usageRestrictions.advanceNoticeDays) {
        violations.push(
          `Request does not meet advance notice requirement of ${usageRestrictions.advanceNoticeDays} days (submitted ${daysDifference} days in advance)`
        );
        recommendations.push(
          `Submit leave requests at least ${usageRestrictions.advanceNoticeDays} days in advance`
        );
      }
    }

    // Check minimum increment
    if (usageRestrictions.minimumIncrement) {
      const remainder = input.totalDays % usageRestrictions.minimumIncrement;
      if (remainder !== 0) {
        violations.push(
          `Leave must be taken in increments of ${usageRestrictions.minimumIncrement} days`
        );
        recommendations.push(
          `Adjust request to ${Math.floor(input.totalDays / usageRestrictions.minimumIncrement) * usageRestrictions.minimumIncrement} or ${Math.ceil(input.totalDays / usageRestrictions.minimumIncrement) * usageRestrictions.minimumIncrement} days`
        );
      }
    }

    // Check blackout periods
    if (usageRestrictions.blackoutPeriods && usageRestrictions.blackoutPeriods.length > 0) {
      // Simplified check - in production would parse date ranges
      const hasBlackout = usageRestrictions.blackoutPeriods.some((period: string) => {
        // This is a simplified check
        return input.startDate.toISOString().includes(period);
      });

      if (hasBlackout) {
        violations.push('Request falls within a blackout period');
        recommendations.push('Choose alternative dates outside blackout periods');
      }
    }

    return {
      isValid: violations.length === 0,
      violations,
      appliedPolicy: applicablePolicy,
      recommendations: recommendations.length > 0 ? recommendations : undefined
    };
  }

  // ============================================================================
  // Task 7.1: Eligibility Checking Based on Employment Status and Tenure
  // ============================================================================

  /**
   * Check employee eligibility for leave policies
   */
  async checkEmployeeEligibility(
    employeeData: EmployeeGroupData,
    leaveTypeId?: string,
    userContext?: string
  ): Promise<EmployeeEligibilityResult> {
    const eligiblePolicies: LeavePolicy[] = [];
    const ineligiblePolicies: Array<{ policy: LeavePolicy; reasons: string[] }> = [];

    // Get all active leave policies
    let policies: LeavePolicy[];

    if (leaveTypeId) {
      policies = await this.policyRepository.findByLeaveType(leaveTypeId, userContext);
    } else {
      policies = await this.policyRepository.findActiveLeavePolicies(userContext);
    }

    // Check each policy
    for (const policy of policies) {
      const applicability = policy.isApplicableToEmployee(employeeData);

      if (applicability.isApplicable && applicability.isEligible) {
        eligiblePolicies.push(policy);
      } else if (applicability.isApplicable && !applicability.isEligible) {
        ineligiblePolicies.push({
          policy,
          reasons: applicability.reasons
        });
      }
    }

    // Determine recommended policy (most generous accrual rate)
    const recommendedPolicy = eligiblePolicies.reduce<LeavePolicy | undefined>((best, current) => {
      if (!best) return current;

      const bestRate = best.getApplicableAccrualRate(employeeData);
      const currentRate = current.getApplicableAccrualRate(employeeData);

      return currentRate > bestRate ? current : best;
    }, undefined);

    return {
      isEligible: eligiblePolicies.length > 0,
      eligiblePolicies,
      ineligiblePolicies,
      recommendedPolicy
    };
  }

  /**
   * Check if employee meets tenure requirements
   */
  checkTenureRequirement(
    employeeStartDate: Date,
    requiredTenureDays: number
  ): {
    meetsRequirement: boolean;
    currentTenureDays: number;
    daysRemaining: number;
  } {
    const today = new Date();
    const currentTenureDays = Math.floor(
      (today.getTime() - employeeStartDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    return {
      meetsRequirement: currentTenureDays >= requiredTenureDays,
      currentTenureDays,
      daysRemaining: Math.max(0, requiredTenureDays - currentTenureDays)
    };
  }

  /**
   * Check if employment type is eligible
   */
  checkEmploymentTypeEligibility(
    employeeType: string,
    eligibleTypes: string[]
  ): {
    isEligible: boolean;
    employeeType: string;
    eligibleTypes: string[];
  } {
    const normalizedEmployeeType = employeeType.toUpperCase();
    const normalizedEligibleTypes = eligibleTypes.map(t => t.toUpperCase());

    return {
      isEligible: normalizedEligibleTypes.includes(normalizedEmployeeType),
      employeeType,
      eligibleTypes
    };
  }

  // ============================================================================
  // Task 7.1: Policy Rule Application for Different Employee Groups
  // ============================================================================

  /**
   * Apply policy rules to specific employee group
   */
  async applyPolicyRulesToGroup(
    policyId: string,
    employeeGroup: EmployeeGroupData,
    userContext?: string
  ): Promise<PolicyRuleApplicationResult> {
    const policy = await this.policyRepository.findById(policyId, userContext);

    if (!policy) {
      throw new AppError(
        'Policy not found',
        'POLICY_NOT_FOUND',
        404,
        { policyId }
      );
    }

    if (!(policy instanceof LeavePolicy)) {
      throw new AppError(
        'Policy is not a leave policy',
        'INVALID_POLICY_TYPE',
        400,
        { policyId }
      );
    }

    const rules: PolicyRuleApplicationResult['rules'] = [];
    let overallResult: 'PASS' | 'FAIL' | 'WARNING' = 'PASS';

    // Check group applicability
    const isApplicable = policy.checkGroupApplicability(employeeGroup);
    rules.push({
      ruleType: 'GROUP_APPLICABILITY',
      ruleValue: policy.applicableGroups,
      applied: true,
      result: isApplicable
        ? 'Employee group is covered by this policy'
        : 'Employee group is not covered by this policy'
    });

    if (!isApplicable) {
      overallResult = 'FAIL';
    }

    // Check eligibility rules
    for (const eligibilityRule of policy.eligibilityRules) {
      let employeeValue: any;

      switch (eligibilityRule.ruleType) {
        case 'TENURE':
          employeeValue = employeeGroup.tenureDays;
          break;
        case 'EMPLOYMENT_TYPE':
          employeeValue = employeeGroup.employmentType;
          break;
        case 'DEPARTMENT':
          employeeValue = employeeGroup.departmentId;
          break;
        default:
          employeeValue = null;
      }

      const ruleResult = eligibilityRule.evaluate(employeeValue);

      rules.push({
        ruleType: eligibilityRule.ruleType,
        ruleValue: eligibilityRule.value,
        applied: true,
        result: ruleResult
          ? `✓ ${eligibilityRule.description}`
          : `✗ ${eligibilityRule.description} (employee value: ${employeeValue})`
      });

      if (!ruleResult) {
        overallResult = 'FAIL';
      }
    }

    // Check accrual rules
    for (const accrualRule of policy.accrualRules) {
      // Check waiting period
      if (accrualRule.waitingPeriodDays && employeeGroup.tenureDays < accrualRule.waitingPeriodDays) {
        rules.push({
          ruleType: 'WAITING_PERIOD',
          ruleValue: accrualRule.waitingPeriodDays,
          applied: true,
          result: `Employee has not completed waiting period (${employeeGroup.tenureDays}/${accrualRule.waitingPeriodDays} days)`
        });
        overallResult = overallResult === 'PASS' ? 'WARNING' : overallResult;
      } else {
        rules.push({
          ruleType: 'ACCRUAL_RATE',
          ruleValue: accrualRule.accrualRate,
          applied: true,
          result: `Accrues ${accrualRule.accrualRate} days per ${accrualRule.accrualPeriod.toLowerCase()}`
        });
      }
    }

    // Check usage rules
    const activeUsageRules = policy.usageRules.filter(rule => rule.isActive);
    for (const usageRule of activeUsageRules) {
      rules.push({
        ruleType: usageRule.ruleType,
        ruleValue: usageRule.value,
        applied: true,
        result: usageRule.description
      });
    }

    return {
      policyId: policy.id,
      policyName: policy.name,
      rules,
      overallResult
    };
  }

  /**
   * Get all applicable policies for employee
   */
  async getApplicablePoliciesForEmployee(
    employeeData: EmployeeGroupData,
    userContext?: string
  ): Promise<LeavePolicy[]> {
    const allPolicies = await this.policyRepository.findActiveLeavePolicies(userContext);

    const applicablePolicies = allPolicies.filter(policy => {
      const applicability = policy.isApplicableToEmployee(employeeData);
      return applicability.isApplicable && applicability.isEligible;
    });

    return applicablePolicies;
  }

  /**
   * Compare policies for employee
   */
  async comparePoliciesForEmployee(
    policyIds: string[],
    employeeData: EmployeeGroupData,
    userContext?: string
  ): Promise<{
    policies: Array<{
      policy: LeavePolicy;
      accrualRate: number;
      maxBalance?: number;
      carryoverLimit?: number;
      restrictions: any;
      applicability: ReturnType<LeavePolicy['isApplicableToEmployee']>;
    }>;
    recommendedPolicyId?: string;
  }> {
    const policies: Array<{
      policy: LeavePolicy;
      accrualRate: number;
      maxBalance?: number;
      carryoverLimit?: number;
      restrictions: any;
      applicability: ReturnType<LeavePolicy['isApplicableToEmployee']>;
    }> = [];

    for (const policyId of policyIds) {
      const policy = await this.policyRepository.findById(policyId, userContext);

      if (!policy || !(policy instanceof LeavePolicy)) continue;

      const applicability = policy.isApplicableToEmployee(employeeData);
      const accrualRule = policy.accrualRules[0]; // Simplified - take first rule

      policies.push({
        policy,
        accrualRate: policy.getApplicableAccrualRate(employeeData),
        maxBalance: accrualRule?.maxBalance,
        carryoverLimit: accrualRule?.carryoverLimit,
        restrictions: policy.getUsageRestrictions(),
        applicability
      });
    }

    // Find recommended policy (most generous eligible policy)
    const eligiblePolicies = policies.filter(p =>
      p.applicability.isApplicable && p.applicability.isEligible
    );

    const recommendedPolicy = eligiblePolicies.reduce<typeof policies[0] | undefined>(
      (best, current) => {
        if (!best) return current;
        return current.accrualRate > best.accrualRate ? current : best;
      },
      undefined
    );

    return {
      policies,
      recommendedPolicyId: recommendedPolicy?.policy.id
    };
  }

  /**
   * Get policy violations for leave request
   */
  async getPolicyViolations(
    leaveRequest: LeaveRequest,
    employeeData: EmployeeGroupData,
    userContext?: string
  ): Promise<string[]> {
    const validationResult = await this.validateLeaveRequest(
      {
        employeeId: leaveRequest.employeeId,
        leaveTypeId: leaveRequest.leaveTypeId,
        startDate: leaveRequest.startDate,
        endDate: leaveRequest.endDate,
        totalDays: leaveRequest.totalDays,
        employeeData
      },
      userContext
    );

    return validationResult.violations;
  }

  /**
   * Get policy recommendations for employee
   */
  async getPolicyRecommendations(
    employeeData: EmployeeGroupData,
    leaveTypeId: string,
    userContext?: string
  ): Promise<string[]> {
    const recommendations: string[] = [];

    const eligibility = await this.checkEmployeeEligibility(
      employeeData,
      leaveTypeId,
      userContext
    );

    if (!eligibility.isEligible) {
      recommendations.push('No eligible policies found for this leave type');

      if (eligibility.ineligiblePolicies.length > 0) {
        const mostCommonReason = eligibility.ineligiblePolicies[0].reasons[0];
        recommendations.push(`Common reason: ${mostCommonReason}`);
      }
    } else if (eligibility.recommendedPolicy) {
      const accrualRate = eligibility.recommendedPolicy.getApplicableAccrualRate(employeeData);
      recommendations.push(
        `Best policy: ${eligibility.recommendedPolicy.name} (${accrualRate} days accrual)`
      );

      const restrictions = eligibility.recommendedPolicy.getUsageRestrictions();
      if (restrictions.advanceNoticeDays) {
        recommendations.push(
          `Submit requests at least ${restrictions.advanceNoticeDays} days in advance`
        );
      }
    }

    return recommendations;
  }
}
