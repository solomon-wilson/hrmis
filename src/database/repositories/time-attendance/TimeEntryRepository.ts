import { SupabaseRepository, PaginatedResult, FilterOptions, SortOptions, PaginationOptions } from '../supabase-base';
import { TimeEntry, TimeEntryData, BreakEntry, BreakEntryData } from '../../../models/time-attendance/TimeEntry';
import { EmployeeTimeStatus } from '../../../models/time-attendance/EmployeeTimeStatus';

export interface TimeEntryCreateInput {
  employeeId: string;
  clockInTime: Date;
  clockOutTime?: Date;
  breakEntries?: BreakEntryData[];
  location?: {
    latitude: number;
    longitude: number;
    accuracy?: number;
  };
  status?: 'ACTIVE' | 'COMPLETED' | 'PENDING_APPROVAL';
  manualEntry?: boolean;
  notes?: string;
}

export interface TimeEntryUpdateInput {
  clockOutTime?: Date;
  breakEntries?: BreakEntryData[];
  totalHours?: number;
  regularHours?: number;
  overtimeHours?: number;
  status?: 'ACTIVE' | 'COMPLETED' | 'PENDING_APPROVAL';
  approvedBy?: string;
  approvedAt?: Date;
  notes?: string;
}

export interface TimeEntryFilters extends FilterOptions {
  employeeId?: string;
  status?: 'ACTIVE' | 'COMPLETED' | 'PENDING_APPROVAL';
  dateRange?: {
    start: Date;
    end: Date;
  };
  manualEntry?: boolean;
  approvalRequired?: boolean;
}

export interface EmployeeTimeQuery {
  employeeId: string;
  date?: Date;
  includeBreaks?: boolean;
}

export interface IncompleteTimeEntry {
  id: string;
  employeeId: string;
  clockInTime: Date;
  daysSinceClockIn: number;
  location?: {
    latitude: number;
    longitude: number;
    accuracy?: number;
  };
}

export class TimeEntryRepository extends SupabaseRepository<TimeEntry, TimeEntryCreateInput, TimeEntryUpdateInput> {
  constructor() {
    super('time_entries');
  }

  /**
   * Create a new time entry
   */
  async create(data: TimeEntryCreateInput, userContext?: string): Promise<TimeEntry> {
    const client = this.getClient(userContext);

    // Convert to database format
    const timeEntryData = {
      employee_id: data.employeeId,
      clock_in_time: data.clockInTime.toISOString(),
      clock_out_time: data.clockOutTime?.toISOString() || null,
      location: data.location || null,
      status: data.status || 'ACTIVE',
      manual_entry: data.manualEntry || false,
      notes: data.notes || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const timeEntry = await this.executeQuery<any>(
      client.from(this.tableName).insert(timeEntryData).select().single(),
      'create time entry'
    );

    // Create break entries if provided
    if (data.breakEntries && data.breakEntries.length > 0) {
      await this.createBreakEntries(timeEntry.id, data.breakEntries, userContext);
    }

    return this.mapToTimeEntry(timeEntry);
  }

  /**
   * Find time entry by ID with break entries
   */
  async findById(id: string, userContext?: string): Promise<TimeEntry | null> {
    const client = this.getClient(userContext);

    const timeEntry = await this.executeQuery<any>(
      client
        .from(this.tableName)
        .select(`
          *,
          break_entries (
            id,
            break_type,
            start_time,
            end_time,
            duration,
            paid
          )
        `)
        .eq('id', id)
        .single(),
      'find time entry by id'
    );

    if (!timeEntry) return null;

    return this.mapToTimeEntry(timeEntry);
  }

  /**
   * Update time entry
   */
  async update(id: string, data: TimeEntryUpdateInput, userContext?: string): Promise<TimeEntry | null> {
    const client = this.getClient(userContext);

    const updateData: any = {
      updated_at: new Date().toISOString()
    };

    if (data.clockOutTime !== undefined) {
      updateData.clock_out_time = data.clockOutTime?.toISOString() || null;
    }
    if (data.totalHours !== undefined) updateData.total_hours = data.totalHours;
    if (data.regularHours !== undefined) updateData.regular_hours = data.regularHours;
    if (data.overtimeHours !== undefined) updateData.overtime_hours = data.overtimeHours;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.approvedBy !== undefined) updateData.approved_by = data.approvedBy;
    if (data.approvedAt !== undefined) updateData.approved_at = data.approvedAt?.toISOString();
    if (data.notes !== undefined) updateData.notes = data.notes;

    const updatedEntry = await this.executeQuery<any>(
      client
        .from(this.tableName)
        .update(updateData)
        .eq('id', id)
        .select()
        .single(),
      'update time entry'
    );

    if (!updatedEntry) return null;

    // Update break entries if provided
    if (data.breakEntries) {
      await this.updateBreakEntries(id, data.breakEntries, userContext);
    }

    return this.findById(id, userContext);
  }

  /**
   * Delete time entry and associated break entries
   */
  async delete(id: string, userContext?: string): Promise<boolean> {
    const client = this.getClient(userContext);

    // Delete break entries first
    await this.executeQuery(
      client.from('break_entries').delete().eq('time_entry_id', id),
      'delete break entries'
    );

    // Delete time entry
    const { error } = await client.from(this.tableName).delete().eq('id', id);

    return !error;
  }

  /**
   * Find time entries with advanced filtering
   */
  async findAll(options?: {
    pagination?: PaginationOptions;
    sort?: SortOptions;
    filters?: TimeEntryFilters;
  }, userContext?: string): Promise<PaginatedResult<TimeEntry>> {
    const { pagination, sort, filters } = options || {};

    const client = this.getClient(userContext);

    // Build query with joins
    let query = client
      .from(this.tableName)
      .select(`
        *,
        break_entries (
          id,
          break_type,
          start_time,
          end_time,
          duration,
          paid
        )
      `, { count: 'exact' });

    // Apply filters
    if (filters) {
      if (filters.employeeId) {
        query = query.eq('employee_id', filters.employeeId);
      }
      if (filters.status) {
        query = query.eq('status', filters.status);
      }
      if (filters.manualEntry !== undefined) {
        query = query.eq('manual_entry', filters.manualEntry);
      }
      if (filters.approvalRequired) {
        query = query.eq('status', 'PENDING_APPROVAL');
      }
      if (filters.dateRange) {
        query = query
          .gte('clock_in_time', filters.dateRange.start.toISOString())
          .lte('clock_in_time', filters.dateRange.end.toISOString());
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
      throw new Error('Failed to fetch time entries');
    }

    const timeEntries = data.map(entry => this.mapToTimeEntry(entry));

    const page = pagination?.page || 1;
    const limit = pagination?.limit || 25;
    const paginationMeta = this.calculatePaginationMeta(count || 0, page, limit);

    return {
      data: timeEntries,
      pagination: paginationMeta
    };
  }

  /**
   * Find current active time entry for employee
   */
  async findActiveTimeEntry(employeeId: string, userContext?: string): Promise<TimeEntry | null> {
    const client = this.getClient(userContext);

    const entry = await this.executeQuery<any>(
      client
        .from(this.tableName)
        .select(`
          *,
          break_entries (
            id,
            break_type,
            start_time,
            end_time,
            duration,
            paid
          )
        `)
        .eq('employee_id', employeeId)
        .eq('status', 'ACTIVE')
        .order('clock_in_time', { ascending: false })
        .limit(1)
        .maybeSingle(),
      'find active time entry'
    );

    return entry ? this.mapToTimeEntry(entry) : null;
  }

  /**
   * Find time entries for a specific date range
   */
  async findByDateRange(
    employeeId: string,
    startDate: Date,
    endDate: Date,
    userContext?: string
  ): Promise<TimeEntry[]> {
    const result = await this.findAll({
      filters: {
        employeeId,
        dateRange: { start: startDate, end: endDate }
      }
    }, userContext);

    return result.data;
  }

  /**
   * Find incomplete time entries (missing clock out)
   */
  async findIncompleteEntries(userContext?: string): Promise<IncompleteTimeEntry[]> {
    const client = this.getClient(userContext);

    const entries = await this.executeQuery<any[]>(
      client
        .from(this.tableName)
        .select('id, employee_id, clock_in_time, location')
        .eq('status', 'ACTIVE')
        .is('clock_out_time', null)
        .order('clock_in_time', { ascending: true }),
      'find incomplete entries'
    );

    return entries.map(entry => ({
      id: entry.id,
      employeeId: entry.employee_id,
      clockInTime: new Date(entry.clock_in_time),
      daysSinceClockIn: Math.floor(
        (new Date().getTime() - new Date(entry.clock_in_time).getTime()) / (1000 * 60 * 60 * 24)
      ),
      location: entry.location
    }));
  }

  /**
   * Get employee time status
   */
  async getEmployeeTimeStatus(employeeId: string, userContext?: string): Promise<EmployeeTimeStatus | null> {
    const activeEntry = await this.findActiveTimeEntry(employeeId, userContext);

    if (!activeEntry) {
      return null;
    }

    const currentBreak = activeEntry.breakEntries?.find(b => !b.endTime);

    return new EmployeeTimeStatus({
      employeeId,
      isActive: true,
      currentEntry: activeEntry,
      isOnBreak: !!currentBreak,
      currentBreak: currentBreak || undefined,
      lastActivity: activeEntry.clockInTime
    });
  }

  /**
   * Clock out employee
   */
  async clockOut(
    employeeId: string,
    clockOutTime: Date = new Date(),
    userContext?: string
  ): Promise<TimeEntry | null> {
    const activeEntry = await this.findActiveTimeEntry(employeeId, userContext);

    if (!activeEntry) {
      throw new Error('No active time entry found for employee');
    }

    return this.update(activeEntry.id, {
      clockOutTime,
      status: 'COMPLETED'
    }, userContext);
  }

  /**
   * Create break entries for a time entry
   */
  private async createBreakEntries(
    timeEntryId: string,
    breakEntries: BreakEntryData[],
    userContext?: string
  ): Promise<void> {
    const client = this.getClient(userContext);

    const breakData = breakEntries.map(entry => ({
      time_entry_id: timeEntryId,
      break_type: entry.breakType,
      start_time: entry.startTime.toISOString(),
      end_time: entry.endTime?.toISOString() || null,
      duration: entry.duration || null,
      paid: entry.paid
    }));

    await this.executeQuery(
      client.from('break_entries').insert(breakData),
      'create break entries'
    );
  }

  /**
   * Update break entries for a time entry
   */
  private async updateBreakEntries(
    timeEntryId: string,
    breakEntries: BreakEntryData[],
    userContext?: string
  ): Promise<void> {
    const client = this.getClient(userContext);

    // Delete existing break entries
    await this.executeQuery(
      client.from('break_entries').delete().eq('time_entry_id', timeEntryId),
      'delete existing break entries'
    );

    // Create new break entries
    if (breakEntries.length > 0) {
      await this.createBreakEntries(timeEntryId, breakEntries, userContext);
    }
  }

  /**
   * Map database row to TimeEntry model
   */
  private mapToTimeEntry(row: any): TimeEntry {
    const breakEntries = row.break_entries?.map((entry: any) => ({
      id: entry.id,
      timeEntryId: row.id,
      breakType: entry.break_type,
      startTime: new Date(entry.start_time),
      endTime: entry.end_time ? new Date(entry.end_time) : undefined,
      duration: entry.duration,
      paid: entry.paid
    })) || [];

    const timeEntryData: TimeEntryData = {
      id: row.id,
      employeeId: row.employee_id,
      clockInTime: new Date(row.clock_in_time),
      clockOutTime: row.clock_out_time ? new Date(row.clock_out_time) : undefined,
      breakEntries,
      totalHours: row.total_hours,
      regularHours: row.regular_hours,
      overtimeHours: row.overtime_hours,
      location: row.location,
      status: row.status,
      manualEntry: row.manual_entry,
      approvedBy: row.approved_by,
      approvedAt: row.approved_at ? new Date(row.approved_at) : undefined,
      notes: row.notes,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };

    return new TimeEntry(timeEntryData);
  }
}