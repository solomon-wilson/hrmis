import { SupabaseRepository, PaginatedResult, FilterOptions, SortOptions, PaginationOptions } from '../supabase-base';

export interface LeaveUsageReportFilters extends FilterOptions {
  employeeIds?: string[];
  departmentIds?: string[];
  leaveTypeIds?: string[];
  dateRange: {
    start: Date;
    end: Date;
  };
  status?: 'PENDING' | 'APPROVED' | 'DENIED' | 'CANCELLED';
  includeBalances?: boolean;
}

export interface LeaveUsageReportData {
  employeeId: string;
  employeeName: string;
  department: string;
  leaveTypeId: string;
  leaveTypeName: string;
  totalRequested: number;
  totalApproved: number;
  totalDenied: number;
  totalPending: number;
  totalUsed: number;
  currentBalance: number;
  projectedBalance: number;
  utilizationRate: number;
  period: {
    start: Date;
    end: Date;
  };
}

export interface LeaveBalanceReportData {
  employeeId: string;
  employeeName: string;
  department: string;
  leaveTypeId: string;
  leaveTypeName: string;
  currentBalance: number;
  yearToDateUsed: number;
  yearToDateAccrued: number;
  projectedEndOfYearBalance: number;
  maxBalance?: number;
  carryoverLimit?: number;
  accrualRate: number;
  accrualPeriod: string;
  lastAccrualDate: Date;
  nextAccrualDate: Date;
  nextAccrualAmount: number;
  isAtRisk: boolean; // Close to losing leave due to max balance
  riskDescription?: string;
}

export interface LeavePatternAnalysisData {
  employeeId: string;
  employeeName: string;
  department: string;
  totalLeaveRequests: number;
  averageRequestDuration: number;
  mostUsedLeaveType: string;
  seasonalPatterns: {
    quarter: string;
    requestCount: number;
    totalDays: number;
  }[];
  frequentRequestDays: string[]; // Days of week
  advanceNoticeAverage: number;
  approvalRate: number;
  lastMinuteRequests: number;
}

export interface LeaveComplianceReportData {
  employeeId: string;
  employeeName: string;
  department: string;
  violations: {
    type: 'INSUFFICIENT_NOTICE' | 'EXCEEDS_MAX_CONSECUTIVE' | 'BLACKOUT_PERIOD' | 'NEGATIVE_BALANCE' | 'POLICY_VIOLATION';
    description: string;
    requestId: string;
    date: Date;
    severity: 'LOW' | 'MEDIUM' | 'HIGH';
  }[];
  complianceScore: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface TeamLeaveCalendarData {
  date: Date;
  employees: {
    employeeId: string;
    employeeName: string;
    leaveType: string;
    status: 'PENDING' | 'APPROVED';
    isFullDay: boolean;
  }[];
  teamCoverage: number; // Percentage of team available
  criticalCoverage: boolean; // Below minimum coverage threshold
}

export interface LeaveAccrualReportData {
  employeeId: string;
  employeeName: string;
  department: string;
  leaveTypeId: string;
  leaveTypeName: string;
  transactions: {
    date: Date;
    type: 'ACCRUAL' | 'USAGE' | 'ADJUSTMENT' | 'CARRYOVER';
    amount: number;
    description: string;
    balanceAfter: number;
    relatedRequestId?: string;
  }[];
  periodSummary: {
    startingBalance: number;
    totalAccrued: number;
    totalUsed: number;
    totalAdjustments: number;
    endingBalance: number;
  };
}

export class LeaveReportRepository extends SupabaseRepository<any, any, any> {
  constructor() {
    super('leave_requests'); // Base table, but we'll use complex queries
  }

  // Required abstract methods (minimal implementation since this is a reporting repository)
  async create(data: any): Promise<any> {
    throw new Error('Create operation not supported for reporting repository');
  }

  async findById(id: string): Promise<any> {
    throw new Error('FindById operation not supported for reporting repository');
  }

  async update(id: string, data: any): Promise<any> {
    throw new Error('Update operation not supported for reporting repository');
  }

  async delete(id: string): Promise<boolean> {
    throw new Error('Delete operation not supported for reporting repository');
  }

  /**
   * Generate leave usage report
   */
  async generateLeaveUsageReport(
    filters: LeaveUsageReportFilters,
    options?: {
      pagination?: PaginationOptions;
      sort?: SortOptions;
    },
    userContext?: string
  ): Promise<PaginatedResult<LeaveUsageReportData>> {
    const client = this.getClient(userContext);
    const { dateRange, employeeIds, departmentIds, leaveTypeIds, status, includeBalances } = filters;

    let query = `
      SELECT 
        lr.employee_id,
        e.first_name || ' ' || e.last_name as employee_name,
        d.name as department,
        lr.leave_type_id,
        lt.name as leave_type_name,
        COUNT(*) as total_requests,
        SUM(lr.total_days) as total_days_requested,
        SUM(CASE WHEN lr.status = 'APPROVED' THEN lr.total_days ELSE 0 END) as total_approved,
        SUM(CASE WHEN lr.status = 'DENIED' THEN lr.total_days ELSE 0 END) as total_denied,
        SUM(CASE WHEN lr.status = 'PENDING' THEN lr.total_days ELSE 0 END) as total_pending,
        SUM(CASE WHEN lr.status = 'APPROVED' THEN lr.total_days ELSE 0 END) as total_used
      FROM leave_requests lr
      JOIN employees e ON lr.employee_id = e.id
      JOIN leave_types lt ON lr.leave_type_id = lt.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE lr.start_date >= $1 AND lr.end_date <= $2
    `;

    const queryParams: any[] = [
      dateRange.start.toISOString().split('T')[0],
      dateRange.end.toISOString().split('T')[0]
    ];

    let paramIndex = 3;

    if (employeeIds && employeeIds.length > 0) {
      query += ` AND lr.employee_id = ANY($${paramIndex})`;
      queryParams.push(employeeIds);
      paramIndex++;
    }

    if (departmentIds && departmentIds.length > 0) {
      query += ` AND e.department_id = ANY($${paramIndex})`;
      queryParams.push(departmentIds);
      paramIndex++;
    }

    if (leaveTypeIds && leaveTypeIds.length > 0) {
      query += ` AND lr.leave_type_id = ANY($${paramIndex})`;
      queryParams.push(leaveTypeIds);
      paramIndex++;
    }

    if (status) {
      query += ` AND lr.status = $${paramIndex}`;
      queryParams.push(status);
      paramIndex++;
    }

    query += ` GROUP BY lr.employee_id, e.first_name, e.last_name, d.name, lr.leave_type_id, lt.name`;

    // Add sorting
    const sortField = options?.sort?.field || 'employee_name';
    const sortDirection = options?.sort?.direction || 'ASC';
    query += ` ORDER BY ${sortField} ${sortDirection}`;

    const { data: usageData, error } = await client.rpc('execute_sql', {
      sql: query,
      params: queryParams
    });

    if (error) {
      throw new Error(`Leave usage report query failed: ${error.message}`);
    }

    const reportData: LeaveUsageReportData[] = [];

    for (const row of usageData || []) {
      let currentBalance = 0;
      let projectedBalance = 0;

      if (includeBalances) {
        const balanceData = await this.getLeaveBalance(row.employee_id, row.leave_type_id, userContext);
        currentBalance = balanceData.currentBalance;
        projectedBalance = balanceData.projectedBalance;
      }

      const totalRequested = parseFloat(row.total_days_requested) || 0;
      const totalApproved = parseFloat(row.total_approved) || 0;
      const totalDenied = parseFloat(row.total_denied) || 0;
      const totalPending = parseFloat(row.total_pending) || 0;
      const totalUsed = parseFloat(row.total_used) || 0;

      const utilizationRate = currentBalance > 0 ? (totalUsed / (currentBalance + totalUsed)) * 100 : 0;

      reportData.push({
        employeeId: row.employee_id,
        employeeName: row.employee_name,
        department: row.department || 'Unknown',
        leaveTypeId: row.leave_type_id,
        leaveTypeName: row.leave_type_name,
        totalRequested,
        totalApproved,
        totalDenied,
        totalPending,
        totalUsed,
        currentBalance,
        projectedBalance,
        utilizationRate,
        period: dateRange
      });
    }

    // Apply pagination
    const { pagination } = options || {};
    const page = pagination?.page || 1;
    const limit = pagination?.limit || 50;
    const offset = (page - 1) * limit;
    
    const paginatedData = reportData.slice(offset, offset + limit);
    const total = reportData.length;

    return {
      data: paginatedData,
      pagination: this.calculatePaginationMeta(total, page, limit)
    };
  }

  /**
   * Generate leave balance report
   */
  async generateLeaveBalanceReport(
    employeeIds?: string[],
    leaveTypeIds?: string[],
    userContext?: string
  ): Promise<LeaveBalanceReportData[]> {
    const client = this.getClient(userContext);

    let query = `
      SELECT 
        lb.employee_id,
        e.first_name || ' ' || e.last_name as employee_name,
        d.name as department,
        lb.leave_type_id,
        lt.name as leave_type_name,
        lb.current_balance,
        lb.year_to_date_used,
        lb.year_to_date_accrued,
        lb.max_balance,
        lb.carryover_limit,
        lb.accrual_rate,
        lb.accrual_period,
        lb.last_accrual_date
      FROM leave_balances lb
      JOIN employees e ON lb.employee_id = e.id
      JOIN leave_types lt ON lb.leave_type_id = lt.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE e.status = 'ACTIVE'
    `;

    const queryParams: any[] = [];
    let paramIndex = 1;

    if (employeeIds && employeeIds.length > 0) {
      query += ` AND lb.employee_id = ANY($${paramIndex})`;
      queryParams.push(employeeIds);
      paramIndex++;
    }

    if (leaveTypeIds && leaveTypeIds.length > 0) {
      query += ` AND lb.leave_type_id = ANY($${paramIndex})`;
      queryParams.push(leaveTypeIds);
      paramIndex++;
    }

    query += ` ORDER BY e.first_name, e.last_name, lt.name`;

    const { data: balanceData, error } = await client.rpc('execute_sql', {
      sql: query,
      params: queryParams
    });

    if (error) {
      throw new Error(`Leave balance report query failed: ${error.message}`);
    }

    const reportData: LeaveBalanceReportData[] = [];

    for (const row of balanceData || []) {
      const currentBalance = parseFloat(row.current_balance) || 0;
      const yearToDateUsed = parseFloat(row.year_to_date_used) || 0;
      const yearToDateAccrued = parseFloat(row.year_to_date_accrued) || 0;
      const maxBalance = row.max_balance ? parseFloat(row.max_balance) : undefined;
      const carryoverLimit = row.carryover_limit ? parseFloat(row.carryover_limit) : undefined;
      const accrualRate = parseFloat(row.accrual_rate) || 0;

      // Calculate projected end of year balance
      const projectedEndOfYearBalance = this.calculateProjectedBalance(
        currentBalance,
        accrualRate,
        row.accrual_period,
        new Date(row.last_accrual_date)
      );

      // Calculate next accrual date
      const nextAccrualDate = this.calculateNextAccrualDate(
        new Date(row.last_accrual_date),
        row.accrual_period
      );

      // Determine if at risk of losing leave
      const { isAtRisk, riskDescription } = this.assessLeaveRisk(
        currentBalance,
        projectedEndOfYearBalance,
        maxBalance,
        carryoverLimit
      );

      reportData.push({
        employeeId: row.employee_id,
        employeeName: row.employee_name,
        department: row.department || 'Unknown',
        leaveTypeId: row.leave_type_id,
        leaveTypeName: row.leave_type_name,
        currentBalance,
        yearToDateUsed,
        yearToDateAccrued,
        projectedEndOfYearBalance,
        maxBalance,
        carryoverLimit,
        accrualRate,
        accrualPeriod: row.accrual_period,
        lastAccrualDate: new Date(row.last_accrual_date),
        nextAccrualDate,
        nextAccrualAmount: accrualRate,
        isAtRisk,
        riskDescription
      });
    }

    return reportData;
  }

  /**
   * Generate leave pattern analysis
   */
  async generateLeavePatternAnalysis(
    employeeIds?: string[],
    dateRange?: { start: Date; end: Date },
    userContext?: string
  ): Promise<LeavePatternAnalysisData[]> {
    const client = this.getClient(userContext);
    const analysisRange = dateRange || {
      start: new Date(new Date().getFullYear(), 0, 1),
      end: new Date(new Date().getFullYear(), 11, 31)
    };

    let query = `
      SELECT 
        lr.employee_id,
        e.first_name || ' ' || e.last_name as employee_name,
        d.name as department,
        COUNT(*) as total_requests,
        AVG(lr.total_days) as avg_duration,
        AVG(EXTRACT(DAYS FROM (lr.start_date - lr.created_at))) as avg_advance_notice,
        COUNT(CASE WHEN lr.status = 'APPROVED' THEN 1 END) as approved_count,
        COUNT(CASE WHEN EXTRACT(DAYS FROM (lr.start_date - lr.created_at)) < 7 THEN 1 END) as last_minute_count
      FROM leave_requests lr
      JOIN employees e ON lr.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE lr.start_date >= $1 AND lr.end_date <= $2
    `;

    const queryParams: any[] = [
      analysisRange.start.toISOString().split('T')[0],
      analysisRange.end.toISOString().split('T')[0]
    ];

    if (employeeIds && employeeIds.length > 0) {
      query += ` AND lr.employee_id = ANY($3)`;
      queryParams.push(employeeIds);
    }

    query += ` GROUP BY lr.employee_id, e.first_name, e.last_name, d.name`;

    const { data: patternData, error } = await client.rpc('execute_sql', {
      sql: query,
      params: queryParams
    });

    if (error) {
      throw new Error(`Leave pattern analysis query failed: ${error.message}`);
    }

    const analysisData: LeavePatternAnalysisData[] = [];

    for (const row of patternData || []) {
      const totalRequests = parseInt(row.total_requests) || 0;
      const approvedCount = parseInt(row.approved_count) || 0;
      const approvalRate = totalRequests > 0 ? (approvedCount / totalRequests) * 100 : 0;

      // Get additional pattern data
      const seasonalPatterns = await this.getSeasonalPatterns(row.employee_id, analysisRange, userContext);
      const mostUsedLeaveType = await this.getMostUsedLeaveType(row.employee_id, analysisRange, userContext);
      const frequentRequestDays = await this.getFrequentRequestDays(row.employee_id, analysisRange, userContext);

      analysisData.push({
        employeeId: row.employee_id,
        employeeName: row.employee_name,
        department: row.department || 'Unknown',
        totalLeaveRequests: totalRequests,
        averageRequestDuration: parseFloat(row.avg_duration) || 0,
        mostUsedLeaveType,
        seasonalPatterns,
        frequentRequestDays,
        advanceNoticeAverage: parseFloat(row.avg_advance_notice) || 0,
        approvalRate,
        lastMinuteRequests: parseInt(row.last_minute_count) || 0
      });
    }

    return analysisData;
  }

  /**
   * Generate team leave calendar
   */
  async generateTeamLeaveCalendar(
    dateRange: { start: Date; end: Date },
    departmentIds?: string[],
    userContext?: string
  ): Promise<TeamLeaveCalendarData[]> {
    const client = this.getClient(userContext);

    let query = `
      SELECT 
        generate_series($1::date, $2::date, '1 day'::interval)::date as date,
        lr.employee_id,
        e.first_name || ' ' || e.last_name as employee_name,
        lt.name as leave_type,
        lr.status,
        (lr.total_hours < 8) as is_partial_day
      FROM generate_series($1::date, $2::date, '1 day'::interval) dates(date)
      LEFT JOIN leave_requests lr ON dates.date >= lr.start_date AND dates.date <= lr.end_date
        AND lr.status IN ('PENDING', 'APPROVED')
      LEFT JOIN employees e ON lr.employee_id = e.id
      LEFT JOIN leave_types lt ON lr.leave_type_id = lt.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE 1=1
    `;

    const queryParams: any[] = [
      dateRange.start.toISOString().split('T')[0],
      dateRange.end.toISOString().split('T')[0]
    ];

    if (departmentIds && departmentIds.length > 0) {
      query += ` AND (d.id = ANY($3) OR lr.employee_id IS NULL)`;
      queryParams.push(departmentIds);
    }

    query += ` ORDER BY date, employee_name`;

    const { data: calendarData, error } = await client.rpc('execute_sql', {
      sql: query,
      params: queryParams
    });

    if (error) {
      throw new Error(`Team leave calendar query failed: ${error.message}`);
    }

    // Group by date
    const calendarMap = new Map<string, TeamLeaveCalendarData>();

    for (const row of calendarData || []) {
      const dateKey = row.date;
      
      if (!calendarMap.has(dateKey)) {
        calendarMap.set(dateKey, {
          date: new Date(row.date),
          employees: [],
          teamCoverage: 100,
          criticalCoverage: false
        });
      }

      const dayData = calendarMap.get(dateKey)!;

      if (row.employee_id) {
        dayData.employees.push({
          employeeId: row.employee_id,
          employeeName: row.employee_name,
          leaveType: row.leave_type,
          status: row.status,
          isFullDay: !row.is_partial_day
        });
      }
    }

    // Calculate team coverage for each day
    const result: TeamLeaveCalendarData[] = [];
    for (const dateKey of Array.from(calendarMap.keys())) {
      const dayData = calendarMap.get(dateKey)!;

      // Get total team size for coverage calculation
      const teamSize = await this.getTeamSize(departmentIds, userContext);
      const employeesOnLeave = dayData.employees.filter(emp => emp.isFullDay).length;
      const partialLeaveEmployees = dayData.employees.filter(emp => !emp.isFullDay).length;

      // Calculate coverage (assuming partial leave reduces availability by 50%)
      const effectiveAbsences = employeesOnLeave + (partialLeaveEmployees * 0.5);
      const teamCoverage = teamSize > 0 ? ((teamSize - effectiveAbsences) / teamSize) * 100 : 100;

      dayData.teamCoverage = Math.max(0, teamCoverage);
      dayData.criticalCoverage = teamCoverage < 70; // Less than 70% coverage is critical

      result.push(dayData);
    }

    return result.sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  /**
   * Generate leave accrual report
   */
  async generateLeaveAccrualReport(
    employeeId: string,
    leaveTypeId: string,
    dateRange: { start: Date; end: Date },
    userContext?: string
  ): Promise<LeaveAccrualReportData> {
    const client = this.getClient(userContext);

    // Get employee and leave type info
    const employeeQuery = `
      SELECT 
        e.first_name || ' ' || e.last_name as employee_name,
        d.name as department,
        lt.name as leave_type_name
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      CROSS JOIN leave_types lt
      WHERE e.id = $1 AND lt.id = $2
    `;

    const { data: employeeData, error: employeeError } = await client.rpc('execute_sql', {
      sql: employeeQuery,
      params: [employeeId, leaveTypeId]
    });

    if (employeeError || !employeeData || employeeData.length === 0) {
      throw new Error('Employee or leave type not found');
    }

    // Get accrual transactions
    const transactionQuery = `
      SELECT 
        at.transaction_date,
        at.transaction_type,
        at.amount,
        at.description,
        at.related_request_id,
        lb.current_balance
      FROM accrual_transactions at
      JOIN leave_balances lb ON at.leave_balance_id = lb.id
      WHERE lb.employee_id = $1 
        AND lb.leave_type_id = $2
        AND at.transaction_date >= $3
        AND at.transaction_date <= $4
      ORDER BY at.transaction_date ASC
    `;

    const { data: transactions, error: transactionError } = await client.rpc('execute_sql', {
      sql: transactionQuery,
      params: [
        employeeId,
        leaveTypeId,
        dateRange.start.toISOString().split('T')[0],
        dateRange.end.toISOString().split('T')[0]
      ]
    });

    if (transactionError) {
      throw new Error(`Accrual transaction query failed: ${transactionError.message}`);
    }

    // Calculate running balance and build transaction list
    const transactionList: any[] = [];
    let runningBalance = 0;
    let startingBalance = 0;
    let totalAccrued = 0;
    let totalUsed = 0;
    let totalAdjustments = 0;

    for (let i = 0; i < (transactions || []).length; i++) {
      const transaction = transactions[i];
      const amount = parseFloat(transaction.amount) || 0;
      
      if (i === 0) {
        startingBalance = parseFloat(transaction.current_balance) - amount;
        runningBalance = startingBalance;
      }
      
      runningBalance += amount;

      // Track totals by transaction type
      switch (transaction.transaction_type) {
        case 'ACCRUAL':
          totalAccrued += amount;
          break;
        case 'USAGE':
          totalUsed += Math.abs(amount);
          break;
        case 'ADJUSTMENT':
          totalAdjustments += amount;
          break;
      }

      transactionList.push({
        date: new Date(transaction.transaction_date),
        type: transaction.transaction_type,
        amount,
        description: transaction.description,
        balanceAfter: runningBalance,
        relatedRequestId: transaction.related_request_id
      });
    }

    const employee = employeeData[0];

    return {
      employeeId,
      employeeName: employee.employee_name,
      department: employee.department || 'Unknown',
      leaveTypeId,
      leaveTypeName: employee.leave_type_name,
      transactions: transactionList,
      periodSummary: {
        startingBalance,
        totalAccrued,
        totalUsed,
        totalAdjustments,
        endingBalance: runningBalance
      }
    };
  }

  // Helper methods

  private async getLeaveBalance(
    employeeId: string,
    leaveTypeId: string,
    userContext?: string
  ): Promise<{ currentBalance: number; projectedBalance: number }> {
    const client = this.getClient(userContext);

    const { data, error } = await client
      .from('leave_balances')
      .select('current_balance, accrual_rate, accrual_period, last_accrual_date')
      .eq('employee_id', employeeId)
      .eq('leave_type_id', leaveTypeId)
      .single();

    if (error || !data) {
      return { currentBalance: 0, projectedBalance: 0 };
    }

    const currentBalance = parseFloat(data.current_balance) || 0;
    const projectedBalance = this.calculateProjectedBalance(
      currentBalance,
      data.accrual_rate,
      data.accrual_period,
      new Date(data.last_accrual_date)
    );

    return { currentBalance, projectedBalance };
  }

  private calculateProjectedBalance(
    currentBalance: number,
    accrualRate: number,
    accrualPeriod: string,
    lastAccrualDate: Date
  ): number {
    const endOfYear = new Date(new Date().getFullYear(), 11, 31);
    const monthsRemaining = this.getMonthsDifference(lastAccrualDate, endOfYear);
    
    let projectedAccrual = 0;
    switch (accrualPeriod) {
      case 'MONTHLY':
        projectedAccrual = monthsRemaining * accrualRate;
        break;
      case 'BIWEEKLY':
        projectedAccrual = (monthsRemaining * 2.17) * accrualRate;
        break;
      case 'ANNUAL':
        projectedAccrual = (monthsRemaining / 12) * accrualRate;
        break;
      case 'PER_PAY_PERIOD':
        projectedAccrual = (monthsRemaining * 2) * accrualRate;
        break;
    }

    return currentBalance + projectedAccrual;
  }

  private calculateNextAccrualDate(lastAccrualDate: Date, accrualPeriod: string): Date {
    const nextDate = new Date(lastAccrualDate);

    switch (accrualPeriod) {
      case 'MONTHLY':
        nextDate.setMonth(nextDate.getMonth() + 1);
        break;
      case 'BIWEEKLY':
        nextDate.setDate(nextDate.getDate() + 14);
        break;
      case 'ANNUAL':
        nextDate.setFullYear(nextDate.getFullYear() + 1);
        break;
      case 'PER_PAY_PERIOD':
        nextDate.setDate(nextDate.getDate() + 14);
        break;
    }

    return nextDate;
  }

  private assessLeaveRisk(
    currentBalance: number,
    projectedBalance: number,
    maxBalance?: number,
    carryoverLimit?: number
  ): { isAtRisk: boolean; riskDescription?: string } {
    if (!maxBalance) {
      return { isAtRisk: false };
    }

    // Risk of hitting max balance
    if (projectedBalance >= maxBalance * 0.9) {
      return {
        isAtRisk: true,
        riskDescription: 'Approaching maximum balance limit - may lose accrued leave'
      };
    }

    // Risk of losing leave at year end due to carryover limits
    if (carryoverLimit && currentBalance > carryoverLimit * 1.2) {
      return {
        isAtRisk: true,
        riskDescription: 'Current balance exceeds carryover limit - may lose leave at year end'
      };
    }

    return { isAtRisk: false };
  }

  private getMonthsDifference(startDate: Date, endDate: Date): number {
    const months = (endDate.getFullYear() - startDate.getFullYear()) * 12;
    return months - startDate.getMonth() + endDate.getMonth();
  }

  private async getSeasonalPatterns(
    employeeId: string,
    dateRange: { start: Date; end: Date },
    userContext?: string
  ): Promise<{ quarter: string; requestCount: number; totalDays: number }[]> {
    const client = this.getClient(userContext);

    const query = `
      SELECT 
        CASE 
          WHEN EXTRACT(MONTH FROM start_date) IN (1,2,3) THEN 'Q1'
          WHEN EXTRACT(MONTH FROM start_date) IN (4,5,6) THEN 'Q2'
          WHEN EXTRACT(MONTH FROM start_date) IN (7,8,9) THEN 'Q3'
          ELSE 'Q4'
        END as quarter,
        COUNT(*) as request_count,
        SUM(total_days) as total_days
      FROM leave_requests
      WHERE employee_id = $1
        AND start_date >= $2
        AND end_date <= $3
      GROUP BY quarter
      ORDER BY quarter
    `;

    const { data, error } = await client.rpc('execute_sql', {
      sql: query,
      params: [employeeId, dateRange.start.toISOString().split('T')[0], dateRange.end.toISOString().split('T')[0]]
    });

    if (error) return [];

    return (data || []).map((row: any) => ({
      quarter: row.quarter,
      requestCount: parseInt(row.request_count) || 0,
      totalDays: parseFloat(row.total_days) || 0
    }));
  }

  private async getMostUsedLeaveType(
    employeeId: string,
    dateRange: { start: Date; end: Date },
    userContext?: string
  ): Promise<string> {
    const client = this.getClient(userContext);

    const query = `
      SELECT lt.name
      FROM leave_requests lr
      JOIN leave_types lt ON lr.leave_type_id = lt.id
      WHERE lr.employee_id = $1
        AND lr.start_date >= $2
        AND lr.end_date <= $3
        AND lr.status = 'APPROVED'
      GROUP BY lt.name
      ORDER BY SUM(lr.total_days) DESC
      LIMIT 1
    `;

    const { data, error } = await client.rpc('execute_sql', {
      sql: query,
      params: [employeeId, dateRange.start.toISOString().split('T')[0], dateRange.end.toISOString().split('T')[0]]
    });

    if (error || !data || data.length === 0) return 'N/A';

    return data[0].name;
  }

  private async getFrequentRequestDays(
    employeeId: string,
    dateRange: { start: Date; end: Date },
    userContext?: string
  ): Promise<string[]> {
    const client = this.getClient(userContext);

    const query = `
      SELECT 
        TO_CHAR(start_date, 'Day') as day_name,
        COUNT(*) as request_count
      FROM leave_requests
      WHERE employee_id = $1
        AND start_date >= $2
        AND end_date <= $3
      GROUP BY TO_CHAR(start_date, 'Day'), EXTRACT(DOW FROM start_date)
      ORDER BY request_count DESC, EXTRACT(DOW FROM start_date)
      LIMIT 3
    `;

    const { data, error } = await client.rpc('execute_sql', {
      sql: query,
      params: [employeeId, dateRange.start.toISOString().split('T')[0], dateRange.end.toISOString().split('T')[0]]
    });

    if (error) return [];

    return (data || []).map((row: any) => row.day_name.trim());
  }

  private async getTeamSize(departmentIds?: string[], userContext?: string): Promise<number> {
    const client = this.getClient(userContext);

    let query = `
      SELECT COUNT(*) as team_size
      FROM employees
      WHERE status = 'ACTIVE'
    `;

    const queryParams: any[] = [];

    if (departmentIds && departmentIds.length > 0) {
      query += ` AND department_id = ANY($1)`;
      queryParams.push(departmentIds);
    }

    const { data, error } = await client.rpc('execute_sql', {
      sql: query,
      params: queryParams
    });

    if (error || !data || data.length === 0) return 0;

    return parseInt(data[0].team_size) || 0;
  }
}