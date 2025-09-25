import { PoolClient } from 'pg';
import { BaseRepository, PaginationOptions, PaginatedResult, SortOptions, FilterOptions } from './base';
import { Employee, EmployeeData } from '../../models/Employee';
import { EmployeeStatusType } from '../../models/EmployeeStatus';
import { EmploymentType } from '../../models/JobInfo';
import { CreateEmployeeInput, UpdateEmployeeInput, EmployeeRow } from './types';

export interface EmployeeSearchCriteria extends FilterOptions {
  search?: string; // Full-text search across name, email, employee_id
  department_id?: string;
  manager_id?: string;
  status?: EmployeeStatusType;
  employment_type?: EmploymentType;
  start_date_from?: Date;
  start_date_to?: Date;
}

export class EmployeeRepository extends BaseRepository<Employee, CreateEmployeeInput, UpdateEmployeeInput> {
  constructor() {
    super('employees');
  }

  /**
   * Create a new employee
   */
  async create(data: CreateEmployeeInput, client?: PoolClient): Promise<Employee> {
    const query = `
      INSERT INTO employees (
        employee_id, first_name, last_name, email, phone, date_of_birth,
        social_security_number, address_line1, address_line2, city, state,
        postal_code, country, emergency_contact_name, emergency_contact_phone,
        emergency_contact_relationship, job_title, department_id, manager_id,
        start_date, employment_type, salary, location, status, status_effective_date,
        status_reason, status_notes, user_id, created_by, updated_by
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
        $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30
      )
      RETURNING *
    `;

    const params = [
      data.employee_id,
      data.first_name,
      data.last_name,
      data.email,
      data.phone || null,
      data.date_of_birth || null,
      data.social_security_number || null,
      data.address_line1 || null,
      data.address_line2 || null,
      data.city || null,
      data.state || null,
      data.postal_code || null,
      data.country || 'United States',
      data.emergency_contact_name || null,
      data.emergency_contact_phone || null,
      data.emergency_contact_relationship || null,
      data.job_title,
      data.department_id || null,
      data.manager_id || null,
      data.start_date,
      data.employment_type || 'FULL_TIME',
      data.salary || null,
      data.location || null,
      data.status || 'ACTIVE',
      data.status_effective_date || new Date(),
      data.status_reason || null,
      data.status_notes || null,
      data.user_id || null,
      data.created_by,
      data.updated_by || data.created_by
    ];

    const result = await this.executeQuery(query, params, client);
    return this.mapRowToEmployeeModel(result.rows[0]);
  }

  /**
   * Find employee by ID
   */
  async findById(id: string, client?: PoolClient): Promise<Employee | null> {
    const query = `
      SELECT e.*, d.name as department_name,
             CONCAT(m.first_name, ' ', m.last_name) as manager_name
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN employees m ON e.manager_id = m.id
      WHERE e.id = $1
    `;

    const result = await this.executeQuery(query, [id], client);
    return result.rows.length > 0 ? this.mapRowToEmployeeModel(result.rows[0]) : null;
  }

  /**
   * Find employee by employee ID
   */
  async findByEmployeeId(employeeId: string, client?: PoolClient): Promise<Employee | null> {
    const query = `
      SELECT e.*, d.name as department_name,
             CONCAT(m.first_name, ' ', m.last_name) as manager_name
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN employees m ON e.manager_id = m.id
      WHERE e.employee_id = $1
    `;

    const result = await this.executeQuery(query, [employeeId], client);
    return result.rows.length > 0 ? this.mapRowToEmployeeModel(result.rows[0]) : null;
  }

  /**
   * Find employee by email
   */
  async findByEmail(email: string, client?: PoolClient): Promise<Employee | null> {
    const query = `
      SELECT e.*, d.name as department_name,
             CONCAT(m.first_name, ' ', m.last_name) as manager_name
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN employees m ON e.manager_id = m.id
      WHERE e.email = $1
    `;

    const result = await this.executeQuery(query, [email], client);
    return result.rows.length > 0 ? this.mapRowToEmployeeModel(result.rows[0]) : null;
  }

  /**
   * Find all employees with filtering, sorting, and pagination
   */
  async findAll(options?: {
    pagination?: PaginationOptions;
    sort?: SortOptions;
    filters?: EmployeeSearchCriteria;
  }, client?: PoolClient): Promise<PaginatedResult<Employee>> {
    const { pagination, sort, filters = {} } = options || {};

    // Build the base query with joins
    let baseQuery = `
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN employees m ON e.manager_id = m.id
    `;

    // Build WHERE clause
    const { whereClause, params } = this.buildEmployeeWhereClause(filters);
    baseQuery += ` ${whereClause}`;

    // Get total count
    const countQuery = `SELECT COUNT(*) as total ${baseQuery}`;
    const countResult = await this.executeQuery(countQuery, params, client);
    const total = parseInt(countResult.rows[0].total);

    // Build the main query
    const orderByClause = this.buildOrderByClause(sort);
    const { limitClause, limit } = this.buildPaginationClause(pagination);
    
    const selectQuery = `
      SELECT e.*, d.name as department_name,
             CONCAT(m.first_name, ' ', m.last_name) as manager_name
      ${baseQuery}
      ${orderByClause}
      ${limitClause}
    `;

    const result = await this.executeQuery(selectQuery, params, client);
    const employees = result.rows.map(row => this.mapRowToEmployeeModel(row));

    const page = pagination?.page || 1;
    const paginationMeta = this.calculatePaginationMeta(total, page, limit);

    return {
      data: employees,
      pagination: paginationMeta
    };
  }

  /**
   * Update employee
   */
  async update(id: string, data: UpdateEmployeeInput, client?: PoolClient): Promise<Employee | null> {
    const updateFields: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    // Build dynamic update query
    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined && key !== 'id') {
        updateFields.push(`${key} = $${paramIndex++}`);
        params.push(value);
      }
    });

    if (updateFields.length === 0) {
      throw new Error('No fields to update');
    }

    // Always update the updated_at timestamp
    updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
    params.push(id); // Add ID as the last parameter

    const query = `
      UPDATE employees 
      SET ${updateFields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await this.executeQuery(query, params, client);
    return result.rows.length > 0 ? this.mapRowToEmployeeModel(result.rows[0]) : null;
  }

  /**
   * Soft delete employee (set status to TERMINATED)
   */
  async delete(id: string, client?: PoolClient): Promise<boolean> {
    const query = `
      UPDATE employees 
      SET status = 'TERMINATED', 
          status_effective_date = CURRENT_DATE,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `;

    const result = await this.executeQuery(query, [id], client);
    return result.rowCount > 0;
  }

  /**
   * Get direct reports for a manager
   */
  async getDirectReports(managerId: string, client?: PoolClient): Promise<Employee[]> {
    const query = `
      SELECT e.*, d.name as department_name,
             CONCAT(m.first_name, ' ', m.last_name) as manager_name
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN employees m ON e.manager_id = m.id
      WHERE e.manager_id = $1 AND e.status != 'TERMINATED'
      ORDER BY e.first_name, e.last_name
    `;

    const result = await this.executeQuery(query, [managerId], client);
    return result.rows.map(row => this.mapRowToEmployeeModel(row));
  }

  /**
   * Search employees with full-text search
   */
  async searchEmployees(
    searchTerm: string,
    options?: {
      pagination?: PaginationOptions;
      filters?: EmployeeSearchCriteria;
    },
    client?: PoolClient
  ): Promise<PaginatedResult<Employee>> {
    const { pagination, filters = {} } = options || {};

    // Add search term to filters
    const searchFilters = { ...filters, search: searchTerm };

    return this.findAll({ pagination, filters: searchFilters }, client);
  }

  /**
   * Update employee status
   */
  async updateStatus(
    id: string,
    status: EmployeeStatusType,
    effectiveDate: Date,
    reason?: string,
    notes?: string,
    updatedBy?: string,
    client?: PoolClient
  ): Promise<Employee | null> {
    const updateData: UpdateEmployeeInput = {
      status,
      status_effective_date: effectiveDate,
      status_reason: reason,
      status_notes: notes,
      updated_by: updatedBy
    };

    return this.update(id, updateData, client);
  }

  /**
   * Build WHERE clause for employee search
   */
  private buildEmployeeWhereClause(filters: EmployeeSearchCriteria): { whereClause: string; params: any[] } {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    // Handle full-text search
    if (filters.search) {
      conditions.push(`(
        to_tsvector('english', e.first_name || ' ' || e.last_name || ' ' || e.email || ' ' || COALESCE(e.job_title, '')) 
        @@ plainto_tsquery('english', $${paramIndex++})
        OR e.employee_id ILIKE $${paramIndex++}
        OR e.email ILIKE $${paramIndex++}
      )`);
      params.push(filters.search, `%${filters.search}%`, `%${filters.search}%`);
    }

    // Handle other filters
    if (filters.department_id) {
      conditions.push(`e.department_id = $${paramIndex++}`);
      params.push(filters.department_id);
    }

    if (filters.manager_id) {
      conditions.push(`e.manager_id = $${paramIndex++}`);
      params.push(filters.manager_id);
    }

    if (filters.status) {
      conditions.push(`e.status = $${paramIndex++}`);
      params.push(filters.status);
    }

    if (filters.employment_type) {
      conditions.push(`e.employment_type = $${paramIndex++}`);
      params.push(filters.employment_type);
    }

    if (filters.start_date_from) {
      conditions.push(`e.start_date >= $${paramIndex++}`);
      params.push(filters.start_date_from);
    }

    if (filters.start_date_to) {
      conditions.push(`e.start_date <= $${paramIndex++}`);
      params.push(filters.start_date_to);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    return { whereClause, params };
  }

  /**
   * Map database row to Employee domain model
   */
  private mapRowToEmployeeModel(row: EmployeeRow): Employee {
    const employeeData: EmployeeData = {
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

  /**
   * Map Employee domain model to database input
   */
  private mapEmployeeToCreateInput(employee: Employee, createdBy: string): CreateEmployeeInput {
    const personalInfo = employee.personalInfo;
    const jobInfo = employee.jobInfo;
    const status = employee.status;

    return {
      employee_id: employee.employeeId,
      first_name: personalInfo.firstName,
      last_name: personalInfo.lastName,
      email: personalInfo.email,
      phone: personalInfo.phone,
      date_of_birth: personalInfo.dateOfBirth,
      social_security_number: personalInfo.socialSecurityNumber,
      address_line1: personalInfo.address?.street,
      city: personalInfo.address?.city,
      state: personalInfo.address?.state,
      postal_code: personalInfo.address?.zipCode,
      country: personalInfo.address?.country,
      emergency_contact_name: personalInfo.emergencyContact?.name,
      emergency_contact_phone: personalInfo.emergencyContact?.phone,
      emergency_contact_relationship: personalInfo.emergencyContact?.relationship,
      job_title: jobInfo.jobTitle,
      department_id: undefined, // Will need to be resolved from department name
      manager_id: jobInfo.managerId,
      start_date: jobInfo.startDate,
      employment_type: jobInfo.employmentType,
      salary: jobInfo.salary,
      location: jobInfo.location,
      status: status.current,
      status_effective_date: status.effectiveDate,
      status_reason: status.reason,
      status_notes: status.notes,
      created_by: createdBy
    };
  }
}