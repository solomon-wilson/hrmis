import { Router } from 'express';
import { EmployeeController } from '../controllers/EmployeeController';
import { 
  authenticate, 
  authorize, 
  canAccessEmployee, 
  canModifyEmployee,
  filterEmployeeFields 
} from '../middleware/auth';
import { validateRequest } from '../middleware/validation';

const router = Router();
const employeeController = new EmployeeController();

// Apply authentication to all employee routes
router.use(authenticate);

// Apply field filtering to all responses
router.use(filterEmployeeFields);

/**
 * GET /api/employees
 * Search and list employees with pagination and filtering
 * Requires: Any authenticated user (filtered by permissions)
 */
router.get('/', 
  authorize('employee', 'read'),
  employeeController.searchEmployees
);

/**
 * POST /api/employees
 * Create a new employee
 * Requires: HR_ADMIN role
 */
router.post('/', 
  authorize('employee', 'create'),
  validateRequest('createEmployee'),
  employeeController.createEmployee
);

/**
 * GET /api/employees/:id
 * Get employee by ID
 * Requires: Permission to access the specific employee
 */
router.get('/:id', 
  canAccessEmployee,
  employeeController.getEmployee
);

/**
 * PUT /api/employees/:id
 * Update employee
 * Requires: Permission to modify the specific employee
 */
router.put('/:id', 
  canModifyEmployee,
  validateRequest('updateEmployee'),
  employeeController.updateEmployee
);

/**
 * DELETE /api/employees/:id
 * Soft delete employee (terminate)
 * Requires: HR_ADMIN role
 */
router.delete('/:id', 
  authorize('employee', 'delete'),
  validateRequest('terminateEmployee'),
  employeeController.deleteEmployee
);

/**
 * GET /api/employees/:id/history
 * Get employee status history
 * Requires: Permission to access the specific employee
 */
router.get('/:id/history',
  canAccessEmployee,
  employeeController.getEmployeeHistory
);

// ==============================================
// DOCUMENT INTEGRATION ROUTES
// ==============================================

/**
 * GET /api/employees/:id/documents/summary
 * Get employee document summary for profile display
 * Requires: Permission to access the specific employee
 */
router.get('/:id/documents/summary',
  canAccessEmployee,
  employeeController.getEmployeeDocumentSummary
);

/**
 * GET /api/employees/:id/passport-photo
 * Get employee passport photo URL
 * Requires: Permission to access the specific employee
 */
router.get('/:id/passport-photo',
  canAccessEmployee,
  employeeController.getEmployeePassportPhoto
);

/**
 * GET /api/employees/:id/documents/requirements
 * Check employee document requirements status
 * Requires: Permission to access the specific employee
 */
router.get('/:id/documents/requirements',
  canAccessEmployee,
  employeeController.getEmployeeDocumentRequirements
);

/**
 * GET /api/employees/:id/documents/statistics
 * Get employee document statistics for reporting
 * Requires: Permission to access the specific employee (typically HR/Manager)
 */
router.get('/:id/documents/statistics',
  canAccessEmployee,
  employeeController.getEmployeeDocumentStatistics
);

export { router as employeeRoutes };