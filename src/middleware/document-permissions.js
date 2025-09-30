import { logger } from '../utils/logger';
import { StaffDocumentRepository } from '../database/repositories/StaffDocumentRepository';
import { AnnualLeavePlanRepository } from '../database/repositories/AnnualLeavePlanRepository';
/**
 * Middleware to check document access permissions
 * Determines what actions the user can perform on documents
 */
export const documentPermissionMiddleware = async (req, res, next) => {
    try {
        // Extract user context from authentication middleware
        if (!req.permissionContext) {
            res.status(401).json({
                success: false,
                message: 'Authentication required for document access'
            });
            return;
        }
        const userContext = {
            userId: req.permissionContext.userId,
            employeeId: req.permissionContext.employeeId,
            roles: normalizeRoles(req.permissionContext.roles),
            managedEmployeeIds: req.permissionContext.managedEmployeeIds
        };
        // Get target employee ID from request params or body
        const targetEmployeeId = req.params.employeeId || req.params.id || req.body.employeeId;
        const documentId = req.params.documentId || req.params.id;
        // Determine permissions based on context
        const permissions = await calculateDocumentPermissions(userContext, targetEmployeeId, documentId, req.method, req.route?.path);
        // Attach permissions to request
        req.documentPermission = permissions;
        // Block access if no read permission
        if (!permissions.canRead) {
            logger.warn('Document access denied', {
                userId: userContext.userId,
                targetEmployeeId,
                documentId,
                method: req.method,
                path: req.route?.path,
                reason: permissions.reason
            });
            res.status(403).json({
                success: false,
                message: 'Insufficient permissions to access documents',
                reason: permissions.reason
            });
            return;
        }
        logger.info('Document access granted', {
            userId: userContext.userId,
            targetEmployeeId,
            documentId,
            permissions: {
                read: permissions.canRead,
                write: permissions.canWrite,
                approve: permissions.canApprove,
                delete: permissions.canDelete
            }
        });
        next();
    }
    catch (error) {
        logger.error('Error in document permission middleware', {
            error: error instanceof Error ? error.message : 'Unknown error',
            userId: req.permissionContext?.userId,
            method: req.method,
            path: req.route?.path
        });
        res.status(500).json({
            success: false,
            message: 'Internal server error in permission check'
        });
    }
};
/**
 * Specific middleware for document upload operations
 */
export const documentUploadPermissionMiddleware = async (req, res, next) => {
    try {
        if (!req.permissionContext) {
            res.status(401).json({
                success: false,
                message: 'Authentication required for document upload'
            });
            return;
        }
        const userContext = {
            userId: req.permissionContext.userId,
            employeeId: req.permissionContext.employeeId,
            roles: normalizeRoles(req.permissionContext.roles),
            managedEmployeeIds: req.permissionContext.managedEmployeeIds
        };
        const targetEmployeeId = req.body.employeeId;
        const category = req.body.category;
        // Check upload permissions
        const canUpload = await checkDocumentUploadPermission(userContext, targetEmployeeId, category);
        if (!canUpload.allowed) {
            logger.warn('Document upload denied', {
                userId: userContext.userId,
                targetEmployeeId,
                category,
                reason: canUpload.reason
            });
            res.status(403).json({
                success: false,
                message: 'Insufficient permissions to upload documents',
                reason: canUpload.reason
            });
            return;
        }
        req.documentPermission = {
            canRead: true,
            canWrite: true,
            canApprove: userContext.roles.includes('HR_ADMIN'),
            canDelete: canUpload.canDelete
        };
        next();
    }
    catch (error) {
        logger.error('Error in document upload permission middleware', {
            error: error instanceof Error ? error.message : 'Unknown error',
            userId: req.permissionContext?.userId
        });
        res.status(500).json({
            success: false,
            message: 'Internal server error in upload permission check'
        });
    }
};
/**
 * Middleware specifically for document approval operations (HR admin only)
 */
export const documentApprovalPermissionMiddleware = async (req, res, next) => {
    try {
        if (!req.permissionContext) {
            res.status(401).json({
                success: false,
                message: 'Authentication required for document approval'
            });
            return;
        }
        const userRoles = normalizeRoles(req.permissionContext.roles);
        // Only HR admins can approve/reject documents
        if (!userRoles.includes('HR_ADMIN')) {
            logger.warn('Document approval denied - insufficient role', {
                userId: req.permissionContext.userId,
                roles: userRoles,
                documentId: req.params.id
            });
            res.status(403).json({
                success: false,
                message: 'Only HR administrators can approve or reject documents'
            });
            return;
        }
        req.documentPermission = {
            canRead: true,
            canWrite: true,
            canApprove: true,
            canDelete: true
        };
        next();
    }
    catch (error) {
        logger.error('Error in document approval permission middleware', {
            error: error instanceof Error ? error.message : 'Unknown error',
            userId: req.permissionContext?.userId
        });
        res.status(500).json({
            success: false,
            message: 'Internal server error in approval permission check'
        });
    }
};
/**
 * Middleware for leave plan permissions
 */
export const leavePlanPermissionMiddleware = async (req, res, next) => {
    try {
        if (!req.permissionContext) {
            res.status(401).json({
                success: false,
                message: 'Authentication required for leave plan access'
            });
            return;
        }
        const userContext = {
            userId: req.permissionContext.userId,
            employeeId: req.permissionContext.employeeId,
            roles: normalizeRoles(req.permissionContext.roles),
            managedEmployeeIds: req.permissionContext.managedEmployeeIds
        };
        const targetEmployeeId = req.params.employeeId || req.body.employeeId;
        const planId = req.params.id;
        const permissions = await calculateLeavePlanPermissions(userContext, targetEmployeeId, planId, req.method);
        if (!permissions.canRead) {
            logger.warn('Leave plan access denied', {
                userId: userContext.userId,
                targetEmployeeId,
                planId,
                reason: permissions.reason
            });
            res.status(403).json({
                success: false,
                message: 'Insufficient permissions to access leave plans',
                reason: permissions.reason
            });
            return;
        }
        req.documentPermission = permissions;
        next();
    }
    catch (error) {
        logger.error('Error in leave plan permission middleware', {
            error: error instanceof Error ? error.message : 'Unknown error',
            userId: req.permissionContext?.userId
        });
        res.status(500).json({
            success: false,
            message: 'Internal server error in leave plan permission check'
        });
    }
};
/**
 * Calculate document permissions based on user context and target
 */
async function calculateDocumentPermissions(userContext, targetEmployeeId, documentId, method, path) {
    // HR admins have full access to all documents
    if (userContext.roles.includes('HR_ADMIN')) {
        return {
            canRead: true,
            canWrite: true,
            canApprove: true,
            canDelete: true
        };
    }
    // Employees can access their own documents
    if (targetEmployeeId && (targetEmployeeId === userContext.employeeId || targetEmployeeId === userContext.userId)) {
        // If editing/deleting, check document status
        if (documentId && (method === 'PUT' || method === 'DELETE')) {
            try {
                const documentRepo = new StaffDocumentRepository();
                const document = await documentRepo.findById(documentId);
                if (document && document.status !== 'PENDING') {
                    return {
                        canRead: true,
                        canWrite: false,
                        canApprove: false,
                        canDelete: false,
                        reason: 'Only pending documents can be modified by employees'
                    };
                }
            }
            catch (error) {
                logger.warn('Could not check document status for permission calculation', {
                    documentId,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        }
        return {
            canRead: true,
            canWrite: true,
            canApprove: false,
            canDelete: method === 'DELETE' // Only allow deletion in specific contexts
        };
    }
    // Managers can access their direct reports' documents
    if (userContext.roles.includes('MANAGER') &&
        targetEmployeeId &&
        userContext.managedEmployeeIds?.includes(targetEmployeeId)) {
        return {
            canRead: true,
            canWrite: false,
            canApprove: false,
            canDelete: false
        };
    }
    // Default: no access
    return {
        canRead: false,
        canWrite: false,
        canApprove: false,
        canDelete: false,
        reason: 'No permission to access documents for this employee'
    };
}
/**
 * Check document upload permissions
 */
async function checkDocumentUploadPermission(userContext, targetEmployeeId, category) {
    // HR admins can upload documents for anyone
    if (userContext.roles.includes('HR_ADMIN')) {
        return {
            allowed: true,
            canDelete: true
        };
    }
    // Employees can upload documents for themselves
    if (targetEmployeeId === userContext.employeeId || targetEmployeeId === userContext.userId) {
        // Check category restrictions
        const restrictedCategories = ['PERFORMANCE_REVIEW'];
        if (restrictedCategories.includes(category)) {
            return {
                allowed: false,
                canDelete: false,
                reason: `${category} documents can only be uploaded by HR administrators`
            };
        }
        return {
            allowed: true,
            canDelete: true
        };
    }
    // Managers can upload certain documents for their direct reports
    if (userContext.roles.includes('MANAGER') &&
        userContext.managedEmployeeIds?.includes(targetEmployeeId)) {
        const managerAllowedCategories = [
            'PERFORMANCE_REVIEW',
            'TRAINING_RECORD'
        ];
        if (managerAllowedCategories.includes(category)) {
            return {
                allowed: true,
                canDelete: false
            };
        }
        return {
            allowed: false,
            canDelete: false,
            reason: 'Managers can only upload performance reviews and training records for their direct reports'
        };
    }
    return {
        allowed: false,
        canDelete: false,
        reason: 'No permission to upload documents for this employee'
    };
}
/**
 * Calculate leave plan permissions
 */
async function calculateLeavePlanPermissions(userContext, targetEmployeeId, planId, method) {
    // HR admins have full access
    if (userContext.roles.includes('HR_ADMIN')) {
        return {
            canRead: true,
            canWrite: true,
            canApprove: true,
            canDelete: true
        };
    }
    // Employees can access their own leave plans
    if (targetEmployeeId && (targetEmployeeId === userContext.employeeId || targetEmployeeId === userContext.userId)) {
        // Check plan status for write operations
        if (planId && (method === 'PUT' || method === 'DELETE')) {
            try {
                const leavePlanRepo = new AnnualLeavePlanRepository();
                const plan = await leavePlanRepo.findById(planId);
                if (plan && plan.status !== 'DRAFT') {
                    return {
                        canRead: true,
                        canWrite: false,
                        canApprove: false,
                        canDelete: false,
                        reason: 'Only draft leave plans can be modified by employees'
                    };
                }
            }
            catch (error) {
                logger.warn('Could not check leave plan status for permission calculation', {
                    planId,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        }
        return {
            canRead: true,
            canWrite: true,
            canApprove: false,
            canDelete: true
        };
    }
    // Managers can view and approve leave plans for their direct reports
    if (userContext.roles.includes('MANAGER') &&
        targetEmployeeId &&
        userContext.managedEmployeeIds?.includes(targetEmployeeId)) {
        return {
            canRead: true,
            canWrite: false,
            canApprove: true,
            canDelete: false
        };
    }
    return {
        canRead: false,
        canWrite: false,
        canApprove: false,
        canDelete: false,
        reason: 'No permission to access leave plans for this employee'
    };
}
/**
 * Utility function to check if user can access employee documents
 */
export const canAccessEmployeeDocuments = (userContext, targetEmployeeId) => {
    // HR admins can access all documents
    if (userContext.roles.includes('hr_admin')) {
        return true;
    }
    // Employees can access their own documents
    if (targetEmployeeId === userContext.employeeId || targetEmployeeId === userContext.userId) {
        return true;
    }
    // Managers can access their direct reports' documents
    if (userContext.roles.includes('manager') &&
        userContext.managedEmployeeIds?.includes(targetEmployeeId)) {
        return true;
    }
    return false;
};
/**
 * Rate limiting specifically for document operations
 */
export const documentRateLimitMiddleware = (windowMs = 15 * 60 * 1000, // 15 minutes
maxRequests = 50 // 50 requests per window
) => {
    const requestCounts = new Map();
    return (req, res, next) => {
        const userKey = req.user?.permissionContext?.userId || req.ip;
        const now = Date.now();
        const userRequests = requestCounts.get(userKey);
        if (!userRequests || now > userRequests.resetTime) {
            requestCounts.set(userKey, {
                count: 1,
                resetTime: now + windowMs
            });
            next();
            return;
        }
        if (userRequests.count >= maxRequests) {
            logger.warn('Document operation rate limit exceeded', {
                userKey,
                count: userRequests.count,
                limit: maxRequests
            });
            res.status(429).json({
                success: false,
                message: 'Too many document requests. Please try again later.',
                retryAfter: Math.ceil((userRequests.resetTime - now) / 1000)
            });
            return;
        }
        userRequests.count++;
        next();
    };
};
