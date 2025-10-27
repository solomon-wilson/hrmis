import { Router } from 'express';
import { TimeTrackingController } from '../../controllers/time-attendance/TimeTrackingController';
import { TimeTrackingService } from '../../services/time-attendance/TimeTrackingService';
import { TimeEntryRepository } from '../../database/repositories/time-attendance/TimeEntryRepository';
import { BreakEntryRepository } from '../../database/repositories/time-attendance/BreakEntryRepository';
import { authenticateToken } from '../../middleware/auth';
import { authorizeRoles } from '../../middleware/authorization';

const router = Router();

// Initialize repositories and services
const timeEntryRepository = new TimeEntryRepository();
const breakEntryRepository = new BreakEntryRepository();
const timeTrackingService = new TimeTrackingService(timeEntryRepository, breakEntryRepository);
const timeTrackingController = new TimeTrackingController(timeTrackingService);

/**
 * Time Clock Endpoints
 */

// POST /api/time/clock-in - Clock in an employee
router.post(
  '/clock-in',
  authenticateToken,
  authorizeRoles('EMPLOYEE', 'MANAGER', 'HR_ADMIN'),
  timeTrackingController.clockIn
);

// POST /api/time/clock-out - Clock out an employee
router.post(
  '/clock-out',
  authenticateToken,
  authorizeRoles('EMPLOYEE', 'MANAGER', 'HR_ADMIN'),
  timeTrackingController.clockOut
);

// POST /api/time/break/start - Start a break
router.post(
  '/break/start',
  authenticateToken,
  authorizeRoles('EMPLOYEE', 'MANAGER', 'HR_ADMIN'),
  timeTrackingController.startBreak
);

// POST /api/time/break/end - End a break
router.post(
  '/break/end',
  authenticateToken,
  authorizeRoles('EMPLOYEE', 'MANAGER', 'HR_ADMIN'),
  timeTrackingController.endBreak
);

// GET /api/time/status/:employeeId - Get current employee time status
router.get(
  '/status/:employeeId',
  authenticateToken,
  authorizeRoles('EMPLOYEE', 'MANAGER', 'HR_ADMIN'),
  timeTrackingController.getCurrentStatus
);

/**
 * Time Entry Management Endpoints
 */

// GET /api/time/entries - Get time entries with filtering and pagination
router.get(
  '/entries',
  authenticateToken,
  authorizeRoles('EMPLOYEE', 'MANAGER', 'HR_ADMIN'),
  timeTrackingController.getTimeEntries
);

// POST /api/time/manual-entry - Submit manual time entry
router.post(
  '/manual-entry',
  authenticateToken,
  authorizeRoles('MANAGER', 'HR_ADMIN'),
  timeTrackingController.submitManualEntry
);

// PUT /api/time/entries/:id - Correct/update time entry
router.put(
  '/entries/:id',
  authenticateToken,
  authorizeRoles('EMPLOYEE', 'MANAGER', 'HR_ADMIN'),
  timeTrackingController.correctTimeEntry
);

/**
 * Employee Time Dashboard Endpoints
 */

// GET /api/time/dashboard/:employeeId - Get employee time dashboard
router.get(
  '/dashboard/:employeeId',
  authenticateToken,
  authorizeRoles('EMPLOYEE', 'MANAGER', 'HR_ADMIN'),
  timeTrackingController.getEmployeeDashboard
);

// GET /api/time/pay-period/:employeeId - Get time data for current pay period
router.get(
  '/pay-period/:employeeId',
  authenticateToken,
  authorizeRoles('EMPLOYEE', 'MANAGER', 'HR_ADMIN'),
  timeTrackingController.getPayPeriodData
);

// GET /api/time/history/:employeeId - Get time entry history
router.get(
  '/history/:employeeId',
  authenticateToken,
  authorizeRoles('EMPLOYEE', 'MANAGER', 'HR_ADMIN'),
  timeTrackingController.getTimeEntryHistory
);

// GET /api/time/corrections/:employeeId - Get correction status
router.get(
  '/corrections/:employeeId',
  authenticateToken,
  authorizeRoles('EMPLOYEE', 'MANAGER', 'HR_ADMIN'),
  timeTrackingController.getCorrectionStatus
);

export { router as timeTrackingRoutes };
