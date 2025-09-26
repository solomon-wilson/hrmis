import { LeaveBalance, AccrualTransaction, LeaveBalanceData, AccrualTransactionData } from './LeaveBalance';
import { ValidationError } from '../../utils/validation';

describe('AccrualTransaction', () => {
  const validTransactionData: AccrualTransactionData = {
    leaveBalanceId: '550e8400-e29b-41d4-a716-446655440000',
    transactionType: 'ACCRUAL',
    amount: 8,
    description: 'Monthly accrual',
    transactionDate: new Date('2024-01-01'),
    createdBy: '550e8400-e29b-41d4-a716-446655440001'
  };

  describe('constructor', () => {
    it('should create a valid AccrualTransaction instance', () => {
      const transaction = new AccrualTransaction(validTransactionData);

      expect(transaction.leaveBalanceId).toBe('550e8400-e29b-41d4-a716-446655440000');
      expect(transaction.transactionType).toBe('ACCRUAL');
      expect(transaction.amount).toBe(8);
      expect(transaction.description).toBe('Monthly accrual');
      expect(transaction.transactionDate).toEqual(new Date('2024-01-01'));
      expect(transaction.createdBy).toBe('550e8400-e29b-41d4-a716-446655440001');
      expect(transaction.id).toBeDefined();
      expect(transaction.createdAt).toBeDefined();
    });

    it('should throw ValidationError for usage transaction with positive amount', () => {
      const data = { ...validTransactionData, transactionType: 'USAGE' as const, amount: 8 };
      expect(() => new AccrualTransaction(data)).toThrow(ValidationError);
    });

    it('should throw ValidationError for accrual transaction with negative amount', () => {
      const data = { ...validTransactionData, transactionType: 'ACCRUAL' as const, amount: -8 };
      expect(() => new AccrualTransaction(data)).toThrow(ValidationError);
    });

    it('should throw ValidationError for future transaction date', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 1);
      
      const data = { ...validTransactionData, transactionDate: futureDate };
      expect(() => new AccrualTransaction(data)).toThrow(ValidationError);
    });

    it('should allow usage transaction with negative amount', () => {
      const data = { ...validTransactionData, transactionType: 'USAGE' as const, amount: -8 };
      const transaction = new AccrualTransaction(data);
      expect(transaction.amount).toBe(-8);
    });
  });

  describe('isCredit and isDebit', () => {
    it('should correctly identify credit transactions', () => {
      const transaction = new AccrualTransaction(validTransactionData);
      expect(transaction.isCredit()).toBe(true);
      expect(transaction.isDebit()).toBe(false);
    });

    it('should correctly identify debit transactions', () => {
      const data = { ...validTransactionData, transactionType: 'USAGE' as const, amount: -8 };
      const transaction = new AccrualTransaction(data);
      expect(transaction.isCredit()).toBe(false);
      expect(transaction.isDebit()).toBe(true);
    });
  });

  describe('getTransactionSummary', () => {
    it('should generate summary for credit transaction', () => {
      const transaction = new AccrualTransaction(validTransactionData);
      const summary = transaction.getTransactionSummary();
      expect(summary).toBe('Added 8 hours - Monthly accrual');
    });

    it('should generate summary for debit transaction', () => {
      const data = { ...validTransactionData, transactionType: 'USAGE' as const, amount: -8 };
      const transaction = new AccrualTransaction(data);
      const summary = transaction.getTransactionSummary();
      expect(summary).toBe('Deducted 8 hours - Monthly accrual');
    });
  });

  describe('isRelatedToRequest', () => {
    it('should return true for matching request ID', () => {
      const requestId = '550e8400-e29b-41d4-a716-446655440004';
      const data = { ...validTransactionData, relatedRequestId: requestId };
      const transaction = new AccrualTransaction(data);
      expect(transaction.isRelatedToRequest(requestId)).toBe(true);
    });

    it('should return false for non-matching request ID', () => {
      const requestId1 = '550e8400-e29b-41d4-a716-446655440004';
      const requestId2 = '550e8400-e29b-41d4-a716-446655440005';
      const data = { ...validTransactionData, relatedRequestId: requestId1 };
      const transaction = new AccrualTransaction(data);
      expect(transaction.isRelatedToRequest(requestId2)).toBe(false);
    });

    it('should return false when no related request ID', () => {
      const transaction = new AccrualTransaction(validTransactionData);
      expect(transaction.isRelatedToRequest('550e8400-e29b-41d4-a716-446655440004')).toBe(false);
    });
  });

  describe('getAuditInfo', () => {
    it('should return complete audit information', () => {
      const requestId = '550e8400-e29b-41d4-a716-446655440004';
      const data = { ...validTransactionData, relatedRequestId: requestId };
      const transaction = new AccrualTransaction(data);
      const auditInfo = transaction.getAuditInfo();

      expect(auditInfo.transactionId).toBe(transaction.id);
      expect(auditInfo.type).toBe('ACCRUAL');
      expect(auditInfo.amount).toBe(8);
      expect(auditInfo.date).toEqual(new Date('2024-01-01'));
      expect(auditInfo.description).toBe('Monthly accrual');
      expect(auditInfo.createdBy).toBe('550e8400-e29b-41d4-a716-446655440001');
      expect(auditInfo.relatedRequest).toBe(requestId);
    });
  });

  describe('static factory methods', () => {
    it('should create accrual transaction', () => {
      const transaction = AccrualTransaction.createAccrualTransaction(
        '550e8400-e29b-41d4-a716-446655440000',
        8,
        'Monthly accrual',
        '550e8400-e29b-41d4-a716-446655440001'
      );

      expect(transaction.transactionType).toBe('ACCRUAL');
      expect(transaction.amount).toBe(8);
      expect(transaction.description).toBe('Monthly accrual');
    });

    it('should create usage transaction with negative amount', () => {
      const transaction = AccrualTransaction.createUsageTransaction(
        '550e8400-e29b-41d4-a716-446655440000',
        8,
        'Vacation usage',
        '550e8400-e29b-41d4-a716-446655440006',
        '550e8400-e29b-41d4-a716-446655440007'
      );

      expect(transaction.transactionType).toBe('USAGE');
      expect(transaction.amount).toBe(-8);
      expect(transaction.relatedRequestId).toBe('550e8400-e29b-41d4-a716-446655440007');
    });

    it('should create adjustment transaction', () => {
      const transaction = AccrualTransaction.createAdjustmentTransaction(
        '550e8400-e29b-41d4-a716-446655440000',
        -4,
        'Balance correction',
        '550e8400-e29b-41d4-a716-446655440008'
      );

      expect(transaction.transactionType).toBe('ADJUSTMENT');
      expect(transaction.amount).toBe(-4);
    });

    it('should create carryover transaction', () => {
      const transaction = AccrualTransaction.createCarryoverTransaction(
        '550e8400-e29b-41d4-a716-446655440000',
        40,
        'Year-end carryover',
        '550e8400-e29b-41d4-a716-446655440001'
      );

      expect(transaction.transactionType).toBe('CARRYOVER');
      expect(transaction.amount).toBe(40);
    });
  });
});

describe('LeaveBalance', () => {
  const validBalanceData: LeaveBalanceData = {
    employeeId: '550e8400-e29b-41d4-a716-446655440002',
    leaveTypeId: '550e8400-e29b-41d4-a716-446655440003',
    currentBalance: 40,
    accrualRate: 8,
    accrualPeriod: 'MONTHLY',
    maxBalance: 200,
    carryoverLimit: 80,
    lastAccrualDate: new Date('2024-01-01'),
    yearToDateUsed: 16,
    yearToDateAccrued: 56,
    effectiveDate: new Date('2024-01-01')
  };

  describe('constructor', () => {
    it('should create a valid LeaveBalance instance', () => {
      const balance = new LeaveBalance(validBalanceData);

      expect(balance.employeeId).toBe('550e8400-e29b-41d4-a716-446655440002');
      expect(balance.leaveTypeId).toBe('550e8400-e29b-41d4-a716-446655440003');
      expect(balance.currentBalance).toBe(40);
      expect(balance.accrualRate).toBe(8);
      expect(balance.accrualPeriod).toBe('MONTHLY');
      expect(balance.maxBalance).toBe(200);
      expect(balance.carryoverLimit).toBe(80);
      expect(balance.yearToDateUsed).toBe(16);
      expect(balance.yearToDateAccrued).toBe(56);
      expect(balance.id).toBeDefined();
    });

    it('should throw ValidationError for negative current balance', () => {
      const data = { ...validBalanceData, currentBalance: -10 };
      expect(() => new LeaveBalance(data)).toThrow(ValidationError);
    });

    it('should throw ValidationError for negative accrual rate', () => {
      const data = { ...validBalanceData, accrualRate: -5 };
      expect(() => new LeaveBalance(data)).toThrow(ValidationError);
    });

    it('should throw ValidationError when current balance exceeds max balance', () => {
      const data = { ...validBalanceData, currentBalance: 250, maxBalance: 200 };
      expect(() => new LeaveBalance(data)).toThrow(ValidationError);
    });

    it('should throw ValidationError when carryover limit exceeds max balance', () => {
      const data = { ...validBalanceData, carryoverLimit: 250, maxBalance: 200 };
      expect(() => new LeaveBalance(data)).toThrow(ValidationError);
    });

    it('should throw ValidationError for future effective date', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 1);
      
      const data = { ...validBalanceData, effectiveDate: futureDate };
      expect(() => new LeaveBalance(data)).toThrow(ValidationError);
    });
  });

  describe('hasSufficientBalance', () => {
    it('should return true when balance is sufficient', () => {
      const balance = new LeaveBalance(validBalanceData);
      expect(balance.hasSufficientBalance(30)).toBe(true);
    });

    it('should return false when balance is insufficient', () => {
      const balance = new LeaveBalance(validBalanceData);
      expect(balance.hasSufficientBalance(50)).toBe(false);
    });

    it('should return true when requested amount equals current balance', () => {
      const balance = new LeaveBalance(validBalanceData);
      expect(balance.hasSufficientBalance(40)).toBe(true);
    });
  });

  describe('calculateProjectedBalance', () => {
    let balance: LeaveBalance;

    beforeEach(() => {
      balance = new LeaveBalance({
        ...validBalanceData,
        lastAccrualDate: new Date('2024-01-01'),
        currentBalance: 40,
        accrualRate: 8,
        accrualPeriod: 'MONTHLY'
      });
    });

    it('should calculate projected balance for monthly accrual', () => {
      const futureDate = new Date('2024-04-01'); // 3 months later
      const projected = balance.calculateProjectedBalance(futureDate);
      expect(projected).toBe(64); // 40 + (3 * 8)
    });

    it('should respect maximum balance in projection', () => {
      const balanceNearMax = new LeaveBalance({
        ...validBalanceData,
        currentBalance: 190,
        maxBalance: 200
      });
      
      const futureDate = new Date('2024-04-01'); // 3 months later
      const projected = balanceNearMax.calculateProjectedBalance(futureDate);
      expect(projected).toBe(200); // Capped at max balance
    });

    it('should handle annual accrual period', () => {
      const annualBalance = new LeaveBalance({
        ...validBalanceData,
        accrualPeriod: 'ANNUAL',
        accrualRate: 96 // 96 hours per year
      });
      
      const futureDate = new Date('2024-07-01'); // 6 months later
      const projected = annualBalance.calculateProjectedBalance(futureDate);
      expect(projected).toBe(88); // 40 + (6/12 * 96)
    });
  });

  describe('applyAccrual', () => {
    it('should apply accrual and update balance', () => {
      const balance = new LeaveBalance(validBalanceData);
      const accrualDate = new Date('2024-02-01');
      const updated = balance.applyAccrual(8, accrualDate);

      expect(updated.currentBalance).toBe(48);
      expect(updated.lastAccrualDate).toEqual(accrualDate);
      expect(updated.yearToDateAccrued).toBe(64);
      expect(updated.updatedAt).toBeDefined();
    });

    it('should respect maximum balance when applying accrual', () => {
      const balance = new LeaveBalance({
        ...validBalanceData,
        currentBalance: 195,
        maxBalance: 200
      });
      
      const updated = balance.applyAccrual(10, new Date());
      expect(updated.currentBalance).toBe(200); // Capped at max
    });

    it('should handle unlimited balance (no max balance)', () => {
      const balance = new LeaveBalance({
        ...validBalanceData,
        maxBalance: undefined
      });
      
      const updated = balance.applyAccrual(100, new Date());
      expect(updated.currentBalance).toBe(140);
    });
  });

  describe('applyUsage', () => {
    it('should apply usage and update balance', () => {
      const balance = new LeaveBalance(validBalanceData);
      const updated = balance.applyUsage(16);

      expect(updated.currentBalance).toBe(24);
      expect(updated.yearToDateUsed).toBe(32);
      expect(updated.updatedAt).toBeDefined();
    });

    it('should throw ValidationError for insufficient balance', () => {
      const balance = new LeaveBalance(validBalanceData);
      expect(() => balance.applyUsage(50)).toThrow(ValidationError);
    });

    it('should allow using entire balance', () => {
      const balance = new LeaveBalance(validBalanceData);
      const updated = balance.applyUsage(40);
      expect(updated.currentBalance).toBe(0);
    });
  });

  describe('applyAdjustment', () => {
    it('should apply positive adjustment', () => {
      const balance = new LeaveBalance(validBalanceData);
      const updated = balance.applyAdjustment(10);

      expect(updated.currentBalance).toBe(50);
      expect(updated.updatedAt).toBeDefined();
    });

    it('should apply negative adjustment', () => {
      const balance = new LeaveBalance(validBalanceData);
      const updated = balance.applyAdjustment(-10);

      expect(updated.currentBalance).toBe(30);
    });

    it('should not allow balance to go below zero', () => {
      const balance = new LeaveBalance(validBalanceData);
      const updated = balance.applyAdjustment(-50);

      expect(updated.currentBalance).toBe(0);
    });
  });

  describe('isAtMaximum', () => {
    it('should return true when at maximum balance', () => {
      const balance = new LeaveBalance({
        ...validBalanceData,
        currentBalance: 200,
        maxBalance: 200
      });
      expect(balance.isAtMaximum()).toBe(true);
    });

    it('should return false when below maximum balance', () => {
      const balance = new LeaveBalance(validBalanceData);
      expect(balance.isAtMaximum()).toBe(false);
    });

    it('should return false when no maximum balance is set', () => {
      const balance = new LeaveBalance({
        ...validBalanceData,
        maxBalance: undefined
      });
      expect(balance.isAtMaximum()).toBe(false);
    });
  });

  describe('getAvailableAccrualCapacity', () => {
    it('should return available capacity when max balance is set', () => {
      const balance = new LeaveBalance(validBalanceData);
      expect(balance.getAvailableAccrualCapacity()).toBe(160); // 200 - 40
    });

    it('should return max safe integer when no max balance is set', () => {
      const balance = new LeaveBalance({
        ...validBalanceData,
        maxBalance: undefined
      });
      expect(balance.getAvailableAccrualCapacity()).toBe(Number.MAX_SAFE_INTEGER);
    });
  });

  describe('calculateCarryoverAmount', () => {
    it('should return carryover limit when balance exceeds limit', () => {
      const balance = new LeaveBalance({
        ...validBalanceData,
        currentBalance: 100,
        carryoverLimit: 80
      });
      expect(balance.calculateCarryoverAmount()).toBe(80);
    });

    it('should return current balance when below carryover limit', () => {
      const balance = new LeaveBalance({
        ...validBalanceData,
        currentBalance: 60,
        carryoverLimit: 80
      });
      expect(balance.calculateCarryoverAmount()).toBe(60);
    });

    it('should return current balance when no carryover limit is set', () => {
      const balance = new LeaveBalance({
        ...validBalanceData,
        carryoverLimit: undefined
      });
      expect(balance.calculateCarryoverAmount()).toBe(40);
    });
  });

  describe('calculateAccrualForPeriod', () => {
    let balance: LeaveBalance;

    beforeEach(() => {
      balance = new LeaveBalance({
        ...validBalanceData,
        accrualRate: 8,
        accrualPeriod: 'MONTHLY'
      });
    });

    it('should calculate monthly accrual correctly', () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-04-01'); // 3 months
      const accrual = balance.calculateAccrualForPeriod(startDate, endDate);
      expect(accrual).toBe(24); // 3 months * 8 hours
    });

    it('should calculate biweekly accrual correctly', () => {
      const biweeklyBalance = new LeaveBalance({
        ...validBalanceData,
        accrualRate: 4,
        accrualPeriod: 'BIWEEKLY'
      });

      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-29'); // 28 days = 2 biweekly periods
      const accrual = biweeklyBalance.calculateAccrualForPeriod(startDate, endDate);
      expect(accrual).toBe(8); // 2 periods * 4 hours
    });

    it('should calculate annual accrual correctly', () => {
      const annualBalance = new LeaveBalance({
        ...validBalanceData,
        accrualRate: 120,
        accrualPeriod: 'ANNUAL'
      });

      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-07-01'); // 6 months = 0.5 years
      const accrual = annualBalance.calculateAccrualForPeriod(startDate, endDate);
      expect(accrual).toBeCloseTo(60, 0); // 0.5 years * 120 hours
    });

    it('should return zero for negative time periods', () => {
      const startDate = new Date('2024-04-01');
      const endDate = new Date('2024-01-01');
      const accrual = balance.calculateAccrualForPeriod(startDate, endDate);
      expect(accrual).toBe(0);
    });
  });

  describe('calculateNextAccrualDate', () => {
    it('should calculate next monthly accrual date', () => {
      const balance = new LeaveBalance({
        ...validBalanceData,
        lastAccrualDate: new Date('2024-01-15'),
        accrualPeriod: 'MONTHLY'
      });

      const nextDate = balance.calculateNextAccrualDate();
      expect(nextDate).toEqual(new Date('2024-02-15'));
    });

    it('should calculate next biweekly accrual date', () => {
      const balance = new LeaveBalance({
        ...validBalanceData,
        lastAccrualDate: new Date('2024-01-01'),
        accrualPeriod: 'BIWEEKLY'
      });

      const nextDate = balance.calculateNextAccrualDate();
      expect(nextDate).toEqual(new Date('2024-01-15'));
    });

    it('should calculate next annual accrual date', () => {
      const balance = new LeaveBalance({
        ...validBalanceData,
        lastAccrualDate: new Date('2024-01-01'),
        accrualPeriod: 'ANNUAL'
      });

      const nextDate = balance.calculateNextAccrualDate();
      expect(nextDate).toEqual(new Date('2025-01-01'));
    });
  });

  describe('isAccrualDue', () => {
    it('should return true when accrual is due', () => {
      const balance = new LeaveBalance({
        ...validBalanceData,
        lastAccrualDate: new Date('2024-01-01'),
        accrualPeriod: 'MONTHLY'
      });

      const currentDate = new Date('2024-02-01');
      expect(balance.isAccrualDue(currentDate)).toBe(true);
    });

    it('should return false when accrual is not due', () => {
      const balance = new LeaveBalance({
        ...validBalanceData,
        lastAccrualDate: new Date('2024-01-01'),
        accrualPeriod: 'MONTHLY'
      });

      const currentDate = new Date('2024-01-15');
      expect(balance.isAccrualDue(currentDate)).toBe(false);
    });
  });

  describe('calculateForfeiture', () => {
    it('should calculate forfeiture when balance exceeds carryover limit', () => {
      const balance = new LeaveBalance({
        ...validBalanceData,
        currentBalance: 120,
        carryoverLimit: 80
      });

      expect(balance.calculateForfeiture()).toBe(40);
    });

    it('should return zero when balance is within carryover limit', () => {
      const balance = new LeaveBalance({
        ...validBalanceData,
        currentBalance: 60,
        carryoverLimit: 80
      });

      expect(balance.calculateForfeiture()).toBe(0);
    });

    it('should return zero when no carryover limit is set', () => {
      const balance = new LeaveBalance({
        ...validBalanceData,
        carryoverLimit: undefined
      });

      expect(balance.calculateForfeiture()).toBe(0);
    });
  });

  describe('applyYearEndCarryover', () => {
    it('should apply carryover and reset year-to-date values', () => {
      const balance = new LeaveBalance({
        ...validBalanceData,
        currentBalance: 120,
        carryoverLimit: 80,
        yearToDateUsed: 40,
        yearToDateAccrued: 96
      });

      const newYearDate = new Date('2025-01-01');
      const carriedOver = balance.applyYearEndCarryover(newYearDate);

      expect(carriedOver.currentBalance).toBe(80);
      expect(carriedOver.yearToDateUsed).toBe(0);
      expect(carriedOver.yearToDateAccrued).toBe(0);
      expect(carriedOver.effectiveDate).toEqual(newYearDate);
    });
  });

  describe('updateBalance', () => {
    let balance: LeaveBalance;

    beforeEach(() => {
      balance = new LeaveBalance(validBalanceData);
    });

    it('should update balance for accrual transaction', () => {
      const accrualDate = new Date('2024-02-01');
      const updated = balance.updateBalance(8, 'ACCRUAL', accrualDate);

      expect(updated.currentBalance).toBe(48);
      expect(updated.yearToDateAccrued).toBe(64);
      expect(updated.lastAccrualDate).toEqual(accrualDate);
    });

    it('should update balance for usage transaction', () => {
      const updated = balance.updateBalance(-16, 'USAGE');

      expect(updated.currentBalance).toBe(24);
      expect(updated.yearToDateUsed).toBe(32);
    });

    it('should update balance for adjustment transaction', () => {
      const updated = balance.updateBalance(10, 'ADJUSTMENT');

      expect(updated.currentBalance).toBe(50);
      expect(updated.yearToDateUsed).toBe(16); // Unchanged
      expect(updated.yearToDateAccrued).toBe(56); // Unchanged
    });

    it('should update balance for carryover transaction', () => {
      const updated = balance.updateBalance(0, 'CARRYOVER');

      expect(updated.yearToDateUsed).toBe(0);
      expect(updated.yearToDateAccrued).toBe(0);
    });

    it('should respect maximum balance for positive changes', () => {
      const updated = balance.updateBalance(200, 'ACCRUAL');
      expect(updated.currentBalance).toBe(200); // Capped at max balance
    });

    it('should throw error for negative balance', () => {
      expect(() => balance.updateBalance(-50, 'USAGE')).toThrow(ValidationError);
    });
  });

  describe('getBalanceSummary', () => {
    it('should return comprehensive balance summary', () => {
      const balance = new LeaveBalance({
        ...validBalanceData,
        lastAccrualDate: new Date('2024-01-01'),
        accrualRate: 8,
        accrualPeriod: 'MONTHLY'
      });

      const summary = balance.getBalanceSummary();

      expect(summary.current).toBe(40);
      expect(summary.yearToDateUsed).toBe(16);
      expect(summary.yearToDateAccrued).toBe(56);
      expect(summary.availableForUse).toBe(40);
      expect(summary.nextAccrualAmount).toBe(8);
      expect(summary.nextAccrualDate).toBeDefined();
      expect(summary.projectedEndOfYear).toBeDefined();
    });
  });

  describe('createNew', () => {
    it('should create new leave balance with default values', () => {
      const balance = LeaveBalance.createNew(
        '550e8400-e29b-41d4-a716-446655440002',
        '550e8400-e29b-41d4-a716-446655440003',
        8,
        'MONTHLY',
        200,
        80
      );

      expect(balance.employeeId).toBe('550e8400-e29b-41d4-a716-446655440002');
      expect(balance.leaveTypeId).toBe('550e8400-e29b-41d4-a716-446655440003');
      expect(balance.currentBalance).toBe(0);
      expect(balance.accrualRate).toBe(8);
      expect(balance.accrualPeriod).toBe('MONTHLY');
      expect(balance.maxBalance).toBe(200);
      expect(balance.carryoverLimit).toBe(80);
      expect(balance.yearToDateUsed).toBe(0);
      expect(balance.yearToDateAccrued).toBe(0);
      expect(balance.effectiveDate).toBeDefined();
      expect(balance.lastAccrualDate).toBeDefined();
    });

    it('should create balance without optional parameters', () => {
      const balance = LeaveBalance.createNew(
        '550e8400-e29b-41d4-a716-446655440002',
        '550e8400-e29b-41d4-a716-446655440003',
        8,
        'MONTHLY'
      );

      expect(balance.maxBalance).toBeUndefined();
      expect(balance.carryoverLimit).toBeUndefined();
    });
  });
});