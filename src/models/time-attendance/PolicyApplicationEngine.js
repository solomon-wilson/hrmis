export class PolicyApplicationEngine {
    /**
     * Find all applicable leave policies for an employee
     */
    static findApplicableLeavePolicies(policies, employeeGroup, leaveTypeId) {
        const applicable = [];
        const ineligible = [];
        for (const policy of policies) {
            // Filter by leave type if specified
            if (leaveTypeId && policy.leaveTypeId !== leaveTypeId) {
                continue;
            }
            const result = policy.isApplicableToEmployee(employeeGroup);
            if (result.isApplicable && result.isEligible) {
                applicable.push(policy);
            }
            else if (result.isApplicable) {
                ineligible.push({ policy, reasons: result.reasons });
            }
        }
        return { applicable, ineligible };
    }
    /**
     * Find the most appropriate leave policy for an employee and leave type
     */
    static findBestLeavePolicyMatch(policies, employeeGroup, leaveTypeId) {
        const { applicable } = this.findApplicableLeavePolicies(policies, employeeGroup, leaveTypeId);
        if (applicable.length === 0) {
            return null;
        }
        // Sort by specificity (more specific policies first)
        // Policies with more eligibility rules are considered more specific
        return applicable.sort((a, b) => {
            const aSpecificity = a.eligibilityRules.length + a.applicableGroups.length;
            const bSpecificity = b.eligibilityRules.length + b.applicableGroups.length;
            return bSpecificity - aSpecificity;
        })[0];
    }
    /**
     * Find applicable overtime policy for an employee
     */
    static findApplicableOvertimePolicy(policies, employeeGroup) {
        for (const policy of policies) {
            const result = policy.isApplicableToEmployee(employeeGroup);
            if (result.isApplicable) {
                return policy;
            }
        }
        return null;
    }
    /**
     * Validate if an employee can use a specific leave policy
     */
    static validatePolicyUsage(policy, employeeGroup, requestedDays, requestDate = new Date()) {
        const violations = [];
        const warnings = [];
        // Check if policy is applicable
        const applicabilityResult = policy.isApplicableToEmployee(employeeGroup);
        if (!applicabilityResult.isApplicable || !applicabilityResult.isEligible) {
            violations.push(...applicabilityResult.reasons);
            return { isValid: false, violations, warnings };
        }
        // Check usage restrictions
        const restrictions = policy.getUsageRestrictions();
        // Check maximum consecutive days
        if (restrictions.maxConsecutiveDays && requestedDays > restrictions.maxConsecutiveDays) {
            violations.push(`Requested ${requestedDays} days exceeds maximum consecutive days limit of ${restrictions.maxConsecutiveDays}`);
        }
        // Check minimum increment
        if (restrictions.minimumIncrement && requestedDays % restrictions.minimumIncrement !== 0) {
            violations.push(`Requested days must be in increments of ${restrictions.minimumIncrement}`);
        }
        // Check advance notice (warning only)
        if (restrictions.advanceNoticeDays) {
            const daysDifference = Math.ceil((requestDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
            if (daysDifference < restrictions.advanceNoticeDays) {
                warnings.push(`Advance notice of ${restrictions.advanceNoticeDays} days is recommended`);
            }
        }
        return {
            isValid: violations.length === 0,
            violations,
            warnings
        };
    }
    /**
     * Get all policies that apply to a specific employee group
     */
    static getEmployeeGroupPolicies(leavePolicies, overtimePolicies, employeeGroup) {
        const { applicable: applicableLeavePolicies } = this.findApplicableLeavePolicies(leavePolicies, employeeGroup);
        const overtimePolicy = this.findApplicableOvertimePolicy(overtimePolicies, employeeGroup);
        return {
            leavePolicies: applicableLeavePolicies,
            overtimePolicy
        };
    }
    /**
     * Validate multiple leave policies against employee group requirements
     */
    static validatePolicyConfiguration(policies, employeeGroups) {
        const conflicts = [];
        const coverage = [];
        const gaps = [];
        // Check for policy conflicts (same leave type, overlapping groups)
        for (let i = 0; i < policies.length; i++) {
            for (let j = i + 1; j < policies.length; j++) {
                const policy1 = policies[i];
                const policy2 = policies[j];
                if (policy1.leaveTypeId === policy2.leaveTypeId) {
                    // Check if they have overlapping applicable groups
                    const hasOverlap = policy1.applicableGroups.some(group => policy2.applicableGroups.includes(group));
                    if (hasOverlap || (policy1.applicableGroups.length === 0 || policy2.applicableGroups.length === 0)) {
                        conflicts.push({
                            policy1,
                            policy2,
                            reason: `Both policies apply to the same leave type (${policy1.leaveTypeId}) and have overlapping groups`
                        });
                    }
                }
            }
        }
        // Check coverage for each employee group
        for (const employeeGroup of employeeGroups) {
            const { applicable } = this.findApplicableLeavePolicies(policies, employeeGroup);
            const coveredLeaveTypes = [...new Set(applicable.map(p => p.leaveTypeId))];
            coverage.push({
                employeeGroup,
                coveredLeaveTypes
            });
            // For now, we assume there should be coverage for basic leave types
            // In a real system, this would be configurable
            const expectedLeaveTypes = ['VACATION', 'SICK', 'PERSONAL'];
            const uncoveredLeaveTypes = expectedLeaveTypes.filter(type => !coveredLeaveTypes.includes(type));
            if (uncoveredLeaveTypes.length > 0) {
                gaps.push({
                    employeeGroup,
                    uncoveredLeaveTypes
                });
            }
        }
        return { conflicts, coverage, gaps };
    }
    /**
     * Calculate policy impact for an employee group
     */
    static calculatePolicyImpact(policy, employeeGroups) {
        const affectedEmployees = [];
        const eligibleEmployees = [];
        const ineligibleEmployees = [];
        for (const employeeGroup of employeeGroups) {
            if (policy.checkGroupApplicability(employeeGroup)) {
                affectedEmployees.push(employeeGroup);
                const result = policy.isApplicableToEmployee(employeeGroup);
                if (result.isEligible) {
                    eligibleEmployees.push(employeeGroup);
                }
                else {
                    ineligibleEmployees.push({
                        employee: employeeGroup,
                        reasons: result.reasons
                    });
                }
            }
        }
        return {
            affectedEmployees,
            eligibleEmployees,
            ineligibleEmployees
        };
    }
}
