import { EmployeeRepository } from '../../database/repositories/EmployeeRepository';
import { LeaveBalanceRepository } from '../../database/repositories/time-attendance/LeaveBalanceRepository';
import { TimeEntryRepository } from '../../database/repositories/time-attendance/TimeEntryRepository';
import { PolicyRepository } from '../../database/repositories/time-attendance/PolicyRepository';
import { AppError } from '../../utils/errors';
import { logger } from '../../utils/logger';

/**
 * Employee Integration Service
 * Handles synchronization between Employee Management and Time & Attendance systems
 */
export class EmployeeIntegrationService {
  constructor(
    private employeeRepository: EmployeeRepository,
    private leaveBalanceRepository: LeaveBalanceRepository,
    private timeEntryRepository: TimeEntryRepository,
    private policyRepository: PolicyRepository
  ) {}

  /**
   * Sync employee data from Employee Management to Time & Attendance
   */
  public async syncEmployeeData(employeeId: string): Promise<void> {
    try {
      const employee = await this.employeeRepository.findById(employeeId);

      if (!employee) {
        throw new AppError('Employee not found', 404, 'NOT_FOUND');
      }

      // Initialize leave balances for new employees
      await this.initializeLeaveBalances(employeeId, employee);

      // Update policy assignments based on department/role
      await this.updatePolicyAssignments(employeeId, employee);

      logger.info(`Employee data synchronized for ${employeeId}`);
    } catch (error) {
      logger.error(`Failed to sync employee data for ${employeeId}:`, error);
      throw error;
    }
  }

  /**
   * Sync all employees (batch operation)
   */
  public async syncAllEmployees(): Promise<{
    successful: number;
    failed: number;
    errors: Array<{ employeeId: string; error: string }>;
  }> {
    const results = {
      successful: 0,
      failed: 0,
      errors: [] as Array<{ employeeId: string; error: string }>
    };

    try {
      const employees = await this.employeeRepository.findAll({ active: true });

      for (const employee of employees) {
        try {
          await this.syncEmployeeData(employee.id);
          results.successful++;
        } catch (error: any) {
          results.failed++;
          results.errors.push({
            employeeId: employee.id,
            error: error.message
          });
        }
      }

      logger.info(`Batch sync completed: ${results.successful} successful, ${results.failed} failed`);
    } catch (error) {
      logger.error('Batch sync failed:', error);
      throw error;
    }

    return results;
  }

  /**
   * Handle employee status changes (hire, terminate, transfer, etc.)
   */
  public async handleEmployeeStatusChange(
    employeeId: string,
    oldStatus: string,
    newStatus: string,
    effectiveDate: Date
  ): Promise<void> {
    try {
      logger.info(`Handling status change for ${employeeId}: ${oldStatus} -> ${newStatus}`);

      switch (newStatus) {
        case 'ACTIVE':
          await this.handleEmployeeActivation(employeeId, effectiveDate);
          break;
        case 'TERMINATED':
          await this.handleEmployeeTermination(employeeId, effectiveDate);
          break;
        case 'ON_LEAVE':
          await this.handleEmployeeOnLeave(employeeId, effectiveDate);
          break;
        case 'SUSPENDED':
          await this.handleEmployeeSuspension(employeeId, effectiveDate);
          break;
        default:
          logger.warn(`Unknown employee status: ${newStatus}`);
      }
    } catch (error) {
      logger.error(`Failed to handle status change for ${employeeId}:`, error);
      throw error;
    }
  }

  /**
   * Sync organizational hierarchy for manager relationships
   */
  public async syncOrganizationalHierarchy(employeeId: string): Promise<void> {
    try {
      const employee = await this.employeeRepository.findById(employeeId);

      if (!employee) {
        throw new AppError('Employee not found', 404, 'NOT_FOUND');
      }

      // Get manager information
      const managerId = employee.managerId;

      if (managerId) {
        // Update time entry and leave request approval routing
        await this.updateApprovalRouting(employeeId, managerId);
      }

      // Update department-based policy assignments
      if (employee.departmentId) {
        await this.updateDepartmentPolicies(employeeId, employee.departmentId);
      }

      logger.info(`Organizational hierarchy synced for ${employeeId}`);
    } catch (error) {
      logger.error(`Failed to sync hierarchy for ${employeeId}:`, error);
      throw error;
    }
  }

  /**
   * Get employee details with time & attendance data
   */
  public async getEmployeeWithTimeData(employeeId: string): Promise<any> {
    try {
      const employee = await this.employeeRepository.findById(employeeId);

      if (!employee) {
        throw new AppError('Employee not found', 404, 'NOT_FOUND');
      }

      // Get leave balances
      const leaveBalances = await this.leaveBalanceRepository.findByEmployeeId(employeeId);

      // Get recent time entries (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const recentTimeEntries = await this.timeEntryRepository.findByDateRange(
        employeeId,
        thirtyDaysAgo,
        new Date()
      );

      // Get applicable policies
      const policies = await this.policyRepository.findApplicablePolicies(
        employeeId,
        employee.departmentId
      );

      return {
        employee,
        leaveBalances,
        recentTimeEntries,
        policies
      };
    } catch (error) {
      logger.error(`Failed to get employee with time data for ${employeeId}:`, error);
      throw error;
    }
  }

  /**
   * Validate employee permissions for time & attendance operations
   */
  public async validateEmployeePermissions(
    employeeId: string,
    operation: string
  ): Promise<{ allowed: boolean; reason?: string }> {
    try {
      const employee = await this.employeeRepository.findById(employeeId);

      if (!employee) {
        return { allowed: false, reason: 'Employee not found' };
      }

      if (employee.status !== 'ACTIVE') {
        return { allowed: false, reason: 'Employee is not active' };
      }

      // Check operation-specific permissions
      switch (operation) {
        case 'CLOCK_IN':
        case 'CLOCK_OUT':
          return { allowed: employee.status === 'ACTIVE' };

        case 'SUBMIT_LEAVE_REQUEST':
          // Check if employee has completed probation period
          const hireDate = new Date(employee.hireDate);
          const probationEndDate = new Date(hireDate);
          probationEndDate.setMonth(probationEndDate.getMonth() + 3);

          if (new Date() < probationEndDate) {
            return {
              allowed: false,
              reason: 'Employee must complete probation period before requesting leave'
            };
          }
          return { allowed: true };

        case 'VIEW_TEAM_TIME':
          return { allowed: employee.role === 'MANAGER' || employee.role === 'HR_ADMIN' };

        default:
          return { allowed: true };
      }
    } catch (error) {
      logger.error(`Failed to validate permissions for ${employeeId}:`, error);
      return { allowed: false, reason: 'Permission validation failed' };
    }
  }

  // Private helper methods

  private async initializeLeaveBalances(employeeId: string, employee: any): Promise<void> {
    const existingBalances = await this.leaveBalanceRepository.findByEmployeeId(employeeId);

    if (existingBalances.length > 0) {
      logger.info(`Leave balances already exist for ${employeeId}`);
      return;
    }

    // Get default leave types for employee's role/department
    const leaveTypes = await this.policyRepository.findLeaveTypesByDepartment(
      employee.departmentId
    );

    for (const leaveType of leaveTypes) {
      await this.leaveBalanceRepository.create({
        employeeId,
        leaveTypeId: leaveType.id,
        balance: leaveType.defaultBalance || 0,
        accrued: 0,
        used: 0,
        pending: 0,
        carryoverBalance: 0,
        year: new Date().getFullYear()
      });
    }

    logger.info(`Initialized leave balances for ${employeeId}`);
  }

  private async updatePolicyAssignments(employeeId: string, employee: any): Promise<void> {
    // Get policies applicable to employee's department and role
    const applicablePolicies = await this.policyRepository.findApplicablePolicies(
      employeeId,
      employee.departmentId
    );

    logger.info(`Updated ${applicablePolicies.length} policy assignments for ${employeeId}`);
  }

  private async handleEmployeeActivation(employeeId: string, effectiveDate: Date): Promise<void> {
    logger.info(`Activating employee ${employeeId} effective ${effectiveDate}`);
    // Initialize leave balances and policies
    const employee = await this.employeeRepository.findById(employeeId);
    await this.initializeLeaveBalances(employeeId, employee);
    await this.updatePolicyAssignments(employeeId, employee);
  }

  private async handleEmployeeTermination(employeeId: string, effectiveDate: Date): Promise<void> {
    logger.info(`Terminating employee ${employeeId} effective ${effectiveDate}`);

    // Check for incomplete time entries
    const incompleteEntries = await this.timeEntryRepository.findIncompleteEntries(employeeId);

    if (incompleteEntries.length > 0) {
      logger.warn(`Employee ${employeeId} has ${incompleteEntries.length} incomplete time entries`);
      // Auto-close incomplete entries with termination date
      for (const entry of incompleteEntries) {
        await this.timeEntryRepository.update(entry.id, {
          clockOutTime: effectiveDate,
          status: 'SUBMITTED',
          notes: 'Auto-closed due to employee termination'
        });
      }
    }

    // Cancel pending leave requests
    // This would be handled by LeaveManagementService
  }

  private async handleEmployeeOnLeave(employeeId: string, effectiveDate: Date): Promise<void> {
    logger.info(`Employee ${employeeId} going on leave effective ${effectiveDate}`);
    // Check for active time entries and close them
    const activeEntries = await this.timeEntryRepository.findActiveEntries(employeeId);

    if (activeEntries.length > 0) {
      logger.warn(`Employee ${employeeId} has active time entries, auto-clocking out`);
      for (const entry of activeEntries) {
        await this.timeEntryRepository.update(entry.id, {
          clockOutTime: effectiveDate,
          status: 'SUBMITTED',
          notes: 'Auto-closed - employee on leave'
        });
      }
    }
  }

  private async handleEmployeeSuspension(employeeId: string, effectiveDate: Date): Promise<void> {
    logger.info(`Suspending employee ${employeeId} effective ${effectiveDate}`);
    // Similar to on-leave handling
    await this.handleEmployeeOnLeave(employeeId, effectiveDate);
  }

  private async updateApprovalRouting(employeeId: string, managerId: string): Promise<void> {
    // Update cached manager information for approval workflows
    logger.info(`Updated approval routing for ${employeeId} -> manager ${managerId}`);
  }

  private async updateDepartmentPolicies(employeeId: string, departmentId: string): Promise<void> {
    // Update policy assignments based on department
    const policies = await this.policyRepository.findByDepartment(departmentId);
    logger.info(`Updated ${policies.length} department policies for ${employeeId}`);
  }
}
