import { Request, Response } from 'express';
import { EmployeeService, UpdateEmployeeRequest } from '../services/EmployeeService';
import { ValidationError } from '../utils/validation';
import { logger } from '../utils/logger';
import { PermissionContext as AuthPermissionContext } from '../services/PermissionManager';
import Joi from 'joi';
import { 
  optionalStringSchema, 
  emailSchema, 
  phoneSchema, 
  addressSchema,
  emergencyContactSchema,
  uuidSchema
} from '../utils/validation';

// Legacy PermissionContext interface for EmployeeService compatibility
interface LegacyPermissionContext {
  userId: string;
  role: 'HR_ADMIN' | 'MANAGER' | 'EMPLOYEE' | 'VIEWER';
  managedEmployeeIds?: string[];
}

export interface ChangeRequest {
  id: string;
  employeeId: string;
  requestType: 'PERSONAL_INFO' | 'JOB_INFO';
  requestedChanges: Record<string, any>;
  currentValues: Record<string, any>;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  requestedBy: string;
  requestedAt: Date;
  reviewedBy?: string;
  reviewedAt?: Date;
  reviewComments?: string;
}

export class EmployeeSelfServiceController {
  private employeeService: EmployeeService;
  // Note: In a real implementation, you would have a ChangeRequestService
  private changeRequests: Map<string, ChangeRequest> = new Map();

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
   * GET /api/employees/me
   * Get current user's employee profile
   */
  public getMyProfile = async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.permissionContext?.employeeId) {
        res.status(400).json({
          error: {
            code: 'NO_EMPLOYEE_RECORD',
            message: 'No employee record found for current user'
          }
        });
        return;
      }

      // Get employee profile
      const employee = await this.employeeService.getEmployee(
        req.permissionContext.employeeId,
        this.convertPermissionContext(req.permissionContext)
      );

      if (!employee) {
        res.status(404).json({
          error: {
            code: 'EMPLOYEE_NOT_FOUND',
            message: 'Employee profile not found'
          }
        });
        return;
      }

      logger.debug(`Employee profile retrieved for self-service`, {
        employeeId: employee.id,
        userId: req.user?.id
      });

      res.json(employee.toJSON());

    } catch (error) {
      this.handleError(error, res, 'Failed to get employee profile');
    }
  };

  /**
   * PUT /api/employees/me
   * Update current user's employee profile (limited fields)
   */
  public updateMyProfile = async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.permissionContext?.employeeId) {
        res.status(400).json({
          error: {
            code: 'NO_EMPLOYEE_RECORD',
            message: 'No employee record found for current user'
          }
        });
        return;
      }

      // Validate request body - only allow self-editable fields
      const updateSchema = Joi.object({
        personalInfo: Joi.object({
          phone: phoneSchema.optional(),
          address: addressSchema.optional(),
          emergencyContact: emergencyContactSchema.optional()
        }).optional()
      }).min(1); // At least one field must be provided

      const { error: bodyError, value: requestData } = updateSchema.validate(req.body);
      if (bodyError) {
        res.status(400).json({
          error: {
            code: 'INVALID_REQUEST_DATA',
            message: 'Invalid update data',
            details: bodyError.details
          }
        });
        return;
      }

      // Create update request
      const updateRequest: UpdateEmployeeRequest = {
        ...requestData,
        updatedBy: req.user!.id
      };

      // Update employee
      const employee = await this.employeeService.updateEmployee(
        req.permissionContext.employeeId,
        updateRequest,
        this.convertPermissionContext(req.permissionContext)
      );

      logger.info(`Employee profile updated via self-service`, {
        employeeId: employee.id,
        updatedBy: req.user?.id,
        updatedFields: Object.keys(requestData)
      });

      res.json(employee.toJSON());

    } catch (error) {
      this.handleError(error, res, 'Failed to update employee profile');
    }
  };

  /**
   * POST /api/employees/me/change-requests
   * Submit a change request for restricted fields
   */
  public submitChangeRequest = async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.permissionContext?.employeeId) {
        res.status(400).json({
          error: {
            code: 'NO_EMPLOYEE_RECORD',
            message: 'No employee record found for current user'
          }
        });
        return;
      }

      // Validate request body
      const changeRequestSchema = Joi.object({
        requestType: Joi.string().valid('PERSONAL_INFO', 'JOB_INFO').required(),
        requestedChanges: Joi.object({
          // Personal info changes
          firstName: optionalStringSchema.max(50),
          lastName: optionalStringSchema.max(50),
          email: emailSchema,
          dateOfBirth: Joi.date().optional(),
          // Job info changes (employee can request but needs approval)
          jobTitle: optionalStringSchema.max(100),
          department: optionalStringSchema.max(100),
          location: optionalStringSchema.max(100)
        }).min(1).required(),
        reason: Joi.string().min(10).max(500).required()
      });

      const { error: bodyError, value: requestData } = changeRequestSchema.validate(req.body);
      if (bodyError) {
        res.status(400).json({
          error: {
            code: 'INVALID_CHANGE_REQUEST',
            message: 'Invalid change request data',
            details: bodyError.details
          }
        });
        return;
      }

      // Get current employee data to store current values
      const currentEmployee = await this.employeeService.getEmployee(
        req.permissionContext.employeeId,
        this.convertPermissionContext(req.permissionContext)
      );

      if (!currentEmployee) {
        res.status(404).json({
          error: {
            code: 'EMPLOYEE_NOT_FOUND',
            message: 'Employee profile not found'
          }
        });
        return;
      }

      // Extract current values for the fields being changed
      const currentValues: Record<string, any> = {};
      const employeeData = currentEmployee.toJSON();
      
      Object.keys(requestData.requestedChanges).forEach(field => {
        if (field in employeeData.personalInfo) {
          currentValues[field] = (employeeData.personalInfo as any)[field];
        } else if (field in employeeData.jobInfo) {
          currentValues[field] = (employeeData.jobInfo as any)[field];
        }
      });

      // Create change request
      const changeRequest: ChangeRequest = {
        id: this.generateId(),
        employeeId: req.permissionContext.employeeId,
        requestType: requestData.requestType,
        requestedChanges: requestData.requestedChanges,
        currentValues,
        reason: requestData.reason,
        status: 'PENDING',
        requestedBy: req.user!.id,
        requestedAt: new Date()
      };

      // Store change request (in real implementation, this would be in database)
      this.changeRequests.set(changeRequest.id, changeRequest);

      logger.info(`Change request submitted`, {
        changeRequestId: changeRequest.id,
        employeeId: req.permissionContext.employeeId,
        requestType: requestData.requestType,
        requestedBy: req.user?.id
      });

      res.status(201).json({
        message: 'Change request submitted successfully',
        changeRequest: {
          id: changeRequest.id,
          requestType: changeRequest.requestType,
          status: changeRequest.status,
          requestedAt: changeRequest.requestedAt,
          reason: changeRequest.reason
        }
      });

    } catch (error) {
      this.handleError(error, res, 'Failed to submit change request');
    }
  };

  /**
   * GET /api/employees/me/change-requests
   * Get current user's change requests
   */
  public getMyChangeRequests = async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.permissionContext?.employeeId) {
        res.status(400).json({
          error: {
            code: 'NO_EMPLOYEE_RECORD',
            message: 'No employee record found for current user'
          }
        });
        return;
      }

      // Filter change requests for current employee
      const employeeChangeRequests = Array.from(this.changeRequests.values())
        .filter(request => request.employeeId === req.permissionContext!.employeeId)
        .sort((a, b) => b.requestedAt.getTime() - a.requestedAt.getTime());

      logger.debug(`Change requests retrieved for employee`, {
        employeeId: req.permissionContext.employeeId,
        requestCount: employeeChangeRequests.length,
        userId: req.user?.id
      });

      res.json({
        changeRequests: employeeChangeRequests.map(request => ({
          id: request.id,
          requestType: request.requestType,
          requestedChanges: request.requestedChanges,
          currentValues: request.currentValues,
          reason: request.reason,
          status: request.status,
          requestedAt: request.requestedAt,
          reviewedBy: request.reviewedBy,
          reviewedAt: request.reviewedAt,
          reviewComments: request.reviewComments
        }))
      });

    } catch (error) {
      this.handleError(error, res, 'Failed to get change requests');
    }
  };

  /**
   * GET /api/employees/me/change-requests/:requestId
   * Get specific change request details
   */
  public getChangeRequest = async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.permissionContext?.employeeId) {
        res.status(400).json({
          error: {
            code: 'NO_EMPLOYEE_RECORD',
            message: 'No employee record found for current user'
          }
        });
        return;
      }

      // Validate request ID parameter
      const paramSchema = Joi.object({
        requestId: uuidSchema
      });

      const { error, value: params } = paramSchema.validate(req.params);
      if (error) {
        res.status(400).json({
          error: {
            code: 'INVALID_REQUEST_ID',
            message: 'Invalid change request ID format',
            details: error.details
          }
        });
        return;
      }

      const changeRequest = this.changeRequests.get(params.requestId);

      if (!changeRequest) {
        res.status(404).json({
          error: {
            code: 'CHANGE_REQUEST_NOT_FOUND',
            message: 'Change request not found'
          }
        });
        return;
      }

      // Verify ownership
      if (changeRequest.employeeId !== req.permissionContext.employeeId) {
        res.status(403).json({
          error: {
            code: 'ACCESS_DENIED',
            message: 'You can only view your own change requests'
          }
        });
        return;
      }

      logger.debug(`Change request details retrieved`, {
        changeRequestId: params.requestId,
        employeeId: req.permissionContext.employeeId,
        userId: req.user?.id
      });

      res.json({
        id: changeRequest.id,
        requestType: changeRequest.requestType,
        requestedChanges: changeRequest.requestedChanges,
        currentValues: changeRequest.currentValues,
        reason: changeRequest.reason,
        status: changeRequest.status,
        requestedAt: changeRequest.requestedAt,
        reviewedBy: changeRequest.reviewedBy,
        reviewedAt: changeRequest.reviewedAt,
        reviewComments: changeRequest.reviewComments
      });

    } catch (error) {
      this.handleError(error, res, 'Failed to get change request');
    }
  };

  /**
   * Generate a simple ID for change requests
   * In a real implementation, this would use a proper UUID library or database auto-increment
   */
  private generateId(): string {
    return `cr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

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