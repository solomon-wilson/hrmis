import { Router } from 'express';
import { PolicyController } from '../../controllers/time-attendance/PolicyController';
import { PolicyEngine } from '../../services/time-attendance/PolicyEngine';
import { PolicyRepository } from '../../database/repositories/time-attendance/PolicyRepository';
import { authenticateToken } from '../../middleware/auth';
import { authorizeRoles } from '../../middleware/authorization';

const router = Router();

// Initialize repositories and services
const policyRepository = new PolicyRepository();
const policyEngine = new PolicyEngine(policyRepository);
const policyController = new PolicyController(policyEngine, policyRepository);

/**
 * Policy Management Endpoints
 */

// GET /api/policies - Get all policies
router.get(
  '/',
  authenticateToken,
  authorizeRoles('HR_ADMIN', 'MANAGER'),
  policyController.getPolicies
);

// GET /api/policies/:id - Get policy by ID
router.get(
  '/:id',
  authenticateToken,
  authorizeRoles('HR_ADMIN', 'MANAGER'),
  policyController.getPolicyById
);

// POST /api/policies - Create new policy
router.post(
  '/',
  authenticateToken,
  authorizeRoles('HR_ADMIN'),
  policyController.createPolicy
);

// PUT /api/policies/:id - Update policy
router.put(
  '/:id',
  authenticateToken,
  authorizeRoles('HR_ADMIN'),
  policyController.updatePolicy
);

// DELETE /api/policies/:id - Delete/deactivate policy
router.delete(
  '/:id',
  authenticateToken,
  authorizeRoles('HR_ADMIN'),
  policyController.deletePolicy
);

/**
 * Policy Utility Endpoints
 */

// POST /api/policies/validate - Validate policy rules
router.post(
  '/validate',
  authenticateToken,
  authorizeRoles('HR_ADMIN'),
  policyController.validatePolicy
);

// POST /api/policies/analyze-impact - Analyze policy impact
router.post(
  '/analyze-impact',
  authenticateToken,
  authorizeRoles('HR_ADMIN'),
  policyController.analyzePolicyImpact
);

// POST /api/policies/:id/assign - Assign policy to employee groups
router.post(
  '/:id/assign',
  authenticateToken,
  authorizeRoles('HR_ADMIN'),
  policyController.assignPolicy
);

/**
 * Accrual and Balance Management Endpoints
 */

// POST /api/policies/accrual/run - Run accrual processing
router.post(
  '/accrual/run',
  authenticateToken,
  authorizeRoles('HR_ADMIN'),
  policyController.runAccrualProcessing
);

// POST /api/policies/balance/adjust - Manual balance adjustment
router.post(
  '/balance/adjust',
  authenticateToken,
  authorizeRoles('HR_ADMIN', 'MANAGER'),
  policyController.adjustBalance
);

export { router as policyRoutes };
