import { Router } from 'express';
import { TimeReportController } from '../../controllers/time-attendance/TimeReportController';
import { TimeReportRepository } from '../../database/repositories/time-attendance/TimeReportRepository';
import { LeaveReportRepository } from '../../database/repositories/time-attendance/LeaveReportRepository';
import { authenticateToken } from '../../middleware/auth';
import { authorizeRoles } from '../../middleware/authorization';

const router = Router();

// Initialize repositories and controller
const timeReportRepository = new TimeReportRepository();
const leaveReportRepository = new LeaveReportRepository();
const timeReportController = new TimeReportController(
  timeReportRepository,
  leaveReportRepository
);

/**
 * Attendance Reporting Endpoints
 */

// GET /api/reports/attendance - Get attendance report
router.get(
  '/attendance',
  authenticateToken,
  authorizeRoles('MANAGER', 'HR_ADMIN'),
  timeReportController.getAttendanceReport
);

// GET /api/reports/time-summary - Get time summary report
router.get(
  '/time-summary',
  authenticateToken,
  authorizeRoles('MANAGER', 'HR_ADMIN'),
  timeReportController.getTimeSummary
);

// GET /api/reports/anomalies - Get anomalies report
router.get(
  '/anomalies',
  authenticateToken,
  authorizeRoles('MANAGER', 'HR_ADMIN'),
  timeReportController.getAnomaliesReport
);

/**
 * Leave Usage and Payroll Reporting Endpoints
 */

// GET /api/reports/leave-usage - Get leave usage report
router.get(
  '/leave-usage',
  authenticateToken,
  authorizeRoles('MANAGER', 'HR_ADMIN'),
  timeReportController.getLeaveUsageReport
);

// POST /api/reports/payroll-export - Export payroll data
router.post(
  '/payroll-export',
  authenticateToken,
  authorizeRoles('HR_ADMIN'),
  timeReportController.exportPayrollData
);

// GET /api/reports/policy-compliance - Get policy compliance report
router.get(
  '/policy-compliance',
  authenticateToken,
  authorizeRoles('HR_ADMIN'),
  timeReportController.getPolicyComplianceReport
);

/**
 * Manager Dashboard Endpoints
 */

// GET /api/managers/team-status - Get team status report
router.get(
  '/managers/team-status',
  authenticateToken,
  authorizeRoles('MANAGER', 'HR_ADMIN'),
  timeReportController.getTeamStatusReport
);

// GET /api/managers/team-schedule - Get team schedule
router.get(
  '/managers/team-schedule',
  authenticateToken,
  authorizeRoles('MANAGER', 'HR_ADMIN'),
  timeReportController.getTeamSchedule
);

// GET /api/managers/team-availability - Get team availability
router.get(
  '/managers/team-availability',
  authenticateToken,
  authorizeRoles('MANAGER', 'HR_ADMIN'),
  timeReportController.getTeamAvailability
);

export { router as timeReportRoutes };
