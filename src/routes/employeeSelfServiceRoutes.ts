import { Router } from 'express';
import { EmployeeSelfServiceController } from '../controllers/EmployeeSelfServiceController';
import { 
  authenticate, 
  requireRole,
  filterEmployeeFields 
} from '../middleware/auth';
import { validateRequest } from '../middleware/validation';

const router = Router();
const employeeSelfServiceController = new EmployeeSelfServiceController();

// Apply authentication to all self-service routes
router.use(authenticate);

// Apply field filtering to employee data responses
router.use(filterEmployeeFields);

/**
 * GET /api/employees/me
 * Get current user's employee profile
 * Requires: EMPLOYEE role or higher
 */
router.get('/me', 
  requireRole('EMPLOYEE'),
  employeeSelfServiceController.getMyProfile
);

/**
 * PUT /api/employees/me
 * Update current user's employee profile (limited fields)
 * Requires: EMPLOYEE role or higher
 */
router.put('/me', 
  requireRole('EMPLOYEE'),
  validateRequest('updateSelfProfile'),
  employeeSelfServiceController.updateMyProfile
);

/**
 * POST /api/employees/me/change-requests
 * Submit a change request for restricted fields
 * Requires: EMPLOYEE role or higher
 */
router.post('/me/change-requests', 
  requireRole('EMPLOYEE'),
  validateRequest('submitChangeRequest'),
  employeeSelfServiceController.submitChangeRequest
);

/**
 * GET /api/employees/me/change-requests
 * Get current user's change requests
 * Requires: EMPLOYEE role or higher
 */
router.get('/me/change-requests', 
  requireRole('EMPLOYEE'),
  employeeSelfServiceController.getMyChangeRequests
);

/**
 * GET /api/employees/me/change-requests/:requestId
 * Get specific change request details
 * Requires: EMPLOYEE role or higher
 */
router.get('/me/change-requests/:requestId', 
  requireRole('EMPLOYEE'),
  employeeSelfServiceController.getChangeRequest
);

export { router as employeeSelfServiceRoutes };