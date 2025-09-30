import { SupabaseRepository } from '../supabase-base';
import { BreakEntry } from '../../../models/time-attendance/TimeEntry';
export class BreakEntryRepository extends SupabaseRepository {
    constructor() {
        super('break_entries');
    }
    /**
     * Create a new break entry
     */
    async create(data, userContext) {
        const client = this.getClient(userContext);
        // Convert to database format
        const breakEntryData = {
            time_entry_id: data.timeEntryId,
            break_type: data.breakType,
            start_time: data.startTime.toISOString(),
            end_time: data.endTime?.toISOString() || null,
            duration: data.duration || null,
            paid: data.paid,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };
        const breakEntry = await this.executeQuery(client.from(this.tableName).insert(breakEntryData).select().single(), 'create break entry');
        return this.mapToBreakEntry(breakEntry);
    }
    /**
     * Find break entry by ID
     */
    async findById(id, userContext) {
        const client = this.getClient(userContext);
        const breakEntry = await this.executeQuery(client
            .from(this.tableName)
            .select('*')
            .eq('id', id)
            .single(), 'find break entry by id');
        if (!breakEntry)
            return null;
        return this.mapToBreakEntry(breakEntry);
    }
    /**
     * Update break entry
     */
    async update(id, data, userContext) {
        const client = this.getClient(userContext);
        const updateData = {
            updated_at: new Date().toISOString()
        };
        if (data.endTime !== undefined) {
            updateData.end_time = data.endTime?.toISOString() || null;
        }
        if (data.duration !== undefined)
            updateData.duration = data.duration;
        if (data.paid !== undefined)
            updateData.paid = data.paid;
        const updatedEntry = await this.executeQuery(client
            .from(this.tableName)
            .update(updateData)
            .eq('id', id)
            .select()
            .single(), 'update break entry');
        if (!updatedEntry)
            return null;
        return this.mapToBreakEntry(updatedEntry);
    }
    /**
     * Delete break entry
     */
    async delete(id, userContext) {
        const client = this.getClient(userContext);
        const { error } = await client.from(this.tableName).delete().eq('id', id);
        return !error;
    }
    /**
     * Find break entries with advanced filtering
     */
    async findAll(options, userContext) {
        const { pagination, sort, filters } = options || {};
        const client = this.getClient(userContext);
        // Build query with time entry join for employee filtering
        let query = client
            .from(this.tableName)
            .select(`
        *,
        time_entries!inner (
          employee_id,
          clock_in_time
        )
      `, { count: 'exact' });
        // Apply filters
        if (filters) {
            if (filters.timeEntryId) {
                query = query.eq('time_entry_id', filters.timeEntryId);
            }
            if (filters.employeeId) {
                query = query.eq('time_entries.employee_id', filters.employeeId);
            }
            if (filters.breakType) {
                query = query.eq('break_type', filters.breakType);
            }
            if (filters.paid !== undefined) {
                query = query.eq('paid', filters.paid);
            }
            if (filters.active) {
                query = query.is('end_time', null);
            }
            if (filters.dateRange) {
                query = query
                    .gte('start_time', filters.dateRange.start.toISOString())
                    .lte('start_time', filters.dateRange.end.toISOString());
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
            throw new Error('Failed to fetch break entries');
        }
        const breakEntries = data.map(entry => this.mapToBreakEntry(entry));
        const page = pagination?.page || 1;
        const limit = pagination?.limit || 25;
        const paginationMeta = this.calculatePaginationMeta(count || 0, page, limit);
        return {
            data: breakEntries,
            pagination: paginationMeta
        };
    }
    /**
     * Find break entries for a time entry
     */
    async findByTimeEntry(timeEntryId, userContext) {
        const result = await this.findAll({
            filters: { timeEntryId },
            sort: { field: 'start_time', direction: 'ASC' }
        }, userContext);
        return result.data;
    }
    /**
     * Find active break for employee
     */
    async findActiveBreak(employeeId, userContext) {
        const client = this.getClient(userContext);
        const breakEntry = await this.executeQuery(client
            .from(this.tableName)
            .select(`
          *,
          time_entries!inner (
            employee_id,
            status
          )
        `)
            .eq('time_entries.employee_id', employeeId)
            .eq('time_entries.status', 'ACTIVE')
            .is('end_time', null)
            .order('start_time', { ascending: false })
            .limit(1)
            .maybeSingle(), 'find active break');
        return breakEntry ? this.mapToBreakEntry(breakEntry) : null;
    }
    /**
     * End an active break
     */
    async endBreak(breakId, endTime = new Date(), userContext) {
        const breakEntry = await this.findById(breakId, userContext);
        if (!breakEntry) {
            throw new Error('Break entry not found');
        }
        if (breakEntry.endTime) {
            throw new Error('Break has already ended');
        }
        // Calculate duration in minutes
        const duration = Math.floor((endTime.getTime() - breakEntry.startTime.getTime()) / (1000 * 60));
        return this.update(breakId, {
            endTime,
            duration
        }, userContext);
    }
    /**
     * Get break summary for employee and date range
     */
    async getBreakSummary(employeeId, startDate, endDate, userContext) {
        const client = this.getClient(userContext);
        const query = `
      SELECT
        te.employee_id,
        DATE(be.start_time) as break_date,
        SUM(COALESCE(be.duration, 0)) as total_break_time,
        SUM(CASE WHEN be.paid = true THEN COALESCE(be.duration, 0) ELSE 0 END) as paid_break_time,
        SUM(CASE WHEN be.paid = false THEN COALESCE(be.duration, 0) ELSE 0 END) as unpaid_break_time,
        COUNT(*) as break_count,
        COUNT(CASE WHEN be.break_type = 'LUNCH' THEN 1 END) as lunch_breaks,
        COUNT(CASE WHEN be.break_type = 'SHORT_BREAK' THEN 1 END) as short_breaks,
        COUNT(CASE WHEN be.break_type = 'PERSONAL' THEN 1 END) as personal_breaks
      FROM break_entries be
      INNER JOIN time_entries te ON be.time_entry_id = te.id
      WHERE te.employee_id = $1
        AND be.start_time >= $2
        AND be.start_time <= $3
        AND be.end_time IS NOT NULL
      GROUP BY te.employee_id, DATE(be.start_time)
      ORDER BY break_date ASC
    `;
        const { data, error } = await client.rpc('execute_sql', {
            sql: query,
            params: [employeeId, startDate.toISOString(), endDate.toISOString()]
        });
        if (error) {
            throw new Error(`Break summary query failed: ${error.message}`);
        }
        return (data || []).map((row) => ({
            employeeId: row.employee_id,
            date: row.break_date,
            totalBreakTime: parseInt(row.total_break_time) || 0,
            paidBreakTime: parseInt(row.paid_break_time) || 0,
            unpaidBreakTime: parseInt(row.unpaid_break_time) || 0,
            breakCount: parseInt(row.break_count) || 0,
            breaksByType: {
                LUNCH: parseInt(row.lunch_breaks) || 0,
                SHORT_BREAK: parseInt(row.short_breaks) || 0,
                PERSONAL: parseInt(row.personal_breaks) || 0
            }
        }));
    }
    /**
     * Find breaks by date range
     */
    async findByDateRange(employeeId, startDate, endDate, userContext) {
        const result = await this.findAll({
            filters: {
                employeeId,
                dateRange: { start: startDate, end: endDate }
            },
            sort: { field: 'start_time', direction: 'ASC' }
        }, userContext);
        return result.data;
    }
    /**
     * Validate break rules for employee
     */
    async validateBreakRules(employeeId, breakType, date = new Date(), userContext) {
        const violations = [];
        const warnings = [];
        // Get breaks for the day
        const startOfDay = new Date(date);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(date);
        endOfDay.setHours(23, 59, 59, 999);
        const todayBreaks = await this.findByDateRange(employeeId, startOfDay, endOfDay, userContext);
        // Check for active break
        const activeBreak = await this.findActiveBreak(employeeId, userContext);
        if (activeBreak) {
            violations.push('Employee is already on an active break');
        }
        // Break-specific rules
        switch (breakType) {
            case 'LUNCH':
                const lunchBreaks = todayBreaks.filter(b => b.breakType === 'LUNCH');
                if (lunchBreaks.length >= 1) {
                    warnings.push('Employee has already taken a lunch break today');
                }
                break;
            case 'SHORT_BREAK':
                const shortBreaks = todayBreaks.filter(b => b.breakType === 'SHORT_BREAK');
                if (shortBreaks.length >= 3) {
                    violations.push('Maximum of 3 short breaks per day exceeded');
                }
                break;
            case 'PERSONAL':
                const personalBreaks = todayBreaks.filter(b => b.breakType === 'PERSONAL');
                if (personalBreaks.length >= 2) {
                    warnings.push('Employee has already taken 2 personal breaks today');
                }
                break;
        }
        return {
            isValid: violations.length === 0,
            violations,
            warnings
        };
    }
    /**
     * Map database row to BreakEntry model
     */
    mapToBreakEntry(row) {
        const breakEntryData = {
            id: row.id,
            timeEntryId: row.time_entry_id,
            breakType: row.break_type,
            startTime: new Date(row.start_time),
            endTime: row.end_time ? new Date(row.end_time) : undefined,
            duration: row.duration,
            paid: row.paid
        };
        return new BreakEntry(breakEntryData);
    }
}
