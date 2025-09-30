import { supabase } from '../supabase';
import { logger } from '../../utils/logger';
import { AnnualLeavePlan } from '../../models/document-management';
import { ValidationError } from '../../utils/validation';
export class AnnualLeavePlanRepository {
    constructor(client) {
        this.client = client || supabase.getClient();
    }
    /**
     * Create a new annual leave plan
     */
    async create(plan) {
        try {
            logger.info('Creating annual leave plan', {
                employeeId: plan.employeeId,
                year: plan.year,
                totalEntitlement: plan.totalEntitlement
            });
            const planData = {
                employee_id: plan.employeeId,
                year: plan.year,
                total_entitlement: plan.totalEntitlement,
                carried_over: plan.carriedOver || 0,
                planned_leaves: plan.plannedLeaves || [],
                status: plan.status || 'DRAFT',
                submitted_at: plan.submittedAt ? plan.submittedAt.toISOString() : null,
                manager_approved_at: plan.managerApprovedAt ? plan.managerApprovedAt.toISOString() : null,
                manager_approved_by: plan.managerApprovedBy || null,
                hr_approved_at: plan.hrApprovedAt ? plan.hrApprovedAt.toISOString() : null,
                hr_approved_by: plan.hrApprovedBy || null,
                rejection_reason: plan.rejectionReason || null
            };
            const { data, error } = await this.client
                .from('annual_leave_plans')
                .insert(planData)
                .select('*')
                .single();
            if (error) {
                logger.error('Failed to create annual leave plan', {
                    error: error.message,
                    code: error.code,
                    details: error.details
                });
                // Handle unique constraint violation
                if (error.code === '23505') {
                    throw new ValidationError(`Leave plan for employee in ${plan.year} already exists`, []);
                }
                throw new ValidationError(`Failed to create leave plan: ${error.message}`, []);
            }
            const leavePlan = this.mapToAnnualLeavePlan(data);
            logger.info('Annual leave plan created successfully', {
                planId: leavePlan.id,
                employeeId: leavePlan.employeeId,
                year: leavePlan.year
            });
            return leavePlan;
        }
        catch (error) {
            logger.error('Error creating annual leave plan', {
                error: error instanceof Error ? error.message : 'Unknown error',
                employeeId: plan.employeeId,
                year: plan.year
            });
            throw error;
        }
    }
    /**
     * Find leave plan by ID
     */
    async findById(id) {
        try {
            const { data, error } = await this.client
                .from('annual_leave_plans')
                .select('*')
                .eq('id', id)
                .single();
            if (error) {
                if (error.code === 'PGRST116') {
                    return null; // Not found
                }
                logger.error('Failed to find annual leave plan by ID', {
                    error: error.message,
                    planId: id
                });
                throw new ValidationError(`Failed to find leave plan: ${error.message}`, []);
            }
            return this.mapToAnnualLeavePlan(data);
        }
        catch (error) {
            if (error instanceof ValidationError) {
                throw error;
            }
            logger.error('Error finding annual leave plan by ID', {
                error: error instanceof Error ? error.message : 'Unknown error',
                planId: id
            });
            throw new ValidationError('Database error occurred', []);
        }
    }
    /**
     * Find leave plan by employee and year
     */
    async findByEmployeeAndYear(employeeId, year) {
        try {
            const { data, error } = await this.client
                .from('annual_leave_plans')
                .select('*')
                .eq('employee_id', employeeId)
                .eq('year', year)
                .single();
            if (error) {
                if (error.code === 'PGRST116') {
                    return null; // Not found
                }
                logger.error('Failed to find annual leave plan by employee and year', {
                    error: error.message,
                    employeeId,
                    year
                });
                throw new ValidationError(`Failed to find leave plan: ${error.message}`, []);
            }
            return this.mapToAnnualLeavePlan(data);
        }
        catch (error) {
            if (error instanceof ValidationError) {
                throw error;
            }
            logger.error('Error finding annual leave plan by employee and year', {
                error: error instanceof Error ? error.message : 'Unknown error',
                employeeId,
                year
            });
            throw new ValidationError('Database error occurred', []);
        }
    }
    /**
     * Find leave plans by employee ID
     */
    async findByEmployeeId(employeeId, options = {}) {
        try {
            const { page = 1, limit = 10, sortBy = 'year', sortOrder = 'desc' } = options;
            const offset = (page - 1) * limit;
            // Get total count
            const { count, error: countError } = await this.client
                .from('annual_leave_plans')
                .select('*', { count: 'exact', head: true })
                .eq('employee_id', employeeId);
            if (countError) {
                throw new ValidationError(`Failed to count leave plans: ${countError.message}`, []);
            }
            // Get plans
            const { data, error } = await this.client
                .from('annual_leave_plans')
                .select('*')
                .eq('employee_id', employeeId)
                .order(sortBy, { ascending: sortOrder === 'asc' })
                .range(offset, offset + limit - 1);
            if (error) {
                logger.error('Failed to find annual leave plans by employee ID', {
                    error: error.message,
                    employeeId
                });
                throw new ValidationError(`Failed to find leave plans: ${error.message}`, []);
            }
            const plans = data.map(item => this.mapToAnnualLeavePlan(item));
            const total = count || 0;
            const totalPages = Math.ceil(total / limit);
            return {
                plans,
                total,
                page,
                totalPages
            };
        }
        catch (error) {
            if (error instanceof ValidationError) {
                throw error;
            }
            logger.error('Error finding annual leave plans by employee ID', {
                error: error instanceof Error ? error.message : 'Unknown error',
                employeeId
            });
            throw new ValidationError('Database error occurred', []);
        }
    }
    /**
     * Search leave plans with criteria
     */
    async search(criteria, options = {}) {
        try {
            const { page = 1, limit = 20, sortBy = 'created_at', sortOrder = 'desc' } = options;
            const offset = (page - 1) * limit;
            let query = this.client.from('annual_leave_plans').select('*', { count: 'exact' });
            let countQuery = this.client.from('annual_leave_plans').select('*', { count: 'exact', head: true });
            // Apply filters
            if (criteria.employeeId) {
                query = query.eq('employee_id', criteria.employeeId);
                countQuery = countQuery.eq('employee_id', criteria.employeeId);
            }
            if (criteria.year) {
                query = query.eq('year', criteria.year);
                countQuery = countQuery.eq('year', criteria.year);
            }
            if (criteria.status) {
                query = query.eq('status', criteria.status);
                countQuery = countQuery.eq('status', criteria.status);
            }
            if (criteria.managerApprovedBy) {
                query = query.eq('manager_approved_by', criteria.managerApprovedBy);
                countQuery = countQuery.eq('manager_approved_by', criteria.managerApprovedBy);
            }
            if (criteria.hrApprovedBy) {
                query = query.eq('hr_approved_by', criteria.hrApprovedBy);
                countQuery = countQuery.eq('hr_approved_by', criteria.hrApprovedBy);
            }
            // Get total count
            const { count, error: countError } = await countQuery;
            if (countError) {
                throw new ValidationError(`Failed to count leave plans: ${countError.message}`, []);
            }
            // Get plans
            const { data, error } = await query
                .order(sortBy, { ascending: sortOrder === 'asc' })
                .range(offset, offset + limit - 1);
            if (error) {
                logger.error('Failed to search annual leave plans', {
                    error: error.message,
                    criteria
                });
                throw new ValidationError(`Failed to search leave plans: ${error.message}`, []);
            }
            const plans = data.map(item => this.mapToAnnualLeavePlan(item));
            const total = count || 0;
            const totalPages = Math.ceil(total / limit);
            return {
                plans,
                total,
                page,
                totalPages
            };
        }
        catch (error) {
            if (error instanceof ValidationError) {
                throw error;
            }
            logger.error('Error searching annual leave plans', {
                error: error instanceof Error ? error.message : 'Unknown error',
                criteria
            });
            throw new ValidationError('Database error occurred', []);
        }
    }
    /**
     * Update leave plan
     */
    async update(id, updates) {
        try {
            logger.info('Updating annual leave plan', {
                planId: id,
                updates: Object.keys(updates)
            });
            const updateData = {};
            // Map updates to database column names
            if (updates.totalEntitlement !== undefined)
                updateData.total_entitlement = updates.totalEntitlement;
            if (updates.carriedOver !== undefined)
                updateData.carried_over = updates.carriedOver;
            if (updates.plannedLeaves !== undefined)
                updateData.planned_leaves = updates.plannedLeaves;
            if (updates.status !== undefined)
                updateData.status = updates.status;
            if (updates.submittedAt !== undefined) {
                updateData.submitted_at = updates.submittedAt ? updates.submittedAt.toISOString() : null;
            }
            if (updates.managerApprovedAt !== undefined) {
                updateData.manager_approved_at = updates.managerApprovedAt ? updates.managerApprovedAt.toISOString() : null;
            }
            if (updates.managerApprovedBy !== undefined)
                updateData.manager_approved_by = updates.managerApprovedBy;
            if (updates.hrApprovedAt !== undefined) {
                updateData.hr_approved_at = updates.hrApprovedAt ? updates.hrApprovedAt.toISOString() : null;
            }
            if (updates.hrApprovedBy !== undefined)
                updateData.hr_approved_by = updates.hrApprovedBy;
            if (updates.rejectionReason !== undefined)
                updateData.rejection_reason = updates.rejectionReason;
            const { data, error } = await this.client
                .from('annual_leave_plans')
                .update(updateData)
                .eq('id', id)
                .select('*')
                .single();
            if (error) {
                logger.error('Failed to update annual leave plan', {
                    error: error.message,
                    planId: id
                });
                throw new ValidationError(`Failed to update leave plan: ${error.message}`, []);
            }
            const updatedPlan = this.mapToAnnualLeavePlan(data);
            logger.info('Annual leave plan updated successfully', {
                planId: id
            });
            return updatedPlan;
        }
        catch (error) {
            if (error instanceof ValidationError) {
                throw error;
            }
            logger.error('Error updating annual leave plan', {
                error: error instanceof Error ? error.message : 'Unknown error',
                planId: id
            });
            throw new ValidationError('Database error occurred', []);
        }
    }
    /**
     * Delete leave plan
     */
    async delete(id) {
        try {
            logger.info('Deleting annual leave plan', {
                planId: id
            });
            const { error } = await this.client
                .from('annual_leave_plans')
                .delete()
                .eq('id', id);
            if (error) {
                logger.error('Failed to delete annual leave plan', {
                    error: error.message,
                    planId: id
                });
                throw new ValidationError(`Failed to delete leave plan: ${error.message}`, []);
            }
            logger.info('Annual leave plan deleted successfully', {
                planId: id
            });
            return true;
        }
        catch (error) {
            if (error instanceof ValidationError) {
                throw error;
            }
            logger.error('Error deleting annual leave plan', {
                error: error instanceof Error ? error.message : 'Unknown error',
                planId: id
            });
            throw new ValidationError('Database error occurred', []);
        }
    }
    /**
     * Get pending approvals for manager
     */
    async getPendingManagerApprovals(managerId) {
        try {
            // First get employees who report to this manager
            const { data: employees, error: employeesError } = await this.client
                .from('employees')
                .select('id')
                .eq('manager_id', managerId);
            if (employeesError) {
                throw new ValidationError(`Failed to get manager's employees: ${employeesError.message}`, []);
            }
            if (!employees || employees.length === 0) {
                return [];
            }
            const employeeIds = employees.map(emp => emp.id);
            const { data, error } = await this.client
                .from('annual_leave_plans')
                .select('*')
                .in('employee_id', employeeIds)
                .eq('status', 'SUBMITTED')
                .order('submitted_at', { ascending: true });
            if (error) {
                logger.error('Failed to get pending manager approvals', {
                    error: error.message,
                    managerId
                });
                throw new ValidationError(`Failed to get pending approvals: ${error.message}`, []);
            }
            return data.map(item => this.mapToAnnualLeavePlan(item));
        }
        catch (error) {
            logger.error('Error getting pending manager approvals', {
                error: error instanceof Error ? error.message : 'Unknown error',
                managerId
            });
            throw new ValidationError('Database error occurred', []);
        }
    }
    /**
     * Get pending HR approvals
     */
    async getPendingHRApprovals() {
        try {
            const { data, error } = await this.client
                .from('annual_leave_plans')
                .select('*')
                .eq('status', 'MANAGER_APPROVED')
                .order('manager_approved_at', { ascending: true });
            if (error) {
                logger.error('Failed to get pending HR approvals', {
                    error: error.message
                });
                throw new ValidationError(`Failed to get pending HR approvals: ${error.message}`, []);
            }
            return data.map(item => this.mapToAnnualLeavePlan(item));
        }
        catch (error) {
            logger.error('Error getting pending HR approvals', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw new ValidationError('Database error occurred', []);
        }
    }
    /**
     * Check for conflicts with existing leave plans
     */
    async checkConflicts(employeeId, plannedLeaves, excludePlanId) {
        try {
            let query = this.client
                .from('annual_leave_plans')
                .select('*')
                .eq('employee_id', employeeId)
                .in('status', ['SUBMITTED', 'MANAGER_APPROVED', 'HR_APPROVED']);
            if (excludePlanId) {
                query = query.neq('id', excludePlanId);
            }
            const { data, error } = await query;
            if (error) {
                throw new ValidationError(`Failed to check conflicts: ${error.message}`, []);
            }
            const conflicts = [];
            for (const planData of data) {
                const existingPlan = this.mapToAnnualLeavePlan(planData);
                for (const newLeave of plannedLeaves) {
                    for (const existingLeave of existingPlan.plannedLeaves) {
                        if (this.datesOverlap(newLeave, existingLeave)) {
                            conflicts.push({
                                existingPlan,
                                conflictingLeave: existingLeave,
                                plannedLeave: newLeave
                            });
                        }
                    }
                }
            }
            return {
                hasConflicts: conflicts.length > 0,
                conflicts
            };
        }
        catch (error) {
            logger.error('Error checking leave plan conflicts', {
                error: error instanceof Error ? error.message : 'Unknown error',
                employeeId
            });
            throw new ValidationError('Database error occurred', []);
        }
    }
    /**
     * Get leave plan statistics
     */
    async getStatistics(year) {
        try {
            let query = this.client.from('annual_leave_plans').select('*');
            if (year) {
                query = query.eq('year', year);
            }
            const { data, error } = await query;
            if (error) {
                throw new ValidationError(`Failed to get statistics: ${error.message}`, []);
            }
            const stats = {
                totalPlans: data.length,
                byStatus: {
                    'DRAFT': 0,
                    'SUBMITTED': 0,
                    'MANAGER_APPROVED': 0,
                    'HR_APPROVED': 0,
                    'REJECTED': 0
                },
                averageEntitlement: 0,
                totalPlannedDays: 0
            };
            let totalEntitlement = 0;
            let totalPlannedDays = 0;
            data.forEach(planData => {
                // Count by status
                stats.byStatus[planData.status]++;
                // Sum entitlements
                totalEntitlement += parseFloat(planData.total_entitlement);
                // Sum planned days
                const plannedLeaves = planData.planned_leaves;
                plannedLeaves.forEach(leave => {
                    totalPlannedDays += leave.workingDays;
                });
            });
            stats.averageEntitlement = data.length > 0 ? totalEntitlement / data.length : 0;
            stats.totalPlannedDays = totalPlannedDays;
            return stats;
        }
        catch (error) {
            logger.error('Error getting leave plan statistics', {
                error: error instanceof Error ? error.message : 'Unknown error',
                year
            });
            throw new ValidationError('Database error occurred', []);
        }
    }
    /**
     * Check if two date ranges overlap
     */
    datesOverlap(leave1, leave2) {
        const start1 = new Date(leave1.startDate);
        const end1 = new Date(leave1.endDate);
        const start2 = new Date(leave2.startDate);
        const end2 = new Date(leave2.endDate);
        return start1 <= end2 && start2 <= end1;
    }
    /**
     * Map database row to AnnualLeavePlan model
     */
    mapToAnnualLeavePlan(data) {
        return new AnnualLeavePlan({
            id: data.id,
            employeeId: data.employee_id,
            year: data.year,
            totalEntitlement: parseFloat(data.total_entitlement),
            carriedOver: parseFloat(data.carried_over),
            plannedLeaves: data.planned_leaves || [],
            status: data.status,
            submittedAt: data.submitted_at ? new Date(data.submitted_at) : undefined,
            managerApprovedAt: data.manager_approved_at ? new Date(data.manager_approved_at) : undefined,
            managerApprovedBy: data.manager_approved_by,
            hrApprovedAt: data.hr_approved_at ? new Date(data.hr_approved_at) : undefined,
            hrApprovedBy: data.hr_approved_by,
            rejectionReason: data.rejection_reason,
            createdAt: new Date(data.created_at),
            updatedAt: new Date(data.updated_at)
        });
    }
}
