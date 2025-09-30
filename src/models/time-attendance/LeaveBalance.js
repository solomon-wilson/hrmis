import Joi from 'joi';
import { v4 as uuidv4 } from 'uuid';
import { validateAndThrow, ValidationError, uuidSchema } from '../../utils/validation';
export class AccrualTransaction {
    constructor(data) {
        this.validate(data);
        this.id = data.id || uuidv4();
        this.leaveBalanceId = data.leaveBalanceId;
        this.transactionType = data.transactionType;
        this.amount = data.amount;
        this.description = data.description.trim();
        this.transactionDate = data.transactionDate;
        this.relatedRequestId = data.relatedRequestId;
        this.createdBy = data.createdBy;
        this.createdAt = data.createdAt || new Date();
        this.validateBusinessRules();
    }
    validate(data) {
        const schema = Joi.object({
            id: uuidSchema.optional(),
            leaveBalanceId: uuidSchema,
            transactionType: Joi.string().valid('ACCRUAL', 'USAGE', 'ADJUSTMENT', 'CARRYOVER').required(),
            amount: Joi.number().required(),
            description: Joi.string().min(1).max(500).required(),
            transactionDate: Joi.date().required(),
            relatedRequestId: uuidSchema.optional(),
            createdBy: uuidSchema,
            createdAt: Joi.date().optional()
        });
        validateAndThrow(schema, data);
    }
    validateBusinessRules() {
        if (this.transactionType === 'USAGE' && this.amount >= 0) {
            throw new ValidationError('Usage transactions must have negative amounts', []);
        }
        if (this.transactionType === 'ACCRUAL' && this.amount <= 0) {
            throw new ValidationError('Accrual transactions must have positive amounts', []);
        }
        if (this.transactionDate > new Date()) {
            throw new ValidationError('Transaction date cannot be in the future', []);
        }
    }
    isCredit() {
        return this.amount > 0;
    }
    isDebit() {
        return this.amount < 0;
    }
    getTransactionSummary() {
        const action = this.isCredit() ? 'Added' : 'Deducted';
        const absAmount = Math.abs(this.amount);
        return `${action} ${absAmount} hours - ${this.description}`;
    }
    isRelatedToRequest(requestId) {
        return this.relatedRequestId === requestId;
    }
    getAuditInfo() {
        return {
            transactionId: this.id,
            type: this.transactionType,
            amount: this.amount,
            date: this.transactionDate,
            description: this.description,
            createdBy: this.createdBy,
            relatedRequest: this.relatedRequestId
        };
    }
    toJSON() {
        return {
            id: this.id,
            leaveBalanceId: this.leaveBalanceId,
            transactionType: this.transactionType,
            amount: this.amount,
            description: this.description,
            transactionDate: this.transactionDate,
            relatedRequestId: this.relatedRequestId,
            createdBy: this.createdBy,
            createdAt: this.createdAt
        };
    }
    static createAccrualTransaction(leaveBalanceId, amount, description, createdBy, transactionDate = new Date()) {
        return new AccrualTransaction({
            leaveBalanceId,
            transactionType: 'ACCRUAL',
            amount,
            description,
            transactionDate,
            createdBy
        });
    }
    static createUsageTransaction(leaveBalanceId, amount, description, createdBy, relatedRequestId, transactionDate = new Date()) {
        return new AccrualTransaction({
            leaveBalanceId,
            transactionType: 'USAGE',
            amount: -Math.abs(amount), // Ensure negative for usage
            description,
            transactionDate,
            relatedRequestId,
            createdBy
        });
    }
    static createAdjustmentTransaction(leaveBalanceId, amount, description, createdBy, transactionDate = new Date()) {
        return new AccrualTransaction({
            leaveBalanceId,
            transactionType: 'ADJUSTMENT',
            amount,
            description,
            transactionDate,
            createdBy
        });
    }
    static createCarryoverTransaction(leaveBalanceId, amount, description, createdBy, transactionDate = new Date()) {
        return new AccrualTransaction({
            leaveBalanceId,
            transactionType: 'CARRYOVER',
            amount,
            description,
            transactionDate,
            createdBy
        });
    }
}
export class LeaveBalance {
    constructor(data) {
        this.validate(data);
        this.id = data.id || uuidv4();
        this.employeeId = data.employeeId;
        this.leaveTypeId = data.leaveTypeId;
        this.currentBalance = data.currentBalance;
        this.accrualRate = data.accrualRate;
        this.accrualPeriod = data.accrualPeriod;
        this.maxBalance = data.maxBalance;
        this.carryoverLimit = data.carryoverLimit;
        this.lastAccrualDate = data.lastAccrualDate;
        this.yearToDateUsed = data.yearToDateUsed;
        this.yearToDateAccrued = data.yearToDateAccrued;
        this.effectiveDate = data.effectiveDate;
        this.createdAt = data.createdAt || new Date();
        this.updatedAt = data.updatedAt || new Date();
        this.validateBusinessRules();
    }
    validate(data) {
        const schema = Joi.object({
            id: uuidSchema.optional(),
            employeeId: uuidSchema,
            leaveTypeId: uuidSchema,
            currentBalance: Joi.number().min(0).required(),
            accrualRate: Joi.number().min(0).required(),
            accrualPeriod: Joi.string().valid('MONTHLY', 'BIWEEKLY', 'ANNUAL', 'PER_PAY_PERIOD').required(),
            maxBalance: Joi.number().min(0).optional(),
            carryoverLimit: Joi.number().min(0).optional(),
            lastAccrualDate: Joi.date().required(),
            yearToDateUsed: Joi.number().min(0).required(),
            yearToDateAccrued: Joi.number().min(0).required(),
            effectiveDate: Joi.date().required(),
            createdAt: Joi.date().optional(),
            updatedAt: Joi.date().optional()
        });
        validateAndThrow(schema, data);
    }
    validateBusinessRules() {
        if (this.maxBalance && this.currentBalance > this.maxBalance) {
            throw new ValidationError('Current balance cannot exceed maximum balance', []);
        }
        if (this.carryoverLimit && this.maxBalance && this.carryoverLimit > this.maxBalance) {
            throw new ValidationError('Carryover limit cannot exceed maximum balance', []);
        }
        if (this.accrualRate < 0) {
            throw new ValidationError('Accrual rate cannot be negative', []);
        }
        if (this.effectiveDate > new Date()) {
            throw new ValidationError('Effective date cannot be in the future', []);
        }
    }
    hasSufficientBalance(requestedAmount) {
        return this.currentBalance >= requestedAmount;
    }
    calculateProjectedBalance(futureDate) {
        const monthsDiff = this.getMonthsDifference(this.lastAccrualDate, futureDate);
        let projectedAccrual = 0;
        switch (this.accrualPeriod) {
            case 'MONTHLY':
                projectedAccrual = monthsDiff * this.accrualRate;
                break;
            case 'BIWEEKLY':
                projectedAccrual = (monthsDiff * 2.17) * this.accrualRate; // Approximate biweekly periods per month
                break;
            case 'ANNUAL':
                projectedAccrual = (monthsDiff / 12) * this.accrualRate;
                break;
            case 'PER_PAY_PERIOD':
                projectedAccrual = (monthsDiff * 2) * this.accrualRate; // Assuming bi-monthly pay periods
                break;
        }
        const projectedBalance = this.currentBalance + projectedAccrual;
        return this.maxBalance ? Math.min(projectedBalance, this.maxBalance) : projectedBalance;
    }
    calculateAccrualForPeriod(startDate, endDate) {
        const monthsDiff = this.getMonthsDifference(startDate, endDate);
        let accrualAmount = 0;
        switch (this.accrualPeriod) {
            case 'MONTHLY':
                accrualAmount = monthsDiff * this.accrualRate;
                break;
            case 'BIWEEKLY':
                const biweeklyPeriods = Math.floor((endDate.getTime() - startDate.getTime()) / (14 * 24 * 60 * 60 * 1000));
                accrualAmount = biweeklyPeriods * this.accrualRate;
                break;
            case 'ANNUAL':
                const yearsDiff = (endDate.getTime() - startDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
                accrualAmount = yearsDiff * this.accrualRate;
                break;
            case 'PER_PAY_PERIOD':
                const payPeriods = Math.floor((endDate.getTime() - startDate.getTime()) / (14 * 24 * 60 * 60 * 1000)); // Assuming bi-weekly pay periods
                accrualAmount = payPeriods * this.accrualRate;
                break;
        }
        return Math.max(0, accrualAmount);
    }
    calculateNextAccrualDate() {
        const nextAccrualDate = new Date(this.lastAccrualDate);
        switch (this.accrualPeriod) {
            case 'MONTHLY':
                nextAccrualDate.setMonth(nextAccrualDate.getMonth() + 1);
                break;
            case 'BIWEEKLY':
                nextAccrualDate.setDate(nextAccrualDate.getDate() + 14);
                break;
            case 'ANNUAL':
                nextAccrualDate.setFullYear(nextAccrualDate.getFullYear() + 1);
                break;
            case 'PER_PAY_PERIOD':
                nextAccrualDate.setDate(nextAccrualDate.getDate() + 14); // Assuming bi-weekly pay periods
                break;
        }
        return nextAccrualDate;
    }
    isAccrualDue(currentDate = new Date()) {
        const nextAccrualDate = this.calculateNextAccrualDate();
        return currentDate >= nextAccrualDate;
    }
    getMonthsDifference(startDate, endDate) {
        const months = (endDate.getFullYear() - startDate.getFullYear()) * 12;
        return months - startDate.getMonth() + endDate.getMonth();
    }
    applyAccrual(amount, accrualDate) {
        const newBalance = Math.min(this.currentBalance + amount, this.maxBalance || Number.MAX_SAFE_INTEGER);
        return new LeaveBalance({
            ...this.toJSON(),
            currentBalance: newBalance,
            lastAccrualDate: accrualDate,
            yearToDateAccrued: this.yearToDateAccrued + amount,
            updatedAt: new Date()
        });
    }
    applyUsage(amount) {
        if (!this.hasSufficientBalance(amount)) {
            throw new ValidationError('Insufficient leave balance', []);
        }
        return new LeaveBalance({
            ...this.toJSON(),
            currentBalance: this.currentBalance - amount,
            yearToDateUsed: this.yearToDateUsed + amount,
            updatedAt: new Date()
        });
    }
    applyAdjustment(amount) {
        const newBalance = Math.max(0, this.currentBalance + amount);
        return new LeaveBalance({
            ...this.toJSON(),
            currentBalance: newBalance,
            updatedAt: new Date()
        });
    }
    isAtMaximum() {
        return this.maxBalance ? this.currentBalance >= this.maxBalance : false;
    }
    getAvailableAccrualCapacity() {
        return this.maxBalance ? this.maxBalance - this.currentBalance : Number.MAX_SAFE_INTEGER;
    }
    calculateCarryoverAmount() {
        if (!this.carryoverLimit) {
            return this.currentBalance;
        }
        return Math.min(this.currentBalance, this.carryoverLimit);
    }
    calculateForfeiture() {
        if (!this.carryoverLimit) {
            return 0;
        }
        return Math.max(0, this.currentBalance - this.carryoverLimit);
    }
    applyYearEndCarryover(newYearDate) {
        const carryoverAmount = this.calculateCarryoverAmount();
        return new LeaveBalance({
            ...this.toJSON(),
            currentBalance: carryoverAmount,
            yearToDateUsed: 0,
            yearToDateAccrued: 0,
            effectiveDate: newYearDate,
            updatedAt: new Date()
        });
    }
    updateBalance(balanceChange, transactionType, accrualDate) {
        let newBalance = this.currentBalance + balanceChange;
        let newYearToDateUsed = this.yearToDateUsed;
        let newYearToDateAccrued = this.yearToDateAccrued;
        let newLastAccrualDate = this.lastAccrualDate;
        // Apply maximum balance constraint for positive changes
        if (balanceChange > 0 && this.maxBalance) {
            newBalance = Math.min(newBalance, this.maxBalance);
        }
        // Ensure balance doesn't go negative
        if (newBalance < 0) {
            throw new ValidationError('Balance cannot be negative', []);
        }
        // Update year-to-date tracking based on transaction type
        switch (transactionType) {
            case 'ACCRUAL':
                newYearToDateAccrued += Math.max(0, balanceChange);
                if (accrualDate) {
                    newLastAccrualDate = accrualDate;
                }
                break;
            case 'USAGE':
                newYearToDateUsed += Math.abs(balanceChange);
                break;
            case 'ADJUSTMENT':
                // Adjustments don't affect year-to-date tracking
                break;
            case 'CARRYOVER':
                // Carryover resets year-to-date tracking
                newYearToDateUsed = 0;
                newYearToDateAccrued = 0;
                break;
        }
        return new LeaveBalance({
            ...this.toJSON(),
            currentBalance: newBalance,
            yearToDateUsed: newYearToDateUsed,
            yearToDateAccrued: newYearToDateAccrued,
            lastAccrualDate: newLastAccrualDate,
            updatedAt: new Date()
        });
    }
    getBalanceSummary() {
        const endOfYear = new Date(new Date().getFullYear(), 11, 31);
        const projectedEndOfYear = this.calculateProjectedBalance(endOfYear);
        const nextAccrualDate = this.calculateNextAccrualDate();
        return {
            current: this.currentBalance,
            yearToDateUsed: this.yearToDateUsed,
            yearToDateAccrued: this.yearToDateAccrued,
            projectedEndOfYear,
            availableForUse: this.currentBalance,
            nextAccrualDate,
            nextAccrualAmount: this.accrualRate
        };
    }
    toJSON() {
        return {
            id: this.id,
            employeeId: this.employeeId,
            leaveTypeId: this.leaveTypeId,
            currentBalance: this.currentBalance,
            accrualRate: this.accrualRate,
            accrualPeriod: this.accrualPeriod,
            maxBalance: this.maxBalance,
            carryoverLimit: this.carryoverLimit,
            lastAccrualDate: this.lastAccrualDate,
            yearToDateUsed: this.yearToDateUsed,
            yearToDateAccrued: this.yearToDateAccrued,
            effectiveDate: this.effectiveDate,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt
        };
    }
    static createNew(employeeId, leaveTypeId, accrualRate, accrualPeriod, maxBalance, carryoverLimit) {
        const now = new Date();
        return new LeaveBalance({
            employeeId,
            leaveTypeId,
            currentBalance: 0,
            accrualRate,
            accrualPeriod,
            maxBalance,
            carryoverLimit,
            lastAccrualDate: now,
            yearToDateUsed: 0,
            yearToDateAccrued: 0,
            effectiveDate: now
        });
    }
}
