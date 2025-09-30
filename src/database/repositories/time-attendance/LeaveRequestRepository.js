import { SupabaseRepository } from '../supabase-base';
import { LeaveRequest } from '../../../models/time-attendance/LeaveRequest';
export class LeaveRequestRepository extends SupabaseRepository {
    constructor() {
        super('leave_requests');
    }
    /**
     * Create a new leave request
     */
    async create(data, userContext) {
        const client = this.getClient(userContext);
        // Validate for conflicts before creating
        const conflicts = await this.checkLeaveConflicts(data.employeeId, data.startDate, data.endDate, userContext);
        if (conflicts.length > 0) {
            throw new Error(`Leave request conflicts detected: ${conflicts.map(c => c.conflictDescription).join(', ')}`);
        }
        // Convert to database format
        const leaveRequestData = {
            employee_id: data.employeeId,
            leave_type_id: data.leaveTypeId,
            start_date: data.startDate.toISOString().split('T')[0],
            end_date: data.endDate.toISOString().split('T')[0],
            total_days: data.totalDays,
            reason: data.reason || null,
            notes: data.notes || null,
            manager_notes: data.managerNotes || null,
            status: 'PENDING',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };
        const leaveRequest = await this.executeQuery(client.from(this.tableName).insert(leaveRequestData).select().single(), 'create leave request');
        return this.mapToLeaveRequest(leaveRequest);
    }
    /**
     * Find leave request by ID with related data
     */
    async findById(id, userContext) {
        const client = this.getClient(userContext);
        const leaveRequest = await this.executeQuery(client
            .from(this.tableName)
            .select(`
          *,
          leave_types (
            id,
            name,
            description,
            requires_approval
          ),
          employees (
            id,
            first_name,
            last_name,
            email
          )
        `)
            .eq('id', id)
            .single(), 'find leave request by id');
        if (!leaveRequest)
            return null;
        return this.mapToLeaveRequest(leaveRequest);
    }
    /**
     * Update leave request
     */
    async update(id, data, userContext) {
        const client = this.getClient(userContext);
        const updateData = {
            updated_at: new Date().toISOString()
        };
        if (data.status !== undefined)
            updateData.status = data.status;
        if (data.approvedBy !== undefined)
            updateData.approved_by = data.approvedBy;
        if (data.approvedAt !== undefined)
            updateData.approved_at = data.approvedAt?.toISOString();
        if (data.rejectionReason !== undefined)
            updateData.rejection_reason = data.rejectionReason;
        if (data.managerNotes !== undefined)
            updateData.manager_notes = data.managerNotes;
        if (data.notes !== undefined)
            updateData.notes = data.notes;
        const updatedRequest = await this.executeQuery(client
            .from(this.tableName)
            .update(updateData)
            .eq('id', id)
            .select()
            .single(), 'update leave request');
        if (!updatedRequest)
            return null;
        return this.findById(id, userContext);
    }
    /**
     * Delete leave request (only if pending)
     */
    async delete(id, userContext) {
        const client = this.getClient(userContext);
        // Check if request can be deleted
        const request = await this.findById(id, userContext);
        if (!request)
            return false;
        if (request.status !== 'PENDING') {
            throw new Error('Can only delete pending leave requests');
        }
        const { error } = await client.from(this.tableName).delete().eq('id', id);
        return !error;
    }
    /**
     * Find leave requests with advanced filtering
     */
    async findAll(options, userContext) {
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
          description,
          requires_approval
        ),
        employees (
          id,
          first_name,
          last_name,
          email,
          department_id
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
            if (filters.status) {
                query = query.eq('status', filters.status);
            }
            if (filters.approvedBy) {
                query = query.eq('approved_by', filters.approvedBy);
            }
            if (filters.pendingApproval) {
                query = query.eq('status', 'PENDING');
            }
            if (filters.managerId) {
                // Filter by manager's department
                query = query.eq('employees.department_id', filters.managerId);
            }
            if (filters.dateRange) {
                query = query
                    .gte('start_date', filters.dateRange.start.toISOString().split('T')[0])
                    .lte('end_date', filters.dateRange.end.toISOString().split('T')[0]);
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
            throw new Error('Failed to fetch leave requests');
        }
        const leaveRequests = data.map(request => this.mapToLeaveRequest(request));
        const page = pagination?.page || 1;
        const limit = pagination?.limit || 25;
        const paginationMeta = this.calculatePaginationMeta(count || 0, page, limit);
        return {
            data: leaveRequests,
            pagination: paginationMeta
        };
    }
    /**
     * Process leave request approval/rejection
     */
    async processApproval(approval, userContext) {
        const request = await this.findById(approval.requestId, userContext);
        if (!request) {
            throw new Error('Leave request not found');
        }
        if (request.status !== 'PENDING') {
            throw new Error('Leave request is not pending approval');
        }
        const updateData = {
            status: approval.action === 'APPROVE' ? 'APPROVED' : 'REJECTED',
            approvedBy: approval.approvedBy,
            approvedAt: approval.approvalDate || new Date(),
            managerNotes: approval.comments
        };
        if (approval.action === 'REJECT') {
            updateData.rejectionReason = approval.comments || 'No reason provided';
        }
        return this.update(approval.requestId, updateData, userContext);
    }
    /**
     * Check for leave conflicts
     */
    async checkLeaveConflicts(employeeId, startDate, endDate, excludeRequestId, userContext) {
        const client = this.getClient(userContext);
        let query = client
            .from(this.tableName)
            .select('id, start_date, end_date, status')
            .eq('employee_id', employeeId)
            .in('status', ['PENDING', 'APPROVED'])
            .or(`start_date.lte.${endDate.toISOString().split('T')[0]},end_date.gte.${startDate.toISOString().split('T')[0]}`);
        if (excludeRequestId) {
            query = query.neq('id', excludeRequestId);
        }
        const conflictingRequests = await this.executeQuery(query, 'check leave conflicts');
        const conflicts = [];
        for (const conflicting of conflictingRequests) {
            const conflictStart = new Date(conflicting.start_date);
            const conflictEnd = new Date(conflicting.end_date);
            let conflictType;
            let description;
            if (startDate.getTime() === conflictStart.getTime() && endDate.getTime() === conflictEnd.getTime()) {
                conflictType = 'SAME_DATES';
                description = 'Exact same dates as existing request';
            }
            else if ((startDate <= conflictEnd && endDate >= conflictStart)) {
                conflictType = 'OVERLAP';
                description = 'Date range overlaps with existing request';
            }
            else {
                // Check for adjacent dates (within 1 day)
                const dayBefore = new Date(startDate);
                dayBefore.setDate(dayBefore.getDate() - 1);
                const dayAfter = new Date(endDate);
                dayAfter.setDate(dayAfter.getDate() + 1);
                if (conflictEnd.getTime() === dayBefore.getTime() || conflictStart.getTime() === dayAfter.getTime()) {
                    conflictType = 'ADJACENT';
                    description = 'Adjacent to existing request';
                }
                else {
                    continue; // No actual conflict
                }
            }
            conflicts.push({
                requestId: excludeRequestId || 'new',
                conflictingRequestId: conflicting.id,
                conflictType,
                conflictDescription: description
            });
        }
        return conflicts;
    }
    /**
     * Find pending requests for manager approval
     */
    async findPendingForManager(managerId, userContext) {
        const result = await this.findAll({
            filters: {
                status: 'PENDING',
                managerId
            },
            sort: { field: 'created_at', direction: 'ASC' }
        }, userContext);
        return result.data;
    }
    /**
     * Find employee leave requests by date range
     */
    async findByEmployeeAndDateRange(employeeId, startDate, endDate, userContext) {
        const result = await this.findAll({
            filters: {
                employeeId,
                dateRange: { start: startDate, end: endDate }
            },
            sort: { field: 'start_date', direction: 'ASC' }
        }, userContext);
        return result.data;
    }
    /**
     * Get leave request summary for employee
     */
    async getEmployeeLeaveSummary(employeeId, year, userContext) {
        const client = this.getClient(userContext);
        const startDate = new Date(year, 0, 1);
        const endDate = new Date(year, 11, 31);
        const query = `
      SELECT
        employee_id,
        leave_type_id,
        SUM(total_days) as total_requested,
        SUM(CASE WHEN status = 'APPROVED' THEN total_days ELSE 0 END) as total_approved,
        SUM(CASE WHEN status = 'PENDING' THEN total_days ELSE 0 END) as total_pending,
        SUM(CASE WHEN status = 'REJECTED' THEN total_days ELSE 0 END) as total_rejected
      FROM leave_requests
      WHERE employee_id = $1
        AND start_date >= $2
        AND end_date <= $3
      GROUP BY employee_id, leave_type_id
    `;
        const { data, error } = await client.rpc('execute_sql', {
            sql: query,
            params: [employeeId, startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]]
        });
        if (error) {
            throw new Error(`Leave summary query failed: ${error.message}`);
        }
        return (data || []).map((row) => ({
            employeeId: row.employee_id,
            leaveTypeId: row.leave_type_id,
            totalRequested: parseInt(row.total_requested) || 0,
            totalApproved: parseInt(row.total_approved) || 0,
            totalPending: parseInt(row.total_pending) || 0,
            totalRejected: parseInt(row.total_rejected) || 0,
            period: {
                start: startDate,
                end: endDate
            }
        }));
    }
    /**
     * Cancel leave request (only by employee for pending/approved requests)
     */
    async cancelRequest(requestId, reason, userContext) {
        const request = await this.findById(requestId, userContext);
        if (!request) {
            throw new Error('Leave request not found');
        }
        if (!['PENDING', 'APPROVED'].includes(request.status)) {
            throw new Error('Can only cancel pending or approved requests');
        }
        // Check if start date is in the future
        if (request.startDate <= new Date()) {
            throw new Error('Cannot cancel leave request that has already started');
        }
        return this.update(requestId, {
            status: 'CANCELLED',
            notes: reason ? `Cancelled: ${reason}` : 'Cancelled by employee'
        }, userContext);
    }
    /**
     * Find requests requiring approval workflow
     */
    async findRequiringApproval(userContext) {
        const client = this.getClient(userContext);
        const requests = await this.executeQuery(client
            .from(this.tableName)
            .select(`
          *,
          leave_types!inner (
            requires_approval
          ),
          employees (
            id,
            first_name,
            last_name,
            email
          )
        `)
            .eq('status', 'PENDING')
            .eq('leave_types.requires_approval', true)
            .order('created_at', { ascending: true }), 'find requests requiring approval');
        return requests.map(request => this.mapToLeaveRequest(request));
    }
    /**
     * Map database row to LeaveRequest model
     */
    mapToLeaveRequest(row) {
        const leaveRequestData = {
            id: row.id,
            employeeId: row.employee_id,
            leaveTypeId: row.leave_type_id,
            startDate: new Date(row.start_date),
            endDate: new Date(row.end_date),
            totalDays: row.total_days,
            status: row.status,
            reason: row.reason,
            notes: row.notes,
            managerNotes: row.manager_notes,
            approvedBy: row.approved_by,
            approvedAt: row.approved_at ? new Date(row.approved_at) : undefined,
            rejectionReason: row.rejection_reason,
            createdAt: new Date(row.created_at),
            updatedAt: new Date(row.updated_at)
        };
        return new LeaveRequest(leaveRequestData);
    }
}
