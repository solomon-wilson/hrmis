import { Request, Response, NextFunction } from 'express';
import { LeaveManagementService } from '../../services/time-attendance/LeaveManagementService';
import { AppError } from '../../utils/errors';
import { validateRequest } from '../../utils/validation';
import { z } from 'zod';

/**
 * Leave Management Controller
 * Handles HTTP requests for leave requests, approvals, balances, and calendars
 */
export class LeaveManagementController {
  private leaveManagementService: LeaveManagementService;

  constructor(leaveManagementService: LeaveManagementService) {
    this.leaveManagementService = leaveManagementService;
  }

  /**
   * Submit a leave request
   * POST /api/leave/requests
   */
  public submitLeaveRequest = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const schema = z.object({
        employeeId: z.string().uuid(),
        leaveTypeId: z.string().uuid(),
        startDate: z.string().datetime().transform(val => new Date(val)),
        endDate: z.string().datetime().transform(val => new Date(val)),
        reason: z.string().min(10).max(500),
        attachments: z.array(z.string()).optional(),
        notes: z.string().optional()
      });

      const validatedData = validateRequest(req.body, schema);

      const leaveRequest = await this.leaveManagementService.submitLeaveRequest({
        employeeId: validatedData.employeeId,
        leaveTypeId: validatedData.leaveTypeId,
        startDate: validatedData.startDate,
        endDate: validatedData.endDate,
        reason: validatedData.reason,
        attachments: validatedData.attachments,
        notes: validatedData.notes
      });

      res.status(201).json({
        success: true,
        message: 'Leave request submitted successfully',
        data: leaveRequest
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get leave requests with role-based filtering
   * GET /api/leave/requests
   */
  public getLeaveRequests = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const schema = z.object({
        employeeId: z.string().uuid().optional(),
        managerId: z.string().uuid().optional(),
        status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']).optional(),
        leaveTypeId: z.string().uuid().optional(),
        startDate: z.string().datetime().optional().transform(val => val ? new Date(val) : undefined),
        endDate: z.string().datetime().optional().transform(val => val ? new Date(val) : undefined),
        page: z.string().optional().transform(val => val ? parseInt(val) : 1),
        limit: z.string().optional().transform(val => val ? parseInt(val) : 50)
      });

      const validatedData = validateRequest(req.query, schema);

      const requests = await this.leaveManagementService.getLeaveRequests({
        employeeId: validatedData.employeeId,
        managerId: validatedData.managerId,
        status: validatedData.status,
        leaveTypeId: validatedData.leaveTypeId,
        startDate: validatedData.startDate,
        endDate: validatedData.endDate
      });

      // Pagination
      const page = validatedData.page || 1;
      const limit = validatedData.limit || 50;
      const startIndex = (page - 1) * limit;
      const endIndex = page * limit;
      const paginatedRequests = requests.slice(startIndex, endIndex);

      res.status(200).json({
        success: true,
        data: {
          requests: paginatedRequests,
          pagination: {
            page,
            limit,
            total: requests.length,
            totalPages: Math.ceil(requests.length / limit)
          }
        }
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get a specific leave request by ID
   * GET /api/leave/requests/:id
   */
  public getLeaveRequestById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const requestId = req.params.id;

      if (!requestId) {
        throw new AppError('Leave request ID is required', 400, 'VALIDATION_ERROR');
      }

      const leaveRequest = await this.leaveManagementService.getLeaveRequestById(requestId);

      if (!leaveRequest) {
        throw new AppError('Leave request not found', 404, 'NOT_FOUND');
      }

      res.status(200).json({
        success: true,
        data: leaveRequest
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Approve a leave request
   * PUT /api/leave/requests/:id/approve
   */
  public approveLeaveRequest = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const requestId = req.params.id;

      const schema = z.object({
        approverId: z.string().uuid(),
        notes: z.string().optional()
      });

      const validatedData = validateRequest(req.body, schema);

      const leaveRequest = await this.leaveManagementService.approveLeaveRequest({
        requestId,
        approverId: validatedData.approverId,
        notes: validatedData.notes
      });

      res.status(200).json({
        success: true,
        message: 'Leave request approved successfully',
        data: leaveRequest
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Deny/reject a leave request
   * PUT /api/leave/requests/:id/deny
   */
  public denyLeaveRequest = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const requestId = req.params.id;

      const schema = z.object({
        deniedBy: z.string().uuid(),
        reason: z.string().min(10).max(500),
        notes: z.string().optional()
      });

      const validatedData = validateRequest(req.body, schema);

      const leaveRequest = await this.leaveManagementService.denyLeaveRequest({
        requestId,
        deniedBy: validatedData.deniedBy,
        reason: validatedData.reason,
        notes: validatedData.notes
      });

      res.status(200).json({
        success: true,
        message: 'Leave request denied',
        data: leaveRequest
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Cancel a leave request
   * PUT /api/leave/requests/:id/cancel
   */
  public cancelLeaveRequest = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const requestId = req.params.id;

      const schema = z.object({
        employeeId: z.string().uuid(),
        reason: z.string().optional()
      });

      const validatedData = validateRequest(req.body, schema);

      const leaveRequest = await this.leaveManagementService.cancelLeaveRequest({
        requestId,
        employeeId: validatedData.employeeId,
        reason: validatedData.reason
      });

      res.status(200).json({
        success: true,
        message: 'Leave request cancelled successfully',
        data: leaveRequest
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get leave balance for an employee
   * GET /api/leave/balances/:employeeId
   */
  public getLeaveBalance = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const employeeId = req.params.employeeId;

      if (!employeeId) {
        throw new AppError('Employee ID is required', 400, 'VALIDATION_ERROR');
      }

      const schema = z.object({
        leaveTypeId: z.string().uuid().optional()
      });

      const validatedData = validateRequest(req.query, schema);

      const balances = await this.leaveManagementService.getLeaveBalance(
        employeeId,
        validatedData.leaveTypeId
      );

      res.status(200).json({
        success: true,
        data: balances
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get leave calendar for team visibility
   * GET /api/leave/calendar
   */
  public getLeaveCalendar = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const schema = z.object({
        startDate: z.string().datetime().transform(val => new Date(val)),
        endDate: z.string().datetime().transform(val => new Date(val)),
        departmentId: z.string().uuid().optional(),
        managerId: z.string().uuid().optional()
      });

      const validatedData = validateRequest(req.query, schema);

      const calendar = await this.leaveManagementService.getLeaveCalendar({
        startDate: validatedData.startDate,
        endDate: validatedData.endDate,
        departmentId: validatedData.departmentId,
        managerId: validatedData.managerId
      });

      res.status(200).json({
        success: true,
        data: calendar
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get available leave types and policies
   * GET /api/leave/policies
   */
  public getLeaveTypes = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const schema = z.object({
        employeeId: z.string().uuid().optional(),
        active: z.string().optional().transform(val => val === 'true')
      });

      const validatedData = validateRequest(req.query, schema);

      const leaveTypes = await this.leaveManagementService.getLeaveTypes({
        employeeId: validatedData.employeeId,
        active: validatedData.active
      });

      res.status(200).json({
        success: true,
        data: leaveTypes
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get pending leave approvals for a manager
   * GET /api/leave/pending-approvals
   */
  public getPendingApprovals = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const schema = z.object({
        managerId: z.string().uuid(),
        page: z.string().optional().transform(val => val ? parseInt(val) : 1),
        limit: z.string().optional().transform(val => val ? parseInt(val) : 50)
      });

      const validatedData = validateRequest(req.query, schema);

      const requests = await this.leaveManagementService.getPendingApprovals(
        validatedData.managerId
      );

      // Pagination
      const page = validatedData.page || 1;
      const limit = validatedData.limit || 50;
      const startIndex = (page - 1) * limit;
      const endIndex = page * limit;
      const paginatedRequests = requests.slice(startIndex, endIndex);

      res.status(200).json({
        success: true,
        data: {
          requests: paginatedRequests,
          pagination: {
            page,
            limit,
            total: requests.length,
            totalPages: Math.ceil(requests.length / limit)
          }
        }
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get team leave calendar for manager overview
   * GET /api/leave/team-calendar
   */
  public getTeamLeaveCalendar = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const schema = z.object({
        managerId: z.string().uuid(),
        startDate: z.string().datetime().transform(val => new Date(val)),
        endDate: z.string().datetime().transform(val => new Date(val))
      });

      const validatedData = validateRequest(req.query, schema);

      const calendar = await this.leaveManagementService.getTeamLeaveCalendar({
        managerId: validatedData.managerId,
        startDate: validatedData.startDate,
        endDate: validatedData.endDate
      });

      res.status(200).json({
        success: true,
        data: calendar
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Check leave eligibility before submission
   * POST /api/leave/check-eligibility
   */
  public checkLeaveEligibility = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const schema = z.object({
        employeeId: z.string().uuid(),
        leaveTypeId: z.string().uuid(),
        startDate: z.string().datetime().transform(val => new Date(val)),
        endDate: z.string().datetime().transform(val => new Date(val))
      });

      const validatedData = validateRequest(req.body, schema);

      const eligibility = await this.leaveManagementService.checkLeaveEligibility({
        employeeId: validatedData.employeeId,
        leaveTypeId: validatedData.leaveTypeId,
        startDate: validatedData.startDate,
        endDate: validatedData.endDate
      });

      res.status(200).json({
        success: true,
        data: eligibility
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get leave request statistics for an employee
   * GET /api/leave/statistics/:employeeId
   */
  public getLeaveStatistics = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const employeeId = req.params.employeeId;

      if (!employeeId) {
        throw new AppError('Employee ID is required', 400, 'VALIDATION_ERROR');
      }

      const schema = z.object({
        year: z.string().optional().transform(val => val ? parseInt(val) : new Date().getFullYear())
      });

      const validatedData = validateRequest(req.query, schema);

      const statistics = await this.leaveManagementService.getLeaveStatistics(
        employeeId,
        validatedData.year
      );

      res.status(200).json({
        success: true,
        data: statistics
      });
    } catch (error) {
      next(error);
    }
  };
}
