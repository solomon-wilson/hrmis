import { PoolClient } from 'pg';
import { Employee, EmployeeData } from '../models/Employee';
import { EmployeeRepository, EmployeeSearchCriteria } from '../database/repositories/employee';
import { AuditLogRepository } from '../database/repositories/audit';
import { PaginationOptions, PaginatedResult } from '../database/repositories/base';
import { ValidationError } from '../utils/validation';
import { database } from '../database/connection';

export interface CreateEmployeeRequest {
  employeeId: string;
  personalInfo: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    dateOfBirth?: Date;
    socialSecurityNumber?: string;
    address?: {
      street: string;
      city: string;
      state: string;
      zipCode: string;
      country: string;
    };
    emergencyContact?: {
      name: string;
      relationship: string;
      phone: string;
    };
  };
  jobInfo: {
    jobTitle: string;
    department: string;
    managerId?: string;
    startDate: Date;
    employmentType: 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'INTERN';
    salary?: number;
    location: string;
  };
  createdBy: string;
}

export interface UpdateEmployeeRequest {
  personalInfo?: Partial<CreateEmployeeRequest['personalInfo']>;
  jobInfo?: Partial<CreateEmployeeRequest['jobInfo']>;
  updatedBy: string;
}

export interface SearchCriteria {
  search?: string;
  department?: string;
  managerId?: string;
  status?: 'ACTIVE' | 'INACTIVE' | 'TERMINATED' | 'ON_LEAVE';
  employmentType?: 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'INTERN';
  startDateFrom?: Date;
  startDateTo?: Date;
}

export interface PermissionContext {
  userId: string;
  role: 'HR_ADMIN' | 'MANAGER' | 'EMPLOYEE' | 'VIEWER';
  managedEmployeeIds?: string[]; // For managers, list of employee IDs they manage
}



export interface OrganizationalChartNode {
  employee: Employee;
  directReports: OrganizationalChartNode[];
}

export class EmployeeService {
  private employeeRepository: EmployeeRepository;
  private auditLogRepository: AuditLogRepository;

  constructor() {
    this.employeeRepository = new EmployeeRepository();
    this.auditLogRepository = new AuditLogRepository();
  }



  /**
   * Create a new employee with validation and duplicate checking
   */
  async createEmployee(
    request: CreateEmployeeRequest,
    permissionContext: PermissionContext
  ): Promise<Employee> {
    // Check permissions - only HR_ADMIN can create employees
    if (permissionContext.role !== 'HR_ADMIN') {
      throw new ValidationError('Insufficient permissions to create employee', []);
    }

    const client = await database.getClient();
    
    try {
      await client.query('BEGIN');

      // Check for duplicate email
      const existingEmployee = await this.employeeRepository.findByEmail(
        request.personalInfo.email,
        client
      );
      
      if (existingEmployee) {
        throw new ValidationError('Employee with this email already exists', []);
      }

      // Check for duplicate employee ID
      const existingEmployeeId = await this.employeeRepository.findByEmployeeId(
        request.employeeId,
        client
      );
      
      if (existingEmployeeId) {
        throw new ValidationError('Employee ID already exists', []);
      }

      // Validate manager exists if provided
      if (request.jobInfo.managerId) {
        const manager = await this.employeeRepository.findById(request.jobInfo.managerId, client);
        if (!manager) {
          throw new ValidationError('Specified manager does not exist', []);
        }
        if (!manager.isActive()) {
          throw new ValidationError('Specified manager is not active', []);
        }
      }

      // Create employee data
      const employeeData: EmployeeData = {
        employeeId: request.employeeId,
        personalInfo: request.personalInfo,
        jobInfo: request.jobInfo,
        status: {
          current: 'ACTIVE',
          effectiveDate: new Date(),
          reason: 'New hire'
        },
        createdBy: request.createdBy,
        updatedBy: request.createdBy
      };

      // Create and validate employee model
      const employee = Employee.createNew(employeeData);

      // Map to repository input format
      const createInput = this.mapToCreateInput(employee, request.createdBy);
      
      // Create employee in database
      const createdEmployee = await this.employeeRepository.create(createInput, client);

      // Log the creation
      await this.auditLogRepository.logEmployeeCreate(
        createdEmployee.id,
        createdEmployee.toJSON(),
        request.createdBy,
        { action: 'employee_created' },
        client
      );

      await client.query('COMMIT');
      return createdEmployee;

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update an existing employee with change tracking and audit logging
   */
  async updateEmployee(
    id: string,
    request: UpdateEmployeeRequest,
    permissionContext: PermissionContext
  ): Promise<Employee> {
    const client = await database.getClient();
    
    try {
      await client.query('BEGIN');

      // Get existing employee
      const existingEmployee = await this.employeeRepository.findById(id, client);
      if (!existingEmployee) {
        throw new ValidationError('Employee not found', []);
      }

      // Check permissions
      this.validateUpdatePermissions(existingEmployee, permissionContext);

      // Store original data for audit logging
      const originalData = existingEmployee.toJSON();

      // Check for email uniqueness if email is being updated
      if (request.personalInfo?.email && 
          request.personalInfo.email !== existingEmployee.personalInfo.email) {
        const existingEmailEmployee = await this.employeeRepository.findByEmail(
          request.personalInfo.email,
          client
        );
        
        if (existingEmailEmployee && existingEmailEmployee.id !== id) {
          throw new ValidationError('Employee with this email already exists', []);
        }
      }

      // Validate manager if being updated
      if (request.jobInfo?.managerId) {
        if (request.jobInfo.managerId === id) {
          throw new ValidationError('Employee cannot be their own manager', []);
        }
        
        const manager = await this.employeeRepository.findById(request.jobInfo.managerId, client);
        if (!manager) {
          throw new ValidationError('Specified manager does not exist', []);
        }
        if (!manager.isActive()) {
          throw new ValidationError('Specified manager is not active', []);
        }

        // Check for circular reporting relationships
        await this.validateNoCircularReporting(id, request.jobInfo.managerId, client);
      }

      // Create updated employee data
      let updatedEmployee = existingEmployee;

      if (request.personalInfo) {
        updatedEmployee = updatedEmployee.updatePersonalInfo(
          request.personalInfo,
          request.updatedBy
        );
      }

      if (request.jobInfo) {
        updatedEmployee = updatedEmployee.updateJobInfo(
          request.jobInfo,
          request.updatedBy
        );
      }

      // Map to repository update format
      const updateInput = this.mapToUpdateInput(updatedEmployee, request.updatedBy);
      
      // Update employee in database
      const result = await this.employeeRepository.update(id, updateInput, client);
      if (!result) {
        throw new ValidationError('Failed to update employee', []);
      }

      // Log the update
      await this.auditLogRepository.logEmployeeUpdate(
        id,
        originalData,
        result.toJSON(),
        request.updatedBy,
        { action: 'employee_updated' },
        client
      );

      await client.query('COMMIT');
      return result;

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get employee by ID with permission filtering
   */
  async getEmployee(
    id: string,
    permissionContext: PermissionContext
  ): Promise<Employee | null> {
    const employee = await this.employeeRepository.findById(id);
    
    if (!employee) {
      return null;
    }

    // Check permissions
    if (!this.canViewEmployee(employee, permissionContext)) {
      throw new ValidationError('Insufficient permissions to view this employee', []);
    }

    // Filter sensitive data based on permissions
    return this.filterEmployeeData(employee, permissionContext);
  }

  /**
   * Search employees with permission filtering
   */
  async searchEmployees(
    criteria: SearchCriteria,
    pagination: PaginationOptions,
    permissionContext: PermissionContext
  ): Promise<PaginatedResult<Employee>> {
    // Convert search criteria to repository format
    const searchCriteria: EmployeeSearchCriteria = {
      search: criteria.search,
      department_id: criteria.department, // Note: This would need department name to ID mapping
      manager_id: criteria.managerId,
      status: criteria.status,
      employment_type: criteria.employmentType,
      start_date_from: criteria.startDateFrom,
      start_date_to: criteria.startDateTo
    };

    // Apply permission-based filtering
    if (permissionContext.role === 'MANAGER' && permissionContext.managedEmployeeIds) {
      // Managers can only see their direct reports
      const managedIds = permissionContext.managedEmployeeIds;
      if (managedIds.length === 0) {
        return {
          data: [],
          pagination: {
            page: pagination.page,
            limit: pagination.limit,
            total: 0,
            totalPages: 0,
            hasNext: false,
            hasPrev: false
          }
        };
      }
      // This would need to be implemented in the repository layer
      (searchCriteria as any).employee_ids = managedIds;
    } else if (permissionContext.role === 'EMPLOYEE') {
      // Employees can only see themselves
      (searchCriteria as any).employee_ids = [permissionContext.userId];
    }

    const result = await this.employeeRepository.findAll({
      pagination,
      filters: searchCriteria
    });

    // Filter sensitive data for each employee
    const filteredEmployees = result.data.map(employee => 
      this.filterEmployeeData(employee, permissionContext)
    );

    return {
      ...result,
      data: filteredEmployees
    };
  }

  /**
   * Get direct reports for a manager
   */
  async getDirectReports(
    managerId: string,
    permissionContext: PermissionContext
  ): Promise<Employee[]> {
    // Check permissions - only the manager themselves or HR_ADMIN can view direct reports
    if (permissionContext.role !== 'HR_ADMIN' && permissionContext.userId !== managerId) {
      throw new ValidationError('Insufficient permissions to view direct reports', []);
    }

    const directReports = await this.employeeRepository.getDirectReports(managerId);
    
    // Filter sensitive data based on permissions
    return directReports.map(employee => 
      this.filterEmployeeData(employee, permissionContext)
    );
  }

  /**
   * Update employee status with validation and history tracking
   */
  async updateEmployeeStatus(
    id: string,
    newStatus: 'ACTIVE' | 'INACTIVE' | 'TERMINATED' | 'ON_LEAVE',
    effectiveDate: Date,
    reason: string,
    notes?: string,
    permissionContext?: PermissionContext
  ): Promise<Employee> {
    // Check permissions - only HR_ADMIN can change employee status
    if (permissionContext && permissionContext.role !== 'HR_ADMIN') {
      throw new ValidationError('Insufficient permissions to change employee status', []);
    }

    const client = await database.getClient();
    
    try {
      await client.query('BEGIN');

      // Get existing employee
      const existingEmployee = await this.employeeRepository.findById(id, client);
      if (!existingEmployee) {
        throw new ValidationError('Employee not found', []);
      }

      // Get previous status for audit logging
      const previousStatus = existingEmployee.status.current;

      // Validate status transition
      this.validateStatusTransition(previousStatus, newStatus, reason);

      // Validate business rules for specific status changes
      if (newStatus === 'TERMINATED') {
        this.validateTermination(existingEmployee, reason, effectiveDate);
      } else if (newStatus === 'ON_LEAVE') {
        this.validateLeave(existingEmployee, reason, effectiveDate);
      }

      // Update in database
      const result = await this.employeeRepository.updateStatus(
        id,
        newStatus,
        effectiveDate,
        reason,
        notes,
        permissionContext?.userId,
        client
      );

      if (!result) {
        throw new ValidationError('Failed to update employee status', []);
      }

      // Log the status change
      await this.auditLogRepository.logEmployeeStatusChange(
        id,
        previousStatus,
        newStatus,
        reason,
        permissionContext?.userId,
        { 
          action: 'status_change',
          effectiveDate: effectiveDate.toISOString(),
          notes 
        },
        client
      );

      await client.query('COMMIT');
      return result;

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get employee status history
   */
  async getEmployeeStatusHistory(
    id: string,
    permissionContext: PermissionContext
  ): Promise<any[]> {
    // Check permissions
    if (permissionContext.role !== 'HR_ADMIN' && 
        permissionContext.role !== 'MANAGER' && 
        permissionContext.userId !== id) {
      throw new ValidationError('Insufficient permissions to view status history', []);
    }

    // Get employee to verify existence and permissions
    const employee = await this.employeeRepository.findById(id);
    if (!employee) {
      throw new ValidationError('Employee not found', []);
    }

    // Additional permission check for managers
    if (permissionContext.role === 'MANAGER' && 
        !permissionContext.managedEmployeeIds?.includes(id)) {
      throw new ValidationError('Managers can only view status history of their direct reports', []);
    }

    // Get audit trail for status changes
    const auditTrail = await this.auditLogRepository.getEntityAuditTrail(
      'EMPLOYEE',
      id,
      { pagination: { page: 1, limit: 100 } }
    );

    // Filter for status change events and format response
    return auditTrail.data
      .filter(log => log.action === 'STATUS_CHANGE')
      .map(log => ({
        id: log.id,
        previousStatus: log.changes?.before?.status,
        newStatus: log.changes?.after?.status,
        reason: log.changes?.after?.reason,
        effectiveDate: log.metadata?.effectiveDate,
        notes: log.metadata?.notes,
        changedBy: log.performedBy,
        changedAt: log.performedAt
      }));
  }

  /**
   * Validate status transition rules
   */
  private validateStatusTransition(
    currentStatus: string,
    newStatus: string,
    reason: string
  ): void {
    // Cannot change status of terminated employees
    if (currentStatus === 'TERMINATED') {
      throw new ValidationError('Cannot change status of terminated employee', []);
    }

    // Reason is required for all status changes
    if (!reason || reason.trim().length === 0) {
      throw new ValidationError('Reason is required for status changes', []);
    }

    // Specific validation for termination
    if (newStatus === 'TERMINATED') {
      const validTerminationReasons = [
        'RESIGNATION',
        'TERMINATION_FOR_CAUSE',
        'LAYOFF',
        'END_OF_CONTRACT',
        'RETIREMENT'
      ];
      
      if (!validTerminationReasons.includes(reason)) {
        throw new ValidationError(
          `Invalid termination reason. Must be one of: ${validTerminationReasons.join(', ')}`,
          []
        );
      }
    }

    // Specific validation for leave
    if (newStatus === 'ON_LEAVE') {
      const validLeaveReasons = [
        'MEDICAL_LEAVE',
        'MATERNITY_LEAVE',
        'PATERNITY_LEAVE',
        'PERSONAL_LEAVE',
        'SABBATICAL',
        'MILITARY_LEAVE'
      ];
      
      if (!validLeaveReasons.includes(reason)) {
        throw new ValidationError(
          `Invalid leave reason. Must be one of: ${validLeaveReasons.join(', ')}`,
          []
        );
      }
    }
  }

  /**
   * Validate termination business rules
   */
  private validateTermination(
    employee: Employee,
    reason: string,
    effectiveDate: Date
  ): void {
    // Effective date cannot be in the future for termination
    if (effectiveDate > new Date()) {
      throw new ValidationError('Termination effective date cannot be in the future', []);
    }

    // Effective date cannot be before start date
    if (effectiveDate < employee.jobInfo.startDate) {
      throw new ValidationError('Termination effective date cannot be before start date', []);
    }

    // Additional validation for specific termination reasons
    if (reason === 'RETIREMENT') {
      // Could add age validation here if we have date of birth
      // For now, just ensure it's not a new employee
      const yearsOfService = employee.getYearsOfService();
      if (yearsOfService < 1) {
        throw new ValidationError('Retirement requires at least 1 year of service', []);
      }
    }
  }

  /**
   * Validate leave business rules
   */
  private validateLeave(
    employee: Employee,
    reason: string,
    effectiveDate: Date
  ): void {
    // Effective date should not be too far in the past
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    if (effectiveDate < thirtyDaysAgo) {
      throw new ValidationError('Leave effective date cannot be more than 30 days in the past', []);
    }

    // Employee must be active to go on leave
    if (employee.status.current !== 'ACTIVE') {
      throw new ValidationError('Only active employees can go on leave', []);
    }

    // Additional validation for specific leave types
    if (reason === 'MEDICAL_LEAVE' || reason === 'MATERNITY_LEAVE' || reason === 'PATERNITY_LEAVE') {
      // Could add additional validation here (e.g., documentation requirements)
      // For now, just ensure employee has been with company for minimum period
      const monthsOfService = Math.floor(employee.getYearsOfService() * 12);
      if (monthsOfService < 3) {
        throw new ValidationError('Medical/family leave requires at least 3 months of service', []);
      }
    }
  }

  /**
   * Update manager-employee relationship
   */
  async updateManagerEmployeeRelationship(
    employeeId: string,
    newManagerId: string | null,
    permissionContext: PermissionContext
  ): Promise<Employee> {
    // Check permissions - only HR_ADMIN can change reporting relationships
    if (permissionContext.role !== 'HR_ADMIN') {
      throw new ValidationError('Insufficient permissions to change reporting relationships', []);
    }

    const client = await database.getClient();
    
    try {
      await client.query('BEGIN');

      // Get existing employee
      const existingEmployee = await this.employeeRepository.findById(employeeId, client);
      if (!existingEmployee) {
        throw new ValidationError('Employee not found', []);
      }

      // Store original data for audit logging
      const originalData = existingEmployee.toJSON();

      // Validate new manager if provided
      if (newManagerId) {
        if (newManagerId === employeeId) {
          throw new ValidationError('Employee cannot be their own manager', []);
        }
        
        const newManager = await this.employeeRepository.findById(newManagerId, client);
        if (!newManager) {
          throw new ValidationError('Specified manager does not exist', []);
        }
        if (!newManager.isActive()) {
          throw new ValidationError('Specified manager is not active', []);
        }

        // Check for circular reporting relationships
        await this.validateNoCircularReporting(employeeId, newManagerId, client);
      }

      // Update employee with new manager
      const updatedEmployee = existingEmployee.updateJobInfo(
        { managerId: newManagerId || undefined },
        permissionContext.userId
      );

      // Map to repository update format
      const updateInput = this.mapToUpdateInput(updatedEmployee, permissionContext.userId);
      
      // Update employee in database
      const result = await this.employeeRepository.update(employeeId, updateInput, client);
      if (!result) {
        throw new ValidationError('Failed to update manager relationship', []);
      }

      // Log the update
      await this.auditLogRepository.logEmployeeUpdate(
        employeeId,
        originalData,
        result.toJSON(),
        permissionContext.userId,
        { 
          action: 'manager_relationship_updated',
          previousManagerId: originalData.jobInfo.managerId,
          newManagerId: newManagerId
        },
        client
      );

      await client.query('COMMIT');
      return result;

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get organizational hierarchy for an employee (their manager chain)
   */
  async getEmployeeHierarchy(
    employeeId: string,
    permissionContext: PermissionContext
  ): Promise<Employee[]> {
    // Check permissions
    if (permissionContext.role !== 'HR_ADMIN' && 
        permissionContext.role !== 'MANAGER' && 
        permissionContext.userId !== employeeId) {
      throw new ValidationError('Insufficient permissions to view organizational hierarchy', []);
    }

    // Get employee to verify existence
    const employee = await this.employeeRepository.findById(employeeId);
    if (!employee) {
      throw new ValidationError('Employee not found', []);
    }

    // Additional permission check for managers
    if (permissionContext.role === 'MANAGER' && 
        !permissionContext.managedEmployeeIds?.includes(employeeId)) {
      throw new ValidationError('Managers can only view hierarchy of their direct reports', []);
    }

    const hierarchy: Employee[] = [];
    let currentManagerId = employee.jobInfo.managerId;

    // Walk up the management chain
    while (currentManagerId) {
      const manager = await this.employeeRepository.findById(currentManagerId);
      if (!manager) {
        break; // Manager not found, stop traversal
      }

      hierarchy.push(this.filterEmployeeData(manager, permissionContext));
      currentManagerId = manager.jobInfo.managerId;

      // Prevent infinite loops (shouldn't happen with proper validation, but safety check)
      if (hierarchy.length > 10) {
        break;
      }
    }

    return hierarchy;
  }

  /**
   * Get all employees in a manager's organization (direct and indirect reports)
   */
  async getManagerOrganization(
    managerId: string,
    permissionContext: PermissionContext,
    includeIndirectReports: boolean = false
  ): Promise<Employee[]> {
    // Check permissions - only the manager themselves or HR_ADMIN can view organization
    if (permissionContext.role !== 'HR_ADMIN' && permissionContext.userId !== managerId) {
      throw new ValidationError('Insufficient permissions to view organization', []);
    }

    // Verify manager exists
    const manager = await this.employeeRepository.findById(managerId);
    if (!manager) {
      throw new ValidationError('Manager not found', []);
    }

    if (includeIndirectReports) {
      return this.getAllReportsRecursive(managerId, permissionContext, new Set());
    } else {
      // Just get direct reports
      return this.getDirectReports(managerId, permissionContext);
    }
  }

  /**
   * Recursively get all reports (direct and indirect) for a manager
   */
  private async getAllReportsRecursive(
    managerId: string,
    permissionContext: PermissionContext,
    visited: Set<string>
  ): Promise<Employee[]> {
    // Prevent infinite loops
    if (visited.has(managerId)) {
      return [];
    }
    visited.add(managerId);

    const allReports: Employee[] = [];
    const directReports = await this.employeeRepository.getDirectReports(managerId);

    for (const employee of directReports) {
      // Add the direct report
      allReports.push(this.filterEmployeeData(employee, permissionContext));

      // Recursively get their reports
      const indirectReports = await this.getAllReportsRecursive(
        employee.id,
        permissionContext,
        visited
      );
      allReports.push(...indirectReports);
    }

    return allReports;
  }

  /**
   * Get organizational chart data for a department or manager
   */
  async getOrganizationalChart(
    rootManagerId: string,
    permissionContext: PermissionContext,
    maxDepth: number = 3
  ): Promise<OrganizationalChartNode> {
    // Check permissions
    if (permissionContext.role !== 'HR_ADMIN' && 
        permissionContext.role !== 'MANAGER') {
      throw new ValidationError('Insufficient permissions to view organizational chart', []);
    }

    // Additional permission check for managers
    if (permissionContext.role === 'MANAGER' && 
        permissionContext.userId !== rootManagerId) {
      throw new ValidationError('Managers can only view their own organizational chart', []);
    }

    // Get root manager
    const rootManager = await this.employeeRepository.findById(rootManagerId);
    if (!rootManager) {
      throw new ValidationError('Root manager not found', []);
    }

    return this.buildOrganizationalChartNode(
      rootManager,
      permissionContext,
      maxDepth,
      0,
      new Set()
    );
  }

  /**
   * Build organizational chart node recursively
   */
  private async buildOrganizationalChartNode(
    employee: Employee,
    permissionContext: PermissionContext,
    maxDepth: number,
    currentDepth: number,
    visited: Set<string>
  ): Promise<OrganizationalChartNode> {
    // Prevent infinite loops and respect max depth
    if (visited.has(employee.id) || currentDepth >= maxDepth) {
      return {
        employee: this.filterEmployeeData(employee, permissionContext),
        directReports: []
      };
    }

    visited.add(employee.id);

    const directReports = await this.employeeRepository.getDirectReports(employee.id);
    const chartNode: OrganizationalChartNode = {
      employee: this.filterEmployeeData(employee, permissionContext),
      directReports: []
    };

    // Recursively build nodes for direct reports
    for (const report of directReports) {
      const childNode = await this.buildOrganizationalChartNode(
        report,
        permissionContext,
        maxDepth,
        currentDepth + 1,
        visited
      );
      chartNode.directReports.push(childNode);
    }

    return chartNode;
  }

  /**
   * Validate that updating a manager relationship won't create circular reporting
   */
  async validateManagerRelationshipUpdate(
    employeeId: string,
    newManagerId: string,
    permissionContext: PermissionContext
  ): Promise<{ isValid: boolean; reason?: string }> {
    // Check permissions
    if (permissionContext.role !== 'HR_ADMIN') {
      return { isValid: false, reason: 'Insufficient permissions' };
    }

    const client = await database.getClient();
    
    try {
      // Check if employee exists
      const employee = await this.employeeRepository.findById(employeeId, client);
      if (!employee) {
        return { isValid: false, reason: 'Employee not found' };
      }

      // Check if new manager exists
      const newManager = await this.employeeRepository.findById(newManagerId, client);
      if (!newManager) {
        return { isValid: false, reason: 'Manager not found' };
      }

      // Check if manager is active
      if (!newManager.isActive()) {
        return { isValid: false, reason: 'Manager is not active' };
      }

      // Check for self-reporting
      if (employeeId === newManagerId) {
        return { isValid: false, reason: 'Employee cannot be their own manager' };
      }

      // Check for circular reporting
      try {
        await this.validateNoCircularReporting(employeeId, newManagerId, client);
        return { isValid: true };
      } catch (error) {
        if (error instanceof ValidationError) {
          return { isValid: false, reason: error.message };
        }
        throw error;
      }

    } finally {
      client.release();
    }
  }

  /**
   * Validate update permissions
   */
  private validateUpdatePermissions(
    employee: Employee,
    permissionContext: PermissionContext
  ): void {
    switch (permissionContext.role) {
      case 'HR_ADMIN':
        // HR admins can update any employee
        return;
      
      case 'MANAGER':
        // Managers can only update their direct reports (limited fields)
        if (!permissionContext.managedEmployeeIds?.includes(employee.id)) {
          throw new ValidationError('Managers can only update their direct reports', []);
        }
        return;
      
      case 'EMPLOYEE':
        // Employees can only update their own profile (limited fields)
        if (permissionContext.userId !== employee.id) {
          throw new ValidationError('Employees can only update their own profile', []);
        }
        return;
      
      default:
        throw new ValidationError('Insufficient permissions to update employee', []);
    }
  }

  /**
   * Check if user can view employee
   */
  private canViewEmployee(
    employee: Employee,
    permissionContext: PermissionContext
  ): boolean {
    switch (permissionContext.role) {
      case 'HR_ADMIN':
      case 'VIEWER':
        return true;
      
      case 'MANAGER':
        return permissionContext.managedEmployeeIds?.includes(employee.id) || false;
      
      case 'EMPLOYEE':
        return permissionContext.userId === employee.id;
      
      default:
        return false;
    }
  }

  /**
   * Filter employee data based on permissions
   */
  private filterEmployeeData(
    employee: Employee,
    permissionContext: PermissionContext
  ): Employee {
    // HR_ADMIN sees all data
    if (permissionContext.role === 'HR_ADMIN') {
      return employee;
    }

    // Create a copy of employee data
    const employeeData = employee.toJSON();

    // Filter sensitive fields based on role
    if (permissionContext.role === 'MANAGER' || permissionContext.role === 'EMPLOYEE' || permissionContext.role === 'VIEWER') {
      // Remove salary information for non-HR users
      if (employeeData.jobInfo.salary) {
        delete employeeData.jobInfo.salary;
      }
      
      // Remove SSN for non-HR users
      if (employeeData.personalInfo.socialSecurityNumber) {
        delete employeeData.personalInfo.socialSecurityNumber;
      }
    }

    // VIEWER role gets limited information
    if (permissionContext.role === 'VIEWER') {
      // Remove personal contact information
      delete employeeData.personalInfo.phone;
      delete employeeData.personalInfo.address;
      delete employeeData.personalInfo.emergencyContact;
      delete employeeData.personalInfo.dateOfBirth;
    }

    return Employee.fromJSON(employeeData);
  }

  /**
   * Validate no circular reporting relationships
   */
  private async validateNoCircularReporting(
    employeeId: string,
    newManagerId: string,
    client: PoolClient
  ): Promise<void> {
    let currentManagerId: string | undefined = newManagerId;
    const visited = new Set<string>();
    
    while (currentManagerId) {
      if (visited.has(currentManagerId)) {
        throw new ValidationError('Circular reporting relationship detected', []);
      }
      
      if (currentManagerId === employeeId) {
        throw new ValidationError('Circular reporting relationship detected', []);
      }
      
      visited.add(currentManagerId);
      
      const manager = await this.employeeRepository.findById(currentManagerId, client);
      currentManagerId = manager?.jobInfo.managerId || undefined;
    }
  }

  /**
   * Map Employee model to repository create input
   */
  private mapToCreateInput(employee: Employee, createdBy: string): any {
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
      country: personalInfo.address?.country || 'United States',
      emergency_contact_name: personalInfo.emergencyContact?.name,
      emergency_contact_phone: personalInfo.emergencyContact?.phone,
      emergency_contact_relationship: personalInfo.emergencyContact?.relationship,
      job_title: jobInfo.jobTitle,
      department_id: null, // Would need department name to ID mapping
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

  /**
   * Map Employee model to repository update input
   */
  private mapToUpdateInput(employee: Employee, updatedBy: string): any {
    const personalInfo = employee.personalInfo;
    const jobInfo = employee.jobInfo;
    const status = employee.status;

    return {
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
      department_id: null, // Would need department name to ID mapping
      manager_id: jobInfo.managerId,
      start_date: jobInfo.startDate,
      employment_type: jobInfo.employmentType,
      salary: jobInfo.salary,
      location: jobInfo.location,
      status: status.current,
      status_effective_date: status.effectiveDate,
      status_reason: status.reason,
      status_notes: status.notes,
      updated_by: updatedBy
    };
  }
}