import { Employee } from '../models/Employee';
import { EmployeeRepository } from '../database/repositories/employee';
import { AuditLogRepository } from '../database/repositories/audit';
import { database } from '../database/connection';
import { ValidationError } from '../utils/validation';
export class ReportService {
    constructor() {
        this.employeeRepository = new EmployeeRepository();
        this.auditLogRepository = new AuditLogRepository();
    }
    /**
     * Generate employee roster report with filtering capabilities
     */
    async generateEmployeeRosterReport(filters, permissionContext) {
        // Check permissions - only HR_ADMIN and MANAGER can generate reports
        if (permissionContext.role !== 'HR_ADMIN' && permissionContext.role !== 'MANAGER') {
            throw new ValidationError('Insufficient permissions to generate reports', []);
        }
        const client = await database.getClient();
        try {
            // Convert filters to repository search criteria
            const searchCriteria = this.convertFiltersToSearchCriteria(filters);
            // Apply permission-based filtering for managers
            if (permissionContext.role === 'MANAGER' && permissionContext.managedEmployeeIds) {
                searchCriteria.employee_ids = permissionContext.managedEmployeeIds;
            }
            // Get all employees matching criteria (no pagination for reports)
            const result = await this.employeeRepository.findAll({
                filters: searchCriteria,
                pagination: { page: 1, limit: 10000 } // Large limit for reports
            }, client);
            // Filter sensitive data based on permissions
            const filteredEmployees = result.data.map(employee => this.filterEmployeeDataForReport(employee, permissionContext));
            // Log report generation
            await this.auditLogRepository.logReportGeneration('EMPLOYEE_ROSTER', filters, result.data.length, permissionContext.userId, { action: 'report_generated' }, client);
            return {
                employees: filteredEmployees,
                totalCount: result.data.length,
                filters,
                generatedAt: new Date(),
                generatedBy: permissionContext.userId
            };
        }
        finally {
            client.release();
        }
    }
    /**
     * Generate department breakdown report
     */
    async generateDepartmentBreakdownReport(filters, permissionContext) {
        // Check permissions
        if (permissionContext.role !== 'HR_ADMIN' && permissionContext.role !== 'MANAGER') {
            throw new ValidationError('Insufficient permissions to generate reports', []);
        }
        const client = await database.getClient();
        try {
            // Get department breakdown data
            const departmentSummaries = await this.getDepartmentSummaries(filters, permissionContext, client);
            const totalEmployees = departmentSummaries.reduce((sum, dept) => sum + dept.totalEmployees, 0);
            // Log report generation
            await this.auditLogRepository.logReportGeneration('DEPARTMENT_BREAKDOWN', filters, totalEmployees, permissionContext.userId, { action: 'report_generated' }, client);
            return {
                departments: departmentSummaries,
                totalEmployees,
                filters,
                generatedAt: new Date(),
                generatedBy: permissionContext.userId
            };
        }
        finally {
            client.release();
        }
    }
    /**
     * Generate comprehensive workforce analytics
     */
    async generateWorkforceAnalytics(filters, permissionContext) {
        // Check permissions - only HR_ADMIN can generate comprehensive analytics
        if (permissionContext.role !== 'HR_ADMIN') {
            throw new ValidationError('Insufficient permissions to generate workforce analytics', []);
        }
        const client = await database.getClient();
        try {
            // Get all employees for analytics
            const searchCriteria = this.convertFiltersToSearchCriteria(filters);
            const result = await this.employeeRepository.findAll({
                filters: searchCriteria,
                pagination: { page: 1, limit: 10000 }
            }, client);
            const employees = result.data;
            // Calculate status breakdown
            const statusBreakdown = {
                active: employees.filter(e => e.status.current === 'ACTIVE').length,
                inactive: employees.filter(e => e.status.current === 'INACTIVE').length,
                terminated: employees.filter(e => e.status.current === 'TERMINATED').length,
                onLeave: employees.filter(e => e.status.current === 'ON_LEAVE').length
            };
            // Calculate employment type breakdown
            const employmentTypeBreakdown = {
                fullTime: employees.filter(e => e.jobInfo.employmentType === 'FULL_TIME').length,
                partTime: employees.filter(e => e.jobInfo.employmentType === 'PART_TIME').length,
                contract: employees.filter(e => e.jobInfo.employmentType === 'CONTRACT').length,
                intern: employees.filter(e => e.jobInfo.employmentType === 'INTERN').length
            };
            // Calculate average years of service
            const totalYearsOfService = employees.reduce((sum, employee) => sum + employee.getYearsOfService(), 0);
            const averageYearsOfService = employees.length > 0 ?
                totalYearsOfService / employees.length : 0;
            // Get department breakdown
            const departmentBreakdown = await this.getDepartmentSummaries(filters, permissionContext, client);
            // Calculate new hires and terminations in the last month
            const lastMonth = new Date();
            lastMonth.setMonth(lastMonth.getMonth() - 1);
            const newHiresLastMonth = employees.filter(e => e.jobInfo.startDate >= lastMonth).length;
            const terminationsLastMonth = employees.filter(e => e.status.current === 'TERMINATED' &&
                e.status.effectiveDate >= lastMonth).length;
            // Log analytics generation
            await this.auditLogRepository.logReportGeneration('WORKFORCE_ANALYTICS', filters, employees.length, permissionContext.userId, { action: 'analytics_generated' }, client);
            return {
                totalEmployees: employees.length,
                statusBreakdown,
                employmentTypeBreakdown,
                departmentBreakdown,
                averageYearsOfService: Math.round(averageYearsOfService * 100) / 100,
                newHiresLastMonth,
                terminationsLastMonth,
                generatedAt: new Date(),
                generatedBy: permissionContext.userId
            };
        }
        finally {
            client.release();
        }
    }
    /**
     * Get department summaries for breakdown reports
     */
    async getDepartmentSummaries(filters, permissionContext, client) {
        // Build query to get department statistics
        let query = `
      SELECT 
        COALESCE(d.id, 'UNKNOWN') as department_id,
        COALESCE(d.name, 'Unknown Department') as department_name,
        COUNT(*) as total_employees,
        COUNT(CASE WHEN e.status = 'ACTIVE' THEN 1 END) as active_employees,
        COUNT(CASE WHEN e.status = 'INACTIVE' THEN 1 END) as inactive_employees,
        COUNT(CASE WHEN e.status = 'TERMINATED' THEN 1 END) as terminated_employees,
        COUNT(CASE WHEN e.status = 'ON_LEAVE' THEN 1 END) as on_leave_employees,
        COUNT(CASE WHEN e.employment_type = 'FULL_TIME' THEN 1 END) as full_time_employees,
        COUNT(CASE WHEN e.employment_type = 'PART_TIME' THEN 1 END) as part_time_employees,
        COUNT(CASE WHEN e.employment_type = 'CONTRACT' THEN 1 END) as contract_employees,
        COUNT(CASE WHEN e.employment_type = 'INTERN' THEN 1 END) as intern_employees,
        AVG(EXTRACT(YEAR FROM AGE(CURRENT_DATE, e.start_date))) as avg_years_of_service
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
    `;
        const conditions = [];
        const params = [];
        let paramIndex = 1;
        // Apply filters
        if (filters.department) {
            conditions.push(`d.name = $${paramIndex++}`);
            params.push(filters.department);
        }
        if (filters.status) {
            conditions.push(`e.status = $${paramIndex++}`);
            params.push(filters.status);
        }
        if (filters.employmentType) {
            conditions.push(`e.employment_type = $${paramIndex++}`);
            params.push(filters.employmentType);
        }
        if (filters.startDateFrom) {
            conditions.push(`e.start_date >= $${paramIndex++}`);
            params.push(filters.startDateFrom);
        }
        if (filters.startDateTo) {
            conditions.push(`e.start_date <= $${paramIndex++}`);
            params.push(filters.startDateTo);
        }
        if (filters.managerId) {
            conditions.push(`e.manager_id = $${paramIndex++}`);
            params.push(filters.managerId);
        }
        // Apply permission-based filtering for managers
        if (permissionContext.role === 'MANAGER' && permissionContext.managedEmployeeIds) {
            const managedIds = permissionContext.managedEmployeeIds;
            if (managedIds.length > 0) {
                conditions.push(`e.id = ANY($${paramIndex++})`);
                params.push(managedIds);
            }
        }
        if (conditions.length > 0) {
            query += ` WHERE ${conditions.join(' AND ')}`;
        }
        query += ` GROUP BY d.id, d.name ORDER BY department_name`;
        const result = await this.executeQuery(query, params, client);
        return result.rows.map((row) => ({
            departmentId: row.department_id,
            departmentName: row.department_name,
            totalEmployees: parseInt(row.total_employees),
            activeEmployees: parseInt(row.active_employees),
            inactiveEmployees: parseInt(row.inactive_employees),
            terminatedEmployees: parseInt(row.terminated_employees),
            onLeaveEmployees: parseInt(row.on_leave_employees),
            employmentTypeBreakdown: {
                fullTime: parseInt(row.full_time_employees),
                partTime: parseInt(row.part_time_employees),
                contract: parseInt(row.contract_employees),
                intern: parseInt(row.intern_employees)
            },
            averageYearsOfService: Math.round(parseFloat(row.avg_years_of_service || '0') * 100) / 100
        }));
    }
    /**
     * Convert report filters to repository search criteria
     */
    convertFiltersToSearchCriteria(filters) {
        return {
            department_id: filters.department, // Note: This assumes department is passed as ID
            status: filters.status,
            employment_type: filters.employmentType,
            start_date_from: filters.startDateFrom,
            start_date_to: filters.startDateTo,
            manager_id: filters.managerId
        };
    }
    /**
     * Filter employee data for reports based on permissions
     */
    filterEmployeeDataForReport(employee, permissionContext) {
        // For reports, we generally include more data than regular API responses
        // but still need to respect permission boundaries
        if (permissionContext.role === 'HR_ADMIN') {
            // HR admins can see all data in reports
            return employee;
        }
        if (permissionContext.role === 'MANAGER') {
            // Managers can see most data but not salary information
            const employeeData = employee.toJSON();
            if (employeeData.jobInfo.salary) {
                employeeData.jobInfo.salary = undefined;
            }
            // Also hide SSN for managers
            if (employeeData.personalInfo.socialSecurityNumber) {
                employeeData.personalInfo.socialSecurityNumber = undefined;
            }
            return Employee.fromJSON(employeeData);
        }
        // For other roles, return minimal data
        const employeeData = employee.toJSON();
        employeeData.jobInfo.salary = undefined;
        employeeData.personalInfo.socialSecurityNumber = undefined;
        employeeData.personalInfo.dateOfBirth = undefined;
        employeeData.personalInfo.phone = undefined;
        employeeData.personalInfo.address = undefined;
        employeeData.personalInfo.emergencyContact = undefined;
        return Employee.fromJSON(employeeData);
    }
    /**
     * Export employee roster report
     */
    async exportEmployeeRoster(filters, options, permissionContext) {
        // Generate the report first
        const report = await this.generateEmployeeRosterReport(filters, permissionContext);
        // Use ExportService to handle the actual export
        const { ExportService } = await import('./ExportService');
        const exportService = new ExportService();
        return exportService.exportEmployeeRoster(report, options, permissionContext);
    }
    /**
     * Export department breakdown report
     */
    async exportDepartmentBreakdown(filters, options, permissionContext) {
        // Generate the report first
        const report = await this.generateDepartmentBreakdownReport(filters, permissionContext);
        // Use ExportService to handle the actual export
        const { ExportService } = await import('./ExportService');
        const exportService = new ExportService();
        return exportService.exportDepartmentBreakdown(report, options, permissionContext);
    }
    /**
     * Export workforce analytics
     */
    async exportWorkforceAnalytics(filters, options, permissionContext) {
        // Generate the analytics first
        const analytics = await this.generateWorkforceAnalytics(filters, permissionContext);
        // Use ExportService to handle the actual export
        const { ExportService } = await import('./ExportService');
        const exportService = new ExportService();
        return exportService.exportWorkforceAnalytics(analytics, options, permissionContext);
    }
    /**
     * Execute database query with error handling
     */
    async executeQuery(query, params, client) {
        try {
            return await client.query(query, params);
        }
        catch (error) {
            throw new ValidationError(`Database query failed: ${error}`, []);
        }
    }
}
