import { Request, Response } from 'express';
import { EmployeeService } from '../services/EmployeeService';
import { ValidationError } from '../utils/validation';
import { logger } from '../utils/logger';
import { PermissionContext as AuthPermissionContext } from '../services/PermissionManager';
import Joi from 'joi';
import { uuidSchema } from '../utils/validation';

// Legacy PermissionContext interface for EmployeeService compatibility
interface LegacyPermissionContext {
  userId: string;
  role: 'HR_ADMIN' | 'MANAGER' | 'EMPLOYEE' | 'VIEWER';
  managedEmployeeIds?: string[];
}

export class ManagerController {
  private employeeService: EmployeeService;

  constructor() {
    this.employeeService = new EmployeeService();
  }

  /**
   * Convert new PermissionContext to legacy format for EmployeeService
   */
  private convertPermissionContext(authContext: AuthPermissionContext): LegacyPermissionContext {
    // Determine primary role - prioritize HR_ADMIN, then MANAGER, then EMPLOYEE, then VIEWER
    let primaryRole: 'HR_ADMIN' | 'MANAGER' | 'EMPLOYEE' | 'VIEWER' = 'VIEWER';
    
    if (authContext.roles.includes('HR_ADMIN')) {
      primaryRole = 'HR_ADMIN';
    } else if (authContext.roles.includes('MANAGER')) {
      primaryRole = 'MANAGER';
    } else if (authContext.roles.includes('EMPLOYEE')) {
      primaryRole = 'EMPLOYEE';
    }

    return {
      userId: authContext.userId,
      role: primaryRole,
      managedEmployeeIds: authContext.managedEmployeeIds
    };
  }

  /**
   * GET /api/managers/:id/reports
   * Get direct reports for a manager
   */
  public getDirectReports = async (req: Request, res: Response): Promise<void> => {
    try {
      // Validate manager ID parameter
      const paramSchema = Joi.object({
        id: uuidSchema
      });

      const { error, value: params } = paramSchema.validate(req.params);
      if (error) {
        res.status(400).json({
          error: {
            code: 'INVALID_MANAGER_ID',
            message: 'Invalid manager ID format',
            details: error.details
          }
        });
        return;
      }

      // Get direct reports
      const directReports = await this.employeeService.getDirectReports(
        params.id,
        this.convertPermissionContext(req.permissionContext!)
      );

      logger.info(`Direct reports retrieved for manager`, {
        managerId: params.id,
        reportCount: directReports.length,
        requestedBy: req.user?.id
      });

      res.json({
        managerId: params.id,
        directReports: directReports.map(employee => employee.toJSON())
      });

    } catch (error) {
      this.handleError(error, res, 'Failed to get direct reports');
    }
  };

  /**
   * Error handling helper
   */
  private handleError(error: any, res: Response, defaultMessage: string): void {
    logger.error(defaultMessage, error);

    if (error instanceof ValidationError) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: error.message,
          details: error.details
        }
      });
      return;
    }

    // Handle specific error types
    if (error.message?.includes('not found')) {
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: error.message
        }
      });
      return;
    }

    if (error.message?.includes('permission') || error.message?.includes('access')) {
      res.status(403).json({
        error: {
          code: 'ACCESS_DENIED',
          message: error.message
        }
      });
      return;
    }

    // Generic server error
    res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred'
      }
    });
  }
}