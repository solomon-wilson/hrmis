import { Request, Response } from 'express';
import { EmployeeService, CreateEmployeeRequest, UpdateEmployeeRequest, SearchCriteria } from '../services/EmployeeService';
import { ValidationError } from '../utils/validation';
import { logger } from '../utils/logger';
import { PermissionContext as AuthPermissionContext } from '../services/PermissionManager';
import Joi from 'joi';
import { 
  requiredStringSchema, 
  optionalStringSchema, 
  emailSchema, 
  phoneSchema, 
  dateSchema, 
  optionalDateSchema,
  addressSchema,
  emergencyContactSchema,
  employmentTypeSchema,
  uuidSchema
} from '../utils/validation';

// Legacy PermissionContext interface for EmployeeService compatibility
interface LegacyPermissionContext {
  userId: string;
  role: 'HR_ADMIN' | 'MANAGER' | 'EMPLOYEE' | 'VIEWER';
  managedEmployeeIds?: string[];
}

export class EmployeeController {
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
   * GET /api/employees
   * Search and list employees with pagination and filtering
   */
  public searchEmployees = async (req: Request, res: Response): Promise<void> => {
    try {
      // Validate query parameters
      const querySchema = Joi.object({
        search: optionalStringSchema,
        department: optionalStringSchema,
        managerId: uuidSchema.optional(),
        status: Joi.string().valid('ACTIVE', 'INACTIVE', 'TERMINATED', 'ON_LEAVE').optional(),
        employmentType: Joi.string().valid('FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN').optional(),
        startDateFrom: Joi.date().optional(),
        startDateTo: Joi.date().optional(),
        page: Joi.number().integer().min(1).default(1),
        limit: Joi.number().integer().min(1).max(100).default(20),
        sortBy: Joi.string().valid('firstName', 'lastName', 'employeeId', 'department', 'startDate').default('lastName'),
        sortOrder: Joi.string().valid('asc', 'desc').default('asc')
      });

      const { error, value: query } = querySchema.validate(req.query);
      if (error) {
        res.status(400).json({
          error: {
            code: 'INVALID_QUERY_PARAMETERS',
            message: 'Invalid query parameters',
            details: error.details
          }
        });
        return;
      }

      // Build search criteria
      const searchCriteria: SearchCriteria = {
        search: query.search,
        department: query.department,
        managerId: query.managerId,
        status: query.status,
        employmentType: query.employmentType,
        startDateFrom: query.startDateFrom,
        startDateTo: query.startDateTo
      };

      // Pagination options
      const pagination = {
        page: query.page,
        limit: query.limit,
        sortBy: query.sortBy,
        sortOrder: query.sortOrder
      };

      // Search employees
      const result = await this.employeeService.searchEmployees(
        searchCriteria,
        pagination,
        this.convertPermissionContext(req.permissionContext!)
      );

      logger.info(`Employee search completed`, {
        userId: req.user?.id,
        criteria: searchCriteria,
        resultCount: result.data.length,
        totalCount: result.pagination.total
      });

      res.json({
        data: result.data,
        pagination: result.pagination
      });

    } catch (error) {
      this.handleError(error, res, 'Failed to search employees');
    }
  };

  /**
   * POST /api/employees
   * Create a new employee
   */
  public createEmployee = async (req: Request, res: Response): Promise<void> => {
    try {
      // Validate request body
      const createSchema = Joi.object({
        employeeId: requiredStringSchema.max(20).pattern(/^[A-Z0-9-]+$/),
        personalInfo: Joi.object({
          firstName: requiredStringSchema.max(50),
          lastName: requiredStringSchema.max(50),
          email: emailSchema,
          phone: phoneSchema.optional(),
          dateOfBirth: optionalDateSchema,
          socialSecurityNumber: Joi.string().optional().pattern(/^\d{3}-\d{2}-\d{4}$/),
          address: addressSchema.optional(),
          emergencyContact: emergencyContactSchema.optional()
        }).required(),
        jobInfo: Joi.object({
          jobTitle: requiredStringSchema.max(100),
          department: requiredStringSchema.max(100),
          managerId: uuidSchema.optional(),
          startDate: dateSchema,
          employmentType: employmentTypeSchema,
          salary: Joi.number().positive().optional(),
          location: requiredStringSchema.max(100)
        }).required()
      });

      const { error, value: requestData } = createSchema.validate(req.body);
      if (error) {
        res.status(400).json({
          error: {
            code: 'INVALID_REQUEST_DATA',
            message: 'Invalid employee data',
            details: error.details
          }
        });
        return;
      }

      // Create employee request
      const createRequest: CreateEmployeeRequest = {
        ...requestData,
        createdBy: req.user!.id
      };

      // Create employee
      const employee = await this.employeeService.createEmployee(
        createRequest,
        this.convertPermissionContext(req.permissionContext!)
      );

      logger.info(`Employee created successfully`, {
        employeeId: employee.id,
        employeeNumber: employee.employeeId,
        createdBy: req.user?.id
      });

      res.status(201).json(employee.toJSON());

    } catch (error) {
      this.handleError(error, res, 'Failed to create employee');
    }
  };

  /**
   * GET /api/employees/:id
   * Get employee by ID
   */
  public getEmployee = async (req: Request, res: Response): Promise<void> => {
    try {
      // Validate employee ID parameter
      const paramSchema = Joi.object({
        id: uuidSchema
      });

      const { error, value: params } = paramSchema.validate(req.params);
      if (error) {
        res.status(400).json({
          error: {
            code: 'INVALID_EMPLOYEE_ID',
            message: 'Invalid employee ID format',
            details: error.details
          }
        });
        return;
      }

      // Get employee
      const employee = await this.employeeService.getEmployee(
        params.id,
        this.convertPermissionContext(req.permissionContext!)
      );

      if (!employee) {
        res.status(404).json({
          error: {
            code: 'EMPLOYEE_NOT_FOUND',
            message: 'Employee not found'
          }
        });
        return;
      }

      logger.debug(`Employee retrieved`, {
        employeeId: employee.id,
        requestedBy: req.user?.id
      });

      res.json(employee.toJSON());

    } catch (error) {
      this.handleError(error, res, 'Failed to get employee');
    }
  };

  /**
   * PUT /api/employees/:id
   * Update employee
   */
  public updateEmployee = async (req: Request, res: Response): Promise<void> => {
    try {
      // Validate employee ID parameter
      const paramSchema = Joi.object({
        id: uuidSchema
      });

      const { error: paramError, value: params } = paramSchema.validate(req.params);
      if (paramError) {
        res.status(400).json({
          error: {
            code: 'INVALID_EMPLOYEE_ID',
            message: 'Invalid employee ID format',
            details: paramError.details
          }
        });
        return;
      }

      // Validate request body
      const updateSchema = Joi.object({
        personalInfo: Joi.object({
          firstName: requiredStringSchema.max(50).optional(),
          lastName: requiredStringSchema.max(50).optional(),
          email: emailSchema.optional(),
          phone: phoneSchema.optional(),
          dateOfBirth: optionalDateSchema,
          socialSecurityNumber: Joi.string().optional().pattern(/^\d{3}-\d{2}-\d{4}$/),
          address: addressSchema.optional(),
          emergencyContact: emergencyContactSchema.optional()
        }).optional(),
        jobInfo: Joi.object({
          jobTitle: requiredStringSchema.max(100).optional(),
          department: requiredStringSchema.max(100).optional(),
          managerId: uuidSchema.optional().allow(null),
          startDate: dateSchema.optional(),
          employmentType: employmentTypeSchema.optional(),
          salary: Joi.number().positive().optional(),
          location: requiredStringSchema.max(100).optional()
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
        params.id,
        updateRequest,
        this.convertPermissionContext(req.permissionContext!)
      );

      logger.info(`Employee updated successfully`, {
        employeeId: employee.id,
        updatedBy: req.user?.id,
        updatedFields: Object.keys(requestData)
      });

      res.json(employee.toJSON());

    } catch (error) {
      this.handleError(error, res, 'Failed to update employee');
    }
  };

  /**
   * DELETE /api/employees/:id
   * Soft delete employee (set status to TERMINATED)
   */
  public deleteEmployee = async (req: Request, res: Response): Promise<void> => {
    try {
      // Validate employee ID parameter
      const paramSchema = Joi.object({
        id: uuidSchema
      });

      const { error, value: params } = paramSchema.validate(req.params);
      if (error) {
        res.status(400).json({
          error: {
            code: 'INVALID_EMPLOYEE_ID',
            message: 'Invalid employee ID format',
            details: error.details
          }
        });
        return;
      }

      // Validate request body for termination details
      const deleteSchema = Joi.object({
        reason: Joi.string().valid(
          'RESIGNATION',
          'TERMINATION_FOR_CAUSE',
          'LAYOFF',
          'END_OF_CONTRACT',
          'RETIREMENT'
        ).required(),
        effectiveDate: dateSchema.default(() => new Date()),
        notes: optionalStringSchema
      });

      const { error: bodyError, value: deleteData } = deleteSchema.validate(req.body);
      if (bodyError) {
        res.status(400).json({
          error: {
            code: 'INVALID_TERMINATION_DATA',
            message: 'Invalid termination data',
            details: bodyError.details
          }
        });
        return;
      }

      // Terminate employee (soft delete)
      const employee = await this.employeeService.updateEmployeeStatus(
        params.id,
        'TERMINATED',
        deleteData.effectiveDate,
        deleteData.reason,
        deleteData.notes,
        this.convertPermissionContext(req.permissionContext!)
      );

      logger.info(`Employee terminated (soft deleted)`, {
        employeeId: employee.id,
        reason: deleteData.reason,
        terminatedBy: req.user?.id
      });

      res.json({
        message: 'Employee terminated successfully',
        employee: employee.toJSON()
      });

    } catch (error) {
      this.handleError(error, res, 'Failed to terminate employee');
    }
  };

  /**
   * GET /api/employees/:id/history
   * Get employee status history
   */
  public getEmployeeHistory = async (req: Request, res: Response): Promise<void> => {
    try {
      // Validate employee ID parameter
      const paramSchema = Joi.object({
        id: uuidSchema
      });

      const { error, value: params } = paramSchema.validate(req.params);
      if (error) {
        res.status(400).json({
          error: {
            code: 'INVALID_EMPLOYEE_ID',
            message: 'Invalid employee ID format',
            details: error.details
          }
        });
        return;
      }

      // Get employee status history
      const history = await this.employeeService.getEmployeeStatusHistory(
        params.id,
        this.convertPermissionContext(req.permissionContext!)
      );

      logger.debug(`Employee history retrieved`, {
        employeeId: params.id,
        historyCount: history.length,
        requestedBy: req.user?.id
      });

      res.json({
        employeeId: params.id,
        history
      });

    } catch (error) {
      this.handleError(error, res, 'Failed to get employee history');
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

    if (error.message?.includes('duplicate') || error.message?.includes('already exists')) {
      res.status(409).json({
        error: {
          code: 'CONFLICT',
          message: error.message
        }
      });
      return;
    }

    // Database connection errors
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      res.status(503).json({
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Database service is currently unavailable'
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