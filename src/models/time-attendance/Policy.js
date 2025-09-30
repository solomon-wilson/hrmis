import Joi from 'joi';
import { v4 as uuidv4 } from 'uuid';
import { validateAndThrow, ValidationError, requiredStringSchema, uuidSchema } from '../../utils/validation';
export class EligibilityRule {
    constructor(data) {
        this.validate(data);
        this.id = data.id || uuidv4();
        this.ruleType = data.ruleType;
        this.operator = data.operator;
        this.value = data.value;
        this.description = data.description.trim();
    }
    validate(data) {
        const schema = Joi.object({
            id: uuidSchema.optional(),
            ruleType: Joi.string().valid('TENURE', 'EMPLOYMENT_TYPE', 'DEPARTMENT', 'CUSTOM').required(),
            operator: Joi.string().valid('EQUALS', 'GREATER_THAN', 'LESS_THAN', 'IN', 'NOT_IN').required(),
            value: Joi.alternatives().try(Joi.string(), Joi.number()).required(),
            description: requiredStringSchema.max(500)
        });
        validateAndThrow(schema, data);
    }
    evaluate(employeeValue) {
        switch (this.operator) {
            case 'EQUALS':
                return employeeValue === this.value;
            case 'GREATER_THAN':
                return Number(employeeValue) > Number(this.value);
            case 'LESS_THAN':
                return Number(employeeValue) < Number(this.value);
            case 'IN':
                return String(this.value).split(',').includes(String(employeeValue));
            case 'NOT_IN':
                return !String(this.value).split(',').includes(String(employeeValue));
            default:
                return false;
        }
    }
    toJSON() {
        return {
            id: this.id,
            ruleType: this.ruleType,
            operator: this.operator,
            value: this.value,
            description: this.description
        };
    }
}
export class AccrualRule {
    constructor(data) {
        this.validate(data);
        this.id = data.id || uuidv4();
        this.accrualRate = data.accrualRate;
        this.accrualPeriod = data.accrualPeriod;
        this.maxBalance = data.maxBalance;
        this.carryoverLimit = data.carryoverLimit;
        this.waitingPeriodDays = data.waitingPeriodDays;
        this.description = data.description.trim();
        this.validateBusinessRules();
    }
    validate(data) {
        const schema = Joi.object({
            id: uuidSchema.optional(),
            accrualRate: Joi.number().min(0).required(),
            accrualPeriod: Joi.string().valid('MONTHLY', 'BIWEEKLY', 'ANNUAL', 'PER_PAY_PERIOD').required(),
            maxBalance: Joi.number().min(0).optional(),
            carryoverLimit: Joi.number().min(0).optional(),
            waitingPeriodDays: Joi.number().min(0).optional(),
            description: requiredStringSchema.max(500)
        });
        validateAndThrow(schema, data);
    }
    validateBusinessRules() {
        if (this.carryoverLimit && this.maxBalance && this.carryoverLimit > this.maxBalance) {
            throw new ValidationError('Carryover limit cannot exceed maximum balance', []);
        }
    }
    toJSON() {
        return {
            id: this.id,
            accrualRate: this.accrualRate,
            accrualPeriod: this.accrualPeriod,
            maxBalance: this.maxBalance,
            carryoverLimit: this.carryoverLimit,
            waitingPeriodDays: this.waitingPeriodDays,
            description: this.description
        };
    }
}
export class UsageRule {
    constructor(data) {
        this.validate(data);
        this.id = data.id || uuidv4();
        this.ruleType = data.ruleType;
        this.value = data.value;
        this.description = data.description.trim();
        this.isActive = data.isActive;
    }
    validate(data) {
        const schema = Joi.object({
            id: uuidSchema.optional(),
            ruleType: Joi.string().valid('MAX_CONSECUTIVE_DAYS', 'ADVANCE_NOTICE', 'BLACKOUT_PERIOD', 'MINIMUM_INCREMENT').required(),
            value: Joi.alternatives().try(Joi.string(), Joi.number()).required(),
            description: requiredStringSchema.max(500),
            isActive: Joi.boolean().required()
        });
        validateAndThrow(schema, data);
    }
    toJSON() {
        return {
            id: this.id,
            ruleType: this.ruleType,
            value: this.value,
            description: this.description,
            isActive: this.isActive
        };
    }
}
export class LeavePolicy {
    constructor(data) {
        this.validate(data);
        this.id = data.id || uuidv4();
        this.name = data.name.trim();
        this.leaveTypeId = data.leaveTypeId;
        this.eligibilityRules = data.eligibilityRules.map(rule => new EligibilityRule(rule));
        this.accrualRules = data.accrualRules.map(rule => new AccrualRule(rule));
        this.usageRules = data.usageRules.map(rule => new UsageRule(rule));
        this.effectiveDate = data.effectiveDate;
        this.endDate = data.endDate;
        this.applicableGroups = data.applicableGroups;
        this.description = data.description?.trim();
        this.isActive = data.isActive;
        this.createdAt = data.createdAt || new Date();
        this.updatedAt = data.updatedAt || new Date();
        this.validateBusinessRules();
    }
    validate(data) {
        const schema = Joi.object({
            id: uuidSchema.optional(),
            name: requiredStringSchema.max(200),
            leaveTypeId: uuidSchema,
            eligibilityRules: Joi.array().items(Joi.object()).required(),
            accrualRules: Joi.array().items(Joi.object()).required(),
            usageRules: Joi.array().items(Joi.object()).required(),
            effectiveDate: Joi.date().required(),
            endDate: Joi.date().optional(),
            applicableGroups: Joi.array().items(Joi.string()).required(),
            description: Joi.string().max(1000).optional(),
            isActive: Joi.boolean().required(),
            createdAt: Joi.date().optional(),
            updatedAt: Joi.date().optional()
        });
        validateAndThrow(schema, data);
    }
    validateBusinessRules() {
        if (this.endDate && this.effectiveDate >= this.endDate) {
            throw new ValidationError('End date must be after effective date', []);
        }
        if (this.accrualRules.length === 0) {
            throw new ValidationError('Policy must have at least one accrual rule', []);
        }
    }
    isEffective(date = new Date()) {
        if (!this.isActive)
            return false;
        if (date < this.effectiveDate)
            return false;
        if (this.endDate && date > this.endDate)
            return false;
        return true;
    }
    checkEligibility(employeeData) {
        return this.eligibilityRules.every(rule => {
            const employeeValue = employeeData[rule.ruleType.toLowerCase()];
            return rule.evaluate(employeeValue);
        });
    }
    checkGroupApplicability(employeeGroup) {
        // Check if policy applies to this employee's group/department
        if (this.applicableGroups.length === 0) {
            return true; // Universal policy
        }
        return this.applicableGroups.some(group => {
            // Check by department ID
            if (employeeGroup.departmentId === group)
                return true;
            // Check by employment type
            if (employeeGroup.employmentType === group)
                return true;
            // Check by job title pattern
            if (employeeGroup.jobTitle && employeeGroup.jobTitle.toLowerCase().includes(group.toLowerCase()))
                return true;
            return false;
        });
    }
    isApplicableToEmployee(employeeGroup) {
        const reasons = [];
        // Check if policy is currently effective
        if (!this.isEffective()) {
            reasons.push('Policy is not currently effective');
            return { isApplicable: false, isEligible: false, reasons };
        }
        // Check group applicability
        if (!this.checkGroupApplicability(employeeGroup)) {
            reasons.push('Employee is not in an applicable group for this policy');
            return { isApplicable: false, isEligible: false, reasons };
        }
        // Check eligibility rules
        const employeeData = {
            tenure: employeeGroup.tenureDays,
            employment_type: employeeGroup.employmentType,
            department: employeeGroup.departmentId,
            job_title: employeeGroup.jobTitle
        };
        const isEligible = this.checkEligibility(employeeData);
        if (!isEligible) {
            reasons.push('Employee does not meet eligibility requirements');
        }
        return {
            isApplicable: true,
            isEligible,
            reasons
        };
    }
    getApplicableAccrualRate(employeeGroup) {
        // Find the most appropriate accrual rule for this employee
        // For now, return the first accrual rule rate
        // In a more complex system, you might have different rates for different groups
        return this.accrualRules.length > 0 ? this.accrualRules[0].accrualRate : 0;
    }
    getUsageRestrictions() {
        const restrictions = {};
        this.usageRules.forEach(rule => {
            if (!rule.isActive)
                return;
            switch (rule.ruleType) {
                case 'MAX_CONSECUTIVE_DAYS':
                    restrictions.maxConsecutiveDays = Number(rule.value);
                    break;
                case 'ADVANCE_NOTICE':
                    restrictions.advanceNoticeDays = Number(rule.value);
                    break;
                case 'BLACKOUT_PERIOD':
                    restrictions.blackoutPeriods = String(rule.value).split(',');
                    break;
                case 'MINIMUM_INCREMENT':
                    restrictions.minimumIncrement = Number(rule.value);
                    break;
            }
        });
        return restrictions;
    }
    toJSON() {
        return {
            id: this.id,
            name: this.name,
            leaveTypeId: this.leaveTypeId,
            eligibilityRules: this.eligibilityRules.map(rule => rule.toJSON()),
            accrualRules: this.accrualRules.map(rule => rule.toJSON()),
            usageRules: this.usageRules.map(rule => rule.toJSON()),
            effectiveDate: this.effectiveDate,
            endDate: this.endDate,
            applicableGroups: this.applicableGroups,
            description: this.description,
            isActive: this.isActive,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt
        };
    }
}
export class OvertimePolicy {
    constructor(data) {
        this.validate(data);
        this.id = data.id || uuidv4();
        this.name = data.name.trim();
        this.dailyOvertimeThreshold = data.dailyOvertimeThreshold;
        this.weeklyOvertimeThreshold = data.weeklyOvertimeThreshold;
        this.overtimeMultiplier = data.overtimeMultiplier;
        this.doubleTimeThreshold = data.doubleTimeThreshold;
        this.doubleTimeMultiplier = data.doubleTimeMultiplier;
        this.applicableGroups = data.applicableGroups;
        this.effectiveDate = data.effectiveDate;
        this.endDate = data.endDate;
        this.description = data.description?.trim();
        this.isActive = data.isActive;
        this.createdAt = data.createdAt || new Date();
        this.updatedAt = data.updatedAt || new Date();
        this.validateBusinessRules();
    }
    validate(data) {
        const schema = Joi.object({
            id: uuidSchema.optional(),
            name: requiredStringSchema.max(200),
            dailyOvertimeThreshold: Joi.number().min(0).required(),
            weeklyOvertimeThreshold: Joi.number().min(0).required(),
            overtimeMultiplier: Joi.number().min(1).required(),
            doubleTimeThreshold: Joi.number().min(0).optional(),
            doubleTimeMultiplier: Joi.number().min(1).optional(),
            applicableGroups: Joi.array().items(Joi.string()).required(),
            effectiveDate: Joi.date().required(),
            endDate: Joi.date().optional(),
            description: Joi.string().max(1000).optional(),
            isActive: Joi.boolean().required(),
            createdAt: Joi.date().optional(),
            updatedAt: Joi.date().optional()
        });
        validateAndThrow(schema, data);
    }
    validateBusinessRules() {
        if (this.endDate && this.effectiveDate >= this.endDate) {
            throw new ValidationError('End date must be after effective date', []);
        }
        if (this.doubleTimeThreshold && this.doubleTimeThreshold <= this.dailyOvertimeThreshold) {
            throw new ValidationError('Double time threshold must be greater than daily overtime threshold', []);
        }
        if (this.doubleTimeMultiplier && this.doubleTimeMultiplier <= this.overtimeMultiplier) {
            throw new ValidationError('Double time multiplier must be greater than overtime multiplier', []);
        }
    }
    calculateOvertimeHours(dailyHours, weeklyHours) {
        let regularHours = dailyHours;
        let overtimeHours = 0;
        let doubleTimeHours = 0;
        // Calculate daily overtime
        if (dailyHours > this.dailyOvertimeThreshold) {
            const dailyOvertime = dailyHours - this.dailyOvertimeThreshold;
            if (this.doubleTimeThreshold && dailyHours > this.doubleTimeThreshold) {
                const dailyDoubleTime = dailyHours - this.doubleTimeThreshold;
                doubleTimeHours += dailyDoubleTime;
                overtimeHours += dailyOvertime - dailyDoubleTime;
            }
            else {
                overtimeHours += dailyOvertime;
            }
            regularHours = this.dailyOvertimeThreshold;
        }
        // Calculate weekly overtime (if applicable and greater than daily)
        if (weeklyHours > this.weeklyOvertimeThreshold) {
            const weeklyOvertime = weeklyHours - this.weeklyOvertimeThreshold;
            overtimeHours = Math.max(overtimeHours, weeklyOvertime);
        }
        return {
            regularHours: Math.max(0, regularHours - overtimeHours - doubleTimeHours),
            overtimeHours,
            doubleTimeHours
        };
    }
    isEffective(date = new Date()) {
        if (!this.isActive)
            return false;
        if (date < this.effectiveDate)
            return false;
        if (this.endDate && date > this.endDate)
            return false;
        return true;
    }
    checkGroupApplicability(employeeGroup) {
        // Check if overtime policy applies to this employee's group/department
        if (this.applicableGroups.length === 0) {
            return true; // Universal policy
        }
        return this.applicableGroups.some(group => {
            // Check by department ID
            if (employeeGroup.departmentId === group)
                return true;
            // Check by employment type
            if (employeeGroup.employmentType === group)
                return true;
            // Check by job title pattern
            if (employeeGroup.jobTitle && employeeGroup.jobTitle.toLowerCase().includes(group.toLowerCase()))
                return true;
            return false;
        });
    }
    isApplicableToEmployee(employeeGroup) {
        const reasons = [];
        // Check if policy is currently effective
        if (!this.isEffective()) {
            reasons.push('Overtime policy is not currently effective');
            return { isApplicable: false, reasons };
        }
        // Check group applicability
        if (!this.checkGroupApplicability(employeeGroup)) {
            reasons.push('Employee is not in an applicable group for this overtime policy');
            return { isApplicable: false, reasons };
        }
        return {
            isApplicable: true,
            reasons
        };
    }
    toJSON() {
        return {
            id: this.id,
            name: this.name,
            dailyOvertimeThreshold: this.dailyOvertimeThreshold,
            weeklyOvertimeThreshold: this.weeklyOvertimeThreshold,
            overtimeMultiplier: this.overtimeMultiplier,
            doubleTimeThreshold: this.doubleTimeThreshold,
            doubleTimeMultiplier: this.doubleTimeMultiplier,
            applicableGroups: this.applicableGroups,
            effectiveDate: this.effectiveDate,
            endDate: this.endDate,
            description: this.description,
            isActive: this.isActive,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt
        };
    }
}
