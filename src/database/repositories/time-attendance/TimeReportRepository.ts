import { SupabaseRepository, PaginatedResult, FilterOptions, SortOptions, PaginationOptions } from '../supabase-base';

export interface AttendanceReportFilters extends FilterOptions {
  employeeIds?: string[];
  departmentIds?: string[];
  dateRange: {
    start: Date;
    end: Date;
  };
  includeBreaks?: boolean;
  includeOvertimeOnly?: boolean;
  includeAnomalies?: boolean;
}

export interface AttendanceReportData {
  employeeId: string;
  employeeName: string;
  department: string;
  date: Date;
  clockInTime?: Date;
  clockOutTime?: Date;
  totalHours: number;
  regularHours: number;
  overtimeHours: number;
  breakTime: number;
  paidBreakTime: number;
  unpaidBreakTime: number;
  status: 'PRESENT' | 'ABSENT' | 'PARTIAL' | 'LATE' | 'EARLY_DEPARTURE';
  lateMinutes: number;
  earlyDepartureMinutes: number;
  isManualEntry: boolean;
  anomalies: string[];
}

export interface TimeSummaryReportData {
  employeeId: string;
  employeeName: string;
  department: string;
  period: {
    start: Date;
    end: Date;
  };
  totalDays: number;
  workDays: number;
  presentDays: number;
  absentDays: number;
  lateDays: number;
  totalHours: number;
  regularHours: number;
  overtimeHours: number;
  averageHoursPerDay: number;
  totalBreakTime: number;
  attendanceRate: number;
}

export interface AnomalyReportData {
  employeeId: string;
  employeeName: string;
  department: string;
  date: Date;
  anomalyType: 'EXCESSIVE_OVERTIME' | 'MISSING_CLOCKOUT' | 'UNUSUAL_HOURS' | 'FREQUENT_BREAKS' | 'LONG_BREAK' | 'WEEKEND_WORK';
  description: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  timeEntryId?: string;
  suggestedAction?: string;
}

export interface PayrollExportData {
  employeeId: string;
  employeeNumber: string;
  employeeName: string;
  department: string;
  payPeriodStart: Date;
  payPeriodEnd: Date;
  regularHours: number;
  overtimeHours: number;
  doubleTimeHours: number;
  totalHours: number;
  totalBreakTime: number;
  paidBreakTime: number;
  unpaidBreakTime: number;
  adjustments: number;
  grossPay?: number;
}

export interface PayrollExportOptions {
  payPeriodStart: Date;
  payPeriodEnd: Date;
  employeeIds?: string[];
  departmentIds?: string[];
  format: 'CSV' | 'JSON' | 'XML';
  includeBreakdown: boolean;
  includeAdjustments: boolean;
}

export class TimeReportRepository extends SupabaseRepository<any, any, any> {
  constructor() {
    super('time_entries'); // Base table, but we'll use complex queries
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
   * Generate attendance report for specified date range and filters
   */
  async generateAttendanceReport(
    filters: AttendanceReportFilters,
    options?: {
      pagination?: PaginationOptions;
      sort?: SortOptions;
    },
    userContext?: string
  ): Promise<PaginatedResult<AttendanceReportData>> {
    const client = this.getClient(userContext);
    const { dateRange, employeeIds, departmentIds, includeBreaks, includeOvertimeOnly, includeAnomalies } = filters;

    // Build complex query for attendance data
    let query = `
      SELECT 
        te.employee_id,
        e.first_name || ' ' || e.last_name as employee_name,
        d.name as department,
        DATE(te.clock_in_time) as date,
        te.clock_in_time,
        te.clock_out_time,
        COALESCE(te.total_hours, 0) as total_hours,
        COALESCE(te.regular_hours, 0) as regular_hours,
        COALESCE(te.overtime_hours, 0) as overtime_hours,
        te.manual_entry,
        te.status,
        te.id as time_entry_id
      FROM time_entries te
      JOIN employees e ON te.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE DATE(te.clock_in_time) >= $1 
        AND DATE(te.clock_in_time) <= $2
    `;

    const queryParams: any[] = [
      dateRange.start.toISOString().split('T')[0],
      dateRange.end.toISOString().split('T')[0]
    ];

    let paramIndex = 3;

    if (employeeIds && employeeIds.length > 0) {
      query += ` AND te.employee_id = ANY($${paramIndex})`;
      queryParams.push(employeeIds);
      paramIndex++;
    }

    if (departmentIds && departmentIds.length > 0) {
      query += ` AND e.department_id = ANY($${paramIndex})`;
      queryParams.push(departmentIds);
      paramIndex++;
    }

    if (includeOvertimeOnly) {
      query += ` AND te.overtime_hours > 0`;
    }

    // Add sorting
    const sortField = options?.sort?.field || 'date';
    const sortDirection = options?.sort?.direction || 'DESC';
    query += ` ORDER BY ${sortField} ${sortDirection}`;

    // Execute main query
    const { data: timeEntries, error } = await client.rpc('execute_sql', {
      sql: query,
      params: queryParams
    });

    if (error) {
      throw new Error(`Attendance report query failed: ${error.message}`);
    }

    // Process results and add break time data if requested
    const reportData: AttendanceReportData[] = [];

    for (const entry of timeEntries || []) {
      let breakTime = 0;
      let paidBreakTime = 0;
      let unpaidBreakTime = 0;

      if (includeBreaks) {
        const breakData = await this.getBreakTimeForEntry(entry.time_entry_id, userContext);
        breakTime = breakData.total;
        paidBreakTime = breakData.paid;
        unpaidBreakTime = breakData.unpaid;
      }

      // Calculate status and anomalies
      const status = this.calculateAttendanceStatus(entry);
      const { lateMinutes, earlyDepartureMinutes } = this.calculateTimeDeviations(entry);
      const anomalies = includeAnomalies ? await this.detectAnomalies(entry, userContext) : [];

      reportData.push({
        employeeId: entry.employee_id,
        employeeName: entry.employee_name,
        department: entry.department || 'Unknown',
        date: new Date(entry.date),
        clockInTime: entry.clock_in_time ? new Date(entry.clock_in_time) : undefined,
        clockOutTime: entry.clock_out_time ? new Date(entry.clock_out_time) : undefined,
        totalHours: parseFloat(entry.total_hours) || 0,
        regularHours: parseFloat(entry.regular_hours) || 0,
        overtimeHours: parseFloat(entry.overtime_hours) || 0,
        breakTime,
        paidBreakTime,
        unpaidBreakTime,
        status,
        lateMinutes,
        earlyDepartureMinutes,
        isManualEntry: entry.manual_entry,
        anomalies
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
   * Generate time summary report for employees
   */
  async generateTimeSummaryReport(
    dateRange: { start: Date; end: Date },
    employeeIds?: string[],
    userContext?: string
  ): Promise<TimeSummaryReportData[]> {
    const client = this.getClient(userContext);

    let query = `
      SELECT 
        te.employee_id,
        e.first_name || ' ' || e.last_name as employee_name,
        d.name as department,
        COUNT(DISTINCT DATE(te.clock_in_time)) as present_days,
        SUM(COALESCE(te.total_hours, 0)) as total_hours,
        SUM(COALESCE(te.regular_hours, 0)) as regular_hours,
        SUM(COALESCE(te.overtime_hours, 0)) as overtime_hours,
        COUNT(CASE WHEN te.clock_in_time::time > '09:00:00' THEN 1 END) as late_days
      FROM time_entries te
      JOIN employees e ON te.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE DATE(te.clock_in_time) >= $1 
        AND DATE(te.clock_in_time) <= $2
        AND te.status = 'COMPLETED'
    `;

    const queryParams: any[] = [
      dateRange.start.toISOString().split('T')[0],
      dateRange.end.toISOString().split('T')[0]
    ];

    if (employeeIds && employeeIds.length > 0) {
      query += ` AND te.employee_id = ANY($3)`;
      queryParams.push(employeeIds);
    }

    query += ` GROUP BY te.employee_id, e.first_name, e.last_name, d.name`;

    const { data: summaryData, error } = await client.rpc('execute_sql', {
      sql: query,
      params: queryParams
    });

    if (error) {
      throw new Error(`Time summary report query failed: ${error.message}`);
    }

    // Calculate additional metrics
    const workDays = this.calculateWorkDays(dateRange.start, dateRange.end);
    
    return (summaryData || []).map((row: any) => {
      const presentDays = parseInt(row.present_days) || 0;
      const totalHours = parseFloat(row.total_hours) || 0;
      const regularHours = parseFloat(row.regular_hours) || 0;
      const overtimeHours = parseFloat(row.overtime_hours) || 0;
      const lateDays = parseInt(row.late_days) || 0;

      return {
        employeeId: row.employee_id,
        employeeName: row.employee_name,
        department: row.department || 'Unknown',
        period: dateRange,
        totalDays: workDays,
        workDays,
        presentDays,
        absentDays: workDays - presentDays,
        lateDays,
        totalHours,
        regularHours,
        overtimeHours,
        averageHoursPerDay: presentDays > 0 ? totalHours / presentDays : 0,
        totalBreakTime: 0, // Will be calculated separately if needed
        attendanceRate: workDays > 0 ? (presentDays / workDays) * 100 : 0
      };
    });
  }

  /**
   * Generate anomaly report for attendance issues
   */
  async generateAnomalyReport(
    dateRange: { start: Date; end: Date },
    employeeIds?: string[],
    userContext?: string
  ): Promise<AnomalyReportData[]> {
    const client = this.getClient(userContext);
    const anomalies: AnomalyReportData[] = [];

    // Find excessive overtime
    const overtimeAnomalies = await this.findExcessiveOvertimeAnomalies(dateRange, employeeIds, userContext);
    anomalies.push(...overtimeAnomalies);

    // Find missing clock-outs
    const missingClockoutAnomalies = await this.findMissingClockoutAnomalies(dateRange, employeeIds, userContext);
    anomalies.push(...missingClockoutAnomalies);

    // Find unusual hours patterns
    const unusualHoursAnomalies = await this.findUnusualHoursAnomalies(dateRange, employeeIds, userContext);
    anomalies.push(...unusualHoursAnomalies);

    // Find weekend work
    const weekendWorkAnomalies = await this.findWeekendWorkAnomalies(dateRange, employeeIds, userContext);
    anomalies.push(...weekendWorkAnomalies);

    return anomalies.sort((a, b) => {
      const severityOrder = { HIGH: 3, MEDIUM: 2, LOW: 1 };
      return severityOrder[b.severity] - severityOrder[a.severity];
    });
  }

  /**
   * Generate payroll export data
   */
  async generatePayrollExport(
    options: PayrollExportOptions,
    userContext?: string
  ): Promise<PayrollExportData[]> {
    const client = this.getClient(userContext);
    const { payPeriodStart, payPeriodEnd, employeeIds, departmentIds } = options;

    let query = `
      SELECT 
        e.id as employee_id,
        e.employee_number,
        e.first_name || ' ' || e.last_name as employee_name,
        d.name as department,
        SUM(COALESCE(te.regular_hours, 0)) as regular_hours,
        SUM(COALESCE(te.overtime_hours, 0)) as overtime_hours,
        SUM(CASE WHEN te.overtime_hours > 8 THEN te.overtime_hours - 8 ELSE 0 END) as double_time_hours,
        SUM(COALESCE(te.total_hours, 0)) as total_hours
      FROM employees e
      LEFT JOIN time_entries te ON e.id = te.employee_id 
        AND DATE(te.clock_in_time) >= $1 
        AND DATE(te.clock_in_time) <= $2
        AND te.status = 'COMPLETED'
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE e.status = 'ACTIVE'
    `;

    const queryParams: any[] = [
      payPeriodStart.toISOString().split('T')[0],
      payPeriodEnd.toISOString().split('T')[0]
    ];

    let paramIndex = 3;

    if (employeeIds && employeeIds.length > 0) {
      query += ` AND e.id = ANY($${paramIndex})`;
      queryParams.push(employeeIds);
      paramIndex++;
    }

    if (departmentIds && departmentIds.length > 0) {
      query += ` AND e.department_id = ANY($${paramIndex})`;
      queryParams.push(departmentIds);
      paramIndex++;
    }

    query += ` GROUP BY e.id, e.employee_number, e.first_name, e.last_name, d.name ORDER BY e.employee_number`;

    const { data: payrollData, error } = await client.rpc('execute_sql', {
      sql: query,
      params: queryParams
    });

    if (error) {
      throw new Error(`Payroll export query failed: ${error.message}`);
    }

    const results: PayrollExportData[] = [];

    for (const row of payrollData || []) {
      const regularHours = parseFloat(row.regular_hours) || 0;
      const overtimeHours = parseFloat(row.overtime_hours) || 0;
      const doubleTimeHours = parseFloat(row.double_time_hours) || 0;
      const totalHours = parseFloat(row.total_hours) || 0;

      // Get break time data if requested
      let totalBreakTime = 0;
      let paidBreakTime = 0;
      let unpaidBreakTime = 0;

      if (options.includeBreakdown) {
        const breakData = await this.getBreakTimeForEmployee(
          row.employee_id,
          payPeriodStart,
          payPeriodEnd,
          userContext
        );
        totalBreakTime = breakData.total;
        paidBreakTime = breakData.paid;
        unpaidBreakTime = breakData.unpaid;
      }

      results.push({
        employeeId: row.employee_id,
        employeeNumber: row.employee_number || '',
        employeeName: row.employee_name,
        department: row.department || 'Unknown',
        payPeriodStart,
        payPeriodEnd,
        regularHours,
        overtimeHours,
        doubleTimeHours,
        totalHours,
        totalBreakTime,
        paidBreakTime,
        unpaidBreakTime,
        adjustments: 0 // Would be calculated from manual adjustments
      });
    }

    return results;
  }

  /**
   * Export payroll data in specified format
   */
  async exportPayrollData(
    options: PayrollExportOptions,
    userContext?: string
  ): Promise<{ data: string; filename: string; contentType: string }> {
    const payrollData = await this.generatePayrollExport(options, userContext);
    
    const filename = `payroll_export_${options.payPeriodStart.toISOString().split('T')[0]}_to_${options.payPeriodEnd.toISOString().split('T')[0]}`;

    switch (options.format) {
      case 'CSV':
        return {
          data: this.formatAsCSV(payrollData),
          filename: `${filename}.csv`,
          contentType: 'text/csv'
        };
      case 'JSON':
        return {
          data: JSON.stringify(payrollData, null, 2),
          filename: `${filename}.json`,
          contentType: 'application/json'
        };
      case 'XML':
        return {
          data: this.formatAsXML(payrollData),
          filename: `${filename}.xml`,
          contentType: 'application/xml'
        };
      default:
        throw new Error(`Unsupported export format: ${options.format}`);
    }
  }

  // Helper methods

  private async getBreakTimeForEntry(timeEntryId: string, userContext?: string): Promise<{ total: number; paid: number; unpaid: number }> {
    const client = this.getClient(userContext);

    const { data: breakEntries, error } = await client
      .from('break_entries')
      .select('duration, paid')
      .eq('time_entry_id', timeEntryId);

    if (error) {
      return { total: 0, paid: 0, unpaid: 0 };
    }

    let total = 0;
    let paid = 0;
    let unpaid = 0;

    for (const entry of breakEntries || []) {
      const duration = entry.duration || 0;
      total += duration;
      if (entry.paid) {
        paid += duration;
      } else {
        unpaid += duration;
      }
    }

    return { total, paid, unpaid };
  }

  private async getBreakTimeForEmployee(
    employeeId: string,
    startDate: Date,
    endDate: Date,
    userContext?: string
  ): Promise<{ total: number; paid: number; unpaid: number }> {
    const client = this.getClient(userContext);

    const query = `
      SELECT 
        SUM(COALESCE(be.duration, 0)) as total_break_time,
        SUM(CASE WHEN be.paid THEN COALESCE(be.duration, 0) ELSE 0 END) as paid_break_time,
        SUM(CASE WHEN NOT be.paid THEN COALESCE(be.duration, 0) ELSE 0 END) as unpaid_break_time
      FROM break_entries be
      JOIN time_entries te ON be.time_entry_id = te.id
      WHERE te.employee_id = $1
        AND DATE(te.clock_in_time) >= $2
        AND DATE(te.clock_in_time) <= $3
    `;

    const { data, error } = await client.rpc('execute_sql', {
      sql: query,
      params: [employeeId, startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]]
    });

    if (error || !data || data.length === 0) {
      return { total: 0, paid: 0, unpaid: 0 };
    }

    const row = data[0];
    return {
      total: parseFloat(row.total_break_time) || 0,
      paid: parseFloat(row.paid_break_time) || 0,
      unpaid: parseFloat(row.unpaid_break_time) || 0
    };
  }

  private calculateAttendanceStatus(entry: any): 'PRESENT' | 'ABSENT' | 'PARTIAL' | 'LATE' | 'EARLY_DEPARTURE' {
    if (!entry.clock_in_time) return 'ABSENT';
    if (!entry.clock_out_time) return 'PARTIAL';

    const clockInTime = new Date(entry.clock_in_time);
    const clockOutTime = new Date(entry.clock_out_time);
    
    // Standard work hours: 9 AM to 5 PM
    const standardStart = new Date(clockInTime);
    standardStart.setHours(9, 0, 0, 0);
    
    const standardEnd = new Date(clockInTime);
    standardEnd.setHours(17, 0, 0, 0);

    const isLate = clockInTime > standardStart;
    const isEarlyDeparture = clockOutTime < standardEnd;

    if (isLate) return 'LATE';
    if (isEarlyDeparture) return 'EARLY_DEPARTURE';
    
    return 'PRESENT';
  }

  private calculateTimeDeviations(entry: any): { lateMinutes: number; earlyDepartureMinutes: number } {
    if (!entry.clock_in_time) return { lateMinutes: 0, earlyDepartureMinutes: 0 };

    const clockInTime = new Date(entry.clock_in_time);
    const clockOutTime = entry.clock_out_time ? new Date(entry.clock_out_time) : null;
    
    const standardStart = new Date(clockInTime);
    standardStart.setHours(9, 0, 0, 0);
    
    const standardEnd = new Date(clockInTime);
    standardEnd.setHours(17, 0, 0, 0);

    const lateMinutes = clockInTime > standardStart 
      ? Math.round((clockInTime.getTime() - standardStart.getTime()) / (1000 * 60))
      : 0;

    const earlyDepartureMinutes = clockOutTime && clockOutTime < standardEnd
      ? Math.round((standardEnd.getTime() - clockOutTime.getTime()) / (1000 * 60))
      : 0;

    return { lateMinutes, earlyDepartureMinutes };
  }

  private async detectAnomalies(entry: any, userContext?: string): Promise<string[]> {
    const anomalies: string[] = [];

    // Check for excessive hours
    if (entry.total_hours > 12) {
      anomalies.push('Excessive daily hours (>12 hours)');
    }

    // Check for missing clock out
    if (entry.clock_in_time && !entry.clock_out_time) {
      anomalies.push('Missing clock out');
    }

    // Check for weekend work
    const date = new Date(entry.date);
    if (date.getDay() === 0 || date.getDay() === 6) {
      anomalies.push('Weekend work');
    }

    return anomalies;
  }

  private calculateWorkDays(startDate: Date, endDate: Date): number {
    let count = 0;
    const current = new Date(startDate);
    
    while (current <= endDate) {
      const dayOfWeek = current.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Not Sunday (0) or Saturday (6)
        count++;
      }
      current.setDate(current.getDate() + 1);
    }
    
    return count;
  }

  private async findExcessiveOvertimeAnomalies(
    dateRange: { start: Date; end: Date },
    employeeIds?: string[],
    userContext?: string
  ): Promise<AnomalyReportData[]> {
    const client = this.getClient(userContext);

    let query = `
      SELECT 
        te.employee_id,
        e.first_name || ' ' || e.last_name as employee_name,
        d.name as department,
        DATE(te.clock_in_time) as date,
        te.overtime_hours,
        te.id as time_entry_id
      FROM time_entries te
      JOIN employees e ON te.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE DATE(te.clock_in_time) >= $1 
        AND DATE(te.clock_in_time) <= $2
        AND te.overtime_hours > 4
    `;

    const queryParams: any[] = [
      dateRange.start.toISOString().split('T')[0],
      dateRange.end.toISOString().split('T')[0]
    ];

    if (employeeIds && employeeIds.length > 0) {
      query += ` AND te.employee_id = ANY($3)`;
      queryParams.push(employeeIds);
    }

    const { data, error } = await client.rpc('execute_sql', {
      sql: query,
      params: queryParams
    });

    if (error) return [];

    return (data || []).map((row: any) => ({
      employeeId: row.employee_id,
      employeeName: row.employee_name,
      department: row.department || 'Unknown',
      date: new Date(row.date),
      anomalyType: 'EXCESSIVE_OVERTIME' as const,
      description: `Excessive overtime: ${row.overtime_hours} hours`,
      severity: row.overtime_hours > 8 ? 'HIGH' as const : 'MEDIUM' as const,
      timeEntryId: row.time_entry_id,
      suggestedAction: 'Review workload and approve overtime if necessary'
    }));
  }

  private async findMissingClockoutAnomalies(
    dateRange: { start: Date; end: Date },
    employeeIds?: string[],
    userContext?: string
  ): Promise<AnomalyReportData[]> {
    const client = this.getClient(userContext);

    let query = `
      SELECT 
        te.employee_id,
        e.first_name || ' ' || e.last_name as employee_name,
        d.name as department,
        DATE(te.clock_in_time) as date,
        te.id as time_entry_id
      FROM time_entries te
      JOIN employees e ON te.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE DATE(te.clock_in_time) >= $1 
        AND DATE(te.clock_in_time) <= $2
        AND te.clock_out_time IS NULL
        AND te.status = 'ACTIVE'
    `;

    const queryParams: any[] = [
      dateRange.start.toISOString().split('T')[0],
      dateRange.end.toISOString().split('T')[0]
    ];

    if (employeeIds && employeeIds.length > 0) {
      query += ` AND te.employee_id = ANY($3)`;
      queryParams.push(employeeIds);
    }

    const { data, error } = await client.rpc('execute_sql', {
      sql: query,
      params: queryParams
    });

    if (error) return [];

    return (data || []).map((row: any) => ({
      employeeId: row.employee_id,
      employeeName: row.employee_name,
      department: row.department || 'Unknown',
      date: new Date(row.date),
      anomalyType: 'MISSING_CLOCKOUT' as const,
      description: 'Missing clock out time',
      severity: 'HIGH' as const,
      timeEntryId: row.time_entry_id,
      suggestedAction: 'Contact employee to confirm end time and update record'
    }));
  }

  private async findUnusualHoursAnomalies(
    dateRange: { start: Date; end: Date },
    employeeIds?: string[],
    userContext?: string
  ): Promise<AnomalyReportData[]> {
    // Implementation for unusual hours detection
    return [];
  }

  private async findWeekendWorkAnomalies(
    dateRange: { start: Date; end: Date },
    employeeIds?: string[],
    userContext?: string
  ): Promise<AnomalyReportData[]> {
    const client = this.getClient(userContext);

    let query = `
      SELECT 
        te.employee_id,
        e.first_name || ' ' || e.last_name as employee_name,
        d.name as department,
        DATE(te.clock_in_time) as date,
        te.total_hours,
        te.id as time_entry_id
      FROM time_entries te
      JOIN employees e ON te.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE DATE(te.clock_in_time) >= $1 
        AND DATE(te.clock_in_time) <= $2
        AND EXTRACT(DOW FROM te.clock_in_time) IN (0, 6)
    `;

    const queryParams: any[] = [
      dateRange.start.toISOString().split('T')[0],
      dateRange.end.toISOString().split('T')[0]
    ];

    if (employeeIds && employeeIds.length > 0) {
      query += ` AND te.employee_id = ANY($3)`;
      queryParams.push(employeeIds);
    }

    const { data, error } = await client.rpc('execute_sql', {
      sql: query,
      params: queryParams
    });

    if (error) return [];

    return (data || []).map((row: any) => ({
      employeeId: row.employee_id,
      employeeName: row.employee_name,
      department: row.department || 'Unknown',
      date: new Date(row.date),
      anomalyType: 'WEEKEND_WORK' as const,
      description: `Weekend work: ${row.total_hours} hours`,
      severity: 'MEDIUM' as const,
      timeEntryId: row.time_entry_id,
      suggestedAction: 'Verify if weekend work was authorized'
    }));
  }

  private formatAsCSV(data: PayrollExportData[]): string {
    if (data.length === 0) return '';

    const headers = Object.keys(data[0]).join(',');
    const rows = data.map(row => 
      Object.values(row).map(value => 
        typeof value === 'string' ? `"${value}"` : value
      ).join(',')
    );

    return [headers, ...rows].join('\n');
  }

  private formatAsXML(data: PayrollExportData[]): string {
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<payroll>\n';
    
    for (const record of data) {
      xml += '  <employee>\n';
      for (const [key, value] of Object.entries(record)) {
        xml += `    <${key}>${value}</${key}>\n`;
      }
      xml += '  </employee>\n';
    }
    
    xml += '</payroll>';
    return xml;
  }
}