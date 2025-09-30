import multer from 'multer';
import { logger } from '../utils/logger';
import { ValidationError } from '../utils/validation';
import { AppError, FileUploadError } from '../utils/errors';
import { StaffDocumentRepository } from '../database/repositories/StaffDocumentRepository';
import { FileStorageService } from '../services/document-management/FileStorageService';
import { DocumentService } from '../services/document-management/DocumentService';
// Configure multer for file uploads
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 15 * 1024 * 1024, // 15MB max file size
        files: 1 // Single file upload
    },
    fileFilter: (req, file, cb) => {
        // Basic file type validation - more detailed validation happens in FileStorageService
        const allowedMimeTypes = [
            'application/pdf',
            'image/jpeg',
            'image/png',
            'image/gif',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        ];
        if (allowedMimeTypes.includes(file.mimetype)) {
            cb(null, true);
        }
        else {
            cb(new ValidationError(`File type ${file.mimetype} not allowed`, []));
        }
    }
});
export class StaffDocumentController {
    constructor() {
        /**
         * Upload a new document
         * POST /api/documents/upload
         */
        this.uploadDocument = async (req, res) => {
            try {
                logger.info('Document upload request received', {
                    userId: req.user?.id,
                    employeeId: req.body.employeeId,
                    category: req.body.category
                });
                if (!req.file) {
                    throw new FileUploadError('No file uploaded', { field: 'file' }, 400);
                }
                const { employeeId, category, title, description, expiresAt } = req.body;
                // Required fields are enforced by validation middleware; keep a safety check
                if (!employeeId || !category || !title) {
                    throw new ValidationError('Missing required fields');
                }
                // Permission check - users can only upload documents for themselves unless they're HR/admin
                const currentUser = req.user;
                if (employeeId !== currentUser.employeeId && !currentUser.roles.includes('hr_admin')) {
                    throw new AppError('Unauthorized to upload documents for other employees', 'AUTHORIZATION_ERROR', 403);
                }
                const uploadRequest = {
                    file: req.file.buffer,
                    fileName: req.file.originalname,
                    mimeType: req.file.mimetype,
                    employeeId,
                    category: category,
                    title,
                    description,
                    expiresAt: expiresAt ? new Date(expiresAt) : undefined,
                    uploadedBy: currentUser.id,
                    metadata: {
                        originalSize: req.file.size,
                        uploadedAt: new Date().toISOString(),
                        userAgent: req.get('User-Agent') || 'Unknown'
                    }
                };
                const document = await this.documentService.uploadDocument(uploadRequest);
                logger.info('Document uploaded successfully', {
                    documentId: document.id,
                    employeeId: document.employeeId,
                    category: document.category,
                    fileName: document.fileName
                });
                res.status(201).json({
                    success: true,
                    message: 'Document uploaded successfully',
                    data: {
                        id: document.id,
                        title: document.title,
                        category: document.category,
                        status: document.status,
                        fileName: document.fileName,
                        fileSize: document.fileSize,
                        uploadedAt: document.createdAt
                    }
                });
            }
            catch (error) {
                logger.error('Error uploading document', {
                    error: error instanceof Error ? error.message : 'Unknown error',
                    userId: req.user?.id,
                    body: req.body
                });
                // Delegate to global error handler
                throw error;
            }
        };
        /**
         * Get document by ID
         * GET /api/documents/:id
         */
        this.getDocument = async (req, res) => {
            try {
                const { id } = req.params;
                const document = await this.documentRepository.findById(id);
                if (!document) {
                    res.status(404).json({
                        success: false,
                        message: 'Document not found'
                    });
                    return;
                }
                // Permission check
                const currentUser = req.user;
                const canAccess = await this.documentService.canUserAccessDocument(document.id, currentUser.id);
                if (!canAccess) {
                    res.status(403).json({
                        success: false,
                        message: 'Unauthorized to access this document'
                    });
                    return;
                }
                res.json({
                    success: true,
                    data: {
                        id: document.id,
                        employeeId: document.employeeId,
                        category: document.category,
                        title: document.title,
                        description: document.description,
                        fileName: document.fileName,
                        fileSize: document.fileSize,
                        mimeType: document.mimeType,
                        status: document.status,
                        uploadedBy: document.uploadedBy,
                        approvedBy: document.approvedBy,
                        approvedAt: document.approvedAt,
                        expiresAt: document.expiresAt,
                        metadata: document.metadata,
                        createdAt: document.createdAt,
                        updatedAt: document.updatedAt
                    }
                });
            }
            catch (error) {
                logger.error('Error retrieving document', {
                    error: error instanceof Error ? error.message : 'Unknown error',
                    documentId: req.params.id,
                    userId: req.user?.id
                });
                res.status(500).json({
                    success: false,
                    message: 'Internal server error'
                });
            }
        };
        /**
         * Download document
         * GET /api/documents/:id/download
         */
        this.downloadDocument = async (req, res) => {
            try {
                const { id } = req.params;
                const document = await this.documentRepository.findById(id);
                if (!document) {
                    res.status(404).json({
                        success: false,
                        message: 'Document not found'
                    });
                    return;
                }
                // Permission check
                const currentUser = req.user;
                const canAccess = await this.documentService.canUserAccessDocument(document.id, currentUser.id);
                if (!canAccess) {
                    res.status(403).json({
                        success: false,
                        message: 'Unauthorized to download this document'
                    });
                    return;
                }
                const downloadUrl = await FileStorageService.getDownloadUrl(document.filePath, document.category);
                logger.info('Document download URL generated', {
                    documentId: document.id,
                    userId: currentUser.id,
                    fileName: document.fileName
                });
                res.json({
                    success: true,
                    data: {
                        downloadUrl,
                        fileName: document.fileName,
                        mimeType: document.mimeType,
                        fileSize: document.fileSize,
                        expiresIn: 3600 // URL expires in 1 hour
                    }
                });
            }
            catch (error) {
                logger.error('Error generating download URL', {
                    error: error instanceof Error ? error.message : 'Unknown error',
                    documentId: req.params.id,
                    userId: req.user?.id
                });
                res.status(500).json({
                    success: false,
                    message: 'Internal server error'
                });
            }
        };
        /**
         * List documents with filtering and pagination
         * GET /api/documents
         */
        this.listDocuments = async (req, res) => {
            try {
                const currentUser = req.user;
                const { employeeId, category, status, fromDate, toDate, page = 1, limit = 20, sortBy = 'created_at', sortOrder = 'desc' } = req.query;
                // Build search criteria
                const criteria = {};
                if (employeeId) {
                    // Permission check - users can only view their own documents unless they're HR/manager
                    if (employeeId !== currentUser.employeeId &&
                        !currentUser.roles.includes('hr_admin') &&
                        !currentUser.roles.includes('manager')) {
                        res.status(403).json({
                            success: false,
                            message: 'Unauthorized to view documents for other employees'
                        });
                        return;
                    }
                    criteria.employeeId = employeeId;
                }
                else if (!currentUser.roles.includes('hr_admin')) {
                    // Non-HR users can only see their own documents
                    criteria.employeeId = currentUser.employeeId;
                }
                if (category)
                    criteria.category = category;
                if (status)
                    criteria.status = status;
                if (fromDate)
                    criteria.fromDate = new Date(fromDate);
                if (toDate)
                    criteria.toDate = new Date(toDate);
                const options = {
                    page: parseInt(page),
                    limit: Math.min(parseInt(limit), 100), // Cap limit at 100
                    sortBy: sortBy,
                    sortOrder: sortOrder
                };
                const result = await this.documentRepository.search(criteria, options);
                res.json({
                    success: true,
                    data: {
                        documents: result.documents.map(doc => ({
                            id: doc.id,
                            employeeId: doc.employeeId,
                            category: doc.category,
                            title: doc.title,
                            description: doc.description,
                            fileName: doc.fileName,
                            fileSize: doc.fileSize,
                            mimeType: doc.mimeType,
                            status: doc.status,
                            uploadedBy: doc.uploadedBy,
                            approvedBy: doc.approvedBy,
                            approvedAt: doc.approvedAt,
                            expiresAt: doc.expiresAt,
                            createdAt: doc.createdAt,
                            updatedAt: doc.updatedAt
                        })),
                        pagination: {
                            page: result.page,
                            limit: options.limit,
                            total: result.total,
                            totalPages: result.totalPages
                        }
                    }
                });
            }
            catch (error) {
                logger.error('Error listing documents', {
                    error: error instanceof Error ? error.message : 'Unknown error',
                    query: req.query,
                    userId: req.user?.id
                });
                res.status(500).json({
                    success: false,
                    message: 'Internal server error'
                });
            }
        };
        /**
         * Update document metadata
         * PUT /api/documents/:id
         */
        this.updateDocument = async (req, res) => {
            try {
                const { id } = req.params;
                const { title, description, expiresAt } = req.body;
                const document = await this.documentRepository.findById(id);
                if (!document) {
                    res.status(404).json({
                        success: false,
                        message: 'Document not found'
                    });
                    return;
                }
                // Permission check - users can only update their own pending documents
                const currentUser = req.user;
                if (document.employeeId !== currentUser.employeeId && !currentUser.roles.includes('hr_admin')) {
                    res.status(403).json({
                        success: false,
                        message: 'Unauthorized to update this document'
                    });
                    return;
                }
                // Only pending documents can be updated by employees
                if (document.status !== 'PENDING' && !currentUser.roles.includes('hr_admin')) {
                    res.status(400).json({
                        success: false,
                        message: 'Only pending documents can be updated'
                    });
                    return;
                }
                const updates = {};
                if (title !== undefined)
                    updates.title = title;
                if (description !== undefined)
                    updates.description = description;
                if (expiresAt !== undefined)
                    updates.expiresAt = expiresAt ? new Date(expiresAt) : null;
                const updatedDocument = await this.documentRepository.update(id, updates, currentUser.id, 'Document metadata updated');
                logger.info('Document updated successfully', {
                    documentId: id,
                    userId: currentUser.id,
                    updates: Object.keys(updates)
                });
                res.json({
                    success: true,
                    message: 'Document updated successfully',
                    data: {
                        id: updatedDocument.id,
                        title: updatedDocument.title,
                        description: updatedDocument.description,
                        expiresAt: updatedDocument.expiresAt,
                        updatedAt: updatedDocument.updatedAt
                    }
                });
            }
            catch (error) {
                logger.error('Error updating document', {
                    error: error instanceof Error ? error.message : 'Unknown error',
                    documentId: req.params.id,
                    userId: req.user?.id
                });
                if (error instanceof ValidationError) {
                    res.status(400).json({
                        success: false,
                        message: error.message,
                        errors: error.details
                    });
                    return;
                }
                res.status(500).json({
                    success: false,
                    message: 'Internal server error'
                });
            }
        };
        /**
         * Approve or reject document
         * POST /api/documents/:id/approve
         * POST /api/documents/:id/reject
         */
        this.approveDocument = async (req, res) => {
            try {
                const { id } = req.params;
                const { reason } = req.body;
                const currentUser = req.user;
                // Only HR admins can approve/reject documents
                if (!currentUser.roles.includes('hr_admin')) {
                    res.status(403).json({
                        success: false,
                        message: 'Unauthorized to approve documents'
                    });
                    return;
                }
                const action = req.path.includes('approve') ? 'approve' : 'reject';
                const document = await this.documentService.processDocumentApproval(id, action, currentUser.id, reason);
                logger.info(`Document ${action}d successfully`, {
                    documentId: id,
                    userId: currentUser.id,
                    action,
                    reason
                });
                res.json({
                    success: true,
                    message: `Document ${action}d successfully`,
                    data: {
                        id: document.id,
                        status: document.status,
                        approvedBy: document.approvedBy,
                        approvedAt: document.approvedAt,
                        updatedAt: document.updatedAt
                    }
                });
            }
            catch (error) {
                logger.error('Error processing document approval', {
                    error: error instanceof Error ? error.message : 'Unknown error',
                    documentId: req.params.id,
                    userId: req.user?.id,
                    action: req.path.includes('approve') ? 'approve' : 'reject'
                });
                if (error instanceof ValidationError) {
                    res.status(400).json({
                        success: false,
                        message: error.message,
                        errors: error.details
                    });
                    return;
                }
                res.status(500).json({
                    success: false,
                    message: 'Internal server error'
                });
            }
        };
        /**
         * Delete document
         * DELETE /api/documents/:id
         */
        this.deleteDocument = async (req, res) => {
            try {
                const { id } = req.params;
                const { reason } = req.body;
                const document = await this.documentRepository.findById(id);
                if (!document) {
                    res.status(404).json({
                        success: false,
                        message: 'Document not found'
                    });
                    return;
                }
                const currentUser = req.user;
                // Permission check
                const canDelete = currentUser.roles.includes('hr_admin') ||
                    (document.employeeId === currentUser.employeeId && document.status === 'PENDING');
                if (!canDelete) {
                    res.status(403).json({
                        success: false,
                        message: 'Unauthorized to delete this document'
                    });
                    return;
                }
                await this.documentService.deleteDocument(id, currentUser.id, reason);
                logger.info('Document deleted successfully', {
                    documentId: id,
                    userId: currentUser.id,
                    reason
                });
                res.json({
                    success: true,
                    message: 'Document deleted successfully'
                });
            }
            catch (error) {
                logger.error('Error deleting document', {
                    error: error instanceof Error ? error.message : 'Unknown error',
                    documentId: req.params.id,
                    userId: req.user?.id
                });
                if (error instanceof ValidationError) {
                    res.status(400).json({
                        success: false,
                        message: error.message,
                        errors: error.details
                    });
                    return;
                }
                res.status(500).json({
                    success: false,
                    message: 'Internal server error'
                });
            }
        };
        /**
         * Get document statistics for employee
         * GET /api/documents/stats/:employeeId
         */
        this.getDocumentStats = async (req, res) => {
            try {
                const { employeeId } = req.params;
                const currentUser = req.user;
                // Permission check
                if (employeeId !== currentUser.employeeId && !currentUser.roles.includes('hr_admin')) {
                    res.status(403).json({
                        success: false,
                        message: 'Unauthorized to view statistics for other employees'
                    });
                    return;
                }
                const stats = await this.documentRepository.getDocumentStats(employeeId);
                res.json({
                    success: true,
                    data: stats
                });
            }
            catch (error) {
                logger.error('Error getting document statistics', {
                    error: error instanceof Error ? error.message : 'Unknown error',
                    employeeId: req.params.employeeId,
                    userId: req.user?.id
                });
                res.status(500).json({
                    success: false,
                    message: 'Internal server error'
                });
            }
        };
        /**
         * Get expiring documents
         * GET /api/documents/expiring
         */
        this.getExpiringDocuments = async (req, res) => {
            try {
                const { days = 30 } = req.query;
                // Only HR admins can view all expiring documents
                if (!req.user?.roles.includes('hr_admin')) {
                    res.status(403).json({
                        success: false,
                        message: 'Unauthorized to view expiring documents'
                    });
                    return;
                }
                const expiringDocs = await this.documentRepository.getExpiringDocuments(parseInt(days));
                res.json({
                    success: true,
                    data: expiringDocs.map(doc => ({
                        id: doc.id,
                        employeeId: doc.employeeId,
                        category: doc.category,
                        title: doc.title,
                        fileName: doc.fileName,
                        status: doc.status,
                        expiresAt: doc.expiresAt,
                        createdAt: doc.createdAt
                    }))
                });
            }
            catch (error) {
                logger.error('Error getting expiring documents', {
                    error: error instanceof Error ? error.message : 'Unknown error',
                    userId: req.user?.id
                });
                res.status(500).json({
                    success: false,
                    message: 'Internal server error'
                });
            }
        };
        this.documentRepository = new StaffDocumentRepository();
        this.documentService = new DocumentService();
    }
    /**
     * Get multer upload middleware
     */
    getUploadMiddleware() {
        return upload.single('file');
    }
}
