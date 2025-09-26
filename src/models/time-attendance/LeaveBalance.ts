import Joi from 'joi';
import { v4 as uuidv4 } from 'uuid';
import {
  validateAndThrow,
  ValidationError,
  uuidSchema
} from '../../utils/validation';

export interface AccrualTransactionData {
  id?: string;
  leaveBalanceId: string;
  transactionType: 'ACCRUAL' | 'USAGE' | 'ADJUSTMENT' | 'CARRYOVER';
  amount: number;
  description: string;
  transactionDate: Date;
  relatedRequestId?: string;
  createdBy: string;
  createdAt?: Date;
}

export interface LeaveBalanceData {
  id?: string;
  employeeId: string;
  leaveTypeId: string;
  currentBalance: number;
  accrualRate: number;
  accrualPeriod: 'MONTHLY' | 'BIWEEKLY' | 'ANNUAL' | 'PER_PAY_PERIOD';
  maxBalance?: number;
  carryoverLimit?: number;
  lastAccrualDate: Date;
  yearToDateUsed: number;
  yearToDateAccrued: number;
  effectiveDate: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export class AccrualTransaction {
  public id: string;
  public leaveBalanceId: string;
  public transactionType: 'ACCRUAL' | 'USAGE' | 'ADJUSTMENT' | 'CARRYOVER';
  public amount: number;
  public description: string;
  public transactionDate: Date;
  public relatedRequestId?: string;
  public createdBy: string;
  public createdAt: Date;

  constructor(data: AccrualTransactionData) {
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

  private validate(data: AccrualTransactionData): void {
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

    validateAndThrow<AccrualTransactionData>(schema, data);
  }

  private validateBusinessRules(): void {
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

  public isCredit(): boolean {
    return this.amount > 0;
  }

  public isDebit(): boolean {
    return this.amount < 0;
  }

  public getTransactionSummary(): string {
    const action = this.isCredit() ? 'Added' : 'Deducted';
    const absAmount = Math.abs(this.amount);
    return `${action} ${absAmount} hours - ${this.description}`;
  }

  public isRelatedToRequest(requestId: string): boolean {
    return this.relatedRequestId === requestId;
  }

  public getAuditInfo(): {
    transactionId: string;
    type: string;
    amount: number;
    date: Date;
    description: string;
    createdBy: string;
    relatedRequest?: string;
  } {
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

  public toJSON(): AccrualTransactionData {
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

  public static createAccrualTransaction(
    leaveBalanceId: string,
    amount: number,
    description: string,
    createdBy: string,
    transactionDate: Date = new Date()
  ): AccrualTransaction {
    return new AccrualTransaction({
      leaveBalanceId,
      transactionType: 'ACCRUAL',
      amount,
      description,
      transactionDate,
      createdBy
    });
  }

  public static createUsageTransaction(
    leaveBalanceId: string,
    amount: number,
    description: string,
    createdBy: string,
    relatedRequestId?: string,
    transactionDate: Date = new Date()
  ): AccrualTransaction {
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

  public static createAdjustmentTransaction(
    leaveBalanceId: string,
    amount: number,
    description: string,
    createdBy: string,
    transactionDate: Date = new Date()
  ): AccrualTransaction {
    return new AccrualTransaction({
      leaveBalanceId,
      transactionType: 'ADJUSTMENT',
      amount,
      description,
      transactionDate,
      createdBy
    });
  }

  public static createCarryoverTransaction(
    leaveBalanceId: string,
    amount: number,
    description: string,
    createdBy: string,
    transactionDate: Date = new Date()
  ): AccrualTransaction {
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
  public id: string;
  public employeeId: string;
  public leaveTypeId: string;
  public currentBalance: number;
  public accrualRate: number;
  public accrualPeriod: 'MONTHLY' | 'BIWEEKLY' | 'ANNUAL' | 'PER_PAY_PERIOD';
  public maxBalance?: number;
  public carryoverLimit?: number;
  public lastAccrualDate: Date;
  public yearToDateUsed: number;
  public yearToDateAccrued: number;
  public effectiveDate: Date;
  public createdAt: Date;
  public updatedAt: Date;

  constructor(data: LeaveBalanceData) {
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

  private validate(data: LeaveBalanceData): void {
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

    validateAndThrow<LeaveBalanceData>(schema, data);
  }

  private validateBusinessRules(): void {
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

  public hasSufficientBalance(requestedAmount: number): boolean {
    return this.currentBalance >= requestedAmount;
  }

  public calculateProjectedBalance(futureDate: Date): number {
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

  public calculateAccrualForPeriod(startDate: Date, endDate: Date): number {
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

  public calculateNextAccrualDate(): Date {
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

  public isAccrualDue(currentDate: Date = new Date()): boolean {
    const nextAccrualDate = this.calculateNextAccrualDate();
    return currentDate >= nextAccrualDate;
  }

  private getMonthsDifference(startDate: Date, endDate: Date): number {
    const months = (endDate.getFullYear() - startDate.getFullYear()) * 12;
    return months - startDate.getMonth() + endDate.getMonth();
  }

  public applyAccrual(amount: number, accrualDate: Date): LeaveBalance {
    const newBalance = Math.min(
      this.currentBalance + amount,
      this.maxBalance || Number.MAX_SAFE_INTEGER
    );

    return new LeaveBalance({
      ...this.toJSON(),
      currentBalance: newBalance,
      lastAccrualDate: accrualDate,
      yearToDateAccrued: this.yearToDateAccrued + amount,
      updatedAt: new Date()
    });
  }

  public applyUsage(amount: number): LeaveBalance {
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

  public applyAdjustment(amount: number): LeaveBalance {
    const newBalance = Math.max(0, this.currentBalance + amount);

    return new LeaveBalance({
      ...this.toJSON(),
      currentBalance: newBalance,
      updatedAt: new Date()
    });
  }

  public isAtMaximum(): boolean {
    return this.maxBalance ? this.currentBalance >= this.maxBalance : false;
  }

  public getAvailableAccrualCapacity(): number {
    return this.maxBalance ? this.maxBalance - this.currentBalance : Number.MAX_SAFE_INTEGER;
  }

  public calculateCarryoverAmount(): number {
    if (!this.carryoverLimit) {
      return this.currentBalance;
    }
    return Math.min(this.currentBalance, this.carryoverLimit);
  }

  public calculateForfeiture(): number {
    if (!this.carryoverLimit) {
      return 0;
    }
    return Math.max(0, this.currentBalance - this.carryoverLimit);
  }

  public applyYearEndCarryover(newYearDate: Date): LeaveBalance {
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

  public updateBalance(
    balanceChange: number,
    transactionType: 'ACCRUAL' | 'USAGE' | 'ADJUSTMENT' | 'CARRYOVER',
    accrualDate?: Date
  ): LeaveBalance {
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

  public getBalanceSummary(): {
    current: number;
    yearToDateUsed: number;
    yearToDateAccrued: number;
    projectedEndOfYear: number;
    availableForUse: number;
    nextAccrualDate: Date;
    nextAccrualAmount: number;
  } {
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

  public toJSON(): LeaveBalanceData {
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

  public static createNew(
    employeeId: string,
    leaveTypeId: string,
    accrualRate: number,
    accrualPeriod: 'MONTHLY' | 'BIWEEKLY' | 'ANNUAL' | 'PER_PAY_PERIOD',
    maxBalance?: number,
    carryoverLimit?: number
  ): LeaveBalance {
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