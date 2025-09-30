import { Employee } from '../models/Employee';
import { EmployeeRepository } from '../database/repositories/employee';
import { AuditLogRepository } from '../database/repositories/audit';
import { ValidationError } from '../utils/validation';
import { database } from '../database/connection';
import { StaffDocumentRepository } from '../database/repositories/StaffDocumentRepository';
import { FileStorageService } from './document-management/FileStorageService';
import { logger } from '../utils/logger';
export class EmployeeService {
    constructor() {
        this.employeeRepository = new EmployeeRepository();
        this.auditLogRepository = new AuditLogRepository();
        this.staffDocumentRepository = new StaffDocumentRepository();
    }
    /**
     * Create a new employee with validation and duplicate checking
     */
    async createEmployee(request, permissionContext) {
        // Check permissions - only HR_ADMIN can create employees
        if (permissionContext.role !== 'HR_ADMIN') {
            throw new ValidationError('Insufficient permissions to create employee', []);
        }
        const client = await database.getClient();
        try {
            await client.query('BEGIN');
            // Check for duplicate email
            const existingEmployee = await this.employeeRepository.findByEmail(request.personalInfo.email, client);
            if (existingEmployee) {
                throw new ValidationError('Employee with this email already exists', []);
            }
            // Check for duplicate employee ID
            const existingEmployeeId = await this.employeeRepository.findByEmployeeId(request.employeeId, client);
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
            const employeeData = {
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
            await this.auditLogRepository.logEmployeeCreate(createdEmployee.id, createdEmployee.toJSON(), request.createdBy, { action: 'employee_created' }, client);
            await client.query('COMMIT');
            return createdEmployee;
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
    }
    /**
     * Update an existing employee with change tracking and audit logging
     */
    async updateEmployee(id, request, permissionContext) {
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
                const existingEmailEmployee = await this.employeeRepository.findByEmail(request.personalInfo.email, client);
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
                updatedEmployee = updatedEmployee.updatePersonalInfo(request.personalInfo, request.updatedBy);
            }
            if (request.jobInfo) {
                updatedEmployee = updatedEmployee.updateJobInfo(request.jobInfo, request.updatedBy);
            }
            // Map to repository update format
            const updateInput = this.mapToUpdateInput(updatedEmployee, request.updatedBy);
            // Update employee in database
            const result = await this.employeeRepository.update(id, updateInput, client);
            if (!result) {
                throw new ValidationError('Failed to update employee', []);
            }
            // Log the update
            await this.auditLogRepository.logEmployeeUpdate(id, originalData, result.toJSON(), request.updatedBy, { action: 'employee_updated' }, client);
            await client.query('COMMIT');
            return result;
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
    }
    /**
     * Get employee by ID with permission filtering
     */
    async getEmployee(id, permissionContext) {
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
    async searchEmployees(criteria, pagination, permissionContext) {
        // Convert search criteria to repository format
        const searchCriteria = {
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
            searchCriteria.employee_ids = managedIds;
        }
        else if (permissionContext.role === 'EMPLOYEE') {
            // Employees can only see themselves
            searchCriteria.employee_ids = [permissionContext.userId];
        }
        const result = await this.employeeRepository.findAll({
            pagination,
            filters: searchCriteria
        });
        // Filter sensitive data for each employee
        const filteredEmployees = result.data.map(employee => this.filterEmployeeData(employee, permissionContext));
        return {
            ...result,
            data: filteredEmployees
        };
    }
    /**
     * Get direct reports for a manager
     */
    async getDirectReports(managerId, permissionContext) {
        // Check permissions - only the manager themselves or HR_ADMIN can view direct reports
        if (permissionContext.role !== 'HR_ADMIN' && permissionContext.userId !== managerId) {
            throw new ValidationError('Insufficient permissions to view direct reports', []);
        }
        const directReports = await this.employeeRepository.getDirectReports(managerId);
        // Filter sensitive data based on permissions
        return directReports.map(employee => this.filterEmployeeData(employee, permissionContext));
    }
    /**
     * Update employee status with validation and history tracking
     */
    async updateEmployeeStatus(id, newStatus, effectiveDate, reason, notes, permissionContext) {
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
            }
            else if (newStatus === 'ON_LEAVE') {
                this.validateLeave(existingEmployee, reason, effectiveDate);
            }
            // Update in database
            const result = await this.employeeRepository.updateStatus(id, newStatus, effectiveDate, reason, notes, permissionContext?.userId, client);
            if (!result) {
                throw new ValidationError('Failed to update employee status', []);
            }
            // Log the status change
            await this.auditLogRepository.logEmployeeStatusChange(id, previousStatus, newStatus, reason, permissionContext?.userId, {
                action: 'status_change',
                effectiveDate: effectiveDate.toISOString(),
                notes
            }, client);
            await client.query('COMMIT');
            return result;
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
    }
    /**
     * Get employee status history
     */
    async getEmployeeStatusHistory(id, permissionContext) {
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
        const auditTrail = await this.auditLogRepository.getEntityAuditTrail('EMPLOYEE', id, { pagination: { page: 1, limit: 100 } });
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
    validateStatusTransition(currentStatus, newStatus, reason) {
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
                throw new ValidationError(`Invalid termination reason. Must be one of: ${validTerminationReasons.join(', ')}`, []);
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
                throw new ValidationError(`Invalid leave reason. Must be one of: ${validLeaveReasons.join(', ')}`, []);
            }
        }
    }
    /**
     * Validate termination business rules
     */
    validateTermination(employee, reason, effectiveDate) {
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
    validateLeave(employee, reason, effectiveDate) {
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
    async updateManagerEmployeeRelationship(employeeId, newManagerId, permissionContext) {
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
            const updatedEmployee = existingEmployee.updateJobInfo({ managerId: newManagerId || undefined }, permissionContext.userId);
            // Map to repository update format
            const updateInput = this.mapToUpdateInput(updatedEmployee, permissionContext.userId);
            // Update employee in database
            const result = await this.employeeRepository.update(employeeId, updateInput, client);
            if (!result) {
                throw new ValidationError('Failed to update manager relationship', []);
            }
            // Log the update
            await this.auditLogRepository.logEmployeeUpdate(employeeId, originalData, result.toJSON(), permissionContext.userId, {
                action: 'manager_relationship_updated',
                previousManagerId: originalData.jobInfo.managerId,
                newManagerId: newManagerId
            }, client);
            await client.query('COMMIT');
            return result;
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
    }
    /**
     * Get organizational hierarchy for an employee (their manager chain)
     */
    async getEmployeeHierarchy(employeeId, permissionContext) {
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
        const hierarchy = [];
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
    async getManagerOrganization(managerId, permissionContext, includeIndirectReports = false) {
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
        }
        else {
            // Just get direct reports
            return this.getDirectReports(managerId, permissionContext);
        }
    }
    /**
     * Recursively get all reports (direct and indirect) for a manager
     */
    async getAllReportsRecursive(managerId, permissionContext, visited) {
        // Prevent infinite loops
        if (visited.has(managerId)) {
            return [];
        }
        visited.add(managerId);
        const allReports = [];
        const directReports = await this.employeeRepository.getDirectReports(managerId);
        for (const employee of directReports) {
            // Add the direct report
            allReports.push(this.filterEmployeeData(employee, permissionContext));
            // Recursively get their reports
            const indirectReports = await this.getAllReportsRecursive(employee.id, permissionContext, visited);
            allReports.push(...indirectReports);
        }
        return allReports;
    }
    /**
     * Get organizational chart data for a department or manager
     */
    async getOrganizationalChart(rootManagerId, permissionContext, maxDepth = 3) {
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
        return this.buildOrganizationalChartNode(rootManager, permissionContext, maxDepth, 0, new Set());
    }
    /**
     * Build organizational chart node recursively
     */
    async buildOrganizationalChartNode(employee, permissionContext, maxDepth, currentDepth, visited) {
        // Prevent infinite loops and respect max depth
        if (visited.has(employee.id) || currentDepth >= maxDepth) {
            return {
                employee: this.filterEmployeeData(employee, permissionContext),
                directReports: []
            };
        }
        visited.add(employee.id);
        const directReports = await this.employeeRepository.getDirectReports(employee.id);
        const chartNode = {
            employee: this.filterEmployeeData(employee, permissionContext),
            directReports: []
        };
        // Recursively build nodes for direct reports
        for (const report of directReports) {
            const childNode = await this.buildOrganizationalChartNode(report, permissionContext, maxDepth, currentDepth + 1, visited);
            chartNode.directReports.push(childNode);
        }
        return chartNode;
    }
    /**
     * Validate that updating a manager relationship won't create circular reporting
     */
    async validateManagerRelationshipUpdate(employeeId, newManagerId, permissionContext) {
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
            }
            catch (error) {
                if (error instanceof ValidationError) {
                    return { isValid: false, reason: error.message };
                }
                throw error;
            }
        }
        finally {
            client.release();
        }
    }
    /**
     * Validate update permissions
     */
    validateUpdatePermissions(employee, permissionContext) {
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
    canViewEmployee(employee, permissionContext) {
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
    filterEmployeeData(employee, permissionContext) {
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
    async validateNoCircularReporting(employeeId, newManagerId, client) {
        let currentManagerId = newManagerId;
        const visited = new Set();
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
    mapToCreateInput(employee, createdBy) {
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
    mapToUpdateInput(employee, updatedBy) {
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
    // ==============================================
    // DOCUMENT INTEGRATION METHODS
    // ==============================================
    /**
     * Get document summary for employee profile
     */
    async getEmployeeDocumentSummary(employeeId, permissionContext) {
        try {
            // Check permissions
            if (!this.canAccessEmployeeDocuments(employeeId, permissionContext)) {
                throw new ValidationError('Insufficient permissions to access employee documents', []);
            }
            logger.info('Getting document summary for employee', {
                employeeId,
                requestedBy: permissionContext.userId
            });
            // Get document statistics
            const stats = await this.staffDocumentRepository.getDocumentStats(employeeId);
            // Get passport photo URL if available
            let passportPhotoUrl;
            try {
                const passportPhotos = await this.staffDocumentRepository.search({
                    employeeId,
                    category: 'PASSPORT_PHOTO',
                    status: 'APPROVED'
                }, { limit: 1, sortBy: 'created_at', sortOrder: 'desc' });
                if (passportPhotos.documents.length > 0) {
                    const latestPhoto = passportPhotos.documents[0];
                    passportPhotoUrl = await FileStorageService.getDownloadUrl(latestPhoto.filePath, 'PASSPORT_PHOTO');
                }
            }
            catch (error) {
                logger.warn('Failed to get passport photo', {
                    employeeId,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
            // Check for missing required documents
            const requiredDocuments = [
                'PERSONAL_IDENTIFICATION',
                'EMPLOYMENT_CONTRACT',
                'PASSPORT_PHOTO'
            ];
            const missingRequiredDocuments = requiredDocuments.filter(category => !stats.byCategory[category] || stats.byCategory[category] === 0);
            // Get last update date from most recent document
            const recentDocuments = await this.staffDocumentRepository.search({
                employeeId
            }, { limit: 1, sortBy: 'updated_at', sortOrder: 'desc' });
            const lastUpdated = recentDocuments.documents.length > 0
                ? recentDocuments.documents[0].updatedAt
                : undefined;
            return {
                totalDocuments: stats.total,
                documentsByCategory: stats.byCategory,
                documentsByStatus: stats.byStatus,
                expiringDocuments: stats.expiring,
                passportPhotoUrl,
                missingRequiredDocuments,
                lastUpdated
            };
        }
        catch (error) {
            logger.error('Error getting employee document summary', {
                error: error instanceof Error ? error.message : 'Unknown error',
                employeeId,
                requestedBy: permissionContext.userId
            });
            throw error;
        }
    }
    /**
     * Get passport photo URL for employee display
     */
    async getEmployeePassportPhoto(employeeId, permissionContext) {
        try {
            // Check permissions
            if (!this.canAccessEmployeeDocuments(employeeId, permissionContext)) {
                throw new ValidationError('Insufficient permissions to access employee photo', []);
            }
            logger.info('Getting passport photo for employee', {
                employeeId,
                requestedBy: permissionContext.userId
            });
            // Find the most recent approved passport photo
            const photos = await this.staffDocumentRepository.search({
                employeeId,
                category: 'PASSPORT_PHOTO',
                status: 'APPROVED'
            }, {
                limit: 1,
                sortBy: 'created_at',
                sortOrder: 'desc'
            });
            if (photos.documents.length === 0) {
                return null;
            }
            const photo = photos.documents[0];
            return await FileStorageService.getDownloadUrl(photo.filePath, 'PASSPORT_PHOTO');
        }
        catch (error) {
            logger.error('Error getting employee passport photo', {
                error: error instanceof Error ? error.message : 'Unknown error',
                employeeId,
                requestedBy: permissionContext.userId
            });
            throw error;
        }
    }
    /**
     * Check document requirements for employee
     */
    async checkEmployeeDocumentRequirements(employeeId, permissionContext) {
        try {
            // Check permissions
            if (!this.canAccessEmployeeDocuments(employeeId, permissionContext)) {
                throw new ValidationError('Insufficient permissions to check document requirements', []);
            }
            logger.info('Checking document requirements for employee', {
                employeeId,
                requestedBy: permissionContext.userId
            });
            // Get employee info to determine requirements based on role/type
            const employee = await this.employeeRepository.findById(employeeId);
            if (!employee) {
                throw new ValidationError('Employee not found', []);
            }
            // Define document requirements based on employee type
            const requirements = this.getDocumentRequirements(employee);
            // Get all employee documents
            const allDocuments = await this.staffDocumentRepository.search({
                employeeId
            }, { limit: 100 });
            // Group documents by category (get the most recent approved one for each category)
            const documentsByCategory = new Map();
            allDocuments.documents
                .filter(doc => doc.status === 'APPROVED')
                .forEach(doc => {
                const existing = documentsByCategory.get(doc.category);
                if (!existing || doc.createdAt > existing.createdAt) {
                    documentsByCategory.set(doc.category, doc);
                }
            });
            const now = new Date();
            const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
            // Check each requirement
            const requiredDocuments = requirements.map(req => {
                const document = documentsByCategory.get(req.category);
                const isExpired = document?.expiresAt ? document.expiresAt < now : false;
                const isExpiringSoon = document?.expiresAt ?
                    document.expiresAt <= thirtyDaysFromNow && document.expiresAt > now : false;
                return {
                    category: req.category,
                    required: req.required,
                    present: !!document,
                    status: document?.status,
                    expiresAt: document?.expiresAt,
                    isExpired,
                    isExpiringSoon
                };
            });
            // Calculate compliance
            const requiredDocs = requiredDocuments.filter(doc => doc.required);
            const compliantDocs = requiredDocs.filter(doc => doc.present && !doc.isExpired && doc.status === 'APPROVED');
            const complianceScore = requiredDocs.length > 0
                ? Math.round((compliantDocs.length / requiredDocs.length) * 100)
                : 100;
            const isCompliant = complianceScore === 100;
            return {
                isCompliant,
                requiredDocuments,
                complianceScore
            };
        }
        catch (error) {
            logger.error('Error checking employee document requirements', {
                error: error instanceof Error ? error.message : 'Unknown error',
                employeeId,
                requestedBy: permissionContext.userId
            });
            throw error;
        }
    }
    /**
     * Get employee document statistics for reporting
     */
    async getEmployeeDocumentStatistics(employeeId, permissionContext) {
        try {
            // Check permissions
            if (!this.canAccessEmployeeDocuments(employeeId, permissionContext)) {
                throw new ValidationError('Insufficient permissions to access employee document statistics', []);
            }
            logger.info('Getting document statistics for employee', {
                employeeId,
                requestedBy: permissionContext.userId
            });
            // Get basic stats
            const stats = await this.staffDocumentRepository.getDocumentStats(employeeId);
            // Get all documents for detailed breakdown
            const allDocuments = await this.staffDocumentRepository.search({
                employeeId
            }, { limit: 100 });
            const now = new Date();
            const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
            // Calculate summary statistics
            const expiredDocuments = allDocuments.documents.filter(doc => doc.expiresAt && doc.expiresAt < now && doc.status === 'APPROVED').length;
            const expiringDocuments = allDocuments.documents.filter(doc => doc.expiresAt && doc.expiresAt <= thirtyDaysFromNow && doc.expiresAt > now && doc.status === 'APPROVED').length;
            const summary = {
                totalDocuments: stats.total,
                approvedDocuments: stats.byStatus['APPROVED'] || 0,
                pendingDocuments: stats.byStatus['PENDING'] || 0,
                rejectedDocuments: stats.byStatus['REJECTED'] || 0,
                expiredDocuments,
                expiringDocuments
            };
            // Category breakdown
            const categoryBreakdown = {};
            Object.keys(stats.byCategory).forEach(category => {
                const categoryDocs = allDocuments.documents.filter(doc => doc.category === category);
                categoryBreakdown[category] = {
                    total: categoryDocs.length,
                    approved: categoryDocs.filter(doc => doc.status === 'APPROVED').length,
                    pending: categoryDocs.filter(doc => doc.status === 'PENDING').length,
                    rejected: categoryDocs.filter(doc => doc.status === 'REJECTED').length,
                    expired: categoryDocs.filter(doc => doc.expiresAt && doc.expiresAt < now && doc.status === 'APPROVED').length
                };
            });
            // Recent activity (last 10 documents)
            const recentDocs = await this.staffDocumentRepository.search({
                employeeId
            }, { limit: 10, sortBy: 'updated_at', sortOrder: 'desc' });
            const recentActivity = recentDocs.documents.map(doc => ({
                action: this.getDocumentAction(doc),
                documentTitle: doc.title,
                category: doc.category,
                date: doc.updatedAt,
                status: doc.status
            }));
            return {
                summary,
                categoryBreakdown,
                recentActivity
            };
        }
        catch (error) {
            logger.error('Error getting employee document statistics', {
                error: error instanceof Error ? error.message : 'Unknown error',
                employeeId,
                requestedBy: permissionContext.userId
            });
            throw error;
        }
    }
    /**
     * Check if user can access employee documents
     */
    canAccessEmployeeDocuments(employeeId, permissionContext) {
        // HR Admin can access all documents
        if (permissionContext.role === 'HR_ADMIN') {
            return true;
        }
        // Employees can access their own documents
        if (permissionContext.userId === employeeId) {
            return true;
        }
        // Managers can access their direct reports' documents
        if (permissionContext.role === 'MANAGER' &&
            permissionContext.managedEmployeeIds?.includes(employeeId)) {
            return true;
        }
        return false;
    }
    /**
     * Get document requirements based on employee type
     */
    getDocumentRequirements(employee) {
        const baseRequirements = [
            {
                category: 'PERSONAL_IDENTIFICATION',
                required: true,
                description: 'Government-issued ID (passport, driver\'s license, etc.)'
            },
            {
                category: 'EMPLOYMENT_CONTRACT',
                required: true,
                description: 'Signed employment contract'
            },
            {
                category: 'PASSPORT_PHOTO',
                required: true,
                description: 'Professional passport-style photograph'
            },
            {
                category: 'EMERGENCY_CONTACT',
                required: true,
                description: 'Emergency contact information form'
            },
            {
                category: 'BANK_DETAILS',
                required: true,
                description: 'Bank details for payroll'
            }
        ];
        // Add additional requirements based on employment type or other factors
        const additionalRequirements = [];
        if (employee.jobInfo.employmentType === 'FULL_TIME') {
            additionalRequirements.push({
                category: 'TAX_INFORMATION',
                required: true,
                description: 'Tax forms and declarations'
            });
        }
        return [...baseRequirements, ...additionalRequirements];
    }
    /**
     * Determine the action based on document status and timing
     */
    getDocumentAction(document) {
        const now = new Date();
        const timeSinceUpdate = now.getTime() - document.updatedAt.getTime();
        const daysSinceUpdate = timeSinceUpdate / (1000 * 60 * 60 * 24);
        if (daysSinceUpdate < 1) {
            switch (document.status) {
                case 'PENDING': return 'Uploaded';
                case 'APPROVED': return 'Approved';
                case 'REJECTED': return 'Rejected';
                default: return 'Updated';
            }
        }
        else {
            return 'Modified';
        }
    }
}
