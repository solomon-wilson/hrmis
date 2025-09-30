import { StaffDocument } from '../../models/document-management';
import { FileStorageService } from './FileStorageService';
import { StorageQuotaExceededError } from '../../utils/errors';
import { ValidationError } from '../../utils/validation';
import { logger } from '../../utils/logger';
import { database } from '../../database/connection';
import { v4 as uuidv4 } from 'uuid';
export class DocumentService {
    /**
     * Upload a new document
     */
    static async uploadDocument(request) {
        return database.transaction(async (client) => {
            try {
                // Validate file and storage quota first
                const quota = await FileStorageService.checkStorageQuota(request.employeeId, request.file.length);
                if (!quota.withinQuota) {
                    throw new StorageQuotaExceededError(quota.quota, quota.currentUsage, request.file.length);
                }
                // Upload file to storage
                const uploadResult = await FileStorageService.uploadFile({
                    file: request.file,
                    fileName: request.fileName,
                    mimeType: request.mimeType,
                    employeeId: request.employeeId,
                    category: request.category,
                    metadata: request.metadata
                });
                // Create document record
                const documentData = {
                    employeeId: request.employeeId,
                    category: request.category,
                    title: request.title,
                    description: request.description,
                    fileName: request.fileName,
                    filePath: uploadResult.filePath,
                    fileSize: uploadResult.fileSize,
                    mimeType: request.mimeType,
                    status: 'PENDING',
                    uploadedBy: request.uploadedBy,
                    expiresAt: request.expiresAt,
                    metadata: request.metadata || {}
                };
                const document = StaffDocument.createNew(documentData);
                // Save to database (this would normally use a repository)
                // For now, we'll create a simple insert
                const insertQuery = `
          INSERT INTO staff_documents (
            id, employee_id, category, title, description, file_name, file_path,
            file_size, mime_type, status, uploaded_by, expires_at, metadata,
            created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
          )
        `;
                await client.query(insertQuery, [
                    document.id,
                    document.employeeId,
                    document.category,
                    document.title,
                    document.description,
                    document.fileName,
                    document.filePath,
                    document.fileSize,
                    document.mimeType,
                    document.status,
                    document.uploadedBy,
                    document.expiresAt,
                    JSON.stringify(document.metadata),
                    document.createdAt,
                    document.updatedAt
                ]);
                // Create version history record
                await this.createVersionHistory(client, document.id, 'UPLOAD', request.uploadedBy, 'Initial upload');
                logger.info('Document uploaded successfully', {
                    documentId: document.id,
                    employeeId: request.employeeId,
                    category: request.category,
                    fileName: request.fileName
                });
                return document;
            }
            catch (error) {
                logger.error('Document upload failed', {
                    error: error instanceof Error ? error.message : 'Unknown error',
                    employeeId: request.employeeId,
                    category: request.category,
                    fileName: request.fileName
                });
                // If database operation fails, cleanup uploaded file
                try {
                    if (request.file) {
                        // We don't have the file path here, so this is a limitation
                        // In a real implementation, we'd handle this better
                    }
                }
                catch (cleanupError) {
                    logger.error('Failed to cleanup file after upload failure', cleanupError);
                }
                throw error;
            }
        });
    }
    /**
     * Get a document by ID with permission check
     */
    static async getDocument(documentId, requestedBy) {
        const client = await database.getClient();
        try {
            const query = `
        SELECT sd.*, e.user_id as employee_user_id
        FROM staff_documents sd
        JOIN employees e ON sd.employee_id = e.id
        WHERE sd.id = $1
      `;
            const result = await client.query(query, [documentId]);
            if (result.rows.length === 0) {
                throw new ValidationError('Document not found', []);
            }
            const row = result.rows[0];
            // Basic permission check (would be more sophisticated in real implementation)
            const hasPermission = await this.checkDocumentPermission(documentId, requestedBy, 'READ');
            if (!hasPermission) {
                throw new ValidationError('Insufficient permissions to access document', []);
            }
            const documentData = {
                id: row.id,
                employeeId: row.employee_id,
                category: row.category,
                title: row.title,
                description: row.description,
                fileName: row.file_name,
                filePath: row.file_path,
                fileSize: parseInt(row.file_size),
                mimeType: row.mime_type,
                status: row.status,
                uploadedBy: row.uploaded_by,
                approvedBy: row.approved_by,
                approvedAt: row.approved_at,
                expiresAt: row.expires_at,
                metadata: row.metadata || {},
                createdAt: row.created_at,
                updatedAt: row.updated_at
            };
            return StaffDocument.fromJSON(documentData);
        }
        finally {
            client.release();
        }
    }
    /**
     * Get download URL for a document
     */
    static async getDocumentDownloadUrl(documentId, requestedBy) {
        const document = await this.getDocument(documentId, requestedBy);
        return FileStorageService.getDownloadUrl(document.filePath, document.category);
    }
    /**
     * List documents with search criteria
     */
    static async listDocuments(criteria, options = {}) {
        const client = await database.getClient();
        try {
            const { limit = 50, offset = 0, sortBy = 'created_at', sortOrder = 'DESC' } = options;
            let whereClause = 'WHERE 1=1';
            const params = [];
            let paramCounter = 1;
            // Build WHERE clause
            if (criteria.employeeId) {
                whereClause += ` AND employee_id = $${paramCounter++}`;
                params.push(criteria.employeeId);
            }
            if (criteria.category) {
                whereClause += ` AND category = $${paramCounter++}`;
                params.push(criteria.category);
            }
            if (criteria.status) {
                whereClause += ` AND status = $${paramCounter++}`;
                params.push(criteria.status);
            }
            if (criteria.uploadedBy) {
                whereClause += ` AND uploaded_by = $${paramCounter++}`;
                params.push(criteria.uploadedBy);
            }
            if (criteria.expiresAfter) {
                whereClause += ` AND expires_at > $${paramCounter++}`;
                params.push(criteria.expiresAfter);
            }
            if (criteria.expiresBefore) {
                whereClause += ` AND expires_at < $${paramCounter++}`;
                params.push(criteria.expiresBefore);
            }
            if (criteria.createdAfter) {
                whereClause += ` AND created_at > $${paramCounter++}`;
                params.push(criteria.createdAfter);
            }
            if (criteria.createdBefore) {
                whereClause += ` AND created_at < $${paramCounter++}`;
                params.push(criteria.createdBefore);
            }
            // Count query
            const countQuery = `SELECT COUNT(*) FROM staff_documents ${whereClause}`;
            const countResult = await client.query(countQuery, params);
            const total = parseInt(countResult.rows[0].count);
            // Data query
            const dataQuery = `
        SELECT * FROM staff_documents
        ${whereClause}
        ORDER BY ${sortBy} ${sortOrder}
        LIMIT $${paramCounter++} OFFSET $${paramCounter++}
      `;
            params.push(limit, offset);
            const dataResult = await client.query(dataQuery, params);
            const documents = dataResult.rows.map(row => {
                const documentData = {
                    id: row.id,
                    employeeId: row.employee_id,
                    category: row.category,
                    title: row.title,
                    description: row.description,
                    fileName: row.file_name,
                    filePath: row.file_path,
                    fileSize: parseInt(row.file_size),
                    mimeType: row.mime_type,
                    status: row.status,
                    uploadedBy: row.uploaded_by,
                    approvedBy: row.approved_by,
                    approvedAt: row.approved_at,
                    expiresAt: row.expires_at,
                    metadata: row.metadata || {},
                    createdAt: row.created_at,
                    updatedAt: row.updated_at
                };
                return StaffDocument.fromJSON(documentData);
            });
            return { documents, total };
        }
        finally {
            client.release();
        }
    }
    /**
     * Approve a document
     */
    static async approveDocument(documentId, approvedBy) {
        return database.transaction(async (client) => {
            const document = await this.getDocument(documentId, approvedBy);
            // Check approval permission
            const hasPermission = await this.checkDocumentPermission(documentId, approvedBy, 'APPROVE');
            if (!hasPermission) {
                throw new ValidationError('Insufficient permissions to approve document', []);
            }
            const approvedDocument = document.approve(approvedBy);
            // Update in database
            const updateQuery = `
        UPDATE staff_documents
        SET status = $1, approved_by = $2, approved_at = $3, updated_at = $4
        WHERE id = $5
      `;
            await client.query(updateQuery, [
                approvedDocument.status,
                approvedDocument.approvedBy,
                approvedDocument.approvedAt,
                approvedDocument.updatedAt,
                documentId
            ]);
            // Create version history
            await this.createVersionHistory(client, documentId, 'STATUS_CHANGE', approvedBy, 'Document approved');
            logger.info('Document approved', {
                documentId,
                approvedBy,
                employeeId: document.employeeId
            });
            return approvedDocument;
        });
    }
    /**
     * Reject a document
     */
    static async rejectDocument(documentId, rejectedBy, reason) {
        return database.transaction(async (client) => {
            const document = await this.getDocument(documentId, rejectedBy);
            // Check rejection permission
            const hasPermission = await this.checkDocumentPermission(documentId, rejectedBy, 'APPROVE');
            if (!hasPermission) {
                throw new ValidationError('Insufficient permissions to reject document', []);
            }
            const rejectedDocument = document.reject();
            // Update in database
            const updateQuery = `
        UPDATE staff_documents
        SET status = $1, updated_at = $2
        WHERE id = $3
      `;
            await client.query(updateQuery, [
                rejectedDocument.status,
                rejectedDocument.updatedAt,
                documentId
            ]);
            // Create version history
            await this.createVersionHistory(client, documentId, 'STATUS_CHANGE', rejectedBy, `Document rejected${reason ? `: ${reason}` : ''}`);
            logger.info('Document rejected', {
                documentId,
                rejectedBy,
                employeeId: document.employeeId,
                reason
            });
            return rejectedDocument;
        });
    }
    /**
     * Replace a document file
     */
    static async replaceDocument(documentId, newFile, newFileName, newMimeType, replacedBy, reason) {
        return database.transaction(async (client) => {
            const document = await this.getDocument(documentId, replacedBy);
            // Check modification permission
            if (!document.canBeModified()) {
                throw new ValidationError('Document cannot be modified in its current status', []);
            }
            const hasPermission = await this.checkDocumentPermission(documentId, replacedBy, 'MODIFY');
            if (!hasPermission) {
                throw new ValidationError('Insufficient permissions to replace document', []);
            }
            // Store old file path for cleanup
            const oldFilePath = document.filePath;
            // Upload new file
            const uploadResult = await FileStorageService.uploadFile({
                file: newFile,
                fileName: newFileName,
                mimeType: newMimeType,
                employeeId: document.employeeId,
                category: document.category
            });
            // Update document record
            const updateQuery = `
        UPDATE staff_documents
        SET file_name = $1, file_path = $2, file_size = $3, mime_type = $4, updated_at = $5
        WHERE id = $6
      `;
            await client.query(updateQuery, [
                newFileName,
                uploadResult.filePath,
                uploadResult.fileSize,
                newMimeType,
                new Date(),
                documentId
            ]);
            // Create version history
            await this.createVersionHistory(client, documentId, 'REPLACE', replacedBy, reason || 'Document file replaced', { previousFilePath: oldFilePath });
            // Delete old file
            try {
                await FileStorageService.deleteFile(oldFilePath, document.category);
            }
            catch (deleteError) {
                logger.error('Failed to delete old file after replacement', {
                    oldFilePath,
                    documentId,
                    error: deleteError
                });
                // Don't fail the operation if old file deletion fails
            }
            // Return updated document
            return this.getDocument(documentId, replacedBy);
        });
    }
    /**
     * Delete a document
     */
    static async deleteDocument(documentId, deletedBy, reason) {
        return database.transaction(async (client) => {
            const document = await this.getDocument(documentId, deletedBy);
            // Check deletion permission
            const hasPermission = await this.checkDocumentPermission(documentId, deletedBy, 'DELETE');
            if (!hasPermission) {
                throw new ValidationError('Insufficient permissions to delete document', []);
            }
            // Create version history before deletion
            await this.createVersionHistory(client, documentId, 'DELETE', deletedBy, reason || 'Document deleted');
            // Delete from database
            await client.query('DELETE FROM staff_documents WHERE id = $1', [documentId]);
            // Delete file from storage
            await FileStorageService.deleteFile(document.filePath, document.category);
            logger.info('Document deleted', {
                documentId,
                deletedBy,
                employeeId: document.employeeId,
                reason
            });
        });
    }
    /**
     * Create version history record
     */
    static async createVersionHistory(client, documentId, action, changedBy, changeReason, metadata) {
        const query = `
      INSERT INTO document_version_history (
        id, document_id, version_number, action, changed_by, change_reason, metadata
      ) VALUES (
        $1, $2,
        COALESCE((SELECT MAX(version_number) + 1 FROM document_version_history WHERE document_id = $2), 1),
        $3, $4, $5, $6
      )
    `;
        await client.query(query, [
            uuidv4(),
            documentId,
            action,
            changedBy,
            changeReason,
            JSON.stringify(metadata || {})
        ]);
    }
    /**
     * Check document permission for user
     */
    static async checkDocumentPermission(documentId, userId, action) {
        // This is a simplified permission check
        // In a real implementation, this would be more sophisticated
        const client = await database.getClient();
        try {
            // Check if user is the document owner
            const ownerQuery = `
        SELECT 1 FROM staff_documents sd
        JOIN employees e ON sd.employee_id = e.id
        WHERE sd.id = $1 AND e.user_id = $2
      `;
            const ownerResult = await client.query(ownerQuery, [documentId, userId]);
            if (ownerResult.rows.length > 0) {
                // Document owner can read and modify (if document allows it)
                return action === 'READ' || action === 'MODIFY';
            }
            // Check if user is HR admin (can do everything)
            const hrQuery = `
        SELECT 1 FROM user_roles ur
        JOIN roles r ON ur.role_id = r.id
        WHERE ur.user_id = $1 AND r.name IN ('HR_ADMIN', 'HR_MANAGER')
      `;
            const hrResult = await client.query(hrQuery, [userId]);
            if (hrResult.rows.length > 0) {
                return true; // HR can do everything
            }
            // Check if user is manager of the employee
            const managerQuery = `
        SELECT 1 FROM staff_documents sd
        JOIN employees e ON sd.employee_id = e.id
        JOIN employees m ON e.manager_id = m.id
        WHERE sd.id = $1 AND m.user_id = $2
      `;
            const managerResult = await client.query(managerQuery, [documentId, userId]);
            if (managerResult.rows.length > 0) {
                // Managers can read and approve
                return action === 'READ' || action === 'APPROVE';
            }
            return false;
        }
        finally {
            client.release();
        }
    }
    /**
     * Get documents expiring soon
     */
    static async getExpiringDocuments(daysThreshold = 30) {
        const client = await database.getClient();
        try {
            const thresholdDate = new Date();
            thresholdDate.setDate(thresholdDate.getDate() + daysThreshold);
            const query = `
        SELECT * FROM staff_documents
        WHERE expires_at IS NOT NULL
          AND expires_at <= $1
          AND status = 'APPROVED'
        ORDER BY expires_at ASC
      `;
            const result = await client.query(query, [thresholdDate]);
            return result.rows.map(row => {
                const documentData = {
                    id: row.id,
                    employeeId: row.employee_id,
                    category: row.category,
                    title: row.title,
                    description: row.description,
                    fileName: row.file_name,
                    filePath: row.file_path,
                    fileSize: parseInt(row.file_size),
                    mimeType: row.mime_type,
                    status: row.status,
                    uploadedBy: row.uploaded_by,
                    approvedBy: row.approved_by,
                    approvedAt: row.approved_at,
                    expiresAt: row.expires_at,
                    metadata: row.metadata || {},
                    createdAt: row.created_at,
                    updatedAt: row.updated_at
                };
                return StaffDocument.fromJSON(documentData);
            });
        }
        finally {
            client.release();
        }
    }
}
