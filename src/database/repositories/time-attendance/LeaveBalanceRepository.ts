import { SupabaseRepository, PaginatedResult, FilterOptions, SortOptions, PaginationOptions } from '../supabase-base';
import { LeaveBalance, LeaveBalanceData, AccrualTransaction, AccrualTransactionData } from '../../../models/time-attendance/LeaveBalance';

export interface LeaveBalanceCreateInput {
  employeeId: string;
  leaveTypeId: string;
  year: number;
  totalEntitlement: number;
  usedDays?: number;
  pendingDays?: number;
  carryOverDays?: number;
  manualAdjustment?: number;
  adjustmentReason?: string;
}

export interface LeaveBalanceUpdateInput {
  totalEntitlement?: number;
  usedDays?: number;
  pendingDays?: number;
  carryOverDays?: number;
  manualAdjustment?: number;
  adjustmentReason?: string;
  lastAccrualDate?: Date;
  lastCalculationDate?: Date;
}

export interface LeaveBalanceFilters extends FilterOptions {
  employeeId?: string;
  leaveTypeId?: string;
  year?: number;
  hasAvailableBalance?: boolean;
  lowBalance?: number; // Show balances below this threshold
}

export interface AccrualTransactionCreateInput {
  leaveBalanceId: string;
  transactionType: 'ACCRUAL' | 'USAGE' | 'ADJUSTMENT' | 'CARRYOVER';
  amount: number;
  description: string;
  referenceId?: string; // Reference to leave request or other entity
  processedDate: Date;
}

export interface BalanceCalculationResult {
  totalEntitlement: number;
  usedDays: number;
  pendingDays: number;
  availableDays: number;
  carryOverDays: number;
  projectedEndOfYearBalance: number;
  accruedThisYear: number;
  lastCalculationDate: Date;
}

export interface BalanceSummary {
  employeeId: string;
  year: number;
  balances: Array<{
    leaveTypeId: string;
    leaveTypeName: string;
    totalEntitlement: number;
    usedDays: number;
    pendingDays: number;
    availableDays: number;
    utilizationPercentage: number;
  }>;
}

export class LeaveBalanceRepository extends SupabaseRepository<LeaveBalance, LeaveBalanceCreateInput, LeaveBalanceUpdateInput> {
  constructor() {
    super('leave_balances');
  }

  /**
   * Create a new leave balance
   */
  async create(data: LeaveBalanceCreateInput, userContext?: string): Promise<LeaveBalance> {
    const client = this.getClient(userContext);

    // Check if balance already exists for employee, leave type, and year
    const existingBalance = await this.findByEmployeeLeaveTypeYear(
      data.employeeId,
      data.leaveTypeId,
      data.year,
      userContext
    );

    if (existingBalance) {
      throw new Error('Leave balance already exists for this employee, leave type, and year');
    }

    const availableDays = data.totalEntitlement + (data.carryOverDays || 0) - (data.usedDays || 0) - (data.pendingDays || 0) + (data.manualAdjustment || 0);

    // Convert to database format
    const leaveBalanceData = {
      employee_id: data.employeeId,
      leave_type_id: data.leaveTypeId,
      year: data.year,
      total_entitlement: data.totalEntitlement,
      used_days: data.usedDays || 0,
      pending_days: data.pendingDays || 0,
      available_days: availableDays,
      carry_over_days: data.carryOverDays || 0,
      manual_adjustment: data.manualAdjustment || 0,
      adjustment_reason: data.adjustmentReason || null,
      last_calculation_date: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const leaveBalance = await this.executeQuery<any>(
      client.from(this.tableName).insert(leaveBalanceData).select().single(),
      'create leave balance'
    );

    // Create initial accrual transaction
    if (data.totalEntitlement > 0) {
      await this.createAccrualTransaction({
        leaveBalanceId: leaveBalance.id,
        transactionType: 'ACCRUAL',
        amount: data.totalEntitlement,
        description: `Initial entitlement for ${data.year}`,
        processedDate: new Date()
      }, userContext);
    }

    return this.mapToLeaveBalance(leaveBalance);
  }

  /**
   * Find leave balance by ID with transactions
   */
  async findById(id: string, userContext?: string): Promise<LeaveBalance | null> {
    const client = this.getClient(userContext);

    const leaveBalance = await this.executeQuery<any>(
      client
        .from(this.tableName)
        .select(`
          *,
          leave_types (
            id,
            name,
            description
          ),
          employees (
            id,
            first_name,
            last_name,
            email
          )
        `)
        .eq('id', id)
        .single(),
      'find leave balance by id'
    );

    if (!leaveBalance) return null;

    return this.mapToLeaveBalance(leaveBalance);
  }

  /**
   * Update leave balance
   */
  async update(id: string, data: LeaveBalanceUpdateInput, userContext?: string): Promise<LeaveBalance | null> {
    const client = this.getClient(userContext);

    const updateData: any = {
      updated_at: new Date().toISOString()
    };

    if (data.totalEntitlement !== undefined) updateData.total_entitlement = data.totalEntitlement;
    if (data.usedDays !== undefined) updateData.used_days = data.usedDays;
    if (data.pendingDays !== undefined) updateData.pending_days = data.pendingDays;
    if (data.carryOverDays !== undefined) updateData.carry_over_days = data.carryOverDays;
    if (data.manualAdjustment !== undefined) updateData.manual_adjustment = data.manualAdjustment;
    if (data.adjustmentReason !== undefined) updateData.adjustment_reason = data.adjustmentReason;
    if (data.lastAccrualDate !== undefined) updateData.last_accrual_date = data.lastAccrualDate?.toISOString();
    if (data.lastCalculationDate !== undefined) updateData.last_calculation_date = data.lastCalculationDate?.toISOString();

    // Recalculate available days
    const currentBalance = await this.findById(id, userContext);
    if (currentBalance) {
      const totalEntitlement = data.totalEntitlement ?? currentBalance.totalEntitlement;
      const usedDays = data.usedDays ?? currentBalance.usedDays;
      const pendingDays = data.pendingDays ?? currentBalance.pendingDays;
      const carryOverDays = data.carryOverDays ?? currentBalance.carryOverDays;
      const manualAdjustment = data.manualAdjustment ?? currentBalance.manualAdjustment;

      updateData.available_days = totalEntitlement + carryOverDays - usedDays - pendingDays + manualAdjustment;
    }

    const updatedBalance = await this.executeQuery<any>(
      client
        .from(this.tableName)
        .update(updateData)
        .eq('id', id)
        .select()
        .single(),
      'update leave balance'
    );

    if (!updatedBalance) return null;

    return this.findById(id, userContext);
  }

  /**
   * Delete leave balance
   */
  async delete(id: string, userContext?: string): Promise<boolean> {
    const client = this.getClient(userContext);

    // Delete associated accrual transactions first
    await this.executeQuery(
      client.from('accrual_transactions').delete().eq('leave_balance_id', id),
      'delete accrual transactions'
    );

    // Delete leave balance
    const { error } = await client.from(this.tableName).delete().eq('id', id);

    return !error;
  }

  /**
   * Find leave balances with advanced filtering
   */
  async findAll(options?: {
    pagination?: PaginationOptions;
    sort?: SortOptions;
    filters?: LeaveBalanceFilters;
  }, userContext?: string): Promise<PaginatedResult<LeaveBalance>> {
    const { pagination, sort, filters } = options || {};

    const client = this.getClient(userContext);

    // Build query with joins
    let query = client
      .from(this.tableName)
      .select(`
        *,
        leave_types (
          id,
          name,
          description
        ),
        employees (
          id,
          first_name,
          last_name,
          email
        )
      `, { count: 'exact' });

    // Apply filters
    if (filters) {
      if (filters.employeeId) {
        query = query.eq('employee_id', filters.employeeId);
      }
      if (filters.leaveTypeId) {
        query = query.eq('leave_type_id', filters.leaveTypeId);
      }
      if (filters.year) {
        query = query.eq('year', filters.year);
      }
      if (filters.hasAvailableBalance) {
        query = query.gt('available_days', 0);
      }
      if (filters.lowBalance !== undefined) {
        query = query.lte('available_days', filters.lowBalance);
      }
    }

    // Apply sorting
    const orderBy = this.buildOrderBy(sort);
    query = query.order(orderBy.column, { ascending: orderBy.ascending });

    // Apply pagination
    const { from, to } = this.buildPagination(pagination);
    query = query.range(from, to);

    const { data, count } = await query;

    if (!data) {
      throw new Error('Failed to fetch leave balances');
    }

    const leaveBalances = data.map(balance => this.mapToLeaveBalance(balance));

    const page = pagination?.page || 1;
    const limit = pagination?.limit || 25;
    const paginationMeta = this.calculatePaginationMeta(count || 0, page, limit);

    return {
      data: leaveBalances,
      pagination: paginationMeta
    };
  }

  /**
   * Find balance by employee, leave type, and year
   */
  async findByEmployeeLeaveTypeYear(
    employeeId: string,
    leaveTypeId: string,
    year: number,
    userContext?: string
  ): Promise<LeaveBalance | null> {
    const result = await this.findAll({
      filters: {
        employeeId,
        leaveTypeId,
        year
      }
    }, userContext);

    return result.data.length > 0 ? result.data[0] : null;
  }

  /**
   * Get all balances for employee in a year
   */
  async findByEmployeeYear(
    employeeId: string,
    year: number,
    userContext?: string
  ): Promise<LeaveBalance[]> {
    const result = await this.findAll({
      filters: {
        employeeId,
        year
      },
      sort: { field: 'leave_type_id', direction: 'ASC' }
    }, userContext);

    return result.data;
  }

  /**
   * Calculate and update balance based on transactions
   */
  async recalculateBalance(balanceId: string, userContext?: string): Promise<BalanceCalculationResult> {
    const balance = await this.findById(balanceId, userContext);
    if (!balance) {
      throw new Error('Leave balance not found');
    }

    // Get all transactions for this balance
    const transactions = await this.getAccrualTransactions(balanceId, userContext);

    let totalAccrual = 0;
    let totalUsage = 0;
    let totalAdjustments = 0;
    let carryOverDays = 0;

    for (const transaction of transactions) {
      switch (transaction.transactionType) {
        case 'ACCRUAL':
          totalAccrual += transaction.amount;
          break;
        case 'USAGE':
          totalUsage += transaction.amount;
          break;
        case 'ADJUSTMENT':
          totalAdjustments += transaction.amount;
          break;
        case 'CARRYOVER':
          carryOverDays += transaction.amount;
          break;
      }
    }

    const usedDays = Math.abs(totalUsage);
    const availableDays = totalAccrual + carryOverDays - usedDays + totalAdjustments - balance.pendingDays;

    // Calculate projected end of year balance (simple projection)
    const now = new Date();
    const yearEnd = new Date(balance.year, 11, 31);
    const remainingMonths = Math.max(0, (yearEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 30));
    const projectedEndOfYearBalance = availableDays; // Simplified projection

    const result: BalanceCalculationResult = {
      totalEntitlement: totalAccrual,
      usedDays,
      pendingDays: balance.pendingDays,
      availableDays,
      carryOverDays,
      projectedEndOfYearBalance,
      accruedThisYear: totalAccrual,
      lastCalculationDate: new Date()
    };

    // Update the balance with calculated values
    await this.update(balanceId, {
      totalEntitlement: result.totalEntitlement,
      usedDays: result.usedDays,
      carryOverDays: result.carryOverDays,
      manualAdjustment: totalAdjustments,
      lastCalculationDate: result.lastCalculationDate
    }, userContext);

    return result;
  }

  /**
   * Create accrual transaction
   */
  async createAccrualTransaction(
    data: AccrualTransactionCreateInput,
    userContext?: string
  ): Promise<AccrualTransaction> {
    const client = this.getClient(userContext);

    const transactionData = {
      leave_balance_id: data.leaveBalanceId,
      transaction_type: data.transactionType,
      amount: data.amount,
      description: data.description,
      reference_id: data.referenceId || null,
      processed_date: data.processedDate.toISOString(),
      created_at: new Date().toISOString()
    };

    const transaction = await this.executeQuery<any>(
      client.from('accrual_transactions').insert(transactionData).select().single(),
      'create accrual transaction'
    );

    return this.mapToAccrualTransaction(transaction);
  }

  /**
   * Get accrual transactions for a balance
   */
  async getAccrualTransactions(
    balanceId: string,
    userContext?: string
  ): Promise<AccrualTransaction[]> {
    const client = this.getClient(userContext);

    const transactions = await this.executeQuery<any[]>(
      client
        .from('accrual_transactions')
        .select('*')
        .eq('leave_balance_id', balanceId)
        .order('processed_date', { ascending: true }),
      'get accrual transactions'
    );

    return transactions.map(t => this.mapToAccrualTransaction(t));
  }

  /**
   * Process leave usage (deduct from balance)
   */
  async processLeaveUsage(
    employeeId: string,
    leaveTypeId: string,
    days: number,
    leaveRequestId: string,
    year: number = new Date().getFullYear(),
    userContext?: string
  ): Promise<void> {
    const balance = await this.findByEmployeeLeaveTypeYear(employeeId, leaveTypeId, year, userContext);

    if (!balance) {
      throw new Error('Leave balance not found for employee and leave type');
    }

    if (balance.availableDays < days) {
      throw new Error('Insufficient leave balance');
    }

    // Create usage transaction
    await this.createAccrualTransaction({
      leaveBalanceId: balance.id,
      transactionType: 'USAGE',
      amount: -days, // Negative for usage
      description: `Leave usage - ${days} days`,
      referenceId: leaveRequestId,
      processedDate: new Date()
    }, userContext);

    // Update balance
    await this.update(balance.id, {
      usedDays: balance.usedDays + days,
      lastCalculationDate: new Date()
    }, userContext);
  }

  /**
   * Process leave accrual (add to balance)
   */
  async processLeaveAccrual(
    employeeId: string,
    leaveTypeId: string,
    days: number,
    description: string,
    year: number = new Date().getFullYear(),
    userContext?: string
  ): Promise<void> {
    let balance = await this.findByEmployeeLeaveTypeYear(employeeId, leaveTypeId, year, userContext);

    if (!balance) {
      // Create new balance if it doesn't exist
      balance = await this.create({
        employeeId,
        leaveTypeId,
        year,
        totalEntitlement: days
      }, userContext);
    } else {
      // Create accrual transaction
      await this.createAccrualTransaction({
        leaveBalanceId: balance.id,
        transactionType: 'ACCRUAL',
        amount: days,
        description,
        processedDate: new Date()
      }, userContext);

      // Update balance
      await this.update(balance.id, {
        totalEntitlement: balance.totalEntitlement + days,
        lastAccrualDate: new Date(),
        lastCalculationDate: new Date()
      }, userContext);
    }
  }

  /**
   * Get balance summary for employee
   */
  async getEmployeeBalanceSummary(
    employeeId: string,
    year: number = new Date().getFullYear(),
    userContext?: string
  ): Promise<BalanceSummary> {
    const balances = await this.findByEmployeeYear(employeeId, year, userContext);

    return {
      employeeId,
      year,
      balances: balances.map(balance => ({
        leaveTypeId: balance.leaveTypeId,
        leaveTypeName: balance.leaveTypeId, // Would be populated from join
        totalEntitlement: balance.totalEntitlement,
        usedDays: balance.usedDays,
        pendingDays: balance.pendingDays,
        availableDays: balance.availableDays,
        utilizationPercentage: balance.totalEntitlement > 0
          ? (balance.usedDays / balance.totalEntitlement) * 100
          : 0
      }))
    };
  }

  /**
   * Find low balance alerts
   */
  async findLowBalanceAlerts(
    threshold: number = 2,
    userContext?: string
  ): Promise<LeaveBalance[]> {
    const result = await this.findAll({
      filters: {
        lowBalance: threshold,
        hasAvailableBalance: true
      },
      sort: { field: 'available_days', direction: 'ASC' }
    }, userContext);

    return result.data;
  }

  /**
   * Map database row to LeaveBalance model
   */
  private mapToLeaveBalance(row: any): LeaveBalance {
    const leaveBalanceData: LeaveBalanceData = {
      id: row.id,
      employeeId: row.employee_id,
      leaveTypeId: row.leave_type_id,
      year: row.year,
      totalEntitlement: row.total_entitlement,
      usedDays: row.used_days,
      pendingDays: row.pending_days,
      availableDays: row.available_days,
      carryOverDays: row.carry_over_days,
      manualAdjustment: row.manual_adjustment,
      adjustmentReason: row.adjustment_reason,
      lastAccrualDate: row.last_accrual_date ? new Date(row.last_accrual_date) : undefined,
      lastCalculationDate: row.last_calculation_date ? new Date(row.last_calculation_date) : undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };

    return new LeaveBalance(leaveBalanceData);
  }

  /**
   * Map database row to AccrualTransaction model
   */
  private mapToAccrualTransaction(row: any): AccrualTransaction {
    const accrualTransactionData: AccrualTransactionData = {
      id: row.id,
      leaveBalanceId: row.leave_balance_id,
      transactionType: row.transaction_type,
      amount: row.amount,
      description: row.description,
      referenceId: row.reference_id,
      processedDate: new Date(row.processed_date),
      createdAt: new Date(row.created_at)
    };

    return new AccrualTransaction(accrualTransactionData);
  }
}