import { supabase } from '../supabase';
import { logger } from '../../utils/logger';
import { StaffDocument } from '../../models/document-management';
import { ValidationError } from '../../utils/validation';
export class StaffDocumentRepository {
    constructor(client) {
        this.client = client || supabase.getClient();
    }
    /**
     * Create a new staff document record
     */
    async create(document) {
        try {
            logger.info('Creating staff document', {
                employeeId: document.employeeId,
                category: document.category,
                title: document.title
            });
            const documentData = {
                employee_id: document.employeeId,
                category: document.category,
                title: document.title,
                description: document.description || null,
                file_name: document.fileName,
                file_path: document.filePath,
                file_size: document.fileSize,
                mime_type: document.mimeType,
                status: document.status || 'PENDING',
                uploaded_by: document.uploadedBy,
                approved_by: document.approvedBy || null,
                approved_at: document.approvedAt ? document.approvedAt.toISOString() : null,
                expires_at: document.expiresAt ? document.expiresAt.toISOString() : null,
                metadata: document.metadata || {}
            };
            const { data, error } = await this.client
                .from('staff_documents')
                .insert(documentData)
                .select('*')
                .single();
            if (error) {
                logger.error('Failed to create staff document', {
                    error: error.message,
                    code: error.code,
                    details: error.details
                });
                throw new ValidationError(`Failed to create document: ${error.message}`, []);
            }
            const staffDocument = this.mapToStaffDocument(data);
            // Create audit trail entry
            await this.createVersionHistory(staffDocument.id, 'CREATED', {}, null, staffDocument.status, document.uploadedBy, 'Document created');
            logger.info('Staff document created successfully', {
                documentId: staffDocument.id,
                employeeId: staffDocument.employeeId
            });
            return staffDocument;
        }
        catch (error) {
            logger.error('Error creating staff document', {
                error: error instanceof Error ? error.message : 'Unknown error',
                employeeId: document.employeeId,
                category: document.category
            });
            throw error;
        }
    }
    /**
     * Find document by ID
     */
    async findById(id) {
        try {
            const { data, error } = await this.client
                .from('staff_documents')
                .select('*')
                .eq('id', id)
                .single();
            if (error) {
                if (error.code === 'PGRST116') {
                    return null; // Not found
                }
                logger.error('Failed to find staff document by ID', {
                    error: error.message,
                    documentId: id
                });
                throw new ValidationError(`Failed to find document: ${error.message}`, []);
            }
            return this.mapToStaffDocument(data);
        }
        catch (error) {
            if (error instanceof ValidationError) {
                throw error;
            }
            logger.error('Error finding staff document by ID', {
                error: error instanceof Error ? error.message : 'Unknown error',
                documentId: id
            });
            throw new ValidationError('Database error occurred', []);
        }
    }
    /**
     * Find documents by employee ID
     */
    async findByEmployeeId(employeeId, options = {}) {
        try {
            const { page = 1, limit = 20, sortBy = 'created_at', sortOrder = 'desc' } = options;
            const offset = (page - 1) * limit;
            // Get total count
            const { count, error: countError } = await this.client
                .from('staff_documents')
                .select('*', { count: 'exact', head: true })
                .eq('employee_id', employeeId);
            if (countError) {
                throw new ValidationError(`Failed to count documents: ${countError.message}`, []);
            }
            // Get documents
            const { data, error } = await this.client
                .from('staff_documents')
                .select('*')
                .eq('employee_id', employeeId)
                .order(sortBy, { ascending: sortOrder === 'asc' })
                .range(offset, offset + limit - 1);
            if (error) {
                logger.error('Failed to find staff documents by employee ID', {
                    error: error.message,
                    employeeId
                });
                throw new ValidationError(`Failed to find documents: ${error.message}`, []);
            }
            const documents = data.map(item => this.mapToStaffDocument(item));
            const total = count || 0;
            const totalPages = Math.ceil(total / limit);
            return {
                documents,
                total,
                page,
                totalPages
            };
        }
        catch (error) {
            if (error instanceof ValidationError) {
                throw error;
            }
            logger.error('Error finding staff documents by employee ID', {
                error: error instanceof Error ? error.message : 'Unknown error',
                employeeId
            });
            throw new ValidationError('Database error occurred', []);
        }
    }
    /**
     * Search documents with criteria
     */
    async search(criteria, options = {}) {
        try {
            const { page = 1, limit = 20, sortBy = 'created_at', sortOrder = 'desc' } = options;
            const offset = (page - 1) * limit;
            let query = this.client.from('staff_documents').select('*', { count: 'exact' });
            let countQuery = this.client.from('staff_documents').select('*', { count: 'exact', head: true });
            // Apply filters
            if (criteria.employeeId) {
                query = query.eq('employee_id', criteria.employeeId);
                countQuery = countQuery.eq('employee_id', criteria.employeeId);
            }
            if (criteria.category) {
                query = query.eq('category', criteria.category);
                countQuery = countQuery.eq('category', criteria.category);
            }
            if (criteria.status) {
                query = query.eq('status', criteria.status);
                countQuery = countQuery.eq('status', criteria.status);
            }
            if (criteria.uploadedBy) {
                query = query.eq('uploaded_by', criteria.uploadedBy);
                countQuery = countQuery.eq('uploaded_by', criteria.uploadedBy);
            }
            if (criteria.fromDate) {
                query = query.gte('created_at', criteria.fromDate.toISOString());
                countQuery = countQuery.gte('created_at', criteria.fromDate.toISOString());
            }
            if (criteria.toDate) {
                query = query.lte('created_at', criteria.toDate.toISOString());
                countQuery = countQuery.lte('created_at', criteria.toDate.toISOString());
            }
            if (criteria.expiringBefore) {
                query = query.lt('expires_at', criteria.expiringBefore.toISOString());
                countQuery = countQuery.lt('expires_at', criteria.expiringBefore.toISOString());
            }
            // Get total count
            const { count, error: countError } = await countQuery;
            if (countError) {
                throw new ValidationError(`Failed to count documents: ${countError.message}`, []);
            }
            // Get documents
            const { data, error } = await query
                .order(sortBy, { ascending: sortOrder === 'asc' })
                .range(offset, offset + limit - 1);
            if (error) {
                logger.error('Failed to search staff documents', {
                    error: error.message,
                    criteria
                });
                throw new ValidationError(`Failed to search documents: ${error.message}`, []);
            }
            const documents = data.map(item => this.mapToStaffDocument(item));
            const total = count || 0;
            const totalPages = Math.ceil(total / limit);
            return {
                documents,
                total,
                page,
                totalPages
            };
        }
        catch (error) {
            if (error instanceof ValidationError) {
                throw error;
            }
            logger.error('Error searching staff documents', {
                error: error instanceof Error ? error.message : 'Unknown error',
                criteria
            });
            throw new ValidationError('Database error occurred', []);
        }
    }
    /**
     * Update document
     */
    async update(id, updates, performedBy, reason) {
        try {
            logger.info('Updating staff document', {
                documentId: id,
                updates: Object.keys(updates),
                performedBy
            });
            // Get current document for audit trail
            const currentDoc = await this.findById(id);
            if (!currentDoc) {
                throw new ValidationError('Document not found', []);
            }
            const updateData = {};
            // Map updates to database column names
            if (updates.title !== undefined)
                updateData.title = updates.title;
            if (updates.description !== undefined)
                updateData.description = updates.description;
            if (updates.status !== undefined)
                updateData.status = updates.status;
            if (updates.approvedBy !== undefined)
                updateData.approved_by = updates.approvedBy;
            if (updates.approvedAt !== undefined) {
                updateData.approved_at = updates.approvedAt ? updates.approvedAt.toISOString() : null;
            }
            if (updates.expiresAt !== undefined) {
                updateData.expires_at = updates.expiresAt ? updates.expiresAt.toISOString() : null;
            }
            if (updates.metadata !== undefined)
                updateData.metadata = updates.metadata;
            const { data, error } = await this.client
                .from('staff_documents')
                .update(updateData)
                .eq('id', id)
                .select('*')
                .single();
            if (error) {
                logger.error('Failed to update staff document', {
                    error: error.message,
                    documentId: id
                });
                throw new ValidationError(`Failed to update document: ${error.message}`, []);
            }
            const updatedDocument = this.mapToStaffDocument(data);
            // Create audit trail entry
            await this.createVersionHistory(id, 'UPDATED', updates, currentDoc.status, updatedDocument.status, performedBy, reason || 'Document updated');
            logger.info('Staff document updated successfully', {
                documentId: id,
                performedBy
            });
            return updatedDocument;
        }
        catch (error) {
            if (error instanceof ValidationError) {
                throw error;
            }
            logger.error('Error updating staff document', {
                error: error instanceof Error ? error.message : 'Unknown error',
                documentId: id
            });
            throw new ValidationError('Database error occurred', []);
        }
    }
    /**
     * Delete document
     */
    async delete(id, performedBy, reason) {
        try {
            logger.info('Deleting staff document', {
                documentId: id,
                performedBy
            });
            // Get document for audit trail before deletion
            const document = await this.findById(id);
            if (!document) {
                return false; // Already deleted or doesn't exist
            }
            // Create audit trail entry before deletion
            await this.createVersionHistory(id, 'DELETED', {}, document.status, null, performedBy, reason || 'Document deleted');
            const { error } = await this.client
                .from('staff_documents')
                .delete()
                .eq('id', id);
            if (error) {
                logger.error('Failed to delete staff document', {
                    error: error.message,
                    documentId: id
                });
                throw new ValidationError(`Failed to delete document: ${error.message}`, []);
            }
            logger.info('Staff document deleted successfully', {
                documentId: id,
                performedBy
            });
            return true;
        }
        catch (error) {
            if (error instanceof ValidationError) {
                throw error;
            }
            logger.error('Error deleting staff document', {
                error: error instanceof Error ? error.message : 'Unknown error',
                documentId: id
            });
            throw new ValidationError('Database error occurred', []);
        }
    }
    /**
     * Get documents expiring soon
     */
    async getExpiringDocuments(days = 30) {
        try {
            const expiryDate = new Date();
            expiryDate.setDate(expiryDate.getDate() + days);
            const { data, error } = await this.client
                .from('staff_documents')
                .select('*')
                .not('expires_at', 'is', null)
                .lte('expires_at', expiryDate.toISOString())
                .eq('status', 'APPROVED')
                .order('expires_at', { ascending: true });
            if (error) {
                logger.error('Failed to get expiring documents', {
                    error: error.message,
                    days
                });
                throw new ValidationError(`Failed to get expiring documents: ${error.message}`, []);
            }
            return data.map(item => this.mapToStaffDocument(item));
        }
        catch (error) {
            logger.error('Error getting expiring documents', {
                error: error instanceof Error ? error.message : 'Unknown error',
                days
            });
            throw new ValidationError('Database error occurred', []);
        }
    }
    /**
     * Get document statistics for an employee
     */
    async getDocumentStats(employeeId) {
        try {
            const { data, error } = await this.client
                .from('staff_documents')
                .select('category, status, expires_at')
                .eq('employee_id', employeeId);
            if (error) {
                throw new ValidationError(`Failed to get document stats: ${error.message}`, []);
            }
            const now = new Date();
            const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
            const stats = {
                total: data.length,
                byCategory: {},
                byStatus: {},
                expiring: 0
            };
            data.forEach(doc => {
                // Count by category
                stats.byCategory[doc.category] = (stats.byCategory[doc.category] || 0) + 1;
                // Count by status
                stats.byStatus[doc.status] = (stats.byStatus[doc.status] || 0) + 1;
                // Count expiring documents
                if (doc.expires_at && new Date(doc.expires_at) <= thirtyDaysFromNow && doc.status === 'APPROVED') {
                    stats.expiring++;
                }
            });
            return stats;
        }
        catch (error) {
            logger.error('Error getting document statistics', {
                error: error instanceof Error ? error.message : 'Unknown error',
                employeeId
            });
            throw new ValidationError('Database error occurred', []);
        }
    }
    /**
     * Create version history entry
     */
    async createVersionHistory(documentId, action, changes, previousStatus, newStatus, performedBy, reason) {
        try {
            const { error } = await this.client
                .from('document_version_history')
                .insert({
                document_id: documentId,
                action,
                changes,
                previous_status: previousStatus,
                new_status: newStatus,
                performed_by: performedBy,
                reason
            });
            if (error) {
                logger.error('Failed to create document version history', {
                    error: error.message,
                    documentId,
                    action
                });
                // Don't throw here - version history is important but shouldn't break main operations
            }
        }
        catch (error) {
            logger.error('Error creating document version history', {
                error: error instanceof Error ? error.message : 'Unknown error',
                documentId,
                action
            });
        }
    }
    /**
     * Map database row to StaffDocument model
     */
    mapToStaffDocument(data) {
        return new StaffDocument({
            id: data.id,
            employeeId: data.employee_id,
            category: data.category,
            title: data.title,
            description: data.description,
            fileName: data.file_name,
            filePath: data.file_path,
            fileSize: data.file_size,
            mimeType: data.mime_type,
            status: data.status,
            uploadedBy: data.uploaded_by,
            approvedBy: data.approved_by,
            approvedAt: data.approved_at ? new Date(data.approved_at) : undefined,
            expiresAt: data.expires_at ? new Date(data.expires_at) : undefined,
            metadata: data.metadata || {},
            createdAt: new Date(data.created_at),
            updatedAt: new Date(data.updated_at)
        });
    }
}
