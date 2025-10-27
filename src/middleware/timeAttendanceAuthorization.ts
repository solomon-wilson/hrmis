import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors';

/**
 * Time & Attendance specific permissions
 */
export enum TimeAttendancePermission {
  // Time tracking permissions
  CLOCK_SELF = 'time:clock:self',
  CLOCK_OTHERS = 'time:clock:others',
  VIEW_OWN_TIME = 'time:view:self',
  VIEW_TEAM_TIME = 'time:view:team',
  VIEW_ALL_TIME = 'time:view:all',
  EDIT_OWN_TIME = 'time:edit:self',
  EDIT_TEAM_TIME = 'time:edit:team',
  APPROVE_TIME = 'time:approve',
  EXPORT_TIME = 'time:export',

  // Leave management permissions
  REQUEST_LEAVE = 'leave:request:self',
  REQUEST_LEAVE_FOR_OTHERS = 'leave:request:others',
  VIEW_OWN_LEAVE = 'leave:view:self',
  VIEW_TEAM_LEAVE = 'leave:view:team',
  VIEW_ALL_LEAVE = 'leave:view:all',
  APPROVE_LEAVE = 'leave:approve',
  CANCEL_OWN_LEAVE = 'leave:cancel:self',
  CANCEL_TEAM_LEAVE = 'leave:cancel:team',
  ADJUST_LEAVE_BALANCE = 'leave:balance:adjust',

  // Policy permissions
  VIEW_POLICIES = 'policy:view',
  CREATE_POLICY = 'policy:create',
  EDIT_POLICY = 'policy:edit',
  DELETE_POLICY = 'policy:delete',
  ASSIGN_POLICY = 'policy:assign',
  RUN_ACCRUAL = 'policy:accrual:run',

  // Reporting permissions
  VIEW_REPORTS = 'reports:view',
  EXPORT_REPORTS = 'reports:export',
  VIEW_TEAM_REPORTS = 'reports:team:view',
  VIEW_ORG_REPORTS = 'reports:org:view'
}

/**
 * Role-based permission mappings
 */
const rolePermissions: Record<string, TimeAttendancePermission[]> = {
  EMPLOYEE: [
    TimeAttendancePermission.CLOCK_SELF,
    TimeAttendancePermission.VIEW_OWN_TIME,
    TimeAttendancePermission.EDIT_OWN_TIME,
    TimeAttendancePermission.REQUEST_LEAVE,
    TimeAttendancePermission.VIEW_OWN_LEAVE,
    TimeAttendancePermission.CANCEL_OWN_LEAVE,
    TimeAttendancePermission.VIEW_POLICIES
  ],
  MANAGER: [
    // All employee permissions
    ...rolePermissions.EMPLOYEE || [],
    // Additional manager permissions
    TimeAttendancePermission.VIEW_TEAM_TIME,
    TimeAttendancePermission.EDIT_TEAM_TIME,
    TimeAttendancePermission.APPROVE_TIME,
    TimeAttendancePermission.VIEW_TEAM_LEAVE,
    TimeAttendancePermission.APPROVE_LEAVE,
    TimeAttendancePermission.CANCEL_TEAM_LEAVE,
    TimeAttendancePermission.VIEW_REPORTS,
    TimeAttendancePermission.VIEW_TEAM_REPORTS
  ],
  HR_ADMIN: [
    // All permissions
    ...Object.values(TimeAttendancePermission)
  ]
};

/**
 * Check if user has required permission
 */
export const hasPermission = (userRole: string, permission: TimeAttendancePermission): boolean => {
  const permissions = rolePermissions[userRole] || [];
  return permissions.includes(permission);
};

/**
 * Middleware to check time & attendance permissions
 */
export const requirePermission = (...permissions: TimeAttendancePermission[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const user = (req as any).user;

      if (!user) {
        throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
      }

      const userRole = user.role;

      // Check if user has any of the required permissions
      const hasRequiredPermission = permissions.some(permission =>
        hasPermission(userRole, permission)
      );

      if (!hasRequiredPermission) {
        throw new AppError(
          'Insufficient permissions for this operation',
          403,
          'FORBIDDEN'
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Middleware to validate resource ownership
 * Ensures employees can only access their own data unless they have elevated permissions
 */
export const validateResourceOwnership = (resourceField: string = 'employeeId') => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const user = (req as any).user;

      if (!user) {
        throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
      }

      // HR Admins can access all resources
      if (user.role === 'HR_ADMIN') {
        return next();
      }

      // Get resource ID from params, body, or query
      const resourceId = req.params[resourceField] || req.body[resourceField] || req.query[resourceField];

      if (!resourceId) {
        throw new AppError('Resource identifier not provided', 400, 'VALIDATION_ERROR');
      }

      // Managers can access their team members' data
      if (user.role === 'MANAGER') {
        // This would require checking if resourceId is in manager's team
        // For now, we'll allow and let the service layer handle team validation
        return next();
      }

      // Employees can only access their own data
      if (resourceId !== user.employeeId) {
        throw new AppError(
          'You can only access your own data',
          403,
          'FORBIDDEN'
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Middleware to validate manager-team relationship
 */
export const validateManagerAccess = () => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = (req as any).user;

      if (!user) {
        throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
      }

      // HR Admins have access to all
      if (user.role === 'HR_ADMIN') {
        return next();
      }

      // Must be a manager
      if (user.role !== 'MANAGER') {
        throw new AppError(
          'This operation requires manager role',
          403,
          'FORBIDDEN'
        );
      }

      // Validate managerId matches authenticated user
      const managerId = req.query.managerId || req.body.managerId;

      if (managerId && managerId !== user.employeeId) {
        throw new AppError(
          'You can only access data for your own team',
          403,
          'FORBIDDEN'
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Field-level access control for sensitive data
 */
export const filterSensitiveFields = (data: any, userRole: string): any => {
  const sensitiveFields = [
    'salary',
    'compensation',
    'personalNotes',
    'disciplinaryActions',
    'performanceRatings'
  ];

  // HR Admins can see all fields
  if (userRole === 'HR_ADMIN') {
    return data;
  }

  // Managers can see most fields except certain sensitive ones
  if (userRole === 'MANAGER') {
    const filteredData = { ...data };
    ['personalNotes', 'disciplinaryActions'].forEach(field => {
      delete filteredData[field];
    });
    return filteredData;
  }

  // Employees can only see basic fields
  const filteredData = { ...data };
  sensitiveFields.forEach(field => {
    delete filteredData[field];
  });

  return filteredData;
};

/**
 * Validate time entry approval permissions
 */
export const validateApprovalPermission = () => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = (req as any).user;

      if (!user) {
        throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
      }

      // Only managers and HR admins can approve
      if (!['MANAGER', 'HR_ADMIN'].includes(user.role)) {
        throw new AppError(
          'Only managers and HR admins can approve time entries',
          403,
          'FORBIDDEN'
        );
      }

      // For managers, would need to validate they manage the employee
      // This would be done at service layer with database check

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Validate policy administration permissions
 */
export const validatePolicyAdmin = () => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const user = (req as any).user;

      if (!user) {
        throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
      }

      // Only HR admins can manage policies
      if (user.role !== 'HR_ADMIN') {
        throw new AppError(
          'Policy management requires HR Admin role',
          403,
          'FORBIDDEN'
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Audit log decorator for sensitive operations
 */
export const auditLog = (operation: string) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as any).user;

    // Log the operation
    console.log(`[AUDIT] ${operation} by ${user?.employeeId || 'unknown'} at ${new Date().toISOString()}`);
    console.log(`[AUDIT] Request: ${req.method} ${req.path}`);
    console.log(`[AUDIT] Body:`, JSON.stringify(req.body));

    // Continue to next middleware
    next();
  };
};

export default {
  TimeAttendancePermission,
  hasPermission,
  requirePermission,
  validateResourceOwnership,
  validateManagerAccess,
  filterSensitiveFields,
  validateApprovalPermission,
  validatePolicyAdmin,
  auditLog
};
