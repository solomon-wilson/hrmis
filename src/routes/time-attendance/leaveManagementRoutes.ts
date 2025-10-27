import { Router } from 'express';
import { LeaveManagementController } from '../../controllers/time-attendance/LeaveManagementController';
import { LeaveManagementService } from '../../services/time-attendance/LeaveManagementService';
import { LeaveRequestRepository } from '../../database/repositories/time-attendance/LeaveRequestRepository';
import { LeaveBalanceRepository } from '../../database/repositories/time-attendance/LeaveBalanceRepository';
import { PolicyRepository } from '../../database/repositories/time-attendance/PolicyRepository';
import { authenticateToken } from '../../middleware/auth';
import { authorizeRoles } from '../../middleware/authorization';

const router = Router();

// Initialize repositories and services
const leaveRequestRepository = new LeaveRequestRepository();
const leaveBalanceRepository = new LeaveBalanceRepository();
const policyRepository = new PolicyRepository();
const leaveManagementService = new LeaveManagementService(
  leaveRequestRepository,
  leaveBalanceRepository,
  policyRepository
);
const leaveManagementController = new LeaveManagementController(leaveManagementService);

/**
 * Leave Request Endpoints
 */

// POST /api/leave/requests - Submit a leave request
router.post(
  '/requests',
  authenticateToken,
  authorizeRoles('EMPLOYEE', 'MANAGER', 'HR_ADMIN'),
  leaveManagementController.submitLeaveRequest
);

// GET /api/leave/requests - Get leave requests with role-based filtering
router.get(
  '/requests',
  authenticateToken,
  authorizeRoles('EMPLOYEE', 'MANAGER', 'HR_ADMIN'),
  leaveManagementController.getLeaveRequests
);

// GET /api/leave/requests/:id - Get specific leave request
router.get(
  '/requests/:id',
  authenticateToken,
  authorizeRoles('EMPLOYEE', 'MANAGER', 'HR_ADMIN'),
  leaveManagementController.getLeaveRequestById
);

// PUT /api/leave/requests/:id/approve - Approve leave request
router.put(
  '/requests/:id/approve',
  authenticateToken,
  authorizeRoles('MANAGER', 'HR_ADMIN'),
  leaveManagementController.approveLeaveRequest
);

// PUT /api/leave/requests/:id/deny - Deny leave request
router.put(
  '/requests/:id/deny',
  authenticateToken,
  authorizeRoles('MANAGER', 'HR_ADMIN'),
  leaveManagementController.denyLeaveRequest
);

// PUT /api/leave/requests/:id/cancel - Cancel leave request
router.put(
  '/requests/:id/cancel',
  authenticateToken,
  authorizeRoles('EMPLOYEE', 'MANAGER', 'HR_ADMIN'),
  leaveManagementController.cancelLeaveRequest
);

/**
 * Leave Balance and Calendar Endpoints
 */

// GET /api/leave/balances/:employeeId - Get leave balance
router.get(
  '/balances/:employeeId',
  authenticateToken,
  authorizeRoles('EMPLOYEE', 'MANAGER', 'HR_ADMIN'),
  leaveManagementController.getLeaveBalance
);

// GET /api/leave/calendar - Get leave calendar
router.get(
  '/calendar',
  authenticateToken,
  authorizeRoles('EMPLOYEE', 'MANAGER', 'HR_ADMIN'),
  leaveManagementController.getLeaveCalendar
);

// GET /api/leave/policies - Get available leave types and policies
router.get(
  '/policies',
  authenticateToken,
  authorizeRoles('EMPLOYEE', 'MANAGER', 'HR_ADMIN'),
  leaveManagementController.getLeaveTypes
);

/**
 * Manager Approval Dashboard Endpoints
 */

// GET /api/leave/pending-approvals - Get pending leave approvals for manager
router.get(
  '/pending-approvals',
  authenticateToken,
  authorizeRoles('MANAGER', 'HR_ADMIN'),
  leaveManagementController.getPendingApprovals
);

// GET /api/leave/team-calendar - Get team leave calendar
router.get(
  '/team-calendar',
  authenticateToken,
  authorizeRoles('MANAGER', 'HR_ADMIN'),
  leaveManagementController.getTeamLeaveCalendar
);

/**
 * Utility Endpoints
 */

// POST /api/leave/check-eligibility - Check leave eligibility
router.post(
  '/check-eligibility',
  authenticateToken,
  authorizeRoles('EMPLOYEE', 'MANAGER', 'HR_ADMIN'),
  leaveManagementController.checkLeaveEligibility
);

// GET /api/leave/statistics/:employeeId - Get leave statistics
router.get(
  '/statistics/:employeeId',
  authenticateToken,
  authorizeRoles('EMPLOYEE', 'MANAGER', 'HR_ADMIN'),
  leaveManagementController.getLeaveStatistics
);

export { router as leaveManagementRoutes };
