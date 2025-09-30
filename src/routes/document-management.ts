import { Router } from 'express';
import { StaffDocumentController } from '../controllers/StaffDocumentController';
import { AnnualLeavePlanController } from '../controllers/AnnualLeavePlanController';
import { authenticateWithSupabase, requireRole } from '../middleware/supabase-auth';
import { rateLimitMiddleware } from '../middleware/security';
import { 
  documentPermissionMiddleware,
  documentUploadPermissionMiddleware,
  documentApprovalPermissionMiddleware,
  leavePlanPermissionMiddleware
} from '../middleware/document-permissions';
import { validateInput } from '../middleware/inputValidation';
import {
  paramsWithId,
  paramsWithEmployeeId,
  uploadBody,
  listQuery,
  updateBody,
  daysQuery,
  leavePlanCreate,
  leavePlanUpdate
} from '../validation/document-management';
import {
  documentAccessAuditMiddleware,
  documentModificationAuditMiddleware,
  documentUploadAuditMiddleware,
  documentDeletionAuditMiddleware,
  documentApprovalAuditMiddleware,
  leavePlanAuditMiddleware,
  securityEventAuditMiddleware
} from '../middleware/document-audit';

const router = Router();

// Initialize controllers
const documentController = new StaffDocumentController();
const leavePlanController = new AnnualLeavePlanController();

// Apply authentication and security-event audit to all routes
router.use(securityEventAuditMiddleware);
router.use(authenticateWithSupabase);

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
  validateInput(uploadBody, 'body'),
  documentUploadPermissionMiddleware,
  documentController.getUploadMiddleware(),
  documentUploadAuditMiddleware,
  documentController.uploadDocument
);

/**
 * Get document by ID
 * GET /api/document-management/documents/:id
 */
router.get('/documents/:id',
  standardRateLimit,
  validateInput(paramsWithId, 'params'),
  documentPermissionMiddleware,
  documentAccessAuditMiddleware,
  documentController.getDocument
);

/**
 * Download document (get secure download URL)
 * GET /api/document-management/documents/:id/download
 */
router.get('/documents/:id/download',
  standardRateLimit,
  validateInput(paramsWithId, 'params'),
  documentPermissionMiddleware,
  documentAccessAuditMiddleware,
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
  validateInput(listQuery, 'query'),
  documentPermissionMiddleware,
  documentAccessAuditMiddleware,
  documentController.listDocuments
);

/**
 * Update document metadata
 * PUT /api/document-management/documents/:id
 */
router.put('/documents/:id',
  standardRateLimit,
  validateInput(paramsWithId, 'params'),
  validateInput(updateBody, 'body'),
  documentPermissionMiddleware,
  documentModificationAuditMiddleware,
  documentController.updateDocument
);

/**
 * Approve document (HR admin only)
 * POST /api/document-management/documents/:id/approve
 */
router.post('/documents/:id/approve',
  standardRateLimit,
  validateInput(paramsWithId, 'params'),
  documentApprovalPermissionMiddleware,
  requireRole('HR_ADMIN'),
  documentApprovalAuditMiddleware,
  documentController.approveDocument
);

/**
 * Reject document (HR admin only)
 * POST /api/document-management/documents/:id/reject
 */
router.post('/documents/:id/reject',
  standardRateLimit,
  validateInput(paramsWithId, 'params'),
  documentApprovalPermissionMiddleware,
  requireRole('HR_ADMIN'),
  documentApprovalAuditMiddleware,
  documentController.approveDocument
);

/**
 * Delete document
 * DELETE /api/document-management/documents/:id
 */
router.delete('/documents/:id',
  standardRateLimit,
  validateInput(paramsWithId, 'params'),
  documentPermissionMiddleware,
  documentDeletionAuditMiddleware,
  documentController.deleteDocument
);

/**
 * Get document statistics for employee
 * GET /api/document-management/documents/stats/:employeeId
 */
router.get('/documents/stats/:employeeId',
  standardRateLimit,
  validateInput(paramsWithEmployeeId, 'params'),
  documentPermissionMiddleware,
  documentAccessAuditMiddleware,
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
  validateInput(daysQuery, 'query'),
  requireRole('HR_ADMIN'),
  documentAccessAuditMiddleware,
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
  validateInput(leavePlanCreate, 'body'),
  leavePlanPermissionMiddleware,
  leavePlanAuditMiddleware('LEAVE_PLAN_CREATE'),
  leavePlanController.createLeavePlan
);

/**
 * Get leave plan by ID
 * GET /api/document-management/leave-plans/:id
 */
router.get('/leave-plans/:id',
  standardRateLimit,
  validateInput(paramsWithId, 'params'),
  leavePlanPermissionMiddleware,
  leavePlanAuditMiddleware('LEAVE_PLAN_READ'),
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
  validateInput(listQuery, 'query'),
  leavePlanPermissionMiddleware,
  leavePlanAuditMiddleware('LEAVE_PLAN_LIST'),
  leavePlanController.listLeavePlans
);

/**
 * Update leave plan
 * PUT /api/document-management/leave-plans/:id
 */
router.put('/leave-plans/:id',
  standardRateLimit,
  validateInput(paramsWithId, 'params'),
  validateInput(leavePlanUpdate, 'body'),
  leavePlanPermissionMiddleware,
  leavePlanAuditMiddleware('LEAVE_PLAN_UPDATE'),
  leavePlanController.updateLeavePlan
);

/**
 * Submit leave plan for approval
 * POST /api/document-management/leave-plans/:id/submit
 */
router.post('/leave-plans/:id/submit',
  standardRateLimit,
  validateInput(paramsWithId, 'params'),
  leavePlanPermissionMiddleware,
  leavePlanAuditMiddleware('LEAVE_PLAN_SUBMIT'),
  leavePlanController.submitLeavePlan
);

/**
 * Manager approval of leave plan
 * POST /api/document-management/leave-plans/:id/manager-approve
 */
router.post('/leave-plans/:id/manager-approve',
  standardRateLimit,
  validateInput(paramsWithId, 'params'),
  requireRole('MANAGER'),
  leavePlanPermissionMiddleware,
  leavePlanAuditMiddleware('LEAVE_PLAN_MANAGER_APPROVE'),
  leavePlanController.managerApproval
);

/**
 * Manager rejection of leave plan
 * POST /api/document-management/leave-plans/:id/manager-reject
 */
router.post('/leave-plans/:id/manager-reject',
  standardRateLimit,
  validateInput(paramsWithId, 'params'),
  requireRole('MANAGER'),
  leavePlanPermissionMiddleware,
  leavePlanAuditMiddleware('LEAVE_PLAN_MANAGER_REJECT'),
  leavePlanController.managerApproval
);

/**
 * HR approval of leave plan
 * POST /api/document-management/leave-plans/:id/hr-approve
 */
router.post('/leave-plans/:id/hr-approve',
  standardRateLimit,
  validateInput(paramsWithId, 'params'),
  requireRole('HR_ADMIN'),
  leavePlanPermissionMiddleware,
  leavePlanAuditMiddleware('LEAVE_PLAN_HR_APPROVE'),
  leavePlanController.hrApproval
);

/**
 * HR rejection of leave plan
 * POST /api/document-management/leave-plans/:id/hr-reject
 */
router.post('/leave-plans/:id/hr-reject',
  standardRateLimit,
  validateInput(paramsWithId, 'params'),
  requireRole('HR_ADMIN'),
  leavePlanPermissionMiddleware,
  leavePlanAuditMiddleware('LEAVE_PLAN_HR_REJECT'),
  leavePlanController.hrApproval
);

/**
 * Delete leave plan
 * DELETE /api/document-management/leave-plans/:id
 */
router.delete('/leave-plans/:id',
  standardRateLimit,
  validateInput(paramsWithId, 'params'),
  leavePlanPermissionMiddleware,
  leavePlanAuditMiddleware('LEAVE_PLAN_DELETE'),
  leavePlanController.deleteLeavePlan
);

/**
 * Get pending manager approvals
 * GET /api/document-management/leave-plans/pending/manager
 */
router.get('/leave-plans/pending/manager',
  standardRateLimit,
  requireRole('MANAGER'),
  leavePlanPermissionMiddleware,
  leavePlanAuditMiddleware('LEAVE_PLAN_PENDING_MANAGER'),
  leavePlanController.getPendingManagerApprovals
);

/**
 * Get pending HR approvals
 * GET /api/document-management/leave-plans/pending/hr
 */
router.get('/leave-plans/pending/hr',
  standardRateLimit,
  requireRole('HR_ADMIN'),
  leavePlanPermissionMiddleware,
  leavePlanAuditMiddleware('LEAVE_PLAN_PENDING_HR'),
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
  requireRole('HR_ADMIN'),
  leavePlanPermissionMiddleware,
  leavePlanAuditMiddleware('LEAVE_PLAN_STATS'),
  leavePlanController.getStatistics
);

export { router as documentManagementRoutes };