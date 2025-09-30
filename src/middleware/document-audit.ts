import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { supabase } from '../database/supabase';

/**
 * Audit logging middleware for document operations
 * Tracks all document access, modifications, and security events
 */

export interface DocumentAuditLog {
  id?: string;
  entity_type: 'DOCUMENT' | 'LEAVE_PLAN' | 'DOCUMENT_VERSION';
  entity_id: string;
  action: string;
  user_id: string;
  employee_id?: string;
  ip_address?: string;
  user_agent?: string;
  request_id?: string;
  details: Record<string, any>;
  security_event?: boolean;
  performed_at: Date;
}

export interface AuditRequest extends Request {
  auditContext?: {
    entityType: 'DOCUMENT' | 'LEAVE_PLAN' | 'DOCUMENT_VERSION';
    entityId?: string;
    action: string;
    details?: Record<string, any>;
  };
}

/**
 * Main audit logging middleware for document operations
 */
export const documentAuditMiddleware = (
  action: string,
  entityType: 'DOCUMENT' | 'LEAVE_PLAN' | 'DOCUMENT_VERSION' = 'DOCUMENT'
) => {
  return async (req: AuditRequest, res: Response, next: NextFunction): Promise<void> => {
    const startTime = Date.now();

    // Store original res.json to intercept response
    const originalJson = res.json.bind(res);

    // Override res.json to capture response data
    res.json = function(data: any) {
      const endTime = Date.now();
      const duration = endTime - startTime;

      // Log the audit entry after response is sent
      setImmediate(async () => {
        try {
          await logDocumentAudit({
            req,
            action,
            entityType,
            responseData: data,
            duration,
            statusCode: res.statusCode
          });
        } catch (error) {
          logger.error('Failed to log document audit', {
            error: error instanceof Error ? error.message : 'Unknown error',
            action,
            entityType,
            userId: req.user?.permissionContext?.userId
          });
        }
      });

      return originalJson(data);
    };

    next();
  };
};

/**
 * Audit middleware specifically for document access (read operations)
 */
export const documentAccessAuditMiddleware = documentAuditMiddleware('DOCUMENT_ACCESS', 'DOCUMENT');

/**
 * Audit middleware for document modifications
 */
export const documentModificationAuditMiddleware = documentAuditMiddleware('DOCUMENT_MODIFY', 'DOCUMENT');

/**
 * Audit middleware for document uploads
 */
export const documentUploadAuditMiddleware = documentAuditMiddleware('DOCUMENT_UPLOAD', 'DOCUMENT');

/**
 * Audit middleware for document deletions
 */
export const documentDeletionAuditMiddleware = documentAuditMiddleware('DOCUMENT_DELETE', 'DOCUMENT');

/**
 * Audit middleware for document approvals/rejections
 */
export const documentApprovalAuditMiddleware = documentAuditMiddleware('DOCUMENT_APPROVAL', 'DOCUMENT');

/**
 * Audit middleware for leave plan operations
 */
export const leavePlanAuditMiddleware = (action: string) =>
  documentAuditMiddleware(action, 'LEAVE_PLAN');

/**
 * Security event audit middleware for unauthorized access attempts
 */
export const securityEventAuditMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  // Store original status and json methods
  const originalStatus = res.status.bind(res);
  const originalJson = res.json.bind(res);

  res.status = function(statusCode: number) {
    // Log security events for unauthorized access
    if (statusCode === 401 || statusCode === 403) {
      setImmediate(async () => {
        try {
          await logSecurityEvent({
            req,
            statusCode,
            reason: statusCode === 401 ? 'UNAUTHORIZED_ACCESS' : 'ACCESS_DENIED'
          });
        } catch (error) {
          logger.error('Failed to log security event', {
            error: error instanceof Error ? error.message : 'Unknown error',
            statusCode,
            url: req.originalUrl
          });
        }
      });
    }
    return originalStatus(statusCode);
  };

  res.json = function(data: any) {
    return originalJson(data);
  };

  next();
};

/**
 * Log document audit entry
 */
async function logDocumentAudit({
  req,
  action,
  entityType,
  responseData,
  duration,
  statusCode
}: {
  req: AuditRequest;
  action: string;
  entityType: 'DOCUMENT' | 'LEAVE_PLAN' | 'DOCUMENT_VERSION';
  responseData: any;
  duration: number;
  statusCode: number;
}): Promise<void> {
  try {
    const userId = req.user?.permissionContext?.userId;
    const employeeId = req.user?.employeeId;

    // Extract entity ID from params or response
    const entityId = req.params.id ||
                    req.params.documentId ||
                    req.params.planId ||
                    responseData?.data?.id ||
                    req.auditContext?.entityId;

    // Build audit details
    const details: Record<string, any> = {
      method: req.method,
      url: req.originalUrl,
      statusCode,
      duration,
      success: statusCode < 400,
      ...(req.auditContext?.details || {})
    };

    // Add request-specific details
    if (req.method === 'POST' || req.method === 'PUT') {
      details.requestBody = sanitizeRequestBody(req.body);
    }

    if (req.query && Object.keys(req.query).length > 0) {
      details.queryParams = req.query;
    }

    // Add response details for successful operations
    if (statusCode < 400 && responseData?.data) {
      details.responseData = sanitizeResponseData(responseData.data);
    }

    // Add file upload details
    if (req.file) {
      details.fileUpload = {
        originalName: req.file.originalname,
        size: req.file.size,
        mimeType: req.file.mimetype
      };
    }

    const auditLog: DocumentAuditLog = {
      entity_type: entityType,
      entity_id: entityId || 'unknown',
      action,
      user_id: userId || 'anonymous',
      employee_id: employeeId,
      ip_address: getClientIpAddress(req),
      user_agent: req.get('User-Agent'),
      request_id: req.get('x-request-id') || req.get('x-correlation-id'),
      details,
      security_event: false,
      performed_at: new Date()
    };

    // Store in database
    const client = supabase.getClient();
    const { error } = await client
      .from('audit_logs')
      .insert({
        entity_type: auditLog.entity_type,
        entity_id: auditLog.entity_id,
        action: auditLog.action,
        performed_by: auditLog.user_id,
        ip_address: auditLog.ip_address,
        user_agent: auditLog.user_agent,
        correlation_id: auditLog.request_id,
        details: auditLog.details,
        security_event: auditLog.security_event,
        performed_at: auditLog.performed_at.toISOString()
      });

    if (error) {
      logger.error('Failed to store document audit log', {
        error: error.message,
        auditLog
      });
    } else {
      logger.info('Document audit logged', {
        action,
        entityType,
        entityId,
        userId,
        statusCode,
        duration
      });
    }

  } catch (error) {
    logger.error('Error in document audit logging', {
      error: error instanceof Error ? error.message : 'Unknown error',
      action,
      entityType
    });
  }
}

/**
 * Log security events
 */
async function logSecurityEvent({
  req,
  statusCode,
  reason
}: {
  req: Request;
  statusCode: number;
  reason: string;
}): Promise<void> {
  try {
    const auditLog: DocumentAuditLog = {
      entity_type: 'DOCUMENT',
      entity_id: 'security_event',
      action: 'SECURITY_EVENT',
      user_id: req.user?.permissionContext?.userId || 'anonymous',
      employee_id: req.user?.employeeId,
      ip_address: getClientIpAddress(req),
      user_agent: req.get('User-Agent'),
      request_id: req.get('x-request-id') || req.get('x-correlation-id'),
      details: {
        reason,
        statusCode,
        method: req.method,
        url: req.originalUrl,
        timestamp: new Date().toISOString(),
        headers: sanitizeHeaders(req.headers)
      },
      security_event: true,
      performed_at: new Date()
    };

    const client = supabase.getClient();
    const { error } = await client
      .from('audit_logs')
      .insert({
        entity_type: auditLog.entity_type,
        entity_id: auditLog.entity_id,
        action: auditLog.action,
        performed_by: auditLog.user_id,
        ip_address: auditLog.ip_address,
        user_agent: auditLog.user_agent,
        correlation_id: auditLog.request_id,
        details: auditLog.details,
        security_event: auditLog.security_event,
        performed_at: auditLog.performed_at.toISOString()
      });

    if (error) {
      logger.error('Failed to store security audit log', {
        error: error.message,
        auditLog
      });
    } else {
      logger.warn('Security event logged', {
        reason,
        statusCode,
        userId: auditLog.user_id,
        ipAddress: auditLog.ip_address,
        url: req.originalUrl
      });
    }

  } catch (error) {
    logger.error('Error in security event logging', {
      error: error instanceof Error ? error.message : 'Unknown error',
      reason,
      statusCode
    });
  }
}

/**
 * Get client IP address from request
 */
function getClientIpAddress(req: Request): string {
  return (
    req.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.get('x-real-ip') ||
    req.connection.remoteAddress ||
    req.socket.remoteAddress ||
    'unknown'
  );
}

/**
 * Sanitize request body to remove sensitive information
 */
function sanitizeRequestBody(body: any): any {
  if (!body) return {};

  const sanitized = { ...body };

  // Remove sensitive fields
  const sensitiveFields = [
    'password',
    'token',
    'secret',
    'key',
    'authorization',
    'ssn',
    'socialSecurityNumber',
    'bankAccount',
    'creditCard'
  ];

  sensitiveFields.forEach(field => {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  });

  // Limit size of metadata and other large objects
  if (sanitized.metadata && typeof sanitized.metadata === 'object') {
    const metadataString = JSON.stringify(sanitized.metadata);
    if (metadataString.length > 1000) {
      sanitized.metadata = '[LARGE_OBJECT_TRUNCATED]';
    }
  }

  return sanitized;
}

/**
 * Sanitize response data to remove sensitive information
 */
function sanitizeResponseData(data: any): any {
  if (!data) return {};

  // For arrays, sanitize each item
  if (Array.isArray(data)) {
    return data.slice(0, 10).map(item => sanitizeResponseData(item)); // Limit to first 10 items
  }

  const sanitized = { ...data };

  // Remove sensitive fields from response
  const sensitiveResponseFields = [
    'filePath', // Don't log full file paths
    'downloadUrl', // Don't log signed URLs
    'privateKey',
    'internalId'
  ];

  sensitiveResponseFields.forEach(field => {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  });

  return sanitized;
}

/**
 * Sanitize headers to remove sensitive information
 */
function sanitizeHeaders(headers: any): any {
  const sanitized = { ...headers };

  const sensitiveHeaders = [
    'authorization',
    'cookie',
    'x-api-key',
    'x-auth-token'
  ];

  sensitiveHeaders.forEach(header => {
    if (sanitized[header]) {
      sanitized[header] = '[REDACTED]';
    }
  });

  return sanitized;
}

/**
 * Middleware to add audit context to request
 */
export const addAuditContext = (
  entityType: 'DOCUMENT' | 'LEAVE_PLAN' | 'DOCUMENT_VERSION',
  action: string,
  getEntityId?: (req: Request) => string,
  getDetails?: (req: Request) => Record<string, any>
) => {
  return (req: AuditRequest, res: Response, next: NextFunction): void => {
    req.auditContext = {
      entityType,
      action,
      entityId: getEntityId ? getEntityId(req) : undefined,
      details: getDetails ? getDetails(req) : undefined
    };
    next();
  };
};

/**
 * Utility function to manually log document operations
 */
export const logDocumentOperation = async (
  userId: string,
  entityType: 'DOCUMENT' | 'LEAVE_PLAN' | 'DOCUMENT_VERSION',
  entityId: string,
  action: string,
  details: Record<string, any>,
  employeeId?: string
): Promise<void> => {
  try {
    const auditLog: DocumentAuditLog = {
      entity_type: entityType,
      entity_id: entityId,
      action,
      user_id: userId,
      employee_id: employeeId,
      details,
      security_event: false,
      performed_at: new Date()
    };

    const client = supabase.getClient();
    const { error } = await client
      .from('audit_logs')
      .insert({
        entity_type: auditLog.entity_type,
        entity_id: auditLog.entity_id,
        action: auditLog.action,
        performed_by: auditLog.user_id,
        details: auditLog.details,
        security_event: auditLog.security_event,
        performed_at: auditLog.performed_at.toISOString()
      });

    if (error) {
      throw error;
    }

    logger.info('Manual document operation logged', {
      action,
      entityType,
      entityId,
      userId
    });

  } catch (error) {
    logger.error('Failed to manually log document operation', {
      error: error instanceof Error ? error.message : 'Unknown error',
      action,
      entityType,
      entityId,
      userId
    });
    throw error;
  }
};

/**
 * Get audit logs for a specific entity
 */
export const getEntityAuditLogs = async (
  entityType: 'DOCUMENT' | 'LEAVE_PLAN' | 'DOCUMENT_VERSION',
  entityId: string,
  limit: number = 50
): Promise<DocumentAuditLog[]> => {
  try {
    const client = supabase.getClient();
    const { data, error } = await client
      .from('audit_logs')
      .select('*')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .order('performed_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw error;
    }

    return data.map(row => ({
      id: row.id,
      entity_type: row.entity_type,
      entity_id: row.entity_id,
      action: row.action,
      user_id: row.performed_by,
      employee_id: row.employee_id,
      ip_address: row.ip_address,
      user_agent: row.user_agent,
      request_id: row.correlation_id,
      details: row.details,
      security_event: row.security_event,
      performed_at: new Date(row.performed_at)
    }));

  } catch (error) {
    logger.error('Failed to get entity audit logs', {
      error: error instanceof Error ? error.message : 'Unknown error',
      entityType,
      entityId
    });
    throw error;
  }
};