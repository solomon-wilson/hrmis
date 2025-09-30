import { SupabaseRepository } from './supabase-base';
import { Employee } from '../../models/Employee';
export class SupabaseEmployeeRepository extends SupabaseRepository {
    constructor() {
        super('employees');
    }
    /**
     * Create a new employee
     */
    async create(data, userContext) {
        const client = this.getClient(userContext);
        const insertData = {
            employee_id: data.employee_id,
            first_name: data.first_name,
            last_name: data.last_name,
            email: data.email,
            phone: data.phone || null,
            date_of_birth: data.date_of_birth || null,
            social_security_number: data.social_security_number || null,
            address_line1: data.address_line1 || null,
            address_line2: data.address_line2 || null,
            city: data.city || null,
            state: data.state || null,
            postal_code: data.postal_code || null,
            country: data.country || 'United States',
            emergency_contact_name: data.emergency_contact_name || null,
            emergency_contact_phone: data.emergency_contact_phone || null,
            emergency_contact_relationship: data.emergency_contact_relationship || null,
            job_title: data.job_title,
            department_id: data.department_id || null,
            manager_id: data.manager_id || null,
            start_date: data.start_date,
            employment_type: data.employment_type || 'FULL_TIME',
            salary: data.salary || null,
            location: data.location || null,
            status: data.status || 'ACTIVE',
            status_effective_date: data.status_effective_date || new Date(),
            status_reason: data.status_reason || null,
            status_notes: data.status_notes || null,
            auth_user_id: data.auth_user_id || null,
            created_by: data.created_by,
            updated_by: data.updated_by || data.created_by
        };
        const result = await this.executeQuery(client.from(this.tableName).insert(insertData).select().single(), 'create employee');
        return this.mapRowToEmployeeModel(result);
    }
    /**
     * Find employee by ID with joined data
     */
    async findById(id, userContext) {
        const client = this.getClient(userContext);
        const { data, error } = await client
            .from(this.tableName)
            .select(`
        *,
        departments!inner(name),
        manager:employees!manager_id(first_name, last_name)
      `)
            .eq('id', id)
            .single();
        if (error) {
            if (error.code === 'PGRST116') { // No rows returned
                return null;
            }
            throw new Error(`Find employee by ID failed: ${error.message}`);
        }
        return this.mapRowToEmployeeModel(this.flattenJoinedData(data));
    }
    /**
     * Find employee by employee ID
     */
    async findByEmployeeId(employeeId, userContext) {
        const client = this.getClient(userContext);
        const { data, error } = await client
            .from(this.tableName)
            .select(`
        *,
        departments!inner(name),
        manager:employees!manager_id(first_name, last_name)
      `)
            .eq('employee_id', employeeId)
            .single();
        if (error) {
            if (error.code === 'PGRST116') { // No rows returned
                return null;
            }
            throw new Error(`Find employee by employee ID failed: ${error.message}`);
        }
        return this.mapRowToEmployeeModel(this.flattenJoinedData(data));
    }
    /**
     * Find employee by email
     */
    async findByEmail(email, userContext) {
        const client = this.getClient(userContext);
        const { data, error } = await client
            .from(this.tableName)
            .select(`
        *,
        departments!inner(name),
        manager:employees!manager_id(first_name, last_name)
      `)
            .eq('email', email)
            .single();
        if (error) {
            if (error.code === 'PGRST116') { // No rows returned
                return null;
            }
            throw new Error(`Find employee by email failed: ${error.message}`);
        }
        return this.mapRowToEmployeeModel(this.flattenJoinedData(data));
    }
    /**
     * Find employee by Supabase auth user ID
     */
    async findByAuthUserId(authUserId, userContext) {
        const client = this.getClient(userContext);
        const { data, error } = await client
            .from(this.tableName)
            .select(`
        *,
        departments!inner(name),
        manager:employees!manager_id(first_name, last_name)
      `)
            .eq('auth_user_id', authUserId)
            .single();
        if (error) {
            if (error.code === 'PGRST116') { // No rows returned
                return null;
            }
            throw new Error(`Find employee by auth user ID failed: ${error.message}`);
        }
        return this.mapRowToEmployeeModel(this.flattenJoinedData(data));
    }
    /**
     * Find all employees with filtering, sorting, and pagination
     */
    async findAll(options, userContext) {
        const { pagination, sort, filters = {} } = options || {};
        const client = this.getClient(userContext);
        // Handle search differently due to Supabase limitations
        let baseQuery = client
            .from(this.tableName)
            .select(`
        *,
        departments!inner(name),
        manager:employees!manager_id(first_name, last_name)
      `);
        // Apply search filter if provided
        if (filters.search) {
            baseQuery = baseQuery.or(`first_name.ilike.%${filters.search}%,last_name.ilike.%${filters.search}%,email.ilike.%${filters.search}%,employee_id.ilike.%${filters.search}%`);
        }
        // Apply other filters
        const filtersWithoutSearch = { ...filters };
        delete filtersWithoutSearch.search;
        baseQuery = this.applyFilters(baseQuery, filtersWithoutSearch);
        // Get total count
        const { count, error: countError } = await client
            .from(this.tableName)
            .select('*', { count: 'exact', head: true });
        if (countError) {
            throw new Error(`Count query failed: ${countError.message}`);
        }
        const total = count || 0;
        // Apply sorting
        const orderBy = this.buildOrderBy(sort);
        baseQuery = baseQuery.order(orderBy.column, { ascending: orderBy.ascending });
        // Apply pagination
        const { from, to } = this.buildPagination(pagination);
        baseQuery = baseQuery.range(from, to);
        const data = await this.executeQuery(baseQuery, 'findAll employees');
        const employees = data.map((row) => this.mapRowToEmployeeModel(this.flattenJoinedData(row)));
        const page = pagination?.page || 1;
        const limit = pagination?.limit || 25;
        const paginationMeta = this.calculatePaginationMeta(total, page, limit);
        return {
            data: employees,
            pagination: paginationMeta
        };
    }
    /**
     * Update employee
     */
    async update(id, data, userContext) {
        const client = this.getClient(userContext);
        // Filter out undefined values
        const updateData = Object.fromEntries(Object.entries(data).filter(([_, value]) => value !== undefined));
        // Always update the updated_at timestamp
        updateData.updated_at = new Date().toISOString();
        const { data: result, error } = await client
            .from(this.tableName)
            .update(updateData)
            .eq('id', id)
            .select(`
        *,
        departments!inner(name),
        manager:employees!manager_id(first_name, last_name)
      `)
            .single();
        if (error) {
            if (error.code === 'PGRST116') { // No rows returned
                return null;
            }
            throw new Error(`Update employee failed: ${error.message}`);
        }
        return this.mapRowToEmployeeModel(this.flattenJoinedData(result));
    }
    /**
     * Soft delete employee (set status to TERMINATED)
     */
    async delete(id, userContext) {
        const client = this.getClient(userContext);
        const { error } = await client
            .from(this.tableName)
            .update({
            status: 'TERMINATED',
            status_effective_date: new Date().toISOString().split('T')[0], // Date only
            updated_at: new Date().toISOString()
        })
            .eq('id', id);
        if (error) {
            throw new Error(`Delete employee failed: ${error.message}`);
        }
        return true;
    }
    /**
     * Get direct reports for a manager
     */
    async getDirectReports(managerId, userContext) {
        const client = this.getClient(userContext);
        const data = await this.executeQuery(client
            .from(this.tableName)
            .select(`
          *,
          departments!inner(name),
          manager:employees!manager_id(first_name, last_name)
        `)
            .eq('manager_id', managerId)
            .neq('status', 'TERMINATED')
            .order('first_name')
            .order('last_name'), 'get direct reports');
        return data.map((row) => this.mapRowToEmployeeModel(this.flattenJoinedData(row)));
    }
    /**
     * Search employees with full-text search
     */
    async searchEmployees(searchTerm, options, userContext) {
        const { pagination, filters = {} } = options || {};
        // Add search term to filters
        const searchFilters = { ...filters, search: searchTerm };
        return this.findAll({ pagination, filters: searchFilters }, userContext);
    }
    /**
     * Update employee status
     */
    async updateStatus(id, status, effectiveDate, reason, notes, updatedBy, userContext) {
        const updateData = {
            status,
            status_effective_date: effectiveDate,
            status_reason: reason,
            status_notes: notes,
            updated_by: updatedBy
        };
        return this.update(id, updateData, userContext);
    }
    /**
     * Flatten joined data from Supabase
     */
    flattenJoinedData(row) {
        return {
            ...row,
            department_name: row.departments?.name,
            manager_name: row.manager ? `${row.manager.first_name} ${row.manager.last_name}` : undefined
        };
    }
    /**
     * Map database row to Employee domain model
     */
    mapRowToEmployeeModel(row) {
        const employeeData = {
            id: row.id,
            employeeId: row.employee_id,
            personalInfo: {
                firstName: row.first_name,
                lastName: row.last_name,
                email: row.email,
                phone: row.phone,
                dateOfBirth: row.date_of_birth,
                socialSecurityNumber: row.social_security_number,
                address: row.address_line1 ? {
                    street: row.address_line1 + (row.address_line2 ? ` ${row.address_line2}` : ''),
                    city: row.city || '',
                    state: row.state || '',
                    zipCode: row.postal_code || '',
                    country: row.country || 'United States'
                } : undefined,
                emergencyContact: row.emergency_contact_name ? {
                    name: row.emergency_contact_name,
                    relationship: row.emergency_contact_relationship || '',
                    phone: row.emergency_contact_phone || ''
                } : undefined
            },
            jobInfo: {
                jobTitle: row.job_title,
                department: row.department_name || row.department_id || '',
                managerId: row.manager_id,
                startDate: row.start_date,
                employmentType: row.employment_type,
                salary: row.salary,
                location: row.location
            },
            status: {
                current: row.status,
                effectiveDate: row.status_effective_date,
                reason: row.status_reason,
                notes: row.status_notes
            },
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            createdBy: row.created_by,
            updatedBy: row.updated_by
        };
        return Employee.fromJSON(employeeData);
    }
}
