import { Request, Response, NextFunction } from 'express';
import { TimeTrackingService } from '../../services/time-attendance/TimeTrackingService';
import { AppError } from '../../utils/errors';
import { validateRequest } from '../../utils/validation';
import { z } from 'zod';

/**
 * Time Tracking Controller
 * Handles HTTP requests for time clock operations, time entry management, and employee dashboards
 */
export class TimeTrackingController {
  private timeTrackingService: TimeTrackingService;

  constructor(timeTrackingService: TimeTrackingService) {
    this.timeTrackingService = timeTrackingService;
  }

  /**
   * Clock in an employee
   * POST /api/time/clock-in
   */
  public clockIn = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const schema = z.object({
        employeeId: z.string().uuid(),
        clockInTime: z.string().datetime().optional().transform(val => val ? new Date(val) : undefined),
        location: z.object({
          latitude: z.number(),
          longitude: z.number(),
          accuracy: z.number().optional()
        }).optional(),
        notes: z.string().optional()
      });

      const validatedData = validateRequest(req.body, schema);

      const timeEntry = await this.timeTrackingService.clockIn({
        employeeId: validatedData.employeeId,
        clockInTime: validatedData.clockInTime,
        location: validatedData.location,
        notes: validatedData.notes
      });

      res.status(201).json({
        success: true,
        message: 'Successfully clocked in',
        data: {
          timeEntry,
          clockInTime: timeEntry.clockInTime
        }
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Clock out an employee
   * POST /api/time/clock-out
   */
  public clockOut = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const schema = z.object({
        employeeId: z.string().uuid(),
        clockOutTime: z.string().datetime().optional().transform(val => val ? new Date(val) : undefined),
        location: z.object({
          latitude: z.number(),
          longitude: z.number(),
          accuracy: z.number().optional()
        }).optional(),
        notes: z.string().optional()
      });

      const validatedData = validateRequest(req.body, schema);

      const timeEntry = await this.timeTrackingService.clockOut({
        employeeId: validatedData.employeeId,
        clockOutTime: validatedData.clockOutTime,
        location: validatedData.location,
        notes: validatedData.notes
      });

      res.status(200).json({
        success: true,
        message: 'Successfully clocked out',
        data: {
          timeEntry,
          clockOutTime: timeEntry.clockOutTime,
          totalHours: timeEntry.totalHours,
          regularHours: timeEntry.regularHours,
          overtimeHours: timeEntry.overtimeHours
        }
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Start a break
   * POST /api/time/break/start
   */
  public startBreak = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const schema = z.object({
        employeeId: z.string().uuid(),
        breakType: z.enum(['LUNCH', 'SHORT_BREAK', 'PERSONAL']),
        startTime: z.string().datetime().optional().transform(val => val ? new Date(val) : undefined),
        paid: z.boolean().optional(),
        notes: z.string().optional()
      });

      const validatedData = validateRequest(req.body, schema);

      const breakEntry = await this.timeTrackingService.startBreak({
        employeeId: validatedData.employeeId,
        breakType: validatedData.breakType,
        startTime: validatedData.startTime,
        paid: validatedData.paid,
        notes: validatedData.notes
      });

      res.status(201).json({
        success: true,
        message: 'Break started successfully',
        data: {
          breakEntry,
          breakType: breakEntry.breakType,
          startTime: breakEntry.startTime
        }
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * End a break
   * POST /api/time/break/end
   */
  public endBreak = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const schema = z.object({
        employeeId: z.string().uuid(),
        endTime: z.string().datetime().optional().transform(val => val ? new Date(val) : undefined),
        notes: z.string().optional()
      });

      const validatedData = validateRequest(req.body, schema);

      const breakEntry = await this.timeTrackingService.endBreak({
        employeeId: validatedData.employeeId,
        endTime: validatedData.endTime,
        notes: validatedData.notes
      });

      res.status(200).json({
        success: true,
        message: 'Break ended successfully',
        data: {
          breakEntry,
          endTime: breakEntry.endTime,
          duration: breakEntry.durationMinutes
        }
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get current employee time status
   * GET /api/time/status/:employeeId
   */
  public getCurrentStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const employeeId = req.params.employeeId;

      if (!employeeId) {
        throw new AppError('Employee ID is required', 400, 'VALIDATION_ERROR');
      }

      const status = await this.timeTrackingService.getCurrentStatus(employeeId);

      res.status(200).json({
        success: true,
        data: status
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get time entries with filtering and pagination
   * GET /api/time/entries
   */
  public getTimeEntries = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const schema = z.object({
        employeeId: z.string().uuid().optional(),
        startDate: z.string().datetime().optional().transform(val => val ? new Date(val) : undefined),
        endDate: z.string().datetime().optional().transform(val => val ? new Date(val) : undefined),
        status: z.enum(['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED']).optional(),
        page: z.string().optional().transform(val => val ? parseInt(val) : 1),
        limit: z.string().optional().transform(val => val ? parseInt(val) : 50)
      });

      const validatedData = validateRequest(req.query, schema);

      const entries = await this.timeTrackingService.getTimeEntries({
        employeeId: validatedData.employeeId,
        startDate: validatedData.startDate,
        endDate: validatedData.endDate,
        status: validatedData.status
      });

      // Simple pagination
      const page = validatedData.page || 1;
      const limit = validatedData.limit || 50;
      const startIndex = (page - 1) * limit;
      const endIndex = page * limit;
      const paginatedEntries = entries.slice(startIndex, endIndex);

      res.status(200).json({
        success: true,
        data: {
          entries: paginatedEntries,
          pagination: {
            page,
            limit,
            total: entries.length,
            totalPages: Math.ceil(entries.length / limit)
          }
        }
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Submit manual time entry
   * POST /api/time/manual-entry
   */
  public submitManualEntry = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const schema = z.object({
        employeeId: z.string().uuid(),
        clockInTime: z.string().datetime().transform(val => new Date(val)),
        clockOutTime: z.string().datetime().transform(val => new Date(val)),
        breakEntries: z.array(z.object({
          breakType: z.enum(['LUNCH', 'SHORT_BREAK', 'PERSONAL']),
          startTime: z.string().datetime().transform(val => new Date(val)),
          endTime: z.string().datetime().transform(val => new Date(val)),
          paid: z.boolean()
        })).optional(),
        reason: z.string().min(10),
        submittedBy: z.string().uuid(),
        notes: z.string().optional()
      });

      const validatedData = validateRequest(req.body, schema);

      const timeEntry = await this.timeTrackingService.submitManualEntry({
        employeeId: validatedData.employeeId,
        clockInTime: validatedData.clockInTime,
        clockOutTime: validatedData.clockOutTime,
        breakEntries: validatedData.breakEntries,
        reason: validatedData.reason,
        submittedBy: validatedData.submittedBy,
        notes: validatedData.notes
      });

      res.status(201).json({
        success: true,
        message: 'Manual time entry submitted successfully. Pending approval.',
        data: timeEntry
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Update/correct time entry
   * PUT /api/time/entries/:id
   */
  public correctTimeEntry = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const timeEntryId = req.params.id;

      const schema = z.object({
        clockInTime: z.string().datetime().optional().transform(val => val ? new Date(val) : undefined),
        clockOutTime: z.string().datetime().optional().transform(val => val ? new Date(val) : undefined),
        breakEntries: z.array(z.object({
          breakType: z.enum(['LUNCH', 'SHORT_BREAK', 'PERSONAL']),
          startTime: z.string().datetime().transform(val => new Date(val)),
          endTime: z.string().datetime().transform(val => new Date(val)),
          paid: z.boolean()
        })).optional(),
        reason: z.string().min(10),
        requestedBy: z.string().uuid(),
        notes: z.string().optional()
      });

      const validatedData = validateRequest(req.body, schema);

      const timeEntry = await this.timeTrackingService.requestCorrection({
        timeEntryId,
        clockInTime: validatedData.clockInTime,
        clockOutTime: validatedData.clockOutTime,
        breakEntries: validatedData.breakEntries,
        reason: validatedData.reason,
        requestedBy: validatedData.requestedBy,
        notes: validatedData.notes
      });

      res.status(200).json({
        success: true,
        message: 'Time entry correction requested. Pending approval.',
        data: timeEntry
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get employee time dashboard
   * GET /api/time/dashboard/:employeeId
   */
  public getEmployeeDashboard = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const employeeId = req.params.employeeId;

      if (!employeeId) {
        throw new AppError('Employee ID is required', 400, 'VALIDATION_ERROR');
      }

      const dashboard = await this.timeTrackingService.getEmployeeDashboard(employeeId);

      res.status(200).json({
        success: true,
        data: dashboard
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get time data for current pay period
   * GET /api/time/pay-period/:employeeId
   */
  public getPayPeriodData = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const employeeId = req.params.employeeId;

      if (!employeeId) {
        throw new AppError('Employee ID is required', 400, 'VALIDATION_ERROR');
      }

      const schema = z.object({
        startDate: z.string().datetime().optional().transform(val => val ? new Date(val) : undefined),
        endDate: z.string().datetime().optional().transform(val => val ? new Date(val) : undefined)
      });

      const validatedData = validateRequest(req.query, schema);

      // If no dates provided, calculate current pay period (assuming bi-weekly starting from a reference date)
      let startDate = validatedData.startDate;
      let endDate = validatedData.endDate;

      if (!startDate || !endDate) {
        const now = new Date();
        const referenceDate = new Date(now.getFullYear(), 0, 1); // Jan 1st of current year
        const daysSinceReference = Math.floor((now.getTime() - referenceDate.getTime()) / (1000 * 60 * 60 * 24));
        const currentPeriod = Math.floor(daysSinceReference / 14);

        startDate = new Date(referenceDate.getTime() + (currentPeriod * 14 * 24 * 60 * 60 * 1000));
        endDate = new Date(startDate.getTime() + (14 * 24 * 60 * 60 * 1000));
      }

      const entries = await this.timeTrackingService.getTimeEntries({
        employeeId,
        startDate,
        endDate,
        status: 'APPROVED'
      });

      const summary = await this.timeTrackingService.calculatePayPeriodSummary(employeeId, startDate, endDate);

      res.status(200).json({
        success: true,
        data: {
          payPeriod: {
            startDate,
            endDate
          },
          entries,
          summary
        }
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get time entry history for an employee
   * GET /api/time/history/:employeeId
   */
  public getTimeEntryHistory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const employeeId = req.params.employeeId;

      if (!employeeId) {
        throw new AppError('Employee ID is required', 400, 'VALIDATION_ERROR');
      }

      const schema = z.object({
        startDate: z.string().datetime().optional().transform(val => val ? new Date(val) : undefined),
        endDate: z.string().datetime().optional().transform(val => val ? new Date(val) : undefined),
        page: z.string().optional().transform(val => val ? parseInt(val) : 1),
        limit: z.string().optional().transform(val => val ? parseInt(val) : 50)
      });

      const validatedData = validateRequest(req.query, schema);

      const entries = await this.timeTrackingService.getTimeEntries({
        employeeId,
        startDate: validatedData.startDate,
        endDate: validatedData.endDate
      });

      // Pagination
      const page = validatedData.page || 1;
      const limit = validatedData.limit || 50;
      const startIndex = (page - 1) * limit;
      const endIndex = page * limit;
      const paginatedEntries = entries.slice(startIndex, endIndex);

      res.status(200).json({
        success: true,
        data: {
          entries: paginatedEntries,
          pagination: {
            page,
            limit,
            total: entries.length,
            totalPages: Math.ceil(entries.length / limit)
          }
        }
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get correction status for time entries
   * GET /api/time/corrections/:employeeId
   */
  public getCorrectionStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const employeeId = req.params.employeeId;

      if (!employeeId) {
        throw new AppError('Employee ID is required', 400, 'VALIDATION_ERROR');
      }

      const entries = await this.timeTrackingService.getTimeEntries({
        employeeId,
        status: 'SUBMITTED' // Correction requests pending approval
      });

      res.status(200).json({
        success: true,
        data: {
          pendingCorrections: entries.filter(e => e.isCorrection),
          total: entries.length
        }
      });
    } catch (error) {
      next(error);
    }
  };
}
