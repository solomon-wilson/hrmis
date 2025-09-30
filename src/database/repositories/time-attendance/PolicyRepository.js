import { SupabaseRepository } from '../supabase-base';
import { LeavePolicy, OvertimePolicy } from '../../../models/time-attendance/Policy';
export class PolicyRepository extends SupabaseRepository {
    constructor() {
        super('policies');
    }
    /**
     * Create a new policy
     */
    async create(data, userContext) {
        const client = this.getClient(userContext);
        // Determine policy type
        const policyType = data.leaveTypeId ? 'LEAVE' : 'OVERTIME';
        // Validate policy conflicts
        const conflicts = await this.checkPolicyConflicts(data, userContext);
        if (conflicts.length > 0) {
            throw new Error(`Policy conflicts detected: ${conflicts.map(c => c.description).join(', ')}`);
        }
        // Convert to database format
        const policyData = {
            name: data.name,
            description: data.description,
            policy_type: policyType,
            leave_type_id: data.leaveTypeId || null,
            is_active: data.isActive,
            applicable_groups: JSON.stringify(data.applicableGroups),
            eligibility_rules: JSON.stringify(data.eligibilityRules),
            accrual_rules: data.accrualRules ? JSON.stringify(data.accrualRules) : null,
            usage_rules: data.usageRules ? JSON.stringify(data.usageRules) : null,
            overtime_rules: data.overtimeRules ? JSON.stringify(data.overtimeRules) : null,
            effective_date: data.effectiveDate.toISOString().split('T')[0],
            expiry_date: data.expiryDate?.toISOString().split('T')[0] || null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };
        const policy = await this.executeQuery(client.from(this.tableName).insert(policyData).select().single(), 'create policy');
        return this.mapToPolicy(policy);
    }
    /**
     * Find policy by ID
     */
    async findById(id, userContext) {
        const client = this.getClient(userContext);
        const policy = await this.executeQuery(client
            .from(this.tableName)
            .select(`
          *,
          leave_types (
            id,
            name,
            description
          )
        `)
            .eq('id', id)
            .single(), 'find policy by id');
        if (!policy)
            return null;
        return this.mapToPolicy(policy);
    }
    /**
     * Update policy
     */
    async update(id, data, userContext) {
        const client = this.getClient(userContext);
        const updateData = {
            updated_at: new Date().toISOString()
        };
        if (data.name !== undefined)
            updateData.name = data.name;
        if (data.description !== undefined)
            updateData.description = data.description;
        if (data.isActive !== undefined)
            updateData.is_active = data.isActive;
        if (data.applicableGroups !== undefined)
            updateData.applicable_groups = JSON.stringify(data.applicableGroups);
        if (data.eligibilityRules !== undefined)
            updateData.eligibility_rules = JSON.stringify(data.eligibilityRules);
        if (data.accrualRules !== undefined)
            updateData.accrual_rules = JSON.stringify(data.accrualRules);
        if (data.usageRules !== undefined)
            updateData.usage_rules = JSON.stringify(data.usageRules);
        if (data.overtimeRules !== undefined)
            updateData.overtime_rules = JSON.stringify(data.overtimeRules);
        if (data.effectiveDate !== undefined)
            updateData.effective_date = data.effectiveDate.toISOString().split('T')[0];
        if (data.expiryDate !== undefined)
            updateData.expiry_date = data.expiryDate?.toISOString().split('T')[0] || null;
        const updatedPolicy = await this.executeQuery(client
            .from(this.tableName)
            .update(updateData)
            .eq('id', id)
            .select()
            .single(), 'update policy');
        if (!updatedPolicy)
            return null;
        return this.findById(id, userContext);
    }
    /**
     * Delete policy (soft delete - mark as inactive)
     */
    async delete(id, userContext) {
        // Instead of hard delete, we mark as inactive and set expiry date
        const policy = await this.update(id, {
            isActive: false,
            expiryDate: new Date()
        }, userContext);
        return !!policy;
    }
    /**
     * Find policies with advanced filtering
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
          description
        )
      `, { count: 'exact' });
        // Apply filters
        if (filters) {
            if (filters.policyType) {
                query = query.eq('policy_type', filters.policyType);
            }
            if (filters.leaveTypeId) {
                query = query.eq('leave_type_id', filters.leaveTypeId);
            }
            if (filters.isActive !== undefined) {
                query = query.eq('is_active', filters.isActive);
            }
            if (filters.applicableGroup) {
                query = query.contains('applicable_groups', `"${filters.applicableGroup}"`);
            }
            if (filters.effectiveOn) {
                const effectiveDate = filters.effectiveOn.toISOString().split('T')[0];
                query = query
                    .lte('effective_date', effectiveDate)
                    .or(`expiry_date.is.null,expiry_date.gte.${effectiveDate}`);
            }
            if (filters.expiredBefore) {
                query = query.lt('expiry_date', filters.expiredBefore.toISOString().split('T')[0]);
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
            throw new Error('Failed to fetch policies');
        }
        const policies = data.map(policy => this.mapToPolicy(policy));
        const page = pagination?.page || 1;
        const limit = pagination?.limit || 25;
        const paginationMeta = this.calculatePaginationMeta(count || 0, page, limit);
        return {
            data: policies,
            pagination: paginationMeta
        };
    }
    /**
     * Find active leave policies
     */
    async findActiveLeavePolicies(userContext) {
        const result = await this.findAll({
            filters: {
                policyType: 'LEAVE',
                isActive: true,
                effectiveOn: new Date()
            },
            sort: { field: 'name', direction: 'ASC' }
        }, userContext);
        return result.data;
    }
    /**
     * Find active overtime policies
     */
    async findActiveOvertimePolicies(userContext) {
        const result = await this.findAll({
            filters: {
                policyType: 'OVERTIME',
                isActive: true,
                effectiveOn: new Date()
            },
            sort: { field: 'name', direction: 'ASC' }
        }, userContext);
        return result.data;
    }
    /**
     * Find policies by leave type
     */
    async findByLeaveType(leaveTypeId, userContext) {
        const result = await this.findAll({
            filters: {
                leaveTypeId,
                isActive: true
            },
            sort: { field: 'effective_date', direction: 'DESC' }
        }, userContext);
        return result.data;
    }
    /**
     * Find policies applicable to employee group
     */
    async findApplicableToGroup(groupName, userContext) {
        const result = await this.findAll({
            filters: {
                applicableGroup: groupName,
                isActive: true,
                effectiveOn: new Date()
            }
        }, userContext);
        return result.data;
    }
    /**
     * Check for policy conflicts
     */
    async checkPolicyConflicts(policyData, excludePolicyId, userContext) {
        const conflicts = [];
        if (policyData.leaveTypeId) {
            // Check for leave policy conflicts
            const existingPolicies = await this.findByLeaveType(policyData.leaveTypeId, userContext);
            for (const existing of existingPolicies) {
                if (excludePolicyId && existing.id === excludePolicyId)
                    continue;
                // Check for overlapping groups
                const hasOverlappingGroups = policyData.applicableGroups.some(group => existing.applicableGroups.includes(group));
                if (hasOverlappingGroups || existing.applicableGroups.length === 0 || policyData.applicableGroups.length === 0) {
                    conflicts.push({
                        policy1Id: excludePolicyId || 'new',
                        policy2Id: existing.id,
                        conflictType: 'SAME_LEAVE_TYPE',
                        description: `Multiple policies for same leave type ${policyData.leaveTypeId} with overlapping groups`
                    });
                }
            }
        }
        return conflicts;
    }
    /**
     * Activate policy
     */
    async activatePolicy(policyId, userContext) {
        return this.update(policyId, {
            isActive: true,
            effectiveDate: new Date()
        }, userContext);
    }
    /**
     * Deactivate policy
     */
    async deactivatePolicy(policyId, userContext) {
        return this.update(policyId, {
            isActive: false,
            expiryDate: new Date()
        }, userContext);
    }
    /**
     * Get policy application result (impact analysis)
     */
    async getPolicyApplicationResult(policyId, userContext) {
        const policy = await this.findById(policyId, userContext);
        if (!policy) {
            throw new Error('Policy not found');
        }
        // Mock implementation - in real scenario would query employee database
        const result = {
            policyId,
            employeeCount: 0, // Would calculate from actual employee data
            affectedGroups: policy.applicableGroups,
            estimatedImpact: {
                budgetImpact: 0, // Would calculate based on policy rules
                complianceRisk: 'LOW',
                operationalChanges: [
                    'Update employee handbook',
                    'Train managers on new policy',
                    'Update leave request workflows'
                ]
            }
        };
        return result;
    }
    /**
     * Find expiring policies
     */
    async findExpiringPolicies(daysAhead = 30, userContext) {
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + daysAhead);
        const result = await this.findAll({
            filters: {
                isActive: true,
                expiredBefore: futureDate
            },
            sort: { field: 'expiry_date', direction: 'ASC' }
        }, userContext);
        return result.data.filter(policy => policy.expiryDate !== undefined);
    }
    /**
     * Clone policy with modifications
     */
    async clonePolicy(policyId, modifications, userContext) {
        const originalPolicy = await this.findById(policyId, userContext);
        if (!originalPolicy) {
            throw new Error('Original policy not found');
        }
        const cloneData = {
            name: modifications.name || `${originalPolicy.name} (Copy)`,
            description: modifications.description || originalPolicy.description,
            leaveTypeId: originalPolicy instanceof LeavePolicy ? originalPolicy.leaveTypeId : undefined,
            isActive: modifications.isActive ?? false, // Clones start inactive
            applicableGroups: modifications.applicableGroups || originalPolicy.applicableGroups,
            eligibilityRules: modifications.eligibilityRules || originalPolicy.eligibilityRules,
            effectiveDate: modifications.effectiveDate || new Date(),
            expiryDate: modifications.expiryDate,
            ...modifications
        };
        // Add specific policy type data
        if (originalPolicy instanceof LeavePolicy) {
            cloneData.accrualRules = modifications.accrualRules || originalPolicy.accrualRules;
            cloneData.usageRules = modifications.usageRules || originalPolicy.usageRules;
        }
        else {
            cloneData.overtimeRules = modifications.overtimeRules || originalPolicy.overtimeRules;
        }
        return this.create(cloneData, userContext);
    }
    /**
     * Map database row to Policy model
     */
    mapToPolicy(row) {
        if (row.policy_type === 'LEAVE') {
            const leavePolicyData = {
                id: row.id,
                name: row.name,
                description: row.description,
                leaveTypeId: row.leave_type_id,
                isActive: row.is_active,
                applicableGroups: JSON.parse(row.applicable_groups || '[]'),
                eligibilityRules: JSON.parse(row.eligibility_rules || '[]'),
                accrualRules: JSON.parse(row.accrual_rules || '[]'),
                usageRules: JSON.parse(row.usage_rules || '[]'),
                effectiveDate: new Date(row.effective_date),
                expiryDate: row.expiry_date ? new Date(row.expiry_date) : undefined,
                createdAt: new Date(row.created_at),
                updatedAt: new Date(row.updated_at)
            };
            return new LeavePolicy(leavePolicyData);
        }
        else {
            const overtimePolicyData = {
                id: row.id,
                name: row.name,
                description: row.description,
                isActive: row.is_active,
                applicableGroups: JSON.parse(row.applicable_groups || '[]'),
                eligibilityRules: JSON.parse(row.eligibility_rules || '[]'),
                overtimeRules: JSON.parse(row.overtime_rules || '{}'),
                effectiveDate: new Date(row.effective_date),
                expiryDate: row.expiry_date ? new Date(row.expiry_date) : undefined,
                createdAt: new Date(row.created_at),
                updatedAt: new Date(row.updated_at)
            };
            return new OvertimePolicy(overtimePolicyData);
        }
    }
}
