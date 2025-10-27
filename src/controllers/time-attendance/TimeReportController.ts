import { Request, Response, NextFunction } from 'express';
import { TimeReportRepository } from '../../database/repositories/time-attendance/TimeReportRepository';
import { LeaveReportRepository } from '../../database/repositories/time-attendance/LeaveReportRepository';
import { AppError } from '../../utils/errors';
import { validateRequest } from '../../utils/validation';
import { z } from 'zod';

/**
 * Time Report Controller
 * Handles attendance reporting, time summaries, and payroll exports
 */
export class TimeReportController {
  private timeReportRepository: TimeReportRepository;
  private leaveReportRepository: LeaveReportRepository;

  constructor(
    timeReportRepository: TimeReportRepository,
    leaveReportRepository: LeaveReportRepository
  ) {
    this.timeReportRepository = timeReportRepository;
    this.leaveReportRepository = leaveReportRepository;
  }

  /**
   * Get attendance report
   * GET /api/reports/attendance
   */
  public getAttendanceReport = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const schema = z.object({
        startDate: z.string().datetime().transform(val => new Date(val)),
        endDate: z.string().datetime().transform(val => new Date(val)),
        employeeIds: z.string().optional().transform(val => val ? val.split(',') : undefined),
        departmentId: z.string().uuid().optional(),
        includeBreaks: z.string().optional().transform(val => val === 'true'),
        format: z.enum(['JSON', 'CSV', 'PDF']).optional().default('JSON')
      });

      const validatedData = validateRequest(req.query, schema);

      const report = await this.timeReportRepository.getAttendanceReport({
        startDate: validatedData.startDate,
        endDate: validatedData.endDate,
        employeeIds: validatedData.employeeIds,
        departmentId: validatedData.departmentId,
        includeBreaks: validatedData.includeBreaks
      });

      if (validatedData.format === 'CSV') {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=attendance-report.csv');
        res.status(200).send(this.convertToCSV(report));
      } else {
        res.status(200).json({
          success: true,
          data: report
        });
      }
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get time summary report
   * GET /api/reports/time-summary
   */
  public getTimeSummary = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const schema = z.object({
        startDate: z.string().datetime().transform(val => new Date(val)),
        endDate: z.string().datetime().transform(val => new Date(val)),
        employeeIds: z.string().optional().transform(val => val ? val.split(',') : undefined),
        departmentId: z.string().uuid().optional(),
        groupBy: z.enum(['EMPLOYEE', 'DEPARTMENT', 'DATE']).optional().default('EMPLOYEE')
      });

      const validatedData = validateRequest(req.query, schema);

      const summary = await this.timeReportRepository.getTimeSummary({
        startDate: validatedData.startDate,
        endDate: validatedData.endDate,
        employeeIds: validatedData.employeeIds,
        departmentId: validatedData.departmentId,
        groupBy: validatedData.groupBy
      });

      res.status(200).json({
        success: true,
        data: summary
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get anomalies report
   * GET /api/reports/anomalies
   */
  public getAnomaliesReport = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const schema = z.object({
        startDate: z.string().datetime().transform(val => new Date(val)),
        endDate: z.string().datetime().transform(val => new Date(val)),
        employeeIds: z.string().optional().transform(val => val ? val.split(',') : undefined),
        anomalyTypes: z.string().optional().transform(val => val ? val.split(',') : undefined),
        severity: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional()
      });

      const validatedData = validateRequest(req.query, schema);

      const anomalies = await this.timeReportRepository.getAnomalies({
        startDate: validatedData.startDate,
        endDate: validatedData.endDate,
        employeeIds: validatedData.employeeIds,
        anomalyTypes: validatedData.anomalyTypes as any,
        severity: validatedData.severity
      });

      res.status(200).json({
        success: true,
        data: anomalies
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get leave usage report
   * GET /api/reports/leave-usage
   */
  public getLeaveUsageReport = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const schema = z.object({
        startDate: z.string().datetime().transform(val => new Date(val)),
        endDate: z.string().datetime().transform(val => new Date(val)),
        employeeIds: z.string().optional().transform(val => val ? val.split(',') : undefined),
        departmentId: z.string().uuid().optional(),
        leaveTypeId: z.string().uuid().optional(),
        groupBy: z.enum(['EMPLOYEE', 'DEPARTMENT', 'LEAVE_TYPE']).optional().default('EMPLOYEE')
      });

      const validatedData = validateRequest(req.query, schema);

      const report = await this.leaveReportRepository.getLeaveUsageReport({
        startDate: validatedData.startDate,
        endDate: validatedData.endDate,
        employeeIds: validatedData.employeeIds,
        departmentId: validatedData.departmentId,
        leaveTypeId: validatedData.leaveTypeId,
        groupBy: validatedData.groupBy
      });

      res.status(200).json({
        success: true,
        data: report
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Export payroll data
   * POST /api/reports/payroll-export
   */
  public exportPayrollData = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const schema = z.object({
        startDate: z.string().datetime().transform(val => new Date(val)),
        endDate: z.string().datetime().transform(val => new Date(val)),
        employeeIds: z.array(z.string().uuid()).optional(),
        format: z.enum(['JSON', 'CSV', 'XML']).optional().default('CSV'),
        includeLeaveData: z.boolean().optional().default(true)
      });

      const validatedData = validateRequest(req.body, schema);

      const payrollData = await this.timeReportRepository.getPayrollExportData({
        startDate: validatedData.startDate,
        endDate: validatedData.endDate,
        employeeIds: validatedData.employeeIds,
        includeLeaveData: validatedData.includeLeaveData
      });

      if (validatedData.format === 'CSV') {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=payroll-export.csv');
        res.status(200).send(this.convertToCSV(payrollData));
      } else if (validatedData.format === 'XML') {
        res.setHeader('Content-Type', 'application/xml');
        res.setHeader('Content-Disposition', 'attachment; filename=payroll-export.xml');
        res.status(200).send(this.convertToXML(payrollData));
      } else {
        res.status(200).json({
          success: true,
          data: payrollData
        });
      }
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get policy compliance report
   * GET /api/reports/policy-compliance
   */
  public getPolicyComplianceReport = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const schema = z.object({
        startDate: z.string().datetime().transform(val => new Date(val)),
        endDate: z.string().datetime().transform(val => new Date(val)),
        policyIds: z.string().optional().transform(val => val ? val.split(',') : undefined),
        departmentId: z.string().uuid().optional()
      });

      const validatedData = validateRequest(req.query, schema);

      const report = await this.leaveReportRepository.getPolicyComplianceReport({
        startDate: validatedData.startDate,
        endDate: validatedData.endDate,
        policyIds: validatedData.policyIds,
        departmentId: validatedData.departmentId
      });

      res.status(200).json({
        success: true,
        data: report
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get manager team status report
   * GET /api/managers/team-status
   */
  public getTeamStatusReport = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const schema = z.object({
        managerId: z.string().uuid(),
        date: z.string().datetime().optional().transform(val => val ? new Date(val) : new Date())
      });

      const validatedData = validateRequest(req.query, schema);

      const status = await this.timeReportRepository.getTeamStatus({
        managerId: validatedData.managerId,
        date: validatedData.date
      });

      res.status(200).json({
        success: true,
        data: status
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get team schedule/calendar
   * GET /api/managers/team-schedule
   */
  public getTeamSchedule = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const schema = z.object({
        managerId: z.string().uuid(),
        startDate: z.string().datetime().transform(val => new Date(val)),
        endDate: z.string().datetime().transform(val => new Date(val))
      });

      const validatedData = validateRequest(req.query, schema);

      const schedule = await this.timeReportRepository.getTeamSchedule({
        managerId: validatedData.managerId,
        startDate: validatedData.startDate,
        endDate: validatedData.endDate
      });

      res.status(200).json({
        success: true,
        data: schedule
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get team availability for planning
   * GET /api/managers/team-availability
   */
  public getTeamAvailability = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const schema = z.object({
        managerId: z.string().uuid(),
        startDate: z.string().datetime().transform(val => new Date(val)),
        endDate: z.string().datetime().transform(val => new Date(val)),
        includeLeaveRequests: z.string().optional().transform(val => val === 'true')
      });

      const validatedData = validateRequest(req.query, schema);

      const availability = await this.leaveReportRepository.getTeamAvailability({
        managerId: validatedData.managerId,
        startDate: validatedData.startDate,
        endDate: validatedData.endDate,
        includeLeaveRequests: validatedData.includeLeaveRequests
      });

      res.status(200).json({
        success: true,
        data: availability
      });
    } catch (error) {
      next(error);
    }
  };

  // Helper methods for format conversion
  private convertToCSV(data: any[]): string {
    if (!data || data.length === 0) return '';

    const headers = Object.keys(data[0]).join(',');
    const rows = data.map(row =>
      Object.values(row).map(val =>
        typeof val === 'string' && val.includes(',') ? `"${val}"` : val
      ).join(',')
    );

    return [headers, ...rows].join('\n');
  }

  private convertToXML(data: any[]): string {
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<payroll>\n';

    data.forEach(item => {
      xml += '  <record>\n';
      Object.entries(item).forEach(([key, value]) => {
        xml += `    <${key}>${value}</${key}>\n`;
      });
      xml += '  </record>\n';
    });

    xml += '</payroll>';
    return xml;
  }
}
