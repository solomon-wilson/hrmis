import { Router } from 'express';
import { ManagerController } from '../controllers/ManagerController';
import { 
  authenticate, 
  authorize
} from '../middleware/auth';

const router = Router();
const managerController = new ManagerController();

// Apply authentication to all manager routes
router.use(authenticate);

/**
 * GET /api/managers/:id/reports
 * Get direct reports for a manager
 * Requires: MANAGER role (for own reports) or HR_ADMIN role (for any manager's reports)
 */
router.get('/:id/reports', 
  authorize('employee', 'read'),
  managerController.getDirectReports
);

export { router as managerRoutes };