import { Router } from 'express';
import { StaffDocumentController } from '../controllers/StaffDocumentController';
import { AnnualLeavePlanController } from '../controllers/AnnualLeavePlanController';
import { authMiddleware } from '../middleware/supabase-auth';
import { rateLimitMiddleware } from '../middleware/security';

const router = Router();

// Initialize controllers
const documentController = new StaffDocumentController();
const leavePlanController = new AnnualLeavePlanController();

// Apply authentication middleware to all routes
router.use(authMiddleware);

// Apply rate limiting - stricter for upload operations
const uploadRateLimit = rateLimitMiddleware(5, 15 * 60 * 1000); // 5 uploads per 15 minutes
const standardRateLimit = rateLimitMiddleware(100, 15 * 60 * 1000); // 100 requests per 15 minutes

// ==============================================
// STAFF DOCUMENT ROUTES
// ==============================================

/**
 * Document upload
 * POST /api/document-management/documents/upload
 */
router.post('/documents/upload',
  uploadRateLimit,
  documentController.getUploadMiddleware(),
  documentController.uploadDocument
);

/**
 * Get document by ID
 * GET /api/document-management/documents/:id
 */
router.get('/documents/:id',
  standardRateLimit,
  documentController.getDocument
);

/**
 * Download document (get secure download URL)
 * GET /api/document-management/documents/:id/download
 */
router.get('/documents/:id/download',
  standardRateLimit,
  documentController.downloadDocument
);

/**
 * List documents with filtering and pagination
 * GET /api/document-management/documents
 * Query parameters:
 * - employeeId: Filter by employee ID
 * - category: Filter by document category
 * - status: Filter by document status
 * - fromDate: Filter by creation date (from)
 * - toDate: Filter by creation date (to)
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 20, max: 100)
 * - sortBy: Sort field (default: created_at)
 * - sortOrder: Sort order (asc/desc, default: desc)
 */
router.get('/documents',
  standardRateLimit,
  documentController.listDocuments
);

/**
 * Update document metadata
 * PUT /api/document-management/documents/:id
 */
router.put('/documents/:id',
  standardRateLimit,
  documentController.updateDocument
);

/**
 * Approve document (HR admin only)
 * POST /api/document-management/documents/:id/approve
 */
router.post('/documents/:id/approve',
  standardRateLimit,
  documentController.approveDocument
);

/**
 * Reject document (HR admin only)
 * POST /api/document-management/documents/:id/reject
 */
router.post('/documents/:id/reject',
  standardRateLimit,
  documentController.approveDocument
);

/**
 * Delete document
 * DELETE /api/document-management/documents/:id
 */
router.delete('/documents/:id',
  standardRateLimit,
  documentController.deleteDocument
);

/**
 * Get document statistics for employee
 * GET /api/document-management/documents/stats/:employeeId
 */
router.get('/documents/stats/:employeeId',
  standardRateLimit,
  documentController.getDocumentStats
);

/**
 * Get expiring documents (HR admin only)
 * GET /api/document-management/documents/expiring
 * Query parameters:
 * - days: Number of days to look ahead (default: 30)
 */
router.get('/documents/expiring',
  standardRateLimit,
  documentController.getExpiringDocuments
);

// ==============================================
// ANNUAL LEAVE PLAN ROUTES
// ==============================================

/**
 * Create new leave plan
 * POST /api/document-management/leave-plans
 */
router.post('/leave-plans',
  standardRateLimit,
  leavePlanController.createLeavePlan
);

/**
 * Get leave plan by ID
 * GET /api/document-management/leave-plans/:id
 */
router.get('/leave-plans/:id',
  standardRateLimit,
  leavePlanController.getLeavePlan
);

/**
 * List leave plans with filtering and pagination
 * GET /api/document-management/leave-plans
 * Query parameters:
 * - employeeId: Filter by employee ID
 * - year: Filter by year
 * - status: Filter by status
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 20, max: 100)
 * - sortBy: Sort field (default: created_at)
 * - sortOrder: Sort order (asc/desc, default: desc)
 */
router.get('/leave-plans',
  standardRateLimit,
  leavePlanController.listLeavePlans
);

/**
 * Update leave plan
 * PUT /api/document-management/leave-plans/:id
 */
router.put('/leave-plans/:id',
  standardRateLimit,
  leavePlanController.updateLeavePlan
);

/**
 * Submit leave plan for approval
 * POST /api/document-management/leave-plans/:id/submit
 */
router.post('/leave-plans/:id/submit',
  standardRateLimit,
  leavePlanController.submitLeavePlan
);

/**
 * Manager approval of leave plan
 * POST /api/document-management/leave-plans/:id/manager-approve
 */
router.post('/leave-plans/:id/manager-approve',
  standardRateLimit,
  leavePlanController.managerApproval
);

/**
 * Manager rejection of leave plan
 * POST /api/document-management/leave-plans/:id/manager-reject
 */
router.post('/leave-plans/:id/manager-reject',
  standardRateLimit,
  leavePlanController.managerApproval
);

/**
 * HR approval of leave plan
 * POST /api/document-management/leave-plans/:id/hr-approve
 */
router.post('/leave-plans/:id/hr-approve',
  standardRateLimit,
  leavePlanController.hrApproval
);

/**
 * HR rejection of leave plan
 * POST /api/document-management/leave-plans/:id/hr-reject
 */
router.post('/leave-plans/:id/hr-reject',
  standardRateLimit,
  leavePlanController.hrApproval
);

/**
 * Delete leave plan
 * DELETE /api/document-management/leave-plans/:id
 */
router.delete('/leave-plans/:id',
  standardRateLimit,
  leavePlanController.deleteLeavePlan
);

/**
 * Get pending manager approvals
 * GET /api/document-management/leave-plans/pending/manager
 */
router.get('/leave-plans/pending/manager',
  standardRateLimit,
  leavePlanController.getPendingManagerApprovals
);

/**
 * Get pending HR approvals
 * GET /api/document-management/leave-plans/pending/hr
 */
router.get('/leave-plans/pending/hr',
  standardRateLimit,
  leavePlanController.getPendingHRApprovals
);

/**
 * Get leave plan statistics (HR admin only)
 * GET /api/document-management/leave-plans/stats
 * Query parameters:
 * - year: Filter by specific year
 */
router.get('/leave-plans/stats',
  standardRateLimit,
  leavePlanController.getStatistics
);

export { router as documentManagementRoutes };